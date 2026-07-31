package com.freekiosk.camera

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.ImageFormat
import android.graphics.Rect
import android.graphics.YuvImage
import android.hardware.camera2.CameraAccessException
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CaptureRequest
import android.hardware.display.DisplayManager
import android.media.Image
import android.media.ImageReader
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import android.util.Size
import android.view.Display
import android.view.Surface
import androidx.core.content.ContextCompat
import java.io.ByteArrayOutputStream
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Continuous JPEG frame source backed by Camera2.
 *
 * Runs a repeating preview request on a YUV_420_888 [ImageReader] and compresses each frame
 * with [YuvImage]. A repeating JPEG request would be simpler but is unreliable across devices,
 * and would re-run the full still-capture pipeline for every frame.
 *
 * Frames are delivered on the camera background thread; consumers must not block in [onFrame].
 */
class Camera2MjpegSource(
    private val context: Context,
    private val facing: String,
    targetFps: Int,
    quality: Int,
    private val maxWidth: Int,
    /** Extra clockwise rotation in degrees (0/90/180/270), or null to derive it from the sensor. */
    private val rotationOverride: Int?
) {

    companion object {
        private const val TAG = "Camera2MjpegSource"
        private const val OPEN_TIMEOUT_SECONDS = 5L
    }

    private val frameIntervalMs = 1000L / targetFps.coerceIn(1, 30)
    private val jpegQuality = quality.coerceIn(1, 100)

    private var handlerThread: HandlerThread? = null
    private var handler: Handler? = null
    private var cameraDevice: CameraDevice? = null
    private var captureSession: CameraCaptureSession? = null
    private var imageReader: ImageReader? = null

    @Volatile private var running = false
    @Volatile private var lastFrameAt = 0L
    private var rotationDegrees = 0

    /** Size actually used for capture, available once [start] succeeded. */
    var captureSize: Size? = null
        private set

    /**
     * Open the camera and start delivering JPEG frames.
     *
     * @return true when the stream is running, false when the camera could not be opened
     *         (missing permission, no such camera, or another client holds it).
     */
    fun start(onFrame: (ByteArray) -> Unit): Boolean {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA)
            != PackageManager.PERMISSION_GRANTED
        ) {
            Log.e(TAG, "Camera permission not granted")
            return false
        }

        val cameraManager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
        val cameraId = findCameraId(cameraManager, facing)
        if (cameraId == null) {
            Log.e(TAG, "No $facing camera on this device")
            return false
        }

        val thread = HandlerThread("MjpegCameraThread").apply { start() }
        val threadHandler = Handler(thread.looper)
        handlerThread = thread
        handler = threadHandler

        return try {
            val characteristics = cameraManager.getCameraCharacteristics(cameraId)
            rotationDegrees = rotationOverride ?: computeRotation(characteristics)

            val size = selectSize(characteristics)
            captureSize = size
            Log.i(TAG, "Starting $facing stream at ${size.width}x${size.height}, rotation=$rotationDegrees")

            val reader = ImageReader.newInstance(size.width, size.height, ImageFormat.YUV_420_888, 3)
            imageReader = reader
            reader.setOnImageAvailableListener({ r ->
                val image = r.acquireLatestImage() ?: return@setOnImageAvailableListener
                try {
                    if (!running) return@setOnImageAvailableListener
                    val now = System.currentTimeMillis()
                    if (now - lastFrameAt < frameIntervalMs) return@setOnImageAvailableListener
                    lastFrameAt = now
                    encodeFrame(image)?.let(onFrame)
                } catch (e: Exception) {
                    Log.e(TAG, "Frame encoding failed: ${e.message}")
                } finally {
                    image.close()
                }
            }, threadHandler)

            if (!openCameraAndSession(cameraManager, cameraId, reader, threadHandler)) {
                stop()
                return false
            }

            running = true
            true
        } catch (e: SecurityException) {
            Log.e(TAG, "Camera permission denied: ${e.message}")
            stop()
            false
        } catch (e: CameraAccessException) {
            Log.e(TAG, "Camera access error: ${e.message}")
            stop()
            false
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start stream: ${e.message}", e)
            stop()
            false
        }
    }

    /** Stop the repeating request and release the camera. */
    fun stop() {
        running = false
        try {
            captureSession?.stopRepeating()
        } catch (e: Exception) {
            Log.d(TAG, "stopRepeating failed (already closed): ${e.message}")
        }
        try {
            captureSession?.close()
            cameraDevice?.close()
            imageReader?.close()
        } catch (e: Exception) {
            Log.w(TAG, "Error while releasing camera: ${e.message}")
        }
        captureSession = null
        cameraDevice = null
        imageReader = null
        handlerThread?.quitSafely()
        handlerThread = null
        handler = null
        Log.i(TAG, "Stream stopped ($facing)")
    }

    // ==================== Camera setup ====================

    private fun openCameraAndSession(
        cameraManager: CameraManager,
        cameraId: String,
        reader: ImageReader,
        threadHandler: Handler
    ): Boolean {
        val openLatch = CountDownLatch(1)
        var opened: CameraDevice? = null
        var openFailed = false

        cameraManager.openCamera(cameraId, object : CameraDevice.StateCallback() {
            override fun onOpened(camera: CameraDevice) {
                opened = camera
                openLatch.countDown()
            }

            override fun onDisconnected(camera: CameraDevice) {
                Log.w(TAG, "Camera disconnected")
                camera.close()
                openFailed = true
                openLatch.countDown()
            }

            override fun onError(camera: CameraDevice, error: Int) {
                // error 1 = ERROR_CAMERA_IN_USE, typically motion detection holding the sensor
                Log.e(TAG, "Camera error $error while opening")
                camera.close()
                openFailed = true
                openLatch.countDown()
            }
        }, threadHandler)

        if (!openLatch.await(OPEN_TIMEOUT_SECONDS, TimeUnit.SECONDS) || openFailed) {
            Log.e(TAG, "Could not open camera (timeout or in use)")
            return false
        }
        val camera = opened ?: return false
        cameraDevice = camera

        val sessionLatch = CountDownLatch(1)
        var session: CameraCaptureSession? = null

        camera.createCaptureSession(listOf(reader.surface), object : CameraCaptureSession.StateCallback() {
            override fun onConfigured(configured: CameraCaptureSession) {
                session = configured
                sessionLatch.countDown()
            }

            override fun onConfigureFailed(configured: CameraCaptureSession) {
                Log.e(TAG, "Capture session configuration failed")
                sessionLatch.countDown()
            }
        }, threadHandler)

        if (!sessionLatch.await(OPEN_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
            Log.e(TAG, "Timeout configuring capture session")
            return false
        }
        val configured = session ?: return false
        captureSession = configured

        val request = camera.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW).apply {
            addTarget(reader.surface)
            set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE)
            set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON)
        }.build()

        configured.setRepeatingRequest(request, null, threadHandler)
        return true
    }

    private fun findCameraId(cameraManager: CameraManager, facing: String): String? {
        val target = when (facing.lowercase()) {
            "front" -> CameraCharacteristics.LENS_FACING_FRONT
            else -> CameraCharacteristics.LENS_FACING_BACK
        }
        for (id in cameraManager.cameraIdList) {
            val lensFacing = cameraManager.getCameraCharacteristics(id)
                .get(CameraCharacteristics.LENS_FACING)
            if (lensFacing == target) return id
        }
        return null
    }

    /** Pick the output size closest to [maxWidth] without exceeding it when possible. */
    private fun selectSize(characteristics: CameraCharacteristics): Size {
        val sizes = characteristics
            .get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
            ?.getOutputSizes(ImageFormat.YUV_420_888)
            ?: emptyArray()

        if (sizes.isEmpty()) return Size(640, 480)

        val within = sizes.filter { it.width <= maxWidth }
        return (within.maxByOrNull { it.width * it.height }
            ?: sizes.minByOrNull { it.width * it.height })!!
    }

    /**
     * Clockwise rotation needed to display frames upright, derived from the sensor mounting and
     * the current display rotation. MJPEG viewers ignore EXIF, so frames are rotated in pixels.
     */
    private fun computeRotation(characteristics: CameraCharacteristics): Int {
        val sensorOrientation = characteristics.get(CameraCharacteristics.SENSOR_ORIENTATION) ?: 0
        val facingFront =
            characteristics.get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_FRONT

        val displayRotationDegrees = try {
            val displayManager = context.getSystemService(Context.DISPLAY_SERVICE) as DisplayManager
            when (displayManager.getDisplay(Display.DEFAULT_DISPLAY)?.rotation) {
                Surface.ROTATION_90 -> 90
                Surface.ROTATION_180 -> 180
                Surface.ROTATION_270 -> 270
                else -> 0
            }
        } catch (e: Exception) {
            0
        }

        var deviceOrientation = (360 - displayRotationDegrees) % 360
        if (facingFront) deviceOrientation = -deviceOrientation
        return (sensorOrientation + deviceOrientation + 360) % 360
    }

    // ==================== Frame encoding ====================

    private fun encodeFrame(image: Image): ByteArray? {
        var width = image.width
        var height = image.height
        var nv21 = yuv420ToNv21(image)

        when (rotationDegrees) {
            90 -> {
                nv21 = rotateNv21By90(nv21, width, height)
                val swap = width; width = height; height = swap
            }
            180 -> nv21 = rotateNv21By180(nv21, width, height)
            270 -> {
                nv21 = rotateNv21By180(rotateNv21By90(nv21, width, height), height, width)
                val swap = width; width = height; height = swap
            }
        }

        val out = ByteArrayOutputStream()
        val yuvImage = YuvImage(nv21, ImageFormat.NV21, width, height, null)
        return if (yuvImage.compressToJpeg(Rect(0, 0, width, height), jpegQuality, out)) {
            out.toByteArray()
        } else {
            Log.w(TAG, "JPEG compression failed")
            null
        }
    }

    /** Copy a YUV_420_888 image into a contiguous NV21 buffer, honouring plane strides. */
    private fun yuv420ToNv21(image: Image): ByteArray {
        val width = image.width
        val height = image.height
        val ySize = width * height
        val nv21 = ByteArray(ySize + ySize / 2)

        val yPlane = image.planes[0]
        val uPlane = image.planes[1]
        val vPlane = image.planes[2]

        // Luma, row by row (rowStride can be larger than the width)
        val yBuffer = yPlane.buffer
        var offset = 0
        if (yPlane.rowStride == width) {
            yBuffer.get(nv21, 0, ySize)
            offset = ySize
        } else {
            for (row in 0 until height) {
                yBuffer.position(row * yPlane.rowStride)
                yBuffer.get(nv21, offset, width)
                offset += width
            }
        }

        // Chroma, interleaved as V,U (NV21)
        val uBuffer = uPlane.buffer
        val vBuffer = vPlane.buffer
        val uvRowStride = uPlane.rowStride
        val uvPixelStride = uPlane.pixelStride
        for (row in 0 until height / 2) {
            for (col in 0 until width / 2) {
                val uvIndex = row * uvRowStride + col * uvPixelStride
                nv21[offset++] = vBuffer.get(uvIndex)
                nv21[offset++] = uBuffer.get(uvIndex)
            }
        }
        return nv21
    }

    private fun rotateNv21By90(input: ByteArray, width: Int, height: Int): ByteArray {
        val output = ByteArray(input.size)
        val frameSize = width * height

        var i = 0
        for (x in 0 until width) {
            for (y in height - 1 downTo 0) {
                output[i++] = input[y * width + x]
            }
        }

        i = input.size - 1
        var x = width - 1
        while (x > 0) {
            for (y in 0 until height / 2) {
                output[i--] = input[frameSize + y * width + x]
                output[i--] = input[frameSize + y * width + (x - 1)]
            }
            x -= 2
        }
        return output
    }

    private fun rotateNv21By180(input: ByteArray, width: Int, height: Int): ByteArray {
        val output = ByteArray(input.size)
        val frameSize = width * height

        var i = 0
        for (position in frameSize - 1 downTo 0) {
            output[i++] = input[position]
        }

        i = output.size - 1
        var position = frameSize
        while (position < input.size) {
            output[i--] = input[position + 1]
            output[i--] = input[position]
            position += 2
        }
        return output
    }
}
