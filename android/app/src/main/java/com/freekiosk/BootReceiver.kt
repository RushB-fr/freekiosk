package com.freekiosk

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED ||
            intent.action == "android.intent.action.QUICKBOOT_POWERON") {
            
            // Check if auto-launch is enabled in settings before launching
            // This prevents the app from launching after a hard restart if auto-launch was disabled
            if (!isAutoLaunchEnabled(context)) {
                DebugLog.d("BootReceiver", "Auto-launch is disabled, not starting app")
                return
            }
            
            DebugLog.d("BootReceiver", "Auto-launch is enabled, starting app")
            
            // Lance l'app au démarrage
            val launchIntent = Intent(context, MainActivity::class.java)
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
            context.startActivity(launchIntent)
        }
    }
    
    /**
     * Check if auto-launch is enabled by reading from AsyncStorage (React Native storage)
     * AsyncStorage uses SharedPreferences under the hood with the database name "RKStorage"
     */
    private fun isAutoLaunchEnabled(context: Context): Boolean {
        return try {
            // AsyncStorage in React Native stores data in SharedPreferences with name "RKStorage"
            val prefs: SharedPreferences = context.getSharedPreferences("RKStorage", Context.MODE_PRIVATE)
            val autoLaunchValue = prefs.getString("@kiosk_auto_launch", null)
            
            // If not set, default to false (don't auto-launch unless explicitly enabled)
            if (autoLaunchValue == null) {
                DebugLog.d("BootReceiver", "Auto-launch setting not found, defaulting to false")
                return false
            }
            
            // AsyncStorage stores values as JSON strings, so "true" or "false"
            val isEnabled = autoLaunchValue == "true"
            DebugLog.d("BootReceiver", "Auto-launch setting: $isEnabled")
            isEnabled
        } catch (e: Exception) {
            DebugLog.errorProduction("BootReceiver", "Error reading auto-launch setting: ${e.message}")
            // In case of error, don't launch (safer default)
            false
        }
    }
}
