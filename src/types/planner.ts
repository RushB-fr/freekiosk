/**
 * FreeKiosk v1.2 - URL Planner Types
 * Hybrid scheduling: recurring weekly + one-time dated events
 */

export type ScheduleEventType = 'recurring' | 'oneTime';

export interface ScheduledEvent {
  id: string;                    // UUID unique
  type: ScheduleEventType;       // 'recurring' or 'oneTime'
  url: string;                   // URL to display
  name: string;                  // Event name (e.g., "Lunch Menu", "Christmas Sale")
  enabled: boolean;              // Active/inactive toggle
  priority: number;              // 1=highest (for overlaps)
  
  // For recurring events (type === 'recurring')
  days?: number[];               // [0=Sun, 1=Mon, ..., 6=Sat]
  startTime?: string;            // "HH:MM" format
  endTime?: string;              // "HH:MM" format
  
  // For one-time events (type === 'oneTime')
  startDate?: string;            // "YYYY-MM-DD" format
  endDate?: string;              // "YYYY-MM-DD" format (can equal startDate for single day)
  allDay?: boolean;              // If true, ignore time fields
}

// Helper type for creating new events
export type NewScheduledEvent = Omit<ScheduledEvent, 'id'>;

// Day names for UI
export const DAY_NAMES_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Priority levels
export const PRIORITY_LEVELS = [
  { value: 1, label: 'Highest' },
  { value: 2, label: 'High' },
  { value: 3, label: 'Normal' },
  { value: 4, label: 'Low' },
  { value: 5, label: 'Lowest' },
];

// Generate unique ID
export const generateEventId = (): string => {
  return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Validate time format HH:MM
export const isValidTime = (time: string): boolean => {
  const regex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
  return regex.test(time);
};

// Validate date format YYYY-MM-DD
export const isValidDate = (date: string): boolean => {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(date)) return false;
  const d = new Date(date);
  return d instanceof Date && !isNaN(d.getTime());
};

// Format date for display
export const formatDateDisplay = (date: string): string => {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
};

// Check if a date is in the past
export const isDatePast = (date: string): boolean => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const checkDate = new Date(date);
  return checkDate < today;
};

// Local calendar date: toISOString() is UTC, which shifts the day around midnight.
const localDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Check if event is currently active
export const isEventActive = (event: ScheduledEvent, now: Date = new Date()): boolean => {
  if (!event.enabled) return false;

  const currentDay = now.getDay();
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  const currentDate = localDate(now);
  
  if (event.type === 'recurring') {
    if (event.startTime && event.endTime) {
      const isOvernight = event.startTime > event.endTime;
      if (isOvernight) {
        // Before-midnight portion: today must be a scheduled day and time >= startTime
        if (event.days?.includes(currentDay) && currentTime >= event.startTime) return true;
        // After-midnight portion: yesterday must be a scheduled day and time < endTime
        const yesterday = (currentDay + 6) % 7;
        if (event.days?.includes(yesterday) && currentTime < event.endTime) return true;
        return false;
      }
      // Normal (same-day) range
      if (!event.days?.includes(currentDay)) return false;
      return currentTime >= event.startTime && currentTime < event.endTime;
    }
    return false;
  }
  
  if (event.type === 'oneTime') {
    if (!event.startDate || !event.endDate) return false;
    const { startDate, endDate } = event;
    const inRange = (date: string) => date >= startDate && date <= endDate;

    // All day, or no times: active on every day of the range
    if (event.allDay || !event.startTime || !event.endTime) return inRange(currentDate);

    // The times are a daily window on each day of the range
    if (event.startTime > event.endTime) {
      // Overnight, as for recurring events: the evening on a day of the range, and the
      // morning after it, which may be the day after endDate
      if (inRange(currentDate) && currentTime >= event.startTime) return true;
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      return inRange(localDate(yesterday)) && currentTime < event.endTime;
    }
    return inRange(currentDate) && currentTime >= event.startTime && currentTime < event.endTime;
  }
  
  return false;
};

// Get the currently active event with highest priority
export const getActiveEvent = (events: ScheduledEvent[]): ScheduledEvent | null => {
  const activeEvents = events.filter(event => isEventActive(event));
  
  if (activeEvents.length === 0) return null;
  
  // Sort by priority (lower number = higher priority)
  // One-time events get slight priority boost over recurring
  activeEvents.sort((a, b) => {
    const aPriority = a.type === 'oneTime' ? a.priority - 0.5 : a.priority;
    const bPriority = b.type === 'oneTime' ? b.priority - 0.5 : b.priority;
    return aPriority - bPriority;
  });
  
  return activeEvents[0];
};

// Get days display string
export const getDaysDisplayString = (days: number[]): string => {
  if (days.length === 7) return 'Every day';
  if (days.length === 5 && !days.includes(0) && !days.includes(6)) return 'Weekdays';
  if (days.length === 2 && days.includes(0) && days.includes(6)) return 'Weekends';
  
  return days.sort((a, b) => a - b).map(d => DAY_NAMES_SHORT[d]).join(', ');
};
