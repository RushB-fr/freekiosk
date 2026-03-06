import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Image } from 'react-native';
import {
  SettingsSection,
  SettingsInput,
  SettingsInfoBox,
  SettingsButton,
} from '../../../components/settings';
import { Colors, Spacing, Typography } from '../../../theme';
import { DashboardTile } from '../../../types/dashboard';
import { getColorForLabel } from '../../../utils/dashboardColors';
import { StorageService } from '../../../utils/storage';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

interface DashboardTabProps {
  dashboardModeEnabled: boolean;
}

const ICON_MODES = [
  { value: 'favicon' as const, label: 'Favicon' },
  { value: 'image' as const, label: 'Image URL' },
  { value: 'letter' as const, label: 'Letter' },
];

const DashboardTab: React.FC<DashboardTabProps> = ({ dashboardModeEnabled }) => {
  const [tiles, setTiles] = useState<DashboardTile[]>([]);
  const [editingTile, setEditingTile] = useState<DashboardTile | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  // Editor state
  const [editLabel, setEditLabel] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editIconMode, setEditIconMode] = useState<DashboardTile['iconMode']>('favicon');
  const [editIconValue, setEditIconValue] = useState('');

  useEffect(() => {
    loadTiles();
  }, []);

  const loadTiles = async () => {
    const saved = await StorageService.getDashboardTiles();
    setTiles(saved.sort((a, b) => a.order - b.order));
  };

  const saveTiles = async (updated: DashboardTile[]) => {
    const sorted = updated.sort((a, b) => a.order - b.order);
    setTiles(sorted);
    await StorageService.saveDashboardTiles(sorted);
  };

  const openAddEditor = () => {
    setEditingTile(null);
    setEditLabel('');
    setEditUrl('');
    setEditIconMode('favicon');
    setEditIconValue('');
    setShowEditor(true);
  };

  const openEditEditor = (tile: DashboardTile) => {
    setEditingTile(tile);
    setEditLabel(tile.label);
    setEditUrl(tile.url);
    setEditIconMode(tile.iconMode);
    setEditIconValue(tile.iconValue || '');
    setShowEditor(true);
  };

  const handleSaveTile = async () => {
    if (!editLabel.trim()) {
      Alert.alert('Error', 'Please enter a label');
      return;
    }
    if (!editUrl.trim()) {
      Alert.alert('Error', 'Please enter a URL');
      return;
    }
    let finalUrl = editUrl.trim();
    const urlLower = finalUrl.toLowerCase();
    if (urlLower.startsWith('javascript:') || urlLower.startsWith('data:') || urlLower.startsWith('file://')) {
      Alert.alert('Security Error', 'This type of URL is not allowed. Use http:// or https://');
      return;
    }
    if (!urlLower.startsWith('http://') && !urlLower.startsWith('https://')) {
      if (finalUrl.includes('.')) {
        finalUrl = 'https://' + finalUrl;
      } else {
        Alert.alert('Invalid URL', 'Please enter a valid URL');
        return;
      }
    }

    if (editingTile) {
      // Update existing
      const updated = tiles.map(t =>
        t.id === editingTile.id
          ? { ...t, label: editLabel.trim(), url: finalUrl, iconMode: editIconMode, iconValue: editIconMode === 'image' ? editIconValue.trim() : undefined }
          : t,
      );
      await saveTiles(updated);
    } else {
      // Add new
      const newTile: DashboardTile = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2),
        label: editLabel.trim(),
        url: finalUrl,
        iconMode: editIconMode,
        iconValue: editIconMode === 'image' ? editIconValue.trim() : undefined,
        order: tiles.length,
      };
      await saveTiles([...tiles, newTile]);
    }
    setShowEditor(false);
  };

  const handleDeleteTile = (tile: DashboardTile) => {
    Alert.alert('Delete Tile', `Remove "${tile.label}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const filtered = tiles.filter(t => t.id !== tile.id);
          const reordered = filtered.map((t, i) => ({ ...t, order: i }));
          await saveTiles(reordered);
        },
      },
    ]);
  };

  const handleMoveUp = async (index: number) => {
    if (index <= 0) return;
    const updated = [...tiles];
    const temp = updated[index].order;
    updated[index].order = updated[index - 1].order;
    updated[index - 1].order = temp;
    await saveTiles(updated);
  };

  const handleMoveDown = async (index: number) => {
    if (index >= tiles.length - 1) return;
    const updated = [...tiles];
    const temp = updated[index].order;
    updated[index].order = updated[index + 1].order;
    updated[index + 1].order = temp;
    await saveTiles(updated);
  };

  const renderTilePreview = (tile: DashboardTile) => {
    if (tile.iconMode === 'letter') {
      const color = getColorForLabel(tile.label);
      const letter = tile.label ? tile.label[0].toUpperCase() : '?';
      return (
        <View style={[styles.previewCircle, { backgroundColor: color }]}>
          <Text style={styles.previewLetter}>{letter}</Text>
        </View>
      );
    }
    if (tile.iconMode === 'image' && tile.iconValue) {
      return <Image source={{ uri: tile.iconValue }} style={styles.previewImage} />;
    }
    // favicon
    const domain = tile.url.replace(/^https?:\/\//, '').split('/')[0];
    return (
      <Image
        source={{ uri: `https://www.google.com/s2/favicons?domain=${domain}&sz=64` }}
        style={styles.previewImage}
      />
    );
  };

  if (!dashboardModeEnabled) {
    return (
      <View>
        <SettingsInfoBox variant="warning">
          <Text style={styles.infoText}>
            Enable Dashboard mode in General tab to configure tiles.
          </Text>
        </SettingsInfoBox>
      </View>
    );
  }

  return (
    <View>
      <SettingsSection title="Dashboard Tiles" icon="view-dashboard">
        {tiles.map((tile, index) => (
          <View key={tile.id} style={styles.tileRow}>
            {/* Reorder arrows */}
            <View style={styles.arrowColumn}>
              {index > 0 && (
                <TouchableOpacity onPress={() => handleMoveUp(index)} style={styles.arrowButton}>
                  <MaterialCommunityIcons name="arrow-up" size={18} color={Colors.textSecondary} />
                </TouchableOpacity>
              )}
              {index < tiles.length - 1 && (
                <TouchableOpacity onPress={() => handleMoveDown(index)} style={styles.arrowButton}>
                  <MaterialCommunityIcons name="arrow-down" size={18} color={Colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            {/* Icon preview */}
            {renderTilePreview(tile)}

            {/* Label & URL */}
            <View style={styles.tileInfo}>
              <Text style={styles.tileLabel} numberOfLines={1}>{tile.label}</Text>
              <Text style={styles.tileUrl} numberOfLines={1}>{tile.url}</Text>
            </View>

            {/* Edit / Delete */}
            <TouchableOpacity onPress={() => openEditEditor(tile)} style={styles.actionButton}>
              <MaterialCommunityIcons name="pencil" size={18} color={Colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDeleteTile(tile)} style={styles.actionButton}>
              <MaterialCommunityIcons name="delete-outline" size={18} color={Colors.error} />
            </TouchableOpacity>
          </View>
        ))}

        <SettingsButton
          title="Add Tile"
          icon="plus-circle-outline"
          variant="success"
          onPress={openAddEditor}
        />
      </SettingsSection>

      {showEditor && (
        <SettingsSection title={editingTile ? 'Edit Tile' : 'New Tile'} icon="pencil">
          <SettingsInput
            label="Label"
            value={editLabel}
            onChangeText={setEditLabel}
            placeholder="My Dashboard"
          />
          <View style={styles.editorSpacer} />
          <SettingsInput
            label="URL"
            value={editUrl}
            onChangeText={setEditUrl}
            placeholder="https://example.com"
            keyboardType="url"
          />
          <View style={styles.editorSpacer} />

          {/* Icon mode selector */}
          <Text style={styles.fieldLabel}>Icon Mode</Text>
          <View style={styles.iconModeRow}>
            {ICON_MODES.map(mode => (
              <TouchableOpacity
                key={mode.value}
                style={[
                  styles.iconModeButton,
                  editIconMode === mode.value && styles.iconModeButtonActive,
                ]}
                onPress={() => setEditIconMode(mode.value)}
              >
                <Text
                  style={[
                    styles.iconModeText,
                    editIconMode === mode.value && styles.iconModeTextActive,
                  ]}
                >
                  {mode.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {editIconMode === 'image' && (
            <>
              <View style={styles.editorSpacer} />
              <SettingsInput
                label="Image URL"
                value={editIconValue}
                onChangeText={setEditIconValue}
                placeholder="https://example.com/icon.png"
                keyboardType="url"
              />
            </>
          )}

          {/* Preview */}
          {editLabel.trim() && (
            <View style={styles.previewRow}>
              <Text style={styles.fieldLabel}>Preview</Text>
              <View style={styles.previewContainer}>
                {renderTilePreview({
                  id: 'preview',
                  label: editLabel,
                  url: editUrl,
                  iconMode: editIconMode,
                  iconValue: editIconValue,
                  order: 0,
                })}
                <Text style={styles.previewLabel}>{editLabel}</Text>
              </View>
            </View>
          )}

          <View style={styles.editorSpacer} />
          <View style={styles.editorActions}>
            <SettingsButton
              title="Cancel"
              variant="outline"
              onPress={() => setShowEditor(false)}
            />
            <View style={{ width: Spacing.sm }} />
            <SettingsButton
              title={editingTile ? 'Update' : 'Add'}
              variant="success"
              onPress={handleSaveTile}
            />
          </View>
        </SettingsSection>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  infoText: {
    ...Typography.body,
    lineHeight: 22,
  },
  tileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  arrowColumn: {
    width: 28,
    alignItems: 'center',
    marginRight: Spacing.xs,
  },
  arrowButton: {
    padding: 2,
  },
  previewCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  previewLetter: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  previewImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: Spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  tileInfo: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  tileLabel: {
    ...Typography.label,
    marginBottom: 2,
  },
  tileUrl: {
    ...Typography.hint,
    fontSize: 11,
  },
  actionButton: {
    padding: Spacing.xs,
  },
  editorSpacer: {
    height: Spacing.md,
  },
  fieldLabel: {
    ...Typography.label,
    marginBottom: Spacing.xs,
  },
  iconModeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  iconModeButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  iconModeButtonActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight || 'rgba(0, 102, 204, 0.1)',
  },
  iconModeText: {
    ...Typography.body,
    color: Colors.textSecondary,
  },
  iconModeTextActive: {
    color: Colors.primary,
    fontWeight: '600',
  },
  previewRow: {
    marginTop: Spacing.md,
  },
  previewContainer: {
    alignItems: 'center',
    padding: Spacing.md,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 8,
  },
  previewLabel: {
    ...Typography.body,
    marginTop: Spacing.xs,
    textAlign: 'center',
  },
  editorActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
});

export default DashboardTab;
