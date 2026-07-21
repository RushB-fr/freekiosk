package com.freekiosk

import android.Manifest
import android.app.admin.DevicePolicyManager
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.content.ComponentName
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
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
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

class BluetoothControlModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var discoveryReceiver: BroadcastReceiver? = null
    private var bluetoothPairingOriginalLockTaskPackages: Array<String>? = null

    override fun getName(): String = "BluetoothControlModule"

    override fun onCatalystInstanceDestroy() {
        unregisterDiscoveryReceiver()
    }

    private fun getAdapter(): BluetoothAdapter? {
        val manager = reactContext.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        return manager?.adapter
    }

    // ─── State ────────────────────────────────────────────────────────────────

    @ReactMethod
    fun getBluetoothInfo(promise: Promise) {
        try {
            val adapter = getAdapter()
            val result = Arguments.createMap()

            if (adapter == null) {
                result.putBoolean("supported", false)
                result.putBoolean("isEnabled", false)
                result.putArray("bondedDevices", Arguments.createArray())
                promise.resolve(result)
                return
            }

            result.putBoolean("supported", true)
            result.putBoolean("isEnabled", adapter.isEnabled)
            result.putArray("bondedDevices", buildBondedDevices(adapter))
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("BT_ERROR", e.message, e)
        }
    }

    private fun buildBondedDevices(adapter: BluetoothAdapter): WritableArray {
        val arr = Arguments.createArray()
        val hasPermission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ContextCompat.checkSelfPermission(
                reactContext, Manifest.permission.BLUETOOTH_CONNECT
            ) == PackageManager.PERMISSION_GRANTED
        } else true

        if (!hasPermission) return arr

        try {
            adapter.bondedDevices?.forEach { device ->
                val map = Arguments.createMap()
                map.putString("address", device.address)
                map.putString("name", getDeviceDisplayName(device))
                map.putInt("type", device.type)

                // Check if currently connected via reflection (hidden API)
                val connected = try {
                    val method = device.javaClass.getMethod("isConnected")
                    method.invoke(device) as? Boolean ?: false
                } catch (_: Exception) { false }

                map.putBoolean("connected", connected)
                arr.pushMap(map)
            }
        } catch (_: SecurityException) {}
        return arr
    }

    // ─── Toggle ───────────────────────────────────────────────────────────────

    @ReactMethod
    fun setBluetoothEnabled(enabled: Boolean, promise: Promise) {
        try {
            val adapter = getAdapter()
            if (adapter == null) {
                promise.reject("BT_NOT_SUPPORTED", "Bluetooth not supported on this device")
                return
            }

            // BLUETOOTH_CONNECT permission required on Android 12+ (API 31+)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val granted = ContextCompat.checkSelfPermission(
                    reactContext, Manifest.permission.BLUETOOTH_CONNECT
                ) == PackageManager.PERMISSION_GRANTED
                if (!granted) {
                    promise.reject("PERMISSION_DENIED", "BLUETOOTH_CONNECT permission not granted")
                    return
                }
            }

            val result = Arguments.createMap()
            if (enabled) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    // Android 13+: enable() is deprecated but still functional when
                    // BLUETOOTH_CONNECT permission is granted (which we have).
                    @Suppress("DEPRECATION")
                    val ok = adapter.enable()
                    result.putBoolean("success", ok)
                    result.putBoolean("requiresSystemPanel", !ok)
                } else {
                    @Suppress("DEPRECATION")
                    result.putBoolean("success", adapter.enable())
                    result.putBoolean("requiresSystemPanel", false)
                }
            } else {
                @Suppress("DEPRECATION")
                result.putBoolean("success", adapter.disable())
                result.putBoolean("requiresSystemPanel", false)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("BT_TOGGLE_ERROR", e.message, e)
        }
    }

    // ─── Discovery ────────────────────────────────────────────────────────────

    @ReactMethod
    fun startDiscovery(promise: Promise) {
        try {
            val adapter = getAdapter()
            if (adapter == null || !adapter.isEnabled) {
                promise.reject("BT_NOT_READY", "Bluetooth is not enabled")
                return
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val granted = ContextCompat.checkSelfPermission(
                    reactContext, Manifest.permission.BLUETOOTH_SCAN
                ) == PackageManager.PERMISSION_GRANTED
                if (!granted) {
                    promise.reject("PERMISSION_DENIED", "BLUETOOTH_SCAN permission not granted")
                    return
                }
            }

            unregisterDiscoveryReceiver()

            discoveryReceiver = object : BroadcastReceiver() {
                override fun onReceive(context: Context, intent: Intent) {
                    when (intent.action) {
                        BluetoothDevice.ACTION_FOUND -> {
                            val device = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                                intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
                            } else {
                                @Suppress("DEPRECATION")
                                intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
                            } ?: return

                            val rssi = intent.getShortExtra(BluetoothDevice.EXTRA_RSSI, Short.MIN_VALUE).toInt()
                            val advertisedName = intent.getStringExtra(BluetoothDevice.EXTRA_NAME)
                            val map = Arguments.createMap()
                            map.putString("address", device.address)
                            map.putString("name", getDeviceDisplayName(device, advertisedName))
                            map.putInt("rssi", rssi)
                            map.putBoolean("bonded", device.bondState == BluetoothDevice.BOND_BONDED)
                            sendEvent("bluetoothDeviceFound", map)
                        }
                        BluetoothAdapter.ACTION_DISCOVERY_FINISHED -> {
                            unregisterDiscoveryReceiver()
                            sendEvent("bluetoothDiscoveryFinished", null)
                        }
                    }
                }
            }

            val filter = IntentFilter().apply {
                addAction(BluetoothDevice.ACTION_FOUND)
                addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED)
            }
            reactContext.registerReceiver(discoveryReceiver, filter)

            if (adapter.isDiscovering) adapter.cancelDiscovery()
            val started = adapter.startDiscovery()
            promise.resolve(started)
        } catch (e: Exception) {
            promise.reject("DISCOVERY_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun stopDiscovery(promise: Promise) {
        try {
            unregisterDiscoveryReceiver()
            getAdapter()?.cancelDiscovery()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STOP_DISCOVERY_ERROR", e.message, e)
        }
    }

    // ─── Pairing ──────────────────────────────────────────────────────────────

    @ReactMethod
    fun pairDevice(address: String, promise: Promise) {
        try {
            val adapter = getAdapter() ?: run {
                promise.reject("BT_NOT_SUPPORTED", "Bluetooth not supported")
                return
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val granted = ContextCompat.checkSelfPermission(
                    reactContext, Manifest.permission.BLUETOOTH_CONNECT
                ) == PackageManager.PERMISSION_GRANTED
                if (!granted) {
                    promise.reject("PERMISSION_DENIED", "BLUETOOTH_CONNECT permission not granted")
                    return
                }
            }

            val device = adapter.getRemoteDevice(address) ?: run {
                promise.reject("DEVICE_NOT_FOUND", "No device with address $address")
                return
            }

            if (device.bondState == BluetoothDevice.BOND_BONDED) {
                val result = Arguments.createMap()
                result.putBoolean("success", true)
                result.putBoolean("alreadyBonded", true)
                promise.resolve(result)
                return
            }

            unregisterDiscoveryReceiver()
            try { adapter.cancelDiscovery() } catch (_: Exception) {}
            allowBluetoothPairingDialogsInLockTask()

            // Listen for bond state changes
            val bondReceiver = object : BroadcastReceiver() {
                override fun onReceive(context: Context, intent: Intent) {
                    if (intent.action != BluetoothDevice.ACTION_BOND_STATE_CHANGED) return
                    val changedDevice = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
                    } else {
                        @Suppress("DEPRECATION")
                        intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
                    }
                    if (changedDevice?.address != address) return

                    val bondState = intent.getIntExtra(BluetoothDevice.EXTRA_BOND_STATE, BluetoothDevice.BOND_NONE)
                    if (bondState == BluetoothDevice.BOND_BONDED) {
                        try { reactContext.unregisterReceiver(this) } catch (_: Exception) {}
                        restoreBluetoothPairingLockTaskPackages()
                        val result = Arguments.createMap()
                        result.putBoolean("success", true)
                        result.putBoolean("alreadyBonded", false)
                        promise.resolve(result)
                    } else if (bondState == BluetoothDevice.BOND_NONE) {
                        try { reactContext.unregisterReceiver(this) } catch (_: Exception) {}
                        restoreBluetoothPairingLockTaskPackages()
                        promise.reject("PAIRING_FAILED", "Pairing failed or was rejected")
                    }
                }
            }
            reactContext.registerReceiver(bondReceiver, IntentFilter(BluetoothDevice.ACTION_BOND_STATE_CHANGED))

            val initiated = device.createBond()
            if (!initiated) {
                try { reactContext.unregisterReceiver(bondReceiver) } catch (_: Exception) {}
                restoreBluetoothPairingLockTaskPackages()
                promise.reject("BOND_INITIATION_FAILED", "Could not initiate pairing with $address")
            }
        } catch (e: Exception) {
            restoreBluetoothPairingLockTaskPackages()
            promise.reject("PAIR_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun unpairDevice(address: String, promise: Promise) {
        try {
            val adapter = getAdapter() ?: run {
                promise.reject("BT_NOT_SUPPORTED", "Bluetooth not supported")
                return
            }
            val device = adapter.getRemoteDevice(address) ?: run {
                promise.reject("DEVICE_NOT_FOUND", "No device with address $address")
                return
            }
            // removeBond is a hidden API, accessed via reflection
            val method = device.javaClass.getMethod("removeBond")
            val result = method.invoke(device) as? Boolean ?: false
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("UNPAIR_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun disconnectDevice(address: String, promise: Promise) {
        changeProfileConnection(address, "disconnect", promise)
    }

    @ReactMethod
    fun connectDevice(address: String, promise: Promise) {
        changeProfileConnection(address, "connect", promise)
    }

    private fun changeProfileConnection(address: String, methodName: String, promise: Promise) {
        try {
            val adapter = getAdapter() ?: run {
                promise.reject("BT_NOT_SUPPORTED", "Bluetooth not supported")
                return
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val granted = ContextCompat.checkSelfPermission(
                    reactContext, Manifest.permission.BLUETOOTH_CONNECT
                ) == PackageManager.PERMISSION_GRANTED
                if (!granted) {
                    promise.reject("PERMISSION_DENIED", "BLUETOOTH_CONNECT permission not granted")
                    return
                }
            }

            val device = adapter.getRemoteDevice(address) ?: run {
                promise.reject("DEVICE_NOT_FOUND", "No device with address $address")
                return
            }

            val connected = try {
                val method = device.javaClass.getMethod("isConnected")
                method.invoke(device) as? Boolean ?: false
            } catch (_: Exception) { false }

            if ((methodName == "connect" && connected) || (methodName == "disconnect" && !connected)) {
                promise.resolve(true)
                return
            }

            val profiles = mutableListOf(
                BluetoothProfile.HEADSET,
                BluetoothProfile.A2DP
            )
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                profiles.add(BluetoothProfile.HEARING_AID)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                profiles.add(BluetoothProfile.LE_AUDIO)
            }

            val handler = Handler(Looper.getMainLooper())
            val pending = AtomicInteger(profiles.size)
            val resolved = AtomicBoolean(false)
            val methodInvoked = AtomicBoolean(false)
            val methodSucceeded = AtomicBoolean(false)

            fun finishIfDone() {
                if (pending.get() <= 0 && resolved.compareAndSet(false, true)) {
                    promise.resolve(methodSucceeded.get() || methodInvoked.get())
                }
            }

            val timeout = Runnable {
                if (resolved.compareAndSet(false, true)) {
                    promise.resolve(methodSucceeded.get() || methodInvoked.get())
                }
            }
            handler.postDelayed(timeout, 2500)

            profiles.forEach { profile ->
                val listener = object : BluetoothProfile.ServiceListener {
                    override fun onServiceConnected(profileId: Int, proxy: BluetoothProfile) {
                        try {
                            val method = proxy.javaClass.getMethod(methodName, BluetoothDevice::class.java)
                            val result = method.invoke(proxy, device) as? Boolean ?: false
                            methodInvoked.set(true)
                            if (result) methodSucceeded.set(true)
                        } catch (e: Exception) {
                            android.util.Log.w("BluetoothControlModule", "Could not $methodName profile $profileId: ${e.message}")
                        } finally {
                            try { adapter.closeProfileProxy(profileId, proxy) } catch (_: Exception) {}
                            pending.decrementAndGet()
                            finishIfDone()
                        }
                    }

                    override fun onServiceDisconnected(profileId: Int) {
                        pending.decrementAndGet()
                        finishIfDone()
                    }
                }

                val requested = try {
                    adapter.getProfileProxy(reactContext, listener, profile)
                } catch (e: Exception) {
                    android.util.Log.w("BluetoothControlModule", "Could not request profile $profile proxy: ${e.message}")
                    false
                }

                if (!requested) {
                    pending.decrementAndGet()
                    finishIfDone()
                }
            }
        } catch (e: Exception) {
            promise.reject("${methodName.uppercase()}_ERROR", e.message, e)
        }
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private fun sendEvent(eventName: String, params: Any?) {
        try {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        } catch (_: Exception) {}
    }

    private fun unregisterDiscoveryReceiver() {
        discoveryReceiver?.let {
            try {
                getAdapter()?.cancelDiscovery()
                reactContext.unregisterReceiver(it)
            } catch (_: Exception) {}
            discoveryReceiver = null
        }
    }

    private fun getDeviceDisplayName(device: BluetoothDevice, advertisedName: String? = null): String {
        advertisedName?.trim()?.takeIf { it.isNotEmpty() }?.let { return it }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            try {
                device.alias?.trim()?.takeIf { it.isNotEmpty() }?.let { return it }
            } catch (_: SecurityException) {}
        }

        try {
            device.name?.trim()?.takeIf { it.isNotEmpty() }?.let { return it }
        } catch (_: SecurityException) {}

        return "Unknown Bluetooth device"
    }

    private fun allowBluetoothPairingDialogsInLockTask() {
        try {
            val dpm = reactContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val admin = ComponentName(reactContext, DeviceAdminReceiver::class.java)
            if (!dpm.isDeviceOwnerApp(reactContext.packageName)) return

            val currentPackages = dpm.getLockTaskPackages(admin)
            if (bluetoothPairingOriginalLockTaskPackages == null) {
                bluetoothPairingOriginalLockTaskPackages = currentPackages
            }

            val pairingPackages = resolveBluetoothPairingDialogPackages()
            val updated = (currentPackages.toList() + pairingPackages).distinct()
            if (updated.toSet() != currentPackages.toSet()) {
                dpm.setLockTaskPackages(admin, updated.toTypedArray())
                android.util.Log.d("BluetoothControlModule", "Temporarily whitelisted Bluetooth pairing packages: $pairingPackages")
            }
        } catch (e: Exception) {
            android.util.Log.w("BluetoothControlModule", "Could not update lock task whitelist for Bluetooth pairing: ${e.message}")
        }
    }

    private fun restoreBluetoothPairingLockTaskPackages() {
        val original = bluetoothPairingOriginalLockTaskPackages ?: return
        try {
            val dpm = reactContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val admin = ComponentName(reactContext, DeviceAdminReceiver::class.java)
            if (dpm.isDeviceOwnerApp(reactContext.packageName)) {
                dpm.setLockTaskPackages(admin, original)
                android.util.Log.d("BluetoothControlModule", "Restored lock task packages after Bluetooth pairing")
            }
        } catch (e: Exception) {
            android.util.Log.w("BluetoothControlModule", "Could not restore lock task packages after Bluetooth pairing: ${e.message}")
        } finally {
            bluetoothPairingOriginalLockTaskPackages = null
        }
    }

    private fun resolveBluetoothPairingDialogPackages(): List<String> {
        val packages = mutableSetOf("android", "com.android.settings", "com.android.bluetooth")
        try {
            val intent = Intent(BluetoothDevice.ACTION_PAIRING_REQUEST).apply {
                addCategory(Intent.CATEGORY_DEFAULT)
            }
            reactContext.packageManager.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY)
                .forEach { info ->
                    info.activityInfo?.packageName?.let { packages.add(it) }
                }
        } catch (_: Exception) {}
        return packages.toList()
    }

    // Required to suppress RN native module warnings
    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}
}
