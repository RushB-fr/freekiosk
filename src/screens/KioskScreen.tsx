import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, TouchableWithoutFeedback, Text, NativeEventEmitter, NativeModules, AppState, DeviceEventEmitter, Dimensions, Pressable } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNBrightness from 'react-native-brightness-newarch';
import { useIsFocused, useFocusEffect } from '@react-navigation/native';
import WebViewComponent, { WebViewComponentRef } from '../components/WebViewComponent';
import StatusBar from '../components/StatusBar';
import MotionDetector from '../components/MotionDetector';
import ExternalAppOverlay from '../components/ExternalAppOverlay';
import { StorageService } from '../utils/storage';
import { saveSecurePin } from '../utils/secureStorage';
import KioskModule from '../utils/KioskModule';
import AppLauncherModule from '../utils/AppLauncherModule';
import OverlayServiceModule from '../utils/OverlayServiceModule';
import BlockingOverlayModule from '../utils/BlockingOverlayModule';
import AutoBrightnessModule from '../utils/AutoBrightnessModule';
import { ApiService } from '../utils/ApiService';
import DeviceControlService from '../services/DeviceControlService';
import { ScheduledEvent, getActiveEvent } from '../types/planner';
import { ScreenScheduleRule, getNextWakeTime, getActiveSleepRule, getNextSleepTime } from '../types/screenScheduler';
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
  const [motionAlwaysOn, setMotionAlwaysOn] = useState(false);
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
  const [allowNotifications, setAllowNotifications] = useState<boolean>(false);
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
  
  // Screen Sleep Scheduler states
  const [screenSchedulerEnabled, setScreenSchedulerEnabled] = useState<boolean>(false);
  const [screenSchedulerRules, setScreenSchedulerRules] = useState<ScreenScheduleRule[]>([]);
  const [screenSchedulerWakeOnTouch, setScreenSchedulerWakeOnTouch] = useState<boolean>(true);
  const [isScheduledSleep, setIsScheduledSleep] = useState<boolean>(false); // true when screen is OFF due to scheduler
  const screenSchedulerTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Inactivity Return to Home states
  const [inactivityReturnEnabled, setInactivityReturnEnabled] = useState<boolean>(false);
  const [inactivityReturnDelay, setInactivityReturnDelay] = useState<number>(60); // seconds
  const [inactivityReturnResetOnNav, setInactivityReturnResetOnNav] = useState<boolean>(true);
  const [inactivityReturnClearCache, setInactivityReturnClearCache] = useState<boolean>(false);
  const [inactivityReturnScrollTop, setInactivityReturnScrollTop] = useState<boolean>(true);
  const inactivityReturnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentWebViewUrlRef = useRef<string>(''); // Track current WebView URL for return logic

  // Track focus transitions (true→false) to avoid false cleanup triggers
  const prevIsFocusedRef = useRef<boolean>(true);

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

  // URL Filtering states
  const [urlFilterEnabled, setUrlFilterEnabled] = useState<boolean>(false);
  const [urlFilterMode, setUrlFilterMode] = useState<'blacklist' | 'whitelist'>('blacklist');
  const [urlFilterList, setUrlFilterList] = useState<string[]>([]);
  const [urlFilterShowFeedback, setUrlFilterShowFeedback] = useState<boolean>(false);
  const [pdfViewerEnabled, setPdfViewerEnabled] = useState<boolean>(false);

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
          
          // Mode immediate: relancer directement (pas besoin de autoRelaunchApp)
          if (displayMode === 'external_app' && externalAppPackage) {
            console.log('[KioskScreen] Immediate mode: relaunching', externalAppPackage);
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
  }, [displayMode, externalAppPackage]);

  // Auto-brightness: pause when screensaver activates, resume when it deactivates
  useEffect(() => {
    const handleAutoBrightnessForScreensaver = async () => {
      // Skip if scheduled sleep is active (handled separately)
      if (isScheduledSleep) return;
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
  }, [isScreensaverActive, autoBrightnessEnabled, autoBrightnessMin, autoBrightnessMax, autoBrightnessInterval, screensaverBrightness, isScheduledSleep]);

  // Désactiver le screensaver quand l'écran perd le focus (navigation vers Settings)
  // Only triggers cleanup on actual focus→blur transition (not when other deps change)
  useEffect(() => {
    const wasFocused = prevIsFocusedRef.current;
    prevIsFocusedRef.current = isFocused;

    // Only run cleanup when transitioning from focused → unfocused
    if (wasFocused && !isFocused) {
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
        onScreensaverOn: async () => {
          setScreensaverEnabled(true);
          await StorageService.saveScreensaverEnabled(true);
          console.log('[API] Screensaver setting ENABLED');
        },
        onScreensaverOff: async () => {
          setScreensaverEnabled(false);
          await StorageService.saveScreensaverEnabled(false);
          // If screensaver is currently active, deactivate it too
          setIsScreensaverActive(false);
          resetTimer();
          console.log('[API] Screensaver setting DISABLED');
        },
        onScreenOn: () => {
          setIsScreensaverActive(false);
          resetTimer();
          ApiService.updateStatus({ screenOn: true });
          console.log('[API] Screen ON');
        },
        onScreenOff: () => {
          setIsScreensaverActive(true);
          ApiService.updateStatus({ screenOn: false });
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
          setBaseUrl(newUrl); // Update baseUrl so InactivityReturn uses the new URL as home
          setWebViewKey(prev => prev + 1);
          // Persist to storage so Settings shows updated value
          await StorageService.saveUrl(newUrl);
          console.log('[API] URL set to', newUrl);
        },
        onTts: (text: string) => {
          // TTS is handled natively by HttpServerModule TextToSpeech
          console.log('[API] TTS request (handled natively):', text);
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
          // Native side clears WebView cache/cookies/storage
          // JS side forces a full WebView reload by remounting
          if (webViewRef.current) {
            webViewRef.current.clearCache();
          }
          setWebViewKey(prev => prev + 1);
          console.log('[API] Cache cleared (native + WebView remount)');
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

      // Auto-start MQTT client if enabled
      await ApiService.autoStartMqtt();
    };

    initApiService();

    return () => {
      ApiService.stopMqtt();
      ApiService.destroy();
    };
  }, []);

  // Listen for screen state changes from native (power button pressed)
  useEffect(() => {
    // Check initial screen state (only on mount)
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
        if (isScreenOn && isScreensaverActiveRef.current) {
          setIsScreensaverActive(false);
          resetTimer();
        }
      }
    );

    return () => {
      screenStateListener.remove();
    };
  }, []);

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
      
      // Reload blocking overlays to ensure they stay active when returning from settings
      try {
        const blockingEnabled = await StorageService.getBlockingOverlaysEnabled();
        const blockingRegions = await StorageService.getBlockingOverlaysRegions();
        if (blockingEnabled) {
          await BlockingOverlayModule.applyConfiguration(true, blockingRegions);
          // Recalculate after a short delay to ensure correct dimensions
          setTimeout(async () => {
            try {
              await BlockingOverlayModule.updateOverlays();
              console.log('[KioskScreen] Blocking overlays reloaded on focus');
            } catch (e) {
              console.error('[KioskScreen] Failed to reload overlays:', e);
            }
          }, 300);
        }
      } catch (e) {
        console.error('[KioskScreen] Error reloading blocking overlays:', e);
      }
    });

    const unsubscribeBlur = navigation.addListener('blur', async () => {
      clearTimer();
      clearInactivityReturnTimer();
      setIsScreensaverActive(false);
      // Stop the scheduler interval to prevent sleep re-entry while on PIN/Settings
      if (screenSchedulerTimerRef.current) {
        clearInterval(screenSchedulerTimerRef.current);
        screenSchedulerTimerRef.current = null;
      }
      setIsScheduledSleep(false); // Reset scheduled sleep when leaving kiosk screen
      isScheduledSleepRef.current = false;
      ApiService.updateStatus({ scheduledSleep: false });
      DeviceControlService.setScheduledSleep(false);
      // Cancel any pending scheduler alarms
      KioskModule.cancelScheduledScreenAlarms().catch(() => {});
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

  // ==================== Screen Sleep Scheduler ====================
  // Strategy:
  //   1. JS setInterval (30s) checks if we need to enter/exit sleep — handles ENTRY into sleep
  //   2. When entering sleep, schedule a native AlarmManager alarm for the wake time
  //   3. The AlarmManager fires a BroadcastReceiver that wakes the screen + sends JS event
  //   4. JS event listener handles restoring brightness/auto-brightness/state
  // This is necessary because lockNow() (Device Owner) suspends the JS thread,
  // so setInterval can't reliably fire for wake-up.

  // Helper: schedule the next native alarm for wake-up
  const scheduleNativeWakeAlarm = useCallback(async (activeRule: ScreenScheduleRule) => {
    const wakeDate = getNextWakeTime(activeRule, new Date());
    if (wakeDate) {
      try {
        await KioskModule.scheduleScreenWake(wakeDate.getTime());
        console.log(`[ScreenScheduler] Native wake alarm set for ${wakeDate.toLocaleTimeString()}`);
      } catch (error) {
        console.error('[ScreenScheduler] Failed to set native wake alarm:', error);
      }
    }
  }, []);

  // Helper: schedule the next native alarm for sleep
  const scheduleNativeSleepAlarm = useCallback(async (rules: ScreenScheduleRule[]) => {
    const nextSleep = getNextSleepTime(rules, new Date());
    if (nextSleep) {
      try {
        await KioskModule.scheduleScreenSleep(nextSleep.date.getTime());
        console.log(`[ScreenScheduler] Native sleep alarm set for ${nextSleep.date.toLocaleTimeString()}`);
      } catch (error) {
        console.error('[ScreenScheduler] Failed to set native sleep alarm:', error);
      }
    }
  }, []);

  // Helper: enter scheduled sleep mode
  const enterScheduledSleep = useCallback(async (activeRule: ScreenScheduleRule) => {
    console.log('[ScreenScheduler] Entering scheduled sleep');
    setIsScheduledSleep(true);
    isScheduledSleepRef.current = true;
    ApiService.updateStatus({ scheduledSleep: true });
    DeviceControlService.setScheduledSleep(true);

    try {
      // Stop auto-brightness if active
      if (autoBrightnessEnabled) {
        await AutoBrightnessModule.stopAutoBrightness();
      }
      // Schedule native alarm for wake-up BEFORE turning screen off
      await scheduleNativeWakeAlarm(activeRule);
      // Now turn screen off (Device Owner = lockNow, else brightness 0)
      await KioskModule.turnScreenOff();
      console.log('[ScreenScheduler] Screen turned OFF via native module');
    } catch (error) {
      console.warn('[ScreenScheduler] Native screen off failed, using brightness fallback:', error);
      try {
        await RNBrightness.setBrightnessLevel(0);
      } catch (e) {
        console.error('[ScreenScheduler] Brightness fallback also failed:', e);
      }
    }
  }, [autoBrightnessEnabled, scheduleNativeWakeAlarm]);

  // Helper: exit scheduled sleep mode
  const exitScheduledSleep = useCallback(async () => {
    console.log('[ScreenScheduler] Exiting scheduled sleep — waking screen');
    setIsScheduledSleep(false);
    isScheduledSleepRef.current = false;
    ApiService.updateStatus({ scheduledSleep: false });
    DeviceControlService.setScheduledSleep(false);
    resetTimer(); // Restart inactivity timer

    try {
      // Turn screen on via native (WakeLock + FLAG_KEEP_SCREEN_ON)
      await KioskModule.turnScreenOn();
      console.log('[ScreenScheduler] Screen turned ON via native module');
      // Restore brightness
      if (autoBrightnessEnabled) {
        await AutoBrightnessModule.startAutoBrightness(autoBrightnessMin, autoBrightnessMax, autoBrightnessInterval);
      } else {
        await RNBrightness.setBrightnessLevel(defaultBrightness);
      }
    } catch (error) {
      console.error('[ScreenScheduler] Error waking screen:', error);
      try {
        await RNBrightness.setBrightnessLevel(defaultBrightness);
      } catch (e) {
        console.error('[ScreenScheduler] Brightness restore also failed:', e);
      }
    }

    // Schedule next sleep alarm
    if (screenSchedulerEnabled && screenSchedulerRules.length > 0) {
      await scheduleNativeSleepAlarm(screenSchedulerRules);
    }
  }, [autoBrightnessEnabled, autoBrightnessMin, autoBrightnessMax, autoBrightnessInterval, defaultBrightness, screenSchedulerEnabled, screenSchedulerRules, scheduleNativeSleepAlarm]);

  // Listen for native alarm events (onScheduledWake / onScheduledSleep)
  useEffect(() => {
    if (!screenSchedulerEnabled) return;

    const wakeSubscription = DeviceEventEmitter.addListener('onScheduledWake', () => {
      console.log('[ScreenScheduler] 📢 Native WAKE alarm received');
      if (isScheduledSleepRef.current) {
        exitScheduledSleep();
      }
    });

    const sleepSubscription = DeviceEventEmitter.addListener('onScheduledSleep', () => {
      console.log('[ScreenScheduler] 📢 Native SLEEP alarm received');
      if (!isScheduledSleepRef.current) {
        const activeRule = getActiveSleepRule(screenSchedulerRules, new Date());
        if (activeRule) {
          enterScheduledSleep(activeRule);
        }
      }
    });

    return () => {
      wakeSubscription.remove();
      sleepSubscription.remove();
    };
  }, [screenSchedulerEnabled, screenSchedulerRules, exitScheduledSleep, enterScheduledSleep]);

  // JS-side scheduler check (setInterval) — entry into sleep + backup for wake
  // IMPORTANT: We use isScheduledSleepRef.current (not the state variable) inside
  // checkScreenSchedule to avoid a feedback loop. If isScheduledSleep were in the
  // dependency array, every call to enterScheduledSleep/exitScheduledSleep would
  // re-trigger this effect and immediately re-evaluate, making it impossible to
  // wake the screen during a sleep window.
  useEffect(() => {
    // Clear any existing scheduler timer
    if (screenSchedulerTimerRef.current) {
      clearInterval(screenSchedulerTimerRef.current);
      screenSchedulerTimerRef.current = null;
    }

    if (!screenSchedulerEnabled || screenSchedulerRules.length === 0) {
      // Scheduler disabled — cancel any pending native alarms and wake if needed
      if (isScheduledSleepRef.current) {
        console.log('[ScreenScheduler] Scheduler disabled — waking screen');
        (async () => {
          try {
            await KioskModule.cancelScheduledScreenAlarms();
          } catch (e) { /* ignore */ }
          await exitScheduledSleep();
        })();
      } else {
        // Just cancel alarms in case any are pending
        KioskModule.cancelScheduledScreenAlarms().catch(() => {});
      }
      return;
    }

    const checkScreenSchedule = () => {
      const activeRule = getActiveSleepRule(screenSchedulerRules, new Date());
      const shouldSleep = activeRule !== null;

      if (shouldSleep && !isScheduledSleepRef.current) {
        // Enter sleep — this is the primary entry path
        enterScheduledSleep(activeRule!);
      } else if (!shouldSleep && isScheduledSleepRef.current) {
        // Wake up — this is the backup path (JS timer still running, e.g., non-Device-Owner)
        // In Device Owner mode, the native alarm handles wake instead
        exitScheduledSleep();
      }
    };

    // Check immediately
    checkScreenSchedule();

    // Check every 30 seconds — serves as:
    //   - Primary entry into sleep (JS side, screen is still on so timer works)
    //   - Backup wake for non-Device-Owner mode (screen stays on, just dimmed)
    screenSchedulerTimerRef.current = setInterval(checkScreenSchedule, 30000);

    return () => {
      if (screenSchedulerTimerRef.current) {
        clearInterval(screenSchedulerTimerRef.current);
        screenSchedulerTimerRef.current = null;
      }
    };
  }, [screenSchedulerEnabled, screenSchedulerRules, enterScheduledSleep, exitScheduledSleep]);


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
      // Check for pending ADB config FIRST - apply to AsyncStorage before reading
      try {
        const pendingConfig = await KioskModule.getPendingAdbConfig();
        if (pendingConfig) {
          console.log('[KioskScreen] Found pending ADB config, applying to AsyncStorage...');
          const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
          const entries: [string, string][] = [];
          for (const [key, value] of Object.entries(pendingConfig)) {
            if (typeof value === 'string') {
              if (key === '@kiosk_pin') {
                // PIN must be saved to Keystore (not just AsyncStorage)
                await saveSecurePin(value);
                console.log('[KioskScreen] PIN saved to secure Keystore via pending ADB config');
              } else {
                entries.push([key, value]);
              }
            }
          }
          if (entries.length > 0) {
            await AsyncStorage.multiSet(entries);
            console.log('[KioskScreen] Applied', entries.length, 'pending ADB config entries to AsyncStorage');
          }
          await KioskModule.clearPendingAdbConfig();
          console.log('[KioskScreen] Pending ADB config cleared');
        }
      } catch (pendingError) {
        console.log('[KioskScreen] No pending ADB config or error:', pendingError);
      }

      // Batch load ALL settings in a single multiGet call (1 bridge crossing instead of 50+)
      const settings = await StorageService.getAllSettings();
      const K = StorageService.KEYS;

      // Helper to parse values from the batch map
      const str = (key: string): string | null => settings.get(key) ?? null;
      const bool = (key: string, def: boolean): boolean => {
        const v = settings.get(key);
        if (v == null) return def;
        try { return JSON.parse(v); } catch { return def; }
      };
      const num = (key: string, def: number): number => {
        const v = settings.get(key);
        if (v == null) return def;
        const n = parseFloat(v);
        return isNaN(n) ? def : n;
      };
      const jsonParse = (key: string, def: unknown): unknown => {
        const v = settings.get(key);
        if (v == null) return def;
        try { return JSON.parse(v); } catch { return def; }
      };

      const savedUrl = str(K.URL);
      console.log('[KioskScreen] savedUrl:', savedUrl);
      const savedAutoReload = bool(K.AUTO_RELOAD, true);
      const savedKioskEnabled = bool(K.KIOSK_ENABLED, false);
      const savedScreensaverEnabled = bool(K.SCREENSAVER_ENABLED, false);
      const savedDefaultBrightness = num(K.DEFAULT_BRIGHTNESS, 0.5);
      const savedScreensaverBrightness = num(K.SCREENSAVER_BRIGHTNESS, 0);
      const savedInactivityEnabled = bool(K.SCREENSAVER_INACTIVITY_ENABLED, true);
      const savedInactivityDelay = num(K.SCREENSAVER_INACTIVITY_DELAY, 600000);
      const savedMotionEnabled = bool(K.SCREENSAVER_MOTION_ENABLED, false);
      const savedMotionAlwaysOn = bool(K.MQTT_MOTION_ALWAYS_ON, false);
      const savedMotionCameraPosition = (str(K.MOTION_CAMERA_POSITION) ?? 'front') as 'front' | 'back';
      const savedStatusBarEnabled = bool(K.STATUS_BAR_ENABLED, false);
      const savedStatusBarOnOverlay = bool(K.STATUS_BAR_ON_OVERLAY, true);
      const savedStatusBarOnReturn = bool(K.STATUS_BAR_ON_RETURN, true);
      const savedShowBattery = bool(K.STATUS_BAR_SHOW_BATTERY, true);
      const savedShowWifi = bool(K.STATUS_BAR_SHOW_WIFI, true);
      const savedShowBluetooth = bool(K.STATUS_BAR_SHOW_BLUETOOTH, true);
      const savedShowVolume = bool(K.STATUS_BAR_SHOW_VOLUME, true);
      const savedShowTime = bool(K.STATUS_BAR_SHOW_TIME, true);

      if (savedUrl) setUrl(savedUrl);
      setAutoReload(savedAutoReload);
      setScreensaverEnabled(savedScreensaverEnabled);
      
      // Broadcast that settings are loaded (for ADB config waiting)
      try {
        await KioskModule.broadcastSettingsLoaded();
      } catch (e) {
        // Silently fail if broadcast not needed
      }
      setDefaultBrightness(savedDefaultBrightness);
      setScreensaverBrightness(savedScreensaverBrightness);
      setInactivityEnabled(savedInactivityEnabled);
      setInactivityDelay(savedInactivityDelay);
      setMotionEnabled(savedMotionEnabled);
      setMotionAlwaysOn(savedMotionAlwaysOn);
      setMotionCameraPosition(savedMotionCameraPosition);
      setStatusBarEnabled(savedStatusBarEnabled);
      setStatusBarOnOverlay(savedStatusBarOnOverlay);
      setStatusBarOnReturn(savedStatusBarOnReturn);
      setShowBattery(savedShowBattery);
      setShowWifi(savedShowWifi);
      setShowBluetooth(savedShowBluetooth);
      setShowVolume(savedShowVolume);
      setShowTime(savedShowTime);

      // Load external app settings
      const savedDisplayMode = (str(K.DISPLAY_MODE) ?? 'webview') as 'webview' | 'external_app';
      const savedExternalAppPackage = str(K.EXTERNAL_APP_PACKAGE);
      const savedAutoRelaunchApp = bool(K.AUTO_RELAUNCH_APP, false);
      console.log('[KioskScreen] savedDisplayMode:', savedDisplayMode, 'savedExternalAppPackage:', savedExternalAppPackage, 'savedAutoRelaunchApp:', savedAutoRelaunchApp);

      const savedBackButtonMode = str(K.BACK_BUTTON_MODE) ?? 'disabled';
      const savedBackButtonTimerDelay = num(K.BACK_BUTTON_TIMER_DELAY, 5);
      const savedKeyboardMode = str(K.KEYBOARD_MODE) ?? 'default';
      const savedAllowPowerButton = bool(K.ALLOW_POWER_BUTTON, false);
      const savedAllowNotifications = bool(K.ALLOW_NOTIFICATIONS, false);
      const savedAllowSystemInfo = bool(K.ALLOW_SYSTEM_INFO, false);

      setDisplayMode(savedDisplayMode);
      setExternalAppPackage(savedExternalAppPackage);
      setAutoRelaunchApp(savedAutoRelaunchApp);
      setBackButtonMode(savedBackButtonMode);
      setBackButtonTimerDelay(savedBackButtonTimerDelay);
      setKeyboardMode(savedKeyboardMode);
      setAllowPowerButton(savedAllowPowerButton);
      setAllowNotifications(savedAllowNotifications);
      
      // Load return button settings (for WebView mode)
      const savedReturnButtonVisible = bool(K.OVERLAY_BUTTON_VISIBLE, true);
      const savedReturnTapCount = num(K.RETURN_TAP_COUNT, 5);
      const savedReturnTapTimeout = num(K.RETURN_TAP_TIMEOUT, 1500);
      const savedReturnMode = str(K.RETURN_MODE) ?? 'tap_anywhere';
      const savedReturnButtonPosition = str(K.RETURN_BUTTON_POSITION) ?? 'bottom-right';
      setReturnButtonVisible(savedReturnButtonVisible);
      setReturnTapCount(savedReturnTapCount);
      setReturnTapTimeout(savedReturnTapTimeout);
      setReturnMode(savedReturnMode);
      setReturnButtonPosition(savedReturnButtonPosition);
      
      // Load URL Rotation settings
      const savedUrlRotationEnabled = bool(K.URL_ROTATION_ENABLED, false);
      const savedUrlRotationList = jsonParse(K.URL_ROTATION_LIST, []) as string[];
      const savedUrlRotationInterval = num(K.URL_ROTATION_INTERVAL, 30);
      setUrlRotationEnabled(savedUrlRotationEnabled);
      setUrlRotationList(savedUrlRotationList);
      setUrlRotationInterval(savedUrlRotationInterval * 1000); // Convert seconds to ms
      
      // Load URL Planner settings
      const savedUrlPlannerEnabled = bool(K.URL_PLANNER_ENABLED, false);
      const savedUrlPlannerEvents = jsonParse(K.URL_PLANNER_EVENTS, []) as ScheduledEvent[];
      setUrlPlannerEnabled(savedUrlPlannerEnabled);
      setUrlPlannerEvents(savedUrlPlannerEvents);
      
      // Store base URL for when planner/rotation is not active
      if (savedUrl) setBaseUrl(savedUrl);
      
      // Load WebView Back Button settings
      const savedWebViewBackButtonEnabled = bool(K.WEBVIEW_BACK_BUTTON_ENABLED, false);
      const savedWebViewBackButtonXPercent = num(K.WEBVIEW_BACK_BUTTON_X_PERCENT, 5);
      const savedWebViewBackButtonYPercent = num(K.WEBVIEW_BACK_BUTTON_Y_PERCENT, 50);
      setWebViewBackButtonEnabled(savedWebViewBackButtonEnabled);
      setWebViewBackButtonXPercent(savedWebViewBackButtonXPercent);
      setWebViewBackButtonYPercent(savedWebViewBackButtonYPercent);
      
      // Load Auto-Brightness settings
      const savedAutoBrightnessEnabled = bool(K.AUTO_BRIGHTNESS_ENABLED, false);
      const savedAutoBrightnessMin = num(K.AUTO_BRIGHTNESS_MIN, 0.1);
      const savedAutoBrightnessMax = num(K.AUTO_BRIGHTNESS_MAX, 1.0);
      const savedAutoBrightnessInterval = num(K.AUTO_BRIGHTNESS_UPDATE_INTERVAL, 1000);
      setAutoBrightnessEnabled(savedAutoBrightnessEnabled);
      setAutoBrightnessMin(savedAutoBrightnessMin);
      setAutoBrightnessMax(savedAutoBrightnessMax);
      setAutoBrightnessInterval(savedAutoBrightnessInterval);
      
      // Load Screen Sleep Scheduler settings
      const savedScreenSchedulerEnabled = bool(K.SCREEN_SCHEDULER_ENABLED, false);
      const savedScreenSchedulerRules = jsonParse(K.SCREEN_SCHEDULER_RULES, []) as ScreenScheduleRule[];
      const savedScreenSchedulerWakeOnTouch = bool(K.SCREEN_SCHEDULER_WAKE_ON_TOUCH, true);
      setScreenSchedulerEnabled(savedScreenSchedulerEnabled);
      setScreenSchedulerRules(savedScreenSchedulerRules);
      setScreenSchedulerWakeOnTouch(savedScreenSchedulerWakeOnTouch);
      
      // Load Inactivity Return to Home settings
      const savedInactivityReturnEnabled = bool(K.INACTIVITY_RETURN_ENABLED, false);
      const savedInactivityReturnDelay = num(K.INACTIVITY_RETURN_DELAY, 60000);
      const savedInactivityReturnResetOnNav = bool(K.INACTIVITY_RETURN_RESET_ON_NAV, true);
      const savedInactivityReturnClearCache = bool(K.INACTIVITY_RETURN_CLEAR_CACHE, false);
      const savedInactivityReturnScrollTop = bool(K.INACTIVITY_RETURN_SCROLL_TOP, true);
      setInactivityReturnEnabled(savedInactivityReturnEnabled);
      setInactivityReturnDelay(savedInactivityReturnDelay);
      setInactivityReturnResetOnNav(savedInactivityReturnResetOnNav);
      setInactivityReturnClearCache(savedInactivityReturnClearCache);
      setInactivityReturnScrollTop(savedInactivityReturnScrollTop);
      
      // Load URL Filtering settings
      const savedUrlFilterEnabled = bool(K.URL_FILTER_ENABLED, false);
      const savedUrlFilterMode = str(K.URL_FILTER_MODE) || 'blacklist';
      const savedUrlFilterList = jsonParse(K.URL_FILTER_LIST, []) as string[];
      const savedUrlFilterShowFeedback = bool(K.URL_FILTER_SHOW_FEEDBACK, false);
      setUrlFilterEnabled(savedUrlFilterEnabled);
      setUrlFilterMode(savedUrlFilterMode as 'blacklist' | 'whitelist');
      setUrlFilterList(savedUrlFilterList);
      setUrlFilterShowFeedback(savedUrlFilterShowFeedback);
      
      // Load PDF Viewer setting
      const savedPdfViewerEnabled = bool(K.PDF_VIEWER_ENABLED, false);
      setPdfViewerEnabled(savedPdfViewerEnabled);
      
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
        
        // Recalculate overlays after a short delay to ensure screen dimensions are correct
        // This fixes issues at boot where dimensions might not be immediately available
        setTimeout(async () => {
          try {
            await BlockingOverlayModule.updateOverlays();
            console.log('[KioskScreen] Blocking overlays recalculated after boot delay');
          } catch (e) {
            console.error('[KioskScreen] Failed to recalculate overlays:', e);
          }
        }, 1000);
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
          await KioskModule.startLockTask(packageToWhitelist, savedAllowPowerButton, savedAllowNotifications, savedAllowSystemInfo);
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
      console.log('[KioskScreen] Checking external app launch: displayMode=' + savedDisplayMode + ', package=' + savedExternalAppPackage);
      if (savedDisplayMode === 'external_app' && savedExternalAppPackage) {
        // Sync test mode and back button mode to native SharedPrefs before starting overlay
        const savedTestMode = bool(K.EXTERNAL_APP_TEST_MODE, true);
        const savedBackBtnMode = str(K.BACK_BUTTON_MODE) || 'test';
        try {
          await OverlayServiceModule.setTestMode(savedTestMode);
          console.log('[KioskScreen] Test mode synced to native:', savedTestMode);
        } catch (e) {
          console.warn('[KioskScreen] Failed to sync test mode:', e);
        }
        try {
          await OverlayServiceModule.setBackButtonMode(savedBackBtnMode);
          console.log('[KioskScreen] Back button mode synced to native:', savedBackBtnMode);
        } catch (e) {
          console.warn('[KioskScreen] Failed to sync back button mode:', e);
        }
        console.log('[KioskScreen] Launching external app:', savedExternalAppPackage);
        await launchExternalApp(savedExternalAppPackage, savedReturnTapCount, savedReturnTapTimeout, savedReturnMode, savedReturnButtonPosition);
      } else {
        console.log('[KioskScreen] NOT launching external app - displayMode:', savedDisplayMode, 'package:', savedExternalAppPackage);
      }
    } catch (error) {
      console.error('[KioskScreen] loadSettings error:', error);
    }
  };

  const resetTimer = () => {
    clearTimer();
    // Don't start inactivity timer if screen is in scheduled sleep
    if (isScheduledSleep) return;
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

  // ==================== Inactivity Return to Home ====================
  // Simple approach: use a single ref for the "last user interaction" timestamp
  // A single useEffect manages the timer based on all relevant state
  const lastUserInteractionRef = useRef<number>(Date.now());

  const clearInactivityReturnTimer = useCallback(() => {
    if (inactivityReturnTimerRef.current) {
      clearTimeout(inactivityReturnTimerRef.current);
      inactivityReturnTimerRef.current = null;
    }
  }, []);

  // Mark user interaction timestamp (called from onUserInteraction)
  const markUserInteraction = useCallback(() => {
    lastUserInteractionRef.current = Date.now();
  }, []);

  // Single useEffect that manages the inactivity return timer
  // It re-runs whenever relevant state changes
  useEffect(() => {
    clearInactivityReturnTimer();

    console.log(`[InactivityReturn] useEffect fired — enabled=${inactivityReturnEnabled}, displayMode=${displayMode}, baseUrl="${baseUrl}", url="${url}", screensaver=${isScreensaverActive}, rotation=${urlRotationEnabled}, delay=${inactivityReturnDelay}`);

    // Guard: only active in webview mode with a valid base URL
    if (!inactivityReturnEnabled || displayMode !== 'webview' || !baseUrl) {
      console.log(`[InactivityReturn] BLOCKED: enabled=${inactivityReturnEnabled}, mode=${displayMode}, baseUrl="${baseUrl}"`);
      return;
    }
    // Don't start during screensaver
    if (isScreensaverActive) {
      console.log('[InactivityReturn] BLOCKED: screensaver active');
      return;
    }
    // Don't start during URL rotation or planner
    if (urlRotationEnabled && urlRotationList.length >= 2) {
      console.log('[InactivityReturn] BLOCKED: URL rotation active');
      return;
    }
    if (activeScheduledEvent) {
      console.log('[InactivityReturn] BLOCKED: planner event active');
      return;
    }

    const delayMs = inactivityReturnDelay * 1000;
    console.log(`[InactivityReturn] ✅ TIMER ARMED (${inactivityReturnDelay}s = ${delayMs}ms), baseUrl="${baseUrl}"`);
    // Reset interaction timestamp so timer starts fresh from now
    lastUserInteractionRef.current = Date.now();

    const tick = () => {
      const elapsed = Date.now() - lastUserInteractionRef.current;
      console.log(`[InactivityReturn] tick — elapsed=${Math.round(elapsed/1000)}s / ${inactivityReturnDelay}s, currentWebViewUrl="${currentWebViewUrlRef.current}"`);
      if (elapsed >= delayMs) {
        // Time's up — check if we need to return
        const currentUrl = currentWebViewUrlRef.current || url;
        const normalizedCurrent = currentUrl.replace(/\/+$/, '').toLowerCase();
        const normalizedBase = baseUrl.replace(/\/+$/, '').toLowerCase();

        console.log(`[InactivityReturn] TIME'S UP — currentUrl="${normalizedCurrent}" vs baseUrl="${normalizedBase}" — same=${normalizedCurrent === normalizedBase}`);

        if (normalizedCurrent === normalizedBase) {
          if (inactivityReturnScrollTop && webViewRef.current) {
            console.log('[InactivityReturn] Already on start page — scrolling to top');
            webViewRef.current.scrollToTop();
          } else {
            console.log('[InactivityReturn] Already on start page, scroll-to-top disabled');
          }
        } else {
          console.log(`[InactivityReturn] 🔄 RETURNING to start page NOW`);
          // Always force a full WebView reload — because setUrl alone won't work
          // when the WebView navigated internally (url state hasn't changed)
          setUrl(baseUrl);
          setWebViewKey(prev => prev + 1);
        }
        // Reset timestamp and schedule next check
        lastUserInteractionRef.current = Date.now();
      }
      // Schedule next check
      const remaining = delayMs - (Date.now() - lastUserInteractionRef.current);
      const nextCheck = Math.max(1000, remaining);
      inactivityReturnTimerRef.current = setTimeout(tick, nextCheck);
    };

    // Start the first check after the full delay
    inactivityReturnTimerRef.current = setTimeout(tick, delayMs);

    return () => clearInactivityReturnTimer();
  }, [inactivityReturnEnabled, inactivityReturnDelay, inactivityReturnClearCache, inactivityReturnScrollTop, displayMode, baseUrl, url, isScreensaverActive, urlRotationEnabled, urlRotationList.length, activeScheduledEvent]);

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

  // Ref to track scheduled sleep state for callbacks
  const isScheduledSleepRef = useRef(isScheduledSleep);
  useEffect(() => {
    isScheduledSleepRef.current = isScheduledSleep;
  }, [isScheduledSleep]);

  const screenSchedulerWakeOnTouchRef = useRef(screenSchedulerWakeOnTouch);
  useEffect(() => {
    screenSchedulerWakeOnTouchRef.current = screenSchedulerWakeOnTouch;
  }, [screenSchedulerWakeOnTouch]);

  const onUserInteraction = useCallback(async (event?: { isTap?: boolean; x?: number; y?: number }) => {
    // If in scheduled sleep and wake on touch is disabled, ignore user interaction
    // (except still allow N-tap for settings access)
    if (isScheduledSleepRef.current && !screenSchedulerWakeOnTouchRef.current) {
      // Still allow N-tap detection for PIN navigation even during scheduled sleep
      if (displayMode === 'webview' && event?.isTap && returnMode === 'tap_anywhere') {
        // Fall through to tap detection below
      } else {
        return;
      }
    }

    // If in scheduled sleep and wake on touch IS enabled, wake the screen temporarily
    // The scheduler interval will re-enter sleep at the next 30s check if still in window
    if (isScheduledSleepRef.current && screenSchedulerWakeOnTouchRef.current) {
      console.log('[KioskScreen] Waking from scheduled sleep via touch (temporary)');
      await exitScheduledSleep();
    }
    
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
    markUserInteraction();
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
      
      // tap_anywhere mode with spatial proximity - taps must be grouped together
      if (tapCountRef.current === 0) {
        // First tap - store position and time
        firstTapXRef.current = tapX;
        firstTapYRef.current = tapY;
        lastTapTimeRef.current = now;
        tapCountRef.current = 1;
        console.log(`[${returnTapCount}-tap ANYWHERE] First tap at (${tapX.toFixed(0)}, ${tapY.toFixed(0)})`);
      } else {
        // Check spatial proximity - must be within TAP_PROXIMITY_RADIUS of first tap
        const dx = tapX - firstTapXRef.current;
        const dy = tapY - firstTapYRef.current;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance <= TAP_PROXIMITY_RADIUS) {
          // Within proximity, count the tap
          tapCountRef.current += 1;
          console.log(`[${returnTapCount}-tap] Count: ${tapCountRef.current}/${returnTapCount} at (${tapX.toFixed(0)}, ${tapY.toFixed(0)}) - distance: ${distance.toFixed(0)}px ✓`);
        } else {
          // Too far from first tap - reset and start new sequence
          console.log(`[${returnTapCount}-tap] Too far (${distance.toFixed(0)}px > ${TAP_PROXIMITY_RADIUS}px) - resetting sequence`);
          firstTapXRef.current = tapX;
          firstTapYRef.current = tapY;
          lastTapTimeRef.current = now;
          tapCountRef.current = 1;
        }
      }
      
      // If N taps reached, go to PIN screen
      if (tapCountRef.current >= returnTapCount) {
        console.log(`[${returnTapCount}-tap] ✅ ${returnTapCount} grouped taps reached! Going to PIN`);
        tapCountRef.current = 0;
        if (tapTimerRef.current) {
          clearTimeout(tapTimerRef.current);
        }
        clearTimer();
        setIsScreensaverActive(false);
        
        // If in scheduled sleep, exit it before navigating to PIN
        // (even if wake-on-touch is disabled, we MUST wake for settings access)
        if (isScheduledSleepRef.current) {
          console.log('[KioskScreen] Exiting scheduled sleep for PIN navigation');
          await exitScheduledSleep();
        }
        
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
  }, [displayMode, navigation, resetTimer, clearTimer, markUserInteraction, returnTapCount, returnTapTimeout, defaultBrightness, TAP_PROXIMITY_RADIUS, exitScheduledSleep]);


  const onScreensaverTap = useCallback(async () => {
    // If in scheduled sleep and wake on touch is disabled, ignore tap
    if (isScheduledSleepRef.current && !screenSchedulerWakeOnTouchRef.current) {
      console.log('[KioskScreen] Tap ignored — screen is in scheduled sleep (wake on touch disabled)');
      return;
    }
    
    // If waking from scheduled sleep via touch, actually exit sleep to restore brightness
    // The scheduler interval will re-enter sleep at the next 30s check if still in window
    if (isScheduledSleepRef.current && screenSchedulerWakeOnTouchRef.current) {
      console.log('[KioskScreen] Waking from scheduled sleep via screensaver tap (temporary)');
      await exitScheduledSleep();
    }
    
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
  }, [resetTimer, defaultBrightness, autoBrightnessEnabled, exitScheduledSleep]);

  const onMotionDetected = useCallback(async () => {
    // Report motion to API/MQTT
    ApiService.updateStatus({ motionDetected: true });
    // Auto-clear after 10 seconds
    setTimeout(() => ApiService.updateStatus({ motionDetected: false }), 10000);

    // Don't wake on motion during scheduled sleep
    if (isScheduledSleepRef.current) {
      console.log('[KioskScreen] Motion ignored — screen is in scheduled sleep');
      return;
    }
    
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
        await OverlayServiceModule.startOverlayService(
          finalTapCount, 
          finalTapTimeout, 
          finalReturnMode, 
          finalButtonPosition,
          packageName, // Pass locked package for monitoring
          autoRelaunchApp, // Pass auto-relaunch setting
          allowNotifications // Pass NFC enabled flag for monitoring filter
        );
        console.log(`[KioskScreen] OverlayService started with tapCount=${finalTapCount}, tapTimeout=${finalTapTimeout}, mode=${finalReturnMode}, position=${finalButtonPosition}, package=${packageName}, autoRelaunch=${autoRelaunchApp}, nfcEnabled=${allowNotifications}`);
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
            onPageNavigated={(navUrl: string) => {
              currentWebViewUrlRef.current = navUrl;
              // Reset inactivity timer on page navigation if enabled
              if (inactivityReturnResetOnNav) {
                markUserInteraction();
              }
            }}
            urlFilterMode={urlFilterEnabled ? urlFilterMode : undefined}
            urlFilterPatterns={urlFilterEnabled ? urlFilterList : undefined}
            urlFilterShowFeedback={urlFilterShowFeedback}
            pdfViewerEnabled={pdfViewerEnabled}
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
        enabled={isFocused && (motionAlwaysOn || (motionEnabled && (isPreCheckingMotion || isScreensaverActive)))}
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

      {/* Screensaver overlay - black when brightness=0%, transparent when dimming */}
      {isScreensaverActive && screensaverEnabled && (
        <TouchableOpacity
          style={[
            styles.screensaverOverlay,
            screensaverBrightness === 0 
              ? styles.screensaverBlack 
              : styles.screensaverTransparent
          ]}
          activeOpacity={1}
          onPress={onScreensaverTap}
        />
      )}

      {/* Scheduled Sleep overlay - always black, independent from screensaver */}
      {isScheduledSleep && (
        <TouchableOpacity
          style={[styles.screensaverOverlay, styles.screensaverBlack]}
          activeOpacity={1}
          onPress={screenSchedulerWakeOnTouch ? onScreensaverTap : undefined}
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
    zIndex: 1000,
  },
  screensaverBlack: {
    backgroundColor: '#000',
    opacity: 1,
  },
  screensaverTransparent: {
    backgroundColor: 'transparent',
  },
});

export default KioskScreen;
