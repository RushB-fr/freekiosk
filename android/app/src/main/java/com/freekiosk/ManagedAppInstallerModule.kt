package com.freekiosk

import android.app.PendingIntent
import android.app.admin.DevicePolicyManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageInstaller
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Installs a *managed third-party APK* pushed by FreeKiosk Cloud (OTA).
 *
 * Distinct from [UpdateModule], which self-updates FreeKiosk from GitHub and is
 * gated by ENABLE_SELF_UPDATE. This module downloads an arbitrary APK over an
 * authenticated URL and installs it **silently via the PackageInstaller session
 * API**, which only succeeds in Device Owner mode (a kiosk cannot show the
 * system install prompt). The silent-install path mirrors UpdateModule.installApk().
 */
class ManagedAppInstallerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "ManagedAppInstaller"

    companion object {
        private const val TAG = "ManagedAppInstaller"
        private const val INSTALL_ACTION = "com.freekiosk.MANAGED_APP_INSTALL_RESULT"
        private const val MIN_APK_BYTES = 50_000L // anything smaller is almost certainly an HTML error page
    }

    @ReactMethod
    fun isDeviceOwner(promise: Promise) {
        try {
            val dpm = reactApplicationContext
                .getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            promise.resolve(dpm.isDeviceOwnerApp(reactApplicationContext.packageName))
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    /**
     * Download [downloadUrl] (with an optional `Authorization: Bearer <authToken>`
     * header) and install it silently. Rejects if not Device Owner, on download
     * failure, or on install failure. Resolves with `{status, package}` on success.
     */
    @ReactMethod
    fun installFromUrl(
        downloadUrl: String,
        authToken: String?,
        expectedPackage: String?,
        promise: Promise,
    ) {
        Thread {
            var apkFile: File? = null
            try {
                val dpm = reactApplicationContext
                    .getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
                if (!dpm.isDeviceOwnerApp(reactApplicationContext.packageName)) {
                    promise.reject(
                        "NOT_DEVICE_OWNER",
                        "Silent install requires Device Owner mode.",
                    )
                    return@Thread
                }
                if (downloadUrl.isEmpty()) {
                    promise.reject("BAD_URL", "Download URL is empty.")
                    return@Thread
                }

                apkFile = downloadApk(downloadUrl, authToken)
                // installSilently owns the promise from here (async via receiver).
                installSilently(apkFile, expectedPackage, promise)
            } catch (e: Exception) {
                android.util.Log.e(TAG, "Install error: ${e.message}", e)
                apkFile?.delete()
                promise.reject("INSTALL_ERROR", e.message ?: "Unknown install error", e)
            }
        }.start()
    }

    private fun downloadApk(downloadUrl: String, authToken: String?): File {
        val conn = (URL(downloadUrl).openConnection() as HttpURLConnection).apply {
            connectTimeout = 30_000
            readTimeout = 120_000
            requestMethod = "GET"
            instanceFollowRedirects = true
            if (!authToken.isNullOrEmpty()) {
                setRequestProperty("Authorization", "Bearer $authToken")
            }
            setRequestProperty("Accept", "application/vnd.android.package-archive")
            setRequestProperty("User-Agent", "FreeKiosk-ManagedInstaller")
        }

        try {
            conn.connect()
            if (conn.responseCode !in 200..299) {
                throw RuntimeException("Download failed: HTTP ${conn.responseCode}")
            }

            val dir = File(reactApplicationContext.cacheDir, "managed_apks").apply { mkdirs() }
            dir.listFiles()?.forEach { it.delete() } // clean up previous downloads
            val outFile = File(dir, "managed-${System.currentTimeMillis()}.apk")

            conn.inputStream.use { input ->
                outFile.outputStream().use { output -> input.copyTo(output) }
            }

            if (outFile.length() < MIN_APK_BYTES) {
                val size = outFile.length()
                outFile.delete()
                throw RuntimeException("Downloaded file too small ($size bytes); likely not an APK.")
            }
            return outFile
        } finally {
            conn.disconnect()
        }
    }

    private fun installSilently(apkFile: File, expectedPackage: String?, promise: Promise) {
        val context = reactApplicationContext
        val packageInstaller = context.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(
            PackageInstaller.SessionParams.MODE_FULL_INSTALL
        )
        if (!expectedPackage.isNullOrEmpty()) {
            params.setAppPackageName(expectedPackage)
        }

        val sessionId = packageInstaller.createSession(params)
        val session = packageInstaller.openSession(sessionId)
        session.openWrite("package", 0, apkFile.length()).use { output ->
            apkFile.inputStream().use { input -> input.copyTo(output) }
            session.fsync(output)
        }

        // Per-session broadcast carries the PackageInstaller result back to us so
        // we can resolve/reject the JS promise.
        val action = "$INSTALL_ACTION.$sessionId"
        val settled = AtomicBoolean(false)
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(c: Context?, intent: Intent?) {
                if (!settled.compareAndSet(false, true)) return
                try { context.unregisterReceiver(this) } catch (_: Exception) {}
                apkFile.delete()

                val status = intent?.getIntExtra(
                    PackageInstaller.EXTRA_STATUS,
                    PackageInstaller.STATUS_FAILURE,
                ) ?: PackageInstaller.STATUS_FAILURE
                val message = intent?.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: ""

                if (status == PackageInstaller.STATUS_SUCCESS) {
                    val result = Arguments.createMap().apply {
                        putString("status", "success")
                        putString("package", expectedPackage ?: "")
                    }
                    promise.resolve(result)
                } else {
                    promise.reject("INSTALL_FAILED", "Install failed (status $status): $message")
                }
            }
        }
        val filter = IntentFilter(action)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            context.registerReceiver(receiver, filter)
        }

        val intent = Intent(action).setPackage(context.packageName)
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            PendingIntent.FLAG_MUTABLE
        } else {
            0
        }
        val pendingIntent = PendingIntent.getBroadcast(context, sessionId, intent, flags)
        session.commit(pendingIntent.intentSender)
        session.close()
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for RN built-in EventEmitter calls
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for RN built-in EventEmitter calls
    }
}
