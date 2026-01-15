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

// Check if event is currently active
export const isEventActive = (event: ScheduledEvent): boolean => {
  if (!event.enabled) return false;
  
  const now = new Date();
  const currentDay = now.getDay();
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  const currentDate = now.toISOString().split('T')[0];
  
  if (event.type === 'recurring') {
    // Check if today is one of the scheduled days
    if (!event.days?.includes(currentDay)) return false;
    
    // Check if current time is within the time range
    if (event.startTime && event.endTime) {
      return currentTime >= event.startTime && currentTime < event.endTime;
    }
    return false;
  }
  
  if (event.type === 'oneTime') {
    // Check if current date is within the date range
    if (!event.startDate || !event.endDate) return false;
    if (currentDate < event.startDate || currentDate > event.endDate) return false;
    
    // If all day, it's active
    if (event.allDay) return true;
    
    // Check time range
    if (event.startTime && event.endTime) {
      return currentTime >= event.startTime && currentTime < event.endTime;
    }
    return true;
  }
  
  return false;
};

// Get the currently active event with highest priority
export const getActiveEvent = (events: ScheduledEvent[]): ScheduledEvent | null => {
  const activeEvents = events.filter(isEventActive);
  
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
