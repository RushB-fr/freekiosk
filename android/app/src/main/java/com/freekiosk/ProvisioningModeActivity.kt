package com.freekiosk

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.Intent
import android.os.Bundle

/**
 * Handles ACTION_GET_PROVISIONING_MODE. Required for apps targeting Android 12+
 * (API 31) provisioned as Device Owner via the setup-wizard QR: the system
 * launches this to learn which provisioning mode the DPC wants. We always ask
 * for a fully managed device (Device Owner). No UI needed.
 */
class ProvisioningModeActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val result = Intent().putExtra(
            DevicePolicyManager.EXTRA_PROVISIONING_MODE,
            DevicePolicyManager.PROVISIONING_MODE_FULLY_MANAGED_DEVICE,
        )
        setResult(RESULT_OK, result)
        finish()
    }
}
