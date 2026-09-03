package com.freekiosk.mqtt

import android.graphics.Bitmap
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import com.facebook.react.bridge.ReactApplicationContext
import com.freekiosk.CameraPhotoModule
import com.freekiosk.ScreenCapture
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * Publishes screenshots and camera snapshots as JPEG payloads on MQTT so Home Assistant
 * can expose them through the `image` / `camera` MQTT platforms.
 *
 * Captures are expensive and blocking (ScreenCapture waits on the UI thread,
 * CameraPhotoModule opens the camera), so every capture runs on a dedicated single
 * thread. That also serializes camera access and keeps the MQTT callback thread free.
 *
 * All streams are opt-in: nothing is captured or published unless enabled in settings.
 */
class MqttImagePublisher(
    private val reactContext: ReactApplicationContext,
    private val client: KioskMqttClient,
    private val topicPrefix: String,
    config: MqttConfig,
    /** Camera facings actually present on this device ("front" / "back"). */
    val availableFacings: List<String>
) {

    companion object {
        private const val TAG = "MqttImagePublisher"

        /** Minimum delay between two captures of the same stream (absorbs button spam). */
        private const val MIN_CAPTURE_INTERVAL_MS = 2000L

        /** Payload size above which we warn about broker message size limits. */
        private const val LARGE_PAYLOAD_BYTES = 1_000_000

        const val STREAM_SCREENSHOT = "screenshot"
        const val STREAM_CAMERA = "camera"

        const val MIN_INTERVAL_SECONDS = 5
        const val MAX_INTERVAL_SECONDS = 3600
    }

    // ==================== Mutable state (driven by settings + MQTT commands) ====================

    @Volatile var screenshotEnabled: Boolean = config.screenshotEnabled
        private set

    @Volatile var cameraEnabled: Boolean = config.cameraEnabled && availableFacings.isNotEmpty()
        private set

    @Volatile var screenshotAuto: Boolean = config.screenshotAuto
        private set

    @Volatile var cameraAuto: Boolean = config.cameraAuto
        private set

    @Volatile var screenshotIntervalMs: Long = clampIntervalMs(config.screenshotIntervalMs)
        private set

    @Volatile var cameraIntervalMs: Long = clampIntervalMs(config.cameraIntervalMs)
        private set

    @Volatile private var screenshotQuality: Int = config.screenshotQuality.coerceIn(1, 100)
    @Volatile private var screenshotMaxWidth: Int = config.screenshotMaxWidth.coerceAtLeast(0)
    @Volatile private var cameraQuality: Int = config.cameraQuality.coerceIn(1, 100)

    // ==================== Threading ====================

    private val captureExecutor = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "MqttImageCapture")
    }
    private val timerThread = HandlerThread("MqttImageTimer").apply { start() }
    private val timerHandler = Handler(timerThread.looper)

    private val lastCaptureAt = mutableMapOf<String, Long>()
    private val cameraModule by lazy { CameraPhotoModule(reactContext.applicationContext) }

    // ==================== Topics ====================

    /** Image topic for the screenshot stream. */
    fun screenshotTopic(): String = "$topicPrefix/image/$STREAM_SCREENSHOT"

    /** Image topic for a camera stream, e.g. `.../image/camera_front`. */
    fun cameraTopic(facing: String): String = "$topicPrefix/image/${STREAM_CAMERA}_$facing"

    // ==================== Lifecycle ====================

    /**
     * Called once the MQTT connection is up and discovery configs have been published.
     * Publishes a first image for each active stream so Home Assistant is not left empty,
     * then arms the periodic timers.
     */
    fun onConnected() {
        if (screenshotEnabled && screenshotAuto) publishScreenshot()
        if (cameraEnabled && cameraAuto) publishAllCameras()
        restartTimers()
    }

    /**
     * Stop timers and release threads. Never blocks: this can be called from the main thread
     * (MQTT disconnect) while a capture is still running.
     *
     * shutdown() rather than shutdownNow(): the latter interrupts the capture thread, and
     * CameraPhotoModule closes its CameraDevice, session and ImageReader only *after* the
     * latch it waits on. An interrupt there escapes as InterruptedException, skips that
     * cleanup and leaves the camera held by this process, which then breaks motion
     * detection and every later snapshot. shutdown() lets the capture in flight finish
     * and clean up, and is just as non-blocking since we never awaitTermination.
     */
    fun stop() {
        timerHandler.removeCallbacksAndMessages(null)
        timerThread.quitSafely()
        captureExecutor.shutdown()
        Log.d(TAG, "Image publisher stopped")
    }

    // ==================== Commands ====================

    /** Capture the current screen and publish it as JPEG. */
    fun publishScreenshot() {
        if (!screenshotEnabled) {
            Log.d(TAG, "Screenshot publishing is disabled, ignoring request")
            return
        }
        if (!throttle(STREAM_SCREENSHOT)) return

        submitCapture {
            val bytes = ScreenCapture.capture(
                reactContext,
                format = Bitmap.CompressFormat.JPEG,
                quality = screenshotQuality,
                maxWidth = screenshotMaxWidth
            )
            if (bytes == null) {
                Log.w(TAG, "Screenshot capture failed (screen off or no activity), nothing published")
            } else {
                publishImage(screenshotTopic(), bytes, STREAM_SCREENSHOT)
            }
        }
    }

    /** Capture a photo from the given camera facing and publish it as JPEG. */
    fun publishCameraPhoto(facing: String) {
        if (!cameraEnabled) {
            Log.d(TAG, "Camera publishing is disabled, ignoring request")
            return
        }
        val normalized = facing.lowercase()
        if (!availableFacings.contains(normalized)) {
            Log.w(TAG, "No $normalized camera on this device, ignoring request")
            return
        }
        if (!throttle("${STREAM_CAMERA}_$normalized")) return

        submitCapture {
            val stream = cameraModule.capturePhoto(normalized, cameraQuality)
            val bytes = stream?.readBytes()
            if (bytes == null || bytes.isEmpty()) {
                // Most common cause: motion detection currently holds the camera (CAMERA_IN_USE)
                Log.w(TAG, "Camera capture failed for $normalized (camera busy or unavailable), nothing published")
            } else {
                publishImage(cameraTopic(normalized), bytes, "${STREAM_CAMERA}_$normalized")
            }
        }
    }

    /** Publish one photo per available camera facing. */
    private fun publishAllCameras() {
        availableFacings.forEach { publishCameraPhoto(it) }
    }

    /** Toggle periodic publishing for a stream ("screenshot" or "camera"). */
    fun setAutoPublish(stream: String, value: Boolean) {
        when (stream) {
            STREAM_SCREENSHOT -> {
                screenshotAuto = value
                if (value) publishScreenshot()
            }
            STREAM_CAMERA -> {
                cameraAuto = value
                if (value) publishAllCameras()
            }
            else -> {
                Log.w(TAG, "Unknown image stream: $stream")
                return
            }
        }
        Log.i(TAG, "Auto-publish for $stream set to $value")
        restartTimers()
    }

    /**
     * Apply settings changed in the app while MQTT is running, so the user does not have to
     * reconnect. The enabled flags are not part of this: they change the set of discovered
     * entities, which is only published on connect.
     */
    fun applySettings(
        screenshotAuto: Boolean,
        screenshotIntervalSeconds: Int,
        screenshotQuality: Int,
        screenshotMaxWidth: Int,
        cameraAuto: Boolean,
        cameraIntervalSeconds: Int,
        cameraQuality: Int
    ) {
        this.screenshotAuto = screenshotAuto
        this.screenshotIntervalMs = clampIntervalMs(screenshotIntervalSeconds * 1000L)
        this.screenshotQuality = screenshotQuality.coerceIn(1, 100)
        this.screenshotMaxWidth = screenshotMaxWidth.coerceAtLeast(0)
        this.cameraAuto = cameraAuto
        this.cameraIntervalMs = clampIntervalMs(cameraIntervalSeconds * 1000L)
        this.cameraQuality = cameraQuality.coerceIn(1, 100)
        Log.i(
            TAG,
            "Settings applied: screenshot(auto=$screenshotAuto, ${screenshotIntervalMs}ms, " +
                "q=${this.screenshotQuality}, w=${this.screenshotMaxWidth}), " +
                "camera(auto=$cameraAuto, ${cameraIntervalMs}ms, q=${this.cameraQuality})"
        )
        restartTimers()
    }

    /** Change the periodic publishing interval for a stream, in seconds. */
    fun setInterval(stream: String, seconds: Int) {
        val clamped = seconds.coerceIn(MIN_INTERVAL_SECONDS, MAX_INTERVAL_SECONDS)
        when (stream) {
            STREAM_SCREENSHOT -> screenshotIntervalMs = clamped * 1000L
            STREAM_CAMERA -> cameraIntervalMs = clamped * 1000L
            else -> {
                Log.w(TAG, "Unknown image stream: $stream")
                return
            }
        }
        Log.i(TAG, "Interval for $stream set to ${clamped}s")
        restartTimers()
    }

    /**
     * Clear the retained image payloads of the streams that are not enabled, so a disabled
     * stream does not leave an old picture on the broker (and in Home Assistant).
     */
    fun clearDisabledTopics() {
        if (!screenshotEnabled) client.publish(screenshotTopic(), ByteArray(0), qos = 0, retained = true)
        if (!cameraEnabled) {
            availableFacings.forEach {
                client.publish(cameraTopic(it), ByteArray(0), qos = 0, retained = true)
            }
        }
    }

    // ==================== Status ====================

    /** Status block exposed on the state topic, backing the HA switches and numbers. */
    fun statusJson(): JSONObject = JSONObject().apply {
        put("screenshotEnabled", screenshotEnabled)
        put("screenshotAuto", screenshotAuto)
        put("screenshotInterval", screenshotIntervalMs / 1000)
        put("cameraEnabled", cameraEnabled)
        put("cameraAuto", cameraAuto)
        put("cameraInterval", cameraIntervalMs / 1000)
    }

    // ==================== Internals ====================

    /**
     * Run a capture on the dedicated thread. Silently ignored once the publisher is stopped
     * (a command can still arrive while MQTT is disconnecting).
     */
    private fun submitCapture(block: () -> Unit) {
        try {
            captureExecutor.execute {
                try {
                    block()
                } catch (e: Exception) {
                    Log.e(TAG, "Capture failed: ${e.message}", e)
                }
            }
        } catch (e: java.util.concurrent.RejectedExecutionException) {
            Log.d(TAG, "Publisher stopped, capture request ignored")
        }
    }

    private fun publishImage(topic: String, bytes: ByteArray, label: String) {
        if (bytes.size > LARGE_PAYLOAD_BYTES) {
            Log.w(
                TAG,
                "$label payload is ${bytes.size / 1024} KB — some brokers reject large messages " +
                    "(see message_size_limit); lower the quality or max width"
            )
        }
        // Retained so Home Assistant restores the last image after a restart.
        client.publish(topic, bytes, qos = 0, retained = true)
        Log.i(TAG, "Published $label (${bytes.size / 1024} KB) to $topic")
    }

    /**
     * Returns true when a capture is allowed for this stream, false when the last one is
     * too recent. Also records the capture time.
     */
    private fun throttle(key: String): Boolean {
        val now = System.currentTimeMillis()
        synchronized(lastCaptureAt) {
            val last = lastCaptureAt[key] ?: 0L
            if (now - last < MIN_CAPTURE_INTERVAL_MS) {
                Log.d(TAG, "Throttled $key capture (last one ${now - last}ms ago)")
                return false
            }
            lastCaptureAt[key] = now
        }
        return true
    }

    /**
     * Synchronized because it is called from two threads: applySettings() from the JS
     * bridge and setAutoPublish()/setInterval() from the MQTT command dispatch. The
     * runnables re-post themselves, so two interleaved calls (remove, remove, post, post)
     * would leave two timer chains publishing the same stream for good.
     */
    @Synchronized
    private fun restartTimers() {
        timerHandler.removeCallbacksAndMessages(null)

        if (screenshotEnabled && screenshotAuto) {
            val runnable = object : Runnable {
                override fun run() {
                    publishScreenshot()
                    timerHandler.postDelayed(this, screenshotIntervalMs)
                }
            }
            timerHandler.postDelayed(runnable, screenshotIntervalMs)
            Log.d(TAG, "Screenshot auto-publish armed (${screenshotIntervalMs}ms)")
        }

        if (cameraEnabled && cameraAuto) {
            val runnable = object : Runnable {
                override fun run() {
                    publishAllCameras()
                    timerHandler.postDelayed(this, cameraIntervalMs)
                }
            }
            timerHandler.postDelayed(runnable, cameraIntervalMs)
            Log.d(TAG, "Camera auto-publish armed (${cameraIntervalMs}ms)")
        }
    }

    private fun clampIntervalMs(intervalMs: Long): Long =
        intervalMs.coerceIn(MIN_INTERVAL_SECONDS * 1000L, MAX_INTERVAL_SECONDS * 1000L)
}
