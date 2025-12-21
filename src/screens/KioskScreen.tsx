import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, NativeEventEmitter, NativeModules, AppState } from 'react-native';
import RNBrightness from 'react-native-brightness-newarch';
import WebViewComponent from '../components/WebViewComponent';
import StatusBar from '../components/StatusBar';
import MotionDetector from '../components/MotionDetector';
import ExternalAppOverlay from '../components/ExternalAppOverlay';
import { StorageService } from '../utils/storage';
import KioskModule from '../utils/KioskModule';
import AppLauncherModule from '../utils/AppLauncherModule';
import OverlayServiceModule from '../utils/OverlayServiceModule';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';

type KioskScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Kiosk'>;

interface KioskScreenProps {
  navigation: KioskScreenNavigationProp;
}

const KioskScreen: React.FC<KioskScreenProps> = ({ navigation }) => {
  const [url, setUrl] = useState<string>('');
  const [autoReload, setAutoReload] = useState<boolean>(false);
  const [screensaverEnabled, setScreensaverEnabled] = useState(false);
  const [isScreensaverActive, setIsScreensaverActive] = useState(false);
  const [defaultBrightness, setDefaultBrightness] = useState<number>(0.5);
  const [screensaverBrightness, setScreensaverBrightness] = useState<number>(0);
  const [inactivityEnabled, setInactivityEnabled] = useState(true);
  const [inactivityDelay, setInactivityDelay] = useState(600000);
  const [motionEnabled, setMotionEnabled] = useState(false);
  const [statusBarEnabled, setStatusBarEnabled] = useState(false);
  const [statusBarOnOverlay, setStatusBarOnOverlay] = useState(true);
  const [statusBarOnReturn, setStatusBarOnReturn] = useState(true);
  const timerRef = useRef<any>(null);

  // External app states
  const [displayMode, setDisplayMode] = useState<'webview' | 'external_app'>('webview');
  const [externalAppPackage, setExternalAppPackage] = useState<string | null>(null);
  const [autoRelaunchApp, setAutoRelaunchApp] = useState<boolean>(true);
  const [appCrashCount, setAppCrashCount] = useState<number>(0);
  const relaunchTimerRef = useRef<any>(null);
  const [isAppLaunched, setIsAppLaunched] = useState<boolean>(false);
  const [externalAppTestMode, setExternalAppTestMode] = useState<boolean>(true);
  const [keyboardMode, setKeyboardMode] = useState<string>('default');
  const appStateRef = useRef(AppState.currentState);
  const appLaunchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tapCountRef = useRef<number>(0);
  const tapTimerRef = useRef<NodeJS.Timeout | null>(null);

  // AppState listener - détecte quand l'app revient au premier plan
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async nextAppState => {
      // L'app revient au premier plan (depuis background ou inactive)
      if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
        try {
          // 1. D'abord vérifier le flag natif (5-tap, retour volontaire)
          const shouldBlock = await KioskModule.shouldBlockAutoRelaunch();
          
          if (shouldBlock) {
            // Reset le flag après l'avoir lu
            await KioskModule.clearBlockAutoRelaunch();
            setIsAppLaunched(false);
            appStateRef.current = nextAppState;
            return;
          }
          
          // 2. Ensuite vérifier le mode test (back button depuis app externe)
          // IMPORTANT: Lire directement depuis storage pour avoir la valeur actuelle
          const currentTestMode = await StorageService.getExternalAppTestMode();
          if (currentTestMode) {
            setIsAppLaunched(false);
            appStateRef.current = nextAppState;
            return;
          }
          
          // 3. Sinon, relancer automatiquement l'app externe
          if (displayMode === 'external_app' && externalAppPackage && autoRelaunchApp) {
            // Petit délai pour laisser l'UI se stabiliser
            appLaunchTimeoutRef.current = setTimeout(() => {
              launchExternalApp(externalAppPackage);
            }, 300);
          }
        } catch (error) {
          console.error('[KioskScreen] Error checking block flag:', error);
        }
      }
      
      appStateRef.current = nextAppState;
    });

    return () => {
      subscription.remove();
      if (appLaunchTimeoutRef.current) {
        clearTimeout(appLaunchTimeoutRef.current);
      }
    };
  }, [displayMode, externalAppPackage, autoRelaunchApp]);

  useEffect(() => {
    const unsubscribeFocus = navigation.addListener('focus', () => {
      loadSettings();
    });

    const unsubscribeBlur = navigation.addListener('blur', () => {
      clearTimer();
      setIsScreensaverActive(false);
      // On ne restaure pas la luminosité volontairement
    });

    return () => {
      unsubscribeFocus();
      unsubscribeBlur();
    };
  }, [navigation]);

  useEffect(() => {
    if (!isScreensaverActive) {
      (async () => {
        try {
          await RNBrightness.setBrightnessLevel(defaultBrightness);
        } catch (error) {
          console.error('[KioskScreen] Error setting brightness:', error);
        }
      })();
    }
  }, [defaultBrightness, isScreensaverActive]);

  useEffect(() => {
    if (isScreensaverActive) {
      enableScreensaverEffects();
    }
  }, [isScreensaverActive, screensaverBrightness]);

  useEffect(() => {
    if (screensaverEnabled && inactivityEnabled) {
      resetTimer();
    } else {
      clearTimer();
      setIsScreensaverActive(false);
    }
  }, [screensaverEnabled, inactivityEnabled, inactivityDelay]);

  useEffect(() => {
    // Event emitter pour les événements natifs (MainActivity)
    const eventEmitter = new NativeEventEmitter(NativeModules.DeviceEventManagerModule);

    // Listen for app return events (émis depuis MainActivity.onResume)
    const appReturnedListener = eventEmitter.addListener(
      'onAppReturned',
      handleAppReturned
    );

    // Listen for navigateToPin event (5-tap depuis overlay ou Volume Up)
    const navigateToPinListener = eventEmitter.addListener(
      'navigateToPin',
      () => {
        // Le flag natif est déjà mis par OverlayService.returnToFreeKiosk()
        navigation.navigate('Pin');
      }
    );

    return () => {
      appReturnedListener.remove();
      navigateToPinListener.remove();
      if (relaunchTimerRef.current) {
        clearTimeout(relaunchTimerRef.current);
      }
    };
  }, [autoRelaunchApp, displayMode, externalAppPackage, appCrashCount, navigation]);

  const loadSettings = async (): Promise<void> => {
    try {
      const savedUrl = await StorageService.getUrl();
      const savedAutoReload = await StorageService.getAutoReload();
      const savedKioskEnabled = await StorageService.getKioskEnabled();
      const savedScreensaverEnabled = await StorageService.getScreensaverEnabled();
      const savedDefaultBrightness = await StorageService.getDefaultBrightness();
      const savedScreensaverBrightness = await StorageService.getScreensaverBrightness();
      const savedInactivityEnabled = await StorageService.getScreensaverInactivityEnabled();
      const savedInactivityDelay = await StorageService.getScreensaverInactivityDelay();
      const savedMotionEnabled = await StorageService.getScreensaverMotionEnabled();
      const savedStatusBarEnabled = await StorageService.getStatusBarEnabled();
      const savedStatusBarOnOverlay = await StorageService.getStatusBarOnOverlay();
      const savedStatusBarOnReturn = await StorageService.getStatusBarOnReturn();

      if (savedUrl) setUrl(savedUrl);
      setAutoReload(savedAutoReload);
      setScreensaverEnabled(savedScreensaverEnabled ?? false);
      setDefaultBrightness(savedDefaultBrightness ?? 0.5);
      setScreensaverBrightness(savedScreensaverBrightness ?? 0);
      setInactivityEnabled(savedInactivityEnabled ?? true);
      setInactivityDelay(savedInactivityDelay ?? 600000);
      setMotionEnabled(savedMotionEnabled ?? false);
      setStatusBarEnabled(savedStatusBarEnabled ?? false);
      setStatusBarOnOverlay(savedStatusBarOnOverlay ?? true);
      setStatusBarOnReturn(savedStatusBarOnReturn ?? true);

      // Load external app settings
      const savedDisplayMode = await StorageService.getDisplayMode();
      const savedExternalAppPackage = await StorageService.getExternalAppPackage();
      const savedAutoRelaunchApp = await StorageService.getAutoRelaunchApp();

      const savedExternalAppTestMode = await StorageService.getExternalAppTestMode();
      const savedKeyboardMode = await StorageService.getKeyboardMode();

      setDisplayMode(savedDisplayMode);
      setExternalAppPackage(savedExternalAppPackage);
      setAutoRelaunchApp(savedAutoRelaunchApp);
      setExternalAppTestMode(savedExternalAppTestMode);
      setKeyboardMode(savedKeyboardMode);

      if (savedKioskEnabled) {
        try {
          // Pass external app package so it gets added to whitelist
          const packageToWhitelist = savedDisplayMode === 'external_app' ? savedExternalAppPackage : null;
          await KioskModule.startLockTask(packageToWhitelist);
        } catch {
          // Silent fail
        }
      } else {
        try {
          await KioskModule.stopLockTask();
        } catch {
          // Silent fail
        }
      }

      // Launch external app if in external_app mode
      if (savedDisplayMode === 'external_app' && savedExternalAppPackage) {
        await launchExternalApp(savedExternalAppPackage);
      }
    } catch (error) {
      console.error('[KioskScreen] loadSettings error:', error);
    }
  };

  const resetTimer = () => {
    clearTimer();
    if (screensaverEnabled && inactivityEnabled) {
      timerRef.current = setTimeout(() => {
        setIsScreensaverActive(true);
      }, inactivityDelay);
    }
  };

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const onUserInteraction = () => {
    resetTimer();
    if (isScreensaverActive) {
      setIsScreensaverActive(false);
    }
  };

  const onScreensaverTap = () => {
    setIsScreensaverActive(false);
    resetTimer();
  };

  const onMotionDetected = () => {
    if (isScreensaverActive) {
      setIsScreensaverActive(false);
      resetTimer(); // IMPORTANT: Reset timer after waking up
    }
  };

  const enableScreensaverEffects = async () => {
    try {
      await RNBrightness.setBrightnessLevel(screensaverBrightness);
    } catch (error) {
      console.error('Erreur activation luminosité screensaver:', error);
    }
  };

  const launchExternalApp = async (packageName: string): Promise<void> => {
    try {
      const isInstalled = await AppLauncherModule.isAppInstalled(packageName);
      if (!isInstalled) {
        console.error(`[KioskScreen] App not installed: ${packageName}`);
        return;
      }

      // Démarrer l'OverlayService AVANT de lancer l'app externe
      try {
        await OverlayServiceModule.startOverlayService();
      } catch (overlayError) {
        console.warn('[KioskScreen] Failed to start overlay service:', overlayError);
        // Continue anyway - l'app externe peut toujours être lancée
      }

      await AppLauncherModule.launchExternalApp(packageName);
      setIsAppLaunched(true);
    } catch (error) {
      console.error('[KioskScreen] Failed to launch app:', error);
    }
  };

  const handleAppReturned = (event?: { voluntary?: boolean }): void => {
    const isVoluntary = event?.voluntary ?? false;
    setIsAppLaunched(false);

    // Arrêter l'OverlayService quand on revient sur FreeKiosk
    OverlayServiceModule.stopOverlayService()
      .catch(error => console.warn('[KioskScreen] Failed to stop overlay:', error));

    // Si retour volontaire (5 taps), le flag natif est déjà mis par OverlayService
    if (isVoluntary) {
      setAppCrashCount(0);
    }
    // Note: Le relaunch automatique est maintenant géré par AppState listener
  };

  const handleSecretTap = (): void => {
    tapCountRef.current++;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);

    if (tapCountRef.current === 5) {
      tapCountRef.current = 0;
      clearTimer();
      setIsScreensaverActive(false);
      navigation.navigate('Pin');
    }

    tapTimerRef.current = setTimeout(() => {
      tapCountRef.current = 0;
    }, 2000);
  };

  const handleReturnToExternalApp = async (): Promise<void> => {
    if (externalAppPackage) {
      await launchExternalApp(externalAppPackage);
    }
  };

  const handleGoToSettings = (): void => {
    clearTimer();
    setIsScreensaverActive(false);
    navigation.navigate('Pin');
  };

  return (
    <View style={styles.container}>
      {displayMode === 'webview' ? (
        <>
          {statusBarEnabled && <StatusBar />}
          <WebViewComponent url={url} autoReload={autoReload} keyboardMode={keyboardMode} onUserInteraction={onUserInteraction} />
        </>
      ) : (
        <ExternalAppOverlay
          externalAppPackage={externalAppPackage}
          isAppLaunched={isAppLaunched}
          testModeEnabled={externalAppTestMode}
          showStatusBar={statusBarEnabled && statusBarOnReturn}
          onReturnToApp={handleReturnToExternalApp}
          onGoToSettings={handleGoToSettings}
        />
      )}

      {/* Motion Detector - Only active when screensaver is ON */}
      <MotionDetector
        enabled={motionEnabled && isScreensaverActive}
        onMotionDetected={onMotionDetected}
        sensitivity="medium"
      />

      <TouchableOpacity
        style={styles.secretButton}
        onPress={handleSecretTap}
        activeOpacity={1}
      />

      {isScreensaverActive && screensaverEnabled && (
        <TouchableOpacity
          style={styles.screensaverOverlay}
          activeOpacity={1}
          onPress={onScreensaverTap}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  secretButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 80,
    height: 80,
    backgroundColor: 'transparent',
  },
  screensaverOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#000',
    opacity: 1,
    zIndex: 1000,
  },
});

export default KioskScreen;
