# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**FreeKiosk** is an open-source Android kiosk application built with React Native 0.82.0 and TypeScript. It displays web content in fullscreen kiosk mode with optional Device Owner lockdown capabilities. The app is designed for unattended tablets (dashboards, digital signage, information kiosks).

**Key Technologies:**
- React Native 0.82.0 with New Architecture
- TypeScript 5.8.3
- Native Android modules in Kotlin
- React Navigation for screen management
- AsyncStorage for settings persistence
- WebView with custom SSL certificate handling

## Development Commands

### Setup
```bash
# Install dependencies
npm install

# Clean Android build
cd android && ./gradlew clean && cd ..

# Apply patches (required after npm install)
npm run postinstall
```

### Running
```bash
# Start Metro bundler
npm start

# Run on Android device/emulator
npm run android

# Run on iOS (not fully supported)
npm run ios
```

### Code Quality
```bash
# Lint code
npm run lint

# Run tests
npm run test
```

### Building Release APK
```bash
cd android
./gradlew assembleRelease

# APK output: android/app/build/outputs/apk/release/app-release.apk
```

### Device Owner Setup (for testing full kiosk mode)
```bash
# Factory reset device first, then install APK
adb install android/app/build/outputs/apk/release/app-release.apk

# Set as Device Owner (device must have NO Google account)
adb shell dpm set-device-owner com.freekiosk/.DeviceAdminReceiver

# Remove Device Owner (requires factory reset after)
adb shell dpm remove-active-admin com.freekiosk/.DeviceAdminReceiver
```

## Architecture

### React Native Layer

**Navigation Structure** (React Navigation Native Stack):
- `KioskScreen` (initial) - Main fullscreen WebView display
- `PinScreen` - PIN entry gateway to settings
- `SettingsScreen` - Configuration interface

**Access Flow:**
1. User taps 5 times on secret button (position configurable, default bottom-right)
2. Navigates to PinScreen
3. On correct PIN, navigates to SettingsScreen
4. Settings saved → returns to KioskScreen

**State Management:**
- No global state library (Redux/MobX)
- Settings persisted via AsyncStorage (StorageService utility)
- Component-level state with React hooks
- Settings loaded on screen focus using navigation listeners

### Native Android Layer

**Key Native Modules** (exposed to React Native):

1. **KioskModule** (`android/app/src/main/java/com/freekiosk/KioskModule.kt`)
   - `startLockTask()` - Activates lock task mode (full lockdown if Device Owner)
   - `stopLockTask()` - Deactivates lock task mode
   - `exitKioskMode()` - Closes app and disables restrictions
   - `enableAutoLaunch()` / `disableAutoLaunch()` - Toggles boot receiver
   - `isInLockTaskMode()` - Checks current lock state
   - `getLockTaskModeState()` - Returns detailed lock state

2. **CertificateModule** (`android/app/src/main/java/com/freekiosk/CertificateModule.kt`)
   - `clearAcceptedCertificates()` - Clears stored self-signed SSL certificates
   - Certificates stored in SharedPreferences: `freekiosk_ssl_certs`

3. **BootReceiver** (`android/app/src/main/java/com/freekiosk/BootReceiver.kt`)
   - Launches app on BOOT_COMPLETED intent
   - Enabled/disabled dynamically via PackageManager

4. **MainActivity** (`android/app/src/main/java/com/freekiosk/MainActivity.kt`)
   - Reads AsyncStorage directly to determine if kiosk mode enabled
   - Auto-starts lock task on launch if Device Owner + kiosk enabled
   - Suspends Samsung bloatware apps when Device Owner active
   - Blocks back button, hides system UI, keeps screen on

**Device Owner Features:**
- When set as Device Owner, app can enforce true kiosk lockdown
- Lock task mode becomes mandatory (cannot be exited via gestures)
- System updates postponed, specific apps suspended
- MainActivity checks `@kiosk_enabled` in AsyncStorage to decide behavior

### WebView Architecture

**WebViewComponent** (`src/components/WebViewComponent.tsx`):
- Displays configured URL or welcome screen if no URL set
- **JavaScript injection**: Intercepts all clicks, touches, scrolls to reset screensaver timer
- Communicates user interactions back to React Native via `window.ReactNativeWebView.postMessage('user-interaction')`
- Auto-reload on error (configurable)
- HTTPS with custom SSL handling (certificates persisted via CertificateModule)

**User Interaction Flow for Screensaver:**
1. JS injected into WebView listens for click/touch/scroll events
2. Posts message to React Native on any interaction
3. KioskScreen receives message, resets screensaver timer
4. If no interaction for configured delay → activates screensaver (brightness to 0)
5. Touch on screensaver overlay or any WebView interaction deactivates it

### Storage Layer

**StorageService** (`src/utils/storage.ts`) - Wrapper around AsyncStorage:
- Stores settings with `@kiosk_` prefix keys
- **Security update v1.0.4**: PIN now migrated to Android Keystore via `react-native-keychain` (see secureStorage.ts)
- Keys: URL, PIN (deprecated), AUTO_RELOAD, KIOSK_ENABLED, AUTO_LAUNCH, SCREENSAVER_ENABLED, SCREENSAVER_DELAY, DEFAULT_BRIGHTNESS

**SecureStorage** (`src/utils/secureStorage.ts`) - Secure PIN management:
- Uses Android Keystore via react-native-keychain for secure PIN storage
- PIN hashed with salt before storage (custom implementation - see security audit)
- Rate limiting: 5 attempts, 15-minute lockout after failures
- Auto-migration from old plaintext PIN storage

**Persistence Locations:**
- JavaScript settings: AsyncStorage (`RCTAsyncLocalStorage` SharedPreferences)
- Secure PIN: Android Keystore (via react-native-keychain service: `freekiosk_pin`)
- SSL certificates: `freekiosk_ssl_certs` SharedPreferences (native)
- Device Owner state: Android system (not in app storage)

## Critical Architectural Decisions

1. **Kiosk Mode is Optional**:
   - Default OFF to avoid intrusive behavior
   - User must explicitly enable "Pin App to Screen" toggle
   - Without Device Owner, uses Android's screen pinning (user can exit with gesture + PIN)
   - With Device Owner, true lockdown (only 5-tap + PIN allows exit)

2. **No Backend/Cloud**:
   - All settings stored locally
   - No analytics, tracking, or remote management (v1.x)
   - Cloud MDM planned for v2.0

3. **Dual Security Modes**:
   - Basic mode: Screen pinning (requires confirmation, can exit with back+overview gesture)
   - Device Owner mode: Full lockdown (requires factory reset to remove)

4. **WebView Security Trade-offs**:
   - `usesCleartextTraffic="true"` to support HTTP URLs (kiosk use case requires flexibility)
   - Custom SSL certificate acceptance (users can whitelist self-signed certs)
   - JavaScript execution always enabled (required for interaction detection)

5. **Screen Brightness Control**:
   - Uses `react-native-brightness-newarch` for brightness control
   - Screensaver sets brightness to 0 (screen stays on but appears black)
   - Default brightness restored on interaction

## Important Constraints

- **Android 8.0+ only** (API 26+) due to Device Owner APIs
- **No iOS support** - Android kiosk APIs are platform-specific
- **Factory reset required** to remove Device Owner (Android limitation)
- **No Google account** can be added if Device Owner is set (Android policy)
- **Hermes enabled** in release builds for performance

## Development Guidelines

### When Adding Features

1. **Settings Changes**: Update both StorageService and SettingsScreen synchronously
2. **Native Modules**: Kotlin classes must be registered in KioskPackage/CertificatePackage
3. **Navigation**: Use typed navigation props from RootStackParamList
4. **Device Owner Features**: Always check `devicePolicyManager.isDeviceOwnerApp()` before calling restricted APIs

### Security Considerations

#### Security Audit Findings (January 2025)

**CRITICAL ISSUES - Require Immediate Attention:**

1. **Custom Hash Algorithm (secureStorage.ts:22-39)**
   - Current: Non-cryptographic hash (djb2-like) with 1000 iterations
   - Risk: Vulnerable to rainbow tables and GPU-based attacks
   - **REQUIRED**: Replace with PBKDF2 (100k+ iterations), bcrypt, or Argon2
   - Consider: `expo-crypto`, `react-native-quick-crypto`, or native implementation

2. **Insecure Random Generator (secureStorage.ts:44-51)**
   - Current: Uses `Math.random()` for salt generation
   - Risk: Predictable salts compromise entire PIN security
   - **REQUIRED**: Replace with `crypto.getRandomValues()` or native secure random

**HIGH PRIORITY:**

3. **HTTP Cleartext Traffic Enabled**
   - Location: AndroidManifest.xml:23, network_security_config.xml:3
   - Risk: Man-in-the-Middle attacks, credential theft
   - Action: Set `cleartextTrafficPermitted="false"` by default
   - Alternative: Use `<domain-config>` for specific HTTP-only domains
   - Add visible warning in UI when user enters HTTP URLs

4. **Self-Signed Certificate Acceptance**
   - Location: CertificateModule.kt, WebView SSL handling
   - Risk: MITM attacks if malicious certificate accepted
   - Current: 1-year expiration, manual revocation only
   - Improvements:
     - Implement Certificate Pinning for trusted domains
     - Add prominent security warning dialog
     - Reduce expiration to 30 days
     - Log all certificate acceptances for audit

5. **Excessive Android Permissions**
   - Location: AndroidManifest.xml:6-11
   - Declared: CAMERA, RECORD_AUDIO, ACCESS_FINE_LOCATION, READ_EXTERNAL_STORAGE, WRITE_EXTERNAL_STORAGE
   - Risk: WebView can abuse permissions, increased attack surface
   - Action: Remove unused permissions or request at runtime with user consent

**MEDIUM PRIORITY:**

6. **Empty ProGuard Rules**
   - Location: proguard-rules.pro
   - Risk: Easy reverse-engineering, no protection for sensitive classes
   - Action: Add specific rules for KioskModule, CertificateModule, SecureStorage
   - Enable: `-repackageclasses`, `-allowaccessmodification`

7. **Production Logging of Sensitive Data**
   - Locations: Multiple (MainActivity.kt, KioskScreen.tsx, secureStorage.ts)
   - Risk: Information leakage via `adb logcat`
   - Examples: Settings state, URLs, PIN verification status
   - Action: Implement conditional logging (DEBUG vs RELEASE builds)

8. **No Backup Strategy**
   - Location: AndroidManifest.xml:19 (`allowBackup="false"`)
   - Impact: Lost PIN requires factory reset
   - Alternative: Implement encrypted backup/restore or config export

**LOW PRIORITY:**

9. **Global Tap Counter Variable**
   - Location: KioskScreen.tsx:16-17
   - Risk: Easily inspectable/modifiable, no anti-automation
   - Improvement: Move to component state, add anti-spam protection

10. **Verbose Error Messages**
    - Risk: Reveal internal architecture to attackers
    - Action: Generic messages for users, detailed logs only in debug mode

#### Security Best Practices

**DO:**
- Store all credentials in Android Keystore (via react-native-keychain)
- Use cryptographically secure random for tokens/salts (`crypto.getRandomValues()`)
- Implement HTTPS-only policy (except explicitly allowed domains with warnings)
- Validate and sanitize all user inputs (URLs, PINs)
- Use proper KDF (PBKDF2/bcrypt/Argon2) for password/PIN hashing
- Implement certificate pinning for production deployments
- Use ProGuard/R8 with specific rules for sensitive classes
- Disable all sensitive logging in production builds
- Request Android permissions at runtime with clear justification

**DON'T:**
- Use custom cryptographic implementations (hashing, random generation)
- Trust user-provided SSL certificates without prominent security warnings
- Log sensitive information (URLs, settings, certificate fingerprints, PIN states)
- Grant permissions not actively used by the application
- Display technical error details to end users
- Store security-sensitive data in SharedPreferences/AsyncStorage (use Keystore)
- Enable cleartext HTTP traffic globally

#### Current Security Posture

**Strengths:**
- Android Keystore integration via react-native-keychain (v1.0.4+)
- PIN rate limiting (5 attempts, 15-minute lockout)
- Auto-migration from plaintext PIN storage
- WebView dangerous URL scheme blocking (file://, javascript:, data:)
- Disabled WebView file access (prevents local file reading)
- Device Owner restrictions properly scoped

**Weaknesses:**
- Non-cryptographic hash algorithm (CRITICAL)
- Insecure random generation (CRITICAL)
- HTTP traffic allowed globally (HIGH)
- Self-signed certificates accepted without proper validation (HIGH)
- Excessive permissions declared (MEDIUM)
- Production logs contain sensitive information (MEDIUM)

#### Migration Path for Security Fixes

**Phase 1 (v1.0.5 - Critical fixes):**
1. Replace custom hash with PBKDF2 or bcrypt
2. Replace Math.random() with crypto.getRandomValues()
3. Add migration logic to re-hash existing PINs

**Phase 2 (v1.1.0 - High priority):**
4. Disable cleartext traffic, add per-domain exceptions
5. Implement certificate pinning
6. Audit and remove unused permissions
7. Add HTTP URL warning in UI

**Phase 3 (v1.2.0 - Medium priority):**
8. Add comprehensive ProGuard rules
9. Implement conditional logging system
10. Add encrypted backup/restore feature

#### Security Testing Recommendations

- Penetration testing with OWASP Mobile Security Testing Guide (MSTG)
- Static analysis with MobSF or Quark-Engine
- Dynamic analysis with Frida for runtime hooking detection
- Certificate pinning bypass testing
- Root detection evaluation (if implementing)
- ProGuard effectiveness testing with dex2jar + JD-GUI

#### Compliance Notes

- **GDPR**: No personal data collected/transmitted (local-only storage)
- **OWASP Mobile Top 10**:
  - M1 (Improper Platform Usage): Permissions audit needed
  - M2 (Insecure Data Storage): Android Keystore mitigates, but hash algorithm weak
  - M3 (Insecure Communication): HTTP allowed, SSL validation weak
  - M4 (Insecure Authentication): Custom crypto implementation is concern
  - M7 (Client Code Quality): ProGuard rules needed
  - M8 (Code Tampering): No integrity checks implemented
  - M9 (Reverse Engineering): Minimal obfuscation

---

### Legacy Security Notes

- **HTTP allowed**: By design for kiosk use case (but needs user warning)
- **SSL certificate acceptance**: Stored per-host in SharedPreferences (needs pinning)

### Testing Kiosk Features

- **Without Device Owner**: Can test screen pinning, but not full lockdown
- **With Device Owner**: Need factory-reset device + ADB command
- **Screensaver**: Reduce delay to 10 seconds for quick testing
- **5-tap gesture**: tapCount is global variable (not persistent across hot reload)

## File Structure

```
src/
  components/       # Reusable UI components
    PinInput.tsx           # PIN entry component with lockout
    WebViewComponent.tsx   # Main WebView with injection & URL validation
  navigation/
    AppNavigator.tsx       # Navigation stack configuration
  screens/          # Full screen views
    KioskScreen.tsx        # Main kiosk display with screensaver
    PinScreen.tsx          # PIN verification & migration handler
    SettingsScreen.tsx     # Configuration UI with certificate management
  utils/            # Shared utilities
    KioskModule.ts         # TypeScript interface for native module
    CertificateModule.ts   # TypeScript interface for certificate module
    storage.ts             # AsyncStorage wrapper (settings only)
    secureStorage.ts       # Secure PIN storage (Keystore) ⚠️ See security audit

android/app/src/main/java/com/freekiosk/
  MainActivity.kt            # Entry point, system UI hiding, auto-start
  KioskModule.kt             # Native kiosk APIs (lock task, auto-launch)
  CertificateModule.kt       # SSL certificate management
  BootReceiver.kt            # Auto-launch on boot
  DeviceAdminReceiver.kt     # Device Owner receiver
  KioskPackage.kt            # Registers KioskModule
  CertificatePackage.kt      # Registers CertificateModule
  MainApplication.kt         # React Native setup

android/app/src/main/res/xml/
  network_security_config.xml  # ⚠️ Allows cleartext HTTP (security audit)
  device_admin.xml             # Device Owner policies
```

## Known Issues & Workarounds

1. **Hot Reload Breaks Tap Counter**: The 5-tap gesture uses global variable, reset counter manually or restart app
2. **Device Owner Cannot Be Removed Without Factory Reset**: Android limitation, warn users
3. **Samsung Devices May Require Extra Permissions**: Some Samsung Knox features may interfere
4. **Screensaver Timer Persists Across Navigation**: By design, but can cause confusion in settings (timer cleared on settings screen focus)

## Future Roadmap (from README.md)

- v1.2.0: Multi-language, URL rotation, motion detection
- v2.0.0: Cloud MDM dashboard

## Contact

- Developed by Rushb (rushb.fr)
- GitHub: github.com/rushb-fr/freekiosk
- Email: contact@rushb.fr
