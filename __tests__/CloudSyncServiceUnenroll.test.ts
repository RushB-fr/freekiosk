/**
 * Leaving the cloud from the app: the call that tells the cloud, and the local wipe that
 * must follow whatever the cloud answers.
 *
 *   - a try is bounded, so a connection that hangs cannot keep the button spinning
 *   - a network failure or a 5xx gets another try, so a tablet that was briefly offline
 *     still tells the cloud
 *   - a refusal (401, 403, 404: an older cloud that does not know the URL) is final and
 *     is not retried, and the wipe still happens: Unenroll must work against any cloud
 */
// A module of its own: other test files declare an installFetch of their own, and without
// this the two would collide in TypeScript's shared script scope.
export {};

const { NativeModules } = require('react-native');
NativeModules.HttpServerModule = {
  executeNativeCommand: jest.fn(),
  captureScreenshotBase64: jest.fn(),
};

const mockClearCloudCredentials = jest.fn(() => Promise.resolve());
const mockGetCloudCredentials = jest.fn();

jest.mock('../src/utils/secureStorage', () => ({
  ...jest.requireActual('../src/utils/secureStorage'),
  getCloudCredentials: (...args: any[]) => mockGetCloudCredentials(...args),
  clearCloudCredentials: () => mockClearCloudCredentials(),
  clearSecurePin: jest.fn(() => Promise.resolve()),
  clearSecureApiKey: jest.fn(() => Promise.resolve()),
  clearSecureMqttPassword: jest.fn(() => Promise.resolve()),
  clearSecureBasicAuthPassword: jest.fn(() => Promise.resolve()),
}));

const { CloudSyncService } = require('../src/utils/CloudSyncService');

const CREDS = {
  deviceId: 'dev-1',
  apiKey: 'fk_test',
  cloudUrl: 'https://cloud.test',
  organizationName: 'Test Org',
};

const UNENROLL_URL = 'https://cloud.test/api/v1/devices/dev-1/unenroll/';

type Step = { status: number } | 'network-error' | 'hang';

/**
 * Plays the cloud: one step per call. 'hang' never answers, but honours the abort signal
 * the way a real fetch does, so the timeout path is exercised for real.
 */
function installFetch(steps: Step[]) {
  const calls: { url: string; init: any }[] = [];
  (globalThis as any).fetch = jest.fn((url: string, init: any) => {
    calls.push({ url, init });
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    if (step === 'network-error') {
      return Promise.reject(new TypeError('Network request failed'));
    }
    if (step === 'hang') {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
    }
    return Promise.resolve({ status: step.status });
  });
  return calls;
}

/** Runs unenroll() to the end, letting fake timers fire whatever it is waiting on. */
async function runUnenroll() {
  const done = CloudSyncService.unenroll();
  await jest.runAllTimersAsync();
  await done;
}

describe('CloudSyncService.unenroll', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockClearCloudCredentials.mockClear();
    mockGetCloudCredentials.mockReset();
    mockGetCloudCredentials.mockResolvedValue(CREDS);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('tells the cloud once, with the device key, and wipes', async () => {
    const calls = installFetch([{ status: 200 }]);

    await runUnenroll();

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(UNENROLL_URL);
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.headers.Authorization).toBe('Bearer fk_test');
    expect(mockClearCloudCredentials).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403, 404])('does not retry a %i and still wipes', async status => {
    const calls = installFetch([{ status }]);

    await runUnenroll();

    expect(calls).toHaveLength(1);
    expect(mockClearCloudCredentials).toHaveBeenCalledTimes(1);
  });

  it('retries after a network failure and stops once the cloud answers', async () => {
    const calls = installFetch(['network-error', { status: 200 }]);

    await runUnenroll();

    expect(calls).toHaveLength(2);
    expect(mockClearCloudCredentials).toHaveBeenCalledTimes(1);
  });

  it('retries after a server error', async () => {
    const calls = installFetch([{ status: 503 }, { status: 200 }]);

    await runUnenroll();

    expect(calls).toHaveLength(2);
    expect(mockClearCloudCredentials).toHaveBeenCalledTimes(1);
  });

  it('gives up after three tries and wipes anyway', async () => {
    const calls = installFetch(['network-error']);

    await runUnenroll();

    expect(calls).toHaveLength(3);
    expect(mockClearCloudCredentials).toHaveBeenCalledTimes(1);
  });

  it('is not held for ever by a request that hangs', async () => {
    const calls = installFetch(['hang']);

    await runUnenroll();

    expect(calls).toHaveLength(3);
    expect(mockClearCloudCredentials).toHaveBeenCalledTimes(1);
  });

  it('passes an abort signal to every try', async () => {
    const calls = installFetch(['network-error']);

    await runUnenroll();

    for (const call of calls) {
      expect(call.init.signal).toBeDefined();
    }
  });

  it('wipes without calling the cloud when the device holds no credentials', async () => {
    mockGetCloudCredentials.mockResolvedValue(null);
    const calls = installFetch([{ status: 200 }]);

    await runUnenroll();

    expect(calls).toHaveLength(0);
    expect(mockClearCloudCredentials).toHaveBeenCalledTimes(1);
  });
});
