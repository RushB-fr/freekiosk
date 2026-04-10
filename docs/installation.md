# Installation Guide

**Complete setup from basic mode to full Device Owner lockdown**

[Docs Home](README) • [Features](Features-and-Modes) • [ADB Config](ADB-Configuration)


> [!TIP]
> For production deployments or public-facing tablets, go directly to [Device Owner Mode](#device-owner-mode-advanced).

## Table of Contents

- [Basic Mode (No PC Required)](#basic-mode-no-pc-required)
- [Device Owner Mode (Advanced)](#device-owner-mode-advanced)
- [What's the Difference?](#whats-the-difference)
- [Troubleshooting](#troubleshooting)
- [Removing Device Owner](#removing-device-owner)
- [Uninstall](#uninstall)


## Basic Mode (No PC Required)

**Perfect for:** Testing, personal use, or when you don't have a PC available.

### Requirements

- Android tablet (version 8.0+)
- APK file from [Releases](https://github.com/rushb-fr/freekiosk/releases)
- PIN code (4-6 digits)

### Installation Steps

**1. Download APK**
- Visit [GitHub Releases](https://github.com/rushb-fr/freekiosk/releases)
- Download the latest `FreeKiosk-vX.X.X.apk`
- Transfer to tablet (USB, email, or direct download)

**2. Install**
- Open the APK file on your tablet
- Allow "Install from unknown sources" if prompted
- Complete installation

**3. Configure**
- Open FreeKiosk app
- Tap **5 times** on the secret button (bottom-right corner)
- Enter your PIN code
- Set your target URL or app
- Configure additional settings as needed

**4. Start Kiosk Mode**
- Tap "Start Kiosk Mode"
- Your tablet is now locked in basic kiosk mode!

> [!WARNING]
> Basic mode allows some system interactions (notifications, back button). For complete lockdown, use Device Owner mode below.


## Device Owner Mode (Advanced)

**Perfect for:** Production deployments, public displays, corporate kiosks, complete lockdown.

### Requirements

- Android tablet (version 8.0+)
- Computer (Windows, Mac, or Linux)
- USB cable
- ADB tool (Android Debug Bridge)

### Step 1: Install ADB

#### Windows

1. Download [SDK Platform Tools](https://dl.google.com/android/repository/platform-tools-latest-windows.zip) (~15 MB)
2. Extract to `C:\platform-tools\`
3. Open Command Prompt in that directory

#### Mac

**Option A: Homebrew** (recommended)
```bash
brew install android-platform-tools
```

**Option B: Manual**
1. Download [SDK Platform Tools](https://dl.google.com/android/repository/platform-tools-latest-darwin.zip)
2. Extract and add to PATH

#### Linux

**Ubuntu/Debian:**
```bash
sudo apt install adb
```

**Fedora:**
```bash
sudo dnf install android-tools
```
### Step 2: Prepare Tablet

#### 1. Remove All Accounts

Device Owner requires **no active user accounts**. A factory reset is **not required**.

**Remove these accounts:**
- Google accounts (Settings → Accounts → Google → Remove)
- Samsung accounts (Settings → Accounts → Samsung → Remove)
- Work/Microsoft 365 accounts
- SIM card (remove or disable SIM profile)

**Verify:** Settings → Accounts should show "No accounts"

> [!IMPORTANT]
> You can sign back in **after** Device Owner is activated.

> [!NOTE]
> **Fallback:** If the `dpm` command fails after removing accounts, perform a factory reset (Settings → System → Reset → Factory data reset). Do **not** add any account before activating Device Owner.

#### 2. Enable USB Debugging

1. **Enable Developer Mode:** Settings → About tablet → Tap "Build number" 7 times
2. **Enable USB Debugging:** Settings → System → Developer options → Enable "USB debugging"

#### 3. Install FreeKiosk

1. Transfer APK to tablet
2. Install the APK
3. **Do NOT open yet** - wait for Device Owner activation
### Step 3: Activate Device Owner

#### 1. Connect Tablet to PC

- Connect tablet to PC via USB cable
- On tablet, check "Always allow from this computer"
- Tap "Allow" on the USB debugging popup

#### 2. Verify Connection

**Windows:**
```bash
cd C:\platform-tools
adb devices
```

**Mac/Linux:**
```bash
adb devices
```

**Expected output:**
```
List of devices attached
ABC123XYZ    device
```

> [!NOTE]
> If you see "unauthorized", check the tablet screen for the authorization popup.

#### 3. Set Device Owner

Run this command:

```bash
adb shell dpm set-device-owner com.freekiosk/.DeviceAdminReceiver
```

**Expected output:**
```
Success: Device owner set to package com.freekiosk
Active admin set to component {com.freekiosk/com.freekiosk.DeviceAdminReceiver}
```

> [!TIP]
> **Success!** Your tablet is now in Device Owner mode.

#### 4. Reboot (Optional)

```bash
adb reboot
```

### Step 4: Configure and Launch

1. Open FreeKiosk from the app drawer
2. Configure URL/app and PIN in settings
3. Tap "Start Kiosk Mode"
4. Full lockdown is now active!


## What's the Difference?

| Feature | Basic Mode | Device Owner Mode |
|---------|:----------:|:-----------------:|
| **Kiosk Lockdown** | Partial | Complete |
| **System Notifications** | Visible | Blocked |
| **Status Bar** | May appear | Hidden |
| **Navigation Buttons** | Accessible | Disabled |
| **Home Button** | May work | Disabled |
| **Recent Apps** | Accessible | Disabled |
| **Samsung Popups** | Can appear | Blocked |
| **Exit Without PIN** | Possible | Impossible |
| **Auto-start on Boot** | Yes | Yes |
| **Recommended For** | Testing, personal | Production, public |


## Troubleshooting

### "adb: command not found" (Windows)

**Cause:** Not in the platform-tools directory

**Solution:**
```bash
cd C:\platform-tools
adb devices
```

### "Not allowed to set the device owner"

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| User accounts exist | Remove ALL accounts (Google, Samsung, Microsoft) |
| Hidden SIM account | Remove SIM card or disable SIM profile |
| Device-specific accounts | Factory reset and try again (no accounts added) |

### "No devices/emulators found"

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| USB not connected | Check USB cable connection |
| USB debugging disabled | Enable in Developer Options |
| Driver issues (Windows) | Install [USB drivers](https://developer.android.com/studio/run/oem-usb) |
| Popup not accepted | Check tablet for "Allow USB debugging" popup |

### Tablet Not Recognized (Windows)

Install manufacturer USB drivers:

- **Samsung:** [Samsung USB Driver](https://developer.samsung.com/android-usb-driver)
- **Other brands:** Search "[Brand] USB driver for Windows"

### "Error: Not enough permissions" (Linux)

**Quick fix:**
```bash
sudo adb kill-server
sudo adb start-server
adb devices
```

**Permanent fix:**
```bash
sudo nano /etc/udev/rules.d/51-android.rules
```
Add: `SUBSYSTEM=="usb", ATTR{idVendor}=="[vendor_id]", MODE="0666", GROUP="plugdev"`
```bash
sudo udevadm control --reload-rules
```

### Device Owner Set But Kiosk Doesn't Lock Completely

1. Reboot the tablet
2. Exit and restart kiosk mode
3. Verify Device Owner is active


## Removing Device Owner

### Option 1: Via FreeKiosk App

1. Tap 5 times on secret button (bottom-right)
2. Enter your PIN code
3. Tap "⚠️ Remove Device Owner" button
4. Confirm the action
5. Device Owner removed and settings reset

> [!WARNING]
> "Exit Kiosk Mode" only closes the app but keeps Device Owner active. Use "Remove Device Owner" to completely disable it.

### Option 2: Via ADB

```bash
adb shell dpm remove-active-admin com.freekiosk/.DeviceAdminReceiver
```


## Uninstall

### If Device Owner is Active

1. Remove Device Owner (see above)
2. Uninstall app normally

### Standard Uninstall

Settings → Apps → FreeKiosk → Uninstall


## Quick FAQ

**Do I need to root my tablet?**
No! FreeKiosk uses Android's official Device Owner API.

**Can I use FreeKiosk without Device Owner?**
Yes! Basic mode works, but lockdown is not complete.

**Does Device Owner void my warranty?**
No. It's an official Android feature with no system modifications.

**Can I have multiple Device Owner apps?**
No. Android allows only ONE Device Owner per device.

**Can I use my tablet normally after removing Device Owner?**
Yes! Just remove Device Owner and uninstall.

**Does it work on Fire tablets (Amazon)?**
Should work, but not officially tested.


## Need Help?

- **FAQ:** [Complete FAQ](FAQ)
- **Community:** [GitHub Discussions](https://github.com/rushb-fr/freekiosk/discussions)
- **Bug Reports:** [GitHub Issues](https://github.com/rushb-fr/freekiosk/issues)
- **Email:** support@freekiosk.app
