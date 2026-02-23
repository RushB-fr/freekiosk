package com.freekiosk.mqtt

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import com.hivemq.client.mqtt.MqttClient
import com.hivemq.client.mqtt.datatypes.MqttQos
import com.hivemq.client.mqtt.mqtt3.Mqtt3AsyncClient
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
    val allowControl: Boolean = true,
    val deviceName: String? = null,
    val useTls: Boolean = false
)

/**
 * Core MQTT client for FreeKiosk that integrates with Home Assistant via MQTT Discovery.
 * Uses HiveMQ MQTT Client (MQTT v3.1.1).
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
    }

    /** Device ID derived from Settings.Secure.ANDROID_ID (used for unique HA entity IDs). */
    val deviceId: String = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)

    /** Topic identifier: user-provided device name or ANDROID_ID. */
    val topicId: String = config.deviceName?.takeIf { it.isNotBlank() } ?: deviceId

    /** Effective client ID: user-provided or generated from device ID. */
    private val effectiveClientId: String = config.clientId?.takeIf { it.isNotBlank() } ?: "freekiosk_$deviceId"

    /** The underlying HiveMQ async MQTT 3.1.1 client. */
    private var mqttClient: Mqtt3AsyncClient? = null

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

    /** Current reconnect delay in milliseconds (exponential backoff). */
    private var reconnectDelay = 1000L
    private val maxReconnectDelay = 30000L

    // ==================== Callbacks ====================

    /** Lambda invoked when a command is received via MQTT. */
    var commandHandler: ((String, JSONObject?) -> Unit)? = null

    /** Lambda that provides the current device status as JSON. */
    var statusProvider: (() -> JSONObject)? = null

    /** Lambda invoked when the connection state changes. */
    var onConnectionChanged: ((Boolean) -> Unit)? = null

    /** Lambda invoked when a connection error occurs, with error message. */
    var onConnectionError: ((String) -> Unit)? = null

    /** Lambda that provides the current local IP address for HA Discovery configuration_url. */
    var ipProvider: (() -> String)? = null

    /** Optional MqttDiscovery instance for Home Assistant discovery config publishing. */
    var discovery: MqttDiscovery? = null

    // ==================== Topic helpers ====================

    /** Base topic prefix for this device: {baseTopic}/{topicId} */
    internal val deviceTopicPrefix: String
        get() = "${config.baseTopic}/$topicId"

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
     * Builds the HiveMQ client, configures auto-reconnect, LWT, credentials,
     * then initiates an async connection.
     */
    fun connect() {
        if (_isConnected) {
            Log.w(TAG, "Already connected, ignoring connect() call")
            return
        }

        disconnectRequested = false

        try {
            val protocol = if (config.useTls) "ssl" else "tcp"
            val maskedPass = config.password?.let { p ->
                if (p.length <= 4) "****"
                else "${p.take(3)}${"*".repeat(p.length - 6).take(10)}${p.takeLast(3)}"
            } ?: "(none)"
            Log.i(TAG, "Connecting to $protocol://${config.brokerUrl}:${config.port} as $effectiveClientId (device=$deviceId, topic=$topicId, tls=${config.useTls}, user=${config.username ?: "(none)"}, pass=$maskedPass)")

            // Build the MQTT 3.1.1 async client
            val clientBuilder = MqttClient.builder()
                .useMqttVersion3()
                .identifier(effectiveClientId)
                .serverHost(config.brokerUrl)
                .serverPort(config.port)

            // Add TLS if enabled (e.g., port 8883)
            if (config.useTls) {
                clientBuilder.sslWithDefaultConfig()
            }

            val client = clientBuilder
                .addConnectedListener {
                    Log.i(TAG, "Connected to broker")
                    reconnectDelay = 1000L // reset backoff on successful connect
                    onConnectSuccess()
                }
                .addDisconnectedListener { ctx ->
                    if (!disconnectRequested) {
                        val errorMsg = ctx.cause.message ?: ctx.cause.javaClass.simpleName
                        Log.w(TAG, "Connection lost: $errorMsg")
                        mainHandler.post {
                            onConnectionError?.invoke(errorMsg)
                        }
                    }
                    _isConnected = false
                    stopStatusPublishing()
                    mainHandler.post {
                        onConnectionChanged?.invoke(false)
                    }
                    // Manual reconnect with exponential backoff (preserves credentials)
                    if (!disconnectRequested) {
                        val delay = reconnectDelay
                        reconnectDelay = (reconnectDelay * 2).coerceAtMost(maxReconnectDelay)
                        Log.i(TAG, "Scheduling reconnect in ${delay}ms")
                        mainHandler.postDelayed({ sendConnect() }, delay)
                    }
                }
                .buildAsync()

            mqttClient = client
            sendConnect()
        } catch (e: Exception) {
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

        val client = mqttClient
        if (client != null) {
            // Publish offline status, then disconnect
            try {
                client.publishWith()
                    .topic(availabilityTopic)
                    .payload("offline".toByteArray())
                    .qos(MqttQos.AT_LEAST_ONCE)
                    .retain(true)
                    .send()
                    .exceptionally { null }
                    .thenCompose {
                        client.disconnect()
                    }
                    .exceptionally { null }
                    .thenAccept {
                        Log.i(TAG, "Disconnected successfully")
                        cleanup()
                    }
            } catch (e: Exception) {
                Log.e(TAG, "Error during disconnect: ${e.message}", e)
                cleanup()
            }
        } else {
            cleanup()
        }
    }

    /**
     * Force a reconnect attempt.
     * Disconnects (if connected) and then connects again.
     */
    fun reconnect() {
        Log.i(TAG, "Reconnecting...")
        stopStatusPublishing()
        _isConnected = false

        val client = mqttClient
        mqttClient = null

        if (client != null) {
            try {
                client.disconnect()
                    .exceptionally { null }
                    .thenAccept {
                        mainHandler.postDelayed({ connect() }, 500)
                    }
            } catch (e: Exception) {
                Log.w(TAG, "Error disconnecting during reconnect: ${e.message}")
                mainHandler.postDelayed({ connect() }, 500)
            }
        } else {
            mainHandler.postDelayed({ connect() }, 500)
        }
    }

    /**
     * Send CONNECT packet with credentials, LWT, and session settings.
     * Used for both initial connect and manual reconnect.
     */
    private fun sendConnect() {
        val client = mqttClient ?: return

        if (disconnectRequested) return

        try {
            val connectBuilder = client.connectWith()
                .cleanSession(true)
                .keepAlive(30)

            // LWT: publish "offline" to availability topic if connection is lost unexpectedly
            connectBuilder.willPublish()
                .topic(availabilityTopic)
                .payload("offline".toByteArray())
                .qos(MqttQos.AT_LEAST_ONCE)
                .retain(true)
                .applyWillPublish()

            // Credentials
            if (!config.username.isNullOrBlank()) {
                val authBuilder = connectBuilder.simpleAuth()
                    .username(config.username)
                if (!config.password.isNullOrEmpty()) {
                    authBuilder.password(config.password.toByteArray())
                }
                authBuilder.applySimpleAuth()
            }

            connectBuilder.send().whenComplete { _, throwable ->
                if (throwable != null) {
                    Log.e(TAG, "Connection failed: ${throwable.message}", throwable)
                    _isConnected = false
                    val errorMsg = throwable.message ?: throwable.javaClass.simpleName
                    mainHandler.post {
                        onConnectionError?.invoke(errorMsg)
                        onConnectionChanged?.invoke(false)
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error sending CONNECT: ${e.message}", e)
        }
    }

    // ==================== Internal connection handling ====================

    /**
     * Called when the MQTT connection is established (initial or reconnect).
     * Publishes online status, HA discovery configs, subscribes to commands, starts status loop.
     */
    private fun onConnectSuccess() {
        _isConnected = true

        // 1. Publish "online" to availability topic (retained)
        publish(availabilityTopic, "online", qos = 1, retained = true)

        // 2. Publish Home Assistant MQTT Discovery configurations
        try {
            val currentIp = ipProvider?.invoke() ?: "0.0.0.0"
            discovery?.publishDiscoveryConfigs(this, currentIp)
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
            mqttClient?.subscribeWith()
                ?.topicFilter(commandTopicFilter)
                ?.qos(MqttQos.AT_LEAST_ONCE)
                ?.callback { publish ->
                    val topic = publish.topic.toString()
                    val payload = String(publish.payloadAsBytes)
                    handleIncomingMessage(topic, payload)
                }
                ?.send()
                ?.whenComplete { _, throwable ->
                    if (throwable != null) {
                        Log.e(TAG, "Failed to subscribe to commands: ${throwable.message}")
                    } else {
                        Log.i(TAG, "Subscribed to commands: $commandTopicFilter")
                    }
                }
        } catch (e: Exception) {
            Log.e(TAG, "Error subscribing to commands: ${e.message}", e)
        }
    }

    /**
     * Cleanup all resources. Called after disconnect or on error.
     */
    private fun cleanup() {
        _isConnected = false
        stopStatusPublishing()
        mqttClient = null
        mainHandler.post {
            onConnectionChanged?.invoke(false)
        }
    }

    // ==================== Publishing ====================

    /**
     * Publish a message to the given topic.
     *
     * @param topic    MQTT topic
     * @param payload  message payload string
     * @param qos      quality of service level (0 or 1)
     * @param retained whether the message should be retained by the broker
     */
    fun publish(topic: String, payload: String, qos: Int = 0, retained: Boolean = false) {
        try {
            val mqttQos = if (qos >= 1) MqttQos.AT_LEAST_ONCE else MqttQos.AT_MOST_ONCE
            mqttClient?.publishWith()
                ?.topic(topic)
                ?.payload(payload.toByteArray())
                ?.qos(mqttQos)
                ?.retain(retained)
                ?.send()
        } catch (e: Exception) {
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
        publish(stateTopic, statusJson.toString(), qos = 0, retained = true)
    }

    // ==================== Periodic status publishing ====================

    /**
     * Start the periodic status publishing timer.
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
     */
    private fun handleIncomingMessage(topic: String, payload: String) {
        Log.d(TAG, "Message received: $topic -> $payload")

        if (!config.allowControl) {
            Log.w(TAG, "Control is disabled, ignoring command on $topic")
            return
        }

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

            "motion_always_on" -> {
                val on = payload.uppercase() == "ON"
                "setMotionAlwaysOn" to JSONObject().put("value", on)
            }

            else -> null to null
        }
    }

    // ==================== State queries ====================

    /**
     * Returns whether the client is currently connected to the MQTT broker.
     */
    fun isConnected(): Boolean = _isConnected

}
