package com.freekiosk

import android.app.ActivityManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.os.SystemClock
import android.view.KeyEvent
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import android.app.Instrumentation

class KioskModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "KioskModule"
    }

    @ReactMethod
    fun exitKioskMode(promise: Promise) {
        try {
            val activity = reactApplicationContext.currentActivity
            if (activity != null && activity is MainActivity) {
                activity.runOnUiThread {
                    try {
                        activity.disableKioskRestrictions()
                        activity.stopLockTask()
                        activity.finish()
                        promise.resolve(true)
                    } catch (e: Exception) {
                        promise.reject("ERROR", "Failed to exit kiosk mode: ${e.message}")
                    }
                }
            } else {
                promise.reject("ERROR", "Activity not available")
            }
        } catch (e: Exception) {
            promise.reject("ERROR", "Failed to exit kiosk mode: ${e.message}")
        }
    }

    @ReactMethod
    fun startLockTask(externalAppPackage: String?, allowPowerButton: Boolean, promise: Promise) {
        try {
            val activity = reactApplicationContext.currentActivity
            if (activity != null && activity is MainActivity) {
                activity.runOnUiThread {
                    try {
                        val dpm = reactApplicationContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
                        val adminComponent = ComponentName(reactApplicationContext, DeviceAdminReceiver::class.java)

                        if (dpm.isDeviceOwnerApp(reactApplicationContext.packageName)) {
                            // Build whitelist: FreeKiosk + external app if provided
                            val whitelist = mutableListOf(reactApplicationContext.packageName)
                            
                            // Use the passed parameter directly (more reliable than SharedPreferences timing)
                            if (!externalAppPackage.isNullOrEmpty()) {
                                try {
                                    reactApplicationContext.packageManager.getPackageInfo(externalAppPackage, 0)
                                    whitelist.add(externalAppPackage)
                                    android.util.Log.d("KioskModule", "External app added to whitelist: $externalAppPackage")
                                } catch (e: Exception) {
                                    android.util.Log.e("KioskModule", "External app not found: $externalAppPackage")
                                }
                            }
                            
                            // Configure Lock Task features based on allowPowerButton setting
                            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                                val lockTaskFeatures = if (allowPowerButton) {
                                    // Allow only Global Actions (power menu) for power button functionality
                                    DevicePolicyManager.LOCK_TASK_FEATURE_GLOBAL_ACTIONS
                                } else {
                                    // Full lockdown - no system features allowed
                                    DevicePolicyManager.LOCK_TASK_FEATURE_NONE
                                }
                                dpm.setLockTaskFeatures(adminComponent, lockTaskFeatures)
                                android.util.Log.d("KioskModule", "Lock task features set to ${if (allowPowerButton) "GLOBAL_ACTIONS (power button enabled)" else "NONE (full lockdown)"}")
                            }
                            
                            dpm.setLockTaskPackages(adminComponent, whitelist.toTypedArray())
                            activity.startLockTask()
                            android.util.Log.d("KioskModule", "Full lock task started (Device Owner) with whitelist: $whitelist")
                        } else {
                            activity.startLockTask()
                            android.util.Log.d("KioskModule", "Screen pinning started")
                        }
                        promise.resolve(true)
                    } catch (e: Exception) {
                        android.util.Log.e("KioskModule", "Failed to start lock task: ${e.message}")
                        promise.reject("ERROR", "Failed to start lock task: ${e.message}")
                    }
                }
            } else {
                promise.reject("ERROR", "Activity not available")
            }
        } catch (e: Exception) {
            promise.reject("ERROR", "Failed to start lock task: ${e.message}")
        }
    }

    @ReactMethod
    fun stopLockTask(promise: Promise) {
        try {
            val activity = reactApplicationContext.currentActivity
            if (activity != null && activity is MainActivity) {
                activity.runOnUiThread {
                    try {
                        activity.stopLockTask()
                        android.util.Log.d("KioskModule", "Lock task stopped")
                        promise.resolve(true)
                    } catch (e: Exception) {
                        promise.reject("ERROR", "Failed to stop lock task: ${e.message}")
                    }
                }
            } else {
                promise.reject("ERROR", "Activity not available")
            }
        } catch (e: Exception) {
            promise.reject("ERROR", "Failed to stop lock task: ${e.message}")
        }
    }

    @ReactMethod
    fun isInLockTaskMode(promise: Promise) {
        try {
            val activityManager = reactApplicationContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val lockTaskMode = activityManager.lockTaskModeState
            val isLocked = lockTaskMode != ActivityManager.LOCK_TASK_MODE_NONE
            promise.resolve(isLocked)
        } catch (e: Exception) {
            promise.reject("ERROR", "Failed to check lock task mode: ${e.message}")
        }
    }

    @ReactMethod
    fun getLockTaskModeState(promise: Promise) {
        try {
            val activityManager = reactApplicationContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val state = activityManager.lockTaskModeState
            promise.resolve(state)
        } catch (e: Exception) {
            promise.reject("ERROR", "Failed to get lock task state: ${e.message}")
        }
    }

    @ReactMethod
    fun enableAutoLaunch(promise: Promise) {
        try {
            val componentName = ComponentName(reactApplicationContext, BootReceiver::class.java)
            reactApplicationContext.packageManager.setComponentEnabledSetting(
                componentName,
                PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                PackageManager.DONT_KILL_APP
            )
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR_ENABLE_AUTO_LAUNCH", e)
        }
    }

    @ReactMethod
    fun disableAutoLaunch(promise: Promise) {
        try {
            val componentName = ComponentName(reactApplicationContext, BootReceiver::class.java)
            reactApplicationContext.packageManager.setComponentEnabledSetting(
                componentName,
                PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                PackageManager.DONT_KILL_APP
            )
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR_DISABLE_AUTO_LAUNCH", e)
        }
    }

    @ReactMethod
    fun isDeviceOwner(promise: Promise) {
        try {
            val dpm = reactApplicationContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val isOwner = dpm.isDeviceOwnerApp(reactApplicationContext.packageName)
            promise.resolve(isOwner)
        } catch (e: Exception) {
            promise.reject("ERROR", "Failed to check device owner status: ${e.message}")
        }
    }

    @ReactMethod
    fun shouldBlockAutoRelaunch(promise: Promise) {
        // Juste retourner la valeur, ne pas reset automatiquement
        val shouldBlock = MainActivity.blockAutoRelaunch
        DebugLog.d("KioskModule", "shouldBlockAutoRelaunch = $shouldBlock")
        promise.resolve(shouldBlock)
    }

    @ReactMethod
    fun clearBlockAutoRelaunch(promise: Promise) {
        // Reset explicite appelé par React après navigation vers PIN
        MainActivity.blockAutoRelaunch = false
        DebugLog.d("KioskModule", "clearBlockAutoRelaunch - flag reset to false")
        promise.resolve(true)
    }

    @ReactMethod
    fun setBlockAutoRelaunch(block: Boolean, promise: Promise) {
        MainActivity.blockAutoRelaunch = block
        DebugLog.d("KioskModule", "setBlockAutoRelaunch = $block")
        promise.resolve(true)
    }

    @ReactMethod
    fun removeDeviceOwner(promise: Promise) {
        try {
            val dpm = reactApplicationContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val adminComponent = ComponentName(reactApplicationContext, DeviceAdminReceiver::class.java)
            
            if (dpm.isDeviceOwnerApp(reactApplicationContext.packageName)) {
                try {
                    dpm.clearDeviceOwnerApp(reactApplicationContext.packageName)
                    android.util.Log.d("KioskModule", "Device Owner removed successfully")
                    promise.resolve(true)
                } catch (e: Exception) {
                    android.util.Log.e("KioskModule", "Failed to remove Device Owner: ${e.message}")
                    promise.reject("ERROR", "Failed to remove Device Owner: ${e.message}")
                }
            } else {
                promise.reject("NOT_DEVICE_OWNER", "App is not a Device Owner")
            }
        } catch (e: Exception) {
            promise.reject("ERROR", "Failed to check Device Owner status: ${e.message}")
        }
    }

    @ReactMethod
    fun reboot(promise: Promise) {
        try {
            val dpm = reactApplicationContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val adminComponent = ComponentName(reactApplicationContext, DeviceAdminReceiver::class.java)
            
            if (dpm.isDeviceOwnerApp(reactApplicationContext.packageName)) {
                dpm.reboot(adminComponent)
                promise.resolve(true)
            } else {
                promise.reject("NOT_DEVICE_OWNER", "Reboot requires Device Owner mode")
            }
        } catch (e: Exception) {
            android.util.Log.e("KioskModule", "Failed to reboot: ${e.message}")
            promise.reject("ERROR", "Failed to reboot: ${e.message}")
        }
    }

    @ReactMethod
    fun sendRemoteKey(key: String, promise: Promise) {
        try {
            val keyCode = when (key) {
                "up" -> KeyEvent.KEYCODE_DPAD_UP
                "down" -> KeyEvent.KEYCODE_DPAD_DOWN
                "left" -> KeyEvent.KEYCODE_DPAD_LEFT
                "right" -> KeyEvent.KEYCODE_DPAD_RIGHT
                "select", "center", "enter" -> KeyEvent.KEYCODE_DPAD_CENTER
                "back" -> KeyEvent.KEYCODE_BACK
                "home" -> KeyEvent.KEYCODE_HOME
                "menu" -> KeyEvent.KEYCODE_MENU
                "playpause" -> KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
                "play" -> KeyEvent.KEYCODE_MEDIA_PLAY
                "pause" -> KeyEvent.KEYCODE_MEDIA_PAUSE
                "stop" -> KeyEvent.KEYCODE_MEDIA_STOP
                "next" -> KeyEvent.KEYCODE_MEDIA_NEXT
                "previous" -> KeyEvent.KEYCODE_MEDIA_PREVIOUS
                "volumeup" -> KeyEvent.KEYCODE_VOLUME_UP
                "volumedown" -> KeyEvent.KEYCODE_VOLUME_DOWN
                "mute" -> KeyEvent.KEYCODE_VOLUME_MUTE
                else -> {
                    promise.reject("INVALID_KEY", "Unknown key: $key")
                    return
                }
            }
            
            // Send key event in background thread
            Thread {
                try {
                    val inst = Instrumentation()
                    inst.sendKeyDownUpSync(keyCode)
                    android.util.Log.d("KioskModule", "Sent remote key: $key (code: $keyCode)")
                } catch (e: Exception) {
                    android.util.Log.e("KioskModule", "Failed to send key: ${e.message}")
                }
            }.start()
            
            promise.resolve(true)
        } catch (e: Exception) {
            android.util.Log.e("KioskModule", "Failed to send remote key: ${e.message}")
            promise.reject("ERROR", "Failed to send remote key: ${e.message}")
        }
    }
}
