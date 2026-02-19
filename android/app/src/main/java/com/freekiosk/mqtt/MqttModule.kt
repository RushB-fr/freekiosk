package com.freekiosk.mqtt

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.media.AudioManager
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.os.Environment
import android.os.PowerManager
import android.os.StatFs
import android.provider.Settings
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONObject
import java.net.Inet4Address
import java.net.NetworkInterface

/**
 * React Native bridge module for MQTT integration.
 *
 * Mirrors the architecture of HttpServerModule:
 * - Maintains JS status variables (currentUrl, brightness, screensaver, rotation, etc.)
 * - Gathers native device status (battery, screen, audio, wifi, sensors, storage, memory)
 * - Emits `onApiCommand` events to JS for command handling (same event as HttpServerModule)
 * - Emits `onMqttConnectionChanged` events for connection state changes
 */
class MqttModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), SensorEventListener {

    companion object {
        private const val TAG = "MqttModule"
        private const val NAME = "MqttModule"
    }

    // ==================== MQTT client ====================

    private var mqttClient: KioskMqttClient? = null

    // ==================== JS status variables (same as HttpServerModule) ====================

    private var jsCurrentUrl: String = ""
    private var jsCanGoBack: Boolean = false
    private var jsLoading: Boolean = false
    private var jsBrightness: Int = 50
    private var jsScreensaverActive: Boolean = false
    private var jsKioskMode: Boolean = false
    private var jsRotationEnabled: Boolean = false
    private var jsRotationUrls: List<String> = emptyList()
    private var jsRotationInterval: Int = 30
    private var jsRotationCurrentIndex: Int = 0

    // Auto-brightness status
    private var jsAutoBrightnessEnabled: Boolean = false
    private var jsAutoBrightnessMin: Int = 10
    private var jsAutoBrightnessMax: Int = 100

    // Screen state from JS (tracks screenOn/screenOff commands)
    private var jsScreenOn: Boolean? = null

    // Motion detection
    private var jsMotionDetected: Boolean = false

    // ==================== Sensor data ====================

    private var sensorManager: SensorManager? = null
    private var lightSensor: Sensor? = null
    private var proximitySensor: Sensor? = null
    private var accelerometerSensor: Sensor? = null
    private var lightValue: Float = -1f
    private var proximityValue: Float = -1f
    private var accelerometerX: Float = 0f
    private var accelerometerY: Float = 0f
    private var accelerometerZ: Float = 0f

    // ==================== Initialisation ====================

    init {
        initSensors()
    }

    private fun initSensors() {
        try {
            sensorManager = reactContext.getSystemService(Context.SENSOR_SERVICE) as SensorManager
            lightSensor = sensorManager?.getDefaultSensor(Sensor.TYPE_LIGHT)
            proximitySensor = sensorManager?.getDefaultSensor(Sensor.TYPE_PROXIMITY)
            accelerometerSensor = sensorManager?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)

            lightSensor?.let { sensorManager?.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL) }
            proximitySensor?.let { sensorManager?.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL) }
            accelerometerSensor?.let { sensorManager?.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL) }

            Log.d(TAG, "Sensors initialized: light=${lightSensor != null}, proximity=${proximitySensor != null}, accelerometer=${accelerometerSensor != null}")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize sensors", e)
        }
    }

    // ==================== SensorEventListener ====================

    override fun onSensorChanged(event: SensorEvent) {
        when (event.sensor.type) {
            Sensor.TYPE_LIGHT -> lightValue = event.values[0]
            Sensor.TYPE_PROXIMITY -> proximityValue = event.values[0]
            Sensor.TYPE_ACCELEROMETER -> {
                accelerometerX = event.values[0]
                accelerometerY = event.values[1]
                accelerometerZ = event.values[2]
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
        // Not needed
    }

    // ==================== Module name ====================

    override fun getName(): String = NAME

    // ==================== React Methods ====================

    /**
     * Start the MQTT client with the given configuration.
     *
     * Expected keys in configMap:
     *   brokerUrl (String), port (Int), username (String?), password (String?),
     *   clientId (String?), baseTopic (String?), discoveryPrefix (String?),
     *   statusInterval (Int?), allowControl (Boolean?)
     */
    @ReactMethod
    fun startMqtt(configMap: ReadableMap, promise: Promise) {
        try {
            if (mqttClient != null) {
                promise.reject("ALREADY_RUNNING", "MQTT client is already running")
                return
            }

            val brokerUrl = configMap.getString("brokerUrl")
            if (brokerUrl.isNullOrEmpty()) {
                promise.reject("INVALID_CONFIG", "brokerUrl is required")
                return
            }

            val config = MqttConfig(
                brokerUrl = brokerUrl,
                port = if (configMap.hasKey("port")) configMap.getInt("port") else 1883,
                username = if (configMap.hasKey("username")) configMap.getString("username") else null,
                password = if (configMap.hasKey("password")) configMap.getString("password") else null,
                clientId = if (configMap.hasKey("clientId")) configMap.getString("clientId") else null,
                baseTopic = if (configMap.hasKey("baseTopic")) configMap.getString("baseTopic") ?: "freekiosk" else "freekiosk",
                discoveryPrefix = if (configMap.hasKey("discoveryPrefix")) configMap.getString("discoveryPrefix") ?: "homeassistant" else "homeassistant",
                statusInterval = if (configMap.hasKey("statusInterval")) configMap.getInt("statusInterval").toLong() else 30000L,
                allowControl = if (configMap.hasKey("allowControl")) configMap.getBoolean("allowControl") else true
            )

            val client = KioskMqttClient(reactContext.applicationContext, config)

            // Wire up callbacks
            client.statusProvider = { getDeviceStatus() }

            client.commandHandler = { command, params ->
                emitCommand(command, params)
            }

            client.onConnectionChanged = { connected ->
                emitConnectionChanged(connected)
            }

            // Set up Home Assistant discovery
            val deviceId = client.deviceId
            val appVersion = com.freekiosk.BuildConfig.VERSION_NAME
            val discovery = MqttDiscovery(
                deviceId = deviceId,
                baseTopic = config.baseTopic,
                discoveryPrefix = config.discoveryPrefix,
                appVersion = appVersion
            )
            client.discovery = discovery

            mqttClient = client
            client.connect()

            Log.i(TAG, "MQTT client started for broker ${config.brokerUrl}:${config.port}")

            val result = Arguments.createMap().apply {
                putBoolean("success", true)
                putString("brokerUrl", config.brokerUrl)
                putInt("port", config.port)
                putString("deviceId", deviceId)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start MQTT client", e)
            promise.reject("START_ERROR", e.message)
        }
    }

    /**
     * Stop the MQTT client and clean up resources.
     */
    @ReactMethod
    fun stopMqtt(promise: Promise) {
        try {
            mqttClient?.disconnect()
            mqttClient = null
            Log.i(TAG, "MQTT client stopped")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to stop MQTT client", e)
            promise.reject("STOP_ERROR", e.message)
        }
    }

    /**
     * Check whether the MQTT client is currently connected.
     */
    @ReactMethod
    fun isMqttConnected(promise: Promise) {
        promise.resolve(mqttClient?.isConnected() == true)
    }

    /**
     * Update JS-side status variables (same fields as HttpServerModule.updateStatus).
     * Also triggers an immediate MQTT status publish so that Home Assistant gets fresh data.
     */
    @ReactMethod
    fun updateStatus(statusJson: String) {
        try {
            val status = JSONObject(statusJson)
            if (status.has("currentUrl")) jsCurrentUrl = status.getString("currentUrl")
            if (status.has("canGoBack")) jsCanGoBack = status.getBoolean("canGoBack")
            if (status.has("loading")) jsLoading = status.getBoolean("loading")
            if (status.has("brightness")) jsBrightness = status.getInt("brightness")
            if (status.has("screensaverActive")) jsScreensaverActive = status.getBoolean("screensaverActive")
            if (status.has("kioskMode")) jsKioskMode = status.getBoolean("kioskMode")
            if (status.has("rotationEnabled")) jsRotationEnabled = status.getBoolean("rotationEnabled")
            if (status.has("rotationInterval")) jsRotationInterval = status.getInt("rotationInterval")
            if (status.has("rotationCurrentIndex")) jsRotationCurrentIndex = status.getInt("rotationCurrentIndex")
            if (status.has("rotationUrls")) {
                val urlsArray = status.getJSONArray("rotationUrls")
                jsRotationUrls = (0 until urlsArray.length()).map { urlsArray.getString(it) }
            }
            // Auto-brightness status
            if (status.has("autoBrightnessEnabled")) jsAutoBrightnessEnabled = status.getBoolean("autoBrightnessEnabled")
            if (status.has("autoBrightnessMin")) jsAutoBrightnessMin = status.getInt("autoBrightnessMin")
            if (status.has("autoBrightnessMax")) jsAutoBrightnessMax = status.getInt("autoBrightnessMax")

            // Screen state from JS (screenOn/screenOff commands)
            if (status.has("screenOn")) jsScreenOn = status.getBoolean("screenOn")

            // Motion detection
            if (status.has("motionDetected")) jsMotionDetected = status.getBoolean("motionDetected")

            Log.d(TAG, "Status updated: url=$jsCurrentUrl, screensaver=$jsScreensaverActive, rotation=$jsRotationEnabled, motion=$jsMotionDetected")

            // Trigger immediate MQTT status publish
            mqttClient?.let { client ->
                if (client.isConnected()) {
                    try {
                        client.publishStatus(getDeviceStatus())
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to publish immediate status: ${e.message}")
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse status update from JS", e)
        }
    }

    /**
     * Required for React Native NativeEventEmitter registration.
     */
    @ReactMethod
    fun addListener(eventName: String) {
        // Required for RN event emitter
    }

    /**
     * Required for React Native NativeEventEmitter registration.
     */
    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for RN event emitter
    }

    // ==================== Status Provider ====================

    /**
     * Build the full device status JSON, identical in structure to HttpServerModule.getDeviceStatus().
     */
    private fun getDeviceStatus(): JSONObject {
        val status = JSONObject()

        // Battery
        status.put("battery", getBatteryInfo())

        // Screen
        val screenStatus = JSONObject().apply {
            val powerManager = reactContext.getSystemService(Context.POWER_SERVICE) as PowerManager
            // Use JS-reported screen state if available (tracks screenOn/screenOff commands),
            // otherwise fall back to native PowerManager.isInteractive
            val screenOn = jsScreenOn ?: powerManager.isInteractive
            put("on", screenOn)
            put("brightness", jsBrightness)
            put("screensaverActive", jsScreensaverActive)
        }
        status.put("screen", screenStatus)

        // Audio
        val audioStatus = JSONObject().apply {
            try {
                val audioManager = reactContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
                val currentVolume = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC)
                val maxVolume = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
                val volumePercent = (currentVolume * 100) / maxVolume
                put("volume", volumePercent)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to get volume for status: ${e.message}")
                put("volume", 50)
            }
        }
        status.put("audio", audioStatus)

        // WebView
        val webviewStatus = JSONObject().apply {
            put("currentUrl", jsCurrentUrl)
            put("canGoBack", jsCanGoBack)
            put("loading", jsLoading)
            put("motionDetected", jsMotionDetected)
        }
        status.put("webview", webviewStatus)

        // Device
        val deviceStatus = JSONObject().apply {
            put("ip", getLocalIpAddress())
            put("hostname", "freekiosk")
            put("version", com.freekiosk.BuildConfig.VERSION_NAME)
            val dpm = reactContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
            put("isDeviceOwner", dpm.isDeviceOwnerApp(reactContext.packageName))
            put("kioskMode", jsKioskMode)
        }
        status.put("device", deviceStatus)

        // WiFi
        status.put("wifi", getWifiInfo())

        // Rotation
        val rotationStatus = JSONObject().apply {
            put("enabled", jsRotationEnabled)
            put("urls", org.json.JSONArray(jsRotationUrls))
            put("interval", jsRotationInterval)
            put("currentIndex", jsRotationCurrentIndex)
        }
        status.put("rotation", rotationStatus)

        // Sensors
        val sensorsStatus = JSONObject().apply {
            put("light", lightValue)
            put("proximity", proximityValue)
            put("accelerometer", JSONObject().apply {
                put("x", accelerometerX)
                put("y", accelerometerY)
                put("z", accelerometerZ)
            })
        }
        status.put("sensors", sensorsStatus)

        // Auto-brightness
        val autoBrightnessStatus = JSONObject().apply {
            put("enabled", jsAutoBrightnessEnabled)
            put("min", jsAutoBrightnessMin)
            put("max", jsAutoBrightnessMax)
            put("currentLightLevel", lightValue)
        }
        status.put("autoBrightness", autoBrightnessStatus)

        // Storage
        status.put("storage", getStorageInfo())

        // Memory
        status.put("memory", getMemoryInfo())

        return status
    }

    // ==================== Native info helpers ====================

    private fun getBatteryInfo(): JSONObject {
        val intentFilter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        val batteryIntent = reactContext.registerReceiver(null, intentFilter)

        val level = batteryIntent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: 0
        val scale = batteryIntent?.getIntExtra(BatteryManager.EXTRA_SCALE, 100) ?: 100
        val percentage = (level * 100) / scale

        val batteryStatus = batteryIntent?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        val isCharging = batteryStatus == BatteryManager.BATTERY_STATUS_CHARGING ||
                batteryStatus == BatteryManager.BATTERY_STATUS_FULL

        val plugged = batteryIntent?.getIntExtra(BatteryManager.EXTRA_PLUGGED, -1) ?: -1
        val pluggedType = when (plugged) {
            BatteryManager.BATTERY_PLUGGED_USB -> "usb"
            BatteryManager.BATTERY_PLUGGED_AC -> "ac"
            BatteryManager.BATTERY_PLUGGED_WIRELESS -> "wireless"
            else -> "none"
        }

        val temperature = (batteryIntent?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0) ?: 0) / 10.0
        val voltage = (batteryIntent?.getIntExtra(BatteryManager.EXTRA_VOLTAGE, 0) ?: 0) / 1000.0
        val technology = batteryIntent?.getStringExtra(BatteryManager.EXTRA_TECHNOLOGY) ?: "unknown"
        val health = batteryIntent?.getIntExtra(BatteryManager.EXTRA_HEALTH, -1) ?: -1
        val healthStr = when (health) {
            BatteryManager.BATTERY_HEALTH_GOOD -> "good"
            BatteryManager.BATTERY_HEALTH_OVERHEAT -> "overheat"
            BatteryManager.BATTERY_HEALTH_DEAD -> "dead"
            BatteryManager.BATTERY_HEALTH_OVER_VOLTAGE -> "over_voltage"
            BatteryManager.BATTERY_HEALTH_UNSPECIFIED_FAILURE -> "failure"
            BatteryManager.BATTERY_HEALTH_COLD -> "cold"
            else -> "unknown"
        }

        return JSONObject().apply {
            put("level", percentage)
            put("charging", isCharging)
            put("plugged", pluggedType)
            put("temperature", temperature)
            put("voltage", voltage)
            put("health", healthStr)
            put("technology", technology)
        }
    }

    private fun getWifiInfo(): JSONObject {
        return try {
            val wifiManager = reactContext.applicationContext
                .getSystemService(Context.WIFI_SERVICE) as WifiManager
            val wifiInfo = wifiManager.connectionInfo

            val ipAddress = getLocalIpAddress()
            val isConnected = ipAddress != "0.0.0.0" && wifiInfo.rssi != 0

            var ssid = wifiInfo.ssid?.replace("\"", "") ?: ""
            if (ssid == "<unknown ssid>") {
                ssid = "WiFi"
            }

            val signalLevel = WifiManager.calculateSignalLevel(wifiInfo.rssi, 100)

            JSONObject().apply {
                put("ssid", ssid)
                put("signalStrength", wifiInfo.rssi)
                put("signalLevel", signalLevel)
                put("connected", isConnected)
                put("linkSpeed", wifiInfo.linkSpeed)
                put("frequency", wifiInfo.frequency)
            }
        } catch (e: Exception) {
            JSONObject().apply {
                put("ssid", "")
                put("signalStrength", 0)
                put("signalLevel", 0)
                put("connected", false)
                put("linkSpeed", 0)
                put("frequency", 0)
            }
        }
    }

    private fun getLocalIpAddress(): String {
        try {
            val interfaces = NetworkInterface.getNetworkInterfaces()
            while (interfaces.hasMoreElements()) {
                val networkInterface = interfaces.nextElement()
                val addresses = networkInterface.inetAddresses
                while (addresses.hasMoreElements()) {
                    val address = addresses.nextElement()
                    if (!address.isLoopbackAddress && address is Inet4Address) {
                        return address.hostAddress ?: "0.0.0.0"
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get IP address", e)
        }
        return "0.0.0.0"
    }

    private fun getStorageInfo(): JSONObject {
        return try {
            val stat = StatFs(Environment.getDataDirectory().path)
            val blockSize = stat.blockSizeLong
            val totalBlocks = stat.blockCountLong
            val availableBlocks = stat.availableBlocksLong

            val totalBytes = totalBlocks * blockSize
            val availableBytes = availableBlocks * blockSize
            val usedBytes = totalBytes - availableBytes

            JSONObject().apply {
                put("totalMB", totalBytes / (1024 * 1024))
                put("availableMB", availableBytes / (1024 * 1024))
                put("usedMB", usedBytes / (1024 * 1024))
                put("usedPercent", ((usedBytes.toDouble() / totalBytes) * 100).toInt())
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get storage info", e)
            JSONObject().apply {
                put("totalMB", 0)
                put("availableMB", 0)
                put("usedMB", 0)
                put("usedPercent", 0)
            }
        }
    }

    private fun getMemoryInfo(): JSONObject {
        return try {
            val activityManager = reactContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val memInfo = ActivityManager.MemoryInfo()
            activityManager.getMemoryInfo(memInfo)

            val totalMB = memInfo.totalMem / (1024 * 1024)
            val availableMB = memInfo.availMem / (1024 * 1024)
            val usedMB = totalMB - availableMB

            JSONObject().apply {
                put("totalMB", totalMB)
                put("availableMB", availableMB)
                put("usedMB", usedMB)
                put("usedPercent", ((usedMB.toDouble() / totalMB) * 100).toInt())
                put("lowMemory", memInfo.lowMemory)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get memory info", e)
            JSONObject().apply {
                put("totalMB", 0)
                put("availableMB", 0)
                put("usedMB", 0)
                put("usedPercent", 0)
                put("lowMemory", false)
            }
        }
    }

    // ==================== Event emitters ====================

    /**
     * Emit an `onApiCommand` event to JS (same event name as HttpServerModule).
     * ApiService.handleCommand() on the JS side routes these uniformly.
     */
    private fun emitCommand(command: String, params: JSONObject?) {
        sendEvent("onApiCommand", Arguments.createMap().apply {
            putString("command", command)
            putString("params", params?.toString() ?: "{}")
        })
    }

    /**
     * Emit an `onMqttConnectionChanged` event to JS.
     */
    private fun emitConnectionChanged(connected: Boolean) {
        sendEvent("onMqttConnectionChanged", Arguments.createMap().apply {
            putBoolean("connected", connected)
        })
    }

    private fun sendEvent(eventName: String, params: WritableMap) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    // ==================== Lifecycle ====================

    /**
     * Clean up resources when the Catalyst (React Native) instance is destroyed.
     */
    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        try {
            mqttClient?.disconnect()
            mqttClient = null
            sensorManager?.unregisterListener(this)
            Log.d(TAG, "MqttModule cleaned up")
        } catch (e: Exception) {
            Log.e(TAG, "Error during cleanup: ${e.message}")
        }
    }
}
