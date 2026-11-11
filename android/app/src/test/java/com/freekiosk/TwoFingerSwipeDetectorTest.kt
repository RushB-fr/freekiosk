package com.freekiosk

import com.freekiosk.TwoFingerSwipeDetector.Companion.ACTION_CANCEL
import com.freekiosk.TwoFingerSwipeDetector.Companion.ACTION_DOWN
import com.freekiosk.TwoFingerSwipeDetector.Companion.ACTION_MOVE
import com.freekiosk.TwoFingerSwipeDetector.Companion.ACTION_POINTER_DOWN
import com.freekiosk.TwoFingerSwipeDetector.Companion.ACTION_POINTER_UP
import com.freekiosk.TwoFingerSwipeDetector.Companion.ACTION_UP
import com.freekiosk.TwoFingerSwipeDetector.Direction
import com.freekiosk.TwoFingerSwipeDetector.Event
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TwoFingerSwipeDetectorTest {
  // 1 px = 1 dp here: 48 to swipe, 40 of pinch tolerance, 16 before a drag starts.
  private val detector = TwoFingerSwipeDetector(48f, 40f, 16f)

  private data class P(val x: Float, val y: Float)
  private val a = P(400f, 400f)
  private val b = P(500f, 400f)
  private var clock = 0L

  private fun touch(action: Int, vararg points: P, d: TwoFingerSwipeDetector = detector): Event? {
    clock += 16
    return d.onTouch(
      action,
      points.size,
      FloatArray(2) { points.getOrNull(it)?.x ?: 0f },
      FloatArray(2) { points.getOrNull(it)?.y ?: 0f },
      clock,
    )
  }

  private fun P.by(dx: Float, dy: Float) = P(x + dx, y + dy)

  /** Two fingers down, slide by [dx]/[dy] in steps, lift; returns every event reported. */
  private fun gesture(dx: Float, dy: Float, bdx: Float = dx, bdy: Float = dy, steps: Int = 4): List<Event> {
    val events = mutableListOf<Event?>()
    events += touch(ACTION_DOWN, a)
    events += touch(ACTION_POINTER_DOWN, a, b)
    for (i in 1..steps) {
      events += touch(ACTION_MOVE, a.by(dx * i / steps, dy * i / steps), b.by(bdx * i / steps, bdy * i / steps))
    }
    events += touch(ACTION_POINTER_UP, a.by(dx, dy), b.by(bdx, bdy))
    events += touch(ACTION_UP, a.by(dx, dy))
    return events.filterNotNull().filter { it != Event.Begin }
  }

  @Test
  fun reportsBeginAsSoonAsTheFingersAreDown() {
    assertNull(touch(ACTION_DOWN, a))
    assertEquals(Event.Begin, touch(ACTION_POINTER_DOWN, a, b))
  }

  @Test
  fun reportsVerticalSwipesOnTheFinalUp() {
    assertEquals(listOf(Event.Swipe(Direction.DOWN)), gesture(0f, 120f))
    assertEquals(listOf(Event.Swipe(Direction.UP)), gesture(0f, -120f))
  }

  @Test
  fun aSidewaysDragStreamsItsTravelFromZeroThenEnds() {
    // Travel is counted past the 16 px slop, so the tiles do not jump when the drag starts.
    val events = gesture(-160f, 0f)
    assertEquals(listOf(-24f, -64f, -104f, -144f), events.filterIsInstance<Event.Drag>().map { it.dxPx })
    val end = events.last() as Event.DragEnd
    assertEquals(-144f, end.dxPx)
    assertTrue("moving left fast", end.velocityPxPerSec < 0f)
  }

  @Test
  fun aDragCanTurnBack() {
    touch(ACTION_DOWN, a)
    touch(ACTION_POINTER_DOWN, a, b)
    assertEquals(Event.Drag(-84f), touch(ACTION_MOVE, a.by(-100f, 0f), b.by(-100f, 0f)))
    assertEquals(Event.Drag(46f), touch(ACTION_MOVE, a.by(30f, 0f), b.by(30f, 0f)))
    touch(ACTION_POINTER_UP, a.by(30f, 0f), b.by(30f, 0f))
    assertEquals(46f, (touch(ACTION_UP, a.by(30f, 0f)) as Event.DragEnd).dxPx)
  }

  @Test
  fun aPauseBeforeLiftingIsNotAFlick() {
    touch(ACTION_DOWN, a)
    touch(ACTION_POINTER_DOWN, a, b)
    touch(ACTION_MOVE, a.by(-60f, 0f), b.by(-60f, 0f))
    touch(ACTION_MOVE, a.by(-120f, 0f), b.by(-120f, 0f))
    clock += 300
    touch(ACTION_POINTER_UP, a.by(-120f, 0f), b.by(-120f, 0f))
    assertEquals(0f, (touch(ACTION_UP, a.by(-120f, 0f)) as Event.DragEnd).velocityPxPerSec)
  }

  @Test
  fun ignoresShortDragsAndPinches() {
    assertEquals(emptyList<Event>(), gesture(0f, 30f))
    assertEquals(emptyList<Event>(), gesture(10f, 0f))
    assertEquals(emptyList<Event>(), gesture(-100f, 0f, 100f, 0f))
  }

  @Test
  fun ignoresOneFingerSwipes() {
    touch(ACTION_DOWN, a)
    assertNull(touch(ACTION_MOVE, a.by(0f, 200f)))
    assertNull(touch(ACTION_MOVE, a.by(-200f, 0f)))
    assertNull(touch(ACTION_UP, a.by(-200f, 0f)))
  }

  @Test
  fun aThirdFingerCancelsADrag() {
    touch(ACTION_DOWN, a)
    touch(ACTION_POINTER_DOWN, a, b)
    touch(ACTION_MOVE, a.by(-120f, 0f), b.by(-120f, 0f))
    assertEquals(Event.DragCancel, touch(ACTION_POINTER_DOWN, a.by(-120f, 0f), b.by(-120f, 0f), P(600f, 400f)))
    touch(ACTION_POINTER_UP, a.by(-120f, 0f), b.by(-120f, 0f), P(600f, 400f))
    touch(ACTION_POINTER_UP, a.by(-120f, 0f), b.by(-120f, 0f))
    assertNull(touch(ACTION_UP, a.by(-120f, 0f)))
  }

  @Test
  fun aSystemCancelCancelsADragAndDropsASwipe() {
    touch(ACTION_DOWN, a)
    touch(ACTION_POINTER_DOWN, a, b)
    touch(ACTION_MOVE, a.by(-120f, 0f), b.by(-120f, 0f))
    assertEquals(Event.DragCancel, touch(ACTION_CANCEL, a.by(-120f, 0f), b.by(-120f, 0f)))

    touch(ACTION_DOWN, a)
    touch(ACTION_POINTER_DOWN, a, b)
    touch(ACTION_MOVE, a.by(0f, 120f), b.by(0f, 120f))
    assertNull(touch(ACTION_CANCEL, a.by(0f, 120f), b.by(0f, 120f)))
    touch(ACTION_DOWN, a)
    assertNull(touch(ACTION_UP, a))
  }

  @Test
  fun worksWithOneFingerWhenAskedTo() {
    val one = TwoFingerSwipeDetector(48f, 40f, 16f, fingers = 1)
    assertEquals(Event.Begin, touch(ACTION_DOWN, a, d = one))
    assertEquals(Event.Drag(-84f), touch(ACTION_MOVE, a.by(-100f, 0f), d = one))
    assertTrue(touch(ACTION_UP, a.by(-100f, 0f), d = one) is Event.DragEnd)
    touch(ACTION_DOWN, a, d = one)
    touch(ACTION_MOVE, a.by(0f, 120f), d = one)
    assertEquals(Event.Swipe(Direction.DOWN), touch(ACTION_UP, a.by(0f, 120f), d = one))
  }
}
