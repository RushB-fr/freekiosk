package com.freekiosk.mqtt

import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

class MqttDiscovery(
    private val deviceId: String,
    private val baseTopic: String,
    private val discoveryPrefix: String,
    private val appVersion: String
) {

    private val stateTopic = "$baseTopic/$deviceId/state"
    private val availabilityTopic = "$baseTopic/$deviceId/availability"

    private fun buildDeviceBlock(): JSONObject {
        return JSONObject().apply {
            put("identifiers", JSONArray().put("freekiosk_$deviceId"))
            put("name", "FreeKiosk $deviceId")
            put("model", "FreeKiosk")
            put("manufacturer", "FreeKiosk")
            put("sw_version", appVersion)
            put("configuration_url", "http://$deviceId:8080")
        }
    }

    private fun discoveryTopic(component: String, objectId: String): String {
        return "$discoveryPrefix/$component/freekiosk_$deviceId/$objectId/config"
    }

    private fun baseConfig(objectId: String, name: String): JSONObject {
        return JSONObject().apply {
            put("unique_id", "freekiosk_${deviceId}_$objectId")
            put("object_id", "freekiosk_${deviceId}_$objectId")
            put("name", name)
            put("state_topic", stateTopic)
            put("availability_topic", availabilityTopic)
            put("device", buildDeviceBlock())
        }
    }

    fun getDiscoveryConfigs(): List<Pair<String, JSONObject>> {
        val configs = mutableListOf<Pair<String, JSONObject>>()

        configs.addAll(buildSensorConfigs())
        configs.addAll(buildBinarySensorConfigs())
        configs.addAll(buildNumberConfigs())
        configs.addAll(buildSwitchConfigs())
        configs.addAll(buildButtonConfigs())
        configs.addAll(buildTextConfigs())

        return configs
    }

    /**
     * Publish all HA Discovery configs to the MQTT broker via the given client.
     * Each config is published as a retained message (QoS 1) so HA picks them up.
     */
    fun publishDiscoveryConfigs(client: KioskMqttClient) {
        val configs = getDiscoveryConfigs()
        Log.i("MqttDiscovery", "Publishing ${configs.size} HA Discovery configs...")
        for ((index, pair) in configs.withIndex()) {
            val (topic, payload) = pair
            client.publish(topic, payload.toString(), qos = 1, retained = true)
            Log.d("MqttDiscovery", "Published discovery config ${index + 1}/${configs.size}: $topic")
        }
        Log.i("MqttDiscovery", "All ${configs.size} HA Discovery configs published")
    }

    private fun buildSensorConfigs(): List<Pair<String, JSONObject>> {
        data class SensorDef(
            val objectId: String,
            val name: String,
            val valueTemplate: String,
            val deviceClass: String?,
            val unit: String?,
            val icon: String
        )

        val sensors = listOf(
            SensorDef("battery_level", "Battery Level", "{{ value_json.battery.level }}", "battery", "%", "mdi:battery"),
            SensorDef("brightness", "Brightness", "{{ value_json.screen.brightness }}", null, "%", "mdi:brightness-6"),
            SensorDef("wifi_ssid", "WiFi SSID", "{{ value_json.wifi.ssid }}", null, null, "mdi:wifi"),
            SensorDef("wifi_signal", "WiFi Signal", "{{ value_json.wifi.signalLevel }}", null, "%", "mdi:wifi-strength-3"),
            SensorDef("light_sensor", "Light Sensor", "{{ value_json.sensors.light }}", "illuminance", "lx", "mdi:weather-sunny"),
            SensorDef("ip_address", "IP Address", "{{ value_json.device.ip }}", null, null, "mdi:ip-network"),
            SensorDef("app_version", "App Version", "{{ value_json.device.version }}", null, null, "mdi:information"),
            SensorDef("memory_used", "Memory Used", "{{ value_json.memory.usedPercent }}", null, "%", "mdi:memory"),
            SensorDef("storage_free", "Storage Free", "{{ value_json.storage.availableMB }}", null, "MB", "mdi:harddisk"),
            SensorDef("current_url", "Current URL", "{{ value_json.webview.currentUrl }}", null, null, "mdi:web"),
            SensorDef("volume", "Volume", "{{ value_json.audio.volume }}", null, "%", "mdi:volume-high")
        )

        return sensors.map { sensor ->
            val config = baseConfig(sensor.objectId, sensor.name).apply {
                put("value_template", sensor.valueTemplate)
                put("icon", sensor.icon)
                sensor.deviceClass?.let { put("device_class", it) }
                sensor.unit?.let { put("unit_of_measurement", it) }
            }
            Pair(discoveryTopic("sensor", sensor.objectId), config)
        }
    }

    private fun buildBinarySensorConfigs(): List<Pair<String, JSONObject>> {
        data class BinarySensorDef(
            val objectId: String,
            val name: String,
            val valueTemplate: String,
            val deviceClass: String?,
            val payloadOn: String,
            val payloadOff: String
        )

        val binarySensors = listOf(
            BinarySensorDef("screen_on", "Screen", "{{ value_json.screen.on | lower }}", "power", "true", "false"),
            BinarySensorDef("screensaver_active", "Screensaver", "{{ value_json.screen.screensaverActive | lower }}", null, "true", "false"),
            BinarySensorDef("battery_charging", "Battery Charging", "{{ value_json.battery.charging | lower }}", "battery_charging", "true", "false"),
            BinarySensorDef("kiosk_mode", "Kiosk Mode", "{{ value_json.device.kioskMode | lower }}", null, "true", "false"),
            BinarySensorDef("device_owner", "Device Owner", "{{ value_json.device.isDeviceOwner | lower }}", null, "true", "false"),
            BinarySensorDef("motion_detected", "Motion", "{{ value_json.webview.motionDetected | lower }}", "motion", "true", "false")
        )

        return binarySensors.map { sensor ->
            val config = baseConfig(sensor.objectId, sensor.name).apply {
                put("value_template", sensor.valueTemplate)
                put("payload_on", sensor.payloadOn)
                put("payload_off", sensor.payloadOff)
                sensor.deviceClass?.let { put("device_class", it) }
            }
            Pair(discoveryTopic("binary_sensor", sensor.objectId), config)
        }
    }

    private fun buildNumberConfigs(): List<Pair<String, JSONObject>> {
        data class NumberDef(
            val objectId: String,
            val name: String,
            val commandTopic: String,
            val valueTemplate: String,
            val min: Int,
            val max: Int,
            val step: Int,
            val unit: String,
            val icon: String
        )

        val numbers = listOf(
            NumberDef(
                "brightness_control", "Brightness Control",
                "$baseTopic/$deviceId/set/brightness",
                "{{ value_json.screen.brightness }}",
                0, 100, 1, "%", "mdi:brightness-6"
            ),
            NumberDef(
                "volume_control", "Volume Control",
                "$baseTopic/$deviceId/set/volume",
                "{{ value_json.audio.volume }}",
                0, 100, 1, "%", "mdi:volume-high"
            )
        )

        return numbers.map { number ->
            val config = baseConfig(number.objectId, number.name).apply {
                put("command_topic", number.commandTopic)
                put("value_template", number.valueTemplate)
                put("min", number.min)
                put("max", number.max)
                put("step", number.step)
                put("unit_of_measurement", number.unit)
                put("icon", number.icon)
            }
            Pair(discoveryTopic("number", number.objectId), config)
        }
    }

    private fun buildSwitchConfigs(): List<Pair<String, JSONObject>> {
        data class SwitchDef(
            val objectId: String,
            val name: String,
            val commandTopic: String,
            val valueTemplate: String,
            val icon: String
        )

        val switches = listOf(
            SwitchDef(
                "screen_power", "Screen Power",
                "$baseTopic/$deviceId/set/screen",
                "{% if value_json.screen.on %}ON{% else %}OFF{% endif %}",
                "mdi:monitor"
            ),
            SwitchDef(
                "screensaver", "Screensaver",
                "$baseTopic/$deviceId/set/screensaver",
                "{% if value_json.screen.screensaverActive %}ON{% else %}OFF{% endif %}",
                "mdi:sleep"
            )
        )

        return switches.map { switch ->
            val config = baseConfig(switch.objectId, switch.name).apply {
                put("command_topic", switch.commandTopic)
                put("value_template", switch.valueTemplate)
                put("state_on", "ON")
                put("state_off", "OFF")
                put("payload_on", "ON")
                put("payload_off", "OFF")
                put("icon", switch.icon)
            }
            Pair(discoveryTopic("switch", switch.objectId), config)
        }
    }

    private fun buildButtonConfigs(): List<Pair<String, JSONObject>> {
        data class ButtonDef(
            val objectId: String,
            val name: String,
            val commandTopic: String,
            val icon: String
        )

        val buttons = listOf(
            ButtonDef("reload", "Reload", "$baseTopic/$deviceId/set/reload", "mdi:reload"),
            ButtonDef("wake", "Wake", "$baseTopic/$deviceId/set/wake", "mdi:alarm"),
            ButtonDef("reboot", "Reboot", "$baseTopic/$deviceId/set/reboot", "mdi:restart"),
            ButtonDef("clear_cache", "Clear Cache", "$baseTopic/$deviceId/set/clear_cache", "mdi:delete-sweep"),
            ButtonDef("lock", "Lock", "$baseTopic/$deviceId/set/lock", "mdi:lock")
        )

        return buttons.map { button ->
            val config = baseConfig(button.objectId, button.name).apply {
                put("command_topic", button.commandTopic)
                put("payload_press", "PRESS")
                put("icon", button.icon)
            }
            Pair(discoveryTopic("button", button.objectId), config)
        }
    }

    private fun buildTextConfigs(): List<Pair<String, JSONObject>> {
        data class TextDef(
            val objectId: String,
            val name: String,
            val commandTopic: String,
            val icon: String
        )

        val texts = listOf(
            TextDef("navigate_url", "Navigate URL", "$baseTopic/$deviceId/set/url", "mdi:web")
        )

        return texts.map { text ->
            val config = baseConfig(text.objectId, text.name).apply {
                put("command_topic", text.commandTopic)
                put("icon", text.icon)
            }
            Pair(discoveryTopic("text", text.objectId), config)
        }
    }
}
