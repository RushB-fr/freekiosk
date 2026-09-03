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
    private val screenshotErrorProvider: (() -> String?)? = null,
    private val cameraPhotoProvider: ((camera: String, quality: Int) -> java.io.InputStream?)? = null,
    // #FileTransfer: backed by the shared Downloads folder via MediaStore (see
    // HttpServerModule.mediaStoreListDownloads/Upload/Download/Delete), mirroring Fully
    // Kiosk's Remote Admin file manager. Flat namespace keyed by file name, no sub-folders.
    private val filesListProvider: (() -> JSONObject)? = null,
    private val filesUploadProvider: ((name: String, mimeType: String, bytes: ByteArray) -> JSONObject)? = null,
    private val filesDownloadProvider: ((name: String) -> ByteArray?)? = null,
    private val filesDeleteProvider: ((name: String) -> JSONObject)? = null
) : NanoHTTPD(port) {

    companion object {
        private const val TAG = "KioskHttpServer"
        private const val MIME_JSON = "application/json"
        private const val MAX_UPLOAD_BYTES = 200L * 1024 * 1024 // 200 MB, generous for an APK or a config bundle
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

        // Check authentication if API key is set.
        // "/remote" is exempt: it is the live-view HTML shell (mirrors Fully Kiosk's
        // Remote Admin screen view). The page itself carries no device data — it only
        // prompts for the key client-side and then calls /api/screenshot with it via
        // fetch(), which IS gated below like every other endpoint.
        if (!apiKey.isNullOrEmpty() && uri != "/remote" && uri != "/") {
            val providedKey = session.headers["x-api-key"]
            if (providedKey != apiKey) {
                return jsonError(Response.Status.UNAUTHORIZED, "Invalid or missing API key")
                    .apply { corsHeaders.forEach { (key, value) -> addHeader(key, value) } }
            }
        }

        // Route requests
        val isGetOrPost = method == Method.GET || method == Method.POST

        // POST-only endpoints that require a JSON body (GET on these → 405, not 404)
        val postOnlyUris = setOf(
            "/api/url", "/api/navigate", "/api/tts", "/api/toast",
            "/api/app/launch", "/api/js", "/api/audio/play", "/api/remote/text",
            "/api/mode", "/api/files/upload", "/api/files/delete", "/api/remote/tap"
        )

        val response = try {
            when {
                // Read-only endpoints — accept GET or POST (no body needed)
                isGetOrPost && uri == "/api/status" -> handleGetStatus()
                isGetOrPost && uri == "/api/battery" -> handleGetBattery()
                isGetOrPost && uri == "/api/screen" -> handleGetScreen()
                isGetOrPost && uri == "/api/wifi" -> handleGetWifi()
                isGetOrPost && uri == "/api/info" -> handleGetInfo()
                isGetOrPost && uri == "/api/health" -> handleHealth()
                isGetOrPost && uri == "/api/rotation" -> handleGetRotation()
                isGetOrPost && uri == "/api/sensors" -> handleGetSensors()
                isGetOrPost && uri == "/api/storage" -> handleGetStorage()
                isGetOrPost && uri == "/api/memory" -> handleGetMemory()
                isGetOrPost && uri == "/api/screenshot" -> handleScreenshot()
                isGetOrPost && uri == "/api/camera/list" -> handleCameraList()
                isGetOrPost && uri == "/api/location" -> handleGetLocation()
                isGetOrPost && uri == "/api/files/list" -> handleFilesList(session)
                isGetOrPost && uri == "/api/files/download" -> handleFilesDownload(session)
                method == Method.GET && uri == "/remote" -> handleRemoteViewPage()
                // Bare root now goes straight to the control panel — one less thing to
                // type/bookmark. The old JSON docs move to /api (still handleRoot()).
                method == Method.GET && uri == "/" -> redirectToRemote()
                isGetOrPost && uri == "/api" -> handleRoot()

                // Read endpoints that also have a POST variant — POST with body sets, GET/POST without body reads
                isGetOrPost && uri == "/api/brightness" -> {
                    if (method == Method.POST) handleSetBrightness(session) else handleGetBrightness()
                }
                isGetOrPost && uri == "/api/volume" -> {
                    if (method == Method.POST) handleSetVolume(session) else handleGetVolume()
                }

                // Camera photo: GET or POST (query params drive behavior)
                isGetOrPost && uri == "/api/camera/photo" -> handleCameraPhoto(session)

                // POST-only control endpoints requiring a JSON body
                method == Method.POST && uri == "/api/url" -> handleSetUrl(session)
                method == Method.POST && uri == "/api/navigate" -> handleSetUrl(session)
                method == Method.POST && uri == "/api/tts" -> handleTts(session)
                method == Method.POST && uri == "/api/toast" -> handleToast(session)
                method == Method.POST && uri == "/api/app/launch" -> handleLaunchApp(session)
                method == Method.POST && uri == "/api/mode" -> handleSetMode(session)
                method == Method.POST && uri == "/api/js" -> handleExecuteJs(session)
                method == Method.POST && uri == "/api/audio/play" -> handleAudioPlay(session)
                method == Method.POST && uri == "/api/remote/text" -> handleKeyboardText(session)
                method == Method.POST && uri == "/api/remote/tap" -> handleRemoteTap(session)
                method == Method.POST && uri == "/api/files/upload" -> handleFilesUpload(session)
                method == Method.POST && uri == "/api/files/delete" -> handleFilesDelete(session)

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

                // Method Not Allowed: POST-only endpoints called with GET
                method == Method.GET && uri in postOnlyUris ->
                    jsonError(Response.Status.METHOD_NOT_ALLOWED, "This endpoint requires POST with a JSON body")

                // 404 only for truly unknown paths
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
                    put("/api/files/list - List files in the shared Downloads folder")
                    put("/api/files/download?path= - Download a file from Downloads")
                    put("/remote - Live view of the tablet screen, open in a browser")
                })
                put("POST", JSONArray().apply {
                    put("/api/brightness - Set brightness {value: 0-100}")
                    put("/api/url - Navigate to URL {url: string}")
                    put("/api/navigate - Navigate to URL (alias)")
                    put("/api/tts - Text to speech {text: string}")
                    put("/api/toast - Show toast {text: string}")
                    put("/api/volume - Set volume {value: 0-100}")
                    put("/api/app/launch - Launch app {package: string}")
                    put("/api/mode - Switch display mode {mode: webview|external_app|media_player, url?|package?}")
                    put("/api/js - Execute JavaScript {code: string}")
                    put("/api/audio/play - Play audio {url: string, loop: bool, volume: 0-100}")
                    put("/api/remote/text - Type text {text: string}")
                    put("/api/remote/tap - Tap at coordinates {x, y} (device pixels, requires Accessibility Service)")
                    put("/api/files/upload?name= - Upload a file to Downloads (raw body, Content-Length required)")
                    put("/api/files/delete - Delete a file {path: string}")
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

    // Live-view + remote-control HTML shell — mirrors Fully Kiosk's Remote Admin screen
    // view, but interactive: clicking the image sends a tap gesture (via the
    // Accessibility Service, see FreeKioskAccessibilityService.sendTap) and the text box
    // relays typed characters to whatever field is focused on the tablet. Polls
    // /api/screenshot client-side (same X-Api-Key auth as everything else) instead of the
    // server pushing frames, so viewing needs no extra native code; control reuses the
    // existing /api/remote/tap, /api/remote/text and /api/remote/{back,home} endpoints.
    private fun handleRemoteViewPage(): Response {
        val html = """
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FreeKiosk - Vue à distance</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; background:#111; color:#eee; font-family:-apple-system,Segoe UI,Roboto,sans-serif;
         display:flex; flex-direction:column; align-items:center; min-height:100vh; }
  header { width:100%; box-sizing:border-box; padding:10px 16px; background:#1b1b1b;
           display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
  header h1 { font-size:15px; margin:0; font-weight:600; color:#8ab4ff; }
  #status { font-size:12px; color:#999; }
  #status.err { color:#ff6b6b; }
  #status.tap { color:#5ec26a; }
  main { width:100%; display:flex; justify-content:center; padding:16px; box-sizing:border-box; }
  img { max-width:100%; max-height:75vh; border:1px solid #333; border-radius:6px; background:#000; cursor:crosshair; }
  #keyBox { display:none; gap:8px; padding:16px; }
  #keyBox input { padding:8px 10px; border-radius:6px; border:1px solid #444; background:#222; color:#eee; }
  #keyBox button { padding:8px 14px; border-radius:6px; border:none; background:#3a6ff0; color:#fff; cursor:pointer; }
  #logout { font-size:12px; color:#999; background:none; border:1px solid #444; border-radius:5px;
            padding:4px 8px; cursor:pointer; }
  #controls { width:100%; max-width:800px; box-sizing:border-box; padding:0 16px 16px; display:flex;
              flex-direction:column; gap:8px; }
  #controls .row { display:flex; gap:8px; flex-wrap:wrap; }
  #controls input[type=text] { flex:1; min-width:160px; padding:9px 10px; border-radius:6px;
              border:1px solid #444; background:#1b1b1b; color:#eee; font-size:14px; }
  #controls button { padding:9px 14px; border-radius:6px; border:1px solid #444; background:#222;
              color:#eee; cursor:pointer; font-size:13px; }
  #controls button:hover { background:#2b2b2b; }
  #controls button.primary { background:#3a6ff0; border-color:#3a6ff0; color:#fff; }
  #controls button.danger { background:#5a2020; border-color:#7a2b2b; }
  #hint { font-size:11.5px; color:#777; }
  #statusLine { font-size:12px; color:#888; }
  fieldset { border:1px solid #333; border-radius:8px; padding:10px 12px 12px; margin:0; }
  legend { font-size:12px; color:#8ab4ff; padding:0 6px; }
  .slider-row { display:flex; align-items:center; gap:10px; }
  .slider-row input[type=range] { flex:1; }
  .slider-row span { font-size:12px; color:#aaa; width:2.6em; text-align:right; }
  table.files { width:100%; border-collapse:collapse; font-size:12.5px; }
  table.files th, table.files td { text-align:left; padding:5px 6px; border-bottom:1px solid #2a2a2a; }
  table.files th { color:#8ab4ff; font-weight:600; }
  table.files button { padding:3px 8px; font-size:11.5px; }
  #dropZone { border:1.5px dashed #444; border-radius:8px; padding:14px; text-align:center;
              font-size:12.5px; color:#999; }
  #dropZone.over { border-color:#3a6ff0; color:#cdd; }
</style>
</head>
<body>
<header>
  <h1>FreeKiosk - Vue à distance</h1>
  <span id="statusLine"></span>
  <span id="status">connexion...</span>
  <button id="logout" title="Oublier la clé API enregistrée" onclick="forgetKey()">Oublier la clé</button>
</header>
<div id="keyBox">
  <input id="keyInput" type="password" placeholder="X-Api-Key">
  <button onclick="saveKey()">Connecter</button>
</div>
<main><img id="view" alt="Écran de la tablette"></main>
<div id="controls">
  <p id="hint">Clique sur l'écran pour taper dessus. Tape ci-dessous et clique sur Envoyer pour écrire dans le champ actuellement sélectionné sur la tablette.</p>
  <div class="row">
    <input id="textInput" type="text" placeholder="Texte à taper sur la tablette...">
    <button class="primary" onclick="sendTypedText()">Envoyer</button>
  </div>
  <div class="row">
    <button onclick="sendKey('back')">Retour</button>
    <button onclick="sendKey('home')">Accueil</button>
    <button onclick="sendTypedText('\n')">Entrée</button>
    <button onclick="apiAction('/api/reload')">Recharger</button>
    <button onclick="apiAction('/api/wake')">Réveiller</button>
    <button onclick="apiAction('/api/screen/on')">Écran allumé</button>
    <button onclick="apiAction('/api/screen/off')">Écran éteint</button>
    <button onclick="apiAction('/api/screensaver/on')">Veille activée</button>
    <button onclick="apiAction('/api/screensaver/off')">Veille désactivée</button>
    <button onclick="apiAction('/api/lock')">Verrouiller</button>
    <button onclick="apiAction('/api/clearCache')">Vider le cache</button>
    <button onclick="apiAction('/api/restart-ui')">Redémarrer l'interface</button>
    <button class="danger" onclick="confirmedAction('/api/reboot', 'Redémarrer la tablette ?')">Redémarrer</button>
  </div>

  <fieldset>
    <legend>Écran</legend>
    <div class="slider-row">
      <label style="width:5.5em">Luminosité</label>
      <input id="brightness" type="range" min="0" max="100" value="50">
      <span id="brightnessVal">-</span>
    </div>
    <div class="slider-row">
      <label style="width:5.5em">Volume</label>
      <input id="volume" type="range" min="0" max="100" value="50">
      <span id="volumeVal">-</span>
    </div>
  </fieldset>

  <fieldset>
    <legend>Navigation</legend>
    <div class="row">
      <input id="urlInput" type="text" placeholder="https://...">
      <button class="primary" onclick="navigateUrl()">Aller</button>
    </div>
    <div class="row">
      <button onclick="apiAction('/api/mode', { mode: 'webview' })">Mode WebView</button>
      <button onclick="apiAction('/api/mode', { mode: 'external_app' })">Mode appli externe</button>
      <button onclick="apiAction('/api/mode', { mode: 'media_player' })">Mode lecteur média</button>
    </div>
  </fieldset>

  <fieldset>
    <legend>Dire / Afficher</legend>
    <div class="row">
      <input id="toastInput" type="text" placeholder="Message toast">
      <button onclick="sendMessage('/api/toast', 'toastInput')">Toast</button>
      <input id="ttsInput" type="text" placeholder="Texte à dire">
      <button onclick="sendMessage('/api/tts', 'ttsInput')">Parler</button>
      <button onclick="apiAction('/api/audio/beep')">Bip</button>
    </div>
  </fieldset>

  <fieldset>
    <legend>Transfert de fichiers (/api/files/*)</legend>
    <div class="row">
      <button onclick="refreshFiles()">Actualiser la liste</button>
      <input id="fileInput" type="file">
      <button class="primary" onclick="uploadFile()">Téléverser</button>
    </div>
    <table class="files" id="filesTable">
      <thead><tr><th>Nom</th><th>Taille</th><th></th></tr></thead>
      <tbody id="filesBody"></tbody>
    </table>
  </fieldset>
</div>
<script>
var KEY_STORE = 'fk_remote_api_key';
var img = document.getElementById('view');
var statusEl = document.getElementById('status');
var keyBox = document.getElementById('keyBox');
var textInput = document.getElementById('textInput');
var lastUrl = null;

function getKey() { return sessionStorage.getItem(KEY_STORE) || ''; }
function saveKey() {
  var v = document.getElementById('keyInput').value;
  sessionStorage.setItem(KEY_STORE, v);
  keyBox.style.display = 'none';
  tick();
}
function forgetKey() {
  sessionStorage.removeItem(KEY_STORE);
  keyBox.style.display = 'flex';
  statusEl.textContent = 'clé effacée';
}

function authHeaders(extra) {
  var headers = extra || {};
  var key = getKey();
  if (key) headers['X-Api-Key'] = key;
  return headers;
}

function flashStatus(text, cls) {
  statusEl.textContent = text;
  statusEl.className = cls || '';
  setTimeout(function() { statusEl.className = ''; }, 900);
}

img.addEventListener('click', function(ev) {
  var rect = img.getBoundingClientRect();
  if (!img.naturalWidth || !img.naturalHeight) return;
  var scaleX = img.naturalWidth / rect.width;
  var scaleY = img.naturalHeight / rect.height;
  var x = Math.round((ev.clientX - rect.left) * scaleX);
  var y = Math.round((ev.clientY - rect.top) * scaleY);
  fetch('/api/remote/tap', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ x: x, y: y })
  })
    .then(function(res) { return res.json().then(function(j) { return { res: res, j: j }; }); })
    .then(function(r) {
      if (r.res.ok && r.j.success) {
        flashStatus('tap ' + x + ',' + y, 'tap');
      } else {
        flashStatus((r.j && r.j.error) || 'échec du tap', 'err');
      }
    })
    .catch(function(e) { flashStatus('erreur tap : ' + e.message, 'err'); });
});

function sendKey(key) {
  fetch('/api/remote/' + key, { method: 'POST', headers: authHeaders() })
    .then(function(res) { flashStatus(res.ok ? key : 'erreur', res.ok ? 'tap' : 'err'); })
    .catch(function(e) { flashStatus('erreur : ' + e.message, 'err'); });
}

function sendTypedText(forceText) {
  var text = (forceText !== undefined) ? forceText : textInput.value;
  if (!text) return;
  fetch('/api/remote/text', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ text: text })
  })
    .then(function(res) {
      if (res.ok) {
        flashStatus('envoyé', 'tap');
        if (forceText === undefined) textInput.value = '';
      } else {
        flashStatus('envoi échoué', 'err');
      }
    })
    .catch(function(e) { flashStatus('erreur : ' + e.message, 'err'); });
}

textInput.addEventListener('keydown', function(ev) {
  if (ev.key === 'Enter') { sendTypedText(); }
});

function apiAction(path, body) {
  var opts = { method: 'POST', headers: authHeaders() };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  return fetch(path, opts)
    .then(function(res) { return res.json().then(function(j) { return { ok: res.ok && j.success, j: j }; }); })
    .then(function(r) {
      flashStatus(r.ok ? (path + ' ok') : ((r.j && r.j.error) || 'echoue'), r.ok ? 'tap' : 'err');
      return r;
    })
    .catch(function(e) { flashStatus('erreur : ' + e.message, 'err'); });
}

function confirmedAction(path, question) {
  if (!confirm(question)) return;
  apiAction(path);
}

var urlInputEl = document.getElementById('urlInput');
var urlTouched = false;
urlInputEl.addEventListener('input', function() { urlTouched = true; });

function navigateUrl() {
  var url = urlInputEl.value;
  if (!url) return;
  apiAction('/api/url', { url: url });
}

function sendMessage(path, inputId) {
  var el = document.getElementById(inputId);
  var text = el.value;
  if (!text) return;
  apiAction(path, { text: text }).then(function() { el.value = ''; });
}

// ---- Brightness / volume sliders ----

var brightnessEl = document.getElementById('brightness');
var volumeEl = document.getElementById('volume');
var brightnessValEl = document.getElementById('brightnessVal');
var volumeValEl = document.getElementById('volumeVal');
var slidersTouched = false;

brightnessEl.addEventListener('input', function() {
  slidersTouched = true;
  brightnessValEl.textContent = brightnessEl.value;
});
brightnessEl.addEventListener('change', function() {
  apiAction('/api/brightness', { value: parseInt(brightnessEl.value, 10) });
});
volumeEl.addEventListener('input', function() {
  slidersTouched = true;
  volumeValEl.textContent = volumeEl.value;
});
volumeEl.addEventListener('change', function() {
  apiAction('/api/volume', { value: parseInt(volumeEl.value, 10) });
});

function statusTick() {
  fetch('/api/status', { headers: authHeaders() })
    .then(function(res) { return res.ok ? res.json() : null; })
    .then(function(j) {
      if (!j || !j.success) return;
      var d = j.data;
      var battery = d.battery ? d.battery.level + '%' : '-';
      var wifi = d.wifi ? (d.wifi.connected ? d.wifi.rssi + 'dBm' : 'hors ligne') : '-';
      document.getElementById('statusLine').textContent =
        'batterie ' + battery + ' - wifi ' + wifi;
      if (!slidersTouched && d.screen) {
        brightnessEl.value = d.screen.brightness;
        brightnessValEl.textContent = d.screen.brightness;
      }
      if (!slidersTouched && d.audio) {
        volumeEl.value = d.audio.volume;
        volumeValEl.textContent = d.audio.volume;
      }
      if (!urlTouched && d.webview && d.webview.currentUrl && document.activeElement !== urlInputEl) {
        urlInputEl.value = d.webview.currentUrl;
      }
    })
    .catch(function() {})
    .finally(function() { setTimeout(statusTick, 4000); });
}
statusTick();

// ---- File transfer panel ----

function humanSize(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

function refreshFiles() {
  fetch('/api/files/list', { headers: authHeaders() })
    .then(function(res) { return res.json(); })
    .then(function(j) {
      var body = document.getElementById('filesBody');
      body.innerHTML = '';
      if (!j.success) { flashStatus(j.error || 'échec de la liste', 'err'); return; }
      j.data.entries.forEach(function(e) {
        var tr = document.createElement('tr');
        var nameTd = document.createElement('td');
        nameTd.textContent = e.name;
        var sizeTd = document.createElement('td');
        sizeTd.textContent = e.isDirectory ? '-' : humanSize(e.size);
        var actionTd = document.createElement('td');
        if (!e.isDirectory) {
          var dl = document.createElement('button');
          dl.textContent = 'Télécharger';
          dl.onclick = function() { downloadFile(e.name); };
          actionTd.appendChild(dl);
        }
        var del = document.createElement('button');
        del.textContent = 'Supprimer';
        del.style.marginLeft = '6px';
        del.onclick = function() { deleteFile(e.name); };
        actionTd.appendChild(del);
        tr.appendChild(nameTd); tr.appendChild(sizeTd); tr.appendChild(actionTd);
        body.appendChild(tr);
      });
    })
    .catch(function(e) { flashStatus('erreur : ' + e.message, 'err'); });
}

function downloadFile(name) {
  fetch('/api/files/download?path=' + encodeURIComponent(name), { headers: authHeaders() })
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.blob();
    })
    .then(function(blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function() { URL.revokeObjectURL(url); }, 5000);
    })
    .catch(function(e) { flashStatus('erreur de telechargement : ' + e.message, 'err'); });
}

function deleteFile(name) {
  if (!confirm('Supprimer ' + name + ' ?')) return;
  fetch('/api/files/delete', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ path: name })
  })
    .then(function(res) { return res.json(); })
    .then(function(j) {
      flashStatus(j.success ? 'supprime' : (j.error || 'échec de la suppression'), j.success ? 'tap' : 'err');
      refreshFiles();
    })
    .catch(function(e) { flashStatus('erreur : ' + e.message, 'err'); });
}

function uploadFile() {
  var input = document.getElementById('fileInput');
  var file = input.files[0];
  if (!file) return;
  fetch('/api/files/upload?name=' + encodeURIComponent(file.name), {
    method: 'POST',
    headers: authHeaders(),
    body: file
  })
    .then(function(res) { return res.json(); })
    .then(function(j) {
      flashStatus(j.success ? 'televerse' : (j.error || 'échec du téléversement'), j.success ? 'tap' : 'err');
      input.value = '';
      refreshFiles();
    })
    .catch(function(e) { flashStatus('erreur : ' + e.message, 'err'); });
}

refreshFiles();

function tick() {
  fetch('/api/screenshot', { headers: authHeaders(), cache: 'no-store' })
    .then(function(res) {
      if (res.status === 401) {
        keyBox.style.display = 'flex';
        statusEl.textContent = 'clé API requise';
        statusEl.className = 'err';
        return null;
      }
      if (!res.ok) { throw new Error('HTTP ' + res.status); }
      keyBox.style.display = 'none';
      return res.blob();
    })
    .then(function(blob) {
      if (!blob) return;
      var url = URL.createObjectURL(blob);
      img.src = url;
      if (lastUrl) URL.revokeObjectURL(lastUrl);
      lastUrl = url;
      statusEl.textContent = 'en direct - ' + new Date().toLocaleTimeString();
      statusEl.className = '';
    })
    .catch(function(e) {
      statusEl.textContent = 'erreur : ' + e.message;
      statusEl.className = 'err';
    })
    .finally(function() {
      setTimeout(tick, 1500);
    });
}

tick();
</script>
</body>
</html>
""".trimIndent()
        return newFixedLengthResponse(Response.Status.OK, "text/html; charset=utf-8", html)
    }

    // Bare root -> /remote, so the whole address is just "http://TABLET_IP:PORT" to bookmark.
    private fun redirectToRemote(): Response {
        return newFixedLengthResponse(Response.Status.REDIRECT, "text/plain", "")
            .apply { addHeader("Location", "/remote") }
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

    private fun handleSetMode(session: IHTTPSession): Response {
        checkControlAllowed()?.let { return it }

        val body = parseBody(session)
        val mode = body?.optString("mode", "") ?: ""

        if (mode != "webview" && mode != "external_app" && mode != "media_player") {
            return jsonError(Response.Status.BAD_REQUEST, "mode must be 'webview', 'external_app' or 'media_player'")
        }

        val params = JSONObject().put("mode", mode)
        when (mode) {
            "external_app" -> {
                // package optional: given → single-app mode with that app; omitted →
                // restore the stored external-app config (e.g. the multi-app grid).
                val packageName = body?.optString("package", "") ?: ""
                if (packageName.isNotEmpty()) {
                    params.put("package", packageName)
                }
            }
            "webview" -> {
                // url optional: omit to keep the stored/current URL.
                val url = body?.optString("url", "") ?: ""
                if (url.isNotEmpty()) {
                    params.put("url", url)
                }
            }
            // media_player: no target, uses the stored playlist and settings.
        }

        val result = commandHandler("setMode", params)
        return jsonSuccess(result)
    }

    private fun handleTts(session: IHTTPSession): Response {
        checkControlAllowed()?.let { return it }
        
        val body = parseBody(session)
        val text = body?.optString("text", "") ?: ""
        
        if (text.isEmpty()) {
            return jsonError(Response.Status.BAD_REQUEST, "Text is required")
        }

        val params = JSONObject().put("text", text)
        val language = body?.optString("language", "") ?: ""
        if (language.isNotEmpty()) {
            params.put("language", language)
        }
        val result = commandHandler("tts", params)
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

    private fun handleRemoteTap(session: IHTTPSession): Response {
        checkControlAllowed()?.let { return it }
        val body = parseBody(session)
        val x = body?.optInt("x", -1) ?: -1
        val y = body?.optInt("y", -1) ?: -1
        if (x < 0 || y < 0) {
            return jsonError(Response.Status.BAD_REQUEST, "JSON body with 'x' and 'y' (device pixel coordinates) is required")
        }
        val result = commandHandler("remoteTap", JSONObject().apply { put("x", x); put("y", y) })
        if (result.optBoolean("executed", false)) {
            return jsonSuccess(result)
        }
        return jsonError(Response.Status.BAD_REQUEST, result.optString("error", "Tap failed"))
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
            // #229: say why, so an admin hitting /api/screenshot from behind an external
            // app learns what to fix instead of getting a bare "not available".
            jsonError(
                Response.Status.SERVICE_UNAVAILABLE,
                screenshotErrorProvider?.invoke() ?: "Screenshot not available",
            )
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

    // ==================== File Transfer Handlers ====================
    // Mirrors Fully Kiosk's Remote Admin file transfer: upload/list/download/delete
    // in the SHARED Downloads folder (visible in the device's own Files app), gated by
    // the same X-Api-Key as everything else on this server. Backed by MediaStore on the
    // native side (see HttpServerModule) rather than plain java.io.File, because this app
    // targets a modern SDK where scoped storage blocks direct file access to a folder
    // other apps also write to.

    /** Rejects anything with a path separator - flat Downloads namespace, no sub-folders. */
    private fun safeFileName(name: String): String? {
        val clean = name.trim()
        if (clean.isEmpty() || clean.contains('/') || clean.contains('\\') || clean == "." || clean == "..") {
            return null
        }
        return clean
    }

    private fun handleFilesList(session: IHTTPSession): Response {
        val provider = filesListProvider
            ?: return jsonError(Response.Status.SERVICE_UNAVAILABLE, "File transfer not available")
        val result = provider.invoke()
        return if (result.optBoolean("success", false)) {
            jsonSuccess(JSONObject().apply {
                put("dir", "Download")
                put("entries", result.optJSONArray("entries") ?: JSONArray())
            })
        } else {
            jsonError(Response.Status.INTERNAL_ERROR, result.optString("error", "List failed"))
        }
    }

    private fun handleFilesUpload(session: IHTTPSession): Response {
        checkControlAllowed()?.let { return it }
        val provider = filesUploadProvider
            ?: return jsonError(Response.Status.SERVICE_UNAVAILABLE, "File transfer not available")

        val nameParam = session.parms?.get("name") ?: ""
        val name = safeFileName(nameParam)
            ?: return jsonError(Response.Status.BAD_REQUEST, "Query parameter 'name' is required and must be a plain file name, e.g. ?name=file.apk")

        val contentLength = session.headers["content-length"]?.toLongOrNull() ?: -1L
        if (contentLength < 0) {
            return jsonError(Response.Status.BAD_REQUEST, "Content-Length header is required")
        }
        if (contentLength > MAX_UPLOAD_BYTES) {
            return jsonError(Response.Status.BAD_REQUEST, "File too large (max ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB)")
        }

        return try {
            val bytes = java.io.ByteArrayOutputStream(contentLength.coerceAtMost(Int.MAX_VALUE.toLong()).toInt()).use { out ->
                val buffer = ByteArray(8192)
                val input = session.inputStream
                var remaining = contentLength
                while (remaining > 0) {
                    val toRead = minOf(buffer.size.toLong(), remaining).toInt()
                    val read = input.read(buffer, 0, toRead)
                    if (read <= 0) break
                    out.write(buffer, 0, read)
                    remaining -= read
                }
                out.toByteArray()
            }
            val mime = java.net.URLConnection.guessContentTypeFromName(name) ?: "application/octet-stream"
            val result = provider.invoke(name, mime, bytes)
            if (result.optBoolean("success", false)) {
                jsonSuccess(result)
            } else {
                jsonError(Response.Status.INTERNAL_ERROR, result.optString("error", "Upload failed"))
            }
        } catch (e: Exception) {
            Log.e(TAG, "File upload failed", e)
            jsonError(Response.Status.INTERNAL_ERROR, "Upload failed: ${e.message}")
        }
    }

    private fun handleFilesDownload(session: IHTTPSession): Response {
        val provider = filesDownloadProvider
            ?: return jsonError(Response.Status.SERVICE_UNAVAILABLE, "File transfer not available")
        val pathParam = session.parms?.get("path") ?: ""
        val name = safeFileName(pathParam)
            ?: return jsonError(Response.Status.BAD_REQUEST, "Query parameter 'path' is required and must be a plain file name")

        val bytes = provider.invoke(name)
            ?: return jsonError(Response.Status.NOT_FOUND, "File not found")

        val mime = java.net.URLConnection.guessContentTypeFromName(name) ?: "application/octet-stream"
        val response = newFixedLengthResponse(
            Response.Status.OK, mime, java.io.ByteArrayInputStream(bytes), bytes.size.toLong()
        )
        response.addHeader("Content-Disposition", "attachment; filename=\"$name\"")
        return response
    }

    private fun handleFilesDelete(session: IHTTPSession): Response {
        checkControlAllowed()?.let { return it }
        val provider = filesDeleteProvider
            ?: return jsonError(Response.Status.SERVICE_UNAVAILABLE, "File transfer not available")
        val body = parseBody(session)
        val pathParam = body?.optString("path", "") ?: ""
        val name = safeFileName(pathParam)
            ?: return jsonError(Response.Status.BAD_REQUEST, "JSON body with 'path' field is required, e.g. {\"path\": \"old.apk\"}")

        val result = provider.invoke(name)
        return if (result.optBoolean("success", false)) {
            jsonSuccess(JSONObject().apply { put("deleted", true) })
        } else {
            jsonError(Response.Status.NOT_FOUND, result.optString("error", "Delete failed"))
        }
    }

    // ==================== Helpers ====================

    private fun parseBody(session: IHTTPSession): JSONObject? {
        return try {
            // #115: NanoHTTPD 2.3.1 decodes the POST body with the charset from the
            // Content-Type header, defaulting to US-ASCII when the client sends none.
            // That silently corrupts every multibyte UTF-8 character in the body (Chinese,
            // Korean, Japanese, Arabic, emoji), so e.g. /api/tts spoke English but stayed
            // silent on Chinese text. JSON is UTF-8 by spec (RFC 8259), so when the request
            // did not declare a charset we force UTF-8 before NanoHTTPD reads the body. We
            // only add a charset and never change the media type, so form-urlencoded /
            // multipart detection is untouched, and pure-ASCII bodies decode identically
            // (English is unaffected).
            val contentType = session.headers["content-type"]
            if (contentType != null && !contentType.contains("charset", ignoreCase = true)) {
                session.headers["content-type"] = "$contentType; charset=UTF-8"
            }
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
