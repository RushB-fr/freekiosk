package com.freekiosk

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * BroadcastReceiver to detect screen ON/OFF events
 * Used to track actual screen state for REST API
 * 
 * Note: This receiver stores the screen state and can be queried by KioskModule
 * to get the current screen state for the REST API.
 */
class ScreenStateReceiver : BroadcastReceiver() {
    
    companion object {
        private const val TAG = "ScreenStateReceiver"
        @Volatile
        var isScreenOn = true  // Assume screen is on initially
            private set
    }
    
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_SCREEN_ON -> {
                Log.d(TAG, "Screen turned ON")
                isScreenOn = true
            }
            Intent.ACTION_SCREEN_OFF -> {
                Log.d(TAG, "Screen turned OFF")
                isScreenOn = false
            }
        }
    }
}
