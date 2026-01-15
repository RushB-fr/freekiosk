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
                    promise.reject("FILE_NOT_FOUND", "Image file not found: $imagePath")
                    return@execute
                }

                // Load and resize image for performance
                val options = BitmapFactory.Options().apply {
                    inSampleSize = 8 // Reduce to 1/8 size for faster processing (was 4)
                    inPreferredConfig = Bitmap.Config.RGB_565 // Use less memory
                }
                val currentBitmap = BitmapFactory.decodeFile(imagePath, options)

                // Delete file after loading (do this early to free disk space)
                try {
                    file.delete()
                } catch (_: Exception) {}

                if (currentBitmap == null) {
                    promise.reject("DECODE_ERROR", "Failed to decode image")
                    return@execute
                }

                val hasMotion: Boolean
                synchronized(bitmapLock) {
                    hasMotion = if (previousBitmap != null && !previousBitmap!!.isRecycled) {
                        detectMotion(previousBitmap!!, currentBitmap, threshold)
                    } else {
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
            return false
        }

        val width = previous.width
        val height = previous.height
        val sampleSize = 50 // Sample every N pixels

        var differences = 0
        var samples = 0

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

                    val diff = abs(r1 - r2) + abs(g1 - g2) + abs(b1 - b2)

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
        return changeRatio > threshold
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
