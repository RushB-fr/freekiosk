import { NativeModules } from 'react-native';

interface KioskModuleInterface {
  exitKioskMode(): Promise<boolean>;
  startLockTask(externalAppPackage?: string | null, allowPowerButton?: boolean, allowNotifications?: boolean, allowSystemInfo?: boolean): Promise<boolean>;
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
  reboot(): Promise<boolean>;
  sendRemoteKey(key: string): Promise<boolean>;
  // Screen control
  turnScreenOn(): Promise<boolean>;
  turnScreenOff(): Promise<boolean>;
  isScreenOn(): Promise<boolean>;
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
}

const { KioskModule } = NativeModules;

export default KioskModule as KioskModuleInterface;
