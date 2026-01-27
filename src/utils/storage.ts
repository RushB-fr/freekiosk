import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlockingRegion } from '../types/blockingOverlay';

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
  OVERLAY_BUTTON_POSITION: '@kiosk_overlay_button_position',
  PIN_MAX_ATTEMPTS: '@kiosk_pin_max_attempts',
  STATUS_BAR_ENABLED: '@kiosk_status_bar_enabled',
  STATUS_BAR_ON_OVERLAY: '@kiosk_status_bar_on_overlay',
  STATUS_BAR_ON_RETURN: '@kiosk_status_bar_on_return',
  STATUS_BAR_SHOW_BATTERY: '@kiosk_status_bar_show_battery',
  STATUS_BAR_SHOW_WIFI: '@kiosk_status_bar_show_wifi',
  STATUS_BAR_SHOW_BLUETOOTH: '@kiosk_status_bar_show_bluetooth',
  STATUS_BAR_SHOW_VOLUME: '@kiosk_status_bar_show_volume',
  STATUS_BAR_SHOW_TIME: '@kiosk_status_bar_show_time',
  EXTERNAL_APP_TEST_MODE: '@kiosk_external_app_test_mode',
  BACK_BUTTON_MODE: '@kiosk_back_button_mode',
  BACK_BUTTON_TIMER_DELAY: '@kiosk_back_button_timer_delay',
  KEYBOARD_MODE: '@kiosk_keyboard_mode',
  // URL Rotation
  URL_ROTATION_ENABLED: '@kiosk_url_rotation_enabled',
  URL_ROTATION_LIST: '@kiosk_url_rotation_list',
  URL_ROTATION_INTERVAL: '@kiosk_url_rotation_interval',
  // URL Planner
  URL_PLANNER_ENABLED: '@kiosk_url_planner_enabled',
  URL_PLANNER_EVENTS: '@kiosk_url_planner_events',
  // REST API (Home Assistant integration)
  REST_API_ENABLED: '@kiosk_rest_api_enabled',
  REST_API_PORT: '@kiosk_rest_api_port',
  REST_API_KEY: '@kiosk_rest_api_key',
  REST_API_ALLOW_CONTROL: '@kiosk_rest_api_allow_control',
  // Power Button setting
  ALLOW_POWER_BUTTON: '@kiosk_allow_power_button',
  // Return to Settings
  RETURN_TAP_COUNT: '@kiosk_return_tap_count',
  VOLUME_UP_5TAP_ENABLED: '@kiosk_volume_up_5tap_enabled',
  // Blocking Overlays
  BLOCKING_OVERLAYS_ENABLED: '@kiosk_blocking_overlays_enabled',
  BLOCKING_OVERLAYS_REGIONS: '@kiosk_blocking_overlays_regions',
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
      const url = await AsyncStorage.getItem(KEYS.URL);
      return url;
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
      const pin = await AsyncStorage.getItem(KEYS.PIN);
      return pin;
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
        KEYS.OVERLAY_BUTTON_POSITION,
        KEYS.PIN_MAX_ATTEMPTS,
        KEYS.STATUS_BAR_ENABLED,
        KEYS.STATUS_BAR_ON_OVERLAY,
        KEYS.STATUS_BAR_ON_RETURN,
        KEYS.STATUS_BAR_SHOW_BATTERY,
        KEYS.STATUS_BAR_SHOW_WIFI,
        KEYS.STATUS_BAR_SHOW_BLUETOOTH,
        KEYS.STATUS_BAR_SHOW_VOLUME,
        KEYS.STATUS_BAR_SHOW_TIME,
        KEYS.EXTERNAL_APP_TEST_MODE,
        KEYS.BACK_BUTTON_MODE,
        KEYS.BACK_BUTTON_TIMER_DELAY,
        KEYS.KEYBOARD_MODE,
        // URL Rotation
        KEYS.URL_ROTATION_ENABLED,
        KEYS.URL_ROTATION_LIST,
        KEYS.URL_ROTATION_INTERVAL,
        // URL Planner
        KEYS.URL_PLANNER_ENABLED,
        KEYS.URL_PLANNER_EVENTS,
        // REST API
        KEYS.REST_API_ENABLED,
        KEYS.REST_API_PORT,
        KEYS.REST_API_KEY,
        KEYS.REST_API_ALLOW_CONTROL,
        // Power Button
        KEYS.ALLOW_POWER_BUTTON,
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

  //OVERLAY BUTTON POSITION
  saveOverlayButtonPosition: async (value: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.OVERLAY_BUTTON_POSITION, value);
    } catch (error) {
      console.error('Error saving overlay button position:', error);
    }
  },

  getOverlayButtonPosition: async (): Promise<string> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.OVERLAY_BUTTON_POSITION);
      return value ?? 'bottom-right'; // Par défaut bottom-right
    } catch (error) {
      console.error('Error getting overlay button position:', error);
      return 'bottom-right';
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

  //STATUS BAR ITEMS VISIBILITY
  saveStatusBarShowBattery: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.STATUS_BAR_SHOW_BATTERY, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving status bar show battery:', error);
    }
  },

  getStatusBarShowBattery: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.STATUS_BAR_SHOW_BATTERY);
      return value === null ? true : JSON.parse(value);
    } catch (error) {
      console.error('Error getting status bar show battery:', error);
      return true;
    }
  },

  saveStatusBarShowWifi: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.STATUS_BAR_SHOW_WIFI, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving status bar show wifi:', error);
    }
  },

  getStatusBarShowWifi: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.STATUS_BAR_SHOW_WIFI);
      return value === null ? true : JSON.parse(value);
    } catch (error) {
      console.error('Error getting status bar show wifi:', error);
      return true;
    }
  },

  saveStatusBarShowBluetooth: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.STATUS_BAR_SHOW_BLUETOOTH, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving status bar show bluetooth:', error);
    }
  },

  getStatusBarShowBluetooth: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.STATUS_BAR_SHOW_BLUETOOTH);
      return value === null ? true : JSON.parse(value);
    } catch (error) {
      console.error('Error getting status bar show bluetooth:', error);
      return true;
    }
  },

  saveStatusBarShowVolume: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.STATUS_BAR_SHOW_VOLUME, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving status bar show volume:', error);
    }
  },

  getStatusBarShowVolume: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.STATUS_BAR_SHOW_VOLUME);
      return value === null ? true : JSON.parse(value);
    } catch (error) {
      console.error('Error getting status bar show volume:', error);
      return true;
    }
  },

  saveStatusBarShowTime: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.STATUS_BAR_SHOW_TIME, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving status bar show time:', error);
    }
  },

  getStatusBarShowTime: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.STATUS_BAR_SHOW_TIME);
      return value === null ? true : JSON.parse(value);
    } catch (error) {
      console.error('Error getting status bar show time:', error);
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

  // Back Button Mode: 'test' | 'immediate' | 'timer'
  saveBackButtonMode: async (mode: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.BACK_BUTTON_MODE, mode);
    } catch (error) {
      console.error('Error saving back button mode:', error);
    }
  },

  getBackButtonMode: async (): Promise<string> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.BACK_BUTTON_MODE);
      return value || 'test'; // Par défaut test (sécurité)
    } catch (error) {
      console.error('Error getting back button mode:', error);
      return 'test';
    }
  },

  // Back Button Timer Delay (en secondes, 1-3600)
  saveBackButtonTimerDelay: async (delay: number): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.BACK_BUTTON_TIMER_DELAY, String(delay));
    } catch (error) {
      console.error('Error saving back button timer delay:', error);
    }
  },

  getBackButtonTimerDelay: async (): Promise<number> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.BACK_BUTTON_TIMER_DELAY);
      const delay = value ? parseInt(value, 10) : 10;
      return isNaN(delay) ? 10 : Math.max(1, Math.min(3600, delay));
    } catch (error) {
      console.error('Error getting back button timer delay:', error);
      return 10;
    }
  },

  // ============ URL ROTATION ============
  
  saveUrlRotationEnabled: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.URL_ROTATION_ENABLED, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving URL rotation enabled:', error);
    }
  },

  getUrlRotationEnabled: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.URL_ROTATION_ENABLED);
      return value ? JSON.parse(value) : false;
    } catch (error) {
      console.error('Error getting URL rotation enabled:', error);
      return false;
    }
  },

  saveUrlRotationList: async (urls: string[]): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.URL_ROTATION_LIST, JSON.stringify(urls));
    } catch (error) {
      console.error('Error saving URL rotation list:', error);
    }
  },

  getUrlRotationList: async (): Promise<string[]> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.URL_ROTATION_LIST);
      return value ? JSON.parse(value) : [];
    } catch (error) {
      console.error('Error getting URL rotation list:', error);
      return [];
    }
  },

  saveUrlRotationInterval: async (seconds: number): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.URL_ROTATION_INTERVAL, String(seconds));
    } catch (error) {
      console.error('Error saving URL rotation interval:', error);
    }
  },

  getUrlRotationInterval: async (): Promise<number> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.URL_ROTATION_INTERVAL);
      const interval = value ? parseInt(value, 10) : 30;
      return isNaN(interval) ? 30 : Math.max(5, interval);
    } catch (error) {
      console.error('Error getting URL rotation interval:', error);
      return 30;
    }
  },

  // ============ URL PLANNER ============
  
  saveUrlPlannerEnabled: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.URL_PLANNER_ENABLED, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving URL planner enabled:', error);
    }
  },

  getUrlPlannerEnabled: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.URL_PLANNER_ENABLED);
      return value ? JSON.parse(value) : false;
    } catch (error) {
      console.error('Error getting URL planner enabled:', error);
      return false;
    }
  },

  saveUrlPlannerEvents: async (events: any[]): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.URL_PLANNER_EVENTS, JSON.stringify(events));
    } catch (error) {
      console.error('Error saving URL planner events:', error);
    }
  },

  getUrlPlannerEvents: async (): Promise<any[]> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.URL_PLANNER_EVENTS);
      return value ? JSON.parse(value) : [];
    } catch (error) {
      console.error('Error getting URL planner events:', error);
      return [];
    }
  },

  // ============ REST API (Home Assistant) ============
  
  saveRestApiEnabled: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.REST_API_ENABLED, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving REST API enabled:', error);
    }
  },

  getRestApiEnabled: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.REST_API_ENABLED);
      return value ? JSON.parse(value) : false;
    } catch (error) {
      console.error('Error getting REST API enabled:', error);
      return false;
    }
  },

  saveRestApiPort: async (port: number): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.REST_API_PORT, port.toString());
    } catch (error) {
      console.error('Error saving REST API port:', error);
    }
  },

  getRestApiPort: async (): Promise<number> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.REST_API_PORT);
      const port = value ? parseInt(value, 10) : 8080;
      return isNaN(port) ? 8080 : port;
    } catch (error) {
      console.error('Error getting REST API port:', error);
      return 8080;
    }
  },

  saveRestApiKey: async (key: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.REST_API_KEY, key);
    } catch (error) {
      console.error('Error saving REST API key:', error);
    }
  },

  getRestApiKey: async (): Promise<string> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.REST_API_KEY);
      return value || '';
    } catch (error) {
      console.error('Error getting REST API key:', error);
      return '';
    }
  },

  saveRestApiAllowControl: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.REST_API_ALLOW_CONTROL, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving REST API allow control:', error);
    }
  },

  getRestApiAllowControl: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.REST_API_ALLOW_CONTROL);
      return value ? JSON.parse(value) : true;
    } catch (error) {
      console.error('Error getting REST API allow control:', error);
      return true;
    }
  },

  // POWER BUTTON
  saveAllowPowerButton: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.ALLOW_POWER_BUTTON, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving allow power button:', error);
    }
  },

  getAllowPowerButton: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.ALLOW_POWER_BUTTON);
      return value ? JSON.parse(value) : false; // Default OFF for maximum security
    } catch (error) {
      console.error('Error getting allow power button:', error);
      return false;
    }
  },

  // RETURN TAP COUNT
  saveReturnTapCount: async (value: number): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.RETURN_TAP_COUNT, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving return tap count:', error);
    }
  },

  getReturnTapCount: async (): Promise<number> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.RETURN_TAP_COUNT);
      return value ? JSON.parse(value) : 5; // Default 5 taps
    } catch (error) {
      console.error('Error getting return tap count:', error);
      return 5;
    }
  },

  // VOLUME UP 5-TAP
  saveVolumeUp5TapEnabled: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.VOLUME_UP_5TAP_ENABLED, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving volume up 5-tap enabled:', error);
    }
  },

  getVolumeUp5TapEnabled: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.VOLUME_UP_5TAP_ENABLED);
      return value ? JSON.parse(value) : true; // Default ON for backward compatibility
    } catch (error) {
      console.error('Error getting volume up 5-tap enabled:', error);
      return true;
    }
  },

  // BLOCKING OVERLAYS
  saveBlockingOverlaysEnabled: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.BLOCKING_OVERLAYS_ENABLED, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving blocking overlays enabled:', error);
    }
  },

  getBlockingOverlaysEnabled: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.BLOCKING_OVERLAYS_ENABLED);
      return value ? JSON.parse(value) : false;
    } catch (error) {
      console.error('Error getting blocking overlays enabled:', error);
      return false;
    }
  },

  saveBlockingOverlaysRegions: async (regions: BlockingRegion[]): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.BLOCKING_OVERLAYS_REGIONS, JSON.stringify(regions));
    } catch (error) {
      console.error('Error saving blocking overlays regions:', error);
    }
  },

  getBlockingOverlaysRegions: async (): Promise<BlockingRegion[]> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.BLOCKING_OVERLAYS_REGIONS);
      return value ? JSON.parse(value) : [];
    } catch (error) {
      console.error('Error getting blocking overlays regions:', error);
      return [];
    }
  },

};
