# FreeKiosk development handoff

## Repository

- Working tree: `/opt/freekiosk`
- Branch: `main`
- Origin: `https://github.com/DahmaniAdame/freekiosk.git`
- Upstream: `https://github.com/RushB-fr/freekiosk.git`
- Android package: `com.freekiosk`
- Device Admin component: `com.freekiosk/.DeviceAdminReceiver`
- Current source version: `1.2.68` (`versionCode 92`)

Preserve the current implementation. Before changing anything, inspect `git status`
and the latest commit. Do not reset, clean, check out, or overwrite user work.

## Device inventory

- `192.168.0.37:5555` — Samsung 75WAF interactive display. FreeKiosk v1.2.66 is installed. The allowed-app visibility repair restored Disney+, Netflix, and Spectrum Shooter from an interrupted legacy hidden state; one-tap launches of all three were verified in strict `LOCKED` mode. Close All returned to the grid without re-hiding any allowed package. 2026-11-17: grid regrouped into rows `Streaming` (Disney+, Netflix, Homeflix micro-app) and `Games` (Spectrum Shooter, Arrow Me Out micro-app); the bare MicroStation tile was removed.
- `192.168.0.133:5555` — Galaxy S23+ (Samsung SM-S916B, serial `RZCWA0KH2NK`). Paired again on 2026-08-18 and restored to fixed ADB port 5555. FreeKiosk v1.2.65 is installed with Hidden Mode and its one-app YouTube block list enabled; the foreground watchdog and accessibility service are active, Usage Access and notifications are granted, Samsung Home is focused, and Lock Task is `NONE`. This phone is owned by the separate Nix DPC (`com.nix/.NixDeviceAdmin`), so FreeKiosk cannot use Device Owner package-hiding or managed-VPN APIs. YouTube (`com.google.android.youtube`) is therefore additionally and reversibly `disabled-user` for user 0: it has no resolvable launcher activity and launch attempts fail. The FreeKiosk notification reports `Protection is active` and `1 blocked app protected`.
- `192.168.0.153:5555` — Test Galaxy Tab S8+ (Samsung SM-X800, serial `R52Y20DVCKN`). Its DHCP address changes between networks; it was previously `.53`. Hidden Mode and independent App Blocking are active. Current blocked-app list: Google Play Store (`com.android.vending`), YouTube (`com.google.android.youtube`), YouTube TV (`com.google.android.apps.youtube.unplugged`), and YouTube Music (`com.google.android.apps.youtube.music`). All four remain `hidden=true`, Samsung Home is focused, and Lock Task is `NONE`. FreeKiosk v1.2.65 is installed with independent Network Protection enabled and the eight-rule YouTube preset. Android reports `always_on_vpn_app=com.freekiosk`, a validated `VPN CONNECTED` network covering UIDs `0-99999`, and `bypassable=false`; the ongoing notification reports eight active rules. Live testing loaded `https://example.com` in Chrome, then showed `DNS_PROBE_FINISHED_NXDOMAIN` for `https://www.youtube.com`, while unrelated connectivity continued to work.
- `192.168.0.207:5555` — Eilaf tablet: Samsung Galaxy Tab S6 Lite (SM-P620, serial `R52Y202P8AH`, Android 16). Set up 2026-11-17. FreeKiosk v1.2.68 is Device Owner (a hidden Meet/tachyon account had to be cleared first). Multi-app grid, Lock Mode `LOCKED`, FreeKiosk PIN in `~/.config/freekiosk/eilaf.env` (changed 2026-11-17 with ADB `new_pin`, v1.2.70), `@kiosk_default_launcher=true` so `KioskHomeActivity` is persistent HOME only while Lock Mode is on (boot shows FreeKiosk, never Samsung Home). Grid: row groups `Streaming` (Disney+, Netflix, Homeflix) and `Games` (Spectrum Shooter, Path Garden, Arrow Me Out); HBO Max, Yle Areena, LogicLike and SketchBook were removed and uninstalled on request. Gotchas: an ADB config intent sent without `--ez kiosk_enabled true` left `@kiosk_enabled=false` after reboot, so always pass it; `POST /api/restart-ui` left the REST server dead (`Server is already running`) until a reboot, so prefer `am start ... --ez kioskSecurityRecovery true` to re-engage Lock Mode. The relay `192.168.10.151` must forward 8080 and the 30000-50000 wireless-debug range for `.207`, not only 5555.Voli is installed but not in the grid. REST API on 8080; key in `~/.config/freekiosk/eilaf.env` on the agent host. Wireless debugging survives reboot through the Device Owner policy; host cron `~/.local/bin/adb-fixed-port` (every minute) finds the TLS port via mDNS and re-runs `adb tcpip 5555`. Reboot test: 5555 back within ~100 s, Lock Mode `LOCKED`, API 200. The 75WAF grid list was inferred from its installed apps, not read from its settings (its REST API key is unknown here).

Always use the explicit serial with `adb -s IP:5555` so commands cannot target the
other connected device.

## Latest artifacts

- MicroAppStation micro-apps (2026-11-17): FreeKiosk lists micro-apps through MicroStation's `content://local.microstation.apps` provider, which only `MicroAppStation-0.2.0-catalog-debug.apk` has (Android Debug signer). Both devices had an older, differently signed 0.2.0 without it, so it was uninstalled and the catalog build installed; the 75WAF's old `micro_apps.xml` is backed up in `~/backups/microstation/`. Micro-apps live in `shared_prefs/micro_apps.xml` (`items` JSON, `published:true` required) and icons in `files/icons/<id>.png`, both writable with `run-as local.microstation` (debuggable). Both devices: Homeflix `a6b5ae29-7b8b-47dc-9d41-1bdf58c22a24` (`http://192.168.10.37/eilaf`, pixel play icon) and Arrow Me Out `3f1c9a52-6d0e-4b7a-9e21-a7c0de55e0a1` (`http://192.168.10.37:8080/arrow-me-out/`, pixel arrow icon). Grid entries are `{packageName:"local.microstation", microAppId:<id>}`; after `POST /api/settings`, `POST /api/mode {"mode":"external_app"}` reloads the grid without a UI restart.
- `FreeKiosk-v1.2.71-arm64.apk` (2026-11-17), installed on both devices, both `LOCKED`, custom icons intact after the update. ADB `managed_apps` validation now keeps `iconDataUri` too, so no load, save, settings or ADB path drops the icons. Known-good grids (apps, groups, icons) are in `assets/grid-icons/grid-<device>.json`; restore with `POST /api/settings --data @grid-<device>.json`, then `POST /api/mode {"mode":"external_app"}`.
- `FreeKiosk-v1.2.70-arm64.apk` (2026-11-17), installed on both devices, both `LOCKED`. Fixes custom grid icons being dropped when managed apps load (v1.2.69 stored `iconDataUri` but storage normalization stripped it). Adds ADB `--es new_pin` to change the PIN after `pin` authenticates; used to change the Eilaf tablet PIN.
- `FreeKiosk-v1.2.69-arm64.apk` (2026-11-17), installed on the Eilaf tablet and the 75WAF; both returned to `LOCKED`. Adds an optional `iconDataUri` (PNG data URI) on managed apps that replaces the package or micro-app icon on the home grid. Every grid entry on both devices now uses the house pixel icon set in `assets/grid-icons/` (`iconset.py` regenerates it: 35x35 cells at 6 px, tile inset 5.7%, each glyph's bounding box exactly centered). To change an icon, regenerate, then rewrite `iconDataUri` in `@kiosk_managed_apps` and send `POST /api/mode {"mode":"external_app"}`.
- `FreeKiosk-v1.2.68-arm64.apk` (2026-11-17), installed on the Eilaf tablet and the 75WAF. Fixes ADB `rest_api_key` being ignored when a Keychain key exists, and REST control commands silently dropped after a second kiosk-screen mount. Both devices have `@kiosk_max_volume_percent=55`. Verified on the Eilaf tablet: API volume 30 gave 26%, and 90 was clamped to 53% (8/15). 75WAF REST key was replaced (new key in `~/.config/freekiosk/waf.env` on the agent host); KioskControl on 192.168.10.77 needs it. The 75WAF firmware ignores Android stream-volume writes, so its cap is unverified.

The APK files are intentionally ignored by Git. The current ARM64 artifact is:

- `FreeKiosk-v1.2.66-arm64.apk`
  - SHA-256: `8e0bfed46f797fea1e431d1a47878f21e33d868f8b1bd738d11436a56fd750ba`
  - 24,956,195 bytes; ARM64-only release, signed with the existing certificate. Repairs configured allowed apps left hidden/suspended by an interrupted legacy Close All cycle without restoring explicitly blocked apps, makes Close All restore package visibility synchronously, and adds nine-point placement for the protected dashboard/PIN access zone across web, media, multi-app, native overlay, and WAF accessibility layers. TypeScript, 13 focused Jest tests, Android unit tests, release lint, and the ARM64 release build pass. Installed and live-tested on the 75WAF: the watchdog restored all three allowed packages, Disney+, Netflix, and Spectrum Shooter each launched on one tap, Close All returned to the grid while strict lock task stayed `LOCKED`, and every allowed package remained visible and launchable after closing.

- `FreeKiosk-v1.2.65-arm64.apk`
  - SHA-256: `d36c1d0212bb804d589325565cba390d0cf54b1a361f5b44684de35e3291f96e`
  - 24,938,707 bytes; ARM64-only release, signed with the existing certificate. Adds independent Device Owner Network Protection: arbitrary domain-suffix, exact-IP, and CIDR deny rules; a one-tap YouTube preset; a persistent local split-tunnel `VpnService` that returns NXDOMAIN for blocked DNS queries and drops packets routed to configured or resolved destinations; device-encrypted policy; boot/package-update reconciliation; authenticated Settings/ADB configuration; backup coverage; and a parent-protected ongoing notification. TypeScript, 10 focused Jest tests, Android DNS codec/CIDR unit tests, release lint, and the Android arm64 release build pass. Installed and live-tested on the SM-X800 at `.153:5555`: Chrome loaded `example.com`, `www.youtube.com` failed with `DNS_PROBE_FINISHED_NXDOMAIN`, unrelated connectivity stayed live, Android retained FreeKiosk as its always-on non-bypassable VPN, all four blocked apps remained hidden, and the tablet was returned to Samsung Home with Lock Task `NONE`.

- `FreeKiosk-v1.2.64-arm64.apk`
  - SHA-256: `f7899db7f4d4556b5ffbd3e0f6fa92c8a50f4e64bf6b19a8a55a2ba7270ec650`
  - 24,926,639 bytes; ARM64-only release, signed with the existing certificate. Changes the background notification title to `Protection is active` and makes its immutable tap intent a parent-only entry point: a warm tap routes globally to PIN, while a retained native one-shot request lets a cold launch mount PIN directly without flashing the kiosk. The request remains in the Activity intent until React consumes it, so process recreation cannot bypass or lose the protected route. TypeScript, focused ESLint, the blocked-app/group-layout Jest suites, and the Android release build pass. A functionally equivalent v1.2.64 build installed successfully on the SM-X800, but `.53` went offline before post-install checks and before this final hardened artifact could be synchronized.

- `FreeKiosk-v1.2.63-arm64.apk`
  - SHA-256: `6e308f60a2e123613220d533c039dc1aa56425f2dd81895c489a22d4e29e3e3a`
  - 24,925,515 bytes; ARM64-only release, signed with the existing certificate and installed/live-tested only on the SM-X800 at `192.168.0.53:5555`. Hidden Mode now has a dedicated shield status icon and an ongoing public LOW-importance notification (`FreeKiosk Hidden Mode`, `Hidden Mode is on • 1 blocked app protected`); Device Owner policy granted `POST_NOTIFICATIONS`, which is policy-fixed. Hidden Mode makes a saved blocked-app list effective even if an older independent toggle was false, reasserts Device Owner hiding instead of preserving a visible guard-only package, and uses Accessibility Home plus Usage Access as immediate already-running-task fallbacks. Live upgrade testing began with Play Store resumed in the foreground and ended on Samsung Home with Play Store `hidden=true`; its launcher did not resolve, an explicit Activity launch returned Android Error type 3, and the package remained hidden in 15/15 consecutive samples. Lock Task remained `NONE` and the policy foreground service remained active.

- `FreeKiosk-v1.2.62-arm64.apk`
  - SHA-256: `f7d3c8914e2902e21c7ae073009a810c83f91908570b1f527e831e54122887ca`
  - 24,924,906 bytes; ARM64-only release, signed with the existing certificate. Installed and live-tested only on the SM-X800 at `192.168.0.53:5555`. Fixes the Hidden Mode Play Store visibility loop by including Device Owner-hidden packages in installed-package lookup while still requiring Android's real `FLAG_INSTALLED`; the prior watchdog treated a hidden package as uninstalled and explicitly restored it on the next one-second tick. Play Store remained `hidden=true` in 30/30 consecutive samples, had no resolvable launcher Activity, rejected an explicit Activity launch, and left Samsung Home focused with Lock Task `NONE`. The foreground policy service remained active. Superseded by v1.2.63 after physical testing found that a legacy guard-only state could still leave Play Store visible and usable.

- `FreeKiosk-v1.2.61-arm64.apk`
  - SHA-256: `70bdd1cb4f7cc899767808cb69712404e6cf9aa14d4512a4ec7b0923ebd43835`
  - 24,924,906 bytes; ARM64-only intermediate release, signed with the existing certificate and installed only on the SM-X800. Added persistent guard-only fallback for packages that genuinely reverse or refuse Device Owner hiding. Live testing showed the reported Play Store loop still occurred and exposed its actual cause: FreeKiosk's installed-package lookup excluded its own hidden target before the reversal fallback could run. Superseded by v1.2.62.

- `FreeKiosk-v1.2.60-arm64.apk`
  - SHA-256: `14b535123e511f1bb5f932ab9b2b6f9ec7d046fe545ace958fec78eefed13fda`
  - 24,924,846 bytes; ARM64-only release, signed with the existing certificate. Installed and live-tested only on the SM-X800 at `192.168.0.53:5555`. Hidden Mode leaves Samsung Home resumed with Lock Task `NONE` while the foreground policy service remains active. Independent App Blocking hides ordinary packages through Device Owner policy, reconciles policy after settings/database contention, and evicts a blocked foreground app to Home. Testing exposed a one-second `com.android.vending` hide/unhide loop; this was initially attributed to Samsung but later traced to FreeKiosk's installed-package lookup excluding Device Owner-hidden packages. Superseded by v1.2.62.

- `FreeKiosk-v1.2.59-arm64.apk`
  - SHA-256: `dadc1a9448be46ebb4017c1d454d6040cd33bf1bf15fb6f1a29bf856b1549f0b`
  - 24,921,006 bytes; ARM64-only release, signed with the existing production certificate. Installed and live-tested on the SM-X800 at `192.168.0.53:5555`. With Play Store selected, Lock Mode reached `LOCKED`, Samsung's unsuspendable `com.android.vending` changed to `hidden=true`, and its launcher could not resolve. Disabling Lock Mode returned `NONE`, restored `hidden=false`, and Play Store launched successfully. The tablet was left with Lock Mode off and Play Store retained in the blocked-app list.

- `FreeKiosk-v1.2.58-arm64.apk`
  - SHA-256: `34be0b7fa408cb44eefc8e7955f342d0b67661f194a13f1364196b5cf681b565`
  - 24,921,006 bytes; ARM64-only release, signed with the same certificate as v1.2.57. Adds a Security → Blocked Apps picker and lifecycle-scoped Device Owner package suspension with reboot/update/watchdog reconciliation and full exit restoration. Installed on the SM-X800; testing established that Samsung refuses to suspend `com.android.vending`, which prompted the v1.2.59 hide fallback.

- `FreeKiosk-v1.2.57-arm64.apk`
  - SHA-256: `1d91875edee94af3b1ceba997f3532afd9380133b162df1c9bf86f192ac4ddea`
  - 24,911,594 bytes; ARM64-only release, installed and live-tested on the Samsung 75WAF. Keeps the mandatory Close All control self-healing and aligns its ordinary-overlay fallback with the WAF accessibility-layer control at the true physical bottom-right, so the redundant safety layers render as one button. Verified through a real in-place Netflix allowed-app update while Disney+ remained foreground and strict lock task stayed `LOCKED`; both safety layers remained visible and the close action returned to the kiosk grid.

- `FreeKiosk-v1.2.56-arm64.apk`
  - SHA-256: `46ace6f3e775b3a51b889044d904197578a913a98761c4b2c85c68c64b4a9766`
  - 24,911,594 bytes; ARM64-only release. Makes the mandatory bottom-right Close All control self-healing after process death, FreeKiosk or allowed-app updates, accessibility reconnects, and detached overlay windows, with a one-second watchdog checkpoint and overlapping application/accessibility safety layers on WAF.

- `FreeKiosk-v1.2.55-arm64.apk`
  - SHA-256: `032524e4ddc9d6c9262e72f0ad04a89ea1af74a26f7ce0e8543406b11174d04f`
  - 24,911,498 bytes; ARM64-only release, installed and visually tested on the SM-X800. Keeps row groups as invisible layout structure by removing their child-facing names, tinted backgrounds, borders, and rounded containers while retaining labeled nested folders.

- `FreeKiosk-v1.2.54-arm64.apk`
  - SHA-256: `cc59e02d3e02f3adeb76cb07cc2a7d4f1e1c609465404106fc677ac0b19cf437`
  - 24,911,798 bytes; ARM64-only release. Adds ordered multi-app row groups, wrapped multi-row sections, and arbitrarily nested folder groups with app/group ordering controls in Settings.

- `FreeKiosk-v1.2.53-arm64.apk`
  - SHA-256: `6b173c1173231bad42e65c139db91b7fd1b8afc3bb67a44b108f6ef31766c7ae`
  - 24,873,698 bytes; ARM64-only release. Preserves the kiosk's automatic-timeout protection while allowing a deliberate short power-button press to turn the display off until the next short press, without exposing another launcher or leaving strict lock task.

- `FreeKiosk-v1.2.52-arm64.apk`
  - SHA-256: `b330cb5b1dbde7e3a1edf6dbddded7e92e07e97505b3d10c290b01268631774b`
  - 24,873,698 bytes; ARM64-only release. Keeps exactly one visible half-size square Close All control throughout external-app sessions, including Disney+ playback, while preserving the invisible bottom-right admin multi-tap target.

- `FreeKiosk-v1.2.51-arm64.apk`
  - SHA-256: `f66240022a80118c05bb3abfb0915e8666e526945fef5a3d00b3376d79db9464`
  - 24,873,698 bytes; ARM64-only release. Replaces duplicate close controls with one half-size square Close All button at the absolute bottom-right and terminates every configured allowed app before returning to the kiosk grid.

- `FreeKiosk-v1.2.50-arm64.apk`
  - SHA-256: `2177fd48b6421e6b329461d8c78ff2035219224d36530121d2fc010fcfcfb34a`
  - 24,873,698 bytes; ARM64-only release. Keeps the display awake across external child apps, prevents the monitor from repeatedly restarting Disney+/Netflix playback activities, and reduces the WAF edge gesture guards from 40 dp to 12 dp.

- `FreeKiosk-v1.2.49-arm64.apk`
  - SHA-256: `b417f54d5db3966372ee747aee499481ecbec3ea79097adf4901318199b5e818`
  - 24,873,698 bytes; ARM64-only release. Owns all four WAF display edges with accessibility-layer gesture guards for the complete saved kiosk lifecycle, disables the firmware's freeform/multi-window/side-button switches, and repairs any minimize, finish, or multi-window attempt back to strict fullscreen lock task.
- `FreeKiosk-v1.2.48-arm64.apk`
  - SHA-256: `c11dda82769479bf7f3682e0f9aef6df92800e7e58098c696d0afedf5a5b1736`
  - 24,873,698 bytes; ARM64-only release. Adds accessibility-layer top and bottom edge shields above the 75WAF SystemUI windows while an external child app is active, plus accessibility-layer mirrors of the mandatory close and admin tap controls so app SurfaceViews cannot eclipse them.
- `FreeKiosk-v1.2.47-arm64.apk`
  - SHA-256: `6f279a68c484b23cce1da9ab695159328dcde2b2314f310244f8238f255c301d`
  - 24,873,698 bytes; ARM64-only release. Samsung 75WAF top-status and bottom-navigation edge gestures are disabled through the firmware's native policy switches and continuously reconciled while child-facing.
- `FreeKiosk-v1.2.46-arm64.apk`
  - SHA-256: `485d30cf9369a703a0374b62422ea2003616bf80fc0147464712f8d7a1ce90a5`
  - 24,873,698 bytes; ARM64-only release. The external-app close button is now mandatory and session-persistent, a bottom-edge gesture shield prevents navigation-bar reveal, transient overlay/SystemUI accessibility events cannot remove the button or inject Back into the child app, system navigation keys are consumed while a child session is active, and unexpected Back returns restore the selected app without stopping the overlay in multi-app mode.
- `FreeKiosk-v1.2.45-arm64.apk`
  - SHA-256: `12bfa1a4944d685a02bfac1d51a1b1e9a84c3871d13a203bc66120f067bae642`
  - 24,873,542 bytes; ARM64-only release. Entering the admin flow from Disney+ now creates a native admin session, disarms every external-app relaunch path, and keeps authenticated Settings in the foreground while strict lock task and system-surface blocking remain active.
- `FreeKiosk-v1.2.44-arm64.apk`
  - SHA-256: `18580e490f4f003ae155670493371da687a510e7d629823a0339f7ac064ae30b`
  - 24,873,122 bytes; ARM64-only release; installed and live-tested on the SM-X800 Android 16 tablet. Trusted ADB host authorization survived reboot without re-pairing, wireless debugging remained enabled with Lock Mode both off and on, and the kiosk rebooted into strict `LOCKED` state on the FreeKiosk grid instead of relaunching stale Disney+ state.
  - Stock Android resets the legacy adbd TCP listener itself across reboot, so fixed port 5555 still requires `adb tcpip 5555` after connecting through the persistent paired wireless-debug service. FreeKiosk keeps that paired service enabled and its host authorization non-expiring; it cannot write Android's protected `service.adb.tcp.port` system property.
- `FreeKiosk-v1.2.43-arm64.apk`
  - SHA-256: `ba6a35124e6595e743e4b615c045cec7dd8811faaa7b026e29e6c2b395483a41`
  - 24,873,078 bytes; ARM64-only release with strict fail-closed external-app recovery and the independent boot-persistent wireless-debugging policy.
- `FreeKiosk-v1.2.42-arm64.apk`
  - SHA-256: `7a5651de5f710448d94c154d7d5fae3d60b9ddbb10358ddb0c8e0d20cd4796c9`
  - 24,870,890 bytes; ARM64-only release, pending install/device verification on the SM-X800 Android 16 tablet.
- `FreeKiosk-v1.2.41-arm64.apk`
  - SHA-256: `2951cd7021f63796f485e3fb3f2294fa9188b1236d883ae5704d82c93da4e181`
  - 24,872,658 bytes; ARM64-only release, built, installed, and security-tested on the SM-X800 Android 16 tablet.
- `FreeKiosk-v1.2.39-arm64.apk`
  - SHA-256: `b960506c2308fc335151eb64d57fa37c0c03429314c3358f3447d95211f8c835`
  - 24,872,554 bytes; ARM64-only release, built, installed, and live-tested on the WAF display.
- `FreeKiosk-v1.2.38-arm64.apk`
  - SHA-256: `79d3538b6619803df949a391b3f4ac3f74d9e5713a98f8c0eabd516afddc863f`
  - 24,872,234 bytes; ARM64-only release, built, installed, and route-lifecycle-tested on the WAF display.
- `FreeKiosk-v1.2.34-arm64.apk`
  - SHA-256: `26ba2152e17644b758b10e292df489521255207e8b6450c2c4719ccbce8acfa5`
  - 24,872,170 bytes; ARM64-only release, built, installed, and lifecycle-tested on the WAF display.

- `FreeKiosk-v1.2.33-arm64.apk`
  - SHA-256: `8d78bd77c337716bbafeb1544534b1fa4725b36a20b16ad88ee454b89f983faa`
  - 24,872,170 bytes; ARM64-only release, built, installed, and live-tested on the WAF display.

- `FreeKiosk-v1.2.31-arm64.apk`
  - SHA-256: `671e66a8f1a5a7ecd07087242267811abb6382e98d8811692160817e3f5e1a7f`
  - 24,537,818 bytes; ARM64-only release, built, installed, and tested on the WAF display.
- `FreeKiosk-v1.2.30-arm64.apk`
  - SHA-256: `91b3f98c7b6c042d078848a137a94b0a3228eca0baf087c74849c0db580182c8`
  - 24,537,718 bytes; ARM64-only release, built, installed, and tested on the SM-X800.
- `FreeKiosk-v1.2.28-arm64.apk`
  - SHA-256: `6d1e1a8452233716517b61ad548955c42018fa723903634b712f9e0e71567942`
  - ARM64-only release, built and installed on the SM-X800 test tablet.
- `FreeKiosk-v1.2.27.apk`
  - SHA-256: `cfacffe7c011a27023f1fd4c23c976bec0c574999a50ab9d2f49f5dfabc9856d`
- `LADB-v2.6-local.apk`
  - SHA-256: `911aff76c8ffc8eb08ff8f8443a90f33e697dc06f05daaf4c72804d805a247ca`

If the FreeKiosk APK is unavailable on a new host, install Node.js 20+, restore
dependencies with `npm ci`, and build the Android release variant from the committed
source. The Android build-output directories were previously removed to recover disk
space; they are generated again by Gradle.

## Implemented changes

- Configurable kiosk background color, defaulting to `#333333`.
- FreeKiosk branding in the top-left of kiosk mode hidden at zero opacity.
- Persistent configurable maximum-volume limit while the kiosk is active.
- Automatic centered app grid, alphabetical ordering, and up to six apps per row.
- App dragging disabled in kiosk mode.
- Configurable close-button position. The button is shown only while an allowed app
  is active, remains stable, and closes that app.
- APK self-update through the local management API.
- Settings-change history plus JSON export/import and backup restoration.
- Stronger foreground-app enforcement and protection against unrelated activities.
- Device Owner lock-task enforcement, System UI restrictions, and notification/status
  bar suppression.
- Version 1.2.27+ fails closed: it will not launch an external allowed app unless
  Device Owner lock task is active.
- Version 1.2.28 keeps `OverlayService` alive across brief external-app startup
  activity bounces. This prevents the close button from disappearing while apps
  such as Netflix switch between their launch activities.
- Version 1.2.30 makes **Exit Kiosk Mode** persistently disable Lock Mode, clear the
  Device Owner HOME policy, disable FreeKiosk's dedicated HOME component, stop all
  kiosk protection services, remove the app task, and launch the normal device Home.
  External-app services and auto-launch are gated on Lock Mode so they cannot restart
  after an intentional exit.
- Version 1.2.31 scopes every active Device Owner restriction to Lock Mode. Exiting
  clears lock task and its allowlist, status/navigation-bar restrictions, screen
  capture policy, factory-reset and accessibility restrictions, persistent HOME,
  suspended Samsung updater packages, and the system-update policy. Saved admin
  choices are retained and reapplied when Lock Mode is enabled again.
- Version 1.2.33 adds authenticated typed `GET`/`POST /api/settings`, the ordered
  Volume Up x3 then Volume Down x3 emergency exit, and lifecycle-safe Lock Mode
  re-entry. The emergency exit performs the full restriction cleanup without
  removing Device Owner.
- Version 1.2.33 adds optional kiosk wallpaper support with nine anchors. The bundled
  wallpaper defaults to bottom-center; this WAF currently uses
  `file:///storage/emulated/0/Android/data/com.freekiosk/files/Pictures/wallpaper-2.png`
  at bottom-center.
- Samsung WAF system packages are deliberately not hidden during Lock Mode. Hiding
  `com.xbh.navisetting` crashes the firmware's `com.xbh.launcher` package-change
  receiver; hiding `com.android.launcher3` destabilizes Quickstep/Recents and can
  reboot the display. The old hidden-state recovery path remains for safe upgrades.
- Version 1.2.34 controls the signed WAF side-menu service through its exported native
  controller and lifecycle settings. Both sidebars and every expanded-menu button are
  removed while Lock Mode is active, then the exact prior OEM state is restored on exit.

## Current interactive-display state

- Display IP: `192.168.0.37`
- Model: Samsung WAF interactive display, Android 14 / API 34, ARM64.
- Only Android user `0` exists.
- FreeKiosk 1.2.66 is installed in place and remains the Device Owner.
- The display is in strict Device Owner `LOCKED` state. The
  WAF chrome policy is active: density is 577dpi, both OEM side-menu
  settings are `0`, global immersive policy is `immersive.full=*`, and
  `enable_freeform_support`, `multi_cb`, and `side_button` are all `0`.
- The `WRITE_SECURE_SETTINGS` and notification runtime grants are present.
- The managed app grid contains Disney+, Netflix, and Spectrum Shooter.
- The display has zero configured accounts. An obsolete secondary Android user and
  its account data were removed with explicit owner authorization before Device Owner
  provisioning.
- The WAF firmware exposes secure legacy TCP ADB at the fixed endpoint
  `192.168.0.37:5555`. The host RSA key stayed authorized through reboot and the
  endpoint remained reachable while Lock Mode was active. Always pass
  `-s 192.168.0.37:5555`; another Android device may also be connected.
- WAF edge protection is provisioned with `skip_swipe_bottom_top=1`,
  `skip_gesture=1`, and `navigation_bar_gesture_disabled_by_policy=1`. FreeKiosk's
  accessibility service is enabled and its `ACCESS_RESTRICTED_SETTINGS` app-op is
  `allow`; four type-2032 edge shields own the complete display perimeter on the grid,
  PIN, and lock-task recovery paths. While an external app is open, two additional
  type-2032 controls mirror the mandatory close button and admin tap target above WAF
  SystemUI and app SurfaceViews. Android can deny a sideloaded accessibility service
  until this one-time provisioning command is run:
  `adb -s 192.168.0.37:5555 shell cmd appops set com.freekiosk ACCESS_RESTRICTED_SETTINGS allow`.
- WAF screen sharing is intentionally disabled for user 0: the firmware property
  `sys.xbh.screen.sharing=false`, `com.xbh.share` is `disabled-user`/stopped, and no
  process is running. Restore only when requested with
  `adb -s 192.168.0.37:5555 shell pm enable --user 0 com.xbh.share`.
- The normal HOME role is the stable WAF launcher `com.xbh.launcher`. Launcher3 is
  left installed and untouched but is not the active HOME holder.

Do not factory-reset the tablet, delete accounts/users, or remove an existing owner
without explicit user approval.

## Wireless ADB continuation

Use current Android platform-tools from a host that can reach `192.168.0.37`:

```sh
adb connect 192.168.0.37:5555
adb -s 192.168.0.37:5555 get-state
```

This WAF uses secure legacy TCP ADB, not Android's rotating TLS pairing port. Do not
replace the existing authorized host key or toggle the firmware ADB configuration
while FreeKiosk is still being stabilized.

If a future firmware update removes the fixed endpoint, fall back to Android pairing:

```sh
adb pair IP:PAIRING_PORT PAIRING_CODE
adb mdns services
```

If mDNS does not reveal the connection endpoint, ask for the IP and port displayed on
the main Wireless debugging screen, then connect:

```sh
adb connect IP:CONNECTION_PORT
adb devices -l
```

Collect the exact diagnostic output:

```sh
adb shell getprop ro.build.version.release
adb shell getprop ro.build.version.sdk
adb shell pm list users
adb shell pm list packages --user 0 com.freekiosk
adb shell dumpsys package com.freekiosk | grep versionName
adb shell settings get secure user_setup_complete
adb shell settings get global device_provisioned
adb shell cmd device_policy list-owners
adb shell dumpsys device_policy
```

Some OEM builds may not support every diagnostic command. Continue with the remaining
commands and retain complete errors.

If the installed version is older than 1.2.33, upgrade without clearing app data:

```sh
adb install -r /path/to/FreeKiosk-v1.2.33-arm64.apk
```

Attempt Device Owner provisioning:

```sh
adb shell cmd device_policy set-device-owner --user 0 --device-owner-only com.freekiosk/.DeviceAdminReceiver
```

If `--device-owner-only` is unsupported:

```sh
adb shell cmd device_policy set-device-owner --user 0 com.freekiosk/.DeviceAdminReceiver
```

If it fails, preserve the full error and collect only relevant policy logs:

```sh
adb shell logcat -d -b system -t 1000 | grep -Ei "device.?policy|device owner|profile owner|freekiosk"
```

Diagnose the precise blocker before changing device state.

## Verified on the WAF display

1. FreeKiosk remains Device Owner after the in-place 1.2.33 APK update.
2. Enabling Lock Mode produces `LOCKED`, restores the FreeKiosk/Disney+/Netflix
   allowlist, disables the status bar, and sets `policy_control=immersive.full=*`.
3. **Exit Kiosk Mode** returns to Android Home without rebooting: lock task becomes
   `NONE`, the allowlist is empty, `mDisabled1` and `mDisabled2` are zero, immersive
   policy is cleared, and the normal launcher resolves as HOME.
4. Device Owner remains installed after exit, but the active factory-reset and
   accessibility-service restrictions are absent. Re-entering Lock Mode reapplies
   the saved accessibility allowlist.
5. The ordered Volume Up x3, Volume Down x3 kill switch exits to normal Home and
   restores restrictions; a subsequent ADB re-enable returns lock task to `LOCKED`.
6. `wallpaper-2.png` renders bottom-center behind the Disney+/Netflix grid.
7. `GET`/`POST /api/settings` is implemented in FreeKiosk; the management console at
   `/opt/apps/KioskControl` on `192.168.10.77` already calls those routes and required
   no server-side change.
8. Wireless ADB at `192.168.0.37:5555` stayed connected through installs, exit,
   re-entry, and the final locked-state verification.
9. After removing all WAF package-hiding calls, a cleared Android crash buffer remained
   empty through Lock Mode entry and observation. The Launcher3 taskbar window was
   absent; the two OEM `com.xbh.navisetting` SYSTEM_ALERT handles remain visible because
   hiding their package crashes the signed WAF launcher firmware.
10. Version 1.2.49 stayed fullscreen and `LOCKED` after repeated double swipes inward from
    both left and right edges at the top, center, and bottom of the display, on both the
    FreeKiosk grid and Disney+. Repeated top/bottom swipes, Home, Recents, and Back also
    left the same allowed task focused. The custom close button returned Disney+ to the
    locked grid, and five bottom-right taps still opened the PIN route without removing
    the four edge guards.

## WAF side-menu control discovered on 2026-08-08

- The two handles and their expanded button columns are `TYPE_SYSTEM_ALERT` (`type=2003`)
  windows from `com.xbh.navisetting`. FreeKiosk's built-in touch regions are
  `TYPE_APPLICATION_OVERLAY`, one layer below them, so enlarging those regions cannot block
  any button owned by the OEM side menu.
- The signed OEM app has no configurable opacity or window-layer setting. Its window type is
  hardcoded, and modifying/re-signing the system APK would break its `android.uid.system`
  signature relationship.
- The OEM app does expose an exported controller provider:
  `content://com.xbh.navisetting.controller/{hide|show}`. It removes/restores both handles and
  every expanded-menu button without hiding or disabling the package.
- Live ADB verification succeeded:

  ```sh
  adb -s 192.168.0.37:5555 shell content update \
    --uri content://com.xbh.navisetting.controller/hide --bind request:s:kiosk
  # com.xbh.navisetting windows: 0

  adb -s 192.168.0.37:5555 shell content update \
    --uri content://com.xbh.navisetting.controller/show --bind request:s:kiosk
  # com.xbh.navisetting windows: 2
  ```

- `WafSideMenuPolicy.kt` uses this native provider at Lock Mode entry/exit.
  It also preserves and temporarily changes `NAVI_ENABLE_SHOW_KEY` and
  `persist.vendor.xbh.navigation.enable`, which the OEM service reads, so a service restart
  cannot bring the menus back during Lock Mode. Exit restores the exact prior values and asks
  the OEM provider to restore the menus immediately.
- The change was built as 1.2.34, installed in place, and verified without losing Device Owner,
  application data, the wallpaper configuration, managed apps, or ADB access.
- Live lifecycle verification showed zero `com.xbh.navisetting` windows and both OEM settings
  at `0` while Lock Mode was `LOCKED`. The emergency exit then restored Lock Task to `NONE`,
  `persist.vendor.xbh.navigation.enable=1`, `NAVI_ENABLE_SHOW_KEY` is unset, and both normal
  side handles are present.

## WAF Launcher3 taskbar control added on 2026-08-08

- The remaining bottom bar was the privileged `com.android.launcher3` `Taskbar` window
  (`TYPE_NAVIGATION_BAR_PANEL`), not a FreeKiosk view. It remained above application overlays
  and ignored `policy_control=immersive.full=*`, even while Lock Task was `LOCKED`.
- Live tests established the exact configuration boundary: at the stock 480dpi and at 576dpi
  Launcher3 reports `isTaskbarPresent:true`; at 577dpi it reports `isTaskbarPresent:false` and
  removes the Taskbar window. The normal SystemUI navigation window is then present only as a
  hidden zero-visible-region surface under the existing immersive policy.
- `WafTaskbarPolicy.kt` applies 577dpi only on devices exposing the Samsung WAF navigation
  controller, remembers the previous override, and restores it on kiosk exit. It is called by
  the coordinated WAF chrome policy, so every child-facing route/reapply and every
  normal/emergency exit uses the same lifecycle. The app SELinux domain cannot discover
  WindowManagerService through the
  `wm`/`cmd` clients, so the policy uses the already-authorized binder retained by Android's
  `WindowManagerImpl` and the verified Android 14 density transactions directly. The physical
  resolution remains 3840x2160.
- The existing two FreeKiosk touch regions over the side-button coordinates remain active but
  are forced visually transparent on WAF, preventing the guards themselves from appearing as
  replacement buttons after the OEM windows are hidden.
- Final verified build: `FreeKiosk-v1.2.37-arm64.apk` (version code 61), SHA-256
  `a89364df75875c14737f6d19a4fbb5dcef095a2932185c965a4abf1575ee6a64`.
- Lifecycle test passed on-device: the Volume Up x3 / Volume Down x3 emergency exit restored
  physical 480dpi (no override), Lock Task `NONE`, the XBH launcher, both OEM side menus, and
  `persist.vendor.xbh.navigation.enable=1`. Re-enabling Lock Mode through the authenticated ADB
  configuration restored 577dpi, Lock Task `LOCKED`, both OEM settings to `0`, and zero Taskbar
  or `com.xbh.navisetting` windows. A deliberate live change to 576dpi was self-healed back to
  577dpi by the in-app binder policy, proving the app—not ADB—owns the active restriction.

## Coordinated WAF chrome lifecycle added in 1.2.38

- `WafKioskChromePolicy.kt` owns the WAF side menus and bottom navigation/taskbar as one
  child-facing policy. The kiosk grid and allowed external apps hide both; PIN and Settings
  restore both, independently of whether Lock Mode itself is enabled.
- A two-second native reconciliation loop reapplies both controls while the kiosk is
  child-facing. Live fault injection passed: changing the density from 577dpi to 576dpi was
  repaired to 577dpi, and changing both OEM side-menu settings to `1` was repaired to `0`.
- Rapid route transitions now persist and clear the previous immersive/heads-up values
  synchronously, avoiding a stale `immersive.full=*` value after entering admin UI.
- The main window switches between edge-to-edge kiosk layout and fitted admin layout. The
  external-app wallpaper uses the physical screen extent, so hiding the phone-profile
  navigation surface leaves no bar-shaped fallback-color strip.
- On-device lifecycle verification passed with Lock Mode off: the child-facing grid showed
  no side handles, bottom controls, or residual bottom strip at 577dpi with both OEM settings
  at `0`; the PIN route restored 480dpi, both side handles, the bottom gesture bar, OEM values
  `null`/`1`, and cleared immersive/heads-up settings; **Back to Kiosk** hid both again.

## PIN chrome and density relayout fix added in 1.2.39

- Kiosk chrome state is now independent from the native tap-to-settings detector. Kiosk and PIN
  are child-facing and keep both WAF side menus and the Launcher3 taskbar hidden; only the
  authenticated Settings route restores OEM chrome. The native fallback tap detector remains
  active only on Kiosk, never on PIN or Settings.
- WAF's 480dpi/577dpi switch changes Android density without changing the 3840x2160 pixel measure
  specs. Fabric previously retained the old root dp constraint, producing a 4616px-wide logical
  surface after returning to Kiosk. This shifted the two-app grid center from x=1920 to x=2308
  and placed bottom-right controls beyond the physical display. `MainActivity` now refreshes
  React Native display metrics and Fabric root constraints immediately and after WAF relayout.
- Live tests on 1.2.39 passed: PIN remained at 577dpi with both OEM side-menu globals at `0` and
  no side handles visible; a forced 480dpi fault self-healed to 577dpi while the app grid stayed
  exactly centered (Disney+ `[1437,907][1898,1253]`, Netflix
  `[1942,907][2403,1253]`); five bottom-right taps still opened PIN after that density cycle.
- The configured admin PIN was not available for automated verification. One attempted default
  `1234` entry was rejected, leaving four attempts until the normal one-hour attempt reset; the
  authenticated Settings route itself was therefore not entered during this test.

## Verified on the SM-X800 tablet (historical)

1. FreeKiosk remains Device Owner after an in-place APK update.
2. Lock task remains `LOCKED` on the grid and while Netflix is foreground.
3. The status bar is disabled (`mDisabled1=0x7a60000`, `mDisabled2=0x1f`), and a
   notification-shade swipe does not expose the shade.
4. The kiosk home screen shows Disney+ and Netflix without the close-button overlay.
5. Netflix remains foreground after its startup activity transitions.
6. Both `OverlayService` and `KioskWatchdogService` remain foreground services while
   Netflix is active. The 136x136 close-button overlay remained at
   `[21,1493][157,1629]` across repeated checks.
7. The close button returns to the app grid, removes `OverlayService`, and leaves lock
   task active.
8. Home and Recents remain blocked while Netflix is active; no launcher, Recents, or
   Settings activity becomes foreground.
