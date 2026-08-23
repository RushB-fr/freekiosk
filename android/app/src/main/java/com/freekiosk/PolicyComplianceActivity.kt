package com.freekiosk

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.Context
import android.os.Bundle
import android.os.PersistableBundle

/**
 * Handles ACTION_ADMIN_POLICY_COMPLIANCE. REQUIRED for Device Owner provisioning
 * on Android 12+ (API 31): the system launches this as the final provisioning
 * step and the device is not provisioned until it returns RESULT_OK.
 *
 * This is also where, on modern Android, we receive the admin extras bundle the
 * cloud packed into the QR ({ enroll_token, cloud_url, org_id }); we persist it
 * so the app auto-enrolls on first launch (same store as DeviceAdminReceiver,
 * which still handles the older PROFILE_PROVISIONING_COMPLETE path).
 */
class PolicyComplianceActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        persistPendingEnrollment()
        // Pin FreeKiosk as Home now, while still inside provisioning, so the
        // "choose launcher" picker never appears once the device reaches home.
        DeviceAdminReceiver.pinHomeLauncher(this)
        setResult(RESULT_OK)
        finish()
    }

    private fun persistPendingEnrollment() {
        val extras: PersistableBundle? = intent.getParcelableExtra(
            DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE
        )
        val token = extras?.getString(DeviceAdminReceiver.KEY_TOKEN)
        if (extras == null || token.isNullOrBlank()) return

        getSharedPreferences(DeviceAdminReceiver.PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean(DeviceAdminReceiver.KEY_HAS_PENDING, true)
            .putString(DeviceAdminReceiver.KEY_TOKEN, token)
            .putString(DeviceAdminReceiver.KEY_CLOUD_URL, extras.getString(DeviceAdminReceiver.KEY_CLOUD_URL) ?: "")
            .putString(DeviceAdminReceiver.KEY_ORG_ID, extras.getString(DeviceAdminReceiver.KEY_ORG_ID) ?: "")
            .commit()
    }
}
