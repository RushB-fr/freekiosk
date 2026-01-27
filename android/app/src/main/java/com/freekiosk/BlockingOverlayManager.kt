package com.freekiosk

import android.content.Context
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Point
import android.graphics.Rect
import android.os.Build
import android.view.Gravity
import android.view.View
import android.view.WindowManager

/**
 * Manages blocking overlay views that block touch input on specific screen areas
 */
class BlockingOverlayManager(private val context: Context) {
    
    companion object {
        const val MAX_REGIONS = 10
        private const val TAG = "BlockingOverlayManager"
        
        @Volatile
        private var instance: BlockingOverlayManager? = null
        
        fun getInstance(context: Context): BlockingOverlayManager {
            return instance ?: synchronized(this) {
                instance ?: BlockingOverlayManager(context.applicationContext).also {
                    instance = it
                }
            }
        }
    }
    
    private val windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    private val activeOverlays = mutableMapOf<String, View>()
    private var regions = listOf<BlockingRegion>()
    private var isEnabled = false
    private var currentForegroundPackage: String? = null
    
    /**
     * Enable or disable blocking overlays globally
     */
    fun setEnabled(enabled: Boolean) {
        DebugLog.d(TAG, "setEnabled: $enabled")
        isEnabled = enabled
        if (!enabled) {
            removeAllOverlays()
        } else {
            updateOverlays()
        }
    }
    
    /**
     * Check if blocking overlays are enabled
     */
    fun isEnabled(): Boolean = isEnabled
    
    /**
     * Set the list of blocking regions
     */
    fun setRegions(newRegions: List<BlockingRegion>) {
        DebugLog.d(TAG, "setRegions: ${newRegions.size} regions")
        regions = newRegions.take(MAX_REGIONS)
        if (isEnabled) {
            updateOverlays()
        }
    }
    
    /**
     * Get current regions
     */
    fun getRegions(): List<BlockingRegion> = regions
    
    /**
     * Update the current foreground package (for package-filtered overlays)
     */
    fun setForegroundPackage(packageName: String?) {
        if (currentForegroundPackage != packageName) {
            currentForegroundPackage = packageName
            if (isEnabled) {
                updateOverlays()
            }
        }
    }
    
    /**
     * Update all overlays based on current state
     */
    fun updateOverlays() {
        DebugLog.d(TAG, "updateOverlays called, enabled=$isEnabled, regions=${regions.size}")
        
        removeAllOverlays()
        
        if (!isEnabled) return
        
        val screenSize = getScreenSize()
        DebugLog.d(TAG, "Screen size: ${screenSize.x}x${screenSize.y}")
        
        regions
            .filter { it.enabled && it.appliesTo(currentForegroundPackage) }
            .forEach { region ->
                showRegion(region, screenSize.x, screenSize.y)
            }
        
        // Bring the return button to front to ensure it stays above blocking overlays
        OverlayService.bringToFront()
    }
    
    /**
     * Show a single blocking region
     */
    private fun showRegion(region: BlockingRegion, screenWidth: Int, screenHeight: Int) {
        val rect = region.toRect(screenWidth, screenHeight)
        
        // Validate rect
        if (rect.width() <= 0 || rect.height() <= 0) {
            DebugLog.w(TAG, "Invalid rect for region ${region.name}: $rect")
            return
        }
        
        val overlayView = createOverlayView(region)
        val params = createLayoutParams(rect)
        
        try {
            windowManager.addView(overlayView, params)
            activeOverlays[region.id] = overlayView
            DebugLog.d(TAG, "Added blocking overlay: ${region.name} at $rect")
        } catch (e: Exception) {
            DebugLog.e(TAG, "Failed to add overlay ${region.name}: ${e.message}")
        }
    }
    
    /**
     * Create the overlay view with appropriate styling
     */
    private fun createOverlayView(region: BlockingRegion): View {
        return View(context).apply {
            // Set background color based on display mode
            setBackgroundColor(when (region.displayMode) {
                BlockingRegion.MODE_TRANSPARENT -> Color.TRANSPARENT
                BlockingRegion.MODE_SEMI_TRANSPARENT -> Color.argb(128, 64, 64, 64)
                BlockingRegion.MODE_OPAQUE -> Color.argb(230, 32, 32, 32)
                else -> Color.TRANSPARENT
            })
            
            // Block all touches - the view consumes touch events
            isClickable = true
            isFocusable = false
            
            // Set content description for accessibility
            contentDescription = "Blocked area: ${region.name}"
        }
    }
    
    /**
     * Create WindowManager layout params for the overlay
     */
    private fun createLayoutParams(rect: Rect): WindowManager.LayoutParams {
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }
        
        return WindowManager.LayoutParams(
            rect.width(),
            rect.height(),
            type,
            // FLAG_NOT_FOCUSABLE: doesn't take focus
            // FLAG_NOT_TOUCH_MODAL: allows touches outside to pass through
            // FLAG_LAYOUT_IN_SCREEN: position relative to screen
            // NOT using FLAG_NOT_TOUCHABLE so it captures touches
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = rect.left
            y = rect.top
        }
    }
    
    /**
     * Remove all active overlays
     */
    fun removeAllOverlays() {
        activeOverlays.values.forEach { view ->
            try {
                windowManager.removeView(view)
            } catch (e: Exception) {
                DebugLog.e(TAG, "Failed to remove overlay: ${e.message}")
            }
        }
        activeOverlays.clear()
        DebugLog.d(TAG, "Removed all overlays")
    }
    
    /**
     * Handle configuration changes (orientation, screen size)
     */
    fun onConfigurationChanged(newConfig: Configuration) {
        DebugLog.d(TAG, "Configuration changed, orientation: ${newConfig.orientation}")
        // Recalculate positions on orientation change
        if (isEnabled) {
            updateOverlays()
        }
    }
    
    /**
     * Get actual screen size
     */
    private fun getScreenSize(): Point {
        val size = Point()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val windowMetrics = windowManager.currentWindowMetrics
            size.x = windowMetrics.bounds.width()
            size.y = windowMetrics.bounds.height()
        } else {
            @Suppress("DEPRECATION")
            windowManager.defaultDisplay.getRealSize(size)
        }
        return size
    }
    
    /**
     * Clean up resources
     */
    fun destroy() {
        removeAllOverlays()
        instance = null
    }
}
