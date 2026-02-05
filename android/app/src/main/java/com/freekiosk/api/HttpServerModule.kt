package com.freekiosk.api

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
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
import android.util.Log
import android.view.View
import android.view.WindowManager
import android.widget.Toast
import com.facebook.react.bridge.*
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.freekiosk.DeviceAdminReceiver
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

            server = KioskHttpServer(
                port = port,
                apiKey = if (apiKey.isNullOrEmpty()) null else apiKey,
                allowControl = allowControl,
                statusProvider = { getDeviceStatus() },
                commandHandler = { command, params -> handleCommand(command, params) },
                screenshotProvider = { captureScreenshot() }
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
            val isScreenOn = powerManager.isInteractive
            put("on", isScreenOn)
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
            put("version", "1.2.3")
            put("isDeviceOwner", false)
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
        
        return JSONObject().apply {
            put("level", percentage)
            put("charging", isCharging)
            put("plugged", pluggedType)
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
                val activity = reactContext.currentActivity
                if (activity != null) {
                    val powerManager = reactContext.getSystemService(Context.POWER_SERVICE) as PowerManager
                    
                    // Release old wakeLock if exists
                    wakeLock?.release()
                    
                    // Create WakeLock to turn on screen
                    @Suppress("DEPRECATION")
                    wakeLock = powerManager.newWakeLock(
                        PowerManager.FULL_WAKE_LOCK or 
                        PowerManager.ACQUIRE_CAUSES_WAKEUP or 
                        PowerManager.ON_AFTER_RELEASE,
                        "FreeKiosk:HttpScreenOn"
                    )
                    wakeLock?.acquire(10*60*1000L) // 10 minutes timeout
                    
                    // Re-enable FLAG_KEEP_SCREEN_ON
                    activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                    
                    // Set screen to normal brightness (-1 = use system default)
                    val layoutParams = activity.window.attributes
                    layoutParams.screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
                    activity.window.attributes = layoutParams
                    
                    Log.d(TAG, "Screen turned ON via HTTP API")
                }
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

    // ==================== Screenshot Method ====================

    private fun captureScreenshot(): java.io.InputStream? {
        return try {
            var screenshot: ByteArrayInputStream? = null
            
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
                }
            }
            
            // Wait a bit for UI thread to complete
            Thread.sleep(100)
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
            sensorManager?.unregisterListener(this)
            Log.d(TAG, "HttpServerModule cleaned up")
        } catch (e: Exception) {
            Log.e(TAG, "Error during cleanup: ${e.message}")
        }
    }
}
