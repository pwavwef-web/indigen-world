import type { KasemToken, SpellingResult, SpellingSuggestion } from '@indigen-world/contracts/kasem-spelling';
export interface DictionaryCandidate extends SpellingSuggestion { meaning: string; partOfSpeech: string; ipa: string; audioUrl: string; verified: boolean; matchedEnglish?: string }
export interface DictionaryResult extends SpellingResult { matches?: DictionaryCandidate[]; suggestions: DictionaryCandidate[]; more?: boolean }
export const KASEM_ORTHOGRAPHY: Readonly<{ id: string; toneMarks: readonly string[] }>;
export function toneKey(text: string, orthography?: { toneMarks: readonly string[] }): string;
export function hasTone(text: string): boolean;
export function missingToneMatch(input: string, candidate: string): boolean;
export function assistanceKey(value: string): string;
export function dictionarySpans(text: string, maxWords?: number): KasemToken[];
export function reviewedSpans(text: string, results: readonly SpellingResult[]): (KasemToken & { result?: SpellingResult })[];
export function rebaseDecisions(previous: string, next: string, decisions: readonly KasemToken[]): KasemToken[];
