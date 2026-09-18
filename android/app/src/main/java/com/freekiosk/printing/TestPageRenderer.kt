package com.freekiosk.printing

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * The self-test print: proves transport, driver and paper width with no web app involved.
 *
 * The ruler shows whether the configured width matches the paper, the currency and accent line
 * shows the character handling, the grey ramp shows where the threshold falls, and the hairlines
 * show whether single-dot rows survive.
 */
object TestPageRenderer {

    /** Generous canvas; the blank remainder is cropped before printing. */
    private const val CANVAS_HEIGHT = 1_400

    private const val LINE_HEIGHT = 26f

    fun render(widthDots: Int, printerName: String?, commandSet: String?): Bitmap {
        val bitmap = Bitmap.createBitmap(widthDots, CANVAS_HEIGHT, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.WHITE)

        val body = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.BLACK
            textSize = 22f
            typeface = Typeface.MONOSPACE
        }
        val title = Paint(body).apply {
            textSize = 30f
            typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
        }
        val ink = Paint().apply { color = Color.BLACK }

        var y = 34f
        canvas.drawText("FreeKiosk", 0f, y, title)
        y += 34f
        canvas.drawText("Printer test page", 0f, y, title)
        y += 30f

        canvas.drawRect(0f, y, widthDots.toFloat(), y + 3f, ink)
        y += LINE_HEIGHT

        canvas.drawText("Printer: ${printerName ?: "unknown"}", 0f, y, body)
        y += LINE_HEIGHT
        canvas.drawText("Width: $widthDots dots", 0f, y, body)
        y += LINE_HEIGHT
        canvas.drawText(SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.UK).format(Date()), 0f, y, body)
        y += 32f

        val columns = (widthDots / body.measureText("0")).toInt()
        canvas.drawText(columnRuler(columns), 0f, y, body)
        y += LINE_HEIGHT
        canvas.drawText("$columns columns at ${body.textSize.toInt()}px", 0f, y, body)
        y += 32f

        canvas.drawText("Currency: £10.50 €9,99 \$7.25", 0f, y, body)
        y += LINE_HEIGHT
        canvas.drawText("Accents: café ijsje größe niño", 0f, y, body)
        y += 32f

        y = drawGreyRamp(canvas, widthDots, y)
        y = drawHairlines(canvas, widthDots, y, ink)

        return bitmap
    }

    private fun columnRuler(columns: Int): String {
        val ruler = StringBuilder()
        for (i in 1..columns) ruler.append(if (i % 10 == 0) "|" else (i % 10).toString())
        return ruler.toString()
    }

    private fun drawGreyRamp(canvas: Canvas, widthDots: Int, top: Float): Float {
        val swatch = widthDots / 8f
        for (i in 0 until 8) {
            val level = 255 - i * 32
            val paint = Paint().apply { color = Color.rgb(level, level, level) }
            canvas.drawRect(i * swatch, top, (i + 1) * swatch, top + 40f, paint)
        }
        return top + 68f
    }

    private fun drawHairlines(canvas: Canvas, widthDots: Int, top: Float, ink: Paint): Float {
        var y = top
        for (i in 0 until 3) {
            canvas.drawRect(0f, y, widthDots.toFloat(), y + 1f, ink)
            y += 8f
        }
        return y + 24f
    }
}
