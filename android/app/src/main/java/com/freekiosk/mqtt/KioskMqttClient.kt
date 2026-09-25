package com.freekiosk.mqtt

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.wifi.WifiManager
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
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
    val useTls: Boolean = false,
    // Image publishing (screenshot / camera snapshots over MQTT) — all disabled by default
    val screenshotEnabled: Boolean = false,
    val screenshotAuto: Boolean = false,
    val screenshotIntervalMs: Long = 60000,
    val screenshotQuality: Int = 70,
    val screenshotMaxWidth: Int = 1280,
    val cameraEnabled: Boolean = false,
    val cameraAuto: Boolean = false,
    val cameraIntervalMs: Long = 300000,
    val cameraQuality: Int = 70
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

        // #155: delay before republishing the state after executing a command, so the
        // action (brightness applied, screen locked, screensaver shown) has taken effect
        // before the status is read back.
        private const val COMMAND_STATE_PUBLISH_DELAY_MS = 600L
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

    // ==================== Locks for background persistence ====================

    /** WiFi lock to prevent WiFi from sleeping when screen is off. */
    private var wifiLock: WifiManager.WifiLock? = null

    /** CPU wake lock to keep CPU alive for MQTT PING packets. */
    private var cpuWakeLock: PowerManager.WakeLock? = null

    /** Network callback for instant reconnect when WiFi comes back. */
    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    /**
     * Acquire WifiLock + WakeLock to keep MQTT alive when screen is off.
     *
     * Note (#234): the WifiLock does almost nothing here and must not be trusted.
     * WIFI_MODE_FULL_HIGH_PERF is deprecated and the platform silently replaces it with
     * WIFI_MODE_FULL_LOW_LATENCY, which per the SDK is "only active when the screen is on"
     * and "only active when the acquiring app is running in the foreground". Switching the
     * constant explicitly would change nothing. What actually keeps the connection alive
     * with the screen off is the PARTIAL_WAKE_LOCK below, the process staying alive
     * (KioskWatchdogService) and, on battery, the Doze exemption.
     */
    private fun acquireLocks() {
        try {
            if (wifiLock == null) {
                val wifiManager = context.applicationContext
                    .getSystemService(Context.WIFI_SERVICE) as WifiManager
                wifiLock = wifiManager.createWifiLock(
                    WifiManager.WIFI_MODE_FULL_HIGH_PERF, "FreeKiosk:MqttClient")
                wifiLock?.acquire()
                Log.d(TAG, "WiFi lock acquired")
            }
            if (cpuWakeLock == null) {
                val powerManager = context
                    .getSystemService(Context.POWER_SERVICE) as PowerManager
                cpuWakeLock = powerManager.newWakeLock(
                    PowerManager.PARTIAL_WAKE_LOCK, "FreeKiosk:MqttCPU")
                cpuWakeLock?.acquire()
                Log.d(TAG, "CPU wake lock acquired")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to acquire locks: ${e.message}", e)
        }
    }

    /**
     * Release WifiLock + WakeLock.
     */
    private fun releaseLocks() {
        try {
            wifiLock?.let { if (it.isHeld) it.release() }
            wifiLock = null
            cpuWakeLock?.let { if (it.isHeld) it.release() }
            cpuWakeLock = null
            Log.d(TAG, "Locks released")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to release locks: ${e.message}", e)
        }
    }

    /**
     * Register a NetworkCallback to detect WiFi availability changes.
     * Triggers immediate reconnect when WiFi comes back.
     */
    private fun registerNetworkCallback() {
        try {
            if (networkCallback != null) return

            val connectivityManager = context
                .getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

            val request = NetworkRequest.Builder()
                .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
                .build()

            val callback = object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    Log.i(TAG, "WiFi available — checking MQTT connection")
                    if (!_isConnected && !disconnectRequested) {
                        reconnectDelay = 1000L // reset backoff
                        mainHandler.postDelayed({
                            if (!_isConnected && !disconnectRequested) {
                                Log.i(TAG, "WiFi restored, triggering MQTT reconnect")
                                if (mqttClient != null) {
                                    sendConnect()
                                } else {
                                    connect()
                                }
                            }
                        }, 2000) // 2s delay for network to stabilize
                    }
                }

                override fun onLost(network: Network) {
                    Log.w(TAG, "WiFi lost")
                }
            }

            connectivityManager.registerNetworkCallback(request, callback)
            networkCallback = callback
            Log.d(TAG, "Network callback registered")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register network callback: ${e.message}", e)
        }
    }

    /**
     * Unregister the NetworkCallback.
     */
    private fun unregisterNetworkCallback() {
        try {
            networkCallback?.let {
                val connectivityManager = context
                    .getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
                connectivityManager.unregisterNetworkCallback(it)
                Log.d(TAG, "Network callback unregistered")
            }
            networkCallback = null
        } catch (e: Exception) {
            Log.e(TAG, "Failed to unregister network callback: ${e.message}", e)
        }
    }

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

    /** Publishes screenshot / camera snapshots. Null when no image stream is enabled. */
    var imagePublisher: MqttImagePublisher? = null

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

        // Acquire locks to keep WiFi + CPU alive for MQTT
        acquireLocks()
        registerNetworkCallback()

        try {
            val protocol = if (config.useTls) "ssl" else "tcp"
            val maskedPass = config.password?.let { p ->
                when {
                    p.length <= 4 -> "****"
                    p.length <= 6 -> "${p.take(1)}${"*".repeat(p.length - 2)}${p.takeLast(1)}"
                    else -> "${p.take(2)}${"*".repeat((p.length - 4).coerceAtMost(10))}${p.takeLast(2)}"
                }
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
        } catch (e: Throwable) {
            Log.e(TAG, "Failed to create MQTT client: ${e.javaClass.simpleName}: ${e.message}", e)
            _isConnected = false
            mainHandler.post {
                onConnectionError?.invoke("${e.javaClass.simpleName}: ${e.message}")
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
        imagePublisher?.stop()
        imagePublisher = null
        unregisterNetworkCallback()
        releaseLocks()

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

            // Credentials (enter auth block if either username or password is set)
            if (!config.username.isNullOrBlank() || !config.password.isNullOrEmpty()) {
                val authBuilder = connectBuilder.simpleAuth()
                    .username(config.username ?: "")
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
        } catch (e: Throwable) {
            Log.e(TAG, "Error sending CONNECT: ${e.javaClass.simpleName}: ${e.message}", e)
            _isConnected = false
            mainHandler.post {
                onConnectionError?.invoke("CONNECT failed: ${e.javaClass.simpleName}: ${e.message}")
                onConnectionChanged?.invoke(false)
            }
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
            // Remove entities of image streams that are no longer enabled
            discovery?.publishImageDiscoveryRemovals(this)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to publish HA discovery configs: ${e.message}", e)
        }

        // 2b. Image streams: clear stale payloads, publish a first image, arm the timers
        try {
            imagePublisher?.clearDisabledTopics()
            imagePublisher?.onConnected()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize image publishing: ${e.message}", e)
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
        unregisterNetworkCallback()
        releaseLocks()
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
        publish(topic, payload.toByteArray(), qos, retained)
    }

    /**
     * Publish a binary message to the given topic.
     * Used for image payloads (JPEG screenshots and camera snapshots).
     *
     * @param topic    MQTT topic
     * @param payload  raw message bytes
     * @param qos      quality of service level (0 or 1)
     * @param retained whether the message should be retained by the broker
     */
    fun publish(topic: String, payload: ByteArray, qos: Int = 0, retained: Boolean = false) {
        try {
            val mqttQos = if (qos >= 1) MqttQos.AT_LEAST_ONCE else MqttQos.AT_MOST_ONCE
            mqttClient?.publishWith()
                ?.topic(topic)
                ?.payload(payload)
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
        // #155: drop a post-command publish still pending on the handler.
        mainHandler.removeCallbacks(commandStatePublishRunnable)
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
                } finally {
                    // #155: the state topic is retained, so without this the pre-command
                    // value stands until the next periodic publish (up to 30s) and Home
                    // Assistant's toggle snaps back to it.
                    scheduleStatePublishAfterCommand()
                }
            }
        } else {
            Log.w(TAG, "Unknown entity: $entity")
        }
    }

    /**
     * #155: republish the state shortly after a command, debounced so a burst of commands
     * (an HA scene setting brightness and volume at once) results in a single publish.
     */
    private fun scheduleStatePublishAfterCommand() {
        mainHandler.removeCallbacks(commandStatePublishRunnable)
        mainHandler.postDelayed(commandStatePublishRunnable, COMMAND_STATE_PUBLISH_DELAY_MS)
    }

    private val commandStatePublishRunnable = Runnable {
        try {
            if (_isConnected && !disconnectRequested) {
                statusProvider?.invoke()?.let { publishStatus(it) }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error publishing status after command: ${e.message}", e)
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

            "mode" -> {
                // Payload is JSON: {"mode":"webview","url":"..."} or
                // {"mode":"external_app","package":"com.app"}. A bare string
                // (e.g. "webview") is accepted as the mode with no target.
                val params = try {
                    JSONObject(payload)
                } catch (e: Exception) {
                    JSONObject().put("mode", payload)
                }
                "setMode" to params
            }

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

            // Remote control (D-pad navigation, media keys)
            "remote_up" -> "remoteKey" to JSONObject().put("key", "up")
            "remote_down" -> "remoteKey" to JSONObject().put("key", "down")
            "remote_left" -> "remoteKey" to JSONObject().put("key", "left")
            "remote_right" -> "remoteKey" to JSONObject().put("key", "right")
            "remote_select" -> "remoteKey" to JSONObject().put("key", "select")
            "remote_back" -> "remoteKey" to JSONObject().put("key", "back")
            "remote_home" -> "remoteKey" to JSONObject().put("key", "home")
            "remote_menu" -> "remoteKey" to JSONObject().put("key", "menu")
            "remote_playpause" -> "remoteKey" to JSONObject().put("key", "playpause")

            // Keyboard emulation
            "keyboard_key" -> "keyboardKey" to JSONObject().put("key", payload)
            "keyboard_combo" -> "keyboardCombo" to JSONObject().put("map", payload)
            "keyboard_text" -> "keyboardText" to JSONObject().put("text", payload)

            // Image publishing (screenshot / camera snapshots)
            "screenshot_capture" -> "publishScreenshot" to null
            "camera_capture_front" -> "publishCameraPhoto" to JSONObject().put("facing", "front")
            "camera_capture_back" -> "publishCameraPhoto" to JSONObject().put("facing", "back")

            "screenshot_auto" -> "setImageAutoPublish" to JSONObject()
                .put("stream", "screenshot")
                .put("value", payload.uppercase() == "ON")
            "camera_auto" -> "setImageAutoPublish" to JSONObject()
                .put("stream", "camera")
                .put("value", payload.uppercase() == "ON")

            // Home Assistant sends integers for integer steps, but tolerate "30.0" too
            "screenshot_interval" -> imageIntervalCommand("screenshot", payload)
            "camera_interval" -> imageIntervalCommand("camera", payload)

            else -> null to null
        }
    }

    /**
     * Interval command for an image stream. Home Assistant sends integers for integer
     * steps, but "30.0" is tolerated too. An unparseable payload yields no command at
     * all: returning 0 would have been clamped up to the 5s minimum, so a typo on the
     * topic put the device on the fastest possible capture loop instead of being ignored.
     */
    private fun imageIntervalCommand(stream: String, payload: String): Pair<String?, JSONObject?> {
        val seconds = payload.toIntOrNull() ?: payload.toDoubleOrNull()?.toInt()
        if (seconds == null) {
            Log.w(TAG, "Ignoring $stream interval command: '$payload' is not a number")
            return null to null
        }
        return "setImageInterval" to JSONObject()
            .put("stream", stream)
            .put("seconds", seconds)
    }

    // ==================== State queries ====================

    /**
     * Returns whether the client is currently connected to the MQTT broker.
     */
    fun isConnected(): Boolean = _isConnected

}
