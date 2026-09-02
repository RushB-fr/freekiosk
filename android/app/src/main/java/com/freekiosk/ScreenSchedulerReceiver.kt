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
 * BroadcastReceiver for Screen Sleep Scheduler
 * 
 * Triggered by AlarmManager to reliably wake the screen at the scheduled time,
 * even when the screen was turned off via lockNow() (Device Owner mode).
 * 
 * This is necessary because JavaScript timers (setInterval) are suspended
 * when the screen is locked/off, so we can't rely on JS-side timers for wake.
 * 
 * Strategy:
 *   1. Acquire a FULL_WAKE_LOCK with ACQUIRE_CAUSES_WAKEUP to turn screen on
 *   2. Add window flags to show over the lock screen and dismiss keyguard
 *   3. Restore FLAG_KEEP_SCREEN_ON and brightness on the activity window
 *   4. Send JS event so React Native can update its state
 */
class ScreenSchedulerReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "ScreenSchedulerReceiver"
        const val ACTION_SCREEN_WAKE = "com.freekiosk.ACTION_SCHEDULED_SCREEN_WAKE"
        const val ACTION_SCREEN_SLEEP = "com.freekiosk.ACTION_SCHEDULED_SCREEN_SLEEP"
        private const val WAKE_LOCK_TIMEOUT = 60_000L // 60 seconds to let JS react
    }

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            ACTION_SCREEN_WAKE -> handleWake(context)
            ACTION_SCREEN_SLEEP -> handleSleep(context)
            else -> Log.w(TAG, "Unknown action: ${intent.action}")
        }
    }

    private fun handleWake(context: Context) {
        Log.d(TAG, "⏰ Scheduled WAKE alarm fired — turning screen ON")
        try {
            val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager

            // 1. Acquire a WakeLock to physically turn the screen on
            @Suppress("DEPRECATION")
            val wakeLock = powerManager.newWakeLock(
                PowerManager.FULL_WAKE_LOCK or
                PowerManager.ACQUIRE_CAUSES_WAKEUP or
                PowerManager.ON_AFTER_RELEASE,
                "FreeKiosk:ScheduledWake"
            )
            wakeLock.acquire(WAKE_LOCK_TIMEOUT)
            Log.d(TAG, "WakeLock acquired — screen should be turning on")

            // 2. Dismiss keyguard / show over lock screen on the activity
            //    This is needed if the user has a PIN/pattern lock.
            try {
                val app = context.applicationContext as? android.app.Application
                val activityClass = Class.forName("com.freekiosk.MainActivity")
                // Try to get the current activity via React Native's context
                val reactApp = context.applicationContext
                if (reactApp is com.facebook.react.ReactApplication) {
                    val reactHost = reactApp.reactNativeHost
                    val reactContext = reactHost.reactInstanceManager?.currentReactContext
                    val activity = reactContext?.currentActivity
                    if (activity != null) {
                        activity.runOnUiThread {
                            try {
                                // Show over lock screen
                                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                                    activity.setShowWhenLocked(true)
                                    activity.setTurnScreenOn(true)
                                    // Dismiss keyguard
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

                                // Restore FLAG_KEEP_SCREEN_ON only if not in system-managed mode
                                val prefs = context.getSharedPreferences("FreeKioskSettings", Context.MODE_PRIVATE)
                                val keepScreenOn = prefs.getBoolean("keep_screen_on", true)
                                if (keepScreenOn) {
                                    activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                                }

                                // #242: restore the requested brightness, not the system
                                // default. Screen Scheduler wake goes through here.
                                BrightnessPrefs.applyToWindow(context, activity.window)

                                Log.d(TAG, "Activity flags restored: KEEP_SCREEN_ON, brightness, keyguard dismissed")
                            } catch (e: Exception) {
                                Log.e(TAG, "Failed to set activity flags: ${e.message}")
                            }
                        }
                    } else {
                        Log.w(TAG, "No current activity available — WakeLock alone will handle wake")
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Could not access activity for flags: ${e.message}")
            }

            // 3. Send event to JS via KioskModule's static method
            KioskModule.sendEventFromNative("onScheduledWake", null)

            Log.d(TAG, "Screen wake triggered successfully, JS event sent")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to wake screen: ${e.message}", e)
        }
    }

    private fun handleSleep(context: Context) {
        Log.d(TAG, "⏰ Scheduled SLEEP alarm fired — turning screen OFF")
        try {
            // Send event to JS so the app can handle the sleep properly
            KioskModule.sendEventFromNative("onScheduledSleep", null)

            Log.d(TAG, "Sleep event sent to JS")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to trigger sleep: ${e.message}", e)
        }
    }
}
