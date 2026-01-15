/**
 * FreeKiosk v1.2 - SettingsRadioGroup Component
 * A group of radio buttons for single selection
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Spacing, Typography } from '../../theme';
import Icon, { IconName } from '../Icon';

interface RadioOption {
  value: string;
  label: string;
  hint?: string;
  icon?: IconName;
  disabled?: boolean;
}

interface SettingsRadioGroupProps {
  label?: string;
  hint?: string;
  icon?: IconName;
  options: RadioOption[];
  value: string;
  onValueChange: (value: string) => void;
  style?: ViewStyle;
}

const SettingsRadioGroup: React.FC<SettingsRadioGroupProps> = ({
  label,
  hint,
  icon,
  options,
  value,
  onValueChange,
  style,
}) => {
  return (
    <View style={[styles.container, style]}>
      {label && (
        <View style={styles.labelRow}>
          {icon && <Icon name={icon} size={18} color={Colors.textSecondary} style={styles.icon} />}
          <Text style={styles.label}>{label}</Text>
        </View>
      )}
      {hint && <Text style={styles.hint}>{hint}</Text>}
      
      <View style={styles.optionsContainer}>
        {options.map((option) => {
          const isSelected = value === option.value;
          const isDisabled = option.disabled;
          
          return (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.option,
                isSelected && styles.optionSelected,
                isDisabled && styles.optionDisabled,
              ]}
              onPress={() => !isDisabled && onValueChange(option.value)}
              activeOpacity={isDisabled ? 1 : 0.7}
            >
              <View style={[styles.radioCircle, isSelected && styles.radioCircleSelected]}>
                {isSelected && <View style={styles.radioCircleFilled} />}
              </View>
              <View style={styles.optionTextContainer}>
                <View style={styles.optionLabelRow}>
                  {option.icon && <Icon name={option.icon} size={16} color={isDisabled ? Colors.textDisabled : Colors.textSecondary} style={styles.optionIcon} />}
                  <Text style={[styles.optionLabel, isDisabled && styles.optionLabelDisabled]}>
                    {option.label}
                  </Text>
                </View>
                {option.hint && (
                  <Text style={[styles.optionHint, isDisabled && styles.optionHintDisabled]}>
                    {option.hint}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
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
  hint: {
    ...Typography.hint,
    marginBottom: Spacing.md,
  },
  optionsContainer: {
    gap: Spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    backgroundColor: Colors.surfaceVariant,
    borderRadius: Spacing.inputRadius,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  optionSelected: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  optionDisabled: {
    opacity: 0.5,
  },
  radioCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.textHint,
    marginRight: Spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioCircleSelected: {
    borderColor: Colors.primary,
  },
  radioCircleFilled: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.primary,
  },
  optionTextContainer: {
    flex: 1,
  },
  optionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionIcon: {
    marginRight: Spacing.sm,
  },
  optionLabel: {
    ...Typography.label,
  },
  optionLabelDisabled: {
    color: Colors.textDisabled,
  },
  optionHint: {
    ...Typography.hint,
    marginTop: 2,
  },
  optionHintDisabled: {
    color: Colors.textDisabled,
  },
});

export default SettingsRadioGroup;
