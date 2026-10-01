package com.freekiosk

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import android.util.Log

/**
 * Owns the "FreeKiosk is the Home app" Device Owner policy (#199), including giving Home back.
 *
 * Pinning is one call: addPersistentPreferredActivity(HOME -> MainActivity). The platform then
 * also moves the Home *role* to FreeKiosk. Undoing it is the part that was broken: clearing the
 * persistent preference leaves no preferred Home activity, and the platform's
 * updateDefaultHomeNotLocked() does nothing when there is no preferred package, so the role
 * stayed on FreeKiosk. The result, seen on a Samsung Android 16 tablet, was that after turning
 * the setting off (or exiting kiosk mode) the Home button kept opening FreeKiosk, with no way
 * back to the stock launcher short of `cmd role add-role-holder` over adb.
 *
 * The hand-back uses the same mechanism in reverse: briefly add a persistent preference for the
 * launcher we displaced, which moves the role to it, then clear that preference so the device
 * is left with an ordinary, user-changeable default. The pending hand-back package is recorded
 * so a process death between the two steps is cleaned up on the next [apply].
 */
object HomeLauncherPolicy {
    private const val TAG = "HomeLauncherPolicy"
    private const val PREFS_NAME = "FreeKioskSettings"

    /** Launcher that held Home before FreeKiosk took it, restored when we let go. */
    private const val KEY_PREVIOUS_HOME = "home_policy_previous_launcher"

    /** Set while FreeKiosk holds Home because of this policy (not a manual user choice). */
    private const val KEY_HOLDING_HOME = "home_policy_holding_home"

    /** Launcher package we pinned temporarily to move the role back, still to be cleared. */
    private const val KEY_PENDING_HANDBACK = "home_policy_pending_handback"

    /** Time for the role move to land before the temporary preference is removed. */
    private const val HANDBACK_CLEAR_DELAY_MS = 1500L

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private fun homeFilter() = IntentFilter(Intent.ACTION_MAIN).apply {
        addCategory(Intent.CATEGORY_HOME)
        addCategory(Intent.CATEGORY_DEFAULT)
    }

    private fun admin(context: Context) = ComponentName(context, DeviceAdminReceiver::class.java)

    private fun dpm(context: Context) =
        context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager

    /**
     * Pin FreeKiosk as Home when [enabled], otherwise release it. Throws if FreeKiosk is not
     * Device Owner, so callers that surface errors (the JS toggle) can report it.
     *
     * [forceHandBack] releases Home even when it was not recorded as taken by this policy. The
     * explicit settings toggle passes true (the user asked for the stock launcher, and devices
     * pinned by an older build have no record). The launch-time reconcile passes false so a
     * user who picked FreeKiosk as Home themselves is left alone.
     */
    fun apply(context: Context, enabled: Boolean, forceHandBack: Boolean) {
        val dpm = dpm(context)
        if (!dpm.isDeviceOwnerApp(context.packageName)) {
            throw IllegalStateException("Default launcher mode requires Device Owner")
        }
        clearPendingHandBack(context, dpm)
        if (enabled) {
            pin(context, dpm)
        } else {
            release(context, dpm, forceHandBack)
        }
    }

    /**
     * Give Home back for the rest of this session without changing the stored setting. Used by
     * Exit Kiosk Mode: the admin wants the stock launcher now, and MainActivity re-pins on the
     * next FreeKiosk launch because the setting is still on. No-op when not Device Owner.
     */
    fun releaseForSession(context: Context) {
        try {
            val dpm = dpm(context)
            if (!dpm.isDeviceOwnerApp(context.packageName)) return
            clearPendingHandBack(context, dpm)
            release(context, dpm, forceHandBack = false)
        } catch (e: Exception) {
            Log.e(TAG, "Could not release Home for this session: ${e.message}", e)
        }
    }

    private fun pin(context: Context, dpm: DevicePolicyManager) {
        val current = currentHomePackage(context)
        if (current != null && current != context.packageName) {
            prefs(context).edit().putString(KEY_PREVIOUS_HOME, current).apply()
        }
        dpm.clearPackagePersistentPreferredActivities(admin(context), context.packageName)
        dpm.addPersistentPreferredActivity(
            admin(context), homeFilter(), ComponentName(context, MainActivity::class.java)
        )
        prefs(context).edit().putBoolean(KEY_HOLDING_HOME, true).apply()
        Log.d(TAG, "FreeKiosk pinned as persistent Home (previous: $current)")
    }

    private fun release(context: Context, dpm: DevicePolicyManager, forceHandBack: Boolean) {
        val prefs = prefs(context)
        val wasHolding = prefs.getBoolean(KEY_HOLDING_HOME, false)
        dpm.clearPackagePersistentPreferredActivities(admin(context), context.packageName)
        prefs.edit().putBoolean(KEY_HOLDING_HOME, false).apply()

        if (!wasHolding && !forceHandBack) return
        if (currentHomePackage(context) != context.packageName) return

        val target = findHandBackLauncher(context, prefs.getString(KEY_PREVIOUS_HOME, null))
        if (target == null) {
            Log.w(TAG, "No other launcher to hand Home back to; FreeKiosk stays the Home app")
            return
        }

        // Moving the role: a persistent preference for the target makes the platform switch the
        // Home role holder to it. Record it first so a crash before the clear is recoverable.
        prefs.edit().putString(KEY_PENDING_HANDBACK, target.packageName).commit()
        dpm.addPersistentPreferredActivity(admin(context), homeFilter(), target)
        Log.d(TAG, "Home handed back to ${target.flattenToShortString()}")

        val appContext = context.applicationContext
        Handler(Looper.getMainLooper()).postDelayed({
            try {
                clearPendingHandBack(appContext, dpm(appContext))
            } catch (e: Exception) {
                Log.w(TAG, "Could not clear temporary Home preference: ${e.message}")
            }
        }, HANDBACK_CLEAR_DELAY_MS)
    }

    /** Remove the temporary preference left by a hand-back, keeping the role where it landed. */
    private fun clearPendingHandBack(context: Context, dpm: DevicePolicyManager) {
        val prefs = prefs(context)
        val pending = prefs.getString(KEY_PENDING_HANDBACK, null) ?: return
        if (pending != context.packageName) {
            dpm.clearPackagePersistentPreferredActivities(admin(context), pending)
        }
        prefs.edit().remove(KEY_PENDING_HANDBACK).apply()
    }

    /** Package the system currently sends Home to, or null when it would show the chooser. */
    private fun currentHomePackage(context: Context): String? {
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
        val info = context.packageManager.resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY)
        val pkg = info?.activityInfo?.packageName ?: return null
        // "android" is the ResolverActivity: no default chosen.
        return if (pkg == "android") null else pkg
    }

    /**
     * The launcher to return Home to: the one we displaced if it is still installed, otherwise
     * the best other Home activity, preferring the preinstalled launcher and skipping Settings'
     * FallbackHome (it is only meant for the boot-time gap before the real launcher starts).
     */
    private fun findHandBackLauncher(context: Context, preferredPackage: String?): ComponentName? {
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
        val candidates = context.packageManager
            .queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY)
            .filter {
                it.activityInfo.packageName != context.packageName &&
                    it.activityInfo.packageName != "com.android.settings" &&
                    it.priority > -1000
            }
        val chosen = candidates.firstOrNull { it.activityInfo.packageName == preferredPackage }
            ?: candidates.firstOrNull {
                (it.activityInfo.applicationInfo.flags and ApplicationInfo.FLAG_SYSTEM) != 0
            }
            ?: candidates.firstOrNull()
            ?: return null
        return ComponentName(chosen.activityInfo.packageName, chosen.activityInfo.name)
    }
}
