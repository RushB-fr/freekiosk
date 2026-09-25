package com.freekiosk

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import com.facebook.react.bridge.*
import java.io.File
import java.util.concurrent.Executors
import kotlin.math.abs

class MotionDetectionModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private var previousBitmap: Bitmap? = null
    private val bitmapLock = Any()
    private val executor = Executors.newSingleThreadExecutor()

    /**
     * Comparisons made since the reference frame was taken.
     *
     * The reference is simply the first frame handed to us after a reset, and on an
     * external UVC camera that frame is whatever the sensor produced before it
     * stabilised: black, green, or half a picture. Comparing a real scene against it
     * reports motion every single time, whatever the room contains, which is how a
     * screensaver came to dismiss itself 9.2 seconds after activating in an empty room
     * (issue #262).
     *
     * So the first comparison after a reset is discarded and its frame becomes the new
     * reference. That costs one extra frame of latency at startup and nothing at all
     * afterwards, which is why it is preferred to requiring two consecutive detections:
     * that would have doubled the latency of every real detection for ever.
     */
    private var comparisonsSinceReset = 0

    override fun getName(): String {
        return "MotionDetectionModule"
    }

    @ReactMethod
    fun compareImages(
        imagePath: String,
        threshold: Double,
        promise: Promise
    ) {
        // Run image processing on background thread to avoid ANR
        executor.execute {
            try {
                val file = File(imagePath)
                if (!file.exists()) {
                    android.util.Log.w("MotionDetection", "Image file not found: $imagePath")
                    promise.reject("FILE_NOT_FOUND", "Image file not found: $imagePath")
                    return@execute
                }

                // Load and resize image for performance
                val options = BitmapFactory.Options().apply {
                    inSampleSize = 4 // Reduce to 1/4 size (was 1/8 - too aggressive)
                    inPreferredConfig = Bitmap.Config.RGB_565 // Use less memory
                }
                val currentBitmap = BitmapFactory.decodeFile(imagePath, options)

                // Delete file after loading (do this early to free disk space)
                try {
                    file.delete()
                } catch (_: Exception) {}

                if (currentBitmap == null) {
                    android.util.Log.w("MotionDetection", "Failed to decode image")
                    promise.reject("DECODE_ERROR", "Failed to decode image")
                    return@execute
                }

                val hasMotion: Boolean
                synchronized(bitmapLock) {
                    hasMotion = if (previousBitmap != null && !previousBitmap!!.isRecycled) {
                        val detected = detectMotion(previousBitmap!!, currentBitmap, threshold)
                        comparisonsSinceReset++
                        if (comparisonsSinceReset == 1) {
                            // Warm-up: the reference was the camera's first frame, which is
                            // not a picture of the room. See comparisonsSinceReset (#262).
                            if (detected) {
                                android.util.Log.d("MotionDetection", "Discarding motion on the first comparison after reset (camera warm-up)")
                            }
                            false
                        } else {
                            detected
                        }
                    } else {
                        android.util.Log.d("MotionDetection", "First frame captured (${currentBitmap.width}x${currentBitmap.height}), storing reference")
                        comparisonsSinceReset = 0
                        false // First image, no comparison
                    }

                    // Store current for next comparison
                    previousBitmap?.let { 
                        if (!it.isRecycled) {
                            it.recycle()
                        }
                    }
                    previousBitmap = currentBitmap
                }

                promise.resolve(hasMotion)

            } catch (e: Exception) {
                android.util.Log.e("MotionDetection", "Motion detection error: ${e.message}")
                promise.reject("ERROR", "Motion detection error: ${e.message}")
            }
        }
    }

    @ReactMethod
    fun reset(promise: Promise) {
        executor.execute {
            try {
                synchronized(bitmapLock) {
                    previousBitmap?.let {
                        if (!it.isRecycled) {
                            it.recycle()
                        }
                    }
                    previousBitmap = null
                    comparisonsSinceReset = 0
                }
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("ERROR", "Reset error: ${e.message}")
            }
        }
    }

    private fun detectMotion(previous: Bitmap, current: Bitmap, threshold: Double): Boolean {
        // Quick null/recycled check
        if (previous.isRecycled || current.isRecycled) {
            return false
        }
        
        if (previous.width != current.width || previous.height != current.height) {
            android.util.Log.w("MotionDetection", "Image size mismatch: ${previous.width}x${previous.height} vs ${current.width}x${current.height}")
            return false
        }

        val width = previous.width
        val height = previous.height
        // Sample every 4 pixels - images are already downscaled so we need thorough sampling
        // With inSampleSize=4, a 4000x3000 image becomes ~1000x750, sampled every 4px = ~47K samples
        val sampleSize = 4

        var differences = 0
        var samples = 0
        var totalDiff: Long = 0

        try {
            for (y in 0 until height step sampleSize) {
                for (x in 0 until width step sampleSize) {
                    val pixel1 = previous.getPixel(x, y)
                    val pixel2 = current.getPixel(x, y)

                    val r1 = (pixel1 shr 16) and 0xFF
                    val g1 = (pixel1 shr 8) and 0xFF
                    val b1 = pixel1 and 0xFF

                    val r2 = (pixel2 shr 16) and 0xFF
                    val g2 = (pixel2 shr 8) and 0xFF
                    val b2 = pixel2 and 0xFF

                    // Use luminance-based comparison - more reliable in low-light conditions
                    val lum1 = 0.299 * r1 + 0.587 * g1 + 0.114 * b1
                    val lum2 = 0.299 * r2 + 0.587 * g2 + 0.114 * b2
                    val lumDiff = abs(lum1 - lum2).toInt()

                    // Also check RGB diff for color changes
                    val rgbDiff = abs(r1 - r2) + abs(g1 - g2) + abs(b1 - b2)

                    // Use the max of luminance diff (scaled) and rgb diff
                    val diff = maxOf(lumDiff * 3, rgbDiff)
                    totalDiff += diff

                    // If pixel difference > 30 (out of 765 max), count as changed
                    if (diff > 30) {
                        differences++
                    }
                    samples++
                }
            }
        } catch (_: Exception) {
            // Bitmap was recycled during iteration
            return false
        }

        val changeRatio = if (samples > 0) differences.toDouble() / samples else 0.0
        val avgDiff = if (samples > 0) totalDiff.toDouble() / samples else 0.0
        val result = changeRatio > threshold
        
        // Log comparison results for debugging
        android.util.Log.d("MotionDetection", "Compare: ${width}x${height}, samples=$samples, changed=$differences, ratio=${"%,.4f".format(changeRatio)}, avgDiff=${"%,.1f".format(avgDiff)}, threshold=$threshold, motion=$result")
        
        return result
    }

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        executor.shutdown()
        synchronized(bitmapLock) {
            previousBitmap?.let {
                if (!it.isRecycled) {
                    it.recycle()
                }
            }
            previousBitmap = null
        }
    }
}
