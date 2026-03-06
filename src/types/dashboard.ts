export interface DashboardTile {
  id: string;
  label: string;
  url: string;
  iconMode: 'favicon' | 'image' | 'letter';
  iconValue?: string;
  order: number;
}
