package com.freekiosk.mqtt

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import org.eclipse.paho.client.mqttv3.*
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence
import org.json.JSONObject

/**
 * MQTT configuration data class.
 */
data class MqttConfig(
    val brokerUrl: String,
    val port: Int = 1883,
    val username: String? = null,
    val password: String? = null,
    val clientId: String? = null,
    val baseTopic: String = "freekiosk",
    val discoveryPrefix: String = "homeassistant",
    val statusInterval: Long = 30000, // 30 seconds
    val allowControl: Boolean = true
)

/**
 * Core MQTT client for FreeKiosk that integrates with Home Assistant via MQTT Discovery.
 * Uses Eclipse Paho MQTT v3.1.1.
 *
 * Provides:
 * - Automatic connection/reconnection to the MQTT broker
 * - Home Assistant MQTT Discovery configuration publishing
 * - Periodic device status publishing
 * - Command reception and dispatching (brightness, volume, screen, etc.)
 * - LWT (Last Will and Testament) for availability tracking
 */
class KioskMqttClient(
    private val context: Context,
    private val config: MqttConfig
) {

    companion object {
        private const val TAG = "KioskMqttClient"
        private const val QOS_AT_MOST_ONCE = 0
        private const val QOS_AT_LEAST_ONCE = 1
    }

    /** Device ID derived from Settings.Secure.ANDROID_ID. */
    val deviceId: String = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)

    /** Effective client ID: user-provided or generated from device ID. */
    private val effectiveClientId: String = config.clientId ?: "freekiosk_$deviceId"

    /** The underlying Paho async MQTT client. */
    private var mqttClient: MqttAsyncClient? = null

    /** Handler posting work on the main (UI) thread. */
    private val mainHandler = Handler(Looper.getMainLooper())

    /** Runnable for the periodic status publishing loop. */
    private var statusRunnable: Runnable? = null

    /** Whether we are currently connected. */
    @Volatile
    private var _isConnected = false

    /** Whether disconnect was requested explicitly (suppress reconnect logging). */
    @Volatile
    private var disconnectRequested = false

    // ==================== Callbacks ====================

    /** Lambda invoked when a command is received via MQTT. */
    var commandHandler: ((String, JSONObject?) -> Unit)? = null

    /** Lambda that provides the current device status as JSON. */
    var statusProvider: (() -> JSONObject)? = null

    /** Lambda invoked when the connection state changes. */
    var onConnectionChanged: ((Boolean) -> Unit)? = null

    /** Optional MqttDiscovery instance for Home Assistant discovery config publishing. */
    var discovery: MqttDiscovery? = null

    // ==================== Topic helpers ====================

    /** Base topic prefix for this device: {baseTopic}/{deviceId} */
    internal val deviceTopicPrefix: String
        get() = "${config.baseTopic}/$deviceId"

    /** Availability topic for LWT and online/offline announcements. */
    internal val availabilityTopic: String
        get() = "$deviceTopicPrefix/availability"

    /** State topic for periodic status publishing. */
    internal val stateTopic: String
        get() = "$deviceTopicPrefix/state"

    /** Command subscription topic (wildcard). */
    private val commandTopicFilter: String
        get() = "$deviceTopicPrefix/set/#"

    // ==================== Connect / Disconnect ====================

    /**
     * Connect to the MQTT broker.
     * Configures connection options including LWT, credentials, automatic reconnect,
     * then initiates an async connection.
     */
    fun connect() {
        if (mqttClient?.isConnected == true) {
            Log.w(TAG, "Already connected, ignoring connect() call")
            return
        }

        disconnectRequested = false

        try {
            val serverUri = "tcp://${config.brokerUrl}:${config.port}"
            Log.i(TAG, "Connecting to $serverUri as $effectiveClientId (device=$deviceId)")

            val client = MqttAsyncClient(serverUri, effectiveClientId, MemoryPersistence())
            mqttClient = client

            // Set the callback for connection events and incoming messages
            client.setCallback(object : MqttCallbackExtended {

                override fun connectComplete(reconnect: Boolean, serverURI: String?) {
                    Log.i(TAG, "Connection complete (reconnect=$reconnect) to $serverURI")
                    onConnectSuccess()
                }

                override fun connectionLost(cause: Throwable?) {
                    Log.w(TAG, "Connection lost: ${cause?.message}")
                    _isConnected = false
                    stopStatusPublishing()
                    mainHandler.post {
                        onConnectionChanged?.invoke(false)
                    }
                }

                override fun messageArrived(topic: String?, message: MqttMessage?) {
                    if (topic != null && message != null) {
                        handleIncomingMessage(topic, String(message.payload))
                    }
                }

                override fun deliveryComplete(token: IMqttDeliveryToken?) {
                    // No action needed
                }
            })

            // Build connect options
            val options = MqttConnectOptions().apply {
                isAutomaticReconnect = true
                isCleanSession = true
                connectionTimeout = 10
                keepAliveInterval = 30
                maxInflight = 100

                // LWT: publish "offline" to availability topic if connection is lost unexpectedly
                setWill(availabilityTopic, "offline".toByteArray(), QOS_AT_LEAST_ONCE, true)

                // Credentials
                if (!config.username.isNullOrEmpty()) {
                    userName = config.username
                }
                if (!config.password.isNullOrEmpty()) {
                    password = config.password.toCharArray()
                }
            }

            client.connect(options, null, object : IMqttActionListener {
                override fun onSuccess(asyncActionToken: IMqttToken?) {
                    // connectComplete callback handles the rest
                }

                override fun onFailure(asyncActionToken: IMqttToken?, exception: Throwable?) {
                    Log.e(TAG, "Connection failed: ${exception?.message}", exception)
                    _isConnected = false
                    mainHandler.post {
                        onConnectionChanged?.invoke(false)
                    }
                }
            })
        } catch (e: MqttException) {
            Log.e(TAG, "Failed to create MQTT client: ${e.message}", e)
            _isConnected = false
            mainHandler.post {
                onConnectionChanged?.invoke(false)
            }
        }
    }

    /**
     * Disconnect from the MQTT broker.
     * Publishes "offline" to availability, stops status publishing, and cleans up resources.
     */
    fun disconnect() {
        disconnectRequested = true
        stopStatusPublishing()

        try {
            val client = mqttClient
            if (client != null && client.isConnected) {
                // Publish offline status before disconnecting
                try {
                    val offlineMsg = MqttMessage("offline".toByteArray()).apply {
                        qos = QOS_AT_LEAST_ONCE
                        isRetained = true
                    }
                    client.publish(availabilityTopic, offlineMsg)
                } catch (e: MqttException) {
                    Log.w(TAG, "Failed to publish offline status: ${e.message}")
                }

                client.disconnect(5000, null, object : IMqttActionListener {
                    override fun onSuccess(asyncActionToken: IMqttToken?) {
                        Log.i(TAG, "Disconnected successfully")
                        cleanup()
                    }

                    override fun onFailure(asyncActionToken: IMqttToken?, exception: Throwable?) {
                        Log.w(TAG, "Disconnect failed: ${exception?.message}")
                        cleanup()
                    }
                })
            } else {
                cleanup()
            }
        } catch (e: MqttException) {
            Log.e(TAG, "Error during disconnect: ${e.message}", e)
            cleanup()
        }
    }

    /**
     * Force a reconnect attempt.
     * Disconnects (if connected) and then connects again.
     */
    fun reconnect() {
        Log.i(TAG, "Reconnecting...")
        try {
            val client = mqttClient
            if (client != null && client.isConnected) {
                client.disconnect()
            }
        } catch (e: MqttException) {
            Log.w(TAG, "Error disconnecting during reconnect: ${e.message}")
        }
        // Small delay to allow disconnection to complete
        mainHandler.postDelayed({ connect() }, 1000)
    }

    // ==================== Internal connection handling ====================

    /**
     * Called when the MQTT connection is established (initial or reconnect).
     * Publishes online status, HA discovery configs, subscribes to commands, starts status loop.
     */
    private fun onConnectSuccess() {
        _isConnected = true

        // 1. Publish "online" to availability topic (retained)
        publishRetained(availabilityTopic, "online", QOS_AT_LEAST_ONCE)

        // 2. Publish Home Assistant MQTT Discovery configurations
        try {
            discovery?.publishDiscoveryConfigs(this)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to publish HA discovery configs: ${e.message}", e)
        }

        // 3. Subscribe to command topics if control is allowed
        if (config.allowControl) {
            subscribeToCommands()
        }

        // 4. Start periodic status publishing
        startStatusPublishing()

        // 5. Notify connection state change on main thread
        mainHandler.post {
            onConnectionChanged?.invoke(true)
        }
    }

    /**
     * Subscribe to the command wildcard topic for receiving commands from Home Assistant.
     */
    private fun subscribeToCommands() {
        try {
            mqttClient?.subscribe(commandTopicFilter, QOS_AT_LEAST_ONCE, null, object : IMqttActionListener {
                override fun onSuccess(asyncActionToken: IMqttToken?) {
                    Log.i(TAG, "Subscribed to commands: $commandTopicFilter")
                }

                override fun onFailure(asyncActionToken: IMqttToken?, exception: Throwable?) {
                    Log.e(TAG, "Failed to subscribe to commands: ${exception?.message}")
                }
            })
        } catch (e: MqttException) {
            Log.e(TAG, "Error subscribing to commands: ${e.message}", e)
        }
    }

    /**
     * Cleanup all resources. Called after disconnect or on error.
     */
    private fun cleanup() {
        _isConnected = false
        stopStatusPublishing()
        try {
            mqttClient?.close()
        } catch (e: MqttException) {
            Log.w(TAG, "Error closing MQTT client: ${e.message}")
        }
        mqttClient = null
        mainHandler.post {
            onConnectionChanged?.invoke(false)
        }
    }

    // ==================== Publishing ====================

    /**
     * Publish a retained message to the given topic.
     */
    private fun publishRetained(topic: String, payload: String, qos: Int) {
        try {
            val message = MqttMessage(payload.toByteArray()).apply {
                this.qos = qos
                isRetained = true
            }
            mqttClient?.publish(topic, message)
            Log.d(TAG, "Published retained to $topic (${payload.length} bytes)")
        } catch (e: MqttException) {
            Log.e(TAG, "Failed to publish to $topic: ${e.message}", e)
        }
    }

    /**
     * Publish a message to the given topic (non-retained by default).
     *
     * @param topic   MQTT topic
     * @param payload message payload string
     * @param qos     quality of service level (0 or 1)
     * @param retained whether the message should be retained by the broker
     */
    fun publish(topic: String, payload: String, qos: Int = QOS_AT_MOST_ONCE, retained: Boolean = false) {
        try {
            val message = MqttMessage(payload.toByteArray()).apply {
                this.qos = qos
                isRetained = retained
            }
            mqttClient?.publish(topic, message)
        } catch (e: MqttException) {
            Log.e(TAG, "Failed to publish to $topic: ${e.message}", e)
        }
    }

    /**
     * Publish the current device status JSON to the state topic.
     * Uses QoS 0 and retained = true so that Home Assistant can pick up the latest state.
     */
    fun publishStatus(statusJson: JSONObject) {
        if (!_isConnected) {
            Log.d(TAG, "Not connected, skipping status publish")
            return
        }
        publishRetained(stateTopic, statusJson.toString(), QOS_AT_MOST_ONCE)
    }

    // ==================== Periodic status publishing ====================

    /**
     * Start the periodic status publishing timer.
     * Uses [Handler.postDelayed] on the main thread to schedule recurring publishes.
     */
    private fun startStatusPublishing() {
        stopStatusPublishing()

        val runnable = object : Runnable {
            override fun run() {
                if (_isConnected && !disconnectRequested) {
                    try {
                        val status = statusProvider?.invoke()
                        if (status != null) {
                            publishStatus(status)
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Error publishing periodic status: ${e.message}", e)
                    }
                    mainHandler.postDelayed(this, config.statusInterval)
                }
            }
        }
        statusRunnable = runnable

        // Publish immediately, then schedule recurring
        mainHandler.post(runnable)
        Log.d(TAG, "Status publishing started (interval=${config.statusInterval}ms)")
    }

    /**
     * Stop the periodic status publishing timer.
     */
    private fun stopStatusPublishing() {
        statusRunnable?.let {
            mainHandler.removeCallbacks(it)
            Log.d(TAG, "Status publishing stopped")
        }
        statusRunnable = null
    }

    // ==================== Incoming message handling ====================

    /**
     * Handle an incoming MQTT message.
     * Extracts the entity name from the topic suffix after "set/" and maps it to the
     * corresponding command name and parameters, then invokes [commandHandler].
     *
     * @param topic   the full MQTT topic
     * @param payload the message payload as a string
     */
    private fun handleIncomingMessage(topic: String, payload: String) {
        Log.d(TAG, "Message received: $topic -> $payload")

        if (!config.allowControl) {
            Log.w(TAG, "Control is disabled, ignoring command on $topic")
            return
        }

        // Expected topic format: {baseTopic}/{deviceId}/set/{entity}
        val setPrefix = "$deviceTopicPrefix/set/"
        if (!topic.startsWith(setPrefix)) {
            Log.w(TAG, "Unexpected topic format: $topic")
            return
        }

        val entity = topic.removePrefix(setPrefix)
        if (entity.isEmpty()) {
            Log.w(TAG, "Empty entity in topic: $topic")
            return
        }

        val (command, params) = mapEntityToCommand(entity, payload)
        if (command != null) {
            Log.i(TAG, "Dispatching command: $command (entity=$entity, payload=$payload)")
            mainHandler.post {
                try {
                    commandHandler?.invoke(command, params)
                } catch (e: Exception) {
                    Log.e(TAG, "Error executing command $command: ${e.message}", e)
                }
            }
        } else {
            Log.w(TAG, "Unknown entity: $entity")
        }
    }

    /**
     * Map an MQTT entity name (topic suffix) to a command name and optional JSON parameters.
     *
     * @param entity  the entity suffix from the MQTT topic (e.g. "brightness", "screen")
     * @param payload the raw message payload
     * @return a pair of (commandName, params) where commandName is null if the entity is unknown
     */
    private fun mapEntityToCommand(entity: String, payload: String): Pair<String?, JSONObject?> {
        return when (entity) {
            "brightness" -> "setBrightness" to JSONObject().put("value", payload.toIntOrNull() ?: 0)
            "volume" -> "setVolume" to JSONObject().put("value", payload.toIntOrNull() ?: 0)

            "screen" -> {
                val cmd = if (payload.uppercase() == "ON") "screenOn" else "screenOff"
                cmd to null
            }

            "screensaver" -> {
                val cmd = if (payload.uppercase() == "ON") "screensaverOn" else "screensaverOff"
                cmd to null
            }

            "reload" -> "reload" to null
            "wake" -> "wake" to null
            "reboot" -> "reboot" to null
            "clear_cache" -> "clearCache" to null
            "lock" -> "lockDevice" to null

            "url" -> "setUrl" to JSONObject().put("url", payload)
            "tts" -> "tts" to JSONObject().put("text", payload)
            "toast" -> "toast" to JSONObject().put("text", payload)
            "launch_app" -> "launchApp" to JSONObject().put("package", payload)
            "execute_js" -> "executeJs" to JSONObject().put("code", payload)

            "audio_play" -> {
                // JSON payload: parse the full object
                val params = try {
                    JSONObject(payload)
                } catch (e: Exception) {
                    Log.w(TAG, "Invalid JSON payload for audio_play: $payload")
                    JSONObject().put("url", payload)
                }
                "audioPlay" to params
            }

            "audio_stop" -> "audioStop" to null
            "audio_beep" -> "audioBeep" to null

            "rotation_start" -> "rotationStart" to null
            "rotation_stop" -> "rotationStop" to null

            "restart_ui" -> "restartUi" to null

            else -> null to null
        }
    }

    // ==================== State queries ====================

    /**
     * Returns whether the client is currently connected to the MQTT broker.
     */
    fun isConnected(): Boolean = _isConnected

}
