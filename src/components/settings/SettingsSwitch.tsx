/**
 * FreeKiosk v1.2 - SettingsSwitch Component
 * A toggle switch with label and hint text
 */

import React from 'react';
import { View, Text, Switch, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Spacing, Typography } from '../../theme';
import Icon, { IconName } from '../Icon';

interface SettingsSwitchProps {
  label: string;
  hint?: string;
  icon?: IconName;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  style?: ViewStyle;
}

const SettingsSwitch: React.FC<SettingsSwitchProps> = ({
  label,
  hint,
  icon,
  value,
  onValueChange,
  disabled = false,
  style,
}) => {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.textContainer}>
        <View style={styles.labelRow}>
          {icon && <Icon name={icon} size={18} color={disabled ? Colors.textDisabled : Colors.textSecondary} style={styles.icon} />}
          <Text style={[styles.label, disabled && styles.labelDisabled]}>{label}</Text>
        </View>
        {hint && <Text style={[styles.hint, disabled && styles.hintDisabled]}>{hint}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: Colors.switchTrackOff, true: Colors.switchTrackOn }}
        thumbColor={value ? Colors.primary : Colors.switchThumbOff}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
  },
  textContainer: {
    flex: 1,
    marginRight: Spacing.md,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
    marginTop: Spacing.xs,
  },
  hintDisabled: {
    color: Colors.textDisabled,
  },
});

export default SettingsSwitch;
