# FreeKiosk - Frequently Asked Questions

---

## Installation

### Q: Do I need to root my tablet?
**A:** No! FreeKiosk uses Android's official Device Owner API. No root required.

### Q: Do I need Android Studio?
**A:** No! Just ADB tool (15 MB download). See [Installation Guide](INSTALL.md).

### Q: Can I install from Play Store?
**A:** Yes! Search "FreeKiosk" on Google Play Store, or download APK from [Releases](https://github.com/rushb-fr/freekiosk/releases).

### Q: Which Android versions are supported?
**A:** Android 8.0+ (API 26 and above).

---

## Device Owner

### Q: What is Device Owner mode?
**A:** Device Owner is Android's official enterprise feature that gives FreeKiosk complete control over the device for full kiosk lockdown. It's like MDM (Mobile Device Management) but built into Android.

### Q: Is Device Owner required?
**A:** No, but **highly recommended** for production use. Without Device Owner, kiosk lockdown is partial (users may exit with back button, see notifications, etc.).

### Q: Can I activate Device Owner after installing FreeKiosk?
**A:** No. Device Owner must be set up on a factory-reset device with no Google accounts. You must factory reset first.

### Q: Factory reset required?
**A:** Yes, for Device Owner activation. This is an Android limitation, not FreeKiosk's.

### Q: Can I remove Device Owner?
**A:** Yes! In FreeKiosk settings, use the "⚠️ Remove Device Owner" button (NOT "Exit Kiosk Mode"). Or via ADB:
adb shell dpm remove-active-admin com.freekiosk/.DeviceAdminReceiver

text

### Q: Does Device Owner void warranty?
**A:** No. Device Owner is an official Android feature with no system modifications.

---

## Usage

### Q: How to access settings in kiosk mode?
**A:** Tap 5 times on the secret button (default: bottom-right corner), then enter your PIN code.

### Q: Can I use custom URLs?
**A:** Yes! Any HTTPS/HTTP URL works (Home Assistant, dashboards, websites, web apps, etc.).

### Q: Does it work with Home Assistant?
**A:** Perfectly! Many users deploy FreeKiosk for Home Assistant dashboards.

### Q: Can I display local HTML files?
**A:** Currently only HTTP/HTTPS URLs. Local file support coming in v1.1.

### Q: How do I change the URL?
**A:** Tap 5 times bottom-right → Enter PIN → Settings → Change URL.

### Q: I forgot my PIN code. What do I do?
**A:** If Device Owner is active: You'll need to factory reset (or use ADB to remove Device Owner first). This is by design for security.

### Q: Can I rotate between multiple URLs?
**A:** Not yet, but planned for v1.1! You can use a single URL pointing to a page that rotates content.

---

## Compatibility

### Q: Which tablets are supported?
**A:** Any Android 8.0+ tablet. Tested on:
- Samsung Galaxy Tab A8, A9+, S6 Lite
- Lenovo Tab M10, M11
- Xiaomi Redmi Pad SE
- Generic Android tablets

### Q: Does it work on Samsung tablets?
**A:** Yes! Device Owner mode specifically blocks Samsung update popups and bloatware.

### Q: Does it work on Fire tablets (Amazon)?
**A:** Should work, but not officially tested. Device Owner setup may differ on Fire OS.

### Q: Does it work on smartphones?
**A:** Technically yes, but FreeKiosk is optimized for tablets. Phone screens are small for kiosk displays.

### Q: Does it work on Chromebooks?
**A:** No. FreeKiosk is Android-only.

---

## Troubleshooting

### Q: Kiosk mode doesn't lock completely
**A:** Make sure Device Owner is activated. Without Device Owner, lockdown is partial. See [Installation Guide](INSTALL.md#advanced-install-device-owner-mode).

### Q: System notifications still appear
**A:** Device Owner mode blocks all notifications. If they still appear:
1. Verify Device Owner is active: `adb shell dpm list-owners`
2. Reboot tablet
3. Restart kiosk mode

### Q: Samsung update popup appears
**A:** Device Owner mode should block Samsung popups. If they still appear, try:
1. Suspend Samsung system apps in FreeKiosk settings (coming in v1.1)
2. Verify Device Owner: `adb shell dpm list-owners`

### Q: WebView doesn't load my URL
**Causes**:
- URL is not HTTPS/HTTP
- No internet connection
- Self-signed SSL certificate (not trusted)

**Solutions**:
- Use valid HTTPS URL
- Check WiFi connection
- Use trusted SSL certificate

### Q: App crashes on start
**A:** Please report a bug with:
- Device model
- Android version
- Crash logs (if possible)

### Q: FreeKiosk doesn't auto-start after hard restart
**A:** A hard restart (holding power + volume buttons for 10s) may reset the app to initial state. Make sure "Launch on Boot" is enabled in Settings → Security tab. Starting from v1.3.0, the app checks the stored setting before launching, ensuring consistent behavior.

### Q: Power button doesn't work in kiosk mode
**A:** By default, Lock Mode blocks all system features including the power menu. Starting from v1.3.0, you can enable "Allow Power Button" in Settings → Security tab → Lock Mode section. This allows shutting down the device without exiting kiosk mode.

### Q: Are my settings preserved after updating FreeKiosk?
**A:** **Yes!** All your settings (URL, PIN, display mode, etc.) are stored locally on your device and are preserved when updating FreeKiosk. You don't need to reconfigure anything after an update.

---

## Features

### Q: Can I customize the PIN length?
**A:** Not yet, but planned. Current: 4-6 digits.

### Q: Can I hide the "Exit Kiosk Mode" button?
**A:** Not yet, but planned for v1.1 (configurable in settings).

### Q: Can I schedule kiosk mode on/off?
**A:** Not yet, planned for v1.2.

### Q: Does FreeKiosk collect data?
**A:** **No!** FreeKiosk is 100% offline. No analytics, no tracking, no data collection. Your privacy is respected.

### Q: Can I use FreeKiosk offline?
**A:** Yes! Once configured, FreeKiosk works offline (your URL must be accessible offline too).

---

## Comparison

### Q: FreeKiosk vs Fully Kiosk Browser?
| Feature | FreeKiosk | Fully Kiosk |
|---------|-----------|-------------|
| Price | Free | €7.90/device |
| Open-source | Yes (MIT) | No |
| Device Owner | Yes | Yes |
| Basic kiosk | Yes | Yes |
| Advanced features | Roadmap | Yes |
| Support | Community | Commercial |

### Q: Why is Fully Kiosk more expensive?
**A:** Fully Kiosk is a mature commercial product with many advanced features. FreeKiosk is new and community-driven. We're catching up! 🚀

### Q: Will FreeKiosk always be free?
**A:** Yes! The app will always be 100% free and open-source. We may offer optional paid cloud services (FreeKiosk Cloud) in the future, but the core app stays free forever.

---

## Development

### Q: Can I contribute?
**A:** Absolutely! See [Contributing Guide](../CONTRIBUTING.md).

### Q: Is FreeKiosk really open-source?
**A:** Yes! MIT licensed. View source on [GitHub](https://github.com/rushb/freekiosk).

### Q: Who develops FreeKiosk?
**A:** FreeKiosk is developed by [Rushb](https://rushb.io), a French tech company passionate about open-source.

### Q: Can I self-host FreeKiosk?
**A:** The app is self-contained (no server needed). Future cloud features will offer self-hosting options.

---

## Roadmap

### Q: What's coming in v1.1?
- Multi-language support (FR, DE, ES)
- Multiple URL rotation
- Motion detection
- Auto-brightness scheduling

### Q: What about v2.0?
- FreeKiosk Cloud (MDM Dashboard)
- Remote configuration
- Multi-device management
- Analytics

See full [Roadmap](../README.md#-roadmap).

---

## Support

### Q: Where can I get help?
- 📖 Read [Installation Guide](INSTALL.md)
- 💬 [GitHub Discussions](https://github.com/rushb/freekiosk/discussions)
- 🐛 [Report Bug](https://github.com/rushb/freekiosk/issues)
- 📧 Email: support@freekiosk.app

### Q: How can I support FreeKiosk?
- ⭐ Star on [GitHub](https://github.com/rushb/freekiosk)
- 💬 Spread the word
- 🐛 Report bugs
- 🔧 Contribute code
- ☕ [Buy us a coffee](https://ko-fi.com/rushb) (coming soon)

---

**Didn't find your answer? Ask in [Discussions](https://github.com/rushb/freekiosk/discussions)!**

---

**Made with ❤️ by [Rushb](https://rushb.io)**