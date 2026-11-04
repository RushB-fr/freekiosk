package com.freekiosk

import android.app.Activity
import android.app.KeyguardManager
import android.content.Context
import android.os.Build

/**
 * Dismisses a lock screen that has no PIN, pattern or password.
 *
 * Such a lock screen only asks for a swipe, and on some devices (Amazon Fire tablets, where it
 * cannot be turned off in Settings) it stays in front of FreeKiosk after a boot until someone
 * swipes it away. A secure lock screen is left alone: dismissing it would ask for the credential.
 */
object KeyguardHelper {
    fun dismissIfInsecure(activity: Activity) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        try {
            val km = activity.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
            if (km.isKeyguardLocked && !km.isDeviceSecure) {
                DebugLog.d("KeyguardHelper", "Dismissing the insecure lock screen")
                km.requestDismissKeyguard(activity, null)
            }
        } catch (e: Exception) {
            DebugLog.errorProduction("KeyguardHelper", "Could not dismiss the lock screen: ${e.message}")
        }
    }
}
