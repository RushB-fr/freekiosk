package com.freekiosk

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.net.wifi.WifiManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.bluetooth.BluetoothManager
import android.media.AudioManager
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.app.NotificationCompat
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class OverlayService : Service() {

    companion object {
        // Opacité du bouton indicateur visuel (0.0 = invisible, 1.0 = opaque)
        // Note: Le 5-tap fonctionne partout grâce à l'overlay invisible 1x1 pixel avec FLAG_WATCH_OUTSIDE_TOUCH
        @Volatile
        var buttonOpacity = 0.0f

        // Status bar enabled/disabled
        @Volatile
        var statusBarEnabled = false
        
        // Status bar items visibility
        @Volatile
        var showBattery = true
        @Volatile
        var showWifi = true
        @Volatile
        var showBluetooth = true
        @Volatile
        var showVolume = true
        @Volatile
        var showTime = true

        // Instance du service pour pouvoir mettre à jour le bouton
        @Volatile
        private var instance: OverlayService? = null

        fun updateButtonOpacity(opacity: Float) {
            buttonOpacity = opacity
            instance?.updateButtonAlpha()
        }

        fun updateStatusBarEnabled(enabled: Boolean) {
            statusBarEnabled = enabled
            instance?.recreateStatusBar()
        }

        fun updateStatusBarItems(battery: Boolean, wifi: Boolean, bluetooth: Boolean, volume: Boolean, time: Boolean) {
            showBattery = battery
            showWifi = wifi
            showBluetooth = bluetooth
            showVolume = volume
            showTime = time
            instance?.recreateStatusBar()
        }

        /**
         * Bring the return button overlay to the front (above other overlays)
         * Called when blocking overlays are updated to ensure return button stays accessible
         */
        fun bringToFront() {
            instance?.let { service ->
                Handler(Looper.getMainLooper()).post {
                    service.overlayView?.let { view ->
                        try {
                            // Remove and re-add to bring to front
                            service.windowManager?.removeView(view)
                            service.createOverlay()
                            DebugLog.d("OverlayService", "Return button brought to front")
                        } catch (e: Exception) {
                            DebugLog.e("OverlayService", "Failed to bring to front: ${e.message}")
                        }
                    }
                }
            }
        }
    }

    private var windowManager: WindowManager? = null
    private var overlayView: View? = null
    private var returnButton: View? = null  // Changed from Button to View (now a FrameLayout)
    private var statusBarView: View? = null
    private var batteryText: TextView? = null
    private var batteryChargingIcon: android.widget.ImageView? = null
    private var wifiStatusIcon: android.widget.ImageView? = null
    private var bluetoothStatusIcon: android.widget.ImageView? = null
    private var volumeIcon: android.widget.ImageView? = null
    private var volumeText: TextView? = null
    private var timeText: TextView? = null
    private var tapCount = 0
    private val tapHandler = Handler(Looper.getMainLooper())
    private val statusUpdateHandler = Handler(Looper.getMainLooper())
    private val TAP_TIMEOUT = 1500L // 1.5 secondes pour faire N taps
    private var requiredTaps = 5 // Default, will be overridden from intent
    private val CHANNEL_ID = "FreeKioskOverlay"
    private val NOTIFICATION_ID = 1001
    private val STATUS_UPDATE_INTERVAL = 5000L // Update every 5 seconds

    // BroadcastReceiver pour détecter quand l'écran s'allume
    private val screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                Intent.ACTION_SCREEN_ON -> {
                    DebugLog.d("OverlayService", "Screen ON - ensuring overlay is visible")
                    // Recréer l'overlay si nécessaire
                    if (overlayView == null) {
                        createOverlay()
                    }
                }
                Intent.ACTION_SCREEN_OFF -> {
                    DebugLog.d("OverlayService", "Screen OFF")
                }
            }
        }
    }
    
    // BroadcastReceiver pour détecter les changements de volume
    private val volumeReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == "android.media.VOLUME_CHANGED_ACTION") {
                DebugLog.d("OverlayService", "Volume changed - updating status bar")
                updateStatusBar()
            }
        }
    }
    
    // BroadcastReceiver pour détecter les changements de batterie en temps réel
    private val batteryReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                Intent.ACTION_BATTERY_CHANGED,
                Intent.ACTION_POWER_CONNECTED,
                Intent.ACTION_POWER_DISCONNECTED -> {
                    DebugLog.d("OverlayService", "Battery status changed - updating charging icon")
                    updateBatteryChargingIcon(intent)
                }
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        
        // Charger l'opacité depuis SharedPreferences
        loadButtonOpacity()
        
        // Démarrer comme Foreground Service pour survivre à la mise en veille
        startForegroundService()
        
        // Enregistrer le receiver pour les événements écran
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_ON)
            addAction(Intent.ACTION_SCREEN_OFF)
        }
        registerReceiver(screenReceiver, filter)
        
        // Enregistrer le receiver pour les changements de volume
        val volumeFilter = IntentFilter("android.media.VOLUME_CHANGED_ACTION")
        registerReceiver(volumeReceiver, volumeFilter)
        
        // Enregistrer le receiver pour les changements de batterie
        val batteryFilter = IntentFilter().apply {
            addAction(Intent.ACTION_BATTERY_CHANGED)
            addAction(Intent.ACTION_POWER_CONNECTED)
            addAction(Intent.ACTION_POWER_DISCONNECTED)
        }
        registerReceiver(batteryReceiver, batteryFilter)
        
        // Créer l'overlay seulement si la permission est accordée
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this)) {
            createOverlay()
        } else {
            DebugLog.d("OverlayService", "Overlay permission not granted - running without visible button")
        }
    }

    private fun loadButtonOpacity() {
        try {
            val prefs = getSharedPreferences("FreeKioskSettings", Context.MODE_PRIVATE)
            buttonOpacity = prefs.getFloat("overlay_button_opacity", 0.0f)
            statusBarEnabled = prefs.getBoolean("status_bar_enabled", false)
            showBattery = prefs.getBoolean("status_bar_show_battery", true)
            showWifi = prefs.getBoolean("status_bar_show_wifi", true)
            showBluetooth = prefs.getBoolean("status_bar_show_bluetooth", true)
            showVolume = prefs.getBoolean("status_bar_show_volume", true)
            showTime = prefs.getBoolean("status_bar_show_time", true)
            DebugLog.d("OverlayService", "Loaded settings - opacity: $buttonOpacity, status bar: $statusBarEnabled, items: B:$showBattery W:$showWifi BT:$showBluetooth V:$showVolume T:$showTime")
        } catch (e: Exception) {
            DebugLog.errorProduction("OverlayService", "Failed to load settings: ${e.message}")
            buttonOpacity = 0.0f
            statusBarEnabled = false
            showBattery = true
            showWifi = true
            showBluetooth = true
            showVolume = true
            showTime = true
        }
    }

    private fun startForegroundService() {
        // Créer le canal de notification (Android O+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "FreeKiosk Overlay",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Overlay service for external app mode"
                setShowBadge(false)
            }
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }

        // Créer une notification minimale
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("FreeKiosk")
            .setContentText("External app mode active")
            .setSmallIcon(android.R.drawable.ic_menu_view)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()

        startForeground(NOTIFICATION_ID, notification)
        DebugLog.d("OverlayService", "Foreground service started")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Get required taps from intent (default 5)
        intent?.getIntExtra("REQUIRED_TAPS", 5)?.let { taps ->
            requiredTaps = taps.coerceIn(2, 10)
            DebugLog.d("OverlayService", "Required taps set to: $requiredTaps")
        }
        
        // Vérifier la permission overlay avant de créer des vues
        val hasOverlayPermission = Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this)
        
        // Recréer l'overlay si le service est redémarré ET si on a la permission
        if (hasOverlayPermission && overlayView == null) {
            createOverlay()
        }

        // Créer la status bar si activée ET si on a la permission
        if (hasOverlayPermission && statusBarEnabled && statusBarView == null) {
            createStatusBar()
        }
        
        // START_STICKY: le service sera redémarré si tué par le système
        return START_STICKY
    }


    private fun createOverlay() {
        // SYSTÈME DE DÉTECTION FULLSCREEN 5-TAP:
        // 1. Overlay INVISIBLE de 1x1 pixel avec FLAG_WATCH_OUTSIDE_TOUCH
        //    Détecte TOUS les taps de l'écran sans bloquer l'app en dessous
        // 2. Bouton VISIBLE optionnel en bas à droite avec FLAG_NOT_TOUCHABLE
        //    Indicateur visuel qui ne bloque rien
        // Résultat: L'app en dessous reste 100% clickable, 5-tap fonctionne partout!
        
        // Créer un overlay INVISIBLE de 1x1 pixel qui observe TOUS les taps de l'écran
        // FLAG_WATCH_OUTSIDE_TOUCH fait que cet overlay reçoit les événements de TOUT l'écran
        overlayView = View(this).apply {
            setBackgroundColor(android.graphics.Color.TRANSPARENT)
            
            // Ce listener reçoit TOUS les taps de l'écran grâce à FLAG_WATCH_OUTSIDE_TOUCH
            setOnTouchListener { _, event ->
                if (event.action == android.view.MotionEvent.ACTION_OUTSIDE ||
                    event.action == android.view.MotionEvent.ACTION_DOWN) {
                    handleTap()
                }
                false // Ne jamais bloquer
            }
        }

        // Créer séparément le bouton visible (optionnel, juste pour montrer où taper)
        val buttonView = FrameLayout(this).apply {
            returnButton = Button(context).apply {
                text = "↩"
                setTextColor(android.graphics.Color.WHITE)
                setBackgroundColor(android.graphics.Color.parseColor("#2196F3"))
                setPadding(0, 0, 0, 0)
                textSize = 12f
                alpha = buttonOpacity
                minimumWidth = 0
                minimumHeight = 0
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    elevation = 8f
                }
                // Pas d'onClick, le tap est géré par l'overlay invisible
            }
            addView(returnButton, FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                gravity = Gravity.BOTTOM or Gravity.END // Toujours en bas à droite
                setMargins(0, 0, 0, 0)
            })
        }

        // Overlay invisible 1x1 pixel avec FLAG_WATCH_OUTSIDE_TOUCH
        // Reçoit TOUS les taps de l'écran sans bloquer quoi que ce soit
        val invisibleParams = WindowManager.LayoutParams(
            1, // 1 pixel de large
            1, // 1 pixel de haut
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else
                @Suppress("DEPRECATION")
                WindowManager.LayoutParams.TYPE_SYSTEM_ALERT,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
            WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
            WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = 0
            y = 0
        }

        // Paramètres pour le bouton visible (ne bloque pas, juste visuel en bas à droite)
        val buttonParams = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else
                @Suppress("DEPRECATION")
                WindowManager.LayoutParams.TYPE_SYSTEM_ALERT,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
            WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.BOTTOM or Gravity.END
            x = 0
            y = 0
        }

        try {
            // Ajouter d'abord l'overlay invisible qui détecte les taps
            windowManager?.addView(overlayView, invisibleParams)
            // Puis ajouter le bouton visible par-dessus (optionnel, juste pour indiquer)
            windowManager?.addView(buttonView, buttonParams)
            DebugLog.d("OverlayService", "Overlay created successfully (fullscreen detection)")
        } catch (e: Exception) {
            DebugLog.errorProduction("OverlayService", "Failed to create overlay: ${e.message}")
        }
    }

    // Recréer l'overlay (appelé quand la position change)
    private fun recreateOverlay() {
        try {
            // Supprimer les anciens overlays si existants
            if (overlayView?.windowToken != null) {
                windowManager?.removeView(overlayView)
            }
            if (returnButton?.windowToken != null) {
                windowManager?.removeView(returnButton?.parent as? View)
            }
            
            overlayView = null
            returnButton = null

            // Recréer l'overlay avec la nouvelle position
            createOverlay()
        } catch (e: Exception) {
            DebugLog.errorProduction("OverlayService", "Failed to recreate overlay: ${e.message}")
        }
    }

    // Méthode pour mettre à jour l'alpha du bouton en temps réel
    private fun updateButtonAlpha() {
        try {
            returnButton?.alpha = buttonOpacity
            DebugLog.d("OverlayService", "Updated button alpha to: $buttonOpacity")
        } catch (e: Exception) {
            DebugLog.errorProduction("OverlayService", "Failed to update button alpha: ${e.message}")
        }
    }

    // Recréer la status bar (appelé quand le toggle change)
    private fun recreateStatusBar() {
        try {
            // Supprimer l'ancienne status bar si elle existe
            statusBarView?.let { windowManager?.removeView(it) }
            statusBarView = null

            // Créer la nouvelle si activée
            if (statusBarEnabled) {
                createStatusBar()
                startStatusUpdates()
            } else {
                stopStatusUpdates()
            }
        } catch (e: Exception) {
            DebugLog.errorProduction("OverlayService", "Failed to recreate status bar: ${e.message}")
        }
    }

    private fun createStatusBar() {
        try {
            // Convertir dp en pixels
            val density = resources.displayMetrics.density
            val heightPx = (28 * density).toInt() // 28dp de hauteur (réduit pour ressembler à une status bar standard)
            val paddingPx = (8 * density).toInt() // Padding réduit
            val textSizePx = 12f // Texte légèrement plus petit
            val iconSizePx = (16 * density).toInt() // Icônes légèrement plus petites

            // Créer le LinearLayout horizontal pour la barre d'état
            val statusLayout = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                setBackgroundColor(Color.parseColor("#E0000000")) // Noir plus opaque
                setPadding(paddingPx, paddingPx / 2, paddingPx, paddingPx / 2)
                gravity = Gravity.CENTER_VERTICAL
            }

            // Style commun pour tous les TextViews
            val textStyle: (TextView) -> Unit = { tv ->
                tv.setTextColor(Color.WHITE)
                tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, textSizePx)
                tv.setPadding(paddingPx / 3, 0, paddingPx / 2, 0)
            }

            // Fonction pour créer un conteneur avec icône + texte
            fun createStatusItem(iconRes: Int, initialText: String): Pair<LinearLayout, TextView> {
                val container = LinearLayout(this).apply {
                    orientation = LinearLayout.HORIZONTAL
                    gravity = Gravity.CENTER_VERTICAL
                    setPadding(0, 0, paddingPx, 0)
                }

                // Icône
                val icon = android.widget.ImageView(this).apply {
                    setImageResource(iconRes)
                    layoutParams = LinearLayout.LayoutParams(iconSizePx, iconSizePx)
                    setColorFilter(Color.WHITE)
                }
                container.addView(icon)

                // Texte
                val textView = TextView(this).apply {
                    text = initialText
                    textStyle(this)
                }
                container.addView(textView)

                return Pair(container, textView)
            }

            // Batterie (éclair si en charge + icône + pourcentage)
            val batteryContainer = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(0, 0, paddingPx, 0)
            }
            // Éclair de charge - ajouté EN PREMIER (à gauche de l'icône)
            batteryChargingIcon = android.widget.ImageView(this).apply {
                setImageResource(resources.getIdentifier("ic_charging", "drawable", packageName))
                layoutParams = LinearLayout.LayoutParams((iconSizePx * 0.8).toInt(), (iconSizePx * 0.8).toInt()).apply {
                    setMargins(0, 0, 0, 0) // Collé
                }
                visibility = View.GONE // Caché par défaut
            }
            batteryContainer.addView(batteryChargingIcon)
            val batteryIcon = android.widget.ImageView(this).apply {
                setImageResource(resources.getIdentifier("ic_battery", "drawable", packageName))
                layoutParams = LinearLayout.LayoutParams(iconSizePx, iconSizePx)
                setColorFilter(Color.WHITE)
            }
            batteryContainer.addView(batteryIcon)
            batteryText = TextView(this).apply {
                text = "--"
                textStyle(this)
            }
            batteryContainer.addView(batteryText)
            
            // Ajouter la batterie seulement si activée
            if (showBattery) {
                statusLayout.addView(batteryContainer)
            }

            // Wi-Fi (icône + statut icône)
            val wifiContainer = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(0, 0, paddingPx / 2, 0)
            }
            val wifiIcon = android.widget.ImageView(this).apply {
                setImageResource(resources.getIdentifier("ic_wifi", "drawable", packageName))
                layoutParams = LinearLayout.LayoutParams(iconSizePx, iconSizePx)
                setColorFilter(Color.WHITE)
            }
            wifiContainer.addView(wifiIcon)
            wifiStatusIcon = android.widget.ImageView(this).apply {
                setImageResource(resources.getIdentifier("ic_cross", "drawable", packageName))
                layoutParams = LinearLayout.LayoutParams(iconSizePx, iconSizePx).apply {
                    setMargins(paddingPx / 4, 0, 0, 0)
                }
            }
            wifiContainer.addView(wifiStatusIcon)
            
            // Ajouter le WiFi seulement si activé
            if (showWifi) {
                statusLayout.addView(wifiContainer)
            }

            // Bluetooth (icône + statut icône)
            val bluetoothContainer = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(0, 0, paddingPx / 2, 0)
            }
            val bluetoothIcon = android.widget.ImageView(this).apply {
                setImageResource(resources.getIdentifier("ic_bluetooth", "drawable", packageName))
                layoutParams = LinearLayout.LayoutParams(iconSizePx, iconSizePx)
                setColorFilter(Color.WHITE)
            }
            bluetoothContainer.addView(bluetoothIcon)
            bluetoothStatusIcon = android.widget.ImageView(this).apply {
                setImageResource(resources.getIdentifier("ic_cross", "drawable", packageName))
                layoutParams = LinearLayout.LayoutParams(iconSizePx, iconSizePx).apply {
                    setMargins(paddingPx / 4, 0, 0, 0)
                }
            }
            bluetoothContainer.addView(bluetoothStatusIcon)
            
            // Ajouter le Bluetooth seulement si activé
            if (showBluetooth) {
                statusLayout.addView(bluetoothContainer)
            }

            // Volume (with dynamic icon)
            val volumeIconRes = resources.getIdentifier("ic_volume_medium", "drawable", packageName)
            val volumeContainer = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(0, 0, paddingPx, 0)
            }
            volumeIcon = android.widget.ImageView(this).apply {
                setImageResource(volumeIconRes)
                layoutParams = LinearLayout.LayoutParams(iconSizePx, iconSizePx)
                setColorFilter(Color.WHITE)
            }
            volumeContainer.addView(volumeIcon)
            volumeText = TextView(this).apply {
                text = "--"
                textStyle(this)
            }
            volumeContainer.addView(volumeText)

            // Spacer pour pousser l'heure à droite (seulement si on a des items à gauche OU à droite)
            val hasLeftItems = showBattery || showWifi || showBluetooth
            val hasRightItems = showVolume || showTime
            
            if (hasLeftItems && hasRightItems) {
                val spacer = View(this)
                statusLayout.addView(spacer, LinearLayout.LayoutParams(
                    0,
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    1f
                ))
            }
            
            // Ajouter le volume seulement si activé
            if (showVolume) {
                statusLayout.addView(volumeContainer)
            }

            // Heure (avec icône)
            val timeIcon = resources.getIdentifier("ic_time", "drawable", packageName)
            val (timeContainer, timeTextView) = createStatusItem(timeIcon, "--:--")
            timeText = timeTextView
            
            // Ajouter l'heure seulement si activée
            if (showTime) {
                statusLayout.addView(timeContainer)
            }

            statusBarView = statusLayout

            // Paramètres de la fenêtre overlay pour la status bar
            val layoutType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            } else {
                @Suppress("DEPRECATION")
                WindowManager.LayoutParams.TYPE_SYSTEM_ALERT
            }

            val params = WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT, // Toute la largeur
                heightPx, // Hauteur fixe
                layoutType,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                PixelFormat.TRANSLUCENT
            )

            params.gravity = Gravity.TOP or Gravity.START  // Position en haut à gauche
            params.x = 0
            params.y = 0

            windowManager?.addView(statusBarView, params)
            DebugLog.d("OverlayService", "Status bar created successfully at top of screen")

            // Première mise à jour immédiate
            updateStatusBar()
        } catch (e: Exception) {
            DebugLog.errorProduction("OverlayService", "Failed to create status bar: ${e.message}")
        }
    }

    private fun updateStatusBar() {
        try {
            // Heure
            val currentTime = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date())
            timeText?.text = currentTime

            // Batterie
            val batteryStatus: Intent? = registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            if (batteryStatus != null) {
                val level = batteryStatus.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
                val scale = batteryStatus.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
                val batteryPct = (level * 100 / scale.toFloat()).toInt()
                val status = batteryStatus.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
                val isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                                status == BatteryManager.BATTERY_STATUS_FULL

                batteryText?.text = "$batteryPct%"
                batteryChargingIcon?.visibility = if (isCharging) View.VISIBLE else View.GONE
            }

            // Wi-Fi
            try {
                val connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
                if (connectivityManager != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    val network = connectivityManager.activeNetwork
                    val capabilities = connectivityManager.getNetworkCapabilities(network)
                    val isWifiConnected = capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true

                    val iconRes = if (isWifiConnected) {
                        resources.getIdentifier("ic_check", "drawable", packageName)
                    } else {
                        resources.getIdentifier("ic_cross", "drawable", packageName)
                    }
                    wifiStatusIcon?.setImageResource(iconRes)
                } else {
                    wifiStatusIcon?.setImageResource(resources.getIdentifier("ic_cross", "drawable", packageName))
                }
            } catch (e: SecurityException) {
                wifiStatusIcon?.setImageResource(resources.getIdentifier("ic_cross", "drawable", packageName))
                DebugLog.d("OverlayService", "WiFi permission denied: ${e.message}")
            } catch (e: Exception) {
                wifiStatusIcon?.setImageResource(resources.getIdentifier("ic_cross", "drawable", packageName))
                DebugLog.errorProduction("OverlayService", "WiFi error: ${e.message}")
            }

            // Bluetooth
            try {
                val bluetoothManager = getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
                val bluetoothAdapter = bluetoothManager?.adapter

                if (bluetoothAdapter != null && bluetoothAdapter.isEnabled) {
                    // Vérifier s'il y a des appareils RÉELLEMENT connectés (pas juste appairés)
                    try {
                        @Suppress("DEPRECATION")
                        val bondedDevices = bluetoothAdapter.bondedDevices
                        var hasConnectedDevice = false

                        if (bondedDevices != null) {
                            for (device in bondedDevices) {
                                try {
                                    // Utiliser réflexion pour accéder à isConnected() (méthode cachée)
                                    val isConnectedMethod = device.javaClass.getMethod("isConnected")
                                    val connected = isConnectedMethod.invoke(device) as? Boolean ?: false
                                    if (connected) {
                                        hasConnectedDevice = true
                                        break
                                    }
                                } catch (e: Exception) {
                                    // Si la méthode ne fonctionne pas, on ignore
                                }
                            }
                        }

                        val iconRes = if (hasConnectedDevice) {
                            resources.getIdentifier("ic_check", "drawable", packageName)
                        } else {
                            resources.getIdentifier("ic_cross", "drawable", packageName)
                        }
                        bluetoothStatusIcon?.setImageResource(iconRes)
                    } catch (e: SecurityException) {
                        // Permission manquante, on affiche déconnecté
                        bluetoothStatusIcon?.setImageResource(resources.getIdentifier("ic_cross", "drawable", packageName))
                    }
                } else {
                    bluetoothStatusIcon?.setImageResource(resources.getIdentifier("ic_cross", "drawable", packageName))
                }
            } catch (e: SecurityException) {
                bluetoothStatusIcon?.setImageResource(resources.getIdentifier("ic_cross", "drawable", packageName))
                DebugLog.d("OverlayService", "Bluetooth permission denied: ${e.message}")
            } catch (e: Exception) {
                bluetoothStatusIcon?.setImageResource(resources.getIdentifier("ic_cross", "drawable", packageName))
                DebugLog.errorProduction("OverlayService", "Bluetooth error: ${e.message}")
            }

            // Volume (media stream)
            try {
                val audioManager = getSystemService(Context.AUDIO_SERVICE) as? AudioManager
                if (audioManager != null) {
                    val maxVolume = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
                    val currentVolume = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC)
                    val volumePercent = if (maxVolume > 0) (currentVolume * 100 / maxVolume) else 0

                    // Select icon based on volume level
                    val iconRes = when {
                        volumePercent == 0 -> resources.getIdentifier("ic_volume_mute", "drawable", packageName)
                        volumePercent <= 33 -> resources.getIdentifier("ic_volume_low", "drawable", packageName)
                        volumePercent <= 66 -> resources.getIdentifier("ic_volume_medium", "drawable", packageName)
                        else -> resources.getIdentifier("ic_volume_high", "drawable", packageName)
                    }

                    volumeIcon?.setImageResource(iconRes)
                    volumeText?.text = "$volumePercent%"
                } else {
                    volumeText?.text = "--"
                }
            } catch (e: Exception) {
                volumeText?.text = "--"
                DebugLog.errorProduction("OverlayService", "Volume error: ${e.message}")
            }

        } catch (e: Exception) {
            DebugLog.errorProduction("OverlayService", "Failed to update status bar: ${e.message}")
        }
    }
    
    // Méthode dédiée pour mettre à jour uniquement l'icône de charge en temps réel
    private fun updateBatteryChargingIcon(intent: Intent?) {
        try {
            val batteryStatus = intent ?: registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            if (batteryStatus != null) {
                val status = batteryStatus.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
                val isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                                status == BatteryManager.BATTERY_STATUS_FULL

                batteryChargingIcon?.visibility = if (isCharging) View.VISIBLE else View.GONE
                
                // Mettre à jour aussi le pourcentage de batterie
                val level = batteryStatus.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
                val scale = batteryStatus.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
                if (level >= 0 && scale > 0) {
                    val batteryPct = (level * 100 / scale.toFloat()).toInt()
                    batteryText?.text = "$batteryPct%"
                }
                
                DebugLog.d("OverlayService", "Battery charging icon updated: isCharging=$isCharging")
            }
        } catch (e: Exception) {
            DebugLog.errorProduction("OverlayService", "Failed to update battery charging icon: ${e.message}")
        }
    }

    private fun startStatusUpdates() {
        stopStatusUpdates() // Arrêter les updates existants
        statusUpdateHandler.post(object : Runnable {
            override fun run() {
                if (statusBarEnabled && statusBarView != null) {
                    updateStatusBar()
                    statusUpdateHandler.postDelayed(this, STATUS_UPDATE_INTERVAL)
                }
            }
        })
        DebugLog.d("OverlayService", "Status updates started")
    }

    private fun stopStatusUpdates() {
        statusUpdateHandler.removeCallbacksAndMessages(null)
        DebugLog.d("OverlayService", "Status updates stopped")
    }

    private fun handleTap() {
        tapCount++
        DebugLog.d("OverlayService", "Tap count: $tapCount/$requiredTaps")

        // Réinitialiser le compteur après timeout
        tapHandler.removeCallbacksAndMessages(null)
        tapHandler.postDelayed({
            if (tapCount < requiredTaps) {
                DebugLog.d("OverlayService", "Tap timeout - resetting counter")
                tapCount = 0
            }
        }, TAP_TIMEOUT)

        // Si N taps atteints, retourner à FreeKiosk
        if (tapCount >= requiredTaps) {
            DebugLog.d("OverlayService", "$requiredTaps taps detected! Returning to FreeKiosk")
            tapCount = 0
            tapHandler.removeCallbacksAndMessages(null)
            returnToFreeKiosk()
        }
    }

    private fun returnToFreeKiosk() {
        try {
            DebugLog.d("OverlayService", "returnToFreeKiosk() called")
            
            // IMPORTANT: Bloquer le relaunch automatique AVANT de lancer MainActivity
            MainActivity.blockAutoRelaunch = true
            DebugLog.d("OverlayService", "Set blockAutoRelaunch = true")

            // Envoyer l'événement pour naviguer directement au PIN
            sendNavigateToPinEvent()

            // Méthode PRINCIPALE: Utiliser moveTaskToFront pour ramener l'app au premier plan
            try {
                val am = getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
                val tasks = am.appTasks
                
                // Chercher la task de FreeKiosk
                for (task in tasks) {
                    val taskInfo = task.taskInfo
                    if (taskInfo.baseActivity?.packageName == packageName) {
                        DebugLog.d("OverlayService", "Found FreeKiosk task, moving to front")
                        task.moveToFront()
                        DebugLog.d("OverlayService", "Successfully moved FreeKiosk to front")
                        
                        // Ensuite, s'assurer que MainActivity est au top de notre task
                        val intent = Intent(this, MainActivity::class.java)
                        intent.addFlags(
                            Intent.FLAG_ACTIVITY_NEW_TASK or
                            Intent.FLAG_ACTIVITY_SINGLE_TOP
                        )
                        intent.putExtra("voluntaryReturn", true)
                        intent.putExtra("navigateToPin", true)
                        startActivity(intent)
                        DebugLog.d("OverlayService", "MainActivity started after moveToFront")
                        return
                    }
                }
                DebugLog.w("OverlayService", "Could not find FreeKiosk task in appTasks")
            } catch (e: Exception) {
                DebugLog.errorProduction("OverlayService", "moveTaskToFront failed: ${e.message}")
            }
            
            // FALLBACK: Si moveTaskToFront ne marche pas, essayer l'ancienne méthode
            DebugLog.d("OverlayService", "Trying fallback method with startActivity")
            val intent = Intent(this, MainActivity::class.java)
            intent.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_SINGLE_TOP or
                Intent.FLAG_ACTIVITY_CLEAR_TOP or
                Intent.FLAG_ACTIVITY_BROUGHT_TO_FRONT or
                Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
            )
            intent.putExtra("voluntaryReturn", true)
            intent.putExtra("navigateToPin", true)
            
            try {
                startActivity(intent)
                DebugLog.d("OverlayService", "MainActivity started with fallback intent")
            } catch (e: Exception) {
                DebugLog.errorProduction("OverlayService", "Failed to start MainActivity: ${e.message}")
            }
            
            DebugLog.d("OverlayService", "Returning to FreeKiosk PIN screen from overlay button")
            
            // Arrêter le service overlay après retour
            stopSelf()
        } catch (e: Exception) {
            DebugLog.errorProduction("OverlayService", "Error returning: ${e.message}")
        }
    }

    private fun sendNavigateToPinEvent() {
        try {
            val reactApplication = applicationContext as? ReactApplication
            val reactNativeHost = reactApplication?.reactNativeHost
            val reactContext = reactNativeHost?.reactInstanceManager?.currentReactContext
            
            if (reactContext != null) {
                // Envoyer voluntary=true pour éviter le relaunch
                val params = Arguments.createMap()
                params.putBoolean("voluntary", true)
                reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    ?.emit("onAppReturned", params)
                
                // Envoyer aussi navigateToPin pour aller directement au PIN
                reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    ?.emit("navigateToPin", null)
                    
                DebugLog.d("OverlayService", "Sent voluntary return + navigateToPin events")
            }
        } catch (e: Exception) {
            DebugLog.errorProduction("OverlayService", "Failed to send events: ${e.message}")
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        instance = null
        try {
            // Arrêter les mises à jour de la status bar
            stopStatusUpdates()

            // Désenregistrer le receiver
            try {
                unregisterReceiver(screenReceiver)
            } catch (e: Exception) {
                // Ignore si déjà désenregistré
            }
            
            // Désenregistrer le volume receiver
            try {
                unregisterReceiver(volumeReceiver)
            } catch (e: Exception) {
                // Ignore si déjà désenregistré
            }
            
            // Désenregistrer le battery receiver
            try {
                unregisterReceiver(batteryReceiver)
            } catch (e: Exception) {
                // Ignore si déjà désenregistré
            }

            // Supprimer la status bar
            statusBarView?.let { windowManager?.removeView(it) }
            statusBarView = null

            // Supprimer le bouton overlay
            overlayView?.let { windowManager?.removeView(it) }
            overlayView = null

            DebugLog.d("OverlayService", "Overlay and status bar removed, receiver unregistered")
        } catch (e: Exception) {
            DebugLog.errorProduction("OverlayService", "Error removing overlay: ${e.message}")
        }
    }

    // Appelé quand l'app est swipée/killée depuis les recents
    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        DebugLog.d("OverlayService", "Task removed - stopping overlay service")
        stopSelf()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
