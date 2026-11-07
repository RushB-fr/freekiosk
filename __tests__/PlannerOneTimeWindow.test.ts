/**
 * A one-time event's times are a daily window on each day of its date range, and that
 * window may cross midnight like a recurring event's: 18:00 to 10:00 runs from 18:00 on a
 * day in the range until 10:00 the next morning. The editor has always accepted such a
 * multi-day event, which then never became active.
 */
import { getActiveEvent, isEventActive, ScheduledEvent } from '../src/types/planner';

const event = (over: Partial<ScheduledEvent>): ScheduledEvent => ({
  id: 'e',
  type: 'oneTime',
  url: 'https://example.com',
  name: 'Event',
  enabled: true,
  priority: 3,
  startDate: '2026-03-10',
  endDate: '2026-03-12',
  allDay: false,
  ...over,
});

const at = (date: string, time: string) => new Date(`${date}T${time}:00`);

describe('daily window within a day', () => {
  const e = event({ startTime: '09:00', endTime: '18:00' });

  test('active inside the window on each day of the range', () => {
    expect(isEventActive(e, at('2026-03-10', '09:00'))).toBe(true);
    expect(isEventActive(e, at('2026-03-11', '12:00'))).toBe(true);
    expect(isEventActive(e, at('2026-03-12', '17:59'))).toBe(true);
  });

  test('inactive outside the window and outside the range', () => {
    expect(isEventActive(e, at('2026-03-11', '18:00'))).toBe(false);
    expect(isEventActive(e, at('2026-03-11', '08:59'))).toBe(false);
    expect(isEventActive(e, at('2026-03-09', '12:00'))).toBe(false);
    expect(isEventActive(e, at('2026-03-13', '12:00'))).toBe(false);
  });
});

describe('daily window across midnight', () => {
  const e = event({ startTime: '18:00', endTime: '10:00' });

  test('evening part on a day of the range', () => {
    expect(isEventActive(e, at('2026-03-10', '18:00'))).toBe(true);
    expect(isEventActive(e, at('2026-03-12', '23:30'))).toBe(true);
  });

  test('morning part on the day after a day of the range', () => {
    expect(isEventActive(e, at('2026-03-11', '09:59'))).toBe(true);
    expect(isEventActive(e, at('2026-03-13', '09:59'))).toBe(true);
  });

  test('inactive between the parts, and before the first evening', () => {
    expect(isEventActive(e, at('2026-03-11', '10:00'))).toBe(false);
    expect(isEventActive(e, at('2026-03-11', '17:59'))).toBe(false);
    expect(isEventActive(e, at('2026-03-10', '09:00'))).toBe(false);
    expect(isEventActive(e, at('2026-03-13', '18:00'))).toBe(false);
  });

  test('the morning after the month end counts', () => {
    const m = event({ startDate: '2026-03-31', endDate: '2026-03-31', startTime: '22:00', endTime: '02:00' });
    expect(isEventActive(m, at('2026-04-01', '01:00'))).toBe(true);
  });
});

test('all-day events ignore the times', () => {
  const e = event({ allDay: true, startTime: '18:00', endTime: '10:00' });
  expect(isEventActive(e, at('2026-03-11', '12:00'))).toBe(true);
  expect(isEventActive(e, at('2026-03-13', '01:00'))).toBe(false);
});

test('getActiveEvent checks every event against the current time', () => {
  // filter() passes the index as a second argument, which must not be taken for a date
  const always = event({ id: 'always', allDay: true, startDate: '2000-01-01', endDate: '2999-12-31' });
  const never = event({ id: 'never', allDay: true, startDate: '2000-01-01', endDate: '2000-01-01' });
  expect(getActiveEvent([never, always])?.id).toBe('always');
});
