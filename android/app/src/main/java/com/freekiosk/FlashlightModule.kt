package com.freekiosk

import android.content.Context
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class FlashlightModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val MODULE_NAME = "FlashlightModule"
    }

    private val cameraManager: CameraManager by lazy {
        reactContext.getSystemService(Context.CAMERA_SERVICE) as CameraManager
    }

    @Volatile
    private var torchEnabled = false

    @Volatile
    private var callbackRegistered = false

    override fun getName(): String = MODULE_NAME

    @ReactMethod
    fun isAvailable(promise: Promise) {
        try {
            promise.resolve(findTorchCameraId() != null)
        } catch (e: Exception) {
            promise.reject("FLASHLIGHT_AVAILABILITY_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun getState(promise: Promise) {
        promise.resolve(torchEnabled)
    }

    @ReactMethod
    fun setEnabled(enabled: Boolean, promise: Promise) {
        try {
            val cameraId = findTorchCameraId()
                ?: run {
                    promise.reject("FLASHLIGHT_UNAVAILABLE", "No back camera with flash available")
                    return
                }

            ensureTorchCallbackRegistered()
            cameraManager.setTorchMode(cameraId, enabled)
            torchEnabled = enabled
            promise.resolve(enabled)
        } catch (e: Exception) {
            promise.reject("FLASHLIGHT_SET_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun toggle(promise: Promise) {
        setEnabled(!torchEnabled, promise)
    }

    private fun ensureTorchCallbackRegistered() {
        if (callbackRegistered || Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
        cameraManager.registerTorchCallback(object : CameraManager.TorchCallback() {
            override fun onTorchModeChanged(cameraId: String, enabled: Boolean) {
                val targetId = findTorchCameraId() ?: return
                if (cameraId == targetId) {
                    torchEnabled = enabled
                }
            }

            override fun onTorchModeUnavailable(cameraId: String) {
                val targetId = findTorchCameraId() ?: return
                if (cameraId == targetId) {
                    torchEnabled = false
                }
            }
        }, null)
        callbackRegistered = true
    }

    private fun findTorchCameraId(): String? {
        return cameraManager.cameraIdList.firstOrNull { cameraId ->
            val characteristics = cameraManager.getCameraCharacteristics(cameraId)
            val hasFlash = characteristics.get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
            val facing = characteristics.get(CameraCharacteristics.LENS_FACING)
            hasFlash && facing == CameraCharacteristics.LENS_FACING_BACK
        } ?: cameraManager.cameraIdList.firstOrNull { cameraId ->
            val characteristics = cameraManager.getCameraCharacteristics(cameraId)
            characteristics.get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
        }
    }
}
