/**
 * FreeKiosk v1.2 - Color Palette
 * Centralized color system for consistent UI.
 * Brand-aligned with FreeKiosk Cloud: primary #2b7fff, navy content, soft blue-tinted surfaces.
 */

export const Colors = {
  // Primary brand colors (FreeKiosk Cloud blue)
  primary: '#2b7fff',
  primaryLight: '#e8f1ff',
  primaryDark: '#1e63d6',

  // Secondary accent
  secondary: '#22c55e',
  secondaryLight: '#e7f9ef',
  secondaryDark: '#15803d',

  // Status colors
  success: '#22c55e',
  successLight: '#e7f9ef',
  successDark: '#15803d',

  warning: '#f59e0b',
  warningLight: '#fff6e0',
  warningDark: '#b45309',

  error: '#ef4444',
  errorLight: '#fee2e2',
  errorDark: '#b91c1c',

  info: '#2b7fff',
  infoLight: '#e8f1ff',
  infoDark: '#1e63d6',

  // Neutral colors (soft blue-tinted, echoing cloud light theme)
  background: '#f3f6ff',
  surface: '#ffffff',
  surfaceVariant: '#f8faff',

  // Text colors (navy content, like cloud base-content)
  textPrimary: '#1b2a4d',
  textSecondary: '#5a6b8c',
  textHint: '#8b99b5',
  textDisabled: '#c2cbdd',
  textOnPrimary: '#ffffff',

  // Border colors (blue-tinted, subtle)
  border: '#e2e8f5',
  borderLight: '#eef2fb',
  divider: '#e2e8f5',

  // Specific UI elements
  switchTrackOff: '#c2cbdd',
  switchTrackOn: '#9dc2ff',
  switchThumbOff: '#ffffff',

  // Shadows
  shadow: '#0d1730',

  // Tab specific
  tabActive: '#2b7fff',
  tabInactive: '#8b99b5',
  tabIndicator: '#2b7fff',

  // Card backgrounds by type
  cardDefault: '#ffffff',
  cardInfo: '#e8f1ff',
  cardWarning: '#fff6e0',
  cardError: '#fee2e2',
  cardSuccess: '#e7f9ef',
};

export type ColorKey = keyof typeof Colors;

export default Colors;
