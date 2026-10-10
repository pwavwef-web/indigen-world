import { getFirestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireAuth } from './auth.js';
import { consumeRateLimit } from './rate-limit.js';
import { spellingKey, kasemTokens, similarSpellings, type SpellingSuggestion, type SpellingResult } from '@indigen-world/contracts/kasem-spelling';

export function approvedSpellings(id: string, data: Record<string, unknown>): SpellingSuggestion[] {
  if (data.isPublished !== true || data.mergedInto || data.mergedIntoId
    || ['expression', 'sentence', 'phrase', 'idiom', 'proverb'].includes(String(data.contentKind ?? data.entryType ?? ''))
    || (data.lexicalKind && data.lexicalKind !== 'word')) return [];
  const candidates = [data.kasemText, data.headword, data.kasem, data.word,
    ...(Array.isArray(data.translations) ? data.translations : []),
    ...Object.values(data.forms && typeof data.forms === 'object' ? data.forms : {})];
  return candidates.filter((word): word is string => typeof word === 'string')
    .map(word => word.trim()).filter(word => {
      const tokens = kasemTokens(word);
      return tokens.length === 1 && tokens[0].text === word && word.length <= 100;
    }).map(word => ({ id, word }));
}

export function checkSpellings(words: readonly string[], approved: readonly SpellingSuggestion[], complete: boolean): SpellingResult[] {
  const keys = new Set(approved.map(entry => spellingKey(entry.word)));
  return [...new Set(words.map(spellingKey))].map(key => ({ key,
    status: keys.has(key) ? 'approved' : complete ? 'missing' : 'unknown',
    suggestions: keys.has(key) ? [] : similarSpellings(key, approved),
  }));
}

// Only the server holds this snapshot. Clients receive results for at most 80
// requested tokens, never an archive download. Incomplete scans cannot prove absence.
let cache: { words: SpellingSuggestion[]; complete: boolean; time: number } | undefined;
let loading: Promise<NonNullable<typeof cache>> | undefined;
export async function approvedSpellingSnapshot(fresh = false) {
  if (!fresh && cache && Date.now() - cache.time < 60_000) return cache;
  if (loading) return loading;
  loading = (async () => {
    const base = getFirestore().collection('dictionaryEntries').where('isPublished', '==', true)
      .select('isPublished', 'lexicalKind', 'contentKind', 'entryType', 'mergedInto', 'mergedIntoId', 'kasemText', 'headword', 'kasem', 'word', 'translations', 'forms').limit(1000);
    let cursor: QueryDocumentSnapshot | undefined;
    const words: SpellingSuggestion[] = [];
    let complete = false;
    for (let page = 0; page < 25; page++) {
      const result = await (cursor ? base.startAfter(cursor) : base).get();
      for (const doc of result.docs) words.push(...approvedSpellings(doc.id, doc.data()));
      if (result.size < 1000) { complete = true; break; }
      cursor = result.docs[result.docs.length - 1];
    }
    cache = { words, complete, time: Date.now() }; return cache;
  })();
  try { return await loading; } finally { loading = undefined; }
}

export const checkKasemSpelling = onCall({ region: 'us-central1', invoker: 'public',
  enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true', timeoutSeconds: 60,
}, async req => {
  const uid = requireAuth(req);
  await consumeRateLimit('checkKasemSpelling', uid, 60);
  const words = req.data?.words;
  if (!Array.isArray(words) || words.length > 80 || words.some(word => typeof word !== 'string'
    || word.length > 100 || kasemTokens(word).length !== 1 || kasemTokens(word)[0].text !== word)) {
    throw new HttpsError('invalid-argument', 'Send up to 80 individual Kasem words.');
  }
  const snapshot = await approvedSpellingSnapshot();
  return { results: checkSpellings(words, snapshot.words, snapshot.complete) };
});

/** No private submissions or contributor details are returned to another member. */
export async function dictionarySubmissionStatus(uid: string, word: string) {
  const snapshot = await approvedSpellingSnapshot(true);
  const key = spellingKey(word);
  if (snapshot.words.some(entry => spellingKey(entry.word) === key)) return 'approved' as const;
  const queued = await getFirestore().collection('collectionContributions').where('spellingKey', '==', key).get();
  if (queued.docs.some(doc => ['submitted', 'under_review', 'approved', 'pending', 'in_review'].includes(String(doc.get('status')).toLowerCase()))) return 'pending' as const;
  // New submissions carry a normalized key. Legacy own submissions are paged
  // so an old pending word is not lost behind the dictionary desk's 40-row limit.
  const base = getFirestore().collection('collectionContributions').where('authUid', '==', uid).limit(300);
  let cursor: QueryDocumentSnapshot | undefined;
  for (let page = 0; page < 20; page++) {
    const result = await (cursor ? base.startAfter(cursor) : base).get();
    for (const doc of result.docs) {
      const data = doc.data();
      if (data.collectionKind === 'dictionary' && (!data.lexicalKind || data.lexicalKind === 'word')
        && spellingKey(String(data.body ?? '')) === key
        && ['submitted', 'under_review', 'approved', 'pending', 'in_review'].includes(String(data.status).toLowerCase())) return 'pending' as const;
    }
    if (result.size < 300) return 'available' as const;
    cursor = result.docs[result.docs.length - 1];
  }
  throw new HttpsError('unavailable', 'Could not finish checking your pending words. Try again later.');
}

export const getKasemWordSubmissionStatus = onCall({ region: 'us-central1', invoker: 'public',
  enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true', timeoutSeconds: 60,
}, async req => {
  const uid = requireAuth(req);
  await consumeRateLimit('getKasemWordSubmissionStatus', uid, 20);
  const word = req.data?.word;
  if (typeof word !== 'string' || word.length > 100 || kasemTokens(word).length !== 1 || kasemTokens(word)[0].text !== word) {
    throw new HttpsError('invalid-argument', 'An individual Kasem word is required.');
  }
  return { status: await dictionarySubmissionStatus(uid, word) };
});
