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
}

export interface LightLevelResult {
  lux: number;
  sensorAvailable: boolean;
}

/**
 * Default configuration for auto-brightness
 */
export const AUTO_BRIGHTNESS_DEFAULTS = {
  enabled: false,
  minBrightness: 0.1, // 10%
  maxBrightness: 1.0, // 100%
  updateInterval: 1000, // 1 second
};

const AutoBrightnessModule = {
  /**
   * Start auto-brightness with configurable parameters
   * 
   * @param minBrightness Minimum brightness (0.0-1.0) for dark conditions
   * @param maxBrightness Maximum brightness (0.0-1.0) for bright conditions
   * @param updateInterval Milliseconds between updates (for battery optimization)
   * @returns Promise resolving to result object
   */
  startAutoBrightness: async (
    minBrightness: number = AUTO_BRIGHTNESS_DEFAULTS.minBrightness,
    maxBrightness: number = AUTO_BRIGHTNESS_DEFAULTS.maxBrightness,
    updateInterval: number = AUTO_BRIGHTNESS_DEFAULTS.updateInterval
  ): Promise<AutoBrightnessResult> => {
    try {
      const result = await NativeAutoBrightnessModule.startAutoBrightness(
        minBrightness,
        maxBrightness,
        updateInterval
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
   * @returns Promise resolving to result object
   */
  updateParameters: async (
    minBrightness: number,
    maxBrightness: number,
    updateInterval: number
  ): Promise<AutoBrightnessResult> => {
    try {
      const result = await NativeAutoBrightnessModule.updateParameters(
        minBrightness,
        maxBrightness,
        updateInterval
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
};

export default AutoBrightnessModule;
