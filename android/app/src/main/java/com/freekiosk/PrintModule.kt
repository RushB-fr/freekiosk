package com.freekiosk

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.print.PrintAttributes
import android.print.PrintJob
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
         * Nothing ever gets a callback when the system print dialog closes, so this used
         * to be a boolean set before opening it and cleared by MainActivity the moment
         * the activity regained window focus. That signal is not the dialog closing: a
         * device that bounces focus while the spooler is opening cleared the flag with
         * the dialog still on screen, and the next focus loss then re-entered lock task
         * and dismissed it. MainActivity already carries a comment about devices "where
         * onWindowFocusChanged fires rapidly", so this was guesswork resting on a signal
         * known to be unreliable.
         *
         * PrintManager.print() hands back a PrintJob, and the job knows. It stays live
         * while the dialog is up and turns completed, cancelled or failed when the user
         * is done one way or the other, whatever the window focus did in between.
         */
        @Volatile
        private var printJob: PrintJob? = null

        /** Covers the moment between asking to print and holding the job. */
        @Volatile
        private var printStarting: Boolean = false

        @Volatile
        private var printStartedAt: Long = 0L

        /**
         * A job that never reaches a terminal state would pin this on for ever, so the
         * old two-minute safety net is kept as a bound rather than as the mechanism.
         */
        private const val PRINT_MAX_LIFETIME_MS = 120_000L

        /**
         * True while a print dialog or job is live. Read by MainActivity to leave lock
         * task alone and suspend immersive mode, and by KioskWatchdogService so it does
         * not pull the kiosk back over the printer selection.
         */
        @JvmStatic
        val isPrintActive: Boolean
            get() {
                if (printStarting) return true
                val job = printJob ?: return false
                if (System.currentTimeMillis() - printStartedAt > PRINT_MAX_LIFETIME_MS) {
                    printJob = null
                    return false
                }
                return try {
                    if (job.isCompleted || job.isCancelled || job.isFailed) {
                        printJob = null
                        false
                    } else {
                        true
                    }
                } catch (e: Exception) {
                    // Reading the job state is an IPC call into the print service. If it
                    // throws there is no dialog left to protect, so stop claiming there is.
                    printJob = null
                    false
                }
            }

        @JvmStatic
        fun markPrintStarting() {
            printStarting = true
            printStartedAt = System.currentTimeMillis()
        }

        @JvmStatic
        fun markPrintJob(job: PrintJob?) {
            printJob = job
            printStarting = false
        }

        @JvmStatic
        fun clearPrintState() {
            printJob = null
            printStarting = false
        }
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

                    // Claimed before opening the dialog, so a focus change between here
                    // and holding the job does not leave the window unguarded.
                    markPrintStarting()

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

                    val job = printManager.print(jobName, printAdapter, printAttributes)
                    markPrintJob(job)

                    DebugLog.d(NAME, "Print dialog opened successfully")
                    promise.resolve(true)
                } catch (e: Exception) {
                    clearPrintState()
                    DebugLog.errorProduction(NAME, "Error during print: ${e.message}")
                    promise.reject("PRINT_ERROR", "Failed to print: ${e.message}", e)
                }
            }
        } catch (e: Exception) {
            clearPrintState()
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
