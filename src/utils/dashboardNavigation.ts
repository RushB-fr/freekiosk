/**
 * Dashboard tile-page navigation: two-finger swipe gestures and moving between tiles.
 *
 * Kept free of React and native modules so it can be unit-tested. The swipes themselves are
 * recognised natively (TwoFingerSwipeDetector, fed by MainActivity) and arrive as
 * 'onNavGesture' events carrying one of these directions.
 */

export type NavGestureDirection = 'down' | 'up' | 'left' | 'right';

const NAV_GESTURE_DIRECTIONS: readonly NavGestureDirection[] = ['down', 'up', 'left', 'right'];

export const isNavGestureDirection = (value: unknown): value is NavGestureDirection =>
  NAV_GESTURE_DIRECTIONS.includes(value as NavGestureDirection);

/**
 * Index of the tile to open after a sideways swipe. Swipe left = next tile (the one to its
 * right in the grid), like turning a page; swipe right = previous. Wraps around at the ends.
 * Returns `current` unchanged when there is nowhere to go.
 */
export const nextTileIndex = (current: number, count: number, direction: 'left' | 'right'): number => {
  if (count < 2 || current < 0 || current >= count) return current;
  const step = direction === 'left' ? 1 : -1;
  return (current + step + count) % count;
};

/** Seconds the auto-hidden navigation bar stays up: 1-30, default 4 (also for bad input). */
export const navAutoHideSeconds = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(30, Math.max(1, Math.round(value))) : 4;
