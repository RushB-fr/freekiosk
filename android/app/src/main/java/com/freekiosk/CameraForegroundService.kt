package com.freekiosk

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat

/**
 * CameraForegroundService - lets the remote camera features work while another app is in front.
 *
 * Since Android 11 an app that is not on screen can only open the camera from a foreground
 * service of type camera, started while the app was in front. Without one, the REST photo
 * (`/api/camera/photo`), the MJPEG stream and MQTT camera snapshots answered 503 as soon as an
 * external app was shown, or the screen was off. This service only holds that type: it never
 * opens the camera itself, so the camera code, motion detection and the privacy indicator are
 * unchanged.
 *
 * A service of its own rather than a type added to an existing one: startForeground() without
 * a type takes every type the manifest declares, and the camera type throws on Android 14 when
 * the camera permission is missing. Here a refused camera type falls back to specialUse, so the
 * service always reaches startForeground() (stopping a service started with
 * startForegroundService() before that call crashes the app).
 *
 * Not in Play Store builds: BuildConfig.ENABLE_CAMERA_FGS is false and the overlay strips the
 * service and FOREGROUND_SERVICE_CAMERA, since Play reviews that type.
 */
class CameraForegroundService : Service() {

    companion object {
        private const val TAG = "CameraFgs"
        private const val CHANNEL_ID = "freekiosk_camera"
        private const val NOTIFICATION_ID = 2003

        /**
         * Starts or stops the service. Called from MainActivity.onResume() and onPause(), while
         * FreeKiosk is still visible: Android grants the camera to a foreground service only
         * when it is started from the foreground.
         */
        @JvmStatic
        fun sync(context: Context, wanted: Boolean) {
            if (!BuildConfig.ENABLE_CAMERA_FGS) return
            val intent = Intent(context, CameraForegroundService::class.java)
            try {
                if (wanted && hasCameraPermission(context)) {
                    ContextCompat.startForegroundService(context, intent)
                } else {
                    context.stopService(intent)
                }
            } catch (e: Exception) {
                DebugLog.d(TAG, "Could not ${if (wanted) "start" else "stop"} the service: ${e.message}")
            }
        }

        private fun hasCameraPermission(context: Context): Boolean =
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        createNotificationChannel()
        val notification = buildNotification()
        try {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, cameraType())
            DebugLog.d(TAG, "Started with the camera type")
        } catch (e: Exception) {
            // The permission went away between sync() and here, or Android refused the type.
            // Stay up without it: the camera then works only with FreeKiosk in front, as before.
            DebugLog.d(TAG, "Camera type refused (${e.message}), falling back to specialUse")
            try {
                ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, fallbackType())
            } catch (e2: Exception) {
                DebugLog.d(TAG, "Fallback refused too: ${e2.message}")
            }
            stopSelf()
        }
        // Not sticky: after a process restart, MainActivity starts it again when needed.
        return START_NOT_STICKY
    }

    // The camera type exists from Android 11, which is also where the restriction starts: below
    // it, any foreground service keeps the camera available.
    private fun cameraType(): Int =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA else 0

    private fun fallbackType(): Int =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
        } else {
            0
        }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Remote camera",
                NotificationManager.IMPORTANCE_MIN   // silent, no badge
            ).apply {
                description = "Lets the REST API and MQTT use the camera while another app is shown"
                setShowBadge(false)
            }
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("FreeKiosk")
            .setContentText("Remote camera available")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setOngoing(true)
            .setSilent(true)
            .build()
    }
}
