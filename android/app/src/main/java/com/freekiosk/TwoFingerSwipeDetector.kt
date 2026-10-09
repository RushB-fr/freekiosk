package com.freekiosk

import kotlin.math.abs
import kotlin.math.hypot

/**
 * Recognises a two-finger swipe from the raw touch stream, for the dashboard's tile
 * navigation. MainActivity feeds it every event before the view hierarchy sees it, so it
 * works on any page (loading, frozen, or one that swallows touch events) without injecting
 * anything into it, and it only observes: the page still receives every touch.
 *
 * Both fingers must travel the same way by [minDragPx] and keep their distance within
 * [maxGapChangePx], so a pinch does not count. A third finger, or a cancel (Android taking
 * the gesture, e.g. a system edge swipe), drops it.
 *
 * The direction is returned only on the final ACTION_UP, once every finger has lifted.
 * Acting on it earlier hid the tile while fingers were still down, which cancelled the
 * page's touch sequence and left the WebView with a phantom finger: every later tap then
 * counted as a second finger and never became a click.
 *
 * Plain ints and floats in, so it can be tested without a device.
 */
class TwoFingerSwipeDetector(
  private val minDragPx: Float,
  private val maxGapChangePx: Float,
) {
  enum class Direction(val jsName: String) { UP("up"), DOWN("down"), LEFT("left"), RIGHT("right") }

  private val startX = FloatArray(2)
  private val startY = FloatArray(2)
  private var startGap = 0f
  private var tracking = false
  private var spoiled = false
  private var pending: Direction? = null

  /**
   * [action] is MotionEvent.actionMasked; [xs]/[ys] hold the first [pointerCount] pointers.
   * Returns the swipe's direction on the ACTION_UP that ends it, otherwise null.
   */
  fun onTouch(action: Int, pointerCount: Int, xs: FloatArray, ys: FloatArray): Direction? {
    when (action) {
      ACTION_DOWN -> reset()
      ACTION_POINTER_DOWN -> {
        if (pointerCount == 2 && !spoiled && pending == null) {
          for (i in 0..1) { startX[i] = xs[i]; startY[i] = ys[i] }
          startGap = hypot(xs[0] - xs[1], ys[0] - ys[1])
          tracking = true
        } else {
          // A third finger turns it into some other gesture.
          spoiled = true
          tracking = false
          pending = null
        }
      }
      ACTION_MOVE -> {
        if (!tracking || pointerCount != 2) return null
        val gap = hypot(xs[0] - xs[1], ys[0] - ys[1])
        if (abs(gap - startGap) > maxGapChangePx) return null
        val a = direction(xs[0] - startX[0], ys[0] - startY[0])
        val b = direction(xs[1] - startX[1], ys[1] - startY[1])
        if (a != null && a == b) {
          pending = a
          tracking = false // reported once per gesture
        }
      }
      ACTION_POINTER_UP -> tracking = false
      ACTION_UP -> {
        val result = if (spoiled) null else pending
        reset()
        return result
      }
      ACTION_CANCEL -> reset()
    }
    return null
  }

  private fun direction(dx: Float, dy: Float): Direction? = when {
    dy >= minDragPx && abs(dx) < dy -> Direction.DOWN
    dy <= -minDragPx && abs(dx) < -dy -> Direction.UP
    dx <= -minDragPx && abs(dy) < -dx -> Direction.LEFT
    dx >= minDragPx && abs(dy) < dx -> Direction.RIGHT
    else -> null
  }

  private fun reset() {
    tracking = false
    spoiled = false
    pending = null
  }

  companion object {
    const val MIN_DRAG_DP = 48f
    const val MAX_GAP_CHANGE_DP = 40f

    // MotionEvent's masked action values, so the class needs no Android types.
    const val ACTION_DOWN = 0
    const val ACTION_UP = 1
    const val ACTION_MOVE = 2
    const val ACTION_CANCEL = 3
    const val ACTION_POINTER_DOWN = 5
    const val ACTION_POINTER_UP = 6
  }
}
