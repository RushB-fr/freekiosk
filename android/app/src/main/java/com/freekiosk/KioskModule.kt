package com.freekiosk

import android.app.ActivityManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.SystemClock
import android.view.KeyEvent
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import android.app.Instrumentation
import android.os.PowerManager
import android.view.WindowManager
import com.facebook.react.modules.core.DeviceEventManagerModule

class KioskModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private var wakeLock: PowerManager.WakeLock? = null

    companion object {
        // Store the current instance to allow sending events from MainActivity
        @Volatile
        private var currentInstance: KioskModule? = null
        
        /**
         * Send an event to React Native from outside the module (e.g., from MainActivity)
         * This is used for the 5-tap Volume Up gesture
         */
        fun sendEventFromNative(eventName: String, params: Any? = null) {
            try {
                currentInstance?.reactApplicationContext
                    ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    ?.emit(eventName, params)
                android.util.Log.d("KioskModule", "Event '$eventName' sent to React Native")
            } catch (e: Exception) {
                android.util.Log.e("KioskModule", "Failed to send event '$eventName': ${e.message}")
            }
        }
    }

    init {
        currentInstance = this
    }

    override fun getName(): String {
        return "KioskModule"
    }

    override fun invalidate() {
        super.invalidate()
        // Release WakeLock when module is destroyed to prevent battery drain
        wakeLock?.release()
        wakeLock = null
        if (currentInstance == this) {
            currentInstance = null
        }
        android.util.Log.d("KioskModule", "Module invalidated, WakeLock released")
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

    /**
     * Turn screen ON using WakeLock
     * This will turn on the screen even if it was turned off with power button or lockNow()
     */
    @ReactMethod
    fun turnScreenOn(promise: Promise) {
        try {
            val activity = reactApplicationContext.currentActivity
            if (activity != null) {
                activity.runOnUiThread {
                    try {
                        val powerManager = reactApplicationContext.getSystemService(Context.POWER_SERVICE) as PowerManager
                        
                        // Release old wakeLock if exists
                        wakeLock?.release()
                        
                        // Create WakeLock to turn on screen
                        // FULL_WAKE_LOCK is deprecated but SCREEN_BRIGHT_WAKE_LOCK + ACQUIRE_CAUSES_WAKEUP should work
                        @Suppress("DEPRECATION")
                        wakeLock = powerManager.newWakeLock(
                            PowerManager.FULL_WAKE_LOCK or 
                            PowerManager.ACQUIRE_CAUSES_WAKEUP or 
                            PowerManager.ON_AFTER_RELEASE,
                            "FreeKiosk:ScreenOn"
                        )
                        wakeLock?.acquire(10*60*1000L) // 10 minutes timeout
                        
                        // Re-enable FLAG_KEEP_SCREEN_ON if it was cleared
                        activity.window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                        
                        // Set screen to normal brightness (-1 = use system default)
                        val layoutParams = activity.window.attributes
                        layoutParams.screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
                        activity.window.attributes = layoutParams
                        
                        android.util.Log.d("KioskModule", "Screen turned ON via WakeLock")
                        promise.resolve(true)
                    } catch (e: Exception) {
                        android.util.Log.e("KioskModule", "Failed to turn screen on: ${e.message}")
                        promise.reject("ERROR", "Failed to turn screen on: ${e.message}")
                    }
                }
            } else {
                promise.reject("ERROR", "Activity not available")
            }
        } catch (e: Exception) {
            promise.reject("ERROR", "Failed to turn screen on: ${e.message}")
        }
    }

    /**
     * Turn screen OFF
     * With Device Owner: uses lockNow() to truly turn off the screen
     * Without Device Owner: dims brightness to 0 (may not work on all devices)
     */
    @ReactMethod
    fun turnScreenOff(promise: Promise) {
        try {
            val activity = reactApplicationContext.currentActivity
            if (activity != null) {
                activity.runOnUiThread {
                    try {
                        // Release wakeLock to allow screen to turn off
                        wakeLock?.release()
                        wakeLock = null
                        
                        // Try Device Owner lockNow() first (truly turns off screen)
                        val dpm = reactApplicationContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
                        if (dpm.isDeviceOwnerApp(reactApplicationContext.packageName)) {
                            // Device Owner can truly lock/turn off the screen
                            val adminComponent = android.content.ComponentName(reactApplicationContext, DeviceAdminReceiver::class.java)
                            dpm.lockNow()
                            android.util.Log.d("KioskModule", "Screen turned OFF via Device Owner lockNow()")
                            promise.resolve(true)
                        } else {
                            // Fallback: dim brightness to absolute minimum (0)
                            // Also clear FLAG_KEEP_SCREEN_ON if set
                            activity.window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                            
                            val layoutParams = activity.window.attributes
                            layoutParams.screenBrightness = 0f  // 0 = system default (screen off), 0.01 was too bright
                            activity.window.attributes = layoutParams
                            
                            android.util.Log.d("KioskModule", "Screen dimmed to 0 brightness (no Device Owner)")
                            promise.resolve(true)
                        }
                    } catch (e: Exception) {
                        android.util.Log.e("KioskModule", "Failed to turn screen off: ${e.message}")
                        promise.reject("ERROR", "Failed to turn screen off: ${e.message}")
                    }
                }
            } else {
                promise.reject("ERROR", "Activity not available")
            }
        } catch (e: Exception) {
            promise.reject("ERROR", "Failed to turn screen off: ${e.message}")
        }
    }

    /**
     * Check if screen is currently ON or OFF
     * Returns true if screen is interactive (on), false if off
     */
    @ReactMethod
    fun isScreenOn(promise: Promise) {
        try {
            val powerManager = reactApplicationContext.getSystemService(Context.POWER_SERVICE) as PowerManager
            val isScreenOn = powerManager.isInteractive
            
            android.util.Log.d("KioskModule", "Screen state: ${if (isScreenOn) "ON" else "OFF"}")
            promise.resolve(isScreenOn)
        } catch (e: Exception) {
            android.util.Log.e("KioskModule", "Failed to check screen state: ${e.message}")
            promise.reject("ERROR", "Failed to check screen state: ${e.message}")
        }
    }

    /**
     * Save PIN hash for ADB verification
     * Called when PIN is set via React Native UI to keep ADB config in sync
     */
    @ReactMethod
    fun saveAdbPinHash(pin: String, promise: Promise) {
        try {
            val salt = java.util.UUID.randomUUID().toString()
            val hash = hashPinWithSalt(pin, salt)
            
            val prefs = reactApplicationContext.getSharedPreferences("FreeKioskAdbConfig", Context.MODE_PRIVATE)
            prefs.edit()
                .putString("pin_hash", hash)
                .putString("pin_salt", salt)
                .apply()
            
            android.util.Log.d("KioskModule", "ADB PIN hash saved from React Native")
            promise.resolve(true)
        } catch (e: Exception) {
            android.util.Log.e("KioskModule", "Failed to save ADB PIN hash: ${e.message}")
            promise.reject("ERROR", "Failed to save ADB PIN hash: ${e.message}")
        }
    }

    /**
     * Clear ADB PIN hash (when PIN is cleared in app)
     */
    @ReactMethod
    fun clearAdbPinHash(promise: Promise) {
        try {
            val prefs = reactApplicationContext.getSharedPreferences("FreeKioskAdbConfig", Context.MODE_PRIVATE)
            prefs.edit()
                .remove("pin_hash")
                .remove("pin_salt")
                .apply()
            
            android.util.Log.d("KioskModule", "ADB PIN hash cleared")
            promise.resolve(true)
        } catch (e: Exception) {
            android.util.Log.e("KioskModule", "Failed to clear ADB PIN hash: ${e.message}")
            promise.reject("ERROR", "Failed to clear ADB PIN hash: ${e.message}")
        }
    }

    /**
     * Broadcast that settings are loaded (called after ADB config restart)
     */
    @ReactMethod
    fun broadcastSettingsLoaded(promise: Promise) {
        try {
            val intent = Intent("com.freekiosk.SETTINGS_LOADED")
            reactApplicationContext.sendBroadcast(intent)
            android.util.Log.i("KioskModule", "Broadcasted SETTINGS_LOADED")
            promise.resolve(true)
        } catch (e: Exception) {
            android.util.Log.e("KioskModule", "Failed to broadcast: ${e.message}")
            promise.reject("ERROR", "Failed to broadcast: ${e.message}")
        }
    }

    /**
     * Hash PIN with salt using SHA-256 (same as MainActivity)
     */
    private fun hashPinWithSalt(pin: String, salt: String): String {
        val combined = "$pin:$salt:freekiosk_adb"
        val digest = java.security.MessageDigest.getInstance("SHA-256")
        val hashBytes = digest.digest(combined.toByteArray(Charsets.UTF_8))
        return hashBytes.joinToString("") { "%02x".format(it) }
    }
    
    /**
     * Save PIN to AsyncStorage for UI display
     * This is called from native ADB config to make PIN visible in Settings
     */
    fun savePinToStorage(pin: String): Boolean {
        return try {
            val dbPath = reactApplicationContext.getDatabasePath("RKStorage").absolutePath
            val db = android.database.sqlite.SQLiteDatabase.openOrCreateDatabase(dbPath, null)
            
            db.execSQL("""
                CREATE TABLE IF NOT EXISTS catalystLocalStorage (
                  key TEXT PRIMARY KEY,
                  value TEXT NOT NULL
                )
            """.trimIndent())
            
            val contentValues = android.content.ContentValues().apply {
                put("key", "@kiosk_pin")
                put("value", pin)
            }
            db.insertWithOnConflict("catalystLocalStorage", null, contentValues, android.database.sqlite.SQLiteDatabase.CONFLICT_REPLACE)
            db.close()
            
            android.util.Log.i("KioskModule", "PIN saved to AsyncStorage for UI")
            true
        } catch (e: Exception) {
            android.util.Log.e("KioskModule", "Failed to save PIN to storage: ${e.message}")
            false
        }
    }
}
