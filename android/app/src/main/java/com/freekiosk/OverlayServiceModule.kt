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
            // Démarrer le service même sans permission overlay
            // Le service peut toujours fonctionner en arrière-plan (timer test mode, retour auto)
            // L'overlay button ne sera simplement pas visible sans permission
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                if (!Settings.canDrawOverlays(reactApplicationContext)) {
                    DebugLog.d("OverlayServiceModule", "Overlay permission not granted - service will run without visible button")
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

    @ReactMethod
    fun setButtonPosition(position: String, promise: Promise) {
        try {
            // Valider la position
            val validPositions = listOf("top-left", "top-right", "bottom-left", "bottom-right")
            val safePosition = if (validPositions.contains(position)) position else "bottom-right"
            
            // Sauvegarder dans SharedPreferences
            val prefs = reactApplicationContext.getSharedPreferences("FreeKioskSettings", android.content.Context.MODE_PRIVATE)
            prefs.edit().putString("overlay_button_position", safePosition).apply()
            
            // Mettre à jour le bouton en temps réel via la méthode statique
            OverlayService.updateButtonPosition(safePosition)
            
            DebugLog.d("OverlayServiceModule", "Set button position to: $safePosition")
            promise.resolve(true)
        } catch (e: Exception) {
            DebugLog.errorProduction("OverlayServiceModule", "Error setting button position: ${e.message}")
            promise.reject("ERROR", "Failed to set button position: ${e.message}")
        }
    }

    @ReactMethod
    fun getButtonPosition(promise: Promise) {
        try {
            val prefs = reactApplicationContext.getSharedPreferences("FreeKioskSettings", android.content.Context.MODE_PRIVATE)
            val position = prefs.getString("overlay_button_position", "bottom-right")
            promise.resolve(position)
        } catch (e: Exception) {
            promise.reject("ERROR", "Failed to get button position: ${e.message}")
        }
    }

    @ReactMethod
    fun setTestMode(enabled: Boolean, promise: Promise) {
        try {
            // Sauvegarder dans SharedPreferences pour le JavaScript
            val prefs = reactApplicationContext.getSharedPreferences("FreeKioskSettings", android.content.Context.MODE_PRIVATE)
            prefs.edit().putBoolean("test_mode_enabled", enabled).apply()
            
            DebugLog.d("OverlayServiceModule", "Set test mode to: $enabled")
            promise.resolve(true)
        } catch (e: Exception) {
            DebugLog.errorProduction("OverlayServiceModule", "Error setting test mode: ${e.message}")
            promise.reject("ERROR", "Failed to set test mode: ${e.message}")
        }
    }

    @ReactMethod
    fun setStatusBarEnabled(enabled: Boolean, promise: Promise) {
        try {
            // Sauvegarder dans SharedPreferences
            val prefs = reactApplicationContext.getSharedPreferences("FreeKioskSettings", android.content.Context.MODE_PRIVATE)
            prefs.edit().putBoolean("status_bar_enabled", enabled).apply()

            // Mettre à jour la status bar en temps réel via la méthode statique
            OverlayService.updateStatusBarEnabled(enabled)

            DebugLog.d("OverlayServiceModule", "Set status bar enabled to: $enabled")
            promise.resolve(true)
        } catch (e: Exception) {
            DebugLog.errorProduction("OverlayServiceModule", "Error setting status bar enabled: ${e.message}")
            promise.reject("ERROR", "Failed to set status bar enabled: ${e.message}")
        }
    }

    @ReactMethod
    fun getStatusBarEnabled(promise: Promise) {
        try {
            val prefs = reactApplicationContext.getSharedPreferences("FreeKioskSettings", android.content.Context.MODE_PRIVATE)
            val enabled = prefs.getBoolean("status_bar_enabled", false)
            promise.resolve(enabled)
        } catch (e: Exception) {
            promise.reject("ERROR", "Failed to get status bar enabled: ${e.message}")
        }
    }

    @ReactMethod
    fun setStatusBarItems(showBattery: Boolean, showWifi: Boolean, showBluetooth: Boolean, showVolume: Boolean, showTime: Boolean, promise: Promise) {
        try {
            // Sauvegarder dans SharedPreferences
            val prefs = reactApplicationContext.getSharedPreferences("FreeKioskSettings", android.content.Context.MODE_PRIVATE)
            prefs.edit().apply {
                putBoolean("status_bar_show_battery", showBattery)
                putBoolean("status_bar_show_wifi", showWifi)
                putBoolean("status_bar_show_bluetooth", showBluetooth)
                putBoolean("status_bar_show_volume", showVolume)
                putBoolean("status_bar_show_time", showTime)
                apply()
            }

            // Mettre à jour la status bar en temps réel
            OverlayService.updateStatusBarItems(showBattery, showWifi, showBluetooth, showVolume, showTime)

            DebugLog.d("OverlayServiceModule", "Set status bar items - Battery: $showBattery, WiFi: $showWifi, BT: $showBluetooth, Vol: $showVolume, Time: $showTime")
            promise.resolve(true)
        } catch (e: Exception) {
            DebugLog.errorProduction("OverlayServiceModule", "Error setting status bar items: ${e.message}")
            promise.reject("ERROR", "Failed to set status bar items: ${e.message}")
        }
    }
}
