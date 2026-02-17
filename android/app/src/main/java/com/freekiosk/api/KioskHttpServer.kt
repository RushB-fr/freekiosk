package com.freekiosk.api

import fi.iki.elonen.NanoHTTPD
import org.json.JSONObject
import org.json.JSONArray
import android.util.Log

/**
 * FreeKiosk REST API Server
 * Lightweight HTTP server for Home Assistant integration
 */
class KioskHttpServer(
    port: Int,
    private val apiKey: String?,
    private val allowControl: Boolean,
    private val statusProvider: () -> JSONObject,
    private val commandHandler: (String, JSONObject?) -> JSONObject,
    private val screenshotProvider: (() -> java.io.InputStream?)? = null,
    private val cameraPhotoProvider: ((camera: String, quality: Int) -> java.io.InputStream?)? = null
) : NanoHTTPD(port) {

    companion object {
        private const val TAG = "KioskHttpServer"
        private const val MIME_JSON = "application/json"
    }

    override fun serve(session: IHTTPSession): Response {
        val uri = session.uri
        val method = session.method
        
        Log.d(TAG, "Request: $method $uri")

        // CORS headers for browser access
        val corsHeaders = mutableMapOf(
            "Access-Control-Allow-Origin" to "*",
            "Access-Control-Allow-Methods" to "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers" to "Content-Type, X-Api-Key"
        )

        // Handle OPTIONS preflight
        if (method == Method.OPTIONS) {
            return newFixedLengthResponse(Response.Status.OK, MIME_JSON, "").apply {
                corsHeaders.forEach { (key, value) -> addHeader(key, value) }
            }
        }

        // Check authentication if API key is set
        if (!apiKey.isNullOrEmpty()) {
            val providedKey = session.headers["x-api-key"]
            if (providedKey != apiKey) {
                return jsonError(Response.Status.UNAUTHORIZED, "Invalid or missing API key")
                    .apply { corsHeaders.forEach { (key, value) -> addHeader(key, value) } }
            }
        }

        // Route requests
        val isGetOrPost = method == Method.GET || method == Method.POST
        val response = try {
            when {
                // GET endpoints (read-only)
                method == Method.GET && uri == "/api/status" -> handleGetStatus()
                method == Method.GET && uri == "/api/battery" -> handleGetBattery()
                method == Method.GET && uri == "/api/brightness" -> handleGetBrightness()
                method == Method.GET && uri == "/api/screen" -> handleGetScreen()
                method == Method.GET && uri == "/api/wifi" -> handleGetWifi()
                method == Method.GET && uri == "/api/info" -> handleGetInfo()
                method == Method.GET && uri == "/api/health" -> handleHealth()
                method == Method.GET && uri == "/api/rotation" -> handleGetRotation()
                method == Method.GET && uri == "/api/sensors" -> handleGetSensors()
                method == Method.GET && uri == "/api/storage" -> handleGetStorage()
                method == Method.GET && uri == "/api/memory" -> handleGetMemory()
                method == Method.GET && uri == "/api/volume" -> handleGetVolume()
                method == Method.GET && uri == "/api/screenshot" -> handleScreenshot()
                method == Method.GET && uri == "/api/camera/photo" -> handleCameraPhoto(session)
                method == Method.GET && uri == "/api/camera/list" -> handleCameraList()
                method == Method.GET && uri == "/api/location" -> handleGetLocation()
                method == Method.GET && uri == "/" -> handleRoot()

                // POST endpoints requiring a body (POST only, GET returns 405)
                method == Method.POST && uri == "/api/brightness" -> handleSetBrightness(session)
                method == Method.POST && uri == "/api/url" -> handleSetUrl(session)
                method == Method.POST && uri == "/api/navigate" -> handleSetUrl(session)
                method == Method.POST && uri == "/api/tts" -> handleTts(session)
                method == Method.POST && uri == "/api/volume" -> handleSetVolume(session)
                method == Method.POST && uri == "/api/toast" -> handleToast(session)
                method == Method.POST && uri == "/api/app/launch" -> handleLaunchApp(session)
                method == Method.POST && uri == "/api/js" -> handleExecuteJs(session)
                method == Method.POST && uri == "/api/audio/play" -> handleAudioPlay(session)
                method == Method.POST && uri == "/api/remote/text" -> handleKeyboardText(session)

                // Control endpoints (accept both GET and POST for convenience)
                isGetOrPost && uri == "/api/screen/on" -> handleScreenOn()
                isGetOrPost && uri == "/api/screen/off" -> handleScreenOff()
                isGetOrPost && uri == "/api/screensaver/on" -> handleScreensaverOn()
                isGetOrPost && uri == "/api/screensaver/off" -> handleScreensaverOff()
                isGetOrPost && uri == "/api/reload" -> handleReload()
                isGetOrPost && uri == "/api/wake" -> handleWake()
                isGetOrPost && uri == "/api/reboot" -> handleReboot()
                isGetOrPost && uri == "/api/clearCache" -> handleClearCache()
                isGetOrPost && uri == "/api/lock" -> handleLockDevice()
                isGetOrPost && uri == "/api/restart-ui" -> handleRestartUi()
                isGetOrPost && uri == "/api/audio/stop" -> handleAudioStop()
                isGetOrPost && uri == "/api/audio/beep" -> handleAudioBeep()
                
                // Rotation control (accept both GET and POST)
                isGetOrPost && uri == "/api/rotation/start" -> handleRotationStart()
                isGetOrPost && uri == "/api/rotation/stop" -> handleRotationStop()
                
                // Remote control - Android TV (accept both GET and POST)
                isGetOrPost && uri == "/api/remote/up" -> handleRemoteKey("up")
                isGetOrPost && uri == "/api/remote/down" -> handleRemoteKey("down")
                isGetOrPost && uri == "/api/remote/left" -> handleRemoteKey("left")
                isGetOrPost && uri == "/api/remote/right" -> handleRemoteKey("right")
                isGetOrPost && uri == "/api/remote/select" -> handleRemoteKey("select")
                isGetOrPost && uri == "/api/remote/back" -> handleRemoteKey("back")
                isGetOrPost && uri == "/api/remote/home" -> handleRemoteKey("home")
                isGetOrPost && uri == "/api/remote/menu" -> handleRemoteKey("menu")
                isGetOrPost && uri == "/api/remote/playpause" -> handleRemoteKey("playpause")

                // Keyboard emulation (accept both GET and POST)
                isGetOrPost && uri == "/api/remote/keyboard" -> handleKeyboardCombo(session)
                isGetOrPost && uri.startsWith("/api/remote/keyboard/") -> handleKeyboardKey(uri)

                // Method Not Allowed: valid POST endpoints called with GET
                method == Method.GET && uri in listOf(
                    "/api/brightness", "/api/url", "/api/navigate", "/api/tts",
                    "/api/toast", "/api/app/launch", "/api/js", "/api/audio/play",
                    "/api/remote/text"
                ) -> jsonError(Response.Status.METHOD_NOT_ALLOWED, "This endpoint requires POST with a JSON body")

                else -> jsonError(Response.Status.NOT_FOUND, "Endpoint not found")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error handling request", e)
            jsonError(Response.Status.INTERNAL_ERROR, e.message ?: "Internal server error")
        }

        // Add CORS headers to response
        corsHeaders.forEach { (key, value) -> response.addHeader(key, value) }
        return response
    }

    // ==================== GET Handlers ====================

    private fun handleRoot(): Response {
        val info = JSONObject().apply {
            put("name", "FreeKiosk REST API")
            put("version", "1.0")
            put("endpoints", JSONObject().apply {
                put("GET", JSONArray().apply {
                    put("/api/status - Full device status")
                    put("/api/battery - Battery info")
                    put("/api/brightness - Current brightness")
                    put("/api/screen - Screen state")
                    put("/api/wifi - WiFi info")
                    put("/api/info - Device info")
                    put("/api/rotation - URL rotation status")
                    put("/api/sensors - Device sensors (light, proximity)")
                    put("/api/storage - Storage info")
                    put("/api/memory - Memory info")
                    put("/api/health - Health check")
                    put("/api/camera/photo - Take photo (params: camera=front|back, quality=0-100)")
                    put("/api/camera/list - List available cameras")
                    put("/api/volume - Get current volume {level, maxLevel}")
                    put("/api/location - GPS coordinates (latitude, longitude, accuracy)")
                })
                put("POST", JSONArray().apply {
                    put("/api/brightness - Set brightness {value: 0-100}")
                    put("/api/url - Navigate to URL {url: string}")
                    put("/api/navigate - Navigate to URL (alias)")
                    put("/api/tts - Text to speech {text: string}")
                    put("/api/toast - Show toast {text: string}")
                    put("/api/volume - Set volume {value: 0-100}")
                    put("/api/app/launch - Launch app {package: string}")
                    put("/api/js - Execute JavaScript {code: string}")
                    put("/api/audio/play - Play audio {url: string, loop: bool, volume: 0-100}")
                    put("/api/remote/text - Type text {text: string}")
                })
                put("GET or POST", JSONArray().apply {
                    put("/api/screen/on - Turn screen on")
                    put("/api/screen/off - Turn screen off")
                    put("/api/screensaver/on - Activate screensaver")
                    put("/api/screensaver/off - Deactivate screensaver")
                    put("/api/reload - Reload WebView")
                    put("/api/wake - Wake from screensaver")
                    put("/api/reboot - Reboot device (Device Owner)")
                    put("/api/clearCache - Clear WebView cache, cookies and storage")
                    put("/api/lock - Lock device (Device Owner)")
                    put("/api/restart-ui - Restart the app UI")
                    put("/api/audio/stop - Stop audio playback")
                    put("/api/audio/beep - Play beep sound")
                    put("/api/rotation/start - Start URL rotation")
                    put("/api/rotation/stop - Stop URL rotation")
                    put("/api/remote/* - Remote control (up/down/left/right/select/back/home/menu/playpause)")
                    put("/api/remote/keyboard/{key} - Keyboard key emulation (a-z, 0-9, f1-f12, space, enter, etc.)")
                    put("/api/remote/keyboard?map=ctrl+c - Keyboard shortcut with modifiers (ctrl, alt, shift, meta)")
                })
            })
        }
        return jsonSuccess(info)
    }

    private fun handleHealth(): Response {
        return jsonSuccess(JSONObject().apply {
            put("status", "ok")
            put("timestamp", System.currentTimeMillis() / 1000)
        })
    }

    private fun handleGetStatus(): Response {
        val status = statusProvider()
        return jsonSuccess(status)
    }

    private fun handleGetBattery(): Response {
        val status = statusProvider()
        val battery = status.optJSONObject("battery") ?: JSONObject()
        return jsonSuccess(battery)
    }

    private fun handleGetBrightness(): Response {
        val status = statusProvider()
        val screen = status.optJSONObject("screen") ?: JSONObject()
        return jsonSuccess(JSONObject().apply {
            put("brightness", screen.optInt("brightness", 50))
        })
    }

    private fun handleGetScreen(): Response {
        val status = statusProvider()
        val screen = status.optJSONObject("screen") ?: JSONObject()
        return jsonSuccess(screen)
    }

    private fun handleGetInfo(): Response {
        val status = statusProvider()
        val device = status.optJSONObject("device") ?: JSONObject()
        return jsonSuccess(device)
    }

    private fun handleGetWifi(): Response {
        val status = statusProvider()
        val wifi = status.optJSONObject("wifi") ?: JSONObject()
        return jsonSuccess(wifi)
    }

    private fun handleGetVolume(): Response {
        val status = statusProvider()
        val audio = status.optJSONObject("audio") ?: JSONObject()
        return jsonSuccess(JSONObject().apply {
            put("level", audio.optInt("volume", 50))
            put("maxLevel", 100)
        })
    }

    // ==================== POST Handlers ====================

    private fun checkControlAllowed(): Response? {
        if (!allowControl) {
            return jsonError(Response.Status.FORBIDDEN, "Remote control is disabled")
        }
        return null
    }

    private fun handleSetBrightness(session: IHTTPSession): Response {
        checkControlAllowed()?.let { return it }
        
        val body = parseBody(session)
        val value = body?.optInt("value", -1) ?: -1
        
        if (value < 0 || value > 100) {
            return jsonError(Response.Status.BAD_REQUEST, "Invalid brightness value (0-100)")
        }

        val result = commandHandler("setBrightness", JSONObject().put("value", value))
        return jsonSuccess(result)
    }

    private fun handleScreenOn(): Response {
        checkControlAllowed()?.let { return it }
        val result = commandHandler("screenOn", null)
        return jsonSuccess(result)
    }

    private fun handleScreenOff(): Response {
        checkControlAllowed()?.let { return it }
        val result = commandHandler("screenOff", null)
        return jsonSuccess(result)
    }

    private fun handleScreensaverOn(): Response {
        checkControlAllowed()?.let { return it }
        val result = commandHandler("screensaverOn", null)
        return jsonSuccess(result)
    }

    private fun handleScreensaverOff(): Response {
        checkControlAllowed()?.let { return it }
        val result = commandHandler("screensaverOff", null)
        return jsonSuccess(result)
    }

    private fun handleReload(): Response {
        checkControlAllowed()?.let { return it }
        val result = commandHandler("reload", null)
        return jsonSuccess(result)
    }

    private fun handleSetUrl(session: IHTTPSession): Response {
        checkControlAllowed()?.let { return it }
        
        val body = parseBody(session)
        val url = body?.optString("url", "") ?: ""
        
        if (url.isEmpty()) {
            return jsonError(Response.Status.BAD_REQUEST, "URL is required")
        }

        val result = commandHandler("setUrl", JSONObject().put("url", url))
        return jsonSuccess(result)
    }

    private fun handleTts(session: IHTTPSession): Response {
        checkControlAllowed()?.let { return it }
        
        val body = parseBody(session)
        val text = body?.optString("text", "") ?: ""
        
        if (text.isEmpty()) {
            return jsonError(Response.Status.BAD_REQUEST, "Text is required")
        }

        val result = commandHandler("tts", JSONObject().put("text", text))
        return jsonSuccess(result)
    }

    private fun handleWake(): Response {
        checkControlAllowed()?.let { return it }
        val result = commandHandler("wake", null)
        return jsonSuccess(result)
    }

    private fun handleSetVolume(session: IHTTPSession): Response {
        checkControlAllowed()?.let { return it }
        
        val body = parseBody(session)
        val value = body?.optInt("value", -1) ?: -1
        
        if (value < 0 || value > 100) {
            return jsonError(Response.Status.BAD_REQUEST, "Invalid volume value (0-100)")
        }

        val result = commandHandler("setVolume", JSONObject().put("value", value))
        return jsonSuccess(result)
    }

    private fun handleGetRotation(): Response {
        val status = statusProvider()
        val rotation = status.optJSONObject("rotation") ?: JSONObject().apply {
            put("enabled", false)
            put("urls", JSONArray())
            put("interval", 30)
            put("currentIndex", 0)
        }
        return jsonSuccess(rotation)
    }

    private fun handleRotationStart(): Response {
        checkControlAllowed()?.let { return it }
        val result = commandHandler("rotationStart", null)
        return jsonSuccess(result)
    }

    private fun handleRotationStop(): Response {
        checkControlAllowed()?.let { return it }
        val result = commandHandler("rotationStop", null)
        return jsonSuccess(result)
    }

    // ==================== New Handlers ====================

    private fun handleGetSensors(): Response {
        val sensors = statusProvider().optJSONObject("sensors") ?: JSONObject().apply {
            put("light", -1)
            put("proximity", -1)
            put("accelerometer", JSONObject().apply {
                put("x", 0)
                put("y", 0)
                put("z", 0)
            })
        }
        return jsonSuccess(sensors)
    }

    private fun handleGetStorage(): Response {
        val storage = statusProvider().optJSONObject("storage") ?: JSONObject()
        return jsonSuccess(storage)
    }

    private fun handleGetMemory(): Response {
        val memory = statusProvider().optJSONObject("memory") ?: JSONObject()
        return jsonSuccess(memory)
    }

    private fun handleToast(session: IHTTPSession): Response {
        checkControlAllowed()?.let { return it }
        
        val body = parseBody(session)
        val text = body?.optString("text", "") ?: ""
        
        if (text.isEmpty()) {
            return jsonError(Response.Status.BAD_REQUEST, "Text is required")
        }

        val result = commandHandler("toast", JSONObject().put("text", text))
        return jsonSuccess(result)
    }

    private fun handleLaunchApp(session: IHTTPSession): Response {
        checkControlAllowed()?.let { return it }
        
        val body = parseBody(session)
        val packageName = body?.optString("package", "") ?: ""
        
        if (packageName.isEmpty()) {
            return jsonError(Response.Status.BAD_REQUEST, "Package name is required")
        }

        val result = commandHandler("launchApp", JSONObject().put("package", packageName))
        return jsonSuccess(result)
    }

    private fun handleExecuteJs(session: IHTTPSession): Response {
        checkControlAllowed()?.let { return it }
        
        val body = parseBody(session)
        val code = body?.optString("code", "") ?: ""
        
        if (code.isEmpty()) {
            return jsonError(Response.Status.BAD_REQUEST, "JavaScript code is required")
        }

        val result = commandHandler("executeJs", JSONObject().put("code", code))
        return jsonSuccess(result)
    }

    private fun handleReboot(): Response {
        checkControlAllowed()?.let { return it }
        val result = commandHandler("reboot", null)
        return jsonSuccess(result)
    }

    private fun handleClearCache(): Response {
        checkControlAllowed()?.let { return it }
        val result = commandHandler("clearCache", null)
        return jsonSuccess(result)
    }

    private fun handleLockDevice(): Response {
        checkControlAllowed()?.let { return it }
        val result = commandHandler("lockDevice", null)
        return jsonSuccess(result)
    }

    private fun handleRestartUi(): Response {
        checkControlAllowed()?.let { return it }
        val result = commandHandler("restartUi", null)
        return jsonSuccess(result)
    }

    private fun handleRemoteKey(key: String): Response {
        checkControlAllowed()?.let { return it }
        val result = commandHandler("remoteKey", JSONObject().put("key", key))
        return jsonSuccess(result)
    }

    // ==================== Keyboard Emulation Handlers ====================

    private fun handleKeyboardKey(uri: String): Response {
        checkControlAllowed()?.let { return it }
        val key = uri.removePrefix("/api/remote/keyboard/")
        if (key.isEmpty()) {
            return jsonError(Response.Status.BAD_REQUEST, "Key name is required in URL path, e.g. /api/remote/keyboard/a")
        }
        val result = commandHandler("keyboardKey", JSONObject().put("key", key))
        if (result.optBoolean("executed", false)) {
            return jsonSuccess(result)
        }
        return jsonError(Response.Status.BAD_REQUEST, result.optString("error", "Unknown error"))
    }

    private fun handleKeyboardCombo(session: IHTTPSession): Response {
        checkControlAllowed()?.let { return it }
        val map = session.parms?.get("map")
        if (map.isNullOrEmpty()) {
            return jsonError(Response.Status.BAD_REQUEST, "Query parameter 'map' is required, e.g. /api/remote/keyboard?map=ctrl+c")
        }
        val result = commandHandler("keyboardCombo", JSONObject().put("map", map))
        if (result.optBoolean("executed", false)) {
            return jsonSuccess(result)
        }
        return jsonError(Response.Status.BAD_REQUEST, result.optString("error", "Unknown error"))
    }

    private fun handleKeyboardText(session: IHTTPSession): Response {
        checkControlAllowed()?.let { return it }
        val body = parseBody(session)
        val text = body?.optString("text", "")
        if (text.isNullOrEmpty()) {
            return jsonError(Response.Status.BAD_REQUEST, "JSON body with 'text' field is required, e.g. {\"text\": \"hello world\"}")
        }
        val result = commandHandler("keyboardText", JSONObject().put("text", text))
        return jsonSuccess(result)
    }

    // ==================== Location Handler ====================

    private fun handleGetLocation(): Response {
        val result = commandHandler("getLocation", null)
        return jsonSuccess(result)
    }

    private fun handleScreenshot(): Response {
        // Get screenshot from module
        val screenshotData = screenshotProvider?.invoke()
        return if (screenshotData != null) {
            // Return as image/png - need to get available bytes for content length
            val bytes = screenshotData.readBytes()
            newFixedLengthResponse(Response.Status.OK, "image/png", java.io.ByteArrayInputStream(bytes), bytes.size.toLong())
        } else {
            jsonError(Response.Status.SERVICE_UNAVAILABLE, "Screenshot not available")
        }
    }

    private fun handleAudioPlay(session: IHTTPSession): Response {
        checkControlAllowed()?.let { return it }
        val body = parseBody(session)
        val url = body?.optString("url", "")
        val loop = body?.optBoolean("loop", false) ?: false
        val volume = body?.optInt("volume", 50) ?: 50
        val result = commandHandler("audioPlay", JSONObject().apply {
            put("url", url)
            put("loop", loop)
            put("volume", volume)
        })
        return jsonSuccess(result)
    }

    private fun handleAudioStop(): Response {
        checkControlAllowed()?.let { return it }
        val result = commandHandler("audioStop", null)
        return jsonSuccess(result)
    }

    private fun handleAudioBeep(): Response {
        checkControlAllowed()?.let { return it }
        val result = commandHandler("audioBeep", null)
        return jsonSuccess(result)
    }

    // ==================== Camera Handlers ====================

    private fun handleCameraPhoto(session: IHTTPSession): Response {
        val params = session.parms ?: emptyMap()
        val camera = params["camera"] ?: "back"
        val quality = (params["quality"]?.toIntOrNull() ?: 80).coerceIn(1, 100)

        Log.d(TAG, "Camera photo request: camera=$camera, quality=$quality")

        val photoData = cameraPhotoProvider?.invoke(camera, quality)
        return if (photoData != null) {
            val bytes = photoData.readBytes()
            newFixedLengthResponse(
                Response.Status.OK, "image/jpeg",
                java.io.ByteArrayInputStream(bytes), bytes.size.toLong()
            )
        } else {
            jsonError(Response.Status.SERVICE_UNAVAILABLE, "Camera not available. Check camera permission and hardware.")
        }
    }

    private fun handleCameraList(): Response {
        val result = commandHandler("cameraList", null)
        return jsonSuccess(result)
    }

    // ==================== Helpers ====================

    private fun parseBody(session: IHTTPSession): JSONObject? {
        return try {
            val files = mutableMapOf<String, String>()
            session.parseBody(files)
            val postData = files["postData"] ?: return null
            JSONObject(postData)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to parse body", e)
            null
        }
    }

    private fun jsonSuccess(data: JSONObject): Response {
        val response = JSONObject().apply {
            put("success", true)
            put("data", data)
            put("timestamp", System.currentTimeMillis() / 1000)
        }
        return newFixedLengthResponse(Response.Status.OK, MIME_JSON, response.toString())
    }

    private fun jsonError(status: Response.Status, message: String): Response {
        val response = JSONObject().apply {
            put("success", false)
            put("error", message)
            put("timestamp", System.currentTimeMillis() / 1000)
        }
        return newFixedLengthResponse(status, MIME_JSON, response.toString())
    }
}
