/**
 * FreeKiosk v1.2 - Theme Export
 * Central export for all theme elements
 */

export { Colors, type ColorKey } from './colors';
export { Spacing, type SpacingKey } from './spacing';
export { Typography, FontSizes, FontWeights } from './typography';

// Re-export defaults
import Colors from './colors';
import Spacing from './spacing';
import Typography from './typography';

export const theme = {
  colors: Colors,
  spacing: Spacing,
  typography: Typography,
};

export default theme;
