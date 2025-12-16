package com.freekiosk

import android.content.Intent
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.*

/**
 * OverlayServiceModule - Gère le démarrage/arrêt de l'OverlayService
 *
 * Permet à React Native de contrôler l'overlay button depuis JavaScript
 */
class OverlayServiceModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "OverlayServiceModule"
    }

    override fun getName(): String = NAME

    @ReactMethod
    fun startOverlayService(promise: Promise) {
        try {
            // Vérifier la permission overlay (Android M+)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                if (!Settings.canDrawOverlays(reactApplicationContext)) {
                    DebugLog.d("OverlayServiceModule", "Overlay permission not granted")
                    promise.reject("NO_PERMISSION", "Overlay permission not granted")
                    return
                }
            }

            val serviceIntent = Intent(reactApplicationContext, OverlayService::class.java)
            reactApplicationContext.startService(serviceIntent)
            DebugLog.d("OverlayServiceModule", "Started OverlayService")
            promise.resolve(true)
        } catch (e: Exception) {
            DebugLog.errorProduction("OverlayServiceModule", "Error starting OverlayService: ${e.message}")
            promise.reject("ERROR", "Failed to start overlay service: ${e.message}")
        }
    }

    @ReactMethod
    fun stopOverlayService(promise: Promise) {
        try {
            val serviceIntent = Intent(reactApplicationContext, OverlayService::class.java)
            reactApplicationContext.stopService(serviceIntent)
            DebugLog.d("OverlayServiceModule", "Stopped OverlayService")
            promise.resolve(true)
        } catch (e: Exception) {
            DebugLog.errorProduction("OverlayServiceModule", "Error stopping OverlayService: ${e.message}")
            promise.reject("ERROR", "Failed to stop overlay service: ${e.message}")
        }
    }

    @ReactMethod
    fun setButtonOpacity(opacity: Double, promise: Promise) {
        try {
            val opacityFloat = opacity.toFloat().coerceIn(0.0f, 1.0f)
            
            // Sauvegarder dans SharedPreferences
            val prefs = reactApplicationContext.getSharedPreferences("FreeKioskSettings", android.content.Context.MODE_PRIVATE)
            prefs.edit().putFloat("overlay_button_opacity", opacityFloat).apply()
            
            // Mettre à jour le bouton en temps réel via la méthode statique
            OverlayService.updateButtonOpacity(opacityFloat)
            
            DebugLog.d("OverlayServiceModule", "Set button opacity to: $opacityFloat")
            promise.resolve(true)
        } catch (e: Exception) {
            DebugLog.errorProduction("OverlayServiceModule", "Error setting button opacity: ${e.message}")
            promise.reject("ERROR", "Failed to set button opacity: ${e.message}")
        }
    }

    @ReactMethod
    fun getButtonOpacity(promise: Promise) {
        try {
            val prefs = reactApplicationContext.getSharedPreferences("FreeKioskSettings", android.content.Context.MODE_PRIVATE)
            val opacity = prefs.getFloat("overlay_button_opacity", 0.0f)
            promise.resolve(opacity.toDouble())
        } catch (e: Exception) {
            promise.reject("ERROR", "Failed to get button opacity: ${e.message}")
        }
    }
}
