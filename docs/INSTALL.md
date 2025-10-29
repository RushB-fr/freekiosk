# FreeKiosk Installation Guide

Complete guide to install and configure FreeKiosk on your Android tablet.

---

## Table of Contents

- [Quick Install (Basic Mode)](#quick-install-basic-mode)
- [Advanced Install (Device Owner Mode)](#advanced-install-device-owner-mode)
- [Troubleshooting](#troubleshooting)
- [Uninstall](#uninstall)

---

## Quick Install (Basic Mode)

### Requirements
- Android tablet 8.0+
- APK file from [Releases](https://github.com/rushb/freekiosk/releases)

### Steps

1. **Download APK**
   - Go to [Releases](https://github.com/rushb/freekiosk/releases)
   - Download `FreeKiosk-v1.0.0.apk`

2. **Install**
   - Transfer APK to tablet (USB, email, download)
   - Open APK file
   - Allow "Install from unknown sources" if asked
   - Install

3. **Configure**
   - Open FreeKiosk
   - Tap 5 times in bottom-right corner
   - Enter settings
   - Set your URL
   - Set PIN code

4. **Start Kiosk Mode**
   - Tap "Start Kiosk Mode"
   - Done!

⚠️ **Note**: Basic mode allows some system interactions (notifications, back button in some cases).

---

## Advanced Install (Device Owner Mode)

For **complete lockdown** with no system interruptions.

### Requirements
- Android 8.0+ tablet
- Windows/Mac/Linux PC
- USB cable
- ADB tool (15 MB)

### Step 1: Install ADB

Choose your operating system:

#### 🪟 Windows

1. Download [SDK Platform Tools](https://dl.google.com/android/repository/platform-tools-latest-windows.zip) (15 MB)
2. Extract to `C:\platform-tools\`
3. Done!

#### 🍎 Mac

**Option A: Homebrew** (recommended)
brew install android-platform-tools

text

**Option B: Manual**
1. Download [SDK Platform Tools](https://dl.google.com/android/repository/platform-tools-latest-darwin.zip)
2. Extract and add to PATH

#### 🐧 Linux

**Ubuntu/Debian:**
sudo apt install adb

text

**Fedora:**
sudo dnf install android-tools

text

---

### Step 2: Prepare Tablet

#### 1. Factory Reset

- Go to Settings → System → Reset
- Select "Factory data reset"
- Confirm

⚠️ **CRITICAL**: After reset, **DO NOT add a Google account**. Device Owner cannot be activated if any accounts exist on the device.

#### 2. Enable USB Debugging

- Settings → About tablet
- Tap "Build number" **7 times** (Developer mode enabled)
- Go back → Settings → System → Developer options
- Enable **"USB debugging"**

#### 3. Install FreeKiosk

- Transfer APK to tablet
- Install the APK
- Do NOT open yet

---

### Step 3: Activate Device Owner

#### 1. Connect Tablet to PC

- Use USB cable
- Tablet will show "Allow USB debugging?" popup
- Check "Always allow from this computer"
- Tap "Allow"

#### 2. Verify Connection

**Windows:**
cd C:\platform-tools
adb devices

text

**Mac/Linux:**
adb devices

text

You should see:
List of devices attached
ABC123XYZ device

text

If you see "unauthorized" → Check tablet screen for popup

#### 3. Set Device Owner

**Run this command:**
adb shell dpm set-device-owner com.freekiosk/.DeviceAdminReceiver

text

**Expected output:**
Success: Device owner set to package com.freekiosk
Active admin set to component {com.freekiosk/com.freekiosk.DeviceAdminReceiver}

text

✅ **Success!** Your tablet is now in Device Owner mode.

#### 4. Reboot (optional)

adb reboot

text

---

### Step 4: Launch FreeKiosk

1. Open FreeKiosk app
2. Configure URL and PIN
3. Start kiosk mode
4. Done! Complete lockdown active.

---

## What's the Difference?

| Feature | Basic Mode | Device Owner Mode |
|---------|-----------|-------------------|
| Kiosk lockdown | Partial | Complete |
| System notifications | Visible | Blocked |
| Status bar | May appear | Hidden |
| Navigation buttons | Accessible | Disabled |
| Home button | May work | Disabled |
| Recent apps | Accessible | Disabled |
| Samsung popups | Can appear | Blocked |
| Exit without PIN | Possible (long press) | Impossible |
| Auto-start on boot | Yes | Yes |
| **Recommended for** | Testing, personal use | Production, public displays |

---

## Troubleshooting

### "adb: command not found" (Windows)

**Cause**: Not in platform-tools directory

**Solution**:
cd C:\platform-tools
adb devices

text

### "Not allowed to set the device owner"

**Cause**: Google account exists on device

**Solution**:
1. Factory reset tablet
2. **DO NOT** add Google account after reset
3. Try Device Owner command again

### "No devices/emulators found"

**Causes**:
- USB cable not connected
- USB debugging not enabled
- Driver issues (Windows)

**Solutions**:
1. Check USB cable is connected
2. Verify USB debugging is enabled
3. Check tablet screen for "Allow USB debugging?" popup
4. Run `adb devices` to verify connection
5. **Windows**: Install [USB drivers](https://developer.android.com/studio/run/oem-usb)

### Tablet not recognized (Windows)

**Solution**: Install manufacturer's USB drivers
- Samsung: [Samsung USB Driver](https://developer.samsung.com/android-usb-driver)
- Other brands: Search "[Brand] USB driver for Windows"

### "Error: Not enough permissions" (Linux)

**Solution**:
sudo adb kill-server
sudo adb start-server
adb devices

text

Or configure udev rules (permanent fix):
sudo nano /etc/udev/rules.d/51-android.rules

Add: SUBSYSTEM=="usb", ATTR{idVendor}=="[vendor_id]", MODE="0666", GROUP="plugdev"
sudo udevadm control --reload-rules

text

### Device Owner set but kiosk doesn't lock completely

**Solution**:
1. Reboot tablet
2. Open FreeKiosk
3. Go to Settings (5 taps bottom-right)
4. Tap "Exit Kiosk Mode" then "Start Kiosk Mode" again

---

## Remove Device Owner

### Option 1: Via FreeKiosk App

1. Tap 5 times in bottom-right corner
2. Enter your PIN
3. Tap "Exit Kiosk Mode"
4. Device Owner is automatically removed

### Option 2: Via ADB

adb shell dpm remove-active-admin com.freekiosk/.DeviceAdminReceiver

text

---

## Uninstall

### If Device Owner is Active

1. Remove Device Owner first (see above)
2. Then uninstall normally

### Standard Uninstall

- Settings → Apps → FreeKiosk → Uninstall

---

## FAQ

**Q: Do I need to root my tablet?**  
A: No! FreeKiosk uses Android's official Device Owner API (no root required).

**Q: Can I use FreeKiosk without Device Owner?**  
A: Yes! Basic mode works without Device Owner, but lockdown is not complete.

**Q: Does Device Owner void my warranty?**  
A: No. Device Owner is an official Android feature. No modifications are made to the system.

**Q: Can I have multiple apps in Device Owner mode?**  
A: No. Android allows only ONE Device Owner per device. FreeKiosk must be the only one.

**Q: Can I still use my tablet normally after removing Device Owner?**  
A: Yes! Just exit kiosk mode and uninstall. Your tablet returns to normal state.

**Q: Does it work on Fire tablets (Amazon)?**  
A: Should work, but not officially tested. Device Owner setup may differ.

---

## Video Tutorial

🎥 Coming soon! Subscribe to [Rushb YouTube](https://youtube.com/@rushb) for updates.

---

## Need Help?

- 📖 Check [FAQ](FAQ.md)
- 💬 Open a [Discussion](https://github.com/rushb/freekiosk/discussions)
- 🐛 Report a [Bug](https://github.com/rushb/freekiosk/issues)
- 📧 Email: support@freekiosk.app

---

**Made with ❤️ by [Rushb](https://rushb.io)**