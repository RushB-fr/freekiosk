package com.freekiosk

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.app.Activity
import android.graphics.Bitmap
import android.graphics.Rect
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.PixelCopy
import android.view.View
import android.view.ViewGroup
import android.view.animation.DecelerateInterpolator
import android.widget.FrameLayout
import android.widget.ImageView
import java.lang.ref.WeakReference
import kotlin.math.abs
import kotlin.math.sign

/**
 * Slides the dashboard tiles kept loaded side by side, like desktops, under a sideways
 * two-finger drag (TwoFingerSwipeDetector). It runs on the UI thread, fed straight from
 * MainActivity.dispatchTouchEvent, so the tiles move in the same frame as the fingers with no
 * trip through JS, and the settle or spring-back animation runs here too.
 *
 * KioskScreen tells it which views are the tile on screen and its neighbours ([setTiles]) and
 * hears about a switch only once the slide has finished, with every finger already up, then
 * makes the new tile the shown one.
 *
 * As soon as two fingers land ([begin]), before anything moves, the neighbours are placed just
 * off screen on either side and every tile gets a GPU layer, so a drag only moves three ready
 * textures as one strip. Measured on a MediaTek tablet with real two-finger input: without
 * layers the slide ran at about 30 fps (two web pages redrawn each frame); building them on
 * the first moving frame made the slide start with several 30-60 ms frames. Hidden tiles are
 * never paused (KioskScreen keeps them live), so the neighbours already have something to draw.
 *
 * The tile on screen is the one live page, and its redraws during a slide were what still cost
 * frames (its layer re-rendered). So it is also copied off the screen when the fingers land
 * (PixelCopy, a few ms on the GPU) and, during the slide, that picture moves in its place on
 * an overlay above the app while the page itself is not drawn. The page keeps running and sees
 * nothing; on a spring-back it is shown again in the frame the picture goes. Without the copy
 * in time (or before Android 8) the live tile slides instead.
 */
class TileSlider(private val activity: Activity) {
  private val density = activity.resources.displayMetrics.density
  private var current: WeakReference<View>? = null
  private var prev: WeakReference<View>? = null
  private var next: WeakReference<View>? = null
  private var hasPrev = false
  private var hasNext = false
  // After a switch, until KioskScreen has made the new tile the shown one and sent its views.
  private var awaitingTiles = false
  private var pendingTiles: (() -> Unit)? = null
  private var dragging = false
  private var animator: ValueAnimator? = null
  private var offset = 0f // the shown tile's translation
  private val layered = mutableListOf<View>()
  private var snapshot: Bitmap? = null
  private var snapshotReady = false
  private var snapshotRequest = 0
  private var snapshotView: ImageView? = null
  private var sliding: View? = null // what moves in the shown tile's place: it, or its picture

  /**
   * The views to slide. A null [current] means the tiles are not kept loaded: a drag then moves
   * nothing and a switch is reported straight away on release. [hasPrev]/[hasNext] say whether
   * there is a tile that way at all, even if its view is not mounted.
   */
  fun setTiles(current: View?, prev: View?, next: View?, hasPrev: Boolean, hasNext: Boolean) {
    val apply = {
      this.current = current?.let { WeakReference(it) }
      this.prev = prev?.let { WeakReference(it) }
      this.next = next?.let { WeakReference(it) }
      this.hasPrev = hasPrev
      this.hasNext = hasNext
      awaitingTiles = false
    }
    if (dragging || animator != null) pendingTiles = apply else apply()
  }

  /** Two fingers are down: get the strip ready, off screen. */
  fun begin() {
    if (awaitingTiles || animator != null || dragging) return
    val shown = current?.get() ?: return
    offset = 0f
    place(shown, 0f)
    copyShown(shown)
  }

  fun drag(dxPx: Float) {
    if (awaitingTiles || animator != null) return
    val shown = current?.get() ?: return
    if (!dragging) useSnapshot(shown)
    dragging = true
    // Nothing that way: resist, then spring back on release.
    offset = if (if (dxPx < 0) hasNext else hasPrev) dxPx else dxPx * RESISTANCE
    place(shown, offset)
  }

  /** Every finger is up: slide the next tile in, or spring back. */
  fun end(dxPx: Float, vxPx: Float, fallbackWidthPx: Int, onSwitch: (String) -> Unit) {
    dragging = false
    if (awaitingTiles) return
    val shown = current?.get()
    val widthPx = shown?.width?.takeIf { it > 0 } ?: fallbackWidthPx
    val direction = switchDirection(dxPx / density, vxPx / density, widthPx / density)
    if (shown == null) {
      if (direction != null) onSwitch(direction)
      return
    }
    val toNext = dxPx < 0
    val switching = direction != null && (if (toNext) hasNext else hasPrev)
    settle(shown, if (switching) (if (toNext) next else prev)?.get() else null, toNext, switching, vxPx) {
      if (switching && direction != null) onSwitch(direction)
    }
  }

  /** Android took the gesture or a third finger landed: spring back. */
  fun cancel() {
    if (!dragging) return
    dragging = false
    val shown = current?.get() ?: return
    settle(shown, null, offset < 0, false, 0f) {}
  }

  /** A gesture that never became a drag is over: put everything back. */
  fun idle() {
    if (dragging || animator != null) return
    current?.get()?.let { rest(it, incoming = null) }
  }

  private fun settle(shown: View, incoming: View?, toNext: Boolean, switching: Boolean, vxPx: Float, done: () -> Unit) {
    val width = shown.width.toFloat()
    val target = if (!switching) 0f else if (toNext) -width else width
    // Carry on at the release speed, so a flick keeps its momentum, within sane bounds.
    val speed = maxOf(abs(vxPx), MIN_SETTLE_SPEED_DP * density)
    val duration = (abs(target - offset) / speed * 1000f).toLong().coerceIn(MIN_SETTLE_MS, MAX_SETTLE_MS)
    animator = ValueAnimator.ofFloat(offset, target).apply {
      this.duration = duration
      interpolator = DecelerateInterpolator(1.5f)
      addUpdateListener { place(shown, it.animatedValue as Float) }
      addListener(object : AnimatorListenerAdapter() {
        override fun onAnimationEnd(animation: Animator) {
          animator = null
          rest(shown, incoming)
          if (switching) {
            // The incoming tile now sits where the shown one was; KioskScreen swaps them over.
            awaitingTiles = true
            pendingTiles = null // describes the tiles before the switch
          } else {
            pendingTiles?.invoke()
            pendingTiles = null
          }
          done()
        }
      })
      start()
    }
  }

  /** The three tiles as one strip, the shown one at [x]. */
  private fun place(shown: View, x: Float) {
    val width = shown.width
    show(sliding ?: shown, x)
    val before = prev?.get()
    val after = next?.get()
    // With only two tiles the same view is both neighbours: it goes on the side being revealed.
    if (before != null && before === after) {
      if (before !== shown) show(before, x + if (x < 0) width else -width)
      return
    }
    before?.let { if (it !== shown) show(it, x - width) }
    after?.let { if (it !== shown) show(it, x + width) }
  }

  private fun show(view: View, x: Float) {
    if (layered.none { it === view }) {
      view.setLayerType(View.LAYER_TYPE_HARDWARE, null)
      layered += view
    }
    view.alpha = 1f
    view.translationX = x
  }

  /** Slide over: [incoming] (if any) is the tile now in place; everything else is reset. */
  private fun rest(shown: View, incoming: View?) {
    offset = 0f
    snapshotRequest++ // a copy still on its way is no longer wanted
    snapshotReady = false
    for (view in listOf(shown, prev?.get(), next?.get())) {
      if (view == null || view === incoming) continue
      view.translationX = 0f
      view.alpha = if (view === shown && incoming == null) 1f else 0f
    }
    incoming?.translationX = 0f
    // The page comes back (on a spring-back) in the same frame as its picture goes.
    snapshotView?.let { (it.parent as? ViewGroup)?.removeView(it) }
    sliding = null
    layered.forEach { it.setLayerType(View.LAYER_TYPE_NONE, null) }
    layered.clear()
  }

  /** Copy what is on screen where [shown] is, for [useSnapshot]. */
  private fun copyShown(shown: View) {
    snapshotReady = false
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || shown.width == 0 || shown.height == 0) return
    val bitmap = snapshot?.takeIf { it.width == shown.width && it.height == shown.height }
      ?: Bitmap.createBitmap(shown.width, shown.height, Bitmap.Config.ARGB_8888).also { snapshot = it }
    val at = IntArray(2).also { shown.getLocationInWindow(it) }
    val request = ++snapshotRequest
    try {
      PixelCopy.request(activity.window, Rect(at[0], at[1], at[0] + shown.width, at[1] + shown.height), bitmap, { result ->
        if (request == snapshotRequest && result == PixelCopy.SUCCESS) snapshotReady = true
      }, Handler(Looper.getMainLooper()))
    } catch (e: Exception) {
      // Window not ready, surface gone: slide the live tile instead.
    }
  }

  /** The drag starts: if the copy is ready, slide it instead of the live tile. */
  private fun useSnapshot(shown: View) {
    val bitmap = snapshot
    if (!snapshotReady || bitmap == null) return
    val content = activity.findViewById<ViewGroup>(android.R.id.content) ?: return
    val at = IntArray(2).also { shown.getLocationInWindow(it) }
    val from = IntArray(2).also { content.getLocationInWindow(it) }
    val view = snapshotView ?: ImageView(activity).also {
      it.scaleType = ImageView.ScaleType.FIT_XY
      it.isClickable = false
      it.isFocusable = false
      it.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
      snapshotView = it
    }
    view.setImageBitmap(bitmap)
    (view.parent as? ViewGroup)?.removeView(view)
    content.addView(view, FrameLayout.LayoutParams(shown.width, shown.height).apply {
      leftMargin = at[0] - from[0]
      topMargin = at[1] - from[1]
    })
    view.translationX = 0f
    view.alpha = 1f
    sliding = view
    // Not drawn while its picture stands in, so its redraws cost nothing; it keeps running.
    shown.alpha = 0f
    shown.translationX = 0f
  }

  companion object {
    /** Share of the width a drag must cover to switch tiles... */
    private const val SWITCH_FRACTION = 0.3f
    /** ...or a flick: at least this fast (dp/s) the same way, over at least this far (dp). */
    private const val FLICK_MIN_SPEED_DP = 600f
    private const val FLICK_MIN_DISTANCE_DP = 32f
    /** How much of the drag shows when there is no tile that way. */
    private const val RESISTANCE = 0.25f
    private const val MIN_SETTLE_SPEED_DP = 2500f
    private const val MIN_SETTLE_MS = 120L
    private const val MAX_SETTLE_MS = 300L

    /**
     * Where a drag released at [dxDp]/[vxDp] goes on a [widthDp] wide screen: "left" (the
     * fingers moved left: next tile), "right" (previous tile), or null to spring back.
     */
    fun switchDirection(dxDp: Float, vxDp: Float, widthDp: Float): String? {
      val direction = if (dxDp < 0) "left" else "right"
      if (abs(dxDp) >= widthDp * SWITCH_FRACTION) return direction
      val flick = abs(dxDp) >= FLICK_MIN_DISTANCE_DP && abs(vxDp) >= FLICK_MIN_SPEED_DP && sign(vxDp) == sign(dxDp)
      return if (flick) direction else null
    }
  }
}
