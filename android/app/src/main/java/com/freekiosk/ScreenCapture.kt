package com.freekiosk

import android.graphics.Bitmap
import android.os.Build
import android.util.Log
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.common.LifecycleState
import java.io.ByteArrayOutputStream

/**
 * Screen capture, shared by every channel that needs a picture of the screen: the REST API
 * (`GET /api/screenshot`), the cloud `screenshot` command, and the MQTT image publisher.
 * One implementation means all three see the same pixels and inherit the same fixes.
 *
 * The capture logic below was moved here unchanged from `HttpServerModule`, where it grew
 * with #229. Only three things were added on the way: the [format], [quality] and [maxWidth]
 * parameters, so a caller can ask for a small JPEG instead of a full-resolution PNG.
 *
 * IMPORTANT: never call [capture] from the main thread. Both paths block, and the PixelCopy
 * one waits on a latch that is only released from a runnable posted to the main looper,
 * which would deadlock.
 */
object ScreenCapture {

    // Prefixed: a bare "ScreenCapture" tag collides with SurfaceFlinger's own logs
    private const val TAG = "FreeKioskScreenCapture"

    // #229: time the window manager needs to drop the secure flag from every layer
    // after the Device Owner screen-capture policy is lifted.
    private const val POLICY_SETTLE_MS = 300L

    // #229: if the first capture still comes back black, the flag had not propagated
    // to every layer yet, so wait this much longer and retake once.
    private const val POLICY_SETTLE_RETRY_MS = 700L

    // #229: why the last capture failed, so the REST endpoint and the cloud command result
    // can answer with the cause instead of a bare "not available".
    @Volatile
    var lastError: String? = null
        private set

    // Serializes captures: the channels (REST + cloud + MQTT) can fire at once, and the
    // accessibility path toggles a device-wide policy that must not be restored while
    // another capture is still running.
    private val screenshotLock = Any()

    /**
     * Capture the current screen.
     *
     * Two capture paths, because neither one covers every case (#229):
     *
     * - PixelCopy on our own Activity window. Cheap, not rate-limited, and immune to the
     *   Device Owner screen-capture policy, but it only works while FreeKiosk is on
     *   screen. In multi-app mode the external app runs in its own task, our Activity is
     *   stopped and its ViewRootImpl surface released, so PixelCopy throws
     *   "Window doesn't have a backing surface!" (and would capture an empty FreeKiosk
     *   window even if it didn't).
     * - AccessibilityService.takeScreenshot(). Captures the real display whatever app is
     *   in front, needs API 30+ and the accessibility service enabled, and is blacked out
     *   by the Device Owner screen-capture policy unless we lift it around the capture.
     *
     * So: PixelCopy while we are in the foreground, accessibility otherwise, each one
     * falling back to the other.
     *
     * @param reactContext React context used to reach the current Activity and the policy
     * @param format       compression format (PNG for lossless, JPEG for small payloads)
     * @param quality      compression quality 1-100 (ignored by PNG)
     * @param maxWidth     downscale so the image is at most this wide; 0 keeps native size
     */
    fun capture(
        reactContext: ReactContext,
        format: Bitmap.CompressFormat = Bitmap.CompressFormat.PNG,
        quality: Int = 90,
        maxWidth: Int = 0,
    ): ByteArray? = synchronized(screenshotLock) {
        lastError = null
        val foreground = reactContext.lifecycleState == LifecycleState.RESUMED

        if (foreground) {
            capturePixelCopy(reactContext, format, quality, maxWidth)?.let { return it }
            captureViaAccessibility(reactContext, format, quality, maxWidth)?.let { return it }
        } else {
            captureViaAccessibility(reactContext, format, quality, maxWidth)?.let { return it }
            // Keep the accessibility reason: it names what to fix (policy, service not
            // enabled, Android version), whereas PixelCopy's fallback failure would just
            // overwrite it with "window is not on screen", which is the situation, not the
            // cause.
            val accessibilityError = lastError
            capturePixelCopy(reactContext, format, quality, maxWidth)?.let { return it }
            if (accessibilityError != null) {
                lastError = accessibilityError
            }
        }

        if (lastError == null) {
            lastError = "Screenshot capture failed"
        }
        Log.e(TAG, "Screenshot unavailable (foreground=$foreground): $lastError")
        return null
    }

    /**
     * PixelCopy on the FreeKiosk Activity window. Captures hardware-accelerated layers
     * (WebView, video, SurfaceView) correctly, unlike the deprecated drawingCache which
     * rendered them black.
     */
    private fun capturePixelCopy(
        reactContext: ReactContext,
        format: Bitmap.CompressFormat,
        quality: Int,
        maxWidth: Int,
    ): ByteArray? {
        return try {
            var screenshot: ByteArray? = null
            val latch = java.util.concurrent.CountDownLatch(1)

            UiThreadUtil.runOnUiThread {
                try {
                    val activity = reactContext.currentActivity
                    val window = activity?.window
                    val decorView = window?.decorView

                    if (window != null && decorView != null &&
                        decorView.width > 0 && decorView.height > 0
                    ) {
                        // PixelCopy is asynchronous, so the latch is released from the copy
                        // callback (and from every early-out path).
                        val bitmap = Bitmap.createBitmap(
                            decorView.width,
                            decorView.height,
                            Bitmap.Config.ARGB_8888,
                        )
                        val copyThread = android.os.HandlerThread("ScreenshotPixelCopy").apply { start() }
                        val copyHandler = android.os.Handler(copyThread.looper)
                        android.view.PixelCopy.request(
                            window,
                            bitmap,
                            { copyResult ->
                                try {
                                    if (copyResult == android.view.PixelCopy.SUCCESS) {
                                        screenshot = encode(bitmap, format, quality, maxWidth)
                                    } else {
                                        lastError = "PixelCopy failed (result $copyResult)"
                                        Log.e(TAG, "PixelCopy failed with result: $copyResult")
                                    }
                                } catch (e: Exception) {
                                    lastError = "Failed to encode screenshot: ${e.message}"
                                    Log.e(TAG, "Failed to encode screenshot bitmap", e)
                                } finally {
                                    bitmap.recycle()
                                    copyThread.quitSafely()
                                    latch.countDown()
                                }
                            },
                            copyHandler,
                        )
                    } else {
                        lastError = "FreeKiosk window is not on screen"
                        Log.e(TAG, "Cannot capture screenshot: no valid window/decorView")
                        latch.countDown()
                    }
                } catch (e: Exception) {
                    // IllegalArgumentException("Window doesn't have a backing surface!") when
                    // our Activity is stopped behind an external app (multi-app mode, #229).
                    lastError = "FreeKiosk window is not on screen (${e.message})"
                    Log.e(TAG, "Failed to capture screenshot on UI thread", e)
                    latch.countDown()
                }
            }

            // Wait for UI thread to complete (max 5 seconds)
            latch.await(5, java.util.concurrent.TimeUnit.SECONDS)
            screenshot
        } catch (e: Exception) {
            lastError = "Screenshot capture error: ${e.message}"
            Log.e(TAG, "Failed to capture screenshot", e)
            null
        }
    }

    /**
     * #229: full-display capture through the accessibility service, the only path that
     * sees an external app launched in multi-app mode.
     *
     * In Device Owner kiosk mode the screen-capture policy set by startLockTask (#172)
     * blacks out every layer, so it is lifted for the duration of the capture and restored
     * in the finally block. That brief window is opt-in via the "Allow remote screenshots"
     * setting, since it also re-enables the Power+Volume Down combo for those few hundred
     * milliseconds.
     */
    private fun captureViaAccessibility(
        reactContext: ReactContext,
        format: Bitmap.CompressFormat,
        quality: Int,
        maxWidth: Int,
    ): ByteArray? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            lastError = "Full-screen capture requires Android 11+"
            return null
        }
        if (!FreeKioskAccessibilityService.isRunning()) {
            lastError = "Accessibility service is not enabled (required to capture another app)"
            return null
        }
        if (!FreeKioskAccessibilityService.canTakeScreenshot()) {
            lastError = "Accessibility service is enabled but has no screenshot capability: " +
                "disable and re-enable FreeKiosk in Android accessibility settings"
            return null
        }

        var policyLifted = false
        return try {
            if (KioskModule.isScreenCapturePolicyBlocked(reactContext)) {
                if (!isRemoteScreenshotAllowed(reactContext)) {
                    lastError = "Screen capture is blocked by the Device Owner policy: " +
                        "enable 'Allow remote screenshots' in Security settings"
                    return null
                }
                policyLifted = KioskModule.setScreenCapturePolicyBlocked(reactContext, false)
                if (policyLifted) {
                    // The window manager needs a beat to drop the secure flag from the
                    // layers, otherwise the capture still comes back black.
                    Thread.sleep(POLICY_SETTLE_MS)
                }
            }

            var bitmap = FreeKioskAccessibilityService.captureScreen()
            if (bitmap != null && policyLifted && isBlankFrame(bitmap)) {
                // POLICY_SETTLE_MS is a best guess at how long the window manager needs to
                // drop the secure flag; an all-black frame says it was not enough on this
                // device, so the wait extends itself rather than returning a black PNG.
                Log.w(TAG, "Screenshot came back black after lifting the capture policy, retrying")
                bitmap.recycle()
                Thread.sleep(POLICY_SETTLE_RETRY_MS)
                bitmap = FreeKioskAccessibilityService.captureScreen()
            }
            if (bitmap == null) {
                lastError = "Accessibility screenshot failed (see logcat)"
                return null
            }
            val bytes = encode(bitmap, format, quality, maxWidth)
            bitmap.recycle()
            bytes
        } catch (e: Exception) {
            lastError = "Accessibility screenshot error: ${e.message}"
            Log.e(TAG, "Failed to capture screenshot via accessibility service", e)
            null
        } finally {
            if (policyLifted) {
                KioskModule.setScreenCapturePolicyBlocked(reactContext, true)
            }
        }
    }

    /**
     * #229: is every sampled pixel opaque black? That is what a capture blocked by the
     * screen-capture policy looks like. A genuinely black screen (dim screensaver, video
     * letterbox) costs one extra capture and is then returned as-is.
     */
    private fun isBlankFrame(bitmap: Bitmap): Boolean {
        val stepX = maxOf(1, bitmap.width / 16)
        val stepY = maxOf(1, bitmap.height / 16)
        var y = 0
        while (y < bitmap.height) {
            var x = 0
            while (x < bitmap.width) {
                if ((bitmap.getPixel(x, y) and 0x00FFFFFF) != 0) return false
                x += stepX
            }
            y += stepY
        }
        return true
    }

    /**
     * #229: reads @kiosk_allow_remote_screenshot straight from the AsyncStorage database,
     * same trick as KioskModule. The capture can run while JS is paused behind an
     * external app, so we cannot ask the JS side.
     */
    private fun isRemoteScreenshotAllowed(reactContext: ReactContext): Boolean {
        return try {
            val dbPath = reactContext.getDatabasePath("RKStorage").absolutePath
            val db = android.database.sqlite.SQLiteDatabase.openDatabase(
                dbPath, null, android.database.sqlite.SQLiteDatabase.OPEN_READONLY,
            )
            val cursor = db.rawQuery(
                "SELECT value FROM catalystLocalStorage WHERE key = ?",
                arrayOf("@kiosk_allow_remote_screenshot"),
            )
            val result = if (cursor.moveToFirst()) cursor.getString(0) == "true" else false
            cursor.close()
            db.close()
            result
        } catch (e: Exception) {
            Log.w(TAG, "Could not read remote screenshot setting: ${e.message}")
            false
        }
    }

    /**
     * Compress a captured bitmap, downscaling it first when [maxWidth] asks for it. The
     * source is left alone: the callers above own it and recycle it themselves.
     */
    private fun encode(
        source: Bitmap,
        format: Bitmap.CompressFormat,
        quality: Int,
        maxWidth: Int,
    ): ByteArray {
        val scaled = scaleIfNeeded(source, maxWidth)
        val outputStream = ByteArrayOutputStream()
        scaled.compress(format, quality.coerceIn(1, 100), outputStream)
        if (scaled !== source) scaled.recycle()
        return outputStream.toByteArray()
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
