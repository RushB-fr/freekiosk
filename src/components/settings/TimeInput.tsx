/**
 * FreeKiosk v1.2 - TimeInput Component
 * Input for time in HH:MM format
 */

import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Colors, Spacing, Typography } from '../../theme';

interface TimeInputProps {
  label: string;
  value: string;
  onChange: (time: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
}

const TimeInput: React.FC<TimeInputProps> = ({
  label,
  value,
  onChange,
  placeholder = '00:00',
  disabled = false,
  error,
}) => {
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    setDisplayValue(value);
  }, [value]);

  const formatTimeInput = (text: string): string => {
    // Remove non-numeric characters except colon
    let cleaned = text.replace(/[^0-9:]/g, '');
    
    // Handle auto-formatting
    if (cleaned.length === 2 && !cleaned.includes(':') && displayValue.length < text.length) {
      cleaned = cleaned + ':';
    }
    
    // Remove extra colons
    const parts = cleaned.split(':');
    if (parts.length > 2) {
      cleaned = parts[0] + ':' + parts.slice(1).join('');
    }
    
    // Limit to 5 characters (HH:MM)
    if (cleaned.length > 5) {
      cleaned = cleaned.substring(0, 5);
    }
    
    return cleaned;
  };

  const validateAndUpdate = (text: string) => {
    const formatted = formatTimeInput(text);
    setDisplayValue(formatted);
    
    // Only call onChange with valid time
    if (isValidTime(formatted)) {
      onChange(formatted);
    }
  };

  const isValidTime = (time: string): boolean => {
    const regex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
    return regex.test(time);
  };

  const handleBlur = () => {
    // Normalize time on blur (e.g., "9:00" -> "09:00")
    if (displayValue && isValidTime(displayValue)) {
      const [hours, minutes] = displayValue.split(':');
      const normalized = `${hours.padStart(2, '0')}:${minutes}`;
      setDisplayValue(normalized);
      onChange(normalized);
    }
  };

  const hasError = error || (displayValue.length === 5 && !isValidTime(displayValue));

  return (
    <View style={styles.container}>
      <Text style={[styles.label, disabled && styles.labelDisabled]}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          disabled && styles.inputDisabled,
          hasError && styles.inputError,
        ]}
        value={displayValue}
        onChangeText={validateAndUpdate}
        onBlur={handleBlur}
        placeholder={placeholder}
        placeholderTextColor={Colors.textHint}
        keyboardType="numeric"
        maxLength={5}
        editable={!disabled}
      />
      {hasError && (
        <Text style={styles.errorText}>
          {error || 'Invalid time format (use HH:MM)'}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  label: {
    ...Typography.label,
    marginBottom: Spacing.xs,
  },
  labelDisabled: {
    color: Colors.textDisabled,
  },
  input: {
    ...Typography.body,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  inputDisabled: {
    backgroundColor: Colors.surfaceVariant,
    color: Colors.textDisabled,
  },
  inputError: {
    borderColor: Colors.error,
  },
  errorText: {
    ...Typography.caption,
    color: Colors.error,
    marginTop: 4,
  },
});

export default TimeInput;
