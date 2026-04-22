import { NativeModules } from 'react-native';

interface OverlayServiceModuleType {
  startOverlayService(
    tapCount: number, 
    tapTimeout: number, 
    returnMode: string, 
    buttonPosition: string,
    lockedPackage?: string | null,
    autoRelaunch?: boolean,
    nfcEnabled?: boolean
  ): Promise<boolean>;
  stopOverlayService(): Promise<boolean>;
  setButtonOpacity(opacity: number): Promise<boolean>;
  getButtonOpacity(): Promise<number>;
  setStatusBarEnabled(enabled: boolean): Promise<boolean>;
  getStatusBarEnabled(): Promise<boolean>;
  setTestMode(enabled: boolean): Promise<boolean>;
  setBackButtonMode(mode: string): Promise<boolean>;
}

const OverlayServiceModule: OverlayServiceModuleType = NativeModules.OverlayServiceModule;

export default OverlayServiceModule;