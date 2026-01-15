/**
 * FreeKiosk v1.2 - SettingsInput Component
 * A text input with label and validation
 */

import React from 'react';
import { View, Text, TextInput, StyleSheet, ViewStyle, KeyboardTypeOptions } from 'react-native';
import { Colors, Spacing, Typography } from '../../theme';
import Icon, { IconName } from '../Icon';

interface SettingsInputProps {
  label: string;
  hint?: string;
  icon?: IconName;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  maxLength?: number;
  disabled?: boolean;
  error?: string;
  style?: ViewStyle;
  inputStyle?: ViewStyle;
  multiline?: boolean;
  onBlur?: () => void;
}

const SettingsInput: React.FC<SettingsInputProps> = ({
  label,
  hint,
  icon,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  secureTextEntry = false,
  autoCapitalize = 'none',
  maxLength,
  disabled = false,
  error,
  style,
  inputStyle,
  multiline = false,
  onBlur,
}) => {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.labelRow}>
        {icon && <Icon name={icon} size={18} color={disabled ? Colors.textDisabled : Colors.textSecondary} style={styles.icon} />}
        <Text style={[styles.label, disabled && styles.labelDisabled]}>{label}</Text>
      </View>
      
      <TextInput
        style={[
          styles.input,
          disabled && styles.inputDisabled,
          error && styles.inputError,
          multiline && styles.inputMultiline,
          inputStyle,
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.textHint}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        maxLength={maxLength}
        editable={!disabled}
        multiline={multiline}
        onBlur={onBlur}
      />
      
      {error && <Text style={styles.error}>{error}</Text>}
      {hint && !error && <Text style={[styles.hint, disabled && styles.hintDisabled]}>{hint}</Text>}
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
  input: {
    height: Spacing.inputHeight,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Spacing.inputRadius,
    paddingHorizontal: Spacing.inputPadding,
    fontSize: 16,
    backgroundColor: Colors.surfaceVariant,
    color: Colors.textPrimary,
  },
  inputDisabled: {
    backgroundColor: Colors.borderLight,
    color: Colors.textDisabled,
  },
  inputError: {
    borderColor: Colors.error,
    borderWidth: 2,
  },
  inputMultiline: {
    height: 100,
    textAlignVertical: 'top',
    paddingTop: Spacing.md,
  },
  hint: {
    ...Typography.hint,
    marginTop: Spacing.xs,
  },
  hintDisabled: {
    color: Colors.textDisabled,
  },
  error: {
    ...Typography.hint,
    color: Colors.error,
    marginTop: Spacing.xs,
  },
});

export default SettingsInput;
