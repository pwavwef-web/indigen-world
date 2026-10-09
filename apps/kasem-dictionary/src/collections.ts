export type CollectionKind = "words" | "proverbs" | "names" | "phrases" | "sentences" | "grammar" | "illustrations";

export const COLLECTIONS = {
  words: { label: "Words", singular: "word", title: "Find your next word.", description: "A little discovery. A deeper connection.", all: "All words", heading: "Definition", source: "dictionaryEntries", field: "isPublished", icon: "Aa" },
  proverbs: { label: "Proverbs", singular: "proverb", title: "Wisdom, in a few words.", description: "Explore sayings and the meaning they carry.", all: "All proverbs", heading: "Meaning & context", source: "expressionEntries", field: "isPublished", icon: "“ ”" },
  names: { label: "Names", singular: "name", title: "Every name has a story.", description: "Discover Kassena names and their meanings.", all: "All names", heading: "Name & meaning", source: "kasemNames", field: "published", icon: "✧" },
  phrases: { label: "Common phrases", singular: "phrase", title: "A little Kasem, every day.", description: "Find expressions for everyday connections.", all: "All phrases", heading: "Meaning & context", source: "expressionEntries", field: "isPublished", icon: "↔" },
  sentences: { label: "Sentences", singular: "sentence", title: "Kasem in context.", description: "Complete published sentences, with their recorded meanings. Expiring permissions ending within one minute are withheld.", all: "All sentences", heading: "Sentence & context", source: "kasemSentences", field: "status", icon: "↔" },
  illustrations: { label: "Illustrations", singular: "illustration", title: "Illustrations in their source context.", description: "Original figures from the already published grammar guide.", all: "All illustrations", heading: "Illustration & source", source: "grammarIllustrations", field: "published", icon: "▧" },
  grammar: { label: "Grammar rules", singular: "rule", title: "Explore recorded grammar.", description: "Published rules and their complete source examples.", all: "All rules", heading: "Rule & examples", source: "grammarRules", field: "status", icon: "Aa" },
} as const;

// Keep the collections distinct; idioms belong with everyday expressions.
export function belongsToCollection(kind: CollectionKind, data: Record<string, unknown>): boolean {
  if (kind === 'sentences') return data.status === 'confirmed' && data.projectionVersion === 2 && (data.expiresAtMillis == null || typeof data.expiresAtMillis === 'number' && data.expiresAtMillis > Date.now());
  if (kind === 'grammar') return data.status === 'published';
  if (data[COLLECTIONS[kind].field] !== true) return false;
  if (kind === "words") return data.contentKind !== "expression" && data.collectionKind !== "expressions"
    && !["phrase", "idiom", "proverb"].includes(String(data.lexicalKind));
  if (kind === "names") return true;
  return kind === "proverbs" ? data.expressionKind === "proverb" : ["phrase", "idiom"].includes(String(data.expressionKind));
}
