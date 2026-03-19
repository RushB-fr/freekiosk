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
import android.accessibilityservice.AccessibilityService
import android.os.Build
import android.os.PowerManager
import android.view.WindowManager
import com.facebook.react.bridge.UiThreadUtil
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
                // Write @kiosk_enabled=false to AsyncStorage BEFORE finishing activity
                // so the watchdog cannot relaunch the app during its next poll cycle
                setKioskEnabledInAsyncStorage(false)

                // Explicitly stop KioskWatchdogService (#96 fix)
                stopKioskWatchdog()

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

    /**
     * Stop the KioskWatchdogService and cancel its notification.
     * Called on intentional kiosk exit to prevent the watchdog from relaunching the app.
     */
    private fun stopKioskWatchdog() {
        try {
            val serviceIntent = Intent(reactApplicationContext, KioskWatchdogService::class.java)
            reactApplicationContext.stopService(serviceIntent)
            // Also cancel the notification in case stopService races with onDestroy
            val nm = reactApplicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
            nm.cancel(2002) // KioskWatchdogService.NOTIFICATION_ID
            android.util.Log.d("KioskModule", "KioskWatchdogService stopped and notification cleared")
        } catch (e: Exception) {
            android.util.Log.e("KioskModule", "Error stopping KioskWatchdogService: ${e.message}")
        }
    }

    /**
     * Write @kiosk_enabled directly to AsyncStorage's SQLite database.
     * This ensures the value is persisted BEFORE the activity is destroyed,
     * so the watchdog's next poll cycle (or a system-restart) reads the correct value.
     */
    private fun setKioskEnabledInAsyncStorage(enabled: Boolean) {
        try {
            val dbPath = reactApplicationContext.getDatabasePath("RKStorage").absolutePath
            val db = android.database.sqlite.SQLiteDatabase.openDatabase(
                dbPath, null, android.database.sqlite.SQLiteDatabase.OPEN_READWRITE
            )
            val cv = android.content.ContentValues().apply {
                put("key", "@kiosk_enabled")
                put("value", enabled.toString())
            }
            db.insertWithOnConflict(
                "catalystLocalStorage", null, cv,
                android.database.sqlite.SQLiteDatabase.CONFLICT_REPLACE
            )
            db.close()
            android.util.Log.d("KioskModule", "@kiosk_enabled set to $enabled in AsyncStorage")
        } catch (e: Exception) {
            android.util.Log.e("KioskModule", "Failed to write @kiosk_enabled: ${e.message}")
        }
    }

    @ReactMethod
    fun startLockTask(externalAppPackage: String?, allowPowerButton: Boolean, allowNotifications: Boolean, allowSystemInfo: Boolean, promise: Promise) {
        try {
            val activity = reactApplicationContext.currentActivity
            if (activity != null && activity is MainActivity) {
                activity.runOnUiThread {
                    try {
                        val dpm = reactApplicationContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
                        val adminComponent = ComponentName(reactApplicationContext, DeviceAdminReceiver::class.java)

                        if (dpm.isDeviceOwnerApp(reactApplicationContext.packageName)) {
                            // Build whitelist: FreeKiosk + external app + all managed apps
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
                            
                            // Add all managed apps to the lock task whitelist
                            whitelist.addAll(getManagedAppPackages())
                            val uniqueWhitelist = whitelist.distinct()
                            
                            // Configure Lock Task features based on settings
                            // GLOBAL_ACTIONS is included by default (Android's own default when setLockTaskFeatures is never called)
                            // This prevents Samsung/OneUI from muting audio streams in lock task mode
                            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                                // Start with GLOBAL_ACTIONS as base (matches Android default behavior)
                                var lockTaskFeatures = DevicePolicyManager.LOCK_TASK_FEATURE_GLOBAL_ACTIONS
                                
                                // allowPowerButton=false means admin wants to BLOCK the power menu
                                if (!allowPowerButton) {
                                    lockTaskFeatures = lockTaskFeatures and DevicePolicyManager.LOCK_TASK_FEATURE_GLOBAL_ACTIONS.inv()
                                }
                                
                                // SYSTEM_INFO: shows non-interactive status bar info (time, battery)
                                if (allowSystemInfo) {
                                    lockTaskFeatures = lockTaskFeatures or DevicePolicyManager.LOCK_TASK_FEATURE_SYSTEM_INFO
                                }
                                if (allowNotifications) {
                                    lockTaskFeatures = lockTaskFeatures or DevicePolicyManager.LOCK_TASK_FEATURE_NOTIFICATIONS
                                    // Android requires HOME feature when NOTIFICATIONS is enabled
                                    lockTaskFeatures = lockTaskFeatures or DevicePolicyManager.LOCK_TASK_FEATURE_HOME
                                }
                                dpm.setLockTaskFeatures(adminComponent, lockTaskFeatures)
                                android.util.Log.d("KioskModule", "Lock task features set: blockPowerButton=${!allowPowerButton}, notifications=$allowNotifications, systemInfo=$allowSystemInfo (flags=$lockTaskFeatures)")
                            }
                            
                            dpm.setLockTaskPackages(adminComponent, uniqueWhitelist.toTypedArray())
                            activity.startLockTask()
                            android.util.Log.d("KioskModule", "Full lock task started (Device Owner) with whitelist: $uniqueWhitelist")
                            
                            // Safety net: force unmute audio streams after entering lock task
                            // Samsung/OneUI devices may mute audio in LOCK_TASK_MODE_LOCKED
                            try {
                                dpm.setMasterVolumeMuted(adminComponent, false)
                                val audioManager = reactApplicationContext.getSystemService(Context.AUDIO_SERVICE) as android.media.AudioManager
                                val streams = intArrayOf(
                                    android.media.AudioManager.STREAM_MUSIC,
                                    android.media.AudioManager.STREAM_NOTIFICATION,
                                    android.media.AudioManager.STREAM_ALARM,
                                    android.media.AudioManager.STREAM_RING
                                )
                                for (stream in streams) {
                                    audioManager.adjustStreamVolume(stream, android.media.AudioManager.ADJUST_UNMUTE, 0)
                                }
                                android.util.Log.d("KioskModule", "Audio streams unmuted (Samsung audio fix)")
                            } catch (e: Exception) {
                                android.util.Log.w("KioskModule", "Could not unmute audio streams: ${e.message}")
                            }
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
    fun hasUsageStatsPermission(promise: Promise) {
        try {
            val appOps = reactApplicationContext.getSystemService(Context.APP_OPS_SERVICE) as android.app.AppOpsManager
            val mode = appOps.checkOpNoThrow(
                android.app.AppOpsManager.OPSTR_GET_USAGE_STATS,
                android.os.Process.myUid(),
                reactApplicationContext.packageName
            )
            promise.resolve(mode == android.app.AppOpsManager.MODE_ALLOWED)
        } catch (e: Exception) {
            promise.reject("ERROR", "Failed to check usage stats permission: ${e.message}")
        }
    }

    @ReactMethod
    fun requestUsageStatsPermission(promise: Promise) {
        try {
            val intent = Intent(android.provider.Settings.ACTION_USAGE_ACCESS_SETTINGS)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", "Failed to open usage stats settings: ${e.message}")
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
            
            // Try AccessibilityService first (works cross-app on all ROMs)
            if (FreeKioskAccessibilityService.isRunning()) {
                FreeKioskAccessibilityService.sendKey(keyCode)
                android.util.Log.d("KioskModule", "Sent remote key via AccessibilityService: $key (code: $keyCode)")
                promise.resolve(true)
                return
            }
            // Fallback to Activity dispatchKeyEvent (works only in FreeKiosk's own Activity)
            UiThreadUtil.runOnUiThread {
                try {
                    val activity = reactApplicationContext.currentActivity
                    if (activity != null) {
                        activity.dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, keyCode))
                        activity.dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_UP, keyCode))
                        android.util.Log.d("KioskModule", "Sent remote key via activity: $key (code: $keyCode)")
                    } else {
                        android.util.Log.e("KioskModule", "Cannot send key: no activity and AccessibilityService not running")
                    }
                } catch (e: Exception) {
                    android.util.Log.e("KioskModule", "Failed to send key: ${e.message}")
                }
            }
            
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
            val powerManager = reactApplicationContext.getSystemService(Context.POWER_SERVICE) as PowerManager
            
            // IMPORTANT: Acquire WakeLock FIRST, before checking for activity
            // After lockNow(), activity may be null, but WakeLock still works
            
            // Release old wakeLock if exists
            wakeLock?.release()
            
            // Create WakeLock to turn on screen
            @Suppress("DEPRECATION")
            wakeLock = powerManager.newWakeLock(
                PowerManager.FULL_WAKE_LOCK or 
                PowerManager.ACQUIRE_CAUSES_WAKEUP or 
                PowerManager.ON_AFTER_RELEASE,
                "FreeKiosk:ScreenOn"
            )
            wakeLock?.acquire(10*60*1000L) // 10 minutes timeout
            android.util.Log.d("KioskModule", "WakeLock acquired to turn screen ON")
            
            val activity = reactApplicationContext.currentActivity
            if (activity != null) {
                activity.runOnUiThread {
                    try {
                        // Show over lock screen and dismiss keyguard (in case PIN is set)
                        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O_MR1) {
                            activity.setShowWhenLocked(true)
                            activity.setTurnScreenOn(true)
                            val keyguardManager = reactApplicationContext.getSystemService(Context.KEYGUARD_SERVICE) as android.app.KeyguardManager
                            keyguardManager.requestDismissKeyguard(activity, null)
                        } else {
                            @Suppress("DEPRECATION")
                            activity.window.addFlags(
                                android.view.WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
                                android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                                android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                            )
                        }
                        
                        // Re-enable FLAG_KEEP_SCREEN_ON only if not in system-managed mode
                        // Check SharedPreferences for the keep_screen_on setting
                        val prefs = reactApplicationContext.getSharedPreferences("FreeKioskSettings", Context.MODE_PRIVATE)
                        val keepScreenOn = prefs.getBoolean("keep_screen_on", true)
                        if (keepScreenOn) {
                            activity.window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                        }
                        
                        // Set screen to normal brightness (-1 = use system default)
                        val layoutParams = activity.window.attributes
                        layoutParams.screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
                        activity.window.attributes = layoutParams
                        
                        android.util.Log.d("KioskModule", "Screen turned ON via WakeLock + activity flags")
                    } catch (e: Exception) {
                        android.util.Log.e("KioskModule", "Failed to set activity flags: ${e.message}")
                    }
                }
            } else {
                android.util.Log.w("KioskModule", "Activity is null after lockNow() — WakeLock alone will wake screen")
            }
            
            // Resolve immediately - WakeLock handles the wake even if activity is null
            promise.resolve(true)
        } catch (e: Exception) {
            android.util.Log.e("KioskModule", "Failed to turn screen on: ${e.message}")
            promise.reject("ERROR", "Failed to turn screen on: ${e.message}")
        }
    }

    /**
     * Turn screen OFF
     * With Device Owner: uses lockNow() to truly turn off the screen
     * Without Device Owner: dims brightness to 0 but KEEPS the screen alive
     *   so that JavaScript timers continue to run for reliable wake-up.
     */
    @ReactMethod
    fun turnScreenOff(promise: Promise) {
        try {
            val activity = reactApplicationContext.currentActivity
            if (activity != null) {
                activity.runOnUiThread {
                    try {
                        val dpm = reactApplicationContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
                        val adminComponent = ComponentName(reactApplicationContext, DeviceAdminReceiver::class.java)
                        if (dpm.isDeviceOwnerApp(reactApplicationContext.packageName) || dpm.isAdminActive(adminComponent)) {
                            // Device Owner OR Device Admin: lockNow() is available to both
                            wakeLock?.release()
                            wakeLock = null
                            dpm.lockNow()
                            val method = if (dpm.isDeviceOwnerApp(reactApplicationContext.packageName)) "Device Owner" else "Device Admin"
                            android.util.Log.d("KioskModule", "Screen turned OFF via $method lockNow()")
                            promise.resolve(true)
                        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && FreeKioskAccessibilityService.isRunning()) {
                            // AccessibilityService fallback (API 28+): truly lock screen without Device Owner
                            wakeLock?.release()
                            wakeLock = null
                            val ok = FreeKioskAccessibilityService.performAction(AccessibilityService.GLOBAL_ACTION_LOCK_SCREEN)
                            if (ok) {
                                android.util.Log.d("KioskModule", "Screen locked via AccessibilityService GLOBAL_ACTION_LOCK_SCREEN")
                                promise.resolve(true)
                            } else {
                                // GLOBAL_ACTION_LOCK_SCREEN failed, fall through to brightness fallback
                                val layoutParams = activity.window.attributes
                                layoutParams.screenBrightness = 0.001f
                                activity.window.attributes = layoutParams
                                android.util.Log.d("KioskModule", "GLOBAL_ACTION_LOCK_SCREEN failed, dimmed brightness as fallback")
                                promise.resolve(true)
                            }
                        } else {
                            // Last resort: dim brightness to 0 (screen appears black)
                            // IMPORTANT: Do NOT clear FLAG_KEEP_SCREEN_ON!
                            // The screen must stay "on" internally so JS timers keep running
                            // and can trigger the wake-up at the scheduled time.
                            val layoutParams = activity.window.attributes
                            layoutParams.screenBrightness = 0.001f  // Near-zero, screen appears black
                            activity.window.attributes = layoutParams
                            
                            android.util.Log.d("KioskModule", "Screen dimmed to near-0 brightness (no Device Owner, no AccessibilityService)")
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
     * Set or clear the FLAG_KEEP_SCREEN_ON window flag.
     * When enabled (default): screen stays on permanently — standard kiosk behavior.
     * When disabled: Android system manages screen timeout normally.
     */
    @ReactMethod
    fun setKeepScreenOn(enabled: Boolean, promise: Promise) {
        try {
            // Persist to SharedPreferences so turnScreenOn() can check later
            val prefs = reactApplicationContext.getSharedPreferences("FreeKioskSettings", Context.MODE_PRIVATE)
            prefs.edit().putBoolean("keep_screen_on", enabled).apply()

            val activity = reactApplicationContext.currentActivity
            if (activity != null) {
                activity.runOnUiThread {
                    try {
                        if (enabled) {
                            activity.window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                            android.util.Log.d("KioskModule", "FLAG_KEEP_SCREEN_ON added — screen stays on")
                        } else {
                            activity.window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                            android.util.Log.d("KioskModule", "FLAG_KEEP_SCREEN_ON cleared — system manages screen timeout")
                        }
                        promise.resolve(true)
                    } catch (e: Exception) {
                        android.util.Log.e("KioskModule", "Failed to set keep screen on: ${e.message}")
                        promise.reject("ERROR", "Failed to set keep screen on: ${e.message}")
                    }
                }
            } else {
                promise.reject("ERROR", "Activity not available")
            }
        } catch (e: Exception) {
            promise.reject("ERROR", "Failed to set keep screen on: ${e.message}")
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
     * Get pending ADB config from SharedPreferences
     * Returns a map of key-value pairs that should be saved to AsyncStorage
     * Called by KioskScreen on startup to apply ADB-configured settings
     */
    @ReactMethod
    fun getPendingAdbConfig(promise: Promise) {
        try {
            val prefs = reactApplicationContext.getSharedPreferences("FreeKioskPendingConfig", Context.MODE_PRIVATE)
            val hasPending = prefs.getBoolean("has_pending_config", false)
            
            if (!hasPending) {
                promise.resolve(null)
                return
            }
            
            val result = com.facebook.react.bridge.Arguments.createMap()
            val allEntries = prefs.all
            for ((key, value) in allEntries) {
                if (key != "has_pending_config" && value is String) {
                    result.putString(key, value)
                }
            }
            
            android.util.Log.i("KioskModule", "Returning pending ADB config with ${allEntries.size - 1} entries")
            promise.resolve(result)
        } catch (e: Exception) {
            android.util.Log.e("KioskModule", "Failed to get pending config: ${e.message}")
            promise.reject("ERROR", "Failed to get pending config: ${e.message}")
        }
    }
    
    /**
     * Clear pending ADB config after it has been applied to AsyncStorage
     */
    @ReactMethod
    fun clearPendingAdbConfig(promise: Promise) {
        try {
            val prefs = reactApplicationContext.getSharedPreferences("FreeKioskPendingConfig", Context.MODE_PRIVATE)
            prefs.edit().clear().commit()
            android.util.Log.i("KioskModule", "Pending ADB config cleared")
            promise.resolve(true)
        } catch (e: Exception) {
            android.util.Log.e("KioskModule", "Failed to clear pending config: ${e.message}")
            promise.reject("ERROR", "Failed to clear pending config: ${e.message}")
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
                  `key` TEXT NOT NULL,
                  `value` TEXT,
                  PRIMARY KEY(`key`)
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

    // ==================== Screen Scheduler Alarms ====================

    /**
     * Schedule a native alarm to wake the screen at a specific time.
     * Uses AlarmManager.setAndAllowWhileIdle() to fire reliably even in Doze mode.
     * Uses inexact alarm (no SCHEDULE_EXACT_ALARM permission needed for Play Store).
     * This is critical because JS timers are suspended when the screen is off via lockNow().
     *
     * @param wakeTimeMs Unix timestamp in milliseconds for the wake time
     */
    @ReactMethod
    fun scheduleScreenWake(wakeTimeMs: Double, promise: Promise) {
        try {
            val context = reactApplicationContext
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as android.app.AlarmManager
            
            val intent = Intent(context, ScreenSchedulerReceiver::class.java).apply {
                action = ScreenSchedulerReceiver.ACTION_SCREEN_WAKE
            }
            val pendingIntent = android.app.PendingIntent.getBroadcast(
                context,
                1001, // unique request code for wake
                intent,
                android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
            )

            // setAndAllowWhileIdle works in Doze mode without SCHEDULE_EXACT_ALARM permission
            alarmManager.setAndAllowWhileIdle(
                android.app.AlarmManager.RTC_WAKEUP,
                wakeTimeMs.toLong(),
                pendingIntent
            )

            val calendar = java.util.Calendar.getInstance().apply { timeInMillis = wakeTimeMs.toLong() }
            val timeStr = String.format("%02d:%02d:%02d", 
                calendar.get(java.util.Calendar.HOUR_OF_DAY),
                calendar.get(java.util.Calendar.MINUTE),
                calendar.get(java.util.Calendar.SECOND))
            android.util.Log.d("KioskModule", "⏰ Screen WAKE alarm scheduled for $timeStr (${wakeTimeMs.toLong()}ms)")
            promise.resolve(true)
        } catch (e: Exception) {
            android.util.Log.e("KioskModule", "Failed to schedule wake alarm: ${e.message}")
            promise.reject("ERROR", "Failed to schedule wake alarm: ${e.message}")
        }
    }

    /**
     * Schedule a native alarm to trigger sleep at a specific time.
     *
     * @param sleepTimeMs Unix timestamp in milliseconds for the sleep time
     */
    @ReactMethod
    fun scheduleScreenSleep(sleepTimeMs: Double, promise: Promise) {
        try {
            val context = reactApplicationContext
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as android.app.AlarmManager
            
            val intent = Intent(context, ScreenSchedulerReceiver::class.java).apply {
                action = ScreenSchedulerReceiver.ACTION_SCREEN_SLEEP
            }
            val pendingIntent = android.app.PendingIntent.getBroadcast(
                context,
                1002, // unique request code for sleep
                intent,
                android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
            )

            // setAndAllowWhileIdle works in Doze mode without SCHEDULE_EXACT_ALARM permission
            alarmManager.setAndAllowWhileIdle(
                android.app.AlarmManager.RTC_WAKEUP,
                sleepTimeMs.toLong(),
                pendingIntent
            )

            val calendar = java.util.Calendar.getInstance().apply { timeInMillis = sleepTimeMs.toLong() }
            val timeStr = String.format("%02d:%02d:%02d",
                calendar.get(java.util.Calendar.HOUR_OF_DAY),
                calendar.get(java.util.Calendar.MINUTE),
                calendar.get(java.util.Calendar.SECOND))
            android.util.Log.d("KioskModule", "⏰ Screen SLEEP alarm scheduled for $timeStr (${sleepTimeMs.toLong()}ms)")
            promise.resolve(true)
        } catch (e: Exception) {
            android.util.Log.e("KioskModule", "Failed to schedule sleep alarm: ${e.message}")
            promise.reject("ERROR", "Failed to schedule sleep alarm: ${e.message}")
        }
    }

    /**
     * Cancel all scheduled screen wake/sleep alarms.
     */
    @ReactMethod
    fun cancelScheduledScreenAlarms(promise: Promise) {
        try {
            val context = reactApplicationContext
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as android.app.AlarmManager

            // Cancel wake alarm
            val wakeIntent = Intent(context, ScreenSchedulerReceiver::class.java).apply {
                action = ScreenSchedulerReceiver.ACTION_SCREEN_WAKE
            }
            val wakePendingIntent = android.app.PendingIntent.getBroadcast(
                context, 1001, wakeIntent,
                android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
            )
            alarmManager.cancel(wakePendingIntent)

            // Cancel sleep alarm
            val sleepIntent = Intent(context, ScreenSchedulerReceiver::class.java).apply {
                action = ScreenSchedulerReceiver.ACTION_SCREEN_SLEEP
            }
            val sleepPendingIntent = android.app.PendingIntent.getBroadcast(
                context, 1002, sleepIntent,
                android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
            )
            alarmManager.cancel(sleepPendingIntent)

            android.util.Log.d("KioskModule", "All screen scheduler alarms cancelled")
            promise.resolve(true)
        } catch (e: Exception) {
            android.util.Log.e("KioskModule", "Failed to cancel alarms: ${e.message}")
            promise.reject("ERROR", "Failed to cancel alarms: ${e.message}")
        }
    }

    /**
     * Open Android system settings.
     * Handles Lock Task Mode: temporarily stops lock task to allow navigation
     * to Settings. When the user returns to FreeKiosk, MainActivity.onResume()
     * automatically re-engages Lock Task Mode.
     *
     * @param settingsPage Optional specific settings page:
     *   "wifi", "sound", "display", "bluetooth", "location", "apps", "date"
     *   or null/empty to open the main settings screen.
     */
    @ReactMethod
    fun openAndroidSettings(settingsPage: String?, promise: Promise) {
        try {
            val action = when (settingsPage?.lowercase()) {
                "wifi", "wireless" -> android.provider.Settings.ACTION_WIFI_SETTINGS
                "sound", "volume", "audio" -> android.provider.Settings.ACTION_SOUND_SETTINGS
                "display", "screen", "brightness" -> android.provider.Settings.ACTION_DISPLAY_SETTINGS
                "bluetooth" -> android.provider.Settings.ACTION_BLUETOOTH_SETTINGS
                "location" -> android.provider.Settings.ACTION_LOCATION_SOURCE_SETTINGS
                "apps", "applications" -> android.provider.Settings.ACTION_APPLICATION_SETTINGS
                "date", "time" -> android.provider.Settings.ACTION_DATE_SETTINGS
                "security" -> android.provider.Settings.ACTION_SECURITY_SETTINGS
                "accessibility" -> android.provider.Settings.ACTION_ACCESSIBILITY_SETTINGS
                else -> android.provider.Settings.ACTION_SETTINGS
            }

            val activity = reactApplicationContext.currentActivity

            // Check if we're in Lock Task Mode — must stop it before launching external activity
            val activityManager = reactApplicationContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val wasInLockTask = activityManager.lockTaskModeState != ActivityManager.LOCK_TASK_MODE_NONE

            if (wasInLockTask && activity != null) {
                android.util.Log.d("KioskModule", "Temporarily stopping Lock Task to open Android settings")
                activity.runOnUiThread {
                    try {
                        activity.stopLockTask()
                        // Small delay to let the system process the lock task stop
                        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                            try {
                                val intent = Intent(action).apply {
                                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                }
                                reactApplicationContext.startActivity(intent)
                                android.util.Log.d("KioskModule", "Opened Android settings (lock task paused): ${settingsPage ?: "main"}")
                            } catch (e: Exception) {
                                android.util.Log.e("KioskModule", "Failed to launch settings after unlock: ${e.message}")
                                // Re-lock if we failed to open settings
                                try { activity.startLockTask() } catch (_: Exception) {}
                            }
                        }, 300)
                        promise.resolve(true)
                    } catch (e: Exception) {
                        android.util.Log.e("KioskModule", "Failed to stop lock task: ${e.message}")
                        promise.reject("ERROR", "Failed to temporarily exit kiosk mode: ${e.message}")
                    }
                }
            } else {
                // Not in Lock Task Mode — just launch directly
                val intent = Intent(action).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                reactApplicationContext.startActivity(intent)
                android.util.Log.d("KioskModule", "Opened Android settings: ${settingsPage ?: "main"}")
                promise.resolve(true)
            }
        } catch (e: Exception) {
            android.util.Log.e("KioskModule", "Failed to open Android settings: ${e.message}")
            promise.reject("ERROR", "Failed to open Android settings: ${e.message}")
        }
    }

    /**
     * Read all managed app package names from AsyncStorage.
     * Used to add them to the lock task whitelist.
     */
    private fun getManagedAppPackages(): List<String> {
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
                    val pkg = app.getString("packageName")
                    // Verify app is still installed
                    try {
                        reactApplicationContext.packageManager.getPackageInfo(pkg, 0)
                        packages.add(pkg)
                    } catch (e: Exception) {
                        android.util.Log.w("KioskModule", "Managed app not installed, skipping: $pkg")
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
            android.util.Log.w("KioskModule", "Could not read managed apps: ${e.message}")
            emptyList()
        }
    }
}
