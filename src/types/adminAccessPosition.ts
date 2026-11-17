import type { ViewStyle } from 'react-native';

export const ADMIN_ACCESS_POSITIONS = [
  'top-left',
  'top-center',
  'top-right',
  'center-left',
  'center',
  'center-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
] as const;

export type AdminAccessPosition = typeof ADMIN_ACCESS_POSITIONS[number];

const ADMIN_ACCESS_POSITION_SET = new Set<string>(ADMIN_ACCESS_POSITIONS);

const LEGACY_POSITION_ALIASES: Record<string, AdminAccessPosition> = {
  'top-middle': 'top-center',
  'middle-left': 'center-left',
  middle: 'center',
  'middle-center': 'center',
  'middle-right': 'center-right',
  'bottom-middle': 'bottom-center',
};

export const normalizeAdminAccessPosition = (
  value: unknown,
): AdminAccessPosition => {
  if (typeof value !== 'string') return 'bottom-right';
  const normalized = value.trim().toLowerCase();
  if (ADMIN_ACCESS_POSITION_SET.has(normalized)) {
    return normalized as AdminAccessPosition;
  }
  return LEGACY_POSITION_ALIASES[normalized] ?? 'bottom-right';
};

/** Positions a square admin access target against any edge or at either center axis. */
export const getAdminAccessPositionStyle = (
  value: unknown,
  controlSize = 50,
  edgeInset = 20,
): ViewStyle => {
  const position = normalizeAdminAccessPosition(value);
  const halfControl = -controlSize / 2;

  switch (position) {
    case 'top-left':
      return { top: edgeInset, left: edgeInset };
    case 'top-center':
      return { top: edgeInset, left: '50%', transform: [{ translateX: halfControl }] };
    case 'top-right':
      return { top: edgeInset, right: edgeInset };
    case 'center-left':
      return { top: '50%', left: edgeInset, transform: [{ translateY: halfControl }] };
    case 'center':
      return {
        top: '50%',
        left: '50%',
        transform: [{ translateX: halfControl }, { translateY: halfControl }],
      };
    case 'center-right':
      return { top: '50%', right: edgeInset, transform: [{ translateY: halfControl }] };
    case 'bottom-left':
      return { bottom: edgeInset, left: edgeInset };
    case 'bottom-center':
      return { bottom: edgeInset, left: '50%', transform: [{ translateX: halfControl }] };
    case 'bottom-right':
    default:
      return { bottom: edgeInset, right: edgeInset };
  }
};
