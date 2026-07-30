package com.freekiosk.mqtt

import android.os.Build
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

class MqttDiscovery(
    private val deviceId: String,
    private val topicId: String,
    private val baseTopic: String,
    private val discoveryPrefix: String,
    private val appVersion: String,
    private val deviceName: String?
) {

    companion object {
        private const val STREAM_SCREENSHOT = MqttImagePublisher.STREAM_SCREENSHOT
        private const val STREAM_CAMERA_PREFIX = MqttImagePublisher.STREAM_CAMERA
        private const val MIN_IMAGE_INTERVAL = MqttImagePublisher.MIN_INTERVAL_SECONDS
        private const val MAX_IMAGE_INTERVAL = MqttImagePublisher.MAX_INTERVAL_SECONDS
    }

    private val stateTopic = "$baseTopic/$topicId/state"
    private val availabilityTopic = "$baseTopic/$topicId/availability"

    /**
     * An image stream advertised to Home Assistant as an `image` + a `camera` entity,
     * plus a button to capture on demand.
     *
     * @param objectId     stable id, e.g. "screenshot" or "camera_front"
     * @param name         friendly entity name
     * @param imageTopic   topic carrying the raw JPEG payload
     * @param commandTopic topic used by the capture button
     * @param icon         mdi icon
     */
    data class ImageStream(
        val objectId: String,
        val name: String,
        val imageTopic: String,
        val commandTopic: String,
        val icon: String
    )

    /**
     * Image streams to advertise. Set by MqttModule from the user settings and the cameras
     * actually present on the device; empty when image publishing is disabled.
     */
    var imageStreams: List<ImageStream> = emptyList()

    private fun buildDeviceBlock(localIp: String): JSONObject {
        val displayName = deviceName?.takeIf { it.isNotBlank() } ?: "FreeKiosk $topicId"
        return JSONObject().apply {
            put("identifiers", JSONArray().put("freekiosk_$deviceId"))
            put("name", displayName)
            put("model", "${Build.MODEL} (FreeKiosk)")
            put("manufacturer", Build.MANUFACTURER.replaceFirstChar { it.uppercase() })
            put("sw_version", appVersion)
            put("hw_version", "Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})")
            put("configuration_url", "http://$localIp:8080")
        }
    }

    private fun discoveryTopic(component: String, objectId: String): String {
        return "$discoveryPrefix/$component/freekiosk_$deviceId/$objectId/config"
    }

    /**
     * Common config keys shared by every entity. Kept separate from [baseConfig] because the
     * `image` and `camera` MQTT platforms do not accept `state_topic` — Home Assistant rejects
     * the whole discovery payload when an unsupported key is present.
     */
    private fun commonConfig(objectId: String, name: String, localIp: String): JSONObject {
        return JSONObject().apply {
            put("unique_id", "freekiosk_${deviceId}_$objectId")
            put("object_id", "freekiosk_${deviceId}_$objectId")
            put("name", name)
            put("availability_topic", availabilityTopic)
            put("device", buildDeviceBlock(localIp))
        }
    }

    private fun baseConfig(objectId: String, name: String, localIp: String): JSONObject {
        return commonConfig(objectId, name, localIp).apply {
            put("state_topic", stateTopic)
        }
    }

    fun getDiscoveryConfigs(localIp: String): List<Pair<String, JSONObject>> {
        val configs = mutableListOf<Pair<String, JSONObject>>()

        configs.addAll(buildSensorConfigs(localIp))
        configs.addAll(buildBinarySensorConfigs(localIp))
        configs.addAll(buildNumberConfigs(localIp))
        configs.addAll(buildSwitchConfigs(localIp))
        configs.addAll(buildButtonConfigs(localIp))
        configs.addAll(buildTextConfigs(localIp))
        configs.addAll(buildImageConfigs(localIp))

        return configs
    }

    /**
     * Publish all HA Discovery configs to the MQTT broker via the given client.
     * Each config is published as a retained message (QoS 1) so HA picks them up.
     */
    fun publishDiscoveryConfigs(client: KioskMqttClient, localIp: String) {
        val configs = getDiscoveryConfigs(localIp)
        Log.i("MqttDiscovery", "Publishing ${configs.size} HA Discovery configs...")
        for ((index, pair) in configs.withIndex()) {
            val (topic, payload) = pair
            client.publish(topic, payload.toString(), qos = 1, retained = true)
            Log.d("MqttDiscovery", "Published discovery config ${index + 1}/${configs.size}: $topic")
        }
        Log.i("MqttDiscovery", "All ${configs.size} HA Discovery configs published")
    }

    private fun buildSensorConfigs(localIp: String): List<Pair<String, JSONObject>> {
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
            SensorDef("volume", "Volume", "{{ value_json.audio.volume }}", null, "%", "mdi:volume-high"),
            SensorDef("device_manufacturer", "Manufacturer", "{{ value_json.device.manufacturer }}", null, null, "mdi:domain"),
            SensorDef("device_model", "Model", "{{ value_json.device.model }}", null, null, "mdi:cellphone"),
            SensorDef("android_version", "Android Version", "{{ value_json.device.androidVersion }}", null, null, "mdi:android"),
            SensorDef("processor", "Processor", "{{ value_json.device.processor }}", null, null, "mdi:chip"),
            SensorDef("uptime", "Uptime", "{{ value_json.device.uptime }}", "duration", "s", "mdi:timer-outline")
        )

        return sensors.map { sensor ->
            val config = baseConfig(sensor.objectId, sensor.name, localIp).apply {
                put("value_template", sensor.valueTemplate)
                put("icon", sensor.icon)
                sensor.deviceClass?.let { put("device_class", it) }
                sensor.unit?.let { put("unit_of_measurement", it) }
            }
            Pair(discoveryTopic("sensor", sensor.objectId), config)
        }
    }

    private fun buildBinarySensorConfigs(localIp: String): List<Pair<String, JSONObject>> {
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
            val config = baseConfig(sensor.objectId, sensor.name, localIp).apply {
                put("value_template", sensor.valueTemplate)
                put("payload_on", sensor.payloadOn)
                put("payload_off", sensor.payloadOff)
                sensor.deviceClass?.let { put("device_class", it) }
            }
            Pair(discoveryTopic("binary_sensor", sensor.objectId), config)
        }
    }

    private fun buildNumberConfigs(localIp: String): List<Pair<String, JSONObject>> {
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

        val numbers = mutableListOf(
            NumberDef(
                "brightness_control", "Brightness Control",
                "$baseTopic/$topicId/set/brightness",
                "{{ value_json.screen.brightness }}",
                0, 100, 1, "%", "mdi:brightness-6"
            ),
            NumberDef(
                "volume_control", "Volume Control",
                "$baseTopic/$topicId/set/volume",
                "{{ value_json.audio.volume }}",
                0, 100, 1, "%", "mdi:volume-high"
            )
        )

        // Auto-publish interval for the enabled image streams
        if (hasScreenshotStream()) {
            numbers.add(
                NumberDef(
                    "${STREAM_SCREENSHOT}_interval", "Screenshot Interval",
                    "$baseTopic/$topicId/set/${STREAM_SCREENSHOT}_interval",
                    "{{ value_json.images.screenshotInterval }}",
                    MIN_IMAGE_INTERVAL, MAX_IMAGE_INTERVAL, 5, "s", "mdi:timer-outline"
                )
            )
        }
        if (hasCameraStream()) {
            numbers.add(
                NumberDef(
                    "camera_interval", "Camera Interval",
                    "$baseTopic/$topicId/set/camera_interval",
                    "{{ value_json.images.cameraInterval }}",
                    MIN_IMAGE_INTERVAL, MAX_IMAGE_INTERVAL, 5, "s", "mdi:timer-outline"
                )
            )
        }

        return numbers.map { number ->
            val config = baseConfig(number.objectId, number.name, localIp).apply {
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

    private fun buildSwitchConfigs(localIp: String): List<Pair<String, JSONObject>> {
        data class SwitchDef(
            val objectId: String,
            val name: String,
            val commandTopic: String,
            val valueTemplate: String,
            val icon: String
        )

        val switches = mutableListOf(
            SwitchDef(
                "screen_power", "Screen Power",
                "$baseTopic/$topicId/set/screen",
                "{% if value_json.screen.on %}ON{% else %}OFF{% endif %}",
                "mdi:monitor"
            ),
            SwitchDef(
                "screensaver", "Screensaver",
                "$baseTopic/$topicId/set/screensaver",
                "{% if value_json.screen.screensaverActive %}ON{% else %}OFF{% endif %}",
                "mdi:sleep"
            ),
            SwitchDef(
                "motion_always_on", "Always-on Motion Detection",
                "$baseTopic/$topicId/set/motion_always_on",
                "{% if value_json.device.motionAlwaysOn %}ON{% else %}OFF{% endif %}",
                "mdi:motion-sensor"
            )
        )

        // Periodic publishing toggles for the enabled image streams
        if (hasScreenshotStream()) {
            switches.add(
                SwitchDef(
                    "${STREAM_SCREENSHOT}_auto", "Screenshot Auto-publish",
                    "$baseTopic/$topicId/set/${STREAM_SCREENSHOT}_auto",
                    "{% if value_json.images.screenshotAuto %}ON{% else %}OFF{% endif %}",
                    "mdi:image-refresh"
                )
            )
        }
        if (hasCameraStream()) {
            switches.add(
                SwitchDef(
                    "camera_auto", "Camera Auto-publish",
                    "$baseTopic/$topicId/set/camera_auto",
                    "{% if value_json.images.cameraAuto %}ON{% else %}OFF{% endif %}",
                    "mdi:camera-retake"
                )
            )
        }

        return switches.map { switch ->
            val config = baseConfig(switch.objectId, switch.name, localIp).apply {
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

    private fun buildButtonConfigs(localIp: String): List<Pair<String, JSONObject>> {
        data class ButtonDef(
            val objectId: String,
            val name: String,
            val commandTopic: String,
            val icon: String
        )

        val buttons = listOf(
            ButtonDef("reload", "Reload", "$baseTopic/$topicId/set/reload", "mdi:reload"),
            ButtonDef("wake", "Wake", "$baseTopic/$topicId/set/wake", "mdi:alarm"),
            ButtonDef("reboot", "Reboot", "$baseTopic/$topicId/set/reboot", "mdi:restart"),
            ButtonDef("clear_cache", "Clear Cache", "$baseTopic/$topicId/set/clear_cache", "mdi:delete-sweep"),
            ButtonDef("lock", "Lock", "$baseTopic/$topicId/set/lock", "mdi:lock"),
            // Remote control buttons
            ButtonDef("remote_up", "Remote Up", "$baseTopic/$topicId/set/remote_up", "mdi:arrow-up-bold"),
            ButtonDef("remote_down", "Remote Down", "$baseTopic/$topicId/set/remote_down", "mdi:arrow-down-bold"),
            ButtonDef("remote_left", "Remote Left", "$baseTopic/$topicId/set/remote_left", "mdi:arrow-left-bold"),
            ButtonDef("remote_right", "Remote Right", "$baseTopic/$topicId/set/remote_right", "mdi:arrow-right-bold"),
            ButtonDef("remote_select", "Remote Select", "$baseTopic/$topicId/set/remote_select", "mdi:radiobox-marked"),
            ButtonDef("remote_back", "Remote Back", "$baseTopic/$topicId/set/remote_back", "mdi:arrow-left-circle"),
            ButtonDef("remote_home", "Remote Home", "$baseTopic/$topicId/set/remote_home", "mdi:home"),
            ButtonDef("remote_menu", "Remote Menu", "$baseTopic/$topicId/set/remote_menu", "mdi:menu"),
            ButtonDef("remote_playpause", "Remote Play/Pause", "$baseTopic/$topicId/set/remote_playpause", "mdi:play-pause")
        )

        return buttons.map { button ->
            val config = baseConfig(button.objectId, button.name, localIp).apply {
                put("command_topic", button.commandTopic)
                put("payload_press", "PRESS")
                put("icon", button.icon)
            }
            Pair(discoveryTopic("button", button.objectId), config)
        }
    }

    private fun buildTextConfigs(localIp: String): List<Pair<String, JSONObject>> {
        data class TextDef(
            val objectId: String,
            val name: String,
            val commandTopic: String,
            val valueTemplate: String,
            val icon: String
        )

        val texts = listOf(
            TextDef("navigate_url", "Navigate URL", "$baseTopic/$topicId/set/url", "{{ value_json.webview.currentUrl }}", "mdi:web"),
            TextDef("tts", "Text to Speech", "$baseTopic/$topicId/set/tts", "{{ '' }}", "mdi:speaker-message"),
            TextDef("toast", "Toast Message", "$baseTopic/$topicId/set/toast", "{{ '' }}", "mdi:message-text"),
            // Keyboard emulation
            TextDef("keyboard_key", "Keyboard Key", "$baseTopic/$topicId/set/keyboard_key", "{{ '' }}", "mdi:keyboard"),
            TextDef("keyboard_combo", "Keyboard Combo", "$baseTopic/$topicId/set/keyboard_combo", "{{ '' }}", "mdi:keyboard-variant"),
            TextDef("keyboard_text", "Keyboard Text", "$baseTopic/$topicId/set/keyboard_text", "{{ '' }}", "mdi:form-textbox")
        )

        return texts.map { text ->
            val config = baseConfig(text.objectId, text.name, localIp).apply {
                put("command_topic", text.commandTopic)
                put("value_template", text.valueTemplate)
                put("icon", text.icon)
            }
            Pair(discoveryTopic("text", text.objectId), config)
        }
    }

    /**
     * Build the configs for every advertised image stream: an `image` entity, a `camera` entity
     * (both fed by the same raw JPEG topic) and a button to capture on demand.
     */
    private fun buildImageConfigs(localIp: String): List<Pair<String, JSONObject>> {
        val configs = mutableListOf<Pair<String, JSONObject>>()

        for (stream in imageStreams) {
            val imageObjectId = "${stream.objectId}_image"
            val imageConfig = commonConfig(imageObjectId, stream.name, localIp).apply {
                put("image_topic", stream.imageTopic)
                put("content_type", "image/jpeg")
                put("icon", stream.icon)
            }
            configs.add(Pair(discoveryTopic("image", imageObjectId), imageConfig))

            // Same payload exposed as a camera entity, for picture-glance/picture-entity cards
            val cameraObjectId = "${stream.objectId}_cam"
            val cameraConfig = commonConfig(cameraObjectId, "${stream.name} Camera", localIp).apply {
                put("topic", stream.imageTopic)
                put("icon", stream.icon)
            }
            configs.add(Pair(discoveryTopic("camera", cameraObjectId), cameraConfig))

            val buttonObjectId = "${stream.objectId}_capture"
            val buttonConfig = baseConfig(buttonObjectId, "${stream.name} Capture", localIp).apply {
                put("command_topic", stream.commandTopic)
                put("payload_press", "PRESS")
                put("icon", "mdi:camera-iris")
            }
            configs.add(Pair(discoveryTopic("button", buttonObjectId), buttonConfig))
        }

        return configs
    }

    private fun hasScreenshotStream(): Boolean =
        imageStreams.any { it.objectId == STREAM_SCREENSHOT }

    private fun hasCameraStream(): Boolean =
        imageStreams.any { it.objectId.startsWith(STREAM_CAMERA_PREFIX) }

    /**
     * Every (component, objectId) pair the image feature can publish, whether currently
     * advertised or not. Used to compute discovery removals.
     */
    private fun allImageEntities(): List<Pair<String, String>> {
        val perStream = listOf(STREAM_SCREENSHOT, "camera_front", "camera_back").flatMap { stream ->
            listOf(
                "image" to "${stream}_image",
                "camera" to "${stream}_cam",
                "button" to "${stream}_capture"
            )
        }
        return perStream + listOf(
            "switch" to "${STREAM_SCREENSHOT}_auto",
            "number" to "${STREAM_SCREENSHOT}_interval",
            "switch" to "camera_auto",
            "number" to "camera_interval"
        )
    }

    /** Discovery topics of the image entities currently advertised. */
    private fun advertisedImageTopics(): Set<String> {
        val topics = mutableSetOf<String>()
        for (stream in imageStreams) {
            topics.add(discoveryTopic("image", "${stream.objectId}_image"))
            topics.add(discoveryTopic("camera", "${stream.objectId}_cam"))
            topics.add(discoveryTopic("button", "${stream.objectId}_capture"))
        }
        if (hasScreenshotStream()) {
            topics.add(discoveryTopic("switch", "${STREAM_SCREENSHOT}_auto"))
            topics.add(discoveryTopic("number", "${STREAM_SCREENSHOT}_interval"))
        }
        if (hasCameraStream()) {
            topics.add(discoveryTopic("switch", "camera_auto"))
            topics.add(discoveryTopic("number", "camera_interval"))
        }
        return topics
    }

    /**
     * Publish an empty retained payload on the discovery topics of the image entities that are
     * not currently advertised, which makes Home Assistant delete them.
     */
    fun publishImageDiscoveryRemovals(client: KioskMqttClient) {
        val advertised = advertisedImageTopics()
        var removed = 0
        for ((component, objectId) in allImageEntities()) {
            val topic = discoveryTopic(component, objectId)
            if (topic !in advertised) {
                client.publish(topic, "", qos = 1, retained = true)
                removed++
            }
        }
        if (removed > 0) {
            Log.d("MqttDiscovery", "Published $removed image discovery removals")
        }
    }
}
