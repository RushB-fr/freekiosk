package com.freekiosk

import android.content.Context
import android.content.Intent
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.net.Uri
import android.provider.Settings
import android.util.Log
import android.view.WindowManager
import com.facebook.react.bridge.*
import kotlin.math.abs
import kotlin.math.log10

/**
 * AutoBrightnessModule - Adjusts screen brightness based on ambient light sensor
 * 
 * Features:
 * - Real-time brightness adjustment using light sensor (lux)
 * - Configurable min/max brightness range
 * - Logarithmic curve for natural human perception
 * - Throttling to prevent flickering
 * - Battery-efficient sensor management
 */
class AutoBrightnessModule(private val reactContext: ReactApplicationContext) : 
    ReactContextBaseJavaModule(reactContext), SensorEventListener {

    companion object {
        private const val TAG = "AutoBrightnessModule"
        private const val NAME = "AutoBrightnessModule"
        
        // Lux thresholds for brightness mapping
        private const val LUX_MIN = 10f      // Dark environment
        private const val LUX_MAX = 1000f    // Bright environment
        
        // Throttling: minimum change required to update brightness (prevents flickering)
        private const val BRIGHTNESS_CHANGE_THRESHOLD = 0.05f // 5%
        
        // Smoothing factor for gradual transitions (0.0 = instant, 1.0 = no change)
        private const val SMOOTHING_FACTOR = 0.3f
    }

    private var sensorManager: SensorManager? = null
    private var lightSensor: Sensor? = null
    
    private var isActive = false
    private var minBrightness = 0.1f  // 10%
    private var maxBrightness = 1.0f  // 100%
    private var brightnessOffset = 0.0f // Offset added to calculated brightness
    private var updateInterval = 1000 // ms
    
    private var lastBrightnessValue = -1f
    private var currentLightLevel = 0f
    private var smoothedBrightness = -1f
    
    private var lastUpdateTime = 0L

    override fun getName(): String = NAME

    /**
     * Start auto-brightness with configurable parameters
     * 
     * @param minBrightness Minimum brightness (0.0-1.0) for dark conditions
     * @param maxBrightness Maximum brightness (0.0-1.0) for bright conditions
     * @param updateInterval Milliseconds between updates (for battery optimization)
     * @param brightnessOffset Offset added to calculated brightness (0.0-1.0), e.g. 0.1 = +10%
     */
    @ReactMethod
    fun startAutoBrightness(minBrightness: Double, maxBrightness: Double, updateInterval: Int, brightnessOffset: Double, promise: Promise) {
        try {
            // Update parameters (even if already active)
            this.minBrightness = minBrightness.toFloat().coerceIn(0f, 1f)
            this.maxBrightness = maxBrightness.toFloat().coerceIn(0f, 1f)
            this.brightnessOffset = brightnessOffset.toFloat().coerceIn(0f, 1f)
            this.updateInterval = updateInterval.coerceIn(100, 10000)
            
            // Ensure min <= max
            if (this.minBrightness > this.maxBrightness) {
                val temp = this.minBrightness
                this.minBrightness = this.maxBrightness
                this.maxBrightness = temp
            }
            
            // If already active, just update parameters and return
            if (isActive) {
                Log.d(TAG, "Auto-brightness parameters updated: min=${this.minBrightness}, max=${this.maxBrightness}, offset=${this.brightnessOffset}")
                promise.resolve(createResultMap(true, "Auto-brightness parameters updated"))
                return
            }

            // Initialize sensor
            sensorManager = reactContext.getSystemService(Context.SENSOR_SERVICE) as SensorManager
            lightSensor = sensorManager?.getDefaultSensor(Sensor.TYPE_LIGHT)

            if (lightSensor == null) {
                promise.reject("SENSOR_UNAVAILABLE", "Light sensor not available on this device")
                return
            }

            // Register listener with normal delay (battery-efficient)
            sensorManager?.registerListener(
                this, 
                lightSensor, 
                SensorManager.SENSOR_DELAY_NORMAL
            )

            isActive = true
            lastBrightnessValue = -1f
            smoothedBrightness = -1f
            lastUpdateTime = System.currentTimeMillis()

            Log.i(TAG, "Auto-brightness started: min=$minBrightness, max=$maxBrightness, offset=$brightnessOffset, interval=$updateInterval")
            
            promise.resolve(createResultMap(true, "Auto-brightness started"))
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start auto-brightness", e)
            promise.reject("START_FAILED", "Failed to start auto-brightness: ${e.message}")
        }
    }

    /**
     * Stop auto-brightness and unregister sensor listener
     */
    @ReactMethod
    fun stopAutoBrightness(promise: Promise) {
        try {
            if (!isActive) {
                promise.resolve(createResultMap(true, "Auto-brightness already stopped"))
                return
            }

            sensorManager?.unregisterListener(this)
            isActive = false
            
            Log.i(TAG, "Auto-brightness stopped")
            promise.resolve(createResultMap(true, "Auto-brightness stopped"))
        } catch (e: Exception) {
            Log.e(TAG, "Failed to stop auto-brightness", e)
            promise.reject("STOP_FAILED", "Failed to stop auto-brightness: ${e.message}")
        }
    }

    /**
     * Check if auto-brightness is currently active
     */
    @ReactMethod
    fun isAutoBrightnessActive(promise: Promise) {
        val result = Arguments.createMap().apply {
            putBoolean("active", isActive)
            putDouble("currentLightLevel", currentLightLevel.toDouble())
            putDouble("currentBrightness", (lastBrightnessValue * 100).toDouble())
            putDouble("minBrightness", (minBrightness * 100).toDouble())
            putDouble("maxBrightness", (maxBrightness * 100).toDouble())
            putDouble("brightnessOffset", (brightnessOffset * 100).toDouble())
        }
        promise.resolve(result)
    }

    /**
     * Get current light level from sensor (in lux)
     */
    @ReactMethod
    fun getCurrentLightLevel(promise: Promise) {
        val result = Arguments.createMap().apply {
            putDouble("lux", currentLightLevel.toDouble())
            putBoolean("sensorAvailable", lightSensor != null)
        }
        promise.resolve(result)
    }

    @ReactMethod
    fun setBrightnessLevel(brightnessLevel: Double, promise: Promise) {
        try {
            val normalized = brightnessLevel.toFloat().coerceIn(0.0f, 1.0f)
            applyBrightness(normalized)
            lastBrightnessValue = normalized
            promise.resolve(null)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to set brightness level", e)
            promise.reject("SET_BRIGHTNESS_FAILED", "Failed to set brightness level: ${e.message}")
        }
    }

    @ReactMethod
    fun getBrightnessLevel(promise: Promise) {
        try {
            // #242: report what the panel is actually running at, not what we last
            // asked for. The old fallback to lastBrightnessValue is exactly what hid the
            // mismatch: after a wake blanked the window override, this returned the
            // requested 80% while the panel sat at the system value of 14/255.
            val activity = reactContext.currentActivity
            if (activity == null) {
                promise.resolve(effectiveLevel(WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE).toDouble())
                return
            }

            val override = activity.window.attributes.screenBrightness
            promise.resolve(effectiveLevel(override).toDouble())
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get brightness level", e)
            promise.reject("GET_BRIGHTNESS_FAILED", "Failed to get brightness level: ${e.message}")
        }
    }

    /**
     * Update auto-brightness parameters without stopping
     */
    @ReactMethod
    fun updateParameters(minBrightness: Double, maxBrightness: Double, updateInterval: Int, brightnessOffset: Double, promise: Promise) {
        try {
            this.minBrightness = minBrightness.toFloat().coerceIn(0f, 1f)
            this.maxBrightness = maxBrightness.toFloat().coerceIn(0f, 1f)
            this.brightnessOffset = brightnessOffset.toFloat().coerceIn(0f, 1f)
            this.updateInterval = updateInterval.coerceIn(100, 10000)
            
            // Ensure min <= max
            if (this.minBrightness > this.maxBrightness) {
                val temp = this.minBrightness
                this.minBrightness = this.maxBrightness
                this.maxBrightness = temp
            }

            Log.i(TAG, "Parameters updated: min=$minBrightness, max=$maxBrightness, offset=$brightnessOffset, interval=$updateInterval")
            promise.resolve(createResultMap(true, "Parameters updated"))
        } catch (e: Exception) {
            promise.reject("UPDATE_FAILED", "Failed to update parameters: ${e.message}")
        }
    }

    /**
     * Check if device has a light sensor
     */
    @ReactMethod
    fun hasLightSensor(promise: Promise) {
        val sensorMgr = reactContext.getSystemService(Context.SENSOR_SERVICE) as SensorManager
        val sensor = sensorMgr.getDefaultSensor(Sensor.TYPE_LIGHT)
        promise.resolve(sensor != null)
    }

    /**
     * Set the level FreeKiosk should hold, as opposed to a transient one (#242).
     *
     * setBrightnessLevel() is also how the light sensor and the screensaver drive the
     * panel, so it cannot persist anything: it would store the screensaver's 0 as the
     * user's chosen default. This is the deliberate-intent entry point, called from the
     * brightness dialog, the settings screen and the REST/MQTT/cloud setBrightness
     * action.
     *
     * Resolves with systemWrite = whether Settings.System could be updated. false is
     * not a failure: the window override still applies, it just will not survive a
     * reboot on a device with neither Device Owner nor WRITE_SETTINGS.
     */
    @ReactMethod
    fun setDefaultBrightness(brightnessLevel: Double, promise: Promise) {
        try {
            val normalized = brightnessLevel.toFloat().coerceIn(0.0f, 1.0f)
            applyBrightness(normalized)
            lastBrightnessValue = normalized
            BrightnessPrefs.store(reactContext, normalized)
            val systemWrite = BrightnessPrefs.writeSystem(reactContext, normalized)
            val result = Arguments.createMap().apply {
                putBoolean("success", true)
                putDouble("level", normalized.toDouble())
                putBoolean("systemWrite", systemWrite)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to set default brightness", e)
            promise.reject("SET_DEFAULT_BRIGHTNESS_FAILED", "Failed to set default brightness: ${e.message}")
        }
    }

    /**
     * Whether the requested brightness can be written to Settings.System, and so
     * survive a reboot. True as Device Owner on API 28+, or once WRITE_SETTINGS has
     * been granted.
     */
    @ReactMethod
    fun canWriteSystemBrightness(promise: Promise) {
        promise.resolve(BrightnessPrefs.canWriteSystem(reactContext))
    }

    /**
     * Open the WRITE_SETTINGS grant screen. Only relevant without Device Owner: this
     * permission cannot be granted programmatically, the user has to toggle it. Play
     * Store builds strip WRITE_SETTINGS from the manifest, so this resolves false there.
     */
    @ReactMethod
    fun requestWriteSystemBrightnessAccess(promise: Promise) {
        try {
            if (BrightnessPrefs.canWriteSystem(reactContext)) {
                promise.resolve(true)
                return
            }
            val intent = Intent(
                Settings.ACTION_MANAGE_WRITE_SETTINGS,
                Uri.parse("package:${reactContext.packageName}")
            ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
            reactContext.startActivity(intent)
            promise.resolve(false)
        } catch (e: Exception) {
            Log.w(TAG, "Could not open the WRITE_SETTINGS screen: ${e.message}")
            promise.resolve(false)
        }
    }

    /**
     * The level actually in effect: the window override when one is set, otherwise the
     * system value the panel is really using, and only then a fallback.
     */
    private fun effectiveLevel(windowOverride: Float): Float {
        if (windowOverride >= 0f) return windowOverride
        val system = BrightnessPrefs.systemLevel(reactContext)
        if (system != BrightnessPrefs.UNSET) return system
        val stored = BrightnessPrefs.stored(reactContext)
        if (stored != BrightnessPrefs.UNSET) return stored
        return 0.5f
    }

    /**
     * Reset screen brightness to system default (BRIGHTNESS_OVERRIDE_NONE)
     * This tells Android to use the system brightness setting instead of an app-override.
     */
    @ReactMethod
    fun resetToSystemBrightness(promise: Promise) {
        try {
            val activity = reactContext.currentActivity
            if (activity == null) {
                promise.resolve(createResultMap(false, "No activity"))
                return
            }
            activity.runOnUiThread {
                try {
                    val window = activity.window
                    // #242: forget the stored level too. Without this the wake paths
                    // would keep re-applying it, which is precisely what the user opted
                    // out of by disabling brightness management (#65).
                    BrightnessPrefs.clear(reactContext)
                    val layoutParams = window.attributes
                    layoutParams.screenBrightness = android.view.WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
                    window.attributes = layoutParams
                    promise.resolve(createResultMap(true, "Reset to system brightness"))
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to reset brightness", e)
                    promise.resolve(createResultMap(false, e.message ?: "Unknown error"))
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to reset brightness", e)
            promise.resolve(createResultMap(false, e.message ?: "Unknown error"))
        }
    }

    // SensorEventListener implementation
    override fun onSensorChanged(event: SensorEvent) {
        if (!isActive || event.sensor.type != Sensor.TYPE_LIGHT) return

        currentLightLevel = event.values[0]
        
        // Throttle updates based on interval
        val currentTime = System.currentTimeMillis()
        if (currentTime - lastUpdateTime < updateInterval) {
            return
        }
        lastUpdateTime = currentTime

        // Calculate target brightness using logarithmic curve, then apply offset
        val targetBrightness = (calculateBrightness(currentLightLevel) + brightnessOffset).coerceIn(0.01f, 1f)
        
        // Apply smoothing for gradual transitions
        val newBrightness = if (smoothedBrightness < 0) {
            targetBrightness
        } else {
            smoothedBrightness + (targetBrightness - smoothedBrightness) * (1 - SMOOTHING_FACTOR)
        }
        smoothedBrightness = newBrightness

        // Only update if change is significant (prevents flickering)
        if (lastBrightnessValue >= 0 && abs(newBrightness - lastBrightnessValue) < BRIGHTNESS_CHANGE_THRESHOLD) {
            return
        }

        // Apply brightness
        applyBrightness(newBrightness)
        lastBrightnessValue = newBrightness

        Log.d(TAG, "Brightness updated: lux=$currentLightLevel, brightness=${(newBrightness * 100).toInt()}%")
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
        // Not needed for light sensor
    }

    /**
     * Calculate brightness using logarithmic curve
     * Human perception of light is logarithmic, so we use log scale for natural feel
     */
    private fun calculateBrightness(lux: Float): Float {
        return when {
            lux <= LUX_MIN -> minBrightness
            lux >= LUX_MAX -> maxBrightness
            else -> {
                // Logarithmic interpolation between min and max
                val logLux = log10(lux.toDouble())
                val logMin = log10(LUX_MIN.toDouble())
                val logMax = log10(LUX_MAX.toDouble())
                val ratio = ((logLux - logMin) / (logMax - logMin)).toFloat()
                minBrightness + (maxBrightness - minBrightness) * ratio
            }
        }.coerceIn(minBrightness, maxBrightness)
    }

    /**
     * Apply brightness to screen using Settings API
     */
    private fun applyBrightness(brightness: Float) {
        try {
            val activity = reactContext.currentActivity ?: return
            
            activity.runOnUiThread {
                try {
                    val window = activity.window
                    val layoutParams = window.attributes
                    layoutParams.screenBrightness = brightness.coerceIn(0.01f, 1f)
                    window.attributes = layoutParams
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to apply brightness", e)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to apply brightness", e)
        }
    }

    private fun createResultMap(success: Boolean, message: String): WritableMap {
        return Arguments.createMap().apply {
            putBoolean("success", success)
            putString("message", message)
        }
    }

    // Lifecycle management
    fun onHostResume() {
        if (isActive && lightSensor != null) {
            sensorManager?.registerListener(this, lightSensor, SensorManager.SENSOR_DELAY_NORMAL)
            Log.d(TAG, "Sensor listener re-registered on resume")
        }
    }

    fun onHostPause() {
        if (isActive) {
            sensorManager?.unregisterListener(this)
            Log.d(TAG, "Sensor listener unregistered on pause")
        }
    }

    fun onHostDestroy() {
        sensorManager?.unregisterListener(this)
        isActive = false
        Log.d(TAG, "Auto-brightness module destroyed")
    }
}
