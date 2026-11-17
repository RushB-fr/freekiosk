package com.freekiosk

import android.app.ActivityManager
import android.app.NotificationManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.database.sqlite.SQLiteDatabase
import android.os.Handler
import android.os.Looper
import android.os.Process
import android.os.UserManager

/**
 * Performs the complete, persistent kiosk exit used by both the settings UI and REST API.
 *
 * This intentionally does more than finish MainActivity. FreeKiosk can otherwise be brought
 * straight back by its HOME registration, watchdog, external-app monitor, overlay service, or
 * direct-boot flag. Keeping the sequence native also makes the API kill switch usable when the
 * React Native UI is backgrounded or in a bad state.
 */
object KioskExitManager {
    private const val TAG = "KioskExitManager"
    private const val ASYNC_STORAGE_DATABASE = "RKStorage"
    private const val ASYNC_STORAGE_TABLE = "catalystLocalStorage"
    private const val KIOSK_ENABLED_KEY = "@kiosk_enabled"
    private const val PENDING_CONFIG_PREFS = "FreeKioskPendingConfig"
    private const val WATCHDOG_NOTIFICATION_ID = 2002
    private const val PROCESS_KILL_DELAY_MS = 750L

    /**
     * Schedule an exit after [delayMs]. The REST API uses a short delay so NanoHTTPD can flush its
     * accepted response before the process that owns the socket is terminated.
     */
    fun scheduleExit(
        context: Context,
        activity: MainActivity?,
        terminateProcess: Boolean,
        delayMs: Long = 0L,
        completion: ((List<String>) -> Unit)? = null,
    ) {
        val appContext = context.applicationContext
        Handler(Looper.getMainLooper()).postDelayed({
            val warnings = runCatching { performCleanup(appContext, activity) }
                .getOrElse { error ->
                    mutableListOf<String>().apply { addWarning("unexpected cleanup failure", error) }
                }
            completion?.invoke(warnings)

            // Return control to Android only after FreeKiosk has ceased being a HOME candidate.
            runCatching {
                appContext.startActivity(Intent(Intent.ACTION_MAIN).apply {
                    addCategory(Intent.CATEGORY_HOME)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                })
            }.onFailure { warnings.addWarning("launch home", it) }

            runCatching { activity?.finishAndRemoveTask() }
                .onFailure { warnings.addWarning("finish main task", it) }
            runCatching {
                val activityManager = appContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
                activityManager.appTasks.forEach { it.finishAndRemoveTask() }
            }.onFailure { warnings.addWarning("remove app tasks", it) }

            if (terminateProcess) {
                Handler(Looper.getMainLooper()).postDelayed({
                    DebugLog.d(TAG, "Killing FreeKiosk process after full API exit")
                    Process.killProcess(Process.myPid())
                    kotlin.system.exitProcess(0)
                }, PROCESS_KILL_DELAY_MS)
            }
        }, delayMs.coerceAtLeast(0L))
    }

    private fun performCleanup(context: Context, activity: MainActivity?): MutableList<String> {
        val warnings = mutableListOf<String>()
        MainActivity.blockAutoRelaunch = true
        MainActivity.screensaverReturn = false

        // Persist first. Every service that could revive the kiosk consults this setting.
        runCatching { persistDisabledState(context) }
            .onFailure { warnings.addWarning("persist disabled state", it) }
        runCatching { BootReceiver.updateDeBootFlag(context, false) }
            .onFailure { warnings.addWarning("clear direct-boot flag", it) }
        runCatching { KioskAlwaysOnPolicy.release() }
            .onFailure { warnings.addWarning("release always-on display policy", it) }

        listOf(
            Intent(context, KioskWatchdogService::class.java),
            Intent(context, OverlayService::class.java),
            Intent(context, BackgroundAppMonitorService::class.java),
        ).forEach { serviceIntent ->
            runCatching { context.stopService(serviceIntent) }
                .onFailure { warnings.addWarning("stop ${serviceIntent.component?.className}", it) }
        }
        runCatching {
            val notifications = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notifications.cancel(WATCHDOG_NOTIFICATION_ID)
        }.onFailure { warnings.addWarning("cancel watchdog notification", it) }

        runCatching { KioskForegroundGuard.clearActiveKioskPackage(context) }
            .onFailure { warnings.addWarning("clear foreground guard", it) }
        runCatching { KioskSystemUiPolicy.restore(context) }
            .onFailure { warnings.addWarning("restore system UI", it) }
        runCatching { WafKioskChromePolicy.restoreForAdmin(context) }
            .onFailure { warnings.addWarning("restore Samsung WAF chrome", it) }

        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as? DevicePolicyManager
        val admin = ComponentName(context, DeviceAdminReceiver::class.java)
        val isDeviceOwner = dpm?.let {
            runCatching { it.isDeviceOwnerApp(context.packageName) }
                .onFailure { error -> warnings.addWarning("read Device Owner state", error) }
                .getOrDefault(false)
        } ?: false
        val ownerPolicyManager = dpm?.takeIf { isDeviceOwner }
        val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager

        // Ask the activity that owns the locked task to release it first. Some Samsung builds
        // keep the task locked if HOME is launched or the task is removed before this call.
        if (activityManager.lockTaskModeState != ActivityManager.LOCK_TASK_MODE_NONE) {
            runCatching { activity?.stopLockTask() }
                .onFailure { warnings.addWarning("stop lock task", it) }
        }

        ownerPolicyManager?.let { policyManager ->
            // Removing the locked package from the Device Owner allowlist is the OEM-safe
            // fallback when Activity.stopLockTask() was ignored or no activity is available.
            runCatching { policyManager.setLockTaskPackages(admin, emptyArray()) }
                .onFailure { warnings.addWarning("clear lock-task packages", it) }

            if (activityManager.lockTaskModeState != ActivityManager.LOCK_TASK_MODE_NONE) {
                runCatching { activity?.stopLockTask() }
                    .onFailure { warnings.addWarning("retry stop lock task", it) }
            }

            runCatching { policyManager.clearPackagePersistentPreferredActivities(admin, context.packageName) }
                .onFailure { warnings.addWarning("clear persistent HOME policy", it) }
            runCatching { policyManager.setScreenCaptureDisabled(admin, false) }
                .onFailure { warnings.addWarning("restore screen capture", it) }
            runCatching { policyManager.setStatusBarDisabled(admin, false) }
                .onFailure { warnings.addWarning("restore status bar", it) }
            runCatching {
                policyManager.clearUserRestriction(admin, UserManager.DISALLOW_FACTORY_RESET)
            }.onFailure { warnings.addWarning("restore factory-reset menu", it) }
            runCatching { policyManager.setPermittedAccessibilityServices(admin, null) }
                .onFailure { warnings.addWarning("restore accessibility-service menu", it) }
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                runCatching {
                    policyManager.setLockTaskFeatures(
                        admin,
                        DevicePolicyManager.LOCK_TASK_FEATURE_HOME or
                            DevicePolicyManager.LOCK_TASK_FEATURE_OVERVIEW or
                            DevicePolicyManager.LOCK_TASK_FEATURE_NOTIFICATIONS or
                            DevicePolicyManager.LOCK_TASK_FEATURE_GLOBAL_ACTIONS,
                    )
                }.onFailure { warnings.addWarning("restore lock-task features", it) }
            }
            runCatching { BlockedAppPolicy.reconcile(context, kioskActive = false) }
                .onFailure { warnings.addWarning("reconcile independent blocked packages", it) }
            runCatching { policyManager.setSystemUpdatePolicy(admin, null) }
                .onFailure { warnings.addWarning("restore system-update policy", it) }
        }

        // Restores the remaining policies (lock-task features, suspended OEM update packages,
        // system-update policy, and window/global immersive state). The manager also performs
        // the Device Owner calls above so REST exits remain complete without a foreground UI.
        runCatching { activity?.disableKioskRestrictions() }
            .onFailure { warnings.addWarning("disable kiosk restrictions", it) }

        runCatching { KioskWatchdogService.reconcileService(context) }
            .onFailure { warnings.addWarning("restart background policy service", it) }

        if (activityManager.lockTaskModeState != ActivityManager.LOCK_TASK_MODE_NONE) {
            val warning = "stop lock task: Android still reports lock-task mode after cleanup"
            warnings.add(warning)
            DebugLog.d(TAG, warning)
        }

        disableHomeComponent(
            context,
            ComponentName(context.packageName, "${context.packageName}.KioskHomeActivity"),
            warnings,
        )
        disableHomeComponent(context, ComponentName(context, HomeActivity::class.java), warnings)

        if (warnings.isEmpty()) {
            DebugLog.d(TAG, "Full kiosk exit cleanup completed")
        } else {
            DebugLog.d(TAG, "Full kiosk exit completed with warnings: ${warnings.joinToString()}")
        }
        return warnings
    }

    private fun persistDisabledState(context: Context) {
        // Direct SQLite persistence is required for the native API path, where waiting for a JS
        // AsyncStorage callback would make the kill switch dependent on the UI being healthy.
        val databaseWrite = runCatching {
            val path = context.getDatabasePath(ASYNC_STORAGE_DATABASE).absolutePath
            SQLiteDatabase.openDatabase(path, null, SQLiteDatabase.OPEN_READWRITE).use { database ->
                database.beginTransaction()
                try {
                    writeStorageValue(database, KIOSK_ENABLED_KEY, "false")
                    database.setTransactionSuccessful()
                } finally {
                    database.endTransaction()
                }
            }
        }

        // Use the pending-config bridge only when the direct database write failed. Leaving a
        // second, delayed "false" after a successful write can race with a later admin enable:
        // KioskScreen would consume the stale fallback after Settings had already saved "true".
        val pendingWrite = if (databaseWrite.isFailure) {
            runCatching {
                check(
                    context.getSharedPreferences(PENDING_CONFIG_PREFS, Context.MODE_PRIVATE)
                        .edit()
                        .putString(KIOSK_ENABLED_KEY, "false")
                        .putBoolean("has_pending_config", true)
                        .commit()
                ) { "Could not persist pending exit configuration" }
            }
        } else {
            // Remove only our exit fallback. Preserve unrelated pending ADB configuration.
            runCatching {
                val prefs = context.getSharedPreferences(PENDING_CONFIG_PREFS, Context.MODE_PRIVATE)
                val remainingKeys = prefs.all.keys - KIOSK_ENABLED_KEY - "has_pending_config"
                val editor = prefs.edit().remove(KIOSK_ENABLED_KEY)
                if (remainingKeys.isEmpty()) editor.remove("has_pending_config")
                check(editor.commit()) { "Could not clear stale pending exit configuration" }
            }
        }

        if (databaseWrite.isFailure && pendingWrite.isFailure) {
            throw IllegalStateException(
                "Could not persist kiosk exit in AsyncStorage or pending configuration",
                databaseWrite.exceptionOrNull(),
            )
        }
        databaseWrite.exceptionOrNull()?.let {
            DebugLog.d(TAG, "AsyncStorage exit write failed; pending fallback is active: ${it.message}")
        }
        pendingWrite.exceptionOrNull()?.let {
            DebugLog.d(TAG, "Pending exit state update failed: ${it.message}")
        }
    }

    private fun writeStorageValue(database: SQLiteDatabase, key: String, value: String) {
        val values = ContentValues().apply {
            put("key", key)
            put("value", value)
        }
        val result = database.insertWithOnConflict(
            ASYNC_STORAGE_TABLE,
            null,
            values,
            SQLiteDatabase.CONFLICT_REPLACE,
        )
        check(result != -1L) { "Could not write $key" }
    }

    private fun disableHomeComponent(
        context: Context,
        component: ComponentName,
        warnings: MutableList<String>,
    ) {
        runCatching {
            context.packageManager.setComponentEnabledSetting(
                component,
                PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                PackageManager.DONT_KILL_APP,
            )
        }.onFailure { warnings.addWarning("disable ${component.className}", it) }
    }

    private fun MutableList<String>.addWarning(operation: String, error: Throwable) {
        val warning = "$operation: ${error.message ?: error.javaClass.simpleName}"
        add(warning)
        DebugLog.d(TAG, warning)
    }
}
