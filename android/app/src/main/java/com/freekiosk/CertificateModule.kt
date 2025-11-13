package com.freekiosk

import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import android.util.Log

class CertificateModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  
  override fun getName(): String {
    return "CertificateModule"
  }

  @ReactMethod
  fun clearAcceptedCertificates(promise: Promise) {
    try {
      val prefs = reactApplicationContext.getSharedPreferences(
        "freekiosk_ssl_certs", 
        android.content.Context.MODE_PRIVATE
      )
      prefs.edit().clear().apply()
      Log.i("CertificateModule", "All accepted certificates cleared")
      promise.resolve(true)
    } catch (e: Exception) {
      Log.e("CertificateModule", "Error clearing certificates", e)
      promise.reject("ERROR", e.message)
    }
  }
}
