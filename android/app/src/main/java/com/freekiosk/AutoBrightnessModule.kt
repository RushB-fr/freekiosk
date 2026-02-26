package com.freekiosk

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.provider.Settings
import android.util.Log
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
     */
    @ReactMethod
    fun startAutoBrightness(minBrightness: Double, maxBrightness: Double, updateInterval: Int, promise: Promise) {
        try {
            // Update parameters (even if already active)
            this.minBrightness = minBrightness.toFloat().coerceIn(0f, 1f)
            this.maxBrightness = maxBrightness.toFloat().coerceIn(0f, 1f)
            this.updateInterval = updateInterval.coerceIn(100, 10000)
            
            // Ensure min <= max
            if (this.minBrightness > this.maxBrightness) {
                val temp = this.minBrightness
                this.minBrightness = this.maxBrightness
                this.maxBrightness = temp
            }
            
            // If already active, just update parameters and return
            if (isActive) {
                Log.d(TAG, "Auto-brightness parameters updated: min=${this.minBrightness}, max=${this.maxBrightness}")
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

            Log.i(TAG, "Auto-brightness started: min=$minBrightness, max=$maxBrightness, interval=$updateInterval")
            
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

    /**
     * Update auto-brightness parameters without stopping
     */
    @ReactMethod
    fun updateParameters(minBrightness: Double, maxBrightness: Double, updateInterval: Int, promise: Promise) {
        try {
            this.minBrightness = minBrightness.toFloat().coerceIn(0f, 1f)
            this.maxBrightness = maxBrightness.toFloat().coerceIn(0f, 1f)
            this.updateInterval = updateInterval.coerceIn(100, 10000)
            
            // Ensure min <= max
            if (this.minBrightness > this.maxBrightness) {
                val temp = this.minBrightness
                this.minBrightness = this.maxBrightness
                this.maxBrightness = temp
            }

            Log.i(TAG, "Parameters updated: min=$minBrightness, max=$maxBrightness, interval=$updateInterval")
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

        // Calculate target brightness using logarithmic curve
        val targetBrightness = calculateBrightness(currentLightLevel)
        
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
