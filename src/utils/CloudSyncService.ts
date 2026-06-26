import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';

import { StorageService, KEYS } from './storage';
import DeviceControlService from '../services/DeviceControlService';
import { CloudCommandService } from './CloudCommandService';
import {
  CloudCredentials,
  SensitiveConfig,
  clearCloudCredentials,
  clearSecureApiKey,
  clearSecureBasicAuthPassword,
  clearSecureMqttPassword,
  clearSecurePin,
  exportSensitiveConfig,
  getCloudCredentials,
  importSensitiveConfig,
  saveCloudCredentials,
} from './secureStorage';

export const CONFIG_UPDATED_EVENT = 'FREEKIOSK_CONFIG_UPDATED';
export const FORCE_UNENROLL_EVENT = 'FREEKIOSK_FORCE_UNENROLL';

const HEARTBEAT_INTERVAL_MS = 30_000;

interface HeartbeatResponse {
  status: string;
  pending_commands: number;
  server_time: string;
  sync_action: 'none' | 'apply';
  config: Record<string, unknown> | null;
  sensitive_config: SensitiveConfig | null;
  config_version: number;
  force_unenroll: boolean;
}

async function simpleHash(str: string): Promise<string> {
  try {
    const g = globalThis as any;
    if (g.crypto?.subtle) {
      const buffer = await g.crypto.subtle.digest('SHA-256', new g.TextEncoder().encode(str));
      return Array.from(new Uint8Array(buffer) as Uint8Array)
        .map((b: number) => b.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch {}
  // djb2 fallback
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (((h << 5) + h) + str.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(h).toString(16);
}

class CloudSyncServiceClass {
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.isRunning) return;
    const creds = await getCloudCredentials();
    if (!creds) return;
    this.isRunning = true;
    await this.sendHeartbeat(creds);
    this.heartbeatTimer = setInterval(
      () => getCloudCredentials().then(c => c && this.sendHeartbeat(c)),
      HEARTBEAT_INTERVAL_MS,
    );
  }

  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.isRunning = false;
  }

  // ─── Heartbeat ───────────────────────────────────────────────────────────────

  async sendHeartbeat(creds?: CloudCredentials): Promise<void> {
    const c = creds ?? await getCloudCredentials();
    if (!c) return;

    try {
      const config = await StorageService.exportConfig();
      const configStr = JSON.stringify(config);

      // Hash-based change detection — avoids patching every save*() method
      const lastHash = await StorageService.getLastSentConfigHash();
      const currentHash = await simpleHash(configStr);

      let configUpdatedAt = await StorageService.getConfigUpdatedAt();
      if (currentHash !== lastHash) {
        configUpdatedAt = new Date().toISOString();
        await StorageService.saveConfigUpdatedAt(configUpdatedAt);
        await StorageService.saveLastSentConfigHash(currentHash);
      }

      const configVersion = await StorageService.getConfigVersion();
      const sensitiveConfig = await exportSensitiveConfig();

      // Collect device telemetry for live status
      let telemetry: Record<string, unknown> = {};
      try {
        const status = await DeviceControlService.getStatus();
        telemetry = {
          battery: {
            level: status.battery.level,
            charging: status.battery.charging,
          },
          network: {
            wifi_ssid: status.wifi.ssid,
            wifi_signal_dbm: status.wifi.signalStrength,
            ip_address: status.device.ip,
          },
          display: {
            screen_on: status.screen.on,
            brightness: status.screen.brightness,
          },
          app: {
            current_url: status.webview.currentUrl,
            kiosk_mode: status.device.kioskMode,
            device_owner: status.device.isDeviceOwner,
          },
          system: {
            app_version: status.device.version,
            model: status.device.model,
            manufacturer: status.device.manufacturer,
            android_version: status.device.androidVersion,
            free_storage_mb: status.device.freeStorageMb,
            free_memory_mb: status.device.freeMemoryMb,
            uptime_seconds: status.device.uptime,
          },
        };
      } catch {
        // Telemetry is best-effort — never block heartbeat
      }

      const response = await fetch(
        `${c.cloudUrl}/api/v1/devices/${c.deviceId}/heartbeat/`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${c.apiKey}`,
          },
          body: JSON.stringify({
            ...telemetry,
            config,
            config_version: configVersion,
            config_updated_at: configUpdatedAt,
            sensitive_config: sensitiveConfig,
          }),
        },
      );

      if (response.status === 401 || response.status === 403) {
        // Device was removed from cloud server-side
        await this._wipeAndUnenroll();
        return;
      }
      if (!response.ok) return;

      const data: HeartbeatResponse = await response.json();

      if (data.force_unenroll) {
        await this._wipeAndUnenroll();
        return;
      }

      if (data.sync_action === 'apply' && data.config) {
        await StorageService.importConfig(data.config);
        if (data.sensitive_config) {
          await importSensitiveConfig(data.sensitive_config);
        }
        await StorageService.saveConfigVersion(data.config_version);
        await StorageService.saveConfigUpdatedAt(new Date().toISOString());
        await StorageService.saveLastSentConfigHash(''); // force re-hash next tick
        DeviceEventEmitter.emit(CONFIG_UPDATED_EVENT);
      } else if (data.config_version > configVersion) {
        await StorageService.saveConfigVersion(data.config_version);
      }

      // Pull + execute any pending commands / APK updates. Fire-and-forget so
      // the heartbeat loop is never blocked by a long install; the service
      // guards against overlapping polls internally.
      if (data.pending_commands > 0) {
        CloudCommandService.poll(c).catch(() => {/* poll() handles its own errors */});
      }
    } catch (error) {
      console.error('[CloudSync] Heartbeat error:', error);
    }
  }

  // ─── Enrollment ──────────────────────────────────────────────────────────────

  async enroll(
    cloudUrl: string,
    token: string,
    deviceInfo: Record<string, string>,
  ): Promise<{ success: boolean; error?: string; organizationName?: string }> {
    const url = cloudUrl.replace(/\/$/, '');
    try {
      const response = await fetch(`${url}/api/v1/devices/enroll/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, device_info: deviceInfo }),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error ?? 'Enrollment failed' };
      }

      // Wipe all local settings before applying cloud config
      await AsyncStorage.multiRemove(Object.values(KEYS));
      await Promise.all([
        clearSecurePin(),
        clearSecureApiKey(),
        clearSecureMqttPassword(),
        clearSecureBasicAuthPassword(),
      ]);

      await saveCloudCredentials({
        deviceId: data.device_id,
        apiKey: data.api_key,
        cloudUrl: url,
        organizationName: data.organization_name,
      });

      // First heartbeat — will pull cloud config if one exists
      await this.start();

      return { success: true, organizationName: data.organization_name };
    } catch {
      return { success: false, error: 'Cannot reach server' };
    }
  }

  // ─── Unenrollment ────────────────────────────────────────────────────────────

  async unenroll(): Promise<void> {
    const creds = await getCloudCredentials();
    if (creds) {
      try {
        await fetch(`${creds.cloudUrl}/api/v1/devices/${creds.deviceId}/unenroll/`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${creds.apiKey}` },
        });
      } catch {} // best-effort, proceed regardless
    }
    await this._wipeAndUnenroll();
  }

  private async _wipeAndUnenroll(): Promise<void> {
    this.stop();

    // Clear all AsyncStorage settings
    await AsyncStorage.multiRemove(Object.values(KEYS));

    // Clear all Keychain secrets
    await Promise.all([
      clearSecurePin(),
      clearSecureApiKey(),
      clearSecureMqttPassword(),
      clearSecureBasicAuthPassword(),
      clearCloudCredentials(),
    ]);

    DeviceEventEmitter.emit(FORCE_UNENROLL_EVENT);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  async getCredentials(): Promise<CloudCredentials | null> {
    return getCloudCredentials();
  }

  async isEnrolled(): Promise<boolean> {
    return (await getCloudCredentials()) !== null;
  }
}

export const CloudSyncService = new CloudSyncServiceClass();
