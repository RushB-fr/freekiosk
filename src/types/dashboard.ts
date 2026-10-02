export interface DashboardTile {
  id: string;
  label: string;
  url: string;
  iconMode: 'favicon' | 'image' | 'letter';
  iconValue?: string;
  /** Optional icon background color (hex). Falls back to the label-based color. */
  iconColor?: string;
  order: number;
}

export type DashboardIconSize = 'small' | 'medium' | 'large' | 'xlarge';

export const DASHBOARD_ICON_SIZES: DashboardIconSize[] = ['small', 'medium', 'large', 'xlarge'];
export const DEFAULT_DASHBOARD_ICON_SIZE: DashboardIconSize = 'medium';

export interface DashboardIconMetrics {
  tileWidth: number;
  icon: number;
  letter: number;
  label: number;
}

// 'medium' matches the layout used before the size became configurable.
export const DASHBOARD_ICON_METRICS: Record<DashboardIconSize, DashboardIconMetrics> = {
  small: { tileWidth: 64, icon: 44, letter: 20, label: 11 },
  medium: { tileWidth: 80, icon: 56, letter: 24, label: 12 },
  large: { tileWidth: 112, icon: 80, letter: 34, label: 15 },
  xlarge: { tileWidth: 160, icon: 120, letter: 50, label: 19 },
};

export const parseDashboardIconSize = (value: unknown): DashboardIconSize =>
  DASHBOARD_ICON_SIZES.includes(value as DashboardIconSize)
    ? (value as DashboardIconSize)
    : DEFAULT_DASHBOARD_ICON_SIZE;
