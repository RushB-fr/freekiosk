/**
 * FreeKiosk - Blocking Overlay Editor Component
 * 
 * Editor for a single blocking region
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import Slider from '@react-native-community/slider';
import Icon, { IconName } from '../Icon';
import { Colors, Spacing, Typography } from '../../theme';
import {
  BlockingRegion,
  OverlayDisplayMode,
  validateRegion,
  getDisplayModeLabel,
} from '../../types/blockingOverlay';

interface BlockingOverlayEditorProps {
  visible: boolean;
  region: BlockingRegion | null;
  onSave: (region: BlockingRegion) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

const BlockingOverlayEditor: React.FC<BlockingOverlayEditorProps> = ({
  visible,
  region,
  onSave,
  onDelete,
  onClose,
}) => {
  const [name, setName] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [xStart, setXStart] = useState(0);
  const [yStart, setYStart] = useState(0);
  const [xEnd, setXEnd] = useState(100);
  const [yEnd, setYEnd] = useState(10);
  const [displayMode, setDisplayMode] = useState<OverlayDisplayMode>('semi_transparent');
  const [targetPackage, setTargetPackage] = useState('');

  const isNew = !region;

  useEffect(() => {
    if (region) {
      setName(region.name);
      setEnabled(region.enabled);
      setXStart(region.xStart);
      setYStart(region.yStart);
      setXEnd(region.xEnd);
      setYEnd(region.yEnd);
      setDisplayMode(region.displayMode);
      setTargetPackage(region.targetPackage || '');
    } else {
      // Reset for new region
      setName('New Region');
      setEnabled(true);
      setXStart(0);
      setYStart(0);
      setXEnd(100);
      setYEnd(10);
      setDisplayMode('semi_transparent');
      setTargetPackage('');
    }
  }, [region, visible]);

  const handleSave = () => {
    const updatedRegion: BlockingRegion = {
      id: region?.id || `region_${Date.now()}`,
      name: name.trim() || 'Unnamed Region',
      enabled,
      xStart,
      yStart,
      xEnd,
      yEnd,
      displayMode,
      targetPackage: targetPackage.trim() || null,
    };

    const validation = validateRegion(updatedRegion);
    if (!validation.valid) {
      Alert.alert('Invalid Region', validation.error);
      return;
    }

    onSave(updatedRegion);
    onClose();
  };

  const handleDelete = () => {
    if (region && onDelete) {
      Alert.alert(
        'Delete Region',
        `Are you sure you want to delete "${region.name}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              onDelete(region.id);
              onClose();
            },
          },
        ]
      );
    }
  };

  const displayModes: { value: OverlayDisplayMode; label: string; icon: IconName }[] = [
    { value: 'transparent', label: 'Transparent', icon: 'eye-off' },
    { value: 'semi_transparent', label: 'Semi-transparent', icon: 'eye' },
    { value: 'opaque', label: 'Opaque', icon: 'lock' },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>
              {isNew ? 'Add Region' : 'Edit Region'}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Icon name="close" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Name Input */}
            <View style={styles.section}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Region name"
                placeholderTextColor={Colors.textHint}
              />
            </View>

            {/* Horizontal (X-axis) */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Horizontal (X-axis)</Text>
              
              <View style={styles.sliderRow}>
                <Text style={styles.sliderLabel}>Start: {xStart.toFixed(0)}%</Text>
                <Slider
                  style={styles.slider}
                  minimumValue={0}
                  maximumValue={100}
                  step={1}
                  value={xStart}
                  onValueChange={setXStart}
                  minimumTrackTintColor={Colors.primary}
                  maximumTrackTintColor={Colors.border}
                  thumbTintColor={Colors.primary}
                />
              </View>
              
              <View style={styles.sliderRow}>
                <Text style={styles.sliderLabel}>End: {xEnd.toFixed(0)}%</Text>
                <Slider
                  style={styles.slider}
                  minimumValue={0}
                  maximumValue={100}
                  step={1}
                  value={xEnd}
                  onValueChange={setXEnd}
                  minimumTrackTintColor={Colors.primary}
                  maximumTrackTintColor={Colors.border}
                  thumbTintColor={Colors.primary}
                />
              </View>
            </View>

            {/* Vertical (Y-axis) */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Vertical (Y-axis)</Text>
              
              <View style={styles.sliderRow}>
                <Text style={styles.sliderLabel}>Start: {yStart.toFixed(0)}%</Text>
                <Slider
                  style={styles.slider}
                  minimumValue={0}
                  maximumValue={100}
                  step={1}
                  value={yStart}
                  onValueChange={setYStart}
                  minimumTrackTintColor={Colors.primary}
                  maximumTrackTintColor={Colors.border}
                  thumbTintColor={Colors.primary}
                />
              </View>
              
              <View style={styles.sliderRow}>
                <Text style={styles.sliderLabel}>End: {yEnd.toFixed(0)}%</Text>
                <Slider
                  style={styles.slider}
                  minimumValue={0}
                  maximumValue={100}
                  step={1}
                  value={yEnd}
                  onValueChange={setYEnd}
                  minimumTrackTintColor={Colors.primary}
                  maximumTrackTintColor={Colors.border}
                  thumbTintColor={Colors.primary}
                />
              </View>
            </View>

            {/* Preview Box */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Preview</Text>
              <View style={styles.previewContainer}>
                <View style={styles.previewScreen}>
                  <View
                    style={[
                      styles.previewRegion,
                      {
                        left: `${xStart}%`,
                        top: `${yStart}%`,
                        width: `${Math.max(0, xEnd - xStart)}%`,
                        height: `${Math.max(0, yEnd - yStart)}%`,
                        backgroundColor:
                          displayMode === 'transparent'
                            ? 'rgba(255, 0, 0, 0.3)'
                            : displayMode === 'semi_transparent'
                            ? 'rgba(64, 64, 64, 0.5)'
                            : 'rgba(32, 32, 32, 0.9)',
                      },
                    ]}
                  />
                </View>
              </View>
            </View>

            {/* Display Mode */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Display Mode</Text>
              {displayModes.map((mode) => (
                <TouchableOpacity
                  key={mode.value}
                  style={[
                    styles.radioOption,
                    displayMode === mode.value && styles.radioOptionSelected,
                  ]}
                  onPress={() => setDisplayMode(mode.value)}
                >
                  <Icon
                    name={displayMode === mode.value ? 'radiobox-marked' : 'radiobox-blank'}
                    size={24}
                    color={displayMode === mode.value ? Colors.primary : Colors.textHint}
                  />
                  <Icon
                    name={mode.icon}
                    size={20}
                    color={Colors.textPrimary}
                    style={styles.radioIcon}
                  />
                  <Text style={styles.radioLabel}>{mode.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Target Package */}
            <View style={styles.section}>
              <Text style={styles.label}>Target App Package (optional)</Text>
              <Text style={styles.hint}>
                Leave empty to always show, or enter a package name (e.g., com.vendor.app)
              </Text>
              <TextInput
                style={styles.input}
                value={targetPackage}
                onChangeText={setTargetPackage}
                placeholder="com.example.app"
                placeholderTextColor={Colors.textHint}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* Enabled Toggle */}
            <TouchableOpacity
              style={styles.toggleRow}
              onPress={() => setEnabled(!enabled)}
            >
              <Icon
                name={enabled ? 'checkbox-marked' : 'checkbox-blank-outline'}
                size={24}
                color={enabled ? Colors.primary : Colors.textHint}
              />
              <Text style={styles.toggleLabel}>Enabled</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Footer Buttons */}
          <View style={styles.footer}>
            {!isNew && onDelete && (
              <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
                <Icon name="delete" size={20} color={Colors.error} />
                <Text style={styles.deleteButtonText}>Delete</Text>
              </TouchableOpacity>
            )}
            <View style={styles.footerSpacer} />
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: Colors.background,
    borderRadius: 16,
    width: '90%',
    maxWidth: 500,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    ...Typography.sectionTitle,
  },
  closeButton: {
    padding: Spacing.xs,
  },
  body: {
    padding: Spacing.md,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    ...Typography.label,
    marginBottom: Spacing.sm,
  },
  label: {
    ...Typography.label,
    marginBottom: Spacing.xs,
  },
  hint: {
    ...Typography.hint,
    marginBottom: Spacing.sm,
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: Spacing.sm,
    color: Colors.textPrimary,
    ...Typography.body,
  },
  sliderRow: {
    marginBottom: Spacing.sm,
  },
  sliderLabel: {
    ...Typography.body,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  previewContainer: {
    alignItems: 'center',
  },
  previewScreen: {
    width: 200,
    height: 120,
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: 8,
    position: 'relative',
    overflow: 'hidden',
  },
  previewRegion: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: 8,
    marginBottom: Spacing.xs,
  },
  radioOptionSelected: {
    backgroundColor: Colors.surface,
  },
  radioIcon: {
    marginLeft: Spacing.sm,
  },
  radioLabel: {
    ...Typography.body,
    color: Colors.textPrimary,
    marginLeft: Spacing.sm,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.md,
  },
  toggleLabel: {
    ...Typography.body,
    color: Colors.textPrimary,
    marginLeft: Spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  footerSpacer: {
    flex: 1,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  deleteButtonText: {
    ...Typography.body,
    color: Colors.error,
    marginLeft: Spacing.xs,
  },
  cancelButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  cancelButtonText: {
    ...Typography.body,
    color: Colors.textHint,
  },
  saveButton: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: 8,
    marginLeft: Spacing.sm,
  },
  saveButtonText: {
    ...Typography.body,
    color: Colors.textOnPrimary,
    fontWeight: '600',
  },
});

export default BlockingOverlayEditor;
