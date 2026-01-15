/**
 * FreeKiosk v1.2 - Typography System
 * Consistent text styles across the app
 */

import { TextStyle } from 'react-native';
import Colors from './colors';

export const FontSizes = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  xxl: 20,
  xxxl: 24,
  title: 28,
};

export const FontWeights = {
  regular: '400' as TextStyle['fontWeight'],
  medium: '500' as TextStyle['fontWeight'],
  semibold: '600' as TextStyle['fontWeight'],
  bold: '700' as TextStyle['fontWeight'],
};

export const Typography = {
  // Titles
  title: {
    fontSize: FontSizes.title,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
  } as TextStyle,

  // Section headers
  sectionTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.semibold,
    color: Colors.textPrimary,
  } as TextStyle,

  // Labels
  label: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.semibold,
    color: Colors.textPrimary,
  } as TextStyle,

  labelSmall: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: Colors.textPrimary,
  } as TextStyle,

  // Body text
  body: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.regular,
    color: Colors.textSecondary,
    lineHeight: 20,
  } as TextStyle,

  bodyLarge: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.regular,
    color: Colors.textSecondary,
    lineHeight: 24,
  } as TextStyle,

  // Hints and captions
  hint: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.regular,
    color: Colors.textHint,
    lineHeight: 16,
  } as TextStyle,

  caption: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.regular,
    color: Colors.textHint,
  } as TextStyle,

  // Buttons
  button: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.textOnPrimary,
  } as TextStyle,

  buttonSmall: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: Colors.textOnPrimary,
  } as TextStyle,

  // Tab labels
  tab: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    textTransform: 'uppercase' as TextStyle['textTransform'],
    letterSpacing: 0.5,
  } as TextStyle,

  // Values (sliders, etc.)
  value: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: Colors.primary,
  } as TextStyle,

  // Monospace for codes/fingerprints
  mono: {
    fontSize: FontSizes.sm,
    fontFamily: 'monospace',
    color: Colors.textSecondary,
  } as TextStyle,
};

export default Typography;
