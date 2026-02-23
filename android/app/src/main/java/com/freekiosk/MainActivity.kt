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
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import android.widget.Toast
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import java.security.MessageDigest
import android.database.sqlite.SQLiteDatabase
import android.content.ContentValues
import android.view.KeyEvent
import android.content.IntentFilter
import android.os.Build
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.Manifest
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : ReactActivity() {

  companion object {
    // Flag partagé pour bloquer le relaunch - accessible depuis OverlayService
    @Volatile
    var blockAutoRelaunch = false
    
    // Flag to prevent processing the same ADB config intent twice
    @Volatile
    var lastProcessedAdbIntent: Long = 0
  }

  private lateinit var devicePolicyManager: DevicePolicyManager
  private lateinit var adminComponent: ComponentName

  // External app launch management
  private var isExternalAppMode = false
  private var externalAppPackage: String? = null
  private var isDeviceOwner = false
  private var isVoluntaryReturn = false  // Flag pour éviter double événement

  // Screen state receiver
  private var screenStateReceiver: ScreenStateReceiver? = null
  
  // Volume change receiver (also handles 5-tap gesture detection)
  private var volumeChangeReceiver: VolumeChangeReceiver? = null

  // Debounce handler for hideSystemUI to avoid dismissing the power menu (GlobalActions)
  // on devices where onWindowFocusChanged fires rapidly (e.g. TECNO/HiOS on Android 14)
  private val hideSystemUIHandler = Handler(Looper.getMainLooper())
  private var lastFocusLostTime = 0L

  override fun getMainComponentName(): String = "FreeKiosk"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)

    // Keep screen always on
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

    devicePolicyManager = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    adminComponent = ComponentName(this, DeviceAdminReceiver::class.java)

    // Register screen state receiver to track screen on/off events
    registerScreenStateReceiver()
    
    // Register volume change receiver to track volume changes
    registerVolumeChangeReceiver()

    // Handle ADB configuration - if config applied, app will restart
    if (handleAdbConfig(intent)) {
      return  // Exit - app restarting with new config
    }

    // Request location permission for WiFi SSID access (Android 8+ requires it)
    requestLocationPermission()

    // Request camera permission for motion detection
    requestCameraPermission()

    readExternalAppConfig()
    ensureBootReceiverEnabled()
    hideSystemUI()
    checkAndStartLockTask()

    // If started from HomeActivity (External App Mode at boot),
    // move to background so the external app stays in foreground
    if (intent?.getBooleanExtra("from_home_activity", false) == true) {
      DebugLog.d("MainActivity", "Started from HomeActivity, moving to background")
      Handler(Looper.getMainLooper()).postDelayed({ moveTaskToBack(true) }, 500)
    }

    // Check if we need to navigate to PIN
    handleNavigationIntent(intent)
  }

  override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)
    setIntent(intent) // Important: update the intent
    
    // Handle ADB config on new intent too (when app is already running)
    // If returns true, the app will restart and we should not continue
    if (handleAdbConfig(intent)) {
      return
    }
    
    // Reload config after ADB changes
    readExternalAppConfig()
    
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
      // Use KioskModule's static method to send event to React Native
      // This works with the new architecture
      KioskModule.sendEventFromNative("navigateToPin", null)
      android.util.Log.d("MainActivity", "Sent navigateToPin event via KioskModule")
    } catch (e: Exception) {
      android.util.Log.e("MainActivity", "Failed to send navigateToPin event: ${e.message}")
    }
  }

  private fun sendAppReturnedEvent(voluntary: Boolean = false) {
    try {
      // Use KioskModule's static method to send event to React Native
      val params = Arguments.createMap()
      params.putBoolean("voluntary", voluntary)
      KioskModule.sendEventFromNative("onAppReturned", params)
      android.util.Log.d("MainActivity", "Sent onAppReturned event (voluntary=$voluntary)")
    } catch (e: Exception) {
      android.util.Log.e("MainActivity", "Failed to send onAppReturned event: ${e.message}")
    }
  }

  private fun requestLocationPermission() {
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
        != PackageManager.PERMISSION_GRANTED) {
      ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.ACCESS_FINE_LOCATION), 1001)
    }
  }

  private fun requestCameraPermission() {
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
        != PackageManager.PERMISSION_GRANTED) {
      ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.CAMERA), 1002)
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
      val value = getAsyncStorageValue("@kiosk_enabled", "false")

      DebugLog.d("MainActivity", "Read kiosk preference: $value")

      val enabled = value == "true"
      DebugLog.d("MainActivity", "Kiosk enabled: $enabled")
      enabled
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
      // Read settings from AsyncStorage v2 database
      // allowPowerButton: true = power menu allowed (default), false = blocked by admin
      val allowPowerButtonValue = getAsyncStorageValue("@kiosk_allow_power_button", "true")
      val allowPowerButton = allowPowerButtonValue == "true"
      val allowNotificationsValue = getAsyncStorageValue("@kiosk_allow_notifications", "false")
      val allowNotifications = allowNotificationsValue == "true"
      val allowSystemInfoValue = getAsyncStorageValue("@kiosk_allow_system_info", "false")
      val allowSystemInfo = allowSystemInfoValue == "true"
      
      // Configure Lock Task features
      // GLOBAL_ACTIONS is included by default (Android's own default when setLockTaskFeatures is never called)
      // This prevents Samsung/OneUI from muting audio streams in lock task mode
      if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
        // Start with GLOBAL_ACTIONS as base (matches Android default behavior)
        var lockTaskFeatures = DevicePolicyManager.LOCK_TASK_FEATURE_GLOBAL_ACTIONS
        
        // allowPowerButton=false means admin wants to BLOCK the power menu
        if (!allowPowerButton) {
          lockTaskFeatures = lockTaskFeatures and DevicePolicyManager.LOCK_TASK_FEATURE_GLOBAL_ACTIONS.inv()
        }
        
        // SYSTEM_INFO: shows non-interactive status bar info (time, battery)
        if (allowSystemInfo) {
          lockTaskFeatures = lockTaskFeatures or DevicePolicyManager.LOCK_TASK_FEATURE_SYSTEM_INFO
        }
        if (allowNotifications) {
          lockTaskFeatures = lockTaskFeatures or DevicePolicyManager.LOCK_TASK_FEATURE_NOTIFICATIONS
          // Android requires HOME feature when NOTIFICATIONS is enabled
          lockTaskFeatures = lockTaskFeatures or DevicePolicyManager.LOCK_TASK_FEATURE_HOME
        }
        devicePolicyManager.setLockTaskFeatures(adminComponent, lockTaskFeatures)
        DebugLog.d("MainActivity", "Lock task features set: blockPowerButton=${!allowPowerButton}, notifications=$allowNotifications, systemInfo=$allowSystemInfo (flags=$lockTaskFeatures)")
      }
      
      // Safety net: force unmute audio streams after configuring lock task
      // Samsung/OneUI devices may mute audio in LOCK_TASK_MODE_LOCKED
      try {
        devicePolicyManager.setMasterVolumeMuted(adminComponent, false)
        val audioManager = getSystemService(Context.AUDIO_SERVICE) as android.media.AudioManager
        val streams = intArrayOf(
          android.media.AudioManager.STREAM_MUSIC,
          android.media.AudioManager.STREAM_NOTIFICATION,
          android.media.AudioManager.STREAM_ALARM,
          android.media.AudioManager.STREAM_RING
        )
        for (stream in streams) {
          audioManager.adjustStreamVolume(stream, android.media.AudioManager.ADJUST_UNMUTE, 0)
        }
        DebugLog.d("MainActivity", "Audio streams unmuted (Samsung audio fix)")
      } catch (e: Exception) {
        DebugLog.d("MainActivity", "Could not unmute audio streams: ${e.message}")
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
    
    // Re-register screen state receiver in case it was lost
    if (screenStateReceiver == null) {
      registerScreenStateReceiver()
    }
    
    // Re-register volume change receiver in case it was lost
    if (volumeChangeReceiver == null) {
      registerVolumeChangeReceiver()
    }

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
        // Check if power button (GlobalActions) is allowed — if so, the brief focus
        // loss may be from the power menu. Delay the re-lock to avoid dismissing it.
        val allowPowerButton = getAsyncStorageValue("@kiosk_allow_power_button", "true") == "true"
        val timeSinceFocusLost = System.currentTimeMillis() - lastFocusLostTime
        
        if (allowPowerButton && timeSinceFocusLost < 2000L) {
          // Power menu was likely just shown — defer re-lock to avoid focus conflict
          DebugLog.d("MainActivity", "Deferring re-lock: power menu may be active (${timeSinceFocusLost}ms since focus lost)")
          Handler(Looper.getMainLooper()).postDelayed({
            if (!isTaskLocked()) {
              enableKioskRestrictions()
              startLockTask()
              DebugLog.d("MainActivity", "Deferred re-lock completed")
            }
          }, 2000L)
        } else {
          enableKioskRestrictions()
          startLockTask()
          DebugLog.d("MainActivity", "Re-started lock task on resume (with kiosk restrictions)")
        }
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
    if (!hasFocus) {
      // Track when we lost focus (e.g. power menu / GlobalActions appeared)
      lastFocusLostTime = System.currentTimeMillis()
      // Cancel any pending hideSystemUI to avoid fighting with the system window
      hideSystemUIHandler.removeCallbacksAndMessages(null)
    } else {
      // Debounce hideSystemUI: wait 600ms before re-applying immersive mode.
      // This prevents the power menu from being immediately dismissed on devices
      // where the WindowManager focus bounces rapidly (TECNO, Infinix, itel / HiOS).
      // The Lock Task is still fully active during this window — no security impact.
      val timeSinceFocusLost = System.currentTimeMillis() - lastFocusLostTime
      val delay = if (timeSinceFocusLost < 1500L) 600L else 0L
      hideSystemUIHandler.removeCallbacksAndMessages(null)
      hideSystemUIHandler.postDelayed({ hideSystemUI() }, delay)
    }
  }

  private fun hideSystemUI() {
    // Pour Android 11+ (API 30+), utiliser la nouvelle API WindowInsetsController
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      window.insetsController?.apply {
        hide(WindowInsets.Type.systemBars())
        hide(WindowInsets.Type.statusBars())
        hide(WindowInsets.Type.navigationBars())
        systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
      }
    } else {
      // Pour Android 10 et inférieur, utiliser l'ancienne API
      @Suppress("DEPRECATION")
      window.decorView.systemUiVisibility = (
        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
        or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
        or View.SYSTEM_UI_FLAG_FULLSCREEN
        or View.SYSTEM_UI_FLAG_LOW_PROFILE  // Cache les contrôles système (menu Samsung)
      )
    }
  }

  // Volume Up 5-tap tracking
  private var volumeUpTapCount = 0
  private var volumeUpLastTapTime = 0L
  private val volumeUpTapTimeout = 2000L

  override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
    android.util.Log.d("MainActivity", "onKeyDown: keyCode=$keyCode")
    
    // Intercept Volume Up key events
    if (keyCode == KeyEvent.KEYCODE_VOLUME_UP) {
      // Check if feature is enabled
      val volumeUp5TapEnabled = getAsyncStorageValue("@kiosk_volume_up_5tap_enabled", "true") == "true"
      
      if (volumeUp5TapEnabled) {
        val currentTime = System.currentTimeMillis()
        
        // Reset counter if timeout exceeded
        if (currentTime - volumeUpLastTapTime > volumeUpTapTimeout) {
          volumeUpTapCount = 0
        }
        
        volumeUpTapCount++
        volumeUpLastTapTime = currentTime
        
        android.util.Log.d("MainActivity", "Volume Up pressed! Count: $volumeUpTapCount")
        
        if (volumeUpTapCount >= 5) {
          volumeUpTapCount = 0
          android.util.Log.d("MainActivity", "5-tap Volume Up detected! Navigating to PIN")
          
          blockAutoRelaunch = true
          
          Handler(Looper.getMainLooper()).postDelayed({
            sendNavigateToPinEvent()
          }, 100)
          
          return true // Consume the 5th tap - don't change volume
        }
      }
    } else if (keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) {
      // Volume Down resets the counter
      if (volumeUpTapCount > 0) {
        android.util.Log.d("MainActivity", "Volume Down pressed, resetting counter")
        volumeUpTapCount = 0
      }
    }
    
    // Let the event propagate normally
    return super.onKeyDown(keyCode, event)
  }

  override fun onKeyUp(keyCode: Int, event: KeyEvent?): Boolean {
    // Just pass through, but log for debugging
    if (keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) {
      android.util.Log.d("MainActivity", "onKeyUp: keyCode=$keyCode")
    }
    return super.onKeyUp(keyCode, event)
  }

  override fun onBackPressed() {
    val prefs = getSharedPreferences("FreeKioskSettings", Context.MODE_PRIVATE)
    val backButtonMode = prefs.getString("back_button_mode", "test") ?: "test"
    
    android.util.Log.i("FreeKiosk", "Back button pressed - back_button_mode=$backButtonMode")
    
    when (backButtonMode) {
      "test" -> {
        // Mode test: allow back button (shows FreeKiosk, user can see test UI)
        android.util.Log.i("FreeKiosk", "Back button: test mode - allowing back")
        super.onBackPressed()
      }
      "immediate", "timer" -> {
        // Mode immediate/timer: allow back, AppState listener in JS will handle relaunch
        android.util.Log.i("FreeKiosk", "Back button: $backButtonMode mode - allowing back for JS handling")
        super.onBackPressed()
      }
      else -> {
        // Unknown mode: block back button for safety
        android.util.Log.i("FreeKiosk", "Back button: unknown mode '$backButtonMode' - blocking")
      }
    }
  }

  /**
   * Read a value from AsyncStorage (React Native SQLite database)
   * Uses database "RKStorage" with table "catalystLocalStorage"
   */
  private fun getAsyncStorageValue(key: String, defaultValue: String): String {
    return try {
      val dbPath = getDatabasePath("RKStorage").absolutePath
      val db = android.database.sqlite.SQLiteDatabase.openDatabase(dbPath, null, android.database.sqlite.SQLiteDatabase.OPEN_READONLY)
      
      val cursor = db.rawQuery(
        "SELECT value FROM catalystLocalStorage WHERE key = ?",
        arrayOf(key)
      )
      
      val value = if (cursor.moveToFirst()) {
        cursor.getString(0) ?: defaultValue
      } else {
        defaultValue
      }
      
      cursor.close()
      db.close()
      value
    } catch (e: Exception) {
      DebugLog.d("MainActivity", "Error reading AsyncStorage key $key: ${e.message}")
      defaultValue
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
      val displayMode = getAsyncStorageValue("@kiosk_display_mode", "webview")
      externalAppPackage = getAsyncStorageValue("@kiosk_external_app_package", "")
      if (externalAppPackage.isNullOrEmpty()) externalAppPackage = null
      isExternalAppMode = displayMode == "external_app"
      isDeviceOwner = devicePolicyManager.isDeviceOwnerApp(packageName)
      
      DebugLog.d("MainActivity", "External app config: mode=$displayMode, package=$externalAppPackage, isDeviceOwner=$isDeviceOwner")
    } catch (e: Exception) {
      DebugLog.errorProduction("MainActivity", "Error reading external app config: ${e.message}")
    }
  }

  /**
   * Ensure the BootReceiver component is enabled when auto-launch is ON.
   * Fixes a regression where toggleAutoLaunch stopped calling enableAutoLaunch(),
   * leaving the component disabled in PackageManager even though AsyncStorage says "true".
   */
  private fun ensureBootReceiverEnabled() {
    try {
      val autoLaunchValue = getAsyncStorageValue("@kiosk_auto_launch", "false")
      val autoLaunchEnabled = autoLaunchValue == "true"
      
      if (autoLaunchEnabled) {
        val componentName = ComponentName(this, BootReceiver::class.java)
        val currentState = packageManager.getComponentEnabledSetting(componentName)
        if (currentState != PackageManager.COMPONENT_ENABLED_STATE_ENABLED && 
            currentState != PackageManager.COMPONENT_ENABLED_STATE_DEFAULT) {
          packageManager.setComponentEnabledSetting(
            componentName,
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
            PackageManager.DONT_KILL_APP
          )
          DebugLog.d("MainActivity", "BootReceiver re-enabled (was disabled)")
        }
      }
    } catch (e: Exception) {
      DebugLog.d("MainActivity", "Error ensuring BootReceiver state: ${e.message}")
    }
  }

  // ==================== ADB Configuration ====================
  
  /**
   * Handle ADB intent configuration
   * Allows setting up FreeKiosk via ADB commands:
   * 
   * First setup (no PIN configured):
   *   adb shell am start -n com.freekiosk/.MainActivity --es lock_package "com.app" --es pin "1234"
   * 
   * Modify existing config (PIN required):
   *   adb shell am start -n com.freekiosk/.MainActivity --es lock_package "com.app" --es pin "1234"
   * 
   * Full config with URL:
   *   adb shell am start -n com.freekiosk/.MainActivity --es url "https://example.com" --es pin "1234"
   * 
   * @return true if config was applied and app will restart, false otherwise
   */
  private fun handleAdbConfig(intent: Intent?): Boolean {
    if (intent == null) return false
    
    // Check if this is an ADB config intent
    val lockPackage = intent.getStringExtra("lock_package")
    val url = intent.getStringExtra("url")
    val pin = intent.getStringExtra("pin")
    val configJson = intent.getStringExtra("config") // Full JSON config
    val mqttBroker = intent.getStringExtra("mqtt_broker_url")

    // Skip if no config parameters
    if (lockPackage == null && url == null && configJson == null && mqttBroker == null) return false
    
    android.util.Log.i("FreeKiosk-ADB", "ADB config received: lock_package=$lockPackage, url=$url, config=${configJson != null}")
    
    // Prevent processing the same intent twice (after recreate)
    val intentHash = ((lockPackage ?: "").hashCode() + (url ?: "").hashCode() + (pin ?: "").hashCode() + System.currentTimeMillis() / 2000).toLong()
    if (intentHash == lastProcessedAdbIntent) return false
    lastProcessedAdbIntent = intentHash
    
    // Check if device is already configured (has PIN)
    val isVirginSetup = !hasExistingPin()
    
    if (isVirginSetup) {
      // First setup - PIN is REQUIRED to be set
      if (pin.isNullOrEmpty()) {
        android.util.Log.w("FreeKiosk-ADB", "Rejected: PIN required for first setup")
        showAdbToast("❌ ADB Config rejected: PIN required for first setup")
        return false
      }
      // Save the new PIN (hashed for ADB verification AND in AsyncStorage for UI)
      saveAdbPinHash(pin)
      savePinDirectly(pin)
      
    } else {
      // Already configured - verify PIN
      if (pin.isNullOrEmpty()) {
        android.util.Log.w("FreeKiosk-ADB", "Rejected: PIN required")
        showAdbToast("❌ ADB Config rejected: PIN required")
        return false
      }
      
      if (!verifyAdbPin(pin)) {
        android.util.Log.w("FreeKiosk-ADB", "Rejected: Invalid PIN")
        showAdbToast("❌ ADB Config rejected: Invalid PIN")
        return false
      }
    }
    
    // PIN verified - Save configuration to SharedPreferences as "pending config"
    // React Native (KioskScreen) will read this on startup and apply to AsyncStorage
    // This avoids Room/AsyncStorage v2 database compatibility issues
    val pendingConfig = getSharedPreferences("FreeKioskPendingConfig", Context.MODE_PRIVATE)
    val editor = pendingConfig.edit()
    editor.clear() // Clear any previous pending config
    
    android.util.Log.i("FreeKiosk-ADB", "Writing pending config to SharedPreferences...")
    
    try {
    
      // Handle full JSON config
      if (configJson != null) {
        try {
          val config = org.json.JSONObject(configJson)
          applyJsonConfigToPrefs(editor, config)
        } catch (e: Exception) {
          android.util.Log.e("FreeKiosk-ADB", "Invalid JSON: ${e.message}")
          showAdbToast("❌ ADB Config: Invalid JSON")
          return false
        }
      }
    
    // Handle individual parameters (override JSON if both provided)
    // Always include PIN in pending config so it's visible in Settings UI
    if (pin != null) {
      editor.putString("@kiosk_pin", pin)
    }

    if (lockPackage != null) {
      // Verify package exists
      try {
        packageManager.getPackageInfo(lockPackage, 0)
        editor.putString("@kiosk_external_app_package", lockPackage)
        editor.putString("@kiosk_display_mode", "external_app")
      } catch (e: Exception) {
        android.util.Log.w("FreeKiosk-ADB", "Package not found: $lockPackage")
        showAdbToast("❌ ADB Config: Package not found: $lockPackage")
        return false
      }
    }
    
    if (url != null) {
      editor.putString("@kiosk_url", url)
      // Only set display_mode to webview if lock_package was NOT provided
      // lock_package takes priority over url for display_mode
      if (lockPackage == null) {
        editor.putString("@kiosk_display_mode", "webview")
      }
    }
    
    // Handle additional options - only set if explicitly provided
    if (intent.hasExtra("kiosk_enabled")) {
      val kioskEnabled = intent.getBooleanExtra("kiosk_enabled", false)
      editor.putString("@kiosk_enabled", kioskEnabled.toString())
    }
    
    // Handle auto_launch as string or auto_start as boolean
    intent.getStringExtra("auto_launch")?.let {
      editor.putString("@kiosk_auto_launch", it)
    }
    if (intent.hasExtra("auto_start")) {
      val autoStart = intent.getBooleanExtra("auto_start", false)
      editor.putString("@kiosk_auto_launch", autoStart.toString())
    }
    
    intent.getStringExtra("screensaver_enabled")?.let {
      editor.putString("@screensaver_enabled", it)
    }
    
    intent.getStringExtra("auto_relaunch")?.let {
      editor.putString("@kiosk_auto_relaunch_app", it)
    }
    
    // test_mode: "true" = show return button with timer, "false" = immediate return (production)
    intent.getStringExtra("test_mode")?.let {
      editor.putString("@kiosk_external_app_test_mode", it)
      // Also set back_button_mode: test_mode=false → immediate, test_mode=true → test
      if (it == "false") {
        editor.putString("@kiosk_back_button_mode", "immediate")
      } else {
        editor.putString("@kiosk_back_button_mode", "test")
      }
    }
    
    // back_button_mode: "test" = stay on FreeKiosk, "timer" = countdown then relaunch, "immediate" = relaunch immediately
    intent.getStringExtra("back_button_mode")?.let {
      editor.putString("@kiosk_back_button_mode", it)
    }
    
    intent.getStringExtra("status_bar")?.let {
      editor.putString("@kiosk_status_bar_enabled", it)
    }
    
    intent.getStringExtra("rest_api_enabled")?.let {
      editor.putString("@kiosk_rest_api_enabled", it)
    }
    
    intent.getStringExtra("rest_api_port")?.let {
      editor.putString("@kiosk_rest_api_port", it)
    }
    
    intent.getStringExtra("rest_api_key")?.let {
      editor.putString("@kiosk_rest_api_key", it)
    }
    
    intent.getStringExtra("pin_mode")?.let {
      // Only accept valid values: "numeric" or "alphanumeric"
      if (it == "numeric" || it == "alphanumeric") {
        editor.putString("@kiosk_pin_mode", it)
      }
    }

    // MQTT configuration
    intent.getStringExtra("mqtt_enabled")?.let {
      editor.putString("@kiosk_mqtt_enabled", it)
    }
    intent.getStringExtra("mqtt_broker_url")?.let {
      editor.putString("@kiosk_mqtt_broker_url", it)
    }
    intent.getStringExtra("mqtt_port")?.let {
      editor.putString("@kiosk_mqtt_port", it)
    }
    intent.getStringExtra("mqtt_username")?.let {
      editor.putString("@kiosk_mqtt_username", it)
    }
    intent.getStringExtra("mqtt_password")?.let {
      // MQTT password goes to secure Keychain, not AsyncStorage
      // Use a special pending key that KioskScreen will handle
      editor.putString("@mqtt_password_pending", it)
    }
    intent.getStringExtra("mqtt_client_id")?.let {
      editor.putString("@kiosk_mqtt_client_id", it)
    }
    intent.getStringExtra("mqtt_base_topic")?.let {
      editor.putString("@kiosk_mqtt_base_topic", it)
    }
    intent.getStringExtra("mqtt_discovery_prefix")?.let {
      editor.putString("@kiosk_mqtt_discovery_prefix", it)
    }
    intent.getStringExtra("mqtt_status_interval")?.let {
      editor.putString("@kiosk_mqtt_status_interval", it)
    }
    intent.getStringExtra("mqtt_allow_control")?.let {
      editor.putString("@kiosk_mqtt_allow_control", it)
    }
    intent.getStringExtra("mqtt_device_name")?.let {
      editor.putString("@kiosk_mqtt_device_name", it)
    }
    
    // Mark that there is pending config
    editor.putBoolean("has_pending_config", true)
    
    // Use commit() (synchronous) instead of apply() to ensure data is written before process kill
    editor.commit()
    
    // Verify
    val verifyPrefs = getSharedPreferences("FreeKioskPendingConfig", Context.MODE_PRIVATE)
    val allEntries = verifyPrefs.all
    android.util.Log.i("FreeKiosk-ADB", "Pending config verification - ${allEntries.size} entries:")
    for ((key, value) in allEntries) {
      android.util.Log.i("FreeKiosk-ADB", "  Pending: $key = $value")
    }
    
    } catch (e: Exception) {
      android.util.Log.e("FreeKiosk-ADB", "Error applying config: ${e.message}")
      showAdbToast("❌ ADB Config: Error: ${e.message}")
      return false
    }
    
    // Show success toast
    val configType = when {
      lockPackage != null -> "app: $lockPackage"
      url != null -> "URL: $url"
      configJson != null -> "full config"
      else -> "settings"
    }
    android.util.Log.i("FreeKiosk-ADB", "Config applied: $configType")
    showAdbToast("✅ ADB Config applied: $configType")
    
    // Broadcast that config is saved (before restart)
    sendBroadcast(Intent("com.freekiosk.ADB_CONFIG_SAVED").apply {
      putExtra("config_type", configType)
    })
    
    // Restart in a handler to allow database sync to complete
    Handler(Looper.getMainLooper()).postDelayed({
      // Broadcast that restart is starting
      sendBroadcast(Intent("com.freekiosk.ADB_CONFIG_RESTARTING"))
      
      // Create restart intent - FreeKiosk will restart, load settings (including
      // lock_package), activate kiosk mode, then launch the external app via 
      // KioskScreen.loadSettings() → launchExternalApp() → AppLauncherModule
      // which will emit the EXTERNAL_APP_LAUNCHED broadcast
      val restartIntent = packageManager.getLaunchIntentForPackage(packageName)
      restartIntent?.apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
      }
      
      if (intent.getBooleanExtra("auto_start", false) && lockPackage != null) {
        android.util.Log.i("FreeKiosk-ADB", "App will auto-start after restart via normal loadSettings flow")
      }
      
      // Start the new instance
      if (restartIntent != null) {
        startActivity(restartIntent)
      }
      
      // Kill immediately
      android.os.Process.killProcess(android.os.Process.myPid())
      System.exit(0)
    }, 500) // Wait 500ms for toast to show
    
    return true
  }
  
  /**
   * Restart the app by killing the process and relaunching
   * This ensures React Native picks up the new config from SharedPreferences
   */
  private fun restartApp() {
    try {
      // Create a fresh intent without the ADB config extras
      val restartIntent = packageManager.getLaunchIntentForPackage(packageName)
      restartIntent?.apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
      }
      
      // Start the new instance
      if (restartIntent != null) {
        startActivity(restartIntent)
        // Kill the current process
        android.os.Process.killProcess(android.os.Process.myPid())
      } else {
        android.util.Log.e("FreeKiosk-ADB", "Failed to get launch intent for restart")
      }
    } catch (e: Exception) {
      android.util.Log.e("FreeKiosk-ADB", "Failed to restart app: ${e.message}")
    }
  }
  
  /**
   * Open the AsyncStorage SQLite database (create if not exists)
   * Uses database "RKStorage" with table "catalystLocalStorage"
   */
  private fun openAsyncStorageDb(): SQLiteDatabase? {
    return try {
      val dbPath = getDatabasePath("RKStorage").absolutePath
      
      // Create parent directory if it doesn't exist
      val dbFile = java.io.File(dbPath)
      dbFile.parentFile?.let { parent ->
        if (!parent.exists()) {
          parent.mkdirs()
        }
      }
      
      // Open or create database
      val db = SQLiteDatabase.openOrCreateDatabase(dbPath, null)
      
      // Ensure the catalystLocalStorage table exists (same schema as AsyncStorage)
      db.execSQL("""
        CREATE TABLE IF NOT EXISTS catalystLocalStorage (
          `key` TEXT NOT NULL,
          `value` TEXT,
          PRIMARY KEY(`key`)
        )
      """.trimIndent())
      
      db
    } catch (e: Exception) {
      android.util.Log.e("FreeKiosk-ADB", "Failed to open AsyncStorage DB: ${e.message}")
      null
    }
  }
  
  /**
   * Set a value in AsyncStorage SQLite database
   */
  private fun setAsyncStorageValue(db: SQLiteDatabase, key: String, value: String) {
    val contentValues = ContentValues().apply {
      put("key", key)
      put("value", value)
    }
    db.insertWithOnConflict("catalystLocalStorage", null, contentValues, SQLiteDatabase.CONFLICT_REPLACE)
  }

  /**
   * Apply full JSON configuration to SharedPreferences (pending config)
   */
  private fun applyJsonConfigToPrefs(editor: android.content.SharedPreferences.Editor, config: org.json.JSONObject) {
    // Map of JSON keys to AsyncStorage keys
    val keyMapping = mapOf(
      "url" to "@kiosk_url",
      "lock_package" to "@kiosk_external_app_package",
      "display_mode" to "@kiosk_display_mode",
      "kiosk_enabled" to "@kiosk_enabled",
      "auto_launch" to "@kiosk_auto_launch",
      "auto_relaunch" to "@kiosk_auto_relaunch_app",
      "screensaver_enabled" to "@screensaver_enabled",
      "screensaver_delay" to "@screensaver_inactivity_delay",
      "screensaver_brightness" to "@screensaver_brightness",
      "status_bar_enabled" to "@kiosk_status_bar_enabled",
      "status_bar_show_battery" to "@kiosk_status_bar_show_battery",
      "status_bar_show_wifi" to "@kiosk_status_bar_show_wifi",
      "status_bar_show_time" to "@kiosk_status_bar_show_time",
      "rest_api_enabled" to "@kiosk_rest_api_enabled",
      "rest_api_port" to "@kiosk_rest_api_port",
      "rest_api_key" to "@kiosk_rest_api_key",
      "allow_power_button" to "@kiosk_allow_power_button",
      "back_button_mode" to "@kiosk_back_button_mode",
      "default_brightness" to "@default_brightness",
      "pin_mode" to "@kiosk_pin_mode",
      // MQTT
      "mqtt_enabled" to "@kiosk_mqtt_enabled",
      "mqtt_broker_url" to "@kiosk_mqtt_broker_url",
      "mqtt_port" to "@kiosk_mqtt_port",
      "mqtt_username" to "@kiosk_mqtt_username",
      "mqtt_client_id" to "@kiosk_mqtt_client_id",
      "mqtt_base_topic" to "@kiosk_mqtt_base_topic",
      "mqtt_discovery_prefix" to "@kiosk_mqtt_discovery_prefix",
      "mqtt_status_interval" to "@kiosk_mqtt_status_interval",
      "mqtt_allow_control" to "@kiosk_mqtt_allow_control",
      "mqtt_device_name" to "@kiosk_mqtt_device_name"
    )
    
    for ((jsonKey, storageKey) in keyMapping) {
      if (config.has(jsonKey)) {
        val value = config.get(jsonKey)
        editor.putString(storageKey, value.toString())
      }
    }
    
    // Handle lock_package -> also set display_mode
    if (config.has("lock_package") && !config.has("display_mode")) {
      editor.putString("@kiosk_display_mode", "external_app")
    }

    // MQTT password requires special handling (goes to secure Keychain, not AsyncStorage)
    if (config.has("mqtt_password")) {
      editor.putString("@mqtt_password_pending", config.getString("mqtt_password"))
    }
  }
  
  /**
   * Check if a PIN is already configured
   */
  private fun hasExistingPin(): Boolean {
    val adbPrefs = getSharedPreferences("FreeKioskAdbConfig", Context.MODE_PRIVATE)
    return adbPrefs.getString("pin_hash", null) != null
  }
  
  /**
   * Save PIN hash for ADB verification
   * Uses SHA-256 with salt for secure storage
   */
  private fun saveAdbPinHash(pin: String) {
    try {
      val salt = java.util.UUID.randomUUID().toString()
      val hash = hashPinWithSalt(pin, salt)
      
      val prefs = getSharedPreferences("FreeKioskAdbConfig", Context.MODE_PRIVATE)
      prefs.edit()
        .putString("pin_hash", hash)
        .putString("pin_salt", salt)
        .apply()
        
      DebugLog.d("MainActivity", "ADB PIN hash saved")
    } catch (e: Exception) {
      DebugLog.errorProduction("MainActivity", "Failed to save ADB PIN hash: ${e.message}")
    }
  }
  
  /**
   * Save PIN directly to pending config SharedPreferences for UI
   */
  private fun savePinDirectly(pin: String) {
    try {
      val pendingConfig = getSharedPreferences("FreeKioskPendingConfig", Context.MODE_PRIVATE)
      pendingConfig.edit().putString("@kiosk_pin", pin).commit()
      android.util.Log.i("FreeKiosk-ADB", "PIN saved to pending config")
    } catch (e: Exception) {
      android.util.Log.e("FreeKiosk-ADB", "Failed to save PIN: ${e.message}")
    }
  }
  
  /**
   * Verify PIN against stored hash
   */
  private fun verifyAdbPin(pin: String): Boolean {
    try {
      val prefs = getSharedPreferences("FreeKioskAdbConfig", Context.MODE_PRIVATE)
      val storedHash = prefs.getString("pin_hash", null)
      val storedSalt = prefs.getString("pin_salt", null)
      
      if (storedHash != null && storedSalt != null) {
        val inputHash = hashPinWithSalt(pin, storedSalt)
        return inputHash == storedHash
      }
      
      // Fallback: check legacy plaintext PIN from AsyncStorage v2
      val legacyPin = getAsyncStorageValue("@kiosk_pin", "")
      if (legacyPin.isNotEmpty()) {
        if (pin == legacyPin) {
          // Migrate to hashed storage
          saveAdbPinHash(pin)
          return true
        }
        return false
      }
      
      // No PIN stored, check default (for backward compatibility)
      return pin == "1234"
      
    } catch (e: Exception) {
      DebugLog.errorProduction("MainActivity", "Failed to verify ADB PIN: ${e.message}")
      return false
    }
  }
  
  /**
   * Hash PIN with salt using SHA-256
   */
  private fun hashPinWithSalt(pin: String, salt: String): String {
    val combined = "$pin:$salt:freekiosk_adb"
    val digest = MessageDigest.getInstance("SHA-256")
    val hashBytes = digest.digest(combined.toByteArray(Charsets.UTF_8))
    return hashBytes.joinToString("") { "%02x".format(it) }
  }
  
  /**
   * Show toast for ADB feedback
   */
  private fun showAdbToast(message: String) {
    Handler(Looper.getMainLooper()).post {
      Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    }
  }

  override fun onDestroy() {
    super.onDestroy()
    disableKioskRestrictions()
    
    // Clean up blocking overlays
    try {
      BlockingOverlayManager.getInstance(this).destroy()
      DebugLog.d("MainActivity", "Blocking overlays cleaned up")
    } catch (e: Exception) {
      DebugLog.errorProduction("MainActivity", "Error cleaning up blocking overlays: ${e.message}")
    }
    
    // Unregister screen state receiver
    try {
      if (screenStateReceiver != null) {
        unregisterReceiver(screenStateReceiver)
        screenStateReceiver = null
        DebugLog.d("MainActivity", "Screen state receiver unregistered")
      }
    } catch (e: Exception) {
      DebugLog.errorProduction("MainActivity", "Error unregistering screen state receiver: ${e.message}")
    }
    
    // Unregister volume change receiver
    try {
      if (volumeChangeReceiver != null) {
        unregisterReceiver(volumeChangeReceiver)
        volumeChangeReceiver = null
        DebugLog.d("MainActivity", "Volume change receiver unregistered")
      }
    } catch (e: Exception) {
      DebugLog.errorProduction("MainActivity", "Error unregistering volume change receiver: ${e.message}")
    }
  }

  /**
   * Register broadcast receiver to detect screen on/off events
   * Safe to call multiple times - will skip if already registered
   */
  private fun registerScreenStateReceiver() {
    try {
      // Skip if already registered
      if (screenStateReceiver != null) {
        android.util.Log.d("MainActivity", "Screen state receiver already registered")
        return
      }
      
      screenStateReceiver = ScreenStateReceiver()
      
      val filter = IntentFilter()
      filter.addAction(Intent.ACTION_SCREEN_ON)
      filter.addAction(Intent.ACTION_SCREEN_OFF)
      
      registerReceiver(screenStateReceiver, filter)
      android.util.Log.d("MainActivity", "Screen state receiver registered successfully")
    } catch (e: Exception) {
      android.util.Log.e("MainActivity", "Error registering screen state receiver: ${e.message}")
    }
  }

  /**
   * Register broadcast receiver to detect volume changes from hardware buttons
   * Safe to call multiple times - will skip if already registered
   */
  private fun registerVolumeChangeReceiver() {
    try {
      // Skip if already registered
      if (volumeChangeReceiver != null) {
        android.util.Log.d("MainActivity", "Volume change receiver already registered")
        return
      }
      
      volumeChangeReceiver = VolumeChangeReceiver()
      
      val filter = IntentFilter()
      filter.addAction("android.media.VOLUME_CHANGED_ACTION")
      
      registerReceiver(volumeChangeReceiver, filter)
      android.util.Log.d("MainActivity", "Volume change receiver registered successfully")
    } catch (e: Exception) {
      android.util.Log.e("MainActivity", "Error registering volume change receiver: ${e.message}")
    }
  }

  /**
   * Handle configuration changes (rotation, screen size, etc.)
   */
  override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
    super.onConfigurationChanged(newConfig)
    
    // Re-hide system UI after rotation (system bars can reappear on config change)
    hideSystemUI()
    
    // Notify blocking overlay manager about configuration change
    try {
      val manager = BlockingOverlayManager.getInstance(this)
      manager.onConfigurationChanged(newConfig)
      DebugLog.d("MainActivity", "Configuration changed - blocking overlays updated")
    } catch (e: Exception) {
      DebugLog.e("MainActivity", "Error handling configuration change: ${e.message}")
    }
  }
}
