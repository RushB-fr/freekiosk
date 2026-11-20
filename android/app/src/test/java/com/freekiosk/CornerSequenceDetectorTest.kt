package com.freekiosk

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CornerSequenceDetectorTest {
  // A 1000 x 600 screen with 80 px corners
  private val detector = CornerSequenceDetector(80f, 3000L)
  private var clock = 0L

  private fun topLeft(after: Long = 200) = tap(10f, 10f, after)
  private fun bottomRight(after: Long = 200) = tap(990f, 590f, after)
  private fun middle(after: Long = 200) = tap(500f, 300f, after)
  private fun tap(x: Float, y: Float, after: Long): Boolean {
    clock += after
    return detector.onTap(x, y, 1000, 600, clock)
  }

  @Test
  fun `two taps top left then two bottom right open the settings`() {
    assertFalse(topLeft())
    assertFalse(topLeft())
    assertFalse(bottomRight())
    assertTrue(bottomRight())
  }

  @Test
  fun `the same key pressed again and again never opens them`() {
    repeat(20) { assertFalse(middle()) }
    repeat(20) { assertFalse(topLeft()) }
  }

  @Test
  fun `a third tap top left still counts`() {
    topLeft(); topLeft(); topLeft()
    bottomRight()
    assertTrue(bottomRight())
  }

  @Test
  fun `a tap elsewhere breaks the sequence`() {
    topLeft(); topLeft(); middle(); bottomRight()
    assertFalse(bottomRight())
  }

  @Test
  fun `the wrong order does not count`() {
    bottomRight(); bottomRight(); topLeft()
    assertFalse(topLeft())
  }

  @Test
  fun `too slow does not count`() {
    topLeft(); topLeft(); bottomRight()
    assertFalse(bottomRight(after = 3000))
  }

  @Test
  fun `the sequence starts over after it fired`() {
    topLeft(); topLeft(); bottomRight(); bottomRight()
    assertFalse(bottomRight())
    topLeft(); topLeft(); bottomRight()
    assertTrue(bottomRight())
  }

  @Test
  fun `just outside the corner does not count`() {
    tap(81f, 10f, 200); topLeft(); bottomRight()
    assertFalse(bottomRight())
  }
}
