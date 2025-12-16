import { NativeModules } from 'react-native';

interface OverlayServiceModuleType {
  startOverlayService(): Promise<boolean>;
  stopOverlayService(): Promise<boolean>;
  setButtonOpacity(opacity: number): Promise<boolean>;
  getButtonOpacity(): Promise<number>;
}

const OverlayServiceModule: OverlayServiceModuleType = NativeModules.OverlayServiceModule;

export default OverlayServiceModule;
