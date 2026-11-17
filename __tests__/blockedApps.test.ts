import { normalizeBlockedApps } from '../src/types/blockedApps';

describe('normalizeBlockedApps', () => {
  it('accepts object and legacy string entries while preserving display names', () => {
    expect(normalizeBlockedApps([
      { packageName: 'com.android.vending', displayName: 'Google Play Store' },
      'com.example.kids',
    ])).toEqual([
      { packageName: 'com.android.vending', displayName: 'Google Play Store' },
      { packageName: 'com.example.kids', displayName: 'com.example.kids' },
    ]);
  });

  it('deduplicates packages and rejects malformed or self-blocking entries', () => {
    expect(normalizeBlockedApps([
      { packageName: 'com.android.vending', displayName: 'Play Store' },
      { packageName: 'com.android.vending', displayName: 'Duplicate' },
      { packageName: 'com.freekiosk', displayName: 'FreeKiosk' },
      { packageName: 'not a package', displayName: 'Invalid' },
      null,
    ])).toEqual([
      { packageName: 'com.android.vending', displayName: 'Play Store' },
    ]);
  });

  it('returns an empty list for malformed persisted values', () => {
    expect(normalizeBlockedApps(null)).toEqual([]);
    expect(normalizeBlockedApps({ packageName: 'com.android.vending' })).toEqual([]);
  });
});
