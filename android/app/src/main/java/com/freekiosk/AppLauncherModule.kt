package com.freekiosk

import android.app.usage.UsageStatsManager
import android.content.Intent
import android.content.pm.PackageManager
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.concurrent.Executors

class AppLauncherModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private val executor = Executors.newSingleThreadExecutor()

    override fun getName(): String {
        return "AppLauncherModule"
    }

    @ReactMethod
    fun launchExternalApp(packageName: String, promise: Promise) {
        launchAllowedApp(packageName, null, promise)
    }

    /**
     * Launch one MicroAppStation micro-app directly into its web view. The host package is
     * what Android lock task, the allowlist, and the return overlay track; the exact
     * micro-app intent is recorded so recovery reopens it rather than the host's editor.
     */
    @ReactMethod
    fun launchMicroApp(packageName: String, microAppId: String, promise: Promise) {
        if (!MicroAppCatalog.isHostPackage(packageName) || !MicroAppCatalog.isValidId(microAppId)) {
            promise.reject("INVALID_MICRO_APP", "Not a MicroAppStation micro-app: $packageName/$microAppId")
            return
        }
        launchAllowedApp(packageName, microAppId, promise)
    }

    private fun launchAllowedApp(packageName: String, microAppId: String?, promise: Promise) {
        try {
            // PIN/Settings own the foreground until the route explicitly returns to
            // Kiosk. Reject delayed AppState, API, or timer callbacks that were queued
            // before the administrator entered the protected session.
            if (KioskForegroundGuard.isAdminSessionActive()) {
                promise.reject(
                    "ADMIN_SESSION_ACTIVE",
                    "External app launch is suspended while kiosk administration is open"
                )
                return
            }

            KioskForegroundGuard.restoreConfiguredChildAppVisibility(
                reactApplicationContext,
                packageName,
            )
            val pm = reactApplicationContext.packageManager
            val microAppIntent = microAppId?.let { MicroAppCatalog.launchIntent(packageName, it) }
            if (microAppId != null) {
                // The host silently finishes for an unpublished or deleted micro-app, which
                // would bounce straight back and spin the relaunch watchdog.
                val entry = MicroAppCatalog.find(reactApplicationContext, microAppId)
                if (entry == null || !entry.published || microAppIntent?.resolveActivity(pm) == null) {
                    promise.reject(
                        "MICRO_APP_UNAVAILABLE",
                        "Micro-app $microAppId is missing or unpublished in $packageName"
                    )
                    return
                }
            }
            val launchIntent = if (microAppIntent != null) {
                // CLEAR_TASK: start the micro-app fresh instead of stacking it on another
                // micro-app left in the shared host task.
                Intent(microAppIntent).addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                )
            } else {
                pm.getLaunchIntentForPackage(packageName)?.apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
                }
            }

            if (launchIntent != null) {

                val currentActivity = reactApplicationContext.currentActivity
                val kioskProtectionRequired =
                    KioskForegroundGuard.isProtectionActive(reactApplicationContext)
                var deviceOwnerLockTaskReady = !kioskProtectionRequired

                if (kioskProtectionRequired &&
                    packageName !in KioskForegroundGuard.getUserFacingPackages(
                        reactApplicationContext
                    )) {
                    promise.reject(
                        "APP_NOT_ALLOWED",
                        "The requested app is not on the configured child-facing kiosk allowlist"
                    )
                    return
                }

                if (kioskProtectionRequired &&
                    android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M &&
                    !android.provider.Settings.canDrawOverlays(reactApplicationContext)) {
                    promise.reject(
                        "OVERLAY_PERMISSION_REQUIRED",
                        "The kiosk return control requires Android overlay permission"
                    )
                    return
                }

                KioskSystemUiPolicy.enable(reactApplicationContext)
                WafKioskChromePolicy.enforceForKiosk(reactApplicationContext)

                // Device Owner: always add the selected app to the lock-task allowlist
                // before launch. Do this even while lock task is still entering; gating it
                // on isTaskLocked() left a startup race where Android silently refused the
                // activity and FreeKiosk remained visible.
                if (currentActivity is MainActivity) {
                    val mainActivity = currentActivity
                    try {
                        val activityManager = reactApplicationContext.getSystemService(
                            android.content.Context.ACTIVITY_SERVICE
                        ) as android.app.ActivityManager
                        if (activityManager.lockTaskModeState ==
                            android.app.ActivityManager.LOCK_TASK_MODE_PINNED) {
                            // Screen pinning cannot switch apps. Leave pinned mode so the
                            // selected app can open; the accessibility guard and overlay
                            // continue enforcing the configured kiosk allowlist.
                            mainActivity.stopLockTask()
                            DebugLog.d("AppLauncherModule", "Stopped screen pinning before allowed app launch")
                        }
                    } catch (e: Exception) {
                        DebugLog.d("AppLauncherModule", "Could not inspect screen pinning state: ${e.message}")
                    }

                    DebugLog.d("AppLauncherModule", "Updating lock-task allowlist before launch")
                        
                    try {
                            val dpm = reactApplicationContext.getSystemService(android.content.Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
                            val adminComponent = android.content.ComponentName(reactApplicationContext, DeviceAdminReceiver::class.java)
                            
                            if (dpm.isDeviceOwnerApp(reactApplicationContext.packageName)) {
                                // Update the allowlist first. Feature configuration is an
                                // optional refinement and must never prevent app launch on
                                // OEMs that reject one of the feature flags.
                                val currentWhitelist = dpm.getLockTaskPackages(adminComponent).toMutableList()
                                if (!currentWhitelist.contains(reactApplicationContext.packageName)) {
                                    currentWhitelist.add(reactApplicationContext.packageName)
                                }
                                if (!currentWhitelist.contains(packageName)) {
                                    currentWhitelist.add(packageName)
                                    DebugLog.d("AppLauncherModule", "Added $packageName to Lock Task whitelist")
                                }
                                dpm.setLockTaskPackages(adminComponent, currentWhitelist.distinct().toTypedArray())

                                // Configure lock task features respecting user settings
                                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                                    // Start with GLOBAL_ACTIONS as base (Android default, prevents Samsung audio mute)
                                    var lockTaskFeatures = android.app.admin.DevicePolicyManager.LOCK_TASK_FEATURE_GLOBAL_ACTIONS
                                    
                                    // Read user settings from AsyncStorage
                                    try {
                                        val dbPath = reactApplicationContext.getDatabasePath("RKStorage").absolutePath
                                        val db = android.database.sqlite.SQLiteDatabase.openDatabase(dbPath, null, android.database.sqlite.SQLiteDatabase.OPEN_READONLY)
                                        val cursor = db.rawQuery("SELECT value FROM catalystLocalStorage WHERE key = ?", arrayOf("@kiosk_allow_power_button"))
                                        // Default to true (power menu allowed) - same as storage default
                                        val allowPowerButton = if (cursor.moveToFirst()) cursor.getString(0) == "true" else true
                                        cursor.close()
                                        
                                        val cursor2 = db.rawQuery("SELECT value FROM catalystLocalStorage WHERE key = ?", arrayOf("@kiosk_allow_notifications"))
                                        val allowNotifications = if (cursor2.moveToFirst()) cursor2.getString(0) == "true" else false
                                        cursor2.close()
                                        
                                        val cursor3 = db.rawQuery("SELECT value FROM catalystLocalStorage WHERE key = ?", arrayOf("@kiosk_allow_system_info"))
                                        val allowSystemInfo = if (cursor3.moveToFirst()) cursor3.getString(0) == "true" else false
                                        cursor3.close()
                                        db.close()
                                        
                                        // allowPowerButton=false means admin wants to BLOCK the power menu
                                        if (!allowPowerButton) {
                                            lockTaskFeatures = lockTaskFeatures and android.app.admin.DevicePolicyManager.LOCK_TASK_FEATURE_GLOBAL_ACTIONS.inv()
                                        }
                                        if (allowSystemInfo) {
                                            lockTaskFeatures = lockTaskFeatures or android.app.admin.DevicePolicyManager.LOCK_TASK_FEATURE_SYSTEM_INFO
                                        }
                                        if (allowNotifications) {
                                            lockTaskFeatures = lockTaskFeatures or android.app.admin.DevicePolicyManager.LOCK_TASK_FEATURE_NOTIFICATIONS
                                            // Android requires HOME when NOTIFICATIONS is enabled — without it
                                            // setLockTaskFeatures() throws and aborts the whole feature update,
                                            // leaving the notification panel disabled in multi-app mode (#191).
                                            lockTaskFeatures = lockTaskFeatures or android.app.admin.DevicePolicyManager.LOCK_TASK_FEATURE_HOME
                                        }
                                        // #208 — Preserve the system keyguard when re-applying features
                                        // to launch a whitelisted app in multi-app mode. Without this, the
                                        // KEYGUARD flag set at lock-task entry would be dropped here and the
                                        // native screen-lock would stop prompting on screen off/on again.
                                        // Same opt-in gate as MainActivity/KioskModule.
                                        val screenLockCompat = BootReceiver.readScreenLockCompatFlag(reactApplicationContext) &&
                                            BootReceiver.isDeviceSecure(reactApplicationContext)
                                        if (screenLockCompat) {
                                            lockTaskFeatures = lockTaskFeatures or android.app.admin.DevicePolicyManager.LOCK_TASK_FEATURE_KEYGUARD
                                        }
                                        DebugLog.d("AppLauncherModule", "Lock task features: blockPowerButton=${!allowPowerButton}, notifications=$allowNotifications, systemInfo=$allowSystemInfo, keyguard=$screenLockCompat (flags=$lockTaskFeatures)")
                                    } catch (e: Exception) {
                                        DebugLog.d("AppLauncherModule", "Could not read settings, using GLOBAL_ACTIONS default: ${e.message}")
                                    }

                                    // Strict Android Enterprise kiosk surface: no Home,
                                    // Overview, notifications, system info, keyguard, or
                                    // global actions while a child-facing app is active.
                                    lockTaskFeatures = android.app.admin.DevicePolicyManager.LOCK_TASK_FEATURE_NONE
                                    dpm.setLockTaskFeatures(adminComponent, lockTaskFeatures)
                                    DebugLog.d("AppLauncherModule", "Lock task features applied before launching external app")
                                }
                                dpm.setStatusBarDisabled(adminComponent, true)

                                // Never launch an allowed app into an unrestricted task.
                                // MainActivity is foreground while the grid is visible, so
                                // this is the reliable point to enter full Device Owner lock
                                // task before Android creates the external app's task.
                                val activityManager = reactApplicationContext.getSystemService(
                                    android.content.Context.ACTIVITY_SERVICE
                                ) as android.app.ActivityManager
                                if (activityManager.lockTaskModeState !=
                                    android.app.ActivityManager.LOCK_TASK_MODE_LOCKED) {
                                    try {
                                        mainActivity.startLockTask()
                                    } catch (e: Exception) {
                                        DebugLog.errorProduction(
                                            "AppLauncherModule",
                                            "Could not enter strict lock task before app launch: ${e.message}"
                                        )
                                    }
                                }
                                deviceOwnerLockTaskReady = activityManager.lockTaskModeState ==
                                    android.app.ActivityManager.LOCK_TASK_MODE_LOCKED
                            }
                    } catch (e: Exception) {
                        DebugLog.errorProduction("AppLauncherModule", "Failed to update lock task config: ${e.message}")
                    }

                    // Verify the security boundary independently of the optional UI
                    // policy calls above. Some OEMs reject a status-bar refinement but
                    // still support standard Device Owner lock task.
                    try {
                        val dpm = reactApplicationContext.getSystemService(
                            android.content.Context.DEVICE_POLICY_SERVICE
                        ) as android.app.admin.DevicePolicyManager
                        if (dpm.isDeviceOwnerApp(reactApplicationContext.packageName)) {
                            val activityManager = reactApplicationContext.getSystemService(
                                android.content.Context.ACTIVITY_SERVICE
                            ) as android.app.ActivityManager
                            if (activityManager.lockTaskModeState !=
                                android.app.ActivityManager.LOCK_TASK_MODE_LOCKED) {
                                mainActivity.startLockTask()
                            }
                            deviceOwnerLockTaskReady = activityManager.lockTaskModeState ==
                                android.app.ActivityManager.LOCK_TASK_MODE_LOCKED
                        } else {
                            // Multi-app child kiosks cannot securely suppress Android's
                            // taskbar/navigation gestures in ordinary app mode. Fail
                            // closed instead of opening the selected app unrestricted.
                            deviceOwnerLockTaskReady = false
                        }
                    } catch (e: Exception) {
                        DebugLog.errorProduction(
                            "AppLauncherModule",
                            "Strict lock-task verification failed: ${e.message}"
                        )
                        deviceOwnerLockTaskReady = false
                    }
                }

                if (!deviceOwnerLockTaskReady) {
                    KioskForegroundGuard.clearActiveKioskPackage(reactApplicationContext)
                    promise.reject(
                        "LOCK_TASK_NOT_ACTIVE",
                        "Strict kiosk lock task could not be activated; the app was not launched"
                    )
                    return
                }

                // Authorize only after the strict security boundary has been verified.
                // The selection is process-scoped and cannot survive into a stale reboot loop.
                KioskForegroundGuard.authorizeKioskLaunch(
                    reactApplicationContext,
                    packageName,
                    microAppIntent,
                )
                MainActivity.blockAutoRelaunch = false
                KioskForegroundGuard.noteAllowedForeground(reactApplicationContext, packageName)
                BlockingOverlayManager.getInstance(reactApplicationContext)
                    .setForegroundPackage(packageName)

                // Start the return/admin overlay synchronously while FreeKiosk is still in
                // the foreground. This is deliberately after strict lock verification and
                // session authorization, but before the child app launch: React Native may
                // pause its JS thread as soon as the external task takes focus.
                startSecureExternalAppOverlay(packageName)

                // Use the application context with NEW_TASK. This creates/raises the
                // external app's own task on vendor Android builds; launching from
                // MainActivity can be folded back into the FreeKiosk task and leave the
                // kiosk grid visible.
                KioskTaskLauncher.launch(reactApplicationContext, launchIntent)
                DebugLog.d("AppLauncherModule", "External app launched: $packageName")

                // Send event to React Native
                sendEvent("onAppLaunched", null)
                
                // Broadcast for ADB monitoring - verify app is in foreground before broadcasting
                verifyAndBroadcastAppLaunched(packageName)

                promise.resolve(true)
            } else {
                DebugLog.errorProduction("AppLauncherModule", "App not found: $packageName")
                promise.reject("APP_NOT_FOUND", "Application with package name $packageName is not installed")
            }
        } catch (e: Exception) {
            KioskForegroundGuard.clearActiveKioskPackage(reactApplicationContext)
            DebugLog.errorProduction("AppLauncherModule", "Failed to launch app: ${e.message}")
            promise.reject("ERROR_LAUNCH_APP", "Failed to launch app: ${e.message}")
        }
    }

    @ReactMethod
    fun isAppInstalled(packageName: String, promise: Promise) {
        try {
            KioskForegroundGuard.restoreConfiguredChildAppVisibility(
                reactApplicationContext,
                packageName,
            )
            val pm = reactApplicationContext.packageManager
            pm.getPackageInfo(packageName, 0)
            promise.resolve(true)
        } catch (e: PackageManager.NameNotFoundException) {
            promise.resolve(false)
        } catch (e: Exception) {
            promise.reject("ERROR_CHECK_APP", "Failed to check if app is installed: ${e.message}")
        }
    }

    @ReactMethod
    fun getInstalledApps(promise: Promise) {
        // Run on background thread to avoid ANR on devices with many apps
        executor.execute {
            try {
                val pm = reactApplicationContext.packageManager
                val packages = pm.getInstalledApplications(PackageManager.GET_META_DATA)

                val appList = mutableListOf<WritableMap>()
                for (packageInfo in packages) {
                    // Filter: only apps with launch intents (launchable apps)
                    if (pm.getLaunchIntentForPackage(packageInfo.packageName) != null) {
                        val appName = pm.getApplicationLabel(packageInfo).toString()
                        val appData = Arguments.createMap()
                        appData.putString("packageName", packageInfo.packageName)
                        appData.putString("appName", appName)
                        appList.add(appData)
                    }
                }

                // Sort by app name
                val sortedList = appList.sortedBy { it.getString("appName") }

                // Convert to WritableArray
                val resultArray = Arguments.createArray()
                for (app in sortedList) {
                    resultArray.pushMap(app)
                }

                promise.resolve(resultArray)
            } catch (e: Exception) {
                DebugLog.errorProduction("AppLauncherModule", "Failed to get installed apps: ${e.message}")
                promise.reject("ERROR_GET_APPS", "Failed to get installed apps: ${e.message}")
            }
        }
    }

    /**
     * Returns all installed apps including non-UI packages (services, VPNs, etc.).
     * User-installed apps without a launcher activity are included so they can be
     * whitelisted in lock task mode (fixes #112 - e.g. gnirehtet VPN).
     * Each entry includes a hasLauncherActivity flag for UI differentiation.
     */
    @ReactMethod
    fun getAllInstalledApps(promise: Promise) {
        executor.execute {
            try {
                val pm = reactApplicationContext.packageManager
                val packages = pm.getInstalledApplications(PackageManager.GET_META_DATA)

                val appList = mutableListOf<WritableMap>()
                for (packageInfo in packages) {
                    val hasLauncher = pm.getLaunchIntentForPackage(packageInfo.packageName) != null
                    val isSystemApp = (packageInfo.flags and android.content.pm.ApplicationInfo.FLAG_SYSTEM) != 0

                    // Include apps that have a launcher activity OR are user-installed (non-system)
                    if (hasLauncher || !isSystemApp) {
                        val appName = pm.getApplicationLabel(packageInfo).toString()
                        val appData = Arguments.createMap()
                        appData.putString("packageName", packageInfo.packageName)
                        appData.putString("appName", appName)
                        appData.putBoolean("hasLauncherActivity", hasLauncher)
                        appList.add(appData)
                    }
                }

                // Sort by app name
                val sortedList = appList.sortedBy { it.getString("appName") }

                val resultArray = Arguments.createArray()
                for (app in sortedList) {
                    resultArray.pushMap(app)
                }

                promise.resolve(resultArray)
            } catch (e: Exception) {
                DebugLog.errorProduction("AppLauncherModule", "Failed to get all installed apps: ${e.message}")
                promise.reject("ERROR_GET_ALL_APPS", "Failed to get all installed apps: ${e.message}")
            }
        }
    }

    @ReactMethod
    fun getPackageLabel(packageName: String, promise: Promise) {
        try {
            val pm = reactApplicationContext.packageManager
            val appInfo = pm.getApplicationInfo(packageName, 0)
            val appName = pm.getApplicationLabel(appInfo).toString()
            promise.resolve(appName)
        } catch (e: PackageManager.NameNotFoundException) {
            promise.reject("APP_NOT_FOUND", "Application with package name $packageName is not installed")
        } catch (e: Exception) {
            promise.reject("ERROR_GET_LABEL", "Failed to get package label: ${e.message}")
        }
    }

    @ReactMethod
    fun getAppIcon(packageName: String, size: Int, promise: Promise) {
        executor.execute {
            try {
                val pm = reactApplicationContext.packageManager
                val appInfo = pm.getApplicationInfo(packageName, 0)
                val drawable = pm.getApplicationIcon(appInfo)
                
                val targetSize = if (size > 0) size else 96
                val bitmap = android.graphics.Bitmap.createBitmap(targetSize, targetSize, android.graphics.Bitmap.Config.ARGB_8888)
                val canvas = android.graphics.Canvas(bitmap)
                drawable.setBounds(0, 0, targetSize, targetSize)
                drawable.draw(canvas)
                
                val stream = java.io.ByteArrayOutputStream()
                bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, stream)
                bitmap.recycle()
                
                val base64 = android.util.Base64.encodeToString(stream.toByteArray(), android.util.Base64.NO_WRAP)
                promise.resolve("data:image/png;base64,$base64")
            } catch (e: PackageManager.NameNotFoundException) {
                promise.reject("APP_NOT_FOUND", "Application with package name $packageName is not installed")
            } catch (e: Exception) {
                promise.reject("ERROR_GET_ICON", "Failed to get app icon: ${e.message}")
            }
        }
    }

    /** Micro-apps offered by MicroAppStation; empty when the host is not installed. */
    @ReactMethod
    fun getMicroApps(promise: Promise) {
        executor.execute {
            try {
                val result = Arguments.createArray()
                MicroAppCatalog.list(reactApplicationContext)
                    .sortedBy { it.name.lowercase() }
                    .forEach { entry ->
                        result.pushMap(Arguments.createMap().apply {
                            putString("packageName", MicroAppCatalog.HOST_PACKAGE)
                            putString("microAppId", entry.id)
                            putString("name", entry.name)
                            putBoolean("published", entry.published)
                        })
                    }
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("ERROR_GET_MICRO_APPS", "Failed to list micro-apps: ${e.message}")
            }
        }
    }

    @ReactMethod
    fun getMicroAppIcon(packageName: String, microAppId: String, size: Int, promise: Promise) {
        executor.execute {
            val icon = if (MicroAppCatalog.isHostPackage(packageName)) {
                MicroAppCatalog.iconDataUri(reactApplicationContext, microAppId, size)
            } else {
                null
            }
            if (icon != null) {
                promise.resolve(icon)
            } else {
                promise.reject("ICON_NOT_FOUND", "No icon for micro-app $microAppId")
            }
        }
    }

    /**
     * Verify external app is in foreground before broadcasting EXTERNAL_APP_LAUNCHED
     * Retries up to 10 times with 500ms delay to ensure app has time to start
     */
    private fun verifyAndBroadcastAppLaunched(packageName: String) {
        val maxRetries = 10
        val retryDelayMs = 500L
        var retryCount = 0
        
        fun checkAndBroadcast() {
            try {
                // Get foreground app using UsageStatsManager (requires PACKAGE_USAGE_STATS permission)
                val topPackage = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP_MR1) {
                    val usageStatsManager = reactApplicationContext.getSystemService(android.content.Context.USAGE_STATS_SERVICE) as? android.app.usage.UsageStatsManager
                    if (usageStatsManager != null) {
                        val currentTime = System.currentTimeMillis()
                        val stats = usageStatsManager.queryUsageStats(
                            android.app.usage.UsageStatsManager.INTERVAL_BEST,
                            currentTime - 5000,
                            currentTime
                        )
                        stats?.maxByOrNull { it.lastTimeUsed }?.packageName
                    } else null
                } else {
                    // Fallback for older Android
                    @Suppress("DEPRECATION")
                    val am = reactApplicationContext.getSystemService(android.content.Context.ACTIVITY_SERVICE) as? android.app.ActivityManager
                    @Suppress("DEPRECATION")
                    am?.getRunningTasks(1)?.firstOrNull()?.topActivity?.packageName
                }
                
                if (topPackage == packageName) {
                    // App is in foreground, broadcast success
                    reactApplicationContext.sendBroadcast(Intent("com.freekiosk.EXTERNAL_APP_LAUNCHED").apply {
                        putExtra("package_name", packageName)
                        putExtra("verified", true)
                    })
                    android.util.Log.i("FreeKiosk-ADB", "EXTERNAL_APP_LAUNCHED: $packageName (verified in foreground)")
                } else if (retryCount < maxRetries) {
                    // App not yet in foreground, retry
                    retryCount++
                    android.util.Log.d("FreeKiosk-ADB", "Waiting for $packageName to be in foreground (attempt $retryCount/$maxRetries, current: $topPackage)")
                    android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({ checkAndBroadcast() }, retryDelayMs)
                } else {
                    // Max retries reached, broadcast anyway but log warning
                    reactApplicationContext.sendBroadcast(Intent("com.freekiosk.EXTERNAL_APP_LAUNCHED").apply {
                        putExtra("package_name", packageName)
                        putExtra("verified", false)
                    })
                    android.util.Log.w("FreeKiosk-ADB", "EXTERNAL_APP_LAUNCHED: $packageName (NOT verified - timeout after ${maxRetries * retryDelayMs}ms, top: $topPackage)")
                }
            } catch (e: Exception) {
                android.util.Log.e("FreeKiosk-ADB", "Error checking foreground for EXTERNAL_APP_LAUNCHED: ${e.message}")
                // Broadcast anyway on error
                try {
                    reactApplicationContext.sendBroadcast(Intent("com.freekiosk.EXTERNAL_APP_LAUNCHED").apply {
                        putExtra("package_name", packageName)
                        putExtra("verified", false)
                        putExtra("error", e.message)
                    })
                    android.util.Log.i("FreeKiosk-ADB", "EXTERNAL_APP_LAUNCHED: $packageName (fallback - error during verification)")
                } catch (ex: Exception) {
                    android.util.Log.e("FreeKiosk-ADB", "Failed to broadcast EXTERNAL_APP_LAUNCHED: ${ex.message}")
                }
            }
        }
        
        // Start verification after initial delay
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({ checkAndBroadcast() }, 500)
    }

    private fun sendEvent(eventName: String, params: WritableMap?) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    private fun startSecureExternalAppOverlay(packageName: String) {
        check(
            KioskForegroundGuard.canRelaunchActiveExternalPackage(
                reactApplicationContext,
                packageName
            )
        ) { "External-app overlay requested outside strict lock task" }

        val tapCount = readStorageValue("@kiosk_return_tap_count", "5")
            .toIntOrNull()?.coerceIn(2, 20) ?: 5
        val tapTimeout = readStorageValue("@kiosk_return_tap_timeout", "1500")
            .toLongOrNull()?.coerceIn(500L, 5000L) ?: 1500L
        val returnMode = readStorageValue("@kiosk_return_mode", "button")
        val buttonPosition =
            readStorageValue("@kiosk_return_button_position", "bottom-right")
        val homeButtonEnabled =
            readStorageValue("@kiosk_home_button_enabled", "true") == "true"
        val homeButtonPosition =
            readStorageValue("@kiosk_home_button_position", "bottom-left")
        val autoRelaunch =
            readStorageValue("@kiosk_auto_relaunch_app", "true") == "true"
        val notificationsEnabled =
            readStorageValue("@kiosk_allow_notifications", "false") == "true"

        val serviceIntent = Intent(
            reactApplicationContext,
            OverlayService::class.java
        ).apply {
            putExtra("REQUIRED_TAPS", tapCount)
            putExtra("TAP_TIMEOUT", tapTimeout)
            putExtra("RETURN_MODE", returnMode)
            putExtra("BUTTON_POSITION", buttonPosition)
            putExtra("KIOSK_HOME_BUTTON_ENABLED", homeButtonEnabled)
            putExtra("KIOSK_HOME_BUTTON_POSITION", homeButtonPosition)
            putExtra("LOCKED_PACKAGE", packageName)
            putExtra("AUTO_RELAUNCH", autoRelaunch)
            putExtra("NFC_ENABLED", notificationsEnabled)
        }

        reactApplicationContext.startService(serviceIntent)
        DebugLog.d(
            "AppLauncherModule",
            "Secure overlay started for $packageName ($returnMode/$buttonPosition)"
        )
    }

    private fun readStorageValue(key: String, defaultValue: String): String {
        var database: android.database.sqlite.SQLiteDatabase? = null
        return try {
            database = android.database.sqlite.SQLiteDatabase.openDatabase(
                reactApplicationContext.getDatabasePath("RKStorage").absolutePath,
                null,
                android.database.sqlite.SQLiteDatabase.OPEN_READONLY
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

    /**
     * Launch all managed apps that have launchOnBoot=true.
     * Called from JS when entering kiosk mode (not just at system boot).
     */
    @ReactMethod
    fun launchBootApps(promise: Promise) {
        if (KioskForegroundGuard.isProtectionActive(reactApplicationContext)) {
            // Launching an Activity is never a background operation on Android. In
            // child-facing kiosk mode it can surface over the selected app, so defer
            // all app starts to an explicit grid selection.
            DebugLog.d("AppLauncherModule", "Skipping launch-on-boot apps while kiosk protection is active")
            promise.resolve(0)
            return
        }

        executor.execute {
            try {
                val apps = getManagedAppsFiltered { it.optBoolean("launchOnBoot", false) }
                if (apps.isEmpty()) {
                    DebugLog.d("AppLauncherModule", "No boot apps to launch")
                    promise.resolve(0)
                    return@execute
                }
                
                val pm = reactApplicationContext.packageManager
                var launchedCount = 0
                for (packageName in apps) {
                    try {
                        pm.getPackageInfo(packageName, 0)
                        val launchIntent = pm.getLaunchIntentForPackage(packageName)
                        if (launchIntent != null) {
                            launchIntent.addFlags(
                                Intent.FLAG_ACTIVITY_NEW_TASK or
                                Intent.FLAG_ACTIVITY_NO_ANIMATION
                            )
                            reactApplicationContext.startActivity(launchIntent)
                            launchedCount++
                            DebugLog.d("AppLauncherModule", "Boot app launched: $packageName")
                            Thread.sleep(800) // Delay to let the app initialize
                        }
                    } catch (e: android.content.pm.PackageManager.NameNotFoundException) {
                        DebugLog.d("AppLauncherModule", "Boot app not installed: $packageName")
                    } catch (e: Exception) {
                        DebugLog.errorProduction("AppLauncherModule", "Failed to launch boot app $packageName: ${e.message}")
                    }
                }
                
                // Do NOT bring FreeKiosk to front here. loadSettings() will call
                // launchExternalApp() right after, which properly starts OverlayService
                // and launches the primary app. Bringing FreeKiosk back in between would
                // trigger MainActivity.onResume() fast-path, causing a double-launch loop
                // when launchOnBoot is enabled (#launchOnBoot-loop).
                promise.resolve(launchedCount)
            } catch (e: Exception) {
                promise.reject("ERROR_LAUNCH_BOOT", "Failed to launch boot apps: ${e.message}")
            }
        }
    }

    /**
     * Start the BackgroundAppMonitorService for keep-alive apps.
     * Called from JS when entering kiosk mode.
     */
    @ReactMethod
    fun startBackgroundMonitor(promise: Promise) {
        try {
            if (KioskForegroundGuard.isProtectionActive(reactApplicationContext)) {
                reactApplicationContext.stopService(
                    Intent(reactApplicationContext, BackgroundAppMonitorService::class.java)
                )
                DebugLog.d("AppLauncherModule", "Visible keep-alive relaunch disabled in kiosk mode")
                promise.resolve(false)
                return
            }

            // Pre-check: only start the foreground service if there are keep-alive apps
            // This avoids the ForegroundServiceDidNotStartInTimeException crash
            val keepAliveApps = getManagedAppsFiltered { it.optBoolean("keepAlive", false) }
            if (keepAliveApps.isEmpty()) {
                DebugLog.d("AppLauncherModule", "No keep-alive apps configured, skipping BackgroundAppMonitorService")
                promise.resolve(false)
                return
            }

            val serviceIntent = Intent(reactApplicationContext, BackgroundAppMonitorService::class.java)
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                reactApplicationContext.startForegroundService(serviceIntent)
            } else {
                reactApplicationContext.startService(serviceIntent)
            }
            DebugLog.d("AppLauncherModule", "BackgroundAppMonitorService started from JS for ${keepAliveApps.size} keep-alive app(s)")
            promise.resolve(true)
        } catch (e: Exception) {
            DebugLog.errorProduction("AppLauncherModule", "Failed to start BackgroundAppMonitorService: ${e.message}")
            promise.reject("ERROR_START_MONITOR", "Failed to start background monitor: ${e.message}")
        }
    }

    /**
     * Stop the BackgroundAppMonitorService.
     */
    @ReactMethod
    fun stopBackgroundMonitor(promise: Promise) {
        try {
            val serviceIntent = Intent(reactApplicationContext, BackgroundAppMonitorService::class.java)
            reactApplicationContext.stopService(serviceIntent)
            DebugLog.d("AppLauncherModule", "BackgroundAppMonitorService stopped from JS")
            promise.resolve(true)
        } catch (e: Exception) {
            DebugLog.errorProduction("AppLauncherModule", "Failed to stop BackgroundAppMonitorService: ${e.message}")
            promise.reject("ERROR_STOP_MONITOR", "Failed to stop background monitor: ${e.message}")
        }
    }

    /**
     * Read managed apps from AsyncStorage with a filter predicate.
     */
    private fun getManagedAppsFiltered(predicate: (org.json.JSONObject) -> Boolean): List<String> {
        return try {
            val dbPath = reactApplicationContext.getDatabasePath("RKStorage").absolutePath
            val db = android.database.sqlite.SQLiteDatabase.openDatabase(dbPath, null, android.database.sqlite.SQLiteDatabase.OPEN_READONLY)
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
            DebugLog.d("AppLauncherModule", "Could not read managed apps: ${e.message}")
            emptyList()
        }
    }

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        executor.shutdown()
    }
}
