package com.freekiosk

import android.app.Activity
import android.content.Context
import android.print.PrintAttributes
import android.print.PrintManager
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
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
 */
class PrintModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "PrintModule"
    }

    override fun getName(): String = NAME

    /**
     * Print the current WebView content
     * Called from JavaScript when window.print() is intercepted
     */
    @ReactMethod
    fun printWebView(title: String?, promise: Promise) {
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

                    // Create print document adapter from WebView
                    val printAdapter = webView.createPrintDocumentAdapter(jobName)

                    // Start print job with default attributes
                    val printAttributes = PrintAttributes.Builder()
                        .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                        .setResolution(PrintAttributes.Resolution("default", "Default", 300, 300))
                        .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                        .build()

                    printManager.print(jobName, printAdapter, printAttributes)

                    DebugLog.d(NAME, "Print dialog opened successfully")
                    promise.resolve(true)
                } catch (e: Exception) {
                    DebugLog.errorProduction(NAME, "Error during print: ${e.message}")
                    promise.reject("PRINT_ERROR", "Failed to print: ${e.message}", e)
                }
            }
        } catch (e: Exception) {
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
