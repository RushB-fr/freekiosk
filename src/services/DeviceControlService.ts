/**
 * FreeKiosk v1.2 - DeviceControlService
 * Centralized device control layer - used by REST API and future MDM
 */

import { NativeModules, DeviceEventEmitter } from 'react-native';
import RNBrightness from 'react-native-brightness-newarch';

const { KioskModule } = NativeModules;

export interface BatteryStatus {
  level: number;
  charging: boolean;
  plugged: 'usb' | 'ac' | 'wireless' | 'none';
}

export interface ScreenStatus {
  on: boolean;
  brightness: number;
  screensaverActive: boolean;
  scheduledSleep: boolean;
}

export interface WebViewStatus {
  currentUrl: string;
  canGoBack: boolean;
  loading: boolean;
}

export interface DeviceInfo {
  ip: string;
  hostname: string;
  uptime: number;
  version: string;
  isDeviceOwner: boolean;
  kioskMode: boolean;
}

export interface WifiStatus {
  ssid: string;
  signalStrength: number;
  connected: boolean;
}

export interface DeviceStatus {
  battery: BatteryStatus;
  screen: ScreenStatus;
  webview: WebViewStatus;
  device: DeviceInfo;
  wifi: WifiStatus;
  timestamp: number;
}

// Callbacks for WebView control (set by KioskScreen)
type WebViewReloadCallback = () => void;
type WebViewNavigateCallback = (url: string) => void;
type WebViewGetUrlCallback = () => string;
type ScreensaverCallback = (active: boolean) => void;
type GetScreensaverCallback = () => boolean;

class DeviceControlServiceClass {
  private webViewReloadCallback: WebViewReloadCallback | null = null;
  private webViewNavigateCallback: WebViewNavigateCallback | null = null;
  private webViewGetUrlCallback: WebViewGetUrlCallback | null = null;
  private screensaverCallback: ScreensaverCallback | null = null;
  private getScreensaverCallback: GetScreensaverCallback | null = null;
  private currentBrightness: number = 0.5;
  private kioskModeEnabled: boolean = false;
  private appVersion: string = '1.2.8';
  private scheduledSleep: boolean = false;

  // Register callbacks from KioskScreen
  registerWebViewCallbacks(
    reload: WebViewReloadCallback,
    navigate: WebViewNavigateCallback,
    getUrl: WebViewGetUrlCallback
  ) {
    this.webViewReloadCallback = reload;
    this.webViewNavigateCallback = navigate;
    this.webViewGetUrlCallback = getUrl;
  }

  registerScreensaverCallbacks(
    setActive: ScreensaverCallback,
    getActive: GetScreensaverCallback
  ) {
    this.screensaverCallback = setActive;
    this.getScreensaverCallback = getActive;
  }

  setKioskMode(enabled: boolean) {
    this.kioskModeEnabled = enabled;
  }

  setAppVersion(version: string) {
    this.appVersion = version;
  }

  setScheduledSleep(sleeping: boolean) {
    this.scheduledSleep = sleeping;
  }

  // ==================== READ OPERATIONS ====================

  async getStatus(): Promise<DeviceStatus> {
    const [battery, screen, webview, device, wifi] = await Promise.all([
      this.getBatteryStatus(),
      this.getScreenStatus(),
      this.getWebViewStatus(),
      this.getDeviceInfo(),
      this.getWifiStatus(),
    ]);

    return {
      battery,
      screen,
      webview,
      device,
      wifi,
      timestamp: Math.floor(Date.now() / 1000),
    };
  }

  async getBatteryStatus(): Promise<BatteryStatus> {
    try {
      if (KioskModule?.getBatteryStatus) {
        const status = await KioskModule.getBatteryStatus();
        return {
          level: status.level || 0,
          charging: status.charging || false,
          plugged: status.plugged || 'none',
        };
      }
    } catch (error) {
      console.warn('DeviceControlService: getBatteryStatus error', error);
    }
    return { level: 0, charging: false, plugged: 'none' };
  }

  async getScreenStatus(): Promise<ScreenStatus> {
    const screensaverActive = this.getScreensaverCallback?.() || false;
    
    return {
      on: !screensaverActive,
      brightness: Math.round(this.currentBrightness * 100),
      screensaverActive,
      scheduledSleep: this.scheduledSleep,
    };
  }

  async getWebViewStatus(): Promise<WebViewStatus> {
    return {
      currentUrl: this.webViewGetUrlCallback?.() || '',
      canGoBack: false, // TODO: implement
      loading: false, // TODO: implement
    };
  }

  async getDeviceInfo(): Promise<DeviceInfo> {
    let isDeviceOwner = false;
    try {
      if (KioskModule?.isDeviceOwner) {
        isDeviceOwner = await KioskModule.isDeviceOwner();
      }
    } catch (error) {
      console.warn('DeviceControlService: isDeviceOwner error', error);
    }

    // Get IP from NetworkUtils (will be set externally)
    const ip = await this.getLocalIpAddress();

    return {
      ip,
      hostname: 'freekiosk',
      uptime: 0, // TODO: implement
      version: this.appVersion,
      isDeviceOwner,
      kioskMode: this.kioskModeEnabled,
    };
  }

  async getWifiStatus(): Promise<WifiStatus> {
    try {
      if (KioskModule?.getWifiInfo) {
        const info = await KioskModule.getWifiInfo();
        return {
          ssid: info.ssid || '',
          signalStrength: info.rssi || 0,
          connected: info.connected || false,
        };
      }
    } catch (error) {
      console.warn('DeviceControlService: getWifiInfo error', error);
    }
    return { ssid: '', signalStrength: 0, connected: false };
  }

  async getLocalIpAddress(): Promise<string> {
    try {
      if (KioskModule?.getLocalIpAddress) {
        return await KioskModule.getLocalIpAddress();
      }
    } catch (error) {
      console.warn('DeviceControlService: getLocalIpAddress error', error);
    }
    return '0.0.0.0';
  }

  // ==================== CONTROL OPERATIONS ====================

  async setBrightness(value: number): Promise<boolean> {
    try {
      // Clamp value between 0 and 100
      const clamped = Math.max(0, Math.min(100, value));
      const normalized = clamped / 100;
      
      await RNBrightness.setBrightnessLevel(normalized);
      this.currentBrightness = normalized;
      
      // Emit event for UI updates
      DeviceEventEmitter.emit('brightnessChanged', normalized);
      
      return true;
    } catch (error) {
      console.error('DeviceControlService: setBrightness error', error);
      return false;
    }
  }

  async screenOn(): Promise<boolean> {
    try {
      // Use native method to turn screen ON with WakeLock
      if (KioskModule?.turnScreenOn) {
        await KioskModule.turnScreenOn();
      } else {
        // Fallback: deactivate screensaver and restore brightness
        if (this.screensaverCallback) {
          this.screensaverCallback(false);
        }
        await RNBrightness.setBrightnessLevel(this.currentBrightness);
      }
      
      return true;
    } catch (error) {
      console.error('DeviceControlService: screenOn error', error);
      return false;
    }
  }

  async screenOff(): Promise<boolean> {
    try {
      // Use native method to turn screen OFF (dim to minimum)
      if (KioskModule?.turnScreenOff) {
        await KioskModule.turnScreenOff();
      } else {
        // Fallback: activate screensaver (dims screen)
        if (this.screensaverCallback) {
          this.screensaverCallback(true);
        }
      }
      
      return true;
    } catch (error) {
      console.error('DeviceControlService: screenOff error', error);
      return false;
    }
  }

  async reloadWebView(): Promise<boolean> {
    try {
      if (this.webViewReloadCallback) {
        this.webViewReloadCallback();
        return true;
      }
      return false;
    } catch (error) {
      console.error('DeviceControlService: reloadWebView error', error);
      return false;
    }
  }

  async navigateToUrl(url: string): Promise<boolean> {
    try {
      if (this.webViewNavigateCallback) {
        this.webViewNavigateCallback(url);
        return true;
      }
      return false;
    } catch (error) {
      console.error('DeviceControlService: navigateToUrl error', error);
      return false;
    }
  }

  async speak(text: string): Promise<boolean> {
    try {
      if (KioskModule?.speak) {
        await KioskModule.speak(text);
        return true;
      }
      return false;
    } catch (error) {
      console.error('DeviceControlService: speak error', error);
      return false;
    }
  }

  // ==================== BRIGHTNESS TRACKING ====================

  updateCurrentBrightness(value: number) {
    this.currentBrightness = value;
  }
}

// Singleton instance
const DeviceControlService = new DeviceControlServiceClass();
export default DeviceControlService;
