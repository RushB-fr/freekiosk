package com.freekiosk

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import androidx.mediarouter.app.SystemOutputSwitcherDialogController
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

class AudioControlModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "AudioControlModule"

    private var preferredOutput: String = "auto"
    private var lastBluetoothDeviceAddress: String? = null

    private fun audioManager(): AudioManager =
        reactContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager

    private fun bluetoothAdapter(): BluetoothAdapter? {
        val manager = reactContext.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        return manager?.adapter
    }

    // ─── State snapshot ───────────────────────────────────────────────────────

    @ReactMethod
    fun getAudioInfo(promise: Promise) {
        try {
            val am = audioManager()
            val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
            val cur = am.getStreamVolume(AudioManager.STREAM_MUSIC)

            val isMuted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.isStreamMute(AudioManager.STREAM_MUSIC)
            } else {
                cur == 0
            }

            val result = Arguments.createMap()
            result.putInt("volume", if (max > 0) (cur * 100 / max) else 0)
            result.putInt("volumeRaw", cur)
            result.putInt("volumeMax", max)
            result.putBoolean("isMuted", isMuted)
            result.putString("currentOutput", describeCurrentOutput(am))
            result.putArray("availableOutputs", buildOutputList(am))
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("AUDIO_ERROR", e.message, e)
        }
    }

    // ─── Volume ───────────────────────────────────────────────────────────────

    @ReactMethod
    fun setVolume(percent: Int, promise: Promise) {
        try {
            val am = audioManager()
            val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
            val target = (percent.coerceIn(0, 100) * max / 100)
            am.setStreamVolume(
                AudioManager.STREAM_MUSIC,
                target,
                0 // no UI flag — we're showing our own
            )
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("VOLUME_ERROR", e.message, e)
        }
    }

    // ─── Mute ─────────────────────────────────────────────────────────────────

    @ReactMethod
    fun setMuted(muted: Boolean, promise: Promise) {
        try {
            val am = audioManager()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.adjustStreamVolume(
                    AudioManager.STREAM_MUSIC,
                    if (muted) AudioManager.ADJUST_MUTE else AudioManager.ADJUST_UNMUTE,
                    0
                )
            } else {
                // Pre-M: set volume to 0 or restore
                @Suppress("DEPRECATION")
                am.setStreamMute(AudioManager.STREAM_MUSIC, muted)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("MUTE_ERROR", e.message, e)
        }
    }

    // ─── Output routing ───────────────────────────────────────────────────────

    /**
     * Route media audio to the selected output.
     *
     * Android does not expose a simple "route media to device X" API for
     * third-party apps; the proper routing is done by the system based on
     * connected peripherals.  What we CAN reliably do:
     *
     *  • "speaker"  → Force built-in speaker even when headphones/BT are
     *                 connected.  Uses MODE_IN_COMMUNICATION + setSpeakerphoneOn.
     *                 Works on the vast majority of devices.
     *  • "auto"     → Let the system choose (BT A2DP > wired > speaker).
     *  • "bluetooth"→ Trigger Bluetooth SCO (mono headset audio).
     *                 A2DP (stereo) is already active when the BT device is
     *                 connected and cannot be further routed by us.
     *
     * On API 31+, setCommunicationDevice is used instead where applicable.
     */
    @ReactMethod
    fun setAudioOutput(outputType: String, promise: Promise) {
        try {
            val am = audioManager()
            val outputKind = outputType.substringBefore("::")
            val outputAddress = outputType.substringAfter("::", "").ifBlank { null }

            when (outputKind) {
                "speaker" -> {
                    disconnectBluetoothAudioDevices(outputAddress) {
                        forceSpeakerRoute(am)
                        preferredOutput = "speaker"
                        promise.resolve(true)
                    }
                }
                "auto" -> {
                    clearExplicitRoute(am)
                    reconnectRememberedBluetoothDeviceIfNeeded(null) {
                        preferredOutput = "auto"
                        promise.resolve(true)
                    }
                }
                "bluetooth_sco",
                "bluetooth_a2dp" -> {
                    clearExplicitRoute(am)
                    reconnectRememberedBluetoothDeviceIfNeeded(outputAddress) { connected ->
                        preferredOutput = outputKind
                        promise.resolve(connected || outputAddress == null)
                    }
                }
                "wired_headphones",
                "wired_headset",
                "usb_headset",
                "hdmi" -> {
                    clearExplicitRoute(am)
                    preferredOutput = outputKind
                    promise.resolve(true)
                }
                else -> {
                    clearExplicitRoute(am)
                    reconnectRememberedBluetoothDeviceIfNeeded(null) {
                        preferredOutput = "auto"
                        promise.resolve(true)
                    }
                }
            }
        } catch (e: Exception) {
            promise.reject("ROUTING_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun showSystemOutputSwitcher(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
                promise.resolve(false)
                return
            }

            val context = reactContext.currentActivity ?: reactContext
            promise.resolve(SystemOutputSwitcherDialogController.showDialog(context))
        } catch (e: Exception) {
            promise.reject("OUTPUT_SWITCHER_ERROR", e.message, e)
        }
    }

    private fun forceSpeakerRoute(am: AudioManager) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val speaker = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
                .firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }
            if (speaker != null) {
                am.setCommunicationDevice(speaker)
            }
        }
        am.stopBluetoothSco()
        am.isBluetoothScoOn = false
        am.mode = AudioManager.MODE_IN_COMMUNICATION
        am.isSpeakerphoneOn = true
    }

    private fun clearExplicitRoute(am: AudioManager) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            am.clearCommunicationDevice()
        }
        am.stopBluetoothSco()
        am.isBluetoothScoOn = false
        am.isSpeakerphoneOn = false
        am.mode = AudioManager.MODE_NORMAL
    }

    private fun hasBluetoothConnectPermission(): Boolean {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
            ContextCompat.checkSelfPermission(
                reactContext,
                Manifest.permission.BLUETOOTH_CONNECT
            ) == PackageManager.PERMISSION_GRANTED
    }

    private fun getConnectedBluetoothAudioDevices(): List<BluetoothDevice> {
        val adapter = bluetoothAdapter() ?: return emptyList()
        if (!hasBluetoothConnectPermission()) return emptyList()

        return try {
            adapter.bondedDevices
                ?.filter { isBluetoothDeviceConnected(it) }
                ?.toList()
                .orEmpty()
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun isBluetoothDeviceConnected(device: BluetoothDevice): Boolean {
        return try {
            val method = device.javaClass.getMethod("isConnected")
            method.invoke(device) as? Boolean ?: false
        } catch (_: Exception) {
            false
        }
    }

    private fun disconnectBluetoothAudioDevices(
        preferredAddress: String?,
        onComplete: (Boolean) -> Unit
    ) {
        val connectedDevices = getConnectedBluetoothAudioDevices()
        if (connectedDevices.isEmpty()) {
            onComplete(false)
            return
        }

        val targetDevices = buildList {
            preferredAddress?.let { address ->
                connectedDevices.firstOrNull { it.address.equals(address, ignoreCase = true) }?.let { add(it) }
            }
            connectedDevices.forEach { device ->
                if (none { it.address.equals(device.address, ignoreCase = true) }) add(device)
            }
        }

        lastBluetoothDeviceAddress = targetDevices.firstOrNull()?.address ?: lastBluetoothDeviceAddress
        changeBluetoothDevicesConnection(targetDevices, "disconnect", onComplete)
    }

    private fun reconnectRememberedBluetoothDeviceIfNeeded(
        preferredAddress: String?,
        onComplete: (Boolean) -> Unit
    ) {
        val adapter = bluetoothAdapter()
        if (adapter == null || !adapter.isEnabled || !hasBluetoothConnectPermission()) {
            onComplete(false)
            return
        }

        val connectedDevices = getConnectedBluetoothAudioDevices()
        if (connectedDevices.isNotEmpty()) {
            preferredAddress?.let { lastBluetoothDeviceAddress = it }
            onComplete(true)
            return
        }

        val targetAddress = preferredAddress ?: lastBluetoothDeviceAddress
        if (targetAddress.isNullOrBlank()) {
            onComplete(false)
            return
        }

        val device = try {
            adapter.getRemoteDevice(targetAddress)
        } catch (_: Exception) {
            null
        }

        if (device == null) {
            onComplete(false)
            return
        }

        lastBluetoothDeviceAddress = device.address
        changeBluetoothDevicesConnection(listOf(device), "connect", onComplete)
    }

    private fun changeBluetoothDevicesConnection(
        devices: List<BluetoothDevice>,
        methodName: String,
        onComplete: (Boolean) -> Unit
    ) {
        val adapter = bluetoothAdapter()
        if (adapter == null || devices.isEmpty() || !hasBluetoothConnectPermission()) {
            onComplete(false)
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

        val totalRequests = devices.size * profiles.size
        if (totalRequests == 0) {
            onComplete(false)
            return
        }

        val handler = Handler(Looper.getMainLooper())
        var pending = totalRequests
        var invoked = false
        var succeeded = false
        var finished = false

        fun finish() {
            if (finished) return
            finished = true
            handler.removeCallbacksAndMessages(null)
            onComplete(succeeded || invoked)
        }

        val timeout = Runnable { finish() }
        handler.postDelayed(timeout, 3000)

        devices.forEach { device ->
            profiles.forEach { profile ->
                val listener = object : BluetoothProfile.ServiceListener {
                    override fun onServiceConnected(profileId: Int, proxy: BluetoothProfile) {
                        try {
                            val method = proxy.javaClass.getMethod(methodName, BluetoothDevice::class.java)
                            val result = method.invoke(proxy, device) as? Boolean ?: false
                            invoked = true
                            if (result) succeeded = true
                        } catch (_: Exception) {
                        } finally {
                            try {
                                adapter.closeProfileProxy(profileId, proxy)
                            } catch (_: Exception) {
                            }
                            pending -= 1
                            if (pending <= 0) finish()
                        }
                    }

                    override fun onServiceDisconnected(profileId: Int) {
                        pending -= 1
                        if (pending <= 0) finish()
                    }
                }

                val requested = try {
                    adapter.getProfileProxy(reactContext, listener, profile)
                } catch (_: Exception) {
                    false
                }

                if (!requested) {
                    pending -= 1
                    if (pending <= 0) finish()
                }
            }
        }
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private fun describeCurrentOutput(am: AudioManager): String {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val outputs = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
            if (preferredOutput == "speaker" && isUsingSpeaker(am)) return "speaker"
            if (preferredOutput == "bluetooth_sco" && am.isBluetoothScoOn) return "bluetooth_sco"
            if (preferredOutput != "auto" && outputs.any { outputTypeForDevice(it) == preferredOutput }) {
                return preferredOutput
            }

            // Priority: BT A2DP > wired headset/headphones > USB > speaker
            return when {
                outputs.any { it.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP } -> "bluetooth_a2dp"
                outputs.any { it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO } && am.isBluetoothScoOn -> "bluetooth_sco"
                outputs.any { it.type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES } -> "wired_headphones"
                outputs.any { it.type == AudioDeviceInfo.TYPE_WIRED_HEADSET } -> "wired_headset"
                outputs.any { it.type == AudioDeviceInfo.TYPE_USB_HEADSET } -> "usb_headset"
                outputs.any { it.type == AudioDeviceInfo.TYPE_HDMI } -> "hdmi"
                am.isSpeakerphoneOn -> "speaker"
                else -> "speaker"
            }
        }
        // Pre-M fallback
        @Suppress("DEPRECATION")
        return when {
            am.isBluetoothA2dpOn -> "bluetooth_a2dp"
            am.isBluetoothScoOn -> "bluetooth_sco"
            am.isWiredHeadsetOn -> "wired_headset"
            am.isSpeakerphoneOn -> "speaker_forced"
            else -> "speaker"
        }
    }

    private fun isUsingSpeaker(am: AudioManager): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            am.communicationDevice?.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER || am.isSpeakerphoneOn
        } else {
            am.isSpeakerphoneOn
        }
    }

    private fun outputTypeForDevice(device: AudioDeviceInfo): String? {
        return when (device.type) {
            AudioDeviceInfo.TYPE_BLUETOOTH_A2DP -> "bluetooth_a2dp"
            AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> "bluetooth_sco"
            AudioDeviceInfo.TYPE_WIRED_HEADPHONES -> "wired_headphones"
            AudioDeviceInfo.TYPE_WIRED_HEADSET -> "wired_headset"
            AudioDeviceInfo.TYPE_USB_HEADSET -> "usb_headset"
            AudioDeviceInfo.TYPE_HDMI -> "hdmi"
            AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "speaker"
            else -> null
        }
    }

    private fun buildOutputList(am: AudioManager): WritableArray {
        val arr = Arguments.createArray()

        // Always include "auto" (let system decide) and built-in speaker
        arr.pushMap(makeOutput("auto", "System Default", "auto"))
        arr.pushMap(makeOutput("speaker", "Speaker", "speaker"))

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val outputs = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
            if (outputs.any { it.type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES }) {
                arr.pushMap(makeOutput("wired_headphones", "Wired Headphones", "wired_headphones"))
            }
            if (outputs.any { it.type == AudioDeviceInfo.TYPE_WIRED_HEADSET }) {
                arr.pushMap(makeOutput("wired_headset", "Wired Headset", "wired_headset"))
            }
            if (outputs.any { it.type == AudioDeviceInfo.TYPE_USB_HEADSET }) {
                arr.pushMap(makeOutput("usb_headset", "USB Headset", "usb_headset"))
            }
            if (outputs.any { it.type == AudioDeviceInfo.TYPE_HDMI }) {
                arr.pushMap(makeOutput("hdmi", "HDMI / Display", "hdmi"))
            }
            // BT A2DP entries — one per connected device
            outputs
                .filter { it.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP }
                .forEach { dev ->
                    val name = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) dev.productName?.toString() else null
                    arr.pushMap(makeOutput(
                        "bluetooth_a2dp::${dev.address}",
                        name ?: "Bluetooth (A2DP)",
                        "bluetooth_a2dp"
                    ))
                }
            outputs
                .filter { it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO }
                .forEach { dev ->
                    val name = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) dev.productName?.toString() else null
                    arr.pushMap(makeOutput(
                        "bluetooth_sco::${dev.address}",
                        name ?: "Bluetooth Headset",
                        "bluetooth_sco"
                    ))
                }
        } else {
            // Pre-M: detect via legacy APIs
            @Suppress("DEPRECATION")
            if (am.isBluetoothA2dpOn) {
                arr.pushMap(makeOutput("bluetooth_a2dp", "Bluetooth (A2DP)", "bluetooth_a2dp"))
            }
            @Suppress("DEPRECATION")
            if (am.isWiredHeadsetOn) {
                arr.pushMap(makeOutput("wired_headset", "Wired Headset", "wired_headset"))
            }
        }

        return arr
    }

    private fun makeOutput(id: String, label: String, type: String): WritableMap {
        val m = Arguments.createMap()
        m.putString("id", id)
        m.putString("label", label)
        m.putString("type", type)
        return m
    }

    private fun sendEvent(name: String, params: Any?) {
        try {
            reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(name, params)
        } catch (_: Exception) {}
    }

    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}
}
