export type AppGroupDisplayMode = 'row' | 'nested';

/**
 * A home-screen app group.
 *
 * - row: expands inline and owns as many wrapped rows as its apps require.
 * - nested: renders as one folder item which opens a child screen.
 *
 * parentGroupId supports arbitrary nesting. Cycles are rejected while loading and editing.
 */
export interface AppGroup {
  id: string;
  name: string;
  displayMode: AppGroupDisplayMode;
  parentGroupId: string | null;
  order: number;
}

export function createAppGroup(
  name: string,
  order: number,
  overrides?: Partial<AppGroup>,
): AppGroup {
  const safeName = name.trim();
  return {
    id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: safeName || 'New Group',
    displayMode: 'row',
    parentGroupId: null,
    order,
    ...overrides,
  };
}
