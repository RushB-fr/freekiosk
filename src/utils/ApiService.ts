/**
 * ApiService.ts
 * Service pour connecter l'API REST à l'application React Native
 * Gère les commandes reçues et fournit le statut en temps réel
 *
 * The command dispatch logic lives in `executeAction()` so it can be reused by
 * BOTH the local REST/MQTT server (native `onApiCommand` events) AND the cloud
 * command channel (CloudCommandService). A single source of truth for actions.
 */

import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import { httpServer } from './HttpServerModule';
import { mqttClient } from './MqttModule';
import { StorageService } from './storage';
import { getSecureMqttPassword } from './secureStorage';

const { HttpServerModule, MqttModule, SoundPlayer } = NativeModules;

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
  onAutoBrightnessEnable?: (min: number, max: number, offset?: number) => void;
  onAutoBrightnessDisable?: () => void;
  onSetMotionAlwaysOn?: (value: boolean) => void;
  onSetMode?: (mode: 'webview' | 'external_app' | 'media_player', target?: string) => void;
  onSetMqttImageAuto?: (stream: MqttImageStream, value: boolean) => void;
  onSetMqttImageInterval?: (stream: MqttImageStream, seconds: number) => void;
}

/**
 * Result of dispatching a single action. `ok=false` carries an error string so
 * the cloud command channel can report a meaningful failure back to the server.
 */
export interface ActionResult {
  ok: boolean;
  result?: Record<string, unknown>;
  error?: string;
}

/** Image streams that can be published over MQTT. */
export type MqttImageStream = 'screenshot' | 'camera';

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
  autoBrightnessEnabled?: boolean;
  autoBrightnessMin?: number;
  autoBrightnessMax?: number;
  scheduledSleep?: boolean;
  motionDetected?: boolean;
  motionAlwaysOn?: boolean;
}

const ok = (result?: Record<string, unknown>): ActionResult => ({ ok: true, result });
const fail = (error: string): ActionResult => ({ ok: false, error });

function isMqttImageStream(value: unknown): value is MqttImageStream {
  return value === 'screenshot' || value === 'camera';
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
    scheduledSleep: false,
    motionDetected: false,
  };
  private isInitialized = false;

  /**
   * Initialize the API service and start listening for commands
   */
  async initialize(callbacks: ApiCallbacks): Promise<void> {
    // #231: always adopt the callbacks of the caller, even when already initialized.
    // The previous early return kept the ones captured on the very first mount, so if
    // KioskScreen was ever remounted (a new instance mounting before the old one runs its
    // cleanup), every REST/MQTT command kept driving the dead component tree: the command
    // was accepted, the state updated somewhere invisible, and nothing happened on screen.
    this.callbacks = callbacks;

    // Re-subscribe when the listener is gone (destroy() clears it), otherwise keep the
    // existing one so commands are not delivered twice.
    if (this.isInitialized && this.commandSubscription) {
      console.log('ApiService: Already initialized, callbacks refreshed');
      return;
    }

    if (Platform.OS === 'android' && HttpServerModule) {
      this.eventEmitter = new NativeEventEmitter(HttpServerModule);

      // Listen for API commands from native module
      // Defer to next tick to avoid CalledFromWrongThreadException
      // when react-native-screens manipulates views during commit on native thread
      this.commandSubscription?.remove();
      this.commandSubscription = this.eventEmitter.addListener(
        'onApiCommand',
        (event: { command: string; params: string }) => {
          setTimeout(() => this.handleCommand(event), 0);
        }
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
   * Start the MQTT client if enabled in settings
   */
  async autoStartMqtt(): Promise<void> {
    const enabled = await StorageService.getMqttEnabled();
    if (!enabled) {
      throw new Error('MQTT is not enabled');
    }

    const brokerUrl = await StorageService.getMqttBrokerUrl();
    if (!brokerUrl) {
      throw new Error('Broker URL not configured');
    }

    const port = await StorageService.getMqttPort();
    const username = await StorageService.getMqttUsername();
    const password = await getSecureMqttPassword();
    const clientId = await StorageService.getMqttClientId();
    const baseTopic = await StorageService.getMqttBaseTopic();
    const discoveryPrefix = await StorageService.getMqttDiscoveryPrefix();
    const statusInterval = await StorageService.getMqttStatusInterval();
    const allowControl = await StorageService.getMqttAllowControl();
    const deviceName = await StorageService.getMqttDeviceName();

    // Image publishing (screenshot / camera snapshots) — all opt-in
    const screenshotEnabled = await StorageService.getMqttScreenshotEnabled();
    const screenshotAuto = await StorageService.getMqttScreenshotAuto();
    const screenshotInterval = await StorageService.getMqttScreenshotInterval();
    const screenshotQuality = await StorageService.getMqttScreenshotQuality();
    const screenshotMaxWidth = await StorageService.getMqttScreenshotMaxWidth();
    const cameraEnabled = await StorageService.getMqttCameraEnabled();
    const cameraAuto = await StorageService.getMqttCameraAuto();
    const cameraInterval = await StorageService.getMqttCameraInterval();
    const cameraQuality = await StorageService.getMqttCameraQuality();

    await mqttClient.start({
      brokerUrl,
      port,
      username: username || undefined,
      password: password || undefined,
      clientId: clientId || undefined,
      baseTopic,
      discoveryPrefix,
      statusInterval: statusInterval * 1000, // Convert seconds to ms
      allowControl,
      deviceName: deviceName || undefined,
      useTls: port === 8883,
      screenshotEnabled,
      screenshotAuto,
      screenshotInterval,
      screenshotQuality,
      screenshotMaxWidth,
      cameraEnabled,
      cameraAuto,
      cameraInterval,
      cameraQuality,
    });

    console.log(`ApiService: MQTT client started for ${brokerUrl}:${port}`);
  }

  /**
   * Stop MQTT client
   */
  async stopMqtt(): Promise<void> {
    try {
      await mqttClient.stop();
      console.log('ApiService: MQTT client stopped');
    } catch (error) {
      console.error('ApiService: Failed to stop MQTT', error);
    }
  }

  /**
   * Handle incoming API commands from the native HTTP/MQTT server.
   * Thin wrapper over executeAction() — the local server is fire-and-forget.
   */
  private handleCommand(event: { command: string; params: string }): void {
    console.log('ApiService: Received command', event.command);
    let params: Record<string, any> = {};
    try {
      params = JSON.parse(event.params || '{}');
    } catch (error) {
      console.error('ApiService: Invalid command params', error);
      return;
    }
    this.executeAction(event.command, params)
      .then(r => {
        if (!r.ok) console.warn('ApiService: action not applied', event.command, r.error);
      })
      .catch(error => console.error('ApiService: Error handling command', error));
  }

  /**
   * Dispatch a single action by command name. Shared by the local REST/MQTT
   * server and the cloud command channel. Returns a structured result so the
   * caller can report success/failure (the cloud needs this).
   *
   * Note: execution flows through the callbacks registered by KioskScreen, so a
   * meaningful result requires that screen to be mounted (the normal runtime).
   *
   * This is the single source of truth for action *names*, not for execution. The
   * local REST server runs a good part of them natively before ever emitting to JS
   * (HttpServerModule.handleCommand), and the cloud channel now asks that same native
   * handler first. MQTT does not: it emits straight to JS, so its commands still
   * depend on the JS thread being alive. Worth aligning, with its own testing.
   */
  async executeAction(command: string, params: Record<string, any> = {}): Promise<ActionResult> {
    const cb = this.callbacks;
    const p = params || {};

    switch (command) {
      case 'setBrightness':
        if (p.value === undefined) return fail('Missing brightness value');
        if (!cb.onSetBrightness) return fail('Handler unavailable');
        cb.onSetBrightness(p.value);
        return ok();

      case 'screenOn':
        if (!cb.onScreenOn) return fail('Handler unavailable');
        cb.onScreenOn();
        return ok();

      case 'screenOff':
        if (!cb.onScreenOff) return fail('Handler unavailable');
        cb.onScreenOff();
        return ok();

      case 'screensaverOn':
        if (!cb.onScreensaverOn) return fail('Handler unavailable');
        cb.onScreensaverOn();
        return ok();

      case 'screensaverOff':
        if (!cb.onScreensaverOff) return fail('Handler unavailable');
        cb.onScreensaverOff();
        return ok();

      case 'wake':
        if (!cb.onWake) return fail('Handler unavailable');
        cb.onWake();
        return ok();

      case 'reload':
        if (!cb.onReload) return fail('Handler unavailable');
        cb.onReload();
        return ok();

      case 'setUrl':
        if (!p.url) return fail('Missing url');
        if (!cb.onSetUrl) return fail('Handler unavailable');
        cb.onSetUrl(p.url);
        return ok();

      case 'tts':
        if (!p.text) return fail('Missing text');
        if (!cb.onTts) return fail('Handler unavailable');
        cb.onTts(p.text);
        return ok();

      case 'setVolume':
        if (p.value === undefined) return fail('Missing volume value');
        if (!cb.onSetVolume) return fail('Handler unavailable');
        cb.onSetVolume(p.value);
        return ok();

      case 'rotationStart':
        if (!cb.onRotationStart) return fail('Handler unavailable');
        cb.onRotationStart();
        return ok();

      case 'rotationStop':
        if (!cb.onRotationStop) return fail('Handler unavailable');
        cb.onRotationStop();
        return ok();

      case 'toast':
        if (!p.text) return fail('Missing toast text');
        if (!cb.onToast) return fail('Handler unavailable');
        cb.onToast(p.text);
        return ok();

      case 'launchApp':
        if (!p.package) return fail('Missing package name');
        if (!cb.onLaunchApp) return fail('Handler unavailable');
        cb.onLaunchApp(p.package);
        return ok();

      case 'executeJs':
        if (!p.code) return fail('Missing JS code');
        if (!cb.onExecuteJs) return fail('Handler unavailable');
        cb.onExecuteJs(p.code);
        return ok();

      case 'reboot':
        if (!cb.onReboot) return fail('Handler unavailable');
        cb.onReboot();
        return ok();

      case 'clearCache':
        if (!cb.onClearCache) return fail('Handler unavailable');
        cb.onClearCache();
        return ok();

      case 'remoteKey':
        if (!p.key) return fail('Missing key');
        if (!cb.onRemoteKey) return fail('Handler unavailable');
        cb.onRemoteKey(p.key);
        return ok();

      case 'autoBrightnessEnable':
        if (!cb.onAutoBrightnessEnable) return fail('Handler unavailable');
        cb.onAutoBrightnessEnable(
          p.min !== undefined ? p.min : 10,
          p.max !== undefined ? p.max : 100,
          p.offset !== undefined ? p.offset : undefined,
        );
        return ok();

      case 'autoBrightnessDisable':
        if (!cb.onAutoBrightnessDisable) return fail('Handler unavailable');
        cb.onAutoBrightnessDisable();
        return ok();

      case 'setMotionAlwaysOn':
        if (!cb.onSetMotionAlwaysOn) return fail('Handler unavailable');
        cb.onSetMotionAlwaysOn(p.value === true);
        return ok();

      // Image publishing (MQTT). The capture runs natively, so these only persist the
      // setting changed from Home Assistant — same pattern as setMotionAlwaysOn.
      case 'setImageAutoPublish':
        if (!isMqttImageStream(p.stream)) return fail('Invalid image stream');
        if (!cb.onSetMqttImageAuto) return fail('Handler unavailable');
        cb.onSetMqttImageAuto(p.stream, p.value === true);
        return ok();

      case 'setImageInterval':
        if (!isMqttImageStream(p.stream)) return fail('Invalid image stream');
        if (typeof p.seconds !== 'number') return fail('Missing interval seconds');
        if (!cb.onSetMqttImageInterval) return fail('Handler unavailable');
        cb.onSetMqttImageInterval(p.stream, p.seconds);
        return ok();

      // Captured and published natively by MqttImagePublisher, nothing to do here.
      case 'publishScreenshot':
      case 'publishCameraPhoto':
        return ok();

      case 'setMode':
        if (p.mode !== 'webview' && p.mode !== 'external_app' && p.mode !== 'media_player') return fail('Invalid mode');
        if (!cb.onSetMode) return fail('Handler unavailable');
        cb.onSetMode(p.mode, p.url || p.package || undefined);
        return ok();

      // Screenshot needs a capture + upload round-trip, so it is handled directly
      // by CloudCommandService — this stub only guards the local dispatch path.
      case 'screenshot':
        return fail('screenshot is handled by the cloud channel');

      case 'playSound':
        if (!p.url) return fail('Missing sound url');
        if (!SoundPlayer?.playSound) return fail('Sound player unavailable');
        try {
          await SoundPlayer.playSound(p.url);
          return ok();
        } catch (e: any) {
          return fail(e?.message ?? 'playSound failed');
        }

      case 'audioStop':
        if (!SoundPlayer?.stopSound) return fail('Sound player unavailable');
        try {
          await SoundPlayer.stopSound();
          return ok();
        } catch (e: any) {
          return fail(e?.message ?? 'audioStop failed');
        }

      default:
        return fail(`Unknown command: ${command}`);
    }
  }

  /**
   * Update app status (call this from KioskScreen when state changes)
   * Forwards to both HTTP server and MQTT client native modules
   */
  updateStatus(status: Partial<AppStatus>): void {
    this.appStatus = { ...this.appStatus, ...status };

    const statusJson = JSON.stringify(this.appStatus);

    // Send to HTTP server native module
    if (HttpServerModule?.updateStatus) {
      HttpServerModule.updateStatus(statusJson);
    }

    // Send to MQTT native module
    if (MqttModule?.updateStatus) {
      MqttModule.updateStatus(statusJson);
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
