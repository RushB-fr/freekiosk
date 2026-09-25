package com.freekiosk

import android.app.Activity
import android.os.Bundle
import android.util.Log

/**
 * Handles ACTION_ADMIN_POLICY_COMPLIANCE. REQUIRED for Device Owner provisioning
 * on Android 12+ (API 31): the system launches this as the final provisioning
 * step and the device is not provisioned until it returns RESULT_OK.
 *
 * This is also where, on modern Android, we receive the admin extras bundle the
 * cloud packed into the QR ({ enroll_token, cloud_url, org_id }); we persist it
 * so the app auto-enrolls on first launch (same store as DeviceAdminReceiver,
 * which still handles the older PROFILE_PROVISIONING_COMPLETE path).
 *
 * Order matters, and it is the whole point of this class: RESULT_OK is handed
 * back FIRST and unconditionally. Anything throwing before that would kill
 * onCreate before the hand-off, and the setup wizard fails the entire
 * provisioning with "Couldn't set up device" — Device Owner already granted, app
 * installed, but never launched and never enrolled. Our own bookkeeping must
 * never be able to cost a device its provisioning; it is best-effort below, and
 * it logs in release builds when it fails.
 */
class PolicyComplianceActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Confirm to the setup wizard before anything that could fail.
        setResult(RESULT_OK)

        try {
            DeviceAdminReceiver.persistPendingEnrollment(this, intent)
        } catch (e: Exception) {
            Log.e(TAG, "Could not store the pending enrollment: ${e.message}", e)
        }

        // Pin FreeKiosk as Home now, while still inside provisioning, so the
        // "choose launcher" picker never appears once the device reaches home.
        // Logs its own failures; never throws.
        DeviceAdminReceiver.pinHomeLauncher(this)

        finish()
    }

    private companion object {
        const val TAG = "FKPolicyCompliance"
    }
}
