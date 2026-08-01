package com.freekiosk.camera

import android.content.Context
import android.util.Log
import java.io.InputStream
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.TimeUnit

/**
 * Owns the single camera stream shared by all MJPEG clients.
 *
 * The camera is opened when the first client connects and released when the last one leaves,
 * so an idle kiosk never holds the sensor. Each client gets its own small frame queue with
 * drop-oldest semantics: a slow reader falls behind on frames instead of stalling the capture
 * loop for everyone.
 */
class CameraStreamManager(private val context: Context) {

    companion object {
        private const val TAG = "CameraStreamManager"

        /** Concurrent viewers. Each one costs a socket and a JPEG copy per frame. */
        private const val MAX_CLIENTS = 2

        /** Frames buffered per client before the oldest is dropped. */
        private const val QUEUE_CAPACITY = 2

        /** Give up on a stream that received no frame for this long. */
        private const val FRAME_TIMEOUT_MS = 10_000L

        /**
         * Attempts to open the camera when another component (motion detection) has just been
         * asked to release it. Retrying is more reliable than guessing a single delay that
         * would fit every device.
         */
        private const val OPEN_ATTEMPTS_WHEN_BUSY = 3
        private const val RETRY_DELAY_MS = 700L
    }

    data class StreamParams(
        val facing: String,
        val fps: Int,
        val quality: Int,
        val maxWidth: Int,
        val rotate: Int?
    )

    sealed class StreamResult {
        data class Ok(val client: StreamClient) : StreamResult()
        data class Error(val message: String) : StreamResult()
    }

    /**
     * Called before opening the camera; returns how long to wait (ms) for another component
     * to release it. Used to let motion detection stop first.
     */
    var prepareCamera: (() -> Long)? = null

    /** Called after the camera has been released, so motion detection can resume. */
    var releaseCamera: (() -> Unit)? = null

    private val clients = CopyOnWriteArrayList<StreamClient>()
    private var source: Camera2MjpegSource? = null
    private var activeParams: StreamParams? = null
    private val lock = Any()

    /** Whether a stream is currently running (used to report state to JS). */
    val isStreaming: Boolean
        get() = source != null

    fun openClient(params: StreamParams): StreamResult {
        synchronized(lock) {
            if (clients.size >= MAX_CLIENTS) {
                return StreamResult.Error("Too many stream clients (max $MAX_CLIENTS)")
            }

            if (source == null) {
                if (!startSource(params)) {
                    return StreamResult.Error(
                        "Camera unavailable. It is likely in use by motion detection."
                    )
                }
                activeParams = params
            } else if (activeParams?.facing != params.facing) {
                return StreamResult.Error(
                    "Another client is already streaming the ${activeParams?.facing} camera"
                )
            }

            val client = StreamClient()
            clients.add(client)
            Log.i(TAG, "Client connected (${clients.size}/$MAX_CLIENTS)")
            return StreamResult.Ok(client)
        }
    }

    private fun startSource(params: StreamParams): Boolean {
        val waitMs = try {
            prepareCamera?.invoke() ?: 0L
        } catch (e: Exception) {
            Log.w(TAG, "prepareCamera failed: ${e.message}")
            0L
        }
        if (waitMs > 0) {
            Log.d(TAG, "Waiting ${waitMs}ms for the camera to be released")
            sleepQuietly(waitMs)
        }

        // When something else was holding the camera, releasing it is asynchronous: retry a
        // few times rather than failing on a single unlucky attempt.
        val attempts = if (waitMs > 0) OPEN_ATTEMPTS_WHEN_BUSY else 1
        for (attempt in 1..attempts) {
            if (attempt > 1) {
                Log.d(TAG, "Camera still busy, retrying ($attempt/$attempts)")
                sleepQuietly(RETRY_DELAY_MS)
            }

            val newSource = Camera2MjpegSource(
                context = context,
                facing = params.facing,
                targetFps = params.fps,
                quality = params.quality,
                maxWidth = params.maxWidth,
                rotationOverride = params.rotate
            )

            if (newSource.start { frame -> dispatchFrame(frame) }) {
                source = newSource
                Log.i(TAG, "Camera stream started (${params.facing}, ${params.fps} fps)")
                return true
            }
        }

        Log.e(TAG, "Could not open the camera after $attempts attempt(s)")
        releaseCamera?.invoke()
        return false
    }

    private fun sleepQuietly(millis: Long) {
        try {
            Thread.sleep(millis)
        } catch (e: InterruptedException) {
            Thread.currentThread().interrupt()
        }
    }

    private fun dispatchFrame(frame: ByteArray) {
        for (client in clients) {
            client.offer(frame)
        }
    }

    private fun closeClient(client: StreamClient) {
        synchronized(lock) {
            if (!clients.remove(client)) return
            Log.i(TAG, "Client disconnected (${clients.size} left)")
            if (clients.isEmpty()) {
                source?.stop()
                source = null
                activeParams = null
                try {
                    releaseCamera?.invoke()
                } catch (e: Exception) {
                    Log.w(TAG, "releaseCamera failed: ${e.message}")
                }
                Log.i(TAG, "No client left, camera released")
            }
        }
    }

    /** Stop everything, e.g. when the HTTP server shuts down. */
    fun stopAll() {
        synchronized(lock) {
            clients.forEach { it.markClosed() }
            clients.clear()
            source?.stop()
            source = null
            activeParams = null
        }
    }

    /**
     * One connected viewer. Frames are pushed by the camera thread and pulled by the HTTP
     * worker thread serving the multipart response.
     */
    inner class StreamClient {
        private val queue = ArrayBlockingQueue<ByteArray>(QUEUE_CAPACITY)
        @Volatile private var closed = false

        internal fun offer(frame: ByteArray) {
            if (closed) return
            // Drop the oldest frame rather than blocking the camera thread
            if (!queue.offer(frame)) {
                queue.poll()
                queue.offer(frame)
            }
        }

        internal fun markClosed() {
            closed = true
        }

        /** Next frame, or null when the stream ended or timed out. */
        fun nextFrame(): ByteArray? {
            if (closed) return null
            return queue.poll(FRAME_TIMEOUT_MS, TimeUnit.MILLISECONDS)
        }

        fun close() {
            if (closed) return
            closed = true
            queue.clear()
            closeClient(this)
        }
    }

    /**
     * Body of a `multipart/x-mixed-replace` response: an endless sequence of JPEG parts.
     * Closing the stream (client disconnect, server shutdown) releases the underlying client.
     */
    class MjpegInputStream(
        private val client: StreamClient,
        private val boundary: String
    ) : InputStream() {

        private var chunk: ByteArray = ByteArray(0)
        private var position = 0

        private fun ensureChunk(): Boolean {
            if (position < chunk.size) return true
            val frame = client.nextFrame() ?: return false
            val header = (
                "--$boundary\r\n" +
                    "Content-Type: image/jpeg\r\n" +
                    "Content-Length: ${frame.size}\r\n\r\n"
                ).toByteArray()
            chunk = ByteArray(header.size + frame.size + 2)
            System.arraycopy(header, 0, chunk, 0, header.size)
            System.arraycopy(frame, 0, chunk, header.size, frame.size)
            chunk[chunk.size - 2] = '\r'.code.toByte()
            chunk[chunk.size - 1] = '\n'.code.toByte()
            position = 0
            return true
        }

        override fun read(): Int {
            if (!ensureChunk()) return -1
            return chunk[position++].toInt() and 0xFF
        }

        override fun read(b: ByteArray, off: Int, len: Int): Int {
            if (!ensureChunk()) return -1
            val available = chunk.size - position
            val count = minOf(len, available)
            System.arraycopy(chunk, position, b, off, count)
            position += count
            return count
        }

        override fun close() {
            client.close()
            super.close()
        }
    }
}
