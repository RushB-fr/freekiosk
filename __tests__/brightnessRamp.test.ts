import { rampBrightness } from '../src/utils/brightnessRamp';

describe('rampBrightness', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const run = async (promise: Promise<void>) => {
    await jest.runAllTimersAsync();
    await promise;
  };

  it('steps down monotonically and lands exactly on the target', async () => {
    const set = jest.fn().mockResolvedValue(undefined);
    await run(rampBrightness(0.8, 0, 1000, set, () => false));

    const levels = set.mock.calls.map(c => c[0]);
    expect(levels.length).toBe(10);
    expect(levels[levels.length - 1]).toBe(0);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]).toBeLessThan(levels[i - 1]);
    }
    expect(levels[0]).toBeLessThan(0.8);
  });

  it('sets the target at once when the duration is zero', async () => {
    const set = jest.fn().mockResolvedValue(undefined);
    await run(rampBrightness(0.8, 0.1, 0, set, () => false));
    expect(set.mock.calls).toEqual([[0.1]]);
  });

  it('stops without touching the brightness again once cancelled', async () => {
    const set = jest.fn().mockResolvedValue(undefined);
    let cancelled = false;
    set.mockImplementation(async () => {
      if (set.mock.calls.length === 3) cancelled = true;
    });
    await run(rampBrightness(1, 0, 1000, set, () => cancelled));
    expect(set).toHaveBeenCalledTimes(3);
  });
});
