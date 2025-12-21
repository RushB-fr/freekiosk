import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Switch,
  ScrollView,
  NativeModules,
  StyleSheet,
  Alert,
  Linking,
  FlatList,
  Modal,
} from 'react-native';
import Slider from '@react-native-community/slider';
import CookieManager from '@react-native-cookies/cookies';
import { Camera } from 'react-native-vision-camera';
import { StorageService } from '../utils/storage';
import { saveSecurePin, hasSecurePin, clearSecurePin } from '../utils/secureStorage';
import CertificateModuleTyped, { CertificateInfo } from '../utils/CertificateModule';
import AppLauncherModule, { AppInfo } from '../utils/AppLauncherModule';
import OverlayPermissionModule from '../utils/OverlayPermissionModule';
import LauncherModule from '../utils/LauncherModule';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';

const { KioskModule } = NativeModules;

type SettingsScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Settings'>;

interface SettingsScreenProps {
  navigation: SettingsScreenNavigationProp;
}

const SettingsScreen: React.FC<SettingsScreenProps> = ({ navigation }) => {
  const [url, setUrl] = useState<string>('');
  const [pin, setPin] = useState<string>('');
  const [isPinConfigured, setIsPinConfigured] = useState<boolean>(false);
  const [pinMaxAttempts, setPinMaxAttempts] = useState<number>(5);
  const [pinMaxAttemptsText, setPinMaxAttemptsText] = useState<string>('5');
  const [autoReload, setAutoReload] = useState<boolean>(false);
  const [kioskEnabled, setKioskEnabled] = useState<boolean>(false);
  const [autoLaunchEnabled, setAutoLaunchEnabled] = useState<boolean>(false);
  const [screensaverEnabled, setScreensaverEnabled] = useState<boolean>(false);
  const [inactivityDelay, setInactivityDelay] = useState<string>('10');
  const [motionEnabled, setMotionEnabled] = useState<boolean>(false);
  const [screensaverBrightness, setScreensaverBrightness] = useState<number>(0);
  const [defaultBrightness, setDefaultBrightness] = useState<number>(0.5);
  const [certificates, setCertificates] = useState<CertificateInfo[]>([]);

  // External app states
  const [displayMode, setDisplayMode] = useState<'webview' | 'external_app'>('webview');
  const [externalAppPackage, setExternalAppPackage] = useState<string>('');
  const [autoRelaunchApp, setAutoRelaunchApp] = useState<boolean>(true);
  const [overlayButtonVisible, setOverlayButtonVisible] = useState<boolean>(false);
  const [externalAppTestMode, setExternalAppTestMode] = useState<boolean>(true);
  const [installedApps, setInstalledApps] = useState<AppInfo[]>([]);
  const [showAppPicker, setShowAppPicker] = useState<boolean>(false);
  const [loadingApps, setLoadingApps] = useState<boolean>(false);
  const [hasOverlayPermission, setHasOverlayPermission] = useState<boolean>(false);
  const [isDeviceOwner, setIsDeviceOwner] = useState<boolean>(false);
  const [statusBarEnabled, setStatusBarEnabled] = useState<boolean>(false);
  const [statusBarOnOverlay, setStatusBarOnOverlay] = useState<boolean>(true);
  const [statusBarOnReturn, setStatusBarOnReturn] = useState<boolean>(true);
  const [keyboardMode, setKeyboardMode] = useState<string>('default');

  useEffect(() => {
    loadSettings();
    loadCertificates();
    checkOverlayPermission();
    checkDeviceOwner();
  }, []);

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

  const requestOverlayPermission = async () => {
    try {
      await OverlayPermissionModule.requestOverlayPermission();
      // Vérifier à nouveau après un court délai (l'utilisateur revient des paramètres)
      setTimeout(() => checkOverlayPermission(), 1000);
    } catch (error) {
      console.error('Error requesting overlay permission:', error);
    }
  };

  const handleDisplayModeChange = async (newMode: 'webview' | 'external_app') => {
    try {
      setDisplayMode(newMode);

      // Activer/désactiver HomeActivity selon le mode
      if (newMode === 'external_app') {
        await LauncherModule.enableHomeLauncher();
      } else {
        await LauncherModule.disableHomeLauncher();
      }
    } catch (error) {
      console.error('Error changing display mode:', error);
    }
  };

  const loadSettings = async (): Promise<void> => {
    const savedUrl = await StorageService.getUrl();
    const savedAutoReload = await StorageService.getAutoReload();
    const savedKioskEnabled = await StorageService.getKioskEnabled();
    const savedAutoLaunch = await StorageService.getAutoLaunch();
    const savedScreensaverEnabled = await StorageService.getScreensaverEnabled();
    const savedDefaultBrightness = await StorageService.getDefaultBrightness();

    // New screensaver architecture
    const savedInactivityDelay = await StorageService.getScreensaverInactivityDelay();
    const savedMotionEnabled = await StorageService.getScreensaverMotionEnabled();
    const savedScreensaverBrightness = await StorageService.getScreensaverBrightness();

    // Check if a secure PIN is already configured
    const hasPinConfigured = await hasSecurePin();
    setIsPinConfigured(hasPinConfigured);

    if (savedUrl) setUrl(savedUrl);
    if (hasPinConfigured) {
      setPin('');
    }

    setAutoReload(savedAutoReload);
    setKioskEnabled(savedKioskEnabled);
    setAutoLaunchEnabled(savedAutoLaunch ?? false);
    setScreensaverEnabled(savedScreensaverEnabled ?? false);
    setDefaultBrightness(savedDefaultBrightness ?? 0.5);

    setMotionEnabled(savedMotionEnabled ?? false);
    setScreensaverBrightness(savedScreensaverBrightness ?? 0);

    if (savedInactivityDelay && !isNaN(savedInactivityDelay)) {
      setInactivityDelay(String(Math.floor(savedInactivityDelay / 60000)));
    } else {
      setInactivityDelay('10');
    }

    // Load external app settings
    const savedDisplayMode = await StorageService.getDisplayMode();
    const savedExternalAppPackage = await StorageService.getExternalAppPackage();
    const savedAutoRelaunchApp = await StorageService.getAutoRelaunchApp();
    const savedOverlayButtonVisible = await StorageService.getOverlayButtonVisible();
    const savedPinMaxAttempts = await StorageService.getPinMaxAttempts();
    const savedStatusBarEnabled = await StorageService.getStatusBarEnabled();
    const savedStatusBarOnOverlay = await StorageService.getStatusBarOnOverlay();
    const savedStatusBarOnReturn = await StorageService.getStatusBarOnReturn();
    const savedExternalAppTestMode = await StorageService.getExternalAppTestMode();
    const savedKeyboardMode = await StorageService.getKeyboardMode();

    setDisplayMode(savedDisplayMode);
    setExternalAppPackage(savedExternalAppPackage ?? '');
    setAutoRelaunchApp(savedAutoRelaunchApp);
    setOverlayButtonVisible(savedOverlayButtonVisible);
    setPinMaxAttempts(savedPinMaxAttempts);
    setPinMaxAttemptsText(String(savedPinMaxAttempts));
    setStatusBarEnabled(savedStatusBarEnabled);
    setStatusBarOnOverlay(savedStatusBarOnOverlay);
    setStatusBarOnReturn(savedStatusBarOnReturn);
    setExternalAppTestMode(savedExternalAppTestMode);
    setKeyboardMode(savedKeyboardMode);
  };

  const loadCertificates = async (): Promise<void> => {
    try {
      const certs = await CertificateModuleTyped.getAcceptedCertificates();
      setCertificates(certs);
    } catch (error) {
      // Silent fail
    }
  };

  const loadInstalledApps = async (): Promise<void> => {
    try {
      setLoadingApps(true);
      const apps = await AppLauncherModule.getInstalledApps();
      setInstalledApps(apps);
      setShowAppPicker(true);
    } catch (error) {
      Alert.alert('Error', `Failed to load apps: ${error}`);
    } finally {
      setLoadingApps(false);
    }
  };

  const selectApp = (app: AppInfo): void => {
    setExternalAppPackage(app.packageName);
    setShowAppPicker(false);
  };

  const validatePackageName = (packageName: string): boolean => {
    const regex = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
    return regex.test(packageName);
  };

  const toggleAutoLaunch = async (value: boolean) => {
    setAutoLaunchEnabled(value);
    await StorageService.saveAutoLaunch(value);
    try {
      if (value) {
        await KioskModule.enableAutoLaunch();
      } else {
        await KioskModule.disableAutoLaunch();
      }
    } catch (error) {
      Alert.alert('Error', `Failed to update auto launch: ${error}`);
    }
  };


  const toggleMotionDetection = async (value: boolean) => {
    if (value) {
      const permission = await Camera.requestCameraPermission();
      if (permission === 'denied') {
        Alert.alert(
          'Camera Permission Required',
          'Camera access is required for motion detection.\n\nPlease enable camera permission in device settings.',
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

  const handleOverlayButtonVisibleChange = async (value: boolean) => {
    setOverlayButtonVisible(value);

    // Update button opacity immediately if in external app mode
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

    // Update status bar immediately if in external app mode (overlay)
    // For webview mode, the change will be applied on next KioskScreen load
    if (displayMode === 'external_app') {
      try {
        const { OverlayServiceModule } = NativeModules;
        // In external app mode, status bar on overlay depends on both enabled and onOverlay flags
        await OverlayServiceModule.setStatusBarEnabled(value && statusBarOnOverlay);
      } catch (error) {
        // Silent fail
      }
    }
  };

  const handleStatusBarOnOverlayChange = async (value: boolean) => {
    setStatusBarOnOverlay(value);

    // Update status bar on overlay immediately if in external app mode
    if (displayMode === 'external_app' && statusBarEnabled) {
      try {
        const { OverlayServiceModule } = NativeModules;
        await OverlayServiceModule.setStatusBarEnabled(value);
      } catch (error) {
        // Silent fail
      }
    }
  };

  const handleStatusBarOnReturnChange = (value: boolean) => {
    setStatusBarOnReturn(value);
    // This affects the ExternalAppOverlay component, no native update needed
  };

  const handleSave = async (): Promise<void> => {
    // Validate based on display mode
    if (displayMode === 'webview') {
      if (!url) {
        Alert.alert('Error', 'Please enter a URL');
        return;
      }
    }

    // Validate external app mode
    if (displayMode === 'external_app') {
      if (!externalAppPackage) {
        Alert.alert('Error', 'Please enter a package name or select an app');
        return;
      }

      if (!validatePackageName(externalAppPackage)) {
        Alert.alert('Error', 'Invalid package name format (e.g., com.example.app)');
        return;
      }

      // Check if app is installed
      try {
        const isInstalled = await AppLauncherModule.isAppInstalled(externalAppPackage);
        if (!isInstalled) {
          Alert.alert('Error', `App not installed: ${externalAppPackage}`);
          return;
        }
      } catch (error) {
        Alert.alert('Error', `Failed to check app: ${error}`);
        return;
      }
    }

    // URL validation only for webview mode
    let finalUrl = url.trim();
    if (displayMode === 'webview') {
      const urlLower = finalUrl.toLowerCase();

      // Security: Block dangerous URL schemes
      if (urlLower.startsWith('file://')) {
        Alert.alert('Security Error', 'File URLs are not allowed for security reasons.\n\nPlease use http:// or https:// URLs only.');
        return;
      }
      if (urlLower.startsWith('javascript:')) {
        Alert.alert('Security Error', 'JavaScript URLs are not allowed for security reasons.\n\nPlease use http:// or https:// URLs only.');
        return;
      }
      if (urlLower.startsWith('data:')) {
        Alert.alert('Security Error', 'Data URLs are not allowed for security reasons.\n\nPlease use http:// or https:// URLs only.');
        return;
      }

      // Auto-add https:// if no protocol specified
      if (!urlLower.startsWith('http://') && !urlLower.startsWith('https://')) {
        // Check if it looks like a valid domain (contains at least one dot)
        if (finalUrl.includes('.')) {
          finalUrl = 'https://' + finalUrl;

          // Update the input field to show the complete URL
          setUrl(finalUrl);

          Alert.alert(
            'URL Updated',
            `Added https:// to your URL:\n\n${finalUrl}\n\nClick Save again to confirm.`,
            [{ text: 'OK' }]
          );
          return;
        } else {
          Alert.alert('Invalid URL', 'Please enter a valid URL (e.g., example.com or https://example.com)');
          return;
        }
      }
    }

    // Only validate PIN if user entered a new one
    if (pin && pin.length > 0) {
      if (pin.length < 4) {
        Alert.alert('Error', 'PIN code must contain at least 4 digits');
        return;
      }
    } else if (!isPinConfigured) {
      // No PIN configured yet and user didn't enter one
      Alert.alert('Error', 'Please enter a PIN code');
      return;
    }

    // Validate inactivity delay
    const inactivityDelayNumber = parseInt(inactivityDelay, 10);
    if (isNaN(inactivityDelayNumber) || inactivityDelayNumber <= 0) {
      Alert.alert('Error', 'Please enter a valid positive number for inactivity delay');
      return;
    }

    // Validate PIN max attempts
    if (pinMaxAttempts < 1 || pinMaxAttempts > 100) {
      Alert.alert('Error', 'PIN max attempts must be between 1 and 100');
      return;
    }

    // Save URL only in webview mode
    if (displayMode === 'webview') {
      await StorageService.saveUrl(finalUrl);
    }

    // Save PIN only if user entered a new one
    if (pin && pin.length >= 4) {
      await saveSecurePin(pin);
      await StorageService.savePin('');
      setIsPinConfigured(true);
    }

    // Save PIN max attempts
    await StorageService.savePinMaxAttempts(pinMaxAttempts);

    // Save settings based on mode
    if (displayMode === 'webview') {
      await StorageService.saveAutoReload(autoReload);
      await StorageService.saveKioskEnabled(kioskEnabled);
      await StorageService.saveScreensaverEnabled(screensaverEnabled);
      await StorageService.saveDefaultBrightness(defaultBrightness);

      // Save new screensaver architecture (inactivity is always enabled)
      await StorageService.saveScreensaverInactivityEnabled(true);
      await StorageService.saveScreensaverInactivityDelay(inactivityDelayNumber * 60000);
      await StorageService.saveScreensaverMotionEnabled(motionEnabled);
      await StorageService.saveScreensaverBrightness(screensaverBrightness);
    } else {
      // External app mode: disable features that don't work, but KEEP lock mode
      await StorageService.saveAutoReload(false);
      await StorageService.saveKioskEnabled(kioskEnabled);  // Lock mode fonctionne en external app
      await StorageService.saveScreensaverEnabled(false);
    }

    await StorageService.saveAutoLaunch(autoLaunchEnabled);

    // Save external app settings
    await StorageService.saveDisplayMode(displayMode);
    await StorageService.saveExternalAppPackage(externalAppPackage);
    await StorageService.saveAutoRelaunchApp(autoRelaunchApp);
    await StorageService.saveOverlayButtonVisible(overlayButtonVisible);
    await StorageService.saveStatusBarEnabled(statusBarEnabled);
    await StorageService.saveStatusBarOnOverlay(statusBarOnOverlay);
    await StorageService.saveStatusBarOnReturn(statusBarOnReturn);
    await StorageService.saveExternalAppTestMode(externalAppTestMode);
    await StorageService.saveKeyboardMode(keyboardMode);

    // Update overlay button opacity and test mode
    if (displayMode === 'external_app') {
      const opacity = overlayButtonVisible ? 1.0 : 0.0;
      try {
        const { OverlayServiceModule } = NativeModules;
        await OverlayServiceModule.setButtonOpacity(opacity);
        await OverlayServiceModule.setTestMode(externalAppTestMode);
        // Status bar on overlay depends on both flags
        await OverlayServiceModule.setStatusBarEnabled(statusBarEnabled && statusBarOnOverlay);
      } catch (error) {
        // Silent fail
      }
    }

    // Start/stop lock task based on kioskEnabled (works for BOTH webview and external_app)
    if (kioskEnabled) {
      try {
        // Pass external app package so it gets added to whitelist
        const packageToWhitelist = displayMode === 'external_app' ? externalAppPackage : null;
        await KioskModule.startLockTask(packageToWhitelist);
        const message = displayMode === 'external_app'
          ? 'Configuration saved\nLock mode enabled - navigation blocked'
          : 'Configuration saved\nScreen pinning enabled - swipe gestures blocked';
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
        : 'Configuration saved\nScreen pinning disabled - swipe up to exit';

      Alert.alert('Success', message, [
        { text: 'OK', onPress: () => navigation.navigate('Kiosk') },
      ]);
    }
  };

  const handleResetSettings = async (): Promise<void> => {
    Alert.alert(
      'Reset Settings',
      'This will erase all settings (URL, PIN, preferences, SSL certificates, and cookies) and restart the app with default values.\n\nContinue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              // Clear all storage including secure PIN
              await StorageService.clearAll();
              await CertificateModuleTyped.clearAcceptedCertificates();
              await clearSecurePin(); // Clear PIN from Android Keystore

              // Clear all cookies
              await CookieManager.clearAll();

              setUrl('');
              setPin('');
              setIsPinConfigured(false);
              setPinMaxAttempts(5);
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

              try {
                await KioskModule.stopLockTask();
              } catch {
                // ignore
              }

              Alert.alert('Success', 'Settings reset successfully!\nPIN and all data cleared.\n\nPlease configure the app again.', [
                { text: 'OK', onPress: () => navigation.navigate('Kiosk') },
              ]);
            } catch (error) {
              Alert.alert('Error', `Failed to reset settings: ${error}`);
            }
          },
        },
      ],
    );
  };

  const handleExitKioskMode = async (): Promise<void> => {
    Alert.alert(
      'Exit Kiosk Mode',
      'Are you sure you want to exit kiosk mode?\n\nThis will close the application and disable the lock.',
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

  const handleRemoveCertificate = async (fingerprint: string, url: string): Promise<void> => {
    Alert.alert(
      'Remove Certificate',
      `Remove accepted certificate for:\n\n${url}\n\nFingerprint: ${fingerprint.substring(0, 16)}...\n\nYou will be asked again next time you visit this site.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await CertificateModuleTyped.removeCertificate(fingerprint);
              await loadCertificates(); // Reload list
              Alert.alert('Success', 'Certificate removed successfully');
            } catch (error) {
              Alert.alert('Error', `Failed to remove certificate: ${error}`);
            }
          },
        },
      ],
    );
  };

  const handleRemoveDeviceOwner = async (): Promise<void> => {
    Alert.alert(
      '⚠️ Remove Device Owner',
      'WARNING: This will remove Device Owner privileges from FreeKiosk.\n\n' +
      'You will lose:\n' +
      '• Full kiosk mode (Lock Task)\n' +
      '• Navigation blocking\n' +
      '• Complete lockdown protection\n\n' +
      'All app settings will be reset to default.\n\n' +
      'Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove Device Owner',
          style: 'destructive',
          onPress: async () => {
            try {
              // Stop lock task first
              try {
                await KioskModule.stopLockTask();
              } catch {
                // ignore if not in lock task
              }

              // Remove Device Owner
              await KioskModule.removeDeviceOwner();

              // Reset all settings to default
              await StorageService.clearAll();
              await CertificateModuleTyped.clearAcceptedCertificates();
              await clearSecurePin();
              await CookieManager.clearAll();

              // Reset state
              setUrl('');
              setPin('');
              setIsPinConfigured(false);
              setPinMaxAttempts(5);
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
              setIsDeviceOwner(false);

              Alert.alert(
                'Success',
                'Device Owner removed successfully!\n\n' +
                'All settings have been reset.\n' +
                'You can now uninstall FreeKiosk normally from Android Settings.',
                [{ text: 'OK', onPress: () => navigation.navigate('Kiosk') }]
              );
            } catch (error: any) {
              if (error.code === 'NOT_DEVICE_OWNER') {
                Alert.alert('Error', 'FreeKiosk is not configured as Device Owner.');
              } else {
                Alert.alert('Error', `Failed to remove Device Owner: ${error.message || error}`);
              }
            }
          },
        },
      ],
    );
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.content}>
        <Text style={styles.title}>⚙️ Kiosk Configuration</Text>

        {/* Device Owner Status Badge */}
        <View style={[styles.deviceOwnerBadge, isDeviceOwner ? styles.deviceOwnerBadgeActive : styles.deviceOwnerBadgeInactive]}>
          <Text style={[styles.deviceOwnerBadgeText, isDeviceOwner ? styles.deviceOwnerBadgeTextActive : styles.deviceOwnerBadgeTextInactive]}>
            {isDeviceOwner ? '🔒 Device Owner Mode Active' : '🔓 Device Owner Mode Not Active'}
          </Text>
        </View>

        {/* Vos sections existantes... */}
        {/* Display Mode Section */}
        <View style={styles.section}>
          <Text style={styles.label}>📱 Display Mode</Text>
          <View style={styles.modeSelector}>
            <TouchableOpacity
              style={[styles.modeButton, displayMode === 'webview' && styles.modeButtonActive]}
              onPress={() => handleDisplayModeChange('webview')}
            >
              <Text style={[styles.modeButtonText, displayMode === 'webview' && styles.modeButtonTextActive]}>
                🌐 Website
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeButton, displayMode === 'external_app' && styles.modeButtonActive]}
              onPress={() => handleDisplayModeChange('external_app')}
            >
              <Text style={[styles.modeButtonText, displayMode === 'external_app' && styles.modeButtonTextActive]}>
                📦 Android App
              </Text>
              <View style={styles.betaBadge}>
                <Text style={styles.betaBadgeText}>BETA</Text>
              </View>
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>
            Choose to display a website or launch an Android application
          </Text>

          {/* BETA Warning for External App */}
          {displayMode === 'external_app' && (
            <>
              <View style={styles.betaWarningBox}>
                <Text style={styles.betaWarningTitle}>⚠️ BETA Feature</Text>
                <Text style={styles.betaWarningText}>
                  External App mode is a beta feature. Some FreeKiosk features are not available in this mode:{'\n'}
                  • Screensaver (inactivity detection, brightness control){'\n'}
                  • Motion detection{'\n'}
                  • Default brightness control{'\n\n'}
                  To return to FreeKiosk, tap 5 times on the overlay button that appears in the bottom-right corner of the external app.
                </Text>
              </View>

              {/* Device Owner Warning */}
              {!isDeviceOwner && (
                <View style={[styles.betaWarningBox, styles.deviceOwnerWarningBox]}>
                  <Text style={styles.deviceOwnerWarningTitle}>🔒 Device Owner Recommended</Text>
                  <Text style={styles.deviceOwnerWarningText}>
                    External App mode requires Device Owner for full kiosk protection.{'\n\n'}
                    Without Device Owner:{'\n'}
                    • Navigation buttons (Home, Recent) remain accessible{'\n'}
                    • User can exit the external app freely{'\n'}
                    • Lock mode may not work properly{'\n\n'}
                    Enable Device Owner via ADB for complete kiosk lockdown.
                  </Text>
                </View>
              )}

              {/* Overlay Permission Card */}
              <View style={styles.permissionCard}>
                <Text style={styles.permissionTitle}>
                  {hasOverlayPermission ? '✓ Return Button Enabled' : '⚠️ Return Button Permission'}
                </Text>
                <Text style={styles.permissionText}>
                  {hasOverlayPermission
                    ? 'The return button is active and will appear over the external app.'
                    : 'Enable overlay permission to show a return button over the external app.'}
                </Text>
                {!hasOverlayPermission && (
                  <TouchableOpacity
                    style={styles.permissionButton}
                    onPress={requestOverlayPermission}>
                    <Text style={styles.permissionButtonText}>
                      Enable Overlay Permission
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}
        </View>

        {displayMode === 'webview' && (
          <View style={styles.section}>
            <Text style={styles.label}>🌐 URL to Display</Text>
            <TextInput
              style={styles.input}
              value={url}
              onChangeText={setUrl}
              placeholder="https://example.com"
              keyboardType="url"
              autoCapitalize="none"
            />
            {url.trim().toLowerCase().startsWith('http://') && (
              <View style={styles.warningBox}>
                <Text style={styles.warningText}>
                  ⚠️ SECURITY WARNING: This URL uses HTTP (unencrypted).{'\n'}
                  Your data can be intercepted by attackers. Use HTTPS instead.
                </Text>
              </View>
            )}
            <Text style={styles.hint}>Example: https://www.freekiosk.app</Text>
          </View>
        )}

        {displayMode === 'external_app' && (
          <>
            <View style={styles.section}>
              <Text style={styles.label}>📦 Package Name</Text>
              <TextInput
                style={styles.input}
                value={externalAppPackage}
                onChangeText={setExternalAppPackage}
                placeholder="com.example.app"
                keyboardType="default"
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={loadInstalledApps}
                disabled={loadingApps}
              >
                <Text style={styles.pickerButtonText}>
                  {loadingApps ? '⏳ Loading...' : '📋 Pick from Installed Apps'}
                </Text>
              </TouchableOpacity>
              <Text style={styles.hint}>
                Enter package name manually or pick from installed apps
              </Text>
            </View>

            <View style={styles.section}>
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>🔄 Auto-Relaunch App</Text>
                  <Text style={styles.hint}>
                    Automatically relaunch the app if it closes or crashes
                  </Text>
                </View>
                <Switch
                  value={autoRelaunchApp}
                  onValueChange={setAutoRelaunchApp}
                  trackColor={{ false: '#767577', true: '#81b0ff' }}
                  thumbColor={autoRelaunchApp ? '#0066cc' : '#f4f3f4'}
                />
              </View>
            </View>

            {/* Overlay Button Visibility */}
            <View style={styles.section}>
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>👁️ Show Return Button</Text>
                  <Text style={styles.hint}>
                    Make the return button visible on screen (otherwise tap the invisible area in bottom-right corner)
                  </Text>
                </View>
                <Switch
                  value={overlayButtonVisible}
                  onValueChange={handleOverlayButtonVisibleChange}
                  trackColor={{ false: '#767577', true: '#81b0ff' }}
                  thumbColor={overlayButtonVisible ? '#0066cc' : '#f4f3f4'}
                />
              </View>
            </View>

            {/* Test Mode */}
            <View style={styles.section}>
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>🧪 Test Mode</Text>
                  <Text style={styles.hint}>
                    Allows using the Android back button to return to FreeKiosk (recommended for testing)
                  </Text>
                </View>
                <Switch
                  value={externalAppTestMode}
                  onValueChange={setExternalAppTestMode}
                  trackColor={{ false: '#767577', true: '#81b0ff' }}
                  thumbColor={externalAppTestMode ? '#0066cc' : '#f4f3f4'}
                />
              </View>
            </View>

            {/* Return Mechanism Info */}
            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>ℹ️ Return to Settings</Text>
              <Text style={styles.infoText}>
                • Tap 5 times on the {overlayButtonVisible ? 'blue button' : 'invisible area'} in the bottom-right corner{'\n'}
                • Or use your device's app switcher (recent apps button){'\n'}
                • Device Owner mode: Press Volume Up button 5 times rapidly
              </Text>
            </View>
          </>
        )}

        {/* PIN Section - Always visible */}
        <View style={styles.section}>
          <Text style={styles.label}>🔐 PIN Code</Text>
          <TextInput
            style={styles.input}
            value={pin}
            onChangeText={setPin}
            placeholder={isPinConfigured ? "••••" : "1234"}
            keyboardType="numeric"
            secureTextEntry
            maxLength={6}
          />
          <Text style={styles.hint}>
            {isPinConfigured
              ? "✓ PIN configured - Leave empty to keep current PIN, or enter a new one to change it"
              : "Minimum 4 digits (default: 1234)"}
          </Text>

          {/* PIN Max Attempts */}
          <View style={{ marginTop: 20 }}>
            <Text style={styles.label}>🔒 Max Failed Attempts (Before 15min Lockout)</Text>
            <Text style={styles.hint}>Number of incorrect PIN attempts allowed before temporary lockout (1-100)</Text>
            <View style={{ marginTop: 10 }}>
              <TextInput
                style={styles.input}
                value={pinMaxAttemptsText}
                onChangeText={(text) => {
                  // Permettre saisie libre (incluant suppression)
                  setPinMaxAttemptsText(text);
                }}
                onBlur={() => {
                  // Valider au blur
                  const num = parseInt(pinMaxAttemptsText, 10);
                  if (!isNaN(num) && num >= 1 && num <= 100) {
                    setPinMaxAttempts(num);
                    setPinMaxAttemptsText(String(num));
                  } else {
                    // Valeur invalide: revenir à la valeur précédente
                    setPinMaxAttemptsText(String(pinMaxAttempts));
                  }
                }}
                keyboardType="numeric"
                maxLength={3}
                placeholder="5"
              />
            </View>
          </View>
        </View>

        {/* Default Brightness - Only in WebView mode */}
        {displayMode === 'webview' && (
          <View style={styles.section}>
            <Text style={styles.label}>💡 Default Brightness</Text>
            <Text style={styles.hint}>Set the default screen brightness level (0% - 100%)</Text>
            <View style={{ marginTop: 15 }}>
              <Text style={styles.brightnessValue}>{Math.round(defaultBrightness * 100)}%</Text>
              <Slider
                style={{ width: '100%', height: 40 }}
                minimumValue={0}
                maximumValue={1}
                step={0.01}
                value={defaultBrightness}
                onValueChange={setDefaultBrightness}
                minimumTrackTintColor="#0066cc"
                maximumTrackTintColor="#ddd"
                thumbTintColor="#0066cc"
              />
            </View>
          </View>
        )}

        {/* Auto Launch - Always visible */}
        <View style={styles.section}>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>🚀 Auto Launch</Text>
              <Text style={styles.hint}>Enable or disable automatic launch on device startup</Text>
            </View>
            <Switch
              value={autoLaunchEnabled}
              onValueChange={toggleAutoLaunch}
              trackColor={{ false: '#767577', true: '#81b0ff' }}
              thumbColor={autoLaunchEnabled ? '#0066cc' : '#f4f3f4'}
            />
          </View>
          <View style={styles.warningBox}>
            <Text style={styles.warningText}>
              ⚠️ For non-Device Owner devices, please enable the "Appear on top" permission in the system settings.
            </Text>
            <Text style={styles.hint}>This permission is only necessary for the auto launch feature to work.</Text>
            <TouchableOpacity style={styles.saveButton} onPress={() => Linking.openSettings()}>
              <Text style={styles.saveButtonText}>📲 Open Settings</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Status Bar Toggle - Available in both modes */}
        <View style={styles.section}>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>📊 System Status Bar</Text>
              <Text style={styles.hint}>
                Display system information (battery, Wi-Fi, Bluetooth, volume, time) at the top of the screen
              </Text>
            </View>
            <Switch
              value={statusBarEnabled}
              onValueChange={handleStatusBarEnabledChange}
              trackColor={{ false: '#767577', true: '#81b0ff' }}
              thumbColor={statusBarEnabled ? '#0066cc' : '#f4f3f4'}
            />
          </View>
          {statusBarEnabled && (
            <View style={styles.infoSubBox}>
              <Text style={styles.infoSubText}>
                ℹ️ Status bar displays: Battery (with charging indicator ⚡), Wi-Fi (✓/✗), Bluetooth (✓/✗), Volume level, Current time
              </Text>
              {displayMode === 'external_app' && (
                <>
                  <Text style={styles.infoSubText}>
                    {'\n'}External app mode: Configure where the status bar appears
                  </Text>
                  {/* Sub-option: Status bar on overlay (external app) */}
                  <View style={[styles.switchRow, { marginTop: 12, paddingLeft: 8 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.label, { fontSize: 14 }]}>📱 On External App (Overlay)</Text>
                      <Text style={[styles.hint, { fontSize: 12 }]}>
                        Show status bar overlay on top of the external app
                      </Text>
                    </View>
                    <Switch
                      value={statusBarOnOverlay}
                      onValueChange={handleStatusBarOnOverlayChange}
                      trackColor={{ false: '#767577', true: '#81b0ff' }}
                      thumbColor={statusBarOnOverlay ? '#0066cc' : '#f4f3f4'}
                    />
                  </View>
                  {/* Sub-option: Status bar on return screen */}
                  <View style={[styles.switchRow, { marginTop: 8, paddingLeft: 8 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.label, { fontSize: 14 }]}>🏠 On Return Screen</Text>
                      <Text style={[styles.hint, { fontSize: 12 }]}>
                        Show status bar on the "External App Running" screen
                      </Text>
                    </View>
                    <Switch
                      value={statusBarOnReturn}
                      onValueChange={handleStatusBarOnReturnChange}
                      trackColor={{ false: '#767577', true: '#81b0ff' }}
                      thumbColor={statusBarOnReturn ? '#0066cc' : '#f4f3f4'}
                    />
                  </View>
                </>
              )}
              {displayMode === 'webview' && (
                <Text style={styles.infoSubText}>
                  {'\n'}WebView mode: Status bar appears above the web content
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Lock Mode - Available in both WebView and External App modes */}
        <View style={styles.section}>
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>🔒 Lock Mode</Text>
                <Text style={styles.hint}>
                  Prevent users from exiting the kiosk app
                  {'\n'}
                  When ON: Exit gestures blocked, need PIN to exit
                  {'\n'}
                  When OFF: Users can exit normally
                </Text>
              </View>
              <Switch
                value={kioskEnabled}
                onValueChange={setKioskEnabled}
                trackColor={{ false: '#767577', true: '#81b0ff' }}
                thumbColor={kioskEnabled ? '#0066cc' : '#f4f3f4'}
              />
            </View>
            {!kioskEnabled && (
              <View style={styles.warningBox}>
                <Text style={styles.warningText}>⚠️ Warning: With Lock Mode disabled, users can exit the app normally</Text>
              </View>
            )}
            {kioskEnabled && displayMode === 'webview' && isDeviceOwner && (
              <View style={styles.infoSubBox}>
                <Text style={styles.infoSubText}>
                  ℹ️ Screen pinning enabled: Only 5-tap gesture + PIN code allows exit
                </Text>
              </View>
            )}
            {kioskEnabled && displayMode === 'webview' && !isDeviceOwner && (
              <View style={styles.warningBox}>
                <Text style={styles.warningText}>
                  ⚠️ Device Owner Recommended: Without Device Owner, users can exit Lock Mode using Back + Recent Apps gesture. For true kiosk lockdown, set FreeKiosk as Device Owner.
                </Text>
              </View>
            )}
            {kioskEnabled && displayMode === 'external_app' && !isDeviceOwner && (
              <View style={styles.warningBox}>
                <Text style={styles.warningText}>⚠️ Device Owner Required: Lock Mode will not work in External App mode without Device Owner privileges. Users can still exit the app.</Text>
              </View>
            )}
            {kioskEnabled && displayMode === 'external_app' && isDeviceOwner && (
              <View style={styles.infoSubBox}>
                <Text style={styles.infoSubText}>
                  ℹ️ Lock Mode enabled: Only overlay 5-tap + PIN code allows exit from external app
                </Text>
              </View>
            )}
        </View>

        {/* Auto Reload - Only in WebView mode */}
        {displayMode === 'webview' && (
          <View style={styles.section}>
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>🔄 Automatic Reload</Text>
                <Text style={styles.hint}>Automatically reload the page on error</Text>
              </View>
              <Switch
                value={autoReload}
                onValueChange={setAutoReload}
                trackColor={{ false: '#767577', true: '#81b0ff' }}
                thumbColor={autoReload ? '#0066cc' : '#f4f3f4'}
              />
            </View>
          </View>
        )}

        {/* Keyboard Mode - Only in WebView mode */}
        {displayMode === 'webview' && (
          <View style={styles.section}>
            <Text style={styles.label}>🔢 Keyboard Mode</Text>
            <Text style={styles.hint}>Control which keyboard appears for input fields</Text>
            
            <View style={{ marginTop: 12 }}>
              <TouchableOpacity
                style={[styles.radioOption, keyboardMode === 'default' && styles.radioOptionSelected]}
                onPress={() => setKeyboardMode('default')}
              >
                <View style={styles.radioCircle}>
                  {keyboardMode === 'default' && <View style={styles.radioCircleSelected} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.radioLabel}>Default</Text>
                  <Text style={styles.radioHint}>Respect website settings (recommended)</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.radioOption, keyboardMode === 'force_numeric' && styles.radioOptionSelected]}
                onPress={() => setKeyboardMode('force_numeric')}
              >
                <View style={styles.radioCircle}>
                  {keyboardMode === 'force_numeric' && <View style={styles.radioCircleSelected} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.radioLabel}>Force Numeric</Text>
                  <Text style={styles.radioHint}>All input fields show numeric keyboard</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.radioOption, keyboardMode === 'smart' && styles.radioOptionSelected]}
                onPress={() => setKeyboardMode('smart')}
              >
                <View style={styles.radioCircle}>
                  {keyboardMode === 'smart' && <View style={styles.radioCircleSelected} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.radioLabel}>Smart Detection</Text>
                  <Text style={styles.radioHint}>Detect and convert number fields only</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Screensaver Settings - Only in WebView mode */}
        {displayMode === 'webview' && (
          <View style={styles.section}>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>🛌 Screensaver</Text>
              <Text style={styles.hint}>Enable or disable screensaver activation</Text>
            </View>
            <Switch
              value={screensaverEnabled}
              onValueChange={setScreensaverEnabled}
              trackColor={{ false: '#767577', true: '#81b0ff' }}
              thumbColor={screensaverEnabled ? '#0066cc' : '#f4f3f4'}
            />
          </View>

          {screensaverEnabled && (
            <>
              {/* Screensaver Brightness */}
              <View style={{ marginTop: 20 }}>
                <Text style={styles.label}>💡 Screensaver Brightness</Text>
                <Text style={styles.hint}>Screen brightness when screensaver is active</Text>

                {/* Brightness Presets */}
                <View style={{ flexDirection: 'row', marginTop: 10, flexWrap: 'wrap', gap: 8 }}>
                  <TouchableOpacity
                    style={[styles.presetButton, screensaverBrightness === 0 && styles.presetButtonActive]}
                    onPress={() => setScreensaverBrightness(0)}
                  >
                    <Text style={[styles.presetButtonText, screensaverBrightness === 0 && styles.presetButtonTextActive]}>
                      Black Screen
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.presetButton, screensaverBrightness === 0.05 && styles.presetButtonActive]}
                    onPress={() => setScreensaverBrightness(0.05)}
                  >
                    <Text style={[styles.presetButtonText, screensaverBrightness === 0.05 && styles.presetButtonTextActive]}>
                      Dim 5%
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.presetButton, screensaverBrightness === 0.1 && styles.presetButtonActive]}
                    onPress={() => setScreensaverBrightness(0.1)}
                  >
                    <Text style={[styles.presetButtonText, screensaverBrightness === 0.1 && styles.presetButtonTextActive]}>
                      Dim 10%
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Custom Brightness Slider */}
                <View style={{ marginTop: 15 }}>
                  <Text style={styles.brightnessValue}>{Math.round(screensaverBrightness * 100)}%</Text>
                  <Slider
                    style={{ width: '100%', height: 40 }}
                    minimumValue={0}
                    maximumValue={1}
                    step={0.01}
                    value={screensaverBrightness}
                    onValueChange={setScreensaverBrightness}
                    minimumTrackTintColor="#0066cc"
                    maximumTrackTintColor="#ddd"
                    thumbTintColor="#0066cc"
                  />
                </View>
              </View>

              {/* Inactivity Delay */}
              <View style={{ marginTop: 20 }}>
                <Text style={styles.label}>⏳ Inactivity Delay</Text>
                <Text style={styles.hint}>Time before screensaver activates (in minutes)</Text>
                <View style={{ marginTop: 10 }}>
                  <TextInput
                    style={styles.input}
                    value={inactivityDelay}
                    onChangeText={(text) => {
                      if (/^\d*$/.test(text)) {
                        setInactivityDelay(text);
                      }
                    }}
                    keyboardType="numeric"
                    maxLength={3}
                    placeholder="10"
                  />
                </View>
              </View>

              {/* Motion Detection - BASIC TEST */}
              <View style={{ marginTop: 20 }}>
                <View style={styles.switchRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>📷 Motion Detection (TEST)</Text>
                    <Text style={styles.hint}>Wake screensaver when motion detected</Text>
                  </View>
                  <Switch
                    value={motionEnabled}
                    onValueChange={toggleMotionDetection}
                    trackColor={{ false: '#767577', true: '#81b0ff' }}
                    thumbColor={motionEnabled ? '#0066cc' : '#f4f3f4'}
                  />
                </View>
                {motionEnabled && (
                  <View style={styles.warningBox}>
                    <Text style={styles.warningText}>
                      ⚠️ BETA Feature: Motion detection is experimental
                    </Text>
                  </View>
                )}
              </View>

            </>
          )}
          </View>
        )}

        {/* SSL Certificates - Only in WebView mode */}
        {displayMode === 'webview' && (
          <View style={styles.section}>
          <Text style={styles.label}>🔒 Accepted SSL Certificates</Text>
          <Text style={styles.hint}>
            Self-signed certificates you've accepted. They expire after 1 year.
          </Text>

          {certificates.length === 0 ? (
            <View style={styles.emptyCertsBox}>
              <Text style={styles.emptyCertsText}>No certificates accepted yet</Text>
            </View>
          ) : (
            <View style={{ marginTop: 15 }}>
              {certificates.map((cert) => (
                <View key={cert.fingerprint} style={styles.certItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.certUrl} numberOfLines={1}>
                      {cert.url}
                    </Text>
                    <Text style={styles.certFingerprint} numberOfLines={1}>
                      {cert.fingerprint.substring(0, 24)}...
                    </Text>
                    <Text style={[styles.certExpiry, cert.isExpired && styles.certExpired]}>
                      {cert.isExpired ? '⚠️ Expired: ' : 'Expires: '}
                      {cert.expiryDate}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.certDeleteButton}
                    onPress={() => handleRemoveCertificate(cert.fingerprint, cert.url)}
                  >
                    <Text style={styles.certDeleteText}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
          </View>
        )}

        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>💾 Save</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.navigate('Kiosk')}>
          <Text style={styles.cancelButtonText}>↩️ Back to Kiosk</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.resetButton} onPress={handleResetSettings}>
          <Text style={styles.resetButtonText}>🔄 Reset All Settings</Text>
        </TouchableOpacity>

        {isDeviceOwner && (
          <TouchableOpacity style={styles.removeDeviceOwnerButton} onPress={handleRemoveDeviceOwner}>
            <Text style={styles.removeDeviceOwnerButtonText}>⚠️ Remove Device Owner</Text>
          </TouchableOpacity>
        )}

        {kioskEnabled && (
          <TouchableOpacity style={styles.exitButton} onPress={handleExitKioskMode}>
            <Text style={styles.exitButtonText}>🚪 Exit Kiosk Mode</Text>
          </TouchableOpacity>
        )}

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>ℹ️ How to Use</Text>
          <Text style={styles.infoText}>
            • Configure the URL of the web page to display{'\n'}
            • Set a secure PIN code{'\n'}
            • Enable "Pin App to Screen" for full kiosk mode{'\n'}
            • Tap 5 times in the bottom-right corner to access settings{'\n'}
            • Enter PIN code to unlock
          </Text>
        </View>
      </View>

      {/* App Picker Modal */}
      <Modal
        visible={showAppPicker}
        animationType="slide"
        onRequestClose={() => setShowAppPicker(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>📱 Select Installed App</Text>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowAppPicker(false)}
            >
              <Text style={styles.modalCloseButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={installedApps}
            keyExtractor={(item) => item.packageName}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.appItem}
                onPress={() => selectApp(item)}
              >
                <Text style={styles.appName}>{item.appName}</Text>
                <Text style={styles.appPackage}>{item.packageName}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 15,
    marginTop: 20,
    color: '#333',
    textAlign: 'center',
  },
  // Device Owner Badge Styles
  deviceOwnerBadge: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 20,
    alignItems: 'center',
  },
  deviceOwnerBadgeActive: {
    backgroundColor: '#e8f5e9',
    borderWidth: 1,
    borderColor: '#4caf50',
  },
  deviceOwnerBadgeInactive: {
    backgroundColor: '#fff3e0',
    borderWidth: 1,
    borderColor: '#ff9800',
  },
  deviceOwnerBadgeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  deviceOwnerBadgeTextActive: {
    color: '#2e7d32',
  },
  deviceOwnerBadgeTextInactive: {
    color: '#e65100',
  },
  section: {
    marginBottom: 25,
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 15,
    fontSize: 16,
    backgroundColor: '#fafafa',
  },
  hint: {
    fontSize: 12,
    color: '#999',
    marginTop: 5,
    lineHeight: 16,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brightnessValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0066cc',
    textAlign: 'center',
    marginBottom: 10,
  },
  warningBox: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#fff3cd',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#ffc107',
  },
  warningText: {
    fontSize: 13,
    color: '#856404',
    lineHeight: 18,
  },
  infoSubBox: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#0066cc',
  },
  infoSubText: {
    fontSize: 13,
    color: '#01579b',
    lineHeight: 18,
  },
  saveButton: {
    backgroundColor: '#0066cc',
    paddingVertical: 15,
    borderRadius: 10,
    marginTop: 20,
    shadowColor: '#0066cc',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  cancelButton: {
    backgroundColor: '#fff',
    paddingVertical: 15,
    borderRadius: 10,
    marginTop: 10,
    borderWidth: 2,
    borderColor: '#ddd',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  resetButton: {
    backgroundColor: '#ff9800',
    paddingVertical: 15,
    borderRadius: 10,
    marginTop: 10,
    borderWidth: 2,
    borderColor: '#f57c00',
  },
  resetButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  removeDeviceOwnerButton: {
    backgroundColor: '#e65100',
    paddingVertical: 15,
    borderRadius: 10,
    marginTop: 10,
    borderWidth: 2,
    borderColor: '#bf360c',
  },
  removeDeviceOwnerButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  exitButton: {
    backgroundColor: '#d32f2f',
    paddingVertical: 15,
    borderRadius: 10,
    marginTop: 10,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#b71c1c',
  },
  exitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  infoBox: {
    backgroundColor: '#e3f2fd',
    padding: 15,
    borderRadius: 10,
    marginTop: 10,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#0066cc',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0066cc',
    marginBottom: 10,
  },
  infoText: {
    fontSize: 14,
    color: '#555',
    lineHeight: 22,
  },
  emptyCertsBox: {
    marginTop: 15,
    padding: 15,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    alignItems: 'center',
  },
  emptyCertsText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
  certItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#0066cc',
  },
  certUrl: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  certFingerprint: {
    fontSize: 11,
    color: '#666',
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  certExpiry: {
    fontSize: 12,
    color: '#0066cc',
  },
  certExpired: {
    color: '#d32f2f',
    fontWeight: '600',
  },
  certDeleteButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  certDeleteText: {
    fontSize: 24,
  },
  presetButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  presetButtonActive: {
    backgroundColor: '#0066cc',
    borderColor: '#0066cc',
  },
  presetButtonText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  presetButtonTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  // Display Mode Styles
  modeSelector: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#ddd',
    backgroundColor: '#fff',
    alignItems: 'center',
    position: 'relative',
  },
  modeButtonActive: {
    backgroundColor: '#0066cc',
    borderColor: '#0066cc',
  },
  modeButtonText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  modeButtonTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  betaBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#ff9800',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#fff',
  },
  betaBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: 0.5,
  },
  betaWarningBox: {
    marginTop: 15,
    padding: 15,
    backgroundColor: '#fff3cd',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#ff9800',
  },
  betaWarningTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#856404',
    marginBottom: 8,
  },
  betaWarningText: {
    fontSize: 13,
    color: '#856404',
    lineHeight: 20,
  },
  // Device Owner Warning Styles
  deviceOwnerWarningBox: {
    backgroundColor: '#ffebee',
    borderLeftColor: '#f44336',
  },
  deviceOwnerWarningTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#c62828',
    marginBottom: 8,
  },
  deviceOwnerWarningText: {
    fontSize: 13,
    color: '#c62828',
    lineHeight: 20,
  },
  // Permission Card Styles
  permissionCard: {
    marginTop: 15,
    padding: 15,
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#4caf50',
  },
  permissionCardSuccess: {
    backgroundColor: '#e8f5e9',
    borderLeftColor: '#4caf50',
  },
  permissionCardWarning: {
    backgroundColor: '#fff3cd',
    borderLeftColor: '#ffc107',
  },
  permissionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 8,
  },
  permissionText: {
    fontSize: 13,
    color: '#2e7d32',
    lineHeight: 19,
    marginBottom: 12,
  },
  permissionButton: {
    backgroundColor: '#4caf50',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  // App Picker Styles
  pickerButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 10,
    alignItems: 'center',
  },
  pickerButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#0066cc',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  modalCloseButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseButtonText: {
    fontSize: 28,
    color: '#fff',
    fontWeight: 'bold',
  },
  appItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#fff',
  },
  appName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  appPackage: {
    fontSize: 13,
    color: '#666',
    fontFamily: 'monospace',
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 8,
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  radioOptionSelected: {
    backgroundColor: '#e3f2fd',
    borderColor: '#0066cc',
  },
  radioCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#999',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioCircleSelected: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#0066cc',
  },
  radioLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  radioHint: {
    fontSize: 13,
    color: '#666',
  },
});

export default SettingsScreen;
