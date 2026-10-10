import { spellingKey, type SpellingResult } from '@indigen-world/contracts/kasem-spelling';

/** Bounded, coalesced lookups shared by all open fields; failures are never misses. */
export function createSpellingLookup(call: (words: string[]) => Promise<SpellingResult[]>, now = Date.now) {
  const cache = new Map<string, { result: SpellingResult; expires: number }>();
  const pending = new Map<string, { promise: Promise<SpellingResult>; resolve: (result: SpellingResult) => void }>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  async function flush() {
    timer = undefined;
    if (running) return;
    running = true;
    const batch = [...pending.keys()].slice(0, 80);
    let results: SpellingResult[] = [];
    try { results = await call(batch); } catch { /* No cached failure, no invented absence. */ }
    for (const key of batch) {
      const result = results.find(row => row.key === key && ['approved', 'missing', 'unknown'].includes(row.status))
        ?? { key, status: 'unknown' as const, suggestions: [] };
      if (result.status !== 'unknown') cache.set(key, { result, expires: now() + (result.status === 'missing' ? 15_000 : 60_000) });
      pending.get(key)?.resolve(result); pending.delete(key);
    }
    while (cache.size > 2000) cache.delete(cache.keys().next().value!);
    running = false;
    if (pending.size) timer = setTimeout(() => void flush(), 80);
  }
  return {
    invalidate(key: string) { cache.delete(spellingKey(key)); },
    async lookup(words: readonly string[]): Promise<SpellingResult[]> {
      return Promise.all([...new Set(words.map(spellingKey))].filter(key => key.length <= 100).map(key => {
        const saved = cache.get(key);
        if (saved && saved.expires > now()) return saved.result;
        if (!pending.has(key)) {
          let resolve!: (result: SpellingResult) => void;
          const promise = new Promise<SpellingResult>(done => { resolve = done; });
          pending.set(key, { promise, resolve });
        }
        if (!timer && !running) timer = setTimeout(() => void flush(), 80);
        return pending.get(key)!.promise;
      }));
    },
  };
}
