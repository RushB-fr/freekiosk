/**
 * FreeKiosk - Blocking Overlay Types
 * 
 * Types for configuring touch-blocking overlay regions
 */

/**
 * Display mode for blocking overlays
 */
export type OverlayDisplayMode = 
  | 'transparent'       // Invisible, blocks touch only
  | 'semi_transparent'  // 50% gray overlay
  | 'opaque';           // Solid dark overlay

/**
 * A single blocking region configuration
 */
export interface BlockingRegion {
  /** Unique identifier */
  id: string;
  
  /** Human-readable name for the region */
  name: string;
  
  /** Whether this region is active */
  enabled: boolean;
  
  /** X-axis start position in percentage (0.0 - 100.0) */
  xStart: number;
  
  /** Y-axis start position in percentage (0.0 - 100.0) */
  yStart: number;
  
  /** X-axis end position in percentage (0.0 - 100.0) */
  xEnd: number;
  
  /** Y-axis end position in percentage (0.0 - 100.0) */
  yEnd: number;
  
  /** How the overlay should be displayed */
  displayMode: OverlayDisplayMode;
  
  /** Target app package name (null = always active) */
  targetPackage: string | null;
}

/**
 * Main configuration for blocking overlays feature
 */
export interface BlockingOverlaysConfig {
  /** Master toggle for the feature */
  enabled: boolean;
  
  /** List of blocking regions (max 10) */
  regions: BlockingRegion[];
}

/**
 * Maximum number of blocking regions allowed
 */
export const MAX_BLOCKING_REGIONS = 10;

/**
 * Default configuration
 */
export const DEFAULT_BLOCKING_CONFIG: BlockingOverlaysConfig = {
  enabled: false,
  regions: [],
};

/**
 * Create a new empty blocking region with default values
 */
export function createDefaultRegion(): BlockingRegion {
  return {
    id: `region_${Date.now()}`,
    name: 'New Region',
    enabled: true,
    xStart: 0,
    yStart: 0,
    xEnd: 100,
    yEnd: 10,
    displayMode: 'semi_transparent',
    targetPackage: null,
  };
}

/**
 * Validate a blocking region's coordinates
 */
export function validateRegion(region: BlockingRegion): { valid: boolean; error?: string } {
  if (region.xStart < 0 || region.xStart > 100) {
    return { valid: false, error: 'X Start must be between 0 and 100' };
  }
  if (region.yStart < 0 || region.yStart > 100) {
    return { valid: false, error: 'Y Start must be between 0 and 100' };
  }
  if (region.xEnd < 0 || region.xEnd > 100) {
    return { valid: false, error: 'X End must be between 0 and 100' };
  }
  if (region.yEnd < 0 || region.yEnd > 100) {
    return { valid: false, error: 'Y End must be between 0 and 100' };
  }
  if (region.xStart >= region.xEnd) {
    return { valid: false, error: 'X Start must be less than X End' };
  }
  if (region.yStart >= region.yEnd) {
    return { valid: false, error: 'Y Start must be less than Y End' };
  }
  if (!region.name.trim()) {
    return { valid: false, error: 'Region name is required' };
  }
  return { valid: true };
}

/**
 * Format region coordinates as a readable string
 */
export function formatRegionCoords(region: BlockingRegion): string {
  return `${region.xStart}-${region.xEnd}% × ${region.yStart}-${region.yEnd}%`;
}

/**
 * Get display mode label
 */
export function getDisplayModeLabel(mode: OverlayDisplayMode): string {
  switch (mode) {
    case 'transparent':
      return 'Transparent';
    case 'semi_transparent':
      return 'Semi-transparent';
    case 'opaque':
      return 'Opaque';
    default:
      return mode;
  }
}
