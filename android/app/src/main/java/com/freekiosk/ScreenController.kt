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

                    val layoutParams = activity.window.attributes
                    layoutParams.screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
                    activity.window.attributes = layoutParams

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
