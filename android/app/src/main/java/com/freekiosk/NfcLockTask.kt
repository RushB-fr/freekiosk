package com.freekiosk

/**
 * #254: NFC tags in Lock Mode.
 *
 * When Android reads a tag it does not open the target app itself: it first starts a screen
 * of the system NFC service, which then starts the app. Lock task only lets whitelisted
 * packages start, so the relay was refused and a tag that triggers an app (a Home Assistant
 * tag, for example) did nothing. With the opt-in setting on, the NFC service joins the lock
 * task whitelist. Whitelisting is per package, not per screen, so every screen of that
 * service can then appear over the kiosk: that is why it is off by default.
 */
object NfcLockTask {
    /** AsyncStorage key of the opt-in setting ("true" when on). Also the ADB key allow_nfc_tags. */
    const val STORAGE_KEY = "@kiosk_allow_nfc_tags"

    /** The system NFC service (AOSP, Pixel and Samsung use this package name). */
    const val PACKAGE = "com.android.nfc"
}
