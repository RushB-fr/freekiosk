package com.freekiosk

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.graphics.Rect
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.util.Log
import android.view.KeyCharacterMap
import android.view.KeyEvent
import android.view.View
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * FreeKiosk Accessibility Service
 * 
 * Enables key/text injection into ANY app (including external apps).
 * Uses proper AccessibilityService APIs — NOT shell commands.
 * 
 * Injection strategy (in priority order):
 * 1. performGlobalAction() — for Back, Home, Recents, PlayPause (all API levels)
 * 2. InputMethod.sendKeyEvent() / commitText() — API 33+ (Android 13+)
 *    Works in any focused input field across all apps, like a real keyboard.
 * 3. Accessibility node actions — DPAD navigation & select (all API levels)
 *    Spatial focus traversal, ACTION_CLICK on focused element, scroll containers.
 * 4. ACTION_SET_TEXT on focused node — fallback for printable keys & text (all API levels)
 *    Converts keyCodes to characters via KeyCharacterMap, appends to focused field.
 *    Also handles Backspace (remove last char) and Shift+letter (uppercase).
 * 5. "input keyevent" shell command — last resort (requires root/shell, usually fails)
 * 
 * Compatibility:
 * - API 33+ (Android 13+): Full support — all keys, combos, text, DPAD navigation
 * - API 31-32 (Android 12): Global actions (incl. PlayPause) + DPAD navigation via
 *   accessibility tree + printable chars/text via ACTION_SET_TEXT
 * - API 21-30 (Android 5-11): Global actions + DPAD navigation + printable chars/text.
 *   PlayPause requires shell privileges. Non-printable keys and Ctrl/Alt combos limited.
 * 
 * The user must enable this service in:
 *   Settings > Accessibility > FreeKiosk
 * In Device Owner mode, it can be enabled programmatically.
 */
class FreeKioskAccessibilityService : AccessibilityService() {

    companion object {
        private const val TAG = "FreeKioskA11y"
        
        @Volatile
        var instance: FreeKioskAccessibilityService? = null
            private set
        
        fun isRunning(): Boolean = instance != null
        
        /**
         * Send a single key press.
         * Strategy: globalAction → InputMethod (API 33+) → a11y navigation → ACTION_SET_TEXT → input keyevent
         */
        fun sendKey(keyCode: Int): Boolean {
            val service = instance ?: return false
            
            // 1. Global actions (Back, Home, Recents) — always works, all API levels
            val globalAction = mapToGlobalAction(keyCode)
            if (globalAction != null) {
                val ok = service.performGlobalAction(globalAction)
                Log.d(TAG, "Global action: keyCode=$keyCode, action=$globalAction, ok=$ok")
                return ok
            }
            
            // 2. API 33+: InputMethod.sendKeyEvent (works in focused input fields across apps)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                try {
                    val connection = service.inputMethod?.currentInputConnection
                    if (connection != null) {
                        val now = SystemClock.uptimeMillis()
                        connection.sendKeyEvent(KeyEvent(now, now, KeyEvent.ACTION_DOWN, keyCode, 0))
                        connection.sendKeyEvent(KeyEvent(now, now, KeyEvent.ACTION_UP, keyCode, 0))
                        Log.d(TAG, "Key via InputMethod: keyCode=$keyCode")
                        return true
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "InputMethod unavailable: ${e.message}")
                }
            }
            
            // 3. Accessibility node actions (DPAD select, navigation, scroll — all API levels)
            if (performAccessibilityNavigation(service, keyCode)) {
                return true
            }
            
            // 4. Backspace: remove last char via ACTION_SET_TEXT (all API levels)
            if (keyCode == KeyEvent.KEYCODE_DEL) {
                if (deleteLastCharViaSetText(service)) {
                    Log.d(TAG, "Backspace via ACTION_SET_TEXT")
                    return true
                }
            }
            
            // 5. Printable char: convert keyCode → char, append via ACTION_SET_TEXT (all API levels)
            val char = keyCodeToChar(keyCode, 0)
            if (char != null) {
                if (injectTextViaSetText(service, char.toString())) {
                    Log.d(TAG, "Key via ACTION_SET_TEXT: keyCode=$keyCode -> '$char'")
                    return true
                }
            }
            
            // 6. Last resort: input keyevent shell command (requires root/shell, usually fails)
            return execInputCommand("keyevent", keyCode.toString(), "Key fallback: keyCode=$keyCode")
        }
        
        /**
         * Send a key press with modifier meta state (e.g., Ctrl+C, Alt+F4).
         * Strategy: InputMethod (API 33+) → ACTION_SET_TEXT for Shift+char → input keyevent
         */
        fun sendKeyWithMeta(keyCode: Int, metaState: Int): Boolean {
            val service = instance ?: return false
            
            // 1. API 33+: InputMethod.sendKeyEvent with meta state
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                try {
                    val connection = service.inputMethod?.currentInputConnection
                    if (connection != null) {
                        val now = SystemClock.uptimeMillis()
                        connection.sendKeyEvent(KeyEvent(now, now, KeyEvent.ACTION_DOWN, keyCode, 0, metaState))
                        connection.sendKeyEvent(KeyEvent(now, now, KeyEvent.ACTION_UP, keyCode, 0, metaState))
                        Log.d(TAG, "Key combo via InputMethod: keyCode=$keyCode, metaState=$metaState")
                        return true
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "InputMethod unavailable for combo: ${e.message}")
                }
            }
            
            // 2. Shift + printable char: get shifted character (e.g. Shift+A → 'A') via ACTION_SET_TEXT
            //    Only for Shift-only combos (no Ctrl, no Alt) since those are system shortcuts.
            val isShiftOnly = (metaState and KeyEvent.META_SHIFT_ON) != 0
                    && (metaState and KeyEvent.META_CTRL_ON) == 0
                    && (metaState and KeyEvent.META_ALT_ON) == 0
            if (isShiftOnly) {
                val char = keyCodeToChar(keyCode, metaState)
                if (char != null) {
                    if (injectTextViaSetText(service, char.toString())) {
                        Log.d(TAG, "Shift combo via ACTION_SET_TEXT: keyCode=$keyCode -> '$char'")
                        return true
                    }
                }
            }
            
            // 3. Last resort: input keyevent (meta state is lost, limited)
            return execInputCommand("keyevent", keyCode.toString(), "Combo fallback: keyCode=$keyCode (meta=$metaState lost)")
        }
        
        /**
         * Type text into the focused input field.
         * Strategy: InputMethod.commitText (API 33+) → ACTION_SET_TEXT on focused node (all APIs)
         */
        fun sendText(text: String): Boolean {
            val service = instance ?: return false
            
            // 1. API 33+: InputMethod.commitText (best — acts like real keyboard typing)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                try {
                    val connection = service.inputMethod?.currentInputConnection
                    if (connection != null) {
                        connection.commitText(text, 1, null)
                        Log.d(TAG, "Text via InputMethod.commitText: '${text.take(50)}'")
                        return true
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "InputMethod unavailable for text: ${e.message}")
                }
            }
            
            // 2. ACTION_SET_TEXT on focused input node (all API levels)
            if (injectTextViaSetText(service, text)) {
                Log.d(TAG, "Text via ACTION_SET_TEXT: '${text.take(50)}'")
                return true
            }
            
            Log.w(TAG, "All text injection methods failed")
            return false
        }

        /**
         * Perform a global action (Back, Home, Recents, etc.)
         */
        fun performAction(action: Int): Boolean {
            val service = instance ?: return false
            return try {
                service.performGlobalAction(action)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to perform global action: ${e.message}")
                false
            }
        }

        private fun mapToGlobalAction(keyCode: Int): Int? {
            return when (keyCode) {
                KeyEvent.KEYCODE_BACK -> GLOBAL_ACTION_BACK
                KeyEvent.KEYCODE_HOME -> GLOBAL_ACTION_HOME
                KeyEvent.KEYCODE_APP_SWITCH -> GLOBAL_ACTION_RECENTS
                KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE,
                KeyEvent.KEYCODE_HEADSETHOOK -> {
                    // GLOBAL_ACTION_KEYCODE_HEADSETHOOK (value 10), available API 31+
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) 10 else null
                }
                else -> null
            }
        }
        
        // ======= Accessibility Navigation (DPAD support, all API levels) =======
        
        /**
         * Handle DPAD keys and select via accessibility node actions.
         * Enables UI navigation on devices where InputMethod is unavailable
         * or when no text field is focused (browsing lists, pressing buttons).
         */
        private fun performAccessibilityNavigation(
            service: FreeKioskAccessibilityService, keyCode: Int
        ): Boolean {
            return when (keyCode) {
                KeyEvent.KEYCODE_DPAD_CENTER -> clickFocusedNode(service)
                KeyEvent.KEYCODE_ENTER -> clickFocusedNode(service)
                KeyEvent.KEYCODE_DPAD_UP -> navigateOrScroll(service, View.FOCUS_UP)
                KeyEvent.KEYCODE_DPAD_DOWN -> navigateOrScroll(service, View.FOCUS_DOWN)
                KeyEvent.KEYCODE_DPAD_LEFT -> navigateOrScroll(service, View.FOCUS_LEFT)
                KeyEvent.KEYCODE_DPAD_RIGHT -> navigateOrScroll(service, View.FOCUS_RIGHT)
                else -> false
            }
        }
        
        /**
         * Click the currently focused UI element.
         * Returns false for editable fields (text inputs) so Enter/Select
         * falls through to text injection handlers instead.
         */
        private fun clickFocusedNode(service: FreeKioskAccessibilityService): Boolean {
            val root = service.rootInActiveWindow ?: return false
            try {
                val focused = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
                    ?: root.findFocus(AccessibilityNodeInfo.FOCUS_ACCESSIBILITY)
                
                if (focused == null) {
                    // No focused element — tap center of screen as fallback (API 24+)
                    return tapCenterGesture(service)
                }
                
                try {
                    // Don't click editable text fields — let key be handled as text input
                    if (focused.isEditable) return false
                    
                    // Walk up to find nearest clickable ancestor (or self)
                    var target = focused
                    while (!target.isClickable) {
                        target = target.parent ?: return false
                    }
                    
                    val ok = target.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                    Log.d(TAG, "Select via a11y click: ok=$ok, class=${target.className}")
                    return ok
                } finally {
                    focused.recycle()
                }
            } finally {
                root.recycle()
            }
        }
        
        /**
         * Navigate focus to the nearest interactive element in the given direction,
         * or scroll if no candidate is found.
         */
        private fun navigateOrScroll(
            service: FreeKioskAccessibilityService, direction: Int
        ): Boolean {
            val root = service.rootInActiveWindow ?: return false
            try {
                // 1. Spatial focus navigation between interactive elements
                val focused = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
                if (focused != null) {
                    try {
                        val focusedRect = Rect().also { focused.getBoundsInScreen(it) }
                        val candidates = mutableListOf<Pair<AccessibilityNodeInfo, Rect>>()
                        collectInteractiveNodes(root, candidates)
                        
                        var bestNode: AccessibilityNodeInfo? = null
                        var bestScore = Int.MAX_VALUE
                        
                        for ((node, rect) in candidates) {
                            // Skip self (compare by bounds center)
                            if (rect.centerX() == focusedRect.centerX()
                                && rect.centerY() == focusedRect.centerY()) continue
                            
                            val inDir = when (direction) {
                                View.FOCUS_UP -> rect.centerY() < focusedRect.centerY()
                                View.FOCUS_DOWN -> rect.centerY() > focusedRect.centerY()
                                View.FOCUS_LEFT -> rect.centerX() < focusedRect.centerX()
                                View.FOCUS_RIGHT -> rect.centerX() > focusedRect.centerX()
                                else -> false
                            }
                            
                            if (inDir) {
                                val dx = rect.centerX() - focusedRect.centerX()
                                val dy = rect.centerY() - focusedRect.centerY()
                                val vert = direction == View.FOCUS_UP || direction == View.FOCUS_DOWN
                                // Primary axis distance + penalized cross-axis distance
                                val score = if (vert) Math.abs(dy) + Math.abs(dx) * 3
                                            else Math.abs(dx) + Math.abs(dy) * 3
                                if (score < bestScore) {
                                    bestScore = score
                                    bestNode = node
                                }
                            }
                        }
                        
                        if (bestNode != null) {
                            // Try input focus first, then accessibility focus
                            var ok = bestNode.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
                            if (!ok) {
                                ok = bestNode.performAction(AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS)
                            }
                            Log.d(TAG, "Navigate via a11y: direction=$direction, ok=$ok")
                            return ok
                        }
                    } finally {
                        focused.recycle()
                    }
                }
                
                // 2. Fallback: scroll the nearest scrollable container
                if (scrollInDirection(root, direction)) return true
                
                // 3. Last resort: dispatchGesture swipe (API 24+)
                return swipeGesture(service, direction)
            } finally {
                root.recycle()
            }
        }
        
        /**
         * Recursively collect all visible, focusable or clickable nodes with their screen bounds.
         */
        private fun collectInteractiveNodes(
            node: AccessibilityNodeInfo,
            result: MutableList<Pair<AccessibilityNodeInfo, Rect>>
        ) {
            try {
                if (!node.isVisibleToUser) return
                if (node.isFocusable || node.isClickable) {
                    val rect = Rect()
                    node.getBoundsInScreen(rect)
                    if (rect.width() > 0 && rect.height() > 0) {
                        result.add(Pair(node, rect))
                    }
                }
                for (i in 0 until node.childCount) {
                    val child = node.getChild(i) ?: continue
                    collectInteractiveNodes(child, result)
                }
            } catch (e: Exception) {
                // Node may become stale during traversal — skip silently
            }
        }
        
        /**
         * Scroll the nearest scrollable container in the given direction.
         * Uses BFS to find the first scrollable node in the accessibility tree.
         */
        private fun scrollInDirection(root: AccessibilityNodeInfo, direction: Int): Boolean {
            val action = when (direction) {
                View.FOCUS_UP, View.FOCUS_LEFT -> AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD
                View.FOCUS_DOWN, View.FOCUS_RIGHT -> AccessibilityNodeInfo.ACTION_SCROLL_FORWARD
                else -> return false
            }
            val queue = ArrayDeque<AccessibilityNodeInfo>()
            queue.add(root)
            while (queue.isNotEmpty()) {
                val node = queue.removeFirst()
                if (node.isScrollable && node.isVisibleToUser) {
                    val ok = node.performAction(action)
                    Log.d(TAG, "Scroll via a11y: direction=$direction, ok=$ok")
                    return ok
                }
                for (i in 0 until node.childCount) {
                    queue.add(node.getChild(i) ?: continue)
                }
            }
            return false
        }
        
        /**
         * Simulate a swipe gesture in the given direction.
         * Uses dispatchGesture (API 24+) to scroll/navigate when no focusable nodes exist.
         */
        private fun swipeGesture(
            service: FreeKioskAccessibilityService, direction: Int
        ): Boolean {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false
            try {
                val dm = service.resources.displayMetrics
                val w = dm.widthPixels
                val h = dm.heightPixels
                val cx = w / 2f
                val cy = h / 2f
                val dist = h / 4f
                
                val path = Path()
                when (direction) {
                    View.FOCUS_UP -> { path.moveTo(cx, cy); path.lineTo(cx, cy + dist) }
                    View.FOCUS_DOWN -> { path.moveTo(cx, cy); path.lineTo(cx, cy - dist) }
                    View.FOCUS_LEFT -> { path.moveTo(cx, cy); path.lineTo(cx + dist, cy) }
                    View.FOCUS_RIGHT -> { path.moveTo(cx, cy); path.lineTo(cx - dist, cy) }
                    else -> return false
                }
                
                val gesture = GestureDescription.Builder()
                    .addStroke(GestureDescription.StrokeDescription(path, 0, 250))
                    .build()
                val ok = service.dispatchGesture(gesture, null, null)
                Log.d(TAG, "Swipe gesture: direction=$direction, ok=$ok")
                return ok
            } catch (e: Exception) {
                Log.w(TAG, "Swipe gesture failed: ${e.message}")
                return false
            }
        }
        
        /**
         * Simulate a tap at the center of the screen.
         * Used as fallback when no focused/clickable element is found for Select.
         */
        private fun tapCenterGesture(service: FreeKioskAccessibilityService): Boolean {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false
            try {
                val dm = service.resources.displayMetrics
                val cx = dm.widthPixels / 2f
                val cy = dm.heightPixels / 2f
                
                val path = Path()
                path.moveTo(cx, cy)
                
                val gesture = GestureDescription.Builder()
                    .addStroke(GestureDescription.StrokeDescription(path, 0, 50))
                    .build()
                val ok = service.dispatchGesture(gesture, null, null)
                Log.d(TAG, "Tap center gesture: ok=$ok")
                return ok
            } catch (e: Exception) {
                Log.w(TAG, "Tap gesture failed: ${e.message}")
                return false
            }
        }
        
        // ======= Text Injection Helpers =======
        
        /**
         * Convert a keyCode (with optional metaState) to its printable character.
         * Uses the Android virtual keyboard character map.
         * Returns null for non-printable keys (arrows, Tab, Escape, etc.).
         */
        private fun keyCodeToChar(keyCode: Int, metaState: Int): Char? {
            return try {
                val kcm = KeyCharacterMap.load(KeyCharacterMap.VIRTUAL_KEYBOARD)
                val unicodeChar = kcm.get(keyCode, metaState)
                if (unicodeChar > 0) unicodeChar.toChar() else null
            } catch (e: Exception) {
                Log.w(TAG, "keyCodeToChar failed: ${e.message}")
                null
            }
        }
        
        /**
         * Inject text into the currently focused input field via ACTION_SET_TEXT.
         * Appends the text to any existing content in the field.
         * Works on all API levels. Requires canRetrieveWindowContent="true" in config.
         */
        private fun injectTextViaSetText(service: FreeKioskAccessibilityService, text: String): Boolean {
            try {
                val rootNode = service.rootInActiveWindow ?: return false
                val focusedNode = rootNode.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
                if (focusedNode != null) {
                    val existing = focusedNode.text?.toString() ?: ""
                    val bundle = Bundle().apply {
                        putCharSequence(
                            AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                            existing + text
                        )
                    }
                    val ok = focusedNode.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, bundle)
                    focusedNode.recycle()
                    rootNode.recycle()
                    return ok
                } else {
                    Log.w(TAG, "No focused input node found for ACTION_SET_TEXT")
                }
                rootNode.recycle()
            } catch (e: Exception) {
                Log.e(TAG, "ACTION_SET_TEXT injection failed: ${e.message}")
            }
            return false
        }
        
        /**
         * Simulate Backspace by removing the last character from the focused input field.
         * Works on all API levels via ACTION_SET_TEXT.
         */
        private fun deleteLastCharViaSetText(service: FreeKioskAccessibilityService): Boolean {
            try {
                val rootNode = service.rootInActiveWindow ?: return false
                val focusedNode = rootNode.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
                if (focusedNode != null) {
                    val existing = focusedNode.text?.toString() ?: ""
                    if (existing.isNotEmpty()) {
                        val bundle = Bundle().apply {
                            putCharSequence(
                                AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                                existing.dropLast(1)
                            )
                        }
                        val ok = focusedNode.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, bundle)
                        focusedNode.recycle()
                        rootNode.recycle()
                        return ok
                    }
                    focusedNode.recycle()
                }
                rootNode.recycle()
            } catch (e: Exception) {
                Log.e(TAG, "Delete via ACTION_SET_TEXT failed: ${e.message}")
            }
            return false
        }
        
        /**
         * Last resort: exec "input" shell command. This requires elevated privileges
         * and will silently fail on most non-rooted devices.
         */
        private fun execInputCommand(type: String, value: String, logMsg: String): Boolean {
            return try {
                Thread {
                    try {
                        val process = Runtime.getRuntime().exec(arrayOf("input", type, value))
                        val exitCode = process.waitFor()
                        Log.d(TAG, "$logMsg (exit=$exitCode)")
                    } catch (e: Exception) {
                        Log.e(TAG, "input command failed: ${e.message}")
                    }
                }.start()
                true
            } catch (e: Exception) {
                Log.e(TAG, "Failed to exec input command: ${e.message}")
                false
            }
        }
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        
        // On API 33+, ensure InputMethod editor flag is set for text/key injection
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            try {
                serviceInfo = serviceInfo.apply {
                    flags = flags or AccessibilityServiceInfo.FLAG_INPUT_METHOD_EDITOR
                }
                Log.i(TAG, "InputMethod editor flag enabled (API ${Build.VERSION.SDK_INT})")
            } catch (e: Exception) {
                Log.w(TAG, "Could not set InputMethod editor flag: ${e.message}")
            }
        }
        
        Log.i(TAG, "FreeKiosk Accessibility Service connected (API ${Build.VERSION.SDK_INT})")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // Not used — we only use this service for key/text injection
    }

    override fun onInterrupt() {
        Log.w(TAG, "FreeKiosk Accessibility Service interrupted")
    }

    override fun onDestroy() {
        super.onDestroy()
        instance = null
        Log.i(TAG, "FreeKiosk Accessibility Service disconnected")
    }
}
