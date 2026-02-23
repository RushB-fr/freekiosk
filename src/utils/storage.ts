import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlockingRegion } from '../types/blockingOverlay';
import { ScreenScheduleRule } from '../types/screenScheduler';
import { saveSecureApiKey, getSecureApiKey, clearSecureApiKey, clearSecureMqttPassword } from './secureStorage';

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
  // PIN Mode
  PIN_MODE: '@kiosk_pin_mode', // 'numeric' or 'alphanumeric'
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
  // Notifications (NFC support)
  ALLOW_NOTIFICATIONS: '@kiosk_allow_notifications',
  // Allow System Info (audio fix for Samsung in lock mode)
  ALLOW_SYSTEM_INFO: '@kiosk_allow_system_info',
  // Return to Settings
  RETURN_TAP_COUNT: '@kiosk_return_tap_count',
  RETURN_TAP_TIMEOUT: '@kiosk_return_tap_timeout',
  RETURN_MODE: '@kiosk_return_mode', // 'tap_anywhere' | 'button'
  RETURN_BUTTON_POSITION: '@kiosk_return_button_position', // 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  VOLUME_UP_5TAP_ENABLED: '@kiosk_volume_up_5tap_enabled',
  // Blocking Overlays
  BLOCKING_OVERLAYS_ENABLED: '@kiosk_blocking_overlays_enabled',
  BLOCKING_OVERLAYS_REGIONS: '@kiosk_blocking_overlays_regions',
  // Camera preference for motion detection
  MOTION_CAMERA_POSITION: '@motion_camera_position',
  // WebView Back Button
  WEBVIEW_BACK_BUTTON_ENABLED: '@kiosk_webview_back_button_enabled',
  WEBVIEW_BACK_BUTTON_X_PERCENT: '@kiosk_webview_back_button_x_percent',
  WEBVIEW_BACK_BUTTON_Y_PERCENT: '@kiosk_webview_back_button_y_percent',
  // Auto-Brightness
  AUTO_BRIGHTNESS_ENABLED: '@kiosk_auto_brightness_enabled',
  AUTO_BRIGHTNESS_MIN: '@kiosk_auto_brightness_min',
  AUTO_BRIGHTNESS_MAX: '@kiosk_auto_brightness_max',
  AUTO_BRIGHTNESS_UPDATE_INTERVAL: '@kiosk_auto_brightness_update_interval',
  AUTO_BRIGHTNESS_SAVED_MANUAL: '@kiosk_auto_brightness_saved_manual',
  // Screen Sleep Scheduler
  SCREEN_SCHEDULER_ENABLED: '@kiosk_screen_scheduler_enabled',
  SCREEN_SCHEDULER_RULES: '@kiosk_screen_scheduler_rules',
  SCREEN_SCHEDULER_WAKE_ON_TOUCH: '@kiosk_screen_scheduler_wake_on_touch',
  // Inactivity Return to Home
  INACTIVITY_RETURN_ENABLED: '@kiosk_inactivity_return_enabled',
  INACTIVITY_RETURN_DELAY: '@kiosk_inactivity_return_delay',
  INACTIVITY_RETURN_RESET_ON_NAV: '@kiosk_inactivity_return_reset_on_nav',
  INACTIVITY_RETURN_CLEAR_CACHE: '@kiosk_inactivity_return_clear_cache',
  INACTIVITY_RETURN_SCROLL_TOP: '@kiosk_inactivity_return_scroll_top',
  // URL Filtering (Blacklist/Whitelist)
  URL_FILTER_ENABLED: '@kiosk_url_filter_enabled',
  URL_FILTER_MODE: '@kiosk_url_filter_mode', // 'blacklist' | 'whitelist'
  URL_FILTER_LIST: '@kiosk_url_filter_list',
  URL_FILTER_SHOW_FEEDBACK: '@kiosk_url_filter_show_feedback',
  // PDF Viewer
  PDF_VIEWER_ENABLED: '@kiosk_pdf_viewer_enabled',
  // MQTT (Home Assistant integration)
  MQTT_ENABLED: '@kiosk_mqtt_enabled',
  MQTT_BROKER_URL: '@kiosk_mqtt_broker_url',
  MQTT_PORT: '@kiosk_mqtt_port',
  MQTT_USERNAME: '@kiosk_mqtt_username',
  MQTT_CLIENT_ID: '@kiosk_mqtt_client_id',
  MQTT_BASE_TOPIC: '@kiosk_mqtt_base_topic',
  MQTT_DISCOVERY_PREFIX: '@kiosk_mqtt_discovery_prefix',
  MQTT_STATUS_INTERVAL: '@kiosk_mqtt_status_interval',
  MQTT_ALLOW_CONTROL: '@kiosk_mqtt_allow_control',
  MQTT_DEVICE_NAME: '@kiosk_mqtt_device_name',
  MQTT_MOTION_ALWAYS_ON: '@kiosk_mqtt_motion_always_on',
  // Beta Updates
  BETA_UPDATES_ENABLED: '@kiosk_beta_updates_enabled',
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
        KEYS.PIN_MODE,
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
        // Notifications
        KEYS.ALLOW_NOTIFICATIONS,
        // System Info (audio fix)
        KEYS.ALLOW_SYSTEM_INFO,
        // Return to Settings
        KEYS.RETURN_TAP_COUNT,
        KEYS.VOLUME_UP_5TAP_ENABLED,
        // Blocking Overlays
        KEYS.BLOCKING_OVERLAYS_ENABLED,
        KEYS.BLOCKING_OVERLAYS_REGIONS,
        // Return to Settings (missing keys)
        KEYS.RETURN_TAP_TIMEOUT,
        KEYS.RETURN_MODE,
        KEYS.RETURN_BUTTON_POSITION,
        // Camera preference
        KEYS.MOTION_CAMERA_POSITION,
        // WebView Back Button
        KEYS.WEBVIEW_BACK_BUTTON_ENABLED,
        KEYS.WEBVIEW_BACK_BUTTON_X_PERCENT,
        KEYS.WEBVIEW_BACK_BUTTON_Y_PERCENT,
        // Auto-Brightness
        KEYS.AUTO_BRIGHTNESS_ENABLED,
        KEYS.AUTO_BRIGHTNESS_MIN,
        KEYS.AUTO_BRIGHTNESS_MAX,
        KEYS.AUTO_BRIGHTNESS_UPDATE_INTERVAL,
        KEYS.AUTO_BRIGHTNESS_SAVED_MANUAL,
        // Screen Sleep Scheduler
        KEYS.SCREEN_SCHEDULER_ENABLED,
        KEYS.SCREEN_SCHEDULER_RULES,
        KEYS.SCREEN_SCHEDULER_WAKE_ON_TOUCH,
        // Inactivity Return to Home
        KEYS.INACTIVITY_RETURN_ENABLED,
        KEYS.INACTIVITY_RETURN_DELAY,
        KEYS.INACTIVITY_RETURN_RESET_ON_NAV,
        KEYS.INACTIVITY_RETURN_CLEAR_CACHE,
        KEYS.INACTIVITY_RETURN_SCROLL_TOP,
        // URL Filtering
        KEYS.URL_FILTER_ENABLED,
        KEYS.URL_FILTER_MODE,
        KEYS.URL_FILTER_LIST,
        KEYS.URL_FILTER_SHOW_FEEDBACK,
        // PDF Viewer
        KEYS.PDF_VIEWER_ENABLED,
        // MQTT
        KEYS.MQTT_ENABLED,
        KEYS.MQTT_BROKER_URL,
        KEYS.MQTT_PORT,
        KEYS.MQTT_USERNAME,
        KEYS.MQTT_CLIENT_ID,
        KEYS.MQTT_BASE_TOPIC,
        KEYS.MQTT_DISCOVERY_PREFIX,
        KEYS.MQTT_STATUS_INTERVAL,
        KEYS.MQTT_ALLOW_CONTROL,
        KEYS.MQTT_DEVICE_NAME,
        KEYS.MQTT_MOTION_ALWAYS_ON,
        // Legacy keys
        KEYS.SCREENSAVER_DELAY,
        KEYS.MOTION_DETECTION_ENABLED,
        KEYS.MOTION_SENSITIVITY,
        KEYS.MOTION_DELAY,
      ]);
      // Also clear secure API key and MQTT password from Keychain
      await clearSecureApiKey();
      await clearSecureMqttPassword();
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

  // MOTION CAMERA POSITION
  saveMotionCameraPosition: async (value: 'front' | 'back'): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.MOTION_CAMERA_POSITION, value);
    } catch (error) {
      console.error('Error saving motion camera position:', error);
    }
  },

  getMotionCameraPosition: async (): Promise<'front' | 'back'> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.MOTION_CAMERA_POSITION);
      // Default 'front' = comportement actuel si clé absente
      return (value as 'front' | 'back') || 'front';
    } catch (error) {
      console.error('Error getting motion camera position:', error);
      return 'front'; // Fallback = comportement actuel
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

  //PIN MODE (numeric or alphanumeric)
  savePinMode: async (mode: 'numeric' | 'alphanumeric'): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.PIN_MODE, mode);
    } catch (error) {
      console.error('Error saving PIN mode:', error);
    }
  },

  getPinMode: async (): Promise<'numeric' | 'alphanumeric'> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.PIN_MODE);
      return (value as 'numeric' | 'alphanumeric') || 'numeric'; // Default: numeric
    } catch (error) {
      console.error('Error getting PIN mode:', error);
      return 'numeric';
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
      await saveSecureApiKey(key);
    } catch (error) {
      console.error('Error saving REST API key:', error);
    }
  },

  getRestApiKey: async (): Promise<string> => {
    try {
      return await getSecureApiKey();
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
      return value ? JSON.parse(value) : true; // Default ON - prevents Samsung/OneUI audio mute in lock task mode
    } catch (error) {
      console.error('Error getting allow power button:', error);
      return false;
    }
  },

  // NOTIFICATIONS (NFC SUPPORT)
  saveAllowNotifications: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.ALLOW_NOTIFICATIONS, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving allow notifications:', error);
    }
  },

  getAllowNotifications: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.ALLOW_NOTIFICATIONS);
      return value ? JSON.parse(value) : false; // Default OFF for maximum security
    } catch (error) {
      console.error('Error getting allow notifications:', error);
      return false;
    }
  },

  // ALLOW SYSTEM INFO (audio fix for Samsung in lock mode)
  saveAllowSystemInfo: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.ALLOW_SYSTEM_INFO, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving allow system info:', error);
    }
  },

  getAllowSystemInfo: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.ALLOW_SYSTEM_INFO);
      return value ? JSON.parse(value) : false; // Default OFF
    } catch (error) {
      console.error('Error getting allow system info:', error);
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

  // RETURN TAP TIMEOUT (milliseconds)
  saveReturnTapTimeout: async (value: number): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.RETURN_TAP_TIMEOUT, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving return tap timeout:', error);
    }
  },

  getReturnTapTimeout: async (): Promise<number> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.RETURN_TAP_TIMEOUT);
      return value ? JSON.parse(value) : 1500; // Default 1500ms
    } catch (error) {
      console.error('Error getting return tap timeout:', error);
      return 1500;
    }
  },

  // RETURN MODE ('tap_anywhere' or 'button')
  saveReturnMode: async (value: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.RETURN_MODE, value);
    } catch (error) {
      console.error('Error saving return mode:', error);
    }
  },

  getReturnMode: async (): Promise<string> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.RETURN_MODE);
      return value || 'tap_anywhere'; // Default tap_anywhere
    } catch (error) {
      console.error('Error getting return mode:', error);
      return 'tap_anywhere';
    }
  },

  // RETURN BUTTON POSITION
  saveReturnButtonPosition: async (value: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.RETURN_BUTTON_POSITION, value);
    } catch (error) {
      console.error('Error saving return button position:', error);
    }
  },

  getReturnButtonPosition: async (): Promise<string> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.RETURN_BUTTON_POSITION);
      return value || 'bottom-right'; // Default bottom-right
    } catch (error) {
      console.error('Error getting return button position:', error);
      return 'bottom-right';
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

  // WebView Back Button
  saveWebViewBackButtonEnabled: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.WEBVIEW_BACK_BUTTON_ENABLED, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving webview back button enabled:', error);
    }
  },

  getWebViewBackButtonEnabled: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.WEBVIEW_BACK_BUTTON_ENABLED);
      return value ? JSON.parse(value) : false;
    } catch (error) {
      console.error('Error getting webview back button enabled:', error);
      return false;
    }
  },

  saveWebViewBackButtonXPercent: async (value: number): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.WEBVIEW_BACK_BUTTON_X_PERCENT, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving webview back button X percent:', error);
    }
  },

  getWebViewBackButtonXPercent: async (): Promise<number> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.WEBVIEW_BACK_BUTTON_X_PERCENT);
      return value ? JSON.parse(value) : 2; // 2% from left by default
    } catch (error) {
      console.error('Error getting webview back button X percent:', error);
      return 2;
    }
  },

  saveWebViewBackButtonYPercent: async (value: number): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.WEBVIEW_BACK_BUTTON_Y_PERCENT, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving webview back button Y percent:', error);
    }
  },

  getWebViewBackButtonYPercent: async (): Promise<number> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.WEBVIEW_BACK_BUTTON_Y_PERCENT);
      return value ? JSON.parse(value) : 10; // 10% from top by default (to avoid StatusBar)
    } catch (error) {
      console.error('Error getting webview back button Y percent:', error);
      return 10;
    }
  },

  // AUTO-BRIGHTNESS
  saveAutoBrightnessEnabled: async (enabled: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.AUTO_BRIGHTNESS_ENABLED, JSON.stringify(enabled));
    } catch (error) {
      console.error('Error saving auto brightness enabled:', error);
    }
  },

  getAutoBrightnessEnabled: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.AUTO_BRIGHTNESS_ENABLED);
      return value ? JSON.parse(value) : false; // Default: OFF for backward compatibility
    } catch (error) {
      console.error('Error getting auto brightness enabled:', error);
      return false;
    }
  },

  saveAutoBrightnessMin: async (value: number): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.AUTO_BRIGHTNESS_MIN, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving auto brightness min:', error);
    }
  },

  getAutoBrightnessMin: async (): Promise<number> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.AUTO_BRIGHTNESS_MIN);
      return value ? JSON.parse(value) : 0.1; // Default: 10%
    } catch (error) {
      console.error('Error getting auto brightness min:', error);
      return 0.1;
    }
  },

  saveAutoBrightnessMax: async (value: number): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.AUTO_BRIGHTNESS_MAX, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving auto brightness max:', error);
    }
  },

  getAutoBrightnessMax: async (): Promise<number> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.AUTO_BRIGHTNESS_MAX);
      return value ? JSON.parse(value) : 1.0; // Default: 100%
    } catch (error) {
      console.error('Error getting auto brightness max:', error);
      return 1.0;
    }
  },

  saveAutoBrightnessUpdateInterval: async (value: number): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.AUTO_BRIGHTNESS_UPDATE_INTERVAL, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving auto brightness update interval:', error);
    }
  },

  getAutoBrightnessUpdateInterval: async (): Promise<number> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.AUTO_BRIGHTNESS_UPDATE_INTERVAL);
      return value ? JSON.parse(value) : 1000; // Default: 1 second
    } catch (error) {
      console.error('Error getting auto brightness update interval:', error);
      return 1000;
    }
  },

  saveAutoBrightnessSavedManual: async (value: number): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.AUTO_BRIGHTNESS_SAVED_MANUAL, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving auto brightness saved manual:', error);
    }
  },

  getAutoBrightnessSavedManual: async (): Promise<number | null> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.AUTO_BRIGHTNESS_SAVED_MANUAL);
      return value ? JSON.parse(value) : null; // Null if never saved
    } catch (error) {
      console.error('Error getting auto brightness saved manual:', error);
      return null;
    }
  },

  // ============ SCREEN SLEEP SCHEDULER ============

  saveScreenSchedulerEnabled: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.SCREEN_SCHEDULER_ENABLED, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving screen scheduler enabled:', error);
    }
  },

  getScreenSchedulerEnabled: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.SCREEN_SCHEDULER_ENABLED);
      return value ? JSON.parse(value) : false; // Default: OFF
    } catch (error) {
      console.error('Error getting screen scheduler enabled:', error);
      return false;
    }
  },

  saveScreenSchedulerRules: async (rules: ScreenScheduleRule[]): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.SCREEN_SCHEDULER_RULES, JSON.stringify(rules));
    } catch (error) {
      console.error('Error saving screen scheduler rules:', error);
    }
  },

  getScreenSchedulerRules: async (): Promise<ScreenScheduleRule[]> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.SCREEN_SCHEDULER_RULES);
      return value ? JSON.parse(value) : [];
    } catch (error) {
      console.error('Error getting screen scheduler rules:', error);
      return [];
    }
  },

  saveScreenSchedulerWakeOnTouch: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.SCREEN_SCHEDULER_WAKE_ON_TOUCH, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving screen scheduler wake on touch:', error);
    }
  },

  getScreenSchedulerWakeOnTouch: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.SCREEN_SCHEDULER_WAKE_ON_TOUCH);
      return value ? JSON.parse(value) : true; // Default: ON (allow wake on touch)
    } catch (error) {
      console.error('Error getting screen scheduler wake on touch:', error);
      return true;
    }
  },

  // ============ INACTIVITY RETURN TO HOME ============

  saveInactivityReturnEnabled: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.INACTIVITY_RETURN_ENABLED, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving inactivity return enabled:', error);
    }
  },

  getInactivityReturnEnabled: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.INACTIVITY_RETURN_ENABLED);
      return value ? JSON.parse(value) : false; // Default: OFF
    } catch (error) {
      console.error('Error getting inactivity return enabled:', error);
      return false;
    }
  },

  saveInactivityReturnDelay: async (value: number): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.INACTIVITY_RETURN_DELAY, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving inactivity return delay:', error);
    }
  },

  getInactivityReturnDelay: async (): Promise<number> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.INACTIVITY_RETURN_DELAY);
      return value ? JSON.parse(value) : 60; // Default: 60 seconds
    } catch (error) {
      console.error('Error getting inactivity return delay:', error);
      return 60;
    }
  },

  saveInactivityReturnResetOnNav: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.INACTIVITY_RETURN_RESET_ON_NAV, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving inactivity return reset on nav:', error);
    }
  },

  getInactivityReturnResetOnNav: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.INACTIVITY_RETURN_RESET_ON_NAV);
      return value ? JSON.parse(value) : true; // Default: ON
    } catch (error) {
      console.error('Error getting inactivity return reset on nav:', error);
      return true;
    }
  },

  saveInactivityReturnClearCache: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.INACTIVITY_RETURN_CLEAR_CACHE, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving inactivity return clear cache:', error);
    }
  },

  getInactivityReturnClearCache: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.INACTIVITY_RETURN_CLEAR_CACHE);
      return value ? JSON.parse(value) : false; // Default: OFF
    } catch (error) {
      console.error('Error getting inactivity return clear cache:', error);
      return false;
    }
  },

  saveInactivityReturnScrollTop: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.INACTIVITY_RETURN_SCROLL_TOP, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving inactivity return scroll top:', error);
    }
  },

  getInactivityReturnScrollTop: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.INACTIVITY_RETURN_SCROLL_TOP);
      return value ? JSON.parse(value) : true; // Default: ON
    } catch (error) {
      console.error('Error getting inactivity return scroll top:', error);
      return true;
    }
  },

  // ============ URL FILTERING ============

  saveUrlFilterEnabled: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.URL_FILTER_ENABLED, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving URL filter enabled:', error);
    }
  },

  getUrlFilterEnabled: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.URL_FILTER_ENABLED);
      return value ? JSON.parse(value) : false;
    } catch (error) {
      console.error('Error getting URL filter enabled:', error);
      return false;
    }
  },

  saveUrlFilterMode: async (mode: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.URL_FILTER_MODE, mode);
    } catch (error) {
      console.error('Error saving URL filter mode:', error);
    }
  },

  getUrlFilterMode: async (): Promise<string> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.URL_FILTER_MODE);
      return value || 'blacklist';
    } catch (error) {
      console.error('Error getting URL filter mode:', error);
      return 'blacklist';
    }
  },

  saveUrlFilterList: async (patterns: string[]): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.URL_FILTER_LIST, JSON.stringify(patterns));
    } catch (error) {
      console.error('Error saving URL filter list:', error);
    }
  },

  getUrlFilterList: async (): Promise<string[]> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.URL_FILTER_LIST);
      return value ? JSON.parse(value) : [];
    } catch (error) {
      console.error('Error getting URL filter list:', error);
      return [];
    }
  },

  saveUrlFilterShowFeedback: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.URL_FILTER_SHOW_FEEDBACK, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving URL filter show feedback:', error);
    }
  },

  getUrlFilterShowFeedback: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.URL_FILTER_SHOW_FEEDBACK);
      return value ? JSON.parse(value) : false;
    } catch (error) {
      console.error('Error getting URL filter show feedback:', error);
      return false;
    }
  },

  // ============ PDF VIEWER ============

  savePdfViewerEnabled: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.PDF_VIEWER_ENABLED, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving PDF viewer enabled:', error);
    }
  },

  getPdfViewerEnabled: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.PDF_VIEWER_ENABLED);
      return value ? JSON.parse(value) : false;
    } catch (error) {
      console.error('Error getting PDF viewer enabled:', error);
      return false;
    }
  },

  // ============ MQTT (Home Assistant) ============

  saveMqttEnabled: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.MQTT_ENABLED, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving MQTT enabled:', error);
    }
  },

  getMqttEnabled: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.MQTT_ENABLED);
      return value ? JSON.parse(value) : false;
    } catch (error) {
      console.error('Error getting MQTT enabled:', error);
      return false;
    }
  },

  saveMqttBrokerUrl: async (url: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.MQTT_BROKER_URL, url);
    } catch (error) {
      console.error('Error saving MQTT broker URL:', error);
    }
  },

  getMqttBrokerUrl: async (): Promise<string> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.MQTT_BROKER_URL);
      return value || '';
    } catch (error) {
      console.error('Error getting MQTT broker URL:', error);
      return '';
    }
  },

  saveMqttPort: async (port: number): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.MQTT_PORT, port.toString());
    } catch (error) {
      console.error('Error saving MQTT port:', error);
    }
  },

  getMqttPort: async (): Promise<number> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.MQTT_PORT);
      const port = value ? parseInt(value, 10) : 1883;
      return isNaN(port) ? 1883 : port;
    } catch (error) {
      console.error('Error getting MQTT port:', error);
      return 1883;
    }
  },

  saveMqttUsername: async (username: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.MQTT_USERNAME, username);
    } catch (error) {
      console.error('Error saving MQTT username:', error);
    }
  },

  getMqttUsername: async (): Promise<string> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.MQTT_USERNAME);
      return value || '';
    } catch (error) {
      console.error('Error getting MQTT username:', error);
      return '';
    }
  },

  saveMqttClientId: async (clientId: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.MQTT_CLIENT_ID, clientId);
    } catch (error) {
      console.error('Error saving MQTT client ID:', error);
    }
  },

  getMqttClientId: async (): Promise<string> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.MQTT_CLIENT_ID);
      return value || '';
    } catch (error) {
      console.error('Error getting MQTT client ID:', error);
      return '';
    }
  },

  saveMqttBaseTopic: async (topic: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.MQTT_BASE_TOPIC, topic);
    } catch (error) {
      console.error('Error saving MQTT base topic:', error);
    }
  },

  getMqttBaseTopic: async (): Promise<string> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.MQTT_BASE_TOPIC);
      return value || 'freekiosk';
    } catch (error) {
      console.error('Error getting MQTT base topic:', error);
      return 'freekiosk';
    }
  },

  saveMqttDiscoveryPrefix: async (prefix: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.MQTT_DISCOVERY_PREFIX, prefix);
    } catch (error) {
      console.error('Error saving MQTT discovery prefix:', error);
    }
  },

  getMqttDiscoveryPrefix: async (): Promise<string> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.MQTT_DISCOVERY_PREFIX);
      return value || 'homeassistant';
    } catch (error) {
      console.error('Error getting MQTT discovery prefix:', error);
      return 'homeassistant';
    }
  },

  saveMqttStatusInterval: async (seconds: number): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.MQTT_STATUS_INTERVAL, seconds.toString());
    } catch (error) {
      console.error('Error saving MQTT status interval:', error);
    }
  },

  getMqttStatusInterval: async (): Promise<number> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.MQTT_STATUS_INTERVAL);
      const interval = value ? parseInt(value, 10) : 30;
      return isNaN(interval) ? 30 : Math.max(5, interval);
    } catch (error) {
      console.error('Error getting MQTT status interval:', error);
      return 30;
    }
  },

  saveMqttAllowControl: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.MQTT_ALLOW_CONTROL, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving MQTT allow control:', error);
    }
  },

  getMqttAllowControl: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.MQTT_ALLOW_CONTROL);
      return value ? JSON.parse(value) : true;
    } catch (error) {
      console.error('Error getting MQTT allow control:', error);
      return true;
    }
  },

  saveMqttDeviceName: async (name: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.MQTT_DEVICE_NAME, name);
    } catch (error) {
      console.error('Error saving MQTT device name:', error);
    }
  },

  getMqttDeviceName: async (): Promise<string> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.MQTT_DEVICE_NAME);
      return value || '';
    } catch (error) {
      console.error('Error getting MQTT device name:', error);
      return '';
    }
  },

  saveMqttMotionAlwaysOn: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.MQTT_MOTION_ALWAYS_ON, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving MQTT motion always on:', error);
    }
  },

  getMqttMotionAlwaysOn: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.MQTT_MOTION_ALWAYS_ON);
      return value ? JSON.parse(value) : false;
    } catch (error) {
      console.error('Error getting MQTT motion always on:', error);
      return false;
    }
  },

  // BETA UPDATES
  saveBetaUpdatesEnabled: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.BETA_UPDATES_ENABLED, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving beta updates enabled:', error);
    }
  },

  getBetaUpdatesEnabled: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.BETA_UPDATES_ENABLED);
      return value ? JSON.parse(value) : false; // Default OFF
    } catch (error) {
      console.error('Error getting beta updates enabled:', error);
      return false;
    }
  },

  /**
   * Batch load all settings in a single multiGet call.
   * This is much faster than 50+ sequential getItem calls (single bridge crossing).
   * Returns a Map for O(1) key lookup.
   */
  getAllSettings: async (): Promise<Map<string, string | null>> => {
    try {
      const allKeys = Object.values(KEYS);
      const pairs = await AsyncStorage.multiGet(allKeys);
      const map = new Map<string, string | null>();
      for (const [key, value] of pairs) {
        map.set(key, value);
      }
      return map;
    } catch (error) {
      console.error('Error batch loading settings:', error);
      return new Map();
    }
  },

  /** Expose KEYS for external multiGet consumers */
  KEYS,

};
