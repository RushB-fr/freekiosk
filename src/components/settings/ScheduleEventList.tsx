/**
 * FreeKiosk v1.2 - ScheduleEventList Component
 * List of scheduled events with add buttons
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Colors, Spacing, Typography } from '../../theme';
import { ScheduledEvent } from '../../types/planner';
import ScheduleEventCard from './ScheduleEventCard';
import Icon from '../Icon';

interface ScheduleEventListProps {
  events: ScheduledEvent[];
  onEventsChange: (events: ScheduledEvent[]) => void;
  onAddRecurring: () => void;
  onAddOneTime: () => void;
  onEditEvent: (event: ScheduledEvent) => void;
  disabled?: boolean;
  maxEvents?: number;
}

const ScheduleEventList: React.FC<ScheduleEventListProps> = ({
  events,
  onEventsChange,
  onAddRecurring,
  onAddOneTime,
  onEditEvent,
  disabled = false,
  maxEvents = 20,
}) => {
  const handleToggle = (event: ScheduledEvent) => {
    const updatedEvents = events.map(e => 
      e.id === event.id ? { ...e, enabled: !e.enabled } : e
    );
    onEventsChange(updatedEvents);
  };

  const handleDelete = (event: ScheduledEvent) => {
    Alert.alert(
      'Delete Event',
      `Are you sure you want to delete "${event.name || 'this event'}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const updatedEvents = events.filter(e => e.id !== event.id);
            onEventsChange(updatedEvents);
          },
        },
      ]
    );
  };

  const canAddMore = events.length < maxEvents;

  // Sort events: active first, then by type (oneTime first), then by priority
  const sortedEvents = [...events].sort((a, b) => {
    // Enabled first
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    // One-time events first
    if (a.type !== b.type) return a.type === 'oneTime' ? -1 : 1;
    // Then by priority
    return a.priority - b.priority;
  });

  const activeCount = events.filter(e => e.enabled).length;
  const recurringCount = events.filter(e => e.type === 'recurring').length;
  const oneTimeCount = events.filter(e => e.type === 'oneTime').length;

  return (
    <View style={styles.container}>
      {events.length > 0 && (
        <View style={styles.statsRow}>
          <Text style={styles.statsText}>
            {activeCount} active • {recurringCount} recurring • {oneTimeCount} one-time
          </Text>
        </View>
      )}

      {sortedEvents.length === 0 ? (
        <View style={styles.emptyState}>
          <Icon name="calendar" size={40} color={Colors.textHint} style={styles.emptyIcon} />
          <Text style={styles.emptyTitle}>No Scheduled Events</Text>
          <Text style={styles.emptyText}>
            Add recurring or one-time events to display{'\n'}different URLs at specific times.
          </Text>
        </View>
      ) : (
        <View style={styles.eventsList}>
          {sortedEvents.map(event => (
            <ScheduleEventCard
              key={event.id}
              event={event}
              onEdit={onEditEvent}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          ))}
        </View>
      )}

      <View style={styles.addButtons}>
        <TouchableOpacity
          style={[
            styles.addButton,
            styles.addRecurringButton,
            (!canAddMore || disabled) && styles.addButtonDisabled,
          ]}
          onPress={onAddRecurring}
          disabled={!canAddMore || disabled}
        >
          <Icon name="calendar-repeat" size={18} color={(!canAddMore || disabled) ? Colors.textDisabled : Colors.primary} style={styles.addButtonIcon} />
          <Text style={[
            styles.addButtonText,
            (!canAddMore || disabled) && styles.addButtonTextDisabled,
          ]}>
            Add Recurring Event
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.addButton,
            styles.addOneTimeButton,
            (!canAddMore || disabled) && styles.addButtonDisabled,
          ]}
          onPress={onAddOneTime}
          disabled={!canAddMore || disabled}
        >
          <Icon name="calendar-today" size={18} color={(!canAddMore || disabled) ? Colors.textDisabled : Colors.secondary} style={styles.addButtonIcon} />
          <Text style={[
            styles.addButtonText,
            (!canAddMore || disabled) && styles.addButtonTextDisabled,
          ]}>
            Add One-Time Event
          </Text>
        </TouchableOpacity>
      </View>

      {!canAddMore && (
        <Text style={styles.limitText}>
          Maximum {maxEvents} events reached
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: Spacing.sm,
  },
  statsRow: {
    marginBottom: Spacing.sm,
  },
  statsText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    backgroundColor: Colors.surfaceVariant,
    borderRadius: 12,
    marginBottom: Spacing.md,
  },
  emptyIcon: {
    marginBottom: Spacing.sm,
  },
  emptyTitle: {
    ...Typography.label,
    marginBottom: Spacing.xs,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  eventsList: {
    marginBottom: Spacing.md,
  },
  addButtons: {
    gap: Spacing.sm,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: 8,
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  addRecurringButton: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  addOneTimeButton: {
    borderColor: Colors.info,
    backgroundColor: Colors.infoLight,
  },
  addButtonDisabled: {
    borderColor: Colors.textDisabled,
    backgroundColor: Colors.surfaceVariant,
    opacity: 0.5,
  },
  addButtonIcon: {
    marginRight: Spacing.sm,
  },
  addButtonText: {
    ...Typography.body,
    fontWeight: '600',
    color: Colors.primary,
  },
  addButtonTextDisabled: {
    color: Colors.textDisabled,
  },
  limitText: {
    ...Typography.caption,
    color: Colors.warning,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
});

export default ScheduleEventList;
