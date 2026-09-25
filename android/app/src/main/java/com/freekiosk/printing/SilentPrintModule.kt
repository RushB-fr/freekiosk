package com.freekiosk.printing

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.freekiosk.DebugLog
import java.util.concurrent.Executors

/**
 * SilentPrintModule - Printing with no print dialog
 *
 * Android's print framework always shows the system print dialog, so an unattended kiosk cannot
 * use it. This drives an ESC/POS printer directly instead.
 *
 * Features:
 * - Print the current WebView page through its print stylesheet
 * - Print an image supplied by the page
 * - Built-in test page, needing no web app
 * - Printer identity and paper state, where the printer reports them
 *
 * Settings live in JS and travel with each call, so nothing is configured in two places.
 */
class SilentPrintModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "SilentPrintModule"

        private const val MAX_IMAGE_BYTES = 8 * 1024 * 1024

        /**
         * Roughly 64MB once decoded to ARGB_8888. Reached only by an image far taller than any
         * receipt: at a 576-dot width that is some 14000 rows, about 1.8 metres of paper.
         */
        private const val MAX_IMAGE_PIXELS = 16L * 1024 * 1024
    }

    override fun getName(): String = NAME

    /** One job at a time: a printer is a single serial resource. */
    private val executor = Executors.newSingleThreadExecutor()

    private val transport: PrinterTransport by lazy { UsbPrinterTransport(reactApplicationContext) }
    private val driver: RasterDriver = EscPosRasterDriver()

    @ReactMethod
    fun status(promise: Promise) {
        executor.execute {
            runJob(promise, "Could not read printer status") {
                statusMap(transport.status())
            }
        }
    }

    /**
     * Grants only until the printer is unplugged. The durable route is letting Android make the app
     * the device's default handler (see UsbPrinterAttachActivity).
     */
    @ReactMethod
    fun requestPermission(promise: Promise) {
        try {
            transport.requestPermission { granted -> promise.resolve(granted) }
        } catch (e: Exception) {
            DebugLog.errorProduction(NAME, "Permission request failed: ${e.message}")
            promise.reject("ERROR", "Could not request printer access: ${e.message}", e)
        }
    }

    @ReactMethod
    fun printPage(jobName: String?, options: ReadableMap?, promise: Promise) {
        val opts = printOptions(options)
        val activity = reactApplicationContext.currentActivity
        val webView = activity?.let { WebViewLocator.find(it) }
        if (webView == null) {
            promise.reject(PrinterException.NO_WEBVIEW, "No web page is being displayed")
            return
        }

        executor.execute {
            runJob(promise, "Could not print the page") {
                val image = PageRasterizer.rasterize(
                    reactApplicationContext,
                    webView,
                    jobName?.takeIf { it.isNotBlank() } ?: "FreeKiosk print",
                    opts,
                )
                transport.write(driver.encode(image, opts))
                true
            }
        }
    }

    /** Accepts base64 PNG/JPEG, with or without a `data:` prefix. */
    @ReactMethod
    fun printImage(base64: String?, options: ReadableMap?, promise: Promise) {
        val opts = printOptions(options)
        executor.execute {
            runJob(promise, "Could not print the image") {
                val bitmap = decodeImage(base64, opts)
                try {
                    printBitmap(bitmap, opts)
                } finally {
                    bitmap.recycle()
                }
                true
            }
        }
    }

    @ReactMethod
    fun printTestPage(options: ReadableMap?, promise: Promise) {
        val opts = printOptions(options)
        executor.execute {
            runJob(promise, "Could not print the test page") {
                val description = transport.find()
                val bitmap = TestPageRenderer.render(
                    opts.widthDots,
                    description?.displayName,
                    description?.commandSet,
                )
                try {
                    printBitmap(bitmap, opts)
                } finally {
                    bitmap.recycle()
                }
                true
            }
        }
    }

    private fun runJob(promise: Promise, failureMessage: String, job: () -> Any) {
        try {
            promise.resolve(job())
        } catch (e: PrinterException) {
            DebugLog.errorProduction(NAME, "${e.code}: ${e.message}")
            promise.reject(e.code, e.message, e)
        } catch (e: Exception) {
            DebugLog.errorProduction(NAME, "$failureMessage: ${e.message}")
            promise.reject("ERROR", "$failureMessage: ${e.message}", e)
        }
    }

    private fun printBitmap(bitmap: Bitmap, options: PrintOptions) {
        val image = MonoBitmap.fromBitmap(bitmap, options.widthDots, options.threshold)
            .cropTrailingBlankRows()
        if (image.height == 0) {
            throw PrinterException(PrinterException.BAD_IMAGE, "Nothing to print — the image is blank")
        }
        transport.write(driver.encode(image, options))
        DebugLog.d(NAME, "Printed ${image.width}x${image.height} dots via ${transport.kind}")
    }

    /**
     * Decodes at no more resolution than the printer can use.
     *
     * Both caps earn their place. The payload cap bounds what the page can hand us, and the pixel
     * cap bounds what that payload expands into: a few hundred KB of PNG can legitimately describe
     * a 20000x20000 bitmap, which is 1.6GB of ARGB_8888 and an OOM kill on an unattended tablet —
     * precisely the state this feature exists to avoid. Reading the header first costs nothing and
     * tells us both the size and how far we can subsample on the way in.
     */
    private fun decodeImage(base64: String?, options: PrintOptions): Bitmap {
        if (base64.isNullOrBlank()) {
            throw PrinterException(PrinterException.BAD_IMAGE, "No image data")
        }
        val payload = base64.substringAfter("base64,", base64).trim()
        // Four base64 characters carry at most three bytes, so an oversized payload is turned away
        // before decoding it into memory.
        if (payload.length.toLong() / 4 * 3 > MAX_IMAGE_BYTES) {
            throw PrinterException(
                PrinterException.BAD_IMAGE,
                "Image is larger than ${MAX_IMAGE_BYTES / 1024 / 1024}MB",
            )
        }
        val bytes = try {
            Base64.decode(payload, Base64.DEFAULT)
        } catch (e: IllegalArgumentException) {
            throw PrinterException(PrinterException.BAD_IMAGE, "Image data is not valid base64", e)
        }

        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
            throw PrinterException(PrinterException.BAD_IMAGE, "Image could not be decoded")
        }

        val sampleSize = sampleSizeFor(bounds.outWidth, options.widthDots)
        val pixels = ceilDiv(bounds.outWidth, sampleSize) * ceilDiv(bounds.outHeight, sampleSize)
        if (pixels > MAX_IMAGE_PIXELS) {
            throw PrinterException(
                PrinterException.BAD_IMAGE,
                "Image is too large to decode (${bounds.outWidth}x${bounds.outHeight})",
            )
        }

        val decode = BitmapFactory.Options().apply { inSampleSize = sampleSize }
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, decode)
            ?: throw PrinterException(PrinterException.BAD_IMAGE, "Image could not be decoded")
    }

    /**
     * The largest power of two that still leaves at least [targetWidth] dots across. MonoBitmap
     * scales to exactly that width, so any detail beyond it is decoded only to be thrown away.
     */
    private fun sampleSizeFor(sourceWidth: Int, targetWidth: Int): Int {
        var sample = 1
        while (sourceWidth / (sample * 2) >= targetWidth) sample *= 2
        return sample
    }

    private fun ceilDiv(value: Int, divisor: Int): Long = (value.toLong() + divisor - 1) / divisor

    private fun printOptions(options: ReadableMap?): PrintOptions {
        val defaults = PrintOptions()
        if (options == null) return defaults
        return PrintOptions(
            widthDots = options.readInt("widthDots", defaults.widthDots).coerceIn(8, 4096),
            feedLines = options.readInt("feedLines", defaults.feedLines).coerceIn(0, 255),
            cut = if (options.hasKey("cut")) options.getBoolean("cut") else defaults.cut,
            threshold = options.readInt("threshold", defaults.threshold).coerceIn(1, 254),
        )
    }

    private fun ReadableMap.readInt(key: String, fallback: Int): Int =
        if (hasKey(key) && !isNull(key)) getDouble(key).toInt() else fallback

    private fun statusMap(status: PrinterStatus): WritableMap = Arguments.createMap().apply {
        putString("state", status.state.name.lowercase())
        putString("paper", status.paper.name.lowercase())
        val description = status.description
        if (description == null) {
            putNull("printer")
        } else {
            putMap("printer", printerMap(description))
        }
    }

    private fun printerMap(description: PrinterDescription): WritableMap = Arguments.createMap().apply {
        putString("transport", description.kind)
        putString("name", description.displayName)
        putString("manufacturer", description.manufacturer)
        putString("model", description.model)
        putString("commandSet", description.commandSet)
        putString("hardwareId", description.hardwareId)
    }
}
