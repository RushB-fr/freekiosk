/**
 * HttpServerModule.ts
 * React Native bridge for the HTTP API Server
 */

import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

interface ServerInfo {
  running: boolean;
  ip: string;
}

interface StartResult {
  success: boolean;
  port: number;
  ip: string;
}

interface ApiCommand {
  command: string;
  params: string;
}

const { HttpServerModule } = NativeModules;

class HttpServerService {
  private eventEmitter: NativeEventEmitter | null = null;
  private commandListener: ((command: string, params: Record<string, unknown>) => void) | null = null;

  constructor() {
    if (Platform.OS === 'android' && HttpServerModule) {
      this.eventEmitter = new NativeEventEmitter(HttpServerModule);
    }
  }

  /**
   * Start the HTTP server
   * @param port Port number (default: 8080)
   * @param apiKey API key for authentication (optional)
   * @param allowControl Whether to allow control commands
   */
  async startServer(
    port: number = 8080,
    apiKey: string | null = null,
    allowControl: boolean = true
  ): Promise<StartResult> {
    if (Platform.OS !== 'android') {
      throw new Error('HTTP Server is only available on Android');
    }

    if (!HttpServerModule) {
      throw new Error('HttpServerModule is not available');
    }

    return HttpServerModule.startServer(port, apiKey, allowControl);
  }

  /**
   * Stop the HTTP server
   */
  async stopServer(): Promise<boolean> {
    if (Platform.OS !== 'android' || !HttpServerModule) {
      return false;
    }

    return HttpServerModule.stopServer();
  }

  /**
   * Check if server is running
   */
  async isRunning(): Promise<boolean> {
    if (Platform.OS !== 'android' || !HttpServerModule) {
      return false;
    }

    return HttpServerModule.isRunning();
  }

  /**
   * Get server info (running status and IP)
   */
  async getServerInfo(): Promise<ServerInfo> {
    if (Platform.OS !== 'android' || !HttpServerModule) {
      return { running: false, ip: '0.0.0.0' };
    }

    return HttpServerModule.getServerInfo();
  }

  /**
   * Get local IP address
   */
  async getLocalIp(): Promise<string> {
    if (Platform.OS !== 'android' || !HttpServerModule) {
      return '0.0.0.0';
    }

    return HttpServerModule.getLocalIp();
  }

  /**
   * Update status that will be returned by the API
   * @param status Status object to expose via API
   */
  updateStatus(status: Record<string, unknown>): void {
    if (Platform.OS !== 'android' || !HttpServerModule) {
      return;
    }

    HttpServerModule.updateStatus(JSON.stringify(status));
  }

  /**
   * Subscribe to API commands from external clients
   * @param callback Function to call when a command is received
   */
  onCommand(callback: (command: string, params: Record<string, unknown>) => void): () => void {
    if (!this.eventEmitter) {
      return () => {};
    }

    this.commandListener = callback;
    
    const subscription = this.eventEmitter.addListener(
      'onApiCommand',
      (event: ApiCommand) => {
        try {
          const params = JSON.parse(event.params);
          callback(event.command, params);
        } catch (e) {
          callback(event.command, {});
        }
      }
    );

    return () => {
      subscription.remove();
      this.commandListener = null;
    };
  }
}

// Export singleton instance
export const httpServer = new HttpServerService();

// Export types
export type { ServerInfo, StartResult, ApiCommand };
