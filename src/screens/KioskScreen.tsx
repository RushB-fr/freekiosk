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
import { ApiService } from '../utils/ApiService';
import { ScheduledEvent, getActiveEvent } from '../types/planner';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';

const { HttpServerModule } = NativeModules;

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
  const [showBattery, setShowBattery] = useState(true);
  const [showWifi, setShowWifi] = useState(true);
  const [showBluetooth, setShowBluetooth] = useState(true);
  const [showVolume, setShowVolume] = useState(true);
  const [showTime, setShowTime] = useState(true);
  const timerRef = useRef<any>(null);

  // External app states
  const [displayMode, setDisplayMode] = useState<'webview' | 'external_app'>('webview');
  const [externalAppPackage, setExternalAppPackage] = useState<string | null>(null);
  const [autoRelaunchApp, setAutoRelaunchApp] = useState<boolean>(true);
  const [appCrashCount, setAppCrashCount] = useState<number>(0);
  const relaunchTimerRef = useRef<any>(null);
  const [isAppLaunched, setIsAppLaunched] = useState<boolean>(false);
  const [backButtonMode, setBackButtonMode] = useState<string>('test');
  const [backButtonTimerDelay, setBackButtonTimerDelay] = useState<number>(10);
  const [countdownActive, setCountdownActive] = useState<boolean>(false);
  const [countdownSeconds, setCountdownSeconds] = useState<number>(0);
  const countdownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [keyboardMode, setKeyboardMode] = useState<string>('default');
  const [allowPowerButton, setAllowPowerButton] = useState<boolean>(false);
  const appStateRef = useRef(AppState.currentState);
  const appLaunchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapCountRef = useRef<number>(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Return button settings (WebView mode)
  const [returnButtonVisible, setReturnButtonVisible] = useState<boolean>(false);
  const [returnButtonPosition, setReturnButtonPosition] = useState<string>('bottom-right');
  
  // URL Rotation states
  const [urlRotationEnabled, setUrlRotationEnabled] = useState<boolean>(false);
  const [urlRotationList, setUrlRotationList] = useState<string[]>([]);
  const [urlRotationInterval, setUrlRotationInterval] = useState<number>(30000);
  const [currentUrlIndex, setCurrentUrlIndex] = useState<number>(0);
  const urlRotationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // URL Planner states
  const [urlPlannerEnabled, setUrlPlannerEnabled] = useState<boolean>(false);
  const [urlPlannerEvents, setUrlPlannerEvents] = useState<ScheduledEvent[]>([]);
  const [activeScheduledEvent, setActiveScheduledEvent] = useState<ScheduledEvent | null>(null);
  const urlPlannerTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [baseUrl, setBaseUrl] = useState<string>(''); // Original URL before planner/rotation
  
  // WebView reload key - increment to force reload
  const [webViewKey, setWebViewKey] = useState<number>(0);
  
  // JavaScript to execute in WebView (from API)
  const [jsToExecute, setJsToExecute] = useState<string>('');

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
          
          // 2. Ensuite vérifier le mode back button
          // IMPORTANT: Lire directement depuis storage pour avoir la valeur actuelle
          const currentBackButtonMode = await StorageService.getBackButtonMode();
          
          if (currentBackButtonMode === 'test') {
            // Mode test: pas de relance auto
            setIsAppLaunched(false);
            appStateRef.current = nextAppState;
            return;
          }
          
          if (currentBackButtonMode === 'timer') {
            // Mode timer: afficher countdown puis relancer
            const timerDelay = await StorageService.getBackButtonTimerDelay();
            setCountdownSeconds(timerDelay);
            setCountdownActive(true);
            setIsAppLaunched(false);
            appStateRef.current = nextAppState;
            return;
          }
          
          // Mode immediate: relancer directement
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

  // API Service initialization - connect REST API to app controls
  useEffect(() => {
    const initApiService = async () => {
      await ApiService.initialize({
        onSetBrightness: async (value: number) => {
          try {
            // API sends 0-100, RNBrightness needs 0-1
            const normalizedValue = value / 100;
            await RNBrightness.setBrightnessLevel(normalizedValue);
            setDefaultBrightness(normalizedValue);
            // Persist to storage so Settings shows updated value
            await StorageService.saveDefaultBrightness(normalizedValue);
            console.log('[API] Brightness set to', value);
          } catch (error) {
            console.error('[API] Error setting brightness:', error);
          }
        },
        onScreensaverOn: () => {
          setIsScreensaverActive(true);
          console.log('[API] Screensaver ON');
        },
        onScreensaverOff: () => {
          setIsScreensaverActive(false);
          resetTimer();
          console.log('[API] Screensaver OFF');
        },
        onWake: () => {
          setIsScreensaverActive(false);
          resetTimer();
          console.log('[API] Wake');
        },
        onReload: () => {
          setWebViewKey(prev => prev + 1);
          console.log('[API] Reload triggered');
        },
        onSetUrl: async (newUrl: string) => {
          setUrl(newUrl);
          // Persist to storage so Settings shows updated value
          await StorageService.saveUrl(newUrl);
          console.log('[API] URL set to', newUrl);
        },
        onTts: (text: string) => {
          // TTS not implemented yet, but ready for future
          console.log('[API] TTS request:', text);
        },
        onSetVolume: async (value: number) => {
          try {
            // API sends 0-100, native module handles it
            if (HttpServerModule?.setVolume) {
              await HttpServerModule.setVolume(value);
            }
            console.log('[API] Volume set to', value);
          } catch (error) {
            console.error('[API] Error setting volume:', error);
          }
        },
        onRotationStart: () => {
          setUrlRotationEnabled(true);
          StorageService.saveUrlRotationEnabled(true);
          console.log('[API] URL Rotation started');
        },
        onRotationStop: () => {
          setUrlRotationEnabled(false);
          StorageService.saveUrlRotationEnabled(false);
          console.log('[API] URL Rotation stopped');
        },
        onToast: async (text: string) => {
          try {
            if (HttpServerModule?.showToast) {
              await HttpServerModule.showToast(text);
            }
            console.log('[API] Toast:', text);
          } catch (error) {
            console.error('[API] Error showing toast:', error);
          }
        },
        onLaunchApp: async (packageName: string) => {
          try {
            await AppLauncherModule.launchExternalApp(packageName);
            console.log('[API] Launched app:', packageName);
          } catch (error) {
            console.error('[API] Error launching app:', error);
          }
        },
        onExecuteJs: (code: string) => {
          // Will be handled by WebView - need to pass down
          setJsToExecute(code);
          console.log('[API] Execute JS:', code.substring(0, 50));
        },
        onReboot: async () => {
          try {
            await KioskModule.reboot();
            console.log('[API] Reboot requested');
          } catch (error) {
            console.error('[API] Error rebooting:', error);
          }
        },
        onClearCache: () => {
          // Force reload with cache clear
          setWebViewKey(prev => prev + 1);
          console.log('[API] Cache cleared (WebView reloaded)');
        },
        onRemoteKey: async (key: string) => {
          try {
            await KioskModule.sendRemoteKey(key);
            console.log('[API] Remote key:', key);
          } catch (error) {
            console.error('[API] Error sending remote key:', error);
          }
        },
      });
      
      // Auto-start the API server if enabled
      await ApiService.autoStart();
    };

    initApiService();

    return () => {
      ApiService.destroy();
    };
  }, []);

  // Update API status when relevant state changes
  useEffect(() => {
    ApiService.updateStatus({
      currentUrl: url,
      brightness: Math.round(defaultBrightness * 100),
      screensaverActive: isScreensaverActive,
      kioskMode: true, // Always in kiosk mode when this screen is active
      canGoBack: false,
      loading: false,
      rotationEnabled: urlRotationEnabled,
      rotationUrls: urlRotationList,
      rotationInterval: Math.round(urlRotationInterval / 1000),
      rotationCurrentIndex: currentUrlIndex,
    });
  }, [url, defaultBrightness, isScreensaverActive, urlRotationEnabled, urlRotationList, urlRotationInterval, currentUrlIndex]);

  // Countdown timer effect (transparent - no UI)
  useEffect(() => {
    if (countdownActive && countdownSeconds > 0) {
      countdownTimerRef.current = setTimeout(() => {
        setCountdownSeconds(prev => prev - 1);
      }, 1000);
    } else if (countdownActive && countdownSeconds === 0) {
      // Countdown terminé, relancer l'app
      setCountdownActive(false);
      if (externalAppPackage) {
        launchExternalApp(externalAppPackage);
      }
    }

    return () => {
      if (countdownTimerRef.current) {
        clearTimeout(countdownTimerRef.current);
      }
    };
  }, [countdownActive, countdownSeconds, externalAppPackage]);

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

  // URL Rotation effect
  useEffect(() => {
    // Clear any existing rotation timer
    if (urlRotationTimerRef.current) {
      clearInterval(urlRotationTimerRef.current);
      urlRotationTimerRef.current = null;
    }
    
    // Only enable rotation in webview mode with valid URLs
    // AND when planner is not active (planner has priority)
    if (
      displayMode === 'webview' &&
      urlRotationEnabled &&
      urlRotationList.length >= 2 &&
      urlRotationInterval >= 5000 &&
      !activeScheduledEvent // Don't rotate when planner event is active
    ) {
      // Set initial URL to first in list
      if (urlRotationList.length > 0 && currentUrlIndex === 0) {
        setUrl(urlRotationList[0]);
      }
      
      // Start rotation timer
      urlRotationTimerRef.current = setInterval(() => {
        setCurrentUrlIndex(prevIndex => {
          const nextIndex = (prevIndex + 1) % urlRotationList.length;
          setUrl(urlRotationList[nextIndex]);
          return nextIndex;
        });
      }, urlRotationInterval);
    }
    
    return () => {
      if (urlRotationTimerRef.current) {
        clearInterval(urlRotationTimerRef.current);
        urlRotationTimerRef.current = null;
      }
    };
  }, [displayMode, urlRotationEnabled, urlRotationList, urlRotationInterval, activeScheduledEvent]);

  // URL Planner effect - checks every minute for scheduled events
  useEffect(() => {
    // Clear any existing planner timer
    if (urlPlannerTimerRef.current) {
      clearInterval(urlPlannerTimerRef.current);
      urlPlannerTimerRef.current = null;
    }
    
    if (displayMode !== 'webview' || !urlPlannerEnabled || urlPlannerEvents.length === 0) {
      setActiveScheduledEvent(null);
      return;
    }
    
    // Check for active event immediately
    const checkAndUpdateActiveEvent = () => {
      const activeEvent = getActiveEvent(urlPlannerEvents);
      
      if (activeEvent && activeEvent.id !== activeScheduledEvent?.id) {
        // New active event found
        setActiveScheduledEvent(activeEvent);
        setUrl(activeEvent.url);
      } else if (!activeEvent && activeScheduledEvent) {
        // No active event, but there was one before
        setActiveScheduledEvent(null);
        // Restore base URL or let rotation take over
        if (!urlRotationEnabled || urlRotationList.length < 2) {
          setUrl(baseUrl);
        }
      }
    };
    
    // Check immediately
    checkAndUpdateActiveEvent();
    
    // Check every minute for schedule changes
    urlPlannerTimerRef.current = setInterval(checkAndUpdateActiveEvent, 60000);
    
    return () => {
      if (urlPlannerTimerRef.current) {
        clearInterval(urlPlannerTimerRef.current);
        urlPlannerTimerRef.current = null;
      }
    };
  }, [displayMode, urlPlannerEnabled, urlPlannerEvents, baseUrl, urlRotationEnabled, urlRotationList.length]);

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
      const savedShowBattery = await StorageService.getStatusBarShowBattery();
      const savedShowWifi = await StorageService.getStatusBarShowWifi();
      const savedShowBluetooth = await StorageService.getStatusBarShowBluetooth();
      const savedShowVolume = await StorageService.getStatusBarShowVolume();
      const savedShowTime = await StorageService.getStatusBarShowTime();

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
      setShowBattery(savedShowBattery ?? true);
      setShowWifi(savedShowWifi ?? true);
      setShowBluetooth(savedShowBluetooth ?? true);
      setShowVolume(savedShowVolume ?? true);
      setShowTime(savedShowTime ?? true);

      // Load external app settings
      const savedDisplayMode = await StorageService.getDisplayMode();
      const savedExternalAppPackage = await StorageService.getExternalAppPackage();
      const savedAutoRelaunchApp = await StorageService.getAutoRelaunchApp();

      const savedBackButtonMode = await StorageService.getBackButtonMode();
      const savedBackButtonTimerDelay = await StorageService.getBackButtonTimerDelay();
      const savedKeyboardMode = await StorageService.getKeyboardMode();
      const savedAllowPowerButton = await StorageService.getAllowPowerButton();

      setDisplayMode(savedDisplayMode);
      setExternalAppPackage(savedExternalAppPackage);
      setAutoRelaunchApp(savedAutoRelaunchApp);
      setBackButtonMode(savedBackButtonMode);
      setBackButtonTimerDelay(savedBackButtonTimerDelay);
      setKeyboardMode(savedKeyboardMode);
      setAllowPowerButton(savedAllowPowerButton);
      
      // Load return button settings (for WebView mode)
      const savedReturnButtonVisible = await StorageService.getOverlayButtonVisible();
      const savedReturnButtonPosition = await StorageService.getOverlayButtonPosition();
      setReturnButtonVisible(savedReturnButtonVisible);
      setReturnButtonPosition(savedReturnButtonPosition);
      
      // Load URL Rotation settings
      const savedUrlRotationEnabled = await StorageService.getUrlRotationEnabled();
      const savedUrlRotationList = await StorageService.getUrlRotationList();
      const savedUrlRotationInterval = await StorageService.getUrlRotationInterval();
      setUrlRotationEnabled(savedUrlRotationEnabled);
      setUrlRotationList(savedUrlRotationList);
      setUrlRotationInterval(savedUrlRotationInterval * 1000); // Convert seconds to ms
      
      // Load URL Planner settings
      const savedUrlPlannerEnabled = await StorageService.getUrlPlannerEnabled();
      const savedUrlPlannerEvents = await StorageService.getUrlPlannerEvents();
      setUrlPlannerEnabled(savedUrlPlannerEnabled);
      setUrlPlannerEvents(savedUrlPlannerEvents);
      
      // Store base URL for when planner/rotation is not active
      if (savedUrl) setBaseUrl(savedUrl);

      if (savedKioskEnabled) {
        try {
          // Pass external app package so it gets added to whitelist
          const packageToWhitelist = savedDisplayMode === 'external_app' && savedExternalAppPackage ? savedExternalAppPackage : undefined;
          await KioskModule.startLockTask(packageToWhitelist, savedAllowPowerButton);
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
          {statusBarEnabled && (
            <StatusBar
              showBattery={showBattery}
              showWifi={showWifi}
              showBluetooth={showBluetooth}
              showVolume={showVolume}
              showTime={showTime}
            />
          )}
          <WebViewComponent 
            key={webViewKey} 
            url={url} 
            autoReload={autoReload} 
            keyboardMode={keyboardMode} 
            onUserInteraction={onUserInteraction}
            jsToExecute={jsToExecute}
            onJsExecuted={() => setJsToExecute('')}
          />
        </>
      ) : (
        <ExternalAppOverlay
          externalAppPackage={externalAppPackage}
          isAppLaunched={isAppLaunched}
          backButtonMode={backButtonMode}
          showStatusBar={statusBarEnabled && statusBarOnReturn}
          showBattery={showBattery}
          showWifi={showWifi}
          showBluetooth={showBluetooth}
          showVolume={showVolume}
          showTime={showTime}
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

      {/* Return Button - WebView mode only, positioned based on settings */}
      {displayMode === 'webview' && (
        <TouchableOpacity
          style={[
            styles.secretButton,
            returnButtonVisible && styles.secretButtonVisible,
            returnButtonPosition === 'top-left' && styles.secretButtonTopLeft,
            returnButtonPosition === 'top-right' && styles.secretButtonTopRight,
            returnButtonPosition === 'bottom-left' && styles.secretButtonBottomLeft,
            returnButtonPosition === 'bottom-right' && styles.secretButtonBottomRight,
          ]}
          onPress={handleSecretTap}
          activeOpacity={returnButtonVisible ? 0.7 : 1}
        >
          {returnButtonVisible && (
            <Text style={styles.secretButtonText}>↩</Text>
          )}
        </TouchableOpacity>
      )}

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
    width: 50,
    height: 50,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  secretButtonVisible: {
    backgroundColor: '#2196F3',
    borderRadius: 25,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  secretButtonText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  secretButtonTopLeft: {
    top: 10,
    left: 10,
    bottom: undefined,
    right: undefined,
  },
  secretButtonTopRight: {
    top: 10,
    right: 10,
    bottom: undefined,
    left: undefined,
  },
  secretButtonBottomLeft: {
    bottom: 10,
    left: 10,
    top: undefined,
    right: undefined,
  },
  secretButtonBottomRight: {
    bottom: 10,
    right: 10,
    top: undefined,
    left: undefined,
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
