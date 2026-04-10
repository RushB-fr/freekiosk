package com.freekiosk

import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import android.util.Log
import android.view.WindowManager

/**
 * BroadcastReceiver to detect screen ON/OFF events
 * Used to track actual screen state for REST API
 *
 * Note: This receiver stores the screen state and can be queried by KioskModule
 * to get the current screen state for the REST API.
 *
 * When "Auto Wake on Screen Off" is enabled in SharedPreferences, this receiver
 * will immediately re-wake the screen after detecting ACTION_SCREEN_OFF.
 */
class ScreenStateReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "ScreenStateReceiver"
        private const val WAKE_LOCK_TIMEOUT = 10_000L // 10 seconds
        @Volatile
        var isScreenOn = true  // Assume screen is on initially
            private set
    }

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_SCREEN_ON -> {
                Log.d(TAG, "Screen turned ON")
                isScreenOn = true
            }
            Intent.ACTION_SCREEN_OFF -> {
                Log.d(TAG, "Screen turned OFF")
                isScreenOn = false

                // Check if auto-wake is enabled
                val prefs = context.getSharedPreferences("FreeKioskSettings", Context.MODE_PRIVATE)
                val autoWakeEnabled = prefs.getBoolean("auto_wake_on_screen_off", false)
                if (autoWakeEnabled) {
                    Log.d(TAG, "Auto-wake enabled — turning screen back ON")
                    wakeScreen(context)
                }
            }
        }
    }

    private fun wakeScreen(context: Context) {
        try {
            val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager

            // Acquire a WakeLock to physically turn the screen on
            @Suppress("DEPRECATION")
            val wakeLock = powerManager.newWakeLock(
                PowerManager.FULL_WAKE_LOCK or
                PowerManager.ACQUIRE_CAUSES_WAKEUP or
                PowerManager.ON_AFTER_RELEASE,
                "FreeKiosk:AutoWake"
            )
            wakeLock.acquire(WAKE_LOCK_TIMEOUT)
            Log.d(TAG, "Auto-wake WakeLock acquired — screen should be turning on")

            // Try to set activity flags (dismiss keyguard, keep screen on)
            try {
                val reactApp = context.applicationContext
                if (reactApp is com.facebook.react.ReactApplication) {
                    val reactHost = reactApp.reactNativeHost
                    val reactContext = reactHost.reactInstanceManager?.currentReactContext
                    val activity = reactContext?.currentActivity
                    if (activity != null) {
                        activity.runOnUiThread {
                            try {
                                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                                    activity.setShowWhenLocked(true)
                                    activity.setTurnScreenOn(true)
                                    val keyguardManager = context.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
                                    keyguardManager.requestDismissKeyguard(activity, null)
                                } else {
                                    @Suppress("DEPRECATION")
                                    activity.window.addFlags(
                                        WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
                                        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                                        WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                                    )
                                }

                                // Restore FLAG_KEEP_SCREEN_ON if enabled
                                val prefs = context.getSharedPreferences("FreeKioskSettings", Context.MODE_PRIVATE)
                                val keepScreenOn = prefs.getBoolean("keep_screen_on", true)
                                if (keepScreenOn) {
                                    activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                                }

                                // Restore brightness to system default
                                val layoutParams = activity.window.attributes
                                layoutParams.screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
                                activity.window.attributes = layoutParams

                                Log.d(TAG, "Auto-wake activity flags restored")
                            } catch (e: Exception) {
                                Log.e(TAG, "Auto-wake: failed to set activity flags: ${e.message}")
                            }
                        }
                    } else {
                        Log.w(TAG, "Auto-wake: no current activity — WakeLock alone will handle wake")
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Auto-wake: could not access activity: ${e.message}")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Auto-wake failed: ${e.message}", e)
        }
    }
}
