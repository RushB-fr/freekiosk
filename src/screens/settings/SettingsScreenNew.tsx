/**
 * FreeKiosk v1.2 - New Settings Screen
 * Material Design tabs with organized sections
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  NativeModules,
  Alert,
  Linking,
  FlatList,
  Modal,
  StyleSheet,
} from 'react-native';
import CookieManager from '@react-native-cookies/cookies';
import { Camera } from 'react-native-vision-camera';
import { StorageService } from '../../utils/storage';
import { saveSecurePin, hasSecurePin, clearSecurePin } from '../../utils/secureStorage';
import CertificateModuleTyped, { CertificateInfo } from '../../utils/CertificateModule';
import AppLauncherModule, { AppInfo } from '../../utils/AppLauncherModule';
import OverlayPermissionModule from '../../utils/OverlayPermissionModule';
import LauncherModule from '../../utils/LauncherModule';
import UpdateModule from '../../utils/UpdateModule';
import AutoBrightnessModule from '../../utils/AutoBrightnessModule';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/AppNavigator';

import { Colors, Spacing, Typography } from '../../theme';
import { settingsStyles } from './styles/settingsStyles';
import {
  GeneralTab,
  DisplayTab,
  SecurityTab,
  AdvancedTab,
} from './tabs';
import { RecurringEventEditor, OneTimeEventEditor } from '../../components/settings';
import { ScheduledEvent } from '../../types/planner';

const { KioskModule } = NativeModules;

type SettingsScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Settings'>;

interface SettingsScreenProps {
  navigation: SettingsScreenNavigationProp;
}

// Import Icon types
import Icon, { IconName, IconMap } from '../../components/Icon';

// Tab configuration
const TABS: { id: string; label: string; icon: IconName }[] = [
  { id: 'general', label: 'General', icon: 'home' },
  { id: 'display', label: 'Display', icon: 'monitor' },
  { id: 'security', label: 'Security', icon: 'shield-lock' },
  { id: 'advanced', label: 'Advanced', icon: 'cog' },
];

const SettingsScreenNew: React.FC<SettingsScreenProps> = ({ navigation }) => {
  // Active tab
  const [activeTab, setActiveTab] = useState('general');
  
  // All state from original SettingsScreen
  const [url, setUrl] = useState<string>('');
  const [pin, setPin] = useState<string>('');
  const [isPinConfigured, setIsPinConfigured] = useState<boolean>(false);
  const [pinMode, setPinMode] = useState<'numeric' | 'alphanumeric'>('numeric');
  const [initialPinMode, setInitialPinMode] = useState<'numeric' | 'alphanumeric'>('numeric');
  const [pinModeChanged, setPinModeChanged] = useState<boolean>(false);
  const [pinMaxAttempts, setPinMaxAttempts] = useState<number>(5);
  const [pinMaxAttemptsText, setPinMaxAttemptsText] = useState<string>('5');
  const [autoReload, setAutoReload] = useState<boolean>(false);
  const [kioskEnabled, setKioskEnabled] = useState<boolean>(false);
  const [autoLaunchEnabled, setAutoLaunchEnabled] = useState<boolean>(false);
  const [screensaverEnabled, setScreensaverEnabled] = useState<boolean>(false);
  const [inactivityDelay, setInactivityDelay] = useState<string>('10');
  const [motionEnabled, setMotionEnabled] = useState<boolean>(false);
  const [motionCameraPosition, setMotionCameraPosition] = useState<'front' | 'back'>('front');
  const [availableCameras, setAvailableCameras] = useState<Array<{position: 'front' | 'back', id: string}>>([]);
  const [screensaverBrightness, setScreensaverBrightness] = useState<number>(0);
  const [defaultBrightness, setDefaultBrightness] = useState<number>(0.5);
  const [certificates, setCertificates] = useState<CertificateInfo[]>([]);

  // External app states
  const [displayMode, setDisplayMode] = useState<'webview' | 'external_app'>('webview');
  const [externalAppPackage, setExternalAppPackage] = useState<string>('');
  const [autoRelaunchApp, setAutoRelaunchApp] = useState<boolean>(true);
  const [overlayButtonVisible, setOverlayButtonVisible] = useState<boolean>(false);
  const [backButtonMode, setBackButtonMode] = useState<string>('test');
  const [backButtonTimerDelay, setBackButtonTimerDelay] = useState<string>('10');
  const [installedApps, setInstalledApps] = useState<AppInfo[]>([]);
  const [showAppPicker, setShowAppPicker] = useState<boolean>(false);
  const [loadingApps, setLoadingApps] = useState<boolean>(false);
  const [hasOverlayPermission, setHasOverlayPermission] = useState<boolean>(false);
  const [isDeviceOwner, setIsDeviceOwner] = useState<boolean>(false);
  const [statusBarEnabled, setStatusBarEnabled] = useState<boolean>(false);
  const [statusBarOnOverlay, setStatusBarOnOverlay] = useState<boolean>(true);
  const [statusBarOnReturn, setStatusBarOnReturn] = useState<boolean>(true);
  const [showBattery, setShowBattery] = useState<boolean>(true);
  const [showWifi, setShowWifi] = useState<boolean>(true);
  const [showBluetooth, setShowBluetooth] = useState<boolean>(true);
  const [showVolume, setShowVolume] = useState<boolean>(true);
  const [showTime, setShowTime] = useState<boolean>(true);
  const [keyboardMode, setKeyboardMode] = useState<string>('default');
  const [allowPowerButton, setAllowPowerButton] = useState<boolean>(false);
  const [returnMode, setReturnMode] = useState<string>('tap_anywhere');
  const [returnTapCount, setReturnTapCount] = useState<string>('5');
  const [returnTapTimeout, setReturnTapTimeout] = useState<string>('1500');
  const [returnButtonPosition, setReturnButtonPosition] = useState<string>('bottom-right');
  const [volumeUp5TapEnabled, setVolumeUp5TapEnabled] = useState<boolean>(true);
  
  // URL Rotation states
  const [urlRotationEnabled, setUrlRotationEnabled] = useState<boolean>(false);
  const [urlRotationList, setUrlRotationList] = useState<string[]>([]);
  const [urlRotationInterval, setUrlRotationInterval] = useState<string>('30');
  
  // URL Planner states
  const [urlPlannerEnabled, setUrlPlannerEnabled] = useState<boolean>(false);
  const [urlPlannerEvents, setUrlPlannerEvents] = useState<any[]>([]);
  const [showRecurringEditor, setShowRecurringEditor] = useState<boolean>(false);
  const [showOneTimeEditor, setShowOneTimeEditor] = useState<boolean>(false);
  const [editingEvent, setEditingEvent] = useState<any | null>(null);
  
  // WebView Back Button states
  const [webViewBackButtonEnabled, setWebViewBackButtonEnabled] = useState<boolean>(false);
  const [webViewBackButtonXPercent, setWebViewBackButtonXPercent] = useState<string>('2');
  const [webViewBackButtonYPercent, setWebViewBackButtonYPercent] = useState<string>('10');
  
  // Auto-Brightness states
  const [autoBrightnessEnabled, setAutoBrightnessEnabled] = useState<boolean>(false);
  const [autoBrightnessMin, setAutoBrightnessMin] = useState<number>(0.1);
  const [autoBrightnessMax, setAutoBrightnessMax] = useState<number>(1.0);
  const [currentLightLevel, setCurrentLightLevel] = useState<number>(0);
  const [hasLightSensor, setHasLightSensor] = useState<boolean>(true);
  
  // Update states
  const [checkingUpdate, setCheckingUpdate] = useState<boolean>(false);
  const [updateAvailable, setUpdateAvailable] = useState<boolean>(false);
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [downloading, setDownloading] = useState<boolean>(false);
  const [currentVersion, setCurrentVersion] = useState<string>('');

  useEffect(() => {
    loadSettings();
    loadCertificates();
    checkOverlayPermission();
    checkDeviceOwner();
    loadCurrentVersion();
    checkLightSensor();
  }, []);

  // ============ LOAD FUNCTIONS ============
  
  const checkLightSensor = async () => {
    try {
      const sensorAvailable = await AutoBrightnessModule.hasLightSensor();
      setHasLightSensor(sensorAvailable);
      
      // Get current light level for display
      if (sensorAvailable) {
        const lightInfo = await AutoBrightnessModule.getCurrentLightLevel();
        setCurrentLightLevel(lightInfo.lux);
      }
    } catch (error) {
      console.error('[Settings] Error checking light sensor:', error);
      setHasLightSensor(false);
    }
  };
  
  const loadCurrentVersion = async () => {
    try {
      const versionInfo = await UpdateModule.getCurrentVersion();
      setCurrentVersion(versionInfo.versionName);
    } catch (error) {
      console.error('Failed to load current version:', error);
    }
  };

  const checkDeviceOwner = async () => {
    try {
      const isOwner = await KioskModule.isDeviceOwner();
      setIsDeviceOwner(isOwner);
    } catch (error) {
      setIsDeviceOwner(false);
    }
  };

  const checkOverlayPermission = async () => {
    try {
      const canDraw = await OverlayPermissionModule.canDrawOverlays();
      setHasOverlayPermission(canDraw);
    } catch (error) {
      // Silent fail
    }
  };

  const loadSettings = async (): Promise<void> => {
    const savedUrl = await StorageService.getUrl();
    const savedAutoReload = await StorageService.getAutoReload();
    const savedKioskEnabled = await StorageService.getKioskEnabled();
    const savedAutoLaunch = await StorageService.getAutoLaunch();
    const savedScreensaverEnabled = await StorageService.getScreensaverEnabled();
    const savedDefaultBrightness = await StorageService.getDefaultBrightness();
    const savedInactivityDelay = await StorageService.getScreensaverInactivityDelay();
    const savedMotionEnabled = await StorageService.getScreensaverMotionEnabled();
    const savedMotionCameraPosition = await StorageService.getMotionCameraPosition();
    const savedScreensaverBrightness = await StorageService.getScreensaverBrightness();
    const hasPinConfigured = await hasSecurePin();
    
    setIsPinConfigured(hasPinConfigured);
    if (savedUrl) setUrl(savedUrl);
    if (hasPinConfigured) setPin('');

    setAutoReload(savedAutoReload);
    setKioskEnabled(savedKioskEnabled);
    setAutoLaunchEnabled(savedAutoLaunch ?? false);
    setScreensaverEnabled(savedScreensaverEnabled ?? false);
    setDefaultBrightness(savedDefaultBrightness ?? 0.5);
    setMotionEnabled(savedMotionEnabled ?? false);
    setMotionCameraPosition(savedMotionCameraPosition ?? 'front');
    setScreensaverBrightness(savedScreensaverBrightness ?? 0);

    // Detect available cameras
    try {
      const devices = await Camera.getAvailableCameraDevices();
      const cameras = devices
        .filter(d => d.position === 'front' || d.position === 'back')
        .map(d => ({ position: d.position as 'front' | 'back', id: d.id }));
      setAvailableCameras(cameras);
      console.log('[Settings] Available cameras:', cameras);
    } catch (error) {
      console.error('[Settings] Error detecting cameras:', error);
      setAvailableCameras([]);
    }

    if (savedInactivityDelay && !isNaN(savedInactivityDelay)) {
      setInactivityDelay(String(Math.floor(savedInactivityDelay / 60000)));
    } else {
      setInactivityDelay('10');
    }

    // External app settings
    const savedDisplayMode = await StorageService.getDisplayMode();
    const savedExternalAppPackage = await StorageService.getExternalAppPackage();
    const savedAutoRelaunchApp = await StorageService.getAutoRelaunchApp();
    const savedOverlayButtonVisible = await StorageService.getOverlayButtonVisible();
    const savedPinMaxAttempts = await StorageService.getPinMaxAttempts();
    const savedStatusBarEnabled = await StorageService.getStatusBarEnabled();
    const savedStatusBarOnOverlay = await StorageService.getStatusBarOnOverlay();
    const savedStatusBarOnReturn = await StorageService.getStatusBarOnReturn();
    const savedShowBattery = await StorageService.getStatusBarShowBattery();
    const savedShowWifi = await StorageService.getStatusBarShowWifi();
    const savedShowBluetooth = await StorageService.getStatusBarShowBluetooth();
    const savedShowVolume = await StorageService.getStatusBarShowVolume();
    const savedShowTime = await StorageService.getStatusBarShowTime();
    const savedBackButtonMode = await StorageService.getBackButtonMode();
    const savedBackButtonTimerDelay = await StorageService.getBackButtonTimerDelay();
    const savedKeyboardMode = await StorageService.getKeyboardMode();
    const savedAllowPowerButton = await StorageService.getAllowPowerButton();
    const savedReturnMode = await StorageService.getReturnMode();
    const savedReturnTapCount = await StorageService.getReturnTapCount();
    const savedReturnTapTimeout = await StorageService.getReturnTapTimeout();
    const savedReturnButtonPosition = await StorageService.getReturnButtonPosition();
    const savedVolumeUp5TapEnabled = await StorageService.getVolumeUp5TapEnabled();
    
    // URL Rotation settings
    const savedUrlRotationEnabled = await StorageService.getUrlRotationEnabled();
    const savedUrlRotationList = await StorageService.getUrlRotationList();
    const savedUrlRotationInterval = await StorageService.getUrlRotationInterval();
    
    // URL Planner settings
    const savedUrlPlannerEnabled = await StorageService.getUrlPlannerEnabled();
    const savedUrlPlannerEvents = await StorageService.getUrlPlannerEvents();

    // WebView Back Button settings
    const savedWebViewBackButtonEnabled = await StorageService.getWebViewBackButtonEnabled();
    const savedWebViewBackButtonXPercent = await StorageService.getWebViewBackButtonXPercent();
    const savedWebViewBackButtonYPercent = await StorageService.getWebViewBackButtonYPercent();
    
    // Auto-Brightness settings
    const savedAutoBrightnessEnabled = await StorageService.getAutoBrightnessEnabled();
    const savedAutoBrightnessMin = await StorageService.getAutoBrightnessMin();
    const savedAutoBrightnessMax = await StorageService.getAutoBrightnessMax();

    setDisplayMode(savedDisplayMode);
    setExternalAppPackage(savedExternalAppPackage ?? '');
    setAutoRelaunchApp(savedAutoRelaunchApp);
    setOverlayButtonVisible(savedOverlayButtonVisible);
    setPinMaxAttempts(savedPinMaxAttempts);
    setPinMaxAttemptsText(String(savedPinMaxAttempts));
    const savedPinMode = await StorageService.getPinMode();
    setPinMode(savedPinMode);
    setInitialPinMode(savedPinMode);
    setPinModeChanged(false);
    setStatusBarEnabled(savedStatusBarEnabled);
    setStatusBarOnOverlay(savedStatusBarOnOverlay);
    setStatusBarOnReturn(savedStatusBarOnReturn);
    setShowBattery(savedShowBattery);
    setShowWifi(savedShowWifi);
    setShowBluetooth(savedShowBluetooth);
    setShowVolume(savedShowVolume);
    setShowTime(savedShowTime);
    setBackButtonMode(savedBackButtonMode);
    setBackButtonTimerDelay(String(savedBackButtonTimerDelay));
    setKeyboardMode(savedKeyboardMode);
    setAllowPowerButton(savedAllowPowerButton);
    setReturnMode(savedReturnMode);
    setReturnTapCount(String(savedReturnTapCount));
    setReturnTapTimeout(String(savedReturnTapTimeout));
    setReturnButtonPosition(savedReturnButtonPosition);
    setVolumeUp5TapEnabled(savedVolumeUp5TapEnabled);
    setUrlRotationEnabled(savedUrlRotationEnabled);
    setUrlRotationList(savedUrlRotationList);
    setUrlRotationInterval(String(savedUrlRotationInterval));
    setUrlPlannerEnabled(savedUrlPlannerEnabled);
    setUrlPlannerEvents(savedUrlPlannerEvents);
    setWebViewBackButtonEnabled(savedWebViewBackButtonEnabled);
    setWebViewBackButtonXPercent(String(savedWebViewBackButtonXPercent));
    setWebViewBackButtonYPercent(String(savedWebViewBackButtonYPercent));
    setAutoBrightnessEnabled(savedAutoBrightnessEnabled);
    setAutoBrightnessMin(savedAutoBrightnessMin);
    setAutoBrightnessMax(savedAutoBrightnessMax);
  };

  const loadCertificates = async (): Promise<void> => {
    try {
      const certs = await CertificateModuleTyped.getAcceptedCertificates();
      setCertificates(certs);
    } catch (error) {
      // Silent fail
    }
  };

  // ============ HANDLER FUNCTIONS ============

  const requestOverlayPermission = async () => {
    try {
      await OverlayPermissionModule.requestOverlayPermission();
      setTimeout(() => checkOverlayPermission(), 1000);
    } catch (error) {
      console.error('Error requesting overlay permission:', error);
    }
  };

  const handleDisplayModeChange = async (newMode: 'webview' | 'external_app') => {
    try {
      setDisplayMode(newMode);
      if (newMode === 'external_app') {
        await LauncherModule.enableHomeLauncher();
      } else {
        await LauncherModule.disableHomeLauncher();
      }
    } catch (error) {
      console.error('Error changing display mode:', error);
    }
  };

  const loadInstalledApps = async (): Promise<void> => {
    try {
      setLoadingApps(true);
      const apps = await AppLauncherModule.getInstalledApps();
      setInstalledApps(apps);
      setShowAppPicker(true);
    } catch (error) {
      Alert.alert('Error', `Unable to load apps: ${error}`);
    } finally {
      setLoadingApps(false);
    }
  };

  const selectApp = (app: AppInfo): void => {
    setExternalAppPackage(app.packageName);
    setShowAppPicker(false);
  };

  const toggleAutoLaunch = async (value: boolean) => {
    setAutoLaunchEnabled(value);
    // On sauvegarde uniquement dans SharedPreferences
    // Le BootReceiver lit directement cette valeur au boot
    // Plus besoin de enable/disable le composant via PackageManager
    await StorageService.saveAutoLaunch(value);
  };

  const toggleMotionDetection = async (value: boolean) => {
    if (value) {
      // Check if cameras are available (use already detected list)
      if (availableCameras.length === 0) {
        Alert.alert(
          'No Camera Available',
          'Your device does not have any cameras available. This could be because:\n\n• Cameras are disabled in your ROM/system\n• Hardware issue\n\nYou can use the REST API with an external motion sensor instead.',
          [{ text: 'OK' }]
        );
        return;
      }

      const permission = await Camera.requestCameraPermission();
      if (permission === 'denied') {
        Alert.alert(
          'Camera Permission Required',
          'Camera access is needed for motion detection.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() }
          ]
        );
        return;
      }
      if (permission === 'granted') {
        setMotionEnabled(true);
      }
    } else {
      setMotionEnabled(false);
    }
  };

  const handleMotionCameraPositionChange = async (value: 'front' | 'back') => {
    setMotionCameraPosition(value);
    await StorageService.saveMotionCameraPosition(value);
  };

  const handleOverlayButtonVisibleChange = async (value: boolean) => {
    setOverlayButtonVisible(value);
    if (displayMode === 'external_app') {
      const opacity = value ? 1.0 : 0.0;
      try {
        const { OverlayServiceModule } = NativeModules;
        await OverlayServiceModule.setButtonOpacity(opacity);
      } catch (error) {
        // Silent fail
      }
    }
  };

  const handleStatusBarEnabledChange = async (value: boolean) => {
    setStatusBarEnabled(value);
    if (displayMode === 'external_app') {
      try {
        const { OverlayServiceModule } = NativeModules;
        await OverlayServiceModule.setStatusBarEnabled(value && statusBarOnOverlay);
      } catch (error) {
        // Silent fail
      }
    }
  };

  const handleStatusBarOnOverlayChange = async (value: boolean) => {
    setStatusBarOnOverlay(value);
    if (displayMode === 'external_app' && statusBarEnabled) {
      try {
        const { OverlayServiceModule } = NativeModules;
        await OverlayServiceModule.setStatusBarEnabled(value);
      } catch (error) {
        // Silent fail
      }
    }
  };

  // Handle auto-brightness toggle with save/restore of manual brightness
  const handleAutoBrightnessToggle = async (enabled: boolean) => {
    if (enabled) {
      // Save current manual brightness before enabling auto
      await StorageService.saveAutoBrightnessSavedManual(defaultBrightness);
      setAutoBrightnessEnabled(true);
    } else {
      // Restore saved manual brightness when disabling auto
      setAutoBrightnessEnabled(false);
      const savedManual = await StorageService.getAutoBrightnessSavedManual();
      if (savedManual !== null) {
        setDefaultBrightness(savedManual);
      }
    }
  };

  // ============ UPDATE FUNCTIONS ============

  /**
   * Compare semantic versions (e.g., "1.1.4" vs "1.2.2")
   * Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal
   */
  const compareVersions = (v1: string, v2: string): number => {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const num1 = parts1[i] || 0;
      const num2 = parts2[i] || 0;
      
      if (num1 > num2) return 1;
      if (num1 < num2) return -1;
    }
    
    return 0;
  };

  const handleCheckForUpdates = async () => {
    setCheckingUpdate(true);
    setUpdateAvailable(false);
    setUpdateInfo(null);
    
    try {
      const currentVersionInfo = await UpdateModule.getCurrentVersion();
      const latestUpdate = await UpdateModule.checkForUpdates();
      const currentVer = currentVersionInfo.versionName;
      const latestVer = latestUpdate.version;
      
      console.log(`Version comparison: current=${currentVer}, latest=${latestVer}`);
      
      // Use semantic version comparison instead of simple string equality
      const versionComparison = compareVersions(latestVer, currentVer);
      
      if (versionComparison > 0) {
        // Latest version is newer than current
        setUpdateAvailable(true);
        setUpdateInfo(latestUpdate);
        Alert.alert(
          '🎉 Update Available',
          `New version ${latestVer} available!\n\nCurrent: ${currentVer}\n\nDo you want to download and install it?`,
          [
            { text: 'Later', style: 'cancel' },
            { text: 'Update', onPress: () => handleDownloadUpdate(latestUpdate) }
          ]
        );
      } else {
        Alert.alert('✓ Up to Date', `You are using the latest version (${currentVer})`);
      }
    } catch (error: any) {
      Alert.alert('Error', `Unable to check for updates: ${error.message || error.toString()}`);
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleDownloadUpdate = async (update?: any) => {
    const updateData = update || updateInfo;
    
    if (!updateData || !updateData.downloadUrl) {
      Alert.alert('Error', 'Download URL not available.');
      return;
    }
    
    setDownloading(true);
    
    try {
      await UpdateModule.downloadAndInstall(updateData.downloadUrl, updateData.version);
      setDownloading(false);
      Alert.alert('✅ Download Complete', 'The update has been downloaded. Installation in progress...');
    } catch (error: any) {
      setDownloading(false);
      Alert.alert('Error', `Download failed:\n\n${error?.message || error?.toString() || 'Unknown error'}`);
    }
  };

  // ============ SAVE FUNCTION ============

  const handleSave = async (): Promise<void> => {
    // Validation
    if (displayMode === 'webview' && !url) {
      Alert.alert('Error', 'Please enter a URL');
      return;
    }

    if (displayMode === 'external_app') {
      if (!externalAppPackage) {
        Alert.alert('Error', 'Please enter a package name or select an app');
        return;
      }
      // Android package names can contain uppercase letters (e.g., com.JoonAppInc.JoonKids)
      const regex = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;
      if (!regex.test(externalAppPackage)) {
        Alert.alert('Error', 'Invalid package name format (e.g., com.example.app)');
        return;
      }
      try {
        const isInstalled = await AppLauncherModule.isAppInstalled(externalAppPackage);
        if (!isInstalled) {
          Alert.alert('Error', `App not installed: ${externalAppPackage}`);
          return;
        }
      } catch (error) {
        Alert.alert('Error', `Unable to verify app: ${error}`);
        return;
      }
    }

    // URL validation for webview
    let finalUrl = url.trim();
    if (displayMode === 'webview') {
      const urlLower = finalUrl.toLowerCase();
      if (urlLower.startsWith('file://') || urlLower.startsWith('javascript:') || urlLower.startsWith('data:')) {
        Alert.alert('Security Error', 'This type of URL is not allowed. Use http:// or https://');
        return;
      }
      if (!urlLower.startsWith('http://') && !urlLower.startsWith('https://')) {
        if (finalUrl.includes('.')) {
          finalUrl = 'https://' + finalUrl;
          setUrl(finalUrl);
          Alert.alert('URL Updated', `https:// added to your URL:\n\n${finalUrl}\n\nClick Save again to confirm.`);
          return;
        } else {
          Alert.alert('Invalid URL', 'Please enter a valid URL (e.g., example.com or https://example.com)');
          return;
        }
      }
    }

    // PIN validation
    // If mode changed, a new password is REQUIRED
    if (pinModeChanged && !pin) {
      Alert.alert('Error', 'Password mode changed - you must enter a new password');
      return;
    }
    
    if (pin && pin.length > 0) {
      if (pin.length < 4) {
        Alert.alert('Error', 'Password must be at least 4 characters');
        return;
      }
      if (pinMode === 'numeric' && !/^\d+$/.test(pin)) {
        Alert.alert('Error', 'In numeric PIN mode, only digits (0-9) are allowed. Enable "Advanced Password Mode" to use letters and special characters.');
        return;
      }
      if (pinMode === 'numeric' && pin.length > 6) {
        Alert.alert('Error', 'Numeric PIN must be 4-6 digits. Enable "Advanced Password Mode" for longer passwords.');
        return;
      }
    } else if (!isPinConfigured && !pin) {
      Alert.alert('Error', 'Please enter a password');
      return;
    }

    // Inactivity delay validation
    const inactivityDelayNumber = parseInt(inactivityDelay, 10);
    if (isNaN(inactivityDelayNumber) || inactivityDelayNumber <= 0) {
      Alert.alert('Error', 'Please enter a valid inactivity delay');
      return;
    }

    // PIN max attempts validation
    const pinMaxAttemptsNumber = parseInt(pinMaxAttemptsText, 10);
    if (isNaN(pinMaxAttemptsNumber) || pinMaxAttemptsNumber < 1 || pinMaxAttemptsNumber > 100) {
      Alert.alert('Error', 'PIN attempts must be between 1 and 100');
      return;
    }
    setPinMaxAttempts(pinMaxAttemptsNumber);

    // Save all settings
    if (displayMode === 'webview') {
      await StorageService.saveUrl(finalUrl);
    }

    if (pin && pin.length >= 4) {
      await saveSecurePin(pin);
      await StorageService.savePin('');
      setIsPinConfigured(true);
      // Reset mode change tracking after successful password save
      setInitialPinMode(pinMode);
      setPinModeChanged(false);
    }

    await StorageService.savePinMaxAttempts(pinMaxAttemptsNumber);
    await StorageService.savePinMode(pinMode);

    if (displayMode === 'webview') {
      await StorageService.saveAutoReload(autoReload);
      await StorageService.saveKioskEnabled(kioskEnabled);
      await StorageService.saveScreensaverEnabled(screensaverEnabled);
      await StorageService.saveDefaultBrightness(defaultBrightness);
      await StorageService.saveScreensaverInactivityEnabled(true);
      await StorageService.saveScreensaverInactivityDelay(inactivityDelayNumber * 60000);
      await StorageService.saveScreensaverMotionEnabled(motionEnabled);
      await StorageService.saveScreensaverBrightness(screensaverBrightness);
      
      // Auto-brightness settings
      await StorageService.saveAutoBrightnessEnabled(autoBrightnessEnabled);
      await StorageService.saveAutoBrightnessMin(autoBrightnessMin);
      await StorageService.saveAutoBrightnessMax(autoBrightnessMax);
    } else {
      await StorageService.saveAutoReload(false);
      await StorageService.saveKioskEnabled(kioskEnabled);
      await StorageService.saveScreensaverEnabled(false);
      await StorageService.saveAutoBrightnessEnabled(false);
    }

    await StorageService.saveAutoLaunch(autoLaunchEnabled);
    await StorageService.saveDisplayMode(displayMode);
    await StorageService.saveExternalAppPackage(externalAppPackage);
    await StorageService.saveAutoRelaunchApp(autoRelaunchApp);
    await StorageService.saveOverlayButtonVisible(overlayButtonVisible);
    await StorageService.saveStatusBarEnabled(statusBarEnabled);
    await StorageService.saveStatusBarOnOverlay(statusBarOnOverlay);
    await StorageService.saveStatusBarOnReturn(statusBarOnReturn);
    await StorageService.saveStatusBarShowBattery(showBattery);
    await StorageService.saveStatusBarShowWifi(showWifi);
    await StorageService.saveStatusBarShowBluetooth(showBluetooth);
    await StorageService.saveStatusBarShowVolume(showVolume);
    await StorageService.saveStatusBarShowTime(showTime);
    await StorageService.saveBackButtonMode(backButtonMode);
    const timerDelay = parseInt(backButtonTimerDelay, 10);
    await StorageService.saveBackButtonTimerDelay(isNaN(timerDelay) ? 10 : Math.max(1, Math.min(3600, timerDelay)));
    await StorageService.saveKeyboardMode(keyboardMode);
    await StorageService.saveAllowPowerButton(allowPowerButton);
    await StorageService.saveReturnMode(returnMode);
    const tapCount = parseInt(returnTapCount, 10);
    await StorageService.saveReturnTapCount(isNaN(tapCount) ? 5 : Math.max(2, Math.min(20, tapCount)));
    const tapTimeout = parseInt(returnTapTimeout, 10);
    await StorageService.saveReturnTapTimeout(isNaN(tapTimeout) ? 1500 : Math.max(500, Math.min(5000, tapTimeout)));
    await StorageService.saveReturnButtonPosition(returnButtonPosition);
    await StorageService.saveVolumeUp5TapEnabled(volumeUp5TapEnabled);
    
    // Save URL Rotation settings (webview only)
    if (displayMode === 'webview') {
      await StorageService.saveUrlRotationEnabled(urlRotationEnabled);
      await StorageService.saveUrlRotationList(urlRotationList);
      const rotationInterval = parseInt(urlRotationInterval, 10);
      await StorageService.saveUrlRotationInterval(isNaN(rotationInterval) ? 30 : Math.max(5, rotationInterval));
      
      // Save URL Planner settings
      await StorageService.saveUrlPlannerEnabled(urlPlannerEnabled);
      await StorageService.saveUrlPlannerEvents(urlPlannerEvents);
      
      // Save WebView Back Button settings
      await StorageService.saveWebViewBackButtonEnabled(webViewBackButtonEnabled);
      const xPercent = parseFloat(webViewBackButtonXPercent);
      const yPercent = parseFloat(webViewBackButtonYPercent);
      await StorageService.saveWebViewBackButtonXPercent(isNaN(xPercent) ? 2 : Math.max(0, Math.min(100, xPercent)));
      await StorageService.saveWebViewBackButtonYPercent(isNaN(yPercent) ? 10 : Math.max(0, Math.min(100, yPercent)));
    } else {
      await StorageService.saveUrlRotationEnabled(false);
      await StorageService.saveUrlPlannerEnabled(false);
      await StorageService.saveWebViewBackButtonEnabled(false);
    }

    // Update overlay settings
    if (displayMode === 'external_app') {
      const opacity = overlayButtonVisible ? 1.0 : 0.0;
      try {
        const { OverlayServiceModule } = NativeModules;
        await OverlayServiceModule.setButtonOpacity(opacity);
        await OverlayServiceModule.setTestMode(backButtonMode === 'test');
        await OverlayServiceModule.setStatusBarEnabled(statusBarEnabled && statusBarOnOverlay);
        await OverlayServiceModule.setStatusBarItems(showBattery, showWifi, showBluetooth, showVolume, showTime);
        
        // Restart OverlayService with new settings
        const finalTapCount = isNaN(tapCount) ? 5 : Math.max(2, Math.min(20, tapCount));
        const finalTapTimeout = isNaN(tapTimeout) ? 1500 : Math.max(500, Math.min(5000, tapTimeout));
        await OverlayServiceModule.stopOverlayService();
        await OverlayServiceModule.startOverlayService(
          finalTapCount, 
          finalTapTimeout, 
          returnMode, 
          returnButtonPosition,
          externalAppPackage,
          autoRelaunchApp
        );
      } catch (error) {
        // Silent fail
      }
    }

    // Start/stop lock task
    if (kioskEnabled) {
      try {
        const packageToWhitelist = displayMode === 'external_app' ? externalAppPackage : null;
        await KioskModule.startLockTask(packageToWhitelist, allowPowerButton);
        const message = displayMode === 'external_app'
          ? 'Configuration saved\nLock mode enabled'
          : 'Configuration saved\nScreen pinning enabled';
        Alert.alert('Success', message, [
          { text: 'OK', onPress: () => navigation.navigate('Kiosk') },
        ]);
      } catch (error) {
        Alert.alert('Warning', 'Configuration saved\nDevice Owner not configured - lock mode unavailable', [
          { text: 'OK', onPress: () => navigation.navigate('Kiosk') },
        ]);
      }
    } else {
      try {
        await KioskModule.stopLockTask();
      } catch (error) {
        // Silent fail
      }
      const message = displayMode === 'external_app'
        ? 'Configuration saved\nExternal app will launch automatically'
        : 'Configuration saved\nScreen pinning disabled';
      Alert.alert('Success', message, [
        { text: 'OK', onPress: () => navigation.navigate('Kiosk') },
      ]);
    }
  };

  // ============ RESET / EXIT FUNCTIONS ============

  const handleResetSettings = async (): Promise<void> => {
    Alert.alert(
      'Reset',
      'This will erase all settings and restart the app with default values.\n\nContinue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              // Stop auto-brightness if running
              try {
                await AutoBrightnessModule.stopAutoBrightness();
              } catch {}
              
              await StorageService.clearAll();
              await CertificateModuleTyped.clearAcceptedCertificates();
              await clearSecurePin();
              await CookieManager.clearAll();

              // Reset all state
              setUrl('');
              setPin('');
              setIsPinConfigured(false);
              setPinMode('numeric');
              setInitialPinMode('numeric');
              setPinModeChanged(false);
              setPinMaxAttempts(5);
              setPinMaxAttemptsText('5');
              setAutoReload(false);
              setKioskEnabled(false);
              setAutoLaunchEnabled(false);
              setScreensaverEnabled(false);
              setInactivityDelay('10');
              setMotionEnabled(false);
              setScreensaverBrightness(0);
              setDefaultBrightness(0.5);
              setCertificates([]);
              setDisplayMode('webview');
              setExternalAppPackage('');
              setAutoRelaunchApp(true);
              setOverlayButtonVisible(false);
              setStatusBarEnabled(false);
              setStatusBarOnOverlay(true);
              setStatusBarOnReturn(true);
              setReturnMode('tap_anywhere');
              setReturnTapCount('5');
              setReturnTapTimeout('1500');
              setReturnButtonPosition('bottom-right');
              
              // Reset auto-brightness state
              setAutoBrightnessEnabled(false);
              setAutoBrightnessMin(0.1);
              setAutoBrightnessMax(1.0);

              try {
                await KioskModule.stopLockTask();
              } catch {}

              Alert.alert('Success', 'Settings reset!\nPlease reconfigure the app.', [
                { text: 'OK', onPress: () => navigation.navigate('Kiosk') },
              ]);
            } catch (error) {
              Alert.alert('Error', `Reset failed: ${error}`);
            }
          },
        },
      ],
    );
  };

  const handleExitKioskMode = async (): Promise<void> => {
    Alert.alert(
      'Exit Kiosk Mode',
      'Are you sure you want to exit kiosk mode?\n\nThis will close the application.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Exit',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await KioskModule.exitKioskMode();
              if (!result) {
                Alert.alert('Info', 'Kiosk mode disabled');
              }
            } catch (error) {
              Alert.alert('Error', `Unable to exit: ${error}`);
            }
          },
        },
      ],
    );
  };

  const handleRemoveDeviceOwner = async (): Promise<void> => {
    Alert.alert(
      '⚠️ Remove Device Owner',
      'WARNING: This will remove Device Owner privileges.\n\n' +
      'You will lose:\n' +
      '• Full kiosk mode\n' +
      '• Navigation blocking\n' +
      '• Lock protection\n\n' +
      'All settings will be reset.\n\nContinue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              try {
                await KioskModule.stopLockTask();
              } catch {}

              await KioskModule.removeDeviceOwner();
              await StorageService.clearAll();
              await CertificateModuleTyped.clearAcceptedCertificates();
              await clearSecurePin();
              await CookieManager.clearAll();

              setIsDeviceOwner(false);
              // Reset all state...
              
              Alert.alert(
                'Success',
                'Device Owner removed!\n\nYou can now uninstall FreeKiosk normally.',
                [{ text: 'OK', onPress: () => navigation.navigate('Kiosk') }]
              );
            } catch (error: any) {
              Alert.alert('Error', `Failed: ${error.message || error}`);
            }
          },
        },
      ],
    );
  };

  const handleRemoveCertificate = async (fingerprint: string, url: string): Promise<void> => {
    Alert.alert(
      'Remove Certificate',
      `Remove the accepted certificate for:\n\n${url}\n\nYou will need to accept it again on your next visit.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await CertificateModuleTyped.removeCertificate(fingerprint);
              await loadCertificates();
              Alert.alert('Success', 'Certificate removed');
            } catch (error) {
              Alert.alert('Error', `Failed: ${error}`);
            }
          },
        },
      ],
    );
  };

  // ============ RENDER ============

  const renderTab = () => {
    switch (activeTab) {
      case 'general':
        return (
          <GeneralTab
            displayMode={displayMode}
            onDisplayModeChange={handleDisplayModeChange}
            url={url}
            onUrlChange={setUrl}
            externalAppPackage={externalAppPackage}
            onExternalAppPackageChange={setExternalAppPackage}
            onPickApp={loadInstalledApps}
            loadingApps={loadingApps}
            hasOverlayPermission={hasOverlayPermission}
            onRequestOverlayPermission={requestOverlayPermission}
            isDeviceOwner={isDeviceOwner}
            pin={pin}
            onPinChange={setPin}
            isPinConfigured={isPinConfigured}
            pinModeChanged={pinModeChanged}
            pinMode={pinMode}
            onPinModeChange={(newMode) => {
              setPinMode(newMode);
              // Track if mode changed from initial
              setPinModeChanged(newMode !== initialPinMode);
              // Clear password when mode changes
              setPin('');
            }}
            pinMaxAttemptsText={pinMaxAttemptsText}
            onPinMaxAttemptsChange={setPinMaxAttemptsText}
            onPinMaxAttemptsBlur={() => {
              const num = parseInt(pinMaxAttemptsText, 10);
              if (!isNaN(num) && num >= 1 && num <= 100) {
                setPinMaxAttempts(num);
              } else {
                setPinMaxAttemptsText(String(pinMaxAttempts));
              }
            }}
            autoReload={autoReload}
            onAutoReloadChange={setAutoReload}
            urlRotationEnabled={urlRotationEnabled}
            onUrlRotationEnabledChange={setUrlRotationEnabled}
            urlRotationList={urlRotationList}
            onUrlRotationListChange={setUrlRotationList}
            urlRotationInterval={urlRotationInterval}
            onUrlRotationIntervalChange={setUrlRotationInterval}
            urlPlannerEnabled={urlPlannerEnabled}
            onUrlPlannerEnabledChange={setUrlPlannerEnabled}
            urlPlannerEvents={urlPlannerEvents}
            onUrlPlannerEventsChange={setUrlPlannerEvents}
            onAddRecurringEvent={() => {
              setEditingEvent(null);
              setShowRecurringEditor(true);
            }}
            onAddOneTimeEvent={() => {
              setEditingEvent(null);
              setShowOneTimeEditor(true);
            }}
            onEditEvent={(event: ScheduledEvent) => {
              setEditingEvent(event);
              if (event.type === 'recurring') {
                setShowRecurringEditor(true);
              } else {
                setShowOneTimeEditor(true);
              }
            }}
            webViewBackButtonEnabled={webViewBackButtonEnabled}
            onWebViewBackButtonEnabledChange={setWebViewBackButtonEnabled}
            webViewBackButtonXPercent={webViewBackButtonXPercent}
            onWebViewBackButtonXPercentChange={setWebViewBackButtonXPercent}
            webViewBackButtonYPercent={webViewBackButtonYPercent}
            onWebViewBackButtonYPercentChange={setWebViewBackButtonYPercent}
            onResetWebViewBackButtonPosition={() => {
              setWebViewBackButtonXPercent('2');
              setWebViewBackButtonYPercent('10');
            }}
            onBackToKiosk={() => navigation.navigate('Kiosk')}
          />
        );
      
      case 'display':
        return (
          <DisplayTab
            displayMode={displayMode}
            defaultBrightness={defaultBrightness}
            onDefaultBrightnessChange={setDefaultBrightness}
            autoBrightnessEnabled={autoBrightnessEnabled}
            onAutoBrightnessEnabledChange={handleAutoBrightnessToggle}
            autoBrightnessMin={autoBrightnessMin}
            onAutoBrightnessMinChange={setAutoBrightnessMin}
            autoBrightnessMax={autoBrightnessMax}
            onAutoBrightnessMaxChange={setAutoBrightnessMax}
            currentLightLevel={currentLightLevel}
            hasLightSensor={hasLightSensor}
            statusBarEnabled={statusBarEnabled}
            onStatusBarEnabledChange={handleStatusBarEnabledChange}
            statusBarOnOverlay={statusBarOnOverlay}
            onStatusBarOnOverlayChange={handleStatusBarOnOverlayChange}
            statusBarOnReturn={statusBarOnReturn}
            onStatusBarOnReturnChange={setStatusBarOnReturn}
            showBattery={showBattery}
            onShowBatteryChange={setShowBattery}
            showWifi={showWifi}
            onShowWifiChange={setShowWifi}
            showBluetooth={showBluetooth}
            onShowBluetoothChange={setShowBluetooth}
            showVolume={showVolume}
            onShowVolumeChange={setShowVolume}
            showTime={showTime}
            onShowTimeChange={setShowTime}
            keyboardMode={keyboardMode}
            onKeyboardModeChange={setKeyboardMode}
            screensaverEnabled={screensaverEnabled}
            onScreensaverEnabledChange={setScreensaverEnabled}
            screensaverBrightness={screensaverBrightness}
            onScreensaverBrightnessChange={setScreensaverBrightness}
            inactivityDelay={inactivityDelay}
            onInactivityDelayChange={setInactivityDelay}
            motionEnabled={motionEnabled}
            onMotionEnabledChange={toggleMotionDetection}
            motionCameraPosition={motionCameraPosition}
            onMotionCameraPositionChange={handleMotionCameraPositionChange}
            availableCameras={availableCameras}
          />
        );
      
      case 'security':
        return (
          <SecurityTab
            displayMode={displayMode}
            isDeviceOwner={isDeviceOwner}
            navigation={navigation}
            kioskEnabled={kioskEnabled}
            onKioskEnabledChange={setKioskEnabled}
            allowPowerButton={allowPowerButton}
            onAllowPowerButtonChange={setAllowPowerButton}
            returnMode={returnMode}
            onReturnModeChange={setReturnMode}
            returnTapCount={returnTapCount}
            onReturnTapCountChange={setReturnTapCount}
            returnTapTimeout={returnTapTimeout}
            onReturnTapTimeoutChange={setReturnTapTimeout}
            returnButtonPosition={returnButtonPosition}
            onReturnButtonPositionChange={setReturnButtonPosition}
            overlayButtonVisible={overlayButtonVisible}
            onOverlayButtonVisibleChange={handleOverlayButtonVisibleChange}
            volumeUp5TapEnabled={volumeUp5TapEnabled}
            onVolumeUp5TapEnabledChange={setVolumeUp5TapEnabled}
            autoLaunchEnabled={autoLaunchEnabled}
            onAutoLaunchChange={toggleAutoLaunch}
            autoRelaunchApp={autoRelaunchApp}
            onAutoRelaunchAppChange={setAutoRelaunchApp}
            backButtonMode={backButtonMode}
            onBackButtonModeChange={setBackButtonMode}
            backButtonTimerDelay={backButtonTimerDelay}
            onBackButtonTimerDelayChange={setBackButtonTimerDelay}
          />
        );
      
      case 'advanced':
        return (
          <AdvancedTab
            displayMode={displayMode}
            isDeviceOwner={isDeviceOwner}
            currentVersion={currentVersion}
            checkingUpdate={checkingUpdate}
            downloading={downloading}
            updateAvailable={updateAvailable}
            updateInfo={updateInfo}
            onCheckForUpdates={handleCheckForUpdates}
            onDownloadUpdate={() => handleDownloadUpdate()}
            certificates={certificates}
            onRemoveCertificate={handleRemoveCertificate}
            onResetSettings={handleResetSettings}
            onExitKioskMode={handleExitKioskMode}
            onRemoveDeviceOwner={handleRemoveDeviceOwner}
            kioskEnabled={kioskEnabled}
            onRestoreComplete={loadSettings}
          />
        );
      
      default:
        return null;
    }
  };

  return (
    <View style={settingsStyles.container}>
      {/* Download Progress Modal */}
      <Modal visible={downloading} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={settingsStyles.modalOverlay}>
          <View style={settingsStyles.modalContent}>
            <Text style={settingsStyles.modalTitle}>📥 Downloading</Text>
            <Text style={settingsStyles.modalText}>
              Please wait while downloading...
            </Text>
            <Text style={settingsStyles.modalHint}>
              Do not close the application.
            </Text>
          </View>
        </View>
      </Modal>

      {/* Header */}
      <View style={settingsStyles.header}>
        <Text style={settingsStyles.headerTitle}>⚙️ Settings</Text>
        
        {/* Device Owner Badge */}
        <View style={[
          settingsStyles.deviceOwnerBadge,
          isDeviceOwner ? settingsStyles.deviceOwnerBadgeActive : settingsStyles.deviceOwnerBadgeInactive
        ]}>
          <Text style={[
            settingsStyles.deviceOwnerBadgeText,
            isDeviceOwner ? settingsStyles.deviceOwnerBadgeTextActive : settingsStyles.deviceOwnerBadgeTextInactive
          ]}>
            {isDeviceOwner ? '🔒 Device Owner Active' : '🔓 Device Owner Inactive'}
          </Text>
        </View>
        
        {/* Tab Bar */}
        <View style={settingsStyles.tabBar}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab.id}
              style={[settingsStyles.tab, activeTab === tab.id && settingsStyles.tabActive]}
              onPress={() => setActiveTab(tab.id)}
            >
              <View style={settingsStyles.tabContent}>
                <Icon 
                  name={tab.icon} 
                  size={20} 
                  color={activeTab === tab.id ? Colors.primary : Colors.textSecondary} 
                />
                <Text style={[
                  settingsStyles.tabLabel,
                  activeTab === tab.id && settingsStyles.tabLabelActive
                ]}>
                  {tab.label}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Tab Content */}
      <ScrollView 
        style={{ flex: 1 }} 
        contentContainerStyle={settingsStyles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {renderTab()}
        
        {/* Save Button - Always visible */}
        {activeTab !== 'advanced' && (
          <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
            <Text style={styles.saveButtonText}>💾 Save</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* App Picker Modal */}
      <Modal visible={showAppPicker} animationType="slide" onRequestClose={() => setShowAppPicker(false)}>
        <View style={settingsStyles.appPickerContainer}>
          <View style={settingsStyles.appPickerHeader}>
            <Text style={settingsStyles.appPickerTitle}>📱 Select an App</Text>
            <TouchableOpacity
              style={settingsStyles.appPickerCloseButton}
              onPress={() => setShowAppPicker(false)}
            >
              <Text style={settingsStyles.appPickerCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={installedApps}
            keyExtractor={(item) => item.packageName}
            renderItem={({ item }) => (
              <TouchableOpacity style={settingsStyles.appItem} onPress={() => selectApp(item)}>
                <Text style={settingsStyles.appName}>{item.appName}</Text>
                <Text style={settingsStyles.appPackage}>{item.packageName}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>

      {/* Recurring Event Editor Modal */}
      <RecurringEventEditor
        visible={showRecurringEditor}
        event={editingEvent?.type === 'recurring' ? editingEvent : null}
        existingEvents={urlPlannerEvents}
        onSave={(event: ScheduledEvent) => {
          if (editingEvent) {
            // Update existing event
            setUrlPlannerEvents(urlPlannerEvents.map(e => e.id === event.id ? event : e));
          } else {
            // Add new event
            setUrlPlannerEvents([...urlPlannerEvents, event]);
          }
          setShowRecurringEditor(false);
          setEditingEvent(null);
        }}
        onCancel={() => {
          setShowRecurringEditor(false);
          setEditingEvent(null);
        }}
      />

      {/* One-Time Event Editor Modal */}
      <OneTimeEventEditor
        visible={showOneTimeEditor}
        event={editingEvent?.type === 'oneTime' ? editingEvent : null}
        existingEvents={urlPlannerEvents}
        onSave={(event: ScheduledEvent) => {
          if (editingEvent) {
            // Update existing event
            setUrlPlannerEvents(urlPlannerEvents.map(e => e.id === event.id ? event : e));
          } else {
            // Add new event
            setUrlPlannerEvents([...urlPlannerEvents, event]);
          }
          setShowOneTimeEditor(false);
          setEditingEvent(null);
        }}
        onCancel={() => {
          setShowOneTimeEditor(false);
          setEditingEvent(null);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  saveButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: Spacing.buttonRadius,
    marginTop: Spacing.xl,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  saveButtonText: {
    color: Colors.textOnPrimary,
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});

export default SettingsScreenNew;
