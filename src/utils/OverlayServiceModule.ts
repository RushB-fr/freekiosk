import { NativeModules } from 'react-native';

interface OverlayServiceModuleType {
  startOverlayService(tapCount: number, tapTimeout: number, returnMode: string, buttonPosition: string): Promise<boolean>;
  stopOverlayService(): Promise<boolean>;
  setButtonOpacity(opacity: number): Promise<boolean>;
  getButtonOpacity(): Promise<number>;
  setStatusBarEnabled(enabled: boolean): Promise<boolean>;
  getStatusBarEnabled(): Promise<boolean>;
  setTestMode(enabled: boolean): Promise<boolean>;
}

const OverlayServiceModule: OverlayServiceModuleType = NativeModules.OverlayServiceModule;

export default OverlayServiceModule;