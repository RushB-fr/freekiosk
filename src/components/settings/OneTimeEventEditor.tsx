/**
 * FreeKiosk v1.2 - OneTimeEventEditor Component
 * Modal for creating/editing one-time dated events
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Colors, Spacing, Typography } from '../../theme';
import Icon from '../Icon';
import { ScheduledEvent, generateEventId, isValidTime, isValidDate, PRIORITY_LEVELS } from '../../types/planner';
import { SettingsInput, SettingsSwitch } from './index';
import DateInput from './DateInput';
import TimeInput from './TimeInput';
import { useTranslation } from 'react-i18next';

interface OneTimeEventEditorProps {
  visible: boolean;
  event: ScheduledEvent | null; // null for new event
  onSave: (event: ScheduledEvent) => void;
  onCancel: () => void;
  existingEvents: ScheduledEvent[];
}

const OneTimeEventEditor: React.FC<OneTimeEventEditorProps> = ({
  visible,
  event,
  onSave,
  onCancel,
  existingEvents,
}) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [priority, setPriority] = useState(2); // Default higher priority for one-time
  const [enabled, setEnabled] = useState(true);

  // Get today's date in YYYY-MM-DD format
  const getTodayDate = (): string => {
    return new Date().toISOString().split('T')[0];
  };

  // Reset form when modal opens
  useEffect(() => {
    if (visible) {
      if (event) {
        // Editing existing event
        setName(event.name);
        setUrl(event.url);
        setStartDate(event.startDate || getTodayDate());
        setEndDate(event.endDate || event.startDate || getTodayDate());
        setAllDay(event.allDay ?? true);
        setStartTime(event.startTime || '09:00');
        setEndTime(event.endTime || '18:00');
        setPriority(event.priority);
        setEnabled(event.enabled);
      } else {
        // New event - reset to defaults
        const today = getTodayDate();
        setName('');
        setUrl('');
        setStartDate(today);
        setEndDate(today);
        setAllDay(true);
        setStartTime('09:00');
        setEndTime('18:00');
        setPriority(2);
        setEnabled(true);
      }
    }
  }, [visible, event]);

  const normalizeUrl = (input: string): string => {
    let normalized = input.trim();
    if (normalized && !normalized.match(/^https?:\/\//i)) {
      normalized = 'https://' + normalized;
    }
    return normalized;
  };

  const validate = (): string | null => {
    if (!name.trim()) {
      return t('components.oneTimeEventEditor.errorEnterName');
    }
    if (!url.trim()) {
      return t('components.oneTimeEventEditor.errorEnterUrl');
    }
    if (!isValidDate(startDate)) {
      return t('components.oneTimeEventEditor.errorInvalidStartDate');
    }
    if (!isValidDate(endDate)) {
      return t('components.oneTimeEventEditor.errorInvalidEndDate');
    }
    if (endDate < startDate) {
      return t('components.oneTimeEventEditor.errorEndBeforeStart');
    }
    if (!allDay) {
      if (!isValidTime(startTime)) {
        return t('components.oneTimeEventEditor.errorInvalidStartTime');
      }
      if (!isValidTime(endTime)) {
        return t('components.oneTimeEventEditor.errorInvalidEndTime');
      }
      if (startDate === endDate && startTime >= endTime) {
        return t('components.oneTimeEventEditor.errorEndTimeAfterStart');
      }
    }
    return null;
  };

  const handleSave = () => {
    const error = validate();
    if (error) {
      Alert.alert(t('components.oneTimeEventEditor.validationErrorTitle'), error);
      return;
    }

    const normalizedUrl = normalizeUrl(url);
    
    const savedEvent: ScheduledEvent = {
      id: event?.id || generateEventId(),
      type: 'oneTime',
      name: name.trim(),
      url: normalizedUrl,
      startDate,
      endDate,
      allDay,
      startTime: allDay ? undefined : startTime,
      endTime: allDay ? undefined : endTime,
      priority,
      enabled,
    };

    onSave(savedEvent);
  };

  // Sync endDate when startDate changes (if endDate is before startDate)
  useEffect(() => {
    if (startDate && endDate && endDate < startDate) {
      setEndDate(startDate);
    }
  }, [startDate]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={onCancel} style={styles.headerButton}>
            <Text style={styles.cancelText}>{t('components.oneTimeEventEditor.cancel')}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {event ? t('components.oneTimeEventEditor.editTitle') : t('components.oneTimeEventEditor.newTitle')}
          </Text>
          <TouchableOpacity onPress={handleSave} style={styles.headerButton}>
            <Text style={styles.saveText}>{t('components.oneTimeEventEditor.save')}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('components.oneTimeEventEditor.eventDetails')}</Text>

            <SettingsInput
              label={t('components.oneTimeEventEditor.eventName')}
              value={name}
              onChangeText={setName}
              placeholder={t('components.oneTimeEventEditor.eventNamePlaceholder')}
            />

            <View style={styles.spacer} />

            <SettingsInput
              label={t('components.oneTimeEventEditor.urlToDisplay')}
              value={url}
              onChangeText={setUrl}
              placeholder={t('components.oneTimeEventEditor.urlPlaceholder')}
              keyboardType="url"
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('components.oneTimeEventEditor.dateRange')}</Text>

            <View style={styles.dateRow}>
              <DateInput
                label={t('components.oneTimeEventEditor.startDate')}
                value={startDate}
                onChange={setStartDate}
              />
              <View style={styles.dateSpacer} />
              <DateInput
                label={t('components.oneTimeEventEditor.endDate')}
                value={endDate}
                onChange={setEndDate}
                minDate={startDate}
              />
            </View>

            <View style={styles.spacer} />

            <SettingsSwitch
              label={t('components.oneTimeEventEditor.allDay')}
              hint={t('components.oneTimeEventEditor.allDayHint')}
              value={allDay}
              onValueChange={setAllDay}
            />

            {!allDay && (
              <View style={styles.timeRow}>
                <TimeInput
                  label={t('components.oneTimeEventEditor.startTime')}
                  value={startTime}
                  onChange={setStartTime}
                />
                <View style={styles.timeSpacer} />
                <TimeInput
                  label={t('components.oneTimeEventEditor.endTime')}
                  value={endTime}
                  onChange={setEndTime}
                />
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('components.oneTimeEventEditor.options')}</Text>

            <Text style={styles.label}>{t('components.oneTimeEventEditor.priorityLabel')}</Text>
            <View style={styles.priorityRow}>
              {PRIORITY_LEVELS.map(level => (
                <TouchableOpacity
                  key={level.value}
                  style={[
                    styles.priorityButton,
                    priority === level.value && styles.priorityButtonSelected,
                  ]}
                  onPress={() => setPriority(level.value)}
                >
                  <Text style={[
                    styles.priorityText,
                    priority === level.value && styles.priorityTextSelected,
                  ]}>
                    {level.value}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.priorityHint}>
              {t('components.oneTimeEventEditor.priorityHint')}
            </Text>

            <View style={styles.spacer} />

            <TouchableOpacity
              style={styles.enabledRow}
              onPress={() => setEnabled(!enabled)}
            >
              <Text style={styles.label}>{t('components.oneTimeEventEditor.eventEnabled')}</Text>
              <Icon name={enabled ? 'checkbox-marked' : 'checkbox-blank-outline'} size={22} color={enabled ? Colors.primary : Colors.textHint} style={styles.enabledIcon} />
            </TouchableOpacity>
          </View>

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerButton: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  headerTitle: {
    ...Typography.sectionTitle,
  },
  cancelText: {
    ...Typography.body,
    color: Colors.textSecondary,
  },
  saveText: {
    ...Typography.body,
    color: Colors.primary,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.md,
  },
  section: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  sectionTitle: {
    ...Typography.label,
    marginBottom: Spacing.md,
    color: Colors.primary,
  },
  spacer: {
    height: Spacing.md,
  },
  dateRow: {
    flexDirection: 'row',
  },
  dateSpacer: {
    width: Spacing.md,
  },
  timeRow: {
    flexDirection: 'row',
    marginTop: Spacing.md,
  },
  timeSpacer: {
    width: Spacing.md,
  },
  label: {
    ...Typography.label,
    marginBottom: Spacing.xs,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  priorityButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  priorityButtonSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  priorityText: {
    ...Typography.body,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  priorityTextSelected: {
    color: '#FFFFFF',
  },
  priorityHint: {
    ...Typography.caption,
    color: Colors.textHint,
    marginTop: Spacing.xs,
  },
  enabledRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  enabledIcon: {
    fontSize: 24,
  },
  bottomSpacer: {
    height: 40,
  },
});

export default OneTimeEventEditor;
