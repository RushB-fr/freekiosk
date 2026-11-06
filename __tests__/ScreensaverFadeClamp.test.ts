import { clampScreensaverFadeSeconds } from '../src/utils/storage';

describe('clampScreensaverFadeSeconds', () => {
  it('keeps a cloud or backup value within 0..30 s', () => {
    expect(clampScreensaverFadeSeconds(12)).toBe(12);
    expect(clampScreensaverFadeSeconds(300)).toBe(30);
    expect(clampScreensaverFadeSeconds(-5)).toBe(0);
    expect(clampScreensaverFadeSeconds(NaN)).toBe(0);
    expect(clampScreensaverFadeSeconds('10')).toBe(0);
    expect(clampScreensaverFadeSeconds(undefined)).toBe(0);
  });
});
