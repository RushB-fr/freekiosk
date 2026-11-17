/**
 * FreeKiosk - Managed Apps Settings Section
 * 
 * UI component for managing multiple apps in External App mode.
 * Supports features: #66 (Accessibility whitelist), #67 (Multi-App mode), #37 (Background apps)
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Modal,
  Switch,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TextInput,
  ScrollView,
} from 'react-native';
import {
  ManagedApp,
  createManagedApp,
  createMicroApp,
  getManagedAppKey,
  isMicroApp,
} from '../../types/managedApps';
import { AppGroup, createAppGroup } from '../../types/appGroups';
import {
  getAppsInGroup,
  getChildGroups,
  getDescendantGroupIds,
  getGroupPath,
  nextAppOrder,
} from '../../utils/appGroupLayout';
import AppLauncherModule, { AppInfoAll, MicroAppInfo } from '../../utils/AppLauncherModule';
import { Colors, Spacing, Typography } from '../../theme';
import Icon from '../Icon';

interface ManagedAppsSectionProps {
  managedApps: ManagedApp[];
  onManagedAppsChange: (apps: ManagedApp[]) => void;
  appGroups: AppGroup[];
  onAppGroupsChange: (groups: AppGroup[]) => void;
  isDeviceOwner: boolean;
  showHomeScreenToggle?: boolean;
}

const ManagedAppsSection: React.FC<ManagedAppsSectionProps> = ({
  managedApps,
  onManagedAppsChange,
  appGroups,
  onAppGroupsChange,
  isDeviceOwner,
  showHomeScreenToggle = true,
}) => {
  const [showAppPicker, setShowAppPicker] = useState(false);
  const [allApps, setAllApps] = useState<AppInfoAll[]>([]);
  const [microApps, setMicroApps] = useState<MicroAppInfo[]>([]);
  const [showAllPackages, setShowAllPackages] = useState(false);
  const [loadingApps, setLoadingApps] = useState(false);
  const [groupPicker, setGroupPicker] = useState<
    { kind: 'app'; appKey: string } | { kind: 'parent'; groupId: string } | null
  >(null);
  const [groupEditor, setGroupEditor] = useState<
    { groupId?: string; assignAppKey?: string } | null
  >(null);
  const [groupNameDraft, setGroupNameDraft] = useState('');

  const groupById = useMemo(
    () => new Map(appGroups.map(group => [group.id, group])),
    [appGroups],
  );
  const orderedGroups = useMemo(() => {
    const result: Array<{ group: AppGroup; depth: number }> = [];
    const visit = (parentGroupId: string | null, depth: number) => {
      getChildGroups(appGroups, parentGroupId).forEach(group => {
        result.push({ group, depth });
        visit(group.id, depth + 1);
      });
    };
    visit(null, 0);
    return result;
  }, [appGroups]);
  const orderedManagedApps = useMemo(() => {
    const groupRank = new Map(orderedGroups.map(({ group }, index) => [group.id, index + 1]));
    return [...managedApps].sort((first, second) => {
      const firstRank = first.groupId ? groupRank.get(first.groupId) ?? 0 : 0;
      const secondRank = second.groupId ? groupRank.get(second.groupId) ?? 0 : 0;
      if (firstRank !== secondRank) return firstRank - secondRank;
      const firstOrder = Number.isFinite(first.displayOrder) ? Number(first.displayOrder) : 0;
      const secondOrder = Number.isFinite(second.displayOrder) ? Number(second.displayOrder) : 0;
      return firstOrder - secondOrder || first.displayName.localeCompare(second.displayName);
    });
  }, [managedApps, orderedGroups]);

  const loadInstalledApps = useCallback(async () => {
    try {
      setLoadingApps(true);
      // Use getAllInstalledApps to include non-UI packages (fixes #112)
      const [apps, micro] = await Promise.all([
        AppLauncherModule.getAllInstalledApps(),
        // Micro-apps are optional: a missing or older MicroAppStation just adds none.
        AppLauncherModule.getMicroApps().catch(() => [] as MicroAppInfo[]),
      ]);
      // Filter out apps already in managed list
      const existingKeys = new Set(managedApps.map(getManagedAppKey));
      const filtered = apps.filter(a => !existingKeys.has(a.packageName));
      setAllApps(filtered);
      setMicroApps(micro.filter(app => app.published && !existingKeys.has(getManagedAppKey(app))));
      setShowAppPicker(true);
    } catch (error) {
      Alert.alert('Error', `Unable to load apps: ${error}`);
    } finally {
      setLoadingApps(false);
    }
  }, [managedApps]);

  // Derived list: filter by showAllPackages toggle
  const installedApps = showAllPackages
    ? allApps
    : allApps.filter(a => a.hasLauncherActivity);

  const handleAddApp = useCallback((app: AppInfoAll) => {
    const newApp = createManagedApp(app.packageName, app.appName, {
      displayOrder: nextAppOrder(managedApps, null),
    });
    onManagedAppsChange([...managedApps, newApp]);
    setShowAppPicker(false);
  }, [managedApps, onManagedAppsChange]);

  const handleAddMicroApp = useCallback((app: MicroAppInfo) => {
    const newApp = createMicroApp(app.packageName, app.microAppId, app.name || 'Micro-app', {
      displayOrder: nextAppOrder(managedApps, null),
    });
    onManagedAppsChange([...managedApps, newApp]);
    setShowAppPicker(false);
  }, [managedApps, onManagedAppsChange]);

  const handleAssignGroup = useCallback((appKey: string, groupId: string | null) => {
    const selected = managedApps.find(app => getManagedAppKey(app) === appKey);
    if ((selected?.groupId ?? null) === groupId) {
      setGroupPicker(null);
      return;
    }
    onManagedAppsChange(managedApps.map(app =>
      getManagedAppKey(app) === appKey
        ? { ...app, groupId, displayOrder: nextAppOrder(managedApps, groupId) }
        : app,
    ));
    setGroupPicker(null);
  }, [managedApps, onManagedAppsChange]);

  const handleMoveApp = useCallback((appKey: string, direction: -1 | 1) => {
    const selected = managedApps.find(app => getManagedAppKey(app) === appKey);
    if (!selected) return;
    const groupId = selected.groupId ?? null;
    const siblings = getAppsInGroup(managedApps, groupId);
    const index = siblings.findIndex(app => getManagedAppKey(app) === appKey);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= siblings.length) return;
    [siblings[index], siblings[target]] = [siblings[target], siblings[index]];
    const orderByKey = new Map(siblings.map((app, order) => [getManagedAppKey(app), order]));
    onManagedAppsChange(managedApps.map(app => {
      const order = orderByKey.get(getManagedAppKey(app));
      return order === undefined ? app : { ...app, displayOrder: order };
    }));
  }, [managedApps, onManagedAppsChange]);

  const openNewGroup = useCallback((assignAppKey?: string) => {
    setGroupPicker(null);
    setGroupNameDraft('');
    setGroupEditor({ assignAppKey });
  }, []);

  const openRenameGroup = useCallback((group: AppGroup) => {
    setGroupNameDraft(group.name);
    setGroupEditor({ groupId: group.id });
  }, []);

  const saveGroupEditor = useCallback(() => {
    const name = groupNameDraft.trim();
    if (!name || !groupEditor) return;
    if (groupEditor.groupId) {
      onAppGroupsChange(appGroups.map(group =>
        group.id === groupEditor.groupId ? { ...group, name } : group,
      ));
    } else {
      const rootGroups = getChildGroups(appGroups, null);
      const rootOrder = rootGroups.length === 0 ? 0 : Math.max(...rootGroups.map(group => group.order)) + 1;
      const group = createAppGroup(name, rootOrder);
      onAppGroupsChange([...appGroups, group]);
      if (groupEditor.assignAppKey) {
        onManagedAppsChange(managedApps.map(app =>
          getManagedAppKey(app) === groupEditor.assignAppKey
            ? { ...app, groupId: group.id, displayOrder: 0 }
            : app,
        ));
      }
    }
    setGroupEditor(null);
    setGroupNameDraft('');
  }, [appGroups, groupEditor, groupNameDraft, managedApps, onAppGroupsChange, onManagedAppsChange]);

  const handleGroupMode = useCallback((groupId: string, displayMode: 'row' | 'nested') => {
    onAppGroupsChange(appGroups.map(group =>
      group.id === groupId ? { ...group, displayMode } : group,
    ));
  }, [appGroups, onAppGroupsChange]);

  const handleGroupParent = useCallback((groupId: string, parentGroupId: string | null) => {
    const siblings = getChildGroups(appGroups, parentGroupId).filter(group => group.id !== groupId);
    const nextOrder = siblings.length === 0 ? 0 : Math.max(...siblings.map(group => group.order)) + 1;
    onAppGroupsChange(appGroups.map(group =>
      group.id === groupId ? { ...group, parentGroupId, order: nextOrder } : group,
    ));
    setGroupPicker(null);
  }, [appGroups, onAppGroupsChange]);

  const handleMoveGroup = useCallback((groupId: string, direction: -1 | 1) => {
    const selected = groupById.get(groupId);
    if (!selected) return;
    const siblings = getChildGroups(appGroups, selected.parentGroupId);
    const index = siblings.findIndex(group => group.id === groupId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= siblings.length) return;
    [siblings[index], siblings[target]] = [siblings[target], siblings[index]];
    const orderById = new Map(siblings.map((group, order) => [group.id, order]));
    onAppGroupsChange(appGroups.map(group =>
      orderById.has(group.id) ? { ...group, order: orderById.get(group.id)! } : group,
    ));
  }, [appGroups, groupById, onAppGroupsChange]);

  const handleRemoveGroup = useCallback((group: AppGroup) => {
    Alert.alert(
      'Remove Group',
      `Remove "${group.name}"? Its apps and direct child groups will move to ${group.parentGroupId ? 'the parent group' : 'the home screen'}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            const parentGroupId = group.parentGroupId;
            let nextOrder = nextAppOrder(managedApps, parentGroupId);
            onManagedAppsChange(managedApps.map(app =>
              app.groupId === group.id
                ? { ...app, groupId: parentGroupId, displayOrder: nextOrder++ }
                : app,
            ));
            const childStart = getChildGroups(appGroups, parentGroupId)
              .filter(candidate => candidate.id !== group.id).length;
            let childOrder = childStart;
            onAppGroupsChange(appGroups
              .filter(candidate => candidate.id !== group.id)
              .map(candidate => candidate.parentGroupId === group.id
                ? { ...candidate, parentGroupId, order: childOrder++ }
                : candidate));
          },
        },
      ],
    );
  }, [appGroups, managedApps, onAppGroupsChange, onManagedAppsChange]);

  const handleRemoveApp = useCallback((appKey: string) => {
    const app = managedApps.find(a => getManagedAppKey(a) === appKey);
    Alert.alert(
      'Remove App',
      `Remove "${app?.displayName || appKey}" from managed apps?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            onManagedAppsChange(managedApps.filter(a => getManagedAppKey(a) !== appKey));
          },
        },
      ],
    );
  }, [managedApps, onManagedAppsChange]);

  const handleToggle = useCallback((appKey: string, field: keyof ManagedApp) => {
    onManagedAppsChange(
      managedApps.map(app =>
        getManagedAppKey(app) === appKey
          ? { ...app, [field]: !app[field] }
          : app,
      ),
    );
  }, [managedApps, onManagedAppsChange]);

  const renderManagedApp = (app: ManagedApp) => {
    const appKey = getManagedAppKey(app);
    const microApp = isMicroApp(app);
    const initials = app.displayName
      .split(/[\s.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(w => w[0].toUpperCase())
      .join('');
    const appSiblings = getAppsInGroup(managedApps, app.groupId ?? null);
    const appIndex = appSiblings.findIndex(candidate => getManagedAppKey(candidate) === appKey);
    const groupLabel = app.groupId && groupById.has(app.groupId)
      ? getGroupPath(appGroups, app.groupId)
      : 'Ungrouped Apps';

    return (
      <View key={appKey} style={styles.appCard}>
        {/* App header */}
        <View style={styles.appHeader}>
          <View style={styles.appIconCircle}>
            <Text style={styles.appIconText}>{initials || '?'}</Text>
          </View>
          <View style={styles.appInfo}>
            <View style={styles.appNameRow}>
              <Text style={[styles.appName, styles.appNameFlexible]} numberOfLines={1}>{app.displayName}</Text>
              {microApp && (
                <View style={styles.microAppBadge}>
                  <Text style={styles.microAppBadgeText}>micro-app</Text>
                </View>
              )}
            </View>
            <Text style={styles.appPackage} numberOfLines={1}>
              {microApp ? `MicroAppStation · ${app.packageName}` : app.packageName}
            </Text>
          </View>
          {showHomeScreenToggle && app.showOnHomeScreen && (
            <View style={styles.orderButtons}>
              <TouchableOpacity
                style={[styles.iconButton, appIndex <= 0 && styles.iconButtonDisabled]}
                disabled={appIndex <= 0}
                onPress={() => handleMoveApp(appKey, -1)}
              >
                <Icon name="arrow-up" size={18} color={appIndex <= 0 ? Colors.textDisabled : Colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.iconButton, appIndex < 0 || appIndex >= appSiblings.length - 1 ? styles.iconButtonDisabled : null]}
                disabled={appIndex < 0 || appIndex >= appSiblings.length - 1}
                onPress={() => handleMoveApp(appKey, 1)}
              >
                <Icon name="arrow-down" size={18} color={appIndex < 0 || appIndex >= appSiblings.length - 1 ? Colors.textDisabled : Colors.primary} />
              </TouchableOpacity>
            </View>
          )}
          <TouchableOpacity
            style={styles.removeButton}
            onPress={() => handleRemoveApp(appKey)}
          >
            <Icon name="delete-outline" size={22} color={Colors.error} />
          </TouchableOpacity>
        </View>

        {/* Toggle options */}
        <View style={styles.togglesContainer}>
          {showHomeScreenToggle && (
            <>
              <ToggleRow
                label="Show on Home Screen"
                hint="Display this app on the kiosk home screen"
                icon="monitor"
                value={app.showOnHomeScreen}
                onToggle={() => handleToggle(appKey, 'showOnHomeScreen')}
              />
              {app.showOnHomeScreen && (
                <TouchableOpacity
                  style={styles.assignmentRow}
                  onPress={() => setGroupPicker({ kind: 'app', appKey })}
                >
                  <Icon name="folder-outline" size={17} color={Colors.primary} style={{ marginRight: 8 }} />
                  <View style={styles.toggleTextContainer}>
                    <Text style={styles.toggleLabelActive}>Group</Text>
                    <Text style={styles.toggleHint}>{groupLabel}</Text>
                  </View>
                  <Text style={styles.changeLink}>Assign or create</Text>
                </TouchableOpacity>
              )}
            </>
          )}
          {/* Boot, keep-alive and accessibility act on whole packages and would open the
              MicroAppStation editor, so micro-app entries only support home-screen options. */}
          {!microApp && (
            <>
              <ToggleRow
                label="Launch on Boot"
                hint="Start this app automatically when device boots"
                icon="power"
                value={app.launchOnBoot}
                onToggle={() => handleToggle(appKey, 'launchOnBoot')}
              />
              <ToggleRow
                label="Keep Alive"
                hint="Monitor and restart if the app closes or crashes"
                icon="shield-check"
                value={app.keepAlive}
                onToggle={() => handleToggle(appKey, 'keepAlive')}
              />
              {isDeviceOwner && (
                <ToggleRow
                  label="Allow Accessibility"
                  hint="Permit this app's accessibility services"
                  icon="keyboard-outline"
                  value={app.allowAccessibility}
                  onToggle={() => handleToggle(appKey, 'allowAccessibility')}
                />
              )}
            </>
          )}
        </View>
      </View>
    );
  };

  const renderGroupOrganizer = () => {
    if (!showHomeScreenToggle) return null;
    return (
      <View style={styles.groupOrganizer}>
        <View style={styles.groupOrganizerHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.groupOrganizerTitle}>Home Screen Groups</Text>
            <Text style={styles.groupOrganizerHint}>Rows wrap automatically. Nested groups open as folders.</Text>
          </View>
          <TouchableOpacity style={styles.addGroupButton} onPress={() => openNewGroup()}>
            <Icon name="folder-plus-outline" size={18} color={Colors.textOnPrimary} />
            <Text style={styles.addGroupButtonText}>Add Group</Text>
          </TouchableOpacity>
        </View>
        {appGroups.length === 0 ? (
          <Text style={styles.noGroupsText}>No groups yet. Ungrouped apps stay in the default Apps row.</Text>
        ) : (
          orderedGroups.map(({ group, depth }) => {
            const siblings = getChildGroups(appGroups, group.parentGroupId);
            const siblingIndex = siblings.findIndex(candidate => candidate.id === group.id);
            const appCount = managedApps.filter(app => app.showOnHomeScreen && app.groupId === group.id).length;
            const childCount = appGroups.filter(candidate => candidate.parentGroupId === group.id).length;
            const parentLabel = group.parentGroupId && groupById.has(group.parentGroupId)
              ? getGroupPath(appGroups, group.parentGroupId)
              : 'Home';
            return (
              <View key={group.id} style={[styles.groupCard, depth > 0 && { marginLeft: Math.min(depth, 3) * 14 }]}>
                <View style={styles.groupCardHeader}>
                  <Icon name={group.displayMode === 'nested' ? 'folder' : 'view-agenda-outline'} size={22} color={Colors.primary} />
                  <View style={styles.groupCardInfo}>
                    <Text style={styles.groupName}>{group.name}</Text>
                    <Text style={styles.groupMeta}>{appCount} apps · {childCount} child groups · in {parentLabel}</Text>
                  </View>
                  <View style={styles.orderButtons}>
                    <TouchableOpacity style={styles.iconButton} disabled={siblingIndex <= 0} onPress={() => handleMoveGroup(group.id, -1)}>
                      <Icon name="arrow-up" size={18} color={siblingIndex <= 0 ? Colors.textDisabled : Colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.iconButton} disabled={siblingIndex >= siblings.length - 1} onPress={() => handleMoveGroup(group.id, 1)}>
                      <Icon name="arrow-down" size={18} color={siblingIndex >= siblings.length - 1 ? Colors.textDisabled : Colors.primary} />
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity style={styles.iconButton} onPress={() => openRenameGroup(group)}>
                    <Icon name="pencil-outline" size={18} color={Colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.iconButton} onPress={() => handleRemoveGroup(group)}>
                    <Icon name="delete-outline" size={19} color={Colors.error} />
                  </TouchableOpacity>
                </View>
                <View style={styles.groupControls}>
                  <Text style={styles.groupControlLabel}>Display</Text>
                  <TouchableOpacity
                    style={[styles.modeChip, group.displayMode === 'row' && styles.modeChipActive]}
                    onPress={() => handleGroupMode(group.id, 'row')}
                  >
                    <Text style={[styles.modeChipText, group.displayMode === 'row' && styles.modeChipTextActive]}>Row</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modeChip, group.displayMode === 'nested' && styles.modeChipActive]}
                    onPress={() => handleGroupMode(group.id, 'nested')}
                  >
                    <Text style={[styles.modeChipText, group.displayMode === 'nested' && styles.modeChipTextActive]}>Nested Group</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.parentButton} onPress={() => setGroupPicker({ kind: 'parent', groupId: group.id })}>
                    <Text style={styles.parentButtonText} numberOfLines={1}>Location: {parentLabel}</Text>
                    <Icon name="chevron-right" size={18} color={Colors.primary} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </View>
    );
  };

  return (
    <View>
      {/* Header info */}
      <View style={styles.sectionInfo}>
        <Icon name="information-outline" size={16} color={Colors.info} style={{ marginRight: 6 }} />
        <Text style={styles.sectionInfoText}>
          Add apps to manage in multi-app mode. These apps will be whitelisted in lock task mode.
        </Text>
      </View>

      {renderGroupOrganizer()}

      {/* Managed apps list */}
      {managedApps.length === 0 ? (
        <View style={styles.emptyState}>
          <Icon name="apps" size={40} color={Colors.textDisabled} />
          <Text style={styles.emptyText}>No managed apps added</Text>
          <Text style={styles.emptyHint}>
            Add apps to display them on the home screen, launch on boot, or keep alive in the background.
          </Text>
        </View>
      ) : (
        orderedManagedApps.map(renderManagedApp)
      )}

      {/* Add app button */}
      <TouchableOpacity
        style={styles.addButton}
        onPress={loadInstalledApps}
        disabled={loadingApps}
      >
        {loadingApps ? (
          <ActivityIndicator color={Colors.textOnPrimary} size="small" />
        ) : (
          <>
            <Icon name="plus-circle-outline" size={20} color={Colors.textOnPrimary} style={{ marginRight: 8 }} />
            <Text style={styles.addButtonText}>Add Managed App</Text>
          </>
        )}
      </TouchableOpacity>

      {/* App picker modal */}
      <Modal
        visible={showAppPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAppPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select an Application</Text>
              <TouchableOpacity onPress={() => setShowAppPicker(false)}>
                <Icon name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <View style={styles.showAllToggle}>
              <Icon name="package-variant" size={16} color={Colors.textSecondary} style={{ marginRight: 6 }} />
              <Text style={styles.showAllLabel}>Show all packages (services, VPNs…)</Text>
              <Switch
                value={showAllPackages}
                onValueChange={setShowAllPackages}
                trackColor={{ false: Colors.border, true: Colors.primary + '66' }}
                thumbColor={showAllPackages ? Colors.primary : '#ccc'}
              />
            </View>
            <FlatList
              data={installedApps}
              keyExtractor={item => item.packageName}
              ListHeaderComponent={microApps.length > 0 ? (
                <View>
                  <Text style={styles.pickerSectionTitle}>Micro-apps (MicroAppStation)</Text>
                  {microApps.map(item => (
                    <TouchableOpacity
                      key={getManagedAppKey(item)}
                      style={styles.pickerItem}
                      onPress={() => handleAddMicroApp(item)}
                    >
                      <View style={[styles.pickerIconCircle, styles.pickerIconCircleMicro]}>
                        <Icon name="web" size={18} color={Colors.textOnPrimary} />
                      </View>
                      <View style={styles.pickerInfo}>
                        <Text style={styles.pickerAppName}>{item.name || 'Micro-app'}</Text>
                        <Text style={styles.pickerPackageName}>Opens directly in {item.packageName}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                  <Text style={styles.pickerSectionTitle}>Installed apps</Text>
                </View>
              ) : null}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.pickerItem}
                  onPress={() => handleAddApp(item)}
                >
                  <View style={[
                    styles.pickerIconCircle,
                    !item.hasLauncherActivity && styles.pickerIconCircleService,
                  ]}>
                    <Text style={[
                      styles.pickerIconText,
                      !item.hasLauncherActivity && styles.pickerIconTextService,
                    ]}>
                      {item.hasLauncherActivity
                        ? item.appName.charAt(0).toUpperCase()
                        : '⚙'}
                    </Text>
                  </View>
                  <View style={styles.pickerInfo}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={styles.pickerAppName}>{item.appName}</Text>
                      {!item.hasLauncherActivity && (
                        <View style={styles.serviceBadge}>
                          <Text style={styles.serviceBadgeText}>service</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.pickerPackageName}>{item.packageName}</Text>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>
                    {loadingApps ? 'Loading...' : 'All installed apps are already managed'}
                  </Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={groupPicker !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setGroupPicker(null)}
      >
        <View style={styles.modalOverlayCentered}>
          <View style={styles.groupPickerModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{groupPicker?.kind === 'parent' ? 'Choose Group Location' : 'Assign Group'}</Text>
              <TouchableOpacity onPress={() => setGroupPicker(null)}>
                <Icon name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.groupPickerList}>
              <TouchableOpacity
                style={styles.groupPickerItem}
                onPress={() => groupPicker?.kind === 'parent'
                  ? handleGroupParent(groupPicker.groupId, null)
                  : groupPicker && handleAssignGroup(groupPicker.appKey, null)}
              >
                <Icon name="home-outline" size={20} color={Colors.primary} />
                <Text style={styles.groupPickerText}>{groupPicker?.kind === 'parent' ? 'Home' : 'Ungrouped Apps'}</Text>
              </TouchableOpacity>
              {orderedGroups
                .map(({ group }) => group)
                .filter(group => {
                  if (groupPicker?.kind !== 'parent') return true;
                  if (group.id === groupPicker.groupId) return false;
                  return !getDescendantGroupIds(appGroups, groupPicker.groupId).has(group.id);
                })
                .map(group => (
                  <TouchableOpacity
                    key={group.id}
                    style={styles.groupPickerItem}
                    onPress={() => groupPicker?.kind === 'parent'
                      ? handleGroupParent(groupPicker.groupId, group.id)
                      : groupPicker && handleAssignGroup(groupPicker.appKey, group.id)}
                  >
                    <Icon name={group.displayMode === 'nested' ? 'folder' : 'view-agenda-outline'} size={20} color={Colors.primary} />
                    <Text style={styles.groupPickerText}>{getGroupPath(appGroups, group.id)}</Text>
                  </TouchableOpacity>
                ))}
            </ScrollView>
            {groupPicker?.kind === 'app' && (
              <TouchableOpacity style={styles.createFromPickerButton} onPress={() => openNewGroup(groupPicker.appKey)}>
                <Icon name="folder-plus-outline" size={20} color={Colors.textOnPrimary} />
                <Text style={styles.addGroupButtonText}>Create New Group</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={groupEditor !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setGroupEditor(null)}
      >
        <View style={styles.modalOverlayCentered}>
          <View style={styles.groupEditorModal}>
            <Text style={styles.modalTitle}>{groupEditor?.groupId ? 'Rename Group' : 'Create Group'}</Text>
            <TextInput
              style={styles.groupNameInput}
              value={groupNameDraft}
              onChangeText={setGroupNameDraft}
              placeholder="e.g. Streaming Services"
              placeholderTextColor={Colors.textDisabled}
              autoFocus
              maxLength={40}
              onSubmitEditing={saveGroupEditor}
            />
            <View style={styles.editorActions}>
              <TouchableOpacity style={styles.cancelEditorButton} onPress={() => setGroupEditor(null)}>
                <Text style={styles.cancelEditorText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveEditorButton, !groupNameDraft.trim() && styles.iconButtonDisabled]}
                disabled={!groupNameDraft.trim()}
                onPress={saveGroupEditor}
              >
                <Text style={styles.saveEditorText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

/** Small toggle row sub-component */
interface ToggleRowProps {
  label: string;
  hint: string;
  icon: string;
  value: boolean;
  onToggle: () => void;
}

const ToggleRow: React.FC<ToggleRowProps> = ({ label, hint, icon, value, onToggle }) => (
  <TouchableOpacity style={styles.toggleRow} onPress={onToggle} activeOpacity={0.7}>
    <Icon name={icon as any} size={16} color={value ? Colors.primary : Colors.textDisabled} style={{ marginRight: 8 }} />
    <View style={styles.toggleTextContainer}>
      <Text style={[styles.toggleLabel, value && styles.toggleLabelActive]}>{label}</Text>
      <Text style={styles.toggleHint}>{hint}</Text>
    </View>
    <View style={[styles.toggleIndicator, value && styles.toggleIndicatorActive]}>
      <Icon name={value ? 'checkbox-marked' : 'checkbox-blank-outline'} size={20} color={value ? Colors.primary : Colors.textDisabled} />
    </View>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  sectionInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.cardInfo || '#EBF5FB',
    borderRadius: 8,
    padding: 10,
    marginBottom: Spacing.md,
  },
  sectionInfoText: {
    ...Typography.hint,
    flex: 1,
    color: Colors.infoDark || '#2C3E50',
  },
  groupOrganizer: {
    marginBottom: Spacing.md,
  },
  groupOrganizerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  groupOrganizerTitle: {
    ...Typography.label,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  groupOrganizerHint: {
    ...Typography.hint,
    marginTop: 2,
    color: Colors.textSecondary,
  },
  addGroupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  addGroupButtonText: {
    color: Colors.textOnPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  noGroupsText: {
    ...Typography.hint,
    color: Colors.textDisabled,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 12,
    marginBottom: 6,
  },
  groupCard: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    marginBottom: 8,
    overflow: 'hidden',
  },
  groupCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
  },
  groupCardInfo: {
    flex: 1,
  },
  groupName: {
    ...Typography.label,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  groupMeta: {
    ...Typography.hint,
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  orderButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    padding: 6,
  },
  iconButtonDisabled: {
    opacity: 0.4,
  },
  groupControls: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    padding: 10,
  },
  groupControlLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  modeChip: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: Colors.background,
  },
  modeChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '18',
  },
  modeChipText: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  modeChipTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  parentButton: {
    minWidth: 150,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  parentButtonText: {
    flex: 1,
    fontSize: 11,
    color: Colors.textSecondary,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
  },
  emptyText: {
    ...Typography.label,
    color: Colors.textDisabled,
    marginTop: Spacing.sm,
  },
  emptyHint: {
    ...Typography.hint,
    color: Colors.textDisabled,
    textAlign: 'center',
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
  appCard: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm,
    overflow: 'hidden',
  },
  appHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: Colors.surface,
  },
  appIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  appIconText: {
    color: Colors.textOnPrimary,
    fontWeight: '700',
    fontSize: 16,
  },
  appInfo: {
    flex: 1,
  },
  appName: {
    ...Typography.label,
    fontWeight: '600',
  },
  appPackage: {
    ...Typography.hint,
    fontSize: 11,
  },
  removeButton: {
    padding: 8,
  },
  togglesContainer: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  assignmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  changeLink: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.primary,
    marginLeft: 8,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  toggleTextContainer: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  toggleLabelActive: {
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  toggleHint: {
    fontSize: 11,
    color: Colors.textDisabled,
    marginTop: 1,
  },
  toggleIndicator: {
    marginLeft: 8,
  },
  toggleIndicatorActive: {},
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.success,
    borderRadius: 10,
    paddingVertical: 14,
    marginTop: Spacing.sm,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  addButtonText: {
    color: Colors.textOnPrimary,
    fontWeight: '600',
    fontSize: 16,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 30,
  },
  modalOverlayCentered: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  groupPickerModal: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '75%',
    alignSelf: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    overflow: 'hidden',
  },
  groupPickerList: {
    maxHeight: 420,
  },
  groupPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  groupPickerText: {
    flex: 1,
    ...Typography.label,
    color: Colors.textPrimary,
  },
  createFromPickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.success,
    margin: 14,
    borderRadius: 9,
    paddingVertical: 12,
  },
  groupEditorModal: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 18,
  },
  groupNameInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    color: Colors.textPrimary,
    backgroundColor: Colors.background,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    marginTop: 14,
  },
  editorActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
  },
  cancelEditorButton: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cancelEditorText: {
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  saveEditorButton: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  saveEditorText: {
    color: Colors.textOnPrimary,
    fontWeight: '700',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    ...Typography.sectionTitle,
    fontSize: 18,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  pickerIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary + '22',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  pickerIconText: {
    color: Colors.primary,
    fontWeight: '700',
    fontSize: 16,
  },
  pickerInfo: {
    flex: 1,
  },
  pickerAppName: {
    ...Typography.label,
    fontWeight: '500',
  },
  pickerPackageName: {
    ...Typography.hint,
    fontSize: 11,
  },
  pickerIconCircleService: {
    backgroundColor: Colors.textDisabled + '33',
  },
  pickerIconTextService: {
    color: Colors.textSecondary,
    fontSize: 18,
  },
  showAllToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.cardInfo || '#EBF5FB',
  },
  showAllLabel: {
    flex: 1,
    fontSize: 13,
    color: Colors.textSecondary,
  },
  serviceBadge: {
    backgroundColor: Colors.textDisabled + '33',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 6,
  },
  serviceBadgeText: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  appNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  appNameFlexible: {
    flexShrink: 1,
  },
  microAppBadge: {
    backgroundColor: Colors.primary + '22',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 6,
  },
  microAppBadgeText: {
    fontSize: 10,
    color: Colors.primary,
    fontWeight: '600',
  },
  pickerIconCircleMicro: {
    backgroundColor: Colors.primary,
  },
  pickerSectionTitle: {
    ...Typography.hint,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
});

export default ManagedAppsSection;
