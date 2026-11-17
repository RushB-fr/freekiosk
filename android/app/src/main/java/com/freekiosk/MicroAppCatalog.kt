package com.freekiosk

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import java.io.ByteArrayOutputStream

/**
 * Bridge to MicroAppStation (local.microstation), which turns URLs into launcher
 * "micro-apps". Its exported read-only provider lists micro-app ids/names and serves
 * their icons; each micro-app opens through ACTION_VIEW microstation://open/{id}, which
 * the host only honors for published micro-apps. Start URLs are never exposed.
 */
object MicroAppCatalog {
    const val HOST_PACKAGE = "local.microstation"
    private const val AUTHORITY = "local.microstation.apps"
    private val APPS_URI: Uri = Uri.parse("content://$AUTHORITY/apps")
    private val ID_PATTERN = Regex("^[A-Za-z0-9-]{1,64}$")

    data class Entry(val id: String, val name: String, val published: Boolean)

    fun isHostPackage(packageName: String): Boolean = packageName == HOST_PACKAGE

    fun isValidId(id: String): Boolean = ID_PATTERN.matches(id)

    /** All micro-apps known to the host, or an empty list when it is missing or too old. */
    fun list(context: Context): List<Entry> {
        val entries = mutableListOf<Entry>()
        try {
            context.contentResolver.query(APPS_URI, null, null, null, null)?.use { cursor ->
                val idColumn = cursor.getColumnIndex("id")
                val nameColumn = cursor.getColumnIndex("name")
                val publishedColumn = cursor.getColumnIndex("published")
                if (idColumn < 0) return entries
                while (cursor.moveToNext()) {
                    val id = cursor.getString(idColumn) ?: continue
                    if (!isValidId(id)) continue
                    entries.add(
                        Entry(
                            id = id,
                            name = if (nameColumn >= 0) cursor.getString(nameColumn).orEmpty() else "",
                            published = publishedColumn >= 0 && cursor.getInt(publishedColumn) == 1,
                        )
                    )
                }
            }
        } catch (e: Exception) {
            DebugLog.d("MicroAppCatalog", "Micro-app catalog unavailable: ${e.message}")
        }
        return entries
    }

    fun find(context: Context, id: String): Entry? = list(context).firstOrNull { it.id == id }

    /** Square PNG data URI for the micro-app icon, or null when the host cannot serve it. */
    fun iconDataUri(context: Context, id: String, size: Int): String? {
        if (!isValidId(id)) return null
        val source = try {
            context.contentResolver.openInputStream(Uri.parse("content://$AUTHORITY/icon/$id"))
                ?.use(BitmapFactory::decodeStream)
        } catch (e: Exception) {
            null
        } ?: return null
        val targetSize = if (size > 0) size else 96
        val scaled = Bitmap.createScaledBitmap(source, targetSize, targetSize, true)
        val stream = ByteArrayOutputStream()
        scaled.compress(Bitmap.CompressFormat.PNG, 100, stream)
        if (scaled !== source) scaled.recycle()
        source.recycle()
        return "data:image/png;base64," + Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
    }

    /**
     * Base intent that opens exactly one micro-app. Relaunching it with NEW_TASK alone
     * brings the existing micro-app task forward without reloading the page.
     */
    fun launchIntent(packageName: String, id: String): Intent =
        Intent(Intent.ACTION_VIEW, Uri.parse("microstation://open/$id"))
            .addCategory(Intent.CATEGORY_BROWSABLE)
            .setPackage(packageName)
}
