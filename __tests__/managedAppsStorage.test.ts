jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    getItem: jest.fn(async (k: string) => store[k] ?? null),
    setItem: jest.fn(async (k: string, v: string) => { store[k] = v; }),
  };
});

import { StorageService } from '../src/utils/storage';

const ICON = 'data:image/png;base64,iVBORw0KGgo=';

describe('managed app custom icons persist', () => {
  it('keeps iconDataUri through load, update and save', async () => {
    await StorageService.saveManagedApps([
      { packageName: 'com.netflix.mediaclient', displayName: 'Netflix', iconDataUri: ICON } as any,
      { packageName: 'local.microstation', microAppId: 'a-1', displayName: 'Homeflix', iconDataUri: ICON } as any,
    ]);
    await StorageService.updateManagedApp('com.netflix.mediaclient', { displayOrder: 3 });
    const apps = await StorageService.getManagedApps();
    expect(apps.map(a => a.iconDataUri)).toEqual([ICON, ICON]);
  });

  it('drops icons that are not PNG data URIs', async () => {
    await StorageService.saveManagedApps([{ packageName: 'x', displayName: 'X', iconDataUri: 'https://e/x.png' } as any]);
    expect((await StorageService.getManagedApps())[0].iconDataUri).toBeUndefined();
  });
});
