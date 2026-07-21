package com.freekiosk

import android.Manifest
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.wifi.ScanResult
import android.net.wifi.WifiConfiguration
import android.net.wifi.WifiManager
import android.net.wifi.WifiNetworkSpecifier
import android.net.wifi.WifiNetworkSuggestion
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

class WifiControlModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var scanReceiver: BroadcastReceiver? = null
    private var activeNetworkCallback: ConnectivityManager.NetworkCallback? = null
    private var activeWifiStatusPoll: Runnable? = null
    private var wifiRequestOriginalLockTaskPackages: Array<String>? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    override fun getName(): String = "WifiControlModule"

    override fun onCatalystInstanceDestroy() {
        unregisterScanReceiver()
        releaseActiveNetworkRequest()
    }

    // ─── State ────────────────────────────────────────────────────────────────

    @ReactMethod
    fun getWifiInfo(promise: Promise) {
        try {
            val wifiManager = reactContext.applicationContext
                .getSystemService(Context.WIFI_SERVICE) as WifiManager
            val connectivityManager = reactContext
                .getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

            val result = Arguments.createMap()
            val isEnabled = wifiManager.isWifiEnabled
            result.putBoolean("isEnabled", isEnabled)

            val isConnected = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val net = connectivityManager.activeNetwork
                val caps = connectivityManager.getNetworkCapabilities(net)
                caps?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
            } else {
                @Suppress("DEPRECATION")
                connectivityManager.getNetworkInfo(ConnectivityManager.TYPE_WIFI)?.isConnected == true
            }
            result.putBoolean("isConnected", isConnected)

            if (isConnected) {
                @Suppress("DEPRECATION")
                val info = wifiManager.connectionInfo
                val ssid = info.ssid?.replace("\"", "")?.trim() ?: ""
                result.putString("ssid", ssid)
                result.putInt("signalLevel", WifiManager.calculateSignalLevel(info.rssi, 5))
                result.putInt("rssi", info.rssi)
            } else {
                result.putString("ssid", "")
                result.putInt("signalLevel", 0)
                result.putInt("rssi", 0)
            }

            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("WIFI_ERROR", e.message, e)
        }
    }

    // ─── Toggle ───────────────────────────────────────────────────────────────

    @ReactMethod
    fun setWifiEnabled(enabled: Boolean, promise: Promise) {
        try {
            val wifiManager = reactContext.applicationContext
                .getSystemService(Context.WIFI_SERVICE) as WifiManager

            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || isDeviceOwner()) {
                // Pre-Android 10 allows direct toggles. Device-owner kiosk builds
                // may also be allowed on newer Android versions, so try it directly.
                @Suppress("DEPRECATION")
                val success = try {
                    wifiManager.setWifiEnabled(enabled)
                } catch (security: SecurityException) {
                    android.util.Log.w("WifiControlModule", "setWifiEnabled denied: ${security.message}")
                    false
                }
                val result = Arguments.createMap()
                result.putBoolean("success", success)
                result.putBoolean("requiresSystemPanel", !success && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
                promise.resolve(result)
            } else {
                // Android 10+: setWifiEnabled() is blocked for non-system apps.
                // FreeKiosk uses its in-app WiFi UI in this case.
                val result = Arguments.createMap()
                result.putBoolean("success", false)
                result.putBoolean("requiresSystemPanel", true)
                promise.resolve(result)
            }
        } catch (e: Exception) {
            promise.reject("WIFI_TOGGLE_ERROR", e.message, e)
        }
    }

    private fun isDeviceOwner(): Boolean {
        return try {
            val dpm = reactContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            dpm.isDeviceOwnerApp(reactContext.packageName)
        } catch (_: Exception) {
            false
        }
    }

    // ─── Scan ─────────────────────────────────────────────────────────────────

    @ReactMethod
    fun startScan(promise: Promise) {
        try {
            val wifiManager = reactContext.applicationContext
                .getSystemService(Context.WIFI_SERVICE) as WifiManager

            if (!wifiManager.isWifiEnabled) {
                promise.reject("WIFI_DISABLED", "WiFi is disabled")
                return
            }

            val missing = missingScanPermissions()
            if (missing.isNotEmpty()) {
                promise.reject(
                    "SCAN_PERMISSION_MISSING",
                    "Missing permissions for WiFi scan results: ${missing.joinToString(", ")}"
                )
                return
            }

            unregisterScanReceiver()

            scanReceiver = object : BroadcastReceiver() {
                override fun onReceive(context: Context, intent: Intent) {
                    emitScanResults(wifiManager)
                }
            }

            reactContext.registerReceiver(
                scanReceiver,
                IntentFilter(WifiManager.SCAN_RESULTS_AVAILABLE_ACTION)
            )

            @Suppress("DEPRECATION")
            val started = wifiManager.startScan()
            if (!started) {
                emitScanResults(wifiManager)
            } else {
                mainHandler.postDelayed({
                    if (scanReceiver != null) {
                        emitScanResults(wifiManager)
                    }
                }, 3000)
            }
            promise.resolve(started)
        } catch (e: Exception) {
            promise.reject("SCAN_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getScanResults(promise: Promise) {
        try {
            val wifiManager = reactContext.applicationContext
                .getSystemService(Context.WIFI_SERVICE) as WifiManager
            val missing = missingScanPermissions()
            if (missing.isNotEmpty()) {
                promise.reject(
                    "SCAN_PERMISSION_MISSING",
                    "Missing permissions for WiFi scan results: ${missing.joinToString(", ")}"
                )
                return
            }
            promise.resolve(buildScanResults(wifiManager))
        } catch (e: Exception) {
            promise.reject("SCAN_RESULTS_ERROR", e.message, e)
        }
    }

    private fun missingScanPermissions(): List<String> {
        val missing = mutableListOf<String>()
        if (ContextCompat.checkSelfPermission(reactContext, Manifest.permission.ACCESS_FINE_LOCATION)
            != PackageManager.PERMISSION_GRANTED) {
            missing.add(Manifest.permission.ACCESS_FINE_LOCATION)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(reactContext, Manifest.permission.NEARBY_WIFI_DEVICES)
            != PackageManager.PERMISSION_GRANTED) {
            missing.add(Manifest.permission.NEARBY_WIFI_DEVICES)
        }
        return missing
    }

    private fun emitScanResults(wifiManager: WifiManager) {
        unregisterScanReceiver()
        sendEvent("wifiScanResults", buildScanResults(wifiManager))
    }

    private fun buildScanResults(wifiManager: WifiManager): WritableArray {
        val arr = Arguments.createArray()
        if (missingScanPermissions().isNotEmpty()) return arr

        val seen = mutableSetOf<String>()
        val raw: List<ScanResult> = try {
            @Suppress("DEPRECATION")
            wifiManager.scanResults ?: emptyList()
        } catch (e: SecurityException) {
            emptyList()
        }

        // Sort by signal level descending
        raw.sortedByDescending { it.level }.forEach { sr ->
            val ssid = sr.SSID?.trim() ?: ""
            if (ssid.isEmpty() || !seen.add(ssid)) return@forEach

            val net = Arguments.createMap()
            net.putString("ssid", ssid)
            net.putString("bssid", sr.BSSID ?: "")
            net.putInt("signalLevel", WifiManager.calculateSignalLevel(sr.level, 5))
            net.putInt("rssi", sr.level)
            val secured = sr.capabilities?.let {
                it.contains("WPA") || it.contains("WEP") || it.contains("PSK") ||
                    it.contains("SAE") || it.contains("EAP")
            } ?: false
            net.putBoolean("secured", secured)
            net.putString("capabilities", sr.capabilities ?: "")
            arr.pushMap(net)
        }
        return arr
    }

    // ─── Connect ──────────────────────────────────────────────────────────────

    @ReactMethod
    fun connectToNetwork(ssid: String, password: String, promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                connectApi29(ssid, password, promise)
            } else {
                @Suppress("DEPRECATION")
                connectLegacy(ssid, password, promise)
            }
        } catch (e: Exception) {
            promise.reject("CONNECT_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun disconnectFromCurrentNetwork(promise: Promise) {
        try {
            val wifiManager = reactContext.applicationContext
                .getSystemService(Context.WIFI_SERVICE) as WifiManager
            val connectivityManager = reactContext.applicationContext
                .getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

            releaseActiveNetworkRequest(connectivityManager)

            @Suppress("DEPRECATION")
            val disconnected = try { wifiManager.disconnect() } catch (_: Exception) { false }

            val result = Arguments.createMap()
            result.putBoolean("success", disconnected)
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("DISCONNECT_ERROR", e.message, e)
        }
    }

    @Suppress("NewApi")
    private fun connectApi29(ssid: String, password: String, promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (!connectPrivileged(ssid, password, promise)) {
                promise.reject(
                    "ADD_NETWORK_PRIVILEGED_DENIED",
                    "Android denied device-owner WiFi configuration for \"$ssid\"; refusing app-scoped fallback because it would not become the device default network"
                )
            }
            return
        }

        // Fallback for Android 10/11. This creates an app-scoped request, so it
        // is not suitable as the primary kiosk path on modern device-owner builds.
        val wifiManager = reactContext.applicationContext
            .getSystemService(Context.WIFI_SERVICE) as WifiManager
        val connectivityManager = reactContext.applicationContext
            .getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

        val suggestionBuilder = WifiNetworkSuggestion.Builder().setSsid(ssid)
        if (password.isNotEmpty()) {
            suggestionBuilder.setWpa2Passphrase(password)
        }
        val suggestion = suggestionBuilder.build()

        // Remove any stale suggestion for this SSID before adding the new one
        wifiManager.removeNetworkSuggestions(listOf(suggestion))
        val status = wifiManager.addNetworkSuggestions(listOf(suggestion))

        if (status != WifiManager.STATUS_NETWORK_SUGGESTIONS_SUCCESS &&
            status != WifiManager.STATUS_NETWORK_SUGGESTIONS_ERROR_ADD_DUPLICATE) {
            promise.reject("CONNECT_ERROR", "addNetworkSuggestions failed: status=$status")
            return
        }

        releaseActiveNetworkRequest(connectivityManager)
        allowWifiRequestDialogInLockTask()

        val specifierBuilder = WifiNetworkSpecifier.Builder().setSsid(ssid)
        if (password.isNotEmpty()) {
            specifierBuilder.setWpa2Passphrase(password)
        }

        val request = NetworkRequest.Builder()
            .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
            .setNetworkSpecifier(specifierBuilder.build())
            .build()

        var settled = false
        val timeout = Runnable {
            if (settled) return@Runnable
            settled = true
            releaseActiveNetworkRequest(connectivityManager)
            restoreLockTaskPackages()
            promise.reject(
                "CONNECT_TIMEOUT",
                "Android did not connect to \"$ssid\". Check the password or approve the WiFi connection prompt."
            )
        }

        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                if (settled) return
                settled = true
                mainHandler.removeCallbacks(timeout)
                connectivityManager.bindProcessToNetwork(network)
                restoreLockTaskPackages()
                val result = Arguments.createMap()
                result.putBoolean("success", true)
                result.putString("ssid", ssid)
                result.putBoolean("processBound", true)
                promise.resolve(result)
            }

            override fun onUnavailable() {
                if (settled) return
                settled = true
                mainHandler.removeCallbacks(timeout)
                releaseActiveNetworkRequest(connectivityManager)
                restoreLockTaskPackages()
                promise.reject("CONNECT_UNAVAILABLE", "Android could not connect to \"$ssid\"")
            }
        }

        activeNetworkCallback = callback
        mainHandler.postDelayed(timeout, 30000)
        try {
            @Suppress("DEPRECATION")
            wifiManager.startScan()
            connectivityManager.requestNetwork(request, callback)
        } catch (e: Exception) {
            mainHandler.removeCallbacks(timeout)
            releaseActiveNetworkRequest(connectivityManager)
            restoreLockTaskPackages()
            promise.reject("CONNECT_REQUEST_ERROR", e.message, e)
        }
    }

    @Suppress("DEPRECATION", "NewApi")
    private fun connectPrivileged(ssid: String, password: String, promise: Promise): Boolean {
        val wifiManager = reactContext.applicationContext
            .getSystemService(Context.WIFI_SERVICE) as WifiManager
        val connectivityManager = reactContext.applicationContext
            .getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

        val config = buildWifiConfiguration(ssid, password)
        val addResult = try {
            wifiManager.addNetworkPrivileged(config)
        } catch (security: SecurityException) {
            android.util.Log.w("WifiControlModule", "addNetworkPrivileged denied: ${security.message}")
            return false
        } catch (e: Exception) {
            promise.reject("ADD_NETWORK_PRIVILEGED_ERROR", e.message, e)
            return true
        }

        if (addResult.statusCode != WifiManager.AddNetworkResult.STATUS_SUCCESS) {
            android.util.Log.w(
                "WifiControlModule",
                "addNetworkPrivileged failed for $ssid: status=${addResult.statusCode}"
            )
            return false
        }

        releaseActiveNetworkRequest(connectivityManager)
        val netId = addResult.networkId
        if (netId < 0) {
            promise.reject("ADD_NETWORK_PRIVILEGED_FAILED", "Android did not return a valid network id for \"$ssid\"")
            return true
        }

        try {
            wifiManager.allowAutojoinGlobal(true)
        } catch (e: Exception) {
            android.util.Log.w("WifiControlModule", "Could not enable global WiFi autojoin: ${e.message}")
        }

        wifiManager.disconnect()
        val enabled = wifiManager.enableNetwork(netId, true)
        if (!enabled) {
            promise.reject("ENABLE_NETWORK_FAILED", "Android could not enable \"$ssid\" as the selected WiFi network")
            return true
        }

        wifiManager.reconnect()
        android.util.Log.d("WifiControlModule", "Requested default WiFi connection for $ssid using addNetworkPrivileged netId=$netId")
        waitForDefaultWifi(ssid, promise)
        return true
    }

    // Pre-Android 10: Use the (deprecated) WifiConfiguration approach which
    // does not require a system dialog and works silently.
    @Suppress("DEPRECATION")
    private fun connectLegacy(ssid: String, password: String, promise: Promise) {
        val wifiManager = reactContext.applicationContext
            .getSystemService(Context.WIFI_SERVICE) as WifiManager

        val config = buildWifiConfiguration(ssid, password)

        val netId = wifiManager.addNetwork(config)
        if (netId == -1) {
            promise.reject("ADD_NETWORK_FAILED", "Failed to add network configuration for $ssid")
            return
        }

        wifiManager.disconnect()
        val enabled = wifiManager.enableNetwork(netId, true)
        wifiManager.reconnect()

        val result = Arguments.createMap()
        result.putBoolean("success", enabled)
        result.putString("ssid", ssid)
        promise.resolve(result)
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private fun sendEvent(eventName: String, params: Any?) {
        try {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        } catch (e: Exception) {
            // JS bridge may not be ready yet
        }
    }

    private fun unregisterScanReceiver() {
        scanReceiver?.let {
            try { reactContext.unregisterReceiver(it) } catch (_: Exception) {}
            scanReceiver = null
        }
    }

    @Suppress("DEPRECATION")
    private fun buildWifiConfiguration(ssid: String, password: String): WifiConfiguration {
        return WifiConfiguration().apply {
            SSID = "\"$ssid\""
            if (password.isEmpty()) {
                allowedKeyManagement.set(WifiConfiguration.KeyMgmt.NONE)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    setSecurityParams(WifiConfiguration.SECURITY_TYPE_OPEN)
                }
            } else {
                preSharedKey = "\"$password\""
                allowedKeyManagement.set(WifiConfiguration.KeyMgmt.WPA_PSK)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    setSecurityParams(WifiConfiguration.SECURITY_TYPE_PSK)
                }
            }
        }
    }

    private fun waitForDefaultWifi(ssid: String, promise: Promise) {
        val wifiManager = reactContext.applicationContext
            .getSystemService(Context.WIFI_SERVICE) as WifiManager
        val connectivityManager = reactContext.applicationContext
            .getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val startedAt = System.currentTimeMillis()
        val timeoutMs = 30_000L

        activeWifiStatusPoll?.let { mainHandler.removeCallbacks(it) }
        activeWifiStatusPoll = object : Runnable {
            override fun run() {
                val activeNetwork = connectivityManager.activeNetwork
                val caps = connectivityManager.getNetworkCapabilities(activeNetwork)
                @Suppress("DEPRECATION")
                val currentSsid = wifiManager.connectionInfo?.ssid?.replace("\"", "")?.trim().orEmpty()
                val isDefaultWifi = caps?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
                val hasInternet = caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
                val isValidated = caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true

                if (isDefaultWifi && hasInternet && isValidated && currentSsid == ssid) {
                    activeWifiStatusPoll = null
                    val result = Arguments.createMap()
                    result.putBoolean("success", true)
                    result.putString("ssid", ssid)
                    result.putBoolean("validated", isValidated)
                    promise.resolve(result)
                    return
                }

                if (System.currentTimeMillis() - startedAt >= timeoutMs) {
                    activeWifiStatusPoll = null
                    promise.reject(
                        "CONNECT_TIMEOUT",
                        "Android joined \"$currentSsid\" but did not validate \"$ssid\" as the default WiFi internet network"
                    )
                    return
                }

                mainHandler.postDelayed(this, 500)
            }
        }
        mainHandler.post(activeWifiStatusPoll!!)
    }

    private fun releaseActiveNetworkRequest(
        connectivityManager: ConnectivityManager? = reactContext.applicationContext
            .getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
    ) {
        activeWifiStatusPoll?.let {
            mainHandler.removeCallbacks(it)
            activeWifiStatusPoll = null
        }
        activeNetworkCallback?.let { callback ->
            try { connectivityManager?.unregisterNetworkCallback(callback) } catch (_: Exception) {}
            activeNetworkCallback = null
        }
        try { connectivityManager?.bindProcessToNetwork(null) } catch (_: Exception) {}
    }

    private fun allowWifiRequestDialogInLockTask() {
        try {
            val dpm = reactContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val admin = ComponentName(reactContext, DeviceAdminReceiver::class.java)
            if (!dpm.isDeviceOwnerApp(reactContext.packageName)) return

            val currentPackages = dpm.getLockTaskPackages(admin)
            if (wifiRequestOriginalLockTaskPackages == null) {
                wifiRequestOriginalLockTaskPackages = currentPackages
            }

            val settingsPackages = resolveWifiRequestDialogPackages()
            val updated = (currentPackages.toList() + settingsPackages).distinct()
            if (updated.size != currentPackages.size) {
                dpm.setLockTaskPackages(admin, updated.toTypedArray())
                android.util.Log.d("WifiControlModule", "Temporarily whitelisted WiFi request dialog packages: $settingsPackages")
            }
        } catch (e: Exception) {
            android.util.Log.w("WifiControlModule", "Could not update lock task whitelist for WiFi request dialog: ${e.message}")
        }
    }

    private fun restoreLockTaskPackages() {
        val original = wifiRequestOriginalLockTaskPackages ?: return
        try {
            val dpm = reactContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val admin = ComponentName(reactContext, DeviceAdminReceiver::class.java)
            if (dpm.isDeviceOwnerApp(reactContext.packageName)) {
                dpm.setLockTaskPackages(admin, original)
                android.util.Log.d("WifiControlModule", "Restored lock task packages after WiFi request")
            }
        } catch (e: Exception) {
            android.util.Log.w("WifiControlModule", "Could not restore lock task packages after WiFi request: ${e.message}")
        } finally {
            wifiRequestOriginalLockTaskPackages = null
        }
    }

    private fun resolveWifiRequestDialogPackages(): List<String> {
        val packages = mutableSetOf("com.android.settings")
        try {
            val intent = Intent("com.android.settings.wifi.action.NETWORK_REQUEST").apply {
                addCategory(Intent.CATEGORY_DEFAULT)
            }
            reactContext.packageManager.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY)
                .forEach { info ->
                    info.activityInfo?.packageName?.let { packages.add(it) }
                }
        } catch (_: Exception) {}
        return packages.toList()
    }

    // Required for addListener / removeListeners to suppress RN warnings
    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}
}
