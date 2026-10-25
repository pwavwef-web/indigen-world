import { useCallback, useEffect, useState } from 'react';

export type Shift = 'day' | 'night';
export type ShiftPreference = Shift | 'auto';

const SHIFT_STORAGE_KEY = 'iw_progress_shift';

/** Daylight in the windows from 06:00 to 18:00 on the visitor's own clock. */
export function shiftForHour(hour: number): Shift {
  return hour >= 6 && hour < 18 ? 'day' : 'night';
}

function readPreference(): ShiftPreference {
  try {
    const stored = localStorage.getItem(SHIFT_STORAGE_KEY);
    if (stored === 'day' || stored === 'night' || stored === 'auto') return stored;
  } catch {
    // Storage can be unavailable; the clock still decides.
  }
  return 'auto';
}

/**
 * The factory's lighting. By default it follows the visitor's local time and
 * changes over on the hour it turns; choosing a shift keeps it on this device.
 */
export function useShiftLighting() {
  const [preference, setPreferenceState] = useState<ShiftPreference>(readPreference);
  const [clockShift, setClockShift] = useState<Shift>(() => shiftForHour(new Date().getHours()));

  useEffect(() => {
    if (preference !== 'auto') return undefined;
    const update = () => setClockShift(shiftForHour(new Date().getHours()));
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, [preference]);

  const setPreference = useCallback((next: ShiftPreference) => {
    setPreferenceState(next);
    try { localStorage.setItem(SHIFT_STORAGE_KEY, next); } catch { /* Optional preference. */ }
  }, []);

  const shift = preference === 'auto' ? clockShift : preference;
  const toggle = useCallback(() => setPreference(shift === 'day' ? 'night' : 'day'), [setPreference, shift]);
  return { preference, shift, setPreference, toggle };
}
