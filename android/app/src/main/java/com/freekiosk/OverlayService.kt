package com.freekiosk

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.FrameLayout
import androidx.core.app.NotificationCompat
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule

class OverlayService : Service() {

    companion object {
        // Opacité du bouton overlay (0.0 = invisible, 1.0 = opaque)
        @Volatile
        var buttonOpacity = 0.0f
        
        // Instance du service pour pouvoir mettre à jour le bouton
        @Volatile
        private var instance: OverlayService? = null
        
        fun updateButtonOpacity(opacity: Float) {
            buttonOpacity = opacity
            instance?.updateButtonAlpha()
        }
    }

    private var windowManager: WindowManager? = null
    private var overlayView: View? = null
    private var returnButton: Button? = null
    private var tapCount = 0
    private val tapHandler = Handler(Looper.getMainLooper())
    private val TAP_TIMEOUT = 2000L // 2 secondes pour faire 5 taps
    private val REQUIRED_TAPS = 5
    private val CHANNEL_ID = "FreeKioskOverlay"
    private val NOTIFICATION_ID = 1001

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
        
        createOverlay()
    }

    private fun loadButtonOpacity() {
        try {
            val prefs = getSharedPreferences("FreeKioskSettings", Context.MODE_PRIVATE)
            buttonOpacity = prefs.getFloat("overlay_button_opacity", 0.0f)
            DebugLog.d("OverlayService", "Loaded button opacity: $buttonOpacity")
        } catch (e: Exception) {
            DebugLog.errorProduction("OverlayService", "Failed to load button opacity: ${e.message}")
            buttonOpacity = 0.0f
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
        // Recréer l'overlay si le service est redémarré
        if (overlayView == null) {
            createOverlay()
        }
        // START_STICKY: le service sera redémarré si tué par le système
        return START_STICKY
    }

    private fun createOverlay() {
        // Créer le layout de l'overlay
        overlayView = FrameLayout(this).apply {
            // Petit bouton discret dans le coin inférieur droit
            returnButton = Button(context).apply {
                text = "↩"
                setTextColor(android.graphics.Color.WHITE)
                setBackgroundColor(android.graphics.Color.parseColor("#2196F3")) // Bleu Material Design
                setPadding(0, 0, 0, 0)  // Pas de padding
                textSize = 12f  // Taille de texte très réduite
                alpha = buttonOpacity  // Utilise l'opacité configurée
                
                // Taille minimale pour que le bouton soit cliquable
                minimumWidth = 0
                minimumHeight = 0

                // Arrondir les coins et ombre
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    elevation = 8f
                }

                setOnClickListener {
                    handleTap()
                }
            }

            addView(returnButton, FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,  // Taille minimale
                FrameLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                gravity = Gravity.BOTTOM or Gravity.END
                setMargins(0, 0, 0, 0) // Pas de marges, collé au coin
            })
        }

        // Paramètres de la fenêtre overlay
        val layoutType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_SYSTEM_ALERT
        }

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,  // Seulement la taille du bouton
            WindowManager.LayoutParams.WRAP_CONTENT,
            layoutType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        )

        params.gravity = Gravity.BOTTOM or Gravity.END  // Position coin inférieur droit
        params.x = 0  // Pas de marge, collé au bord droit
        params.y = 0  // Pas de marge, collé au bord bas

        try {
            windowManager?.addView(overlayView, params)
            DebugLog.d("OverlayService", "Overlay created successfully")
        } catch (e: Exception) {
            DebugLog.errorProduction("OverlayService", "Failed to create overlay: ${e.message}")
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

    private fun handleTap() {
        tapCount++
        DebugLog.d("OverlayService", "Tap count: $tapCount/$REQUIRED_TAPS")

        // Réinitialiser le compteur après timeout
        tapHandler.removeCallbacksAndMessages(null)
        tapHandler.postDelayed({
            if (tapCount < REQUIRED_TAPS) {
                DebugLog.d("OverlayService", "Tap timeout - resetting counter")
                tapCount = 0
            }
        }, TAP_TIMEOUT)

        // Si 5 taps atteints, retourner à FreeKiosk
        if (tapCount >= REQUIRED_TAPS) {
            DebugLog.d("OverlayService", "5 taps detected! Returning to FreeKiosk")
            tapCount = 0
            tapHandler.removeCallbacksAndMessages(null)
            returnToFreeKiosk()
        }
    }

    private fun returnToFreeKiosk() {
        try {
            // IMPORTANT: Bloquer le relaunch automatique AVANT de lancer MainActivity
            // Ce flag est vérifié côté React Native via un module natif
            MainActivity.blockAutoRelaunch = true
            DebugLog.d("OverlayService", "Set blockAutoRelaunch = true")

            // Envoyer l'événement pour naviguer directement au PIN
            sendNavigateToPinEvent()

            val intent = Intent(this, MainActivity::class.java)
            intent.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_SINGLE_TOP or
                Intent.FLAG_ACTIVITY_CLEAR_TOP or
                Intent.FLAG_ACTIVITY_BROUGHT_TO_FRONT
            )
            // Marquer que c'est un retour volontaire pour éviter le relaunch automatique
            intent.putExtra("voluntaryReturn", true)
            intent.putExtra("navigateToPin", true)  // Signal pour aller au PIN
            startActivity(intent)
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
            // Désenregistrer le receiver
            try {
                unregisterReceiver(screenReceiver)
            } catch (e: Exception) {
                // Ignore si déjà désenregistré
            }
            
            overlayView?.let { windowManager?.removeView(it) }
            overlayView = null
            
            DebugLog.d("OverlayService", "Overlay removed, receiver unregistered")
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
