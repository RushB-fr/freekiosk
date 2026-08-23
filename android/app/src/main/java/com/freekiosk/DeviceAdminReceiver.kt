package com.freekiosk

import android.app.admin.DeviceAdminReceiver
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.PersistableBundle

/**
 * Device admin receiver. Besides the standard admin lifecycle, this is where a
 * device provisioned as Device Owner via the setup-wizard QR receives the
 * enrollment token: the cloud packs { enroll_token, cloud_url, org_id } into the
 * provisioning admin-extras bundle, and we persist it so the JS layer can
 * auto-enroll on first launch (see KioskModule.getPendingCloudEnrollment and
 * KioskScreen startup).
 */
class DeviceAdminReceiver : DeviceAdminReceiver() {

    companion object {
        // Shared with KioskModule.getPendingCloudEnrollment().
        const val PREFS = "FreeKioskCloudEnrollment"
        const val KEY_HAS_PENDING = "has_pending"
        const val KEY_TOKEN = "enroll_token"
        const val KEY_CLOUD_URL = "cloud_url"
        const val KEY_ORG_ID = "org_id"

        /**
         * Pin FreeKiosk as the persistent Home launcher (Device Owner only).
         * Called during provisioning so the "choose launcher" prompt never shows:
         * by the time the device reaches the home screen, FreeKiosk is already the
         * locked default. No-op if not Device Owner. The JS/config layer may also
         * toggle this later via KioskModule.setDefaultLauncherMode.
         */
        fun pinHomeLauncher(context: Context) {
            try {
                val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
                if (!dpm.isDeviceOwnerApp(context.packageName)) return
                val admin = ComponentName(context, DeviceAdminReceiver::class.java)
                val filter = IntentFilter(Intent.ACTION_MAIN).apply {
                    addCategory(Intent.CATEGORY_HOME)
                    addCategory(Intent.CATEGORY_DEFAULT)
                }
                dpm.addPersistentPreferredActivity(
                    admin, filter, ComponentName(context, MainActivity::class.java)
                )
            } catch (_: Exception) {}
        }
    }

    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
    }

    override fun onDisabled(context: Context, intent: Intent) {
        super.onDisabled(context, intent)
    }

    override fun onProfileProvisioningComplete(context: Context, intent: Intent) {
        super.onProfileProvisioningComplete(context, intent)
        persistPendingEnrollment(context, intent)
        // Older Android provisioning path (< API 31). Pin the launcher now so the
        // picker never appears when the device reaches home.
        pinHomeLauncher(context)
    }

    private fun persistPendingEnrollment(context: Context, intent: Intent) {
        val extras: PersistableBundle? = intent.getParcelableExtra(
            DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE
        )
        val token = extras?.getString(KEY_TOKEN)
        if (extras == null || token.isNullOrBlank()) return

        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        prefs.edit()
            .putBoolean(KEY_HAS_PENDING, true)
            .putString(KEY_TOKEN, token)
            .putString(KEY_CLOUD_URL, extras.getString(KEY_CLOUD_URL) ?: "")
            .putString(KEY_ORG_ID, extras.getString(KEY_ORG_ID) ?: "")
            .commit()
    }
}
