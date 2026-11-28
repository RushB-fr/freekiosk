import { formatFingerprint, normalizeFingerprint, parseFingerprintList } from '../src/utils/certificateFingerprint';

const HEX = '6547404c711a173b4372d57bc583bcbbcf076c211d3a35b8f72c4522155169c5';
const COLONS = '65:47:40:4C:71:1A:17:3B:43:72:D5:7B:C5:83:BC:BB:CF:07:6C:21:1D:3A:35:B8:F7:2C:45:22:15:51:69:C5';

describe('normalizeFingerprint', () => {
  it('accepts a bare hex string in any case', () => {
    expect(normalizeFingerprint(HEX)).toBe(HEX);
    expect(normalizeFingerprint(HEX.toUpperCase())).toBe(HEX);
  });

  it('accepts the colon form printed by openssl, with or without its label', () => {
    expect(normalizeFingerprint(COLONS)).toBe(HEX);
    expect(normalizeFingerprint(`sha256 Fingerprint=${COLONS}`)).toBe(HEX);
    expect(normalizeFingerprint(`SHA256 Fingerprint=${COLONS}\n`)).toBe(HEX);
  });

  it('accepts spaces, dashes and a SHA-256 prefix', () => {
    expect(normalizeFingerprint(COLONS.replace(/:/g, ' '))).toBe(HEX);
    expect(normalizeFingerprint(COLONS.replace(/:/g, '-'))).toBe(HEX);
    expect(normalizeFingerprint(`SHA-256: ${COLONS}`)).toBe(HEX);
  });

  it('refuses anything that is not 32 bytes of hex', () => {
    expect(normalizeFingerprint('')).toBeNull();
    expect(normalizeFingerprint('not a fingerprint')).toBeNull();
    expect(normalizeFingerprint(HEX.slice(0, 62))).toBeNull();
    expect(normalizeFingerprint(HEX + 'ab')).toBeNull();
    expect(normalizeFingerprint('zz' + HEX.slice(2))).toBeNull();
    // SHA-1 (20 bytes) is not accepted
    expect(normalizeFingerprint(COLONS.split(':').slice(0, 20).join(':'))).toBeNull();
  });

  it('never returns something the native fallback value ("issuer|subject") could match', () => {
    expect(normalizeFingerprint('CN=Example CA|CN=kiosk.lan')).toBeNull();
  });
});

describe('parseFingerprintList', () => {
  it('splits on commas, semicolons and line breaks, drops duplicates and reports bad entries', () => {
    const other = 'a'.repeat(64);
    const { valid, invalid } = parseFingerprintList(`${COLONS},\n${other};${HEX}\n  ;oops`);
    expect(valid).toEqual([HEX, other]);
    expect(invalid).toEqual(['oops']);
  });

  it('returns nothing for an empty value', () => {
    expect(parseFingerprintList('')).toEqual({ valid: [], invalid: [] });
    expect(parseFingerprintList(' , ;\n')).toEqual({ valid: [], invalid: [] });
  });
});

describe('formatFingerprint', () => {
  it('prints uppercase pairs separated by colons', () => {
    expect(formatFingerprint(HEX)).toBe(COLONS);
  });
});
