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
    }

    private val handler = Handler(Looper.getMainLooper())
    private var startTime = 0L

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

        // Now launch MainActivity (React Native) in the background
        launchMainActivity()

        // Start polling — once RN is ready the MainActivity will be in the foreground
        // and we can finish().
        handler.postDelayed(pollRunnable, POLL_INTERVAL_MS)
    }

    override fun onDestroy() {
        handler.removeCallbacks(pollRunnable)
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

            // Configure minimal lock-task features (just power button for safety)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                dpm.setLockTaskFeatures(admin,
                    DevicePolicyManager.LOCK_TASK_FEATURE_GLOBAL_ACTIONS)
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
            DebugLog.d(TAG, "Launched MainActivity")
        } catch (e: Exception) {
            DebugLog.errorProduction(TAG, "Failed to launch MainActivity: ${e.message}")
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
        override fun run() {
            val elapsed = System.currentTimeMillis() - startTime

            // Safety timeout
            if (elapsed >= MAX_WAIT_MS) {
                DebugLog.d(TAG, "Timeout reached — finishing BootLockActivity")
                finish()
                return
            }

            // Check if MainActivity is in the foreground (React Native loaded)
            if (isMainActivityReady()) {
                DebugLog.d(TAG, "MainActivity is ready after ${elapsed}ms — finishing")
                finish()
                return
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
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val lockTaskMode = am.lockTaskModeState
                lockTaskMode != android.app.ActivityManager.LOCK_TASK_MODE_NONE && !hasWindowFocus()
            } else {
                !hasWindowFocus()
            }
        } catch (e: Exception) {
            false
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
