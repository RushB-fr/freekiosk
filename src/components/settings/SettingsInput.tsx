/**
 * FreeKiosk v1.2 - SettingsInput Component
 * A text input with label and validation
 */

import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, ViewStyle, KeyboardTypeOptions, Platform } from 'react-native';
import { Colors, Spacing, Typography } from '../../theme';
import Icon, { IconName } from '../Icon';
import { TV_FOCUS_COLOR } from '../tv/tvFocus';

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
  onFocus?: () => void;
  /** Take the focus when the field appears (Android TV: nothing is focused until the remote moves). */
  autoFocus?: boolean;
}

// Uses native secureTextEntry for password masking - no manual bullet management.
// Custom bullet masking (•) caused extra characters on certain Android keyboards
// (Samsung, Gboard predictive text, autocorrect, paste) because it reconstructed
// the real value from display text lengths, which breaks with composing input.
// This is the same fix applied to PinInput in v1.2.5.
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
  onFocus,
  autoFocus = false,
}) => {
  // On a TV the remote moves the focus between fields; without this outline there is no
  // way to tell which field a key press will type into.
  const [focused, setFocused] = useState(false);
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
          Platform.isTV && focused && styles.inputTvFocused,
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
        onBlur={() => { setFocused(false); onBlur?.(); }}
        onFocus={() => { setFocused(true); onFocus?.(); }}
        autoFocus={autoFocus}
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
  inputTvFocused: {
    borderColor: TV_FOCUS_COLOR,
    borderWidth: 4,
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
