package com.freekiosk

import android.accessibilityservice.AccessibilityService
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.os.PowerManager
import android.util.Log
import android.view.WindowManager
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.UiThreadUtil

object ScreenController {

    private const val TAG = "ScreenController"
    private const val WAKE_CHANNEL_ID = "freekiosk_wake"
    private const val WAKE_NOTIF_ID = 0xF00D
    private var wakeLock: PowerManager.WakeLock? = null

    fun turnScreenOn(reactContext: ReactApplicationContext) {
        UiThreadUtil.runOnUiThread {
            try {
                val powerManager = reactContext.getSystemService(Context.POWER_SERVICE) as PowerManager

                wakeLock?.release()

                @Suppress("DEPRECATION")
                wakeLock = powerManager.newWakeLock(
                    PowerManager.FULL_WAKE_LOCK or
                    PowerManager.ACQUIRE_CAUSES_WAKEUP or
                    PowerManager.ON_AFTER_RELEASE,
                    "FreeKiosk:ScreenOn"
                )
                wakeLock?.acquire(10 * 60 * 1000L)

                val activity = reactContext.currentActivity
                if (activity != null) {
                    val prefs = reactContext.getSharedPreferences("FreeKioskSettings", Context.MODE_PRIVATE)
                    val keepScreenOn = prefs.getBoolean("keep_screen_on", true)
                    if (keepScreenOn) {
                        activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                    }

                    // #242: re-apply the level FreeKiosk was asked to hold. Blanking the
                    // override here handed the panel back to a system value we never wrote.
                    BrightnessPrefs.applyToWindow(reactContext, activity.window)

                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                        activity.setShowWhenLocked(true)
                        activity.setTurnScreenOn(true)
                        val keyguardManager = reactContext.getSystemService(Context.KEYGUARD_SERVICE) as android.app.KeyguardManager
                        keyguardManager.requestDismissKeyguard(activity, null)
                    } else {
                        @Suppress("DEPRECATION")
                        activity.window.addFlags(
                            WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
                            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                            WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                        )
                    }

                    Log.d(TAG, "Screen turned ON (activity available)")
                } else {
                    Log.d(TAG, "Screen turned ON via WakeLock only (no activity)")
                }

                // Reliable wake on modern Android: a full-screen-intent notification
                // (the alarm / incoming-call pattern). The deprecated
                // ACQUIRE_CAUSES_WAKEUP wake lock and setTurnScreenOn on an already
                // created activity no longer turn the display on after lockNow() on
                // Android 12+/OEMs. A high-importance full-screen-intent notification
                // makes the system wake the screen and bring MainActivity to the front.
                // (Touch still cannot wake a truly-off screen; this drives screen_on
                // command / screensaver / scheduler wake.)
                try {
                    val appCtx = reactContext.applicationContext
                    val nm = appCtx.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        val channel = android.app.NotificationChannel(
                            WAKE_CHANNEL_ID, "Screen wake", android.app.NotificationManager.IMPORTANCE_HIGH
                        ).apply {
                            setSound(null, null)
                            enableVibration(false)
                            lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
                        }
                        nm.createNotificationChannel(channel)
                    }
                    val fsIntent = android.content.Intent(appCtx, MainActivity::class.java).addFlags(
                        android.content.Intent.FLAG_ACTIVITY_NEW_TASK or
                        android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP or
                        android.content.Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                    )
                    val piFlags = android.app.PendingIntent.FLAG_UPDATE_CURRENT or
                        android.app.PendingIntent.FLAG_IMMUTABLE
                    val pi = android.app.PendingIntent.getActivity(appCtx, 0, fsIntent, piFlags)
                    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                        android.app.Notification.Builder(appCtx, WAKE_CHANNEL_ID)
                    else @Suppress("DEPRECATION") android.app.Notification.Builder(appCtx)
                    val notif = builder
                        .setSmallIcon(R.mipmap.ic_launcher)
                        .setContentTitle("FreeKiosk")
                        .setContentText("Waking screen")
                        .setCategory(android.app.Notification.CATEGORY_ALARM)
                        .setFullScreenIntent(pi, true)
                        .setAutoCancel(true)
                        .build()
                    nm.notify(WAKE_NOTIF_ID, notif)
                    // Belt and suspenders: also bring the activity to the front directly.
                    reactContext.startActivity(fsIntent)
                    android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                        try { nm.cancel(WAKE_NOTIF_ID) } catch (_: Exception) {}
                    }, 3000)
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to wake screen via full-screen intent: ${e.message}")
                }

                android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                    try {
                        wakeLock?.release()
                        wakeLock = null
                        Log.d(TAG, "WakeLock released after screen on")
                    } catch (e: Exception) { /* already released */ }
                }, 5000)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to turn screen on: ${e.message}")
            }
        }
    }

    fun turnScreenOff(reactContext: ReactApplicationContext) {
        UiThreadUtil.runOnUiThread {
            try {
                wakeLock?.release()
                wakeLock = null

                val dpm = reactContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
                val adminComp = ComponentName(reactContext, DeviceAdminReceiver::class.java)

                if (dpm.isDeviceOwnerApp(reactContext.packageName) || dpm.isAdminActive(adminComp)) {
                    dpm.lockNow()
                    val method = if (dpm.isDeviceOwnerApp(reactContext.packageName)) "Device Owner" else "Device Admin"
                    Log.d(TAG, "Screen turned OFF via $method lockNow()")
                } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && FreeKioskAccessibilityService.isRunning()) {
                    val ok = FreeKioskAccessibilityService.performAction(AccessibilityService.GLOBAL_ACTION_LOCK_SCREEN)
                    if (ok) {
                        Log.d(TAG, "Screen locked via AccessibilityService")
                    } else {
                        dimScreen(reactContext)
                    }
                } else {
                    dimScreen(reactContext)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to turn screen off: ${e.message}")
            }
        }
    }

    private fun dimScreen(reactContext: ReactApplicationContext) {
        val activity = reactContext.currentActivity ?: return
        activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val layoutParams = activity.window.attributes
        layoutParams.screenBrightness = 0f
        activity.window.attributes = layoutParams
        Log.d(TAG, "Screen dimmed to 0 (no DO, no AccessibilityService)")
    }
}
