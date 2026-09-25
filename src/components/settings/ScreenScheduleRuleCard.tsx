/**
 * FreeKiosk v1.3 - ScreenScheduleRuleCard Component
 * Display a single screen schedule rule with edit/delete/toggle
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Spacing, Typography } from '../../theme';
import Icon from '../Icon';
import { ScreenScheduleRule, getDaysDisplayString } from '../../types/screenScheduler';
import { useTranslation } from 'react-i18next';

interface ScreenScheduleRuleCardProps {
  rule: ScreenScheduleRule;
  onToggle: (id: string, enabled: boolean) => void;
  onEdit: (rule: ScreenScheduleRule) => void;
  onDelete: (id: string) => void;
}

const ScreenScheduleRuleCard: React.FC<ScreenScheduleRuleCardProps> = ({
  rule,
  onToggle,
  onEdit,
  onDelete,
}) => {
  const { t } = useTranslation();
  const daysText = getDaysDisplayString(rule.days);
  
  // Display sleep window with midnight-crossing indicator
  const sleepCrossesMidnight = rule.sleepTime > rule.wakeTime;
  const timeDisplay = `${rule.sleepTime} → ${rule.wakeTime}`;
  
  return (
    <View style={[styles.card, !rule.enabled && styles.cardDisabled]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={[styles.name, !rule.enabled && styles.textDisabled]}>
            {rule.name || t('components.screenScheduleRuleCard.unnamedRule')}
          </Text>
          {sleepCrossesMidnight && (
            <Text style={styles.midnightBadge}>{t('components.screenScheduleRuleCard.overnight')}</Text>
          )}
        </View>
        <TouchableOpacity
          style={[styles.toggleButton, rule.enabled && styles.toggleButtonActive]}
          onPress={() => onToggle(rule.id, !rule.enabled)}
        >
          <Text style={[styles.toggleText, rule.enabled && styles.toggleTextActive]}>
            {rule.enabled ? t('components.screenScheduleRuleCard.on') : t('components.screenScheduleRuleCard.off')}
          </Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.details}>
        <View style={styles.detailRow}>
          <Icon name="clock-outline" size={16} color={rule.enabled ? Colors.textSecondary : Colors.textDisabled} />
          <Text style={[styles.detailText, !rule.enabled && styles.textDisabled]}>
            {timeDisplay}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Icon name="calendar-outline" size={16} color={rule.enabled ? Colors.textSecondary : Colors.textDisabled} />
          <Text style={[styles.detailText, !rule.enabled && styles.textDisabled]}>
            {daysText}
          </Text>
        </View>
      </View>
      
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionButton} onPress={() => onEdit(rule)}>
          <Icon name="pencil" size={18} color={Colors.primary} />
          <Text style={styles.actionText}>{t('components.screenScheduleRuleCard.edit')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={() => onDelete(rule.id)}>
          <Icon name="delete" size={18} color={Colors.error} />
          <Text style={[styles.actionText, { color: Colors.error }]}>{t('components.screenScheduleRuleCard.delete')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  cardDisabled: {
    opacity: 0.6,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: Spacing.xs,
  },
  name: {
    ...Typography.label,
    fontSize: 16,
  },
  midnightBadge: {
    fontSize: 11,
    color: Colors.warningDark,
    backgroundColor: Colors.warningLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  textDisabled: {
    color: Colors.textDisabled,
  },
  toggleButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: Colors.divider,
  },
  toggleButtonActive: {
    backgroundColor: Colors.primaryLight || Colors.primary,
  },
  toggleText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: Colors.textSecondary,
  },
  toggleTextActive: {
    color: Colors.primary,
  },
  details: {
    gap: 4,
    marginBottom: Spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailText: {
    ...Typography.body,
    color: Colors.textSecondary,
    fontSize: 14,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    paddingTop: Spacing.sm,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  actionText: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '500',
  },
});

export default ScreenScheduleRuleCard;
