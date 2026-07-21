package com.freekiosk

import android.content.Context
import android.content.pm.PackageManager
import android.provider.Settings
import android.view.Surface
import android.view.WindowManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class RotationControlModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val MODULE_NAME = "RotationControlModule"
    }

    override fun getName(): String = MODULE_NAME

    @ReactMethod
    fun isAvailable(promise: Promise) {
        promise.resolve(canModifySystemRotation())
    }

    @ReactMethod
    fun getState(promise: Promise) {
        try {
            promise.resolve(buildStateMap())
        } catch (e: Exception) {
            promise.reject("ROTATION_STATE_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun setLocked(locked: Boolean, promise: Promise) {
        if (!canModifySystemRotation()) {
            promise.reject("ROTATION_PERMISSION_DENIED", "Rotation settings cannot be changed on this device")
            return
        }

        try {
            val contentResolver = reactContext.contentResolver
            if (locked) {
                val rotation = getCurrentDisplayRotation()
                Settings.System.putInt(contentResolver, Settings.System.USER_ROTATION, rotation)
                Settings.System.putInt(contentResolver, Settings.System.ACCELEROMETER_ROTATION, 0)
            } else {
                Settings.System.putInt(contentResolver, Settings.System.ACCELEROMETER_ROTATION, 1)
            }
            promise.resolve(buildStateMap())
        } catch (e: Exception) {
            promise.reject("ROTATION_SET_FAILED", e.message, e)
        }
    }

    private fun buildStateMap() = Arguments.createMap().apply {
        val locked = Settings.System.getInt(
            reactContext.contentResolver,
            Settings.System.ACCELEROMETER_ROTATION,
            1
        ) == 0
        val rotation = Settings.System.getInt(
            reactContext.contentResolver,
            Settings.System.USER_ROTATION,
            Surface.ROTATION_0
        )
        putBoolean("locked", locked)
        putInt("rotation", rotation)
    }

    private fun canModifySystemRotation(): Boolean {
        if (Settings.System.canWrite(reactContext)) return true
        return reactContext.checkCallingOrSelfPermission(android.Manifest.permission.WRITE_SECURE_SETTINGS) ==
            PackageManager.PERMISSION_GRANTED
    }

    @Suppress("DEPRECATION")
    private fun getCurrentDisplayRotation(): Int {
        val activity = reactContext.currentActivity
        if (activity != null) {
            return activity.windowManager.defaultDisplay.rotation
        }

        val windowManager = reactContext.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        return windowManager.defaultDisplay.rotation
    }
}
