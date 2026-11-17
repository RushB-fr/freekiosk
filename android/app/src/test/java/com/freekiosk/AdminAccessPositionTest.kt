package com.freekiosk

import org.junit.Assert.assertEquals
import org.junit.Test

class AdminAccessPositionTest {
    @Test
    fun supportsNineCanonicalPositions() {
        val positions = listOf(
            "top-left",
            "top-center",
            "top-right",
            "center-left",
            "center",
            "center-right",
            "bottom-left",
            "bottom-center",
            "bottom-right",
        )

        positions.forEach { position ->
            assertEquals(position, AdminAccessPosition.normalize(position))
        }
    }

    @Test
    fun migratesMiddleAliasesAndRejectsUnknownValues() {
        assertEquals("top-center", AdminAccessPosition.normalize("top-middle"))
        assertEquals("center-left", AdminAccessPosition.normalize("middle-left"))
        assertEquals("center", AdminAccessPosition.normalize("middle"))
        assertEquals("center-right", AdminAccessPosition.normalize("middle-right"))
        assertEquals("bottom-center", AdminAccessPosition.normalize("bottom-middle"))
        assertEquals("bottom-right", AdminAccessPosition.normalize("elsewhere"))
    }
}
