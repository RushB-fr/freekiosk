import {
  getAppsInGroup,
  getChildGroups,
  getDescendantGroupIds,
  getGroupPath,
  normalizeAppGroups,
} from '../src/utils/appGroupLayout';
import { AppGroup } from '../src/types/appGroups';
import { ManagedApp } from '../src/types/managedApps';

const groups: AppGroup[] = [
  { id: 'games', name: 'Games', displayMode: 'row', parentGroupId: null, order: 2 },
  { id: 'streaming', name: 'Streaming Services', displayMode: 'row', parentGroupId: null, order: 1 },
  { id: 'kids', name: 'Kids', displayMode: 'nested', parentGroupId: 'streaming', order: 0 },
];

const app = (packageName: string, groupId: string | null, displayOrder: number): ManagedApp => ({
  packageName,
  displayName: packageName,
  showOnHomeScreen: true,
  groupId,
  displayOrder,
  launchOnBoot: false,
  keepAlive: false,
  allowAccessibility: false,
});

describe('app group layout', () => {
  it('orders independent home rows explicitly', () => {
    expect(getChildGroups(groups, null).map(group => group.id)).toEqual(['streaming', 'games']);
  });

  it('orders apps inside a row without alphabetizing them', () => {
    const apps = [
      app('com.netflix', 'streaming', 2),
      app('com.disney', 'streaming', 0),
      app('com.youtube', 'streaming', 1),
    ];
    expect(getAppsInGroup(apps, 'streaming').map(item => item.packageName)).toEqual([
      'com.disney',
      'com.youtube',
      'com.netflix',
    ]);
  });

  it('supports nested paths and descendant discovery', () => {
    expect(getGroupPath(groups, 'kids')).toBe('Streaming Services / Kids');
    expect([...getDescendantGroupIds(groups, 'streaming')]).toEqual(['kids']);
  });

  it('removes invalid parents and breaks cycles during storage migration', () => {
    const normalized = normalizeAppGroups([
      { id: 'a', name: 'A', displayMode: 'nested', parentGroupId: 'b', order: 0 },
      { id: 'b', name: 'B', displayMode: 'row', parentGroupId: 'a', order: 0 },
      { id: 'c', name: 'C', parentGroupId: 'missing' },
    ]);
    expect(normalized.every(group => group.parentGroupId === null)).toBe(true);
  });
});
