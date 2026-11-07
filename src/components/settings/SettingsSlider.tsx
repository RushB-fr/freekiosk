/**
 * FreeKiosk v1.2 - SettingsSlider Component
 * A slider with value display and optional presets
 * 
 * Uses local state during drag to avoid StackOverflowError on Android 8.x
 * caused by infinite onProgressChanged loop in @react-native-community/slider.
 * The parent state is only updated via onSlidingComplete, or once the value has stopped changing
 * for COMMIT_DELAY_MS: a D-pad (Android TV) moves the thumb without ever ending a "slide", so
 * onSlidingComplete never comes and the value would be lost on Save.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import Slider from '@react-native-community/slider';
import { Colors, Spacing, Typography } from '../../theme';
import Icon, { IconName } from '../Icon';

/** How long the thumb must stay still before its value is handed to the parent without a touch. */
const COMMIT_DELAY_MS = 400;

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
  // Local state to decouple slider from parent during drag.
  // This prevents the infinite native onProgressChanged loop on Android 8.x
  // where setProgress() triggers onProgressChanged which calls setProgress() again.
  const [localValue, setLocalValue] = useState(value);
  const isSlidingRef = useRef(false);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingValueRef = useRef<number | null>(null);
  // The callback of the latest render, so a timer or an unmount never calls a stale one
  const onValueChangeRef = useRef(onValueChange);
  onValueChangeRef.current = onValueChange;

  const clearCommitTimer = useCallback(() => {
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
  }, []);

  // Leaving with a change still waiting (the slider is hidden, the screen closes): hand it over
  useEffect(() => () => {
    clearCommitTimer();
    if (pendingValueRef.current !== null) {
      const pending = pendingValueRef.current;
      pendingValueRef.current = null;
      onValueChangeRef.current(pending);
    }
  }, [clearCommitTimer]);

  // Sync local state when parent value changes (but not during active drag)
  useEffect(() => {
    if (!isSlidingRef.current) {
      setLocalValue(value);
    }
  }, [value]);

  const handleValueChange = useCallback((val: number) => {
    isSlidingRef.current = true;
    setLocalValue(val);
    // No onSlidingComplete follows a D-pad press: commit when the value stops changing
    pendingValueRef.current = val;
    clearCommitTimer();
    commitTimerRef.current = setTimeout(() => {
      commitTimerRef.current = null;
      pendingValueRef.current = null;
      isSlidingRef.current = false;
      onValueChangeRef.current(val);
    }, COMMIT_DELAY_MS);
  }, [clearCommitTimer]);

  const handleSlidingComplete = useCallback((val: number) => {
    clearCommitTimer();
    pendingValueRef.current = null;
    isSlidingRef.current = false;
    setLocalValue(val);
    onValueChange(val);
  }, [onValueChange, clearCommitTimer]);

  const displayValue = formatValue 
    ? formatValue(localValue) 
    : `${Math.round(localValue * 100)}${unit}`;

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
                localValue === preset.value && styles.presetButtonActive,
              ]}
              onPress={() => !disabled && onValueChange(preset.value)}
              disabled={disabled}
            >
              <Text
                style={[
                  styles.presetButtonText,
                  localValue === preset.value && styles.presetButtonTextActive,
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
          value={localValue}
          onValueChange={handleValueChange}
          onSlidingComplete={handleSlidingComplete}
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
