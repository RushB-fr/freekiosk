import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Image } from 'react-native';
import {
  SettingsSection,
  SettingsInput,
  SettingsInfoBox,
  SettingsButton,
  SettingsSwitch,
  SettingsSlider,
} from '../../../components/settings';
import { Colors, Spacing, Typography } from '../../../theme';
import {
  DashboardTile,
  DashboardIconSize,
  DASHBOARD_ICON_SIZES,
  DEFAULT_DASHBOARD_ICON_SIZE,
} from '../../../types/dashboard';
import { getTileColor, MATERIAL_PALETTE } from '../../../utils/dashboardColors';
import { StorageService } from '../../../utils/storage';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTranslation } from 'react-i18next';

interface DashboardTabProps {
  dashboardModeEnabled: boolean;
}

const DashboardTab: React.FC<DashboardTabProps> = ({ dashboardModeEnabled }) => {
  const { t } = useTranslation();

  const ICON_MODES = [
    { value: 'favicon' as const, label: t('dashboard.iconModes.favicon') },
    { value: 'image' as const, label: t('dashboard.iconModes.image') },
    { value: 'letter' as const, label: t('dashboard.iconModes.letter') },
  ];

  const [tiles, setTiles] = useState<DashboardTile[]>([]);
  const [editingTile, setEditingTile] = useState<DashboardTile | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  // Editor state
  const [editLabel, setEditLabel] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editIconMode, setEditIconMode] = useState<DashboardTile['iconMode']>('favicon');
  const [editIconValue, setEditIconValue] = useState('');
  const [editIconColor, setEditIconColor] = useState<string | undefined>(undefined);
  const [iconSize, setIconSize] = useState<DashboardIconSize>(DEFAULT_DASHBOARD_ICON_SIZE);
  const [navAutoHide, setNavAutoHide] = useState(false);
  const [navAutoHideSeconds, setNavAutoHideSeconds] = useState(4);
  const [swipeBetweenTiles, setSwipeBetweenTiles] = useState(false);
  const [keepTilesLoaded, setKeepTilesLoaded] = useState(false);

  useEffect(() => {
    loadTiles();
    StorageService.getDashboardIconSize().then(setIconSize);
    StorageService.getDashboardNavAutoHide().then(setNavAutoHide);
    StorageService.getDashboardNavAutoHideSeconds().then(setNavAutoHideSeconds);
    StorageService.getDashboardSwipeBetweenTiles().then(setSwipeBetweenTiles);
    StorageService.getDashboardKeepTilesLoaded().then(setKeepTilesLoaded);
  }, []);

  const handleNavAutoHideChange = async (enabled: boolean) => {
    setNavAutoHide(enabled);
    await StorageService.saveDashboardNavAutoHide(enabled);
  };

  const handleSwipeBetweenTilesChange = async (enabled: boolean) => {
    setSwipeBetweenTiles(enabled);
    await StorageService.saveDashboardSwipeBetweenTiles(enabled);
  };

  const handleKeepTilesLoadedChange = async (enabled: boolean) => {
    setKeepTilesLoaded(enabled);
    await StorageService.saveDashboardKeepTilesLoaded(enabled);
  };

  const handleNavAutoHideSecondsChange = async (seconds: number) => {
    setNavAutoHideSeconds(seconds);
    await StorageService.saveDashboardNavAutoHideSeconds(seconds);
  };

  const handleIconSizeChange = async (size: DashboardIconSize) => {
    setIconSize(size);
    await StorageService.saveDashboardIconSize(size);
  };

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
    setEditIconColor(undefined);
    setShowEditor(true);
  };

  const openEditEditor = (tile: DashboardTile) => {
    setEditingTile(tile);
    setEditLabel(tile.label);
    setEditUrl(tile.url);
    setEditIconMode(tile.iconMode);
    setEditIconValue(tile.iconValue || '');
    setEditIconColor(tile.iconColor);
    setShowEditor(true);
  };

  const handleSaveTile = async () => {
    if (!editLabel.trim()) {
      Alert.alert(t('dashboard.errors.error'), t('dashboard.errors.enterLabel'));
      return;
    }
    if (!editUrl.trim()) {
      Alert.alert(t('dashboard.errors.error'), t('dashboard.errors.enterUrl'));
      return;
    }
    let finalUrl = editUrl.trim();
    const urlLower = finalUrl.toLowerCase();
    if (urlLower.startsWith('javascript:') || urlLower.startsWith('data:') || urlLower.startsWith('file://')) {
      Alert.alert(t('dashboard.errors.securityError'), t('dashboard.errors.urlNotAllowed'));
      return;
    }
    if (!urlLower.startsWith('http://') && !urlLower.startsWith('https://')) {
      if (finalUrl.includes('.')) {
        finalUrl = 'https://' + finalUrl;
      } else {
        Alert.alert(t('dashboard.errors.invalidUrl'), t('dashboard.errors.enterValidUrl'));
        return;
      }
    }

    if (editingTile) {
      // Update existing
      const updated = tiles.map(t =>
        t.id === editingTile.id
          ? { ...t, label: editLabel.trim(), url: finalUrl, iconMode: editIconMode, iconValue: editIconMode === 'image' ? editIconValue.trim() : undefined, iconColor: editIconColor }
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
        iconColor: editIconColor,
        order: tiles.length,
      };
      await saveTiles([...tiles, newTile]);
    }
    setShowEditor(false);
  };

  const handleDeleteTile = (tile: DashboardTile) => {
    Alert.alert(t('dashboard.deleteTile.title'), t('dashboard.deleteTile.message', { label: tile.label }), [
      { text: t('dashboard.deleteTile.cancel'), style: 'cancel' },
      {
        text: t('dashboard.deleteTile.delete'),
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
      const color = getTileColor(tile);
      const letter = tile.label ? tile.label[0].toUpperCase() : '?';
      return (
        <View style={[styles.previewCircle, { backgroundColor: color }]}>
          <Text style={styles.previewLetter}>{letter}</Text>
        </View>
      );
    }
    if (tile.iconMode === 'image' && tile.iconValue) {
      return <Image source={{ uri: tile.iconValue }} style={[styles.previewImage, tile.iconColor ? { backgroundColor: getTileColor(tile) } : null]} />;
    }
    // favicon
    const domain = tile.url.replace(/^https?:\/\//, '').split('/')[0];
    return (
      <Image
        source={{ uri: `https://www.google.com/s2/favicons?domain=${domain}&sz=64` }}
        style={[styles.previewImage, tile.iconColor ? { backgroundColor: getTileColor(tile) } : null]}
      />
    );
  };

  if (!dashboardModeEnabled) {
    return (
      <View>
        <SettingsInfoBox variant="warning">
          <Text style={styles.infoText}>
            {t('dashboard.enableDashboardMode')}
          </Text>
        </SettingsInfoBox>
      </View>
    );
  }

  return (
    <View>
      <SettingsSection title={t('dashboard.iconSize.title')} icon="view-dashboard">
        <View style={styles.iconModeRow}>
          {DASHBOARD_ICON_SIZES.map(size => (
            <TouchableOpacity
              key={size}
              style={[styles.iconModeButton, iconSize === size && styles.iconModeButtonActive]}
              onPress={() => handleIconSizeChange(size)}
            >
              <Text style={[styles.iconModeText, iconSize === size && styles.iconModeTextActive]}>
                {t(`dashboard.iconSize.${size}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </SettingsSection>

      <SettingsSection title={t('dashboard.tilePages.title')} icon="gesture-tap">
        <SettingsSwitch
          label={t('dashboard.tilePages.autoHide')}
          hint={t('dashboard.tilePages.autoHideHint')}
          value={navAutoHide}
          onValueChange={handleNavAutoHideChange}
        />
        {navAutoHide && (
          <SettingsSlider
            label={t('dashboard.tilePages.hideAfter')}
            hint={t('dashboard.tilePages.hideAfterHint')}
            icon="timer-outline"
            value={navAutoHideSeconds}
            onValueChange={handleNavAutoHideSecondsChange}
            minimumValue={1}
            maximumValue={30}
            step={1}
            unit="s"
            formatValue={(v) => `${Math.round(v)}s`}
          />
        )}
        <SettingsSwitch
          label={t('dashboard.tilePages.swipeBetweenTiles')}
          hint={t('dashboard.tilePages.swipeBetweenTilesHint')}
          value={swipeBetweenTiles}
          onValueChange={handleSwipeBetweenTilesChange}
        />
        <SettingsSwitch
          label={t('dashboard.tilePages.keepTilesLoaded')}
          hint={t('dashboard.tilePages.keepTilesLoadedHint')}
          value={keepTilesLoaded}
          onValueChange={handleKeepTilesLoadedChange}
        />
      </SettingsSection>

      <SettingsSection title={t('dashboard.tilesTitle')} icon="view-dashboard">
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
          title={t('dashboard.addTile')}
          icon="plus-circle-outline"
          variant="success"
          onPress={openAddEditor}
        />
      </SettingsSection>

      {showEditor && (
        <SettingsSection title={editingTile ? t('dashboard.editTile') : t('dashboard.newTile')} icon="pencil">
          <SettingsInput
            label={t('dashboard.label')}
            value={editLabel}
            onChangeText={setEditLabel}
            placeholder={t('dashboard.labelPlaceholder')}
          />
          <View style={styles.editorSpacer} />
          <SettingsInput
            label={t('dashboard.url')}
            value={editUrl}
            onChangeText={setEditUrl}
            placeholder={t('dashboard.urlPlaceholder')}
            keyboardType="url"
          />
          <View style={styles.editorSpacer} />

          {/* Icon mode selector */}
          <Text style={styles.fieldLabel}>{t('dashboard.iconMode')}</Text>
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
                label={t('dashboard.imageUrl')}
                value={editIconValue}
                onChangeText={setEditIconValue}
                placeholder={t('dashboard.imageUrlPlaceholder')}
                keyboardType="url"
              />
            </>
          )}

          {/* Icon color */}
          <View style={styles.editorSpacer} />
          <Text style={styles.fieldLabel}>{t('dashboard.iconColor')}</Text>
          <View style={styles.colorRow}>
            <TouchableOpacity
              style={[styles.autoColorButton, !editIconColor && styles.iconModeButtonActive]}
              onPress={() => setEditIconColor(undefined)}
            >
              <Text style={[styles.iconModeText, !editIconColor && styles.iconModeTextActive]}>
                {t('dashboard.colorAuto')}
              </Text>
            </TouchableOpacity>
            {MATERIAL_PALETTE.map(color => (
              <TouchableOpacity
                key={color}
                style={[
                  styles.colorSwatch,
                  { backgroundColor: color },
                  editIconColor === color && styles.colorSwatchActive,
                ]}
                onPress={() => setEditIconColor(color)}
              />
            ))}
          </View>

          {/* Preview */}
          {editLabel.trim() && (
            <View style={styles.previewRow}>
              <Text style={styles.fieldLabel}>{t('dashboard.preview')}</Text>
              <View style={styles.previewContainer}>
                {renderTilePreview({
                  id: 'preview',
                  label: editLabel,
                  url: editUrl,
                  iconMode: editIconMode,
                  iconValue: editIconValue,
                  iconColor: editIconColor,
                  order: 0,
                })}
                <Text style={styles.previewLabel}>{editLabel}</Text>
              </View>
            </View>
          )}

          <View style={styles.editorSpacer} />
          <View style={styles.editorActions}>
            <SettingsButton
              title={t('dashboard.cancel')}
              variant="outline"
              onPress={() => setShowEditor(false)}
            />
            <View style={{ width: Spacing.sm }} />
            <SettingsButton
              title={editingTile ? t('dashboard.update') : t('dashboard.add')}
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
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  autoColorButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  colorSwatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorSwatchActive: {
    borderColor: Colors.textPrimary,
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
