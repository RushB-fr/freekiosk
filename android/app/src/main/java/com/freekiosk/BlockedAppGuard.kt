package com.freekiosk

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.util.Log

/**
 * Defensive foreground rejection for a package that was already visible during the
 * short interval in which Device Owner hiding was being applied. Normal launches never
 * reach this path because a hidden package has no resolvable launcher Activity.
 */
object BlockedAppGuard {
    private const val TAG = "BlockedAppGuard"
    private const val REJECTION_THROTTLE_MS = 250L
    private var lastRejectedPackage: String? = null
    private var lastRejectedAt = 0L

    @Synchronized
    fun rejectIfBlocked(context: Context, packageName: String?): Boolean {
        val target = packageName?.trim().orEmpty()
        if (target.isEmpty() || !BlockedAppPolicy.shouldRejectForegroundPackage(context, target)) {
            return false
        }

        val now = System.currentTimeMillis()
        if (target == lastRejectedPackage && now - lastRejectedAt < REJECTION_THROTTLE_MS) {
            return true
        }
        lastRejectedPackage = target
        lastRejectedAt = now

        Log.w(TAG, "Rejecting blocked foreground package: $target")
        BlockedAppPolicy.reconcile(context)
        try {
            val kioskEnabled = BlockedAppPolicy.isKioskEnabled(context)
            val escapedByAccessibility = !kioskEnabled &&
                FreeKioskAccessibilityService.returnHomeForBlockedApp()
            if (!escapedByAccessibility) {
                val escapeIntent = if (kioskEnabled) {
                    Intent(context, MainActivity::class.java).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                    }
                } else {
                    Intent(Intent.ACTION_MAIN).apply {
                        addCategory(Intent.CATEGORY_HOME)
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                    }
                }
                context.startActivity(escapeIntent)
            }
        } catch (error: Exception) {
            DebugLog.errorProduction(TAG, "Could not leave blocked foreground app: ${error.message}")
        }

        Handler(Looper.getMainLooper()).postDelayed({
            runCatching {
                val activityManager =
                    context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
                activityManager.killBackgroundProcesses(target)
            }
            BlockedAppPolicy.reconcile(context)
        }, 150L)
        return true
    }
}
