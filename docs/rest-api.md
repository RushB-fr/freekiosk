

# FreeKiosk REST API Documentation

**Control, monitor, and automate kiosks over HTTP with JSON responses**

<p>
  <a href="README.md">Docs Home</a> •
  <a href="INTEGRATIONS.md">Integrations</a> •
  <a href="MQTT.md">MQTT</a>
</p>

## Table of Contents

- [Overview](#overview)
- [Configuration](#configuration)
- [Getting Started](#getting-started)
- [Features](#features)
- [Troubleshooting](#troubleshooting)
- [Related Resources](#related-resources)




FreeKiosk includes a built-in REST API server for integration with **Home Assistant** and other smart home platforms.

## Overview



| Feature | Details |
|---|---|
| **Default Port** | 8080 |
| **Protocol** | HTTP (HTTPS planned) |
| **Authentication** | Optional API Key (X-Api-Key header) |
| **Format** | JSON responses |



> [!NOTE]
> Some API features require **Device Owner mode** for full functionality (true screen off, reboot). The HTTP server remains accessible even when the screen is off (v1.2.4+). See [Installation Guide](installation.md#advanced-install-device-owner-mode) for Device Owner setup instructions.

## Enabling the API

### Via UI



| Step | Action |
|---|---|
| **1** | 5-tap on secret button → PIN |
| **2** | Go to **Advanced** tab |
| **3** | Toggle **Enable REST API** |
| **4** | Set port (default: 8080) and optional API key |
| **5** | Save settings |



### Via ADB (Headless)



```bash
adb shell am start -n com.freekiosk/.MainActivity \
    --es pin "1234" \
    --es rest_api_enabled "true" \
    --es rest_api_port "8080" \
    --es rest_api_key "your_secret_key"
```



> [!NOTE]
> See [ADB Configuration Guide](ADB-Configuration) for full headless provisioning.


## Endpoints Reference

### Status & Info (GET)

#### `GET /api/status`

Returns complete device status in one call.



```json
{
  "success": true,
  "data": {
    "battery": { "level": 85, "charging": true, "temperature": 25.5 },
    "screen": { "on": true, "brightness": 75, "screensaverActive": false },
    "webview": { "currentUrl": "http://...", "canGoBack": false, "loading": false },
    "device": { "model": "SM-T510", "manufacturer": "samsung", "android": "11" },
    "wifi": { "connected": true, "ssid": "Home", "rssi": -45, "ip": "192.168.1.50" },
    "sensors": { "light": 150.5, "proximity": 5, "accelerometer": {...} },
    "autoBrightness": { "enabled": true, "min": 10, "max": 100, "currentLightLevel": 150.5 },
    "kiosk": { "enabled": true, "pinEnabled": true },
    "audio": { "volume": 50 },
    "storage": { "totalMB": 32000, "availableMB": 15000 },
    "memory": { "totalMB": 4096, "availableMB": 2048 }
  },
  "timestamp": 1704672000
}
```



#### `GET /api/battery`



```json
{
  "success": true,
  "data": {
    "level": 85,
    "charging": true,
    "plugged": "usb",
    "temperature": 25.5,
    "voltage": 4.2,
    "health": "good",
    "technology": "Li-ion"
  }
}
```



**📋 Fields:**


| Field | Range/Type | Description |
|---|---|---|
| **level** | 0-100 | Battery percentage |
| **charging** | boolean | Whether the device is charging |
| **plugged** | string | Power source: `usb`, `ac`, `wireless`, or `none` |
| **temperature** | number | Battery temperature in °C |
| **voltage** | number | Battery voltage in V |
| **health** | string | `good`, `overheat`, `dead`, `over_voltage`, `failure`, `cold`, or `unknown` |
| **technology** | string | Battery chemistry (e.g., `Li-ion`) |


```

#### `GET /api/brightness`



```json
{
  "success": true,
  "data": { "brightness": 75 }
}
```



#### `GET /api/screen`

Returns screen status with separated physical and overlay states.



```json
{
  "success": true,
  "data": {
    "on": true,
    "brightness": 75,
    "screensaverActive": false
  }
}
```



**Field Descriptions:**


| Field | Value | Description |
|---|---|---|
| **on** | `true`/`false` | Physical screen state from `PowerManager.isInteractive` |
| **brightness** | 0-100 | Current brightness percentage |
| **screensaverActive** | `true`/`false` | Whether the screensaver overlay is showing |



**Physical Screen State (`on`):**
- `true` = screen is physically on (consuming power)
- `false` = screen is physically off (power button pressed or `lockNow()` called)
- Note: Returns `true` even when screensaver overlay is active

**Screensaver State (`screensaverActive`):**
- `true` = screensaver overlay is covering content (screen may be dimmed)
- `false` = normal content is visible

**Interpreting Combined States:**


```javascript
// Screen physically on + content visible
{ "on": true, "screensaverActive": false }

// Screen physically on + screensaver overlay (dimmed/attenuated)
{ "on": true, "screensaverActive": true }

// Screen physically off (power button or Device Owner lockNow())
{ "on": false, "screensaverActive": false }
```



**Use Cases:**
- To check if screen is consuming power: `on === true`
- To check if content is visible to user: `on === true && screensaverActive === false`
- To check if in power-saving mode: `on === false || screensaverActive === true`

#### `GET /api/sensors`

Returns light, proximity, and accelerometer data.



```json
{
  "success": true,
  "data": {
    "light": 150.5,
    "proximity": 5,
    "accelerometer": { "x": 0.1, "y": 0.2, "z": 9.8 }
  }
}
```



#### `GET /api/storage`



```json
{
  "success": true,
  "data": {
    "totalMB": 32000,
    "availableMB": 15000,
    "usedMB": 17000,
    "usedPercent": 53
  }
}
```



#### `GET /api/memory`



```json
{
  "success": true,
  "data": {
    "totalMB": 4096,
    "availableMB": 2048,
    "usedMB": 2048,
    "usedPercent": 50,
    "lowMemory": false
  }
}
```



#### `GET /api/wifi`



```json
{
  "success": true,
  "data": {
    "connected": true,
    "ssid": "HomeNetwork",
    "rssi": -45,
    "ip": "192.168.1.50"
  }
}
```



#### `GET /api/info`

Device information.



```json
{
  "success": true,
  "data": {
    "ip": "192.168.1.50",
    "hostname": "freekiosk",
    "version": "1.2.11",
    "isDeviceOwner": true,
    "kioskMode": true
  }
}
```



**Field Descriptions:**


| Field | Type | Description |
|---|---|---|
| **isDeviceOwner** | boolean | Whether the app has Device Owner privileges (required for reboot, lock, true screen off) |
| **kioskMode** | boolean | Whether kiosk lock task mode is currently active |



#### `GET /api/health`

Simple health check.



```json
{
  "success": true,
  "data": { "status": "ok" }
}
```



#### `GET /api/screenshot`

Returns a PNG image of the current screen.

**Response**: `image/png` binary data

**Usage examples:**


```bash
# Save screenshot to file
curl http://TABLET_IP:8080/api/screenshot -o screenshot.png

# Display in HTML
<img src="http://TABLET_IP:8080/api/screenshot" />
```



> 💡 The screenshot is captured from the app's root view. It works even when the screensaver overlay is active.

#### `GET /api/camera/photo`

Take a photo using the device camera. **(v1.2.5+)**

**Query Parameters:**


| Parameter | Default | Description |
|---|---|---|
| **camera** | `back` | Camera to use: `front` or `back` |
| **quality** | `80` | JPEG compression quality (1-100) |



**Examples:**


```
GET /api/camera/photo?camera=back&quality=80
GET /api/camera/photo?camera=front&quality=60
```



**Response**: `image/jpeg` binary data

**Notes:**
- First capture may take 1-2 seconds (camera initialization + auto-exposure)
- Camera permission must be granted (already included in app permissions)
- Photo resolution is automatically optimized (~1.2MP) for fast HTTP transfer
- Higher quality values produce larger files

#### `GET /api/camera/list`

List available cameras on the device. **(v1.2.5+)**



```json
{
  "success": true,
  "data": {
    "cameras": [
      { "id": "0", "facing": "back", "maxWidth": 4032, "maxHeight": 3024 },
      { "id": "1", "facing": "front", "maxWidth": 2560, "maxHeight": 1920 }
    ]
  }
}
```




### Control Commands (POST)

#### `POST /api/brightness`
Set screen brightness (disables auto-brightness if enabled).

> ⚠️ When **App Brightness Control** is disabled in settings, this endpoint is ignored (brightness is managed by the system/Tasker).

```json
{ "value": 75 }
```

#### `POST /api/autoBrightness/enable`
Enable automatic brightness adjustment based on ambient light sensor.

> ⚠️ When **App Brightness Control** is disabled in settings, this endpoint is ignored.
```json
{ "min": 10, "max": 100, "offset": 10 }
```
- `min`: Minimum brightness percentage (0-100, default: 10)
- `max`: Maximum brightness percentage (0-100, default: 100)
- `offset`: *(optional)* Fixed percentage added to calculated brightness (0-100, default: keeps current setting). E.g. `10` means +10% brighter than what the sensor calculates

> 💡 Uses a logarithmic curve for natural perception. Brightness is calculated based on ambient light level (10-1000 lux range), then the offset is added (capped at 100%).

#### `POST /api/autoBrightness/disable`
Disable automatic brightness and restore previous manual brightness setting.

#### `GET /api/autoBrightness`
Get current auto-brightness status.
```json
{
  "success": true,
  "data": {
    "enabled": true,
    "min": 10,
    "max": 100,
    "currentLightLevel": 250.5
  }
}
```

#### `GET|POST /api/screen/on`
Turn screen on / wake device.

#### `GET|POST /api/screen/off`
Turn screen off.

> ⚠️ **Device Owner Required for Full Screen Control**
> 
> | Feature | No privileges | Device Admin | AccessibilityService (API 28+) | Device Owner |
> |---------|--------------|--------------|-------------------------------|---------------|
> | `screen/off` | ⚠️ Dims to 0% brightness | ✅ `lockNow()` | ✅ `GLOBAL_ACTION_LOCK_SCREEN` | ✅ `lockNow()` |
> | `screen/on` | Restores brightness | Wakes device | Wakes device | Wakes device |
> | `lock` | ❌ Error | ✅ Works | ✅ Works | ✅ Works |
> | `reboot` | ❌ Not available | ❌ Not available | ❌ Not available | ✅ Works |
> | Kiosk mode | ⚠️ User prompt | ⚠️ User prompt | ⚠️ User prompt | ✅ Silent |
> 
> **Understanding `"on"` vs `"screensaverActive"`:**  
> - `"on"` reports the **physical screen state** (PowerManager.isInteractive)
> - `"screensaverActive"` reports whether the **screensaver overlay** is showing
> - These are **independent**: screensaver can be active while screen is physically on
> 
> **FreeKiosk uses a 4-tier approach for screen off:**  
> 1. **Device Owner**: `DevicePolicyManager.lockNow()` — true screen off  
> 2. **Device Admin**: `DevicePolicyManager.lockNow()` — also works, no Device Owner needed  
> 3. **AccessibilityService (API 28+)**: `GLOBAL_ACTION_LOCK_SCREEN` — works without any admin privilege  
> 4. **Fallback**: Dims brightness to 0% (screen stays on but appears black)  
>
> This means FreeKiosk can coexist with an existing MDM that holds Device Owner — just activate Device Admin or the AccessibilityService and screen lock works fully.
> 
> To enable Device Owner mode, see [Installation Guide](installation.md#advanced-install-device-owner-mode).

#### `GET|POST /api/screensaver/on`
Enable the screensaver setting. The screensaver will activate automatically after the configured inactivity timeout.

#### `GET|POST /api/screensaver/off`
Disable the screensaver setting. The screensaver will no longer activate on inactivity. If the screensaver is currently active, it will be deactivated.

#### `GET|POST /api/reload`
Reload the current WebView page.

#### `POST /api/url`
Navigate to a new URL.
```json
{ "url": "https://example.com" }
```

#### `GET|POST /api/wake`
Wake from screensaver.

#### `POST /api/tts`
Text-to-speech. Uses Android native TextToSpeech engine (handled server-side, no JS bridge dependency).
```json
{ "text": "Hello World" }
```

**Parameters:**
- `text` (string, required): The text to speak
- `language` (string, optional): BCP 47 language tag (e.g. `"zh-CN"`, `"en-US"`, `"fr"`, `"ja"`, `"ko"`). If omitted, the language is **auto-detected** from the text content based on Unicode script analysis (CJK → Chinese, Hangul → Korean, Hiragana/Katakana → Japanese, Arabic script → Arabic, Thai → Thai, Devanagari → Hindi, Cyrillic → Russian, Latin → device default)

**Examples:**
```json
{ "text": "你好世界" }
{ "text": "Hello World", "language": "en-US" }
{ "text": "こんにちは", "language": "ja" }
```
> 💡 Language is auto-detected from text content when `language` is not specified. The appropriate TTS voice is selected before each utterance. Requires the target language TTS data to be installed on the Android device (check Android Settings → TTS).

#### `POST /api/volume`
Set media volume (0-100).
```json
{ "value": 50 }
```

#### `GET /api/volume`
Get current media volume.
```json
{
  "success": true,
  "data": { "level": 80, "maxLevel": 100 }
}
```

#### `POST /api/toast`
Show a toast notification.
```json
{ "text": "Message displayed!" }
```

#### `POST /api/js`
Execute JavaScript in WebView.
```json
{ "code": "alert('Hello!')" }
```

#### `GET|POST /api/clearCache`
Clear WebView cache, cookies, localStorage and reload. Performs a full native cache clear including:
- WebView cache (HTTP cache, images, scripts)
- Cookies (all domains)
- Web Storage (localStorage, sessionStorage)
- Form data

Then forces a full WebView remount.

#### `POST /api/app/launch`
Launch an external app.
```json
{ "package": "com.spotify.music" }
```

#### `GET|POST /api/reboot`
Reboot device (requires Device Owner mode). Executed natively without JS bridge dependency.

#### `GET|POST /api/lock`
Lock device screen. Uses `DevicePolicyManager.lockNow()` (Device Owner) or `GLOBAL_ACTION_LOCK_SCREEN` (AccessibilityService, API 28+) to truly turn off the screen.

> ⚠️ Without Device Owner or AccessibilityService, this endpoint returns an error. Use `/api/screen/off` as a fallback (dims to 0 brightness).

#### `GET|POST /api/restart-ui`
Restart the FreeKiosk app UI. Calls `activity.recreate()` to fully restart the React Native activity without rebooting the device. Useful for troubleshooting UI issues remotely.


### Audio Control (POST)

#### `POST /api/audio/play`
Play audio from URL.
```json
{
  "url": "https://example.com/sound.mp3",
  "loop": false,
  "volume": 50
}
```

#### `GET|POST /api/audio/stop`
Stop currently playing audio.

#### `GET|POST /api/audio/beep`
Play a short beep sound.


### Remote Control - Android TV (GET or POST)

Perfect for controlling Android TV devices or navigating apps.

> **How it works**: Remote key events are dispatched natively using the **AccessibilityService** (cross-app, works in external apps) or `activity.dispatchKeyEvent()` (fallback, FreeKiosk only). When the AccessibilityService is enabled:
> - Keys work across **all apps** (WebView, external apps, Android launcher)
> - D-pad navigation highlights UI elements (buttons, links, inputs)
> - Back, Home, and Recents trigger the corresponding system actions
>
> Without the AccessibilityService, keys only work within FreeKiosk's own Activity.

| Endpoint | Key |
|----------|-----|
| `GET\|POST /api/remote/up` | D-pad Up |
| `GET\|POST /api/remote/down` | D-pad Down |
| `GET\|POST /api/remote/left` | D-pad Left |
| `GET\|POST /api/remote/right` | D-pad Right |
| `GET\|POST /api/remote/select` | Select/Enter |
| `GET\|POST /api/remote/back` | Back |
| `GET\|POST /api/remote/home` | Home |
| `GET\|POST /api/remote/menu` | Menu |
| `GET\|POST /api/remote/playpause` | Play/Pause |

### Keyboard Emulation (GET or POST) ⌨️

Simulate keyboard input on the device. Three modes are available:

#### Single Key Press: `GET|POST /api/remote/keyboard/{key}`

Press a single keyboard key. The key name is in the URL path.

```bash
# Press letter 'a'
curl http://tablet-ip:8080/api/remote/keyboard/a

# Press Enter
curl http://tablet-ip:8080/api/remote/keyboard/enter

# Press F5 (refresh in most browsers)
curl http://tablet-ip:8080/api/remote/keyboard/f5

# Press Escape
curl http://tablet-ip:8080/api/remote/keyboard/escape

# Press Space
curl http://tablet-ip:8080/api/remote/keyboard/space
```

**Supported keys:**

| Category | Keys |
|----------|------|
| Letters | `a` through `z` |
| Digits | `0` through `9` |
| Function | `f1` through `f12` |
| Navigation | `up`, `down`, `left`, `right`, `home`, `end`, `pageup`, `pagedown` |
| Editing | `enter` / `return`, `space`, `tab`, `backspace`, `delete` / `del`, `insert`, `escape` / `esc` |
| Toggles | `capslock`, `numlock`, `scrolllock` |
| Modifiers | `shift`, `ctrl` / `control`, `alt`, `meta` / `win` / `cmd` |
| Media | `playpause`, `play`, `pause`, `stop`, `next` / `nexttrack`, `previous` / `prevtrack`, `volumeup`, `volumedown`, `mute` |
| Android | `back`, `menu`, `search`, `power`, `select` / `center`, `androidhome` |
| Symbols | `period` / `dot`, `comma`, `minus` / `dash`, `plus`, `equals`, `semicolon`, `apostrophe` / `quote`, `slash`, `backslash`, `leftbracket`, `rightbracket`, `grave` / `backtick`, `at`, `pound` / `hash`, `star` / `asterisk` |
| Single char | Any single character: `.`, `,`, `-`, `=`, `/`, `;`, `'`, etc. |

> 💡 **Note**: In the keyboard endpoint, `home` maps to the keyboard Home key (cursor to beginning of line), NOT the Android Home button. Use `androidhome` or `/api/remote/home` for the Android Home button.

#### Keyboard Shortcut: `GET|POST /api/remote/keyboard?map={combo}`

Send a keyboard shortcut with modifier keys. Format: `modifier1+modifier2+key`.

```bash
# Copy (Ctrl+C)
curl "http://tablet-ip:8080/api/remote/keyboard?map=ctrl+c"

# Paste (Ctrl+V)
curl "http://tablet-ip:8080/api/remote/keyboard?map=ctrl+v"

# Select All (Ctrl+A)
curl "http://tablet-ip:8080/api/remote/keyboard?map=ctrl+a"

# Close tab (Ctrl+W)
curl "http://tablet-ip:8080/api/remote/keyboard?map=ctrl+w"

# Alt+F4
curl "http://tablet-ip:8080/api/remote/keyboard?map=alt+f4"

# Ctrl+Shift+A (uppercase A with Ctrl)
curl "http://tablet-ip:8080/api/remote/keyboard?map=ctrl+shift+a"
```

**Supported modifiers:** `ctrl` / `control`, `alt`, `shift`, `meta` / `win` / `cmd`

Response:
```json
{
  "success": true,
  "data": {
    "executed": true,
    "command": "keyboardCombo",
    "map": "ctrl+c",
    "key": "c",
    "keyCode": 31,
    "modifiers": ["ctrl"],
    "metaState": 28672
  }
}
```

#### Type Text: `POST /api/remote/text`

Type a full text string into the currently focused input field.

```bash
curl -X POST http://tablet-ip:8080/api/remote/text \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello World!"}'
```

Response:
```json
{
  "success": true,
  "data": {
    "executed": true,
    "command": "keyboardText",
    "textLength": 12
  }
}
```

> #### Accessibility Service (recommended for External App mode)
>
> By default, keyboard emulation only works inside FreeKiosk's WebView. To inject keys into **external apps** (e.g., when using External App display mode), you need to enable the **FreeKiosk Accessibility Service**:
>
> 1. Go to **Settings → Advanced → Accessibility Service** and tap **"Open Accessibility Settings"**
> 2. In Android settings, find **FreeKiosk** under "Installed Services" and enable it
> 3. The status indicator in FreeKiosk settings will show **"● Active"** when ready
>
> **Device Owner shortcut**: If FreeKiosk is set as Device Owner, you can enable the service automatically without visiting Android settings — just tap **"Enable Automatically"** in Advanced Settings.
>
> **How it works**: When the Accessibility Service is active, FreeKiosk uses it for all keyboard injection (both WebView and external apps). When disabled, it falls back to `dispatchKeyEvent()` which only works within FreeKiosk's own Activity.
>
> **Privacy ROMs** (e/OS, LineageOS, CalyxOS, GrapheneOS): The Accessibility Service approach works on all ROMs, unlike the `Instrumentation` method which requires a signature-level permission that privacy ROMs block.
>
> #### 📊 Android Version Compatibility
>
> The injection method depends on the device's Android version:
>
> | Feature | Android 13+ (API 33+) | Android 5–12 (API 21–32) |
> |---|---|---|
> | **Back / Home / Recents** | ✅ `performGlobalAction()` | ✅ `performGlobalAction()` |
> | **DPAD navigation** (up, down, left, right) | ✅ `InputMethod.sendKeyEvent()` | ✅ Accessibility tree traversal + scroll |
> | **Select / Enter** (on UI elements) | ✅ `InputMethod.sendKeyEvent()` | ✅ `ACTION_CLICK` on focused element |
> | **Play/Pause** | ✅ `InputMethod.sendKeyEvent()` | ✅ `GLOBAL_ACTION_HEADSETHOOK` (API 31+) |
> | **Printable keys** (a-z, 0-9, symbols) | ✅ `InputMethod.sendKeyEvent()` | ✅ `ACTION_SET_TEXT` (appends char) |
> | **Backspace** | ✅ `InputMethod.sendKeyEvent()` | ✅ `ACTION_SET_TEXT` (removes last char) |
> | **Text input** | ✅ `InputMethod.commitText()` | ✅ `ACTION_SET_TEXT` (appends text) |
> | **Shift + letter** (e.g. Shift+A → 'A') | ✅ `InputMethod.sendKeyEvent()` | ✅ `ACTION_SET_TEXT` (shifted char) |
> | **Non-printable keys** (Tab, Escape, F1-F12) | ✅ `InputMethod.sendKeyEvent()` | ⚠️ Limited (`input keyevent` — requires root) |
> | **Ctrl/Alt combos** (Ctrl+C, Alt+F4) | ✅ `InputMethod.sendKeyEvent()` | ⚠️ Limited (meta state lost) |
>
> **Summary**: On Android 13+, everything works via InputMethod APIs. On Android 5–12, most remote control operations work: DPAD navigation via accessibility tree traversal, Select via `ACTION_CLICK`, Play/Pause via global action (API 31+), text/printable keys via `ACTION_SET_TEXT`. Only Tab, F-keys, and Ctrl/Alt shortcuts are limited.

### GPS Location (GET)

#### `GET /api/location`

Returns the device's last known GPS coordinates. Uses GPS, Network, and Passive location providers.

> ⚠️ **Requires**: Location permission granted + GPS enabled on the device.

```bash
curl http://tablet-ip:8080/api/location
```

Response:
```json
{
  "success": true,
  "data": {
    "executed": true,
    "command": "getLocation",
    "available": true,
    "latitude": 48.8566,
    "longitude": 2.3522,
    "accuracy": 15.0,
    "altitude": 35.0,
    "speed": 0.0,
    "bearing": 0.0,
    "provider": "gps",
    "time": 1704672000000,
    "providers": ["gps", "network", "passive"]
  }
}
```

If no location is available:
```json
{
  "success": true,
  "data": {
    "executed": true,
    "command": "getLocation",
    "available": false,
    "error": "No location available. Ensure GPS is enabled and location permission is granted.",
    "providers": ["network", "passive"]
  }
}
```


## Authentication

If an API key is configured, include it in requests:

```bash
curl -H "X-Api-Key: your-api-key" http://tablet-ip:8080/api/status
```


## Home Assistant Integration

### Basic Sensors

```yaml
# configuration.yaml

rest:
  - resource: http://TABLET_IP:8080/api/status
    scan_interval: 30
    sensor:
      - name: "Tablet Battery"
        value_template: "{{ value_json.data.battery.level }}"
        unit_of_measurement: "%"
        device_class: battery
      
      - name: "Tablet Brightness"
        value_template: "{{ value_json.data.screen.brightness }}"
        unit_of_measurement: "%"
      
      - name: "Tablet Light Sensor"
        value_template: "{{ value_json.data.sensors.light | round(0) }}"
        unit_of_measurement: "lx"
        device_class: illuminance
      
      - name: "Tablet WiFi Signal"
        value_template: "{{ value_json.data.wifi.rssi }}"
        unit_of_measurement: "dBm"
        device_class: signal_strength

    binary_sensor:
      - name: "Tablet Screen"
        value_template: "{{ value_json.data.screen.on }}"
        device_class: power
      
      - name: "Tablet Charging"
        value_template: "{{ value_json.data.battery.charging }}"
        device_class: battery_charging
      
      - name: "Tablet Screensaver"
        value_template: "{{ value_json.data.screen.screensaverActive }}"

  - resource: http://TABLET_IP:8080/api/location
    scan_interval: 300
    sensor:
      - name: "Tablet GPS Latitude"
        value_template: "{{ value_json.data.latitude | default('unavailable') }}"
      
      - name: "Tablet GPS Longitude"
        value_template: "{{ value_json.data.longitude | default('unavailable') }}"
      
      - name: "Tablet GPS Accuracy"
        value_template: "{{ value_json.data.accuracy | default('unavailable') }}"
        unit_of_measurement: "m"

  - resource: http://TABLET_IP:8080/api/battery
    scan_interval: 60
    sensor:
      - name: "Tablet Battery Temperature"
        value_template: "{{ value_json.data.temperature }}"
        unit_of_measurement: "°C"
        device_class: temperature
      
      - name: "Tablet Battery Health"
        value_template: "{{ value_json.data.health }}"
```

### REST Commands

```yaml
rest_command:
  tablet_screen_on:
    url: http://TABLET_IP:8080/api/screen/on
    method: POST
  
  tablet_screen_off:
    url: http://TABLET_IP:8080/api/screen/off
    method: POST
  
  tablet_brightness:
    url: http://TABLET_IP:8080/api/brightness
    method: POST
    content_type: "application/json"
    payload: '{"value": {{ brightness }}}'
  
  tablet_navigate:
    url: http://TABLET_IP:8080/api/url
    method: POST
    content_type: "application/json"
    payload: '{"url": "{{ url }}"}'
  
  tablet_reload:
    url: http://TABLET_IP:8080/api/reload
    method: POST
  
  tablet_lock:
    url: http://TABLET_IP:8080/api/lock
    method: POST
  
  tablet_restart_ui:
    url: http://TABLET_IP:8080/api/restart-ui
    method: POST
  
  tablet_tts:
    url: http://TABLET_IP:8080/api/tts
    method: POST
    content_type: "application/json"
    payload: '{"text": "{{ message }}", "language": "{{ language | default(\'\') }}"}'
  
  tablet_volume:
    url: http://TABLET_IP:8080/api/volume
    method: POST
    content_type: "application/json"
    payload: '{"value": {{ volume }}}'
  
  tablet_beep:
    url: http://TABLET_IP:8080/api/audio/beep
    method: POST
  
  tablet_toast:
    url: http://TABLET_IP:8080/api/toast
    method: POST
    content_type: "application/json"
    payload: '{"text": "{{ message }}"}'
  
  tablet_screensaver_on:
    url: http://TABLET_IP:8080/api/screensaver/on
    method: POST
  
  tablet_screensaver_off:
    url: http://TABLET_IP:8080/api/screensaver/off
    method: POST
  
  tablet_keyboard_key:
    url: "http://TABLET_IP:8080/api/remote/keyboard/{{ key }}"
    method: GET
  
  tablet_keyboard_combo:
    url: "http://TABLET_IP:8080/api/remote/keyboard?map={{ combo }}"
    method: GET
  
  tablet_type_text:
    url: http://TABLET_IP:8080/api/remote/text
    method: POST
    content_type: "application/json"
    payload: '{"text": "{{ text }}"}'
```

### Screenshot Camera

```yaml
camera:
  - platform: generic
    name: "Tablet Screenshot"
    still_image_url: http://TABLET_IP:8080/api/screenshot
    content_type: image/png
```

### Device Camera (Photo)

```yaml
camera:
  - platform: generic
    name: "Tablet Camera (Back)"
    still_image_url: http://TABLET_IP:8080/api/camera/photo?camera=back&quality=80
    content_type: image/jpeg

  - platform: generic
    name: "Tablet Camera (Front)"
    still_image_url: http://TABLET_IP:8080/api/camera/photo?camera=front&quality=80
    content_type: image/jpeg
```

> 💡 **Tip**: Use the front camera as a basic security camera, or the back camera for monitoring. Combine with automations to capture photos on motion detection events.

### Example Automations

#### Auto-brightness based on room light
```yaml
automation:
  - alias: "Tablet Auto Brightness"
    trigger:
      - platform: state
        entity_id: sensor.living_room_light_level
    action:
      - service: rest_command.tablet_brightness
        data:
          brightness: "{{ (states('sensor.living_room_light_level') | float / 10) | int | min(100) }}"
```

#### Turn off screen at night
```yaml
automation:
  - alias: "Tablet Screen Off at Night"
    trigger:
      - platform: time
        at: "23:00:00"
    action:
      - service: rest_command.tablet_screensaver_on
```

#### Wake tablet on motion
```yaml
automation:
  - alias: "Wake Tablet on Motion"
    trigger:
      - platform: state
        entity_id: binary_sensor.living_room_motion
        to: "on"
    condition:
      - condition: state
        entity_id: binary_sensor.tablet_screensaver
        state: "on"
    action:
      - service: rest_command.tablet_screensaver_off
```

#### Doorbell notification
```yaml
automation:
  - alias: "Doorbell Alert on Tablet"
    trigger:
      - platform: state
        entity_id: binary_sensor.doorbell
        to: "on"
    action:
      - service: rest_command.tablet_beep
      - service: rest_command.tablet_toast
        data:
          message: "Someone is at the door!"
      - service: rest_command.tablet_navigate
        data:
          url: "http://homeassistant:8123/lovelace/cameras"
```


## Testing with cURL

```bash
# Get status
curl http://TABLET_IP:8080/api/status

# Set brightness
curl -X POST -H "Content-Type: application/json" \
  -d '{"value": 50}' http://TABLET_IP:8080/api/brightness

# Play beep
curl -X POST http://TABLET_IP:8080/api/audio/beep

# Save screenshot
curl http://TABLET_IP:8080/api/screenshot -o screenshot.png

# Show toast
curl -X POST -H "Content-Type: application/json" \
  -d '{"text": "Hello!"}' http://TABLET_IP:8080/api/toast

# Keyboard: press Enter
curl http://TABLET_IP:8080/api/remote/keyboard/enter

# Keyboard: Ctrl+A (select all)
curl "http://TABLET_IP:8080/api/remote/keyboard?map=ctrl+a"

# Type text into focused field
curl -X POST -H "Content-Type: application/json" \
  -d '{"text": "Hello World!"}' http://TABLET_IP:8080/api/remote/text

# Get GPS location
curl http://TABLET_IP:8080/api/location
```


## Error Responses

```json
{
  "success": false,
  "error": "Error message",
  "timestamp": 1704672000
}
```

Common errors:
- `401 Unauthorized` - Invalid or missing API key
- `403 Forbidden` - Control commands disabled
- `404 Not Found` - Unknown endpoint
- `500 Internal Error` - Server error


## See Also

- [ADB Configuration Guide](ADB-Configuration) - Headless provisioning via ADB
- [MDM Specification](MDM-SPEC) - Enterprise deployment
- [Installation Guide](Installation) - Manual setup


## Changelog

### v1.2.0
- Initial REST API release
- 40+ endpoints for full device control
- Home Assistant integration ready
- Sensors: battery, brightness, light, proximity, storage, memory, WiFi
- Controls: screen, brightness, volume, audio, navigation, remote
- Screenshot capture
- Audio playback (URL, beep)
