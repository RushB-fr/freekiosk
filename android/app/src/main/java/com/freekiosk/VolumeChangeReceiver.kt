package com.freekiosk

import android.app.ActivityManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.database.sqlite.SQLiteDatabase
import android.util.Log

/**
 * BroadcastReceiver to detect volume changes from hardware buttons
 * Used to track volume state for REST API and 5-tap gesture detection.
 * 
 * The 5-tap gesture works by detecting rapid volume CHANGES (up or down).
 * If volume is at max, press Volume Down 5 times.
 * If volume is at min, press Volume Up 5 times.
 * Any rapid sequence of 5 volume changes in 2 seconds triggers the PIN screen.
 * 
 * NOTE: This gesture only works when kiosk mode (lock task) is active.
 * When not in lock task mode, users can access settings normally.
 */
class VolumeChangeReceiver : BroadcastReceiver() {
    
    companion object {
        private const val TAG = "VolumeChangeReceiver"
        
        // Track volume changes for 5-tap gesture (any direction)
        private var volumeChangeTapCount = 0
        private var volumeChangeLastTapTime = 0L
        private val volumeChangeTapTimeout = 2000L // 2 seconds timeout
        private var lastVolume = -1
    }
    
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == "android.media.VOLUME_CHANGED_ACTION") {
            try {
                val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
                val currentVolume = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC)
                val maxVolume = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
                val volumePercent = (currentVolume * 100) / maxVolume
                
                Log.d(TAG, "Volume changed to $volumePercent% (raw: $currentVolume/$maxVolume)")
                
                // Check for 5-tap gesture (any volume change direction)
                checkVolume5Tap(context, currentVolume)
                
            } catch (e: Exception) {
                Log.e(TAG, "Failed to read volume: ${e.message}")
            }
        }
    }
    
    private fun checkVolume5Tap(context: Context, currentVolume: Int) {
        // Check if feature is enabled
        val volumeUp5TapEnabled = getAsyncStorageValue(context, "@kiosk_volume_up_5tap_enabled", "true") == "true"
        
        if (!volumeUp5TapEnabled) {
            Log.d(TAG, "Volume N-tap feature is disabled")
            lastVolume = currentVolume
            return
        }
        
        // Get required tap count from storage (default 5)
        val requiredTaps = try {
            getAsyncStorageValue(context, "@kiosk_return_tap_count", "5").toInt().coerceIn(2, 20)
        } catch (e: Exception) {
            5
        }
        
        // Check if we're in lock task mode (kiosk mode active)
        // If not in lock mode, user can access settings normally - no need for N-tap
        if (!isInLockTaskMode(context)) {
            Log.d(TAG, "Not in lock task mode, skipping N-tap detection")
            lastVolume = currentVolume
            return
        }
        
        // Check if volume actually changed (not just a duplicate event)
        if (lastVolume >= 0 && currentVolume != lastVolume) {
            val currentTime = System.currentTimeMillis()
            
            // Reset counter if timeout exceeded
            if (currentTime - volumeChangeLastTapTime > volumeChangeTapTimeout) {
                volumeChangeTapCount = 0
            }
            
            volumeChangeTapCount++
            volumeChangeLastTapTime = currentTime
            
            val direction = if (currentVolume > lastVolume) "UP" else "DOWN"
            Log.d(TAG, "Volume $direction detected! Count: $volumeChangeTapCount/$requiredTaps (was: $lastVolume, now: $currentVolume)")
            
            if (volumeChangeTapCount >= requiredTaps) {
                volumeChangeTapCount = 0
                Log.d(TAG, "$requiredTaps-tap Volume detected! Navigating to PIN screen")
                
                // Set flag to block auto-relaunch
                MainActivity.blockAutoRelaunch = true
                
                // Launch MainActivity with navigateToPin flag
                navigateToPin(context)
            }
        }
        
        lastVolume = currentVolume
    }
    
    private fun navigateToPin(context: Context) {
        try {
            val intent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
                putExtra("navigateToPin", true)
                putExtra("voluntaryReturn", true)
            }
            context.startActivity(intent)
            Log.d(TAG, "Launched MainActivity with navigateToPin intent")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch MainActivity: ${e.message}")
        }
    }
    
    private fun getAsyncStorageValue(context: Context, key: String, defaultValue: String): String {
        try {
            val dbPath = context.getDatabasePath("RKStorage").absolutePath
            val db = SQLiteDatabase.openDatabase(dbPath, null, SQLiteDatabase.OPEN_READONLY)
            val cursor = db.rawQuery("SELECT value FROM catalystLocalStorage WHERE key = ?", arrayOf(key))
            
            val value = if (cursor.moveToFirst()) {
                cursor.getString(0) ?: defaultValue
            } else {
                defaultValue
            }
            
            cursor.close()
            db.close()
            return value
        } catch (e: Exception) {
            return defaultValue
        }
    }
    
    private fun isInLockTaskMode(context: Context): Boolean {
        return try {
            val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            activityManager.lockTaskModeState != ActivityManager.LOCK_TASK_MODE_NONE
        } catch (e: Exception) {
            Log.e(TAG, "Failed to check lock task mode: ${e.message}")
            false
        }
    }
}
