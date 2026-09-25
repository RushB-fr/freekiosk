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
        private const val PREFS = "FreeKioskSettings"
        private const val DELIBERATE_OFF_KEY = "deliberate_screen_off_at"

        /**
         * How long after a requested screen-off we still treat an ACTION_SCREEN_OFF as that
         * request rather than as the system sleeping the device. lockNow() is asynchronous:
         * the broadcast arrives a beat later, so this cannot be an exact match. Wide enough
         * to cover a slow device, short enough that a screen-off a few seconds later - the
         * user walking away, the system timeout - still auto-wakes as configured.
         */
        private const val DELIBERATE_OFF_GRACE_MS = 5_000L

        @Volatile
        var isScreenOn = true  // Assume screen is on initially
            private set

        /**
         * Record that FreeKiosk itself is about to turn the screen off, so auto-wake does
         * not immediately undo it.
         *
         * Auto-wake exists to bring the tablet back when *Android* sleeps it. It read
         * ACTION_SCREEN_OFF with no idea who caused it, so an admin sending a screen-off
         * over MQTT, REST or the cloud got the screen straight back on, with the two
         * features fighting each other and no way to tell from the outside. Reported by a
         * beta tester as "the screen just pops back on again".
         */
        fun markDeliberateScreenOff(context: Context) {
            try {
                context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit().putLong(DELIBERATE_OFF_KEY, System.currentTimeMillis()).apply()
            } catch (e: Exception) {
                Log.w(TAG, "Could not mark a deliberate screen-off: ${e.message}")
            }
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_SCREEN_ON -> {
                Log.d(TAG, "Screen turned ON")
                isScreenOn = true
                publishMqttStatus()
            }
            Intent.ACTION_SCREEN_OFF -> {
                Log.d(TAG, "Screen turned OFF")
                isScreenOn = false
                publishMqttStatus()

                // Dismiss the soft keyboard so it doesn't persist after the screen wakes up.
                // Needed when the user leaves a focused input (e.g. Force Numeric mode) and the
                // screen times out — without this the keyboard reappears on the next screen-on.
                dismissKeyboard(context)

                // Check if auto-wake is enabled
                val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                val autoWakeEnabled = prefs.getBoolean("auto_wake_on_screen_off", false)

                // Was this screen-off asked for, or did the system sleep the device? The
                // marker is consumed either way, so the next unattributed screen-off
                // auto-wakes as configured.
                val requestedAt = prefs.getLong(DELIBERATE_OFF_KEY, 0L)
                val wasRequested = requestedAt > 0L &&
                    System.currentTimeMillis() - requestedAt < DELIBERATE_OFF_GRACE_MS
                if (requestedAt > 0L) {
                    prefs.edit().remove(DELIBERATE_OFF_KEY).apply()
                }

                if (autoWakeEnabled && wasRequested) {
                    Log.d(TAG, "Auto-wake skipped: this screen-off was requested by FreeKiosk")
                } else if (autoWakeEnabled) {
                    Log.d(TAG, "Auto-wake enabled — turning screen back ON")
                    wakeScreen(context)
                }
            }
        }
    }

    /**
     * #155: push the new screen state to MQTT immediately.
     *
     * The state topic is retained and otherwise only refreshed by the 30s timer, so Home
     * Assistant kept the old value and its Screen Power toggle snapped back to ON a couple
     * of seconds after being switched off. This is the authoritative moment: the screen has
     * actually changed state, whoever asked for it, and this runs natively so it also works
     * once lockNow() has suspended the JS thread.
     */
    private fun publishMqttStatus() {
        try {
            com.freekiosk.mqtt.MqttModule.publishStatusNow()
        } catch (e: Exception) {
            Log.w(TAG, "Could not publish MQTT status on screen change: ${e.message}")
        }
    }

    private fun dismissKeyboard(context: Context) {
        try {
            val reactApp = context.applicationContext
            if (reactApp is com.facebook.react.ReactApplication) {
                val reactContext = reactApp.reactNativeHost.reactInstanceManager?.currentReactContext
                val activity = reactContext?.currentActivity
                if (activity != null) {
                    KeyboardUtils.dismiss(activity)
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Could not dismiss keyboard on screen off: ${e.message}")
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

                                // #242: restore the requested brightness, not the system
                                // default. This is the auto-wake path the reporter hit on every
                                // charger plug and unplug.
                                BrightnessPrefs.applyToWindow(context, activity.window)

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
