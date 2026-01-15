/**
 * FreeKiosk v1.2 - ScheduleEventCard Component
 * Display card for a scheduled event in the list
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Spacing, Typography } from '../../theme';
import { ScheduledEvent, getDaysDisplayString, formatDateDisplay, isEventActive } from '../../types/planner';
import Icon from '../Icon';

interface ScheduleEventCardProps {
  event: ScheduledEvent;
  onEdit: (event: ScheduledEvent) => void;
  onToggle: (event: ScheduledEvent) => void;
  onDelete: (event: ScheduledEvent) => void;
}

const ScheduleEventCard: React.FC<ScheduleEventCardProps> = ({
  event,
  onEdit,
  onToggle,
  onDelete,
}) => {
  const isActive = isEventActive(event);
  
  const getScheduleText = (): string => {
    if (event.type === 'recurring') {
      const days = getDaysDisplayString(event.days || []);
      const time = event.startTime && event.endTime 
        ? `${event.startTime} - ${event.endTime}` 
        : 'All day';
      return `${days} • ${time}`;
    }
    
    if (event.type === 'oneTime') {
      const startStr = event.startDate ? formatDateDisplay(event.startDate) : '';
      const endStr = event.endDate && event.endDate !== event.startDate 
        ? ` - ${formatDateDisplay(event.endDate)}` 
        : '';
      const timeStr = event.allDay 
        ? 'All day' 
        : (event.startTime && event.endTime ? `${event.startTime} - ${event.endTime}` : '');
      return `${startStr}${endStr}${timeStr ? ` • ${timeStr}` : ''}`;
    }
    
    return '';
  };

  const truncateUrl = (url: string, maxLength: number = 35): string => {
    if (url.length <= maxLength) return url;
    return url.substring(0, maxLength) + '...';
  };

  return (
    <View style={[styles.card, !event.enabled && styles.cardDisabled]}>
      <TouchableOpacity 
        style={styles.mainContent}
        onPress={() => onEdit(event)}
        activeOpacity={0.7}
      >
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Icon 
              name={event.type === 'recurring' ? 'calendar-repeat' : 'calendar-today'} 
              size={18} 
              color={event.enabled ? Colors.primary : Colors.textDisabled} 
              style={styles.typeIcon}
            />
            <Text style={[styles.name, !event.enabled && styles.textDisabled]} numberOfLines={1}>
              {event.name || 'Unnamed Event'}
            </Text>
          </View>
          {isActive && event.enabled && (
            <View style={styles.activeBadge}>
              <Icon name="check-circle" size={12} color={Colors.success} />
              <Text style={styles.activeBadgeText}>Active</Text>
            </View>
          )}
        </View>
        
        <Text style={[styles.schedule, !event.enabled && styles.textDisabled]}>
          {getScheduleText()}
        </Text>
        
        <Text style={[styles.url, !event.enabled && styles.textDisabled]} numberOfLines={1}>
          {truncateUrl(event.url)}
        </Text>
      </TouchableOpacity>
      
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionButton, styles.toggleButton]}
          onPress={() => onToggle(event)}
        >
          <Icon name={event.enabled ? 'pause' : 'play'} size={18} color={event.enabled ? Colors.warning : Colors.success} />
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.actionButton, styles.editButton]}
          onPress={() => onEdit(event)}
        >
          <Icon name="pencil" size={18} color={Colors.primary} />
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.actionButton, styles.deleteButton]}
          onPress={() => onDelete(event)}
        >
          <Icon name="delete-outline" size={18} color={Colors.error} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  cardDisabled: {
    opacity: 0.6,
    backgroundColor: Colors.surfaceVariant,
  },
  mainContent: {
    padding: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  typeIcon: {
    marginRight: Spacing.xs,
  },
  name: {
    ...Typography.label,
    flex: 1,
  },
  textDisabled: {
    color: Colors.textDisabled,
  },
  activeBadge: {
    backgroundColor: Colors.successLight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  activeBadgeText: {
    ...Typography.caption,
    color: Colors.success,
    fontWeight: '600',
  },
  schedule: {
    ...Typography.body,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  url: {
    ...Typography.caption,
    color: Colors.textHint,
  },
  actions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  actionButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleButton: {
    borderRightWidth: 1,
    borderRightColor: Colors.border,
  },
  editButton: {
    borderRightWidth: 1,
    borderRightColor: Colors.border,
  },
  deleteButton: {},
});

export default ScheduleEventCard;
