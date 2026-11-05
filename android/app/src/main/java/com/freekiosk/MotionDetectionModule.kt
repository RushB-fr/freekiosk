package com.freekiosk

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.FaceDetector
import android.os.SystemClock
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

    /**
     * "Only wake for a face": motion opens a window of FACE_WINDOW_MS in which a frame with a
     * face triggers. Someone who walks up and then stands still in front of the screen still
     * wakes it. A face on a poster alone does not, since nothing moves, but any motion (a light
     * change, a pet) opens the window, after which it can.
     */
    private var lastMotionAt = 0L

    /** Rotation that last found a face. The camera does not turn, so it is tried first. */
    private var faceRotation = 0

    override fun getName(): String {
        return "MotionDetectionModule"
    }

    @ReactMethod
    fun compareImages(
        imagePath: String,
        threshold: Double,
        requireFace: Boolean,
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

                val triggered: Boolean
                synchronized(bitmapLock) {
                    val hasMotion = if (previousBitmap != null && !previousBitmap!!.isRecycled) {
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

                    triggered = if (requireFace) {
                        // Fail closed: a broken face check must not wake the screen, but say why
                        runCatching { updateWindowAndCheckFace(hasMotion, currentBitmap) }
                            .onFailure { android.util.Log.w("MotionDetection", "Face check failed", it) }
                            .getOrDefault(false)
                    } else {
                        hasMotion
                    }

                    // Store current for next comparison
                    previousBitmap?.let { 
                        if (!it.isRecycled) {
                            it.recycle()
                        }
                    }
                    previousBitmap = currentBitmap
                }

                promise.resolve(triggered)

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
                    lastMotionAt = 0L
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

    /** Motion (re)opens the face window; inside it, a frame with a face triggers. */
    private fun updateWindowAndCheckFace(motion: Boolean, frame: Bitmap): Boolean {
        val now = SystemClock.elapsedRealtime()
        if (motion) lastMotionAt = now
        if (lastMotionAt == 0L || now - lastMotionAt > FACE_WINDOW_MS) return false
        val faces = countFaces(frame)
        android.util.Log.d("MotionDetection", "Face gate: motion=$motion, faces=$faces, rotation=$faceRotation")
        return faces > 0
    }

    /** Faces in the frame, trying each rotation since the sensor may not be upright. */
    private fun countFaces(frame: Bitmap): Int {
        val scale = minOf(1f, FACE_MAX_SIDE.toFloat() / maxOf(frame.width, frame.height))
        // FaceDetector wants an even width; both sides even keeps it even after a 90° turn
        val w = (frame.width * scale).toInt() and 1.inv()
        val h = (frame.height * scale).toInt() and 1.inv()
        val small = Bitmap.createScaledBitmap(frame, w, h, true)
        try {
            for (rotation in listOf(faceRotation) + (listOf(0, 90, 270, 180) - faceRotation)) {
                var turned = if (rotation == 0) small
                    else Bitmap.createBitmap(small, 0, 0, w, h, Matrix().apply { postRotate(rotation.toFloat()) }, false)
                val confident = try {
                    if (turned.config != Bitmap.Config.RGB_565) {
                        // FaceDetector only takes RGB_565
                        turned = turned.copy(Bitmap.Config.RGB_565, false).also { if (turned !== small) turned.recycle() }
                    }
                    val faces = arrayOfNulls<FaceDetector.Face>(MAX_FACES)
                    val found = FaceDetector(turned.width, turned.height, MAX_FACES).findFaces(turned, faces)
                    faces.take(found).count { it != null && it.confidence() >= FaceDetector.Face.CONFIDENCE_THRESHOLD }
                } finally {
                    if (turned !== small) turned.recycle()
                }
                if (confident > 0) {
                    faceRotation = rotation
                    return confident
                }
            }
            return 0
        } finally {
            if (small !== frame) small.recycle()
        }
    }

    companion object {
        // NOTE: fixed values, tune on real devices. The frame is already decoded at
        // inSampleSize=4 (1/4 of the capture), so FACE_MAX_SIDE only caps it further; on the
        // Camera2 fallback (~1280x960 capture) detection runs on ~320x240. More range would need
        // decoding the file at a smaller inSampleSize for the face check.
        private const val FACE_MAX_SIDE = 640
        private const val FACE_WINDOW_MS = 10_000L
        private const val MAX_FACES = 3
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
