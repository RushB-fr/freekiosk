# Changelog


All notable changes to FreeKiosk will be documented in this file.


The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

***

## [Unreleased]

### Added
- 🖧 **`--es cloud_token` now enrols a device from the ADB command line.** The cloud's "Headless install (ADB)" snippet on the Add Device page has advertised `--es cloud_token "TOKEN"` since the cloud shipped, but no build ever read the extra: the intent only stored the PIN, so a scripted enrolment silently did nothing and the operator had no way to tell. The extra is now recognised and written to the **same store the setup-wizard QR feeds** (`FreeKioskCloudEnrollment`), so it is consumed by the existing `CloudSyncService.consumePendingProvisioningEnrollment` on first launch with nothing added on the JS side.

  `--es cloud_url` comes with it, optional, defaulting to `https://cloud.freekiosk.app`. That default is not cosmetic: the consumer returns early when the stored URL is empty, so a token on its own would have been stored and then ignored, which is the same silent failure in a new place. Passing the URL explicitly is what a self-hosted instance will need. The token joins `pin` and the MQTT credentials in `ADB_SENSITIVE_KEYS`, so it is masked in the ADB logging rather than printed to logcat. **Not verified on a device**: it compiles, and the store and its consumer are the ones the QR path already exercises. What needs checking is a real `am start` with a fresh token ending on an enrolled device. Reported by a beta tester who found the page advertising a flag that did not exist.

- 🔄 **A long-press button can now restart the WebView from the kiosk itself.** Nothing on a locked device could recover a hung or stale page: the person standing in front of the screen has no access to Settings, so a dashboard that lost its WebSocket and stopped updating meant restarting FreeKiosk or rebooting the tablet, neither of which is practical on an unattended kiosk. A grey circular button in the top-right corner of WebView mode now fills a progress ring while it is held and restarts the WebView once the hold completes. A short tap does nothing, so a stray touch or a passer-by cannot trigger it. The hold duration is configurable from 1 to 10 seconds (5 by default) under `Settings > General`, and the ring is drawn with two clipped, rotated half-discs rather than by adding an SVG dependency. The button is hidden on the dashboard grid, where no WebView is mounted. Contributed by @paolo-lussignoli in #224, who also opened the request as #223.

- 📸 **Screenshots and camera snapshots are published over MQTT, and auto-discovered by Home Assistant** (#182). Both were reachable only through the REST API, which meant hand-written `camera:` YAML with a `still_image_url` and the embedded HTTP server exposed on the network just to see a tablet's screen. Each enabled stream now publishes a JPEG on its own topic (`{base}/{topicId}/image/screenshot`, `.../image/camera_front`, `.../image/camera_back`) and advertises an `image` entity, a `camera` entity fed by the same topic (the first reads well in Markdown cards and notifications, the second in `picture-glance`), a capture button, an auto-publish switch and an interval number. One set per camera actually present on the device, so a tablet with no front sensor advertises no front entities. Seven new commands come with it, from `screenshot_capture` to `camera_interval`, and disabling a stream clears both its discovery config and its retained image so nothing stale is left on the broker.

  Everything is **off by default** and nothing is captured until it is switched on in `Settings > MQTT`. Captures and publishing are fully native, on a dedicated capture thread: that is deliberate, because both `ScreenCapture` and `CameraPhotoModule` block on latches while MQTT commands arrive on the main thread, and because it keeps working while the JS thread is suspended, the same reasoning as the existing `screenOn` and `tts` handling. ⚠️ **Worth reading before enabling it**: a screenshot publishes whatever the kiosk displays, a camera snapshot publishes whoever is in front of it, images are retained on the broker, and TLS is only used when the broker port is 8883. The MQTT documentation now says so and suggests the broker ACL to match. Contributed, and tested end to end against Mosquitto and Home Assistant on a Xiaomi tablet under Android 16, by @cocoke in #225.

  Four defects were fixed on top of the contribution during review, none of which surfaced in that run. `stop()` interrupted the capture thread with `shutdownNow()`, and `CameraPhotoModule` closes its `CameraDevice` only after the latch it waits on, so an MQTT disconnect during a camera capture left the camera **held by the process**, breaking motion detection and every later snapshot until a restart. `restartTimers()` was not synchronized while its runnables re-post themselves, so two interleaved calls could leave two timer chains publishing the same stream for ever. An unparseable interval payload was clamped up to the 5-second minimum instead of being ignored, putting the device on the fastest capture loop on a typo. And the nine new settings keys were missing from `clearAll()`, so camera publishing survived a full settings reset. **Not verified on hardware** past what the contributor measured: the screen-off case in particular is expected rather than tested, and the periodic camera path has not been left running for long on a battery-powered device.

  Two decisions worth naming, both taken after the merge. The button is **off by default**: it draws a visible control over the kiosk page and lets anyone in front of the screen restart it, so it is opt-in like every other WebView overlay. And it **remounts** the WebView rather than calling `reload()` on it, so it restarts on the configured URL instead of reloading whichever page the user had navigated to. That is deliberate rather than an oversight: the case this was asked for is a page that has stopped responding, where a remount also recovers a dead render process and a `reload()` can go unanswered. The settings text says so instead of promising a reload of the current page. ⚠️ Two bounds are known and not yet addressed. The position is **fixed** at the top-right corner, so the 50x50 dp square it occupies is no longer clickable on the page underneath, which matters for a web app whose own controls sit there (the WebView back button, by contrast, is positionable in percent). And the setting has **no ADB key**, so a fleet provisioned by script cannot switch it on. **Not verified on hardware here**: `tsc` is clean, `npm test` passes and ESLint reports no new finding, but nothing was run on a device on our side. The contributor reports testing the interaction on a Samsung Galaxy Active 5 running Android 16.

- 🧰 **Two provisioning scripts, for boxes where Device Owner and boot launch fail with errors that name the wrong thing.** Provisioning an MXQ/Droidlogic TV box (Android 9, SDK 28) failed three times over, and none of the three errors pointed at its cause. `dpm set-device-owner` reports **every** failure with the same opaque `RuntimeException: Can't set package ... as device owner`, so the operator is left guessing between accounts, secondary users, an existing owner and half a dozen other preconditions. `scripts/set-device-owner.ps1` checks each one separately and names the blocker.

  On that box the blocker was none of the usual ones: the ROM omits the **`android.software.device_admin` system feature**, so `DevicePolicyManagerService` runs with `mHasFeature = false` and `setDeviceOwner()` returns `false` unconditionally. Worse, `setActiveAdmin()` is a silent no-op on the same flag and **`dpm set-active-admin` prints `Success:` regardless, because it never checks the return value** — which is why the obvious diagnostic says the admin was registered while `dumpsys device_policy` stays empty. `-Fix` declares the feature in `/system/etc/permissions` and reboots, on a `userdebug`/`eng` ROM that grants `adb root`.

  With Device Owner set and both **Launch on Boot** and **Set FreeKiosk as default launcher** switched on, the app still never came up after a reboot, for two further and independent reasons. `ACTION_BOOT_COMPLETED` is **never delivered to third-party manifest receivers** on this ROM, so `BootReceiver` never runs; hand-delivering `QUICKBOOT_POWERON` to the same receiver starts the kiosk correctly in four seconds, so the app-side logic was never at fault. And the **Home intent is resolved while user 0 is still locked**, which filters out `MainActivity` (not `directBootAware`) and hands Home to the OEM launcher — the Device Owner policy is registered correctly, it is simply never consulted, and Android does not re-resolve Home after unlock. `pm disable-user` on the OEM launcher does not help either: the ROM re-enables it at boot. `scripts/install-boot-autostart.ps1` installs an init hook that starts `MainActivity` once user 0 unlocks.

  ⚠️ Both `/system` changes are **per-box provisioning steps, not properties of the image**: neither survives a factory reset or an OTA that rewrites `/system`, and neither is possible at all on a `user` build without `adb root`. The boot hook is a **workaround for a bad ROM, not a product fix** — a `directBootAware` Home activity would address the second cause properly in the app, and `.HomeActivity` is the natural candidate. ⚠️ Also worth knowing when clearing a device down: `dpm remove-active-admin` refuses a **non-test admin**, so on a release APK the Device Owner cannot be removed over ADB at all and a factory reset is the only supported route; the script says so rather than reporting a bare `SecurityException`. `scripts/device/*` is pinned to LF in `.gitattributes`, because a CRLF shebang is not a valid interpreter path and init will not parse a CRLF `.rc` — on Windows the repo's `* text=auto` would otherwise hand a teammate a script that fails on-device for reasons having nothing to do with the ROM.

  **Verified on hardware, on one box only.** The feature patch was confirmed by `dpm set-device-owner` succeeding after the reboot, and the boot hook by three consecutive reboots reaching a launched kiosk on the first attempt each time. Everything here is Windows tooling and documentation: **no app, Gradle or manifest code is touched and nothing ships in the APK**. What has not been exercised is the confirmation prompt added to `set-device-owner.ps1` after the box was unplugged (the scripts parse and the y/N matching is unit-tested, but the prompt has not run against a device), the `-Fix` branch driven end to end through the script rather than by hand, and any ROM other than this one — the failure modes are documented as observed on a Droidlogic box, not as general truths about Android TV.

### Fixed
- 🛡️ **The permission wizard told a Device Owner that everything was granted automatically, which is not true of two of them**: the banner read *"Managed mode (Device Owner). Permissions are granted automatically; you can finish right away."*, so an operator provisioning a fleet closed it without granting anything. **Display over other apps** and **Usage access** are appops rather than runtime permissions, and Android exposes no way for a Device Owner to grant them to itself (`setPermissionGrantState` covers dangerous runtime permissions only). Without the overlay the blocking overlay and the secret tap zone never appear, so on a QR-provisioned device there was no way out of an external app; without usage access, external-app mode cannot detect and relaunch the foreground app. The banner now names those two and says why they still need a tap each. The wizard already listed both with a working *Grant* button that deep-links to the right system screen, so nothing else had to change.

  This does not make the rollout hands-off, it makes the wizard honest: those two taps per tablet remain. An exit path that does not depend on the overlay while an external app is in front would remove them, and that is design work rather than a fix. Reported by a beta tester provisioning tablets for external-app kiosks.

- 📌 **A QR-provisioned device landed on the stock launcher, so FreeKiosk never started**: the wizard completed and the enrollment token was stored, but Home pinning threw and the tablet booted to the system launcher with FreeKiosk installed and idle, which costs the zero-touch enrollment its trigger. `DeviceAdminReceiver.kt` carried `import android.app.admin.DeviceAdminReceiver` alongside its own `class DeviceAdminReceiver`. **In Kotlin an explicit import outranks a same-package declaration**, so every `DeviceAdminReceiver::class.java` *in that one file* resolved to the framework class, and `pinHomeLauncher` handed `DevicePolicyManager` a component named `com.freekiosk/android.app.admin.DeviceAdminReceiver`, which it rejected: `SecurityException: Admin ComponentInfo{...} does not exist or is not owned by uid`. `KioskModule` builds the same component and always worked, because no other file in the project carries that import, which is why pinning succeeded as soon as the app was opened by hand. The supertype is now spelled out inline instead of imported, so the name resolves locally; verified in the bytecode, where the class literal is `com/freekiosk/DeviceAdminReceiver` rather than the framework one.

  This defect is older than the 2.0.0-beta.2 provisioning fix and survived it untouched. It only became visible because beta.2 replaced an empty `catch {}` with a real log line, which is the whole argument for not swallowing exceptions. Diagnosed down to the shadowed import, with the log line and the fix, by a beta tester provisioning a fleet of Galaxy Tab S10 FE.

***

## [2.0.0-beta.2] - 2026-09-02

### Added
- 🗂️ **Dashboard mode can be provisioned over ADB.** The ADB config intent worked off a fixed list of recognized keys, and the two the dashboard uses (`@kiosk_dashboard_mode_enabled`, `@kiosk_dashboard_tiles`) were not among them, so a fleet deployed by script could set a URL, a PIN and a lock package but had to have its tile grid entered by hand on every tablet. `--ez dashboard_mode true` and `--es dashboard_tiles '[{"label":"Main","url":"https://..."}]'` now work, as do the same two keys inside `--es config`. Tiles are normalized on the way in: `id` and `order` are generated when absent (a provisioning script should not have to invent stable ids or keep a counter), `label` falls back to the URL, an unknown `iconMode` falls back to `favicon`, and a tile with no `url` is dropped rather than written as an entry that navigates nowhere. Enabling the dashboard also sets `display_mode` to `webview` unless `lock_package` says otherwise, because `KioskScreen` only renders the grid under that mode and the setting would otherwise be written but never read. **Not verified on a device**: it compiles, and the path it writes through (SharedPreferences pending config, then `multiSet` into AsyncStorage) copies strings verbatim, so the serialized array arrives in the shape `getDashboardTiles()` parses. What needs checking on hardware is a full provisioning run ending on a working grid. Requested by e-mail by a user deploying tablets by script.

### Fixed
- 🤝 **Device Owner QR provisioning failed on its very last step, leaving a tablet managed but never launched**: on a factory-reset Galaxy Tab S10 FE (Android 16 / One UI 8.5) the APK downloaded, installed and became Device Owner, then the setup wizard reported *"Couldn't set up device"*; after a restart the tablet booted to the **stock launcher** with FreeKiosk installed but never launched, never enrolled and not pinned as Home. This was first misdiagnosed as Google's new [approved-DPC allowlist](https://support.google.com/work/android/answer/16694822) blocking the install. It was not: `firstInstallTime` preceded any ADB action and `dpm list-owners` listed `com.freekiosk`, so the DPC install and the Device Owner assignment had both succeeded and the failure sat downstream of anything Play Protect polices. `ACTION_ADMIN_POLICY_COMPLIANCE` is the final provisioning step and **the device is not provisioned until the DPC hands `RESULT_OK` back**, but `PolicyComplianceActivity.onCreate` ran two operations *before* that hand-off and one of them was unguarded: reading the enrollment token out of the provisioning admin-extras bundle. Anything throwing there killed the activity before it could confirm, and a failed `SharedPreferences` write could therefore cost a tablet its entire provisioning.

  Four changes. `setResult(RESULT_OK)` now comes **first and unconditionally**, and the bookkeeping runs best-effort behind it: our own housekeeping must never be able to fail a device's enrolment. The admin extras are read **without asserting their concrete type** — the one-arg `getParcelableExtra` is deprecated and its inferred generic compiles to an *unchecked cast*, so a `Bundle` where a `PersistableBundle` was expected threw `ClassCastException`; both are now accepted. The extras-to-preferences logic, which existed **twice** with the same latent cast (once in the activity, once in `DeviceAdminReceiver` for the legacy `PROFILE_PROVISIONING_COMPLETE` path), is now one shared function. And `pinHomeLauncher` no longer swallows exceptions into an empty `catch {}`, which is precisely why a device landing on the stock launcher left nothing to diagnose; it logs its failures and says so when it is not Device Owner. Logging goes through `android.util.Log` rather than `DebugLog`, which is a no-op outside debug builds — this code path only ever runs on a release APK on a real tablet.

  ⚠️ **The exact exception is still unconfirmed.** A DropBox trace was requested from the reporter and had not arrived when this shipped; logcat buffers are in-memory and were lost to the reboot. The fix makes the hand-off independent of it either way, which is the point, but if the wizard was failing for a reason *outside* our activity then this is necessary and not sufficient. **Not verified on hardware**: it compiles, and what needs checking is a full factory-reset QR run reaching a launched, enrolled kiosk. Confidence is high on the wizard error being gone, **lower on the Home pinning and the auto-launch** — those may prove to be a second, separate defect that only becomes visible once the first is cleared, and the new logging is there to show it. Reported, diagnosed and corrected by a beta tester, who also ruled out the Play Protect hypothesis we were chasing.

- 🔙 **The power menu closed by itself after two seconds, so the device could not be powered off from the button** (#248): with the power menu allowed, `MainActivity.onResume()` defers its lock-task re-entry rather than dismissing the menu, which is correct, but the deferral was a flat `postDelayed(..., 2000L)`. Two seconds is less time than it takes to read a power menu and choose "Power off", so `startLockTask()` ran while the menu was still up and took it with it: the reporter could turn the screen off but never reboot or power down. The re-lock now waits for **window focus** instead, which is the signal that fires when the menu is actually dismissed and the same one the print-dialog handling in this file already uses (#249). In the common case that re-locks *sooner* than the old timer did, because focus returns as soon as the user taps or dismisses; in the slow case it no longer cuts them off mid-menu. The timer survives only as a bound, not as the mechanism: if focus never comes back, because the menu was left open and the user walked away, the re-lock happens anyway after 15s. ⚠️ That relaxes #98's "a reboot must not dodge the lock" by up to 15 seconds, against 2 before, and only on a device whose admin has explicitly allowed the power menu, after a deliberate power-button press. With the power button blocked, nothing changes at all. **Not verified on hardware**: it compiles and the reporter's device is not available here, so what needs checking is that a long press now shows a menu that stays up, and that a short press still only turns the screen off. Note that a **short press turning the screen off is standard Android**, not something FreeKiosk does, and that half of the report is expected behaviour. The second half of #248, no soft keyboard in the Android system settings, is **not addressed**: it does not reproduce here and the report does not yet say whether the device is Device Owner or which setting was turned off, so there is no diagnosis to act on. Reported by @metingul.

- 🔅 **Brightness did not survive a screen-off cycle, and the reported value hid it** (#242): brightness was applied as a **window attribute only** and `Settings.System.SCREEN_BRIGHTNESS` was never written, so every wake path handed the panel back to a system value FreeKiosk had never touched. On the reporter's Galaxy Tab A that value was 14/255, which is why a screen set to 80% came back at roughly 5% after any screen off and on, whether triggered by MQTT/REST, the sleep scheduler, or simply plugging the charger in (Samsung wakes the display on a power-state change). The reporter found three sites blanking the override to `BRIGHTNESS_OVERRIDE_NONE`; there were **six**, the same four lines copy-pasted through `ScreenController`, `ScreenStateReceiver`, `KioskModule`, `ScreenSchedulerReceiver` and `AutoBrightnessModule`. They are now one helper, `BrightnessPrefs`, which re-applies the level FreeKiosk was asked to hold instead of discarding it. With nothing stored it still blanks the override, which is the previous behaviour and the right one for a fresh install. The requested level is now kept in **two** places, on purpose: in SharedPreferences, because the wake paths are broadcast receivers running with no JS thread and AsyncStorage is out of reach (this mirrors what `keep_screen_on` already does), and in `Settings.System.SCREEN_BRIGHTNESS`, so the value the platform falls back to is the one that was actually asked for. That second write is what makes brightness survive an app restart or a reboot rather than only a screen-off cycle. As **Device Owner** it goes through `DevicePolicyManager.setSystemSetting()`, which covers `SCREEN_BRIGHTNESS` and needs no permission and no prompt; otherwise it needs `WRITE_SETTINGS`, which the user has to grant from the system screen (`AutoBrightnessModule.requestWriteSystemBrightnessAccess()` opens it). Adaptive brightness is switched to manual at the same time, because it would otherwise overwrite the value from the light sensor within a second. ⚠️ `WRITE_SETTINGS` is **stripped from Play Store builds** via the `src/playstore` overlay, same as the Doze exemption, so a Play build keeps the window override and the SharedPreferences mirror but not the reboot-proof part. Disabling brightness management entirely (#65) still works and now also clears the stored level, since re-applying it on every wake is exactly what that opt-out asks us to stop doing, and puts the adaptive-brightness mode back the way it was found rather than leaving it switched off for ever.

  Two guards worth naming, because re-applying a stored level is not free. A **persisted** level is floored at 2%: `0` is a legitimate transient value, it is how the screensaver makes the screen look off, but a terrible thing to store, and both the manual brightness slider and the REST `setBrightness` action accept it. Before this change a `0` self-healed on the next wake because the override was blanked; re-applying it instead would have brought the kiosk back **black, for ever, with no recovery path**, which is worse than the bug being fixed. The transient path is untouched, so the screensaver still dims to nothing. Second, when the effective-brightness read fails, status falls back to the requested level rather than to an initialiser, so a device where the native call does not work reports what the old code reported instead of a flat 50%.

  The reporter's secondary point, that the reported value did not match the panel, was correct and had **three** independent causes, not one. `KioskScreen` published the stored target to REST and MQTT, which is the `brightness: 100` they saw while the panel sat at 14/255. `AutoBrightnessModule.getBrightnessLevel()` fell back to the last value it had been *asked* for whenever the window override was absent, which is precisely the moment the two diverge. And `DeviceControlService.getScreenStatus()` reported an in-memory field that only a method with **no callers** ever wrote, so it returned its `0.5` initialiser for the entire life of the process: since `CloudSyncService` sends `status.screen.brightness` on every 30-second heartbeat, **the cloud dashboard showed 50% brightness for every device, always**. That one was found while fixing this issue and was not in the report. All three now read the level actually in effect: the window override when one is set, the real system value otherwise. One bound worth stating: Android has no brightness-changed broadcast, so a change made outside FreeKiosk is only picked up on the next refresh (a new target, or the screensaver going on or off), not the instant it happens. Polling for it would cost a wake-up every few seconds on a battery-powered kiosk.

  **Not verified on hardware**: it compiles, `npm test` and `tsc` pass, and no new lint finding is introduced, but none of this has been run on a device. What needs checking is the reporter's own sequence, that is set 80%, screen off, screen on, and confirm the panel returns to 80% and that `/api/status` agrees with `settings get system screen_brightness`. Two things to watch specifically: `Settings.System.SCREEN_BRIGHTNESS` is assumed to run 0-255, which is conventional but not universal and has no public API exposing the real maximum (a panel with a higher range will read dimmer than requested rather than fail, which is why the window override is kept as the primary mechanism), and the Device Owner path via `setSystemSetting()` has not been exercised. Reported in detail, with the root cause already diagnosed, by @GarethBlain.

- 🗝️ **Most ADB configuration keys were silently ignored** (#240): the config intent worked off a hardcoded list of recognized keys, and a key outside it was dropped without a log, a toast or a non-zero exit, so `am start` printed `Starting: Intent...` and the operator had no way to know the setting had not applied. On the reported command, **34 of the 45 keys passed were ignored**, including everything under `return_*`, `url_filter_*`, `screen_scheduler_*`, `webview_zoom_*`, `keep_screen_on`, `pdf_viewer_enabled` and `display_mode` itself. A second, separate cause hit `kiosk_enabled`: it was read with `getBooleanExtra`, so `--es kiosk_enabled "true"` passed a String, `getBooleanExtra` returned its `false` default, and the command turned Lock Mode **off** while appearing to turn it on. Three changes: (1) the recognized keys, the direct extras and the `--es config` JSON mapping are now derived from one shared table (`ADB_SIMPLE_KEYS`), so the three lists that used to drift apart cannot any more, and 78 keys are supported where the JSON mapping previously covered 31; (2) values are read as raw extras and stringified, so `--es`, `--ez` and `--ei` are interchangeable for every passthrough key; (3) unrecognized keys are named in a toast and in logcat. An explicit `display_mode` also now survives being passed alongside `url`, instead of being overwritten. Credentials (`pin`, `rest_api_key`, `mqtt_password`, `mqtt_username`) are masked in the new logging. **Not verified on a device**: it compiles and the reported command's 45 keys are all recognized, but a provisioning run confirming each setting lands in the UI has not been done. Reported by @tlindz.

- 🔓 **A stalled boot could leave a Device Owner device locked on "Starting kiosk…" forever** (#243): `BootLockActivity` has carried a 2-minute safety timeout since it was introduced in #98 (April 2026), meant to hand the device back if `MainActivity` never takes over. It never worked. The timeout called `finish()` on its own, and lock task absorbs a `finish()`, the exact platform behaviour #222 diagnosed and worked around four months later by calling `stopLockTask()` first. That workaround was applied only to the #222 branch, twenty lines below, in the same function: `stopLockTask()` appears exactly once in the file's whole history. So both existing safety nets were gated on `isDeviceSecure() == true && isUserUnlocked() == false`, and a device with **no** secure lock screen armed neither of them, hit the timeout, absorbed it, and kept polling forever with no way out. The only escape was `adb install -r -d` from an already-authorized computer, which is out of reach for anyone who never authorized ADB on that device: the RSA prompt is itself an activity, and lock task blocks it. The timeout now calls `stopLockTask()` before `finish()`, once, and only when `MainActivity.hasStarted` is false. That bound matters: if `MainActivity` never started then React Native never ran, no kiosk configuration was ever applied, and lock task is guarding a black screen rather than a kiosk, so nothing is weakened. Where `MainActivity` has started, the previous behaviour is unchanged. ⚠️ This does relax the #98 guarantee ("a reboot must not dodge the lock") by up to two minutes, but only on a boot that has already failed, on a device where the kiosk never came up. **Not verified on hardware**: the stall could not be reproduced here, the same limitation as #222. The change compiles, and what needs checking on a device is that a healthy boot never reaches the timeout at all (hand-off normally happens in a second or two via `isMainActivityReady()`), so the new branch stays dead code on a normal boot. Reported by e-mail after a user was locked out of a Ulefone phone with ADB unauthorized.

***

## [2.0.0-beta.1] - 2026-08-28

- ☁️ **FreeKiosk Cloud is switched on.** The groundwork shipped compiled-but-disabled in 1.2.20-beta.6 (`CLOUD_ENABLED`) is now active, which is what takes this line to 2.0. It remains a **closed beta**: the platform is invitation-only and the app is handed out from the dashboard. This entry gathers the whole cloud feature, previously listed as unreleased, together with the defects found while validating it on a device.

### Added
- ☁️ **FreeKiosk Cloud integration, remote fleet management**: FreeKiosk can enroll into [FreeKiosk Cloud](https://cloud.freekiosk.app), the companion SaaS platform, to be monitored and managed remotely from a web dashboard. A device enrolls with a one-time token (Advanced → Cloud Management), after which it speaks to the cloud over the documented REST contract (`/api/v1/…`, `Authorization: Bearer fk_…`). Once enrolled it does three things on a rolling **30-second heartbeat** (`POST /devices/{id}/heartbeat/`): (1) reports live **telemetry** for the dashboard, that is battery level and charging, Wi-Fi SSID and signal, IP, screen on/off and brightness, current URL, kiosk and Device Owner state, model, manufacturer, Android version, free storage and memory, uptime, app version, and the device's capability list; (2) performs two-way **config sync**, pushing its current settings up (change-detected via a config hash so nothing is sent when nothing changed) and applying a config the dashboard pushes down (`sync_action: "apply"`), reloading the running kiosk in place so remote changes take effect without a restart; and (3) when the heartbeat reports pending work, pulls and executes **remote commands**. All settings, including secrets such as the PIN, API key, MQTT and basic-auth passwords, are synced through a dedicated `sensitive_config` channel and stored in the Keychain, never in plain config. The whole feature is **opt-in and inert until you enroll**: nothing is sent to any server otherwise. ⚠️ **Enrolling wipes the tablet's local FreeKiosk settings**, which then come from the cloud. Leaving cloud management wipes them again.

- 🕹️ **Remote commands and OTA app updates from the dashboard**: Enrolled devices consume a cloud command queue (`GET /devices/{id}/commands/`) and report each outcome back (`POST /commands/{id}/result/`). Supported: `reload`, `clear_cache`, `screensaver_on`/`screensaver_off`, `wake`, `speak` (TTS), `play_sound`/`audio_stop`, `toast`, `execute_js`, `launch_app`, `reboot`, and `screenshot` (captures the current screen and uploads the PNG to `POST /devices/{id}/screenshot/`). Commands that complete natively take the native path directly, so they work whatever the JS thread is doing; the rest fall back to the shared `ApiService.executeAction` used by the local REST and MQTT server. Expired commands are skipped and overlapping polls de-duplicated, so a command cannot run twice. Note that `screen_on` / `screen_off` are deliberately **not** offered by the dashboard: turning a device's screen off puts it into Doze where it stops heartbeating, so the matching `screen_on` could never reach it. Timed on/off is handled by the on-device Screen Scheduler instead. A separate authenticated **update channel** (`GET /devices/{id}/updates/`) delivers **over-the-air APK installs**: FreeKiosk downloads the signed APK with its device key and installs it via the native `ManagedAppInstallerModule` (silent as Device Owner, system installer prompt otherwise). The download is restricted to **HTTPS** and, before a silent install, the downloaded APK's package name is verified against the expected package, which the cloud reads from the APK itself at upload, so a cleartext or intercepted download cannot substitute a different app.

- 📷 **QR-code and zero-touch enrollment**: The Advanced → Cloud Management screen can **scan the enrollment QR**, and the cloud URL defaults to `https://cloud.freekiosk.app`. Devices provisioned as **Device Owner via the Android setup-wizard QR** enroll **zero-touch**: on first launch FreeKiosk consumes the token handed over by provisioning, auto-enrolls, and (Device Owner only) pins itself as the persistent Home launcher so there is no "choose launcher" prompt, which the dashboard can still override later. The server can also **remotely un-enroll and wipe** a device (via `force_unenroll` or a 401/403), clearing all settings and Keychain secrets and returning it to a clean state.

- 📲 **Device Owner provisioning via setup-wizard QR (fully-managed enrollment)**: The native pieces that let a factory-reset device become a managed FreeKiosk kiosk by scanning a QR at the Android setup wizard, the standard Android Enterprise flow. Two provisioning activities (`ProvisioningModeActivity` for `GET_PROVISIONING_MODE`, which always requests a fully-managed device, and `PolicyComplianceActivity` for `ADMIN_POLICY_COMPLIANCE`) are **required on Android 12+**, without which the wizard aborts with "Can't set up device". The cloud packs `{ enroll_token, cloud_url, org_id }` into the provisioning admin-extras bundle; it is read on both the modern path (`PolicyComplianceActivity`) and the legacy `PROFILE_PROVISIONING_COMPLETE` path (`DeviceAdminReceiver`), persisted, and consumed on first launch for the zero-touch enrollment above.

- 🧭 **Guided permission wizard and device capability reporting**: A `PermissionWizard` (shown right after enrollment and reachable from settings) walks the device to its fullest capability set: as **Device Owner** it confirms everything is auto-granted and can enable the accessibility service programmatically; as a **standard app** it steps through each runtime and special-access permission (camera, location, accessibility, display-over-apps, usage access, battery-optimization exemption) with a deep link into the relevant system screen and a live status refresh when the app returns to the foreground. On close it fires a heartbeat so the refreshed capabilities reach the cloud immediately. Backing it, a `capabilities` probe reports what the device **actually** supports (baseline actions always, plus `device_owner`, `reboot`, `silent_install` and `screen_off_lock` when Device Owner, and `accessibility`, `overlay`, `usage_access`, `camera`, `location` and `bluetooth` when granted) at enrollment and on every heartbeat, so the dashboard only offers actions that can really run.

- 🔋 **Cloud comms stay alive with the screen off**: `CloudSyncService` holds a `PARTIAL_WAKE_LOCK` and a `WifiLock` while running (released when it stops) and requests a Doze battery-optimization exemption on start, without which the device drops off the cloud and can no longer be woken remotely. Both are best-effort; the Doze-exemption permission is **stripped from the Play Store manifest** for policy compliance. The config round-trip was also rounded out so lockscreen, launcher, zoom, screensaver and media-player keys are included in both cloud sync and local backup/restore.

### Fixed
- 📡 **A cloud-managed tablet went offline two minutes after launching an external app, while running perfectly**: in External App mode the heartbeat stopped completely, so the dashboard reported the device as unreachable and no remote command could arrive. Measured: **zero heartbeats over three minutes**. The cause is not Doze or a killed process, both ruled out (the process stays alive at normal priority, and a foreground service changes nothing): React Native **stops dispatching JS timers when the activity pauses** (`JavaTimerManager.onHostPause` clears the Choreographer callback that drives `setInterval`), and the heartbeat loop is a JS timer. It is now driven from a native ticker in `KioskWatchdogService` through a **headless task** (`CloudHeartbeatTaskService`), which is the supported way to re-arm those timers; a 20 s debounce collapses the duplicate beat the wake-up would otherwise produce. Measured after the fix: **six heartbeats, thirty seconds apart**, with commands and screenshots executing while the external app stays in front. The keep-alive foreground service introduced for MQTT in #234 now also covers an enrolled device, so the process survives OEM battery managers.

- 🔁 **A remote `reboot`, and a self-update, never reported its outcome and stayed "sent" for ever**: the server only ever hands out *pending* commands, so nothing redelivered a command whose device died while executing it, and the dashboard could not tell a successful reboot from one that never ran. Commands are now persisted before dispatch and settled on the next start: a command expected to take the device down reports success, anything else reports honestly that it was interrupted. A result the network refused is queued and retried instead of being dropped.

- ⚙️ **A cloud command was less reliable than the same command over the local REST API**: the cloud channel dispatched everything through the JS layer, while the local REST server has always executed a good part of its commands natively. `tts`, `reboot`, audio, lock, remote-key and keyboard commands now take that same native path from the cloud, so they work whatever the JS thread is doing. `play_sound` was falling through to JS over a plain name mismatch (`playSound` vs `audioPlay`) and is now aliased.

- 🖥️ **A display-mode change pushed from the dashboard was stored and echoed back, but never applied**: the tablet reported the new mode and its URL to the cloud while still showing the external app, so the dashboard displayed something that was not true. FreeKiosk now returns to the foreground on such a change, with the same `blockAutoRelaunch` guard the REST/MQTT `setMode` path received in #209 so the app just left is not relaunched.

- 📦 **After an update, a kiosk in External App mode was left with no watchdog, no overlay and no heartbeat until someone touched it**: Android restarts the process only for what it still binds (in practice the accessibility service) and never recreates `MainActivity`, and the launched app keeps the foreground, so nothing brought FreeKiosk back. `BootReceiver` now handles `MY_PACKAGE_REPLACED` and restores the services, relaunching the activity only on devices configured to run unattended so an ordinary Play Store update does not yank the app to the front. This is also the path a cloud OTA update takes.

- ⬆️ **In-app updates never offered a newer beta**: the settings screen compares the GitHub tag against the installed `versionName` and ranks a version with no pre-release suffix above any pre-release. Since `versionName` stayed at `1.2.20` for every beta, an installed beta always looked like a stable release, so `1.2.20-beta.6` was reported as older than the running `1.2.20` and the app answered "you are up to date". This had been true since 1.2.20-beta.1. The version now carries its pre-release suffix (`2.0.0-beta.1`), so the comparison behaves as written: a beta offers the next beta, and a stable release still supersedes any beta.

- 🔋 **The permission wizard listed "Ignore battery optimizations" as outstanding for ever, and tapping it did nothing**: the request is a no-op once the exemption is held, and the step never read the state back although the native API for it has existed since #234. It now shows the real state.

- 🧭 **The wizard's accessibility button landed on the plain settings list**, where OEM skins bury third-party services (One UI files them under "Installed apps") and users could not find FreeKiosk. It now opens the service's own page directly, falling back to the old behaviour where a manufacturer does not support that.

- 🔓 **A startup that hung left the tablet pinned with no way out** (#238): without Device Owner, `checkAndStartLockTask()` pins the screen from `onCreate`, long before React Native has started. That is deliberate (#98: pin fast, so that the minute RN takes to load on low-end hardware is not an escape window), but it means a JS startup that never completes leaves a frozen app pinned on screen. The reporter's Echo Show hung on the "Loading…" splash after a reboot, and the only recovery was `adb shell am task lock stop`, which no ordinary user has. Worse, `force-stop`ing the pinned app left Android in `mLockTaskModeState=PINNED` with an empty `mLockTaskModeTasks`, still enforcing "only the pinned app may run" for a task that no longer existed, so even relaunching FreeKiosk itself failed with `Attempted Lock Task Mode violation`. `MainActivity` now leaves pinning if JS has not completed a settings load after 90s, using the `broadcastSettingsLoaded()` signal `loadSettings()` already emits on every load. Nothing is lost when the app is merely slow: `KioskScreen` calls `startLockTask()` itself at the end of its own load, so it re-pins. Bounded on purpose, in three ways: never applied under Device Owner, where lock task is the security boundary rather than a convenience and where `BootLockActivity` has its own recovery path; 90s, because RN legitimately takes one to two minutes on the hardware this behaviour was written for, and a nervous valve would unpin a kiosk that is merely booting; and the real lock task state is read before acting, so the whole thing is a no-op if pinning never happened. ⚠️ **This does not fix the hang itself**, whose cause is still unknown and may lie in the reporter's LineageOS WebView. It makes the hang survivable without ADB, which is the part that made the failure dangerous for an unattended kiosk. **Not verified on hardware**: the hang does not reproduce here, so what needs checking on a normal Basic Mode boot is that "JS never finished starting" never appears in logcat and that the device stays pinned. Reported by @rustyisacat.

- 📁 **`file://` URLs failed with `net::ERR_ACCESS_DENIED` even with PDF Viewer enabled** (#239): the `pdfViewerEnabled` setting drives `allowFileAccess`, `allowFileAccessFromFileURLs`, `allowUniversalAccessFromFileURLs` and the `file://*` entry of `originWhitelist`, and it was read 200 lines and five `await`s after `setUrl()` in `KioskScreen`. Each `await` ends a React batch, so the WebView mounted with the `file://` URL while the flag still held its `false` initial value: Chromium refused the load immediately, and flipping the prop milliseconds later changed nothing, because the page had already failed and `webViewKey` had not moved. The "automatic reload in 5 seconds" recovery could not rescue it either, since these Android `WebSettings` only apply to a page loaded after they are set, and a `reload()` on the same instance is not a fresh WebView construction. This is why the reporter saw the setting confirmed present in the SQLite store both before and after a genuine cold start and still got the same denial every time. The setting is now applied in the same batch as the URL, and a change of value bumps `webViewKey`, so toggling PDF Viewer from the settings screen takes effect on return instead of silently doing nothing. At startup that costs a key value, not a second load. `docs/faq.md` also still claimed only HTTP/HTTPS was supported with local files "coming in v1.1", three minor versions stale against code that already accepted a `file://` URL in Website mode; it now documents `file://` and, more importantly, that PDF Viewer is what grants file access, which is not discoverable from the UI. Reported by @rustyisacat.

***

## [1.2.20-beta.6] - 2026-08-24

- 🧪 **Note on the cloud integration**: the groundwork for [FreeKiosk Cloud](https://cloud.freekiosk.app) (enrollment, heartbeat, remote commands, OTA updates, QR provisioning) is compiled into this build but **switched off behind a build flag** (`CLOUD_ENABLED`), so its settings section is hidden and none of its code runs. It is neither released nor supported yet, which is why it is not listed below. It will be documented in a later release.

### Added
- 🖐️ **Proximity wake (hardware sensor)**: New Display → Screensaver → "Enable Proximity Wake" toggle (`ProximityDetectionModule`) that wakes the screen when a hand or body comes within a few centimeters of the **front proximity sensor**. It behaves like camera motion (cancels the pre-check window or dismisses an active screensaver) but is a short-range binary hardware signal, so it never false-triggers on lighting/scene changes and uses almost no battery. The listener runs only during the motion pre-check and while the screensaver is showing, and only on devices that actually have the sensor (auto-detected; the toggle is disabled with an explanatory note on tablets without one). Ignored during scheduled sleep.

### Changed
- 🎨 **App design refreshed to match the FreeKiosk Cloud dashboard**: The light theme was re-aligned with the cloud's brand: primary blue `#2b7fff`, navy text (`#1b2a4d`), soft blue-tinted surfaces, aligned status colors, larger corner radii (cards 16, fields/buttons 12) and softer premium card/button shadows with hairline borders. Throughout the UI, legacy **emoji used as icons were replaced with proper MaterialCommunityIcons vector icons**: settings switches, info-box titles, tab bar, the Wi-Fi/Bluetooth/Audio dialogs, lock-screen quick controls, Android-settings shortcuts, the first-run welcome and error/return overlays, the media-player empty state, and the schedule/event and backup-restore editors. Decorative emoji were stripped from labels, statuses and native alert titles. Native Picker dropdowns and injected HTML media-control glyphs are unchanged.

### Fixed
- 💡 **Screen no longer reliably turned on by `screen_on` / screensaver / scheduler wake on Android 12+**: The old wake path (a deprecated `ACQUIRE_CAUSES_WAKEUP` wake lock plus `setTurnScreenOn` on an already-created activity) stopped actually lighting the display after `lockNow()` on Android 12+ and several OEM ROMs, so remote `screen_on`, screensaver dismissal and the sleep scheduler could leave the screen dark. `ScreenController.turnScreenOn()` now also raises a high-importance **full-screen-intent notification** (the alarm / incoming-call pattern) that makes the system wake the screen and bring `MainActivity` to the front, with a direct `startActivity` as belt-and-suspenders. Added the `USE_FULL_SCREEN_INTENT` permission (on Android 14 without the special access it is demoted to a heads-up notification, which still wakes the screen). Note: touch still cannot wake a truly-off screen, this only drives the app-initiated wake paths.

- 🔆 **Screen stayed dark after a dim screensaver was dismissed**: The dim screensaver forces the brightness down to `screensaverBrightness` (often 0); on deactivation FreeKiosk went straight back to auto-brightness without first restoring a visible level, so the display could stay black until the next brightness change. It now restores the default brightness before handing back to auto-brightness. The same explicit restore was added to the proximity/motion wake paths.

- 🔙 **"Back Button Behavior" was ignored in External App mode (always relaunched instantly)** (#220): In external-app mode, Test Mode and Delayed Return had no effect: pressing the system Back button always relaunched the external app immediately, so the user could never exit to settings and no countdown ever appeared. Root cause: the `back_button_mode` setting was only consulted in `MainActivity.onBackPressed()`, which runs only when FreeKiosk has focus, but in external-app mode the external app owns the Back button. When the user backed out of the app, the involuntary-return fast-path in `onResume()` (added for #106/#203) relaunched the app unconditionally, overriding the setting. Fixed by gating that native fast-path on `back_button_mode == "immediate"`: only Immediate Return hard-relaunches from native, while **Test** and **Delayed Return (timer)** now keep FreeKiosk in the foreground and let the existing JS `AppState` handler apply the correct behavior (stay on FreeKiosk / show the countdown, which works because JS timers are not frozen while FreeKiosk stays foregrounded). ⚠️ Note for existing fleets: the setting now actually takes effect, and its default is **Test Mode** (Back stays on FreeKiosk). If you relied on the old always-relaunch behavior, set **Security → Back Button Behavior → Immediate Return**. Reported by @RSuarezAl.

- 🔓 **Device permanently stuck on "Starting kiosk…" after reboot with a secure lock screen** (#222): On a Device Owner device that also has a native secure lock (PIN/pattern/password), FreeKiosk hung forever on the loading screen after a reboot if `BootLockActivity` started before the user unlocked. Its `SHOW_WHEN_LOCKED` / `DISMISS_KEYGUARD` flags **occlude** (do not dismiss) a *secure* keyguard, so the user cannot enter their credential, credential-encrypted (CE) storage never unlocks, and `MainActivity` (not `directBootAware`) can never launch. The opt-in "System screen-lock compatibility" (#199) avoids it by deferring at boot, but it is off by default, so a fresh secure device deadlocked. A reactive safety net was added first: after ~8s of failed hand-off, with a secure keyguard confirmed (`KeyguardManager.isDeviceSecure()`) and the user still locked (`UserManager.isUserUnlocked()`), `BootLockActivity` steps aside so the keyguard is revealed; the user unlocks and the kiosk starts at `BOOT_COMPLETED`. **Runtime testing showed that net never fired**, and fixing it took three more defects, all in this release: (1) `finish()` alone did nothing, because lock task **disables the keyguard** unless `LOCK_TASK_FEATURE_KEYGUARD` is set (the platform behaviour #208 documents), so the activity went away and still no lock screen appeared: the net now calls `stopLockTask()` first, which is safe precisely here since the branch requires a secure lock to be set, so what the user gets is the system asking for their PIN; (2) the poll loop driving all of this **stopped after about one second**, because its hand-off check inferred "MainActivity took over" from `BootLockActivity` losing window focus, which is exactly what a secure keyguard taking focus at boot produces, so it declared the hand-off done, called a `finish()` that lock task absorbed, and stopped polling with nothing left watching. `MainActivity` now publishes a flag when it really starts, and the loop keeps polling after every `finish()` since an absorbed one is no longer hypothetical; (3) the retry that was supposed to relaunch `MainActivity` every 5s **disarmed itself**, because `startActivity()` returns a refusal code rather than throwing when the system blocks the launch at `LOCKED_BOOT_COMPLETED`, so the "launched" flag was set on a launch that never happened. A last-resort watchdog on its own thread now backs the whole sequence, and the diagnostic logging it carries is emitted in release builds past 5s of stall (normal boots stay silent), because the previous instrumentation used `DebugLog.d`, which is stripped from release: a device stuck in the field left no trace at all. Reported by @potofcoffee.

- 🌏 **REST API silently dropped non-ASCII text: `/api/tts` spoke English but stayed silent on Chinese, Korean, Japanese, Arabic…** (#115): Any text sent in a POST body (TTS, toast, keyboard text, URL…) lost all of its multibyte UTF-8 characters, so `/api/tts` with `你好` / `안녕하세요` produced no speech while English worked and mixed text spoke only the Latin part. It was **not** a TTS/locale problem (language detection was already correct): the embedded HTTP server (NanoHTTPD 2.3.1) decodes the request body using the charset from the `Content-Type` header and **defaults to US-ASCII when the client sends none**, which corrupts every non-ASCII character before it ever reaches the TTS engine. Earlier fixes (the `language` parameter, script auto-detection) addressed the wrong layer, so the bug persisted. Fixed in `parseBody()` by forcing **UTF-8** when the request did not declare a charset (JSON is UTF-8 by spec) before the body is read: it only adds a charset, never changes the media type, so form-urlencoded / multipart handling is untouched and pure-ASCII bodies are byte-identical. One fix covers every POST endpoint. (Workaround on older builds: send `Content-Type: application/json; charset=utf-8`.) Reported by @nowpast and @alogblog.

- 🔀 **`POST /api/mode` returned `success` but the switch did not take effect until you touched the screen** (#209 follow-up): After the runtime display-mode switch was wired in beta.5, switching **out of** an external app (to WebView or media player) via REST/MQTT often did nothing until the user pressed Home/Back, sometimes relaunched the external app on its own a moment later, and could leave later mode changes silently ignored. Root cause: the switch is performed in the JS `onSetMode` handler, but while FreeKiosk is backgrounded behind the external app **the JS thread is frozen**, so the command was queued and never ran (the `bringToFront()` call lives inside that frozen handler). Fixed by bringing FreeKiosk to the foreground from **native** code the moment a `setMode` to `webview`/`media_player` arrives, which resumes the JS thread so the switch completes on its own. `blockAutoRelaunch` is set first so `onResume` does not take the involuntary-return fast-path and relaunch the app being left (the "app relaunches after switching to webview" report). Switching **to** external_app is unchanged. A related report was also fixed: the hidden "return to settings" overlay button reappeared in WebView after such a switch, because the WebView return-button visibility defaulted to visible in `loadSettings()` while the Settings toggle and storage default to hidden; the defaults are now aligned to hidden. Reported by @alogblog and @RSuarezAl.

- 📸 **Screenshots failed in multi-app mode (REST `/api/screenshot` and the cloud `screenshot` command)** (#229): With Device Owner + multi-app mode, capturing the screen returned "Screenshot not available" as soon as a managed app was in the foreground. Root cause: the single capture path did a `PixelCopy` on **FreeKiosk's own Activity window**, but managed apps are launched in their own task (`FLAG_ACTIVITY_NEW_TASK`), so our Activity is stopped and its `ViewRootImpl` surface released, making `PixelCopy` throw "Window doesn't have a backing surface!" (and, had it succeeded, it would have captured an empty FreeKiosk window rather than the app on screen). Added a second capture path through the **accessibility service** (`AccessibilityService.takeScreenshot()`, Android 11+, new `canTakeScreenshot` capability), which captures the real display whatever app is in front. FreeKiosk now uses PixelCopy while it is in the foreground (cheap, not rate-limited) and the accessibility path otherwise, each falling back to the other. Note that the Device Owner **screen-capture policy** applied in Lock Mode (#172, blocks Power+Volume Down) also blacks out that system capture: a new **Security → "Allow Remote Screenshots"** toggle (Device Owner, default off) lets FreeKiosk lift the policy for the fraction of a second the capture takes and restore it immediately after. With the toggle off, the behaviour is unchanged and the API now answers with the actual reason instead of a bare "not available". Reported by @23575437.

- 🔌 **Home Assistant showed stale state: the Screen Power toggle snapped back to ON a few seconds after switching the screen off** (#155): The screen did turn off, but the MQTT state topic is retained and was only refreshed by the periodic publish, so Home Assistant kept serving the previous value for up to 30 seconds and its toggle reverted in the meantime. Two fixes: the tablet now publishes its status from native code on the real `ACTION_SCREEN_ON`/`ACTION_SCREEN_OFF` broadcast (`ScreenStateReceiver`), which is the authoritative moment and works whatever changed the screen state (MQTT command, power button, scheduler, screensaver) *and* while the JS thread is suspended after `lockNow()`; and every MQTT command now schedules a status republish ~600 ms after execution, debounced, so brightness, volume and the other entities stop lagging by up to 30 seconds too. ⚠️ Unchanged: without Device Owner or the accessibility service, Android does not let an app power the display off, FreeKiosk only dims it to 0, and the state then correctly reports the screen as on. Reported by @RubinBonBon8833, with the beta.5 repro from @LamerTex.

- 🌙 **MQTT screensaver switch could turn the screensaver off but never on** (#232): Sending `ON` only re-enabled the screensaver *setting*, so the screen went dark after the configured inactivity timeout instead of immediately, while `OFF` correctly dismissed a running screensaver. The Home Assistant switch mirrors `screen.screensaverActive` (is the screensaver showing right now), so `ON` now activates it on the spot. The command is also honoured when "Keep Screen On" is off: it was silently dropped in that case, which left the toggle flipping back with nothing in the logs. An explicit remote command is not the automatic inactivity path that the system's own sleep timer supersedes. Reported by @LamerTex.

- 🔋 **Device went "unavailable" in Home Assistant after a couple of hours on battery** (#234): The MQTT client holds a CPU wake lock and a WiFi lock while connected, but once the tablet is unplugged and idle Android's Doze still defers its network, the broker misses the keepalive and publishes the LWT. The battery-optimization exemption is the only reliable fix and nothing outside the cloud service and the permission wizard ever asked for it, so a Home-Assistant-only user never got it. The MQTT settings section now checks the exemption (new native `isIgnoringBatteryOptimizations`), warns when it is missing, and offers a one-tap request; turning MQTT on asks for it too. Note that the system dialog cannot open while Lock Mode holds the device in lock task, so grant it before enabling Lock Mode or over ADB: `adb shell dumpsys deviceidle whitelist +com.freekiosk`. A tablet on permanent power never enters Doze. Reported by @LamerTex.

- 🛡️ **MQTT without Lock Mode had no foreground service, so Android killed the app and the device stayed "unavailable"** (#234 follow-up): The battery-optimization warning added above treats Doze, but Doze was not the whole story. `KioskWatchdogService` only started when **Lock Mode** was enabled, and `OverlayService` only in External App mode, so a Home Assistant user running FreeKiosk as a plain WebView dashboard had **no foreground service at all**: once the screen went off the process was an ordinary background app, and aggressive OEM battery managers killed it, taking the broker connection with it for good. This also explains why the reporter's fallback (using the screensaver instead of a real screen-off, which keeps the device out of Doze entirely) still went unavailable. The watchdog now runs in one of two modes: the existing **kiosk guard** (unchanged, relaunches FreeKiosk after an OOM kill), or a new **keep-alive** mode started when MQTT is enabled without Lock Mode, whose only job is to hold the process up. Keep-alive mode **never relaunches anything** (FreeKiosk is a normal app there and the user is free to leave it) and it stops itself when MQTT is switched off. The mode is persisted, so a `START_STICKY` restart cannot come back as a kiosk guard behind an admin who just exited. Users in this configuration will see a new silent, minimum-priority notification, which is the price of not being killed. ⚠️ Note for the curious: the WiFi lock the MQTT client holds is *not* what keeps it alive. `WIFI_MODE_FULL_HIGH_PERF` is deprecated and the platform silently replaces it with `WIFI_MODE_FULL_LOW_LATENCY`, which per the SDK is only active while the screen is on and the app is in the foreground. Screen-off operation rests on the CPU wake lock, the process staying alive, and the Doze exemption.

- 📺 **Kiosk did not come back after an Android TV woke from standby** (#197): `KioskWatchdogService` decided whether FreeKiosk was still running by walking `ActivityManager.getAppTasks()`, which stays true as long as the task exists in recents. It therefore could not tell "backgrounded behind the TV launcher" from "running", and never relaunched after a standby/wake cycle (it also answered "running" after an OOM kill whenever the task survived in recents, which is the very case it was written for in #96). It now checks process importance, and a `SCREEN_ON` receiver inside the service runs the check on wake instead of waiting for the next 10 second tick. Contributed by **@BoussonKarel**, tested on a Xiaomi MiTV-MSSP3 (Android 9). Three guards were added on top, because a check that finally reports real foreground state reaches code paths that were previously unreachable: the watchdog no longer relaunches anything while **the display is off** (the process sits at `IMPORTANCE_FOREGROUND_SERVICE` during standby, so it would otherwise have fired `startActivity` every 15 seconds for the whole night, fighting `screen_off` and the sleep scheduler); the **External App / multi-app** guard now identifies the foreground app with `UsageStatsManager` instead of `getAppTasks()`, which only ever listed FreeKiosk's own tasks and so could never see an app launched in its own task (without this, FreeKiosk would have yanked itself in front of the running app every cycle, and multi-app mode was fully exposed since it has no single configured package); and when the foreground app cannot be determined at all, because usage access was not granted, the watchdog now does nothing rather than relaunch on a guess.

- 📸 **`getUserMedia()` failed with no prompt when the web page asked for the camera or the microphone** (#219): The bundled WebView patch auto-grants media permission requests at the **web** layer, which is what lets a page use `getUserMedia()` without a per-page prompt. Doing that, it also removed the upstream code path that asked Android for the matching **runtime** permission, and nothing else in FreeKiosk requested `CAMERA` / `RECORD_AUDIO` outside the permission wizard (which only runs during cloud enrollment). A Play Store install that never went through the wizard therefore had the web layer say yes and the Android layer say no, with no dialog and nothing in the logs. The patch now requests whatever is missing before granting, keeping the unconditional web-layer grant so the Fire OS behaviour it was written for is untouched. ⚠️ Android suppresses runtime permission dialogs while a device is in lock task, so camera and microphone access must be granted **before enabling Lock Mode**, or over ADB: `adb shell pm grant com.freekiosk android.permission.CAMERA`. This is also why the reporter saw it work with Lock Mode off and fail with it on. Note that **WebUSB is not supported by the Android WebView** at all, for any kiosk app: it is a Chrome API absent from the system WebView component. Reported by @reframelab.

- 🔗 **Hardened the REST/MQTT command wiring against a dead listener** (#231): `ApiService.initialize()` returned early when it had already been initialized, keeping the callbacks captured on the first mount and ignoring the ones passed by the caller, while the screen's cleanup path calls `destroy()`, which removes the native command listener. Any remount ordering where the new screen initializes before the old one cleans up therefore left the app with no listener at all, or with commands driving a component tree that is no longer on screen: the command is accepted and acknowledged, and nothing visibly happens. It now always adopts the latest callbacks and re-subscribes when the listener is gone. Whether this is what produced the reported symptom (the WebView no longer following MQTT URL updates after cancelling the admin PIN prompt) is **not confirmed**, and the report itself is worth re-reading in light of the #155 fix above: the Home Assistant `navigate_url` entity updates optimistically as soon as you write to it, so seeing the new URL in Home Assistant never proved the tablet had applied it. Now that the device republishes its state right after each command, the entity snapping back to the previous URL makes that visible immediately. Reported by @jdgarzonv.

- 🔓 **The battery optimization exemption could not be granted on a pinned kiosk** (#234 follow-up): The exemption is the only cure for Doze cutting an MQTT device off the broker on battery, and no Android app can grant it to itself, so it goes through a system dialog. Lock task blocks any activity outside the whitelist, which meant the one-tap button in the MQTT settings did nothing at all on the very devices most likely to need it, leaving `adb shell dumpsys deviceidle whitelist +com.freekiosk` as the only route. FreeKiosk now whitelists the dialog's package for the few seconds it is on screen and restores the previous whitelist as soon as the app is back in the foreground (with a 60 second timeout, and a restore on failure). This is the same technique already used for the Wi-Fi and Bluetooth system dialogs. If the process dies while the dialog is up, the next `startLockTask()` rebuilds the whitelist from scratch, so the opening cannot outlive a restart.

- 📱 **Status bar and navigation bar stayed visible in single-app mode until you opened the settings, exited or rebooted** (#237): `MainActivity.onDestroy()` restored the permissive lock-task feature set (`HOME | OVERVIEW | NOTIFICATIONS | GLOBAL_ACTIONS`) unconditionally. That is correct on a deliberate exit, but `onDestroy()` also fires when the system destroys the activity while an external app holds the foreground, which is the normal state in single-app mode: FreeKiosk sits in the background and is a prime candidate for being reclaimed. From that moment the device was running lock task with the status bar, the notification panel, Home and Overview all enabled, and nothing restored the restrictive set until `MainActivity` was recreated, hence the bars coming back only on settings / exit / reboot. The call is now gated on a deliberate exit, using the same flag the watchdog check right below already relies on to tell an intentional exit from a system kill. Nothing is lost on the deliberate path: `exitKioskMode()` calls `disableKioskRestrictions()` itself before stopping lock task. Reported by @vukjure.

## [1.2.20-beta.5] - 2026-07-21

### Fixed
- 🔄 **Kiosk WebView refreshes randomly, wiping user input** (#211): On some devices the WebView would reload on its own at random, losing anything the user had typed, even with auto-reload, the return button, and auto-restart all disabled. Root cause: `MainActivity` (the React Native host) declared `android:configChanges` for only the common set (`keyboard|orientation|screenLayout|screenSize|smallestScreenSize|uiMode`), so any *other* runtime configuration change recreated the whole activity, tearing down and rebuilding the React view tree, which reloads the WebView from its start URL and discards in-page state. The triggers are system-driven and unrelated to any FreeKiosk setting: a font-size or display-size (density) change, a locale change, and, on cellular tablets, a carrier/network change (`mcc`/`mnc`) as the modem registers/handoffs. Fixed by broadening `MainActivity`'s `configChanges` to also handle `fontScale|density|locale|layoutDirection|navigation|touchscreen|colorMode|mcc|mnc`, so React Native absorbs these changes in place (updating dimensions/appearance) instead of the activity being recreated. The legitimate WebView remount on an actual renderer-process death (#198) is unchanged. Reported by @faif.

- 🔀 **Documented `POST /api/mode` (and MQTT `mode`) command did nothing: "Endpoint not found"** (#209): The REST doc (`docs/rest-api.md`) and MQTT doc (`docs/MQTT.md`) both documented a runtime display-mode switch, but the command was never wired on the native side, so `POST /api/mode` returned "Endpoint not found" and publishing to the MQTT `set/mode` topic was ignored. Fixed by adding the `POST /api/mode` route and `handleSetMode()` in `KioskHttpServer` and a `mode` case in the MQTT `mapEntityToCommand()`, both emitting the existing `setMode` command. The pre-existing JS `onSetMode` handler was also rewritten to cover **all three display modes with clean transitions in every direction**: it now persists the requested mode and target to storage and re-runs the app's canonical `loadSettings()` setup path (the same one used when you change the mode in Settings), instead of hand-rolling a partial per-mode switch. This fixes a real transition bug (switching `external_app` → `webview` never brought FreeKiosk back to the foreground, so the webview rendered invisibly behind the still-foreground launched app: it now calls `KioskModule.bringToFront()`), and adds the two previously missing cases: `media_player` (uses the stored playlist) and External App **without** a `package` (restores the stored multi-app grid). Because it delegates to `loadSettings()`, each mode is set up exactly as at boot (media items loaded, overlay/monitor started or stopped, dashboard variant honored) and the switch now persists across an app restart. Modes: `{ "mode": "webview", "url"?: "..." }`, `{ "mode": "external_app", "package"?: "..." }`, `{ "mode": "media_player" }`. Docs updated to match. Reported by @alogblog.

- 🔐 **Native Android screen-lock never prompts after screen off/on in multi-app / kiosk mode** (#208): With a device that has both FreeKiosk (Device Owner, lock-task) and a **native Android screen-lock (PIN/pattern/password)** configured, the screen-lock silently never re-appeared after the screen turned off and back on: the device woke straight into the kiosk with no password. Root cause: Android **disables the keyguard while in LockTask mode** unless the app opts back in via `LOCK_TASK_FEATURE_KEYGUARD`, and FreeKiosk's `setLockTaskFeatures()` calls never set that flag. Fixed by adding the flag on every path that configures lock-task features (`MainActivity.enableKioskRestrictions`, `KioskModule.startLockTask`, and, importantly for the reported multi-app scenario, `AppLauncherModule` when re-applying features to launch a whitelisted app, which previously dropped the flag and re-suppressed the lock). It is gated on the existing **opt-in "System screen-lock compatibility"** setting (Security, Device Owner only, **off by default**) **and** a secure lock actually being set (`KeyguardManager.isDeviceSecure()`), the same gate as the boot deferral added in #199, so the keyguard is honored at runtime only when the admin has explicitly enabled screen-lock compatibility. **Zero behavior change when the toggle is off or no screen-lock is set.** ⚠️ Because this makes the native lock work as intended, the device then requires the password on **every wake** (as well as after every reboot), suitable only for attended devices; the in-app hint makes this explicit. The boot path is unchanged and remains opt-in. Reported by @23575437.

## [1.2.20-beta.4] - 2026-07-09

### Added
- 🏠 **Opt-in "Set FreeKiosk as default launcher" mode** (#199): New Security → Auto Launch toggle (**off by default**) that makes FreeKiosk the Home/launcher app, so the **system itself** relaunches FreeKiosk at every boot. This addresses devices — Samsung/OneUI in particular — that **drop out of kiosk mode after a reboot or system update**: FreeKiosk's boot relaunch normally relies on OEM "Appear on top" / Autostart / background pop-up permissions, which Samsung **resets on major OS updates**, so the kiosk failed to come back. As the Home app, FreeKiosk is brought to the foreground by the system, with no dependency on those losable permissions. Two modes: **with Device Owner** the policy is **persistent and locked** (`addPersistentPreferredActivity`) — the user can't change it and it survives OS updates as long as Device Owner stays active (the standard Android Enterprise dedicated-device pattern); it is re-asserted on every app launch (self-healing after an update), cleared when the toggle is turned off, and cleared before Device Owner is relinquished, so the normal launcher is always restored. **Without Device Owner** the toggle opens the system Home-app picker so the user can select FreeKiosk manually (not enforced, and may be reset by an OS update — Device Owner makes it permanent). **Zero behavior change when off.** ⚠️ While on, FreeKiosk is the device launcher (no fallback if it crash-loops on launch), so test on one device before a fleet rollout. Reported by @23575437.

- 🔐 **Opt-in "System screen-lock compatibility" mode** (#199): New Security → Auto Launch toggle (Device Owner only, **off by default**) for the rare case where a device has a **native Android screen-lock (PIN/password)** set *in addition* to FreeKiosk. Previously this combination could freeze/boot-loop the device: FreeKiosk's fast-boot-lock path (`BootLockActivity`, directBoot-aware) entered lock-task over the secure keyguard at `LOCKED_BOOT_COMPLETED` — before the user unlocks and credential-encrypted storage is available — fighting the lock screen and dead-locking the boot, while lock-task also suppressed the keyguard so the password "never took effect". When the new setting is enabled **and** a secure screen-lock is actually configured (`KeyguardManager.isDeviceSecure()`), FreeKiosk now defers to the secure keyguard at boot and starts normally at `BOOT_COMPLETED` (after the user unlocks), so the password works and there's no boot conflict. The flag is mirrored to device-encrypted storage so it's readable before unlock. **Zero behavior change when the toggle is off or no screen-lock is set** — every new code path is gated on both conditions. Note: a native screen-lock inherently requires entering the password on the device after every reboot before the kiosk starts (unsuitable for unattended fleets); the in-app warning makes this explicit. Reported by @23575437.

- 🎙️ **Opt-in "2-way audio (intercom) mode"** (#205): New Display → Web Media toggle (WebView mode, **off by default**) for WebRTC talk-back use cases — e.g. a Home Assistant / go2rtc doorbell intercom card. The microphone permission was already auto-granted to the WebView (`onPermissionRequest`), but the microphone back-channel wouldn't transmit because the device stayed in the normal audio mode. When enabled, FreeKiosk watches for **active microphone capture** via `AudioManager.AudioRecordingCallback` and switches to `MODE_IN_COMMUNICATION` **only while the mic is actually recording** (i.e. while you're talking back), restoring the previous audio mode as soon as it stops — so listen-only playback, which already worked, is left untouched. Re-applied on each launch (the native callback doesn't survive an app restart). **Zero behavior change when off** — the callback isn't even registered. Reported by @Jakopinus.

### Fixed
- 💤 **Screensaver still never activates in External App mode when motion detection is enabled** (#190, follow-up): The beta.3 fix moved the inactivity *countdown* to native code, but when it expired with motion detection enabled the activation path still armed the 10-second motion **pre-check window with a JS `setTimeout`** — the very timer class React Native freezes while FreeKiosk is backgrounded behind the external app. The logcat provided by the reporter shows exactly this: "Native inactivity event received — triggering screensaver" → "starting motion pre-check" → nothing, ever. The pre-check is now skipped in External App mode and the screensaver activates immediately: besides the frozen timer, a backgrounded app cannot capture from the camera on modern Android, so the pre-check could never have observed motion there anyway. Wake-on-motion is unaffected — once the screensaver brings FreeKiosk to the foreground, the camera works and motion dismisses the screensaver as usual. WebView/media modes keep the pre-check unchanged. Reported by @elcomandante.

- 💥 **App crashes the moment the screensaver activates in WebView mode** (#190 follow-up, regression introduced by #177 in beta.4): `pauseMedia()`/`resumeMedia()` passed the react-native-webview ref to `findNodeHandle()` — but that ref is a **methods-only imperative handle** (`goBack`, `reload`, `injectJavaScript`, …), not a ReactComponent, so `findNodeHandle` threw `Argument appears to not be a ReactComponent` inside a `useEffect`, which in a release build is a fatal `JavascriptException`: FreeKiosk crashed at every screensaver activation (and app-backgrounding) whenever "Pause audio/video when hidden" — **default on** — was enabled. Fixed by resolving the node handle from the WebView's **container host view** instead (the native `pauseWebView()` already walks the subtree to find the actual WebView, so the behavior is identical), and wrapping the lookup in a defensive try/catch so this code path can never take the app down again. Reported by @elcomandante.

- 🖐️ **5-tap return-to-settings randomly stops working in External App mode, leaving the tablet stuck in the launched app** (#203): The tap detection in App mode lives in the native `OverlayService` (an invisible watch-outside-touch overlay), and it could die through two independent paths. (1) A JS/native race: on an *involuntary* return to FreeKiosk with kiosk lock enabled, `MainActivity.onResume()` sent the `onAppReturned` event to React Native **before** taking the fast-path that restarts the `OverlayService` and relaunches the external app (#106). The JS handler answers that event with an unconditional `stopOverlayService()` scheduled via `setTimeout` — but FreeKiosk goes straight back to the background, where React Native **freezes JS timers**, so the pending stop fired on the *next* foreground pass (typically right after leaving Settings, matching the report) and killed the overlay service that had just been restarted: no more 5-tap, no more auto-relaunch monitoring, device stuck in the app until a forced restart. Fixed by not sending `onAppReturned` when the native fast-path relaunches the app directly — the event now only fires when FreeKiosk genuinely stays in the foreground, where stopping the overlay is correct. (2) A self-poisoning failure mode in the overlay re-pin loop (#121): if a single `addView` failed (e.g. transient overlay-permission/window state), `overlayView` was left non-null but detached, so the 3-second re-pin's `removeView` threw and aborted **before** recreating the overlay — every subsequent cycle failed the same way, permanently. The re-pin now guards each `removeView` individually and always recreates, and a failed `addView` resets the reference so the service self-heals on the next cycle instead of staying dead. Reported by @pdien.

- 🔑 **Custom PIN not persisting on some signage firmwares — only the default `1234` was accepted** (#200): On certain devices (reported on a Rockchip RK3568 signage board, Android 11) setting a custom PIN appeared to succeed — the "Configuration saved" confirmation showed and the field read "Password configured" — but on the next unlock only the default `1234` worked and every custom PIN was silently rejected. Other settings (e.g. the REST API toggle) persisted normally, which pinpointed the cause: the PIN is the only setting stored in the Android Keystore (via react-native-keychain), and on these firmwares the hardware-backed keystore is broken/absent, so `setGenericPassword` reported success but never persisted a readable value — at unlock `verifySecurePin` then found nothing and fell back to the `1234` default. Fixed by (1) reading the value straight back after every Keychain write and, when it didn't persist, falling back to AsyncStorage — which does survive restarts on these boards — storing only the irreversible PBKDF2 hash + salt, never the plaintext PIN; (2) reading the keystore defensively at verify time (a broken keystore can throw rather than return null) and consulting the AsyncStorage fallback before the default; `hasSecurePin`/`clearSecurePin` account for the fallback too. Devices with a working keystore are unchanged — no fallback copy is written when the read-back succeeds, so security is not weakened where the keystore works. Reported by @RafaelDava.

- ⬜ **Blank white screen after the WebView renderer process dies, with no recovery** (#198): When Android's Chromium renderer process for the content WebView was killed — typically an out-of-memory kill, which on long-running kiosks could be triggered by a heavy page such as a Home Assistant dashboard — FreeKiosk was left sitting on a dead/empty WebView surface (a blank white screen) until something manually remounted it (e.g. an MQTT/REST reload). The native `RNCWebViewClient.onRenderProcessGone` already returns `true` so the *app* process survives, but FreeKiosk had no `onRenderProcessGone` handler, and per Android's contract a WebView whose renderer is gone is defunct and must be remounted, not reused. Fixed by handling `onRenderProcessGone` in `WebViewComponent`: it best-effort clears the WebView cache (to rebuild the corrupted Chromium code-cache index that an OOM crash leaves behind) and asks `KioskScreen` to bump `webViewKey` for a full WebView remount — the same recovery pattern already used for inactivity return and the planner. A crash-loop guard backs off to a delayed remount if the renderer dies repeatedly in quick succession, so a page that crashes on every load cannot pin the CPU in a tight remount loop. Reported by @pantherale0.

- 🧹 **Orphaned motion-detection interval after a rapid enable/disable** (#198, aside): `MotionDetector` starts capturing via a `setTimeout(…, CAMERA_READY_DELAY)` (1.5 s) that then arms the capture interval, but `stopDetection()` only cleared the interval — never the pending startup timeout. If motion detection was disabled or the camera restarted within that 1.5 s window (screensaver toggling motion on/off, returning from Settings after disabling motion, `isFocused` flipping quickly), the timeout still fired afterwards with a stale `enabled = true` closure and spun up an extra, untracked capture interval that ran until the next full cycle. Fixed by tracking the startup timer in a ref and clearing it in `stopDetection()` (both the vision-camera and Camera2 fallback paths). Reported by @pantherale0.

- 🟦 **Per-app blocking overlays never appeared over the targeted app** (#199): A blocking-overlay region with a **Target App Package** set (e.g. `com.android.settings`, to mask part of an allowed app's UI in multi-app mode) never rendered — only regions left "always show" (empty target package) worked. Root cause: `BlockingOverlayManager` decides whether a region applies by comparing its `targetPackage` against the current foreground package, but `setForegroundPackage()` was never called from anywhere, so `currentForegroundPackage` stayed permanently `null` and every targeted region failed the match. Fixed by tracking the foreground app in `FreeKioskAccessibilityService.onAccessibilityEvent` (on `TYPE_WINDOW_STATE_CHANGED`) and forwarding the package to `BlockingOverlayManager`, so targeted regions now show/hide for the right app. Note: per-package targeting therefore requires FreeKiosk's Accessibility Service to be enabled; "always show" regions are unaffected. Reported by @23575437.

- 🔒 **Factory reset reachable from the Settings app in multi-app mode** (#201): When the system Settings app is added to the multi-app whitelist so users can reach a specific setting, they could also open Settings → System → Reset and **factory-reset the device**, wiping the kiosk. Lock-task restrictions don't cover this — factory reset is gated by a Device Owner *user restriction*, not a lock-task feature. Added an opt-in **"Block factory reset"** setting (Security, Device Owner only, **off by default**) that applies `DISALLOW_FACTORY_RESET` via the Device Owner policy; it is a persistent restriction that survives reboots, and is reconciled on every kiosk launch and cleared when turned off. **Zero behavior change when off or non-Device-Owner.** Reported by @23575437.

## [1.2.20-beta.3] - 2026-06-25

### Fixed
- ⌨️ **"Return to Start Page on inactivity" fires while typing in a text field** (#195): In WebView mode the "Return to Start Page on inactivity" timer is reset by a `user-interaction` message that page-injected JavaScript posts on user activity. That message was only wired to pointer events (`click`, `scroll`, `touchstart`, `touchmove`, `touchend`) — typing with the on-screen keyboard produces **keyboard/input events instead**, so the timer kept counting down and could return the user to the start page mid-typing. It only appeared on "some fields on some sites" because some inputs incidentally emit touch/scroll events (autocomplete dropdowns, fields that scroll into view) which masked the gap. Fixed by also resetting the timer on `keydown`, `input`, and `compositionupdate` events (capture phase, sharing the existing 200 ms throttle). All three are needed because Android soft keyboards with predictive text fire `keydown` with `keyCode 229` and often skip per-character key events, while `input`/`compositionupdate` fire reliably for every character (including IME/autosuggest composition). Same-origin only — inputs inside cross-origin iframes remain unreachable from the injected script, as with every other interaction listener. Reported and fixed by @ShroomKing (#196).

- 🔇 **Web page audio/video keeps playing in the background and becomes uncontrollable** (#177): With a web radio or video playing in WebView mode, the audio could keep going after the screensaver appeared, the screen turned off, or the app was backgrounded — and since FreeKiosk overrides the volume keys in kiosk mode, users (often elderly) had no way to stop it short of force-closing the app. Root cause: react-native-webview's `onHostPause()` is a no-op, so the Android WebView never pauses its media when the app is hidden, and FreeKiosk had no media-pause logic of its own; in "Keep Screen On" mode the screensaver is merely an overlay drawn on top of the still-running page, so the audio played on, unreachable underneath. Fixed by pausing the content WebView when the page is hidden: a new native `KioskModule.pauseWebView()/resumeWebView()` calls Android's `WebView.onPause()/onResume()` on the main WebView only (resolved by node handle, so the screensaver's own web/video screensaver is never affected), complemented by a JS-level pause of `<audio>`/`<video>` elements for reliability across OEM WebViews. Triggered on screensaver activation, screen-off, and app-background; the renderer resumes on return (media stays paused so nothing auto-restarts). Controlled by a new opt-in setting **Display → Web Media → "Pause audio/video when hidden"** (default on); turn it off to keep web audio playing continuously (e.g. an intentional web-radio dashboard). Reported by @dbee01.

- 💥 **App crashes during motion detection when the camera view is torn down mid-capture** (`ViewNotFoundError`, reported on v1.2.19): With motion detection enabled, a periodic `camera.takePhoto()` runs in a background coroutine that first resolves the native `CameraView` by its view tag. If the camera view was unmounted between the call and its resolution (display-mode change, motion detection toggled off, screen teardown), `CameraViewModule.findCameraView()` threw `ViewNotFoundError`. This is distinct from the cameraless-device init crash fixed in #187: the exception was thrown *inside the UI-thread Handler callback* of `runOnUiThreadAndWait()` and never routed back to the suspended coroutine, so it escaped as an **uncaught exception on the main thread and crashed the whole app** — before the existing JS `try/catch` in `MotionDetector` (which already expects and swallows `findCameraView` errors) could ever see a promise rejection. Fixed in the `react-native-vision-camera` patch with two coordinated changes: (1) `runOnUiThreadAndWait()` now wraps the call and forwards failures to the coroutine via `continuation.resumeWith(Result.failure(e))` instead of throwing on the Handler thread; (2) `CameraViewModule.takePhoto()` now calls `findCameraView()` **inside** its `withPromise` block — necessary because the module's `backgroundCoroutineScope` has no exception handler, so without this the (now coroutine-level) exception would simply crash on the camera executor thread instead. With both, `takePhoto()` rejects cleanly and the existing JS handler absorbs it, so motion detection continues uninterrupted.

- 💥 **App crashes with `IllegalArgumentException` when a custom User-Agent contains illegal characters** (reported on v1.2.19): If the custom User-Agent configured in Display settings contained a character that is illegal in an HTTP header value (e.g. a stray newline or control character from a copy-paste), Chromium's `AwSettings.setUserAgentString()` threw `IllegalArgumentException` — on the Fabric mount thread, so it crashed the whole app and could not be caught from JS. Fixed in the `react-native-webview` patch by guarding the User-Agent assignment in `RNCWebViewManagerImpl`: an invalid value is now logged and the WebView falls back to the default User-Agent instead of crashing.

- 🔧 **ADB config silently ignored when only REST API / MQTT / option extras are provided** (#193): The documented `adb shell am start … --es rest_api_enabled "true" --es pin "1234"` command did nothing — no toast, no log, nothing applied. `handleAdbConfig()` bailed out early with a guard that only checked the four "content" extras (`lock_package`, `url`, `config`, `mqtt_broker_url`), returning `false` before it ever read the PIN or any of the ~25 individual option extras (REST API, MQTT, `status_bar`, `back_button_mode`, `screensaver_enabled`, `managed_apps`, …). So any config that set only those options was discarded. Fixed by treating the intent as an ADB config command when **any** recognized extra is present, not just the content keys. The previously required `--es config '{}'` workaround is no longer needed. Reported by @BoussonKarel.

- 💥 **App crashes on launch with `IllegalArgumentException: Invalid task, not in foreground` when starting the kiosk lock task** (reported on v1.2.19): `MainActivity.onCreate()` calls `checkAndStartLockTask()` → `startLockTask()`, but `startLockTask()` requires the task to be the foreground task at that instant. When `onCreate()` runs while MainActivity is still backgrounded (boot, or the external-app-at-boot path that deliberately moves the task to back), the platform throws `IllegalArgumentException("Invalid task, not in foreground")`. In the Device Owner branch this was only wrapped in `catch (SecurityException)` — and `IllegalArgumentException` is not a `SecurityException`, so it escaped and crashed the app on launch. Fixed by routing every `startLockTask()` call through a new defensive `tryStartLockTask()` helper that catches the not-in-foreground failure (`IllegalArgumentException` / `IllegalStateException`) instead of crashing, flags the attempt as pending, and **retries once the activity actually gains window focus** (`onWindowFocusChanged(hasFocus = true)` — the most reliable foreground signal), so the kiosk lock still engages as soon as the app is genuinely in the foreground.

- 💤 **Screensaver never activates in External App mode** (#190): With a screensaver + inactivity timer configured, the screensaver worked in WebView mode but never triggered once an external app was launched — and on devices with a short system screen timeout the OS locked the screen instead. Root cause: screensaver activation was driven by a JS `setTimeout`, but React Native freezes JS timers while the activity is backgrounded — and in External App mode FreeKiosk is backgrounded the whole time behind the launched app, so the timer never fired. Fixed (phase 1) by running the inactivity countdown **natively** in `OverlayService` (which already observes every tap via its watch-outside-touch overlay and keeps running in the background): on expiry it emits `inactivityExpiredNative`, and FreeKiosk runs the exact same activation path (motion pre-check → bring-to-front → screensaver) it used before. The native timer re-arms on each tap and on screensaver dismissal, and is disarmed during the motion pre-check, while the screensaver is active, and during scheduled sleep so it cannot double-fire. The JS timer still drives WebView/media modes unchanged. By design, External App mode delegates screen on/off to the system (FreeKiosk's "Keep Screen On" override is WebView/media only), so the screensaver only appears before the OS turns the screen off if the Android screen timeout is ≥ the inactivity delay (or "Never"); an info hint explaining this was added to the Screensaver settings section in External App mode. Reported by @elcomandante.

- 🔔 **Notification panel and status bar stop working after a reboot in multi-app mode** (#191): When the notification panel / status bar were enabled, they worked until the device was rebooted, then became unavailable. Root cause: the lock-task features are applied in two stages — `BootLockActivity` starts the lock task at boot with `GLOBAL_ACTIONS` only, relying on `MainActivity.enableKioskRestrictions()` to upgrade to `NOTIFICATIONS` / `SYSTEM_INFO` afterwards. In multi-app mode an external app takes the foreground at boot while MainActivity stays backgrounded, so that upgrade was delayed or never applied — the kiosk stayed stuck on the boot-time `GLOBAL_ACTIONS`-only state with notifications and status bar disabled. Fixed by having `BootLockActivity` read the same settings (`@kiosk_allow_notifications`, `@kiosk_allow_system_info`, `@kiosk_allow_power_button`) and apply the full feature set directly at boot. Also fixed a related bug in `AppLauncherModule`: it enabled `LOCK_TASK_FEATURE_NOTIFICATIONS` without `LOCK_TASK_FEATURE_HOME`, which Android requires together — the missing flag made `setLockTaskFeatures()` throw and silently abort the entire feature update when launching an external app. (Note: on some OEM ROMs a separate "background pop-up / display floating window" permission may also need to be granted for the kiosk to relaunch correctly at boot.) Reported by @23575437.

- ⌨️ **Soft keyboard stays visible when the screensaver activates** (#135): In "Keep Screen On" mode the screensaver draws an overlay (dim/URL/video) *on top* of the page while the screen stays physically on — so `ACTION_SCREEN_OFF` never fires and the screen-off keyboard-dismiss (added in #135 v1.2.19) never ran. The follow-up attempt added `Keyboard.dismiss()` at screensaver activation, but that is React Native's API and only closes keyboards owned by RN `TextInput`s; a keyboard raised by an `<input>` **inside the WebView** (e.g. a web login field in Force Numeric mode) was untouched and stayed visible behind the screensaver. Fixed by dismissing the keyboard at the **window level** via `InputMethodManager.hideSoftInputFromWindow()` + `clearFocus()` (new native `KioskModule.hideKeyboard()`), which closes the keyboard regardless of whether it belongs to a WebView or a RN view. Triggered from a `useEffect` on screensaver activation so it covers every activation path (inactivity timer, motion pre-check, MQTT/REST screen-off, scheduled sleep). The screen-off path (`ScreenStateReceiver`) now shares the same helper (`KeyboardUtils`). Reported by @asfreitas17.


## [1.2.20-beta.2] - 2026-06-19

### Fixed
- 💥 **App crashes immediately on launch on cameraless x86 devices (BlissOS / Surface Go 2)** (#187): On devices whose camera service returns `null` from `CameraManager.getCameraIdList()` (e.g. BlissOS x86_64 desktop builds with no camera HAL), react-native-vision-camera's `CameraDevicesManager` threw a `NullPointerException` while building its availability callback. Because the module is instantiated eagerly during TurboModule initialization, this aborted the whole React instance and crashed the app on first launch — before any settings could load. Added a patch-package patch (`react-native-vision-camera+4.7.3.patch`) wrapping that call so a null camera list is treated as "no cameras" instead of crashing. Camera features are simply unavailable on such devices; the app now launches normally.

- 🔓 **Stuck in kiosk with no way back to settings when the page fails to load** (#180): In WebView mode the normal N-tap-to-settings gesture relies on JavaScript injected into the page, so when the page can't load (server down, Wi-Fi not yet up after a reboot, HTTP error) no taps were ever reported and the user was stranded. Two fixes: (1) the error overlay — with its fallback ⚙️ settings button — now appears for **any** main-document HTTP error code, regardless of the auto-reload setting (previously only for 5xx with auto-reload on), while sub-resource errors (favicons, scripts…) are correctly ignored; (2) the fallback ⚙️ button now counts toward the N-tap sequence in **every** return mode, not just "tap anywhere"; (3) in WebView/media `tap_anywhere` mode the N-tap gesture is now **also detected natively** in `MainActivity.dispatchTouchEvent()`, independently of the page's injected JavaScript — so the escape still works when the page routes touches into a cross-origin iframe or the OEM WebView never delivers `touchend` to our listener (the page loads fine but in-page taps were lost). Active by default, gated to the kiosk screen only (never fires while inside Pin/Settings) in WebView/media + tap_anywhere mode, and disableable via the `@kiosk_tap_to_settings_native_enabled` flag. The hardware Volume-Up ×5 shortcut remains the JS-independent escape hatch, now likewise scoped to the kiosk screen so it can't kick the user out of Pin/Settings.

- 🩹 **`npm install` fails with "Failed to apply patch for package react-native-webview"** (#184): The `react-native-webview` patch had corrupted hunk headers — its `@@ -a,b +c,d @@` line counts no longer matched the hunk bodies. This was introduced when the SSL-redirect fix (#144) was hand-edited into the patch without recomputing the counts. patch-package 8 rejects such patches with a "hunk header integrity check failed" error (which it surfaces as the generic "could not be parsed"), aborting `postinstall` on every platform. Fixed by regenerating the patch from source so the headers are correct. Also hardened `.gitattributes` with a `*.patch text eol=lf` rule so patch files keep LF line endings on Windows checkouts.

- 🔍 **WebView zoom now scales the full page layout, not just text** (#188): The zoom setting previously used Android's `textZoom` which only scaled text size, causing card contents in Home Assistant dashboards to overflow their containers. Zoom now applies a CSS `zoom` property on the root element, scaling text, images, and layout containers uniformly.

- 🔍 **New "Home Assistant" zoom mode that re-flows dashboards** (#188): Zooming `<html>` (the "Standard" mode) enlarged Home Assistant card *contents* without resizing the cards, so they overflowed. HADashboard avoids this by applying CSS `zoom` to `document.body` instead — HA measures its card layout from the body, so zooming the body makes the dashboard re-flow its columns and fill the screen. Added a **Zoom mode** selector under Display → Web Page Zoom: *Standard* (zooms `<html>`, unchanged default) and *Home Assistant* (zooms `<body>`, matching HADashboard's method). Opt-in, since a few non-HA sites may render differently.


- 🔄 **Black screen / stuck on "Starting kiosk…" after reboot in Device Owner mode** (#176): Regression introduced in v1.2.20 (#172 fix). `setScreenCaptureDisabled(adminComponent, true)` was called between `setLockTaskPackages()` and `startLockTask()`. On Android 12+ devices (Lenovo, Samsung, KTC), this DPM call triggers a window policy change mid-sequence that disrupts lock task startup, leaving `BootLockActivity` stuck and `MainActivity` unable to take over. Fixed by moving `setScreenCaptureDisabled` to after `startLockTask()` so the lock task session is fully established first.

- 💤 **Screensaver toggle resets to off after saving settings in External App mode** (#179): When display mode is set to External App, saving settings always forced `screensaverEnabled` to `false`, overwriting the user's choice. The screensaver save was correctly moved to apply to all display modes in a prior commit, but the old force-disable in the External App branch was never removed. Deleted the stale override.

- 🔆 **MQTT `screenOn` command not working after `screenOff` in Device Owner mode** (#181): When Device Owner is active, `lockNow()` suspends the React Native JS thread, so MQTT commands routed through the JS event bridge were silently dropped. `screenOn` and `screenOff` are now handled natively in the MQTT command handler (same path as the REST API), bypassing the JS bridge entirely. Screen control logic has been extracted into a shared `ScreenController` object used by both MQTT and REST.

***


## [1.2.20] - 2026-06-03

### Added
- 🎨 **Status bar light/dark theme** (#118): A new "Status Bar Theme" toggle (Light / Dark) is now available in Settings → Display → Status Bar. In Dark mode (default), the status bar renders with white icons on a dark background — suitable for kiosks with dark web content. In Light mode, icons are black on a transparent/light background — suitable for kiosks with white or bright web content. All icons (battery, Wi-Fi, Bluetooth, volume, clock) are now rendered with `MaterialCommunityIcons` replacing the previous emoji characters, for consistent sizing, alignment, and color control across Android versions.

- 🎙️ **Voice selection for Web Speech API TTS polyfill** (#169): The `speechSynthesis.getVoices()` polyfill now returns the actual list of installed Android TTS voices instead of an empty array. Web apps that select a specific voice via `utterance.voice = voices.find(v => v.name === '...')` will have that voice applied natively. REST API: `POST /api/tts` now accepts an optional `voiceUri` parameter to select a voice by URI for a single speak call. The available voice list is pre-cached at startup for performance (`cacheTtsVoices()`) and refreshed on demand.

### Fixed
- 🔐 **SSL certificate dialog not shown for initial navigation and same-host redirects** (#144): The custom SSL certificate acceptance dialog (Settings → General → Accept Self-Signed Certificates) only appeared when the failing URL exactly matched the currently loaded page URL. This excluded two common cases: (1) **initial navigation** — when the app launches and loads the first page, there is no currently loaded URL, so the dialog was never shown; (2) **HTTP→HTTPS redirects** — a redirect from `http://host/` to `https://host/` produces the same host but a different URL, which the string equality check rejected. Fixed by replacing the URL equality check with a `isMainFrameRequest()` helper that matches on same-host (regardless of scheme or path), and treating a null/empty current URL as a main-frame request. Sub-resource SSL errors (images, fonts, iframes from third-party domains) are still silently denied to avoid flooding the user with dialogs.

- 📺 **MQTT/REST `screenOn` / `screenOff` commands did not physically lock the screen** (#155): `POST /api/screen/on` and `POST /api/screen/off` (and their MQTT equivalents) only activated or deactivated the screensaver overlay — they never called `lockNow()` to actually turn off the display. As a result, the MQTT `screenOn` status field stayed `true` even after sending `screenOff`. Fixed by delegating both commands to `KioskModule.turnScreenOff()` / `KioskModule.turnScreenOn()`, which call `lockNow()` and `wakeUp()` respectively. `screenOn` additionally calls `setIsScreensaverActive(false)` + `resetTimer()` to handle the case where only the overlay was active and no physical lock event fires.

- 🏠 **Dashboard mode returned to grid when tile page self-refreshes** (#159): If the "Return to Start Page on Inactivity" feature was enabled, opening a dashboard tile armed the inactivity return timer. Pages that auto-refresh (e.g. Immich kiosk, Home Assistant dashboards) did not reset the timer because `Reset on Navigation` was off by default — so the timer fired after the configured delay and returned to the dashboard grid without any user interaction. Fixed: in dashboard mode, any page navigation (including self-refresh) always resets the inactivity timer, matching the user expectation that an actively-updating page should not be treated as "inactive."

- 🌙 **Overnight rules rejected by Scheduled URLs** (#157): Recurring scheduled URL events with an end time before the start time (e.g. 22:00–07:00) were rejected with "End time must be after start time". Two fixes: (1) The validation in `RecurringEventEditor` now only rejects identical start/end times — crossing midnight is valid. (2) `isEventActive()` in `planner.ts` now detects overnight ranges (`startTime > endTime`) and handles the two sub-cases: before midnight (today is a scheduled day and `currentTime >= startTime`) and after midnight (yesterday was a scheduled day and `currentTime < endTime`). This correctly handles the case where an event starts Monday at 22:00 and is still active Tuesday at 06:30.

- 📐 **Multi-app grid tile widths cut off after device rotation** (#160): In External App mode with multiple managed apps, the app grid used `Dimensions.get('window').width` to calculate tile widths. `Dimensions` returns stale values after device rotation until the component re-renders, causing tiles to overflow or be cut off. Fixed by replacing `Dimensions` with the `useWindowDimensions()` hook, which updates reactively on orientation change.

- 🎙️ **WebRTC microphone audio silent due to missing permission** (#147): The `MODIFY_AUDIO_SETTINGS` permission was not declared in `AndroidManifest.xml`. This permission is required on Android for WebRTC to switch the audio mode to `MODE_IN_COMMUNICATION` (which activates the microphone path and echo cancellation). Without it, getUserMedia() succeeded but microphone audio was silent in WebRTC calls. Added as a normal protection level permission (auto-granted at install, no runtime prompt needed).

- 🌐 **REST API returns "Endpoint not found" for valid endpoints when called with POST** (#146): Read-only endpoints (`/api/status`, `/api/health`, `/api/info`, `/api/battery`, etc.) only accepted GET requests. Automation tools that default to POST (Home Assistant REST integration, curl `--request POST`, Node-RED HTTP node, etc.) got a misleading `404 Endpoint not found` response even though the endpoint exists — the wrong HTTP method was the only issue. Fixed by making all read-only status endpoints accept both GET and POST. The two endpoints that have both a read and write variant (`/api/brightness`, `/api/volume`) now use the HTTP method to disambiguate: GET reads the current value, POST with a body sets it. POST-only control endpoints that require a JSON body (`/api/url`, `/api/tts`, etc.) now return a proper `405 Method Not Allowed` with a clear message when called with GET, instead of the generic 404.

- 💾 **Export backup fails with "Permission denied" on Android 10+** (#166): `exportBackup()` wrote directly to `/storage/emulated/0/Download/` via `RNFS.writeFile()`. On Android 10+ (API 29+), `WRITE_EXTERNAL_STORAGE` is deprecated and silently denied, causing an EACCES crash. Fixed by switching the export flow to the Storage Access Framework: tapping Export now opens the system "Save As" dialog (`ACTION_CREATE_DOCUMENT`) where the user picks the save location. The file is then written via `ContentResolver.openOutputStream()` — no storage permission needed, works on all Android versions. The backup data collection logic is unchanged; only the write path changed. A new `saveJsonFile(content, filename)` method was added to `FilePickerModule` (Kotlin + TypeScript) to handle the SAF save dialog.

- 🔇 **Audio from previous scheduled URL continues playing after planner switches to next URL** (#158): When the URL planner transitioned between scheduled events, it called `setUrl()` to navigate the WebView to the new URL — but the previous page's JavaScript (including Web Audio, HTML5 `<audio>`, timers) kept running in the background because the same WebView instance was reused. Fixed by incrementing `webViewKey` on each planner URL transition, which forces React to fully unmount and remount the WebViewComponent. The underlying Android WebView is destroyed, terminating all background sessions. The same remount is applied when the planner reverts to the base URL at the end of a scheduled period.

- 📸 **Screenshot key combination (Power + Volume Down) not disabled in kiosk mode** (#172): On Android, pressing Power + Volume Down takes a screenshot even when Device Owner lock task mode is active. Fixed by calling `DevicePolicyManager.setScreenCaptureDisabled(true)` when entering kiosk mode (Device Owner only), and re-enabling it on exit. Prevents both the screenshot itself and the screenshot toolbar/preview from appearing over kiosk content.

- 🔄 **Auto-reload does not trigger on HTTP 5xx errors (e.g. 504 Gateway Timeout)** (#173): The "Reload on Error" feature only handled network-level failures (no connectivity, DNS failure) via `onError`. HTTP error responses like 504 Gateway Timeout are delivered via `onHttpError` and were only logged — no reload was triggered. Fixed by extending `handleHttpError` to apply the same 5-second auto-reload for any HTTP 5xx status code when "Reload on Error" is enabled.

- 💾 **Custom User Agent not included in backup/restore** (#174): The `@kiosk_custom_user_agent` storage key was missing from the backup key list in `BackupService`. Exporting and re-importing a configuration would silently drop the Custom User Agent setting. Added to the backup keys list.

- ⌨️ **Soft keyboard remains visible when screensaver activates in URL/Video/Image mode** (#135): The existing fix (v1.2.19) dismissed the keyboard on `ACTION_SCREEN_OFF`, which only fires in Dim Only screensaver mode. In URL, Video, and Image screensaver modes the screen stays on — no `SCREEN_OFF` event fires — so the keyboard was never dismissed. Fixed by calling `Keyboard.dismiss()` at both screensaver activation paths in `KioskScreen`.


***


## [1.2.19] - 2026-05-31

### Added
- 🌙 **Customizable screensaver content** (#47, #91, #61): The screensaver is no longer just a brightness dimmer. A new "Screensaver Style" selector in Settings → Display → Screensaver offers three modes: **Dim Only** (default, unchanged — just dims the brightness), **Web Page** (displays a read-only URL fullscreen — clock, dashboard, HTML; tap anywhere to wake), and **Video / Image** (plays a video/image playlist via the existing MediaPlayerComponent with loop, mute, fit modes). In URL and Video modes the current brightness is preserved (auto-brightness keeps working), so the screen stays visible and Android no longer turns it off — addressing wall-mounted panel use cases. Existing users are unaffected: defaults remain Dim Only. A warning is shown in settings if Screensaver Brightness is below 10% while URL/Video is selected.

- 🔐 **HTTP Basic Auth for WebView** (#113): FreeKiosk now automatically responds to HTTP 401 authentication challenges using credentials configured in Settings → General → Website Authentication. Enter a username and password; the password is stored in the Android Keychain (never in plain text). Leave the username empty to disable. Implemented via the `basicAuthCredential` prop of `react-native-webview`, which hooks into `WebViewClient.onReceivedHttpAuthRequest` natively — no JavaScript injection required and no impact on sites that don't use Basic Auth.

- 🔀 **Switch display mode via REST/MQTT (`setMode`)** (#76): A new `setMode` command allows switching between WebView mode and External App mode at runtime without restarting FreeKiosk. Send `{"mode":"webview","url":"https://..."}` to switch to WebView (the `url` field is optional), or `{"mode":"external_app","package":"com.app.name"}` to launch an app and activate the return overlay. Available via REST (`POST /api/mode`) and MQTT (`set/mode`). The transition is clean in both directions: switching to WebView stops the OverlayService and background monitor; switching to External App reads fresh overlay settings from storage to avoid stale closures, verifies the app is installed, starts the OverlayService, then launches the app.

- 🎯 **Motion detection sensitivity setting** (#125): A new "Sensitivity" radio group (Low / Medium / High) is now visible in Settings → Display → Screensaver → Motion Detection when motion detection is enabled. Previously the sensitivity was hardcoded to Medium. Low sensitivity requires larger movements to trigger (15% pixel change threshold), Medium is the default (8%), and High reacts to subtle movements (4%). The selected value is persisted and applied immediately to the camera-based motion detector.

- 🏠 **FreeKiosk can be set as the default home launcher** (#127): `MainActivity` now declares the `HOME` / `DEFAULT` intent categories alongside `LAUNCHER`. This makes FreeKiosk appear in the Android "Choose home app" picker and allows `adb shell cmd package set-home-activity "com.freekiosk/.MainActivity"` to succeed. Previously the command failed because no HOME intent-filter was declared on the main activity. This is optional — FreeKiosk only becomes the default launcher if the user (or ADB) explicitly selects it.

- 🔁 **Keep Alive / Launch on Boot in Website mode** (#37): Background apps (managed apps with "Keep Alive" or "Launch on Boot" enabled) can now be configured and monitored in Website (WebView) mode, not just App mode. A new "Background Apps" section appears in Settings → General when in Website mode. Use case: keep a music or audio receiver app (e.g. Spotify, Sendspin) alive in the background while displaying a web dashboard. The `BackgroundAppMonitorService` now runs independently of the display mode and stops itself automatically if no keep-alive apps are configured.

- 🗣️ **Web Speech API (speechSynthesis) polyfill** (#NEW): Web apps running inside the WebView can now use the standard `window.speechSynthesis.speak()` API for text-to-speech. Android WebView does not natively implement the Web Speech API (unlike Chrome), so FreeKiosk injects a transparent polyfill that bridges `speechSynthesis.speak()` → `postMessage` → native Android `TextToSpeech` engine. This means any web app that uses TTS (e.g. accessibility tools, notification readers, custom kiosk UIs) will work out of the box without code changes. Supports `speak()`, `cancel()`, `getVoices()`, `onvoiceschanged`, `SpeechSynthesisUtterance` (text, lang, rate, pitch, volume), and automatic language detection via the existing FreeKiosk TTS engine. The polyfill only activates when the native `speechSynthesis` is missing or non-functional (no voices). Also exposed `HttpServerModule.speak()` and `HttpServerModule.stopSpeaking()` as React Native bridge methods for direct native TTS access from JS. Requested by Carlos via email

- 🖨️ **Configurable print paper size** (#NEW): A new "Default Paper Size" selector appears in Settings → General → Printing when printing is enabled. Available sizes: A4, A5, A3, Letter, Legal. The selected size is used as the default in the Android print dialog — the user can still override it manually if needed. Previously the print dialog always defaulted to A4 regardless of CSS `@page` rules. Reported by Paolo Leone via email

### Fixed
- ⏳ **WebView stuck on infinite loading spinner for sites with redirect chains** (#140): On sites that respond with HTTP redirects (e.g. a homepage redirecting to a login page), `onLoadStart` fired once per redirect step and each call cleared and restarted the 10-second fallback timeout. If the site produced a rapid series of navigations (redirect chain, iframe loads, SPA internal routing), the countdown was continuously reset and never completed — leaving the loading overlay permanently on screen and hiding the actual page. Fixed by starting the fallback timer only once per loading session: if a timeout is already running, subsequent `onLoadStart` events leave it untouched. `onLoadEnd` and `onLoadProgress === 1` still cancel the timer normally when the page loads successfully. Reported by @SamuelSilvaG

- 📶 **SSID showing "Wifi" instead of network name on Android 12+ devices** (#80): On Android 12+ (API 31+), `WifiManager.connectionInfo` is deprecated and returns `<unknown ssid>` even when the location permission is granted and location services are enabled. Fixed by using `NetworkCapabilities.transportInfo` (the recommended API since Android 10) to retrieve the `WifiInfo` object on API 31+. Affects the REST API `/api/info`, MQTT status messages, and all system info endpoints. Reported by @hapishyguy

- 🔒 **Lock Mode permanently disabled after using "Exit Kiosk Mode"** (#124, #138): Calling "Exit Kiosk Mode" from the Advanced settings was writing `@kiosk_enabled=false` to AsyncStorage, which permanently disabled Lock Mode — on every subsequent launch, the kiosk started unlocked and users could escape via the home button. Root cause: the `setKioskEnabledInAsyncStorage(false)` call was added as belt-and-suspenders for the watchdog fix (#96), but the watchdog is already stopped explicitly via `stopService()` before the activity finishes, making the write unnecessary. Fixed by removing the AsyncStorage write from `exitKioskMode()` — `@kiosk_enabled` now stays `true`, so kiosk mode re-engages on the next FK launch. The DE fast-boot flag is still cleared (so `BootLockActivity` does not hard-lock on next reboot), and the watchdog is still stopped explicitly (#96 fix unaffected). Reported by @mpreusse and @Mkdir1511

- 🗣️ **TTS silent for Chinese and other non-Latin languages even when language data is installed** (#115): Root cause was that `TextToSpeech()` was initialized without specifying an engine — Android may pick a default English-only engine rather than the engine the user configured in system settings (which has Chinese/Japanese/Korean support). Fixed by initializing TTS with `Settings.Secure.getString("tts_default_engine")` so FreeKiosk uses the same engine as the system TTS test page. Also improved `parseLocale()` to use `Locale.forLanguageTag()` (proper BCP 47 parsing) instead of manual string splitting, fixing edge cases with tags like `zh-CN` or `zh_CN`. Also applied the same engine fix and added language auto-detection to MQTT's `speakText()` which previously spoke all text without ever calling `setLanguage()`. Reported by @nowpast

- 🔊 **Volume Button Alternative toggle not accessible in App mode** (#110): The "Volume Button Alternative" toggle (Settings → Security → Return to Settings) was hidden when display mode was set to App. It is now visible in all modes. The toggle description in App mode now clarifies that the feature is active by default and may cause accidental PIN triggers during normal volume adjustment — users who do not need it in App mode can disable it here. Reported by @Mkdir1511

- 🔒 **Kiosk not locked during Android boot on low-end / slow devices** (#98): After reboot, there was a window of 15–60 seconds where the device was unprotected while React Native loaded. This was partially fixed in v1.2.17 by `BootLockActivity` (a pure-native activity that enters lock-task in under a second), but the fix was incomplete: `ACTION_LOCKED_BOOT_COMPLETED` fires before Android decrypts CE (user-encrypted) storage, so the SQLite/AsyncStorage reads used to check kiosk settings all returned their safe default (`false`), preventing `BootLockActivity` from launching at all. Fixed by using DE (Device Encrypted) `SharedPreferences` — readable at any point during the boot process — to persist whether the fast-boot lock should activate. The DE flag is written: (a) whenever `startLockTask` / `exitKioskMode` is called from the app, and (b) at every normal `ACTION_BOOT_COMPLETED` so it stays in sync. At `ACTION_LOCKED_BOOT_COMPLETED`, only the DE flag is read (no SQLite). Additionally, if `BootLockActivity` was launched at `LOCKED_BOOT_COMPLETED` but `MainActivity` (which is not Direct Boot–aware) couldn't start yet, the activity now retries launching `MainActivity` every 5 seconds in its poll loop until CE storage becomes available. Reported by @rarcher

- 🔁 **Launch on Boot causes infinite loop in External App mode** (#37): Enabling "Launch on Boot" on a managed app (e.g. Velocity) while in External App mode caused the device to enter an unrecoverable loop — the screen cycled continuously between FreeKiosk and the external app until FreeKiosk was uninstalled. Three root causes fixed: (1) `launchBootApps()` was called on every `loadSettings()` invocation (including returns from Settings or PIN screen), not only on genuine app startup — a `bootAppsLaunchedRef` guard now ensures it fires at most once per app session; (2) `AppLauncherModule.launchBootApps()` called `bringFreeKioskToFront()` after launching the boot app, which triggered `MainActivity.onResume()` fast-path while `loadSettings` was still running — this caused a second native relaunch of the external app and a double-start of `OverlayService`, creating an unstable monitoring loop; (3) `OverlayService` is now started with the primary app's package **before** `launchBootApps()` is called (single-app mode only), so kiosk protection is active from the moment the boot app appears in the foreground — no unprotected window. As a bonus, `BootReceiver.launchMainActivityLegacy()` no longer calls `Thread.sleep()` on the main looper (replaced by a nested `postDelayed`), eliminating an ANR risk on Android 14+ devices. Reported by Tom Schiettecat (Hupac Intermodal)

- 📄 **PDF Viewer fails to load PDFs from CDN/WAF-protected servers** (#BUG): PDFs hosted behind CDN/WAFs like Alibaba Cloud (e.g. byd.com) failed to load in the built-in PDF.js viewer with "Unable to load PDF" error. Three root causes fixed: (1) **Missing Referer header** — the native PDF proxy now injects `Referer: <pdf_url>` when the WebView doesn't send one (which is always the case from `file://` origins), preventing WAF anti-hotlink blocks; (2) **Lost session cookies** — `Set-Cookie` headers from proxied responses (e.g. Alibaba's `acw_tc` WAF cookie) are now persisted back into Android's `CookieManager` so subsequent requests include them; (3) **Range request failures** — PDF.js was making multiple range requests that lost WAF session state between requests, now uses `disableRange: true` for a single full-download request for maximum compatibility. Also improved viewer error messages to include the truncated URL for easier debugging. Reported by Martin Lemke via email
- 📄 **PDF opened via popup (`window.open`) blocked by URL filtering**: When a website opened a PDF link via `window.open()` (popup), the `onOpenWindow` handler checked URL filtering **before** checking for PDF interception — causing the PDF to be blocked in whitelist mode even with the PDF viewer enabled. PDF detection now runs first in `onOpenWindow`, consistent with `onShouldStartLoadWithRequest`. Reported by Martin Lemke via email
- 🎥 **Back button overlay disappears behind camera apps in fullscreen** (#121): In External App / Multi-App mode, FreeKiosk's return overlay (back button and 5-tap exit zone) disappeared when camera apps (Google Camera, Open Camera) entered their fullscreen viewfinder mode. Root cause: camera apps use a hardware-accelerated `SurfaceView` whose compositor layer can render above `TYPE_APPLICATION_OVERLAY` windows after certain window state transitions. Fix: `OverlayService` now runs a periodic re-pin loop (every 3 s) while an external app is locked — it removes and immediately re-adds the overlay to `WindowManager`, placing it back at the top of the overlay stack. Also added `FLAG_HARDWARE_ACCELERATED` to overlay window params for correct compositing. Note: camera apps that call `SurfaceView.setZOrderOnTop(true)` permanently may still briefly occlude the overlay between re-pin cycles; the volume-button 5-tap exit (Settings → Security) remains available as an always-reachable alternative. Reported by @jmynes

- ⌨️ **Soft keyboard persists after screen sleep** (#135): When a kiosk page had an input focused (e.g. Force Numeric mode on a login screen) and the device timed out, the soft keyboard remained visible on the next screen-on instead of being dismissed with the sleep event. Fixed by calling `InputMethodManager.hideSoftInputFromWindow()` (+ `clearFocus()`) in `ScreenStateReceiver` when `ACTION_SCREEN_OFF` is received. Reported by @asfreitas17

- 📱 **Display settings tab crashes on Android 8.x (StackOverflowError in Slider)** (#86): Opening Settings → Display on Android 8.x (API 26–27) triggered an immediate `StackOverflowError` and crashed the app. Root cause: on Android 8, `AppCompatSeekBar.setMax()` internally calls `setProgressInternal()` → `refreshProgress()` → `onProgressRefresh()` → `onProgressChanged()` on the registered listener. The listener then called `seekbar.setProgress()` to clamp the value, which re-triggered `onProgressChanged()` recursively until the stack overflowed. An earlier fix attempt (v1.2.16-beta.1) added a JS-side local state wrapper in `SettingsSlider` to reduce parent re-renders during drag, but the crash happened at **initialization** time (when React Native applies `minimumValue` / `maximumValue` props via the native bridge) so the JS fix had no effect. Root fix: added a `mIsSettingProgress` re-entrancy guard directly in `ReactSliderManager.onProgressChanged()` via a patch-package patch on `@react-native-community/slider@5.1.1` — the guard returns immediately if re-entered, breaking the recursive loop. Reported by @gauthier-th

***

## [1.2.18] - 2026-03-30

### Added
- 🖨️ **Allow Printing toggle** (#NEW): New "Allow Printing" setting (off by default) in General → Printing that enables `window.print()` support in kiosk mode. When enabled: (1) the `window.print()` JavaScript call is intercepted and routed to Android's native `PrintManager`, (2) print spooler packages (`com.android.printspooler` + all installed print services like Samsung Print, HP Print, etc.) are dynamically discovered via `queryIntentServices` and automatically whitelisted in Lock Task mode so the system print dialog can appear, (3) immersive mode is suspended while the print dialog is open and re-applied after it closes, (4) `onResume` lock task re-entry is deferred during printing to avoid killing the print UI, and (5) `data:` URLs are allowed in the WebView to support popup-based print flows (label printers, receipt generators). Supports WiFi, Bluetooth, USB printers and Save as PDF. Requested by @Poppy
- ☀️ **Auto-Brightness Offset** (#92): New slider in Display → Auto-Brightness settings that lets you add a fixed percentage offset to the calculated auto-brightness value. For example, setting +10% means if the light sensor calculates 30% brightness, FreeKiosk will apply 40% instead. Useful when auto-brightness is consistently too dim for your environment but you still want it to adapt to ambient light. The offset is clamped at 100% maximum. Available in the settings UI (0–50% range with 5% steps) and via the REST API (`POST /api/autoBrightness/enable` now accepts an optional `offset` parameter, 0–100). Requested by @Delivator

### Fixed
- **TTS silent for non-English text** (#115): `/api/tts` only spoke English and was completely silent for Chinese, Japanese, Korean and other non-Latin text because `TextToSpeech.setLanguage()` was never called — the engine defaulted to English. Added automatic language detection based on Unicode script analysis (CJK → Chinese, Hangul → Korean, Hiragana/Katakana → Japanese, Arabic, Thai, Hindi, Cyrillic, etc.). Also added an optional `language` parameter (BCP 47 tag, e.g. `"zh-CN"`, `"ja"`, `"ko"`) for explicit control. The locale is now set before each `speak()` call. Requires the target language TTS voice data to be installed on the device. Reported by @nowpast
- **Some packages do not show up in app picker** (#112): Packages without a launchable UI (services, VPN tools like gnirehtet, etc.) were excluded from the managed apps picker because `getInstalledApps()` filtered on `getLaunchIntentForPackage() != null`. Added a new native method `getAllInstalledApps()` that includes user-installed (non-system) packages even when they have no launcher activity. The managed apps picker now uses this method and offers a **"Show all packages"** toggle (off by default) to reveal background services/VPNs. Non-UI apps display a "service" badge for clarity. The single-app primary picker remains launcher-only since launching a non-UI package as the main app is not meaningful. Reported by @Royalflamejlh
- **ADB configuration doesn't support multi-app mode** (#111): Added `external_app_mode` and `managed_apps` ADB intent extras to configure multi-app mode via ADB. You can now set `--es external_app_mode "multi"` and provide a JSON array of apps with `--es managed_apps '[{"packageName":"com.app1"},{"packageName":"com.app2"}]'`. Each app supports `showOnHomeScreen`, `launchOnBoot`, `keepAlive`, and `allowAccessibility` flags. Both individual intent extras and full JSON config (`--es config '{...}'`) are supported. Uninstalled packages are silently skipped. Display names are auto-resolved from the system if not provided. Reported by @Royalflamejlh
- **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (≥250ms apart) still work normally. Reported by @Mkdir1511
- **Crash on boot with Lock Mode enabled** (#109): `BootLockActivity` crashed immediately on boot with a `NullPointerException` in `hideSystemUI()` because `window.insetsController` was called before `setContentView()`. On Android R+ (API 30+), this internally accesses the `DecorView` which is only created by `setContentView()` — so the DecorView was `null`. Fixed by reordering the calls so `setContentView()` runs first, and added a try-catch safety net in `hideSystemUI()` for extra robustness on devices with unusual boot timing. Only affected v1.2.17-beta.1; v1.2.16 was unaffected because it didn't have `BootLockActivity`. Reported by @sharkooon
- **Backup import from other devices / ADB push not working** (#107): On Android 11+ (Scoped Storage), backup files pushed via `adb push` or copied from another device were invisible to the import list because `RNFS.readDir()` can only see files created by the app itself. Added a **"Browse device for backup file..."** button in the import modal that uses Android's Storage Access Framework (SAF) via `ACTION_OPEN_DOCUMENT` to open the native file picker — this bypasses Scoped Storage restrictions entirely. The JSON content is read directly through `ContentResolver` (no file copy needed). Also added `importBackupFromContent()` and `parseBackupContent()` to `BackupService` for content-based import/preview, and improved the empty-state message to guide users toward the browse button. Reported by @sharkooon
- 📖 **Device Owner setup incorrectly requires factory reset** (#68): Updated all setup documentation (README, INSTALL.md, ADB_CONFIG.md, FAQ) to clarify that a factory reset is **not** required to activate Device Owner. Android's actual requirement is that no user accounts are active on the device — users can simply sign out of all accounts, run the `dpm` command, and sign back in. Factory reset is now documented as a fallback only. Also added notes about SIM profiles/accounts that some devices retain. Reported by @realAllonZ, confirmed by @hapishyguy
- **WebView blocked by hosting providers (SiteGround, etc.)**: The hardcoded User-Agent (`Chrome/120.0.0.0` on `X11; Linux x86_64`) was outdated and had a platform mismatch — hosting WAFs flagged it as a bot. Updated the default UA to a modern Chrome 131 on Android (`Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36`). Also added a new **Custom User Agent** setting in Display settings, allowing users to override the UA string if specific sites require it
- **Screen Sleep Schedule not saving in App mode** (#103): The Screen Sleep Scheduler settings (enabled, rules, wake-on-touch) were only persisted when in Website or Media Player mode. In External App mode, the save function forcibly reset `screenSchedulerEnabled` to `false` and discarded all rules — even though the UI allowed configuring them in all modes. Moved scheduler save calls out of the mode-conditional block so they are now saved unconditionally, consistent with how they are loaded and executed. Reported by @hungrycactus
- **MQTT audio commands not working** (#102): `audio_play`, `audio_beep`, and `audio_stop` MQTT commands were not functional while their REST API equivalents worked fine. The MQTT path forwarded audio commands to JS (`ApiService.ts`) which had no handler for them, whereas the REST API handled them natively in Kotlin (`HttpServerModule`). Added native audio handling (`MediaPlayer`, `AudioTrack`) directly in `MqttModule.kt`, matching the existing REST API implementation. Reported by @zeroping
- **MQTT still fails on older devices after #97 fix** (#97): On older devices (Android 11 and below), R8 obfuscation of HiveMQ's internal classes (Dagger 2 IoC components, staged auth builder interfaces, lazy `InstanceHolder` factories) caused `AbstractMethodError` or `IncompatibleClassChangeError` on older ART runtimes when the auth code path was taken. Added comprehensive ProGuard keep rules for HiveMQ, Dagger, javax.inject, and RxJava. Hardened error handling with `catch (Throwable)` (instead of `catch (Exception)`) to properly catch `Error` subclasses from Netty/Dagger static initialization and propagate them to the UI
- **Kiosk Watchdog not stopping on exit** (#96): Fixed KioskWatchdogService continuing to run (and relaunching the app) after intentionally exiting kiosk mode. The watchdog now writes `@kiosk_enabled=false` to AsyncStorage and explicitly stops the service before closing the activity. Also clears the watchdog notification on exit. Reported by @krheinwald

***

## [1.2.17] - 2026-03-11

### Added
- 🔒 **Boot Lock Activity** (#98): New lightweight native Android activity (`BootLockActivity`) that enters lock-task mode immediately after boot — before React Native loads. On low-spec devices (e.g. Nokia C210) where RN can take 1-2 minutes to initialize, this eliminates the window where users could interact with the OS freely. The activity shows a minimal loading screen (app icon + spinner) and automatically hands off to MainActivity once React Native is ready. Only activates for Device Owner installs with kiosk mode enabled; non-DO installs use the existing delayed-launch path
- 🛡️ **Kiosk Watchdog Service** (#96): New `KioskWatchdogService` foreground service using `START_STICKY` flag to survive OOM kills. On low-RAM devices (e.g. 2GB AndroidTV), if the browser consumes too much memory and the kernel kills FreeKiosk, the watchdog automatically relaunches it within seconds. Includes relaunch cooldown (15s) to prevent relaunch storms, self-disables when kiosk mode is turned off, and uses a silent minimal-priority notification
- 🎬 **Media Player Mode** (#NEW): Brand-new display mode alongside Website and External App. Play videos and images in full-screen kiosk mode with playlist support. Features include:
  - **Local file support**: Pick videos and images directly from the device via Android's native file picker. Files are copied to app internal storage for reliable WebView playback. Supports single and multi-file selection with filter by type (video/image/any). Local files show a 📱 badge and filename in the playlist
  - **Native FilePickerModule**: New Kotlin native module (`FilePickerModule.kt`) using `ACTION_OPEN_DOCUMENT` intent with `ActivityEventListener` for result handling. Copies selected `content://` URIs to `files/media_player/` with unique naming. Includes `deleteMediaFile`, `listMediaFiles`, `clearMediaFiles` helpers
  - **Remote URL support**: Also accepts remote `http://` and `https://` URLs for hosted media content
  - **Playlist management**: Add multiple media URLs or pick local files from General settings, with auto-detection of media type based on file extension or MIME type
  - **Video support**: MP4, WebM, OGG formats with optional mute toggle
  - **Image support**: PNG, JPG, GIF, SVG, WebP with configurable per-item or default display duration (seconds)
  - **Playback options**: Auto-play, loop, shuffle, and optional on-screen controls (prev/play-pause/next with progress bar)
  - **Display options**: Fit mode (contain/cover/fill), background color, crossfade transitions with configurable duration
  - **Full kiosk integration**: Brightness control, screensaver, screen always on, status bar, lock mode, volume button return, and touch blocking all work identically to Website mode
  - **WebView-based rendering**: Uses an embedded HTML5 player via react-native-webview with `allowFileAccess`, `allowFileAccessFromFileURLs`, and `allowUniversalAccessFromFileURLs` enabled for local file playback. Dual-slot crossfade transitions
  - **Error handling**: Auto-skips unplayable items with retry, shows friendly empty state when no items configured
  - **Settings persistence**: All media player settings saved to AsyncStorage (including `isLocal` and `fileName` fields), included in backup/restore, and properly reset
  - **Android 13+ permissions**: Added `READ_MEDIA_VIDEO` and `READ_MEDIA_IMAGES` permissions for granular media access on Android 13+
- 📊 **Dashboard Mode**: New display mode that shows a configurable grid of URL tiles instead of a single WebView. Users can create tiles with custom names and URLs, each automatically assigned a distinct color. Tapping a tile opens its URL in the WebView with a navigation bar (back/forward/refresh/home). Configurable in Settings → Dashboard tab
- 📱 **Multi-App Mode** (#67): External App mode now supports managing multiple apps. Add apps from the new "Managed Apps" section in General settings — each app appears on a home screen grid with icon circles. All managed apps are automatically whitelisted in Lock Task Mode, so users can switch between them without escaping the kiosk. The primary app (single package) still works exactly as before for backward compatibility
- 🚀 **Launch App on Boot** (#37): Managed apps with "Launch on Boot" enabled are automatically started in the background when the device boots, before FreeKiosk's own UI loads. Combined with "Keep Alive", apps can be maintained as persistent background services
- 💓 **Keep Alive Background Monitor** (#37): New `BackgroundAppMonitorService` foreground service checks every 30 seconds (via `UsageStatsManager`) if managed apps with "Keep Alive" enabled are still running, and relaunches them if they've stopped or crashed. Starts automatically on boot when at least one keep-alive app is configured
- ♿ **Accessibility Whitelist for Other Apps** (#66): Device Owners can now allow other apps' accessibility services via a per-app "Allow Accessibility" toggle in Managed Apps settings. Uses `DevicePolicyManager.setPermittedAccessibilityServices()` to whitelist selected packages alongside FreeKiosk's own service. Applied at boot, on save, and when enabling via Device Owner
- ⚙️ **Android Settings Button** (#89): New "Android System Settings" section in the Advanced tab with a main button to open the native Android settings, plus quick-access shortcuts for WiFi, Sound, Display, Bluetooth, Date & Time, and Apps. Fully compatible with Lock Task Mode (kiosk): automatically pauses the lock, opens the settings, and re-engages kiosk mode when the user returns to FreeKiosk. An info banner warns when kiosk mode is active. Useful for devices with no physical navigation buttons where ADB commands are restricted by Admin mode
- 🔍 **WebView Zoom Level** (Display settings): New slider to control how web pages are rendered in WebView mode. Range: 50%–200%, default 100% (matches Chrome's default rendering). Quick presets at 75%, 100%, 125%, 150%. An info hint appears when zoom is not at default. Persisted to storage and included in backup/restore. Only available in WebView mode

### Changed
- 🏪 **Play Store compliance: conditional self-update** (#playstore): In-app self-update via GitHub (check for updates, download APK, install) is now completely disabled when building for the Play Store. A single Gradle flag (`-Pplaystore`) controls everything at compile time — no separate codebase needed. When active: `REQUEST_INSTALL_PACKAGES` permission is removed from the merged manifest, `UpdateInstallReceiver` is disabled, the entire "Updates" UI section is hidden from Settings → Advanced, and all native update methods become no-ops. R8 strips the dead update code from the final bytecode. Normal sideload/F-Droid builds (`./gradlew assembleRelease`) remain fully functional with self-update enabled. Play Store builds: `./gradlew bundleRelease -Pplaystore`

### Fixed
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (>=250ms apart) still work normally. Reported by @Mkdir1511
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (≥250ms apart) still work normally. Reported by @Mkdir1511
- 📡 **MQTT doesn't connect when password is set** (#97): Fixed a crash in the password masking logic used for debug logging — `String.repeat(password.length - 6)` produced a negative count for passwords shorter than 7 characters, throwing `IllegalArgumentException` before the MQTT client was even built. This silently aborted `connect()`, resulting in zero network traffic and an immediate return to "Disconnected". Also fixed authentication being skipped entirely when a password was configured without a username (the auth block was gated on `!username.isNullOrBlank()` only)
- 🔄 **Inactivity Return now works in Dashboard Mode**: Previously, enabling "Inactivity Return" with Dashboard Mode had no effect because the feature required a base URL (which is empty in dashboard mode). Now correctly returns to the dashboard grid after the configured timeout
- 🔄 **URL Planner return to dashboard grid**: When a scheduled planner event ended while in Dashboard Mode, the app did not return to the dashboard grid due to a stale closure in the planner callback. Fixed by using a ref to track the active event
- ♿ **Accessibility auto-enable fails with "Permission denial: WRITE_SECURE_SETTINGS"** (#99): The "Enable Automatically (Device Owner)" button crashed because `Settings.Secure.putString()` requires `android.permission.WRITE_SECURE_SETTINGS`, which is not automatically granted to Device Owners. Added the permission to the manifest, wrapped the secure settings write in a `SecurityException` catch with a specific `WRITE_SECURE_SETTINGS_REQUIRED` error code, and improved the UI to show a clear dialog with the one-time ADB command (`adb shell pm grant com.freekiosk android.permission.WRITE_SECURE_SETTINGS`). The "Open Accessibility Settings" manual fallback remains available. `BootReceiver` also handles the missing permission gracefully instead of crashing silently. Updated ADB provisioning scripts and troubleshooting docs
- 🔒 **PIN bypass via back gesture** (#93): Fixed a security issue where swiping back (Android predictive back gesture) from the Settings or PIN screen could bypass PIN protection on Android 16+ devices (e.g. Lenovo Idea Tab Pro). Disabled swipe-back gestures on PIN and Settings screens, added `BackHandler` to block hardware/gesture back navigation, and replaced `navigation.navigate` with `navigation.reset` to fully clear the navigation stack when returning to kiosk mode
- 📦 **Self-update fails with "No storage permission"** (#88): The APK download used `setDestinationInExternalPublicDir()` which requires `WRITE_EXTERNAL_STORAGE` runtime permission — never requested at runtime. Switched to `setDestinationInExternalFilesDir()` (app-private directory), eliminating the storage permission requirement entirely. Old downloaded APKs are now cleaned up automatically before each new download
- 📦 **Self-update fails to install on Android 8+** (#88): After downloading, the APK install was blocked because "Install from unknown sources" was not enabled for the app. Added a pre-download permission check (`canRequestPackageInstalls()`) with a user-friendly dialog that opens the system settings page to grant the permission. On restricted devices (e.g. Amazon Echo Show / Fire OS) where the settings page doesn't exist, a clear fallback message guides the user to use `adb install -r <apk>` instead
- 🔧 **Duplicate import in HttpServerModule** (#88): Removed duplicate `android.location.LocationManager` import that caused Kotlin compilation failure
- 🎮 **Remote control now works natively like a physical keyboard** (#85): Remote key commands (`/api/remote/up`, `down`, `left`, `right`, `select`, `back`, `home`, `menu`, `playpause`) were previously routed through a JavaScript round-trip via React Native bridge, which prevented them from behaving like real hardware key presses. Now handled entirely in native code — dispatched via the AccessibilityService (cross-app D-pad navigation with UI element highlighting) or `activity.dispatchKeyEvent()` (in-app fallback). On /e/OS, LineageOS, and other custom ROMs, this enables proper focus-based UI navigation identical to a physical remote/keyboard
- 📡 **MQTT now supports remote control and keyboard commands** (#85): Added 12 new MQTT command topics for full remote control parity with the REST API — `remote_up`, `remote_down`, `remote_left`, `remote_right`, `remote_select`, `remote_back`, `remote_home`, `remote_menu`, `remote_playpause`, `keyboard_key`, `keyboard_combo`, `keyboard_text`. Home Assistant Discovery registers 9 new button entities (remote D-pad) and 3 new text entities (keyboard input), bringing the total from 30 to 42 auto-discovered entities
- 📡 **MQTT background persistence** (#80): MQTT now stays alive when the app is in background or the screen is off, with 4 layers of protection: (1) `PARTIAL_WAKE_LOCK` + `WIFI_MODE_FULL_HIGH_PERF` keep CPU and WiFi active for MQTT PING packets, (2) `NetworkCallback` detects WiFi recovery and triggers immediate reconnect instead of waiting for TCP timeout + exponential backoff, (3) OverlayService watchdog checks MQTT health every 60 seconds from the existing foreground service, (4) `SCREEN_ON` receiver triggers an instant MQTT reconnect check when the screen wakes up
- 🏷️ **MQTT Device Name prompt on every keystroke** (#80): Changing the Device Name no longer triggers a reconnect popup on every key press. The reconnect prompt now only appears once when the field loses focus (onBlur), so you can finish typing the full name before being asked to reconnect
- 📶 **WiFi `connected` field reporting true when not on WiFi** (#80): MQTT status and REST API used `ipAddress != "0.0.0.0"` to determine WiFi connection, which returned `true` if the device had cellular data, Ethernet, or USB tethering. Now uses `ConnectivityManager.getNetworkCapabilities(TRANSPORT_WIFI)` consistently across all 3 modules (SystemInfoModule, MqttModule, HttpServerModule) — only returns `true` when actually connected to WiFi
- 📶 **SSID shows "WiFi" instead of actual network name** (#80): When Android blocks SSID access (missing location permission or location services disabled), the app now shows a diagnostic message — `"WiFi (no permission)"` or `"WiFi (location off)"` — instead of silently showing `"WiFi"`, so users can identify and fix the issue. Also handles the `0x` edge case on some Chinese tablets


***

## [1.2.16] - 2026-03-03

### Added
- 💤 **"Keep Screen On" toggle** (#83): New option in Display settings to disable `FLAG_KEEP_SCREEN_ON`. When turned off, the Android system manages screen timeout normally — the display turns off after the device's configured inactivity period, just like a regular device. Default is ON (standard kiosk behavior — no change for existing users). Screensaver is automatically disabled and hidden when this option is off, since the system handles sleep. Only available in WebView mode (External App mode already delegates screen management to the system). Included in backup/restore and reset. REST API / MQTT `screensaverOn` command is ignored when keep-screen-on is disabled
- 📊 **Device hardware info in MQTT & REST API** (#80): Status now includes `manufacturer`, `model`, `androidVersion`, `apiLevel`, `processor`, `deviceName`, `product`, and `uptime` fields in both MQTT status and REST API `/api/status`. Home Assistant Discovery now registers 5 new sensors: Manufacturer, Model, Android Version, Processor, and Uptime
- 📊 **Real device info in Home Assistant Discovery**: Device block now shows actual manufacturer and model (e.g., "Samsung Galaxy Tab A") instead of hardcoded "FreeKiosk by FreeKiosk". Added `hw_version` with Android version info

### Fixed
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (>=250ms apart) still work normally. Reported by @Mkdir1511
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (≥250ms apart) still work normally. Reported by @Mkdir1511
- **Accessibility service persistence** (#80): Added `android:isAccessibilityTool="true"` to prevent Android 12+ from auto-disabling the service after inactivity. Added automatic re-enablement on boot when app is Device Owner — the accessibility service is now programmatically re-enabled in `BootReceiver` using Device Owner privileges, surviving reboots without manual intervention
- 📡 **MQTT disconnects when app goes to background** (#80): Added `AppState` listener that detects when the app returns to foreground and automatically reconnects MQTT if the connection was lost during background/Doze mode. Devices now recover their MQTT connection seamlessly
- 🏷️ **MQTT Device Name not updating** (#80): Changing the Device Name in MQTT settings now prompts the user to reconnect, ensuring the new name takes effect in topics and Home Assistant discovery. Previously the old name/ID persisted until a manual disconnect/connect cycle
- 🏷️ **MQTT Device Name pre-filled with device model** (#80): The Device Name field now auto-fills with the Android device model (e.g., "SM-T510", "Pixel 7") on first use, instead of generating a random hex ID. Makes it easy to identify devices in a fleet
- 🧪 **ExecuteJS command reliability** (#80): Fixed `executeJs` (via REST API and MQTT) silently failing when: (a) the same JS code was sent twice in a row (React state didn't change), (b) the page was still loading. Now appends a unique marker to force re-execution, and retries up to 5 seconds if the page is loading
- 📶 **SSID reporting inconsistency** (#80): Fixed `<unknown ssid>` being passed through raw in `SystemInfoModule` (Status Bar) — now consistently shows "WiFi" as fallback across all modules when location permission prevents SSID access
- �📷 **Camera2 fallback for devices where CameraX fails entirely** (MediaTek LEGACY, front-only cameras): On some devices, CameraX's `CameraValidator` permanently rejects the camera (e.g. front-only devices where BACK camera verification fails), so vision-camera never reports any cameras. Added a Camera2 API fallback: the settings screen now queries `Camera2` directly via a new `getCamera2Devices()` native method when CameraX returns nothing, and the motion detector automatically switches to Camera2-based photo capture (`captureCamera2Photo()`) when vision-camera has no device — enabling motion detection on hardware that CameraX cannot handle
- 🐛 **Fixed crash (CalledFromWrongThreadException) when entering standby/screensaver** (#82): Native events (`onScheduledSleep`, `onScheduledWake`, `navigateToPin`, `onScreenStateChanged`, API commands) were triggering React state updates synchronously on the `mqt_v_native` thread, causing `react-native-screens` to manipulate the Android view hierarchy from a non-UI thread. Wrapped all native event callbacks with `setTimeout(cb, 0)` to defer state updates to the next event loop tick, ensuring React commits go through proper UI thread dispatch
- 🐛 **Fixed invisible PIN input on dark mode devices** (#81): The PIN `TextInput` had no explicit `color` set, so Android dark mode overrode the text/dot color to white — making input invisible against the white background. Added explicit `color: '#333333'` and `placeholderTextColor` to ensure dots and placeholder are always visible regardless of system theme

***

## [1.2.15] - 2026-02-26

### Added
- 💡 **Allow system brightness management** (#65): New toggle "App Brightness Control" in Display settings. When disabled, FreeKiosk never touches screen brightness — system tools like Tasker, Android adaptive brightness, or other automation apps retain full control. Applies to both WebView and External App modes. All brightness-related UI (manual slider, auto-brightness, screensaver brightness) is hidden when disabled. REST API brightness commands are also ignored when disabled.
- 🧪 **Beta update channel**: Opt-in toggle to receive pre-release versions before stable releases
  - New "🧪 Beta Updates" toggle in the Updates section (Settings → Advanced)
  - When enabled, the in-app updater checks GitHub pre-releases (tagged `v1.2.15-beta.1`, etc.)
  - When disabled (default), behavior is unchanged — only stable releases are shown
  - Update alert shows a 🧪 badge and "(pre-release)" label for beta versions
  - Semver-aware version comparison: `1.2.15-beta.1 < 1.2.15-beta.2 < 1.2.15` (stable always wins)
  - No downgrade: switching beta OFF won't propose installing an older stable over a newer beta

### Fixed
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (>=250ms apart) still work normally. Reported by @Mkdir1511
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (≥250ms apart) still work normally. Reported by @Mkdir1511
- 🔐 **MQTT password field adding extra characters**: Removed custom bullet-masking logic in `SettingsInput` and replaced with native `secureTextEntry` — same fix as PinInput (v1.2.5). Custom masking reconstructed the real value from display text lengths, which broke with Samsung/Gboard predictive text, autocorrect, and paste, silently injecting extra characters. Affects MQTT password, API key, and all other password fields using `SettingsInput`.
- **REST API camera photo endpoint returns "Invalid or missing API key" after settings change**: `ApiSettingsSection` now always restarts the HTTP server with the current stored settings when the REST API settings page is opened. Previously, if the server was started by `KioskScreen` with an API key that was later cleared in settings, the running server kept its stale config (the JS settings page found it "already running" and skipped re-applying the new config). Also fixed a related race condition in the port/key/control change handlers where they checked a potentially-stale React `serverRunning` state instead of querying the native module.
- 🔧 **Motion detection shows "No cameras available" on non-standard SoCs** (Rockchip, Amlogic, etc.): react-native-vision-camera's ProcessCameraProvider initializes asynchronously — on slow hardware it resolves after the settings screen already read the empty camera list; fixed by subscribing to `CameraDevicesChanged` so the UI updates as soon as cameras become available

***

## [1.2.14] - 2026-02-23

### Added
- 🔌 **MQTT Configuration via ADB intents**: Configure all MQTT settings headlessly for automated tablet provisioning
  - 11 parameters supported: `mqtt_enabled`, `mqtt_broker_url`, `mqtt_port`, `mqtt_username`, `mqtt_password`, `mqtt_client_id`, `mqtt_base_topic`, `mqtt_discovery_prefix`, `mqtt_status_interval`, `mqtt_allow_control`, `mqtt_device_name`
  - MQTT password stored securely in Android Keychain, same pattern as PIN
  - Example usage:
    ```bash
    adb shell am start -n com.freekiosk/.MainActivity \
        --es mqtt_enabled "true" \
        --es mqtt_broker_url "broker.local" \
        --es mqtt_port "1883" \
        --es mqtt_username "user" \
        --es mqtt_password "pass"
    ```
- 🔒 **TLS/SSL MQTT support**: New `useTls` config option — auto-enabled when port is 8883
- 🔔 **MQTT connection errors surfaced to UI**: Broker errors (e.g. `NOT_AUTHORIZED`) now propagate from native Kotlin → JS → Settings UI — no more silent failures
- 💾 **Password saved hint**: Shows "Password is saved" when a password is already configured, preventing accidental overwrites

### Fixed
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (>=250ms apart) still work normally. Reported by @Mkdir1511
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (≥250ms apart) still work normally. Reported by @Mkdir1511
- 🔄 **MQTT reconnect losing credentials**: HiveMQ's `automaticReconnect()` was sending `null` username/password on reconnection, causing the broker to reject with `NOT_AUTHORIZED`. Replaced with manual reconnect that always sends full credentials, with exponential backoff (1s → 30s)
- 🏗️ **Release build crash (R8/ProGuard)**: R8 obfuscation was renaming Netty/JCTools fields used via `Unsafe.objectFieldOffset()` reflection, causing `ExceptionInInitializerError` on startup in release builds. Added official HiveMQ ProGuard rules (`-keepclassmembernames`)
- 📋 **Password paste truncated to one character**: MQTT password field was incorrectly capturing only the last character on paste (`slice(-1)` → `slice(-charsAdded)`)
- ⌨️ **Broker URL keyboard adding spaces after dots**: Fixed by setting `keyboardType="url"` on the broker URL input
- 🔁 **Connect button ALREADY_RUNNING error**: `handleConnect` now stops the existing MQTT client before starting a new one
- 🔄 **External App Mode: child activities no longer killed by auto-relaunch** (#69): barcode scanners, file pickers, camera intents, and other child activities launched by the locked app are now properly detected and allowed
  - Uses `ActivityManager.runningAppProcesses` to check if the locked app's process is still alive (not crashed) — if alive and foreground is not a launcher, it's a child activity
  - Launchers (Home screen) are dynamically detected via `PackageManager.queryIntentActivities(ACTION_MAIN, CATEGORY_HOME)` — works on all OEMs without hardcoding
  - Safe in Lock Task mode: user cannot open other apps, only the locked app can launch child activities
  - Logic: launcher detected → relaunch FreeKiosk; locked app process alive → allow child activity; process dead → relaunch FreeKiosk
  - Fixes use cases: MLKit barcode scanner, camera intents, file pickers, permission dialogs, any native modal launched by the locked app
- 🚀 **External App Mode boot: REST API now starts automatically**: When FreeKiosk is set as default launcher in External App Mode, `HomeActivity` now also starts `MainActivity` in background
  - Ensures REST API server, MQTT, and other services are running even when an external app is in foreground
  - `MainActivity` automatically moves to background (`moveTaskToBack`) when started from `HomeActivity`
  - Fixes issue where the external app would start but FreeKiosk's API server wouldn't be accessible

***

## [1.2.13] - 2026-02-20

### Added
- 📡 **MQTT + Home Assistant Auto-Discovery**: Native MQTT client with full HA integration
  - **27 auto-discovered entities** in Home Assistant via MQTT Discovery protocol
  - **11 sensors**: Battery level, brightness, WiFi SSID, WiFi signal, light sensor, IP address, app version, memory used, storage free, current URL, volume
  - **6 binary sensors**: Screen on/off, screensaver active, battery charging, kiosk mode, device owner, motion detected
  - **2 number controls**: Brightness (0-100%), volume (0-100%) — adjustable sliders in HA
  - **2 switches**: Screen power (ON/OFF), screensaver (ON/OFF)
  - **5 buttons**: Reload, wake, reboot, clear cache, lock
  - **1 text entity**: Navigate URL — send a URL to load in the WebView
  - **20 additional commands** via MQTT: TTS, toast, audio play/stop/beep, launch app, execute JS, URL rotation start/stop, restart UI
  - **Push-based status**: Periodic state publishing (configurable 5-3600 seconds, default 30s)
  - **LWT (Last Will & Testament)**: Automatic availability tracking — HA shows device as unavailable on disconnect
  - **Auto-reconnect**: Handles WiFi drops and broker restarts with automatic re-publishing of all discovery configs
  - **Always-on Motion Detection**: Configurable option to run camera-based motion detection continuously (not just during screensaver)
  - **Full command parity** with REST API — both interfaces dispatch through the same command handler
  - **Concurrent operation**: MQTT and REST API can run simultaneously
  - Eclipse Paho MQTT v3.1.1 with secure password storage (Android Keychain)
  - Settings: Broker URL, port, username, password, client ID, base topic, discovery prefix, status interval, allow control
  - Connection status indicator in Settings UI
  - MQTT settings included in backup/restore
  - **[Full MQTT Documentation](docs/mqtt.md)**
### Fixed
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (>=250ms apart) still work normally. Reported by @Mkdir1511
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (≥250ms apart) still work normally. Reported by @Mkdir1511
- 🔊 **No audio in Lock Mode on Samsung/OneUI devices**: audio streams were muted by Samsung when `LOCK_TASK_FEATURE_NONE` was set, which is more restrictive than Android's own default behavior
  - `LOCK_TASK_FEATURE_GLOBAL_ACTIONS` is now included by default (matches Android's own default when `setLockTaskFeatures()` is never called), preventing Samsung/OneUI from muting audio in `LOCK_TASK_MODE_LOCKED`
  - Added `AudioManager` safety net: after entering lock task mode, `setMasterVolumeMuted(false)` is called followed by `ADJUST_UNMUTE` on all audio streams (MUSIC, NOTIFICATION, ALARM, RING)
  - **Settings UI change**: "Allow Power Menu" toggle renamed to "🔌 Block Power Menu" with inverted logic — power menu is now **allowed by default**, admin can explicitly block it if needed
  - **No migration required**: same storage key `@kiosk_allow_power_button` — existing user settings preserved; only new installs benefit from the new default
  - Applied consistently across `KioskModule.kt`, `MainActivity.kt`, and `AppLauncherModule.kt`
- 🔧 **Camera/Microphone not working in WebView on Fire OS** (Echo Show, Fire tablets) (#63): auto-grant WebView media/geolocation permissions in kiosk mode — OS-level permission via `pm grant` still required


***

## [1.2.12] - 2026-02-18

### Added
- 🔒 **Screen lock without Device Owner**: `screen/off` and `lock` now work with Device Admin or AccessibilityService
  - 4-tier fallback: Device Owner `lockNow()` → **Device Admin `lockNow()`** → AccessibilityService `GLOBAL_ACTION_LOCK_SCREEN` (API 28+) → dim brightness to 0
  - `dpm.lockNow()` is available to Device Admin apps (API 8+), not just Device Owner — was an oversight
  - Enables full FreeKiosk screen control when another MDM already holds Device Owner
  - Truly turns off the screen (hardware off) with any of the 3 first tiers
  - Wake-up cycle (`screen/on`, AlarmManager, WakeLock) unchanged and fully compatible
  - `/api/lock` and `screen/off` response now includes `"method"` field (`"DeviceOwner"`, `"DeviceAdmin"`, or `"AccessibilityService"`)

- **Inline PDF Viewer**: PDFs now open directly in-app via a bundled PDF.js viewer instead of being downloaded
  - Enabled via a toggle in **Settings → General → PDF Viewer**
  - Uses **PDF.js v3.11.174** bundled locally in Android assets — no Google Docs, no external service
  - Full viewer UI: page navigation (◀/▶), zoom (−/⊡/+), close (✕), and download (⬇) buttons
  - **Download button** triggers the native Android `DownloadManager` (notification + Downloads folder)
  - Intercepts PDF links at 3 levels:
    1. **JS injection**: strips `<a download>` attributes so Android's DownloadListener doesn't fire early
    2. **`onShouldStartLoadWithRequest`**: redirects `.pdf` URLs and Google redirect URLs (`google.com/url?url=...`) to the viewer
    3. **Native `DownloadListener` patch** (`RNCWebViewManagerImpl.kt`): intercepts PDFs detected by `Content-Type: application/pdf` or `Content-Disposition: attachment` and loads the viewer instead of downloading
  - **Native HTTP proxy** (`RNCWebViewClient.java` `shouldInterceptRequest`): when the viewer is active, proxies all remote PDF XHR requests via `HttpURLConnection` to bypass CORS restrictions — cookies and `Range` headers forwarded
  - Security: `allowFileAccess` / `allowUniversalAccessFromFileURLs` only enabled when PDF viewer is on
  - All patches saved in `patches/react-native-webview+13.16.0.patch` via `patch-package`

- ♿ **AccessibilityService for cross-app key injection**: New `FreeKioskAccessibilityService` enables keyboard emulation in External App mode
  - Uses `performGlobalAction()` for Back/Home/Recents/PlayPause navigation (all Android versions)
  - Uses `InputMethod.sendKeyEvent()` / `commitText()` for keys and text on Android 13+ (API 33+)
  - **DPAD navigation fallback** (all Android versions): spatial focus traversal via accessibility tree,
    `ACTION_CLICK` for select, `ACTION_SCROLL_FORWARD/BACKWARD` for scrolling
  - **Play/Pause** mapped to `GLOBAL_ACTION_KEYCODE_HEADSETHOOK` (Android 12+)
  - Fallback for Android 5–12: `ACTION_SET_TEXT` injects printable characters, text, Backspace, and Shift+letter
  - `KeyCharacterMap` converts keyCodes to printable characters for the ACTION_SET_TEXT fallback
  - 5-tier fallback chain: globalAction → InputMethod → a11y navigation → ACTION_SET_TEXT → `input keyevent`
  - **Settings UI**: New "Accessibility Service" section in Advanced Settings with:
    - Status indicator (Active / Enabled / Disabled)
    - "Open Accessibility Settings" button to launch Android's settings
    - "Enable Automatically" button for Device Owner mode (no user interaction needed)
    - Info box explaining why the service is needed
  - Compatible with privacy ROMs (e/OS, LineageOS, CalyxOS, GrapheneOS) where `Instrumentation` is blocked

### Fixed
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (>=250ms apart) still work normally. Reported by @Mkdir1511
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (≥250ms apart) still work normally. Reported by @Mkdir1511
- 🔑 **Key injection compatibility fix**: Replaced `Instrumentation.sendKeyDownUpSync()` with `activity.dispatchKeyEvent()` across all remote/keyboard endpoints
  - `Instrumentation` requires `INJECT_EVENTS` (signature-level permission) which privacy-focused ROMs (e/OS, LineageOS, CalyxOS, GrapheneOS) block
  - `dispatchKeyEvent()` dispatches directly into the Activity's View hierarchy — no special permission needed
  - Affects: `/api/remote/*` (all 9 keys), `/api/remote/keyboard/{key}`, `/api/remote/keyboard?map=...`, `/api/remote/text`
  - Also fixed in `KioskModule.sendRemoteKey()` (used by JS-side remote control)
  - No regression on standard ROMs (Samsung, Pixel, AOSP)


***

## [1.2.11] - 2026-02-16

### Added
- ⌨️ **Keyboard Emulation API**: Full keyboard input simulation via REST API ([#keyboard](https://github.com/FreeKiosk/FreeKiosk/issues))
  - **Single key press** (`GET|POST /api/remote/keyboard/{key}`): Send any keyboard key
    - Supports: a-z, 0-9, F1-F12, space, tab, enter, escape, backspace, delete, arrows, symbols, media keys
    - Over 80 named keys + single character support
  - **Keyboard shortcuts** (`GET|POST /api/remote/keyboard?map=ctrl+c`): Send key combinations with modifiers
    - Supports: ctrl, alt, shift, meta (Windows/Cmd key)
    - Examples: `ctrl+c`, `ctrl+v`, `alt+f4`, `ctrl+shift+a`
  - **Text input** (`POST /api/remote/text`): Type full text strings into focused input fields
    - Body: `{"text": "Hello World!"}`
    - Uses `Instrumentation.sendStringSync()` for natural text input
  - All keyboard operations handled natively (no JS bridge — fast and reliable)
- 📍 **GPS Location API** (`GET /api/location`): New endpoint for device GPS coordinates
  - Returns: latitude, longitude, accuracy, altitude, speed, bearing, provider, timestamp
  - Uses GPS, Network, and Passive location providers (best accuracy wins)
  - Permissions already declared in manifest (`ACCESS_FINE_LOCATION` + `ACCESS_COARSE_LOCATION`)
- 🔋 **Enriched Battery API**: `GET /api/battery` now returns additional data
  - New fields: `temperature` (°C), `voltage` (V), `health` (good/overheat/dead/etc.), `technology` (Li-ion/etc.)
  - Backward compatible: existing `level`, `charging`, `plugged` fields unchanged
- 🔒 **Lock Device API** (`GET|POST /api/lock`): New endpoint to lock the device screen
  - Uses `DevicePolicyManager.lockNow()` for a true screen lock (Device Owner required)
  - Returns clear error message if Device Owner mode is not active
- 🔄 **Restart UI API** (`GET|POST /api/restart-ui`): New endpoint to restart the app UI
  - Calls `activity.recreate()` to fully restart the React Native activity
  - Useful for remote troubleshooting without rebooting the device
- 🗣️ **Text-to-Speech (TTS)**: Fully implemented native TTS via Android `TextToSpeech` engine
  - TTS engine is initialized when the HTTP server starts
  - Handled natively (no JS bridge dependency — works even if React Native is unresponsive)
  - Auto-retries if TTS engine is not ready on first call
- 📊 **Volume Read API** (`GET /api/volume`): New endpoint to read current volume level
  - Returns `{ level: 0-100, maxLevel: 100 }` for easy integration with Home Assistant sensors

### Fixed
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (>=250ms apart) still work normally. Reported by @Mkdir1511
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (≥250ms apart) still work normally. Reported by @Mkdir1511
- 🐛 **Screen Sleep Scheduler - Black Screen & Navigation Lockout**: Fixed 4 critical bugs causing scheduler to malfunction
  - **Feedback loop**: Scheduler re-entered sleep immediately after wake due to `isScheduledSleep` in useEffect dependency array
  - **Navigation lockout**: Scheduler interval kept running while on PIN/Settings screen, calling `lockNow()` and locking user out
  - **Wake-on-touch broken**: Touch events during sleep did nothing — never restored brightness or called `exitScheduledSleep()`
  - **Stale closure**: `checkScreenSchedule()` used outdated state variable instead of ref
  - **N-tap during sleep**: 5-tap for settings now properly exits scheduled sleep before navigating to PIN
  - **Activity null after lockNow()**: `turnScreenOn()` now acquires WakeLock before checking for activity availability
  - Fixes black screen issue on Android 8.1+ and impossible settings access during sleep windows
- 🐛 **Power menu dismissed immediately on some devices (TECNO/HiOS)**: Fixed GlobalActions (power menu) being closed ~900ms after appearing when "Allow Power Button" is enabled in Lock Mode
  - Root cause: `onWindowFocusChanged` aggressively re-applied immersive mode, stealing focus back from the system power menu window
  - Additionally, `onResume` would re-trigger `startLockTask()` during the brief focus transition, compounding the issue
  - Fix: debounced `hideSystemUI()` by 600ms on focus regain, and deferred `startLockTask()` re-lock when power button is allowed and focus was recently lost
  - No security impact: Lock Task Mode remains fully active throughout — only the cosmetic immersive mode re-application is delayed
  - Affects TECNO, Infinix, itel (HiOS) and potentially other OEMs with aggressive WindowManager behavior on Android 14+
- 🐛 **Device Owner Status Hardcoded `false` in API**: Fixed `/api/info` and `/api/status` always reporting `isDeviceOwner: false`
  - Was hardcoded to `false` in `HttpServerModule.getDeviceStatus()`
  - Now performs a real `DevicePolicyManager.isDeviceOwnerApp()` check
  - This caused external dashboards to incorrectly show Device Owner as inactive
- 📺 **Screen On Not Working After lockNow()**: Fixed `GET /api/screen/on` failing when screen was off
  - `reactContext.currentActivity` was `null` after `lockNow()` and the code silently did nothing
  - WakeLock is now acquired **before** checking for activity (WakeLock works without activity)
  - Added keyguard dismissal to properly wake from locked state
  - Screen now reliably turns on whether activity is available or not
- 🧹 **Clear Cache Now Actually Clears**: Fixed `/api/clearCache` which only reloaded the WebView
  - Now performs a full native cache clear: WebView HTTP cache, cookies, Web Storage (localStorage/sessionStorage), form data
  - Then forces a WebView remount on the JS side for a complete fresh start
- 🔄 **In-App Update 404 Error**: Fixed update download failing with 404 error
  - Now retrieves actual APK download URL from GitHub release assets instead of constructing it
  - Eliminates filename case sensitivity issues (FreeKiosk vs freeKiosk)
  - More robust: works regardless of APK naming convention changes
  - Fallback to constructed URL if asset parsing fails
- 📸 **Screenshot Race Condition**: Fixed `/api/screenshot` returning 503 intermittently
  - Replaced `Thread.sleep(100)` with a proper `CountDownLatch` to wait for the UI thread
  - Screenshot capture now waits up to 5 seconds for the UI thread to complete

***

## [1.2.10] - 2026-02-11

### Added
- ⏱️ **Inactivity Return - Scroll to Top Toggle**: New optional behavior for when already on start page
  - Added "Scroll to Top on Start Page" toggle (enabled by default)
  - When enabled and already on start page, smoothly scrolls to top instead of doing nothing
- 🔗 **URL Filtering (Blacklist / Whitelist)**: Control which URLs users can navigate to within the kiosk WebView
  - Choose between **Blacklist** mode (block specific URLs) or **Whitelist** mode (allow only specific URLs)
  - Wildcard pattern support (e.g., `*.example.com/*`, `freekiosk.app/download`)
  - Patterns without protocol are automatically matched with `http://` and `https://`
  - Main kiosk URL is always protected and cannot be blocked
  - Empty whitelist = strictest mode (only main URL allowed)
  - Works with both traditional navigation and SPA/client-side routing (pushState)
  - Optional visual feedback toast when a URL is blocked
  - Popup/new window URLs are also filtered

### Fixed
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (>=250ms apart) still work normally. Reported by @Mkdir1511
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (≥250ms apart) still work normally. Reported by @Mkdir1511
- 🔗 **URL Filtering - Form Submits and JS Buttons**: Fixed form submissions and JavaScript buttons being blocked in whitelist mode
  - Filter now compares origin + pathname instead of just origin
  - Same-page navigations (query params, hash changes, form submits) are always allowed
  - Trailing slashes are normalized (e.g., `https://example.com` and `https://example.com/` are treated as identical)
  - Only navigation to different pages on the same domain requires whitelist match
- 📡 **NFC Monitoring Fix**: Fixed "flicking back to blue screen" when NFC is enabled in kiosk mode
  - Foreground monitoring detected transient `com.android.nfc` package as a wrong app and triggered a relaunch loop
  - NFC system package is now filtered from monitoring checks only when NFC mode is active
  - No impact on monitoring behavior when NFC is disabled
- 💾 **Backup/Restore Missing Settings**: Fixed 20 settings keys not being included in export/import backups
  - Added missing URL filtering settings (blacklist/whitelist lists and configuration)
  - Added missing screen scheduler, inactivity return, blocking overlays settings
  - Added missing WebView back button, camera position, return-to-settings preferences
  - PIN mode setting now properly backed up and restored

***

## [1.2.9] - 2026-02-11

### Fixed
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (>=250ms apart) still work normally. Reported by @Mkdir1511
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (≥250ms apart) still work normally. Reported by @Mkdir1511
- 📱 **Status Bar Rotation Fix**: Fixed custom status bar disappearing after screen rotation in external app mode
  - OverlayService now recreates the status bar overlay after configuration changes
  - MainActivity re-hides Android system bars on rotation to prevent them from reappearing
- 🔧 **Lock Mode "Device Owner not configured" False Warning**: Fixed JS bundle out of sync with native Kotlin module
  - `startLockTask` call in bundled JS had 2 parameters instead of 3 (missing `allowNotifications`)
  - React Native bridge could not match the method signature, causing a silent exception
  - Resulted in false "Device Owner not configured" warning even when Device Owner was properly set
- 🖱️ **5-Tap During Page Load**: Fixed 5-tap not working while WebView is loading or when page fails to load
  - Invisible touch zone in bottom-right corner during loading and error states
  - Tapping it counts as a 5-tap interaction, allowing access to settings even without network
  - Touch zone disappears automatically once the page loads successfully (JS-based detection takes over)

***

## [1.2.8] - 2026-02-10

### Added
- 🖨️ **WebView Print Support**: Native Android printing via `window.print()` interception
  - Supports all connected printers (WiFi, Bluetooth, USB, Cloud Print, PDF)
- 🔗 **URL Filtering (Blacklist / Whitelist)**: Control which URLs users can navigate to
  - Blacklist or Whitelist mode with wildcard pattern support
  - Works with traditional navigation and SPA/client-side routing
- ⬅️ **Back Button Mode via ADB**: `back_button_mode` parameter synced to native SharedPreferences
- ⚠️ **Usage Stats Permission Warning**: Permission check and grant button in Settings

### Fixed
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (>=250ms apart) still work normally. Reported by @Mkdir1511
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (≥250ms apart) still work normally. Reported by @Mkdir1511
- 🔧 **Back Button Fix**: Fixed back button completely blocked when `test_mode=false`
- 🔀 **ADB Config Fix**: `lock_package` now takes priority over `url` for display mode
-  **Auto Launch on Boot Fix**: Fixed wrong AsyncStorage database name in native Kotlin files
- 🔒 **Settings Buttons Fix**: Lock task temporarily stopped before opening system settings

***

## [1.2.7] - 2026-02-09

### Fixed
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (>=250ms apart) still work normally. Reported by @Mkdir1511
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (≥250ms apart) still work normally. Reported by @Mkdir1511
- **Navigation Buttons Blocked in Lock Mode**: Fixed navigation buttons (Home, Recents) not being properly blocked in kiosk lock mode
  - Ensured `LOCK_TASK_FEATURE_NONE` correctly blocks all system navigation by default
  - Only `GLOBAL_ACTIONS` (power button) and `NOTIFICATIONS` are conditionally enabled based on user settings
  - Updated `hideSystemUI()` to use modern `WindowInsetsController` API for Android 11+ (API 30+)
  - Added `SYSTEM_UI_FLAG_LOW_PROFILE` fallback for older Android versions

***

## [1.2.6] - 2026-02-09

### Added
- 🔍 **Background App Monitoring**: Auto-relaunch monitoring service for External App mode
  - Automatically detects when locked app exits (crash, timeout, manual close)
  - Brings FreeKiosk back to foreground and relaunches the external app
  - Uses UsageStatsManager for accurate foreground detection (requires Device Owner or manual permission)
  - Monitoring activates when auto-relaunch is enabled in settings
  - Check every 2 seconds in background without impacting performance

### Fixed
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (>=250ms apart) still work normally. Reported by @Mkdir1511
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (≥250ms apart) still work normally. Reported by @Mkdir1511
- 🚀 **ADB Configuration Kiosk Mode**: Fixed kiosk mode not activating on first launch with `auto_start=true`
  - External app now launches AFTER kiosk mode is properly activated
  - Ensures lock task whitelist includes both FreeKiosk and external app before launch
  - Proper restart sequence: save config → restart FreeKiosk → activate kiosk → launch app
- 📡 **EXTERNAL_APP_LAUNCHED Broadcast**: Improved broadcast reliability for ADB monitoring
  - Now verifies app is in foreground before broadcasting (up to 10 retries over 5 seconds)
  - Adds `verified` boolean to broadcast extras to indicate foreground verification status
  - Consistent behavior whether launched via ADB auto_start or normal app flow
  - Better debugging with detailed logs showing retry attempts and current foreground app
- 🌐 **REST API Reboot Endpoint**: Fixed `/api/reboot` not executing the reboot
  - Reboot now runs natively via `DevicePolicyManager.reboot()` instead of through JS bridge
  - No longer depends on React Native bridge being active (works with screen off)
  - Returns clear error if app is not Device Owner
- 🔀 **REST API Method Handling**: Control endpoints now accept both GET and POST
  - Endpoints without body (`/api/screen/on`, `/api/reboot`, `/api/reload`, etc.) accept GET or POST
  - Endpoints requiring body (`/api/url`, `/api/tts`, `/api/brightness`, etc.) remain POST-only
  - Wrong method on POST-only endpoints now returns 405 "Method Not Allowed" instead of 404 "Not Found"

***

## [1.2.5] - 2026-02-06

### Added
- 📷 **Camera Photo API**: Take photos via REST endpoint using device cameras
  - `GET /api/camera/photo?camera=back&quality=80` - Capture JPEG photo
  - `GET /api/camera/list` - List available cameras with capabilities
  - Supports front and back cameras with configurable JPEG quality (1-100)
  - Auto-exposure and auto-focus warmup for optimal photo quality
  - Optimized resolution (~1.2MP) for fast HTTP transfer
  - Compatible with Home Assistant `camera` platform integration

### Fixed
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (>=250ms apart) still work normally. Reported by @Mkdir1511
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (≥250ms apart) still work normally. Reported by @Mkdir1511
- 🖼️ **Screensaver API State Separation**: Clarified screen status reporting in REST API
  - GET `/api/screen` now separates physical screen state from screensaver overlay state
  - `"on"`: Reports PHYSICAL screen state via PowerManager.isInteractive (true even if screensaver active)
  - `"screensaverActive"`: Separate boolean indicating if screensaver overlay is showing
  - Allows clients to distinguish: screen physically on vs content visible to user
- 🔢 **Version Reporting**: API now dynamically reads version from BuildConfig instead of hardcoded value
  - Automatically syncs with `versionName` in build.gradle
  - No more manual updates needed when version changes
  - Single source of truth for version information
- 🔐 **PIN Input Stability**: Completely refactored PIN masking system for universal device compatibility
  - Now uses native `secureTextEntry` instead of manual bullet masking
  - Fixes duplicate/random character issues on certain Android devices/keyboards
  - Eliminates input desynchronization problems
  - Adds autocomplete prevention (`autoComplete="off"`, `textContentType="none"`, `importantForAutofill="no"`)

***

## [1.2.4] - 2026-02-05

### Fixed
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (>=250ms apart) still work normally. Reported by @Mkdir1511
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (≥250ms apart) still work normally. Reported by @Mkdir1511
- 📡 **HTTP Server Screen-Off Availability**: Fixed HTTP server becoming unreachable when screen is off
  - Added `WifiLock (WIFI_MODE_FULL_HIGH_PERF)` to prevent WiFi from sleeping
  - Added `PARTIAL_WAKE_LOCK` to keep CPU active for background HTTP processing
  - Server now remains accessible 24/7 regardless of screen state
  - Locks are automatically released when server stops to preserve battery
- 🔒 **Blocking Overlay**: Bug fixes for blocking overlay display and behavior
- 🔄 **Auto Relaunch External App**: Bug fixes for automatic external app relaunching

***

## [1.2.3] - 2026-01-30

### Added
- 📷 **Motion Detection Camera Selection**: Choose which camera to use for motion detection (front/back)
- 🔘 **Flexible Settings Access Button**: Choose between fixed corner button or tap-anywhere mode for accessing settings
- ⬅️ **WebView Back Button**: Optional back navigation button in WebView for easier browsing
- ☀️ **Auto Brightness**: Automatic brightness adjustment based on ambient light sensor
  - Configurable min/max brightness range

### Changed
- 🔒 **REST API Key Security**: Migrated API key storage from AsyncStorage to Android Keychain (encrypted)
  - Automatic migration from previous versions (backward compatible)
  - Backup/restore fully supports secure API key storage
- 🔐 **Password System**: Enhanced flexibility with optional advanced mode
  - Default: Numeric PIN (4-6 digits) - simple and fast
  - Optional: Advanced Password Mode - enable alphanumeric passwords with letters, numbers, and special characters
  - Toggle in Settings > Password > "Advanced Password Mode"

### Fixed
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (>=250ms apart) still work normally. Reported by @Mkdir1511
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (≥250ms apart) still work normally. Reported by @Mkdir1511
- 🎨 **Blocking Overlay Display**: Fixed display issues with blocking overlays
- 🔄 **Auto Update System**: Fixed auto-update reliability issues


***
## [1.2.2] - 2026-01-21

### Changed
- 🎯 **5-Tap Detection System**: Complete redesign for fullscreen detection
  - 5-tap now works **anywhere on the screen** (not just on button)
  - Tap 5 times rapidly anywhere to access settings - no more corner targeting required
  - Uses invisible 1x1 pixel overlay with `FLAG_WATCH_OUTSIDE_TOUCH` for fullscreen tap detection
  - Visual indicator is now optional (can be hidden but 5-tap still works everywhere)
  - Underlying app remains 100% interactive (no touch blocking)
  - Removed button position settings (visual indicator fixed in bottom-right when visible)
  - Same behavior in both WebView and External App modes

### Added
- 🔊 **Volume 5-Tap Gesture**: Alternative to 5tap for accessing PIN screen
  - Press Volume Up or Volume Down 5 times quickly to access settings
  - Works even when volume is at max (use Volume Down) or min (use Volume Up)
  - Only active when kiosk mode (lock task) is enabled
  - Toggle in Settings > Security > "Volume 5-Tap"
- 🎨 **Blocking Overlay**: Configurable overlay to block user interactions
  - Touch Logger countdown feature with coordinates display
  - Configurable via settings

### Fixed
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (>=250ms apart) still work normally. Reported by @Mkdir1511
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (≥250ms apart) still work normally. Reported by @Mkdir1511
- 🖥️ **Screen On/Off API**: Improved reliability for `/api/screen/on` and `/api/screen/off`
  - With Device Owner: uses `lockNow()` to truly turn off screen
  - Without Device Owner: improved brightness control (0 instead of 0.01)
  - Properly manages `FLAG_KEEP_SCREEN_ON` flag
- 🔧 **React Native New Architecture**: Fixed compatibility issues with BroadcastReceivers
- 🐛 **Screensaver Wake**: Fixed screensaver not waking properly after touch or motion detection (stale closure issue)
- 🎨 **Visual Fixes**: 
  - Added cursor visibility in text inputs (cursorColor and selectionColor)
  - Updated "Launch on Boot" info message to apply to all users


***


## [1.2.1] - 2026-01-18

### Added
- 🔌 **ADB Configuration Support**: Headless provisioning via Android Debug Bridge
  - Configure FreeKiosk via command line without UI interaction
  - Set locked app, URL, and all kiosk settings via ADB
  - Auto-restart and launch external app after configuration
  - Support for full JSON configuration or individual parameters
  - [Full ADB Documentation](docs/adb-configuration.md) with examples and scripts
- � **Backup & Restore**: Export and import complete FreeKiosk configuration
  - Export all settings to JSON file
  - Import configuration from JSON file
  - Perfect for device migration and configuration templates
- �🔌 **Allow Power Button option**: New setting in Security tab to allow access to the power menu while in Lock Mode

### Fixed
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (>=250ms apart) still work normally. Reported by @Mkdir1511
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (≥250ms apart) still work normally. Reported by @Mkdir1511
- 🔧 **REST API Stability**: Improved server reliability and error handling
- 🔧 **Hard restart boot behavior**: Fixed auto-launch issue after hard restart (power + volume buttons hold)
- 🔧 **Database Synchronization**: Fixed data persistence with WAL checkpoint and file sync

### Changed
- 📖 **Documentation**: Updated FAQ for power button behavior and hard restart issues


***


## [1.2.0] - 2026-01-08


### Added
- 🎨 **Complete Settings UI Redesign**: Modern Material Design interface with organized tabs
  - **4 organized tabs**: General, Display, Security, Advanced
  - **Reusable UI components**: SettingsSection, SettingsSwitch, SettingsInput, SettingsRadioGroup, SettingsSlider, SettingsButton, SettingsInfoBox
  - **Centralized theme system**: Colors, Spacing, Typography for consistent styling
  - **Material Design Icons**: Professional vector icons throughout settings

- 🔄 **URL Rotation**: Automatically cycle through multiple URLs at configurable intervals
  - Add/edit/delete URLs with labels
  - Reorder URLs with drag handles
  - Set rotation interval (5+ seconds)
  - REST API support for rotation control

- 📅 **URL Planner**: Schedule URLs based on time and date
  - **Recurring events**: Daily schedules with day-of-week selection
  - **One-time events**: Specific date events for special occasions
  - Set start/end times and priority levels
  - Visual calendar-style management

- 🌐 **REST API Server**: Built-in HTTP server for Home Assistant integration (40+ endpoints)
  
#### Sensor Endpoints (GET)
- `/api/status` - Complete device status in one call
- `/api/battery` - Battery level, charging state, temperature
- `/api/brightness` - Current screen brightness
- `/api/screen` - Screen on/off, screensaver state
- `/api/sensors` - Light sensor, proximity sensor, accelerometer
- `/api/storage` - Storage capacity and usage
- `/api/memory` - RAM capacity and usage
- `/api/wifi` - WiFi status, SSID, signal strength, IP
- `/api/info` - Device model, Android version, app version
- `/api/health` - Simple health check
- `/api/screenshot` - Capture screen as PNG image

#### Control Endpoints (POST)
- `/api/brightness` - Set screen brightness (0-100)
- `/api/screen/on` - Turn screen on
- `/api/screen/off` - Turn screen off
- `/api/screensaver/on` - Activate screensaver
- `/api/screensaver/off` - Deactivate screensaver
- `/api/reload` - Reload WebView
- `/api/url` - Navigate to URL
- `/api/wake` - Wake from screensaver
- `/api/tts` - Text-to-speech
- `/api/volume` - Set media volume
- `/api/toast` - Show toast notification
- `/api/js` - Execute JavaScript in WebView
- `/api/clearCache` - Clear WebView cache
- `/api/app/launch` - Launch external app
- `/api/reboot` - Reboot device (Device Owner mode required)

#### Audio Endpoints (POST)
- `/api/audio/play` - Play audio from URL
- `/api/audio/stop` - Stop audio playback
- `/api/audio/beep` - Play beep sound

#### Remote Control Endpoints (POST) - Android TV
- `/api/remote/up` - D-pad up
- `/api/remote/down` - D-pad down
- `/api/remote/left` - D-pad left
- `/api/remote/right` - D-pad right
- `/api/remote/select` - Select/Enter
- `/api/remote/back` - Back button
- `/api/remote/home` - Home button
- `/api/remote/menu` - Menu button
- `/api/remote/playpause` - Play/Pause

#### API Features
- Optional API Key authentication (X-Api-Key header)
- Configurable port (default: 8080)
- Toggle remote control permissions
- CORS support for web integration
- JSON responses with timestamps

### Documentation
- 📖 New `docs/rest-api.md` with complete endpoint reference
- 🏠 Home Assistant configuration examples
- 🔧 cURL testing examples


***


## [1.1.4] - 2025-12-23


### Added
- 🔄 **In-App Direct Update for Device Owner**: Update FreeKiosk directly from within the app when in Device Owner mode
- 🎨 **Status Bar Item Selection**: New settings to show/hide individual items (Home button, Time, Battery, WiFi, Bluetooth, Sound) in the status bar
- 🧪 **Test Mode Options for External App**: Three options available
  - **Test Mode**: Enable back button to return to FreeKiosk (default for safety)
  - **Immediate Return**: 5-tap overlay button returns immediately to FreeKiosk
  - **Delayed Return**: 5-tap overlay button with confirmation delay before returning


### Fixed
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (>=250ms apart) still work normally. Reported by @Mkdir1511
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (≥250ms apart) still work normally. Reported by @Mkdir1511
- 🐛 **Status Bar Position in External App Mode**: Status bar now properly sticks to the top of the screen
- 🐛 **Clock Visibility**: Fixed issue with time display not showing correctly


***


## [1.1.3] - 2025-12-21


### Added
- ⌨️ **Keyboard Mode**: New option to control keyboard behavior
  - Default: Use system default keyboard
  - Force Numeric: Always show numeric keyboard
  - Smart Detection: Automatically detect input type and show appropriate keyboard
- 📊 **Status Bar Options for External App Mode**: New sub-options for status bar placement
  - "On External App (Overlay)" - Show custom status bar overlay on top of the external app
  - "On Return Screen" - Show status bar on the "External App Running" screen


### Fixed
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (>=250ms apart) still work normally. Reported by @Mkdir1511
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (≥250ms apart) still work normally. Reported by @Mkdir1511
- 🐛 **Status Bar System**: Debug and stability improvements for status bar display
- 🐛 **PIN Code Max Failed Attempts**: Fixed issue with max failed attempts counter


***


## [1.1.2] - 2025-12-19


### Added
- 📊 **Status Bar Display**: New option to show/hide Android status bar (battery, WiFi, Bluetooth, sound)
  - Configurable from settings screen
  - Shows system status icons: battery level, WiFi connection, Bluetooth, volume, etc.
  - Useful for monitoring device status without exiting kiosk mode
- 🧪 **Test Mode for External App**: Safety feature for External App Mode
  - Enabled by default for security
  - Allows returning to FreeKiosk using Android back button
  - Prevents accidental lockout during testing
  - Can be disabled for production deployments


***


## [1.1.1] - 2025-12-16


### Added
- 👁️ **Overlay Button Visibility Toggle**: New option to show/hide the return button in External App Mode
  - Button is invisible by default for maximum discretion
  - Real-time opacity update when toggling visibility
  - Button position configurable in settings (default: bottom-right)
- 🗑️ **Device Owner Removal**: New button in Settings to remove Device Owner privileges
  - Helps with uninstallation on Android 15+
  - Automatically resets all settings after removal
- 🔢 **Configurable PIN Attempts**: Set maximum PIN attempts between 1-100 (default: 5)
- 🔐 **Hidden Default PIN Text**: "Default code: 1234" text now hidden when PIN is configured

### Fixed
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (>=250ms apart) still work normally. Reported by @Mkdir1511
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (≥250ms apart) still work normally. Reported by @Mkdir1511
- 🐛 **Critical: PIN Lockout Expiration**: PIN attempts now automatically reset after 1 hour of inactivity
- 🐛 **Critical: PIN Attempts Persistence**: Expired PIN attempts are now properly saved to storage



## [1.1.0] - 2025-12-11


### Added
- 📱 **External App Mode (Beta)**: Launch and lock any Android app instead of a WebView
  - Select any installed app from a picker
  - Floating overlay button with 5-tap return mechanism
  - Auto-relaunch when user presses Home/Back buttons
  - Full Device Owner lock task support for external apps
- 🔒 **Enhanced Lock Task**: Whitelisted external apps in lock task mode
- 🎯 **Auto-relaunch**: Configurable automatic app restart on exit attempts


### Changed
- 🏗️ Refactored kiosk architecture to support both WebView and External App modes
- ⚡ Improved overlay service reliability and lifecycle management


### Fixed
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (>=250ms apart) still work normally. Reported by @Mkdir1511
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (≥250ms apart) still work normally. Reported by @Mkdir1511
- 🐛 Potential fix for infinite loading on login pages (cookie/session handling)


***


## [1.0.5] - 2025-11-26


### Added
- 🎥 Motion detection (Beta): Camera-based motion detection to exit screensaver mode
- 🍪 Cookie management: Basic cookie handling via react-native-cookies for web session persistence


### Changed
- 🚀 WebView optimization: Performance improvements specifically for Fire OS tablets
- 🔒 Enhanced WebView security: Additional security measures for safe web content display


### Fixed
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (>=250ms apart) still work normally. Reported by @Mkdir1511
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (≥250ms apart) still work normally. Reported by @Mkdir1511
- 🐛 WebView stability improvements on Fire OS devices


***


## [1.0.4] - 2025-11-19


### Added
- 🔆 Brightness control: Adjustable screen brightness slider in settings
- 🌙 Screensaver mode: Configurable inactivity timer that dims screen to save power
- 🎥 Camera permission: Added CAMERA permission for web apps requiring camera access
- 🎤 Microphone permission: Added RECORD_AUDIO permission for web apps with audio features
- 📍 Location permissions: Added ACCESS_FINE_LOCATION and ACCESS_COARSE_LOCATION for location-based web apps
- 📁 Storage permissions: Added READ_EXTERNAL_STORAGE and WRITE_EXTERNAL_STORAGE for file access support


***


## [1.0.3] - 2025-11-17


### Added
- 🚀 Auto-launch toggle: Enable/disable automatic app launch at device boot
- 💡 Screen always-on feature: Keep screen awake while app is running


### Changed
- 🔧 Improved Device Owner auto-launch handling with preference-based control
- 📱 Enhanced boot receiver logic to respect user auto-launch preference


***


## [1.0.2] - 2025-11-13


### Added
- ⚙️ Configuration access button on main screen for improved first-time user experience
- 🔒 HTTPS self-signed certificate security prompt (accept/reject before proceeding)
- 🗑️ Clear trusted certificates option in Reset All Settings


### Changed
- 📱 Improved Play Store compliance for SSL certificate handling


### Fixed
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (>=250ms apart) still work normally. Reported by @Mkdir1511
- 🔊 **Volume buttons trigger PIN request when held** (#110): Holding the volume button to adjust volume would trigger the PIN request because both `MainActivity.onKeyDown` and `VolumeChangeReceiver` counted auto-repeat/rapid events as separate taps. Fixed by ignoring `KeyEvent` with `repeatCount > 0` in `MainActivity`, and adding a minimum 250ms interval between counted volume changes in `VolumeChangeReceiver` to filter out the rapid events (~50-100ms) generated by holding the button. Deliberate separate presses (≥250ms apart) still work normally. Reported by @Mkdir1511
- 🔐 Self-signed certificates now require explicit user confirmation (browser-like behavior)


***


## [1.0.1] - 2025-10-30


### Added
- 🎉 Initial public release of FreeKiosk
- ✅ Full kiosk mode with Device Owner support
- ✅ Optional screen pinning toggle (ON/OFF in settings)
- ✅ WebView display for any URL
- ✅ HTTPS self-signed certificate support
- ✅ Password protection (4+ characters, alphanumeric support)
- ✅ Reset settings button (clear all config from app)
- ✅ Settings screen with URL and PIN configuration
- ✅ Auto-start on device boot
- ✅ Samsung popup blocking (Device Owner mode)
- ✅ Exit kiosk mode button
- ✅ Immersive fullscreen mode
- ✅ Lock task mode support
- ✅ System apps suspension (Device Owner mode)
- ✅ React Native 0.75 with TypeScript
- ✅ Kotlin native modules
- ✅ Compatible Android 8.0+ (API 26+)
- ✅ English language UI (default)


### Documentation
- 📝 Complete README with installation guide
- 📝 Device Owner setup instructions
- 📝 FAQ document
- 📝 MIT License


***


[2.0.0-beta.1]: https://github.com/rushb-fr/freekiosk/releases/tag/v2.0.0-beta.1
[1.2.19]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.2.19
[1.2.18]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.2.18
[1.2.17]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.2.17
[1.2.16]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.2.16
[1.2.15]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.2.15
[1.2.14]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.2.14
[1.2.13]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.2.13
[1.2.12]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.2.12
[1.2.11]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.2.11
[1.2.10]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.2.10
[1.2.9]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.2.9
[1.2.8]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.2.8
[1.2.7]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.2.7
[1.2.6]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.2.6
[1.2.5]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.2.5
[1.2.4]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.2.4
[1.2.3]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.2.3
[1.2.2]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.2.2
[1.2.1]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.2.1
[1.2]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.2
[1.1.4]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.1.4
[1.1.3]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.1.3
[1.1.2]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.1.2
[1.1.1]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.1.1
[1.1.0]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.1.0
[1.0.5]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.0.5
[1.0.4]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.0.4
[1.0.3]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.0.3
[1.0.2]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.0.2
[1.0.1]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.0.1
