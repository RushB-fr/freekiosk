import { createManagedApp, createMicroApp, getManagedAppKey, isMicroApp, getCustomIcon } from '../src/types/managedApps';

describe('managed micro-apps', () => {
  it('keys micro-apps that share a host package independently', () => {
    const first = createMicroApp('local.microstation', 'a-1', 'Weather');
    const second = createMicroApp('local.microstation', 'b-2', 'Calendar');
    const host = createManagedApp('local.microstation', 'Micro Station');

    expect(getManagedAppKey(first)).toBe('local.microstation#a-1');
    expect(getManagedAppKey(second)).toBe('local.microstation#b-2');
    expect(getManagedAppKey(host)).toBe('local.microstation');
    expect(isMicroApp(first)).toBe(true);
    expect(isMicroApp(host)).toBe(false);
  });

  it('never enables package-wide behaviors for a micro-app', () => {
    const app = createMicroApp('local.microstation', 'a-1', 'Weather', {
      launchOnBoot: true,
      keepAlive: true,
      allowAccessibility: true,
    });

    expect(app).toMatchObject({ launchOnBoot: false, keepAlive: false, allowAccessibility: false });
    expect(app.showOnHomeScreen).toBe(true);
  });
});

describe('custom grid icons', () => {
  it('accepts only PNG data URIs', () => {
    expect(getCustomIcon({ iconDataUri: 'data:image/png;base64,iVBORw0KGgo=' })).toBe('data:image/png;base64,iVBORw0KGgo=');
    expect(getCustomIcon({ iconDataUri: 'https://example.com/a.png' })).toBeUndefined();
    expect(getCustomIcon({ iconDataUri: 'data:image/svg+xml;base64,PHN2Zz4=' })).toBeUndefined();
    expect(getCustomIcon({})).toBeUndefined();
  });
});
