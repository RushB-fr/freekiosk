/**
 * FreeKiosk - BackupService
 * Handles backup and restore of app configuration
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, PermissionsAndroid, Alert } from 'react-native';
import RNFS from 'react-native-fs';
import { hasSecurePin, getSecureApiKey, saveSecureApiKey, getSecureMqttPassword, saveSecureMqttPassword } from './secureStorage';

// All storage keys to backup
const BACKUP_KEYS = [
  '@kiosk_url',
  '@kiosk_auto_reload',
  '@kiosk_enabled',
  '@kiosk_auto_launch',
  '@screensaver_enabled',
  '@screensaver_inactivity_enabled',
  '@screensaver_inactivity_delay',
  '@screensaver_motion_enabled',
  '@screensaver_motion_sensitivity',
  '@screensaver_motion_delay',
  '@screensaver_brightness',
  '@default_brightness',
  '@kiosk_display_mode',
  '@kiosk_external_app_package',
  '@kiosk_auto_relaunch_app',
  '@kiosk_overlay_button_visible',
  '@kiosk_overlay_button_position',
  '@kiosk_pin_max_attempts',
  '@kiosk_status_bar_enabled',
  '@kiosk_status_bar_on_overlay',
  '@kiosk_status_bar_on_return',
  '@kiosk_status_bar_show_battery',
  '@kiosk_status_bar_show_wifi',
  '@kiosk_status_bar_show_bluetooth',
  '@kiosk_status_bar_show_volume',
  '@kiosk_status_bar_show_time',
  '@kiosk_external_app_test_mode',
  '@kiosk_back_button_mode',
  '@kiosk_back_button_timer_delay',
  '@kiosk_keyboard_mode',
  // PIN Mode
  '@kiosk_pin_mode',
  // URL Rotation
  '@kiosk_url_rotation_enabled',
  '@kiosk_url_rotation_list',
  '@kiosk_url_rotation_interval',
  // URL Planner
  '@kiosk_url_planner_enabled',
  '@kiosk_url_planner_events',
  // REST API
  '@kiosk_rest_api_enabled',
  '@kiosk_rest_api_port',
  // Note: @kiosk_rest_api_key is handled separately via Keychain (secure storage)
  '@kiosk_rest_api_allow_control',
  '@kiosk_allow_power_button',
  '@kiosk_allow_notifications',
  '@kiosk_allow_system_info',
  // Return to Settings
  '@kiosk_return_tap_count',
  '@kiosk_return_tap_timeout',
  '@kiosk_return_mode',
  '@kiosk_return_button_position',
  '@kiosk_volume_up_5tap_enabled',
  // Blocking Overlays
  '@kiosk_blocking_overlays_enabled',
  '@kiosk_blocking_overlays_regions',
  // Camera preference for motion detection
  '@motion_camera_position',
  // WebView Back Button
  '@kiosk_webview_back_button_enabled',
  '@kiosk_webview_back_button_x_percent',
  '@kiosk_webview_back_button_y_percent',
  // Auto-Brightness
  '@kiosk_auto_brightness_enabled',
  '@kiosk_auto_brightness_min',
  '@kiosk_auto_brightness_max',
  '@kiosk_auto_brightness_update_interval',
  '@kiosk_auto_brightness_saved_manual',
  // Screen Sleep Scheduler
  '@kiosk_screen_scheduler_enabled',
  '@kiosk_screen_scheduler_rules',
  '@kiosk_screen_scheduler_wake_on_touch',
  // Inactivity Return to Home
  '@kiosk_inactivity_return_enabled',
  '@kiosk_inactivity_return_delay',
  '@kiosk_inactivity_return_reset_on_nav',
  '@kiosk_inactivity_return_clear_cache',
  '@kiosk_inactivity_return_scroll_top',
  // URL Filtering (Blacklist/Whitelist)
  '@kiosk_url_filter_enabled',
  '@kiosk_url_filter_mode',
  '@kiosk_url_filter_list',
  '@kiosk_url_filter_show_feedback',
  // MQTT
  '@kiosk_mqtt_enabled',
  '@kiosk_mqtt_broker_url',
  '@kiosk_mqtt_port',
  '@kiosk_mqtt_username',
  '@kiosk_mqtt_client_id',
  '@kiosk_mqtt_base_topic',
  '@kiosk_mqtt_discovery_prefix',
  '@kiosk_mqtt_status_interval',
  '@kiosk_mqtt_allow_control',
  '@kiosk_mqtt_motion_always_on',
  // Note: MQTT password is handled separately via Keychain (secure storage)
  // Legacy keys
  '@screensaver_delay',
  '@motion_detection_enabled',
  '@motion_sensitivity',
  '@motion_delay',
];

export interface BackupData {
  version: string;
  exportDate: string;
  appVersion: string;
  settings: Record<string, any>;
  hasPinConfigured: boolean;
}

const BACKUP_VERSION = '1.0';
const APP_VERSION = '1.3.0';

/**
 * Request storage permissions on Android
 */
async function requestStoragePermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }

  try {
    // For Android 13+ (API 33+), we don't need READ/WRITE_EXTERNAL_STORAGE for app-specific directories
    // But for Downloads folder, we might need MANAGE_EXTERNAL_STORAGE or use SAF
    // Using app's cache/files directory is simpler and doesn't require special permissions
    
    // For older Android versions
    if (Platform.Version < 33) {
      const writeGranted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
        {
          title: 'Storage Permission',
          message: 'FreeKiosk needs storage access to save and load backup files.',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        }
      );
      
      const readGranted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
        {
          title: 'Storage Permission',
          message: 'FreeKiosk needs storage access to save and load backup files.',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        }
      );

      return (
        writeGranted === PermissionsAndroid.RESULTS.GRANTED &&
        readGranted === PermissionsAndroid.RESULTS.GRANTED
      );
    }
    
    return true;
  } catch (err) {
    console.error('Permission request error:', err);
    return false;
  }
}

/**
 * Get the backup directory path
 */
function getBackupDirectory(): string {
  // Use Downloads folder for easy access
  return RNFS.DownloadDirectoryPath;
}

/**
 * Generate backup filename with timestamp
 */
function generateBackupFilename(): string {
  const date = new Date();
  const timestamp = date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `freekiosk-backup-${timestamp}.json`;
}

/**
 * Export current configuration to a backup file
 */
export async function exportBackup(): Promise<{ success: boolean; filePath?: string; error?: string }> {
  try {
    // Request permissions
    const hasPermission = await requestStoragePermission();
    if (!hasPermission) {
      return { success: false, error: 'Storage permission denied' };
    }

    // Collect all settings
    const settings: Record<string, any> = {};
    
    for (const key of BACKUP_KEYS) {
      try {
        const value = await AsyncStorage.getItem(key);
        if (value !== null) {
          settings[key] = value;
        }
      } catch (e) {
        console.warn(`Failed to read key ${key}:`, e);
      }
    }

    // Get API key from secure storage (Keychain)
    try {
      const apiKey = await getSecureApiKey();
      if (apiKey) {
        settings['@kiosk_rest_api_key'] = apiKey;
      }
    } catch (e) {
      console.warn('Failed to read API key from secure storage:', e);
    }

    // Get MQTT password from secure storage (Keychain)
    try {
      const mqttPassword = await getSecureMqttPassword();
      if (mqttPassword) {
        settings['@kiosk_mqtt_password'] = mqttPassword;
      }
    } catch (e) {
      console.warn('Failed to read MQTT password from secure storage:', e);
    }

    // Check if PIN is configured (but don't export the PIN itself for security)
    const hasPinConfigured = await hasSecurePin();

    // Create backup data
    const backupData: BackupData = {
      version: BACKUP_VERSION,
      exportDate: new Date().toISOString(),
      appVersion: APP_VERSION,
      settings,
      hasPinConfigured,
    };

    // Generate file path
    const directory = getBackupDirectory();
    const filename = generateBackupFilename();
    const filePath = `${directory}/${filename}`;

    // Ensure directory exists
    const dirExists = await RNFS.exists(directory);
    if (!dirExists) {
      await RNFS.mkdir(directory);
    }

    // Write backup file
    const jsonContent = JSON.stringify(backupData, null, 2);
    await RNFS.writeFile(filePath, jsonContent, 'utf8');

    return { success: true, filePath };
  } catch (error) {
    console.error('Export backup error:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * List available backup files
 */
export async function listBackupFiles(): Promise<{ name: string; path: string; date: string }[]> {
  try {
    const hasPermission = await requestStoragePermission();
    if (!hasPermission) {
      return [];
    }

    const directory = getBackupDirectory();
    const exists = await RNFS.exists(directory);
    if (!exists) {
      return [];
    }

    const files = await RNFS.readDir(directory);
    const backupFiles = files
      .filter(file => file.name.startsWith('freekiosk-backup-') && file.name.endsWith('.json'))
      .map(file => ({
        name: file.name,
        path: file.path,
        date: file.mtime ? file.mtime.toISOString() : '',
      }))
      .sort((a, b) => b.date.localeCompare(a.date)); // Most recent first

    return backupFiles;
  } catch (error) {
    console.error('List backup files error:', error);
    return [];
  }
}

/**
 * Read and validate a backup file
 */
export async function readBackupFile(filePath: string): Promise<{ success: boolean; data?: BackupData; error?: string }> {
  try {
    const exists = await RNFS.exists(filePath);
    if (!exists) {
      return { success: false, error: 'Backup file not found' };
    }

    const content = await RNFS.readFile(filePath, 'utf8');
    const data = JSON.parse(content) as BackupData;

    // Validate backup structure
    if (!data.version || !data.settings || typeof data.settings !== 'object') {
      return { success: false, error: 'Invalid backup file format' };
    }

    return { success: true, data };
  } catch (error) {
    console.error('Read backup file error:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Import configuration from a backup file
 */
export async function importBackup(filePath: string): Promise<{ success: boolean; error?: string; warning?: string }> {
  try {
    // Read and validate backup
    const result = await readBackupFile(filePath);
    if (!result.success || !result.data) {
      return { success: false, error: result.error };
    }

    const backupData = result.data;
    let warning: string | undefined;

    // Check if backup had a PIN configured
    if (backupData.hasPinConfigured) {
      warning = 'Note: PIN code was not imported for security reasons. Please configure a new PIN.';
    }

    // Import settings
    const keys = Object.keys(backupData.settings);
    for (const key of keys) {
      try {
        const value = backupData.settings[key];
        if (value !== null && value !== undefined) {
          // Handle API key separately - save to secure storage (Keychain)
          if (key === '@kiosk_rest_api_key') {
            await saveSecureApiKey(value);
            console.log('[BackupService] API key imported to secure storage');
          } else if (key === '@kiosk_mqtt_password') {
            await saveSecureMqttPassword(value);
            console.log('[BackupService] MQTT password imported to secure storage');
          } else {
            await AsyncStorage.setItem(key, value);
          }
        }
      } catch (e) {
        console.warn(`Failed to import key ${key}:`, e);
      }
    }

    return { success: true, warning };
  } catch (error) {
    console.error('Import backup error:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Delete a backup file
 */
export async function deleteBackupFile(filePath: string): Promise<{ success: boolean; error?: string }> {
  try {
    const exists = await RNFS.exists(filePath);
    if (!exists) {
      return { success: false, error: 'File not found' };
    }

    await RNFS.unlink(filePath);
    return { success: true };
  } catch (error) {
    console.error('Delete backup file error:', error);
    return { success: false, error: String(error) };
  }
}

export default {
  exportBackup,
  importBackup,
  listBackupFiles,
  readBackupFile,
  deleteBackupFile,
};
