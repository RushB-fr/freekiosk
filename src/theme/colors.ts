/**
 * FreeKiosk v1.2 - Color Palette
 * Centralized color system for consistent UI
 */

export const Colors = {
  // Primary brand colors
  primary: '#0066cc',
  primaryLight: '#e3f2fd',
  primaryDark: '#004999',

  // Secondary accent
  secondary: '#4CAF50',
  secondaryLight: '#e8f5e9',
  secondaryDark: '#2e7d32',

  // Status colors
  success: '#4CAF50',
  successLight: '#e8f5e9',
  successDark: '#2e7d32',

  warning: '#ff9800',
  warningLight: '#fff3e0',
  warningDark: '#e65100',

  error: '#f44336',
  errorLight: '#ffebee',
  errorDark: '#c62828',

  info: '#2196F3',
  infoLight: '#e3f2fd',
  infoDark: '#1565c0',

  // Neutral colors
  background: '#f5f5f5',
  surface: '#ffffff',
  surfaceVariant: '#fafafa',

  // Text colors
  textPrimary: '#333333',
  textSecondary: '#666666',
  textHint: '#999999',
  textDisabled: '#cccccc',
  textOnPrimary: '#ffffff',

  // Border colors
  border: '#e0e0e0',
  borderLight: '#eeeeee',
  divider: '#e1e1e1',

  // Specific UI elements
  switchTrackOff: '#767577',
  switchTrackOn: '#81b0ff',
  switchThumbOff: '#f4f3f4',

  // Shadows
  shadow: '#000000',

  // Tab specific
  tabActive: '#0066cc',
  tabInactive: '#999999',
  tabIndicator: '#0066cc',

  // Card backgrounds by type
  cardDefault: '#ffffff',
  cardInfo: '#e3f2fd',
  cardWarning: '#fff3e0',
  cardError: '#ffebee',
  cardSuccess: '#e8f5e9',
};

export type ColorKey = keyof typeof Colors;

export default Colors;
