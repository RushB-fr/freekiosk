package com.freekiosk

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.print.PrintAttributes
import android.print.PrintManager
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * PrintModule - Enables printing from WebView content
 *
 * Intercepts window.print() calls from web pages and uses Android's
 * PrintManager to print the current WebView content.
 *
 * Features:
 * - Print current WebView page via Android Print Framework
 * - Supports all connected printers (WiFi, Bluetooth, USB, Cloud Print)
 * - Automatic page title detection for print job naming
 * - Works with any website that calls window.print()
 * - Dynamic print spooler package discovery for lock task whitelisting
 * - isPrintActive flag to suspend immersive mode during print dialog
 */
class PrintModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "PrintModule"

        /**
         * Flag to indicate a print dialog is currently active.
         * Used by MainActivity to suspend immersive mode re-application
         * and avoid re-entering lock task while the print UI is shown.
         */
        @Volatile
        @JvmStatic
        var isPrintActive: Boolean = false
    }

    override fun getName(): String = NAME

    /**
     * Check if printing is available on this device.
     * Returns true if PrintManager service exists and at least one print service is installed.
     */
    @ReactMethod
    fun isPrintAvailable(promise: Promise) {
        try {
            val printManager = reactApplicationContext.getSystemService(Context.PRINT_SERVICE) as? PrintManager
            if (printManager == null) {
                promise.resolve(false)
                return
            }
            // Check if any print service is installed
            val printServices = reactApplicationContext.packageManager.queryIntentServices(
                Intent("android.printservice.PrintService"),
                PackageManager.GET_META_DATA
            )
            promise.resolve(printServices.isNotEmpty())
        } catch (e: Exception) {
            DebugLog.errorProduction(NAME, "Error checking print availability: ${e.message}")
            promise.resolve(false)
        }
    }

    /**
     * Get the list of print spooler/service packages installed on this device.
     * Used by JS to inform KioskModule which packages to whitelist in lock task mode.
     * Dynamically discovers all print services (covers com.android.printspooler,
     * Samsung Print Service, HP Print, etc.)
     */
    @ReactMethod
    fun getPrintSpoolerPackages(promise: Promise) {
        try {
            val packages = mutableSetOf<String>()
            
            // Always include the core Android print spooler
            packages.add("com.android.printspooler")
            
            // Discover all installed print services dynamically
            val printServices = reactApplicationContext.packageManager.queryIntentServices(
                Intent("android.printservice.PrintService"),
                PackageManager.GET_META_DATA
            )
            for (service in printServices) {
                service.serviceInfo?.packageName?.let { pkg ->
                    packages.add(pkg)
                    DebugLog.d(NAME, "Discovered print service package: $pkg")
                }
            }
            
            val result = Arguments.createArray()
            for (pkg in packages) {
                result.pushString(pkg)
            }
            
            DebugLog.d(NAME, "Print spooler packages: $packages")
            promise.resolve(result)
        } catch (e: Exception) {
            DebugLog.errorProduction(NAME, "Error getting print spooler packages: ${e.message}")
            // Return at least the default spooler
            val result = Arguments.createArray()
            result.pushString("com.android.printspooler")
            promise.resolve(result)
        }
    }

    /**
     * Print the current WebView content
     * Called from JavaScript when window.print() is intercepted
     * @param title  Print job name (from document.title)
     * @param paperSize  Paper size identifier: "A4", "A5", "A3", "LETTER", "LEGAL" (default "A4")
     */
    @ReactMethod
    fun printWebView(title: String?, paperSize: String?, promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            DebugLog.errorProduction(NAME, "No activity available for printing")
            promise.reject("NO_ACTIVITY", "No activity available for printing")
            return
        }

        try {
            activity.runOnUiThread {
                try {
                    // Find WebView in the activity's view hierarchy
                    val webView = findWebViewRecursive(activity.window.decorView)

                    if (webView == null) {
                        DebugLog.errorProduction(NAME, "WebView not found in view hierarchy")
                        promise.reject("NO_WEBVIEW", "WebView not found")
                        return@runOnUiThread
                    }

                    // IMPORTANT: PrintManager.print() must be called from an Activity context, not application context
                    val printManager = activity.getSystemService(Context.PRINT_SERVICE) as PrintManager
                    val jobName = title?.takeIf { it.isNotBlank() } ?: "FreeKiosk Print"

                    DebugLog.d(NAME, "Starting print job: $jobName for WebView at URL: ${webView.url}")

                    // Set isPrintActive BEFORE opening the dialog so MainActivity knows
                    // to suspend immersive mode re-application
                    isPrintActive = true

                    // Map paper size string to Android MediaSize constant
                    val mediaSize = when (paperSize?.uppercase()) {
                        "A3"     -> PrintAttributes.MediaSize.ISO_A3
                        "A5"     -> PrintAttributes.MediaSize.ISO_A5
                        "LETTER" -> PrintAttributes.MediaSize.NA_LETTER
                        "LEGAL"  -> PrintAttributes.MediaSize.NA_LEGAL
                        else     -> PrintAttributes.MediaSize.ISO_A4 // default
                    }
                    DebugLog.d(NAME, "Print paper size: ${paperSize ?: "A4 (default)"} → $mediaSize")

                    // Create print document adapter from WebView
                    val printAdapter = webView.createPrintDocumentAdapter(jobName)

                    // Start print job with configured paper size as default
                    val printAttributes = PrintAttributes.Builder()
                        .setMediaSize(mediaSize)
                        .setResolution(PrintAttributes.Resolution("default", "Default", 300, 300))
                        .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                        .build()

                    printManager.print(jobName, printAdapter, printAttributes)

                    DebugLog.d(NAME, "Print dialog opened successfully")
                    promise.resolve(true)

                    // Reset isPrintActive after a delay — the print dialog runs in a
                    // separate system activity, so we can't get a direct callback when
                    // it closes. Use onWindowFocusChanged in MainActivity as the primary
                    // reset mechanism, but also set a safety timeout here.
                    android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                        if (isPrintActive) {
                            DebugLog.d(NAME, "Safety timeout: resetting isPrintActive")
                            isPrintActive = false
                        }
                    }, 120_000L) // 2 minute safety net
                } catch (e: Exception) {
                    isPrintActive = false
                    DebugLog.errorProduction(NAME, "Error during print: ${e.message}")
                    promise.reject("PRINT_ERROR", "Failed to print: ${e.message}", e)
                }
            }
        } catch (e: Exception) {
            isPrintActive = false
            DebugLog.errorProduction(NAME, "Error initiating print: ${e.message}")
            promise.reject("PRINT_ERROR", "Failed to initiate print: ${e.message}", e)
        }
    }

    /**
     * Recursively search for WebView in view hierarchy
     */
    private fun findWebViewRecursive(view: View): WebView? {
        if (view is WebView) {
            return view
        }
        
        if (view is ViewGroup) {
            for (i in 0 until view.childCount) {
                val child = view.getChildAt(i)
                val found = findWebViewRecursive(child)
                if (found != null) {
                    return found
                }
            }
        }
        
        return null
    }
}
