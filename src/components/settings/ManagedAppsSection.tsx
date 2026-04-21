/**
 * FreeKiosk - Managed Apps Settings Section
 * 
 * UI component for managing multiple apps in External App mode.
 * Supports features: #66 (Accessibility whitelist), #67 (Multi-App mode), #37 (Background apps)
 */

import React, { useState, useCallback } from 'react';
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
} from 'react-native';
import { ManagedApp, createManagedApp, isValidPackageName } from '../../types/managedApps';
import AppLauncherModule, { AppInfoAll } from '../../utils/AppLauncherModule';
import { Colors, Spacing, Typography } from '../../theme';
import Icon from '../Icon';

interface ManagedAppsSectionProps {
  managedApps: ManagedApp[];
  onManagedAppsChange: (apps: ManagedApp[]) => void;
  isDeviceOwner: boolean;
  showHomeScreenToggle?: boolean;
}

const ManagedAppsSection: React.FC<ManagedAppsSectionProps> = ({
  managedApps,
  onManagedAppsChange,
  isDeviceOwner,
  showHomeScreenToggle = true,
}) => {
  const [showAppPicker, setShowAppPicker] = useState(false);
  const [allApps, setAllApps] = useState<AppInfoAll[]>([]);
  const [showAllPackages, setShowAllPackages] = useState(false);
  const [loadingApps, setLoadingApps] = useState(false);

  const loadInstalledApps = useCallback(async () => {
    try {
      setLoadingApps(true);
      // Use getAllInstalledApps to include non-UI packages (fixes #112)
      const apps = await AppLauncherModule.getAllInstalledApps();
      // Filter out apps already in managed list
      const existingPackages = new Set(managedApps.map(a => a.packageName));
      const filtered = apps.filter(a => !existingPackages.has(a.packageName));
      setAllApps(filtered);
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
    const newApp = createManagedApp(app.packageName, app.appName);
    onManagedAppsChange([...managedApps, newApp]);
    setShowAppPicker(false);
  }, [managedApps, onManagedAppsChange]);

  const handleRemoveApp = useCallback((packageName: string) => {
    const app = managedApps.find(a => a.packageName === packageName);
    Alert.alert(
      'Remove App',
      `Remove "${app?.displayName || packageName}" from managed apps?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            onManagedAppsChange(managedApps.filter(a => a.packageName !== packageName));
          },
        },
      ],
    );
  }, [managedApps, onManagedAppsChange]);

  const handleToggle = useCallback((packageName: string, field: keyof ManagedApp) => {
    onManagedAppsChange(
      managedApps.map(app =>
        app.packageName === packageName
          ? { ...app, [field]: !app[field] }
          : app,
      ),
    );
  }, [managedApps, onManagedAppsChange]);

  const renderManagedApp = (app: ManagedApp) => {
    const initials = app.displayName
      .split(/[\s.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(w => w[0].toUpperCase())
      .join('');

    return (
      <View key={app.packageName} style={styles.appCard}>
        {/* App header */}
        <View style={styles.appHeader}>
          <View style={styles.appIconCircle}>
            <Text style={styles.appIconText}>{initials || '?'}</Text>
          </View>
          <View style={styles.appInfo}>
            <Text style={styles.appName} numberOfLines={1}>{app.displayName}</Text>
            <Text style={styles.appPackage} numberOfLines={1}>{app.packageName}</Text>
          </View>
          <TouchableOpacity
            style={styles.removeButton}
            onPress={() => handleRemoveApp(app.packageName)}
          >
            <Icon name="delete-outline" size={22} color={Colors.error} />
          </TouchableOpacity>
        </View>

        {/* Toggle options */}
        <View style={styles.togglesContainer}>
          {showHomeScreenToggle && (
            <ToggleRow
              label="Show on Home Screen"
              hint="Display this app on the kiosk home screen"
              icon="monitor"
              value={app.showOnHomeScreen}
              onToggle={() => handleToggle(app.packageName, 'showOnHomeScreen')}
            />
          )}
          <ToggleRow
            label="Launch on Boot"
            hint="Start this app automatically when device boots"
            icon="power"
            value={app.launchOnBoot}
            onToggle={() => handleToggle(app.packageName, 'launchOnBoot')}
          />
          <ToggleRow
            label="Keep Alive"
            hint="Monitor and restart if the app closes or crashes"
            icon="shield-check"
            value={app.keepAlive}
            onToggle={() => handleToggle(app.packageName, 'keepAlive')}
          />
          {isDeviceOwner && (
            <ToggleRow
              label="Allow Accessibility"
              hint="Permit this app's accessibility services"
              icon="keyboard-outline"
              value={app.allowAccessibility}
              onToggle={() => handleToggle(app.packageName, 'allowAccessibility')}
            />
          )}
        </View>
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
        managedApps.map(renderManagedApp)
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
});

export default ManagedAppsSection;
