package com.freekiosk

import android.app.ActivityManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise

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
                        // Désactive les restrictions AVANT de sortir
                        activity.disableKioskRestrictions()
                        
                        // Puis sort du lock task
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
    fun startLockTask(promise: Promise) {
        try {
            val activity = reactApplicationContext.currentActivity
            if (activity != null && activity is MainActivity) {
                activity.runOnUiThread {
                    try {
                        val dpm = reactApplicationContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
                        val adminComponent = ComponentName(reactApplicationContext, DeviceAdminReceiver::class.java)
                        
                        // CHECK si Device Owner
                        if (dpm.isDeviceOwnerApp(reactApplicationContext.packageName)) {
                            // CONFIGURE packages autorisés pour FULL LOCK
                            dpm.setLockTaskPackages(adminComponent, arrayOf(reactApplicationContext.packageName))
                            activity.startLockTask()
                            android.util.Log.d("KioskModule", "Full lock task started (Device Owner)")
                        } else {
                            // Screen Pinning manuel (sans Device Owner)
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
            
            // LOCK_TASK_MODE_NONE = 0
            // LOCK_TASK_MODE_LOCKED = 1
            // LOCK_TASK_MODE_PINNED = 2
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
}
