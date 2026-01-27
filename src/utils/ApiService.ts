/**
 * ApiService.ts
 * Service pour connecter l'API REST à l'application React Native
 * Gère les commandes reçues et fournit le statut en temps réel
 */

import { DeviceEventEmitter, NativeModules, NativeEventEmitter, Platform } from 'react-native';
import { httpServer } from './HttpServerModule';
import { StorageService } from './storage';

const { HttpServerModule } = NativeModules;

export interface ApiCallbacks {
  onSetBrightness?: (value: number) => void;
  onScreenOn?: () => void;
  onScreenOff?: () => void;
  onScreensaverOn?: () => void;
  onScreensaverOff?: () => void;
  onWake?: () => void;
  onReload?: () => void;
  onSetUrl?: (url: string) => void;
  onTts?: (text: string) => void;
  onSetVolume?: (value: number) => void;
  onRotationStart?: () => void;
  onRotationStop?: () => void;
  onToast?: (text: string) => void;
  onLaunchApp?: (packageName: string) => void;
  onExecuteJs?: (code: string) => void;
  onReboot?: () => void;
  onClearCache?: () => void;
  onRemoteKey?: (key: string) => void;
}

export interface AppStatus {
  currentUrl: string;
  canGoBack: boolean;
  loading: boolean;
  brightness: number;
  screensaverActive: boolean;
  screenOn?: boolean; // Track actual screen state (from power button)
  kioskMode: boolean;
  volume?: number;
  rotationEnabled?: boolean;
  rotationUrls?: string[];
  rotationInterval?: number;
  rotationCurrentIndex?: number;
}

class ApiServiceClass {
  private callbacks: ApiCallbacks = {};
  private eventEmitter: NativeEventEmitter | null = null;
  private commandSubscription: any = null;
  private appStatus: AppStatus = {
    currentUrl: '',
    canGoBack: false,
    loading: false,
    brightness: 50,
    screensaverActive: false,
    screenOn: true, // Assume screen is ON by default
    kioskMode: false,
  };
  private isInitialized = false;

  /**
   * Initialize the API service and start listening for commands
   */
  async initialize(callbacks: ApiCallbacks): Promise<void> {
    if (this.isInitialized) {
      console.log('ApiService: Already initialized');
      return;
    }

    this.callbacks = callbacks;

    if (Platform.OS === 'android' && HttpServerModule) {
      this.eventEmitter = new NativeEventEmitter(HttpServerModule);
      
      // Listen for API commands from native module
      this.commandSubscription = this.eventEmitter.addListener(
        'onApiCommand',
        this.handleCommand.bind(this)
      );

      console.log('ApiService: Initialized and listening for commands');
    }

    this.isInitialized = true;
  }

  /**
   * Start the API server if enabled in settings
   */
  async autoStart(): Promise<void> {
    try {
      const enabled = await StorageService.getRestApiEnabled();
      if (!enabled) {
        console.log('ApiService: REST API disabled in settings');
        return;
      }

      const port = await StorageService.getRestApiPort();
      const apiKey = await StorageService.getRestApiKey();
      const allowControl = await StorageService.getRestApiAllowControl();

      const result = await httpServer.startServer(port, apiKey || null, allowControl);
      console.log(`ApiService: Server started on ${result.ip}:${result.port}`);
    } catch (error) {
      console.error('ApiService: Failed to auto-start server', error);
    }
  }

  /**
   * Handle incoming API commands
   */
  private handleCommand(event: { command: string; params: string }): void {
    console.log('ApiService: Received command', event.command);
    
    try {
      const params = JSON.parse(event.params || '{}');
      
      switch (event.command) {
        case 'setBrightness':
          if (this.callbacks.onSetBrightness && params.value !== undefined) {
            this.callbacks.onSetBrightness(params.value);
          }
          break;
          
        case 'screenOn':
          if (this.callbacks.onScreenOn) {
            this.callbacks.onScreenOn();
          }
          break;
          
        case 'screenOff':
          if (this.callbacks.onScreenOff) {
            this.callbacks.onScreenOff();
          }
          break;
          
        case 'screensaverOn':
          if (this.callbacks.onScreensaverOn) {
            this.callbacks.onScreensaverOn();
          }
          break;
          
        case 'screensaverOff':
          if (this.callbacks.onScreensaverOff) {
            this.callbacks.onScreensaverOff();
          }
          break;
          
        case 'wake':
          if (this.callbacks.onWake) {
            this.callbacks.onWake();
          }
          break;
          
        case 'reload':
          if (this.callbacks.onReload) {
            this.callbacks.onReload();
          }
          break;
          
        case 'setUrl':
          if (this.callbacks.onSetUrl && params.url) {
            this.callbacks.onSetUrl(params.url);
          }
          break;
          
        case 'tts':
          if (this.callbacks.onTts && params.text) {
            this.callbacks.onTts(params.text);
          }
          break;
          
        case 'setVolume':
          if (this.callbacks.onSetVolume && params.value !== undefined) {
            this.callbacks.onSetVolume(params.value);
          }
          break;
          
        case 'rotationStart':
          if (this.callbacks.onRotationStart) {
            this.callbacks.onRotationStart();
          }
          break;
          
        case 'rotationStop':
          if (this.callbacks.onRotationStop) {
            this.callbacks.onRotationStop();
          }
          break;
          
        case 'toast':
          if (this.callbacks.onToast && params.text) {
            this.callbacks.onToast(params.text);
          }
          break;
          
        case 'launchApp':
          if (this.callbacks.onLaunchApp && params.package) {
            this.callbacks.onLaunchApp(params.package);
          }
          break;
          
        case 'executeJs':
          if (this.callbacks.onExecuteJs && params.code) {
            this.callbacks.onExecuteJs(params.code);
          }
          break;
          
        case 'reboot':
          if (this.callbacks.onReboot) {
            this.callbacks.onReboot();
          }
          break;
          
        case 'clearCache':
          if (this.callbacks.onClearCache) {
            this.callbacks.onClearCache();
          }
          break;
          
        case 'remoteKey':
          if (this.callbacks.onRemoteKey && params.key) {
            this.callbacks.onRemoteKey(params.key);
          }
          break;
          
        default:
          console.warn('ApiService: Unknown command', event.command);
      }
    } catch (error) {
      console.error('ApiService: Error handling command', error);
    }
  }

  /**
   * Update app status (call this from KioskScreen when state changes)
   */
  updateStatus(status: Partial<AppStatus>): void {
    this.appStatus = { ...this.appStatus, ...status };
    
    // Send to native module for API responses
    if (HttpServerModule?.updateStatus) {
      HttpServerModule.updateStatus(JSON.stringify(this.appStatus));
    }
  }

  /**
   * Get current app status
   */
  getStatus(): AppStatus {
    return this.appStatus;
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.commandSubscription) {
      this.commandSubscription.remove();
      this.commandSubscription = null;
    }
    this.isInitialized = false;
    console.log('ApiService: Destroyed');
  }
}

export const ApiService = new ApiServiceClass();
