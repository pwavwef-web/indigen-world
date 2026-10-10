import { useEffect, useState } from 'react';

/**
 * Display preferences for the console: colour mode, text size, contrast and
 * animations. They set the same root attributes as TribeStudio's Display
 * panel (`data-theme-resolved`, `data-font-scale`, `data-contrast`,
 * `data-motion`), so the shared tokens and motion rules respond identically.
 * The console opens in the approved light appearance unless someone chooses
 * otherwise. Stored in this browser only; index.html applies them before the
 * first paint.
 */

export type ThemeChoice = 'light' | 'dark' | 'system';
export type MotionChoice = 'system' | 'on' | 'off';
export type FontScale = 'sm' | 'md' | 'lg';

export interface DisplayPreferences {
  theme: ThemeChoice;
  motion: MotionChoice;
  fontScale: FontScale;
  contrast: boolean;
}

export const DISPLAY_KEY = 'indigen-admin.display';
const DEFAULTS: DisplayPreferences = { theme: 'light', motion: 'system', fontScale: 'md', contrast: false };

export function readDisplay(): DisplayPreferences {
  try {
    const stored = JSON.parse(localStorage.getItem(DISPLAY_KEY) ?? '{}') as Partial<DisplayPreferences>;
    return {
      theme: stored.theme === 'dark' || stored.theme === 'system' ? stored.theme : 'light',
      motion: stored.motion === 'on' || stored.motion === 'off' ? stored.motion : 'system',
      fontScale: stored.fontScale === 'sm' || stored.fontScale === 'lg' ? stored.fontScale : 'md',
      contrast: stored.contrast === true,
    };
  } catch {
    return DEFAULTS;
  }
}

export function applyDisplay(preferences: DisplayPreferences) {
  const root = document.documentElement;
  const dark = preferences.theme === 'dark'
    || (preferences.theme === 'system' && (window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false));
  root.dataset.theme = preferences.theme;
  root.dataset.themeResolved = dark ? 'dark' : 'light';
  root.dataset.fontScale = preferences.fontScale;
  root.dataset.contrast = preferences.contrast ? 'high' : 'default';
  if (preferences.motion === 'system') delete root.dataset.motion;
  else root.dataset.motion = preferences.motion;
  root.style.colorScheme = dark ? 'dark' : 'light';
  // TribeStudio's motion helpers listen for this to re-check the preference.
  window.dispatchEvent(new Event('ts:display-change'));
}

export function useDisplay() {
  const [preferences, setPreferences] = useState(readDisplay);
  useEffect(() => {
    try { localStorage.setItem(DISPLAY_KEY, JSON.stringify(preferences)); } catch { /* A preference, not a requirement. */ }
    applyDisplay(preferences);
  }, [preferences]);
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const update = () => applyDisplay(readDisplay());
    media?.addEventListener('change', update);
    return () => media?.removeEventListener('change', update);
  }, []);
  return [preferences, setPreferences] as const;
}
