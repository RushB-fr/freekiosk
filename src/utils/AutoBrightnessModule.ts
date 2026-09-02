/**
 * AutoBrightnessModule - TypeScript wrapper for native auto-brightness functionality
 * 
 * Provides automatic screen brightness adjustment based on ambient light sensor.
 * Uses logarithmic brightness curve for natural human perception.
 */

import { NativeModules } from 'react-native';

const { AutoBrightnessModule: NativeAutoBrightnessModule } = NativeModules;

export interface AutoBrightnessResult {
  success: boolean;
  message: string;
}

export interface AutoBrightnessStatus {
  active: boolean;
  currentLightLevel: number; // lux
  currentBrightness: number; // 0-100
  minBrightness: number; // 0-100
  maxBrightness: number; // 0-100
  brightnessOffset: number; // 0-100
}

export interface LightLevelResult {
  lux: number;
  sensorAvailable: boolean;
}

export interface SetDefaultBrightnessResult {
  success: boolean;
  level: number; // 0-1
  /**
   * Whether the level also reached Settings.System.SCREEN_BRIGHTNESS, and so will
   * survive a reboot. false is not a failure: the window override still applies, the
   * device simply has neither Device Owner nor WRITE_SETTINGS.
   */
  systemWrite: boolean;
}

/**
 * Default configuration for auto-brightness
 */
export const AUTO_BRIGHTNESS_DEFAULTS = {
  enabled: false,
  minBrightness: 0.1, // 10%
  maxBrightness: 1.0, // 100%
  brightnessOffset: 0.0, // No offset
  updateInterval: 1000, // 1 second
};

const AutoBrightnessModule = {
  /**
   * Start auto-brightness with configurable parameters
   * 
   * @param minBrightness Minimum brightness (0.0-1.0) for dark conditions
   * @param maxBrightness Maximum brightness (0.0-1.0) for bright conditions
   * @param updateInterval Milliseconds between updates (for battery optimization)
   * @param brightnessOffset Offset added to calculated brightness (0.0-1.0), e.g. 0.1 = +10%
   * @returns Promise resolving to result object
   */
  startAutoBrightness: async (
    minBrightness: number = AUTO_BRIGHTNESS_DEFAULTS.minBrightness,
    maxBrightness: number = AUTO_BRIGHTNESS_DEFAULTS.maxBrightness,
    updateInterval: number = AUTO_BRIGHTNESS_DEFAULTS.updateInterval,
    brightnessOffset: number = AUTO_BRIGHTNESS_DEFAULTS.brightnessOffset
  ): Promise<AutoBrightnessResult> => {
    try {
      const result = await NativeAutoBrightnessModule.startAutoBrightness(
        minBrightness,
        maxBrightness,
        updateInterval,
        brightnessOffset
      );
      return result;
    } catch (error) {
      console.error('[AutoBrightness] Failed to start:', error);
      throw error;
    }
  },

  /**
   * Stop auto-brightness and restore manual control
   * 
   * @returns Promise resolving to result object
   */
  stopAutoBrightness: async (): Promise<AutoBrightnessResult> => {
    try {
      const result = await NativeAutoBrightnessModule.stopAutoBrightness();
      return result;
    } catch (error) {
      console.error('[AutoBrightness] Failed to stop:', error);
      throw error;
    }
  },

  /**
   * Check if auto-brightness is currently active
   * 
   * @returns Promise resolving to status object with current state
   */
  isAutoBrightnessActive: async (): Promise<AutoBrightnessStatus> => {
    try {
      const result = await NativeAutoBrightnessModule.isAutoBrightnessActive();
      return result;
    } catch (error) {
      console.error('[AutoBrightness] Failed to check status:', error);
      throw error;
    }
  },

  /**
   * Get current light level from sensor
   * 
   * @returns Promise resolving to light level in lux
   */
  getCurrentLightLevel: async (): Promise<LightLevelResult> => {
    try {
      const result = await NativeAutoBrightnessModule.getCurrentLightLevel();
      return result;
    } catch (error) {
      console.error('[AutoBrightness] Failed to get light level:', error);
      throw error;
    }
  },

  /**
   * Update auto-brightness parameters without stopping
   * 
   * @param minBrightness New minimum brightness (0.0-1.0)
   * @param maxBrightness New maximum brightness (0.0-1.0)
   * @param updateInterval New update interval in milliseconds
   * @param brightnessOffset Offset added to calculated brightness (0.0-1.0)
   * @returns Promise resolving to result object
   */
  updateParameters: async (
    minBrightness: number,
    maxBrightness: number,
    updateInterval: number,
    brightnessOffset: number = AUTO_BRIGHTNESS_DEFAULTS.brightnessOffset
  ): Promise<AutoBrightnessResult> => {
    try {
      const result = await NativeAutoBrightnessModule.updateParameters(
        minBrightness,
        maxBrightness,
        updateInterval,
        brightnessOffset
      );
      return result;
    } catch (error) {
      console.error('[AutoBrightness] Failed to update parameters:', error);
      throw error;
    }
  },

  /**
   * Check if device has a light sensor
   * 
   * @returns Promise resolving to boolean
   */
  hasLightSensor: async (): Promise<boolean> => {
    try {
      const result = await NativeAutoBrightnessModule.hasLightSensor();
      return result;
    } catch (error) {
      console.error('[AutoBrightness] Failed to check light sensor:', error);
      return false;
    }
  },

  /**
   * Set the brightness FreeKiosk should hold across wakes and reboots (#242).
   *
   * Use this, not setBrightnessLevel(), for anything the user or an API caller meant
   * as a lasting choice. setBrightnessLevel() is the transient path shared with the
   * light sensor and the screensaver, and persisting from there would store the
   * screensaver's 0 as the chosen default.
   */
  setDefaultBrightness: async (level: number): Promise<SetDefaultBrightnessResult> => {
    try {
      return await NativeAutoBrightnessModule.setDefaultBrightness(level);
    } catch (error) {
      console.error('[AutoBrightness] Failed to set default brightness:', error);
      throw error;
    }
  },

  /**
   * Whether the requested brightness can be written to Settings.System, and so survive
   * a reboot. True as Device Owner on API 28+, or once WRITE_SETTINGS is granted.
   */
  canWriteSystemBrightness: async (): Promise<boolean> => {
    try {
      return await NativeAutoBrightnessModule.canWriteSystemBrightness();
    } catch (error) {
      console.warn('[AutoBrightness] canWriteSystemBrightness failed:', error);
      return false;
    }
  },

  /**
   * Open the WRITE_SETTINGS grant screen. Resolves true if access was already held,
   * false if the system screen was opened (or could not be). Pointless under Device
   * Owner, and a no-op in Play Store builds where the permission is stripped.
   */
  requestWriteSystemBrightnessAccess: async (): Promise<boolean> => {
    try {
      return await NativeAutoBrightnessModule.requestWriteSystemBrightnessAccess();
    } catch (error) {
      console.warn('[AutoBrightness] requestWriteSystemBrightnessAccess failed:', error);
      return false;
    }
  },

  /**
   * Reset screen brightness to system default (BRIGHTNESS_OVERRIDE_NONE).
   * After calling this, Android uses the system brightness setting
   * and external tools (Tasker, adaptive brightness, etc.) have full control.
   */
  resetToSystemBrightness: async (): Promise<AutoBrightnessResult> => {
    try {
      const result = await NativeAutoBrightnessModule.resetToSystemBrightness();
      return result;
    } catch (error) {
      console.error('[AutoBrightness] Failed to reset to system brightness:', error);
      throw error;
    }
  },
};

export default AutoBrightnessModule;
