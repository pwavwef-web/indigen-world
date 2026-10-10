import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import type { SpellingResult } from '@indigen-world/contracts/kasem-spelling';
import { createSpellingLookup } from './lookup-cache';

const check = httpsCallable<{ words: string[] }, { results: SpellingResult[] }>(functions, 'checkKasemSpelling');
export const spellingLookup = createSpellingLookup(async words => (await check({ words })).data.results);
export const wordSubmissionStatus = async (word: string) => (await httpsCallable<{ word: string },
  { status: 'available' | 'approved' | 'pending' }>(functions, 'getKasemWordSubmissionStatus')({ word })).data.status;
