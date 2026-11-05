import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  SettingsButton,
  SettingsInput,
  SettingsSection,
  SettingsSwitch,
} from './index';
import MultiAppHeader from '../MultiAppHeader';
import FilePickerModule from '../../utils/FilePickerModule';
import { MATERIAL_PALETTE } from '../../utils/dashboardColors';
import {
  DEFAULT_MULTI_APP_APPEARANCE,
  MultiAppAppearance,
  getMultiAppForeground,
  isHexColor,
  normalizeMultiAppAppearance,
} from '../../types/multiAppAppearance';
import { Colors } from '../../theme';

interface Props {
  appearance: MultiAppAppearance;
  onChange: (appearance: MultiAppAppearance) => void;
}

const PALETTE = [
  ...new Set([
    DEFAULT_MULTI_APP_APPEARANCE.backgroundColor,
    '#ffffff',
    '#000000',
    ...MATERIAL_PALETTE,
  ]),
];

const MultiAppAppearanceSection: React.FC<Props> = ({
  appearance,
  onChange,
}) => {
  const { t } = useTranslation();
  const [pickingLogo, setPickingLogo] = useState(false);
  const preview = normalizeMultiAppAppearance(appearance);
  const update = (changes: Partial<MultiAppAppearance>) =>
    onChange({ ...appearance, ...changes });

  const pickLogo = async () => {
    if (pickingLogo) return;
    setPickingLogo(true);
    try {
      const file = await FilePickerModule.pickMedia('image');
      update({ logoUri: file.path, showLogo: true });
    } catch (error: any) {
      if (error?.code !== 'PICKER_CANCELLED') {
        Alert.alert(
          t('general.appearance.logoErrorTitle'),
          t('general.appearance.logoError'),
        );
      }
    } finally {
      setPickingLogo(false);
    }
  };

  return (
    <SettingsSection title={t('general.appearance.title')} icon="palette">
      <Text style={styles.label}>{t('general.appearance.background')}</Text>
      <View style={styles.swatches}>
        {PALETTE.map(color => (
          <TouchableOpacity
            key={color}
            accessibilityRole="button"
            accessibilityLabel={color}
            accessibilityState={{
              selected:
                appearance.backgroundColor.trim().toLowerCase() ===
                color.toLowerCase(),
            }}
            style={[styles.swatch, { backgroundColor: color }]}
            onPress={() => update({ backgroundColor: color })}
          >
            {appearance.backgroundColor.trim().toLowerCase() ===
              color.toLowerCase() && (
              <Text style={{ color: getMultiAppForeground(color) }}>✓</Text>
            )}
          </TouchableOpacity>
        ))}
      </View>
      <SettingsInput
        label={t('general.appearance.customColor')}
        value={appearance.backgroundColor}
        onChangeText={backgroundColor => update({ backgroundColor })}
        placeholder="#2b7fff"
        error={
          !isHexColor(appearance.backgroundColor)
            ? t('general.appearance.invalidColor')
            : undefined
        }
        hint={t('general.appearance.colorHint')}
      />
      <SettingsSwitch
        label={t('general.appearance.showTitle')}
        value={appearance.showTitle}
        onValueChange={showTitle => update({ showTitle })}
      />
      {appearance.showTitle && (
        <SettingsInput
          label={t('general.appearance.heading')}
          value={appearance.title}
          onChangeText={title => update({ title })}
          maxLength={100}
        />
      )}
      <SettingsSwitch
        label={t('general.appearance.showLogo')}
        value={appearance.showLogo}
        onValueChange={showLogo => update({ showLogo })}
      />
      {appearance.showLogo && (
        <>
          <SettingsButton
            title={t('general.appearance.chooseLogo')}
            icon="image-outline"
            onPress={pickLogo}
            loading={pickingLogo}
            disabled={pickingLogo}
          />
          {!!appearance.logoUri && (
            <SettingsButton
              title={t('general.appearance.defaultLogo')}
              icon="restore"
              variant="outline"
              onPress={() => update({ logoUri: '' })}
            />
          )}
          <Text style={styles.hint}>{t('general.appearance.logoHint')}</Text>
        </>
      )}
      <Text style={styles.label}>{t('general.appearance.preview')}</Text>
      <View
        style={[styles.preview, { backgroundColor: preview.backgroundColor }]}
      >
        <MultiAppHeader appearance={preview} />
        <Text
          style={[
            styles.previewLabel,
            { color: getMultiAppForeground(preview.backgroundColor) },
          ]}
        >
          {t('general.appearance.sampleApp')}
        </Text>
      </View>
      <SettingsButton
        title={t('general.appearance.reset')}
        icon="restore"
        variant="outline"
        disabled={pickingLogo}
        onPress={() => onChange({ ...DEFAULT_MULTI_APP_APPEARANCE })}
      />
    </SettingsSection>
  );
};

const styles = StyleSheet.create({
  label: { color: Colors.textPrimary, fontWeight: '600', marginVertical: 8 },
  hint: { color: Colors.textSecondary, marginVertical: 8 },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  preview: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
    minHeight: 100,
  },
  previewLabel: { paddingHorizontal: 20, paddingBottom: 16 },
});

export default MultiAppAppearanceSection;
