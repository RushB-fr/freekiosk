package com.freekiosk

import android.Manifest
import android.app.ActivityManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.admin.DevicePolicyManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.app.Service
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.database.sqlite.SQLiteDatabase
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat

/**
 * START_STICKY policy service with two deliberately separate operating paths:
 *
 *  • Lock Mode: preserve the existing foreground/lock-task watchdog behavior.
 *  • Hidden/background mode: keep independent policies such as app blocking active
 *    without launching or foregrounding the FreeKiosk Activity.
 *
 * Fixes #96: On low-RAM devices (e.g. 2 GB AndroidTV), the browser can consume
 * enough memory for the kernel to kill FreeKiosk. Without a watchdog, the kiosk
 * simply disappears and the user lands on the launcher.
 *
 * The service:
 *  • Runs as a lightweight foreground service (START_STICKY) so Android restarts it
 *    if the process is killed.
 *  • Periodically checks whether MainActivity is in the recent-task list.
 *  • If MainActivity has vanished and kiosk mode is enabled, relaunches it.
 *
 * The service is started from BootReceiver and from MainActivity.onCreate().
 * It stops only when Lock Mode, Hidden Mode, and independent App Blocking are all off.
 */
class KioskWatchdogService : Service() {

    companion object {
        const val ACTION_OPEN_PROTECTED_SETTINGS = "com.freekiosk.action.OPEN_PROTECTED_SETTINGS"
        const val EXTRA_OPEN_PROTECTED_SETTINGS = "openProtectedSettings"

        private const val TAG = "KioskWatchdog"
        private const val CHANNEL_ID = "freekiosk_watchdog"
        private const val HIDDEN_MODE_CHANNEL_ID = "freekiosk_hidden_mode_status"
        private const val NOTIFICATION_ID = 2002
        private const val CHECK_INTERVAL_MS = 1_000L  // fast enough to hide escaped Settings screens
        private const val RELAUNCH_COOLDOWN_MS = 15_000L // min 15 s between relaunches

        fun reconcileService(context: Context) {
            val appContext = context.applicationContext
            val serviceIntent = Intent(appContext, KioskWatchdogService::class.java)
            if (BlockedAppPolicy.needsBackgroundService(appContext)) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    appContext.startForegroundService(serviceIntent)
                } else {
                    appContext.startService(serviceIntent)
                }
            } else {
                appContext.stopService(serviceIntent)
                val notifications =
                    appContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                notifications.cancel(NOTIFICATION_ID)
            }
        }
    }

    private val handler = Handler(Looper.getMainLooper())
    private var isRunning = false
    private var lastRelaunchTime = 0L
    private var lastUsageQueryTime = System.currentTimeMillis() - 60_000L
    private var observedForegroundPackage: String? = null

    private val checkRunnable = object : Runnable {
        override fun run() {
            if (!isRunning) return
            checkAndRelaunch()
            handler.postDelayed(this, CHECK_INTERVAL_MS)
        }
    }

    // ────────────────────────────────────────────────────────────────────
    // Lifecycle
    // ────────────────────────────────────────────────────────────────────

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val kioskEnabled = BlockedAppPolicy.isKioskEnabled(this)
        val hiddenModeEnabled = BlockedAppPolicy.isHiddenModeEnabled(this)
        val appBlockingEnabled = BlockedAppPolicy.isAppBlockingEnabled(this)
        if (!kioskEnabled && !hiddenModeEnabled && !appBlockingEnabled) {
            DebugLog.d(TAG, "No active foreground or background policy — stopping service")
            BlockedAppPolicy.reconcile(this, kioskActive = false, blockingActive = false)
            stopSelf()
            return START_NOT_STICKY
        }

        ensureNotificationPermission()
        val notification = buildNotification(
            kioskEnabled = kioskEnabled,
            hiddenModeEnabled = hiddenModeEnabled,
            appBlockingEnabled = appBlockingEnabled,
        )
        startForeground(NOTIFICATION_ID, notification)
        if (kioskEnabled) KioskAlwaysOnPolicy.enforce(this) else KioskAlwaysOnPolicy.release()
        BlockedAppPolicy.reconcile(this, kioskActive = kioskEnabled)
        if (kioskEnabled) KioskForegroundGuard.restoreConfiguredChildAppVisibility(this)

        isRunning = true
        handler.removeCallbacks(checkRunnable)
        handler.postDelayed(checkRunnable, CHECK_INTERVAL_MS)

        DebugLog.d(
            TAG,
            "Policy service started: kiosk=$kioskEnabled hidden=$hiddenModeEnabled blocking=$appBlockingEnabled",
        )

        // START_STICKY: Android will restart this service if the process is killed
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        isRunning = false
        handler.removeCallbacks(checkRunnable)
        KioskAlwaysOnPolicy.release()
        super.onDestroy()
        DebugLog.d(TAG, "Watchdog destroyed")
    }

    // ────────────────────────────────────────────────────────────────────
    // Core logic
    // ────────────────────────────────────────────────────────────────────

    private fun checkAndRelaunch() {
        val kioskEnabled = BlockedAppPolicy.isKioskEnabled(this)
        val hiddenModeEnabled = BlockedAppPolicy.isHiddenModeEnabled(this)
        val appBlockingEnabled = BlockedAppPolicy.isAppBlockingEnabled(this)

        // Hidden/background operation never relaunches FreeKiosk. Reconcile Device Owner
        // policy and reject the extremely narrow already-running-app race only.
        if (!kioskEnabled) {
            KioskAlwaysOnPolicy.release()
            BlockedAppPolicy.reconcile(this, kioskActive = false)
            if (!hiddenModeEnabled && !appBlockingEnabled) {
                DebugLog.d(TAG, "Background policies disabled — stopping service")
                stopSelf()
                return
            }
            if (appBlockingEnabled) {
                val accessibilityForeground =
                    FreeKioskAccessibilityService.currentForegroundPackage()
                if (!BlockedAppGuard.rejectIfBlocked(this, accessibilityForeground)) {
                    BlockedAppGuard.rejectIfBlocked(this, getForegroundPackageFromUsageEvents())
                }
            }
            return
        }

        BlockedAppPolicy.reconcile(this, kioskActive = true)
        KioskForegroundGuard.restoreConfiguredChildAppVisibility(this)

        // A child app owns the foreground window in External App mode, so MainActivity's
        // FLAG_KEEP_SCREEN_ON cannot control its timeout. Self-heal the service-owned lock.
        KioskAlwaysOnPolicy.enforce(this)

        // The saved kiosk flag without Device Owner LOCKED state is an unsafe partial
        // state: do not monitor/relaunch any child app in it. Recover the trusted
        // FreeKiosk task, whose foreground checkpoint restores lock task and System UI
        // restrictions before another app can be selected.
        if (!KioskForegroundGuard.isStrictLockTaskActive(this)) {
            KioskForegroundGuard.clearActiveKioskPackage(this)
            KioskForegroundGuard.recoverAllowedForeground(this, "strict-lock-task-lost")
            return
        }

        // The Android package manager can keep a child Activity alive while replacing or
        // reclaiming FreeKiosk's process. Reconstruct the volatile session from the strictly
        // locked foreground app and repair the Close All windows before any early return below.
        OverlayService.ensureMandatoryCloseControl(this)

        // Strict visible-app guard. Lock task remains the primary restriction; Usage
        // Access lets us correct vendor/system activities that appear above it anyway.
        if (KioskForegroundGuard.isProtectionActive(this)) {
            val foregroundPackage = getForegroundPackageFromUsageEvents()
            if (foregroundPackage != null) {
                if (BlockedAppGuard.rejectIfBlocked(this, foregroundPackage)) return
                if (KioskForegroundGuard.isAllowedForeground(this, foregroundPackage)) {
                    KioskForegroundGuard.noteAllowedForeground(this, foregroundPackage)
                    return
                }

                DebugLog.d(TAG, "Unauthorized foreground package: $foregroundPackage")
                KioskForegroundGuard.recoverAllowedForeground(
                    this,
                    "usage-stats:$foregroundPackage"
                )
                return
            }
        }

        // In external app mode, the external app is expected to be in the foreground.
        // Don't relaunch MainActivity just because it's not the topActivity — check
        // that either FreeKiosk OR the external app is running. (#106)
        val externalAppMode = getDisplayMode() == "external_app"
        val externalPkg = if (externalAppMode) getExternalAppPackage() else null

        if (isMainActivityRunning()) return  // FreeKiosk itself is in foreground — fine

        if (externalAppMode && externalPkg != null && isPackageInForeground(externalPkg)) {
            // External app is in foreground — this is expected, don't relaunch FreeKiosk
            return
        }

        val now = System.currentTimeMillis()
        if (now - lastRelaunchTime < RELAUNCH_COOLDOWN_MS) {
            DebugLog.d(TAG, "Relaunch cooldown active — skipping")
            return
        }

        DebugLog.d(TAG, "MainActivity not running — relaunching FreeKiosk")
        lastRelaunchTime = now

        try {
            val intent = Intent(this, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or
                         Intent.FLAG_ACTIVITY_SINGLE_TOP)
            }
            startActivity(intent)
        } catch (e: Exception) {
            DebugLog.errorProduction(TAG, "Failed to relaunch: ${e.message}")
        }
    }

    /**
     * Resolve the currently resumed activity using UsageEvents. Returns null when the
     * special Usage Access permission has not been granted, preserving the old watchdog
     * fallback behavior on those devices.
     */
    private fun getForegroundPackageFromUsageEvents(): String? {
        return try {
            val usageStatsManager =
                getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
            val now = System.currentTimeMillis()
            val events = usageStatsManager.queryEvents(lastUsageQueryTime, now)
            val event = UsageEvents.Event()

            while (events.hasNextEvent()) {
                events.getNextEvent(event)
                val resumed = event.eventType == UsageEvents.Event.MOVE_TO_FOREGROUND ||
                    (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
                        event.eventType == UsageEvents.Event.ACTIVITY_RESUMED)
                if (resumed && !event.packageName.isNullOrBlank()) {
                    observedForegroundPackage = event.packageName
                }
            }

            // Small overlap avoids losing an event on millisecond boundaries.
            lastUsageQueryTime = now - 250L
            observedForegroundPackage
        } catch (e: Exception) {
            DebugLog.d(TAG, "Usage foreground query unavailable: ${e.message}")
            null
        }
    }

    /**
     * Check if MainActivity is still alive by inspecting the running app processes.
     * This is more reliable than getRunningTasks() which is restricted on newer Android.
     */
    private fun isMainActivityRunning(): Boolean {
        return try {
            val am = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            // getAppTasks() returns tasks belonging to our own application — no permission needed
            val tasks = am.appTasks
            tasks.any { task ->
                try {
                    val info = task.taskInfo
                    info.baseActivity?.className == MainActivity::class.java.name ||
                    info.topActivity?.className == MainActivity::class.java.name
                } catch (e: Exception) {
                    false
                }
            }
        } catch (e: Exception) {
            DebugLog.d(TAG, "Error checking tasks: ${e.message}")
            // If we can't check, assume it's running (safer than relaunch-looping)
            true
        }
    }

    /**
     * Check if a specific package is currently in the foreground.
     * Used in external app mode to avoid relaunching MainActivity when the
     * external app is legitimately in the foreground. (#106)
     */
    private fun isPackageInForeground(pkg: String): Boolean {
        return try {
            val am = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val tasks = am.appTasks
            tasks.any { task ->
                try {
                    val info = task.taskInfo
                    info.topActivity?.packageName == pkg
                } catch (e: Exception) {
                    false
                }
            }
        } catch (e: Exception) {
            DebugLog.d(TAG, "Error checking foreground for $pkg: ${e.message}")
            false
        }
    }

    // ────────────────────────────────────────────────────────────────────
    // AsyncStorage
    // ────────────────────────────────────────────────────────────────────

    private fun getDisplayMode(): String {
        return try {
            val dbPath = getDatabasePath("RKStorage").absolutePath
            val db = SQLiteDatabase.openDatabase(dbPath, null, SQLiteDatabase.OPEN_READONLY)
            val cursor = db.rawQuery(
                "SELECT value FROM catalystLocalStorage WHERE key = ?",
                arrayOf("@kiosk_display_mode"))
            val mode = if (cursor.moveToFirst()) cursor.getString(0) ?: "webview" else "webview"
            cursor.close()
            db.close()
            mode
        } catch (e: Exception) {
            DebugLog.d(TAG, "Cannot read display_mode: ${e.message}")
            "webview"
        }
    }

    private fun getExternalAppPackage(): String? {
        return try {
            val dbPath = getDatabasePath("RKStorage").absolutePath
            val db = SQLiteDatabase.openDatabase(dbPath, null, SQLiteDatabase.OPEN_READONLY)
            val cursor = db.rawQuery(
                "SELECT value FROM catalystLocalStorage WHERE key = ?",
                arrayOf("@kiosk_external_app_package"))
            val pkg = if (cursor.moveToFirst()) cursor.getString(0) else null
            cursor.close()
            db.close()
            if (pkg.isNullOrEmpty()) null else pkg
        } catch (e: Exception) {
            DebugLog.d(TAG, "Cannot read external_app_package: ${e.message}")
            null
        }
    }

    // ────────────────────────────────────────────────────────────────────
    // Notification (required for foreground service)
    // ────────────────────────────────────────────────────────────────────

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val kioskChannel = NotificationChannel(
                CHANNEL_ID,
                "Kiosk Watchdog",
                NotificationManager.IMPORTANCE_MIN   // silent, no badge
            ).apply {
                description = "Keeps FreeKiosk running in kiosk mode"
                setShowBadge(false)
            }
            // Keep this on a separate, low-importance channel. The old watchdog channel is
            // already persisted as IMPORTANCE_MIN on existing installations, which allows
            // Android to omit its small icon from the status bar.
            val hiddenModeChannel = NotificationChannel(
                HIDDEN_MODE_CHANNEL_ID,
                "FreeKiosk Protection",
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "Shows when FreeKiosk background protection is active"
                setShowBadge(false)
                setSound(null, null)
                enableVibration(false)
            }
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(kioskChannel)
            nm.createNotificationChannel(hiddenModeChannel)
        }
    }

    private fun ensureNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) ==
                PackageManager.PERMISSION_GRANTED) {
            return
        }

        try {
            val policyManager =
                getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            if (!policyManager.isDeviceOwnerApp(packageName)) return
            val admin = ComponentName(this, DeviceAdminReceiver::class.java)
            policyManager.setPermissionGrantState(
                admin,
                packageName,
                Manifest.permission.POST_NOTIFICATIONS,
                DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED,
            )
        } catch (error: Exception) {
            DebugLog.errorProduction(
                TAG,
                "Could not grant Hidden Mode notification permission: ${error.message}",
            )
        }
    }

    private fun buildNotification(
        kioskEnabled: Boolean,
        hiddenModeEnabled: Boolean,
        appBlockingEnabled: Boolean,
    ): Notification {
        val backgroundMode = hiddenModeEnabled || !kioskEnabled
        val channelId = if (backgroundMode) HIDDEN_MODE_CHANNEL_ID else CHANNEL_ID
        val protectedApps = if (appBlockingEnabled) {
            BlockedAppPolicy.configuredInstalledPackages(this).size
        } else {
            0
        }
        val title = if (backgroundMode) "Protection is active" else "FreeKiosk"
        val text = when {
            hiddenModeEnabled && protectedApps > 0 ->
                "$protectedApps blocked app${if (protectedApps == 1) "" else "s"} protected • Tap for parent settings"
            hiddenModeEnabled -> "Tap for protected parent settings"
            appBlockingEnabled && protectedApps > 0 ->
                "$protectedApps blocked app${if (protectedApps == 1) "" else "s"} protected • Tap for parent settings"
            appBlockingEnabled -> "Tap for protected parent settings"
            else -> "Kiosk mode is active"
        }
        val contentIntent = PendingIntent.getActivity(
            this,
            NOTIFICATION_ID,
            Intent(this, MainActivity::class.java).apply {
                action = ACTION_OPEN_PROTECTED_SETTINGS
                putExtra(EXTRA_OPEN_PROTECTED_SETTINGS, true)
                putExtra("voluntaryReturn", true)
                addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        return NotificationCompat.Builder(this, channelId)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(if (backgroundMode) R.drawable.ic_hidden_mode_status else R.mipmap.ic_launcher)
            .setContentIntent(contentIntent)
            .setPriority(
                if (backgroundMode) NotificationCompat.PRIORITY_LOW
                else NotificationCompat.PRIORITY_MIN,
            )
            .setOngoing(true)
            .setAutoCancel(false)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setShowWhen(false)
            .setSilent(true)
            .build()
    }
}
