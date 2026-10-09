package com.freekiosk

import com.freekiosk.TwoFingerSwipeDetector.Companion.ACTION_CANCEL
import com.freekiosk.TwoFingerSwipeDetector.Companion.ACTION_DOWN
import com.freekiosk.TwoFingerSwipeDetector.Companion.ACTION_MOVE
import com.freekiosk.TwoFingerSwipeDetector.Companion.ACTION_POINTER_DOWN
import com.freekiosk.TwoFingerSwipeDetector.Companion.ACTION_POINTER_UP
import com.freekiosk.TwoFingerSwipeDetector.Companion.ACTION_UP
import com.freekiosk.TwoFingerSwipeDetector.Direction
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TwoFingerSwipeDetectorTest {
  // 1 px = 1 dp here.
  private val detector = TwoFingerSwipeDetector(48f, 40f)

  private data class P(val x: Float, val y: Float)
  private val a = P(400f, 400f)
  private val b = P(500f, 400f)

  private fun touch(action: Int, vararg points: P): Direction? =
    detector.onTouch(
      action,
      points.size,
      FloatArray(2) { points.getOrNull(it)?.x ?: 0f },
      FloatArray(2) { points.getOrNull(it)?.y ?: 0f },
    )

  private fun P.by(dx: Float, dy: Float) = P(x + dx, y + dy)

  /** Two fingers down, slide to [dx]/[dy] in steps, lift; returns what fired on the final up. */
  private fun swipe(dx: Float, dy: Float, bdx: Float = dx, bdy: Float = dy): Direction? {
    assertNull(touch(ACTION_DOWN, a))
    assertNull(touch(ACTION_POINTER_DOWN, a, b))
    for (i in 1..4) {
      assertNull(touch(ACTION_MOVE, a.by(dx * i / 4, dy * i / 4), b.by(bdx * i / 4, bdy * i / 4)))
    }
    assertNull(touch(ACTION_POINTER_UP, a.by(dx, dy), b.by(bdx, bdy)))
    return touch(ACTION_UP, a.by(dx, dy))
  }

  @Test
  fun reportsEachDirection() {
    assertEquals(Direction.DOWN, swipe(0f, 120f))
    assertEquals(Direction.UP, swipe(0f, -120f))
    assertEquals(Direction.LEFT, swipe(-150f, 0f))
    assertEquals(Direction.RIGHT, swipe(150f, 0f))
  }

  @Test
  fun reportsOnlyOnceEveryFingerHasLifted() {
    touch(ACTION_DOWN, a)
    touch(ACTION_POINTER_DOWN, a, b)
    assertNull(touch(ACTION_MOVE, a.by(-150f, 0f), b.by(-150f, 0f)))
    assertNull(touch(ACTION_MOVE, a.by(-160f, 0f), b.by(-160f, 0f)))
    assertNull(touch(ACTION_POINTER_UP, a.by(-160f, 0f), b.by(-160f, 0f)))
    assertEquals(Direction.LEFT, touch(ACTION_UP, a.by(-160f, 0f)))
  }

  @Test
  fun ignoresShortAndDiagonalDrags() {
    assertNull(swipe(0f, 30f))
    assertNull(swipe(100f, 100f))
  }

  @Test
  fun ignoresPinches() {
    assertNull(swipe(-100f, 0f, 100f, 0f))
    assertNull(swipe(0f, 60f, 0f, 160f))
  }

  @Test
  fun ignoresOneFingerSwipes() {
    touch(ACTION_DOWN, a)
    touch(ACTION_MOVE, a.by(0f, 200f))
    assertNull(touch(ACTION_UP, a.by(0f, 200f)))
  }

  @Test
  fun aThirdFingerDropsTheGesture() {
    touch(ACTION_DOWN, a)
    touch(ACTION_POINTER_DOWN, a, b)
    touch(ACTION_MOVE, a.by(0f, 120f), b.by(0f, 120f))
    touch(ACTION_POINTER_DOWN, a.by(0f, 120f), b.by(0f, 120f), P(600f, 400f))
    touch(ACTION_POINTER_UP, a.by(0f, 120f), b.by(0f, 120f), P(600f, 400f))
    touch(ACTION_POINTER_UP, a.by(0f, 120f), b.by(0f, 120f))
    assertNull(touch(ACTION_UP, a.by(0f, 120f)))
  }

  @Test
  fun aCancelDropsTheGesture() {
    touch(ACTION_DOWN, a)
    touch(ACTION_POINTER_DOWN, a, b)
    touch(ACTION_MOVE, a.by(0f, 120f), b.by(0f, 120f))
    assertNull(touch(ACTION_CANCEL, a.by(0f, 120f), b.by(0f, 120f)))
    // The next plain tap reports nothing either.
    touch(ACTION_DOWN, a)
    assertNull(touch(ACTION_UP, a))
  }

  @Test
  fun startsCleanAfterEachGesture() {
    assertEquals(Direction.DOWN, swipe(0f, 120f))
    touch(ACTION_DOWN, a)
    assertNull(touch(ACTION_UP, a))
  }
}
