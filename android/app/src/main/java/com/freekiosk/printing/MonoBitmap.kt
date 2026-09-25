package com.freekiosk.printing

import android.graphics.Bitmap

/** A 1bpp image in the row-major, MSB-first layout raster printer commands expect. */
class MonoBitmap(
    val width: Int,
    val height: Int,
    val rows: ByteArray,
) {
    val bytesPerRow: Int = bytesPerRow(width)

    init {
        val expected = bytesPerRow * height
        require(rows.size == expected) { "Expected $expected bytes for ${width}x$height, got ${rows.size}" }
    }

    fun band(startRow: Int, rowCount: Int): ByteArray {
        val from = startRow * bytesPerRow
        val to = (startRow + rowCount) * bytesPerRow
        return rows.copyOfRange(from, to)
    }

    /** Without this a page laid out taller than its content feeds a long strip of blank paper. */
    fun cropTrailingBlankRows(): MonoBitmap {
        var lastInked = height - 1
        while (lastInked >= 0 && isRowBlank(lastInked)) lastInked--
        if (lastInked == height - 1) return this
        val newHeight = lastInked + 1
        if (newHeight <= 0) return MonoBitmap(width, 0, ByteArray(0))
        return MonoBitmap(width, newHeight, rows.copyOfRange(0, newHeight * bytesPerRow))
    }

    private fun isRowBlank(row: Int): Boolean {
        val from = row * bytesPerRow
        for (i in from until from + bytesPerRow) {
            if (rows[i].toInt() != 0) return false
        }
        return true
    }

    companion object {
        const val DEFAULT_THRESHOLD = 128

        fun bytesPerRow(width: Int): Int = (width + 7) / 8

        /** Joins the pages of a paginated document back into one continuous strip, as roll paper is. */
        fun concat(parts: List<MonoBitmap>): MonoBitmap {
            require(parts.isNotEmpty()) { "Nothing to join" }
            if (parts.size == 1) return parts.first()
            val width = parts.first().width
            require(parts.all { it.width == width }) { "Every part must share a width" }

            val rows = ByteArray(bytesPerRow(width) * parts.sumOf { it.height })
            var offset = 0
            for (part in parts) {
                part.rows.copyInto(rows, offset)
                offset += part.rows.size
            }
            return MonoBitmap(width, parts.sumOf { it.height }, rows)
        }

        /** Converts to dots at exactly [targetWidth], scaling down and centring as needed. */
        fun fromBitmap(
            source: Bitmap,
            targetWidth: Int,
            threshold: Int = DEFAULT_THRESHOLD,
        ): MonoBitmap {
            require(targetWidth > 0) { "targetWidth must be positive" }
            if (source.width <= 0 || source.height <= 0) {
                throw PrinterException(PrinterException.BAD_IMAGE, "Image has no pixels")
            }

            val scaled = scaleToWidth(source, targetWidth)
            val xOffset = (targetWidth - scaled.width) / 2
            val bytesPerRow = bytesPerRow(targetWidth)
            val rows = ByteArray(bytesPerRow * scaled.height)
            val line = IntArray(scaled.width)

            for (y in 0 until scaled.height) {
                scaled.getPixels(line, 0, scaled.width, 0, y, scaled.width, 1)
                val rowStart = y * bytesPerRow
                for (x in 0 until scaled.width) {
                    val dot = x + xOffset
                    if (isInk(line[x], threshold) && dot in 0 until targetWidth) {
                        rows[rowStart + (dot shr 3)] =
                            (rows[rowStart + (dot shr 3)].toInt() or (0x80 shr (dot and 7))).toByte()
                    }
                }
            }

            val height = scaled.height
            if (scaled !== source) scaled.recycle()
            return MonoBitmap(targetWidth, height, rows)
        }

        private fun scaleToWidth(source: Bitmap, targetWidth: Int): Bitmap {
            if (source.width <= targetWidth) return source
            val height = maxOf(1, (source.height.toLong() * targetWidth / source.width).toInt())
            return Bitmap.createScaledBitmap(source, targetWidth, height, true)
        }

        private fun isInk(pixel: Int, threshold: Int): Boolean {
            val alpha = (pixel ushr 24) and 0xFF
            val red = (pixel ushr 16) and 0xFF
            val green = (pixel ushr 8) and 0xFF
            val blue = pixel and 0xFF
            val luma = (red * 299 + green * 587 + blue * 114) / 1000
            // Composited over white, so transparent pixels read as paper rather than ink.
            val overWhite = (luma * alpha + 255 * (255 - alpha)) / 255
            return overWhite < threshold
        }
    }
}
