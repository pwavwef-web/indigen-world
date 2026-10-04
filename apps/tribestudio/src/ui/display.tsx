import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from './icons';

/**
 * Display preferences, after Comitia's "Display" control: colour mode, text
 * size, high contrast, and one addition the studio needs — whether anything
 * moves. Stored in this browser only. index.html applies the stored choice
 * before the first paint, so a dark-mode visitor never sees a white flash.
 */

export type ThemeChoice = 'system' | 'light' | 'dark';
export type MotionChoice = 'system' | 'on' | 'off';
export type FontScale = 'sm' | 'md' | 'lg';

export interface DisplayPreferences {
  theme: ThemeChoice;
  motion: MotionChoice;
  fontScale: FontScale;
  contrast: boolean;
}

export const DISPLAY_STORAGE_KEY = 'tribestudio.display';
const DEFAULTS: DisplayPreferences = { theme: 'system', motion: 'system', fontScale: 'md', contrast: false };
const SCALES: FontScale[] = ['sm', 'md', 'lg'];

// The last applied choice, for browsers that refuse storage (some private
// windows): the page still honours the choice until it is reloaded.
let remembered: DisplayPreferences | null = null;

export function readDisplayPreferences(): DisplayPreferences {
  try {
    const raw = localStorage.getItem(DISPLAY_STORAGE_KEY);
    if (raw === null && remembered) return remembered;
    const stored = JSON.parse(raw ?? '{}') as Partial<DisplayPreferences>;
    return {
      theme: stored.theme === 'light' || stored.theme === 'dark' ? stored.theme : 'system',
      motion: stored.motion === 'on' || stored.motion === 'off' ? stored.motion : 'system',
      fontScale: stored.fontScale && SCALES.includes(stored.fontScale) ? stored.fontScale : 'md',
      contrast: stored.contrast === true,
    };
  } catch {
    return remembered ?? DEFAULTS;
  }
}

function prefersDark() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

export function applyDisplayPreferences(preferences: DisplayPreferences) {
  const root = document.documentElement;
  const resolved = preferences.theme === 'system' ? (prefersDark() ? 'dark' : 'light') : preferences.theme;
  root.dataset.theme = preferences.theme;
  root.dataset.themeResolved = resolved;
  root.dataset.fontScale = preferences.fontScale;
  root.dataset.contrast = preferences.contrast ? 'high' : 'default';
  if (preferences.motion === 'system') delete root.dataset.motion;
  else root.dataset.motion = preferences.motion;
  root.style.colorScheme = resolved;
  const meta = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = resolved === 'dark' ? '#08111f' : '#0f1830';
  window.dispatchEvent(new Event('ts:display-change'));
}

export function useDisplayPreferences() {
  const [preferences, setPreferences] = useState(readDisplayPreferences);
  useEffect(() => {
    // Storage first, so a control following the change reads the new value.
    remembered = preferences;
    try { localStorage.setItem(DISPLAY_STORAGE_KEY, JSON.stringify(preferences)); } catch { /* A preference, not a requirement. */ }
    applyDisplayPreferences(preferences);
  }, [preferences]);
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const update = () => applyDisplayPreferences(readDisplayPreferences());
    // Another control on the page (the drawer's, the floating one) changed a
    // preference: follow it without echoing the change back.
    const follow = () => {
      const stored = readDisplayPreferences();
      setPreferences((current) => (JSON.stringify(current) === JSON.stringify(stored) ? current : stored));
    };
    media?.addEventListener('change', update);
    window.addEventListener('ts:display-change', follow);
    return () => {
      media?.removeEventListener('change', update);
      window.removeEventListener('ts:display-change', follow);
    };
  }, []);
  return [preferences, setPreferences] as const;
}

const THEMES: { id: ThemeChoice; label: string }[] = [
  { id: 'system', label: 'Device' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

const MOTION: { id: MotionChoice; label: string }[] = [
  { id: 'system', label: 'Device' },
  { id: 'on', label: 'On' },
  { id: 'off', label: 'Off' },
];

/**
 * The floating "Display" button and its panel. `inline` renders the trigger
 * as an ordinary control (for the mobile drawer and the sign-in footer).
 */
/**
 * The Display switch. `bar` sits in the workspace header (it never covers page
 * content), `inline` sits in drawers and footers, and the default floats.
 */
export function DisplayControl({ inline = false, bar = false }: { inline?: boolean; bar?: boolean }) {
  const [preferences, setPreferences] = useDisplayPreferences();
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const panel = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('button[aria-pressed="true"]')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const onPointer = (event: MouseEvent) => {
      if (!panel.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open]);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener('ts:open-display', show);
    return () => window.removeEventListener('ts:open-display', show);
  }, []);

  const update = (change: Partial<DisplayPreferences>, message: string) => {
    setPreferences((current) => ({ ...current, ...change }));
    setAnnouncement(message);
  };
  const nudge = (direction: -1 | 1) => {
    const next = SCALES[Math.min(SCALES.length - 1, Math.max(0, SCALES.indexOf(preferences.fontScale) + direction))];
    update({ fontScale: next }, `Text size set to ${next === 'sm' ? '93' : next === 'lg' ? '112' : '100'} percent.`);
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={bar ? 'ts-btn ts-btn--ghost ts-topbar__display' : inline ? 'ts-btn ts-btn--ghost ts-btn--sm' : 'ts-display-toggle'}
        title={bar ? 'Display: colour mode, animations and text size' : undefined}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="contrast" />
        <span className={bar ? 'ts-topbar__display-label' : undefined}>Display</span>
      </button>
      {open ? (
        <aside ref={panel} id={id} className={bar ? 'ts-display ts-display--bar' : 'ts-display'} aria-label="Display preferences">
          <div className="ts-display__head">
            <div>
              <p className="ts-kicker">Display preferences</p>
              <h2>Make TribeStudio comfortable</h2>
            </div>
            <button type="button" className="ts-dialog__close" aria-label="Close display preferences" onClick={() => { setOpen(false); trigger.current?.focus(); }}>
              <Icon name="close" />
            </button>
          </div>
          <fieldset>
            <legend>Colour mode</legend>
            <div className="ts-display__options">
              {THEMES.map((option) => (
                <button key={option.id} type="button" className="ts-display__option" aria-pressed={preferences.theme === option.id}
                  onClick={() => update({ theme: option.id }, `Colour mode set to ${option.label.toLowerCase()}.`)}>
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Animations</legend>
            <div className="ts-display__options">
              {MOTION.map((option) => (
                <button key={option.id} type="button" className="ts-display__option" aria-pressed={preferences.motion === option.id}
                  onClick={() => update({ motion: option.id }, option.id === 'off' ? 'Animations turned off.' : option.id === 'on' ? 'Animations turned on.' : 'Animations follow your device setting.')}>
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="ts-display__row">
            <div>
              <p>Text size</p>
              <small>93%, 100% or 112%</small>
            </div>
            <div className="ts-display__step">
              <button type="button" aria-label="Decrease text size" disabled={preferences.fontScale === 'sm'} onClick={() => nudge(-1)}>A−</button>
              <button type="button" aria-label="Increase text size" disabled={preferences.fontScale === 'lg'} onClick={() => nudge(1)}>A+</button>
            </div>
          </div>
          <div className="ts-display__options" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <button type="button" className="ts-display__option" aria-pressed={preferences.contrast}
              onClick={() => update({ contrast: !preferences.contrast }, `High contrast ${preferences.contrast ? 'off' : 'on'}.`)}>
              High contrast
            </button>
            <button type="button" className="ts-display__option" onClick={() => {
              setOpen(false);
              const main = document.getElementById('main-content');
              main?.focus({ preventScroll: true });
              main?.scrollIntoView({ block: 'start' });
            }}>
              Focus main content
            </button>
          </div>
        </aside>
      ) : null}
      <p className="sr-only" aria-live="polite">{announcement}</p>
    </>
  );
}
