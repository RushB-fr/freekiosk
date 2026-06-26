/**
 * CloudCommandService.ts
 * Consumes the FreeKiosk Cloud command queue and the dedicated APK update
 * channel, dispatches actions through ApiService.executeAction (the same path
 * as the local REST/MQTT server), and reports each result back to the server.
 *
 * Channels:
 *   - GET  /api/v1/devices/{id}/commands/  → transient actions (mark 'sent' server-side)
 *   - GET  /api/v1/devices/{id}/updates/   → install_apk (resolves signed download URL)
 *   - POST /api/v1/commands/{id}/result/   → report success/error
 *
 * Triggered from CloudSyncService on each heartbeat when pending_commands > 0.
 *
 * Background-mode caveat: this runs on the JS thread, which React Native freezes
 * while the activity is backgrounded (e.g. External App mode behind a launched
 * app). Polling therefore only runs reliably in WebView/media mode. Full
 * coverage would require a native poller (cf. OverlayService for the screensaver).
 */
import { NativeModules } from 'react-native';
import RNFS from 'react-native-fs';

import { ApiService, ActionResult } from './ApiService';
import { getCloudCredentials, CloudCredentials } from './secureStorage';
import ManagedAppInstaller from './ManagedAppInstaller';

const { HttpServerModule } = NativeModules;

interface CloudCommand {
  id: string;
  type: string;
  params: Record<string, any>;
  created_at: string;
  expires_at: string;
}

interface CloudUpdate {
  command_id: string;
  package_name: string | null;
  version_name: string | null;
  download_url: string;
}

type CommandMapper = (params: Record<string, any>) => {
  command: string;
  params: Record<string, any>;
};

/**
 * Maps a cloud CommandType (snake_case) to the local action name + param shape
 * understood by ApiService.executeAction. URL / brightness / volume are NOT here:
 * those are managed settings delivered through the config-sync channel, not
 * transient commands. install_apk is handled via the /updates/ channel, not here.
 */
const COMMAND_MAP: Record<string, CommandMapper> = {
  screen_on: () => ({ command: 'screenOn', params: {} }),
  screen_off: () => ({ command: 'screenOff', params: {} }),
  reload: () => ({ command: 'reload', params: {} }),
  screensaver_on: () => ({ command: 'screensaverOn', params: {} }),
  screensaver_off: () => ({ command: 'screensaverOff', params: {} }),
  wake: () => ({ command: 'wake', params: {} }),
  speak: (p) => ({ command: 'tts', params: { text: p.text } }),
  play_sound: (p) => ({ command: 'playSound', params: { url: p.url } }),
  audio_stop: () => ({ command: 'audioStop', params: {} }),
  reboot: () => ({ command: 'reboot', params: {} }),
  clear_cache: () => ({ command: 'clearCache', params: {} }),
  toast: (p) => ({ command: 'toast', params: { text: p.message } }),
  execute_js: (p) => ({ command: 'executeJs', params: { code: p.code } }),
  launch_app: (p) => ({ command: 'launchApp', params: { package: p.package_name } }),
  // NOTE: `screenshot` is handled separately (capture + upload), not via this map.
};

class CloudCommandServiceClass {
  private isPolling = false;
  // Guards against re-dispatching the same command if two polls overlap. The
  // server already only returns 'pending' commands, so this is belt-and-braces.
  private processed = new Set<string>();

  /**
   * Fetch + execute any pending commands and APK updates. Safe to call on every
   * heartbeat; no-ops if a poll is already in flight.
   */
  async poll(creds?: CloudCredentials): Promise<void> {
    if (this.isPolling) return;
    const c = creds ?? (await getCloudCredentials());
    if (!c) return;

    this.isPolling = true;
    try {
      // APK updates first — these are the slowest, and ordering doesn't matter.
      await this.pollUpdates(c);
      await this.pollCommands(c);
    } catch (error) {
      console.error('[CloudCommand] Poll error:', error);
    } finally {
      this.isPolling = false;
      // Keep the dedup set from growing unbounded.
      if (this.processed.size > 200) this.processed.clear();
    }
  }

  // ─── Generic command queue ───────────────────────────────────────────────────

  private async pollCommands(c: CloudCredentials): Promise<void> {
    const res = await fetch(`${c.cloudUrl}/api/v1/devices/${c.deviceId}/commands/`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${c.apiKey}` },
    });
    if (!res.ok) return;

    const data = await res.json();
    const commands: CloudCommand[] = data?.commands ?? [];

    for (const cmd of commands) {
      if (this.processed.has(cmd.id)) continue;
      this.processed.add(cmd.id);

      // Skip already-expired commands (don't bother executing/reporting).
      if (cmd.expires_at && new Date(cmd.expires_at).getTime() < Date.now()) {
        continue;
      }

      const outcome = await this.runCommand(cmd, c);
      await this.reportResult(c, cmd.id, outcome);
    }
  }

  private async runCommand(cmd: CloudCommand, c: CloudCredentials): Promise<ActionResult> {
    // Screenshot needs a capture + upload round-trip, not a fire-and-forget action.
    if (cmd.type === 'screenshot') {
      return this.captureAndUploadScreenshot(c);
    }

    const mapper = COMMAND_MAP[cmd.type];
    if (!mapper) {
      return { ok: false, error: `Unsupported command type: ${cmd.type}` };
    }
    try {
      const { command, params } = mapper(cmd.params || {});
      return await ApiService.executeAction(command, params);
    } catch (error: any) {
      return { ok: false, error: error?.message ?? String(error) };
    }
  }

  /**
   * Capture the current screen (reusing the same native capture as the local
   * REST `/api/screenshot`) and upload it to the cloud screenshot endpoint.
   */
  private async captureAndUploadScreenshot(c: CloudCredentials): Promise<ActionResult> {
    if (!HttpServerModule?.captureScreenshotBase64) {
      return { ok: false, error: 'Screenshot capture unavailable on this build' };
    }

    let tmpPath: string | null = null;
    try {
      const base64: string = await HttpServerModule.captureScreenshotBase64();
      if (!base64) return { ok: false, error: 'Empty screenshot' };

      // RN multipart file uploads need a file URI, so stage the PNG on disk.
      tmpPath = `${RNFS.CachesDirectoryPath}/cloud-screenshot-${Date.now()}.png`;
      await RNFS.writeFile(tmpPath, base64, 'base64');

      const form = new FormData();
      form.append('image', {
        uri: `file://${tmpPath}`,
        type: 'image/png',
        name: 'screenshot.png',
      } as any);
      form.append('captured_at', new Date().toISOString());

      const res = await fetch(`${c.cloudUrl}/api/v1/devices/${c.deviceId}/screenshot/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${c.apiKey}` },
        body: form,
      });
      if (!res.ok) {
        return { ok: false, error: `Screenshot upload failed: HTTP ${res.status}` };
      }
      return { ok: true, result: { uploaded: true } };
    } catch (error: any) {
      return { ok: false, error: error?.message ?? String(error) };
    } finally {
      if (tmpPath) {
        RNFS.unlink(tmpPath).catch(() => {/* best-effort cleanup */});
      }
    }
  }

  // ─── APK update channel (install_apk) ────────────────────────────────────────

  private async pollUpdates(c: CloudCredentials): Promise<void> {
    const res = await fetch(`${c.cloudUrl}/api/v1/devices/${c.deviceId}/updates/`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${c.apiKey}` },
    });
    if (!res.ok) return;

    const updates: CloudUpdate[] = (await res.json()) ?? [];

    for (const u of updates) {
      if (!u.command_id || this.processed.has(u.command_id)) continue;
      this.processed.add(u.command_id);

      try {
        const result = await ManagedAppInstaller.installFromUrl(
          u.download_url,
          c.apiKey, // the download endpoint is authenticated with the device API key
          u.package_name ?? null,
        );
        await this.reportResult(c, u.command_id, {
          ok: true,
          result: {
            installed_package: u.package_name ?? '',
            version: u.version_name ?? '',
            install_status: result?.status ?? 'success',
          },
        });
      } catch (error: any) {
        await this.reportResult(c, u.command_id, {
          ok: false,
          error: error?.message ?? String(error),
        });
      }
    }
  }

  // ─── Result reporting ────────────────────────────────────────────────────────

  private async reportResult(
    c: CloudCredentials,
    commandId: string,
    outcome: ActionResult,
  ): Promise<void> {
    try {
      await fetch(`${c.cloudUrl}/api/v1/commands/${commandId}/result/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${c.apiKey}`,
        },
        body: JSON.stringify({
          status: outcome.ok ? 'success' : 'error',
          result: outcome.result ?? null,
          error_message: outcome.ok ? '' : outcome.error ?? 'Unknown error',
        }),
      });
    } catch (error) {
      console.error('[CloudCommand] Failed to report result for', commandId, error);
    }
  }
}

export const CloudCommandService = new CloudCommandServiceClass();
