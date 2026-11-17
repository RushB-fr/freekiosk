package com.freekiosk

import android.accessibilityservice.AccessibilityService
import android.app.ActivityManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.database.sqlite.SQLiteDatabase
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import org.json.JSONArray
import java.util.concurrent.ConcurrentHashMap

/**
 * Keeps the visible task limited to FreeKiosk and the user-facing kiosk apps.
 *
 * Lock task is the primary security boundary. This guard is a second layer for
 * vendor/system activities that some Android builds allow above a locked task.
 */
object KioskForegroundGuard {
    private const val TAG = "KioskForegroundGuard"
    private const val RECOVERY_COOLDOWN_MS = 500L
    private const val ACTIVE_PREFS = "freekiosk_active_app_guard"
    private const val ACTIVE_PACKAGE_KEY = "active_package"

    private val mainHandler = Handler(Looper.getMainLooper())
    private val temporaryAllowedPackages = ConcurrentHashMap<String, Long>()

    /**
     * The selected child app is intentionally process-scoped.
     *
     * Persisting this value made a package selected before a reboot/process death become
     * the recovery target after restart. The accessibility service and watchdog would then
     * reject FreeKiosk itself and continuously reopen that stale package before MainActivity
     * could restore lock task. Losing this volatile value now fails closed to the trusted
     * FreeKiosk home, where lock task is repaired before another app can be selected.
     */
    @Volatile
    private var activeKioskPackage: String? = null

    /**
     * Exact intent used to open [activeKioskPackage] when it is not the package's own
     * launcher entry (e.g. one MicroAppStation micro-app). Recovery reuses it so a child
     * returns to the same micro-app instead of the host's editor. Process-scoped like
     * the package itself.
     */
    @Volatile
    private var activeLaunchIntent: Intent? = null

    /**
     * True while FreeKiosk is showing the PIN or authenticated administration UI.
     *
     * This is deliberately process-scoped. A process restart cannot restore an
     * authenticated admin session and therefore fails closed to the kiosk home.
     */
    @Volatile
    private var adminSessionActive = false

    @Volatile
    private var legacyPersistedStateCleared = false

    @Volatile
    private var lastUserFacingPackage: String? = null

    @Volatile
    private var lastRecoveryTime = 0L

    fun isProtectionActive(context: Context): Boolean {
        val lockTaskActive = try {
            val activityManager =
                context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            activityManager.lockTaskModeState != ActivityManager.LOCK_TASK_MODE_NONE
        } catch (e: Exception) {
            Log.w(TAG, "Could not read lock task state: ${e.message}")
            false
        }
        if (lockTaskActive) return true

        // Non-Device-Owner devices must leave Android screen pinning to open an
        // allowed second app. Keep the accessibility guard active from the saved
        // kiosk state during that transition.
        return readStorageValue(context, "@kiosk_enabled", "false") == "true"
    }

    fun isAllowedForeground(
        context: Context,
        packageName: String,
        className: String? = null
    ): Boolean {
        val activePackage = getActiveKioskPackage(context)

        // FreeKiosk is the trusted recovery/home task. Rejecting it while an external app
        // was selected creates a self-recovery loop and can prevent lock task restoration.
        if (packageName == context.packageName) return true

        // No external or system task is child-facing while the primary Device Owner
        // boundary is down. This turns every partial-lock state into a deterministic
        // recovery to FreeKiosk instead of a permissive accessibility-only kiosk.
        if (!isStrictLockTaskActive(context)) return false

        val temporaryAllowedUntil = temporaryAllowedPackages[packageName]
        if (temporaryAllowedUntil != null) {
            if (temporaryAllowedUntil >= System.currentTimeMillis()) return true
            temporaryAllowedPackages.remove(packageName)
        }

        val normalizedPackage = packageName.lowercase()
        val normalizedClass = className?.lowercase().orEmpty()

        // Settings packages/activities are never part of the child-facing task.
        if (normalizedPackage.contains("settings") ||
            normalizedClass.contains("settings") ||
            normalizedClass.contains("controlcenter") ||
            normalizedClass.contains("quicksettings")) {
            return false
        }

        // Lock-task packages are candidates shown on the kiosk home, not concurrent
        // foreground apps. Only the app explicitly selected by the user may own the
        // visible task. This prevents a whitelisted app's alarm/background process
        // (for example Netflix) from surfacing over another running kiosk app.
        if (packageName == activePackage) return true

        // Permit only tightly-scoped setup surfaces. SystemUI and the generic
        // android package are deliberately excluded: on non-Device-Owner OEM
        // builds they host the notification shade, navigation UI, power menu,
        // and other windows that must never replace the active child-facing app.
        if (packageName == "com.android.permissioncontroller" ||
            packageName == "com.google.android.permissioncontroller" ||
            packageName == "com.android.packageinstaller" ||
            packageName == "com.google.android.packageinstaller") {
            return true
        }

        val defaultInputMethod = try {
            Settings.Secure.getString(
                context.contentResolver,
                Settings.Secure.DEFAULT_INPUT_METHOD
            )?.substringBefore('/')
        } catch (_: Exception) {
            null
        }

        return packageName == defaultInputMethod &&
            (normalizedClass.contains("inputmethod") ||
                normalizedClass.contains("softinput") ||
                normalizedClass.contains("keyboard"))
    }

    fun noteAllowedForeground(context: Context, packageName: String) {
        if (packageName == getActiveKioskPackage(context)) {
            lastUserFacingPackage = packageName
        }
    }

    /**
     * Authorize an app selected by FreeKiosk's own grid for the launch transition.
     * The time limit only bridges native/AsyncStorage and OEM window-order races;
     * the persistent lock-task allowlist remains the long-term policy boundary.
     */
    fun authorizeKioskLaunch(
        context: Context,
        packageName: String,
        launchIntent: Intent? = null,
    ) {
        if (packageName.isBlank() || packageName == context.packageName) return
        clearLegacyPersistedState(context)
        adminSessionActive = false
        activeKioskPackage?.takeIf { it != packageName }?.let(temporaryAllowedPackages::remove)
        activeKioskPackage = packageName
        activeLaunchIntent = launchIntent
            ?.takeIf { it.`package` == packageName || it.component?.packageName == packageName }
            ?.let(::Intent)
        temporaryAllowedPackages[packageName] = System.currentTimeMillis() + 15_000L
        lastUserFacingPackage = packageName
    }

    fun clearActiveKioskPackage(context: Context) {
        clearLegacyPersistedState(context)
        activeKioskPackage?.let(temporaryAllowedPackages::remove)
        activeKioskPackage = null
        activeLaunchIntent = null
        lastUserFacingPackage = null
    }

    /**
     * Intent that returns the child to the active selection. A MicroAppStation host
     * without its recorded micro-app intent yields null: its launcher Activity is the
     * micro-app editor, which must never open inside the child kiosk.
     */
    fun getRelaunchIntent(context: Context, packageName: String): Intent? {
        activeLaunchIntent
            ?.takeIf { packageName == activeKioskPackage }
            ?.let { return Intent(it) }
        if (MicroAppCatalog.isHostPackage(packageName)) return null
        return context.packageManager.getLaunchIntentForPackage(packageName)
    }

    fun getActiveKioskPackage(context: Context): String? {
        clearLegacyPersistedState(context)
        return activeKioskPackage
    }

    /**
     * Rebuild the process-scoped child session after FreeKiosk's process was replaced or
     * reclaimed while Android kept an allowed app visible inside strict lock task.
     *
     * This deliberately does not persist a package across reboot. Recovery is permitted only
     * when the currently resumed Activity is still a configured child-facing app, kiosk mode
     * is saved as enabled, and Device Owner lock task is already fully LOCKED. A normal boot
     * therefore still fails closed to the FreeKiosk grid, while an in-place APK update can
     * immediately restore the mandatory close control above the still-running child app.
     */
    fun recoverActiveKioskPackageFromForeground(context: Context): String? {
        clearLegacyPersistedState(context)
        if (adminSessionActive || !isStrictLockTaskActive(context)) return null
        if (readStorageValue(context, "@kiosk_enabled", "false") != "true") return null

        activeKioskPackage?.let { active ->
            if (active != context.packageName && getLockTaskPackages(context).contains(active)) {
                return active
            }
        }

        val foregroundPackage = getTopRunningPackage(context)
            ?.takeIf { it != context.packageName }
            ?: return null
        if (!getUserFacingPackages(context).contains(foregroundPackage)) return null
        if (!getLockTaskPackages(context).contains(foregroundPackage)) return null

        authorizeKioskLaunch(context, foregroundPackage)
        Log.w(TAG, "Recovered active child session from foreground: $foregroundPackage")
        return foregroundPackage
    }

    fun beginAdminSession(context: Context) {
        adminSessionActive = true
        clearActiveKioskPackage(context)
    }

    fun endAdminSession(context: Context) {
        clearLegacyPersistedState(context)
        adminSessionActive = false
    }

    fun isAdminSessionActive(): Boolean = adminSessionActive

    /** The custom overlay is the only authorized close path for an active child app. */
    fun shouldConsumeSystemNavigation(context: Context): Boolean {
        val activePackage = getActiveKioskPackage(context) ?: return false
        return !adminSessionActive &&
            activePackage != context.packageName &&
            isStrictLockTaskActive(context)
    }

    /** True only for fully managed Device Owner lock task, never ordinary screen pinning. */
    fun isStrictLockTaskActive(context: Context): Boolean {
        return try {
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val activityManager =
                context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            dpm.isDeviceOwnerApp(context.packageName) &&
                activityManager.lockTaskModeState == ActivityManager.LOCK_TASK_MODE_LOCKED
        } catch (_: Exception) {
            false
        }
    }

    /**
     * Native services may only reopen the currently selected app while Android's strict
     * lock-task boundary is already active and that package is in the Device Owner allowlist.
     */
    fun canRelaunchActiveExternalPackage(context: Context, packageName: String): Boolean {
        if (adminSessionActive) return false
        if (packageName.isBlank() || packageName != getActiveKioskPackage(context)) return false
        if (!isStrictLockTaskActive(context)) return false

        return try {
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val admin = ComponentName(context, DeviceAdminReceiver::class.java)
            dpm.getLockTaskPackages(admin).contains(packageName)
        } catch (_: Exception) {
            false
        }
    }

    /** Permit a tightly-scoped native system workflow, such as Wi-Fi confirmation. */
    fun temporarilyAllowPackages(packageNames: Collection<String>, durationMs: Long = 120_000L) {
        val expiresAt = System.currentTimeMillis() + durationMs.coerceIn(1_000L, 300_000L)
        packageNames.filter(String::isNotBlank).forEach {
            temporaryAllowedPackages[it] = expiresAt
        }
    }

    fun revokeTemporaryPackages(packageNames: Collection<String>) {
        packageNames.forEach(temporaryAllowedPackages::remove)
    }

    fun handleAccessibilityWindow(
        service: AccessibilityService,
        event: AccessibilityEvent,
        packageName: String
    ) {
        if (!isProtectionActive(service)) return

        val className = event.className?.toString()
        if (isAllowedForeground(service, packageName, className)) {
            noteAllowedForeground(service, packageName)
            return
        }

        // Accessibility events can be attributed to a rendering/helper package even
        // though that package never became the foreground Activity (for example the
        // Android text-classifier service while typing the admin PIN). Acting on such
        // an event sends GLOBAL_BACK into FreeKiosk and can close PIN/Settings. Only
        // enforce the event when its owner is actually the top Activity.
        val actualTopPackage = getTopRunningPackage(service)
        if (actualTopPackage != null &&
            actualTopPackage != packageName &&
            isAllowedForeground(service, actualTopPackage)) {
            // Never inject Back into the allowed Activity underneath a transient SystemUI,
            // helper, or FreeKiosk overlay window. That used to finish the child app.
            KioskSystemUiPolicy.enable(service)
            if (packageName == "com.android.systemui" &&
                android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
                try {
                    service.performGlobalAction(
                        AccessibilityService.GLOBAL_ACTION_DISMISS_NOTIFICATION_SHADE
                    )
                } catch (_: Exception) {
                }
            }
            Log.d(TAG, "Ignored non-foreground window event: $packageName (top=$actualTopPackage)")
            return
        }

        Log.w(TAG, "Blocked window: $packageName/${className.orEmpty()}")

        // Pop the unauthorized activity first so the active app's state remains intact.
        try {
            service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)
        } catch (_: Exception) {
        }

        // Then restore the previous allowed app as a reliable OEM-independent fallback.
        mainHandler.postDelayed({
            recoverAllowedForeground(service, "accessibility:$packageName")
        }, 120L)
    }

    fun recoverAllowedForeground(context: Context, reason: String): Boolean {
        if (!isProtectionActive(context)) return false

        val now = System.currentTimeMillis()
        if (now - lastRecoveryTime < RECOVERY_COOLDOWN_MS) return false
        lastRecoveryTime = now

        val activePackage = getActiveKioskPackage(context)
        val targetPackage = activePackage
            ?.takeIf { canRelaunchActiveExternalPackage(context, it) }
            ?.takeIf { getRelaunchIntent(context, it) != null }
            ?: context.packageName

        // Avoid delivering CLEAR_TOP to the already-visible FreeKiosk activity. In a
        // single-Activity React Native app that can reset the navigation stack and eject
        // an authenticated administrator from Settings even though no escape occurred.
        if (getTopRunningPackage(context) == targetPackage) return false

        if (targetPackage == context.packageName && activePackage != null) {
            // The security boundary was lost or the selection became invalid. Never keep
            // retrying the child app; return to FreeKiosk and let MainActivity repair it.
            clearActiveKioskPackage(context)
        }

        return try {
            val intent = if (targetPackage == context.packageName) {
                Intent(context, MainActivity::class.java)
            } else {
                getRelaunchIntent(context, targetPackage)
                    ?: Intent(context, MainActivity::class.java)
            }.apply {
                addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP or
                        Intent.FLAG_ACTIVITY_NO_ANIMATION
                )
            }

            KioskTaskLauncher.launch(context, intent)
            Log.w(TAG, "Restored ${intent.component?.packageName ?: targetPackage} ($reason)")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Could not restore kiosk foreground: ${e.message}")
            false
        }
    }

    fun getUserFacingPackages(context: Context): Set<String> {
        val packages = linkedSetOf(context.packageName)
        val displayMode = readStorageValue(context, "@kiosk_display_mode", "webview")
        if (displayMode != "external_app") return packages

        val externalMode = readStorageValue(context, "@kiosk_external_app_mode", "single")
        if (externalMode == "single") {
            readStorageValue(context, "@kiosk_external_app_package", "")
                .takeIf { it.isNotBlank() }
                ?.let(packages::add)
        } else {
            packages.addAll(readHomeScreenManagedApps(context))
        }
        return packages
    }

    /**
     * Repair child apps left hidden or suspended by an interrupted legacy Close All cycle.
     * Explicitly blocked apps always win and are never restored here.
     */
    fun restoreConfiguredChildAppVisibility(
        context: Context,
        requestedPackage: String? = null,
    ): Set<String> {
        val appContext = context.applicationContext
        val dpm = appContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as? DevicePolicyManager
            ?: return emptySet()
        if (!dpm.isDeviceOwnerApp(appContext.packageName)) return emptySet()

        val blockedPackages = if (BlockedAppPolicy.isAppBlockingEnabled(appContext)) {
            BlockedAppPolicy.configuredInstalledPackages(appContext)
        } else {
            emptySet()
        }
        val configuredPackages = getUserFacingPackages(appContext)
            .asSequence()
            .filter { it != appContext.packageName && it !in blockedPackages }
            .filter { requestedPackage == null || it == requestedPackage }
            .toSet()
        if (configuredPackages.isEmpty()) return emptySet()

        val admin = ComponentName(appContext, DeviceAdminReceiver::class.java)
        val packageManager = appContext.packageManager
        val restored = mutableSetOf<String>()
        configuredPackages.forEach { packageName ->
            val applicationInfo = try {
                packageManager.getApplicationInfo(
                    packageName,
                    PackageManager.MATCH_DISABLED_COMPONENTS or
                        PackageManager.MATCH_UNINSTALLED_PACKAGES,
                )
            } catch (_: PackageManager.NameNotFoundException) {
                return@forEach
            }
            if (applicationInfo.flags and ApplicationInfo.FLAG_INSTALLED == 0) return@forEach

            try {
                if (dpm.isApplicationHidden(admin, packageName) &&
                    dpm.setApplicationHidden(admin, packageName, false)) {
                    restored.add(packageName)
                }
            } catch (error: Exception) {
                Log.e(TAG, "Could not restore hidden child app $packageName: ${error.message}")
            }

            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.N &&
                applicationInfo.flags and ApplicationInfo.FLAG_SUSPENDED != 0) {
                try {
                    val failures = dpm.setPackagesSuspended(
                        admin,
                        arrayOf(packageName),
                        false,
                    )
                    if (!failures.contains(packageName)) restored.add(packageName)
                } catch (error: Exception) {
                    Log.e(TAG, "Could not resume child app $packageName: ${error.message}")
                }
            }
        }
        if (restored.isNotEmpty()) {
            Log.w(TAG, "Restored configured child-app visibility: ${restored.sorted()}")
        }
        return restored
    }

    private fun getPreferredKioskPackage(
        context: Context,
        userFacingPackages: Set<String>
    ): String {
        val displayMode = readStorageValue(context, "@kiosk_display_mode", "webview")
        val externalMode = readStorageValue(context, "@kiosk_external_app_mode", "single")
        if (displayMode == "external_app" && externalMode == "single") {
            val externalPackage =
                readStorageValue(context, "@kiosk_external_app_package", "")
            if (userFacingPackages.contains(externalPackage)) return externalPackage
        }
        return context.packageName
    }

    private fun getLockTaskPackages(context: Context): Set<String> {
        return try {
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            if (dpm.isDeviceOwnerApp(context.packageName)) {
                val admin = ComponentName(context, DeviceAdminReceiver::class.java)
                dpm.getLockTaskPackages(admin).toSet()
            } else {
                getUserFacingPackages(context)
            }
        } catch (_: Exception) {
            getUserFacingPackages(context)
        }
    }

    private fun readHomeScreenManagedApps(context: Context): Set<String> {
        return try {
            val apps = JSONArray(readStorageValue(context, "@kiosk_managed_apps", "[]"))
            buildSet {
                for (index in 0 until apps.length()) {
                    val app = apps.getJSONObject(index)
                    if (app.optBoolean("showOnHomeScreen", false)) {
                        app.optString("packageName")
                            .takeIf { it.isNotBlank() }
                            ?.let(::add)
                    }
                }
            }
        } catch (_: Exception) {
            emptySet()
        }
    }

    @Suppress("DEPRECATION")
    private fun getTopRunningPackage(context: Context): String? {
        return try {
            val activityManager =
                context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            activityManager.getRunningTasks(1).firstOrNull()?.topActivity?.packageName
        } catch (_: Exception) {
            null
        }
    }

    private fun readStorageValue(context: Context, key: String, defaultValue: String): String {
        var database: SQLiteDatabase? = null
        return try {
            database = SQLiteDatabase.openDatabase(
                context.getDatabasePath("RKStorage").absolutePath,
                null,
                SQLiteDatabase.OPEN_READONLY
            )
            database.rawQuery(
                "SELECT value FROM catalystLocalStorage WHERE key = ?",
                arrayOf(key)
            ).use { cursor ->
                if (cursor.moveToFirst()) cursor.getString(0) ?: defaultValue else defaultValue
            }
        } catch (_: Exception) {
            defaultValue
        } finally {
            database?.close()
        }
    }

    /** Remove the stale state written by versions through 1.2.41 exactly once per process. */
    private fun clearLegacyPersistedState(context: Context) {
        if (legacyPersistedStateCleared) return
        synchronized(this) {
            if (legacyPersistedStateCleared) return
            context.getSharedPreferences(ACTIVE_PREFS, Context.MODE_PRIVATE)
                .edit()
                .remove(ACTIVE_PACKAGE_KEY)
                .apply()
            legacyPersistedStateCleared = true
        }
    }
}
