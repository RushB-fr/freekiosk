/**
 * MqttModule.ts
 * React Native bridge for the MQTT Client
 */

import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { MqttModule } = NativeModules;

export interface MqttConfig {
  brokerUrl: string;
  port: number;
  username?: string;
  password?: string;
  clientId?: string;
  baseTopic: string;
  discoveryPrefix: string;
  statusInterval: number;
  allowControl: boolean;
  deviceName?: string;
  useTls?: boolean;
  // Image publishing (screenshot / camera snapshots over MQTT)
  screenshotEnabled?: boolean;
  screenshotAuto?: boolean;
  /** Seconds between two automatic screenshot publishes (5-3600) */
  screenshotInterval?: number;
  /** JPEG quality 1-100 */
  screenshotQuality?: number;
  /** Downscale width in px, 0 keeps the native resolution */
  screenshotMaxWidth?: number;
  cameraEnabled?: boolean;
  cameraAuto?: boolean;
  /** Seconds between two automatic camera publishes (5-3600) */
  cameraInterval?: number;
  /** JPEG quality 1-100 */
  cameraQuality?: number;
}

class MqttClientService {
  private eventEmitter: NativeEventEmitter | null = null;
  private connectionListener: ((connected: boolean) => void) | null = null;

  constructor() {
    if (Platform.OS === 'android' && MqttModule) {
      this.eventEmitter = new NativeEventEmitter(MqttModule);
    }
  }

  /**
   * Get the Android device model name for pre-filling the MQTT Device Name field.
   */
  async getDeviceModel(): Promise<string> {
    if (Platform.OS !== 'android' || !MqttModule) {
      return '';
    }
    return MqttModule.getDeviceModel();
  }

  /**
   * Start the MQTT client
   */
  async start(config: MqttConfig): Promise<boolean> {
    if (Platform.OS !== 'android' || !MqttModule) {
      throw new Error('MqttModule is only available on Android');
    }

    return MqttModule.startMqtt(config);
  }

  /**
   * Stop the MQTT client
   */
  async stop(): Promise<boolean> {
    if (Platform.OS !== 'android' || !MqttModule) {
      return false;
    }

    return MqttModule.stopMqtt();
  }

  /**
   * Check if MQTT client is connected
   */
  async isConnected(): Promise<boolean> {
    if (Platform.OS !== 'android' || !MqttModule) {
      return false;
    }

    return MqttModule.isMqttConnected();
  }

  /**
   * Apply image publishing settings (auto-publish, interval, quality) to a running MQTT
   * client, without reconnecting. Returns false when MQTT is not running — the settings are
   * then read from storage on the next start.
   *
   * Note: enabling/disabling a stream is not applied here, it changes the Home Assistant
   * discovery entities and therefore needs a reconnect.
   */
  async updateImageSettings(settings: {
    screenshotAuto: boolean;
    screenshotInterval: number;
    screenshotQuality: number;
    screenshotMaxWidth: number;
    cameraAuto: boolean;
    cameraInterval: number;
    cameraQuality: number;
  }): Promise<boolean> {
    if (Platform.OS !== 'android' || !MqttModule) {
      return false;
    }

    return MqttModule.updateImageSettings(settings);
  }

  /**
   * Update status that will be published via MQTT
   * @param status Status object to expose via MQTT
   */
  updateStatus(status: Record<string, unknown>): void {
    if (Platform.OS !== 'android' || !MqttModule) {
      return;
    }

    MqttModule.updateStatus(JSON.stringify(status));
  }

  /**
   * Subscribe to MQTT connection state changes
   * @param callback Function called when connection state changes
   */
  onConnectionChanged(callback: (connected: boolean) => void): () => void {
    if (!this.eventEmitter) {
      return () => {};
    }

    this.connectionListener = callback;

    const subscription = this.eventEmitter.addListener(
      'onMqttConnectionChanged',
      (event: { connected: boolean }) => {
        callback(event.connected);
      }
    );

    return () => {
      subscription.remove();
      this.connectionListener = null;
    };
  }

  /**
   * Subscribe to MQTT connection error events
   * @param callback Function called when a connection error occurs
   */
  onConnectionError(callback: (message: string) => void): () => void {
    if (!this.eventEmitter) {
      return () => {};
    }

    const subscription = this.eventEmitter.addListener(
      'onMqttConnectionError',
      (event: { message: string }) => {
        callback(event.message);
      }
    );

    return () => {
      subscription.remove();
    };
  }
}

// Export singleton instance
export const mqttClient = new MqttClientService();
