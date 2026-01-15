import { NativeModules } from 'react-native';

interface KioskModuleInterface {
  exitKioskMode(): Promise<boolean>;
  startLockTask(externalAppPackage?: string | null, allowPowerButton?: boolean): Promise<boolean>;
  stopLockTask(): Promise<boolean>;
  isInLockTaskMode(): Promise<boolean>;
  getLockTaskModeState(): Promise<number>;
  isDeviceOwner(): Promise<boolean>;
  shouldBlockAutoRelaunch(): Promise<boolean>;
  clearBlockAutoRelaunch(): Promise<boolean>;
  setBlockAutoRelaunch(block: boolean): Promise<boolean>;
  removeDeviceOwner(): Promise<boolean>;
  reboot(): Promise<boolean>;
  sendRemoteKey(key: string): Promise<boolean>;
}

const { KioskModule } = NativeModules;

export default KioskModule as KioskModuleInterface;
