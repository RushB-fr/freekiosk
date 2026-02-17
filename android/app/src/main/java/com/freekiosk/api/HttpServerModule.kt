package com.freekiosk.api

import android.app.ActivityManager
import android.app.Instrumentation
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.location.Location
import android.location.LocationManager
import android.graphics.Bitmap
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.media.ToneGenerator
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.os.Environment
import android.os.PowerManager
import android.os.StatFs
import android.speech.tts.TextToSpeech
import android.util.Log
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.widget.Toast
import com.facebook.react.bridge.*
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.freekiosk.DeviceAdminReceiver
import com.freekiosk.CameraPhotoModule
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.net.Inet4Address
import java.net.NetworkInterface

/**
 * React Native Module for HTTP Server management
 */
class HttpServerModule(private val reactContext: ReactApplicationContext) : 
    ReactContextBaseJavaModule(reactContext), SensorEventListener {

    companion object {
        private const val TAG = "HttpServerModule"
        private const val NAME = "HttpServerModule"
    }

    private var server: KioskHttpServer? = null
    private var statusCallback: (() -> JSONObject)? = null
    private var commandCallback: ((String, JSONObject?) -> JSONObject)? = null
    
    // Callbacks set from JS
    private var jsStatusCallback: Callback? = null
    
    // Status data from JS side (updated via updateStatus method)
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
    
    // Auto-brightness status (updated via updateStatus method)
    private var jsAutoBrightnessEnabled: Boolean = false
    private var jsAutoBrightnessMin: Int = 10
    private var jsAutoBrightnessMax: Int = 100
    
    // Sensor data
    private var sensorManager: SensorManager? = null
    private var lightSensor: Sensor? = null
    private var proximitySensor: Sensor? = null
    private var accelerometerSensor: Sensor? = null
    private var lightValue: Float = -1f
    private var proximityValue: Float = -1f
    private var accelerometerX: Float = 0f
    private var accelerometerY: Float = 0f
    private var accelerometerZ: Float = 0f
    
    // Audio playback
    private var mediaPlayer: MediaPlayer? = null
    
    // Screen control
    private var wakeLock: PowerManager.WakeLock? = null
    private var toneGenerator: ToneGenerator? = null
    
    // Server lifecycle management
    private var wifiLock: WifiManager.WifiLock? = null
    private var cpuWakeLock: PowerManager.WakeLock? = null
    
    // Camera
    private var cameraPhotoModule: CameraPhotoModule? = null
    
    // Text-to-Speech
    private var tts: TextToSpeech? = null
    private var ttsReady: Boolean = false

    init {
        initSensors()
        initTts()
    }

    private fun initTts() {
        try {
            tts = TextToSpeech(reactContext.applicationContext) { status ->
                if (status == TextToSpeech.SUCCESS) {
                    ttsReady = true
                    Log.d(TAG, "TextToSpeech initialized successfully")
                } else {
                    Log.e(TAG, "TextToSpeech initialization failed: $status")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize TTS: ${e.message}")
        }
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

    override fun getName(): String = NAME

    @ReactMethod
    fun startServer(port: Int, apiKey: String?, allowControl: Boolean, promise: Promise) {
        try {
            if (server != null) {
                promise.reject("ALREADY_RUNNING", "Server is already running")
                return
            }

            // Acquire locks to keep server running even when screen is off
            acquireServerLocks()

            // Initialize camera module
            if (cameraPhotoModule == null) {
                cameraPhotoModule = CameraPhotoModule(reactContext.applicationContext)
            }

            server = KioskHttpServer(
                port = port,
                apiKey = if (apiKey.isNullOrEmpty()) null else apiKey,
                allowControl = allowControl,
                statusProvider = { getDeviceStatus() },
                commandHandler = { command, params -> handleCommand(command, params) },
                screenshotProvider = { captureScreenshot() },
                cameraPhotoProvider = { camera, quality -> cameraPhotoModule?.capturePhoto(camera, quality) }
            )

            server?.start()
            
            Log.i(TAG, "HTTP Server started on port $port with locks acquired")
            
            val result = Arguments.createMap().apply {
                putBoolean("success", true)
                putInt("port", port)
                putString("ip", getLocalIpAddress())
            }
            promise.resolve(result)
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start server", e)
            promise.reject("START_ERROR", e.message)
        }
    }

    @ReactMethod
    fun stopServer(promise: Promise) {
        try {
            server?.stop()
            server = null
            releaseServerLocks()
            Log.i(TAG, "HTTP Server stopped and locks released")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to stop server", e)
            promise.reject("STOP_ERROR", e.message)
        }
    }

    @ReactMethod
    fun isRunning(promise: Promise) {
        promise.resolve(server?.isAlive == true)
    }

    @ReactMethod
    fun getServerInfo(promise: Promise) {
        val result = Arguments.createMap().apply {
            putBoolean("running", server?.isAlive == true)
            putString("ip", getLocalIpAddress())
        }
        promise.resolve(result)
    }

    /**
     * Acquire WifiLock and CPU WakeLock to keep server running when screen is off
     */
    private fun acquireServerLocks() {
        try {
            // WiFi Lock - prevents WiFi from going to sleep
            val wifiManager = reactContext.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            wifiLock = wifiManager.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "FreeKiosk:HttpServer")
            wifiLock?.acquire()
            Log.d(TAG, "WifiLock acquired for HTTP Server")
            
            // CPU Partial Wake Lock - keeps CPU running for background processing
            val powerManager = reactContext.getSystemService(Context.POWER_SERVICE) as PowerManager
            cpuWakeLock = powerManager.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "FreeKiosk:HttpServerCPU"
            )
            cpuWakeLock?.acquire()
            Log.d(TAG, "CPU WakeLock acquired for HTTP Server")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to acquire server locks: ${e.message}")
        }
    }
    
    /**
     * Release WifiLock and CPU WakeLock when server stops
     */
    private fun releaseServerLocks() {
        try {
            wifiLock?.let {
                if (it.isHeld) {
                    it.release()
                    Log.d(TAG, "WifiLock released")
                }
            }
            wifiLock = null
            
            cpuWakeLock?.let {
                if (it.isHeld) {
                    it.release()
                    Log.d(TAG, "CPU WakeLock released")
                }
            }
            cpuWakeLock = null
        } catch (e: Exception) {
            Log.e(TAG, "Failed to release server locks: ${e.message}")
        }
    }

    @ReactMethod
    fun getLocalIp(promise: Promise) {
        promise.resolve(getLocalIpAddress())
    }

    // ==================== Status Provider ====================

    private fun getDeviceStatus(): JSONObject {
        val status = JSONObject()
        
        // Battery
        val batteryStatus = getBatteryInfo()
        status.put("battery", batteryStatus)
        
        // Screen - use values from JS + actual screen state
        val screenStatus = JSONObject().apply {
            // Get actual screen state from PowerManager
            val powerManager = reactContext.getSystemService(Context.POWER_SERVICE) as PowerManager
            val isInteractive = powerManager.isInteractive
            
            // "on" reflects the PHYSICAL screen state (PowerManager.isInteractive)
            // "screensaverActive" is separate - indicates if screensaver overlay is showing
            // This allows clients to distinguish: screen physically on vs content visible
            put("on", isInteractive)
            put("brightness", jsBrightness)
            put("screensaverActive", jsScreensaverActive)
        }
        status.put("screen", screenStatus)
        
        // Audio - get current volume
        val audioStatus = JSONObject().apply {
            try {
                val audioManager = reactContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
                val currentVolume = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC)
                val maxVolume = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
                val volumePercent = (currentVolume * 100) / maxVolume
                put("volume", volumePercent)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to get volume for status: ${e.message}")
                put("volume", 50) // Default fallback
            }
        }
        status.put("audio", audioStatus)
        
        // WebView - use values from JS
        val webviewStatus = JSONObject().apply {
            put("currentUrl", jsCurrentUrl)
            put("canGoBack", jsCanGoBack)
            put("loading", jsLoading)
        }
        status.put("webview", webviewStatus)
        
        // Device
        val deviceStatus = JSONObject().apply {
            put("ip", getLocalIpAddress())
            put("hostname", "freekiosk")
            put("version", com.freekiosk.BuildConfig.VERSION_NAME)
            // Check real Device Owner status via DevicePolicyManager
            val dpm = reactContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
            put("isDeviceOwner", dpm.isDeviceOwnerApp(reactContext.packageName))
            put("kioskMode", jsKioskMode)
        }
        status.put("device", deviceStatus)
        
        // WiFi
        val wifiStatus = getWifiInfo()
        status.put("wifi", wifiStatus)
        
        // URL Rotation
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
        val storageStatus = getStorageInfo()
        status.put("storage", storageStatus)
        
        // Memory
        val memoryStatus = getMemoryInfo()
        status.put("memory", memoryStatus)
        
        return status
    }

    private fun getBatteryInfo(): JSONObject {
        val intentFilter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        val batteryIntent = reactContext.registerReceiver(null, intentFilter)
        
        val level = batteryIntent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: 0
        val scale = batteryIntent?.getIntExtra(BatteryManager.EXTRA_SCALE, 100) ?: 100
        val percentage = (level * 100) / scale
        
        val status = batteryIntent?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        val isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                         status == BatteryManager.BATTERY_STATUS_FULL
        
        val plugged = batteryIntent?.getIntExtra(BatteryManager.EXTRA_PLUGGED, -1) ?: -1
        val pluggedType = when (plugged) {
            BatteryManager.BATTERY_PLUGGED_USB -> "usb"
            BatteryManager.BATTERY_PLUGGED_AC -> "ac"
            BatteryManager.BATTERY_PLUGGED_WIRELESS -> "wireless"
            else -> "none"
        }
        
        // Additional battery details
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
            
            // Check if we have a valid IP address (more reliable than networkId)
            val ipAddress = getLocalIpAddress()
            val isConnected = ipAddress != "0.0.0.0" && wifiInfo.rssi != 0
            
            // Get SSID - may be <unknown ssid> on Android 8+ without location permission
            var ssid = wifiInfo.ssid?.replace("\"", "") ?: ""
            if (ssid == "<unknown ssid>") {
                ssid = "WiFi" // Friendly name when permission not granted
            }
            
            // Calculate signal percentage (rssi is typically -100 to -30 dBm)
            val signalLevel = WifiManager.calculateSignalLevel(wifiInfo.rssi, 100)
            
            JSONObject().apply {
                put("ssid", ssid)
                put("signalStrength", wifiInfo.rssi)
                put("signalLevel", signalLevel) // 0-100 percentage
                put("connected", isConnected)
                put("linkSpeed", wifiInfo.linkSpeed) // Mbps
                put("frequency", wifiInfo.frequency) // MHz (2.4GHz or 5GHz)
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

    // ==================== Command Handler ====================

    private fun handleCommand(command: String, params: JSONObject?): JSONObject {
        Log.d(TAG, "Handling command: $command")
        
        // Handle audio commands directly (don't need JS)
        when (command) {
            "audioPlay" -> {
                val url = params?.optString("url", "")
                val loop = params?.optBoolean("loop", false) ?: false
                val volume = params?.optInt("volume", 50) ?: 50
                playAudio(url, loop, volume)
                return JSONObject().apply {
                    put("executed", true)
                    put("command", command)
                }
            }
            "audioStop" -> {
                stopAudio()
                return JSONObject().apply {
                    put("executed", true)
                    put("command", command)
                }
            }
            "audioBeep" -> {
                playBeep()
                return JSONObject().apply {
                    put("executed", true)
                    put("command", command)
                }
            }
            "screenOn" -> {
                turnScreenOn()
                return JSONObject().apply {
                    put("executed", true)
                    put("command", command)
                }
            }
            "screenOff" -> {
                turnScreenOff()
                return JSONObject().apply {
                    put("executed", true)
                    put("command", command)
                }
            }
            "wake" -> {
                // Wake must also turn on the physical screen (after lockNow)
                turnScreenOn()
                // Also send to JS to deactivate screensaver overlay
                sendEvent("onApiCommand", Arguments.createMap().apply {
                    putString("command", "wake")
                    putString("params", "{}")
                })
                return JSONObject().apply {
                    put("executed", true)
                    put("command", command)
                }
            }
            "autoBrightnessEnable" -> {
                val min = params?.optInt("min", 10) ?: 10
                val max = params?.optInt("max", 100) ?: 100
                // Send to JS for handling
                sendEvent("onApiCommand", Arguments.createMap().apply {
                    putString("command", "autoBrightnessEnable")
                    putString("params", JSONObject().apply {
                        put("min", min)
                        put("max", max)
                    }.toString())
                })
                return JSONObject().apply {
                    put("executed", true)
                    put("command", command)
                    put("min", min)
                    put("max", max)
                }
            }
            "autoBrightnessDisable" -> {
                sendEvent("onApiCommand", Arguments.createMap().apply {
                    putString("command", "autoBrightnessDisable")
                    putString("params", "{}")
                })
                return JSONObject().apply {
                    put("executed", true)
                    put("command", command)
                }
            }
            "getAutoBrightness" -> {
                return JSONObject().apply {
                    put("executed", true)
                    put("command", command)
                    put("autoBrightness", JSONObject().apply {
                        put("enabled", jsAutoBrightnessEnabled)
                        put("min", jsAutoBrightnessMin)
                        put("max", jsAutoBrightnessMax)
                        put("currentLightLevel", lightValue)
                    })
                }
            }
            "cameraList" -> {
                val cameras = cameraPhotoModule?.getAvailableCameras() ?: emptyList()
                return JSONObject().apply {
                    put("executed", true)
                    put("command", command)
                    put("cameras", org.json.JSONArray().apply {
                        cameras.forEach { cam ->
                            put(JSONObject().apply {
                                put("id", cam["id"])
                                put("facing", cam["facing"])
                                put("maxWidth", cam["maxWidth"])
                                put("maxHeight", cam["maxHeight"])
                            })
                        }
                    })
                }
            }
            "reboot" -> {
                return try {
                    val dpm = reactContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
                    val adminComponent = android.content.ComponentName(reactContext, DeviceAdminReceiver::class.java)
                    if (dpm.isDeviceOwnerApp(reactContext.packageName)) {
                        Log.d(TAG, "Rebooting device via Device Owner API")
                        dpm.reboot(adminComponent)
                        JSONObject().apply {
                            put("executed", true)
                            put("command", command)
                        }
                    } else {
                        Log.w(TAG, "Reboot failed: not Device Owner")
                        JSONObject().apply {
                            put("executed", false)
                            put("command", command)
                            put("error", "Reboot requires Device Owner mode")
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Reboot failed: ${e.message}")
                    JSONObject().apply {
                        put("executed", false)
                        put("command", command)
                        put("error", "Reboot failed: ${e.message}")
                    }
                }
            }
            "tts" -> {
                val text = params?.optString("text", "") ?: ""
                if (text.isNotEmpty()) {
                    speakText(text)
                    return JSONObject().apply {
                        put("executed", true)
                        put("command", command)
                    }
                } else {
                    return JSONObject().apply {
                        put("executed", false)
                        put("command", command)
                        put("error", "Text is required")
                    }
                }
            }
            "clearCache" -> {
                clearWebViewCache()
                // Also send to JS to reload the WebView
                sendEvent("onApiCommand", Arguments.createMap().apply {
                    putString("command", "clearCache")
                    putString("params", "{}")
                })
                return JSONObject().apply {
                    put("executed", true)
                    put("command", command)
                }
            }
            "lockDevice" -> {
                return try {
                    val dpm = reactContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
                    if (dpm.isDeviceOwnerApp(reactContext.packageName)) {
                        dpm.lockNow()
                        Log.d(TAG, "Device locked via Device Owner API")
                        JSONObject().apply {
                            put("executed", true)
                            put("command", command)
                        }
                    } else {
                        Log.w(TAG, "Lock device failed: not Device Owner")
                        JSONObject().apply {
                            put("executed", false)
                            put("command", command)
                            put("error", "Lock device requires Device Owner mode")
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Lock device failed: ${e.message}")
                    JSONObject().apply {
                        put("executed", false)
                        put("command", command)
                        put("error", "Lock device failed: ${e.message}")
                    }
                }
            }
            "restartUi" -> {
                // Restart the React Native activity to refresh the UI
                UiThreadUtil.runOnUiThread {
                    try {
                        val activity = reactContext.currentActivity
                        if (activity != null) {
                            activity.recreate()
                            Log.d(TAG, "UI restarted via activity.recreate()")
                        } else {
                            Log.w(TAG, "Cannot restart UI: activity is null")
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to restart UI: ${e.message}")
                    }
                }
                return JSONObject().apply {
                    put("executed", true)
                    put("command", command)
                }
            }
            "keyboardKey" -> {
                val key = params?.optString("key", "") ?: ""
                if (key.isEmpty()) {
                    return JSONObject().apply {
                        put("executed", false)
                        put("command", command)
                        put("error", "Key name is required")
                    }
                }
                val keyCode = mapKeyNameToKeyCode(key.lowercase())
                if (keyCode == null) {
                    return JSONObject().apply {
                        put("executed", false)
                        put("command", command)
                        put("error", "Unknown key: $key. Use a-z, 0-9, f1-f12, space, tab, enter, escape, backspace, delete, etc.")
                    }
                }
                Thread {
                    try {
                        val inst = Instrumentation()
                        inst.sendKeyDownUpSync(keyCode)
                        Log.d(TAG, "Keyboard key sent: $key (code: $keyCode)")
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to send keyboard key: ${e.message}")
                    }
                }.start()
                return JSONObject().apply {
                    put("executed", true)
                    put("command", command)
                    put("key", key)
                    put("keyCode", keyCode)
                }
            }
            "keyboardCombo" -> {
                val map = params?.optString("map", "") ?: ""
                if (map.isEmpty()) {
                    return JSONObject().apply {
                        put("executed", false)
                        put("command", command)
                        put("error", "Key combination (map) is required, e.g. ctrl+c, alt+f4, ctrl+shift+a")
                    }
                }
                return sendKeyboardCombo(map)
            }
            "keyboardText" -> {
                val text = params?.optString("text", "") ?: ""
                if (text.isEmpty()) {
                    return JSONObject().apply {
                        put("executed", false)
                        put("command", command)
                        put("error", "Text is required")
                    }
                }
                return sendKeyboardText(text)
            }
            "getLocation" -> {
                return getLocationInfo()
            }
        }
        
        // Send other commands to JS side
        sendEvent("onApiCommand", Arguments.createMap().apply {
            putString("command", command)
            putString("params", params?.toString() ?: "{}")
        })
        
        return JSONObject().apply {
            put("executed", true)
            put("command", command)
        }
    }

    private fun sendEvent(eventName: String, params: WritableMap) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    // ==================== JS Interface for Status Updates ====================

    @ReactMethod
    fun updateStatus(statusJson: String) {
        // Parse status from JS and update local variables
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
            Log.d(TAG, "Status updated: url=$jsCurrentUrl, screensaver=$jsScreensaverActive, rotation=$jsRotationEnabled, autoBrightness=$jsAutoBrightnessEnabled")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse status update from JS", e)
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for RN event emitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for RN event emitter
    }

    @ReactMethod
    fun setVolume(value: Int, promise: Promise) {
        try {
            val audioManager = reactContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            val maxVolume = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
            val targetVolume = (value * maxVolume / 100).coerceIn(0, maxVolume)
            audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, targetVolume, 0)
            Log.d(TAG, "Volume set to $value% (raw: $targetVolume/$maxVolume)")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to set volume", e)
            promise.reject("VOLUME_ERROR", e.message)
        }
    }
    @ReactMethod
    fun getVolume(promise: Promise) {
        try {
            val audioManager = reactContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            val currentVolume = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC)
            val maxVolume = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
            val volumePercent = (currentVolume * 100) / maxVolume
            Log.d(TAG, "Current volume: $volumePercent% (raw: $currentVolume/$maxVolume)")
            promise.resolve(volumePercent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get volume: ${e.message}")
            promise.reject("ERROR", "Failed to get volume: ${e.message}")
        }
    }

    @ReactMethod
    fun showToast(message: String, promise: Promise) {
        try {
            UiThreadUtil.runOnUiThread {
                Toast.makeText(reactContext, message, Toast.LENGTH_LONG).show()
            }
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to show toast", e)
            promise.reject("TOAST_ERROR", e.message)
        }
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

    // ==================== Screen Control Methods ====================

    private fun turnScreenOn() {
        UiThreadUtil.runOnUiThread {
            try {
                val powerManager = reactContext.getSystemService(Context.POWER_SERVICE) as PowerManager
                
                // Release old wakeLock if exists
                wakeLock?.release()
                
                // Create WakeLock to turn on screen — this works even without activity
                @Suppress("DEPRECATION")
                wakeLock = powerManager.newWakeLock(
                    PowerManager.FULL_WAKE_LOCK or 
                    PowerManager.ACQUIRE_CAUSES_WAKEUP or 
                    PowerManager.ON_AFTER_RELEASE,
                    "FreeKiosk:HttpScreenOn"
                )
                wakeLock?.acquire(10*60*1000L) // 10 minutes timeout
                
                val activity = reactContext.currentActivity
                if (activity != null) {
                    // Re-enable FLAG_KEEP_SCREEN_ON
                    activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                    
                    // Set screen to normal brightness (-1 = use system default)
                    val layoutParams = activity.window.attributes
                    layoutParams.screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
                    activity.window.attributes = layoutParams
                    
                    // Dismiss keyguard if locked
                    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O_MR1) {
                        activity.setShowWhenLocked(true)
                        activity.setTurnScreenOn(true)
                        val keyguardManager = reactContext.getSystemService(Context.KEYGUARD_SERVICE) as android.app.KeyguardManager
                        keyguardManager.requestDismissKeyguard(activity, null)
                    } else {
                        @Suppress("DEPRECATION")
                        activity.window.addFlags(
                            WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
                            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                            WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                        )
                    }
                    
                    Log.d(TAG, "Screen turned ON via HTTP API (activity available)")
                } else {
                    Log.d(TAG, "Screen turned ON via WakeLock only (activity not available)")
                }
                
                // Release wakeLock after a short delay — FLAG_KEEP_SCREEN_ON handles persistence
                android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                    try {
                        wakeLock?.release()
                        wakeLock = null
                        Log.d(TAG, "WakeLock released after screen on")
                    } catch (e: Exception) {
                        // Already released
                    }
                }, 5000)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to turn screen on: ${e.message}")
            }
        }
    }

    private fun turnScreenOff() {
        UiThreadUtil.runOnUiThread {
            try {
                val activity = reactContext.currentActivity
                if (activity != null) {
                    // Release wakeLock to allow screen to turn off
                    wakeLock?.release()
                    wakeLock = null
                    
                    // Try Device Owner lockNow() first (truly turns off screen)
                    val dpm = reactContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
                    if (dpm.isDeviceOwnerApp(reactContext.packageName)) {
                        // Device Owner can truly lock/turn off the screen
                        dpm.lockNow()
                        Log.d(TAG, "Screen turned OFF via Device Owner lockNow()")
                    } else {
                        // Fallback: dim brightness to absolute minimum
                        // Clear FLAG_KEEP_SCREEN_ON to allow screen to turn off
                        activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                        
                        val layoutParams = activity.window.attributes
                        layoutParams.screenBrightness = 0f
                        activity.window.attributes = layoutParams
                        
                        Log.d(TAG, "Screen dimmed to 0 brightness (no Device Owner)")
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to turn screen off: ${e.message}")
            }
        }
    }

    // ==================== Text-to-Speech ====================

    private fun speakText(text: String) {
        try {
            if (tts != null && ttsReady) {
                tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "freekiosk_tts_${System.currentTimeMillis()}")
                Log.d(TAG, "TTS speaking: $text")
            } else {
                // TTS not ready, try to reinitialize
                Log.w(TAG, "TTS not ready, reinitializing...")
                initTts()
                // Retry after a short delay
                android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                    if (ttsReady) {
                        tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "freekiosk_tts_retry")
                    }
                }, 1000)
            }
        } catch (e: Exception) {
            Log.e(TAG, "TTS speak failed: ${e.message}")
        }
    }

    // ==================== Keyboard Emulation ====================

    /**
     * Map a key name (string) to an Android KeyEvent keycode.
     * Supports: single characters (a-z, 0-9, symbols), named keys (space, tab, enter, etc.),
     * function keys (f1-f12), navigation, media keys, and modifiers.
     */
    private fun mapKeyNameToKeyCode(key: String): Int? {
        // Single character keys
        if (key.length == 1) {
            val char = key[0]
            return when {
                char in 'a'..'z' -> KeyEvent.KEYCODE_A + (char - 'a')
                char in '0'..'9' -> KeyEvent.KEYCODE_0 + (char - '0')
                char == ' ' -> KeyEvent.KEYCODE_SPACE
                char == '.' -> KeyEvent.KEYCODE_PERIOD
                char == ',' -> KeyEvent.KEYCODE_COMMA
                char == '-' -> KeyEvent.KEYCODE_MINUS
                char == '=' -> KeyEvent.KEYCODE_EQUALS
                char == '+' -> KeyEvent.KEYCODE_PLUS
                char == '[' -> KeyEvent.KEYCODE_LEFT_BRACKET
                char == ']' -> KeyEvent.KEYCODE_RIGHT_BRACKET
                char == '\\' -> KeyEvent.KEYCODE_BACKSLASH
                char == '/' -> KeyEvent.KEYCODE_SLASH
                char == ';' -> KeyEvent.KEYCODE_SEMICOLON
                char == '\'' -> KeyEvent.KEYCODE_APOSTROPHE
                char == '`' -> KeyEvent.KEYCODE_GRAVE
                char == '@' -> KeyEvent.KEYCODE_AT
                char == '#' -> KeyEvent.KEYCODE_POUND
                char == '*' -> KeyEvent.KEYCODE_STAR
                char == '\t' -> KeyEvent.KEYCODE_TAB
                char == '\n' -> KeyEvent.KEYCODE_ENTER
                else -> null
            }
        }

        // Named keys
        return when (key) {
            // Whitespace / editing
            "space" -> KeyEvent.KEYCODE_SPACE
            "tab" -> KeyEvent.KEYCODE_TAB
            "enter", "return" -> KeyEvent.KEYCODE_ENTER
            "escape", "esc" -> KeyEvent.KEYCODE_ESCAPE
            "backspace" -> KeyEvent.KEYCODE_DEL
            "delete", "del" -> KeyEvent.KEYCODE_FORWARD_DEL
            "insert", "ins" -> KeyEvent.KEYCODE_INSERT

            // Cursor / navigation (keyboard Home/End, not Android Home button)
            "up" -> KeyEvent.KEYCODE_DPAD_UP
            "down" -> KeyEvent.KEYCODE_DPAD_DOWN
            "left" -> KeyEvent.KEYCODE_DPAD_LEFT
            "right" -> KeyEvent.KEYCODE_DPAD_RIGHT
            "home" -> KeyEvent.KEYCODE_MOVE_HOME
            "end" -> KeyEvent.KEYCODE_MOVE_END
            "pageup" -> KeyEvent.KEYCODE_PAGE_UP
            "pagedown" -> KeyEvent.KEYCODE_PAGE_DOWN

            // Function keys
            "f1" -> KeyEvent.KEYCODE_F1
            "f2" -> KeyEvent.KEYCODE_F2
            "f3" -> KeyEvent.KEYCODE_F3
            "f4" -> KeyEvent.KEYCODE_F4
            "f5" -> KeyEvent.KEYCODE_F5
            "f6" -> KeyEvent.KEYCODE_F6
            "f7" -> KeyEvent.KEYCODE_F7
            "f8" -> KeyEvent.KEYCODE_F8
            "f9" -> KeyEvent.KEYCODE_F9
            "f10" -> KeyEvent.KEYCODE_F10
            "f11" -> KeyEvent.KEYCODE_F11
            "f12" -> KeyEvent.KEYCODE_F12

            // Toggle keys
            "capslock" -> KeyEvent.KEYCODE_CAPS_LOCK
            "numlock" -> KeyEvent.KEYCODE_NUM_LOCK
            "scrolllock" -> KeyEvent.KEYCODE_SCROLL_LOCK

            // Modifier keys (as standalone presses)
            "shift" -> KeyEvent.KEYCODE_SHIFT_LEFT
            "ctrl", "control" -> KeyEvent.KEYCODE_CTRL_LEFT
            "alt" -> KeyEvent.KEYCODE_ALT_LEFT
            "meta", "win", "cmd", "command" -> KeyEvent.KEYCODE_META_LEFT

            // Media keys
            "playpause" -> KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
            "play" -> KeyEvent.KEYCODE_MEDIA_PLAY
            "pause" -> KeyEvent.KEYCODE_MEDIA_PAUSE
            "stop" -> KeyEvent.KEYCODE_MEDIA_STOP
            "next", "nexttrack" -> KeyEvent.KEYCODE_MEDIA_NEXT
            "previous", "prevtrack" -> KeyEvent.KEYCODE_MEDIA_PREVIOUS
            "volumeup" -> KeyEvent.KEYCODE_VOLUME_UP
            "volumedown" -> KeyEvent.KEYCODE_VOLUME_DOWN
            "mute" -> KeyEvent.KEYCODE_VOLUME_MUTE

            // Android system keys
            "back" -> KeyEvent.KEYCODE_BACK
            "menu" -> KeyEvent.KEYCODE_MENU
            "search" -> KeyEvent.KEYCODE_SEARCH
            "power" -> KeyEvent.KEYCODE_POWER
            "select", "center", "dpadcenter" -> KeyEvent.KEYCODE_DPAD_CENTER
            "androidhome" -> KeyEvent.KEYCODE_HOME

            // Symbol names
            "period", "dot" -> KeyEvent.KEYCODE_PERIOD
            "comma" -> KeyEvent.KEYCODE_COMMA
            "minus", "dash" -> KeyEvent.KEYCODE_MINUS
            "plus" -> KeyEvent.KEYCODE_PLUS
            "equals" -> KeyEvent.KEYCODE_EQUALS
            "semicolon" -> KeyEvent.KEYCODE_SEMICOLON
            "apostrophe", "quote" -> KeyEvent.KEYCODE_APOSTROPHE
            "slash" -> KeyEvent.KEYCODE_SLASH
            "backslash" -> KeyEvent.KEYCODE_BACKSLASH
            "leftbracket" -> KeyEvent.KEYCODE_LEFT_BRACKET
            "rightbracket" -> KeyEvent.KEYCODE_RIGHT_BRACKET
            "grave", "backtick" -> KeyEvent.KEYCODE_GRAVE
            "at" -> KeyEvent.KEYCODE_AT
            "pound", "hash" -> KeyEvent.KEYCODE_POUND
            "star", "asterisk" -> KeyEvent.KEYCODE_STAR

            else -> null
        }
    }

    /**
     * Send a keyboard shortcut combination (e.g., "ctrl+c", "alt+f4", "ctrl+shift+a").
     * The last part is the key, preceding parts are modifiers (ctrl, alt, shift, meta).
     */
    private fun sendKeyboardCombo(map: String): JSONObject {
        // NanoHTTPD decodes '+' in query params as space, so split on both '+' and ' '
        val parts = map.lowercase().split(Regex("[+ ]")).map { it.trim() }.filter { it.isNotEmpty() }
        if (parts.isEmpty()) {
            return JSONObject().apply {
                put("executed", false)
                put("command", "keyboardCombo")
                put("error", "Empty key combination")
            }
        }

        // Last part is the key, everything before is a modifier
        val keyName = parts.last()
        val modifiers = parts.dropLast(1)

        val keyCode = mapKeyNameToKeyCode(keyName)
        if (keyCode == null) {
            return JSONObject().apply {
                put("executed", false)
                put("command", "keyboardCombo")
                put("error", "Unknown key in combination: $keyName")
            }
        }

        // Build meta state from modifiers
        var metaState = 0
        for (mod in modifiers) {
            metaState = metaState or when (mod) {
                "ctrl", "control" -> KeyEvent.META_CTRL_ON or KeyEvent.META_CTRL_LEFT_ON
                "alt" -> KeyEvent.META_ALT_ON or KeyEvent.META_ALT_LEFT_ON
                "shift" -> KeyEvent.META_SHIFT_ON or KeyEvent.META_SHIFT_LEFT_ON
                "meta", "win", "cmd", "command" -> KeyEvent.META_META_ON or KeyEvent.META_META_LEFT_ON
                else -> {
                    return JSONObject().apply {
                        put("executed", false)
                        put("command", "keyboardCombo")
                        put("error", "Unknown modifier: $mod. Valid modifiers: ctrl, alt, shift, meta")
                    }
                }
            }
        }

        val finalMetaState = metaState
        Thread {
            try {
                val inst = Instrumentation()
                val now = android.os.SystemClock.uptimeMillis()
                val downEvent = KeyEvent(now, now, KeyEvent.ACTION_DOWN, keyCode, 0, finalMetaState)
                val upEvent = KeyEvent(now, now, KeyEvent.ACTION_UP, keyCode, 0, finalMetaState)
                inst.sendKeySync(downEvent)
                inst.sendKeySync(upEvent)
                Log.d(TAG, "Keyboard combo sent: $map (key=$keyCode, meta=$finalMetaState)")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to send keyboard combo: ${e.message}")
            }
        }.start()

        return JSONObject().apply {
            put("executed", true)
            put("command", "keyboardCombo")
            put("map", map)
            put("key", keyName)
            put("keyCode", keyCode)
            put("modifiers", org.json.JSONArray(modifiers))
            put("metaState", finalMetaState)
        }
    }

    /**
     * Type a text string by sending individual key events for each character.
     * Uses Instrumentation.sendStringSync() for natural text input.
     */
    private fun sendKeyboardText(text: String): JSONObject {
        Thread {
            try {
                val inst = Instrumentation()
                inst.sendStringSync(text)
                Log.d(TAG, "Keyboard text sent: ${text.take(50)}${if (text.length > 50) "..." else ""}")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to send keyboard text: ${e.message}")
            }
        }.start()

        return JSONObject().apply {
            put("executed", true)
            put("command", "keyboardText")
            put("textLength", text.length)
        }
    }

    // ==================== GPS Location ====================

    /**
     * Get the device's last known GPS location.
     * Tries GPS, Network, and Passive providers, returns the most accurate.
     * Requires ACCESS_FINE_LOCATION permission (already declared in manifest).
     */
    private fun getLocationInfo(): JSONObject {
        return try {
            val locationManager = reactContext.getSystemService(Context.LOCATION_SERVICE) as LocationManager

            // Try to get last known location from various providers (best accuracy wins)
            var bestLocation: Location? = null
            val providers = listOf(
                LocationManager.GPS_PROVIDER,
                LocationManager.NETWORK_PROVIDER,
                LocationManager.PASSIVE_PROVIDER
            )

            for (provider in providers) {
                try {
                    if (locationManager.isProviderEnabled(provider)) {
                        @Suppress("MissingPermission")
                        val location = locationManager.getLastKnownLocation(provider)
                        if (location != null) {
                            if (bestLocation == null || location.accuracy < bestLocation!!.accuracy) {
                                bestLocation = location
                            }
                        }
                    }
                } catch (e: SecurityException) {
                    Log.w(TAG, "No location permission for provider: $provider")
                }
            }

            // Check which providers are enabled
            val enabledProviders = providers.filter {
                try { locationManager.isProviderEnabled(it) } catch (e: Exception) { false }
            }

            JSONObject().apply {
                put("executed", true)
                put("command", "getLocation")
                put("providers", org.json.JSONArray(enabledProviders))
                if (bestLocation != null) {
                    put("available", true)
                    put("latitude", bestLocation!!.latitude)
                    put("longitude", bestLocation!!.longitude)
                    put("accuracy", bestLocation!!.accuracy.toDouble())
                    put("altitude", bestLocation!!.altitude)
                    put("speed", bestLocation!!.speed.toDouble())
                    put("bearing", bestLocation!!.bearing.toDouble())
                    put("provider", bestLocation!!.provider ?: "unknown")
                    put("time", bestLocation!!.time)
                } else {
                    put("available", false)
                    put("error", "No location available. Ensure GPS is enabled and location permission is granted.")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get location: ${e.message}")
            JSONObject().apply {
                put("executed", false)
                put("command", "getLocation")
                put("error", "Failed to get location: ${e.message}")
            }
        }
    }

    // ==================== WebView Cache Clearing ====================

    private fun clearWebViewCache() {
        UiThreadUtil.runOnUiThread {
            try {
                // Clear WebView cache and data
                android.webkit.WebView(reactContext.applicationContext).apply {
                    clearCache(true)
                    clearFormData()
                    clearHistory()
                    destroy()
                }
                // Also clear cookies
                android.webkit.CookieManager.getInstance().removeAllCookies(null)
                android.webkit.CookieManager.getInstance().flush()
                // Clear WebStorage
                android.webkit.WebStorage.getInstance().deleteAllData()
                Log.d(TAG, "WebView cache, cookies, and storage cleared")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to clear WebView cache: ${e.message}")
            }
        }
    }

    // ==================== Screenshot Method ====================

    private fun captureScreenshot(): java.io.InputStream? {
        return try {
            var screenshot: ByteArrayInputStream? = null
            val latch = java.util.concurrent.CountDownLatch(1)
            
            UiThreadUtil.runOnUiThread {
                try {
                    val activity = reactContext.currentActivity
                    val rootView = activity?.window?.decorView?.rootView
                    
                    if (rootView != null) {
                        rootView.isDrawingCacheEnabled = true
                        val bitmap = Bitmap.createBitmap(rootView.drawingCache)
                        rootView.isDrawingCacheEnabled = false
                        
                        val outputStream = ByteArrayOutputStream()
                        bitmap.compress(Bitmap.CompressFormat.PNG, 90, outputStream)
                        screenshot = ByteArrayInputStream(outputStream.toByteArray())
                        bitmap.recycle()
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to capture screenshot on UI thread", e)
                } finally {
                    latch.countDown()
                }
            }
            
            // Wait for UI thread to complete (max 5 seconds)
            latch.await(5, java.util.concurrent.TimeUnit.SECONDS)
            screenshot
        } catch (e: Exception) {
            Log.e(TAG, "Failed to capture screenshot", e)
            null
        }
    }
    
    /**
     * Clean up resources when module is destroyed
     */
    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        try {
            server?.stop()
            server = null
            releaseServerLocks()
            mediaPlayer?.release()
            mediaPlayer = null
            toneGenerator?.release()
            toneGenerator = null
            tts?.stop()
            tts?.shutdown()
            tts = null
            ttsReady = false
            sensorManager?.unregisterListener(this)
            cameraPhotoModule = null
            Log.d(TAG, "HttpServerModule cleaned up")
        } catch (e: Exception) {
            Log.e(TAG, "Error during cleanup: ${e.message}")
        }
    }
}
