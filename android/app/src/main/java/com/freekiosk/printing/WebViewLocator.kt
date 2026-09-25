package com.freekiosk.printing

import android.app.Activity
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView

/** Finds the kiosk WebView in the view tree, as PrintModule does for the print dialog. */
internal object WebViewLocator {

    fun find(activity: Activity): WebView? = search(activity.window.decorView)

    private fun search(view: View): WebView? {
        if (view is WebView) return view
        if (view is ViewGroup) {
            for (i in 0 until view.childCount) {
                search(view.getChildAt(i))?.let { return it }
            }
        }
        return null
    }
}
