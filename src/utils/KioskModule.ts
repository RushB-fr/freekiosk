import { NativeModules } from 'react-native';

interface KioskModuleInterface {
  exitKioskMode(): Promise<boolean>;
  startLockTask(): Promise<boolean>;
  stopLockTask(): Promise<boolean>;
  isInLockTaskMode(): Promise<boolean>;
  getLockTaskModeState(): Promise<number>;
}

const { KioskModule } = NativeModules;

export default KioskModule as KioskModuleInterface;
