package com.freekiosk

import android.app.ActivityManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.database.sqlite.SQLiteDatabase
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat

/**
 * KioskWatchdogService — a START_STICKY foreground service that monitors FreeKiosk's
 * main process and relaunches it if it was killed (e.g. by the OOM killer).
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
 * It stops itself if kiosk mode is disabled.
 */
class KioskWatchdogService : Service() {

    companion object {
        private const val TAG = "KioskWatchdog"
        private const val CHANNEL_ID = "freekiosk_watchdog"
        private const val NOTIFICATION_ID = 2002
        private const val CHECK_INTERVAL_MS = 10_000L  // check every 10 s
        private const val RELAUNCH_COOLDOWN_MS = 15_000L // min 15 s between relaunches

        /**
         * #234: the service runs in one of two modes, persisted because START_STICKY
         * restarts it with a null intent.
         *
         *  • kiosk guard (default): the #96 behaviour, relaunches MainActivity if it dies.
         *  • keep-alive only: no relaunch whatsoever, the foreground notification is the
         *    whole point. Started when MQTT is on without Lock Mode, where the process was
         *    an ordinary background app and OEM battery managers killed it, taking the
         *    broker connection with it (device "unavailable" in Home Assistant for good).
         */
        private const val PREFS_NAME = "FreeKioskSettings"
        private const val KEY_KEEPALIVE_ONLY = "watchdog_keepalive_only"

        /** Start (or keep) the kiosk guard. Unchanged #96 behaviour. */
        fun startForKiosk(context: Context) = start(context, keepAliveOnly = false)

        /**
         * #234: start the keep-alive service for MQTT.
         *
         * Does nothing when Lock Mode is enabled, since the kiosk guard is already running
         * and holds the process up. [force] is for the admin-exit path, which stops the
         * guard while @kiosk_enabled is still true: there we do want the keep-alive, and we
         * must not fall back to guard mode or the watchdog would drag the admin back into
         * the kiosk.
         */
        fun startForMqttIfNeeded(context: Context, force: Boolean = false) {
            if (!readFlag(context, "@kiosk_mqtt_enabled")) return
            if (!force && readFlag(context, "@kiosk_enabled")) return
            start(context, keepAliveOnly = true)
        }

        private fun start(context: Context, keepAliveOnly: Boolean) {
            try {
                context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .edit().putBoolean(KEY_KEEPALIVE_ONLY, keepAliveOnly).apply()
                val intent = Intent(context, KioskWatchdogService::class.java)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
                DebugLog.d(TAG, "Watchdog start requested (keepAliveOnly=$keepAliveOnly)")
            } catch (e: Exception) {
                // ForegroundServiceStartNotAllowedException on Android 12+ when the app is
                // in the background and not exempt. Nothing to recover: the next launch or
                // BOOT_COMPLETED starts it from an allowed context.
                DebugLog.errorProduction(TAG, "Could not start watchdog: ${e.message}")
            }
        }

        /** Read a boolean AsyncStorage flag without going through the JS bridge. */
        private fun readFlag(context: Context, key: String): Boolean {
            return try {
                val dbPath = context.getDatabasePath("RKStorage").absolutePath
                val db = SQLiteDatabase.openDatabase(dbPath, null, SQLiteDatabase.OPEN_READONLY)
                val cursor = db.rawQuery(
                    "SELECT value FROM catalystLocalStorage WHERE key = ?", arrayOf(key))
                val enabled = if (cursor.moveToFirst()) cursor.getString(0) == "true" else false
                cursor.close()
                db.close()
                enabled
            } catch (e: Exception) {
                DebugLog.d(TAG, "Cannot read $key: ${e.message}")
                false
            }
        }
    }

    private val handler = Handler(Looper.getMainLooper())
    private var isRunning = false
    /** #234: true when this instance only holds the process up (no relaunching). */
    private var keepAliveOnly = false
    private var lastRelaunchTime = 0L
    private var screenOnReceiver: BroadcastReceiver? = null

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
        createNotificationChannel()
        registerScreenOnReceiver()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Read from prefs, not from the intent: START_STICKY restarts us with a null one.
        keepAliveOnly = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getBoolean(KEY_KEEPALIVE_ONLY, false)

        // startForeground() must run before any early return: the caller used
        // startForegroundService(), and stopping without it throws
        // ForegroundServiceDidNotStartInTimeException on Android 12+.
        startForeground(NOTIFICATION_ID, buildNotification())

        if (keepAliveOnly) {
            // #234: nothing to guard, we are only here so the process is not killed.
            if (!isMqttEnabled()) {
                DebugLog.d(TAG, "MQTT disabled — stopping keep-alive watchdog")
                stopSelf()
                return START_NOT_STICKY
            }
        } else if (!isKioskEnabled()) {
            // Only run when kiosk mode is enabled
            DebugLog.d(TAG, "Kiosk mode disabled — stopping watchdog")
            stopSelf()
            return START_NOT_STICKY
        }

        isRunning = true
        handler.removeCallbacks(checkRunnable)
        handler.postDelayed(checkRunnable, CHECK_INTERVAL_MS)

        DebugLog.d(TAG, "Watchdog started (START_STICKY)")

        // START_STICKY: Android will restart this service if the process is killed
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        isRunning = false
        handler.removeCallbacks(checkRunnable)
        unregisterScreenOnReceiver()
        super.onDestroy()
        DebugLog.d(TAG, "Watchdog destroyed")
    }

    // ────────────────────────────────────────────────────────────────────
    // Core logic
    // ────────────────────────────────────────────────────────────────────

    private fun checkAndRelaunch() {
        // #234: keep-alive mode never relaunches anything. FreeKiosk is a normal app here,
        // the user is free to leave it, and dragging it back to the foreground every 10s
        // would be far worse than the problem this service solves.
        if (keepAliveOnly) {
            if (!isMqttEnabled()) {
                DebugLog.d(TAG, "MQTT disabled — stopping keep-alive watchdog")
                stopSelf()
            }
            return
        }

        // Re-check kiosk setting each cycle (user may have turned it off)
        if (!isKioskEnabled()) {
            DebugLog.d(TAG, "Kiosk mode disabled — stopping watchdog")
            stopSelf()
            return
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
     * Check if MainActivity is currently in the foreground by inspecting process importance.
     * A task that exists in recents (but the launcher is in front) has
     * IMPORTANCE_FOREGROUND_SERVICE — not IMPORTANCE_FOREGROUND — because the watchdog
     * service is keeping the process alive but the activity is not visible.
     * We only skip relaunch when the process importance is IMPORTANCE_FOREGROUND,
     * meaning our activity is actually visible to the user.
     */
    private fun isMainActivityRunning(): Boolean {
        return try {
            val am = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val processes = am.runningAppProcesses ?: return false
            val self = processes.find { it.pid == android.os.Process.myPid() } ?: return false
            self.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
        } catch (e: Exception) {
            DebugLog.d(TAG, "Error checking foreground state: ${e.message}")
            true // assume running if we can't check (avoids relaunch loops)
        }
    }

    private fun registerScreenOnReceiver() {
        if (screenOnReceiver != null) return
        screenOnReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                if (intent.action != Intent.ACTION_SCREEN_ON) return
                // In external app mode the external app is expected to come back via
                // Android TV's task manager — don't interfere with a forced relaunch.
                if (getDisplayMode() == "external_app") {
                    DebugLog.d(TAG, "SCREEN_ON — external app mode, skipping forced relaunch")
                    return
                }
                DebugLog.d(TAG, "SCREEN_ON — checking kiosk state immediately")
                // Bypass the cooldown so we relaunch promptly after any standby/wake cycle.
                lastRelaunchTime = 0L
                checkAndRelaunch()
            }
        }
        registerReceiver(screenOnReceiver, IntentFilter(Intent.ACTION_SCREEN_ON))
        DebugLog.d(TAG, "SCREEN_ON receiver registered")
    }

    private fun unregisterScreenOnReceiver() {
        screenOnReceiver?.let {
            try { unregisterReceiver(it) } catch (_: Exception) {}
            screenOnReceiver = null
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

    private fun isMqttEnabled(): Boolean = readFlag(this, "@kiosk_mqtt_enabled")

    private fun isKioskEnabled(): Boolean {
        return try {
            val dbPath = getDatabasePath("RKStorage").absolutePath
            val db = SQLiteDatabase.openDatabase(dbPath, null, SQLiteDatabase.OPEN_READONLY)
            val cursor = db.rawQuery(
                "SELECT value FROM catalystLocalStorage WHERE key = ?",
                arrayOf("@kiosk_enabled"))
            val enabled = if (cursor.moveToFirst()) cursor.getString(0) == "true" else false
            cursor.close()
            db.close()
            enabled
        } catch (e: Exception) {
            DebugLog.d(TAG, "Cannot read kiosk_enabled: ${e.message}")
            false
        }
    }

    // ────────────────────────────────────────────────────────────────────
    // Notification (required for foreground service)
    // ────────────────────────────────────────────────────────────────────

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Kiosk Watchdog",
                NotificationManager.IMPORTANCE_MIN   // silent, no badge
            ).apply {
                description = "Keeps FreeKiosk running in kiosk mode"
                setShowBadge(false)
            }
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("FreeKiosk")
            .setContentText(if (keepAliveOnly) "MQTT connection active" else "Kiosk mode active")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setOngoing(true)
            .setSilent(true)
            .build()
    }
}
