package com.freekiosk

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.database.sqlite.SQLiteDatabase
import android.os.Handler
import android.os.Looper

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED ||
            intent.action == "android.intent.action.QUICKBOOT_POWERON" ||
            intent.action == "android.intent.action.REBOOT") {
            
            DebugLog.d("BootReceiver", "Boot detected: ${intent.action}")
            
            // Add delay to ensure system is ready (important for Android 9)
            Handler(Looper.getMainLooper()).postDelayed({
                // Check if auto-launch is enabled in settings before launching
                if (!isAutoLaunchEnabled(context)) {
                    DebugLog.d("BootReceiver", "Auto-launch is disabled, not starting app")
                    return@postDelayed
                }
                
                DebugLog.d("BootReceiver", "Auto-launch is enabled, starting app")
                
                // Launch the app on startup
                val launchIntent = Intent(context, MainActivity::class.java)
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
                
                try {
                    context.startActivity(launchIntent)
                    DebugLog.d("BootReceiver", "Successfully launched MainActivity")
                } catch (e: Exception) {
                    DebugLog.errorProduction("BootReceiver", "Failed to launch app: ${e.message}")
                }
            }, 3000) // 3 second delay to ensure system is ready
        }
    }
    
    /**
     * Check if auto-launch is enabled by reading from AsyncStorage (React Native storage)
     * Modern AsyncStorage (@react-native-async-storage/async-storage v2.x) uses SQLite database
     */
    private fun isAutoLaunchEnabled(context: Context): Boolean {
        return try {
            // AsyncStorage uses SQLite database "RKStorage" with table "catalystLocalStorage"
            val dbPath = context.getDatabasePath("RKStorage").absolutePath
            val db = SQLiteDatabase.openDatabase(dbPath, null, SQLiteDatabase.OPEN_READONLY)
            
            val cursor = db.rawQuery(
                "SELECT value FROM catalystLocalStorage WHERE key = ?",
                arrayOf("@kiosk_auto_launch")
            )
            
            val isEnabled = if (cursor.moveToFirst()) {
                val value = cursor.getString(0)
                cursor.close()
                db.close()
                
                // AsyncStorage stores values as JSON strings, so "true" or "false"
                val enabled = value == "true"
                DebugLog.d("BootReceiver", "Auto-launch setting: $enabled (value=$value)")
                enabled
            } else {
                cursor.close()
                db.close()
                
                // If not set, default to false (don't auto-launch unless explicitly enabled)
                DebugLog.d("BootReceiver", "Auto-launch setting not found, defaulting to false")
                false
            }
            
            isEnabled
        } catch (e: Exception) {
            DebugLog.errorProduction("BootReceiver", "Error reading auto-launch setting: ${e.message}")
            // In case of error, don't launch (safer default)
            false
        }
    }
}
