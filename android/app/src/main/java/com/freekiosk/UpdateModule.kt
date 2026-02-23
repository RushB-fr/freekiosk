package com.freekiosk

import android.app.DownloadManager
import android.app.admin.DevicePolicyManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Environment
import androidx.core.content.FileProvider
import com.facebook.react.bridge.*
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

class UpdateModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "UpdateModule"
    }

    private var downloadId: Long = -1
    private var updatePromise: Promise? = null

    @ReactMethod
    fun getCurrentVersion(promise: Promise) {
        try {
            val packageInfo = reactApplicationContext.packageManager.getPackageInfo(
                reactApplicationContext.packageName,
                0
            )
            val versionName = packageInfo.versionName
            val versionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                packageInfo.longVersionCode.toInt()
            } else {
                @Suppress("DEPRECATION")
                packageInfo.versionCode
            }
            
            val result = Arguments.createMap().apply {
                putString("versionName", versionName)
                putInt("versionCode", versionCode)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("ERROR", "Failed to get current version: ${e.message}")
        }
    }

    /**
     * Check for updates - stable channel only (backward compatible)
     */
    @ReactMethod
    fun checkForUpdates(promise: Promise) {
        checkForUpdatesWithChannel(false, promise)
    }

    /**
     * Check for updates with optional beta/pre-release channel support.
     * When includeBeta is false, uses /releases/latest (stable only).
     * When includeBeta is true, uses /releases and picks the first release (beta or stable).
     */
    @ReactMethod
    fun checkForUpdatesWithChannel(includeBeta: Boolean, promise: Promise) {
        Thread {
            try {
                val apiUrl = if (includeBeta) {
                    "https://api.github.com/repos/rushb-fr/freekiosk/releases?per_page=10"
                } else {
                    "https://api.github.com/repos/rushb-fr/freekiosk/releases/latest"
                }
                
                android.util.Log.d("UpdateModule", "Checking updates: includeBeta=$includeBeta, url=$apiUrl")
                
                val url = URL(apiUrl)
                val connection = url.openConnection() as HttpURLConnection
                connection.requestMethod = "GET"
                connection.connectTimeout = 10000
                connection.readTimeout = 10000
                
                val responseCode = connection.responseCode
                if (responseCode == HttpURLConnection.HTTP_OK) {
                    val response = connection.inputStream.bufferedReader().use { it.readText() }
                    
                    // Parse the release object
                    val jsonObject = if (includeBeta) {
                        // /releases returns an array — pick the first one (most recent, beta or stable)
                        val releasesArray = org.json.JSONArray(response)
                        if (releasesArray.length() == 0) {
                            promise.reject("ERROR", "No releases found")
                            connection.disconnect()
                            return@Thread
                        }
                        releasesArray.getJSONObject(0)
                    } else {
                        // /releases/latest returns a single object
                        JSONObject(response)
                    }
                    
                    val tagName = jsonObject.getString("tag_name").removePrefix("v")
                    val releaseName = jsonObject.optString("name", "")
                    val releaseNotes = jsonObject.optString("body", "")
                    val publishedAt = jsonObject.optString("published_at", "")
                    val isPrerelease = jsonObject.optBoolean("prerelease", false)
                    
                    // Get the actual APK download URL from release assets
                    var apkUrl = ""
                    val assetsArray = jsonObject.optJSONArray("assets")
                    if (assetsArray != null && assetsArray.length() > 0) {
                        for (i in 0 until assetsArray.length()) {
                            val asset = assetsArray.getJSONObject(i)
                            val assetName = asset.getString("name")
                            if (assetName.endsWith(".apk", ignoreCase = true)) {
                                apkUrl = asset.getString("browser_download_url")
                                android.util.Log.d("UpdateModule", "Found APK asset: $assetName")
                                break
                            }
                        }
                    }
                    
                    // Fallback to constructed URL if no asset found (should not happen)
                    if (apkUrl.isEmpty()) {
                        apkUrl = "https://github.com/rushb-fr/freekiosk/releases/download/v${tagName}/FreeKiosk-v${tagName}.apk"
                        android.util.Log.w("UpdateModule", "No APK asset found, using fallback URL")
                    }
                    
                    android.util.Log.d("UpdateModule", "Tag from GitHub: ${jsonObject.getString("tag_name")}")
                    android.util.Log.d("UpdateModule", "Version after removePrefix: $tagName")
                    android.util.Log.d("UpdateModule", "APK Download URL: $apkUrl")
                    android.util.Log.d("UpdateModule", "Is pre-release: $isPrerelease")
                    
                    val result = Arguments.createMap().apply {
                        putString("version", tagName)
                        putString("name", releaseName)
                        putString("notes", releaseNotes)
                        putString("publishedAt", publishedAt)
                        putString("downloadUrl", apkUrl)
                        putBoolean("isPrerelease", isPrerelease)
                    }
                    
                    android.util.Log.d("UpdateModule", "Update available: $tagName at $apkUrl (prerelease=$isPrerelease)")
                    promise.resolve(result)
                } else {
                    promise.reject("ERROR", "GitHub API returned code: $responseCode")
                }
                connection.disconnect()
            } catch (e: Exception) {
                promise.reject("ERROR", "Failed to check for updates: ${e.message}")
            }
        }.start()
    }

    @ReactMethod
    fun downloadAndInstall(downloadUrl: String, version: String, promise: Promise) {
        try {
            android.util.Log.d("UpdateModule", "Starting download from: $downloadUrl")
            
            if (downloadUrl.isEmpty()) {
                promise.reject("ERROR", "Download URL is empty")
                return
            }
            
            updatePromise = promise
            
            val fileName = "FreeKiosk-${version}.apk"
            val request = DownloadManager.Request(Uri.parse(downloadUrl)).apply {
                setTitle("FreeKiosk Update")
                setDescription("Downloading version $version")
                setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName)
                setAllowedOverMetered(true)
                setAllowedOverRoaming(true)
                addRequestHeader("User-Agent", "FreeKiosk-Updater")
                addRequestHeader("Accept", "application/vnd.android.package-archive")
            }
            
            android.util.Log.d("UpdateModule", "Download request configured for file: $fileName")
            
            val downloadManager = reactApplicationContext.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            downloadId = downloadManager.enqueue(request)
            
            // Register receiver for download completion
            // RECEIVER_EXPORTED est nécessaire pour recevoir les broadcasts système du DownloadManager
            val filter = IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                reactApplicationContext.registerReceiver(downloadReceiver, filter, Context.RECEIVER_EXPORTED)
            } else {
                reactApplicationContext.registerReceiver(downloadReceiver, filter)
            }
            
            android.util.Log.d("UpdateModule", "Download started with ID: $downloadId")
        } catch (e: Exception) {
            android.util.Log.e("UpdateModule", "Failed to start download: ${e.message}")
            promise.reject("ERROR", "Failed to start download: ${e.message}")
        }
    }

    private val downloadReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val id = intent?.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1) ?: -1
            if (id == downloadId) {
                android.util.Log.d("UpdateModule", "Download completed with ID: $id")
                
                try {
                    val downloadManager = reactApplicationContext.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
                    
                    // Vérifier le statut du téléchargement
                    val query = DownloadManager.Query().setFilterById(downloadId)
                    val cursor = downloadManager.query(query)
                    
                    if (cursor.moveToFirst()) {
                        val statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS)
                        val status = cursor.getInt(statusIndex)
                        
                        when (status) {
                            DownloadManager.STATUS_SUCCESSFUL -> {
                                android.util.Log.d("UpdateModule", "Download successful")
                                
                                // Vérifier les informations du fichier téléchargé
                                val mimeIndex = cursor.getColumnIndex(DownloadManager.COLUMN_MEDIA_TYPE)
                                val sizeIndex = cursor.getColumnIndex(DownloadManager.COLUMN_TOTAL_SIZE_BYTES)
                                val uriIndex = cursor.getColumnIndex(DownloadManager.COLUMN_LOCAL_URI)
                                
                                val mimeType = if (mimeIndex >= 0) cursor.getString(mimeIndex) else "unknown"
                                val fileSize = if (sizeIndex >= 0) cursor.getLong(sizeIndex) else -1L
                                val localUri = if (uriIndex >= 0) cursor.getString(uriIndex) else "unknown"
                                
                                android.util.Log.d("UpdateModule", "Downloaded file info:")
                                android.util.Log.d("UpdateModule", "  - MIME type: $mimeType")
                                android.util.Log.d("UpdateModule", "  - File size: $fileSize bytes")
                                android.util.Log.d("UpdateModule", "  - Local URI: $localUri")
                                
                                // Vérifier que le fichier n'est pas trop petit (un HTML ferait < 50KB)
                                if (fileSize > 0 && fileSize < 50000) {
                                    android.util.Log.e("UpdateModule", "Downloaded file too small ($fileSize bytes), probably not a valid APK")
                                    updatePromise?.reject("ERROR", "Downloaded file is too small ($fileSize bytes). Probably got an HTML page instead of APK.")
                                    cursor.close()
                                    return
                                }
                                
                                val uri = downloadManager.getUriForDownloadedFile(downloadId)
                                
                                if (uri != null) {
                                    android.util.Log.d("UpdateModule", "Installing APK from: $uri")
                                    installApk(uri)
                                    updatePromise?.resolve(true)
                                } else {
                                    android.util.Log.e("UpdateModule", "Failed to get downloaded file URI")
                                    updatePromise?.reject("ERROR", "Failed to get downloaded file URI")
                                }
                            }
                            DownloadManager.STATUS_FAILED -> {
                                val reasonIndex = cursor.getColumnIndex(DownloadManager.COLUMN_REASON)
                                val reason = cursor.getInt(reasonIndex)
                                val reasonText = when (reason) {
                                    DownloadManager.ERROR_CANNOT_RESUME -> "Cannot resume download"
                                    DownloadManager.ERROR_DEVICE_NOT_FOUND -> "No external storage device found"
                                    DownloadManager.ERROR_FILE_ALREADY_EXISTS -> "File already exists"
                                    DownloadManager.ERROR_FILE_ERROR -> "Storage issue"
                                    DownloadManager.ERROR_HTTP_DATA_ERROR -> "HTTP data error"
                                    DownloadManager.ERROR_INSUFFICIENT_SPACE -> "Insufficient storage space"
                                    DownloadManager.ERROR_TOO_MANY_REDIRECTS -> "Too many redirects"
                                    DownloadManager.ERROR_UNHANDLED_HTTP_CODE -> "Unhandled HTTP response code"
                                    DownloadManager.ERROR_UNKNOWN -> "Unknown error"
                                    else -> "Error code: $reason"
                                }
                                android.util.Log.e("UpdateModule", "Download failed: $reasonText")
                                updatePromise?.reject("ERROR", "Download failed: $reasonText")
                            }
                            else -> {
                                android.util.Log.e("UpdateModule", "Download status: $status")
                                updatePromise?.reject("ERROR", "Unexpected download status: $status")
                            }
                        }
                    } else {
                        android.util.Log.e("UpdateModule", "Download query returned no results")
                        updatePromise?.reject("ERROR", "Download not found in download manager")
                    }
                    cursor.close()
                } catch (e: Exception) {
                    android.util.Log.e("UpdateModule", "Error processing download: ${e.message}", e)
                    updatePromise?.reject("ERROR", "Failed to process download: ${e.message}")
                } finally {
                    updatePromise = null
                    try {
                        reactApplicationContext.unregisterReceiver(this)
                    } catch (e: Exception) {
                        // Already unregistered
                    }
                }
            }
        }
    }

    private fun installApk(uri: Uri) {
        try {
            // Try silent install if in Device Owner mode
            val dpm = reactApplicationContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val adminComponent = ComponentName(reactApplicationContext, DeviceAdminReceiver::class.java)
            
            if (dpm.isDeviceOwnerApp(reactApplicationContext.packageName)) {
                android.util.Log.d("UpdateModule", "Device Owner detected - attempting silent install")
                
                // Convert content:// URI to file:// path for PackageInstaller
                val downloadManager = reactApplicationContext.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
                val query = DownloadManager.Query().setFilterById(downloadId)
                val cursor = downloadManager.query(query)
                
                if (cursor.moveToFirst()) {
                    val localUriIndex = cursor.getColumnIndex(DownloadManager.COLUMN_LOCAL_URI)
                    val localUriString = cursor.getString(localUriIndex)
                    val file = File(Uri.parse(localUriString).path ?: "")
                    cursor.close()
                    
                    if (file.exists()) {
                        android.util.Log.d("UpdateModule", "Installing from file: ${file.absolutePath}")
                        
                        // Use DevicePolicyManager to install silently
                        val packageInstaller = reactApplicationContext.packageManager.packageInstaller
                        val params = android.content.pm.PackageInstaller.SessionParams(
                            android.content.pm.PackageInstaller.SessionParams.MODE_FULL_INSTALL
                        )
                        
                        val sessionId = packageInstaller.createSession(params)
                        val session = packageInstaller.openSession(sessionId)
                        
                        session.openWrite("package", 0, -1).use { output ->
                            file.inputStream().use { input ->
                                input.copyTo(output)
                            }
                            session.fsync(output)
                        }
                        
                        // Create install intent
                        val intent = Intent(reactApplicationContext, UpdateInstallReceiver::class.java)
                        val pendingIntent = android.app.PendingIntent.getBroadcast(
                            reactApplicationContext,
                            0,
                            intent,
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                                android.app.PendingIntent.FLAG_MUTABLE
                            } else {
                                0
                            }
                        )
                        
                        session.commit(pendingIntent.intentSender)
                        session.close()
                        
                        android.util.Log.d("UpdateModule", "Silent install initiated")
                        return
                    }
                }
                
                android.util.Log.w("UpdateModule", "Failed to get file path, falling back to normal install")
            } else {
                android.util.Log.d("UpdateModule", "Not in Device Owner mode - using normal install")
            }
        } catch (e: Exception) {
            android.util.Log.e("UpdateModule", "Silent install failed: ${e.message}", e)
            android.util.Log.d("UpdateModule", "Falling back to normal install method")
        }
        
        // Fallback to normal install method
        android.util.Log.d("UpdateModule", "Starting normal APK install from URI: $uri")
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION
        }
        reactApplicationContext.startActivity(intent)
        
        // Monitor installation completion for auto-restart (non-Device Owner mode)
        // We can't get a callback for ACTION_VIEW install, so we monitor package changes
        monitorInstallationCompletion()
    }
    
    private fun monitorInstallationCompletion() {
        // Register a receiver to detect when our package is replaced
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_PACKAGE_REPLACED)
            addDataScheme("package")
        }
        
        val installMonitor = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                val packageName = intent?.data?.schemeSpecificPart
                if (packageName == reactApplicationContext.packageName) {
                    android.util.Log.d("UpdateModule", "Package replaced detected - app will restart automatically")
                    // The system will restart our app automatically after package replacement
                    try {
                        reactApplicationContext.unregisterReceiver(this)
                    } catch (e: Exception) {
                        // Already unregistered
                    }
                }
            }
        }
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            reactApplicationContext.registerReceiver(installMonitor, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            reactApplicationContext.registerReceiver(installMonitor, filter)
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for EventEmitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for EventEmitter
    }
}

/**
 * BroadcastReceiver for silent installation results
 */
class UpdateInstallReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
        val status = intent?.getIntExtra(android.content.pm.PackageInstaller.EXTRA_STATUS, -1)
        when (status) {
            android.content.pm.PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                android.util.Log.d("UpdateInstallReceiver", "Installation requires user action")
                val confirmIntent = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
                if (confirmIntent != null) {
                    confirmIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    context?.startActivity(confirmIntent)
                }
            }
            android.content.pm.PackageInstaller.STATUS_SUCCESS -> {
                android.util.Log.d("UpdateInstallReceiver", "Installation succeeded - restarting app")
                // Restart the app after successful installation
                context?.let { ctx ->
                    val packageManager = ctx.packageManager
                    val launchIntent = packageManager.getLaunchIntentForPackage(ctx.packageName)
                    if (launchIntent != null) {
                        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                            ctx.startActivity(launchIntent)
                        }, 1000) // Wait 1 second to ensure installation is fully complete
                    }
                }
            }
            android.content.pm.PackageInstaller.STATUS_FAILURE,
            android.content.pm.PackageInstaller.STATUS_FAILURE_ABORTED,
            android.content.pm.PackageInstaller.STATUS_FAILURE_BLOCKED,
            android.content.pm.PackageInstaller.STATUS_FAILURE_CONFLICT,
            android.content.pm.PackageInstaller.STATUS_FAILURE_INCOMPATIBLE,
            android.content.pm.PackageInstaller.STATUS_FAILURE_INVALID,
            android.content.pm.PackageInstaller.STATUS_FAILURE_STORAGE -> {
                val message = intent.getStringExtra(android.content.pm.PackageInstaller.EXTRA_STATUS_MESSAGE)
                android.util.Log.e("UpdateInstallReceiver", "Installation failed: $message (status: $status)")
            }
        }
    }
}
