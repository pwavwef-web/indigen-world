import { useEffect } from 'react';
import { IDLE_SIGN_OUT_MINUTES } from './staffSession';

/**
 * Session limits for the signed-in console: a verified sign-in lasts at most
 * twelve hours (the server stops honouring it then too), and the console signs
 * out after IDLE_SIGN_OUT_MINUTES without input in any of its tabs. The reason
 * is shown on the sign-in screen that follows.
 */

const ACTIVITY_KEY = 'iw-admin:last-activity';
const REASON_KEY = 'iw-admin:signed-out-reason';
const EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

function read(key: string, storage: Storage | undefined): string | null {
  try { return storage?.getItem(key) ?? null; } catch { return null; }
}
function write(key: string, value: string | null, storage: Storage | undefined) {
  try { if (value === null) storage?.removeItem(key); else storage?.setItem(key, value); } catch { /* private mode: limits still apply in this tab */ }
}
const local = () => (typeof window === 'undefined' ? undefined : window.localStorage);
const session = () => (typeof window === 'undefined' ? undefined : window.sessionStorage);

/** Remember why the console signed someone out, for the next sign-in screen. */
export function noteSignOutReason(reason: string) {
  write(REASON_KEY, reason, session());
}

/** The reason for the last automatic sign-out, read once. */
export function takeSignOutReason(): string | null {
  const reason = read(REASON_KEY, session());
  write(REASON_KEY, null, session());
  return reason;
}

export function useSessionLimits(active: boolean, expiresAt: number | null, signOut: () => void) {
  // The hard twelve-hour limit of the verified sign-in.
  useEffect(() => {
    if (!active || expiresAt === null) return undefined;
    const expire = () => { noteSignOutReason('Your secure session reached its 12-hour limit. Sign in again to continue.'); signOut(); };
    const wait = expiresAt - Date.now();
    if (wait <= 0) { expire(); return undefined; }
    // setTimeout caps near 24.8 days; twelve hours is well inside it.
    const timer = window.setTimeout(expire, wait);
    return () => window.clearTimeout(timer);
  }, [active, expiresAt, signOut]);

  // Inactivity, shared across tabs through localStorage.
  useEffect(() => {
    if (!active) return undefined;
    let lastWrite = 0;
    const touch = () => {
      const now = Date.now();
      if (now - lastWrite < 15_000) return;
      lastWrite = now;
      write(ACTIVITY_KEY, String(now), local());
    };
    touch();
    for (const name of EVENTS) window.addEventListener(name, touch, { passive: true });
    const timer = window.setInterval(() => {
      const last = Number(read(ACTIVITY_KEY, local()) ?? lastWrite);
      if (Date.now() - Math.max(last, lastWrite) > IDLE_SIGN_OUT_MINUTES * 60_000) {
        noteSignOutReason(`Signed out after ${IDLE_SIGN_OUT_MINUTES} minutes without activity.`);
        signOut();
      }
    }, 30_000);
    return () => {
      for (const name of EVENTS) window.removeEventListener(name, touch);
      window.clearInterval(timer);
    };
  }, [active, signOut]);
}
