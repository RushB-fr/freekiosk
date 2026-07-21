package com.freekiosk

import android.app.Activity
import android.content.Context
import android.util.Log
import android.view.inputmethod.InputMethodManager

/**
 * Shared helper to dismiss the soft keyboard at the window level.
 *
 * Unlike React Native's `Keyboard.dismiss()` (which only affects RN `TextInput`
 * components), this acts on the activity's focused view / decor view via
 * `InputMethodManager`, so it also closes a keyboard raised by an `<input>`
 * inside a WebView. Used both on screen-off (#135) and when the screensaver
 * activates while the screen stays on (#135 — "Keep Screen On" mode).
 */
object KeyboardUtils {
    private const val TAG = "KeyboardUtils"

    fun dismiss(activity: Activity) {
        activity.runOnUiThread {
            try {
                val imm = activity.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
                val focusedView = activity.currentFocus ?: activity.window.decorView
                imm.hideSoftInputFromWindow(focusedView.windowToken, 0)
                focusedView.clearFocus()
                Log.d(TAG, "Soft keyboard dismissed")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to dismiss keyboard: ${e.message}")
            }
        }
    }
}
