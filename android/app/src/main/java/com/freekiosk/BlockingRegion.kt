package com.freekiosk

import android.graphics.Rect

/**
 * Data class representing a blocking overlay region
 * 
 * Coordinates are in percentage (0.0 - 100.0) of screen dimensions
 */
data class BlockingRegion(
    val id: String,
    val name: String,
    val enabled: Boolean,
    val xStart: Float,      // 0.0 - 100.0
    val yStart: Float,      // 0.0 - 100.0
    val xEnd: Float,        // 0.0 - 100.0
    val yEnd: Float,        // 0.0 - 100.0
    val displayMode: String, // "transparent", "semi_transparent", "opaque"
    val targetPackage: String? // null = always active
) {
    /**
     * Convert percentage-based coordinates to pixel-based Rect
     */
    fun toRect(screenWidth: Int, screenHeight: Int): Rect {
        return Rect(
            (screenWidth * xStart / 100f).toInt(),
            (screenHeight * yStart / 100f).toInt(),
            (screenWidth * xEnd / 100f).toInt(),
            (screenHeight * yEnd / 100f).toInt()
        )
    }
    
    /**
     * Check if this region applies to a specific package
     */
    fun appliesTo(packageName: String?): Boolean {
        // If no target package, always applies
        if (targetPackage.isNullOrEmpty()) return true
        // Otherwise, check if package matches
        return packageName == targetPackage
    }
    
    companion object {
        const val MODE_TRANSPARENT = "transparent"
        const val MODE_SEMI_TRANSPARENT = "semi_transparent"
        const val MODE_OPAQUE = "opaque"
    }
}
