/**
 * FreeKiosk - Blocking Overlays Settings Screen
 * 
 * Configure touch-blocking regions for external apps
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '../../components/Icon';
import BlockingOverlayEditor from '../../components/settings/BlockingOverlayEditor';
import { Colors, Spacing, Typography } from '../../theme';
import {
  BlockingRegion,
  MAX_BLOCKING_REGIONS,
  getDisplayModeLabel,
} from '../../types/blockingOverlay';
import { StorageService } from '../../utils/storage';
import BlockingOverlayModule from '../../utils/BlockingOverlayModule';

const MAX_REGIONS = MAX_BLOCKING_REGIONS;

const BlockingOverlaysScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [enabled, setEnabled] = useState(false);
  const [regions, setRegions] = useState<BlockingRegion[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingRegion, setEditingRegion] = useState<BlockingRegion | null>(null);

  // Load settings
  const loadSettings = useCallback(async () => {
    try {
      const [enabledValue, regionsValue] = await Promise.all([
        StorageService.getBlockingOverlaysEnabled(),
        StorageService.getBlockingOverlaysRegions(),
      ]);
      setEnabled(enabledValue);
      setRegions(regionsValue);
    } catch (error) {
      console.error('Failed to load blocking overlays settings:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Save settings (without applying - overlays only active on KioskScreen)
  const saveSettings = useCallback(async (newEnabled: boolean, newRegions: BlockingRegion[]) => {
    try {
      await Promise.all([
        StorageService.saveBlockingOverlaysEnabled(newEnabled),
        StorageService.saveBlockingOverlaysRegions(newRegions),
      ]);
      // Note: We don't apply here - overlays are only activated when returning to KioskScreen
      // This prevents overlays from appearing in settings screens
    } catch (error) {
      console.error('Failed to save blocking overlays settings:', error);
      Alert.alert('Error', 'Failed to save settings');
    }
  }, []);

  // Handle master toggle
  const handleToggleEnabled = async (value: boolean) => {
    setEnabled(value);
    await saveSettings(value, regions);
  };

  // Handle add region
  const handleAddRegion = () => {
    if (regions.length >= MAX_REGIONS) {
      Alert.alert('Limit Reached', `Maximum ${MAX_REGIONS} regions allowed.`);
      return;
    }
    setEditingRegion(null);
    setEditorVisible(true);
  };

  // Handle edit region
  const handleEditRegion = (region: BlockingRegion) => {
    setEditingRegion(region);
    setEditorVisible(true);
  };

  // Handle save region
  const handleSaveRegion = async (region: BlockingRegion) => {
    let newRegions: BlockingRegion[];
    const existingIndex = regions.findIndex((r) => r.id === region.id);
    
    if (existingIndex >= 0) {
      // Update existing
      newRegions = [...regions];
      newRegions[existingIndex] = region;
    } else {
      // Add new
      if (regions.length >= MAX_REGIONS) {
        Alert.alert('Limit Reached', `Maximum ${MAX_REGIONS} regions allowed.`);
        return;
      }
      newRegions = [...regions, region];
    }

    setRegions(newRegions);
    await saveSettings(enabled, newRegions);
  };

  // Handle delete region
  const handleDeleteRegion = async (id: string) => {
    const newRegions = regions.filter((r) => r.id !== id);
    setRegions(newRegions);
    await saveSettings(enabled, newRegions);
  };

  // Handle toggle region enabled
  const handleToggleRegion = async (region: BlockingRegion) => {
    const newRegions = regions.map((r) =>
      r.id === region.id ? { ...r, enabled: !r.enabled } : r
    );
    setRegions(newRegions);
    await saveSettings(enabled, newRegions);
  };

  // Handle show touch logger
  const handleShowTouchLogger = async () => {
    try {
      const success = await BlockingOverlayModule.showTouchLogger();
      if (!success) {
        Alert.alert('Error', 'Failed to show touch logger');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to show touch logger. Make sure overlay permission is granted.');
    }
  };

  // Handle show grid helper
  const handleShowGridHelper = async () => {
    try {
      const success = await BlockingOverlayModule.showGridHelper(30);
      if (!success) {
        Alert.alert('Error', 'Failed to show grid helper');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to show grid helper. Make sure overlay permission is granted.');
    }
  };

  // Pull to refresh
  const onRefresh = () => {
    setRefreshing(true);
    loadSettings();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="arrow-left" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Blocking Overlays</Text>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Description */}
        <View style={styles.descriptionCard}>
          <Icon name="information-outline" size={24} color={Colors.primary} />
          <Text style={styles.descriptionText}>
            Block touch input on specific areas of external apps. Useful for hiding
            navigation bars, toolbars, or other interactive elements.
          </Text>
        </View>

        {/* Master Toggle */}
        <View style={styles.section}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>Enable Blocking Overlays</Text>
              <Text style={styles.toggleHint}>
                When enabled, configured regions will block touch input
              </Text>
            </View>
            <Switch
              value={enabled}
              onValueChange={handleToggleEnabled}
              trackColor={{ false: Colors.border, true: Colors.primaryLight }}
              thumbColor={enabled ? Colors.primary : Colors.textHint}
            />
          </View>
        </View>

        {/* Tools Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Setup Tools</Text>
          
          <TouchableOpacity style={styles.toolButton} onPress={handleShowTouchLogger}>
            <Icon name="gesture-tap" size={24} color={Colors.primary} />
            <View style={styles.toolInfo}>
              <Text style={styles.toolLabel}>Touch Logger</Text>
              <Text style={styles.toolHint}>
                Shows coordinates when you tap (30s countdown)
              </Text>
            </View>
            <Icon name="chevron-right" size={24} color={Colors.textHint} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.toolButton} onPress={handleShowGridHelper}>
            <Icon name="grid" size={24} color={Colors.primary} />
            <View style={styles.toolInfo}>
              <Text style={styles.toolLabel}>Grid Helper</Text>
              <Text style={styles.toolHint}>
                Shows a percentage grid overlay (30s countdown)
              </Text>
            </View>
            <Icon name="chevron-right" size={24} color={Colors.textHint} />
          </TouchableOpacity>
        </View>

        {/* Regions Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              Regions ({regions.length}/{MAX_REGIONS})
            </Text>
            <TouchableOpacity
              style={[
                styles.addButton,
                regions.length >= MAX_REGIONS && styles.addButtonDisabled,
              ]}
              onPress={handleAddRegion}
              disabled={regions.length >= MAX_REGIONS}
            >
              <Icon
                name="plus"
                size={20}
                color={regions.length >= MAX_REGIONS ? Colors.textHint : Colors.primary}
              />
              <Text
                style={[
                  styles.addButtonText,
                  regions.length >= MAX_REGIONS && styles.addButtonTextDisabled,
                ]}
              >
                Add
              </Text>
            </TouchableOpacity>
          </View>

          {regions.length === 0 ? (
            <View style={styles.emptyState}>
              <Icon name="rectangle-outline" size={48} color={Colors.textHint} />
              <Text style={styles.emptyStateText}>No regions configured</Text>
              <Text style={styles.emptyStateHint}>
                Tap "Add" to create a blocking region
              </Text>
            </View>
          ) : (
            regions.map((region) => (
              <TouchableOpacity
                key={region.id}
                style={styles.regionCard}
                onPress={() => handleEditRegion(region)}
              >
                <View style={styles.regionHeader}>
                  <TouchableOpacity
                    style={styles.regionToggle}
                    onPress={() => handleToggleRegion(region)}
                  >
                    <Icon
                      name={region.enabled ? 'checkbox-marked' : 'checkbox-blank-outline'}
                      size={24}
                      color={region.enabled ? Colors.primary : Colors.textHint}
                    />
                  </TouchableOpacity>
                  <View style={styles.regionInfo}>
                    <Text
                      style={[
                        styles.regionName,
                        !region.enabled && styles.regionNameDisabled,
                      ]}
                    >
                      {region.name}
                    </Text>
                    <Text style={styles.regionDetails}>
                      {region.xStart}%-{region.xEnd}% × {region.yStart}%-{region.yEnd}%
                      {' • '}
                      {getDisplayModeLabel(region.displayMode)}
                    </Text>
                    {region.targetPackage && (
                      <Text style={styles.regionPackage}>
                        App: {region.targetPackage}
                      </Text>
                    )}
                  </View>
                  <Icon name="chevron-right" size={24} color={Colors.textHint} />
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Tips Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tips</Text>
          <View style={styles.tipCard}>
            <Icon name="lightbulb-outline" size={20} color={Colors.warning} />
            <Text style={styles.tipText}>
              Use the Touch Logger to find exact coordinates of elements you want to block.
            </Text>
          </View>
          <View style={styles.tipCard}>
            <Icon name="lightbulb-outline" size={20} color={Colors.warning} />
            <Text style={styles.tipText}>
              Percentage-based coordinates automatically adapt to screen rotation and different device sizes.
            </Text>
          </View>
          <View style={styles.tipCard}>
            <Icon name="lightbulb-outline" size={20} color={Colors.warning} />
            <Text style={styles.tipText}>
              Regions can overlap. The return button will always stay accessible above blocking overlays.
            </Text>
          </View>
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Editor Modal */}
      <BlockingOverlayEditor
        visible={editorVisible}
        region={editingRegion}
        onSave={handleSaveRegion}
        onDelete={handleDeleteRegion}
        onClose={() => setEditorVisible(false)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...Typography.body,
    color: Colors.textHint,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    padding: Spacing.xs,
    marginRight: Spacing.sm,
  },
  title: {
    ...Typography.sectionTitle,
  },
  content: {
    flex: 1,
  },
  descriptionCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    margin: Spacing.md,
    padding: Spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  descriptionText: {
    ...Typography.body,
    color: Colors.textPrimary,
    flex: 1,
    marginLeft: Spacing.sm,
  },
  section: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.label,
    marginBottom: Spacing.sm,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  toggleInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  toggleLabel: {
    ...Typography.body,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  toggleHint: {
    ...Typography.hint,
    marginTop: 2,
  },
  toolButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  toolInfo: {
    flex: 1,
    marginLeft: Spacing.sm,
  },
  toolLabel: {
    ...Typography.body,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  toolHint: {
    ...Typography.hint,
    marginTop: 2,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  addButtonText: {
    ...Typography.body,
    color: Colors.primary,
    marginLeft: Spacing.xs,
  },
  addButtonTextDisabled: {
    color: Colors.textHint,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyStateText: {
    ...Typography.body,
    color: Colors.textHint,
    marginTop: Spacing.sm,
  },
  emptyStateHint: {
    ...Typography.hint,
    marginTop: Spacing.xs,
  },
  regionCard: {
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  regionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  regionToggle: {
    padding: Spacing.xs,
    marginRight: Spacing.xs,
  },
  regionInfo: {
    flex: 1,
  },
  regionName: {
    ...Typography.body,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  regionNameDisabled: {
    color: Colors.textHint,
  },
  regionDetails: {
    ...Typography.hint,
    marginTop: 2,
  },
  regionPackage: {
    ...Typography.hint,
    color: Colors.primary,
    marginTop: 2,
  },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.surface,
    padding: Spacing.sm,
    borderRadius: 8,
    marginBottom: Spacing.xs,
  },
  tipText: {
    ...Typography.hint,
    color: Colors.textPrimary,
    flex: 1,
    marginLeft: Spacing.sm,
  },
  bottomPadding: {
    height: Spacing.xl,
  },
});

export default BlockingOverlaysScreen;
