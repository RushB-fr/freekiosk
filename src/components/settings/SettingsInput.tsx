/**
 * FreeKiosk v1.2 - SettingsInput Component
 * A text input with label and validation
 */

import React, { useState, useEffect, useRef } from 'react';
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
  // For secure text entry, we manage our own display value with last char visible
  const [displayValue, setDisplayValue] = useState<string>('');
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync display value when value changes externally (e.g., reset to empty)
  useEffect(() => {
    if (secureTextEntry) {
      if (value.length === 0) {
        setDisplayValue('');
      }
    }
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, [value, secureTextEntry]);

  const handleSecureTextChange = (text: string): void => {
    // Clear any pending timeout
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }

    // Detect if user is typing or deleting
    const currentRealLength = value.length;
    const newDisplayLength = text.length;

    let newRealValue: string;

    if (newDisplayLength > currentRealLength) {
      // User typed a new character - get the last char from display
      const newChar = text.slice(-1);
      newRealValue = value + newChar;
    } else if (newDisplayLength < currentRealLength) {
      // User deleted characters
      newRealValue = value.slice(0, newDisplayLength);
    } else {
      // Same length - could be a replacement, use existing value
      newRealValue = value;
    }

    onChangeText(newRealValue);

    if (newRealValue.length === 0) {
      setDisplayValue('');
      return;
    }

    // Show masked value with last character visible
    const masked = '•'.repeat(Math.max(0, newRealValue.length - 1)) + newRealValue.slice(-1);
    setDisplayValue(masked);

    // After 500ms, mask the last character too
    hideTimeoutRef.current = setTimeout(() => {
      setDisplayValue('•'.repeat(newRealValue.length));
    }, 500);
  };

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
        value={secureTextEntry ? displayValue : value}
        onChangeText={secureTextEntry ? handleSecureTextChange : onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.textHint}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        maxLength={maxLength}
        editable={!disabled}
        multiline={multiline}
        onBlur={onBlur}
        cursorColor={Colors.primary}
        selectionColor={Colors.primaryLight}
        caretHidden={false}
        underlineColorAndroid="transparent"
        autoCorrect={false}
        spellCheck={false}
        textContentType="none"
        importantForAutofill="no"
        autoComplete="off"
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
    minHeight: Spacing.inputHeight,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Spacing.inputRadius,
    paddingHorizontal: Spacing.inputPadding,
    paddingVertical: Spacing.sm,
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
