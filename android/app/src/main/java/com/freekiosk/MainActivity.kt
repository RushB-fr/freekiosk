package com.freekiosk

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.bridge.Arguments

class MainActivity : ReactActivity() {

  companion object {
    // Flag partagé pour bloquer le relaunch - accessible depuis OverlayService
    @Volatile
    var blockAutoRelaunch = false
  }

  private lateinit var devicePolicyManager: DevicePolicyManager
  private lateinit var adminComponent: ComponentName

  // External app launch management
  private var isExternalAppMode = false
  private var externalAppPackage: String? = null
  private var isDeviceOwner = false
  private var isVoluntaryReturn = false  // Flag pour éviter double événement

  override fun getMainComponentName(): String = "FreeKiosk"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)

    // Keep screen always on
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

    devicePolicyManager = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    adminComponent = ComponentName(this, DeviceAdminReceiver::class.java)

    readExternalAppConfig()
    hideSystemUI()
    checkAndStartLockTask()

    // Check if we need to navigate to PIN
    handleNavigationIntent(intent)
  }

  override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)
    handleNavigationIntent(intent)
  }

  private fun handleNavigationIntent(intent: Intent?) {
    val shouldNavigateToPin = intent?.getBooleanExtra("navigateToPin", false) == true
    val isVoluntary = intent?.getBooleanExtra("voluntaryReturn", false) == true
    
    if (shouldNavigateToPin || isVoluntary) {
      // IMPORTANT: Mettre le flag AVANT tout traitement async
      blockAutoRelaunch = true
      DebugLog.d("MainActivity", "handleNavigationIntent: set blockAutoRelaunch=true (pin=$shouldNavigateToPin, voluntary=$isVoluntary)")
    }
    
    if (shouldNavigateToPin) {
      // Send event to React Native to navigate to PIN screen
      Handler(Looper.getMainLooper()).postDelayed({
        sendNavigateToPinEvent()
      }, 500) // Small delay to ensure React Native is ready
    }
  }

  private fun sendNavigateToPinEvent() {
    try {
      val reactInstanceManager = reactNativeHost?.reactInstanceManager
      val reactContext = reactInstanceManager?.currentReactContext
      reactContext?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        ?.emit("navigateToPin", null)
      DebugLog.d("MainActivity", "Sent navigateToPin event")
    } catch (e: Exception) {
      DebugLog.errorProduction("MainActivity", "Failed to send navigateToPin event: ${e.message}")
    }
  }

  private fun sendAppReturnedEvent(voluntary: Boolean = false) {
    try {
      val reactInstanceManager = reactNativeHost?.reactInstanceManager
      val reactContext = reactInstanceManager?.currentReactContext
      val params = Arguments.createMap()
      params.putBoolean("voluntary", voluntary)
      reactContext?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        ?.emit("onAppReturned", params)
      DebugLog.d("MainActivity", "Sent onAppReturned event (voluntary=$voluntary)")
    } catch (e: Exception) {
      DebugLog.errorProduction("MainActivity", "Failed to send onAppReturned event: ${e.message}")
    }
  }

  private fun checkAndStartLockTask() {
    val kioskEnabled = isKioskEnabled()
    DebugLog.d("MainActivity", "Kiosk enabled: $kioskEnabled")
    
    if (kioskEnabled) {
      startLockTaskIfPossible()
    } else {
      DebugLog.d("MainActivity", "Kiosk mode disabled - normal mode")
    }
  }

  private fun isKioskEnabled(): Boolean {
    return try {
      val prefs = getSharedPreferences("RCTAsyncLocalStorage", Context.MODE_PRIVATE)
      val value = prefs.getString("@kiosk_enabled", null)

      DebugLog.d("MainActivity", "Read kiosk preference: $value")

      if (value == null) {
        DebugLog.d("MainActivity", "No preference found, defaulting to OFF")
        false
      } else {
        val enabled = value == "true"
        DebugLog.d("MainActivity", "Kiosk enabled: $enabled")
        enabled
      }
    } catch (e: Exception) {
      DebugLog.errorProduction("MainActivity", "Error reading preference: ${e.message}")
      false
    }
  }

  private fun startLockTaskIfPossible() {
    if (devicePolicyManager.isDeviceOwnerApp(packageName)) {
      // Mode Device Owner: Lock Task complet avec whitelist
      enableKioskRestrictions()

      // Build whitelist: toujours FreeKiosk, + app externe si configurée
      val whitelist = mutableListOf(packageName)

      if (isExternalAppMode && !externalAppPackage.isNullOrEmpty()) {
        try {
          packageManager.getPackageInfo(externalAppPackage!!, 0)
          whitelist.add(externalAppPackage!!)
          DebugLog.d("MainActivity", "External app added to whitelist: $externalAppPackage")
        } catch (e: Exception) {
          DebugLog.errorProduction("MainActivity", "External app not found: $externalAppPackage")
        }
      }

      // Configurer la whitelist Lock Task
      devicePolicyManager.setLockTaskPackages(adminComponent, whitelist.toTypedArray())

      // Lancer Lock Task sur MainActivity
      // Avec la whitelist, l'utilisateur peut naviguer entre FreeKiosk et l'app externe
      // Mais ne peut PAS sortir vers d'autres apps, launcher, ou paramètres
      startLockTask()
      DebugLog.d("MainActivity", "Lock task started (Device Owner) with whitelist: $whitelist")
    } else {
      // Mode non-Device Owner: Screen Pinning manuel (demande confirmation utilisateur)
      try {
        startLockTask()
        DebugLog.d("MainActivity", "Lock task started (Screen Pinning mode - user confirmation required)")
      } catch (e: Exception) {
        DebugLog.errorProduction("MainActivity", "Failed to start lock task: ${e.message}")
      }
    }
  }

  private fun enableKioskRestrictions() {
    if (!devicePolicyManager.isDeviceOwnerApp(packageName)) return

    try {
      // Configurer les features Lock Task pour bloquer toute navigation système
      // LOCK_TASK_FEATURE_NONE = 0 : Bloque tout (pas de Home, Recents, notifications, etc.)
      // On ne permet AUCUNE fonctionnalité système pendant le Lock Task
      if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
        devicePolicyManager.setLockTaskFeatures(
          adminComponent,
          DevicePolicyManager.LOCK_TASK_FEATURE_NONE
        )
        DebugLog.d("MainActivity", "Lock task features set to NONE (full lockdown)")
      }

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

      DebugLog.d("MainActivity", "Kiosk restrictions enabled")
    } catch (e: Exception) {
      DebugLog.errorProduction("MainActivity", "Error enabling restrictions: ${e.message}")
    }
  }

  fun disableKioskRestrictions() {
    if (!devicePolicyManager.isDeviceOwnerApp(packageName)) return

    try {
      // Réinitialiser les features Lock Task pour permettre la navigation normale
      if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
        // Restaurer les features par défaut (Home, Recents, etc.)
        devicePolicyManager.setLockTaskFeatures(
          adminComponent,
          DevicePolicyManager.LOCK_TASK_FEATURE_HOME or
          DevicePolicyManager.LOCK_TASK_FEATURE_OVERVIEW or
          DevicePolicyManager.LOCK_TASK_FEATURE_NOTIFICATIONS or
          DevicePolicyManager.LOCK_TASK_FEATURE_GLOBAL_ACTIONS
        )
        DebugLog.d("MainActivity", "Lock task features restored to defaults")
      }

      val samsungUpdateApps = arrayOf(
        "com.samsung.android.app.updatecenter",
        "com.sec.android.fotaclient",
        "com.wssyncmldm",
        "com.samsung.android.sdm.config",
        "com.sec.android.soagent"
      )
      
      devicePolicyManager.setPackagesSuspended(adminComponent, samsungUpdateApps, false)
      devicePolicyManager.setSystemUpdatePolicy(adminComponent, null)

      DebugLog.d("MainActivity", "Kiosk restrictions disabled")
    } catch (e: Exception) {
      DebugLog.errorProduction("MainActivity", "Error disabling restrictions: ${e.message}")
    }
  }

  override fun onResume() {
    super.onResume()

    readExternalAppConfig()

    // Vérifier si c'est un retour volontaire (depuis l'intent de l'overlay - 5 taps)
    val voluntaryReturn = intent?.getBooleanExtra("voluntaryReturn", false) ?: false
    val navigateToPin = intent?.getBooleanExtra("navigateToPin", false) ?: false
    
    if (voluntaryReturn) {
      // Reset les flags pour les prochains resumes
      intent?.removeExtra("voluntaryReturn")
      intent?.removeExtra("navigateToPin")
      isVoluntaryReturn = true
      DebugLog.d("MainActivity", "Voluntary return detected (5-tap), will navigate to PIN: $navigateToPin")
    }

    // IMPORTANT: Quand FreeKiosk revient au premier plan, TOUJOURS arrêter l'overlay
    // L'overlay ne doit être visible QUE quand une app externe est au premier plan
    // Il sera relancé automatiquement quand on relance l'app externe
    stopOverlayService()

    // Si retour volontaire avec navigateToPin, envoyer l'événement pour aller au PIN
    // (l'événement est déjà envoyé par OverlayService, mais on le renvoie au cas où)
    if (isVoluntaryReturn && navigateToPin) {
      Handler(Looper.getMainLooper()).postDelayed({
        sendNavigateToPinEvent()
      }, 300) // Délai pour laisser React Native se stabiliser
    }

    // Notifier React Native qu'on est revenu sur FreeKiosk (depuis une app externe)
    // NE PAS envoyer si c'est un retour volontaire (l'overlay l'a déjà envoyé)
    if (isExternalAppMode && !isVoluntaryReturn) {
      sendAppReturnedEvent(false)  // voluntary=false = auto-relaunch possible
    }
    isVoluntaryReturn = false  // Reset pour le prochain resume

    val kioskEnabled = isKioskEnabled()

    // Relancer Lock Task si nécessaire (WebView ET External App)
    if (kioskEnabled && devicePolicyManager.isDeviceOwnerApp(packageName)) {
      if (!isTaskLocked()) {
        startLockTask()
        DebugLog.d("MainActivity", "Re-started lock task on resume")
      }
    }
  }

  private fun startOverlayService() {
    try {
      // Vérifier la permission overlay (Android M+)
      if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
        if (!android.provider.Settings.canDrawOverlays(this)) {
          DebugLog.d("MainActivity", "Overlay permission not granted, skipping OverlayService")
          return
        }
      }

      val serviceIntent = Intent(this, OverlayService::class.java)
      startService(serviceIntent)
      DebugLog.d("MainActivity", "Started OverlayService")
    } catch (e: Exception) {
      DebugLog.errorProduction("MainActivity", "Error starting OverlayService: ${e.message}")
    }
  }

  private fun stopOverlayService() {
    try {
      val serviceIntent = Intent(this, OverlayService::class.java)
      stopService(serviceIntent)
      DebugLog.d("MainActivity", "Stopped OverlayService")
    } catch (e: Exception) {
      DebugLog.errorProduction("MainActivity", "Error stopping OverlayService: ${e.message}")
    }
  }

  internal fun isTaskLocked(): Boolean {
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
    // Lire le mode test depuis SharedPreferences
    val prefs = getSharedPreferences("FreeKioskSettings", Context.MODE_PRIVATE)
    val testModeEnabled = prefs.getBoolean("test_mode_enabled", false)
    
    if (testModeEnabled) {
      // En mode test: permettre le bouton retour
      DebugLog.d("MainActivity", "Back button pressed - Test Mode enabled, allowing back")
      super.onBackPressed()
    } else {
      // En mode normal: bloquer le bouton retour en mode kiosk
      DebugLog.d("MainActivity", "Back button pressed - Kiosk Mode active, blocking back")
      // Ne rien faire = bloquer le back button
    }
  }

  private fun bringToFrontWithPinNavigation() {
    try {
      val intent = Intent(this, MainActivity::class.java)
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      intent.putExtra("navigateToPin", true)
      startActivity(intent)
      DebugLog.d("MainActivity", "Bringing FreeKiosk to front with PIN navigation")
    } catch (e: Exception) {
      DebugLog.errorProduction("MainActivity", "Error bringing FreeKiosk to front with PIN: ${e.message}")
    }
  }

  private fun readExternalAppConfig() {
    try {
      val prefs = getSharedPreferences("RCTAsyncLocalStorage", Context.MODE_PRIVATE)
      val displayMode = prefs.getString("@kiosk_display_mode", "webview")
      externalAppPackage = prefs.getString("@kiosk_external_app_package", null)
      isExternalAppMode = displayMode == "external_app"
      isDeviceOwner = devicePolicyManager.isDeviceOwnerApp(packageName)
      
      DebugLog.d("MainActivity", "External app config: mode=$displayMode, package=$externalAppPackage, isDeviceOwner=$isDeviceOwner")
    } catch (e: Exception) {
      DebugLog.errorProduction("MainActivity", "Error reading external app config: ${e.message}")
    }
  }

  override fun onDestroy() {
    super.onDestroy()
    disableKioskRestrictions()
  }
}
