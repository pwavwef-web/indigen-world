/** Public browsing rules. Tone marks and source-specific records stay intact. */
export interface DiscoverableWord {
  id: string;
  headword: string;
  translation: string;
  dialect: string;
  audioUrl: string;
}

export interface DictionaryFilters {
  query: string;
  dialect: string;
  audioOnly: boolean;
  savedOnly: boolean;
}

export function normalizedText(value: string): string {
  return value.normalize("NFC").trim().toLocaleLowerCase();
}

/** Explicit classifications only: spaces can be legitimate lexical forms. */
export function isDictionaryWord(data: Record<string, unknown>): boolean {
  const values = [data.contentKind, data.collectionKind, data.lexicalKind, data.partOfSpeech, data.wordClass];
  const nonWords = new Set(["expression", "expressions", "phrase", "phrases", "idiom", "idioms", "proverb", "proverbs", "sentence", "sentences"]);
  return !values.some((value) => typeof value === "string" && nonWords.has(normalizedText(value).replace(/\.$/, "")));
}

function relevance(entry: DiscoverableWord, query: string): number {
  if (!query) return 0;
  const word = normalizedText(entry.headword);
  const meaning = normalizedText(entry.translation);
  if (word === query || meaning === query) return 0;
  if (word.startsWith(query) || meaning.startsWith(query)) return 1;
  return 2;
}

export function discoverWords<T extends DiscoverableWord>(entries: T[], filters: DictionaryFilters, saved: ReadonlySet<string>): { key: string; entries: T[] }[] {
  const query = normalizedText(filters.query);
  const matching = entries.filter((entry) =>
    (!filters.dialect || entry.dialect === filters.dialect) &&
    (!filters.audioOnly || Boolean(entry.audioUrl)) &&
    (!filters.savedOnly || saved.has(entry.id)) &&
    (!query || [entry.headword, entry.translation, entry.dialect].some((value) => normalizedText(value).includes(query)))
  ).sort((a, b) => relevance(a, query) - relevance(b, query) || a.headword.localeCompare(b.headword) || a.id.localeCompare(b.id));
  const groups = new Map<string, T[]>();
  for (const entry of matching) {
    const key = normalizedText(entry.headword);
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }
  return [...groups].map(([key, group]) => ({ key, entries: group }));
}

export function readSavedWordIds(storage: Pick<Storage, "getItem">, key: string): Set<string> {
  try {
    const value: unknown = JSON.parse(storage.getItem(key) ?? "[]");
    return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}
