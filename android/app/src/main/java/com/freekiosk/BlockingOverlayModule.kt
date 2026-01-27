package com.freekiosk

import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.TextView
import com.facebook.react.bridge.*
import org.json.JSONArray

/**
 * React Native module for managing blocking overlays
 */
class BlockingOverlayModule(reactContext: ReactApplicationContext) : 
    ReactContextBaseJavaModule(reactContext) {
    
    companion object {
        private const val TAG = "BlockingOverlayModule"
    }
    
    private val mainHandler = Handler(Looper.getMainLooper())
    private var touchLoggerView: View? = null
    private var gridHelperView: View? = null
    
    override fun getName() = "BlockingOverlayModule"
    
    private fun getManager(): BlockingOverlayManager {
        return BlockingOverlayManager.getInstance(reactApplicationContext)
    }
    
    /**
     * Enable or disable blocking overlays
     */
    @ReactMethod
    fun setEnabled(enabled: Boolean, promise: Promise) {
        mainHandler.post {
            try {
                getManager().setEnabled(enabled)
                promise.resolve(true)
            } catch (e: Exception) {
                DebugLog.e(TAG, "setEnabled error: ${e.message}")
                promise.reject("ERROR", e.message)
            }
        }
    }
    
    /**
     * Check if blocking overlays are enabled
     */
    @ReactMethod
    fun isEnabled(promise: Promise) {
        try {
            promise.resolve(getManager().isEnabled())
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }
    
    /**
     * Set the list of blocking regions from JSON
     */
    @ReactMethod
    fun setRegions(regionsJson: String, promise: Promise) {
        mainHandler.post {
            try {
                val regions = parseRegions(regionsJson)
                getManager().setRegions(regions)
                promise.resolve(true)
            } catch (e: Exception) {
                DebugLog.e(TAG, "setRegions error: ${e.message}")
                promise.reject("ERROR", e.message)
            }
        }
    }
    
    /**
     * Force update all overlays
     */
    @ReactMethod
    fun updateOverlays(promise: Promise) {
        mainHandler.post {
            try {
                getManager().updateOverlays()
                promise.resolve(true)
            } catch (e: Exception) {
                DebugLog.e(TAG, "updateOverlays error: ${e.message}")
                promise.reject("ERROR", e.message)
            }
        }
    }
    
    /**
     * Remove all overlays
     */
    @ReactMethod
    fun removeAllOverlays(promise: Promise) {
        mainHandler.post {
            try {
                getManager().removeAllOverlays()
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }
    }
    
    /**
     * Show touch logger overlay that displays touch coordinates
     */
    @ReactMethod
    private var touchLoggerCountdownRunnable: Runnable? = null
    private var touchLoggerRemainingSeconds: Int = 0

    @ReactMethod
    fun showTouchLogger(durationSeconds: Int, promise: Promise) {
        mainHandler.post {
            try {
                hideTouchLogger()
                
                val windowManager = reactApplicationContext.getSystemService(
                    android.content.Context.WINDOW_SERVICE
                ) as WindowManager
                
                val container = FrameLayout(reactApplicationContext).apply {
                    setBackgroundColor(Color.TRANSPARENT)
                }
                
                touchLoggerRemainingSeconds = durationSeconds
                
                val infoText = TextView(reactApplicationContext).apply {
                    text = "Touch Logger Active (${durationSeconds}s)\nTap anywhere to see coordinates"
                    setTextColor(Color.WHITE)
                    textSize = 14f
                    setBackgroundColor(Color.argb(200, 0, 0, 0))
                    setPadding(24, 16, 24, 16)
                }
                
                val textParams = FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.WRAP_CONTENT,
                    FrameLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
                    topMargin = 100
                }
                container.addView(infoText, textParams)
                
                // Countdown timer runnable
                var lastTouchInfo = ""
                touchLoggerCountdownRunnable = object : Runnable {
                    override fun run() {
                        if (touchLoggerRemainingSeconds > 0) {
                            touchLoggerRemainingSeconds--
                            if (lastTouchInfo.isEmpty()) {
                                infoText.text = "Touch Logger Active (${touchLoggerRemainingSeconds}s)\nTap anywhere to see coordinates"
                            } else {
                                infoText.text = "$lastTouchInfo\n\n⏱ ${touchLoggerRemainingSeconds}s remaining"
                            }
                            mainHandler.postDelayed(this, 1000)
                        } else {
                            hideTouchLogger()
                        }
                    }
                }
                mainHandler.postDelayed(touchLoggerCountdownRunnable!!, 1000)
                
                // Touch listener to show coordinates
                container.setOnTouchListener { _, event ->
                    if (event.action == MotionEvent.ACTION_DOWN) {
                        val screenWidth = container.width.toFloat()
                        val screenHeight = container.height.toFloat()
                        
                        val xPercent = (event.x / screenWidth * 100).toInt()
                        val yPercent = (event.y / screenHeight * 100).toInt()
                        
                        lastTouchInfo = """
                            |Touch Detected:
                            |X: ${event.x.toInt()}px ($xPercent%)
                            |Y: ${event.y.toInt()}px ($yPercent%)
                            |
                            |Screen: ${screenWidth.toInt()} × ${screenHeight.toInt()}
                        """.trimMargin()
                        
                        infoText.text = "$lastTouchInfo\n\n⏱ ${touchLoggerRemainingSeconds}s remaining"
                    }
                    false // Allow touch to pass through
                }
                
                val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                } else {
                    @Suppress("DEPRECATION")
                    WindowManager.LayoutParams.TYPE_PHONE
                }
                
                val params = WindowManager.LayoutParams(
                    WindowManager.LayoutParams.MATCH_PARENT,
                    WindowManager.LayoutParams.MATCH_PARENT,
                    type,
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                    WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
                    PixelFormat.TRANSLUCENT
                )
                
                windowManager.addView(container, params)
                touchLoggerView = container
                
                // Auto-hide after duration
                mainHandler.postDelayed({
                    hideTouchLogger()
                }, durationSeconds * 1000L)
                
                promise.resolve(true)
            } catch (e: Exception) {
                DebugLog.e(TAG, "showTouchLogger error: ${e.message}")
                promise.reject("ERROR", e.message)
            }
        }
    }
    
    /**
     * Hide touch logger overlay
     */
    @ReactMethod
    fun hideTouchLogger(promise: Promise) {
        mainHandler.post {
            hideTouchLogger()
            promise.resolve(true)
        }
    }
    
    private fun hideTouchLogger() {
        touchLoggerCountdownRunnable?.let { mainHandler.removeCallbacks(it) }
        touchLoggerCountdownRunnable = null
        touchLoggerView?.let { view ->
            try {
                val windowManager = reactApplicationContext.getSystemService(
                    android.content.Context.WINDOW_SERVICE
                ) as WindowManager
                windowManager.removeView(view)
            } catch (e: Exception) {
                DebugLog.e(TAG, "hideTouchLogger error: ${e.message}")
            }
            touchLoggerView = null
        }
    }
    
    /**
     * Show grid helper overlay with percentage markers
     */
    private var gridHelperCountdownRunnable: Runnable? = null
    private var gridHelperRemainingSeconds: Int = 0

    @ReactMethod
    fun showGridHelper(durationSeconds: Int, promise: Promise) {
        mainHandler.post {
            try {
                hideGridHelper()
                
                val windowManager = reactApplicationContext.getSystemService(
                    android.content.Context.WINDOW_SERVICE
                ) as WindowManager
                
                gridHelperRemainingSeconds = durationSeconds
                
                // Create container with grid view and countdown text
                val container = FrameLayout(reactApplicationContext)
                
                val gridView = GridHelperView(reactApplicationContext)
                container.addView(gridView, FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.MATCH_PARENT
                ))
                
                val countdownText = TextView(reactApplicationContext).apply {
                    text = "⏱ ${durationSeconds}s"
                    setTextColor(Color.WHITE)
                    textSize = 16f
                    setBackgroundColor(Color.argb(180, 0, 0, 0))
                    setPadding(20, 12, 20, 12)
                }
                
                val textParams = FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.WRAP_CONTENT,
                    FrameLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    gravity = Gravity.TOP or Gravity.END
                    topMargin = 50
                    marginEnd = 20
                }
                container.addView(countdownText, textParams)
                
                // Touch listener to dismiss on tap
                container.setOnTouchListener { _, event ->
                    if (event.action == MotionEvent.ACTION_DOWN) {
                        hideGridHelper()
                    }
                    true
                }
                
                // Countdown timer
                gridHelperCountdownRunnable = object : Runnable {
                    override fun run() {
                        if (gridHelperRemainingSeconds > 0) {
                            gridHelperRemainingSeconds--
                            countdownText.text = "⏱ ${gridHelperRemainingSeconds}s"
                            mainHandler.postDelayed(this, 1000)
                        } else {
                            hideGridHelper()
                        }
                    }
                }
                mainHandler.postDelayed(gridHelperCountdownRunnable!!, 1000)
                
                val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                } else {
                    @Suppress("DEPRECATION")
                    WindowManager.LayoutParams.TYPE_PHONE
                }
                
                val params = WindowManager.LayoutParams(
                    WindowManager.LayoutParams.MATCH_PARENT,
                    WindowManager.LayoutParams.MATCH_PARENT,
                    type,
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                    PixelFormat.TRANSLUCENT
                )
                
                windowManager.addView(container, params)
                gridHelperView = container
                
                promise.resolve(true)
            } catch (e: Exception) {
                DebugLog.e(TAG, "showGridHelper error: ${e.message}")
                promise.reject("ERROR", e.message)
            }
        }
    }
    
    /**
     * Hide grid helper overlay
     */
    @ReactMethod
    fun hideGridHelper(promise: Promise) {
        mainHandler.post {
            hideGridHelper()
            promise.resolve(true)
        }
    }
    
    private fun hideGridHelper() {
        gridHelperCountdownRunnable?.let { mainHandler.removeCallbacks(it) }
        gridHelperCountdownRunnable = null
        gridHelperView?.let { view ->
            try {
                val windowManager = reactApplicationContext.getSystemService(
                    android.content.Context.WINDOW_SERVICE
                ) as WindowManager
                windowManager.removeView(view)
            } catch (e: Exception) {
                DebugLog.e(TAG, "hideGridHelper error: ${e.message}")
            }
            gridHelperView = null
        }
    }
    
    /**
     * Parse JSON string to list of BlockingRegion
     */
    private fun parseRegions(json: String): List<BlockingRegion> {
        val regions = mutableListOf<BlockingRegion>()
        val jsonArray = JSONArray(json)
        
        for (i in 0 until jsonArray.length()) {
            val obj = jsonArray.getJSONObject(i)
            regions.add(BlockingRegion(
                id = obj.getString("id"),
                name = obj.getString("name"),
                enabled = obj.getBoolean("enabled"),
                xStart = obj.getDouble("xStart").toFloat(),
                yStart = obj.getDouble("yStart").toFloat(),
                xEnd = obj.getDouble("xEnd").toFloat(),
                yEnd = obj.getDouble("yEnd").toFloat(),
                displayMode = obj.getString("displayMode"),
                targetPackage = if (obj.has("targetPackage") && !obj.isNull("targetPackage")) {
                    obj.getString("targetPackage")
                } else null
            ))
        }
        
        return regions
    }
}

/**
 * Custom view for drawing grid with percentage markers
 */
private class GridHelperView(context: android.content.Context) : View(context) {
    
    private val gridPaint = android.graphics.Paint().apply {
        color = Color.argb(100, 255, 255, 255)
        strokeWidth = 2f
        style = android.graphics.Paint.Style.STROKE
    }
    
    private val textPaint = android.graphics.Paint().apply {
        color = Color.WHITE
        textSize = 28f
        textAlign = android.graphics.Paint.Align.CENTER
        isAntiAlias = true
    }
    
    private val bgPaint = android.graphics.Paint().apply {
        color = Color.argb(150, 0, 0, 0)
    }
    
    override fun onDraw(canvas: android.graphics.Canvas) {
        super.onDraw(canvas)
        
        val w = width.toFloat()
        val h = height.toFloat()
        
        // Draw semi-transparent background
        canvas.drawRect(0f, 0f, w, h, bgPaint)
        
        // Draw grid lines every 10%
        for (i in 0..10) {
            val xPos = w * i / 10
            val yPos = h * i / 10
            
            // Vertical lines
            canvas.drawLine(xPos, 0f, xPos, h, gridPaint)
            // Horizontal lines
            canvas.drawLine(0f, yPos, w, yPos, gridPaint)
            
            // X-axis labels at top
            if (i > 0 && i < 10) {
                canvas.drawText("${i * 10}%", xPos, 40f, textPaint)
            }
            
            // Y-axis labels on left
            if (i > 0 && i < 10) {
                textPaint.textAlign = android.graphics.Paint.Align.LEFT
                canvas.drawText("${i * 10}%", 10f, yPos + 10f, textPaint)
                textPaint.textAlign = android.graphics.Paint.Align.CENTER
            }
        }
        
        // Draw corner labels
        textPaint.textAlign = android.graphics.Paint.Align.LEFT
        canvas.drawText("0%", 10f, 40f, textPaint)
        
        textPaint.textAlign = android.graphics.Paint.Align.RIGHT
        canvas.drawText("100%", w - 10f, 40f, textPaint)
        
        textPaint.textAlign = android.graphics.Paint.Align.LEFT
        canvas.drawText("100%", 10f, h - 20f, textPaint)
        
        // Draw info text
        textPaint.textAlign = android.graphics.Paint.Align.CENTER
        textPaint.textSize = 32f
        canvas.drawText("Grid Helper - Tap to dismiss", w / 2, h / 2, textPaint)
        textPaint.textSize = 28f
    }
}
