package com.freekiosk.printing

/**
 * A way to reach a printer and push encoded bytes at it.
 * Implementations cover the connection only; encoding belongs to [RasterDriver].
 */
interface PrinterTransport {

    val kind: String

    /** The attached printer, or null. Must not require permission. */
    fun find(): PrinterDescription?

    fun hasPermission(): Boolean

    fun requestPermission(callback: (granted: Boolean) -> Unit)

    fun status(): PrinterStatus

    /** Opens, writes every byte, closes. Blocking. Throws [PrinterException] on failure. */
    fun write(bytes: ByteArray)
}

data class PrinterDescription(
    val kind: String,
    val displayName: String,
    val vendorId: Int? = null,
    val productId: Int? = null,
    val manufacturer: String? = null,
    val model: String? = null,
    val commandSet: String? = null,
) {
    val hardwareId: String?
        get() = if (vendorId != null && productId != null) {
            String.format("%04x:%04x", vendorId, productId)
        } else {
            null
        }
}

/**
 * UNKNOWN means the paper state could not be read, and must not block printing. A printer with no
 * paper sensor usually reports OK, so OK does not guarantee paper.
 */
enum class PaperState { OK, OUT, UNKNOWN }

data class PrinterStatus(
    val state: State,
    val paper: PaperState,
    val description: PrinterDescription?,
) {
    enum class State { READY, NO_PRINTER, NO_PERMISSION, PAPER_OUT, ERROR }
}

class PrinterException(
    val code: String,
    message: String,
    cause: Throwable? = null,
) : Exception(message, cause) {
    companion object {
        const val NO_PRINTER = "NO_PRINTER"
        const val NO_PERMISSION = "NO_PERMISSION"
        const val PAPER_OUT = "PAPER_OUT"
        const val OPEN_FAILED = "OPEN_FAILED"
        const val WRITE_FAILED = "WRITE_FAILED"
        const val BAD_IMAGE = "BAD_IMAGE"
        const val PAGE_RENDER_FAILED = "PAGE_RENDER_FAILED"
        const val NO_WEBVIEW = "NO_WEBVIEW"
    }
}
