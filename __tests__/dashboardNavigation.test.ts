/**
 * Dashboard tile navigation: tile cycling and the gesture directions arriving from native.
 * The swipe recognition itself is tested in TwoFingerSwipeDetectorTest (Kotlin).
 */
import { isNavGestureDirection, navAutoHideSeconds, nextTileIndex } from '../src/utils/dashboardNavigation';

describe('nextTileIndex', () => {
  it('moves right on a left swipe and left on a right swipe, wrapping around', () => {
    expect(nextTileIndex(0, 3, 'left')).toBe(1);
    expect(nextTileIndex(2, 3, 'left')).toBe(0);
    expect(nextTileIndex(0, 3, 'right')).toBe(2);
    expect(nextTileIndex(1, 3, 'right')).toBe(0);
  });

  it('stays put with fewer than two tiles or an unknown position', () => {
    expect(nextTileIndex(0, 1, 'left')).toBe(0);
    expect(nextTileIndex(-1, 3, 'left')).toBe(-1);
    expect(nextTileIndex(5, 3, 'right')).toBe(5);
  });
});

describe('isNavGestureDirection', () => {
  it('accepts only the four directions', () => {
    expect(isNavGestureDirection('up')).toBe(true);
    expect(isNavGestureDirection('sideways')).toBe(false);
    expect(isNavGestureDirection(undefined)).toBe(false);
  });
});

describe('navAutoHideSeconds', () => {
  it('keeps 1-30 s and falls back to 4 for anything unusable', () => {
    expect(navAutoHideSeconds(7)).toBe(7);
    expect(navAutoHideSeconds(0)).toBe(1);
    expect(navAutoHideSeconds(90)).toBe(30);
    expect(navAutoHideSeconds(NaN)).toBe(4);
    expect(navAutoHideSeconds('7')).toBe(4);
  });
});
