/**
 * The screensaver inactivity delay is stored in milliseconds and edited in whole minutes. A config
 * pushed by ADB or the cloud can hold a value the minutes field cannot show (10 s, 90 s). Rounding
 * it when the settings open, then refusing or rewriting it on Save, made every Save fail or quietly
 * change a delay nobody touched.
 */

/** The delay as the minutes field shows it: whole minutes as such, otherwise with up to two decimals. */
export const formatInactivityMinutes = (ms: number): string =>
  ms % 60000 === 0 ? String(ms / 60000) : String(Math.round(ms / 600) / 100);

export interface StoredInactivityDelay {
  /** What was stored. */
  ms: number;
  /** How the field showed it when the settings opened. */
  text: string;
}

/**
 * The delay to save: the stored one, as it was, when the field was not touched; otherwise the whole
 * number of minutes that was typed. null when what was typed is not a whole number of minutes of at least 1.
 */
export const resolveInactivityDelayMs = (text: string, stored: StoredInactivityDelay | null): number | null => {
  if (stored !== null && text === stored.text) return stored.ms;
  const minutes = parseInt(text, 10);
  if (isNaN(minutes) || minutes <= 0) return null;
  return minutes * 60000;
};
