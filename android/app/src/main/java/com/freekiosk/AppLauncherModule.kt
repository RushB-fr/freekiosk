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
        try {
            val pm = reactApplicationContext.packageManager
            val launchIntent = pm.getLaunchIntentForPackage(packageName)

            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)

                val currentActivity = reactApplicationContext.currentActivity
                
                // Si Lock Task est activé, s'assurer que l'app est dans la whitelist AVANT de lancer
                if (currentActivity != null && currentActivity is MainActivity) {
                    val mainActivity = currentActivity as MainActivity
                    if (mainActivity.isTaskLocked()) {
                        DebugLog.d("AppLauncherModule", "In Lock Task mode - updating whitelist and features before launch")
                        
                        try {
                            val dpm = reactApplicationContext.getSystemService(android.content.Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
                            val adminComponent = android.content.ComponentName(reactApplicationContext, DeviceAdminReceiver::class.java)
                            
                            if (dpm.isDeviceOwnerApp(reactApplicationContext.packageName)) {
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
                                        }
                                        DebugLog.d("AppLauncherModule", "Lock task features: blockPowerButton=${!allowPowerButton}, notifications=$allowNotifications, systemInfo=$allowSystemInfo (flags=$lockTaskFeatures)")
                                    } catch (e: Exception) {
                                        DebugLog.d("AppLauncherModule", "Could not read settings, using GLOBAL_ACTIONS default: ${e.message}")
                                    }
                                    
                                    dpm.setLockTaskFeatures(adminComponent, lockTaskFeatures)
                                    DebugLog.d("AppLauncherModule", "Lock task features applied before launching external app")
                                }
                                
                                // Mettre à jour la whitelist pour inclure cette app
                                val currentWhitelist = dpm.getLockTaskPackages(adminComponent).toMutableList()
                                if (!currentWhitelist.contains(packageName)) {
                                    currentWhitelist.add(packageName)
                                    dpm.setLockTaskPackages(adminComponent, currentWhitelist.toTypedArray())
                                    DebugLog.d("AppLauncherModule", "Added $packageName to Lock Task whitelist")
                                }
                            }
                        } catch (e: Exception) {
                            DebugLog.errorProduction("AppLauncherModule", "Failed to update lock task config: ${e.message}")
                        }
                    }
                }

                // Lancer l'app via le context
                reactApplicationContext.startActivity(launchIntent)
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
            DebugLog.errorProduction("AppLauncherModule", "Failed to launch app: ${e.message}")
            promise.reject("ERROR_LAUNCH_APP", "Failed to launch app: ${e.message}")
        }
    }

    @ReactMethod
    fun isAppInstalled(packageName: String, promise: Promise) {
        try {
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

    /**
     * Launch all managed apps that have launchOnBoot=true.
     * Called from JS when entering kiosk mode (not just at system boot).
     */
    @ReactMethod
    fun launchBootApps(promise: Promise) {
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
                
                // Bring FreeKiosk back to the foreground after launching all boot apps
                if (launchedCount > 0) {
                    try {
                        Thread.sleep(500)
                        val bringBackIntent = Intent(reactApplicationContext, MainActivity::class.java)
                        bringBackIntent.addFlags(
                            Intent.FLAG_ACTIVITY_NEW_TASK or
                            Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                            Intent.FLAG_ACTIVITY_SINGLE_TOP or
                            Intent.FLAG_ACTIVITY_NO_ANIMATION
                        )
                        reactApplicationContext.startActivity(bringBackIntent)
                        DebugLog.d("AppLauncherModule", "FreeKiosk brought back to front after $launchedCount boot app(s)")
                    } catch (e: Exception) {
                        DebugLog.d("AppLauncherModule", "Failed to bring FreeKiosk to front: ${e.message}")
                    }
                }
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
