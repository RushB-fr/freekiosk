package com.freekiosk

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.ImageFormat
import android.graphics.SurfaceTexture
import android.hardware.camera2.*
import android.media.ImageReader
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import android.util.Size
import androidx.core.content.ContextCompat
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Camera Photo Module - Captures photos via Camera2 API
 * Used by the REST API to serve photos via GET /api/camera/photo
 */
class CameraPhotoModule(private val context: Context) {

    companion object {
        private const val TAG = "CameraPhotoModule"
        private const val CAPTURE_TIMEOUT_SECONDS = 10L

        /** Rotate the picture upright from the sensor and display orientation (#253). */
        const val ROTATION_AUTO = -1

        /**
         * The Camera Rotation setting when one is stored (0/90/180/270), [ROTATION_AUTO]
         * otherwise. Shared with the live stream, for sensors the formula gets wrong.
         */
        const val ROTATION_DEFAULT = -2

        private const val ROTATION_SETTING_KEY = "@kiosk_camera_stream_rotate"
    }

    /**
     * Capture a photo from the specified camera
     * @param cameraFacing "front" or "back" (default: "back")
     * @param quality JPEG compression quality 0-100 (default: 80)
     * @param rotation clockwise degrees applied to the pixels (0, 90, 180, 270),
     *   [ROTATION_AUTO] or [ROTATION_DEFAULT]. Default 0: the raw sensor frame, which is
     *   what motion detection wants, with no re-encoding cost.
     * @return ByteArrayInputStream of JPEG data, or null on failure
     */
    fun capturePhoto(cameraFacing: String = "back", quality: Int = 80, rotation: Int = 0): ByteArrayInputStream? {
        // Check camera permission
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) 
            != PackageManager.PERMISSION_GRANTED) {
            Log.e(TAG, "Camera permission not granted")
            return null
        }

        val cameraManager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
        
        // Find the requested camera
        val cameraId = findCameraId(cameraManager, cameraFacing)
        if (cameraId == null) {
            Log.e(TAG, "No $cameraFacing camera found")
            return null
        }

        Log.d(TAG, "Capturing photo from camera: $cameraId ($cameraFacing), quality: $quality")

        // Start background thread for camera operations
        val handlerThread = HandlerThread("CameraPhotoThread")
        handlerThread.start()
        val handler = Handler(handlerThread.looper)

        var resultStream: ByteArrayInputStream? = null
        val latch = CountDownLatch(1)

        try {
            // Get optimal image size
            val characteristics = cameraManager.getCameraCharacteristics(cameraId)
            val map = characteristics.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
            val outputSizes = map?.getOutputSizes(ImageFormat.JPEG) ?: emptyArray()
            
            val requested = if (rotation == ROTATION_DEFAULT) storedRotation() else rotation
            val degrees = if (requested == ROTATION_AUTO) autoRotation(characteristics) else requested
            // Pick a reasonable size (not too large for API response speed)
            val targetSize = selectOptimalSize(outputSizes)
            Log.d(TAG, "Selected capture size: ${targetSize.width}x${targetSize.height}")

            // Create ImageReader
            val imageReader = ImageReader.newInstance(
                targetSize.width, targetSize.height, ImageFormat.JPEG, 1
            )

            imageReader.setOnImageAvailableListener({ reader ->
                val image = reader.acquireLatestImage()
                if (image != null) {
                    try {
                        val buffer = image.planes[0].buffer
                        val bytes = ByteArray(buffer.remaining())
                        buffer.get(bytes)
                        
                        // JPEG quality is set in the capture request; the frame is only
                        // re-encoded when it has to be rotated.
                        val output = rotateJpeg(bytes, degrees, quality)
                        resultStream = ByteArrayInputStream(output)
                        Log.d(TAG, "Photo captured: ${output.size} bytes, rotated $degrees")
                    } finally {
                        image.close()
                        latch.countDown()
                    }
                }
            }, handler)

            // Open camera and capture
            val cameraLatch = CountDownLatch(1)
            var cameraDevice: CameraDevice? = null

            cameraManager.openCamera(cameraId, object : CameraDevice.StateCallback() {
                override fun onOpened(camera: CameraDevice) {
                    cameraDevice = camera
                    cameraLatch.countDown()
                }

                override fun onDisconnected(camera: CameraDevice) {
                    camera.close()
                    cameraLatch.countDown()
                }

                override fun onError(camera: CameraDevice, error: Int) {
                    Log.e(TAG, "Camera error: $error")
                    camera.close()
                    cameraLatch.countDown()
                    latch.countDown()
                }
            }, handler)

            // Wait for camera to open
            if (!cameraLatch.await(5, TimeUnit.SECONDS)) {
                Log.e(TAG, "Timeout waiting for camera to open")
                handlerThread.quitSafely()
                return null
            }

            val camera = cameraDevice
            if (camera == null) {
                Log.e(TAG, "Camera failed to open")
                handlerThread.quitSafely()
                return null
            }

            // Create a dummy surface for preview (required by some devices)
            val dummyTexture = SurfaceTexture(0)
            dummyTexture.setDefaultBufferSize(targetSize.width, targetSize.height)
            val dummySurface = android.view.Surface(dummyTexture)
            
            val surfaces = listOf(dummySurface, imageReader.surface)

            // Create capture session
            val sessionLatch = CountDownLatch(1)
            var captureSession: CameraCaptureSession? = null

            camera.createCaptureSession(surfaces, object : CameraCaptureSession.StateCallback() {
                override fun onConfigured(session: CameraCaptureSession) {
                    captureSession = session
                    sessionLatch.countDown()
                }

                override fun onConfigureFailed(session: CameraCaptureSession) {
                    Log.e(TAG, "Capture session configuration failed")
                    sessionLatch.countDown()
                    latch.countDown()
                }
            }, handler)

            // Wait for session
            if (!sessionLatch.await(5, TimeUnit.SECONDS)) {
                Log.e(TAG, "Timeout waiting for capture session")
                camera.close()
                dummySurface.release()
                dummyTexture.release()
                handlerThread.quitSafely()
                return null
            }

            val session = captureSession
            if (session == null) {
                Log.e(TAG, "Capture session failed")
                camera.close()
                dummySurface.release()
                dummyTexture.release()
                handlerThread.quitSafely()
                return null
            }

            // Send a few preview frames first to let auto-exposure/focus settle
            try {
                val previewRequest = camera.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW).apply {
                    addTarget(dummySurface)
                    set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE)
                    set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON)
                }.build()
                
                session.setRepeatingRequest(previewRequest, null, handler)
                // Give auto-exposure time to settle
                Thread.sleep(800)
                session.stopRepeating()
            } catch (e: Exception) {
                Log.w(TAG, "Preview warmup failed (non-fatal): ${e.message}")
            }

            // Now capture the actual photo
            val captureRequest = camera.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE).apply {
                addTarget(imageReader.surface)
                set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE)
                set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON)
                set(CaptureRequest.JPEG_QUALITY, quality.coerceIn(1, 100).toByte())
            }.build()

            session.capture(captureRequest, object : CameraCaptureSession.CaptureCallback() {
                override fun onCaptureCompleted(
                    session: CameraCaptureSession,
                    request: CaptureRequest,
                    result: TotalCaptureResult
                ) {
                    Log.d(TAG, "Capture completed")
                }

                override fun onCaptureFailed(
                    session: CameraCaptureSession,
                    request: CaptureRequest,
                    failure: CaptureFailure
                ) {
                    Log.e(TAG, "Capture failed: ${failure.reason}")
                    latch.countDown()
                }
            }, handler)

            // Wait for image
            if (!latch.await(CAPTURE_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
                Log.e(TAG, "Timeout waiting for photo capture")
            }

            // Cleanup
            session.close()
            camera.close()
            imageReader.close()
            dummySurface.release()
            dummyTexture.release()

        } catch (e: SecurityException) {
            Log.e(TAG, "Camera permission denied: ${e.message}")
        } catch (e: CameraAccessException) {
            Log.e(TAG, "Camera access error: ${e.message}")
        } catch (e: Exception) {
            Log.e(TAG, "Unexpected error during capture: ${e.message}", e)
        } finally {
            handlerThread.quitSafely()
        }

        return resultStream
    }

    /**
     * #253: rotation that makes the picture upright, from the formula documented on
     * CaptureRequest.JPEG_ORIENTATION. The pixels are rotated rather than setting that key,
     * because the frame also goes to consumers that ignore EXIF (Home Assistant's generic
     * camera, MQTT image entities). Some sensors are mounted against what the formula
     * assumes (a Xiaomi front camera measured 180 off); the Camera Rotation setting and
     * the REST `rotate` parameter cover those.
     */
    private fun autoRotation(characteristics: CameraCharacteristics): Int {
        val sensor = characteristics.get(CameraCharacteristics.SENSOR_ORIENTATION) ?: 0
        val front = characteristics.get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_FRONT
        val displayRotation = try {
            val dm = context.getSystemService(Context.DISPLAY_SERVICE) as android.hardware.display.DisplayManager
            when (dm.getDisplay(android.view.Display.DEFAULT_DISPLAY)?.rotation) {
                android.view.Surface.ROTATION_90 -> 90
                android.view.Surface.ROTATION_180 -> 180
                android.view.Surface.ROTATION_270 -> 270
                else -> 0
            }
        } catch (e: Exception) { 0 }
        var device = (360 - displayRotation) % 360
        if (front) device = -device
        val result = (sensor + device + 360) % 360
        Log.d(TAG, "Auto rotation: $result (sensor=$sensor, display=$displayRotation, front=$front)")
        return result
    }

    /** Camera Rotation setting, read where the settings screen stores it. */
    private fun storedRotation(): Int = try {
        val db = android.database.sqlite.SQLiteDatabase.openDatabase(
            context.getDatabasePath("RKStorage").absolutePath, null,
            android.database.sqlite.SQLiteDatabase.OPEN_READONLY
        )
        val value = db.rawQuery(
            "SELECT value FROM catalystLocalStorage WHERE key = ?", arrayOf(ROTATION_SETTING_KEY)
        ).use { c -> if (c.moveToFirst()) c.getString(0) else null }
        db.close()
        value?.toIntOrNull()?.takeIf { it in listOf(0, 90, 180, 270) } ?: ROTATION_AUTO
    } catch (e: Exception) {
        ROTATION_AUTO
    }

    private fun rotateJpeg(bytes: ByteArray, degrees: Int, quality: Int): ByteArray {
        if (degrees % 360 == 0) return bytes
        return try {
            val source = android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return bytes
            val matrix = android.graphics.Matrix().apply { postRotate(degrees.toFloat()) }
            val rotated = android.graphics.Bitmap.createBitmap(source, 0, 0, source.width, source.height, matrix, true)
            val out = ByteArrayOutputStream()
            rotated.compress(android.graphics.Bitmap.CompressFormat.JPEG, quality.coerceIn(1, 100), out)
            if (rotated !== source) rotated.recycle()
            source.recycle()
            out.toByteArray()
        } catch (e: Throwable) {
            // OutOfMemoryError included: an unrotated photo beats no photo
            Log.w(TAG, "Rotation failed, serving the unrotated frame: ${e.message}")
            bytes
        }
    }

    /**
     * Find camera ID matching the requested facing direction
     */
    private fun findCameraId(cameraManager: CameraManager, facing: String): String? {
        val targetFacing = when (facing.lowercase()) {
            "front" -> CameraCharacteristics.LENS_FACING_FRONT
            "back" -> CameraCharacteristics.LENS_FACING_BACK
            else -> CameraCharacteristics.LENS_FACING_BACK
        }

        for (cameraId in cameraManager.cameraIdList) {
            val characteristics = cameraManager.getCameraCharacteristics(cameraId)
            val lensFacing = characteristics.get(CameraCharacteristics.LENS_FACING)
            if (lensFacing == targetFacing) {
                return cameraId
            }
        }

        // Fallback: return first available camera
        return cameraManager.cameraIdList.firstOrNull()
    }

    /**
     * Select optimal image size - prefer around 1280x960 for good quality
     * without being too large for HTTP transfer
     */
    private fun selectOptimalSize(sizes: Array<Size>): Size {
        val targetPixels = 1280 * 960 // ~1.2MP - good balance of quality vs speed
        
        // Sort by how close they are to our target
        return sizes
            .filter { it.width >= 640 && it.height >= 480 } // Minimum acceptable
            .minByOrNull { 
                val pixels = it.width * it.height
                kotlin.math.abs(pixels - targetPixels) 
            } ?: sizes.firstOrNull() ?: Size(640, 480)
    }

    /**
     * List available cameras on the device
     */
    fun getAvailableCameras(): List<Map<String, Any>> {
        val cameras = mutableListOf<Map<String, Any>>()
        try {
            val cameraManager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
            for (cameraId in cameraManager.cameraIdList) {
                val characteristics = cameraManager.getCameraCharacteristics(cameraId)
                val lensFacing = characteristics.get(CameraCharacteristics.LENS_FACING)
                val facingName = when (lensFacing) {
                    CameraCharacteristics.LENS_FACING_FRONT -> "front"
                    CameraCharacteristics.LENS_FACING_BACK -> "back"
                    CameraCharacteristics.LENS_FACING_EXTERNAL -> "external"
                    else -> "unknown"
                }
                val map = characteristics.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
                val sizes = map?.getOutputSizes(ImageFormat.JPEG) ?: emptyArray()
                val maxSize = sizes.maxByOrNull { it.width * it.height }
                
                cameras.add(mapOf(
                    "id" to cameraId,
                    "facing" to facingName,
                    "maxWidth" to (maxSize?.width ?: 0),
                    "maxHeight" to (maxSize?.height ?: 0)
                ))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to list cameras: ${e.message}")
        }
        return cameras
    }
}
