import { formatInactivityMinutes, resolveInactivityDelayMs } from '../src/utils/inactivityDelay';

describe('formatInactivityMinutes', () => {
  it('shows whole minutes as such and other values with decimals, never as 0', () => {
    expect(formatInactivityMinutes(600000)).toBe('10');
    expect(formatInactivityMinutes(60000)).toBe('1');
    expect(formatInactivityMinutes(90000)).toBe('1.5');
    expect(formatInactivityMinutes(10000)).toBe('0.17');
  });
});

describe('resolveInactivityDelayMs', () => {
  const stored = (ms: number) => ({ ms, text: formatInactivityMinutes(ms) });

  it('writes back a stored value the field cannot show, when the field was not touched', () => {
    expect(resolveInactivityDelayMs('0.17', stored(10000))).toBe(10000);
    expect(resolveInactivityDelayMs('1.5', stored(90000))).toBe(90000);
    expect(resolveInactivityDelayMs('10', stored(600000))).toBe(600000);
  });

  it('takes the typed whole minutes once the field was edited', () => {
    expect(resolveInactivityDelayMs('5', stored(600000))).toBe(300000);
    expect(resolveInactivityDelayMs('2', stored(10000))).toBe(120000);
    expect(resolveInactivityDelayMs('3', null)).toBe(180000);
  });

  it('refuses what was typed when it is not a whole number of minutes of at least 1', () => {
    expect(resolveInactivityDelayMs('0', stored(600000))).toBeNull();
    expect(resolveInactivityDelayMs('-2', stored(600000))).toBeNull();
    expect(resolveInactivityDelayMs('abc', stored(600000))).toBeNull();
    expect(resolveInactivityDelayMs('', stored(600000))).toBeNull();
    expect(resolveInactivityDelayMs('0.5', stored(600000))).toBeNull();
  });
});
