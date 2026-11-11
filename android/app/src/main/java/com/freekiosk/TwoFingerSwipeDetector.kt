package com.freekiosk

import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.sign

/**
 * Recognises the dashboard's two-finger gestures from the raw touch stream. MainActivity feeds
 * it every event before the view hierarchy sees it, so it works on any page (loading, frozen,
 * or one that swallows touch events) without injecting anything into it, and it only observes:
 * the page still receives every touch.
 *
 * - Up/down: both fingers travel the same way by [minDragPx]; reported as a [Event.Swipe] on
 *   the final ACTION_UP.
 * - Left/right: once both fingers have moved sideways by [dragSlopPx], the gesture becomes a
 *   drag and every move is reported as [Event.Drag] (horizontal travel past that slop, so it
 *   starts from 0), so the tiles can follow the fingers. It ends with [Event.DragEnd] on the
 *   final ACTION_UP, or [Event.DragCancel] if a third finger lands or Android takes the gesture.
 * - [Event.Begin] is reported as soon as the fingers are down, before any of that, so whatever
 *   a drag would show can get ready.
 *
 * The fingers must keep their distance within [maxGapChangePx], so a pinch does not count.
 * Nothing that switches tiles is reported before every finger has lifted: hiding a tile while
 * fingers were still down cancelled the page's touch sequence and left the WebView with a
 * phantom finger, after which no tap became a click.
 *
 * [fingers] is 2 in the app; tests also run it with 1. Plain ints and floats in, so it can be
 * tested without a device.
 */
class TwoFingerSwipeDetector(
  private val minDragPx: Float,
  private val maxGapChangePx: Float,
  private val dragSlopPx: Float,
  private val fingers: Int = 2,
) {
  enum class Direction(val jsName: String) { UP("up"), DOWN("down") }

  sealed class Event {
    object Begin : Event()
    data class Swipe(val direction: Direction) : Event()
    data class Drag(val dxPx: Float) : Event()
    data class DragEnd(val dxPx: Float, val velocityPxPerSec: Float) : Event()
    object DragCancel : Event()
  }

  private enum class Mode { NONE, VERTICAL, DRAG }

  private val startX = FloatArray(2)
  private val startY = FloatArray(2)
  private var startGap = 0f
  private var tracking = false
  private var spoiled = false
  private var mode = Mode.NONE
  private var pending: Direction? = null
  private var lastDx = 0f
  private var slopShift = 0f
  private var lastTimeMs = 0L
  private var velocity = 0f

  /**
   * [action] is MotionEvent.actionMasked; [xs]/[ys] hold the first [pointerCount] pointers;
   * [timeMs] is the event time. Returns what the event completes, if anything.
   */
  fun onTouch(action: Int, pointerCount: Int, xs: FloatArray, ys: FloatArray, timeMs: Long): Event? {
    when (action) {
      ACTION_DOWN -> {
        reset()
        if (fingers == 1) {
          start(xs, ys, timeMs)
          return Event.Begin
        }
      }
      ACTION_POINTER_DOWN -> {
        if (pointerCount == fingers && !spoiled && mode == Mode.NONE) {
          start(xs, ys, timeMs)
          return Event.Begin
        } else if (pointerCount > fingers) {
          // An extra finger turns it into some other gesture.
          val wasDragging = mode == Mode.DRAG && !spoiled
          spoiled = true
          tracking = false
          pending = null
          if (wasDragging) return Event.DragCancel
        }
      }
      ACTION_MOVE -> if (tracking && pointerCount == fingers) return onMove(xs, ys, timeMs)
      ACTION_POINTER_UP -> tracking = false
      ACTION_UP -> {
        val result = when {
          spoiled -> null
          mode == Mode.DRAG ->
            // A finger that stopped before lifting is not a flick.
            Event.DragEnd(lastDx, if (timeMs - lastTimeMs > FLICK_MAX_PAUSE_MS) 0f else velocity)
          else -> pending?.let { Event.Swipe(it) }
        }
        reset()
        return result
      }
      ACTION_CANCEL -> {
        val wasDragging = mode == Mode.DRAG && !spoiled
        reset()
        if (wasDragging) return Event.DragCancel
      }
    }
    return null
  }

  private fun onMove(xs: FloatArray, ys: FloatArray, timeMs: Long): Event? {
    if (fingers == 2 && abs(hypot(xs[0] - xs[1], ys[0] - ys[1]) - startGap) > maxGapChangePx) return null
    var dx = 0f
    var dy = 0f
    var sameSide = true
    var vertical: Direction? = null
    for (i in 0 until fingers) {
      val fx = xs[i] - startX[i]
      val fy = ys[i] - startY[i]
      if (i > 0 && sign(fx) != sign(xs[0] - startX[0])) sameSide = false
      val v = verticalDirection(fx, fy)
      vertical = if (i == 0) v else if (v == vertical) v else null
      dx += fx / fingers
      dy += fy / fingers
    }
    dx -= slopShift
    when (mode) {
      Mode.NONE -> {
        if (vertical != null) {
          pending = vertical
          mode = Mode.VERTICAL
          tracking = false // reported once per gesture
        } else if (sameSide && abs(dx) >= dragSlopPx && abs(dx) > abs(dy)) {
          mode = Mode.DRAG
          slopShift = sign(dx) * dragSlopPx
          lastDx = dx - slopShift
          lastTimeMs = timeMs
          velocity = 0f
          return Event.Drag(lastDx)
        }
      }
      Mode.DRAG -> {
        val dt = timeMs - lastTimeMs
        if (dt > 0) {
          val v = (dx - lastDx) * 1000f / dt
          velocity = if (velocity == 0f) v else 0.6f * v + 0.4f * velocity
        }
        lastDx = dx
        lastTimeMs = timeMs
        return Event.Drag(dx)
      }
      Mode.VERTICAL -> {}
    }
    return null
  }

  private fun start(xs: FloatArray, ys: FloatArray, timeMs: Long) {
    for (i in 0 until fingers) { startX[i] = xs[i]; startY[i] = ys[i] }
    startGap = if (fingers == 2) hypot(xs[0] - xs[1], ys[0] - ys[1]) else 0f
    tracking = true
    lastTimeMs = timeMs
  }

  private fun verticalDirection(dx: Float, dy: Float): Direction? = when {
    dy >= minDragPx && abs(dx) < dy -> Direction.DOWN
    dy <= -minDragPx && abs(dx) < -dy -> Direction.UP
    else -> null
  }

  private fun reset() {
    tracking = false
    spoiled = false
    mode = Mode.NONE
    pending = null
    lastDx = 0f
    slopShift = 0f
    velocity = 0f
  }

  companion object {
    const val MIN_DRAG_DP = 48f
    const val MAX_GAP_CHANGE_DP = 40f
    const val DRAG_SLOP_DP = 10f
    private const val FLICK_MAX_PAUSE_MS = 100L

    // MotionEvent's masked action values, so the class needs no Android types.
    const val ACTION_DOWN = 0
    const val ACTION_UP = 1
    const val ACTION_MOVE = 2
    const val ACTION_CANCEL = 3
    const val ACTION_POINTER_DOWN = 5
    const val ACTION_POINTER_UP = 6
  }
}
