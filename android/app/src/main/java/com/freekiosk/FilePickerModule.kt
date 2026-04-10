package com.freekiosk

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Log
import android.webkit.MimeTypeMap
import com.facebook.react.bridge.*
import java.io.File
import java.io.FileOutputStream

/**
 * FilePickerModule - Native Android file picker for media selection
 * Uses ACTION_OPEN_DOCUMENT to let users pick videos/images from the device.
 * Selected files are copied to the app's internal media directory for reliable
 * WebView access via file:// URIs.
 */
class FilePickerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    companion object {
        const val NAME = "FilePickerModule"
        private const val TAG = "FilePickerModule"
        private const val PICK_MEDIA_REQUEST = 9001
        private const val PICK_JSON_REQUEST = 9002
        private const val MEDIA_DIR = "media_player"
    }

    private var pickPromise: Promise? = null

    init {
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String = NAME

    /**
     * Open the Android file picker for media selection.
     * @param mediaType "video", "image", or "any" (default: "any")
     * Returns a WritableMap with: { path, name, mimeType, size, type }
     */
    @ReactMethod
    fun pickMedia(mediaType: String, promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No activity available")
            return
        }

        // Only one pick at a time
        if (pickPromise != null) {
            promise.reject("PICKER_BUSY", "A file picker is already open")
            return
        }

        pickPromise = promise

        try {
            val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = when (mediaType) {
                    "video" -> "video/*"
                    "image" -> "image/*"
                    else -> "*/*"
                }
                // For "any", restrict to video and image MIME types
                if (mediaType == "any") {
                    putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("video/*", "image/*"))
                }
            }
            activity.startActivityForResult(intent, PICK_MEDIA_REQUEST)
        } catch (e: Exception) {
            pickPromise = null
            promise.reject("PICKER_ERROR", "Failed to open file picker: ${e.message}")
        }
    }

    /**
     * Pick multiple media files at once.
     * Returns a WritableArray of WritableMaps.
     */
    @ReactMethod
    fun pickMultipleMedia(mediaType: String, promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No activity available")
            return
        }

        if (pickPromise != null) {
            promise.reject("PICKER_BUSY", "A file picker is already open")
            return
        }

        pickPromise = promise

        try {
            val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = when (mediaType) {
                    "video" -> "video/*"
                    "image" -> "image/*"
                    else -> "*/*"
                }
                if (mediaType == "any") {
                    putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("video/*", "image/*"))
                }
                putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
            }
            activity.startActivityForResult(intent, PICK_MEDIA_REQUEST)
        } catch (e: Exception) {
            pickPromise = null
            promise.reject("PICKER_ERROR", "Failed to open file picker: ${e.message}")
        }
    }

    /**
     * Open the Android file picker for JSON file selection (for backup import).
     * Uses SAF (Storage Access Framework) to bypass Scoped Storage restrictions.
     * Returns a WritableMap with: { content, name, size }
     */
    @ReactMethod
    fun pickJsonFile(promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No activity available")
            return
        }

        if (pickPromise != null) {
            promise.reject("PICKER_BUSY", "A file picker is already open")
            return
        }

        pickPromise = promise

        try {
            val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = "*/*"
                // Accept JSON and plain text files (backup files may have generic MIME type)
                putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("application/json", "text/plain", "application/octet-stream"))
            }
            activity.startActivityForResult(intent, PICK_JSON_REQUEST)
        } catch (e: Exception) {
            pickPromise = null
            promise.reject("PICKER_ERROR", "Failed to open file picker: ${e.message}")
        }
    }

    /**
     * Delete a file that was previously copied to the media directory.
     */
    @ReactMethod
    fun deleteMediaFile(filePath: String, promise: Promise) {
        try {
            val path = if (filePath.startsWith("file://")) {
                filePath.removePrefix("file://")
            } else {
                filePath
            }
            val file = File(path)
            if (file.exists()) {
                file.delete()
                promise.resolve(true)
            } else {
                promise.resolve(false)
            }
        } catch (e: Exception) {
            promise.reject("DELETE_ERROR", "Failed to delete file: ${e.message}")
        }
    }

    /**
     * Get the path to the media directory (for display/debug).
     */
    @ReactMethod
    fun getMediaDirectory(promise: Promise) {
        try {
            val dir = getOrCreateMediaDir()
            promise.resolve("file://${dir.absolutePath}")
        } catch (e: Exception) {
            promise.reject("DIR_ERROR", "Failed to get media directory: ${e.message}")
        }
    }

    /**
     * List all files currently in the media directory.
     * Returns array of { path, name, size }.
     */
    @ReactMethod
    fun listMediaFiles(promise: Promise) {
        try {
            val dir = getOrCreateMediaDir()
            val result = Arguments.createArray()
            dir.listFiles()?.forEach { file ->
                val map = Arguments.createMap().apply {
                    putString("path", "file://${file.absolutePath}")
                    putString("name", file.name)
                    putDouble("size", file.length().toDouble())
                }
                result.pushMap(map)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("LIST_ERROR", "Failed to list media files: ${e.message}")
        }
    }

    /**
     * Clear all files in the media directory.
     */
    @ReactMethod
    fun clearMediaFiles(promise: Promise) {
        try {
            val dir = getOrCreateMediaDir()
            var count = 0
            dir.listFiles()?.forEach { file ->
                if (file.delete()) count++
            }
            promise.resolve(count)
        } catch (e: Exception) {
            promise.reject("CLEAR_ERROR", "Failed to clear media files: ${e.message}")
        }
    }

    // ==================== Activity Result Handling ====================

    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != PICK_MEDIA_REQUEST && requestCode != PICK_JSON_REQUEST) return

        val promise = pickPromise ?: return
        pickPromise = null

        if (resultCode != Activity.RESULT_OK || data == null) {
            promise.reject("PICKER_CANCELLED", "User cancelled file selection")
            return
        }

        try {
            // Handle JSON file pick - read content directly via ContentResolver
            if (requestCode == PICK_JSON_REQUEST) {
                val uri = data.data
                if (uri == null) {
                    promise.reject("NO_URI", "No file URI received")
                    return
                }
                val fileInfo = readJsonFileContent(uri)
                if (fileInfo != null) {
                    promise.resolve(fileInfo)
                } else {
                    promise.reject("READ_ERROR", "Failed to read the selected JSON file")
                }
                return
            }

            // Handle media file pick (existing logic)
            val clipData = data.clipData
            if (clipData != null && clipData.itemCount > 1) {
                // Multiple files selected
                val results = Arguments.createArray()
                for (idx in 0 until clipData.itemCount) {
                    val uri = clipData.getItemAt(idx).uri
                    val fileInfo = copyFileToMediaDir(uri)
                    if (fileInfo != null) {
                        results.pushMap(fileInfo)
                    }
                }
                promise.resolve(results)
            } else {
                // Single file selected
                val uri = data.data
                if (uri == null) {
                    promise.reject("NO_URI", "No file URI received")
                    return
                }
                val fileInfo = copyFileToMediaDir(uri)
                if (fileInfo != null) {
                    // Wrap single result in array for consistency with pickMultipleMedia
                    // But for pickMedia (single), return just the map
                    promise.resolve(fileInfo)
                } else {
                    promise.reject("COPY_ERROR", "Failed to copy the selected file")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error processing picked file", e)
            promise.reject("PROCESS_ERROR", "Failed to process selected file: ${e.message}")
        }
    }

    override fun onNewIntent(intent: Intent) {
        // Not needed
    }

    // ==================== Internal Helpers ====================

    private fun getOrCreateMediaDir(): File {
        val dir = File(reactApplicationContext.filesDir, MEDIA_DIR)
        if (!dir.exists()) {
            dir.mkdirs()
        }
        return dir
    }

    /**
     * Read a JSON file's content directly from a content:// URI.
     * Returns a WritableMap with { content, name, size }, or null on failure.
     * This uses ContentResolver to bypass Scoped Storage restrictions.
     */
    private fun readJsonFileContent(uri: Uri): WritableMap? {
        val context = reactApplicationContext
        val contentResolver = context.contentResolver

        var fileName: String? = null
        var fileSize: Long = 0

        contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
                val nameIdx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                val sizeIdx = cursor.getColumnIndex(OpenableColumns.SIZE)
                if (nameIdx >= 0) fileName = cursor.getString(nameIdx)
                if (sizeIdx >= 0) fileSize = cursor.getLong(sizeIdx)
            }
        }

        if (fileName.isNullOrBlank()) {
            fileName = "backup.json"
        }

        // Read file content as string via ContentResolver (bypasses Scoped Storage)
        val content = contentResolver.openInputStream(uri)?.use { input ->
            input.bufferedReader().readText()
        } ?: return null

        val result = Arguments.createMap().apply {
            putString("content", content)
            putString("name", fileName)
            putDouble("size", fileSize.toDouble())
        }

        Log.d(TAG, "Read JSON file: $fileName ($fileSize bytes)")
        return result
    }

    /**
     * Copy a content:// URI to the internal media directory.
     * Returns a WritableMap with file info, or null on failure.
     */
    private fun copyFileToMediaDir(uri: Uri): WritableMap? {
        val context = reactApplicationContext
        val contentResolver = context.contentResolver

        // Get filename and MIME type
        var fileName: String? = null
        var fileSize: Long = 0

        contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
                val nameIdx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                val sizeIdx = cursor.getColumnIndex(OpenableColumns.SIZE)
                if (nameIdx >= 0) fileName = cursor.getString(nameIdx)
                if (sizeIdx >= 0) fileSize = cursor.getLong(sizeIdx)
            }
        }

        val mimeType = contentResolver.getType(uri) ?: "application/octet-stream"

        // Generate unique filename if needed
        if (fileName.isNullOrBlank()) {
            val ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType) ?: "bin"
            fileName = "media_${System.currentTimeMillis()}.${ext}"
        }

        // Ensure unique name in our directory
        val dir = getOrCreateMediaDir()
        var targetFile = File(dir, fileName!!)
        var counter = 1
        val baseName = targetFile.nameWithoutExtension
        val ext = targetFile.extension
        while (targetFile.exists()) {
            targetFile = File(dir, "${baseName}_${counter}.${ext}")
            counter++
        }

        // Copy file
        contentResolver.openInputStream(uri)?.use { input ->
            FileOutputStream(targetFile).use { output ->
                input.copyTo(output, bufferSize = 8192)
            }
        } ?: return null

        // Determine media type from MIME
        val isVideo = mimeType.startsWith("video/")
        val mediaType = if (isVideo) "video" else "image"

        val result = Arguments.createMap().apply {
            putString("path", "file://${targetFile.absolutePath}")
            putString("name", targetFile.name)
            putString("mimeType", mimeType)
            putDouble("size", targetFile.length().toDouble())
            putString("type", mediaType)
        }

        Log.d(TAG, "Copied file: ${targetFile.absolutePath} (${mimeType}, ${targetFile.length()} bytes)")
        return result
    }
}
