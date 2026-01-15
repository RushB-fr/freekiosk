/**
 * FreeKiosk v1.2 - SettingsModeSelector Component
 * A segmented control for mode selection (WebView/External App)
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Spacing, Typography } from '../../theme';
import Icon, { IconName } from '../Icon';

interface ModeOption {
  value: string;
  label: string;
  icon?: IconName;
  badge?: string;
  badgeColor?: string;
}

interface SettingsModeSelectorProps {
  label?: string;
  hint?: string;
  options: ModeOption[];
  value: string;
  onValueChange: (value: string) => void;
  style?: ViewStyle;
}

const SettingsModeSelector: React.FC<SettingsModeSelectorProps> = ({
  label,
  hint,
  options,
  value,
  onValueChange,
  style,
}) => {
  return (
    <View style={[styles.container, style]}>
      {label && <Text style={styles.label}>{label}</Text>}
      
      <View style={styles.selectorContainer}>
        {options.map((option) => {
          const isSelected = value === option.value;
          
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.option, isSelected && styles.optionSelected]}
              onPress={() => onValueChange(option.value)}
              activeOpacity={0.8}
            >
              <View style={styles.optionContent}>
                {option.icon && (
                  <Icon 
                    name={option.icon} 
                    size={18} 
                    color={isSelected ? Colors.textOnPrimary : Colors.textSecondary} 
                    style={styles.optionIcon}
                  />
                )}
                <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                  {option.label}
                </Text>
              </View>
              
              {option.badge && (
                <View style={[styles.badge, { backgroundColor: option.badgeColor || Colors.warning }]}>
                  <Text style={styles.badgeText}>{option.badge}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
      
      {hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  label: {
    ...Typography.label,
    marginBottom: Spacing.sm,
  },
  selectorContainer: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  option: {
    flex: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: Spacing.inputRadius,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    position: 'relative',
  },
  optionSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionIcon: {
    marginRight: 6,
  },
  optionText: {
    ...Typography.label,
    color: Colors.textSecondary,
  },
  optionTextSelected: {
    color: Colors.textOnPrimary,
  },
  badge: {
    position: 'absolute',
    top: -8,
    right: -8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.surface,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: Colors.textOnPrimary,
    letterSpacing: 0.5,
  },
  hint: {
    ...Typography.hint,
    marginTop: Spacing.sm,
  },
});

export default SettingsModeSelector;
