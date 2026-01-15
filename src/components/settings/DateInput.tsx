/**
 * FreeKiosk v1.2 - DateInput Component
 * Input for date in YYYY-MM-DD format with display formatting
 */

import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Colors, Spacing, Typography } from '../../theme';

interface DateInputProps {
  label: string;
  value: string; // YYYY-MM-DD format
  onChange: (date: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  minDate?: string; // YYYY-MM-DD
}

const DateInput: React.FC<DateInputProps> = ({
  label,
  value,
  onChange,
  placeholder = 'YYYY-MM-DD',
  disabled = false,
  error,
  minDate,
}) => {
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    setDisplayValue(value);
  }, [value]);

  const formatDateInput = (text: string): string => {
    // Remove non-numeric characters except dash
    let cleaned = text.replace(/[^0-9-]/g, '');
    
    // Auto-add dashes
    const digits = cleaned.replace(/-/g, '');
    if (digits.length >= 4 && !cleaned.includes('-')) {
      cleaned = digits.substring(0, 4) + '-' + digits.substring(4);
    }
    if (digits.length >= 6) {
      const parts = cleaned.split('-');
      if (parts.length === 2 && parts[1].length > 2) {
        cleaned = parts[0] + '-' + parts[1].substring(0, 2) + '-' + parts[1].substring(2);
      }
    }
    
    // Limit to 10 characters (YYYY-MM-DD)
    if (cleaned.length > 10) {
      cleaned = cleaned.substring(0, 10);
    }
    
    return cleaned;
  };

  const isValidDate = (date: string): boolean => {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(date)) return false;
    
    const d = new Date(date);
    if (isNaN(d.getTime())) return false;
    
    // Check if date matches input (handles invalid dates like 2024-02-31)
    const [year, month, day] = date.split('-').map(Number);
    return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
  };

  const validateAndUpdate = (text: string) => {
    const formatted = formatDateInput(text);
    setDisplayValue(formatted);
    
    if (isValidDate(formatted)) {
      onChange(formatted);
    }
  };

  const handleBlur = () => {
    if (displayValue && isValidDate(displayValue)) {
      onChange(displayValue);
    }
  };

  const getDisplayDate = (): string => {
    if (!value || !isValidDate(value)) return '';
    const d = new Date(value);
    return d.toLocaleDateString('en-US', { 
      day: 'numeric', 
      month: 'short', 
      year: 'numeric' 
    });
  };

  const isDateBeforeMin = (): boolean => {
    if (!minDate || !value || !isValidDate(value)) return false;
    return value < minDate;
  };

  const hasError = error || 
    (displayValue.length === 10 && !isValidDate(displayValue)) ||
    isDateBeforeMin();

  const getErrorMessage = (): string => {
    if (error) return error;
    if (displayValue.length === 10 && !isValidDate(displayValue)) {
      return 'Invalid date';
    }
    if (isDateBeforeMin()) {
      return 'Date cannot be before start date';
    }
    return '';
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.label, disabled && styles.labelDisabled]}>{label}</Text>
      <View style={styles.inputWrapper}>
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
          maxLength={10}
          editable={!disabled}
        />
        {value && isValidDate(value) && (
          <Text style={styles.displayDate}>{getDisplayDate()}</Text>
        )}
      </View>
      {hasError && (
        <Text style={styles.errorText}>{getErrorMessage()}</Text>
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
  inputWrapper: {
    position: 'relative',
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
  },
  inputDisabled: {
    backgroundColor: Colors.surfaceVariant,
    color: Colors.textDisabled,
  },
  inputError: {
    borderColor: Colors.error,
  },
  displayDate: {
    ...Typography.caption,
    color: Colors.textSecondary,
    position: 'absolute',
    right: Spacing.md,
    top: '50%',
    transform: [{ translateY: -7 }],
  },
  errorText: {
    ...Typography.caption,
    color: Colors.error,
    marginTop: 4,
  },
});

export default DateInput;
