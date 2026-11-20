package com.freekiosk

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import org.tensorflow.lite.Interpreter
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.exp

/**
 * BlazeFace short range, MediaPipe's face detector for front cameras (faces within ~2 m),
 * run with LiteRT. The model takes a 128x128 RGB image scaled to [-1, 1] and scores 896 fixed
 * anchors; decoding follows MediaPipe's face_detection_short_range graph. The model file
 * (assets/blaze_face_short_range.tflite) is MediaPipe's, under the Apache License 2.0.
 *
 * Not thread safe: MotionDetectionModule calls it from its single executor thread.
 */
class BlazeFaceDetector(context: Context) : AutoCloseable {

    /**
     * A face, with its box in the coordinates of the bitmap passed to [detect]. Plain floats
     * rather than RectF, so the decoding runs in a JVM unit test.
     */
    data class Face(val score: Float, val left: Float, val top: Float, val right: Float, val bottom: Float) {
        val width get() = right - left
        val height get() = bottom - top
    }

    private val interpreter: Interpreter
    private val boxesIndex: Int
    private val scoresIndex: Int
    private val input = ByteBuffer.allocateDirect(SIZE * SIZE * 3 * 4).order(ByteOrder.nativeOrder())
    private val boxes = Array(1) { Array(ANCHORS.size) { FloatArray(16) } }
    private val scores = Array(1) { Array(ANCHORS.size) { FloatArray(1) } }
    private val square = Bitmap.createBitmap(SIZE, SIZE, Bitmap.Config.ARGB_8888)
    private val pixels = IntArray(SIZE * SIZE)
    private val paint = Paint(Paint.FILTER_BITMAP_FLAG)

    init {
        val model = context.assets.open(MODEL).use { it.readBytes() }
        val buffer = ByteBuffer.allocateDirect(model.size).order(ByteOrder.nativeOrder())
        buffer.put(model).rewind()
        interpreter = Interpreter(buffer, Interpreter.Options().setNumThreads(2))
        // Two outputs: 16 regressors per anchor (box + 6 keypoints) and 1 score per anchor
        val outputs = 0 until interpreter.outputTensorCount
        boxesIndex = outputs.first { interpreter.getOutputTensor(it).shape().last() == 16 }
        scoresIndex = outputs.first { interpreter.getOutputTensor(it).shape().last() == 1 }
    }

    fun detect(bitmap: Bitmap): List<Face> {
        // Letterbox into the square input, as MediaPipe does, so faces keep their shape
        val scale = SIZE.toFloat() / maxOf(bitmap.width, bitmap.height)
        val padX = (SIZE - bitmap.width * scale) / 2
        val padY = (SIZE - bitmap.height * scale) / 2
        Canvas(square).apply {
            drawColor(Color.BLACK)
            drawBitmap(bitmap, null, RectF(padX, padY, SIZE - padX, SIZE - padY), paint)
        }
        square.getPixels(pixels, 0, SIZE, 0, 0, SIZE, SIZE)
        input.rewind()
        for (p in pixels) {
            input.putFloat(((p shr 16) and 0xFF) / 127.5f - 1f)
            input.putFloat(((p shr 8) and 0xFF) / 127.5f - 1f)
            input.putFloat((p and 0xFF) / 127.5f - 1f)
        }
        input.rewind()
        interpreter.runForMultipleInputsOutputs(arrayOf<Any>(input), mapOf<Int, Any>(boxesIndex to boxes, scoresIndex to scores))
        return decode(boxes[0], scores[0], scale, padX, padY)
    }

    override fun close() {
        interpreter.close()
        square.recycle()
    }

    companion object {
        private const val MODEL = "blaze_face_short_range.tflite"
        internal const val SIZE = 128
        private const val MIN_SCORE = 0.5f

        /**
         * Turns the model's outputs into faces in bitmap coordinates. [boxes] holds 16 regressors
         * per anchor (box, then 6 keypoints), [scores] one raw logit per anchor; [scale], [padX]
         * and [padY] undo the letterboxing done in [detect].
         */
        internal fun decode(boxes: Array<FloatArray>, scores: Array<FloatArray>, scale: Float, padX: Float, padY: Float): List<Face> {
            val found = ArrayList<Face>()
            for (i in ANCHORS.indices) {
                val score = 1f / (1f + exp(-scores[i][0].coerceIn(-100f, 100f)))
                if (score < MIN_SCORE) continue
                val r = boxes[i]
                // Offsets are in input pixels around the anchor centre; anchors have a fixed size of 1
                val cx = r[0] + ANCHORS[i].first * SIZE
                val cy = r[1] + ANCHORS[i].second * SIZE
                val halfW = r[2] / 2
                val halfH = r[3] / 2
                found += Face(
                    score,
                    (cx - halfW - padX) / scale, (cy - halfH - padY) / scale,
                    (cx + halfW - padX) / scale, (cy + halfH - padY) / scale
                )
            }
            return withoutOverlaps(found)
        }

        /** Several anchors fire for one face: keep the best of each overlapping group. */
        private fun withoutOverlaps(faces: List<Face>): List<Face> {
            val kept = ArrayList<Face>()
            for (face in faces.sortedByDescending { it.score }) {
                if (kept.none { iou(it, face) > 0.3f }) kept += face
            }
            return kept
        }

        private fun iou(a: Face, b: Face): Float {
            val w = minOf(a.right, b.right) - maxOf(a.left, b.left)
            val h = minOf(a.bottom, b.bottom) - maxOf(a.top, b.top)
            if (w <= 0 || h <= 0) return 0f
            val inter = w * h
            return inter / (a.width * a.height + b.width * b.height - inter)
        }

        /**
         * Anchor centres (fractions of the input), in the model's output order: a 16x16 grid
         * with 2 anchors per cell (stride 8), then an 8x8 grid with 6 (three stride-16 layers).
         */
        internal val ANCHORS: List<Pair<Float, Float>> = buildList {
            for ((grid, perCell) in listOf(16 to 2, 8 to 6)) {
                for (y in 0 until grid) for (x in 0 until grid) repeat(perCell) {
                    add((x + 0.5f) / grid to (y + 0.5f) / grid)
                }
            }
        }
    }
}
