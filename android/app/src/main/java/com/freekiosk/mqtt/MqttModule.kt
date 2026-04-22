package com.freekiosk.mqtt

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.media.MediaPlayer
import android.Manifest
import android.content.pm.PackageManager
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiInfo
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.os.Build
import androidx.core.content.ContextCompat
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.StatFs
import android.provider.Settings
import android.speech.tts.TextToSpeech
import android.util.Log
import android.widget.Toast
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

        /** Static reference for MQTT health-check from OverlayService watchdog. */
        @Volatile
        private var instance: MqttModule? = null

        /**
         * Check if MQTT should be running but is disconnected, and trigger reconnect.
         * Called by OverlayService watchdog.
         */
        fun checkAndReconnect() {
            val module = instance ?: return
            val client = module.mqttClient ?: return
            if (!client.isConnected()) {
                Log.i(TAG, "Watchdog: MQTT disconnected, triggering reconnect")
                client.reconnect()
            }
        }
    }

    init {
        instance = this
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

    // Motion detection
    private var jsMotionDetected: Boolean = false
    private var jsMotionAlwaysOn: Boolean = false

    // ==================== Audio playback ====================

    private var mediaPlayer: MediaPlayer? = null

    // ==================== TTS ====================

    private var tts: TextToSpeech? = null
    private var ttsReady: Boolean = false

    init {
        try {
            // Use the system's preferred TTS engine so installed language packs (e.g. Chinese)
            // are available — the no-arg constructor may pick a different limited engine.
            val preferredEngine = Settings.Secure.getString(
                reactContext.contentResolver,
                "tts_default_engine"
            )
            val listener = TextToSpeech.OnInitListener { status ->
                if (status == TextToSpeech.SUCCESS) {
                    ttsReady = true
                    Log.d(TAG, "TextToSpeech initialized (engine=$preferredEngine)")
                } else {
                    Log.e(TAG, "TextToSpeech initialization failed: $status")
                }
            }
            tts = if (!preferredEngine.isNullOrEmpty()) {
                TextToSpeech(reactContext.applicationContext, listener, preferredEngine)
            } else {
                TextToSpeech(reactContext.applicationContext, listener)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize TTS: ${e.message}")
        }
    }

    private fun speakText(text: String) {
        try {
            if (tts != null && ttsReady) {
                val locale = detectLocaleForText(text)
                val result = tts?.setLanguage(locale)
                if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                    Log.w(TAG, "TTS language not supported: $locale, falling back to default")
                    tts?.setLanguage(java.util.Locale.getDefault())
                }
                tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "mqtt_tts_${System.currentTimeMillis()}")
                Log.d(TAG, "TTS speaking: $text (locale: $locale)")
            } else {
                Log.w(TAG, "TTS not ready")
            }
        } catch (e: Exception) {
            Log.e(TAG, "TTS speak failed: ${e.message}")
        }
    }

    private fun detectLocaleForText(text: String): java.util.Locale {
        var cjkCount = 0; var koreanCount = 0; var japaneseCount = 0
        var arabicCount = 0; var thaiCount = 0; var devanagariCount = 0; var cyrillicCount = 0
        var totalLetters = 0
        for (ch in text) {
            if (!ch.isLetter()) continue
            totalLetters++
            val type = Character.getType(ch)
            when {
                ch.code in 0x4E00..0x9FFF || ch.code in 0x3400..0x4DBF -> cjkCount++
                ch.code in 0xAC00..0xD7AF || ch.code in 0x1100..0x11FF -> koreanCount++
                ch.code in 0x3040..0x30FF -> japaneseCount++
                type == Character.OTHER_LETTER.toInt() && ch.code in 0x0600..0x06FF -> arabicCount++
                ch.code in 0x0E00..0x0E7F -> thaiCount++
                ch.code in 0x0900..0x097F -> devanagariCount++
                ch.code in 0x0400..0x04FF -> cyrillicCount++
            }
        }
        if (totalLetters == 0) return java.util.Locale.getDefault()
        val dominant = mapOf("cjk" to cjkCount, "korean" to koreanCount, "japanese" to japaneseCount,
            "arabic" to arabicCount, "thai" to thaiCount, "devanagari" to devanagariCount,
            "cyrillic" to cyrillicCount).maxByOrNull { it.value }
        return if (dominant != null && dominant.value > 0) when (dominant.key) {
            "korean" -> java.util.Locale.KOREAN
            "japanese" -> java.util.Locale.JAPANESE
            "cjk" -> java.util.Locale.SIMPLIFIED_CHINESE
            "arabic" -> java.util.Locale("ar")
            "thai" -> java.util.Locale("th")
            "devanagari" -> java.util.Locale("hi")
            "cyrillic" -> java.util.Locale("ru")
            else -> java.util.Locale.getDefault()
        } else java.util.Locale.getDefault()
    }

    private fun showToastMessage(text: String) {
        try {
            Handler(Looper.getMainLooper()).post {
                Toast.makeText(reactContext.applicationContext, text, Toast.LENGTH_LONG).show()
            }
            Log.d(TAG, "Toast shown: $text")
        } catch (e: Exception) {
            Log.e(TAG, "Toast failed: ${e.message}")
        }
    }

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
                allowControl = if (configMap.hasKey("allowControl")) configMap.getBoolean("allowControl") else true,
                deviceName = if (configMap.hasKey("deviceName")) configMap.getString("deviceName") else null,
                useTls = if (configMap.hasKey("useTls")) configMap.getBoolean("useTls") else false
            )

            val client = KioskMqttClient(reactContext.applicationContext, config)

            // Wire up callbacks
            client.statusProvider = { getDeviceStatus() }

            client.commandHandler = { command, params ->
                // Handle TTS, Toast and Audio natively (JS callback doesn't execute them)
                when (command) {
                    "tts" -> {
                        val text = params?.optString("text", "") ?: ""
                        if (text.isNotEmpty()) speakText(text)
                    }
                    "toast" -> {
                        val text = params?.optString("text", "") ?: ""
                        if (text.isNotEmpty()) showToastMessage(text)
                    }
                    "audioPlay" -> {
                        val url = params?.optString("url", "")
                        val loop = params?.optBoolean("loop", false) ?: false
                        val volume = params?.optInt("volume", 50) ?: 50
                        playAudio(url, loop, volume)
                    }
                    "audioStop" -> {
                        stopAudio()
                    }
                    "audioBeep" -> {
                        playBeep()
                    }
                }
                emitCommand(command, params)
            }

            client.onConnectionChanged = { connected ->
                emitConnectionChanged(connected)
            }

            client.onConnectionError = { errorMessage ->
                emitConnectionError(errorMessage)
            }

            client.ipProvider = { getLocalIpAddress() }

            // Set up Home Assistant discovery
            val deviceId = client.deviceId
            val topicId = client.topicId
            val appVersion = com.freekiosk.BuildConfig.VERSION_NAME
            val discovery = MqttDiscovery(
                deviceId = deviceId,
                topicId = topicId,
                baseTopic = config.baseTopic,
                discoveryPrefix = config.discoveryPrefix,
                appVersion = appVersion,
                deviceName = config.deviceName
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
        } catch (e: Throwable) {
            Log.e(TAG, "Failed to start MQTT client", e)
            // Log the root cause for ExceptionInInitializerError
            var cause = e.cause
            while (cause != null) {
                Log.e(TAG, "Caused by: ${cause.javaClass.name}: ${cause.message}")
                cause = cause.cause
            }
            promise.reject("START_ERROR", "${e.javaClass.simpleName}: ${e.message}")
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

            // Motion detection
            if (status.has("motionDetected")) jsMotionDetected = status.getBoolean("motionDetected")
            if (status.has("motionAlwaysOn")) jsMotionAlwaysOn = status.getBoolean("motionAlwaysOn")

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

    /**
     * Get the device model name for pre-filling the MQTT Device Name field.
     */
    @ReactMethod
    fun getDeviceModel(promise: Promise) {
        promise.resolve(Build.MODEL)
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
            // Use native PowerManager.isInteractive as source of truth (same as HttpServerModule)
            // This reflects the PHYSICAL screen state regardless of command source
            put("on", powerManager.isInteractive)
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
            put("motionAlwaysOn", jsMotionAlwaysOn)
            put("manufacturer", Build.MANUFACTURER)
            put("model", Build.MODEL)
            put("androidVersion", Build.VERSION.RELEASE)
            put("apiLevel", Build.VERSION.SDK_INT)
            put("processor", Build.HARDWARE)
            put("deviceName", Build.DEVICE)
            put("product", Build.PRODUCT)
            put("uptime", android.os.SystemClock.elapsedRealtime() / 1000) // seconds
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
            val connectivityManager = reactContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

            val network = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) connectivityManager.activeNetwork else null
            val capabilities = if (network != null) connectivityManager.getNetworkCapabilities(network) else null

            val isConnected = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
            } else {
                @Suppress("DEPRECATION")
                connectivityManager.getNetworkInfo(ConnectivityManager.TYPE_WIFI)?.isConnected == true
            }

            // API 31+: use transportInfo from NetworkCapabilities — connectionInfo returns <unknown ssid> on Android 12+
            val wifiInfoObj: WifiInfo? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && capabilities != null) {
                capabilities.transportInfo as? WifiInfo
            } else {
                val wifiManager = reactContext.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
                @Suppress("DEPRECATION")
                wifiManager.connectionInfo
            }

            val ssid = getSsidSafe(wifiInfoObj?.ssid)
            val rssi = wifiInfoObj?.rssi ?: -100
            val signalLevel = WifiManager.calculateSignalLevel(rssi, 100)

            JSONObject().apply {
                put("ssid", ssid)
                put("signalStrength", rssi)
                put("signalLevel", signalLevel)
                put("connected", isConnected)
                put("linkSpeed", wifiInfoObj?.linkSpeed ?: 0)
                put("frequency", wifiInfoObj?.frequency ?: 0)
                put("ipAddress", getLocalIpAddress())
            }
        } catch (e: Exception) {
            JSONObject().apply {
                put("ssid", "")
                put("signalStrength", 0)
                put("signalLevel", 0)
                put("connected", false)
                put("linkSpeed", 0)
                put("frequency", 0)
                put("ipAddress", "0.0.0.0")
            }
        }
    }

    private fun getSsidSafe(rawSsid: String?): String {
        val ssid = rawSsid?.replace("\"", "")?.trim() ?: ""
        if (ssid.isNotEmpty() && ssid != "<unknown ssid>" && ssid != "0x") {
            return ssid
        }
        val hasLocationPermission = ContextCompat.checkSelfPermission(
            reactContext, Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        val locationManager = reactContext.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
        val locationEnabled = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            locationManager?.isLocationEnabled == true
        } else {
            @Suppress("DEPRECATION")
            (locationManager?.isProviderEnabled(LocationManager.GPS_PROVIDER) == true ||
             locationManager?.isProviderEnabled(LocationManager.NETWORK_PROVIDER) == true)
        }
        return when {
            !hasLocationPermission -> "WiFi (no permission)"
            !locationEnabled -> "WiFi (location off)"
            else -> "WiFi"
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

    // ==================== Audio Methods ====================

    private fun playAudio(url: String?, loop: Boolean, volume: Int) {
        try {
            stopAudio()

            if (url.isNullOrEmpty()) {
                Log.w(TAG, "No URL provided for audio playback")
                return
            }

            mediaPlayer = MediaPlayer().apply {
                setDataSource(url)
                isLooping = loop
                setVolume(volume / 100f, volume / 100f)
                prepareAsync()
                setOnPreparedListener { start() }
                setOnErrorListener { _, what, extra ->
                    Log.e(TAG, "MediaPlayer error: $what, $extra")
                    true
                }
            }
            Log.d(TAG, "Playing audio: $url, loop=$loop, volume=$volume")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to play audio", e)
        }
    }

    private fun stopAudio() {
        try {
            mediaPlayer?.apply {
                if (isPlaying) stop()
                release()
            }
            mediaPlayer = null
            Log.d(TAG, "Audio stopped")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to stop audio", e)
        }
    }

    private fun playBeep() {
        Thread {
            try {
                // Generate a 440Hz beep (note A) for 200ms on MUSIC stream
                val sampleRate = 44100
                val durationMs = 200
                val numSamples = sampleRate * durationMs / 1000
                val samples = ShortArray(numSamples)
                val freqHz = 440.0 // Note A4

                // Generate sine wave
                for (i in 0 until numSamples) {
                    val angle = 2.0 * Math.PI * i * freqHz / sampleRate
                    samples[i] = (Math.sin(angle) * Short.MAX_VALUE * 0.3).toInt().toShort() // 30% volume
                }

                val audioTrack = AudioTrack.Builder()
                    .setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build()
                    )
                    .setAudioFormat(
                        AudioFormat.Builder()
                            .setSampleRate(sampleRate)
                            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                            .build()
                    )
                    .setBufferSizeInBytes(samples.size * 2)
                    .setTransferMode(AudioTrack.MODE_STATIC)
                    .build()

                audioTrack.write(samples, 0, samples.size)
                audioTrack.play()

                // Wait for playback to finish then release
                Thread.sleep(durationMs.toLong() + 50)
                audioTrack.stop()
                audioTrack.release()

                Log.d(TAG, "Beep played (440Hz tone)")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to play beep", e)
            }
        }.start()
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

    /**
     * Emit an `onMqttConnectionError` event to JS with the error message.
     */
    private fun emitConnectionError(message: String) {
        sendEvent("onMqttConnectionError", Arguments.createMap().apply {
            putString("message", message)
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
            instance = null
            sensorManager?.unregisterListener(this)
            stopAudio()
            tts?.stop()
            tts?.shutdown()
            tts = null
            ttsReady = false
            Log.d(TAG, "MqttModule cleaned up")
        } catch (e: Exception) {
            Log.e(TAG, "Error during cleanup: ${e.message}")
        }
    }
}
