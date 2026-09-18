package com.freekiosk.printing

import android.app.Activity
import android.os.Bundle

/**
 * Exists to be declared, not shown.
 *
 * Android only offers "always open for this device" — the one USB grant that survives an unplug or
 * a reboot — to an app declaring a USB_DEVICE_ATTACHED filter. Lock task mode suppresses the
 * alternative permission dialog, so this is how an unattended tablet keeps printing.
 */
class UsbPrinterAttachActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        finish()
    }
}
