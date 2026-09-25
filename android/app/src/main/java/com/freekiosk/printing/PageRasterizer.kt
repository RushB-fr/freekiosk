package com.freekiosk.printing

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.CancellationSignal
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.print.PrintAdapterBridge
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.webkit.WebView
import com.freekiosk.DebugLog
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/**
 * Turns the displayed page into printer dots, honouring its print stylesheet.
 *
 * WebView renders to PDF exactly as it would for the print dialog, and PdfRenderer turns that into
 * pixels at the configured dot width, so a page needs only CSS to print.
 *
 * The page is laid out so that **one CSS pixel is one printer dot**: CSS fixes 96px to the inch, so
 * asking for a page `widthDots / 96` inches wide gives a layout exactly `widthDots` pixels across.
 * Nothing here assumes a dot pitch, which is why only the dot width is ever configured.
 */
object PageRasterizer {

    private const val TAG = "PageRasterizer"

    /** Fixed by CSS, not by any printer. */
    private const val CSS_PX_PER_INCH = 96

    /** Advisory: affects how the WebView rasterises images into the PDF, not the layout. */
    private const val RENDER_RESOLUTION_DPI = 300

    /**
     * Paper is a continuous roll, which no page size can express, so content is laid out on a tall
     * page and the blank remainder cropped. Longer prints paginate and are stitched back together.
     */
    private const val PAGE_HEIGHT_MILS = 11_000

    private const val RENDER_TIMEOUT_SECONDS = 30L

    /** Must be called off the main thread: the print adapter runs there and this blocks on it. */
    fun rasterize(
        context: Context,
        webView: WebView,
        jobName: String,
        options: PrintOptions,
    ): MonoBitmap {
        val pdf = File.createTempFile("freekiosk-print-", ".pdf", context.cacheDir)
        try {
            renderToPdf(webView, jobName, options.widthDots, pdf)
            return rasterizePdf(pdf, options)
        } finally {
            if (!pdf.delete()) DebugLog.w(TAG, "Could not delete ${pdf.name}")
        }
    }

    private fun printAttributes(widthDots: Int): PrintAttributes = PrintAttributes.Builder()
        .setMediaSize(
            // Margins are zero, so the media width is the printable width.
            PrintAttributes.MediaSize(
                "freekiosk_roll",
                "Roll paper",
                widthDots * 1000 / CSS_PX_PER_INCH,
                PAGE_HEIGHT_MILS,
            ),
        )
        .setResolution(
            PrintAttributes.Resolution(
                "freekiosk_render",
                "Render resolution",
                RENDER_RESOLUTION_DPI,
                RENDER_RESOLUTION_DPI,
            ),
        )
        .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
        .setColorMode(PrintAttributes.COLOR_MODE_MONOCHROME)
        .build()

    private fun renderToPdf(webView: WebView, jobName: String, widthDots: Int, target: File) {
        val latch = CountDownLatch(1)
        val failure = AtomicReference<String?>(null)
        val cancellationSignal = CancellationSignal()

        Handler(Looper.getMainLooper()).post {
            spool(webView, jobName, widthDots, target, cancellationSignal) { error ->
                failure.set(error)
                latch.countDown()
            }
        }

        if (!latch.await(RENDER_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
            cancellationSignal.cancel()
            throw PrinterException(
                PrinterException.PAGE_RENDER_FAILED,
                "The page took longer than ${RENDER_TIMEOUT_SECONDS}s to render",
            )
        }
        failure.get()?.let { throw PrinterException(PrinterException.PAGE_RENDER_FAILED, it) }
        if (target.length() == 0L) {
            throw PrinterException(PrinterException.PAGE_RENDER_FAILED, "The page rendered nothing")
        }
    }

    /** Runs on the main thread; reports completion through [done], with null meaning success. */
    private fun spool(
        webView: WebView,
        jobName: String,
        widthDots: Int,
        target: File,
        cancellationSignal: CancellationSignal,
        done: (error: String?) -> Unit,
    ) {
        val adapter: PrintDocumentAdapter = try {
            webView.createPrintDocumentAdapter(jobName)
        } catch (e: Exception) {
            done("Could not create the print adapter: ${e.message}")
            return
        }

        val descriptor = AtomicReference<ParcelFileDescriptor?>(null)
        val finish = { error: String? ->
            runCatching { descriptor.get()?.close() }
            runCatching { adapter.onFinish() }
            done(error)
        }

        try {
            adapter.onStart()
            PrintAdapterBridge.layout(
                adapter,
                printAttributes(widthDots),
                cancellationSignal,
                onFinished = { info ->
                    if (info != null && info.pageCount == 0) {
                        finish("The page produced nothing to print")
                    } else {
                        write(adapter, target, cancellationSignal, descriptor, finish)
                    }
                },
                onFailed = { error -> finish("Layout failed: ${error ?: "unknown"}") },
            )
        } catch (e: Throwable) {
            finish("Print adapter refused: ${e.message}")
        }
    }

    private fun write(
        adapter: PrintDocumentAdapter,
        target: File,
        cancellationSignal: CancellationSignal,
        descriptor: AtomicReference<ParcelFileDescriptor?>,
        finish: (error: String?) -> Unit,
    ) {
        val spoolFile = try {
            ParcelFileDescriptor.open(
                target,
                ParcelFileDescriptor.MODE_READ_WRITE or
                    ParcelFileDescriptor.MODE_CREATE or
                    ParcelFileDescriptor.MODE_TRUNCATE,
            )
        } catch (e: Exception) {
            finish("Could not open the spool file: ${e.message}")
            return
        }

        descriptor.set(spoolFile)
        PrintAdapterBridge.write(
            adapter,
            spoolFile,
            cancellationSignal,
            onFinished = { finish(null) },
            onFailed = { error -> finish("Write failed: ${error ?: "unknown"}") },
        )
    }

    private fun rasterizePdf(pdf: File, options: PrintOptions): MonoBitmap {
        ParcelFileDescriptor.open(pdf, ParcelFileDescriptor.MODE_READ_ONLY).use { descriptor ->
            PdfRenderer(descriptor).use { renderer ->
                val pages = (0 until renderer.pageCount)
                    .map { index -> renderPage(renderer, index, options) }
                    .filter { it.height > 0 }

                if (pages.isEmpty()) {
                    throw PrinterException(PrinterException.BAD_IMAGE, "Nothing to print — the page is blank")
                }
                DebugLog.d(TAG, "Rasterised ${pages.size} page(s) at ${options.widthDots} dots")
                return MonoBitmap.concat(pages)
            }
        }
    }

    private fun renderPage(renderer: PdfRenderer, index: Int, options: PrintOptions): MonoBitmap {
        renderer.openPage(index).use { page ->
            val height = maxOf(1, page.height * options.widthDots / page.width)
            val bitmap = Bitmap.createBitmap(options.widthDots, height, Bitmap.Config.ARGB_8888)
            // PdfRenderer leaves untouched areas transparent, which would read as solid ink.
            Canvas(bitmap).drawColor(Color.WHITE)
            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_PRINT)

            val mono = MonoBitmap.fromBitmap(bitmap, options.widthDots, options.threshold)
                .cropTrailingBlankRows()
            bitmap.recycle()
            return mono
        }
    }
}
