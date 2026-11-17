package com.freekiosk

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.database.sqlite.SQLiteDatabase
import android.os.Build
import org.json.JSONArray

/**
 * Owns every package FreeKiosk blocks independently of the Lock Mode lifecycle.
 *
 * The selected list lives in AsyncStorage so it participates in the normal UI,
 * backup, and remote-settings flows. Device Owner hiding is the primary action:
 * hidden apps disappear from launchers and their activities cannot resolve. Package
 * suspension is retained as a fallback for devices that refuse hiding. If Android later
 * reverses a FreeKiosk-owned hide, the next reconciliation reasserts it; a foreground guard
 * closes any task exposed during that narrow interval. Private applied sets let later edits
 * restore only policy FreeKiosk owns. Samsung update packages keep their historical Lock
 * Mode-only suspension lifecycle.
 */
object BlockedAppPolicy {
    private const val TAG = "BlockedAppPolicy"
    private const val DATABASE_NAME = "RKStorage"
    private const val TABLE_NAME = "catalystLocalStorage"
    private const val STORAGE_KEY = "@kiosk_blocked_apps"
    private const val BLOCKING_ENABLED_KEY = "@kiosk_app_blocking_enabled"
    private const val HIDDEN_MODE_ENABLED_KEY = "@kiosk_hidden_mode_enabled"
    private const val KIOSK_ENABLED_KEY = "@kiosk_enabled"
    private const val POLICY_PREFS = "FreeKioskBlockedAppPolicy"
    private const val APPLIED_PACKAGES_KEY = "applied_packages"
    private const val APPLIED_HIDDEN_PACKAGES_KEY = "applied_hidden_packages"
    private const val GUARD_ONLY_PACKAGES_KEY = "guard_only_packages"
    private const val STORAGE_CACHE_PREFIX = "storage_cache:"

    // Preserve the existing FreeKiosk behavior under the same lifecycle owner.
    private val SAMSUNG_UPDATE_PACKAGES = setOf(
        "com.samsung.android.app.updatecenter",
        "com.sec.android.fotaclient",
        "com.wssyncmldm",
        "com.samsung.android.sdm.config",
        "com.sec.android.soagent",
    )

    fun isAppBlockingEnabled(context: Context): Boolean {
        val configuredPackages = readConfiguredPackages(context)
        val stored = readStorageValue(context, BLOCKING_ENABLED_KEY)
        val explicitlyEnabled = stored?.let { it == "true" } ?: configuredPackages.isNotEmpty()
        // Hidden Mode is the background-protection mode. A saved block list therefore
        // remains enforced while Hidden Mode is on even if an older installation saved
        // the independent App Blocking toggle as false.
        return explicitlyEnabled ||
            (isHiddenModeEnabled(context) && configuredPackages.isNotEmpty())
    }

    fun isHiddenModeEnabled(context: Context): Boolean =
        readStorageValue(context, HIDDEN_MODE_ENABLED_KEY) == "true"

    fun isKioskEnabled(context: Context): Boolean =
        readStorageValue(context, KIOSK_ENABLED_KEY) == "true"

    fun needsBackgroundService(context: Context): Boolean =
        isKioskEnabled(context) || isHiddenModeEnabled(context) || isAppBlockingEnabled(context)

    fun shouldRejectForegroundPackage(context: Context, packageName: String): Boolean =
        packageName != context.packageName &&
            isAppBlockingEnabled(context) &&
            packageName in readConfiguredPackages(context)

    fun configuredInstalledPackages(context: Context): Set<String> =
        readConfiguredPackages(context)
            .filter { it != context.packageName && isInstalled(context, it) }
            .toSet()

    @Synchronized
    fun reconcile(
        context: Context,
        kioskActive: Boolean = isKioskEnabled(context),
        blockingActive: Boolean? = null,
    ): Set<String> {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return emptySet()

        val appContext = context.applicationContext
        val dpm = appContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as? DevicePolicyManager
            ?: return emptySet()
        if (!dpm.isDeviceOwnerApp(appContext.packageName)) return emptySet()

        // Resolve the default after entering this synchronized method. In particular,
        // do not carry a value sampled by the watchdog before a concurrent settings
        // transaction completed.
        val blockingEnabled = blockingActive ?: isAppBlockingEnabled(appContext)

        val admin = ComponentName(appContext, DeviceAdminReceiver::class.java)
        val preferences = appContext.getSharedPreferences(POLICY_PREFS, Context.MODE_PRIVATE)
        val previouslySuspended = preferences.getStringSet(APPLIED_PACKAGES_KEY, emptySet())
            ?.toSet()
            .orEmpty()
        val previouslyHidden = preferences.getStringSet(APPLIED_HIDDEN_PACKAGES_KEY, emptySet())
            ?.toSet()
            .orEmpty()
        val previouslyGuardOnly = preferences.getStringSet(GUARD_ONLY_PACKAGES_KEY, emptySet())
            ?.toSet()
            .orEmpty()
        val appsToHide = if (blockingEnabled) {
            configuredInstalledPackages(appContext)
        } else {
            emptySet()
        }
        val packagesToSuspend = if (kioskActive) {
            SAMSUNG_UPDATE_PACKAGES.filter { isInstalled(appContext, it) }.toSet()
        } else {
            emptySet()
        }
        val failedToUnhide = mutableSetOf<String>()
        (previouslyHidden - appsToHide).forEach { packageName ->
            if (!setHidden(dpm, admin, packageName, false)) {
                failedToUnhide.add(packageName)
            }
        }

        val ownedSuspended = mutableSetOf<String>()
        val ownedHidden = mutableSetOf<String>()
        val ownedGuardOnly = mutableSetOf<String>()
        val blocked = mutableSetOf<String>()
        appsToHide.forEach { packageName ->
            when {
                isHidden(dpm, admin, packageName) -> {
                    // The package was already hidden by another administrator action.
                    // Claim it only when FreeKiosk hid it during an earlier enforcement.
                    if (packageName in previouslyHidden || packageName in previouslyGuardOnly) {
                        ownedHidden.add(packageName)
                    }
                    blocked.add(packageName)
                }
                setHidden(dpm, admin, packageName, true) -> {
                    ownedHidden.add(packageName)
                    blocked.add(packageName)
                }
                setSuspended(dpm, admin, packageName, true) -> {
                    ownedSuspended.add(packageName)
                    blocked.add(packageName)
                }
                packageName in previouslySuspended -> {
                    // Keep ownership so a later exit still retries cleanup if Android
                    // stopped reporting an already-applied suspension as successful.
                    ownedSuspended.add(packageName)
                }
                else -> {
                    // Some protected/system packages refuse both Device Owner controls.
                    // They can still be rejected from the foreground when Usage Access or
                    // the FreeKiosk accessibility service reports their window.
                    ownedGuardOnly.add(packageName)
                    blocked.add(packageName)
                    DebugLog.errorProduction(
                        TAG,
                        "Android refused hide and suspension for $packageName; using foreground guard",
                    )
                }
            }
        }
        packagesToSuspend.forEach { packageName ->
            if (packageName in appsToHide) return@forEach
            if (setSuspended(dpm, admin, packageName, true)) {
                ownedSuspended.add(packageName)
                blocked.add(packageName)
            } else if (packageName in previouslySuspended) {
                ownedSuspended.add(packageName)
            }
        }

        // Suspension is only retained when it is still the active fallback or a
        // Lock-Mode-only updater policy. If hiding starts working later, release the
        // older fallback suspension while keeping the package hidden.
        val failedToResume = mutableSetOf<String>()
        (previouslySuspended - ownedSuspended).forEach { packageName ->
            if (!setSuspended(dpm, admin, packageName, false)) {
                failedToResume.add(packageName)
            }
        }

        // Retain failed removals for a later cleanup retry. Ordinary hidden/suspended
        // packages are reasserted after replacement; guard-only is kept only for packages
        // that currently refuse both Device Owner controls.
        preferences.edit()
            .putStringSet(APPLIED_PACKAGES_KEY, failedToResume + ownedSuspended)
            .putStringSet(APPLIED_HIDDEN_PACKAGES_KEY, failedToUnhide + ownedHidden)
            .putStringSet(GUARD_ONLY_PACKAGES_KEY, ownedGuardOnly)
            .commit()
        DebugLog.d(
            TAG,
            "Package policy reconciled: kiosk=$kioskActive blocking=$blockingEnabled packages=${blocked.sorted()}",
        )
        return blocked
    }

    @Synchronized
    fun restoreAll(context: Context): Set<String> {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return emptySet()

        val appContext = context.applicationContext
        val dpm = appContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as? DevicePolicyManager
            ?: return emptySet()
        if (!dpm.isDeviceOwnerApp(appContext.packageName)) return emptySet()

        val admin = ComponentName(appContext, DeviceAdminReceiver::class.java)
        val preferences = appContext.getSharedPreferences(POLICY_PREFS, Context.MODE_PRIVATE)
        val appliedSuspended = preferences.getStringSet(APPLIED_PACKAGES_KEY, emptySet())
            ?.toSet()
            .orEmpty()
        val appliedHidden = preferences.getStringSet(APPLIED_HIDDEN_PACKAGES_KEY, emptySet())
            ?.toSet()
            .orEmpty()
        // Include legacy update packages so installing this release over an older active
        // kiosk can still restore packages suspended before the applied-set existed.
        val toResume = (appliedSuspended + SAMSUNG_UPDATE_PACKAGES)
            .filter { it != appContext.packageName && isInstalled(appContext, it) }
            .toSet()

        val failedToResume = mutableSetOf<String>()
        val failedToUnhide = mutableSetOf<String>()
        val restored = mutableSetOf<String>()
        toResume.forEach { packageName ->
            if (setSuspended(dpm, admin, packageName, false)) {
                restored.add(packageName)
            } else {
                failedToResume.add(packageName)
            }
        }
        appliedHidden.forEach { packageName ->
            if (setHidden(dpm, admin, packageName, false)) {
                restored.add(packageName)
            } else {
                failedToUnhide.add(packageName)
            }
        }
        preferences.edit()
            .putStringSet(APPLIED_PACKAGES_KEY, failedToResume)
            .putStringSet(APPLIED_HIDDEN_PACKAGES_KEY, failedToUnhide)
            .remove(GUARD_ONLY_PACKAGES_KEY)
            .commit()
        DebugLog.d(TAG, "All FreeKiosk-owned package policy restored: ${restored.sorted()}")
        return restored
    }

    private fun readConfiguredPackages(context: Context): Set<String> {
        return parsePackages(readStorageValue(context, STORAGE_KEY))
    }

    private fun readStorageValue(context: Context, key: String): String? {
        val appContext = context.applicationContext
        val preferences = appContext.getSharedPreferences(POLICY_PREFS, Context.MODE_PRIVATE)
        val cacheKey = "$STORAGE_CACHE_PREFIX$key"
        return try {
            val databasePath = appContext.getDatabasePath(DATABASE_NAME).absolutePath
            SQLiteDatabase.openDatabase(databasePath, null, SQLiteDatabase.OPEN_READONLY).use { database ->
                database.rawQuery(
                    "SELECT value FROM $TABLE_NAME WHERE key = ?",
                    arrayOf(key),
                ).use { cursor ->
                    val value = if (cursor.moveToFirst()) cursor.getString(0) else null
                    preferences.edit().apply {
                        if (value == null) remove(cacheKey) else putString(cacheKey, value)
                    }.apply()
                    value
                }
            }
        } catch (error: Exception) {
            DebugLog.d(TAG, "Could not read $key: ${error.message}")
            // AsyncStorage can briefly hold a write lock. Keep the last confirmed value
            // instead of interpreting that transient read failure as "setting absent";
            // otherwise a one-second watchdog tick could momentarily unhide every app.
            preferences.getString(cacheKey, null)
        }
    }

    internal fun parsePackages(raw: String?): Set<String> {
        if (raw.isNullOrBlank()) return emptySet()
        return try {
            val array = JSONArray(raw)
            buildSet {
                for (index in 0 until array.length()) {
                    val packageName = when (val entry = array.opt(index)) {
                        is String -> entry
                        is org.json.JSONObject -> entry.optString("packageName")
                        else -> ""
                    }.trim()
                    if (PACKAGE_NAME_PATTERN.matches(packageName) && packageName != "com.freekiosk") {
                        add(packageName)
                    }
                }
            }
        } catch (_: Exception) {
            emptySet()
        }
    }

    private fun setSuspended(
        dpm: DevicePolicyManager,
        admin: ComponentName,
        packageName: String,
        suspended: Boolean,
    ): Boolean {
        return try {
            val failures = dpm.setPackagesSuspended(admin, arrayOf(packageName), suspended)
            if (failures.contains(packageName)) {
                DebugLog.errorProduction(
                    TAG,
                    "Android refused to ${if (suspended) "suspend" else "restore"} $packageName",
                )
                false
            } else {
                true
            }
        } catch (error: Exception) {
            DebugLog.errorProduction(
                TAG,
                "Could not ${if (suspended) "suspend" else "restore"} $packageName: ${error.message}",
            )
            false
        }
    }

    private fun isHidden(
        dpm: DevicePolicyManager,
        admin: ComponentName,
        packageName: String,
    ): Boolean {
        return try {
            dpm.isApplicationHidden(admin, packageName)
        } catch (_: Exception) {
            false
        }
    }

    private fun setHidden(
        dpm: DevicePolicyManager,
        admin: ComponentName,
        packageName: String,
        hidden: Boolean,
    ): Boolean {
        return try {
            val applied = dpm.setApplicationHidden(admin, packageName, hidden)
            if (!applied) {
                DebugLog.errorProduction(
                    TAG,
                    "Android refused to ${if (hidden) "hide" else "restore hidden"} $packageName",
                )
            }
            applied
        } catch (error: Exception) {
            DebugLog.errorProduction(
                TAG,
                "Could not ${if (hidden) "hide" else "restore hidden"} $packageName: ${error.message}",
            )
            false
        }
    }

    private fun isInstalled(context: Context, packageName: String): Boolean {
        return try {
            // Android's ordinary package view treats a Device Owner-hidden package as
            // unavailable. Without MATCH_UNINSTALLED_PACKAGES, the watchdog drops the
            // just-hidden app from appsToHide on its next tick and immediately unhides it,
            // producing a one-second launcher-icon loop. FLAG_INSTALLED distinguishes a
            // genuinely installed hidden app from an actually removed package whose data
            // is still retained.
            val flags = PackageManager.MATCH_DISABLED_COMPONENTS or
                PackageManager.MATCH_UNINSTALLED_PACKAGES
            val applicationInfo = context.packageManager.getApplicationInfo(packageName, flags)
            applicationInfo.flags and ApplicationInfo.FLAG_INSTALLED != 0
        } catch (_: PackageManager.NameNotFoundException) {
            false
        }
    }

    private val PACKAGE_NAME_PATTERN =
        Regex("^[a-zA-Z][a-zA-Z0-9_]*(\\.[a-zA-Z][a-zA-Z0-9_]*)+$")
}
