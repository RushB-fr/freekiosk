import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { BlockedApp, normalizeBlockedApps } from '../../types/blockedApps';
import AppLauncherModule, { AppInfoAll } from '../../utils/AppLauncherModule';
import { Colors, Spacing, Typography } from '../../theme';
import Icon from '../Icon';
import SettingsSwitch from './SettingsSwitch';

interface BlockedAppsSectionProps {
  blockedApps: BlockedApp[];
  onBlockedAppsChange: (apps: BlockedApp[]) => void;
  isDeviceOwner: boolean;
  blockingEnabled: boolean;
  onBlockingEnabledChange: (enabled: boolean) => void;
}

const BlockedAppsSection: React.FC<BlockedAppsSectionProps> = ({
  blockedApps,
  onBlockedAppsChange,
  isDeviceOwner,
  blockingEnabled,
  onBlockingEnabledChange,
}) => {
  const [showPicker, setShowPicker] = useState(false);
  const [allApps, setAllApps] = useState<AppInfoAll[]>([]);
  const [showAllPackages, setShowAllPackages] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const loadInstalledApps = useCallback(async () => {
    try {
      setLoading(true);
      const selected = new Set(blockedApps.map(app => app.packageName));
      const installed = await AppLauncherModule.getAllInstalledApps();
      setAllApps(installed.filter(app =>
        app.packageName !== 'com.freekiosk' && !selected.has(app.packageName),
      ));
      setSearch('');
      setShowPicker(true);
    } catch (error) {
      Alert.alert('Unable to load apps', String(error));
    } finally {
      setLoading(false);
    }
  }, [blockedApps]);

  const visibleApps = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return allApps.filter(app =>
      (showAllPackages || app.hasLauncherActivity) &&
      (!query || app.appName.toLocaleLowerCase().includes(query) || app.packageName.toLocaleLowerCase().includes(query)),
    );
  }, [allApps, search, showAllPackages]);

  const addApp = useCallback((app: AppInfoAll) => {
    onBlockedAppsChange(normalizeBlockedApps([
      ...blockedApps,
      { packageName: app.packageName, displayName: app.appName },
    ]));
    setShowPicker(false);
  }, [blockedApps, onBlockedAppsChange]);

  const removeApp = useCallback((app: BlockedApp) => {
    Alert.alert(
      'Stop blocking app',
      `${app.displayName} will be available the next time you save these settings.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => onBlockedAppsChange(blockedApps.filter(item => item.packageName !== app.packageName)),
        },
      ],
    );
  }, [blockedApps, onBlockedAppsChange]);

  return (
    <View>
      <SettingsSwitch
        label="Enable App Blocking"
        hint="Block selected apps system-wide, independently of Lock Mode."
        value={blockingEnabled}
        onValueChange={onBlockingEnabledChange}
        disabled={!isDeviceOwner}
      />

      <View style={styles.infoBox}>
        <Icon name="information-outline" size={18} color={Colors.info} style={styles.infoIcon} />
        <Text style={styles.infoText}>
          Device Owner hiding removes selected apps from launchers and prevents normal activity launches. If Android refuses or reverses hiding for a protected app, FreeKiosk leaves its icon stable and immediately closes the app whenever it is opened.
        </Text>
      </View>

      {!isDeviceOwner && (
        <View style={styles.warningBox}>
          <Icon name="alert-circle-outline" size={18} color={Colors.warningDark} style={styles.infoIcon} />
          <Text style={styles.warningText}>App blocking requires FreeKiosk to be Device Owner.</Text>
        </View>
      )}

      {blockedApps.length > 0 && (
        <View style={[styles.statusBox, blockingEnabled && isDeviceOwner ? styles.statusActive : styles.statusSaved]}>
          <Icon
            name={blockingEnabled && isDeviceOwner ? 'shield-check' : 'clock-outline'}
            size={17}
            color={blockingEnabled && isDeviceOwner ? Colors.successDark : Colors.textSecondary}
            style={styles.infoIcon}
          />
          <Text style={styles.statusText}>
            {blockingEnabled && isDeviceOwner
              ? `${blockedApps.length} app${blockedApps.length === 1 ? '' : 's'} will be blocked when you save`
              : `${blockedApps.length} app${blockedApps.length === 1 ? '' : 's'} selected; App Blocking is off`}
          </Text>
        </View>
      )}

      {blockedApps.length === 0 ? (
        <View style={styles.emptyState}>
          <Icon name="shield" size={36} color={Colors.textDisabled} />
          <Text style={styles.emptyTitle}>No blocked apps</Text>
          <Text style={styles.emptyHint}>For a first test, add Google Play Store.</Text>
        </View>
      ) : blockedApps.map(app => (
        <View key={app.packageName} style={styles.appRow}>
          <View style={styles.appInitial}>
            <Text style={styles.appInitialText}>{app.displayName.charAt(0).toUpperCase() || '?'}</Text>
          </View>
          <View style={styles.appInfo}>
            <Text style={styles.appName} numberOfLines={1}>{app.displayName}</Text>
            <Text style={styles.packageName} numberOfLines={1}>{app.packageName}</Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Stop blocking ${app.displayName}`}
            style={styles.removeButton}
            onPress={() => removeApp(app)}
          >
            <Icon name="delete-outline" size={22} color={Colors.error} />
          </TouchableOpacity>
        </View>
      ))}

      <TouchableOpacity
        style={[styles.addButton, (!isDeviceOwner || loading) && styles.buttonDisabled]}
        disabled={!isDeviceOwner || loading}
        onPress={loadInstalledApps}
      >
        {loading ? (
          <ActivityIndicator size="small" color={Colors.textOnPrimary} />
        ) : (
          <>
            <Icon name="plus-circle-outline" size={20} color={Colors.textOnPrimary} style={styles.addIcon} />
            <Text style={styles.addButtonText}>Add App to Block</Text>
          </>
        )}
      </TouchableOpacity>

      <Modal visible={showPicker} transparent animationType="slide" onRequestClose={() => setShowPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select an App to Block</Text>
              <TouchableOpacity onPress={() => setShowPicker(false)}>
                <Icon name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <View style={styles.searchRow}>
              <Icon name="magnify" size={20} color={Colors.textSecondary} />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Search name or package"
                placeholderTextColor={Colors.textHint}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Show all packages</Text>
              <Switch
                value={showAllPackages}
                onValueChange={setShowAllPackages}
                trackColor={{ false: Colors.border, true: Colors.primary + '66' }}
                thumbColor={showAllPackages ? Colors.primary : '#ccc'}
              />
            </View>
            <FlatList
              data={visibleApps}
              keyExtractor={item => item.packageName}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.pickerItem} onPress={() => addApp(item)}>
                  <View style={styles.pickerIcon}>
                    <Text style={styles.pickerIconText}>{item.hasLauncherActivity ? item.appName.charAt(0).toUpperCase() : '⚙'}</Text>
                  </View>
                  <View style={styles.appInfo}>
                    <Text style={styles.appName}>{item.appName}</Text>
                    <Text style={styles.packageName}>{item.packageName}</Text>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.noResults}>No matching applications</Text>}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  infoBox: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: Colors.infoLight, borderRadius: 8, padding: 10, marginBottom: Spacing.md },
  warningBox: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: Colors.warningLight, borderRadius: 8, padding: 10, marginBottom: Spacing.md },
  statusBox: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, padding: 10, marginBottom: Spacing.md, borderWidth: 1 },
  statusActive: { backgroundColor: Colors.successLight, borderColor: Colors.success },
  statusSaved: { backgroundColor: Colors.surfaceVariant, borderColor: Colors.border },
  infoIcon: { marginRight: 7 },
  infoText: { ...Typography.hint, flex: 1, color: Colors.infoDark },
  warningText: { ...Typography.hint, flex: 1, color: Colors.warningDark },
  statusText: { ...Typography.hint, flex: 1, color: Colors.textSecondary, fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingVertical: Spacing.xl },
  emptyTitle: { ...Typography.labelSmall, color: Colors.textSecondary, marginTop: Spacing.sm },
  emptyHint: { ...Typography.hint, color: Colors.textHint, marginTop: Spacing.xs },
  appRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, borderRadius: 9, padding: 10, marginBottom: 8 },
  appInitial: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.errorLight, marginRight: 10 },
  appInitialText: { color: Colors.errorDark, fontWeight: '700', fontSize: 16 },
  appInfo: { flex: 1 },
  appName: { ...Typography.labelSmall, color: Colors.textPrimary },
  packageName: { ...Typography.mono, fontSize: 10, marginTop: 2 },
  removeButton: { padding: 8 },
  addButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: Colors.primary, marginTop: Spacing.sm },
  buttonDisabled: { opacity: 0.45 },
  addIcon: { marginRight: 8 },
  addButtonText: { ...Typography.buttonSmall },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { height: '82%', backgroundColor: Colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: Spacing.lg },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  modalTitle: { ...Typography.sectionTitle },
  searchRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceVariant, borderRadius: 9, paddingHorizontal: 10, marginBottom: 8 },
  searchInput: { flex: 1, minHeight: 44, marginLeft: 8, color: Colors.textPrimary },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  toggleLabel: { ...Typography.body, color: Colors.textSecondary },
  pickerItem: { minHeight: 62, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border, paddingVertical: 8 },
  pickerIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primaryLight, marginRight: 10 },
  pickerIconText: { color: Colors.primaryDark, fontWeight: '700', fontSize: 16 },
  noResults: { ...Typography.body, textAlign: 'center', paddingVertical: Spacing.xxl, color: Colors.textHint },
});

export default BlockedAppsSection;
