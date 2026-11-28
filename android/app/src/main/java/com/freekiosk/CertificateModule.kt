package com.freekiosk

import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.Arguments
import android.content.Context
import android.util.Log
import android.content.SharedPreferences
import java.util.Date
import java.text.SimpleDateFormat
import java.util.Locale

class CertificateModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

  companion object {
    private const val TAG = "CertificateModule"
    private const val PREFS = "freekiosk_ssl_certs"

    /**
     * Certificates the user trusts in advance, by SHA-256 fingerprint: one `pin_<64 hex>` key
     * per fingerprint, the value is a free label. They never expire and are not touched by
     * "clear accepted certificates" (that one only drops the `cert_*` entries made by the
     * warning dialog). The WebView client (patched react-native-webview, isCertificateAccepted)
     * reads the same file and proceeds only on an exact fingerprint match.
     */
    private const val PIN_PREFIX = "pin_"
    private val HEX_64 = Regex("^[0-9a-f]{64}$")
    private val SHA256_LABEL = Regex("^sha-?256\\s*[:\\-]?", RegexOption.IGNORE_CASE)
    private val SEPARATORS = Regex("[\\s:\\-]")
    private val LIST_SEPARATORS = Regex("[,;\\r\\n]+")

    /**
     * What a person pastes -> 64 lowercase hex characters, or null. Same rules as
     * normalizeFingerprint in src/utils/certificateFingerprint.ts (openssl output with its
     * label, colons, spaces, dashes, a SHA-256 prefix).
     */
    fun normalizeFingerprint(input: String): String? {
      val afterLabel = if (input.contains('=')) input.substringAfterLast('=') else input
      val hex = afterLabel.trim()
        .replaceFirst(SHA256_LABEL, "")
        .replace(SEPARATORS, "")
        .lowercase(Locale.ROOT)
      return if (HEX_64.matches(hex)) hex else null
    }

    private fun prefs(context: Context): SharedPreferences =
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun addTrusted(context: Context, fingerprint: String, label: String) {
      prefs(context).edit().putString(PIN_PREFIX + fingerprint, label.take(80)).apply()
    }

    fun removeTrusted(context: Context, fingerprint: String) {
      prefs(context).edit().remove(PIN_PREFIX + fingerprint).apply()
    }

    /** Fingerprint -> label, in no particular order. */
    fun trusted(context: Context): Map<String, String> {
      val out = LinkedHashMap<String, String>()
      for ((key, value) in prefs(context).all) {
        if (key.startsWith(PIN_PREFIX)) out[key.substring(PIN_PREFIX.length)] = (value as? String) ?: ""
      }
      return out
    }

    /**
     * ADB `trusted_cert_fingerprints`: a list separated by commas, semicolons or line breaks
     * replaces the whole list (an empty value empties it). Entries that are not a SHA-256
     * fingerprint are skipped and logged. Returns how many are trusted afterwards.
     */
    fun replaceTrusted(context: Context, raw: String): Int {
      val wanted = LinkedHashSet<String>()
      for (part in raw.split(LIST_SEPARATORS)) {
        if (part.isBlank()) continue
        val fingerprint = normalizeFingerprint(part)
        if (fingerprint == null) Log.w(TAG, "Ignored an entry that is not a SHA-256 fingerprint")
        else wanted.add(fingerprint)
      }
      val current = trusted(context)
      val editor = prefs(context).edit()
      for (fingerprint in current.keys) if (fingerprint !in wanted) editor.remove(PIN_PREFIX + fingerprint)
      for (fingerprint in wanted) if (fingerprint !in current) editor.putString(PIN_PREFIX + fingerprint, "ADB")
      editor.commit()
      return wanted.size
    }
  }

  override fun getName(): String {
    return "CertificateModule"
  }

  @ReactMethod
  fun clearAcceptedCertificates(promise: Promise) {
    try {
      val prefs = reactApplicationContext.getSharedPreferences(
        PREFS,
        android.content.Context.MODE_PRIVATE
      )
      // Only the certificates accepted from the warning dialog: the fingerprints the user
      // trusts in advance (pin_*) are a separate list with its own remove button.
      val editor = prefs.edit()
      for (key in prefs.all.keys) {
        if (!key.startsWith(PIN_PREFIX)) editor.remove(key)
      }
      editor.apply()
      Log.i("CertificateModule", "All accepted certificates cleared")
      promise.resolve(true)
    } catch (e: Exception) {
      Log.e("CertificateModule", "Error clearing certificates", e)
      promise.reject("ERROR", e.message)
    }
  }

  @ReactMethod
  fun getAcceptedCertificates(promise: Promise) {
    try {
      val prefs = reactApplicationContext.getSharedPreferences(
        "freekiosk_ssl_certs",
        android.content.Context.MODE_PRIVATE
      )

      val certificates = Arguments.createArray()
      val allEntries = prefs.all
      val processedFingerprints = mutableSetOf<String>()

      for ((key, value) in allEntries) {
        // Only process "cert_" keys (not "cert_expiry_" or "cert_url_")
        if (key.startsWith("cert_") && !key.contains("_expiry_") && !key.contains("_url_")) {
          val fingerprint = key.substring(5) // Remove "cert_" prefix

          // Avoid duplicates
          if (processedFingerprints.contains(fingerprint)) {
            continue
          }
          processedFingerprints.add(fingerprint)

          val isAccepted = prefs.getBoolean(key, false)
          if (!isAccepted) continue

          val url = prefs.getString("cert_url_$fingerprint", "Unknown") ?: "Unknown"
          val expiryTime = prefs.getLong("cert_expiry_$fingerprint", 0)

          val certInfo = Arguments.createMap()
          certInfo.putString("fingerprint", fingerprint)
          certInfo.putString("url", url)
          certInfo.putDouble("expiryTime", expiryTime.toDouble())

          // Add human-readable expiry date
          val dateFormat = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault())
          certInfo.putString("expiryDate", dateFormat.format(Date(expiryTime)))

          // Check if expired
          val isExpired = System.currentTimeMillis() > expiryTime
          certInfo.putBoolean("isExpired", isExpired)

          certificates.pushMap(certInfo)
        }
      }

      Log.i("CertificateModule", "Found ${certificates.size()} accepted certificates")
      promise.resolve(certificates)
    } catch (e: Exception) {
      Log.e("CertificateModule", "Error getting certificates", e)
      promise.reject("ERROR", e.message)
    }
  }

  @ReactMethod
  fun removeCertificate(fingerprint: String, promise: Promise) {
    try {
      val prefs = reactApplicationContext.getSharedPreferences(
        "freekiosk_ssl_certs",
        android.content.Context.MODE_PRIVATE
      )

      prefs.edit()
        .remove("cert_$fingerprint")
        .remove("cert_expiry_$fingerprint")
        .remove("cert_url_$fingerprint")
        .apply()

      Log.i("CertificateModule", "Certificate removed: $fingerprint")
      promise.resolve(true)
    } catch (e: Exception) {
      Log.e("CertificateModule", "Error removing certificate", e)
      promise.reject("ERROR", e.message)
    }
  }

  /** The fingerprints trusted in advance: [{ fingerprint, label }]. */
  @ReactMethod
  fun getTrustedFingerprints(promise: Promise) {
    try {
      val list = Arguments.createArray()
      for ((fingerprint, label) in trusted(reactApplicationContext).toSortedMap()) {
        val item = Arguments.createMap()
        item.putString("fingerprint", fingerprint)
        item.putString("label", label)
        list.pushMap(item)
      }
      promise.resolve(list)
    } catch (e: Exception) {
      Log.e(TAG, "Error reading trusted fingerprints", e)
      promise.reject("ERROR", e.message)
    }
  }

  /** Trust one more certificate. Rejects a value that is not a SHA-256 fingerprint. */
  @ReactMethod
  fun addTrustedFingerprint(fingerprint: String, label: String, promise: Promise) {
    val normalized = normalizeFingerprint(fingerprint)
    if (normalized == null) {
      promise.reject("INVALID_FINGERPRINT", "Not a SHA-256 fingerprint")
      return
    }
    try {
      addTrusted(reactApplicationContext, normalized, label)
      Log.i(TAG, "Trusted fingerprint added")
      promise.resolve(normalized)
    } catch (e: Exception) {
      Log.e(TAG, "Error adding trusted fingerprint", e)
      promise.reject("ERROR", e.message)
    }
  }

  @ReactMethod
  fun removeTrustedFingerprint(fingerprint: String, promise: Promise) {
    try {
      removeTrusted(reactApplicationContext, fingerprint)
      Log.i(TAG, "Trusted fingerprint removed")
      promise.resolve(true)
    } catch (e: Exception) {
      Log.e(TAG, "Error removing trusted fingerprint", e)
      promise.reject("ERROR", e.message)
    }
  }
}
