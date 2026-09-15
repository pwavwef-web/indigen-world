/** Accept public discovery links only. URL input never grants rights to reuse content. */
export function discoverySource(value: string | null): string {
  if (!value || value.length > 2000) return '';
  try {
    const url = new URL(value);
    if (url.origin !== 'https://indigenworld.com' || url.username || url.password) return '';
    if (url.pathname === '/dictionary') {
      const entry = url.searchParams.get('entry');
      return entry ? `https://indigenworld.com/dictionary?entry=${encodeURIComponent(entry)}` : '';
    }
    if (/^\/post\/[^/]+$/.test(url.pathname)) return `https://indigenworld.com${url.pathname}`;
  } catch { /* Ignore malformed or unrelated links. */ }
  return '';
}
