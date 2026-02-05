package com.freekiosk

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
                                // S'assurer que LOCK_TASK_FEATURE_NONE est appliqué (bloque navigation)
                                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                                    dpm.setLockTaskFeatures(
                                        adminComponent,
                                        android.app.admin.DevicePolicyManager.LOCK_TASK_FEATURE_NONE
                                    )
                                    DebugLog.d("AppLauncherModule", "Lock task features set to NONE before launching external app")
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
                
                // Broadcast for ADB monitoring (same as ADB auto_start behavior)
                // Send after short delay to let app start
                android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                    try {
                        reactApplicationContext.sendBroadcast(Intent("com.freekiosk.EXTERNAL_APP_LAUNCHED").apply {
                            putExtra("package_name", packageName)
                        })
                        DebugLog.d("AppLauncherModule", "Broadcasted EXTERNAL_APP_LAUNCHED: $packageName")
                    } catch (e: Exception) {
                        DebugLog.d("AppLauncherModule", "Failed to broadcast: ${e.message}")
                    }
                }, 1000)

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
