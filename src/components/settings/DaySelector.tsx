/**
 * FreeKiosk v1.2 - DaySelector Component
 * Select days of the week for recurring events
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Spacing, Typography } from '../../theme';
import { useTranslation } from 'react-i18next';

interface DaySelectorProps {
  selectedDays: number[];
  onDaysChange: (days: number[]) => void;
  disabled?: boolean;
}

const DaySelector: React.FC<DaySelectorProps> = ({
  selectedDays,
  onDaysChange,
  disabled = false,
}) => {
  const { t } = useTranslation();

  const DAYS = [
    { index: 0, short: t('components.daySelector.day0') },
    { index: 1, short: t('components.daySelector.day1') },
    { index: 2, short: t('components.daySelector.day2') },
    { index: 3, short: t('components.daySelector.day3') },
    { index: 4, short: t('components.daySelector.day4') },
    { index: 5, short: t('components.daySelector.day5') },
    { index: 6, short: t('components.daySelector.day6') },
  ];

  const toggleDay = (dayIndex: number) => {
    if (disabled) return;
    
    if (selectedDays.includes(dayIndex)) {
      onDaysChange(selectedDays.filter(d => d !== dayIndex));
    } else {
      onDaysChange([...selectedDays, dayIndex].sort((a, b) => a - b));
    }
  };

  const selectWeekdays = () => {
    if (disabled) return;
    onDaysChange([1, 2, 3, 4, 5]);
  };

  const selectWeekends = () => {
    if (disabled) return;
    onDaysChange([0, 6]);
  };

  const selectAll = () => {
    if (disabled) return;
    onDaysChange([0, 1, 2, 3, 4, 5, 6]);
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.label, disabled && styles.labelDisabled]}>{t('components.daySelector.days')}</Text>
      
      <View style={styles.daysRow}>
        {DAYS.map(day => {
          const isSelected = selectedDays.includes(day.index);
          return (
            <TouchableOpacity
              key={day.index}
              style={[
                styles.dayButton,
                isSelected && styles.dayButtonSelected,
                disabled && styles.dayButtonDisabled,
              ]}
              onPress={() => toggleDay(day.index)}
              disabled={disabled}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.dayText,
                  isSelected && styles.dayTextSelected,
                  disabled && styles.dayTextDisabled,
                ]}
              >
                {day.short}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.quickSelectRow}>
        <TouchableOpacity
          style={[styles.quickButton, disabled && styles.quickButtonDisabled]}
          onPress={selectWeekdays}
          disabled={disabled}
        >
          <Text style={[styles.quickText, disabled && styles.quickTextDisabled]}>
            {t('components.daySelector.weekdays')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.quickButton, disabled && styles.quickButtonDisabled]}
          onPress={selectWeekends}
          disabled={disabled}
        >
          <Text style={[styles.quickText, disabled && styles.quickTextDisabled]}>
            {t('components.daySelector.weekends')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.quickButton, disabled && styles.quickButtonDisabled]}
          onPress={selectAll}
          disabled={disabled}
        >
          <Text style={[styles.quickText, disabled && styles.quickTextDisabled]}>
            {t('components.daySelector.everyDay')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: Spacing.sm,
  },
  label: {
    ...Typography.label,
    marginBottom: Spacing.sm,
  },
  labelDisabled: {
    color: Colors.textDisabled,
  },
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  dayButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayButtonSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  dayButtonDisabled: {
    opacity: 0.5,
  },
  dayText: {
    ...Typography.body,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  dayTextSelected: {
    color: '#FFFFFF',
  },
  dayTextDisabled: {
    color: Colors.textDisabled,
  },
  quickSelectRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: Spacing.sm,
  },
  quickButton: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: Colors.surfaceVariant,
  },
  quickButtonDisabled: {
    opacity: 0.5,
  },
  quickText: {
    ...Typography.caption,
    color: Colors.primary,
  },
  quickTextDisabled: {
    color: Colors.textDisabled,
  },
});

export default DaySelector;
