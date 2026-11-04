package com.freekiosk

import android.app.Activity
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.WindowManager

/**
 * Loading screen shown at boot when the Device Owner boot lock does not apply.
 *
 * Without Device Owner, BootReceiver launches MainActivity only after BOOT_LAUNCH_DELAY_MS, and on
 * a busy device the launcher of the system shows in the meantime, for more than ten seconds on an
 * Amazon Fire. This native activity needs no React Native, so it can be in front at once; it has
 * the look of BootLockActivity's screen but neither locks the task nor launches MainActivity, and
 * it finishes as soon as MainActivity has started (or after MAX_SHOW_MS, so it cannot stay).
 */
class BootSplashActivity : Activity() {

    companion object {
        private const val TAG = "BootSplashActivity"
        private const val POLL_MS = 250L
        private const val MAX_SHOW_MS = 60_000L
    }

    private val handler = Handler(Looper.getMainLooper())
    private var shownAt = 0L

    private val poll = object : Runnable {
        override fun run() {
            val elapsed = SystemClock.elapsedRealtime() - shownAt
            if (MainActivity.hasStarted || elapsed > MAX_SHOW_MS) {
                DebugLog.d(TAG, "Finishing after ${elapsed} ms (MainActivity started: ${MainActivity.hasStarted})")
                finish()
                return
            }
            handler.postDelayed(this, POLL_MS)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
            WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.attributes.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
        }
        setContentView(R.layout.activity_boot_lock)
        KeyguardHelper.dismissIfInsecure(this)
        shownAt = SystemClock.elapsedRealtime()
        handler.post(poll)
    }

    override fun onDestroy() {
        handler.removeCallbacks(poll)
        super.onDestroy()
    }

    @Deprecated("Back must not leave the loading screen for the launcher behind it")
    override fun onBackPressed() {
        // Swallowed on purpose: MainActivity follows within seconds.
    }
}
