package com.freekiosk

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.net.wifi.WifiManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.media.AudioManager
import android.os.Build
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.Arguments

class SystemInfoModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "SystemInfoModule"
    }

    @ReactMethod
    fun getSystemInfo(promise: Promise) {
        try {
            val systemInfo = Arguments.createMap()

            // Battery info
            val batteryInfo = getBatteryInfo()
            systemInfo.putMap("battery", batteryInfo)

            // WiFi info
            val wifiInfo = getWiFiInfo()
            systemInfo.putMap("wifi", wifiInfo)

            // Bluetooth info
            val bluetoothInfo = getBluetoothInfo()
            systemInfo.putMap("bluetooth", bluetoothInfo)

            // Audio info
            val audioInfo = getAudioInfo()
            systemInfo.putMap("audio", audioInfo)

            promise.resolve(systemInfo)
        } catch (e: Exception) {
            promise.reject("ERROR", "Failed to get system info: ${e.message}")
        }
    }

    private fun getBatteryInfo(): WritableMap {
        val batteryInfo = Arguments.createMap()

        try {
            // Use BatteryManager for real-time battery status (API 21+)
            // This ensures we always get fresh data, not cached broadcast
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                val batteryManager = reactApplicationContext.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
                
                val batteryPct = batteryManager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
                val status = batteryManager.getIntProperty(BatteryManager.BATTERY_PROPERTY_STATUS)
                val isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                                status == BatteryManager.BATTERY_STATUS_FULL

                batteryInfo.putInt("level", batteryPct)
                batteryInfo.putBoolean("isCharging", isCharging)
            } else {
                // Fallback for older Android versions (< API 21)
                val batteryStatus: Intent? = reactApplicationContext.registerReceiver(
                    null,
                    IntentFilter(Intent.ACTION_BATTERY_CHANGED)
                )

                if (batteryStatus != null) {
                    val level = batteryStatus.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
                    val scale = batteryStatus.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
                    val batteryPct = (level * 100 / scale.toFloat()).toInt()

                    val status = batteryStatus.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
                    val isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                                    status == BatteryManager.BATTERY_STATUS_FULL

                    batteryInfo.putInt("level", batteryPct)
                    batteryInfo.putBoolean("isCharging", isCharging)
                } else {
                    batteryInfo.putInt("level", -1)
                    batteryInfo.putBoolean("isCharging", false)
                }
            }
        } catch (e: Exception) {
            DebugLog.errorProduction("SystemInfo", "Battery error: ${e.message}")
            batteryInfo.putInt("level", -1)
            batteryInfo.putBoolean("isCharging", false)
        }

        return batteryInfo
    }

    private fun getWiFiInfo(): WritableMap {
        val wifiInfo = Arguments.createMap()

        try {
            val connectivityManager = reactApplicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val network = connectivityManager.activeNetwork
                val capabilities = connectivityManager.getNetworkCapabilities(network)

                val isConnected = capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
                wifiInfo.putBoolean("isConnected", isConnected)

                if (isConnected) {
                    val wifiManager = reactApplicationContext.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
                    val wifiInfoObj = wifiManager.connectionInfo
                    val ssid = wifiInfoObj.ssid.replace("\"", "")
                    wifiInfo.putString("ssid", ssid)

                    // Signal strength (0-4 bars)
                    val rssi = wifiInfoObj.rssi
                    val level = WifiManager.calculateSignalLevel(rssi, 5)
                    wifiInfo.putInt("signalLevel", level)
                } else {
                    wifiInfo.putString("ssid", "")
                    wifiInfo.putInt("signalLevel", 0)
                }
            } else {
                @Suppress("DEPRECATION")
                val wifiManager = reactApplicationContext.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
                @Suppress("DEPRECATION")
                val wifiInfoObj = wifiManager.connectionInfo
                val isConnected = wifiInfoObj != null && wifiInfoObj.networkId != -1
                wifiInfo.putBoolean("isConnected", isConnected)

                if (isConnected) {
                    val ssid = wifiInfoObj.ssid.replace("\"", "")
                    wifiInfo.putString("ssid", ssid)

                    val rssi = wifiInfoObj.rssi
                    @Suppress("DEPRECATION")
                    val level = WifiManager.calculateSignalLevel(rssi, 5)
                    wifiInfo.putInt("signalLevel", level)
                } else {
                    wifiInfo.putString("ssid", "")
                    wifiInfo.putInt("signalLevel", 0)
                }
            }
        } catch (e: Exception) {
            DebugLog.errorProduction("SystemInfo", "WiFi error: ${e.message}")
            wifiInfo.putBoolean("isConnected", false)
            wifiInfo.putString("ssid", "")
            wifiInfo.putInt("signalLevel", 0)
        }

        return wifiInfo
    }

    private fun getBluetoothInfo(): WritableMap {
        val bluetoothInfo = Arguments.createMap()

        try {
            val bluetoothManager = reactApplicationContext.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
            val bluetoothAdapter = bluetoothManager.adapter

            if (bluetoothAdapter != null) {
                bluetoothInfo.putBoolean("isEnabled", bluetoothAdapter.isEnabled)

                // Vérifier s'il y a des appareils RÉELLEMENT connectés
                try {
                    @Suppress("DEPRECATION")
                    val bondedDevices = bluetoothAdapter.bondedDevices
                    var connectedCount = 0

                    if (bondedDevices != null) {
                        for (device in bondedDevices) {
                            try {
                                // Utiliser réflexion pour accéder à isConnected() (méthode cachée)
                                val isConnectedMethod = device.javaClass.getMethod("isConnected")
                                val connected = isConnectedMethod.invoke(device) as? Boolean ?: false
                                if (connected) {
                                    connectedCount++
                                }
                            } catch (e: Exception) {
                                // Si la méthode ne fonctionne pas, on ignore
                            }
                        }
                    }

                    bluetoothInfo.putInt("connectedDevices", connectedCount)
                } catch (e: SecurityException) {
                    bluetoothInfo.putInt("connectedDevices", 0)
                }
            } else {
                bluetoothInfo.putBoolean("isEnabled", false)
                bluetoothInfo.putInt("connectedDevices", 0)
            }
        } catch (e: Exception) {
            DebugLog.errorProduction("SystemInfo", "Bluetooth error: ${e.message}")
            bluetoothInfo.putBoolean("isEnabled", false)
            bluetoothInfo.putInt("connectedDevices", 0)
        }

        return bluetoothInfo
    }

    private fun getAudioInfo(): WritableMap {
        val audioInfo = Arguments.createMap()

        try {
            val audioManager = reactApplicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager

            // Volume level (0-100%)
            val maxVolume = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
            val currentVolume = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC)
            val volumePercent = (currentVolume * 100 / maxVolume)

            audioInfo.putInt("volume", volumePercent)

            // Ringer mode
            val ringerMode = audioManager.ringerMode
            val isMuted = ringerMode == AudioManager.RINGER_MODE_SILENT ||
                         ringerMode == AudioManager.RINGER_MODE_VIBRATE
            audioInfo.putBoolean("isMuted", isMuted)

            // Mode du ringer
            when (ringerMode) {
                AudioManager.RINGER_MODE_SILENT -> audioInfo.putString("mode", "silent")
                AudioManager.RINGER_MODE_VIBRATE -> audioInfo.putString("mode", "vibrate")
                AudioManager.RINGER_MODE_NORMAL -> audioInfo.putString("mode", "normal")
            }
        } catch (e: Exception) {
            DebugLog.errorProduction("SystemInfo", "Audio error: ${e.message}")
            audioInfo.putInt("volume", 0)
            audioInfo.putBoolean("isMuted", false)
            audioInfo.putString("mode", "unknown")
        }

        return audioInfo
    }
}
