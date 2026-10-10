export interface KasemToken { text: string; key: string; start: number; end: number }
export interface SpellingSuggestion { id: string; word: string }
export interface SpellingResult { key: string; status: 'approved' | 'missing' | 'unknown'; suggestions: SpellingSuggestion[] }
export function spellingKey(value: string): string;
export function kasemTokens(text: string): KasemToken[];
export function spellingDistance(left: string, right: string): number;
export function similarSpellings(word: string, approved: readonly SpellingSuggestion[], limit?: number): SpellingSuggestion[];
export function replaceOccurrence(text: string, token: KasemToken, replacement: string): string | null;
