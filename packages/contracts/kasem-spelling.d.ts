export interface KasemToken { text: string; key: string; start: number; end: number }
export interface SpellingSuggestion { id: string; word: string; meaning?: string; partOfSpeech?: string; ipa?: string; audioUrl?: string; verified?: boolean; publicationLabel?: string }
export interface SpellingResult { key: string; status: 'approved' | 'review' | 'missing' | 'unknown'; suggestions: SpellingSuggestion[]; matches?: SpellingSuggestion[]; more?: boolean }
export function spellingKey(value: string): string;
export function kasemTokens(text: string): KasemToken[];
export function spellingDistance(left: string, right: string): number;
export function similarSpellings(word: string, approved: readonly SpellingSuggestion[], limit?: number): SpellingSuggestion[];
export function replaceOccurrence(text: string, token: KasemToken, replacement: string): string | null;
