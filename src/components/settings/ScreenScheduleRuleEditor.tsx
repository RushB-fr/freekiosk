/**
 * FreeKiosk v1.3 - ScreenScheduleRuleEditor Component
 * Modal editor for creating/editing screen schedule rules
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { Colors, Spacing, Typography } from '../../theme';
import Icon from '../Icon';
import DaySelector from './DaySelector';
import TimeInput from './TimeInput';
import {
  ScreenScheduleRule,
  generateRuleId,
  isValidTime,
  createDefaultRule,
} from '../../types/screenScheduler';

interface ScreenScheduleRuleEditorProps {
  visible: boolean;
  rule: ScreenScheduleRule | null; // null = new rule
  onSave: (rule: ScreenScheduleRule) => void;
  onCancel: () => void;
}

const ScreenScheduleRuleEditor: React.FC<ScreenScheduleRuleEditorProps> = ({
  visible,
  rule,
  onSave,
  onCancel,
}) => {
  const [name, setName] = useState('');
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [sleepTime, setSleepTime] = useState('22:00');
  const [wakeTime, setWakeTime] = useState('07:00');
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (visible) {
      if (rule) {
        // Editing existing rule
        setName(rule.name);
        setDays(rule.days);
        setSleepTime(rule.sleepTime);
        setWakeTime(rule.wakeTime);
        setEnabled(rule.enabled);
      } else {
        // New rule — use defaults
        const defaultRule = createDefaultRule();
        setName(defaultRule.name);
        setDays(defaultRule.days);
        setSleepTime(defaultRule.sleepTime);
        setWakeTime(defaultRule.wakeTime);
        setEnabled(true);
      }
    }
  }, [visible, rule]);

  const handleSave = () => {
    // Validation
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a rule name');
      return;
    }

    if (days.length === 0) {
      Alert.alert('Error', 'Please select at least one day');
      return;
    }

    if (!isValidTime(sleepTime)) {
      Alert.alert('Error', 'Please enter a valid sleep time (HH:MM)');
      return;
    }

    if (!isValidTime(wakeTime)) {
      Alert.alert('Error', 'Please enter a valid wake time (HH:MM)');
      return;
    }

    if (sleepTime === wakeTime) {
      Alert.alert('Error', 'Sleep time and wake time cannot be the same');
      return;
    }

    const savedRule: ScreenScheduleRule = {
      id: rule?.id || generateRuleId(),
      name: name.trim(),
      enabled,
      days,
      sleepTime,
      wakeTime,
    };

    onSave(savedRule);
  };

  const crossesMidnight = sleepTime > wakeTime && isValidTime(sleepTime) && isValidTime(wakeTime);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>
            {rule ? 'Edit Schedule Rule' : 'New Schedule Rule'}
          </Text>
          <TouchableOpacity onPress={onCancel} style={styles.closeButton}>
            <Icon name="close" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
          {/* Rule Name */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Rule Name</Text>
            <TextInput
              style={styles.textInput}
              value={name}
              onChangeText={setName}
              placeholder="e.g., Night, Weekend"
              placeholderTextColor={Colors.textDisabled}
              maxLength={30}
            />
          </View>

          {/* Days */}
          <View style={styles.field}>
            <DaySelector
              selectedDays={days}
              onDaysChange={setDays}
            />
          </View>

          {/* Sleep Time (screen OFF) */}
          <View style={styles.field}>
            <TimeInput
              label="Screen OFF at"
              value={sleepTime}
              onChange={setSleepTime}
              placeholder="22:00"
            />
          </View>

          {/* Wake Time (screen ON) */}
          <View style={styles.field}>
            <TimeInput
              label="Screen ON at"
              value={wakeTime}
              onChange={setWakeTime}
              placeholder="07:00"
            />
          </View>

          {/* Midnight crossing info */}
          {crossesMidnight && (
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                This rule crosses midnight. The screen will turn off at {sleepTime} and back on at {wakeTime} the next day.
              </Text>
            </View>
          )}

          {/* Preview */}
          {isValidTime(sleepTime) && isValidTime(wakeTime) && days.length > 0 && (
            <View style={styles.previewBox}>
              <Text style={styles.previewTitle}>Preview</Text>
              <Text style={styles.previewText}>
                Screen OFF: {sleepTime} → Screen ON: {wakeTime}
              </Text>
              <Text style={styles.previewText}>
                Active on: {days.length === 7 ? 'Every day' :
                  days.length === 5 && !days.includes(0) && !days.includes(6) ? 'Weekdays' :
                  days.length === 2 && days.includes(0) && days.includes(6) ? 'Weekends' :
                  days.sort((a, b) => a - b).map(d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')
                }
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Action Buttons */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
            <Text style={styles.saveButtonText}>
              {rule ? 'Update' : 'Add Rule'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
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
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  title: {
    ...Typography.sectionTitle,
    fontSize: 20,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.divider,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    fontSize: 18,
    color: Colors.textPrimary,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  field: {
    marginBottom: Spacing.sm,
  },
  fieldLabel: {
    ...Typography.label,
    marginBottom: Spacing.xs,
  },
  textInput: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.divider,
    borderRadius: 8,
    padding: Spacing.md,
    fontSize: 16,
    color: Colors.textPrimary,
  },
  infoBox: {
    backgroundColor: Colors.warningLight || '#FFF3E0',
    borderRadius: 8,
    padding: Spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: Colors.warning || '#FF9800',
  },
  infoText: {
    ...Typography.body,
    color: Colors.warningDark || '#E65100',
    fontSize: 14,
  },
  previewBox: {
    backgroundColor: Colors.infoLight || '#E3F2FD',
    borderRadius: 8,
    padding: Spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: Colors.info || '#2b7fff',
  },
  previewTitle: {
    ...Typography.label,
    color: Colors.infoDark || '#0D47A1',
    marginBottom: 4,
  },
  previewText: {
    ...Typography.body,
    color: Colors.infoDark || '#0D47A1',
    fontSize: 14,
  },
  footer: {
    flexDirection: 'row',
    padding: Spacing.lg,
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: Colors.divider,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  saveButton: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.textOnPrimary,
  },
});

export default ScreenScheduleRuleEditor;
