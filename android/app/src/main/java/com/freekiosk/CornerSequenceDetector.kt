package com.freekiosk

/**
 * The "corner sequence" way back to the settings: two taps in the top-left corner, then two in
 * the bottom-right corner, all within [windowMs]. Unlike N taps in one place, an on-screen
 * keypad in the page cannot produce it by accident (#180's N-tap counter fired when the same
 * key was pressed N times).
 *
 * MainActivity feeds it every ACTION_DOWN while the kiosk screen is shown; it never consumes the
 * touch, so the page still gets the taps. A tap anywhere else breaks the sequence. Plain floats
 * and longs in, so it can be tested without a device.
 */
class CornerSequenceDetector(
  private val cornerPx: Float,
  private val windowMs: Long = WINDOW_MS,
) {
  private val corners = IntArray(SEQUENCE.size) { NONE }
  private val times = LongArray(SEQUENCE.size)
  private var count = 0

  /** Returns true when this tap completes the sequence. */
  fun onTap(x: Float, y: Float, width: Int, height: Int, timeMs: Long): Boolean {
    val corner = when {
      x <= cornerPx && y <= cornerPx -> TOP_LEFT
      x >= width - cornerPx && y >= height - cornerPx -> BOTTOM_RIGHT
      else -> NONE
    }
    // Keep the last SEQUENCE.size taps, oldest first
    if (count == SEQUENCE.size) {
      System.arraycopy(corners, 1, corners, 0, count - 1)
      System.arraycopy(times, 1, times, 0, count - 1)
      count--
    }
    corners[count] = corner
    times[count] = timeMs
    count++

    val done = count == SEQUENCE.size &&
      corners.contentEquals(SEQUENCE) &&
      timeMs - times[0] <= windowMs
    if (done) count = 0
    return done
  }

  companion object {
    const val CORNER_DP = 80f
    const val WINDOW_MS = 3000L
    private const val NONE = 0
    private const val TOP_LEFT = 1
    private const val BOTTOM_RIGHT = 2
    private val SEQUENCE = intArrayOf(TOP_LEFT, TOP_LEFT, BOTTOM_RIGHT, BOTTOM_RIGHT)
  }
}
