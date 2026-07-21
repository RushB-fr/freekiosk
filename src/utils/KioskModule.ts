import { NativeModules } from 'react-native';

interface KioskModuleInterface {
  exitKioskMode(): Promise<boolean>;
  startLockTask(externalAppPackage?: string | null, allowPowerButton?: boolean, allowNotifications?: boolean, allowSystemInfo?: boolean, allowEmergencyCall?: boolean): Promise<boolean>;
  stopLockTask(): Promise<boolean>;
  isInLockTaskMode(): Promise<boolean>;
  getLockTaskModeState(): Promise<number>;
  isDeviceOwner(): Promise<boolean>;
  hasUsageStatsPermission(): Promise<boolean>;
  requestUsageStatsPermission(): Promise<boolean>;
  shouldBlockAutoRelaunch(): Promise<boolean>;
  clearBlockAutoRelaunch(): Promise<boolean>;
  setBlockAutoRelaunch(block: boolean): Promise<boolean>;
  removeDeviceOwner(): Promise<boolean>;
  setScreenLockCompatMode(enabled: boolean): Promise<boolean>;
  // #201 — Block/unblock the factory reset option in system Settings (Device Owner user restriction)
  setFactoryResetBlocked(blocked: boolean): Promise<boolean>;
  setDefaultLauncherMode(enabled: boolean): Promise<boolean>;
  reboot(): Promise<boolean>;
  sendRemoteKey(key: string): Promise<boolean>;
  launchEmergencyDial(): Promise<boolean>;
  isSafetyHubEnabled(): Promise<boolean>;
  disableSafetyHub(): Promise<boolean>;
  // Screen control
  turnScreenOn(): Promise<boolean>;
  turnScreenOff(): Promise<boolean>;
  isScreenOn(): Promise<boolean>;
  setKeepScreenOn(enabled: boolean): Promise<boolean>;
  setAutoWakeOnScreenOff(enabled: boolean): Promise<boolean>;
  // Screen scheduler alarms (AlarmManager — works even when screen is off)
  scheduleScreenWake(wakeTimeMs: number): Promise<boolean>;
  scheduleScreenSleep(sleepTimeMs: number): Promise<boolean>;
  cancelScheduledScreenAlarms(): Promise<boolean>;
  // ADB Config PIN sync
  saveAdbPinHash(pin: string): Promise<boolean>;
  clearAdbPinHash(): Promise<boolean>;
  // Broadcast that settings are loaded after ADB config
  broadcastSettingsLoaded(): Promise<boolean>;
  // Pending ADB config (SharedPreferences bridge)
  getPendingAdbConfig(): Promise<Record<string, string> | null>;
  clearPendingAdbConfig(): Promise<boolean>;
  // Open native Android settings
  openAndroidSettings(settingsPage?: string | null): Promise<boolean>;
  // Bring FreeKiosk's activity to foreground (used when screensaver activates in External App mode)
  bringToFront(): Promise<boolean>;
  // #180 — Gate the native tap-to-settings fallback to the kiosk screen only
  setKioskScreenActive(active: boolean): Promise<boolean>;
  // #135 — Dismiss the soft keyboard at the window level (works for WebView inputs too)
  hideKeyboard(): Promise<boolean>;
  // #177 — Pause/resume the content WebView's renderer (stops background audio/video).
  // tag is the React node handle of the WebView (from findNodeHandle).
  pauseWebView(tag: number): Promise<boolean>;
  resumeWebView(tag: number): Promise<boolean>;
}

const { KioskModule } = NativeModules;

export default KioskModule as KioskModuleInterface;
