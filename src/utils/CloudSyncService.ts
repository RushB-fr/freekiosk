import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter, NativeModules } from 'react-native';

import { StorageService, KEYS } from './storage';
import DeviceControlService from '../services/DeviceControlService';
import { CloudCommandService } from './CloudCommandService';
import { getCapabilities } from './capabilities';
import KioskModule from './KioskModule';
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
    // Keep the CPU + WiFi awake so this heartbeat/poll loop survives screen-off; without
    // it the device drops off the cloud and can no longer be woken remotely.
    KioskModule.acquireCloudWakeLock().catch(() => {/* best-effort */});
    // Also exempt from Doze so it holds up on battery-powered devices (silent in DO, no-op
    // in Play builds). Best-effort: the wake lock is the primary mechanism.
    KioskModule.requestIgnoreBatteryOptimizations().catch(() => {/* best-effort */});
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
    KioskModule.releaseCloudWakeLock().catch(() => {/* best-effort */});
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
        // Refresh the capability list every heartbeat so granting a permission
        // after enrollment is reflected in the dashboard on the next tick.
        const capabilities = await getCapabilities().catch(() => [] as string[]);
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
            capabilities,
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
      // Declare what this device can do so the dashboard shows only viable
      // actions from the start (refreshed later on every heartbeat).
      const capabilities = await getCapabilities().catch(() => [] as string[]);
      const response = await fetch(`${url}/api/v1/devices/enroll/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, device_info: { ...deviceInfo, capabilities } }),
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

      // Local settings were wiped above. Force the running app to reload so the
      // reset (or cloud-pushed) config takes effect immediately. Without this, the
      // kiosk keeps its pre-enrollment config in memory until an app restart
      // (the heartbeat only emits this event when the cloud actually pushes a
      // config, so a freshly-enrolled device with no cloud config never reloaded).
      DeviceEventEmitter.emit(CONFIG_UPDATED_EVENT);

      return { success: true, organizationName: data.organization_name };
    } catch {
      return { success: false, error: 'Cannot reach server' };
    }
  }

  // ─── Zero-touch provisioning ──────────────────────────────────────────────────

  /**
   * Consume an enrollment handed over by Device Owner provisioning (the
   * setup-wizard QR). Runs once on startup: if the device isn't already
   * enrolled and the native layer has a pending token, enroll automatically and
   * clear it. Best-effort and idempotent.
   */
  async consumePendingProvisioningEnrollment(): Promise<void> {
    try {
      if (await this.isEnrolled()) return;
      const pending = await KioskModule.getPendingCloudEnrollment?.();
      if (!pending?.enroll_token || !pending?.cloud_url) return;

      const PC = (NativeModules as any).PlatformConstants;
      const result = await this.enroll(pending.cloud_url, pending.enroll_token, {
        model: PC?.Model ?? '',
        manufacturer: PC?.Manufacturer ?? '',
        android_version: PC?.Release ?? '',
        app_version: PC?.appVersion ?? '',
        serial_number: '',
      });
      if (result.success) {
        // A device provisioned via the setup-wizard QR is a Device Owner kiosk:
        // pin FreeKiosk as the persistent Home launcher so the "choose launcher"
        // prompt never appears and the user can't switch back to the stock one.
        // Best-effort and DO-only (no-op otherwise); the cloud config can still
        // override this later. Only on provisioning auto-enroll, not manual enroll.
        KioskModule.setDefaultLauncherMode(true).catch(() => {/* DO only */});
      }
      // Clear on success, or on a definitive rejection, so a bad/used token
      // doesn't get retried on every launch. Network errors are left pending.
      if (result.success || result.error !== 'Cannot reach server') {
        await KioskModule.clearPendingCloudEnrollment?.();
      }
    } catch {
      // Never block startup on provisioning.
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
