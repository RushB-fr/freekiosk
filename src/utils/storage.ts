import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  URL: '@kiosk_url',
  PIN: '@kiosk_pin',
  AUTO_RELOAD: '@kiosk_auto_reload',
  KIOSK_ENABLED: '@kiosk_enabled',
  AUTO_LAUNCH: '@kiosk_auto_launch',
  SCREENSAVER_ENABLED: '@screensaver_enabled',
  SCREENSAVER_INACTIVITY_ENABLED: '@screensaver_inactivity_enabled',
  SCREENSAVER_INACTIVITY_DELAY: '@screensaver_inactivity_delay',
  SCREENSAVER_MOTION_ENABLED: '@screensaver_motion_enabled',
  SCREENSAVER_MOTION_SENSITIVITY: '@screensaver_motion_sensitivity',
  SCREENSAVER_MOTION_DELAY: '@screensaver_motion_delay',
  SCREENSAVER_BRIGHTNESS: '@screensaver_brightness',
  DEFAULT_BRIGHTNESS: '@default_brightness',
  DISPLAY_MODE: '@kiosk_display_mode',
  EXTERNAL_APP_PACKAGE: '@kiosk_external_app_package',
  AUTO_RELAUNCH_APP: '@kiosk_auto_relaunch_app',
  OVERLAY_BUTTON_VISIBLE: '@kiosk_overlay_button_visible',
  PIN_MAX_ATTEMPTS: '@kiosk_pin_max_attempts',
  STATUS_BAR_ENABLED: '@kiosk_status_bar_enabled',
  STATUS_BAR_ON_OVERLAY: '@kiosk_status_bar_on_overlay',
  STATUS_BAR_ON_RETURN: '@kiosk_status_bar_on_return',
  EXTERNAL_APP_TEST_MODE: '@kiosk_external_app_test_mode',
  KEYBOARD_MODE: '@kiosk_keyboard_mode',
  // Legacy keys for backward compatibility
  SCREENSAVER_DELAY: '@screensaver_delay',
  MOTION_DETECTION_ENABLED: '@motion_detection_enabled',
  MOTION_SENSITIVITY: '@motion_sensitivity',
  MOTION_DELAY: '@motion_delay'
};

export const StorageService = {
  //URL
  saveUrl: async (url: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.URL, url);
    } catch (error) {
      console.error('Error saving URL:', error);
    }
  },

  getUrl: async (): Promise<string | null> => {
    try {
      return await AsyncStorage.getItem(KEYS.URL);
    } catch (error) {
      console.error('Error getting URL:', error);
      return null;
    }
  },

  //PIN
  savePin: async (pin: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.PIN, pin);
    } catch (error) {
      console.error('Error saving PIN:', error);
    }
  },

  getPin: async (): Promise<string | null> => {
    try {
      return await AsyncStorage.getItem(KEYS.PIN);
    } catch (error) {
      console.error('Error getting PIN:', error);
      return null;
    }
  },

  //AUTORELOAD
  saveAutoReload: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.AUTO_RELOAD, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving auto reload:', error);
    }
  },

  getAutoReload: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.AUTO_RELOAD);
      return value ? JSON.parse(value) : false;
    } catch (error) {
      console.error('Error getting auto reload:', error);
      return false;
    }
  },

  //KIOSKMODE
  saveKioskEnabled: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.KIOSK_ENABLED, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving kiosk enabled:', error);
    }
  },

  getKioskEnabled: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.KIOSK_ENABLED);
      // Par défaut FALSE (kiosk activé si null)
      return value === null ? false : JSON.parse(value);
    } catch (error) {
      console.error('Error getting kiosk enabled:', error);
      return false; // Default OFF
    }
  },

  //AUTOLAUNCH
  saveAutoLaunch: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.AUTO_LAUNCH, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving auto launch:', error);
    }
  },

  getAutoLaunch: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.AUTO_LAUNCH);
      return value ? JSON.parse(value) : false;
    } catch (error) {
      console.error('Error getting auto launch:', error);
      return false;
    }
  },

  //CLEAR ALL
  async clearAll(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([
        KEYS.URL,
        KEYS.PIN,
        KEYS.AUTO_RELOAD,
        KEYS.KIOSK_ENABLED,
        KEYS.AUTO_LAUNCH,
        KEYS.SCREENSAVER_ENABLED,
        KEYS.SCREENSAVER_INACTIVITY_ENABLED,
        KEYS.SCREENSAVER_INACTIVITY_DELAY,
        KEYS.SCREENSAVER_MOTION_ENABLED,
        KEYS.SCREENSAVER_MOTION_SENSITIVITY,
        KEYS.SCREENSAVER_MOTION_DELAY,
        KEYS.SCREENSAVER_BRIGHTNESS,
        KEYS.DEFAULT_BRIGHTNESS,
        KEYS.DISPLAY_MODE,
        KEYS.EXTERNAL_APP_PACKAGE,
        KEYS.AUTO_RELAUNCH_APP,
        KEYS.OVERLAY_BUTTON_VISIBLE,
        KEYS.PIN_MAX_ATTEMPTS,
        KEYS.STATUS_BAR_ENABLED,
        KEYS.STATUS_BAR_ON_OVERLAY,
        KEYS.STATUS_BAR_ON_RETURN,
        // Legacy keys
        KEYS.SCREENSAVER_DELAY,
        KEYS.MOTION_DETECTION_ENABLED,
        KEYS.MOTION_SENSITIVITY,
        KEYS.MOTION_DELAY,
      ]);
    } catch (error) {
      console.error('Error clearing all storage keys:', error);
    }
  },

  //SCREENSAVER
  saveScreensaverEnabled: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.SCREENSAVER_ENABLED, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving screensaver enabled:', error);
    }
  },

  getScreensaverEnabled: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.SCREENSAVER_ENABLED);
      // Par défaut FALSE si clé absente
      return value === null ? false : JSON.parse(value);
    } catch (error) {
      console.error('Error getting screensaver enabled:', error);
      return false;
    }
  },

  saveScreensaverDelay: async (value: number): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.SCREENSAVER_DELAY, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving screensaver delay:', error);
    }
  },

  getScreensaverDelay: async (): Promise<number> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.SCREENSAVER_DELAY);
      // Par défaut 600000 ms (10 minutes) si clé absente
      return value === null ? 60000 : JSON.parse(value);
    } catch (error) {
      console.error('Error getting screensaver delay:', error);
      return 600000;
    }
  },

  //BRIGHTNESS
  saveDefaultBrightness: async (value: number): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.DEFAULT_BRIGHTNESS, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving default brightness:', error);
    }
  },

  getDefaultBrightness: async (): Promise<number> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.DEFAULT_BRIGHTNESS);
      // Par défaut 0.5 (50%) si clé absente
      return value === null ? 0.5 : JSON.parse(value);
    } catch (error) {
      console.error('Error getting default brightness:', error);
      return 0.5;
    }
  },

  //MOTION DETECTION
  saveMotionDetectionEnabled: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.MOTION_DETECTION_ENABLED, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving motion detection enabled:', error);
    }
  },

  getMotionDetectionEnabled: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.MOTION_DETECTION_ENABLED);
      return value === null ? false : JSON.parse(value);
    } catch (error) {
      console.error('Error getting motion detection enabled:', error);
      return false;
    }
  },

  saveMotionSensitivity: async (value: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.MOTION_SENSITIVITY, value);
    } catch (error) {
      console.error('Error saving motion sensitivity:', error);
    }
  },

  getMotionSensitivity: async (): Promise<string> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.MOTION_SENSITIVITY);
      return value === null ? 'medium' : value;
    } catch (error) {
      console.error('Error getting motion sensitivity:', error);
      return 'medium';
    }
  },

  saveMotionDelay: async (value: number): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.MOTION_DELAY, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving motion delay:', error);
    }
  },

  getMotionDelay: async (): Promise<number> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.MOTION_DELAY);
      // Par défaut 30000 ms (30 secondes) si clé absente
      return value === null ? 30000 : JSON.parse(value);
    } catch (error) {
      console.error('Error getting motion delay:', error);
      return 30000;
    }
  },

  //SCREENSAVER NEW ARCHITECTURE
  saveScreensaverInactivityEnabled: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.SCREENSAVER_INACTIVITY_ENABLED, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving screensaver inactivity enabled:', error);
    }
  },

  getScreensaverInactivityEnabled: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.SCREENSAVER_INACTIVITY_ENABLED);
      return value === null ? true : JSON.parse(value); // Par défaut ON
    } catch (error) {
      console.error('Error getting screensaver inactivity enabled:', error);
      return true;
    }
  },

  saveScreensaverInactivityDelay: async (value: number): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.SCREENSAVER_INACTIVITY_DELAY, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving screensaver inactivity delay:', error);
    }
  },

  getScreensaverInactivityDelay: async (): Promise<number> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.SCREENSAVER_INACTIVITY_DELAY);
      return value === null ? 600000 : JSON.parse(value); // Par défaut 10 minutes
    } catch (error) {
      console.error('Error getting screensaver inactivity delay:', error);
      return 600000;
    }
  },

  saveScreensaverMotionEnabled: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.SCREENSAVER_MOTION_ENABLED, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving screensaver motion enabled:', error);
    }
  },

  getScreensaverMotionEnabled: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.SCREENSAVER_MOTION_ENABLED);
      return value === null ? false : JSON.parse(value); // Par défaut OFF
    } catch (error) {
      console.error('Error getting screensaver motion enabled:', error);
      return false;
    }
  },

  saveScreensaverMotionSensitivity: async (value: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.SCREENSAVER_MOTION_SENSITIVITY, value);
    } catch (error) {
      console.error('Error saving screensaver motion sensitivity:', error);
    }
  },

  getScreensaverMotionSensitivity: async (): Promise<string> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.SCREENSAVER_MOTION_SENSITIVITY);
      return value === null ? 'medium' : value;
    } catch (error) {
      console.error('Error getting screensaver motion sensitivity:', error);
      return 'medium';
    }
  },

  saveScreensaverMotionDelay: async (value: number): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.SCREENSAVER_MOTION_DELAY, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving screensaver motion delay:', error);
    }
  },

  getScreensaverMotionDelay: async (): Promise<number> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.SCREENSAVER_MOTION_DELAY);
      return value === null ? 30000 : JSON.parse(value); // Par défaut 30 secondes
    } catch (error) {
      console.error('Error getting screensaver motion delay:', error);
      return 30000;
    }
  },

  saveScreensaverBrightness: async (value: number): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.SCREENSAVER_BRIGHTNESS, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving screensaver brightness:', error);
    }
  },

  getScreensaverBrightness: async (): Promise<number> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.SCREENSAVER_BRIGHTNESS);
      return value === null ? 0 : JSON.parse(value); // Par défaut 0% (black screen)
    } catch (error) {
      console.error('Error getting screensaver brightness:', error);
      return 0;
    }
  },

  //DISPLAY MODE
  saveDisplayMode: async (mode: 'webview' | 'external_app'): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.DISPLAY_MODE, mode);
    } catch (error) {
      console.error('Error saving display mode:', error);
    }
  },

  getDisplayMode: async (): Promise<'webview' | 'external_app'> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.DISPLAY_MODE);
      return value === 'external_app' ? 'external_app' : 'webview'; // Par défaut 'webview'
    } catch (error) {
      console.error('Error getting display mode:', error);
      return 'webview';
    }
  },

  //EXTERNAL APP PACKAGE
  saveExternalAppPackage: async (packageName: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.EXTERNAL_APP_PACKAGE, packageName);
    } catch (error) {
      console.error('Error saving external app package:', error);
    }
  },

  getExternalAppPackage: async (): Promise<string | null> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.EXTERNAL_APP_PACKAGE);
      return value;
    } catch (error) {
      console.error('Error getting external app package:', error);
      return null;
    }
  },

  //AUTO RELAUNCH APP
  saveAutoRelaunchApp: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.AUTO_RELAUNCH_APP, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving auto relaunch app:', error);
    }
  },

  getAutoRelaunchApp: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.AUTO_RELAUNCH_APP);
      return value === null ? true : JSON.parse(value); // Par défaut true
    } catch (error) {
      console.error('Error getting auto relaunch app:', error);
      return true;
    }
  },
  //OVERLAY BUTTON VISIBLE
  saveOverlayButtonVisible: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.OVERLAY_BUTTON_VISIBLE, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving overlay button visible:', error);
    }
  },

  getOverlayButtonVisible: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.OVERLAY_BUTTON_VISIBLE);
      return value === null ? false : JSON.parse(value); // Par défaut false (invisible)
    } catch (error) {
      console.error('Error getting overlay button visible:', error);
      return false;
    }
  },

  //PIN MAX ATTEMPTS
  savePinMaxAttempts: async (value: number): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.PIN_MAX_ATTEMPTS, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving PIN max attempts:', error);
    }
  },

  getPinMaxAttempts: async (): Promise<number> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.PIN_MAX_ATTEMPTS);
      return value === null ? 5 : JSON.parse(value); // Par défaut 5
    } catch (error) {
      console.error('Error getting PIN max attempts:', error);
      return 5;
    }
  },

  //STATUS BAR
  saveStatusBarEnabled: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.STATUS_BAR_ENABLED, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving status bar enabled:', error);
    }
  },

  getStatusBarEnabled: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.STATUS_BAR_ENABLED);
      return value === null ? false : JSON.parse(value); // Par défaut false (désactivée)
    } catch (error) {
      console.error('Error getting status bar enabled:', error);
      return false;
    }
  },

  //STATUS BAR ON OVERLAY (External app mode)
  saveStatusBarOnOverlay: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.STATUS_BAR_ON_OVERLAY, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving status bar on overlay:', error);
    }
  },

  getStatusBarOnOverlay: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.STATUS_BAR_ON_OVERLAY);
      return value === null ? true : JSON.parse(value); // Par défaut true (activée)
    } catch (error) {
      console.error('Error getting status bar on overlay:', error);
      return true;
    }
  },

  //STATUS BAR ON RETURN SCREEN (External app mode)
  saveStatusBarOnReturn: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.STATUS_BAR_ON_RETURN, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving status bar on return:', error);
    }
  },

  getStatusBarOnReturn: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.STATUS_BAR_ON_RETURN);
      return value === null ? true : JSON.parse(value); // Par défaut true (activée)
    } catch (error) {
      console.error('Error getting status bar on return:', error);
      return true;
    }
  },

  //EXTERNAL APP TEST MODE
  saveExternalAppTestMode: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.EXTERNAL_APP_TEST_MODE, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving external app test mode:', error);
    }
  },

  getExternalAppTestMode: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.EXTERNAL_APP_TEST_MODE);
      return value === null ? true : JSON.parse(value); // Par défaut true (activé pour sécurité)
    } catch (error) {
      console.error('Error getting external app test mode:', error);
      return true;
    }
  },

  // Keyboard Mode
  saveKeyboardMode: async (mode: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.KEYBOARD_MODE, mode);
    } catch (error) {
      console.error('Error saving keyboard mode:', error);
    }
  },

  getKeyboardMode: async (): Promise<string> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.KEYBOARD_MODE);
      return value || 'default'; // default, force_numeric, smart
    } catch (error) {
      console.error('Error getting keyboard mode:', error);
      return 'default';
    }
  },

};
