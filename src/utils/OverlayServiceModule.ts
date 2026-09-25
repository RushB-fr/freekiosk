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
  // #190 — Configure the native inactivity countdown for External App screensaver activation
  updateInactivityConfig(delayMs: number, enabled: boolean): Promise<boolean>;
  // #266: dim over the external app instead of bringing FreeKiosk to the front. level is
  // the screen brightness (0..1), or -1 for an opaque black overlay. Resolves false when
  // the overlay can't be shown, so the caller falls back to bringToFront().
  showDimOverlay(level: number): Promise<boolean>;
  hideDimOverlay(): Promise<boolean>;
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