import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import type { SpellingResult } from '@indigen-world/contracts/kasem-spelling';
import { createSpellingLookup } from './lookup-cache';
import type { DictionaryCandidate } from '@indigen-world/contracts/dictionary-assistance';

const check = httpsCallable<{ words: string[] }, { results: SpellingResult[] }>(functions, 'checkKasemSpelling');
export const spellingLookup = createSpellingLookup(async words => (await check({ words })).data.results);
const assist = httpsCallable<{ terms?: string[]; source?: string }, { results: SpellingResult[]; recommendations: DictionaryCandidate[]; complete: boolean }>(functions, 'getKasemDictionaryAssistance');
export const dictionaryLookup = createSpellingLookup(async terms => (await assist({ terms })).data.results);
// Small session cache; no dictionary archive or private draft persists here.
const sources = new Map<string, { expires: number; promise: ReturnType<typeof assist> }>();
export async function sentenceRecommendations(source: string) {
  let saved = sources.get(source);
  if (!saved || saved.expires < Date.now()) {
    saved = { expires: Date.now() + 60_000, promise: assist({ source }) }; sources.set(source, saved);
    while (sources.size > 20) sources.delete(sources.keys().next().value!);
  }
  try { return (await saved.promise).data; }
  catch (error) { sources.delete(source); throw error; }
}
export const wordSubmissionStatus = async (word: string) => (await httpsCallable<{ word: string },
  { status: 'available' | 'approved' | 'pending' }>(functions, 'getKasemWordSubmissionStatus')({ word })).data.status;
