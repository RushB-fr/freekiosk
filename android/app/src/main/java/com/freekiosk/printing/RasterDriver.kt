package com.freekiosk.printing

import java.io.ByteArrayOutputStream

data class PrintOptions(
    /** Printable width in dots, the only paper measurement this feature stores. */
    val widthDots: Int = 384,
    val feedLines: Int = 0,
    val cut: Boolean = false,
    val threshold: Int = MonoBitmap.DEFAULT_THRESHOLD,
)

/** Turns dots into the bytes one printer dialect understands. */
interface RasterDriver {
    val commandSet: String

    fun encode(image: MonoBitmap, options: PrintOptions): ByteArray
}

/**
 * ESC/POS raster, the most widely supported POS printer command set.
 *
 * Raster rather than text mode: text mode depends on per-model code pages, which is how £, € and
 * accented characters turn to garbage, and on native QR commands many cheap printers lack.
 */
class EscPosRasterDriver : RasterDriver {

    companion object {
        private const val ESC = 0x1B
        private const val GS = 0x1D

        /** Cheap printers drop the remainder of an oversized raster, so send it in bands. */
        private const val BAND_ROWS = 128
    }

    override val commandSet: String = "ESC/POS"

    override fun encode(image: MonoBitmap, options: PrintOptions): ByteArray {
        val out = ByteArrayOutputStream(image.rows.size + 64)
        out.write(byteArrayOf(ESC.toByte(), '@'.code.toByte()))

        var row = 0
        while (row < image.height) {
            val rows = minOf(BAND_ROWS, image.height - row)
            out.write(byteArrayOf(GS.toByte(), 'v'.code.toByte(), '0'.code.toByte(), 0))
            out.write(byteArrayOf(lowByte(image.bytesPerRow), highByte(image.bytesPerRow)))
            out.write(byteArrayOf(lowByte(rows), highByte(rows)))
            out.write(image.band(row, rows))
            row += rows
        }

        if (options.feedLines > 0) {
            val lines = options.feedLines.coerceIn(0, 255).toByte()
            out.write(byteArrayOf(ESC.toByte(), 'd'.code.toByte(), lines))
        }
        if (options.cut) {
            out.write(byteArrayOf(GS.toByte(), 'V'.code.toByte(), 66, 0))
        }
        return out.toByteArray()
    }

    private fun lowByte(value: Int): Byte = (value and 0xFF).toByte()

    private fun highByte(value: Int): Byte = ((value shr 8) and 0xFF).toByte()
}
