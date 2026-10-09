/**
 * Dashboard > Tile Pages settings: off by default, and carried by config
 * export/import so cloud sync and config files don't silently reset them.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StorageService } from '../src/utils/storage';

const K = StorageService.KEYS;

describe('dashboard tile pages settings', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('defaults to off with a 4 second delay', async () => {
    expect(await StorageService.getDashboardNavAutoHide()).toBe(false);
    expect(await StorageService.getDashboardNavAutoHideSeconds()).toBe(4);
  });

  it('round-trips through exportConfig and importConfig', async () => {
    await StorageService.saveDashboardNavAutoHide(true);
    await StorageService.saveDashboardNavAutoHideSeconds(7);

    const exported = await StorageService.exportConfig();
    const general = exported.general as Record<string, unknown>;
    expect(general.dashboardNavAutoHide).toEqual({ enabled: true, seconds: 7 });

    await AsyncStorage.clear();
    await StorageService.importConfig(exported);

    expect(await StorageService.getDashboardNavAutoHide()).toBe(true);
    expect(await StorageService.getDashboardNavAutoHideSeconds()).toBe(7);
  });

  it('round-trips swipe between tiles, off by default', async () => {
    expect(await StorageService.getDashboardSwipeBetweenTiles()).toBe(false);
    await StorageService.saveDashboardSwipeBetweenTiles(true);

    const exported = await StorageService.exportConfig();
    expect((exported.general as Record<string, unknown>).dashboardSwipeBetweenTiles).toBe(true);

    await AsyncStorage.clear();
    await StorageService.importConfig(exported);
    expect(await StorageService.getDashboardSwipeBetweenTiles()).toBe(true);
  });

  it('round-trips keep tiles loaded, off by default', async () => {
    expect(await StorageService.getDashboardKeepTilesLoaded()).toBe(false);
    await StorageService.saveDashboardKeepTilesLoaded(true);

    const exported = await StorageService.exportConfig();
    expect((exported.general as Record<string, unknown>).dashboardKeepTilesLoaded).toBe(true);

    await AsyncStorage.clear();
    await StorageService.importConfig(exported);
    expect(await StorageService.getDashboardKeepTilesLoaded()).toBe(true);
  });

  it('leaves the settings untouched when an older config omits them', async () => {
    await StorageService.saveDashboardNavAutoHide(true);
    const exported = await StorageService.exportConfig();
    delete (exported.general as Record<string, unknown>).dashboardNavAutoHide;

    await StorageService.importConfig(exported);

    expect(await AsyncStorage.getItem(K.DASHBOARD_NAV_AUTO_HIDE)).toBe('true');
  });
});
