import {
  ADMIN_ACCESS_POSITIONS,
  getAdminAccessPositionStyle,
  normalizeAdminAccessPosition,
} from '../src/types/adminAccessPosition';

describe('admin access positions', () => {
  it('supports all nine screen anchors', () => {
    expect(ADMIN_ACCESS_POSITIONS).toEqual([
      'top-left',
      'top-center',
      'top-right',
      'center-left',
      'center',
      'center-right',
      'bottom-left',
      'bottom-center',
      'bottom-right',
    ]);
  });

  it('normalizes middle aliases and invalid persisted values', () => {
    expect(normalizeAdminAccessPosition('top-middle')).toBe('top-center');
    expect(normalizeAdminAccessPosition('middle-left')).toBe('center-left');
    expect(normalizeAdminAccessPosition('middle')).toBe('center');
    expect(normalizeAdminAccessPosition('bottom-middle')).toBe('bottom-center');
    expect(normalizeAdminAccessPosition('invalid')).toBe('bottom-right');
  });

  it('centers a square target on either axis without hard-coded screen dimensions', () => {
    expect(getAdminAccessPositionStyle('top-center')).toEqual({
      top: 20,
      left: '50%',
      transform: [{ translateX: -25 }],
    });
    expect(getAdminAccessPositionStyle('center')).toEqual({
      top: '50%',
      left: '50%',
      transform: [{ translateX: -25 }, { translateY: -25 }],
    });
    expect(getAdminAccessPositionStyle('center-right')).toEqual({
      top: '50%',
      right: 20,
      transform: [{ translateY: -25 }],
    });
  });
});
