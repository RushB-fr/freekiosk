package com.freekiosk

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.database.sqlite.SQLiteDatabase
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager

/**
 * BootLockActivity — Lightweight native Android activity that enters lock-task mode
 * immediately after boot, BEFORE React Native has a chance to load.
 *
 * Fixes #98: On low-spec devices (e.g. Nokia C210), FreeKiosk / React Native can take
 * 1-2 minutes to load. During that window the user had full access to the OS.
 * BootLockActivity is a pure Android activity (no RN dependency) so it starts in
 * under a second and locks the device right away.
 *
 * Flow:
 *   BootReceiver → BootLockActivity (instant lock-task + loading UI)
 *                     ↓  polls until MainActivity is running
 *                  finish() — lock-task persists because both activities
 *                             belong to the same whitelisted package.
 */
class BootLockActivity : Activity() {

    companion object {
        private const val TAG = "BootLockActivity"

        /** Timeout: if MainActivity hasn't taken over after this long, finish anyway. */
        private const val MAX_WAIT_MS = 120_000L  // 2 minutes

        /** How often we check whether MainActivity is alive. */
        private const val POLL_INTERVAL_MS = 1_000L  // 1 second

        /**
         * #222 safety net: how long to sit stuck before deferring to a secure keyguard.
         * On a device with a secure lock screen, our SHOW_WHEN_LOCKED/DISMISS_KEYGUARD
         * flags OCCLUDE (do not dismiss) the keyguard, so the user can never enter their
         * credential, credential-encrypted (CE) storage never unlocks, and MainActivity
         * (not directBootAware) can never start: the kiosk is stuck on the loading screen
         * forever. If we are still in that exact state after this delay, we finish() so the
         * secure keyguard becomes visible; once the user unlocks, BOOT_COMPLETED relaunches
         * the kiosk normally. Reactive (only fires on a proven stall) and gated on a secure
         * lock actually being set, so it can never affect the non-secure fast-boot path.
         */
        private const val SECURE_LOCK_STALL_MS = 8_000L

        /** #222: how often the off-main-thread watchdog reports and re-checks. */
        private const val WATCHDOG_INTERVAL_MS = 2_000L

        /**
         * #222: below this, a boot is going normally (hand-off happens in a second or two)
         * and nothing is logged. Past it we are in abnormal territory, and every tick is
         * recorded: DebugLog.d is stripped from release builds, so without this a device
         * stuck in the field would again leave no trace at all.
         */
        private const val DIAGNOSTIC_AFTER_MS = 5_000L
    }

    private val handler = Handler(Looper.getMainLooper())
    private var startTime = 0L
    private var mainActivityLaunched = false

    // #222 instrumentation + off-main-thread recovery.
    private var watchdogThread: android.os.HandlerThread? = null
    private var watchdogHandler: Handler? = null
    @Volatile private var watchdogStopped = false
    @Volatile private var lastPollAt = 0L
    @Volatile private var recoveryAttempted = false

    // ────────────────────────────────────────────────────────────────────
    // Lifecycle
    // ────────────────────────────────────────────────────────────────────

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Keep screen on & make full-screen immediately
        window.addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
            WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
            WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
        )

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.attributes.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
        }

        // #109 fix: setContentView MUST come before hideSystemUI().
        // On Android R+, window.insetsController accesses the DecorView which
        // is only created by setContentView(). Calling hideSystemUI() first
        // caused a NullPointerException crash on boot.
        setContentView(R.layout.activity_boot_lock)
        hideSystemUI()

        DebugLog.d(TAG, "onCreate — attempting immediate lock-task")

        // Enter lock-task mode right away (Device Owner path)
        enterLockTaskIfDeviceOwner()

        startTime = System.currentTimeMillis()

        // Now launch MainActivity (React Native) in the background.
        // At LOCKED_BOOT_COMPLETED time, CE storage may still be locked and MainActivity
        // (which is NOT directBootAware) may fail to start. We catch that and retry in
        // the poll loop once CE becomes available.
        launchMainActivity()

        // Start polling — once RN is ready the MainActivity will be in the foreground
        // and we can finish().
        handler.postDelayed(pollRunnable, POLL_INTERVAL_MS)

        // #222: independent of the main thread, so a stall cannot silence it.
        startStallWatchdog()
    }

    override fun onDestroy() {
        handler.removeCallbacks(pollRunnable)
        stopStallWatchdog()
        super.onDestroy()
        DebugLog.d(TAG, "onDestroy")
    }

    // ────────────────────────────────────────────────────────────────────
    // Lock-task
    // ────────────────────────────────────────────────────────────────────

    private fun enterLockTaskIfDeviceOwner() {
        try {
            val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            if (!dpm.isDeviceOwnerApp(packageName)) {
                DebugLog.d(TAG, "Not Device Owner — skipping lock-task")
                return
            }

            val admin = ComponentName(this, DeviceAdminReceiver::class.java)

            // Build whitelist identical to MainActivity's: FreeKiosk + external app + managed apps
            val whitelist = mutableListOf(packageName)
            whitelist.addAll(readManagedAppPackages())
            readExternalAppPackage()?.let { whitelist.add(it) }
            val unique = whitelist.distinct().toTypedArray()

            dpm.setLockTaskPackages(admin, unique)

            // Configure lock-task features from user settings, matching MainActivity /
            // AppLauncherModule. Previously this applied GLOBAL_ACTIONS only and relied on
            // MainActivity.enableKioskRestrictions() to upgrade to NOTIFICATIONS / SYSTEM_INFO.
            // In multi-app mode an external app takes the foreground at boot and MainActivity
            // stays backgrounded, so that upgrade is delayed or never applied — leaving the
            // notification panel and status bar disabled after a reboot (#191). Applying the
            // full feature set here makes them correct from the first lock-task session.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                val allowPowerButton = readAsyncStorageValue("@kiosk_allow_power_button", "true") == "true"
                val allowNotifications = readAsyncStorageValue("@kiosk_allow_notifications", "false") == "true"
                val allowSystemInfo = readAsyncStorageValue("@kiosk_allow_system_info", "false") == "true"

                // GLOBAL_ACTIONS is the base (Android default; prevents Samsung audio mute).
                var features = DevicePolicyManager.LOCK_TASK_FEATURE_GLOBAL_ACTIONS
                // allowPowerButton=false means the admin wants to BLOCK the power menu.
                if (!allowPowerButton) {
                    features = features and DevicePolicyManager.LOCK_TASK_FEATURE_GLOBAL_ACTIONS.inv()
                }
                if (allowSystemInfo) {
                    features = features or DevicePolicyManager.LOCK_TASK_FEATURE_SYSTEM_INFO
                }
                if (allowNotifications) {
                    features = features or DevicePolicyManager.LOCK_TASK_FEATURE_NOTIFICATIONS
                    // Android requires HOME when NOTIFICATIONS is enabled.
                    features = features or DevicePolicyManager.LOCK_TASK_FEATURE_HOME
                }
                dpm.setLockTaskFeatures(admin, features)
                DebugLog.d(TAG, "Lock-task features at boot: blockPowerButton=${!allowPowerButton}, notifications=$allowNotifications, systemInfo=$allowSystemInfo (flags=$features)")
            }

            startLockTask()
            DebugLog.d(TAG, "Lock-task started with whitelist: ${unique.toList()}")
        } catch (e: Exception) {
            DebugLog.errorProduction(TAG, "Failed to enter lock-task: ${e.message}")
        }
    }

    // ────────────────────────────────────────────────────────────────────
    // Launch boot apps + MainActivity
    // ────────────────────────────────────────────────────────────────────

    private fun launchMainActivity() {
        // Launch managed apps with launchOnBoot=true in the background first
        launchBackgroundBootApps()

        try {
            val intent = Intent(this, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or
                         Intent.FLAG_ACTIVITY_CLEAR_TOP or
                         Intent.FLAG_ACTIVITY_SINGLE_TOP)
                putExtra("from_boot_lock", true)
            }
            startActivity(intent)
            mainActivityLaunched = true
            DebugLog.d(TAG, "Launched MainActivity")
        } catch (e: Exception) {
            // MainActivity is NOT directBootAware; at LOCKED_BOOT_COMPLETED time, Android
            // will throw because CE storage is still locked. We'll retry in the poll loop.
            DebugLog.d(TAG, "Failed to launch MainActivity (CE may be locked, will retry): ${e.message}")
        }
    }

    private fun launchBackgroundBootApps() {
        try {
            val json = readAsyncStorageValue("@kiosk_managed_apps", "[]")
            val arr = org.json.JSONArray(json)
            val pm = packageManager
            for (i in 0 until arr.length()) {
                val app = arr.getJSONObject(i)
                if (!app.optBoolean("launchOnBoot", false)) continue
                val pkg = app.getString("packageName")
                try {
                    pm.getPackageInfo(pkg, 0)
                    val launchIntent = pm.getLaunchIntentForPackage(pkg) ?: continue
                    launchIntent.addFlags(
                        Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_NO_ANIMATION
                    )
                    startActivity(launchIntent)
                    DebugLog.d(TAG, "Boot app launched: $pkg")
                    Thread.sleep(500)
                } catch (e: Exception) {
                    DebugLog.d(TAG, "Could not launch boot app $pkg: ${e.message}")
                }
            }
        } catch (e: Exception) {
            DebugLog.d(TAG, "Error launching background apps: ${e.message}")
        }
    }

    // ────────────────────────────────────────────────────────────────────
    // Polling — wait for MainActivity to be ready, then finish
    // ────────────────────────────────────────────────────────────────────

    private val pollRunnable = object : Runnable {
        private var pollCount = 0

        override fun run() {
            val elapsed = System.currentTimeMillis() - startTime
            pollCount++
            lastPollAt = System.currentTimeMillis()
            // #222: the only proof, in a release build, that this loop is alive at all.
            if (elapsed >= DIAGNOSTIC_AFTER_MS && pollCount % 5 == 0) {
                DebugLog.errorProduction(TAG, "poll alive: elapsed=${elapsed}ms count=$pollCount mainActivityLaunched=$mainActivityLaunched")
            }

            // Safety timeout
            // #222: keep polling after every finish(). In lock task a finish() can be
            // absorbed, and returning here is what left the device with no supervision at
            // all. onDestroy() removes this callback, so a finish() that works still stops
            // the loop straight away.
            if (elapsed >= MAX_WAIT_MS) {
                DebugLog.errorProduction(TAG, "Timeout reached after ${elapsed}ms — finishing BootLockActivity")
                finish()
                handler.postDelayed(this, POLL_INTERVAL_MS)
                return
            }

            // Check if MainActivity is in the foreground (React Native loaded)
            if (isMainActivityReady()) {
                DebugLog.d(TAG, "MainActivity is ready after ${elapsed}ms — finishing")
                finish()
                handler.postDelayed(this, POLL_INTERVAL_MS)
                return
            }

            // #222 safety net: if we have been unable to hand off for a while AND the device
            // has a secure lock screen with the user still locked, we are deadlocked behind
            // the keyguard we are occluding. Finish so the keyguard is revealed and the user
            // can unlock; the kiosk then starts at BOOT_COMPLETED. Only fires in the already
            // broken secure-lock state: a normal boot hands off (isMainActivityReady) first,
            // and a non-secure device never enters this branch.
            if (elapsed >= SECURE_LOCK_STALL_MS && isStuckBehindSecureKeyguard()) {
                DebugLog.errorProduction(TAG, "Deferring to secure keyguard after ${elapsed}ms stall, finishing so the user can unlock (kiosk resumes at BOOT_COMPLETED)")
                // #222 follow-up: finish() alone was not enough and the device stayed stuck.
                // We are in lock task, and lock task DISABLES the keyguard unless
                // LOCK_TASK_FEATURE_KEYGUARD is set (same platform behaviour #208 documents in
                // KioskModule). So the activity went away and still no lock screen appeared for
                // the user to unlock. Leave lock task first, then finish.
                //
                // Safe in this state and only in this state: the branch requires a secure lock
                // to actually be set, so what the user gets is the system keyguard asking for
                // their PIN, not an open device. The kiosk re-enters lock task at BOOT_COMPLETED
                // once they unlock.
                try {
                    stopLockTask()
                    DebugLog.errorProduction(TAG, "Left lock task so the secure keyguard can be shown")
                } catch (e: Exception) {
                    DebugLog.errorProduction(TAG, "Could not leave lock task: ${e.message}")
                }
                finish()
                return
            }

            // If the initial launchMainActivity() failed (e.g. CE was locked at
            // LOCKED_BOOT_COMPLETED time), retry every 5 seconds. Once CE unlocks —
            // which happens either automatically (no lock screen) or when BOOT_COMPLETED
            // fires — the retry will succeed and MainActivity will load normally.
            // #222: do NOT gate this on mainActivityLaunched. startActivity() returns a
            // result code when the system refuses the launch (observed: -92 at
            // LOCKED_BOOT_COMPLETED) instead of throwing, so the flag was set to true on a
            // launch that never happened and the retry disarmed itself. The loop already
            // stops as soon as isMainActivityReady(), so retrying costs nothing once it is up.
            if (pollCount % 5 == 0) {
                DebugLog.d(TAG, "Retrying MainActivity launch (CE storage may now be available, elapsed=${elapsed}ms)")
                launchMainActivity()
            }

            handler.postDelayed(this, POLL_INTERVAL_MS)
        }
    }

    /**
     * Heuristic: MainActivity is "ready" when it has entered lock-task mode itself.
     * Since both activities are in the same package, the lock-task persists seamlessly.
     * We check the activity manager's lock-task state — if lock-task is still active
     * and we're no longer the foreground activity, MainActivity has taken over.
     */
    private fun isMainActivityReady(): Boolean {
        return try {
            val am = getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
            // If lock task mode is active and our activity is not the resumed one,
            // it means MainActivity has taken over.
            // #222: losing window focus is NOT proof that MainActivity took over. A secure
            // keyguard taking focus at boot produces exactly the same signal, and the loop
            // then declared the hand-off done, called finish() (absorbed by lock task, so the
            // activity stayed on screen) and stopped polling, leaving the device stuck with
            // nothing watching. MainActivity now says so itself.
            if (!MainActivity.hasStarted) {
                false
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val lockTaskMode = am.lockTaskModeState
                lockTaskMode != android.app.ActivityManager.LOCK_TASK_MODE_NONE && !hasWindowFocus()
            } else {
                !hasWindowFocus()
            }
        } catch (e: Exception) {
            false
        }
    }

    /**
     * #222 diagnosis: everything here used to hang off the main-thread handler, and
     * DebugLog.d is compiled out of release builds, so a release device stuck on this
     * screen produced no trace at all. This watchdog runs on its own thread and logs with
     * errorProduction, so one reboot tells us which of the two failures we have:
     *
     *  - poll heartbeat missing while the watchdog keeps ticking: the main thread is
     *    blocked or the poll runnable never ran, and no main-thread recovery can work.
     *  - both ticking but "stuck" false: the detection is wrong, and the logged values of
     *    isDeviceSecure / isUserUnlocked say why.
     *
     * It also carries the recovery itself, so it no longer depends on the poll loop being
     * alive to fire.
     */
    private fun startStallWatchdog() {
        val thread = android.os.HandlerThread("BootLockWatchdog").apply { start() }
        watchdogThread = thread
        val wHandler = Handler(thread.looper)
        watchdogHandler = wHandler

        wHandler.post(object : Runnable {
            override fun run() {
                if (watchdogStopped) return
                val elapsed = System.currentTimeMillis() - startTime
                val sinceLastPoll = if (lastPollAt == 0L) -1 else System.currentTimeMillis() - lastPollAt
                val secure = try { BootReceiver.isDeviceSecure(this@BootLockActivity) } catch (e: Exception) { null }
                val unlocked = try {
                    (getSystemService(Context.USER_SERVICE) as android.os.UserManager).isUserUnlocked()
                } catch (e: Exception) { null }

                if (elapsed >= DIAGNOSTIC_AFTER_MS) {
                    DebugLog.errorProduction(
                        TAG,
                        "watchdog: elapsed=${elapsed}ms pollAge=${sinceLastPoll}ms " +
                            "mainActivityLaunched=$mainActivityLaunched deviceSecure=$secure userUnlocked=$unlocked"
                    )
                }

                if (!recoveryAttempted && elapsed >= SECURE_LOCK_STALL_MS && secure == true && unlocked == false) {
                    recoveryAttempted = true
                    DebugLog.errorProduction(TAG, "watchdog: stuck behind a secure keyguard, recovering")
                    runOnUiThread {
                        try {
                            stopLockTask()
                            DebugLog.errorProduction(TAG, "watchdog: left lock task")
                        } catch (e: Exception) {
                            DebugLog.errorProduction(TAG, "watchdog: stopLockTask failed: ${e.message}")
                        }
                        finish()
                        DebugLog.errorProduction(TAG, "watchdog: finish() called")
                    }
                }

                wHandler.postDelayed(this, WATCHDOG_INTERVAL_MS)
            }
        })
    }

    private fun stopStallWatchdog() {
        watchdogStopped = true
        watchdogHandler?.removeCallbacksAndMessages(null)
        watchdogHandler = null
        watchdogThread?.quitSafely()
        watchdogThread = null
    }

    /**
     * #222: True when this activity is deadlocked over a secure keyguard, i.e. a secure lock
     * screen (PIN/pattern/password) is set AND the user is still locked (credential-encrypted
     * storage is not yet available). In that state our keyguard-occluding flags prevent the
     * user from unlocking, so CE never becomes available and MainActivity can never launch.
     * Gated on a real secure lock, so a non-secure device (the normal fast-boot case, where
     * DISMISS_KEYGUARD works and CE unlocks on its own) is never treated as stuck.
     */
    private fun isStuckBehindSecureKeyguard(): Boolean {
        try {
            if (!BootReceiver.isDeviceSecure(this)) return false
            val um = getSystemService(Context.USER_SERVICE) as android.os.UserManager
            return !um.isUserUnlocked()
        } catch (e: Exception) {
            // If we cannot determine the state, do nothing (keep the existing behavior).
            return false
        }
    }

    // ────────────────────────────────────────────────────────────────────
    // AsyncStorage helpers (same pattern as BootReceiver — direct SQLite)
    // ────────────────────────────────────────────────────────────────────

    private fun readAsyncStorageValue(key: String, default: String): String {
        return try {
            val dbPath = getDatabasePath("RKStorage").absolutePath
            val db = SQLiteDatabase.openDatabase(dbPath, null, SQLiteDatabase.OPEN_READONLY)
            val cursor = db.rawQuery(
                "SELECT value FROM catalystLocalStorage WHERE key = ?", arrayOf(key))
            val value = if (cursor.moveToFirst()) cursor.getString(0) ?: default else default
            cursor.close()
            db.close()
            value
        } catch (e: Exception) {
            DebugLog.d(TAG, "Cannot read AsyncStorage key $key: ${e.message}")
            default
        }
    }

    private fun readManagedAppPackages(): List<String> {
        return try {
            val json = readAsyncStorageValue("@kiosk_managed_apps", "[]")
            val arr = org.json.JSONArray(json)
            (0 until arr.length()).map { arr.getJSONObject(it).getString("packageName") }
        } catch (e: Exception) {
            emptyList()
        }
    }

    private fun readExternalAppPackage(): String? {
        val mode = readAsyncStorageValue("@kiosk_display_mode", "webview")
        if (mode != "external_app") return null
        val pkg = readAsyncStorageValue("@kiosk_external_app_package", "")
        return pkg.ifEmpty { null }
    }

    // ────────────────────────────────────────────────────────────────────
    // System UI
    // ────────────────────────────────────────────────────────────────────

    private fun hideSystemUI() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                window.insetsController?.let { ctrl ->
                    ctrl.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                    ctrl.systemBarsBehavior =
                        WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                }
            } else {
                @Suppress("DEPRECATION")
                window.decorView.systemUiVisibility = (
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        or View.SYSTEM_UI_FLAG_FULLSCREEN
                        or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION)
            }
        } catch (e: Exception) {
            DebugLog.errorProduction(TAG, "hideSystemUI failed (DecorView may not be ready): ${e.message}")
        }
    }
}
