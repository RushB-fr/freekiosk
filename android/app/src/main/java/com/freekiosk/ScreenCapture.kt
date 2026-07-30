package com.freekiosk

import android.graphics.Bitmap
import android.util.Log
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.UiThreadUtil
import java.io.ByteArrayOutputStream
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Screen Capture — grabs the current app window as a compressed image.
 *
 * Shared by the REST API (GET /api/screenshot) and the MQTT image publisher, so both
 * produce identical pixels. The capture itself must run on the UI thread; callers are
 * blocked until it completes.
 *
 * IMPORTANT: never call [capture] from the main thread — it waits on a latch that is only
 * released by a runnable posted to the main looper, which would deadlock.
 */
object ScreenCapture {

    // Prefixed: a bare "ScreenCapture" tag collides with SurfaceFlinger's own logs
    private const val TAG = "FreeKioskScreenCapture"
    private const val CAPTURE_TIMEOUT_SECONDS = 5L

    /**
     * Capture the current window content.
     *
     * @param reactContext React context used to reach the current Activity
     * @param format       compression format (PNG for lossless, JPEG for small payloads)
     * @param quality      compression quality 0-100 (ignored by PNG)
     * @param maxWidth     downscale so the image is at most this wide; 0 keeps native size
     * @return compressed image bytes, or null if no Activity/view is available
     */
    fun capture(
        reactContext: ReactContext,
        format: Bitmap.CompressFormat = Bitmap.CompressFormat.PNG,
        quality: Int = 90,
        maxWidth: Int = 0
    ): ByteArray? {
        return try {
            var bytes: ByteArray? = null
            val latch = CountDownLatch(1)

            UiThreadUtil.runOnUiThread {
                try {
                    val activity = reactContext.currentActivity
                    val rootView = activity?.window?.decorView?.rootView

                    if (rootView != null) {
                        @Suppress("DEPRECATION")
                        rootView.isDrawingCacheEnabled = true
                        @Suppress("DEPRECATION")
                        val source = Bitmap.createBitmap(rootView.drawingCache)
                        @Suppress("DEPRECATION")
                        rootView.isDrawingCacheEnabled = false

                        val bitmap = scaleIfNeeded(source, maxWidth)
                        val outputStream = ByteArrayOutputStream()
                        bitmap.compress(format, quality.coerceIn(1, 100), outputStream)
                        bytes = outputStream.toByteArray()

                        if (bitmap !== source) bitmap.recycle()
                        source.recycle()
                    } else {
                        Log.w(TAG, "No activity/root view available for capture")
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to capture screen on UI thread", e)
                } finally {
                    latch.countDown()
                }
            }

            if (!latch.await(CAPTURE_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
                Log.e(TAG, "Timeout waiting for screen capture")
            }
            bytes
        } catch (e: Exception) {
            Log.e(TAG, "Failed to capture screen", e)
            null
        }
    }

    /**
     * Downscale a bitmap so its width is at most [maxWidth], preserving aspect ratio.
     * Returns the original bitmap when no scaling is needed.
     */
    private fun scaleIfNeeded(source: Bitmap, maxWidth: Int): Bitmap {
        if (maxWidth <= 0 || source.width <= maxWidth) return source
        val targetHeight = (source.height.toFloat() * maxWidth / source.width).toInt().coerceAtLeast(1)
        return Bitmap.createScaledBitmap(source, maxWidth, targetHeight, true)
    }
}
