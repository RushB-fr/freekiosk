package com.freekiosk

import org.junit.Assert.assertEquals
import org.junit.Test

class PendingActionsTest {

    @Test
    fun actionsWaitUntilSettledThenRunInOrder() {
        val pending = PendingActions<String>()
        val seen = mutableListOf<String?>()
        pending.run { seen += "a:$it" }
        pending.run { seen += "b:$it" }
        assertEquals(emptyList<String?>(), seen)

        pending.settle("engine")
        assertEquals(listOf("a:engine", "b:engine"), seen)
    }

    @Test
    fun actionsAfterSettleRunAtOnce() {
        val pending = PendingActions<String>()
        pending.settle(null)
        var got = "unset"
        pending.run { got = it ?: "null" }
        assertEquals("null", got)
    }

    @Test
    fun resetMakesActionsWaitAgain() {
        val pending = PendingActions<String>()
        pending.settle("old")
        pending.reset()
        val seen = mutableListOf<String?>()
        pending.run { seen += it }
        assertEquals(emptyList<String?>(), seen)
        pending.settle("new")
        assertEquals(listOf<String?>("new"), seen)
    }
}
