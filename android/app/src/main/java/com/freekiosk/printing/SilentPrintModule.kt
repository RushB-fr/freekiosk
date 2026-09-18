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
                val bitmap = decodeImage(base64)
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

    private fun decodeImage(base64: String?): Bitmap {
        if (base64.isNullOrBlank()) {
            throw PrinterException(PrinterException.BAD_IMAGE, "No image data")
        }
        val payload = base64.substringAfter("base64,", base64).trim()
        val bytes = try {
            Base64.decode(payload, Base64.DEFAULT)
        } catch (e: IllegalArgumentException) {
            throw PrinterException(PrinterException.BAD_IMAGE, "Image data is not valid base64", e)
        }
        if (bytes.size > MAX_IMAGE_BYTES) {
            throw PrinterException(
                PrinterException.BAD_IMAGE,
                "Image is larger than ${MAX_IMAGE_BYTES / 1024 / 1024}MB",
            )
        }
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
            ?: throw PrinterException(PrinterException.BAD_IMAGE, "Image could not be decoded")
    }

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
