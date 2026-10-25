/**
 * Where an email sign-in (or a password reset) may return to: only existing
 * contribution destinations, never an external redirect. Indigen Forms deep
 * links are allowed so a contributor who signs in, or resets a password, from
 * /contributor/forms/<formId> or /contributor/forms/submissions/<responseId>
 * lands on that same form or response.
 */
const DESTINATIONS = /^\/(?:studio\/(?:dictionary|expressions(?:\/new)?|knowledge|submissions\/new)|contributor\/forms(?:\/submissions\/[A-Za-z0-9_-]{1,128}|\/[A-Za-z0-9_-]{1,128})?)(?:\?|$)/;

export function studioReturn(raw: string | null): string | null {
  if (!raw || !DESTINATIONS.test(raw)) return null;
  try { const url = new URL(raw, 'https://studio.invalid'); return url.origin === 'https://studio.invalid' && !url.hash ? url.pathname + url.search : null; } catch { return null; }
}
