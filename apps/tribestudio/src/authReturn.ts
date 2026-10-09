/** Only existing contribution destinations; never an external redirect. */
export function studioReturn(raw: string | null): string | null {
  if (!raw || !/^\/studio\/(?:dictionary|expressions(?:\/new)?|knowledge|submissions\/new)(?:\?|$)/.test(raw)) return null;
  try { const url = new URL(raw, 'https://studio.invalid'); return url.origin === 'https://studio.invalid' && !url.hash ? url.pathname + url.search : null; } catch { return null; }
}
