package com.freekiosk

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Hardware proximity-sensor wake trigger for the screensaver.
 *
 * Unlike camera-based motion detection (noisy, sensitive to any lighting/scene change),
 * the proximity sensor is a binary near/far hardware sensor. It is very short range on
 * tablets (typically 0-5 cm), so it acts as a deliberate "wave a hand in front of the
 * screen to wake" gesture with virtually no false positives and near-zero battery cost.
 *
 * Emits a `proximityNear` DeviceEventEmitter event on each far -> near transition (edge
 * triggered, so holding a hand in front does not spam events).
 */
class ProximityDetectionModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), SensorEventListener {

    private val sensorManager: SensorManager? =
        reactContext.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
    private val proximitySensor: Sensor? =
        sensorManager?.getDefaultSensor(Sensor.TYPE_PROXIMITY)

    private var isListening = false
    // Track last state so we only fire on a far -> near transition (edge trigger).
    private var wasNear = false

    override fun getName(): String = "ProximityDetectionModule"

    @ReactMethod
    fun isAvailable(promise: Promise) {
        promise.resolve(proximitySensor != null)
    }

    @ReactMethod
    fun start(promise: Promise) {
        if (proximitySensor == null || sensorManager == null) {
            promise.resolve(false)
            return
        }
        if (isListening) {
            promise.resolve(true)
            return
        }
        try {
            wasNear = false
            val ok = sensorManager.registerListener(
                this,
                proximitySensor,
                SensorManager.SENSOR_DELAY_NORMAL
            )
            isListening = ok
            promise.resolve(ok)
        } catch (e: Exception) {
            android.util.Log.e("ProximityDetection", "start failed: ${e.message}")
            promise.reject("START_ERROR", e.message)
        }
    }

    @ReactMethod
    fun stop(promise: Promise) {
        try {
            if (isListening && sensorManager != null) {
                sensorManager.unregisterListener(this)
            }
            isListening = false
            wasNear = false
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STOP_ERROR", e.message)
        }
    }

    // Required for NativeEventEmitter on the JS side; no-op counters.
    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    override fun onSensorChanged(event: SensorEvent) {
        val sensor = proximitySensor ?: return
        val distance = event.values[0]
        // Most sensors report either 0 (near) or maximumRange (far); some report a
        // graded distance. Treat anything below the max range as "near".
        val near = distance < sensor.maximumRange

        if (near && !wasNear) {
            emitProximityNear()
        }
        wasNear = near
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    private fun emitProximityNear() {
        try {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("proximityNear", null)
        } catch (e: Exception) {
            android.util.Log.e("ProximityDetection", "emit failed: ${e.message}")
        }
    }

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        try {
            if (isListening) sensorManager?.unregisterListener(this)
        } catch (_: Exception) {}
        isListening = false
    }
}
