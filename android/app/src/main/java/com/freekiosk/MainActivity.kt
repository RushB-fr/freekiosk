package com.freekiosk

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import android.os.Bundle
import android.view.View
import android.view.WindowManager  // ⬅️ NOUVEAU
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context

class MainActivity : ReactActivity() {

  private lateinit var devicePolicyManager: DevicePolicyManager
  private lateinit var adminComponent: ComponentName

  override fun getMainComponentName(): String = "FreeKiosk"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    
    // ⬇️ NOUVEAU - Keep screen always on
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    
    devicePolicyManager = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    adminComponent = ComponentName(this, DeviceAdminReceiver::class.java)
    
    hideSystemUI()
    checkAndStartLockTask()
  }

  private fun checkAndStartLockTask() {
    val kioskEnabled = isKioskEnabled()
    android.util.Log.d("MainActivity", "Kiosk enabled: $kioskEnabled")
    
    if (kioskEnabled) {
      startLockTaskIfPossible()
    } else {
      android.util.Log.d("MainActivity", "Kiosk mode disabled - normal mode")
    }
  }

  private fun isKioskEnabled(): Boolean {
    return try {
      val prefs = getSharedPreferences("RCTAsyncLocalStorage", Context.MODE_PRIVATE)
      val value = prefs.getString("@kiosk_enabled", null)
      
      android.util.Log.d("MainActivity", "Read kiosk preference: $value")
      
      if (value == null) {
        android.util.Log.d("MainActivity", "No preference found, defaulting to OFF")
        false
      } else {
        val enabled = value == "true"
        android.util.Log.d("MainActivity", "Kiosk enabled: $enabled")
        enabled
      }
    } catch (e: Exception) {
      android.util.Log.e("MainActivity", "Error reading preference: ${e.message}")
      false
    }
  }

  private fun startLockTaskIfPossible() {
    if (devicePolicyManager.isDeviceOwnerApp(packageName)) {
      enableKioskRestrictions()
      devicePolicyManager.setLockTaskPackages(adminComponent, arrayOf(packageName))
      startLockTask()
      android.util.Log.d("MainActivity", "Lock task started (Device Owner)")
    } else {
      android.util.Log.d("MainActivity", "Not Device Owner, kiosk mode not available")
    }
  }

  private fun enableKioskRestrictions() {
    if (!devicePolicyManager.isDeviceOwnerApp(packageName)) return
    
    try {
      val samsungUpdateApps = arrayOf(
        "com.samsung.android.app.updatecenter",
        "com.sec.android.fotaclient",
        "com.wssyncmldm",
        "com.samsung.android.sdm.config",
        "com.sec.android.soagent"
      )
      
      devicePolicyManager.setPackagesSuspended(adminComponent, samsungUpdateApps, true)
      
      val policy = android.app.admin.SystemUpdatePolicy.createPostponeInstallPolicy()
      devicePolicyManager.setSystemUpdatePolicy(adminComponent, policy)
      
      android.util.Log.d("MainActivity", "Kiosk restrictions enabled")
    } catch (e: Exception) {
      android.util.Log.e("MainActivity", "Error enabling restrictions: ${e.message}")
    }
  }

  fun disableKioskRestrictions() {
    if (!devicePolicyManager.isDeviceOwnerApp(packageName)) return
    
    try {
      val samsungUpdateApps = arrayOf(
        "com.samsung.android.app.updatecenter",
        "com.sec.android.fotaclient",
        "com.wssyncmldm",
        "com.samsung.android.sdm.config",
        "com.sec.android.soagent"
      )
      
      devicePolicyManager.setPackagesSuspended(adminComponent, samsungUpdateApps, false)
      devicePolicyManager.setSystemUpdatePolicy(adminComponent, null)
      
      android.util.Log.d("MainActivity", "Kiosk restrictions disabled")
    } catch (e: Exception) {
      android.util.Log.e("MainActivity", "Error disabling restrictions: ${e.message}")
    }
  }

  override fun onResume() {
    super.onResume()
    
    val kioskEnabled = isKioskEnabled()
    
    if (kioskEnabled && devicePolicyManager.isDeviceOwnerApp(packageName)) {
      if (!isTaskLocked()) {
        startLockTask()
        android.util.Log.d("MainActivity", "Re-started lock task on resume")
      }
    }
  }

  private fun isTaskLocked(): Boolean {
    return try {
      val activityManager = getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
      activityManager.lockTaskModeState != android.app.ActivityManager.LOCK_TASK_MODE_NONE
    } catch (e: Exception) {
      false
    }
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) {
      hideSystemUI()
    }
  }

  private fun hideSystemUI() {
    window.decorView.systemUiVisibility = (
      View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
      or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
      or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
      or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
      or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
      or View.SYSTEM_UI_FLAG_FULLSCREEN
    )
  }

  override fun onBackPressed() {
    // Bloquer le bouton retour
  }
  
  override fun onDestroy() {
    super.onDestroy()
    disableKioskRestrictions()
  }
}
