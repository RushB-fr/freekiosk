package com.freekiosk

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Bundle
import android.os.PersistableBundle
import android.util.Log

/**
 * Device admin receiver. Besides the standard admin lifecycle, this is where a
 * device provisioned as Device Owner via the setup-wizard QR receives the
 * enrollment token: the cloud packs { enroll_token, cloud_url, org_id } into the
 * provisioning admin-extras bundle, and we persist it so the JS layer can
 * auto-enroll on first launch (see KioskModule.getPendingCloudEnrollment and
 * KioskScreen startup).
 */
// The supertype is spelled out rather than imported on purpose. An explicit
// import outranks a same-package declaration in Kotlin, so
// `import android.app.admin.DeviceAdminReceiver` made every
// `DeviceAdminReceiver::class.java` in this file resolve to the *framework*
// class: pinHomeLauncher then handed DevicePolicyManager
// com.freekiosk/android.app.admin.DeviceAdminReceiver, which it rejected with
// "does not exist or is not owned by uid". The same call from KioskModule always
// worked, because no other file carries that import.
class DeviceAdminReceiver : android.app.admin.DeviceAdminReceiver() {

    companion object {
        private const val TAG = "FKDeviceAdmin"

        // Shared with KioskModule.getPendingCloudEnrollment().
        const val PREFS = "FreeKioskCloudEnrollment"
        const val KEY_HAS_PENDING = "has_pending"
        const val KEY_TOKEN = "enroll_token"
        const val KEY_CLOUD_URL = "cloud_url"
        const val KEY_ORG_ID = "org_id"

        /**
         * Persist { enroll_token, cloud_url, org_id } from a provisioning intent so
         * the JS layer can auto-enroll on first launch. Returns true if a token was
         * stored. Shared by both provisioning paths: this receiver's
         * PROFILE_PROVISIONING_COMPLETE (< API 31) and PolicyComplianceActivity.
         *
         * The admin extras are read WITHOUT assuming their concrete type. The
         * one-arg getParcelableExtra is deprecated and its inferred generic
         * compiles to an unchecked cast, so a Bundle where we expected a
         * PersistableBundle throws ClassCastException. Thrown from inside
         * PolicyComplianceActivity.onCreate that kills the activity before it can
         * hand RESULT_OK back to the setup wizard, and the whole provisioning fails
         * with "Couldn't set up device" — a tablet lost to a type mismatch.
         */
        fun persistPendingEnrollment(context: Context, intent: Intent): Boolean {
            @Suppress("DEPRECATION")
            val raw = intent.extras?.get(
                DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE
            )
            val read: (String) -> String? = when (raw) {
                is PersistableBundle -> { key -> raw.getString(key) }
                is Bundle -> { key -> raw.getString(key) }
                else -> {
                    Log.w(
                        TAG,
                        "No usable admin extras in the provisioning intent " +
                            "(got ${raw?.javaClass?.simpleName ?: "null"})."
                    )
                    return false
                }
            }

            val token = read(KEY_TOKEN)
            if (token.isNullOrBlank()) {
                Log.w(TAG, "Admin extras carried no enrollment token; no auto-enrollment.")
                return false
            }

            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putBoolean(KEY_HAS_PENDING, true)
                .putString(KEY_TOKEN, token)
                .putString(KEY_CLOUD_URL, read(KEY_CLOUD_URL) ?: "")
                .putString(KEY_ORG_ID, read(KEY_ORG_ID) ?: "")
                .commit()
            Log.i(TAG, "Pending cloud enrollment stored; the app will enroll on first launch.")
            return true
        }

        /**
         * Pin FreeKiosk as the persistent Home launcher (Device Owner only).
         * Called during provisioning so the "choose launcher" prompt never shows:
         * by the time the device reaches the home screen, FreeKiosk is already the
         * locked default. No-op if not Device Owner. The JS/config layer may also
         * toggle this later via KioskModule.setDefaultLauncherMode.
         *
         * Failures are logged rather than swallowed: a silent catch here is why a
         * device reaching the stock launcher left no trace to diagnose.
         */
        fun pinHomeLauncher(context: Context) {
            try {
                val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
                if (!dpm.isDeviceOwnerApp(context.packageName)) {
                    Log.w(TAG, "Not Device Owner — cannot pin FreeKiosk as Home.")
                    return
                }
                val admin = ComponentName(context, DeviceAdminReceiver::class.java)
                val filter = IntentFilter(Intent.ACTION_MAIN).apply {
                    addCategory(Intent.CATEGORY_HOME)
                    addCategory(Intent.CATEGORY_DEFAULT)
                }
                dpm.addPersistentPreferredActivity(
                    admin, filter, ComponentName(context, MainActivity::class.java)
                )
                Log.i(TAG, "FreeKiosk pinned as the persistent Home launcher.")
            } catch (e: Exception) {
                Log.e(TAG, "Could not pin FreeKiosk as Home: ${e.message}", e)
            }
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
}
