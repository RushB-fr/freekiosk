/**
 * FreeKiosk v1.2 - Spacing System
 * Consistent spacing values based on 4px grid
 */

export const Spacing = {
  // Base unit
  unit: 4,

  // Spacing scale
  xs: 4,    // Extra small
  sm: 8,    // Small
  md: 12,   // Medium
  lg: 16,   // Large
  xl: 20,   // Extra large
  xxl: 24,  // 2x Extra large
  xxxl: 32, // 3x Extra large

  // Screen padding
  screenHorizontal: 16,
  screenVertical: 20,

  // Section spacing
  sectionMargin: 16,
  sectionPadding: 16,

  // Component spacing
  cardPadding: 16,
  cardMargin: 12,
  cardRadius: 12,

  // Input fields
  inputHeight: 50,
  inputPadding: 15,
  inputRadius: 8,

  // Buttons
  buttonPadding: 15,
  buttonRadius: 10,

  // Tab bar
  tabHeight: 48,
  tabIndicatorHeight: 3,

  // List items
  listItemPadding: 16,
  listItemMinHeight: 56,

  // Icons
  iconSize: 24,
  iconSizeSm: 20,
  iconSizeLg: 28,
};

export type SpacingKey = keyof typeof Spacing;

export default Spacing;
