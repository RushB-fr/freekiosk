import { AppGroup } from '../types/appGroups';
import { ManagedApp } from '../types/managedApps';

const byOrderThenName = <T extends { order: number; name: string }>(first: T, second: T) =>
  first.order - second.order || first.name.localeCompare(second.name, undefined, {
    sensitivity: 'base',
    numeric: true,
  });

export function normalizeAppGroups(value: unknown): AppGroup[] {
  if (!Array.isArray(value)) return [];

  const groups: AppGroup[] = [];
  const seenIds = new Set<string>();
  value.forEach((candidate: any, index) => {
    const id = typeof candidate?.id === 'string' ? candidate.id.trim() : '';
    const name = typeof candidate?.name === 'string' ? candidate.name.trim() : '';
    if (!id || !name || seenIds.has(id)) return;
    seenIds.add(id);
    groups.push({
      id,
      name,
      displayMode: candidate.displayMode === 'nested' ? 'nested' : 'row',
      parentGroupId:
        typeof candidate.parentGroupId === 'string' && candidate.parentGroupId.trim()
          ? candidate.parentGroupId.trim()
          : null,
      order: Number.isFinite(candidate.order) ? Number(candidate.order) : index,
    });
  });

  const ids = new Set(groups.map(group => group.id));
  const parentById = new Map(groups.map(group => [group.id, group.parentGroupId]));
  return groups.map(group => {
    let parentGroupId = group.parentGroupId;
    if (!parentGroupId || !ids.has(parentGroupId) || parentGroupId === group.id) {
      return { ...group, parentGroupId: null };
    }

    const visited = new Set<string>([group.id]);
    let cursor: string | null = parentGroupId;
    while (cursor) {
      if (visited.has(cursor)) {
        parentGroupId = null;
        break;
      }
      visited.add(cursor);
      cursor = parentById.get(cursor) ?? null;
    }
    return { ...group, parentGroupId };
  });
}

export function getChildGroups(groups: AppGroup[], parentGroupId: string | null): AppGroup[] {
  return groups
    .filter(group => group.parentGroupId === parentGroupId)
    .sort(byOrderThenName);
}

export function getGroupPath(groups: AppGroup[], groupId: string): string {
  const byId = new Map(groups.map(group => [group.id, group]));
  const names: string[] = [];
  const visited = new Set<string>();
  let cursor = byId.get(groupId);
  while (cursor && !visited.has(cursor.id)) {
    visited.add(cursor.id);
    names.unshift(cursor.name);
    cursor = cursor.parentGroupId ? byId.get(cursor.parentGroupId) : undefined;
  }
  return names.join(' / ');
}

export function getDescendantGroupIds(groups: AppGroup[], groupId: string): Set<string> {
  const descendants = new Set<string>();
  const queue = [groupId];
  while (queue.length > 0) {
    const parent = queue.shift()!;
    groups.forEach(group => {
      if (group.parentGroupId === parent && !descendants.has(group.id)) {
        descendants.add(group.id);
        queue.push(group.id);
      }
    });
  }
  return descendants;
}

export function getAppsInGroup(apps: ManagedApp[], groupId: string | null): ManagedApp[] {
  return apps
    .filter(app => app.showOnHomeScreen && (app.groupId ?? null) === groupId)
    .sort((first, second) => {
      const firstOrder = Number.isFinite(first.displayOrder) ? Number(first.displayOrder) : 0;
      const secondOrder = Number.isFinite(second.displayOrder) ? Number(second.displayOrder) : 0;
      return firstOrder - secondOrder || first.displayName.localeCompare(second.displayName, undefined, {
        sensitivity: 'base',
        numeric: true,
      });
    });
}

export function nextAppOrder(apps: ManagedApp[], groupId: string | null): number {
  const orders = apps
    .filter(app => (app.groupId ?? null) === groupId)
    .map(app => Number.isFinite(app.displayOrder) ? Number(app.displayOrder) : 0);
  return orders.length === 0 ? 0 : Math.max(...orders) + 1;
}
