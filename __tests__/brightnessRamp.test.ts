import { rampBrightness, cancelBrightnessRamp } from '../src/utils/brightnessRamp';

describe('rampBrightness', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const run = async (promise: Promise<void>) => {
    await jest.runAllTimersAsync();
    await promise;
  };
  const from = (level: number) => () => Promise.resolve(level);

  it('steps down monotonically and lands exactly on the target', async () => {
    const set = jest.fn().mockResolvedValue(undefined);
    await run(rampBrightness(from(0.8), 0, 1000, set));

    const levels = set.mock.calls.map(c => c[0]);
    expect(levels.length).toBe(10);
    expect(levels[levels.length - 1]).toBe(0);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]).toBeLessThan(levels[i - 1]);
    }
    expect(levels[0]).toBeLessThan(0.8);
  });

  it('sets the target at once when the duration is zero, without reading the level', async () => {
    const set = jest.fn().mockResolvedValue(undefined);
    const read = jest.fn(from(0.8));
    await run(rampBrightness(read, 0.1, 0, set));
    expect(set.mock.calls).toEqual([[0.1]]);
    expect(read).not.toHaveBeenCalled();
  });

  it('stops without touching the brightness again once cancelled', async () => {
    const set = jest.fn().mockImplementation(async () => {
      if (set.mock.calls.length === 3) cancelBrightnessRamp();
    });
    await run(rampBrightness(from(1), 0, 1000, set));
    expect(set).toHaveBeenCalledTimes(3);
  });

  it('stops when cancelled while the current level is still being read', async () => {
    const set = jest.fn().mockResolvedValue(undefined);
    const read = () => {
      cancelBrightnessRamp();
      return Promise.resolve(1);
    };
    await run(rampBrightness(read, 0, 1000, set));
    expect(set).not.toHaveBeenCalled();
  });

  it('a newer ramp stops the older one', async () => {
    const older = jest.fn().mockResolvedValue(undefined);
    const newer = jest.fn().mockResolvedValue(undefined);
    const first = rampBrightness(from(1), 0, 1000, older);
    const second = rampBrightness(from(1), 0.5, 1000, newer);
    await run(Promise.all([first, second]).then(() => undefined));
    expect(older).not.toHaveBeenCalled();
    expect(newer.mock.calls[newer.mock.calls.length - 1][0]).toBe(0.5);
  });
});
