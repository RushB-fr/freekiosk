package com.freekiosk

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager

/**
 * Light, proximity and accelerometer readings for the REST and MQTT status. Listens only
 * between start() and stop(): HttpServerModule and MqttModule each registered all three at
 * construction, so six listeners kept waking the CPU all day with REST and MQTT off.
 */
class StatusSensors(context: Context) : SensorEventListener {
    private val manager = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
    private var listening = false

    @Volatile var light = -1f
        private set
    @Volatile var proximity = -1f
        private set
    @Volatile var accelX = 0f
        private set
    @Volatile var accelY = 0f
        private set
    @Volatile var accelZ = 0f
        private set

    @Synchronized
    fun start() {
        if (listening || manager == null) return
        for (type in intArrayOf(Sensor.TYPE_LIGHT, Sensor.TYPE_PROXIMITY, Sensor.TYPE_ACCELEROMETER)) {
            manager.getDefaultSensor(type)?.let {
                manager.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL)
            }
        }
        listening = true
    }

    @Synchronized
    fun stop() {
        if (!listening) return
        manager?.unregisterListener(this)
        listening = false
    }

    override fun onSensorChanged(event: SensorEvent) {
        when (event.sensor.type) {
            Sensor.TYPE_LIGHT -> light = event.values[0]
            Sensor.TYPE_PROXIMITY -> proximity = event.values[0]
            Sensor.TYPE_ACCELEROMETER -> {
                accelX = event.values[0]
                accelY = event.values[1]
                accelZ = event.values[2]
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
}
