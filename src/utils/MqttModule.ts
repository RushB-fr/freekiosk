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
}

// Export singleton instance
export const mqttClient = new MqttClientService();
