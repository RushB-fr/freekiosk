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
                                    var lockTaskFeatures = android.app.admin.DevicePolicyManager.LOCK_TASK_FEATURE_NONE
                                    
                                    // Read user settings from AsyncStorage
                                    try {
                                        val dbPath = reactApplicationContext.getDatabasePath("RKStorage").absolutePath
                                        val db = android.database.sqlite.SQLiteDatabase.openDatabase(dbPath, null, android.database.sqlite.SQLiteDatabase.OPEN_READONLY)
                                        val cursor = db.rawQuery("SELECT value FROM catalystLocalStorage WHERE key = ?", arrayOf("@kiosk_allow_power_button"))
                                        val allowPowerButton = if (cursor.moveToFirst()) cursor.getString(0) == "true" else false
                                        cursor.close()
                                        
                                        val cursor2 = db.rawQuery("SELECT value FROM catalystLocalStorage WHERE key = ?", arrayOf("@kiosk_allow_notifications"))
                                        val allowNotifications = if (cursor2.moveToFirst()) cursor2.getString(0) == "true" else false
                                        cursor2.close()
                                        
                                        val cursor3 = db.rawQuery("SELECT value FROM catalystLocalStorage WHERE key = ?", arrayOf("@kiosk_allow_system_info"))
                                        val allowSystemInfo = if (cursor3.moveToFirst()) cursor3.getString(0) == "true" else false
                                        cursor3.close()
                                        db.close()
                                        
                                        if (allowSystemInfo) {
                                            lockTaskFeatures = lockTaskFeatures or android.app.admin.DevicePolicyManager.LOCK_TASK_FEATURE_SYSTEM_INFO
                                        }
                                        if (allowPowerButton) {
                                            lockTaskFeatures = lockTaskFeatures or android.app.admin.DevicePolicyManager.LOCK_TASK_FEATURE_GLOBAL_ACTIONS
                                        }
                                        if (allowNotifications) {
                                            lockTaskFeatures = lockTaskFeatures or android.app.admin.DevicePolicyManager.LOCK_TASK_FEATURE_NOTIFICATIONS
                                        }
                                        DebugLog.d("AppLauncherModule", "Lock task features: powerButton=$allowPowerButton, notifications=$allowNotifications, systemInfo=$allowSystemInfo (flags=$lockTaskFeatures)")
                                    } catch (e: Exception) {
                                        DebugLog.d("AppLauncherModule", "Could not read settings, using LOCK_TASK_FEATURE_NONE: ${e.message}")
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

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        executor.shutdown()
    }
}
