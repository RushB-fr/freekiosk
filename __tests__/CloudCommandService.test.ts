/**
 * Covers the delivery guarantees added for cloud command reporting:
 *   - a result the network refused is queued and retried, instead of being lost
 *     while the server keeps the command in 'sent' for ever
 *   - a command that killed the process (reboot, self-update) is still reported
 *     once the app comes back up
 */
// jest.setup.js stubs native modules with a Proxy whose `get` trap hands back a fresh
// jest.fn() on every access, so a spy set on it is discarded. CloudCommandService also
// destructures HttpServerModule at import time. Both mean the stub has to be replaced by
// a plain object *before* the module under test is loaded, hence require() over import.
const { NativeModules } = require('react-native');
const nativeHttp = {
  executeNativeCommand: jest.fn(),
  captureScreenshotBase64: jest.fn(),
};
NativeModules.HttpServerModule = nativeHttp;

const { CloudCommandService } = require('../src/utils/CloudCommandService');
const { StorageService } = require('../src/utils/storage');

jest.mock('../src/utils/secureStorage', () => ({
  ...jest.requireActual('../src/utils/secureStorage'),
  getCloudCredentials: jest.fn(() =>
    Promise.resolve({
      deviceId: 'dev-1',
      apiKey: 'fk_test',
      cloudUrl: 'https://cloud.test',
      organizationName: 'Test Org',
    }),
  ),
}));

type FetchCall = { url: string; body: any };

/**
 * Routes the three endpoints the service talks to. `resultsFail` makes the
 * report endpoint behave like a device that lost the network mid-report.
 */
function installFetch(opts: { commands?: any[]; resultsFail?: boolean }) {
  const calls: FetchCall[] = [];
  (globalThis as any).fetch = jest.fn(async (url: any, init: any) => {
    const u = String(url);
    calls.push({ url: u, body: init?.body ? JSON.parse(init.body) : null });

    if (u.includes('/updates/')) {
      return { ok: true, status: 200, json: async () => [] } as any;
    }
    if (u.includes('/commands/') && !u.includes('/result/')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ commands: opts.commands ?? [] }),
      } as any;
    }
    // /commands/{id}/result/
    if (opts.resultsFail) throw new Error('Network request failed');
    return { ok: true, status: 200, json: async () => ({}) } as any;
  }) as any;
  return calls;
}

const future = () => new Date(Date.now() + 60_000).toISOString();

beforeEach(async () => {
  await StorageService.savePendingReports([]);
  await StorageService.saveInflightCommand(null);
});

describe('result reporting survives a failed POST', () => {
  it('queues the result when the report fails, then flushes it on the next poll', async () => {
    // A toast with no KioskScreen mounted resolves to a "Handler unavailable"
    // outcome. What matters here is that an outcome exists and gets reported.
    const cmd = { id: 'cmd-queue-1', type: 'toast', params: { message: 'hi' }, created_at: '', expires_at: future() };

    installFetch({ commands: [cmd], resultsFail: true });
    await CloudCommandService.poll();

    const queued = await StorageService.getPendingReports();
    expect(queued).toHaveLength(1);
    expect((queued[0] as any).commandId).toBe('cmd-queue-1');

    // Network is back, and the server has nothing new to hand out.
    const calls = installFetch({ commands: [] });
    await CloudCommandService.poll();

    expect(await StorageService.getPendingReports()).toHaveLength(0);
    expect(calls.some(c => c.url.includes('/commands/cmd-queue-1/result/'))).toBe(true);
  });
});

describe('native dispatch', () => {
  it('reports the native result without going through the JS action path', async () => {
    const spy = nativeHttp.executeNativeCommand;
    spy.mockResolvedValue(JSON.stringify({ executed: true, command: 'tts' }));

    const cmd = { id: 'cmd-native-1', type: 'speak', params: { text: 'bonjour' }, created_at: '', expires_at: future() };
    const calls = installFetch({ commands: [cmd] });
    await CloudCommandService.poll();

    expect(spy).toHaveBeenCalledWith('tts', JSON.stringify({ text: 'bonjour' }));
    const report = calls.find(c => c.url.includes('/commands/cmd-native-1/result/'));
    expect(report!.body.status).toBe('success');
    spy.mockReset();
  });

  it('falls back to the JS path when the native handler declines', async () => {
    const spy = nativeHttp.executeNativeCommand;
    spy.mockResolvedValue(JSON.stringify({ nativelyHandled: false, command: 'reload' }));

    const cmd = { id: 'cmd-native-2', type: 'reload', params: {}, created_at: '', expires_at: future() };
    const calls = installFetch({ commands: [cmd] });
    await CloudCommandService.poll();

    // No KioskScreen is mounted here, so the JS path answers "Handler unavailable".
    // That it answered at all is the proof the fallback ran.
    const report = calls.find(c => c.url.includes('/commands/cmd-native-2/result/'));
    expect(report!.body.status).toBe('error');
    expect(report!.body.error_message).toMatch(/handler/i);
    spy.mockReset();
  });
});

describe('a command interrupted by the process dying', () => {
  it('reports a reboot as a success once the app is back', async () => {
    await StorageService.saveInflightCommand({
      commandId: 'cmd-reboot-1',
      type: 'reboot',
      killsProcess: true,
    });

    const calls = installFetch({});
    await CloudCommandService.settleOutstanding();

    const report = calls.find(c => c.url.includes('/commands/cmd-reboot-1/result/'));
    expect(report).toBeDefined();
    expect(report!.body.status).toBe('success');
    // The marker must be cleared, or every later start would report it again.
    expect(await StorageService.getInflightCommand()).toBeNull();
  });

  it('reports anything else as interrupted rather than claiming success', async () => {
    await StorageService.saveInflightCommand({
      commandId: 'cmd-killed-1',
      type: 'execute_js',
      killsProcess: false,
    });

    const calls = installFetch({});
    await CloudCommandService.settleOutstanding();

    const report = calls.find(c => c.url.includes('/commands/cmd-killed-1/result/'));
    expect(report).toBeDefined();
    expect(report!.body.status).toBe('error');
    expect(report!.body.error_message).toMatch(/restarted/i);
  });
});
