/**
 * FreeKiosk v1.2 - SettingsSlider Component
 * A slider with value display and optional presets
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import Slider from '@react-native-community/slider';
import { Colors, Spacing, Typography } from '../../theme';
import Icon, { IconName } from '../Icon';

interface PresetOption {
  label: string;
  value: number;
}

interface SettingsSliderProps {
  label: string;
  hint?: string;
  icon?: IconName;
  value: number;
  onValueChange: (value: number) => void;
  minimumValue?: number;
  maximumValue?: number;
  step?: number;
  unit?: string;
  formatValue?: (value: number) => string;
  presets?: PresetOption[];
  disabled?: boolean;
  style?: ViewStyle;
}

const SettingsSlider: React.FC<SettingsSliderProps> = ({
  label,
  hint,
  icon,
  value,
  onValueChange,
  minimumValue = 0,
  maximumValue = 100,
  step = 1,
  unit = '%',
  formatValue,
  presets,
  disabled = false,
  style,
}) => {
  const displayValue = formatValue 
    ? formatValue(value) 
    : `${Math.round(value * 100)}${unit}`;

  return (
    <View style={[styles.container, style]}>
      <View style={styles.labelRow}>
        {icon && <Icon name={icon} size={18} color={disabled ? Colors.textDisabled : Colors.textSecondary} style={styles.icon} />}
        <Text style={[styles.label, disabled && styles.labelDisabled]}>{label}</Text>
      </View>
      
      {hint && <Text style={[styles.hint, disabled && styles.hintDisabled]}>{hint}</Text>}
      
      {presets && presets.length > 0 && (
        <View style={styles.presetsContainer}>
          {presets.map((preset) => (
            <TouchableOpacity
              key={preset.label}
              style={[
                styles.presetButton,
                value === preset.value && styles.presetButtonActive,
              ]}
              onPress={() => !disabled && onValueChange(preset.value)}
              disabled={disabled}
            >
              <Text
                style={[
                  styles.presetButtonText,
                  value === preset.value && styles.presetButtonTextActive,
                ]}
              >
                {preset.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      
      <View style={styles.sliderContainer}>
        <Text style={[styles.value, disabled && styles.valueDisabled]}>{displayValue}</Text>
        <Slider
          style={styles.slider}
          minimumValue={minimumValue}
          maximumValue={maximumValue}
          step={step}
          value={value}
          onValueChange={onValueChange}
          minimumTrackTintColor={disabled ? Colors.textDisabled : Colors.primary}
          maximumTrackTintColor={Colors.border}
          thumbTintColor={disabled ? Colors.textDisabled : Colors.primary}
          disabled={disabled}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  icon: {
    marginRight: Spacing.sm,
  },
  label: {
    ...Typography.label,
  },
  labelDisabled: {
    color: Colors.textDisabled,
  },
  hint: {
    ...Typography.hint,
    marginBottom: Spacing.md,
  },
  hintDisabled: {
    color: Colors.textDisabled,
  },
  presetsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  presetButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  presetButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  presetButtonText: {
    ...Typography.hint,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  presetButtonTextActive: {
    color: Colors.textOnPrimary,
    fontWeight: '600',
  },
  sliderContainer: {
    marginTop: Spacing.sm,
  },
  value: {
    ...Typography.value,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  valueDisabled: {
    color: Colors.textDisabled,
  },
  slider: {
    width: '100%',
    height: 40,
  },
});

export default SettingsSlider;
