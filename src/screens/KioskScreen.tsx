import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, TouchableWithoutFeedback, Text, NativeEventEmitter, NativeModules, AppState, DeviceEventEmitter, Dimensions, Pressable } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNBrightness from 'react-native-brightness-newarch';
import { useIsFocused } from '@react-navigation/native';
import WebViewComponent, { WebViewComponentRef } from '../components/WebViewComponent';
import StatusBar from '../components/StatusBar';
import MotionDetector from '../components/MotionDetector';
import ExternalAppOverlay from '../components/ExternalAppOverlay';
import { StorageService } from '../utils/storage';
import KioskModule from '../utils/KioskModule';
import AppLauncherModule from '../utils/AppLauncherModule';
import OverlayServiceModule from '../utils/OverlayServiceModule';
import BlockingOverlayModule from '../utils/BlockingOverlayModule';
import AutoBrightnessModule from '../utils/AutoBrightnessModule';
import { ApiService } from '../utils/ApiService';
import { ScheduledEvent, getActiveEvent } from '../types/planner';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import Icon from '../components/Icon';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

const { HttpServerModule } = NativeModules;

type KioskScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Kiosk'>;

interface KioskScreenProps {
  navigation: KioskScreenNavigationProp;
}

const KioskScreen: React.FC<KioskScreenProps> = ({ navigation }) => {
  const isFocused = useIsFocused();
  const [url, setUrl] = useState<string>('');
  const [autoReload, setAutoReload] = useState<boolean>(false);
  const [screensaverEnabled, setScreensaverEnabled] = useState(false);
  const [isScreensaverActive, setIsScreensaverActive] = useState(false);
  const [defaultBrightness, setDefaultBrightness] = useState<number>(0.5);
  const [screensaverBrightness, setScreensaverBrightness] = useState<number>(0);
  const [inactivityEnabled, setInactivityEnabled] = useState(true);
  const [inactivityDelay, setInactivityDelay] = useState(600000);
  const [motionEnabled, setMotionEnabled] = useState(false);
  const [motionCameraPosition, setMotionCameraPosition] = useState<'front' | 'back'>('front');
  const [isPreCheckingMotion, setIsPreCheckingMotion] = useState(false); // Pré-vérification avant activation screensaver
  const preCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  
  // Spatial proximity detection for N-tap (WebView mode)
  const firstTapXRef = useRef<number>(0);
  const firstTapYRef = useRef<number>(0);
  const TAP_PROXIMITY_RADIUS = 80; // Taps must be within 80px of first tap
  
  // Return button settings (WebView mode) - Visual indicator only
  // N-tap detection is handled via onUserInteraction callback from WebView
  const [returnButtonVisible, setReturnButtonVisible] = useState<boolean>(false);
  const [returnTapCount, setReturnTapCount] = useState<number>(5);
  const [returnTapTimeout, setReturnTapTimeout] = useState<number>(1500);
  const [returnMode, setReturnMode] = useState<string>('tap_anywhere');
  const [returnButtonPosition, setReturnButtonPosition] = useState<string>('bottom-right');
  
  // URL Rotation states
  const [urlRotationEnabled, setUrlRotationEnabled] = useState<boolean>(false);
  const [urlRotationList, setUrlRotationList] = useState<string[]>([]);
  
  // Auto-brightness states
  const [autoBrightnessEnabled, setAutoBrightnessEnabled] = useState<boolean>(false);
  const [autoBrightnessMin, setAutoBrightnessMin] = useState<number>(0.1);
  const [autoBrightnessMax, setAutoBrightnessMax] = useState<number>(1.0);
  const [autoBrightnessInterval, setAutoBrightnessInterval] = useState<number>(1000);
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

  // WebView Back Button states
  const webViewRef = useRef<WebViewComponentRef>(null);
  const [webViewBackButtonEnabled, setWebViewBackButtonEnabled] = useState<boolean>(false);
  const [webViewBackButtonXPercent, setWebViewBackButtonXPercent] = useState<number>(2);
  const [webViewBackButtonYPercent, setWebViewBackButtonYPercent] = useState<number>(10);
  const [canGoBack, setCanGoBack] = useState<boolean>(false);

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

  // Auto-brightness: pause when screensaver activates, resume when it deactivates
  useEffect(() => {
    const handleAutoBrightnessForScreensaver = async () => {
      if (!autoBrightnessEnabled) return;
      
      if (isScreensaverActive) {
        // Screensaver active: pause auto-brightness and apply screensaver brightness
        try {
          await AutoBrightnessModule.stopAutoBrightness();
          await RNBrightness.setBrightnessLevel(screensaverBrightness);
          console.log('[KioskScreen] Auto-brightness paused for screensaver');
        } catch (error) {
          console.error('[KioskScreen] Error pausing auto-brightness:', error);
        }
      } else {
        // Screensaver deactivated: resume auto-brightness
        try {
          await AutoBrightnessModule.startAutoBrightness(
            autoBrightnessMin,
            autoBrightnessMax,
            autoBrightnessInterval
          );
          console.log('[KioskScreen] Auto-brightness resumed after screensaver');
        } catch (error) {
          console.error('[KioskScreen] Error resuming auto-brightness:', error);
        }
      }
    };
    
    handleAutoBrightnessForScreensaver();
  }, [isScreensaverActive, autoBrightnessEnabled, autoBrightnessMin, autoBrightnessMax, autoBrightnessInterval, screensaverBrightness]);

  // Désactiver le screensaver quand l'écran perd le focus (navigation vers Settings)
  useEffect(() => {
    if (!isFocused) {
      if (isScreensaverActive) {
        console.log('[KioskScreen] Screen lost focus, disabling screensaver');
        setIsScreensaverActive(false);
      }
      if (isPreCheckingMotion) {
        console.log('[KioskScreen] Screen lost focus, stopping motion surveillance');
        setIsPreCheckingMotion(false);
      }
      clearTimer();
      // Restaurer la luminosité normale (or restart auto-brightness)
      (async () => {
        try {
          if (autoBrightnessEnabled) {
            await AutoBrightnessModule.startAutoBrightness(
              autoBrightnessMin,
              autoBrightnessMax,
              autoBrightnessInterval
            );
          } else {
            await RNBrightness.setBrightnessLevel(defaultBrightness);
          }
        } catch (error) {
          console.error('[KioskScreen] Error restoring brightness:', error);
        }
      })();
    }
  }, [isFocused, isScreensaverActive, isPreCheckingMotion, defaultBrightness, autoBrightnessEnabled, autoBrightnessMin, autoBrightnessMax, autoBrightnessInterval]);

  // API Service initialization - connect REST API to app controls
  useEffect(() => {
    const initApiService = async () => {
      await ApiService.initialize({
        onSetBrightness: async (value: number) => {
          try {
            // If auto-brightness is enabled, disable it first
            if (autoBrightnessEnabled) {
              await AutoBrightnessModule.stopAutoBrightness();
              setAutoBrightnessEnabled(false);
              await StorageService.saveAutoBrightnessEnabled(false);
              console.log('[API] Auto-brightness disabled (manual brightness set)');
            }
            
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
        onScreenOn: () => {
          setIsScreensaverActive(false);
          resetTimer();
          console.log('[API] Screen ON');
        },
        onScreenOff: () => {
          setIsScreensaverActive(true);
          console.log('[API] Screen OFF');
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
        onAutoBrightnessEnable: async (min: number, max: number) => {
          try {
            // Convert from API 0-100 to internal 0-1
            const minNormalized = min / 100;
            const maxNormalized = max / 100;
            
            setAutoBrightnessMin(minNormalized);
            setAutoBrightnessMax(maxNormalized);
            setAutoBrightnessEnabled(true);
            
            // Save current manual brightness before enabling
            await StorageService.saveAutoBrightnessSavedManual(defaultBrightness);
            
            // Start auto-brightness
            await AutoBrightnessModule.startAutoBrightness(
              minNormalized,
              maxNormalized,
              autoBrightnessInterval
            );
            
            // Save settings
            await StorageService.saveAutoBrightnessEnabled(true);
            await StorageService.saveAutoBrightnessMin(minNormalized);
            await StorageService.saveAutoBrightnessMax(maxNormalized);
            
            console.log('[API] Auto-brightness enabled (min:', min, '%, max:', max, '%)');
          } catch (error) {
            console.error('[API] Error enabling auto-brightness:', error);
          }
        },
        onAutoBrightnessDisable: async () => {
          try {
            await AutoBrightnessModule.stopAutoBrightness();
            setAutoBrightnessEnabled(false);
            
            // Restore saved manual brightness
            const savedBrightness = await StorageService.getAutoBrightnessSavedManual();
            if (savedBrightness !== null) {
              await RNBrightness.setBrightnessLevel(savedBrightness);
              setDefaultBrightness(savedBrightness);
            }
            
            await StorageService.saveAutoBrightnessEnabled(false);
            console.log('[API] Auto-brightness disabled');
          } catch (error) {
            console.error('[API] Error disabling auto-brightness:', error);
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

  // Listen for screen state changes from native (power button pressed)
  useEffect(() => {
    // Check initial screen state
    const checkInitialScreenState = async () => {
      try {
        if (KioskModule?.isScreenOn) {
          const isOn = await KioskModule.isScreenOn();
          console.log('[KioskScreen] Initial screen state:', isOn ? 'ON' : 'OFF');
          ApiService.updateStatus({ screenOn: isOn });
        }
      } catch (error) {
        console.error('[KioskScreen] Error checking initial screen state:', error);
      }
    };
    
    checkInitialScreenState();
    
    const screenStateListener = DeviceEventEmitter.addListener(
      'onScreenStateChanged',
      (isScreenOn: boolean) => {
        console.log('[KioskScreen] Screen state changed:', isScreenOn ? 'ON' : 'OFF');
        
        // Update API status with new screen state
        ApiService.updateStatus({
          screenOn: isScreenOn,
        });
        
        // If screen turned on, deactivate screensaver
        if (isScreenOn && isScreensaverActive) {
          setIsScreensaverActive(false);
          resetTimer();
        }
      }
    );

    return () => {
      screenStateListener.remove();
    };
  }, [isScreensaverActive]);

  // Listen for volume changes from hardware buttons
  useEffect(() => {
    // Check initial volume
    const checkInitialVolume = async () => {
      try {
        if (HttpServerModule?.getVolume) {
          const currentVolume = await HttpServerModule.getVolume();
          console.log('[KioskScreen] Initial volume:', currentVolume);
          ApiService.updateStatus({ volume: currentVolume });
        }
      } catch (error) {
        console.error('[KioskScreen] Error checking initial volume:', error);
      }
    };
    
    checkInitialVolume();
    
    const volumeListener = DeviceEventEmitter.addListener(
      'onVolumeChanged',
      (volumePercent: number) => {
        console.log('[KioskScreen] Volume changed to:', volumePercent);
        
        // Update API status with new volume
        ApiService.updateStatus({
          volume: volumePercent,
        });
      }
    );

    return () => {
      volumeListener.remove();
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
      autoBrightnessEnabled: autoBrightnessEnabled,
      autoBrightnessMin: autoBrightnessMin,
      autoBrightnessMax: autoBrightnessMax,
    });
  }, [url, defaultBrightness, isScreensaverActive, urlRotationEnabled, urlRotationList, urlRotationInterval, currentUrlIndex, autoBrightnessEnabled, autoBrightnessMin, autoBrightnessMax]);

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
    const unsubscribeFocus = navigation.addListener('focus', async () => {
      // HACK: Force AsyncStorage to check SharedPreferences migration
      // This triggers AsyncStorage to look for data in SharedPreferences and migrate it to SQLite
      try {
        await AsyncStorage.getItem('__force_init__');
      } catch (e) {}
      
      await loadSettings();
    });

    const unsubscribeBlur = navigation.addListener('blur', async () => {
      clearTimer();
      setIsScreensaverActive(false);
      // On ne restaure pas la luminosité volontairement
      
      // Désactiver les overlays de blocage quand on quitte le kiosk
      try {
        await BlockingOverlayModule.setEnabled(false);
      } catch (e) {
        // Silent fail
      }
      
      // Arrêter le service overlay natif en mode WebView (si actif pour les blocking overlays)
      try {
        await OverlayServiceModule.stopOverlayService();
      } catch (e) {
        // Silent fail - might not be running
      }
    });

    return () => {
      unsubscribeFocus();
      unsubscribeBlur();
    };
  }, [navigation]);

  useEffect(() => {
    // Don't apply manual brightness when auto-brightness is active
    if (autoBrightnessEnabled) return;
    
    if (!isScreensaverActive) {
      (async () => {
        try {
          await RNBrightness.setBrightnessLevel(defaultBrightness);
        } catch (error) {
          console.error('[KioskScreen] Error setting brightness:', error);
        }
      })();
    }
  }, [defaultBrightness, isScreensaverActive, autoBrightnessEnabled]);

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
      console.log('[KioskScreen] savedUrl:', savedUrl);
      const savedAutoReload = await StorageService.getAutoReload();
      const savedKioskEnabled = await StorageService.getKioskEnabled();
      const savedScreensaverEnabled = await StorageService.getScreensaverEnabled();
      const savedDefaultBrightness = await StorageService.getDefaultBrightness();
      const savedScreensaverBrightness = await StorageService.getScreensaverBrightness();
      const savedInactivityEnabled = await StorageService.getScreensaverInactivityEnabled();
      const savedInactivityDelay = await StorageService.getScreensaverInactivityDelay();
      const savedMotionEnabled = await StorageService.getScreensaverMotionEnabled();
      const savedMotionCameraPosition = await StorageService.getMotionCameraPosition();
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
      
      // Broadcast that settings are loaded (for ADB config waiting)
      try {
        await KioskModule.broadcastSettingsLoaded();
      } catch (e) {
        // Silently fail if broadcast not needed
      }
      setDefaultBrightness(savedDefaultBrightness ?? 0.5);
      setScreensaverBrightness(savedScreensaverBrightness ?? 0);
      setInactivityEnabled(savedInactivityEnabled ?? true);
      setInactivityDelay(savedInactivityDelay ?? 600000);
      setMotionEnabled(savedMotionEnabled ?? false);
      setMotionCameraPosition(savedMotionCameraPosition ?? 'front');
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
      const savedReturnTapCount = await StorageService.getReturnTapCount();
      const savedReturnTapTimeout = await StorageService.getReturnTapTimeout();
      const savedReturnMode = await StorageService.getReturnMode();
      const savedReturnButtonPosition = await StorageService.getReturnButtonPosition();
      setReturnButtonVisible(savedReturnButtonVisible);
      setReturnTapCount(savedReturnTapCount);
      setReturnTapTimeout(savedReturnTapTimeout);
      setReturnMode(savedReturnMode);
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
      
      // Load WebView Back Button settings
      const savedWebViewBackButtonEnabled = await StorageService.getWebViewBackButtonEnabled();
      const savedWebViewBackButtonXPercent = await StorageService.getWebViewBackButtonXPercent();
      const savedWebViewBackButtonYPercent = await StorageService.getWebViewBackButtonYPercent();
      setWebViewBackButtonEnabled(savedWebViewBackButtonEnabled);
      setWebViewBackButtonXPercent(savedWebViewBackButtonXPercent);
      setWebViewBackButtonYPercent(savedWebViewBackButtonYPercent);
      
      // Load Auto-Brightness settings
      const savedAutoBrightnessEnabled = await StorageService.getAutoBrightnessEnabled();
      const savedAutoBrightnessMin = await StorageService.getAutoBrightnessMin();
      const savedAutoBrightnessMax = await StorageService.getAutoBrightnessMax();
      const savedAutoBrightnessInterval = await StorageService.getAutoBrightnessUpdateInterval();
      setAutoBrightnessEnabled(savedAutoBrightnessEnabled);
      setAutoBrightnessMin(savedAutoBrightnessMin);
      setAutoBrightnessMax(savedAutoBrightnessMax);
      setAutoBrightnessInterval(savedAutoBrightnessInterval);
      
      // Start auto-brightness if enabled (only in webview mode)
      if (savedAutoBrightnessEnabled && savedDisplayMode === 'webview') {
        try {
          await AutoBrightnessModule.startAutoBrightness(
            savedAutoBrightnessMin,
            savedAutoBrightnessMax,
            savedAutoBrightnessInterval
          );
          console.log('[KioskScreen] Auto-brightness started');
        } catch (error) {
          console.error('[KioskScreen] Failed to start auto-brightness:', error);
        }
      }
      
      // Load and apply Blocking Overlays settings
      const savedBlockingOverlaysEnabled = await StorageService.getBlockingOverlaysEnabled();
      const savedBlockingOverlaysRegions = await StorageService.getBlockingOverlaysRegions();
      
      let blockingOverlaysActive = false;
      if (savedBlockingOverlaysEnabled) {
        await BlockingOverlayModule.applyConfiguration(true, savedBlockingOverlaysRegions);
        blockingOverlaysActive = true;
      } else {
        await BlockingOverlayModule.setEnabled(false);
      }
      
      // WebView mode: 5-tap detection is handled via onUserInteraction callback
      // No need for native overlay, stop it if running
      if (savedDisplayMode === 'webview') {
        try {
          await OverlayServiceModule.stopOverlayService();
        } catch (e) {
          // Silent fail - might not be running
        }
      }

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
        await launchExternalApp(savedExternalAppPackage, savedReturnTapCount, savedReturnTapTimeout, savedReturnMode, savedReturnButtonPosition);
      }
    } catch (error) {
      console.error('[KioskScreen] loadSettings error:', error);
    }
  };

  const resetTimer = () => {
    clearTimer();
    if (screensaverEnabled && inactivityEnabled) {
      timerRef.current = setTimeout(() => {
        // Si motion detection activée, surveiller le mouvement avant d'activer le screensaver
        if (motionEnabled) {
          console.log('[KioskScreen] Timer expiré - activation surveillance mouvement');
          setIsPreCheckingMotion(true);
          // Démarrer un timer de 10 secondes - si aucun mouvement détecté, activer screensaver
          preCheckTimerRef.current = setTimeout(() => {
            console.log('[KioskScreen] 10s sans mouvement détecté, activation du screensaver');
            setIsScreensaverActive(true);
            // Garder isPreCheckingMotion à false car le screensaver prend le relais
            setIsPreCheckingMotion(false);
          }, 10000); // 10 secondes pour détecter une présence
        } else {
          // Pas de motion detection, activer directement
          setIsScreensaverActive(true);
        }
      }, inactivityDelay);
    }
  };

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (preCheckTimerRef.current) {
      clearTimeout(preCheckTimerRef.current);
      preCheckTimerRef.current = null;
    }
    setIsPreCheckingMotion(false);
  };

  // Ref for 5-tap debounce (prevent multiple events per tap)
  const lastTapTimeRef = useRef<number>(0);
  
  // Ref to track screensaver state for callbacks (avoid stale closures)
  const isScreensaverActiveRef = useRef(isScreensaverActive);
  useEffect(() => {
    isScreensaverActiveRef.current = isScreensaverActive;
  }, [isScreensaverActive]);

  // Ref to track pre-checking state for callbacks
  const isPreCheckingMotionRef = useRef(isPreCheckingMotion);
  useEffect(() => {
    isPreCheckingMotionRef.current = isPreCheckingMotion;
  }, [isPreCheckingMotion]);

  const onUserInteraction = useCallback(async (event?: { isTap?: boolean; x?: number; y?: number }) => {
    // Toute interaction utilisateur sort du mode surveillance et relance le timer normal
    if (isPreCheckingMotionRef.current) {
      console.log('[KioskScreen] Interaction utilisateur - sortie mode surveillance');
      if (preCheckTimerRef.current) {
        clearTimeout(preCheckTimerRef.current);
        preCheckTimerRef.current = null;
      }
      setIsPreCheckingMotion(false);
    }
    
    resetTimer();
    if (isScreensaverActiveRef.current) {
      setIsScreensaverActive(false);
      // Restaurer immédiatement la luminosité (sauf si auto-brightness car le useEffect s'en charge)
      if (!autoBrightnessEnabled) {
        try {
          await RNBrightness.setBrightnessLevel(defaultBrightness);
        } catch (error) {
          console.error('[KioskScreen] Error restoring brightness on interaction:', error);
        }
      }
    }
    
    // N-tap detection for WebView mode - Only count dedicated 'tap' events from clicks
    // In button mode: taps are handled by the button itself, not here
    if (displayMode === 'webview' && event?.isTap && returnMode === 'tap_anywhere') {
      const now = Date.now();
      const tapX = event.x ?? 0;
      const tapY = event.y ?? 0;
      
      // tap_anywhere mode - no spatial restriction
      if (tapCountRef.current === 0) {
        lastTapTimeRef.current = now;
        console.log(`[${returnTapCount}-tap ANYWHERE] First tap at (${tapX.toFixed(0)}, ${tapY.toFixed(0)})`);
      }
      
      tapCountRef.current += 1;
      console.log(`[${returnTapCount}-tap] Count: ${tapCountRef.current}/${returnTapCount} at (${tapX.toFixed(0)}, ${tapY.toFixed(0)})`);
      
      // If N taps reached, go to PIN screen
      if (tapCountRef.current >= returnTapCount) {
        console.log(`[${returnTapCount}-tap] ✅ ${returnTapCount} taps reached! Going to PIN`);
        tapCountRef.current = 0;
        if (tapTimerRef.current) {
          clearTimeout(tapTimerRef.current);
        }
        clearTimer();
        setIsScreensaverActive(false);
        navigation.navigate('Pin');
        return;
      }
      
      // Timeout global : reset si plus de returnTapTimeout depuis le premier tap
      if (tapTimerRef.current) {
        clearTimeout(tapTimerRef.current);
      }
      
      tapTimerRef.current = setTimeout(() => {
        const elapsed = Date.now() - lastTapTimeRef.current;
        console.log(`[${returnTapCount}-tap] ⏱ Timeout - ${elapsed}ms elapsed, resetting count`);
        tapCountRef.current = 0;
      }, returnTapTimeout - (now - lastTapTimeRef.current));
    }
  }, [displayMode, navigation, resetTimer, clearTimer, returnTapCount, returnTapTimeout, defaultBrightness, TAP_PROXIMITY_RADIUS]);


  const onScreensaverTap = useCallback(async () => {
    // Sortir du mode surveillance si actif
    if (isPreCheckingMotionRef.current) {
      console.log('[KioskScreen] Tap sur screensaver - sortie mode surveillance');
      if (preCheckTimerRef.current) {
        clearTimeout(preCheckTimerRef.current);
        preCheckTimerRef.current = null;
      }
      setIsPreCheckingMotion(false);
    }
    
    setIsScreensaverActive(false);
    resetTimer();
    // Restaurer immédiatement la luminosité (sauf si auto-brightness car le useEffect s'en charge)
    if (!autoBrightnessEnabled) {
      try {
        await RNBrightness.setBrightnessLevel(defaultBrightness);
      } catch (error) {
        console.error('[KioskScreen] Error restoring brightness on tap:', error);
      }
    }
  }, [resetTimer, defaultBrightness, autoBrightnessEnabled]);

  const onMotionDetected = useCallback(async () => {
    // Cas 1: Surveillance en cours (avant activation screensaver) - quelqu'un est présent !
    if (isPreCheckingMotionRef.current && !isScreensaverActiveRef.current) {
      console.log('[KioskScreen] Mouvement détecté pendant surveillance - relance du timer complet');
      // Annuler le timer de surveillance
      if (preCheckTimerRef.current) {
        clearTimeout(preCheckTimerRef.current);
        preCheckTimerRef.current = null;
      }
      // Sortir du mode surveillance
      setIsPreCheckingMotion(false);
      // RELANCER LE TIMER COMPLET d'inactivité (ex: 10 minutes)
      resetTimer();
      return;
    }
    
    // Cas 2: Screensaver déjà actif - le réveiller
    if (isScreensaverActiveRef.current) {
      console.log('[KioskScreen] Mouvement détecté, réveil du screensaver');
      setIsScreensaverActive(false);
      // Restaurer immédiatement la luminosité (sauf si auto-brightness car le useEffect s'en charge)
      if (!autoBrightnessEnabled) {
        try {
          await RNBrightness.setBrightnessLevel(defaultBrightness);
        } catch (error) {
          console.error('[KioskScreen] Error restoring brightness on motion:', error);
        }
      }
      // RELANCER LE TIMER COMPLET d'inactivité
      resetTimer();
    }
  }, [defaultBrightness, resetTimer, autoBrightnessEnabled]);

  const enableScreensaverEffects = async () => {
    try {
      await RNBrightness.setBrightnessLevel(screensaverBrightness);
    } catch (error) {
      console.error('Erreur activation luminosité screensaver:', error);
    }
  };

  const launchExternalApp = async (packageName: string, tapCount?: number, tapTimeout?: number, mode?: string, buttonPos?: string): Promise<void> => {
    try {
      const isInstalled = await AppLauncherModule.isAppInstalled(packageName);
      if (!isInstalled) {
        console.error(`[KioskScreen] App not installed: ${packageName}`);
        return;
      }

      // Use provided values or fall back to state
      const finalTapCount = tapCount ?? returnTapCount;
      const finalTapTimeout = tapTimeout ?? returnTapTimeout;
      const finalReturnMode = mode ?? returnMode;
      const finalButtonPosition = buttonPos ?? returnButtonPosition;

      // Démarrer l'OverlayService AVANT de lancer l'app externe
      try {
        await OverlayServiceModule.startOverlayService(finalTapCount, finalTapTimeout, finalReturnMode, finalButtonPosition);
        console.log(`[KioskScreen] OverlayService started with tapCount=${finalTapCount}, tapTimeout=${finalTapTimeout}, mode=${finalReturnMode}, position=${finalButtonPosition}`);
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

    if (tapCountRef.current === returnTapCount) {
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

  const handleReturnButtonTap = (): void => {
    const now = Date.now();
    
    if (tapCountRef.current === 0) {
      lastTapTimeRef.current = now;
      console.log(`[${returnTapCount}-tap BUTTON] First tap`);
    }
    
    tapCountRef.current += 1;
    console.log(`[${returnTapCount}-tap BUTTON] Count: ${tapCountRef.current}/${returnTapCount}`);
    
    // If N taps reached, go to PIN screen
    if (tapCountRef.current >= returnTapCount) {
      console.log(`[${returnTapCount}-tap BUTTON] ✅ ${returnTapCount} taps reached! Going to PIN`);
      tapCountRef.current = 0;
      if (tapTimerRef.current) {
        clearTimeout(tapTimerRef.current);
      }
      clearTimer();
      setIsScreensaverActive(false);
      navigation.navigate('Pin');
      return;
    }
    
    // Timeout: reset if returnTapTimeout elapsed since first tap
    if (tapTimerRef.current) {
      clearTimeout(tapTimerRef.current);
    }
    
    tapTimerRef.current = setTimeout(() => {
      console.log(`[${returnTapCount}-tap BUTTON] ⏱ Timeout - resetting count`);
      tapCountRef.current = 0;
    }, returnTapTimeout - (now - lastTapTimeRef.current));
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
            ref={webViewRef}
            key={webViewKey} 
            url={url} 
            autoReload={autoReload} 
            keyboardMode={keyboardMode} 
            onUserInteraction={onUserInteraction}
            jsToExecute={jsToExecute}
            onJsExecuted={() => setJsToExecute('')}
            showBackButton={webViewBackButtonEnabled}
            onNavigationStateChange={setCanGoBack}
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

      {/* Motion Detector - Active during pre-check OR when screensaver is ON (only if screen is focused) */}
      <MotionDetector
        enabled={isFocused && motionEnabled && (isPreCheckingMotion || isScreensaverActive)}
        onMotionDetected={onMotionDetected}
        sensitivity="medium"
        cameraPosition={motionCameraPosition}
      />

      {/* Visual Button - WebView mode only */}
      {/* In button mode: button always clickable, visibility controlled by opacity */}
      {/* In tap_anywhere mode: no button shown */}
      {displayMode === 'webview' && returnMode === 'button' && (
        <TouchableOpacity 
          style={[
            styles.visualIndicator,
            {
              opacity: returnButtonVisible ? 1 : 0,
              backgroundColor: returnButtonVisible ? '#2196F3' : 'transparent',
            },
          ]}
          activeOpacity={1}
          onPress={handleReturnButtonTap}
        >
          <Text style={[styles.visualIndicatorText, { opacity: returnButtonVisible ? 1 : 0 }]}>↩</Text>
        </TouchableOpacity>
      )}

      {/* WebView Back Button - for web navigation only */}
      {displayMode === 'webview' && webViewBackButtonEnabled && canGoBack && (
        <View
          style={[
            styles.webBackButton,
            {
              left: `${webViewBackButtonXPercent}%`,
              top: `${webViewBackButtonYPercent}%`,
            }
          ]}
        >
          <TouchableWithoutFeedback onPress={() => webViewRef.current?.goBack()}>
            <View style={styles.webBackButtonTouchable}>
              <MaterialCommunityIcons name="arrow-left" size={28} color="#ffffff" />
            </View>
          </TouchableWithoutFeedback>
        </View>
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
  visualIndicator: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 50,
    height: 50,
    backgroundColor: '#2196F3',
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    zIndex: 1000,
  },
  visualIndicatorText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  webBackButton: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 999,
  },
  webBackButtonTouchable: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
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
