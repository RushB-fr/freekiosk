package com.freekiosk

import android.app.admin.DevicePolicyManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.database.sqlite.SQLiteDatabase
import android.os.Handler
import android.os.Looper
import android.provider.Settings

class BootReceiver : BroadcastReceiver() {

    companion object {
        /**
         * DE (Device Encrypted) SharedPreferences that can be read even before the user
         * unlocks the device (i.e. at ACTION_LOCKED_BOOT_COMPLETED time).
         * We persist the kiosk "should fast-boot-lock" flag here so we can honour it
         * early in the boot sequence without touching CE (user-encrypted) SQLite.
         *
         * Written at every BOOT_COMPLETED (after CE is available) and also called from
         * KioskModule when kiosk/auto-launch settings change at runtime.
         */
        const val DE_PREFS_NAME = "kiosk_de_boot_prefs"
        const val DE_KEY_FAST_BOOT_LOCK = "fast_boot_lock_enabled"

        fun updateDeBootFlag(context: Context, enabled: Boolean) {
            try {
                val deCtx = context.createDeviceProtectedStorageContext()
                deCtx.getSharedPreferences(DE_PREFS_NAME, Context.MODE_PRIVATE)
                    .edit().putBoolean(DE_KEY_FAST_BOOT_LOCK, enabled).apply()
                DebugLog.d("BootReceiver", "DE boot flag updated: $enabled")
            } catch (e: Exception) {
                DebugLog.errorProduction("BootReceiver", "Failed to update DE boot flag: ${e.message}")
            }
        }

        fun readDeBootFlag(context: Context): Boolean {
            return try {
                val deCtx = context.createDeviceProtectedStorageContext()
                deCtx.getSharedPreferences(DE_PREFS_NAME, Context.MODE_PRIVATE)
                    .getBoolean(DE_KEY_FAST_BOOT_LOCK, false)
            } catch (e: Exception) {
                false
            }
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED ||
            intent.action == "android.intent.action.QUICKBOOT_POWERON" ||
            intent.action == "android.intent.action.REBOOT" ||
            intent.action == Intent.ACTION_LOCKED_BOOT_COMPLETED) {

            DebugLog.d("BootReceiver", "Boot detected: ${intent.action}")

            // ── LOCKED_BOOT_COMPLETED: CE (user-encrypted) storage is NOT yet available ──
            // Any read from RKStorage (SQLite) will fail and return its safe default (false).
            // We instead read the DE SharedPreferences flag that was saved on the previous
            // BOOT_COMPLETED and is still readable because DE storage is always unlocked.
            if (intent.action == Intent.ACTION_LOCKED_BOOT_COMPLETED) {
                if (readDeBootFlag(context)) {
                    DebugLog.d("BootReceiver", "LOCKED_BOOT: DE flag=true — launching BootLockActivity immediately")
                    try {
                        val lockIntent = Intent(context, BootLockActivity::class.java)
                        lockIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        context.startActivity(lockIntent)
                    } catch (e: Exception) {
                        DebugLog.errorProduction("BootReceiver", "BootLockActivity failed at LOCKED_BOOT: ${e.message}")
                    }
                } else {
                    DebugLog.d("BootReceiver", "LOCKED_BOOT: DE flag=false — skipping BootLockActivity")
                }
                // Do NOT start services yet — their SQLite reads also need CE storage.
                return
            }

            // ── From here: BOOT_COMPLETED / QUICKBOOT / REBOOT — CE storage is available ──

            // Re-enable accessibility service if Device Owner (includes managed apps whitelist)
            reEnableAccessibilityIfDeviceOwner(context)

            // Check if auto-launch is enabled before doing anything else
            if (!isAutoLaunchEnabled(context)) {
                DebugLog.d("BootReceiver", "Auto-launch is disabled, not starting app")
                // Update DE flag so next LOCKED_BOOT_COMPLETED also respects the setting
                updateDeBootFlag(context, false)
                return
            }

            // Persist current "fast boot lock" eligibility to DE storage for next boot
            val fastLock = shouldUseFastBootLock(context)
            updateDeBootFlag(context, fastLock)

            // ── #98 fix: launch BootLockActivity IMMEDIATELY if Device Owner + kiosk ──
            // This locks the device in < 1 second, before React Native loads.
            // BootLockActivity will then launch MainActivity itself.
            // If BootLockActivity was already started by LOCKED_BOOT_COMPLETED, it is
            // singleTask and will simply receive onNewIntent and continue its poll loop.
            if (fastLock) {
                DebugLog.d("BootReceiver", "Fast boot-lock: launching BootLockActivity")
                try {
                    val lockIntent = Intent(context, BootLockActivity::class.java)
                    lockIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    context.startActivity(lockIntent)
                } catch (e: Exception) {
                    DebugLog.errorProduction("BootReceiver", "BootLockActivity failed, falling back: ${e.message}")
                    // Fall through to legacy path below
                    launchMainActivityLegacy(context)
                }
            } else {
                // Non-Device-Owner path: use the original delayed launch
                launchMainActivityLegacy(context)
            }

            // ── #96 fix: start KioskWatchdogService (START_STICKY) ──
            startKioskWatchdogIfNeeded(context)

            // Start BackgroundAppMonitorService for keep-alive apps
            startBackgroundMonitorIfNeeded(context)
        }
    }

    /**
     * Determine whether we can use the fast BootLockActivity path.
     * Requires: Device Owner + kiosk mode enabled.
     */
    private fun shouldUseFastBootLock(context: Context): Boolean {
        return try {
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val isDeviceOwner = dpm.isDeviceOwnerApp(context.packageName)
            val kioskEnabled = isKioskEnabled(context)
            DebugLog.d("BootReceiver", "Fast boot-lock check: DO=$isDeviceOwner, kiosk=$kioskEnabled")
            isDeviceOwner && kioskEnabled
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Read kiosk_enabled from AsyncStorage.
     */
    private fun isKioskEnabled(context: Context): Boolean {
        return try {
            val dbPath = context.getDatabasePath("RKStorage").absolutePath
            val db = SQLiteDatabase.openDatabase(dbPath, null, SQLiteDatabase.OPEN_READONLY)
            val cursor = db.rawQuery(
                "SELECT value FROM catalystLocalStorage WHERE key = ?",
                arrayOf("@kiosk_enabled"))
            val enabled = if (cursor.moveToFirst()) cursor.getString(0) == "true" else false
            cursor.close()
            db.close()
            enabled
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Legacy path: delayed launch of MainActivity (for non-Device-Owner installs).
     */
    private fun launchMainActivityLegacy(context: Context) {
        Handler(Looper.getMainLooper()).postDelayed({
            DebugLog.d("BootReceiver", "Legacy path: launching MainActivity")

            // Launch background apps on a worker thread — launchBackgroundApps() uses
            // Thread.sleep() between apps, which must not run on the main looper.
            // MainActivity is launched 1 s later via a nested postDelayed so the main
            // thread stays unblocked throughout (no ANR risk on Android 14+ devices).
            val mainHandler = Handler(Looper.getMainLooper())
            Thread {
                launchBackgroundApps(context)
                mainHandler.postDelayed({
                    val launchIntent = Intent(context, MainActivity::class.java)
                    launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    launchIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
                    launchIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)

                    try {
                        context.startActivity(launchIntent)
                        DebugLog.d("BootReceiver", "Successfully launched MainActivity")
                    } catch (e: Exception) {
                        DebugLog.errorProduction("BootReceiver", "Failed to launch app: ${e.message}")
                    }
                }, 1000)
            }.start()
        }, 3000) // 3 second delay to ensure system is ready
    }

    /**
     * Start KioskWatchdogService if kiosk mode is enabled (#96).
     * The service uses START_STICKY so Android restarts it after OOM kills.
     */
    private fun startKioskWatchdogIfNeeded(context: Context) {
        if (!isKioskEnabled(context)) return
        try {
            val serviceIntent = Intent(context, KioskWatchdogService::class.java)
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
            } else {
                context.startService(serviceIntent)
            }
            DebugLog.d("BootReceiver", "KioskWatchdogService started")
        } catch (e: Exception) {
            DebugLog.errorProduction("BootReceiver", "Failed to start KioskWatchdogService: ${e.message}")
        }
    }
    
    /**
     * Re-enable the accessibility service after boot if the app is Device Owner.
     * Android 13+ can disable accessibility services of sideloaded apps after reboot.
     * Also re-applies the managed apps accessibility whitelist.
     */
    private fun reEnableAccessibilityIfDeviceOwner(context: Context) {
        try {
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            if (!dpm.isDeviceOwnerApp(context.packageName)) {
                DebugLog.d("BootReceiver", "Not Device Owner, skipping accessibility re-enable")
                return
            }

            val adminComponent = ComponentName(context, DeviceAdminReceiver::class.java)
            val serviceComponent = ComponentName(context, FreeKioskAccessibilityService::class.java)
            val serviceName = "${context.packageName}/${serviceComponent.className}"

            // Build permitted list: FreeKiosk + managed apps with allowAccessibility=true
            val permitted = mutableListOf(context.packageName)
            permitted.addAll(getManagedAppsWithAccessibility(context))
            
            dpm.setPermittedAccessibilityServices(adminComponent, permitted.distinct())
            DebugLog.d("BootReceiver", "Permitted accessibility services: $permitted")

            // Check if FreeKiosk's own service is already enabled
            val currentServices = Settings.Secure.getString(
                context.contentResolver,
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
            ) ?: ""

            if (!currentServices.contains(serviceName)) {
                val newServices = if (currentServices.isEmpty()) serviceName
                    else "$currentServices:$serviceName"
                try {
                    Settings.Secure.putString(
                        context.contentResolver,
                        Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
                        newServices
                    )
                    Settings.Secure.putString(
                        context.contentResolver,
                        Settings.Secure.ACCESSIBILITY_ENABLED,
                        "1"
                    )
                    DebugLog.d("BootReceiver", "Accessibility service re-enabled after boot")
                } catch (se: SecurityException) {
                    DebugLog.errorProduction("BootReceiver", 
                        "WRITE_SECURE_SETTINGS not granted — cannot auto-enable accessibility service. " +
                        "Grant via ADB: adb shell pm grant ${context.packageName} android.permission.WRITE_SECURE_SETTINGS")
                }
            } else {
                DebugLog.d("BootReceiver", "Accessibility service already enabled")
            }
        } catch (e: Exception) {
            DebugLog.errorProduction("BootReceiver", "Failed to re-enable accessibility: ${e.message}")
        }
    }

    /**
     * Launch managed apps that have launchOnBoot=true.
     * They are launched in the background (not brought to foreground).
     */
    private fun launchBackgroundApps(context: Context) {
        try {
            val apps = getManagedAppsForBoot(context)
            if (apps.isEmpty()) {
                DebugLog.d("BootReceiver", "No background apps to launch on boot")
                return
            }
            
            val pm = context.packageManager
            for (packageName in apps) {
                try {
                    // Verify app is installed first
                    try {
                        pm.getPackageInfo(packageName, 0)
                    } catch (e: android.content.pm.PackageManager.NameNotFoundException) {
                        DebugLog.d("BootReceiver", "Boot app not installed, skipping: $packageName")
                        continue
                    }
                    
                    val launchIntent = pm.getLaunchIntentForPackage(packageName)
                    if (launchIntent != null) {
                        launchIntent.addFlags(
                            Intent.FLAG_ACTIVITY_NEW_TASK or
                            Intent.FLAG_ACTIVITY_NO_ANIMATION
                        )
                        context.startActivity(launchIntent)
                        DebugLog.d("BootReceiver", "Boot app launched: $packageName")
                        // Small delay between launches to avoid overwhelming the system
                        Thread.sleep(500)
                    } else {
                        DebugLog.d("BootReceiver", "No launch intent for boot app: $packageName")
                    }
                } catch (e: Exception) {
                    DebugLog.errorProduction("BootReceiver", "Failed to launch boot app $packageName: ${e.message}")
                }
            }
        } catch (e: Exception) {
            DebugLog.errorProduction("BootReceiver", "Error launching boot apps: ${e.message}")
        }
    }

    /**
     * Start the BackgroundAppMonitorService if any managed app has keepAlive=true.
     */
    private fun startBackgroundMonitorIfNeeded(context: Context) {
        try {
            val keepAliveApps = getManagedAppsForKeepAlive(context)
            if (keepAliveApps.isEmpty()) {
                DebugLog.d("BootReceiver", "No keep-alive apps configured, skipping BackgroundAppMonitorService")
                return
            }
            
            val serviceIntent = Intent(context, BackgroundAppMonitorService::class.java)
            try {
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent)
                } else {
                    context.startService(serviceIntent)
                }
            } catch (e: Exception) {
                DebugLog.errorProduction("BootReceiver", "Failed to start foreground service: ${e.message}")
                return
            }
            DebugLog.d("BootReceiver", "BackgroundAppMonitorService started for ${keepAliveApps.size} apps")
        } catch (e: Exception) {
            DebugLog.errorProduction("BootReceiver", "Failed to start BackgroundAppMonitorService: ${e.message}")
        }
    }

    /**
     * Read managed apps from AsyncStorage and return those with allowAccessibility=true.
     */
    private fun getManagedAppsWithAccessibility(context: Context): List<String> {
        return getManagedAppsFiltered(context) { it.optBoolean("allowAccessibility", false) }
    }

    /**
     * Read managed apps from AsyncStorage and return those with launchOnBoot=true.
     */
    private fun getManagedAppsForBoot(context: Context): List<String> {
        return getManagedAppsFiltered(context) { it.optBoolean("launchOnBoot", false) }
    }

    /**
     * Read managed apps from AsyncStorage and return those with keepAlive=true.
     */
    private fun getManagedAppsForKeepAlive(context: Context): List<String> {
        return getManagedAppsFiltered(context) { it.optBoolean("keepAlive", false) }
    }

    /**
     * Generic helper to read managed apps from AsyncStorage with a filter predicate.
     */
    private fun getManagedAppsFiltered(context: Context, predicate: (org.json.JSONObject) -> Boolean): List<String> {
        return try {
            val dbPath = context.getDatabasePath("RKStorage").absolutePath
            val db = SQLiteDatabase.openDatabase(dbPath, null, SQLiteDatabase.OPEN_READONLY)
            val cursor = db.rawQuery(
                "SELECT value FROM catalystLocalStorage WHERE key = ?",
                arrayOf("@kiosk_managed_apps")
            )
            val result = if (cursor.moveToFirst()) {
                val json = cursor.getString(0) ?: "[]"
                val apps = org.json.JSONArray(json)
                val packages = mutableListOf<String>()
                for (i in 0 until apps.length()) {
                    val app = apps.getJSONObject(i)
                    if (predicate(app)) {
                        packages.add(app.getString("packageName"))
                    }
                }
                packages
            } else {
                emptyList()
            }
            cursor.close()
            db.close()
            result
        } catch (e: Exception) {
            DebugLog.d("BootReceiver", "Could not read managed apps: ${e.message}")
            emptyList()
        }
    }

    /**
     * Check if auto-launch is enabled by reading from AsyncStorage (React Native storage)
     * Modern AsyncStorage (@react-native-async-storage/async-storage v2.x) uses SQLite database
     */
    private fun isAutoLaunchEnabled(context: Context): Boolean {
        return try {
            // AsyncStorage uses SQLite database "RKStorage" with table "catalystLocalStorage"
            val dbPath = context.getDatabasePath("RKStorage").absolutePath
            val db = SQLiteDatabase.openDatabase(dbPath, null, SQLiteDatabase.OPEN_READONLY)
            
            val cursor = db.rawQuery(
                "SELECT value FROM catalystLocalStorage WHERE key = ?",
                arrayOf("@kiosk_auto_launch")
            )
            
            val isEnabled = if (cursor.moveToFirst()) {
                val value = cursor.getString(0)
                cursor.close()
                db.close()
                
                // AsyncStorage stores values as JSON strings, so "true" or "false"
                val enabled = value == "true"
                DebugLog.d("BootReceiver", "Auto-launch setting: $enabled (value=$value)")
                enabled
            } else {
                cursor.close()
                db.close()
                
                // If not set, default to false (don't auto-launch unless explicitly enabled)
                DebugLog.d("BootReceiver", "Auto-launch setting not found, defaulting to false")
                false
            }
            
            isEnabled
        } catch (e: Exception) {
            DebugLog.errorProduction("BootReceiver", "Error reading auto-launch setting: ${e.message}")
            // In case of error, don't launch (safer default)
            false
        }
    }
}
