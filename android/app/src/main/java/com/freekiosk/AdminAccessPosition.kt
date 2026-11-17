package com.freekiosk

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.view.Gravity

/** Canonical nine-point placement for the protected dashboard/PIN access target. */
object AdminAccessPosition {
    private const val STORAGE_KEY = "@kiosk_return_button_position"

    private val supported = setOf(
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

    fun normalize(value: String?): String {
        val normalized = value?.trim()?.lowercase().orEmpty()
        if (normalized in supported) return normalized
        return when (normalized) {
            "top-middle" -> "top-center"
            "middle-left" -> "center-left"
            "middle", "middle-center" -> "center"
            "middle-right" -> "center-right"
            "bottom-middle" -> "bottom-center"
            else -> "bottom-right"
        }
    }

    fun gravity(value: String?): Int = when (normalize(value)) {
        "top-left" -> Gravity.TOP or Gravity.START
        "top-center" -> Gravity.TOP or Gravity.CENTER_HORIZONTAL
        "top-right" -> Gravity.TOP or Gravity.END
        "center-left" -> Gravity.CENTER_VERTICAL or Gravity.START
        "center" -> Gravity.CENTER
        "center-right" -> Gravity.CENTER_VERTICAL or Gravity.END
        "bottom-left" -> Gravity.BOTTOM or Gravity.START
        "bottom-center" -> Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
        else -> Gravity.BOTTOM or Gravity.END
    }

    fun read(context: Context): String {
        var database: SQLiteDatabase? = null
        return try {
            database = SQLiteDatabase.openDatabase(
                context.getDatabasePath("RKStorage").absolutePath,
                null,
                SQLiteDatabase.OPEN_READONLY,
            )
            database.rawQuery(
                "SELECT value FROM catalystLocalStorage WHERE key = ?",
                arrayOf(STORAGE_KEY),
            ).use { cursor ->
                normalize(if (cursor.moveToFirst()) cursor.getString(0) else null)
            }
        } catch (_: Exception) {
            "bottom-right"
        } finally {
            database?.close()
        }
    }

    /** Keep bottom-right's tiny target inside the mandatory Close All control. */
    fun externalTargetDp(value: String?): Int =
        if (normalize(value) == "bottom-right") 8 else 32
}
