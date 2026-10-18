import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireAuth } from './auth.js';
import { consumeRateLimit } from './rate-limit.js';
import { dictionaryRecordFrom } from './kawuri-dictionary.js';
import { approvedSpellingSnapshot } from './kasem-spelling.js';
import { assistanceKey, toneKey, missingToneMatch, type DictionaryCandidate, type DictionaryResult } from '@indigen-world/contracts/dictionary-assistance';
import { kasemTokens, similarSpellings } from '@indigen-world/contracts/kasem-spelling';

export function dictionaryCandidates(id: string, data: Record<string, unknown>): DictionaryCandidate[] {
  if (data.isPublished !== true || data.mergedInto || data.mergedIntoId
    || (data.culturalPermissionTier && data.culturalPermissionTier !== 'public')
    || ['expression', 'sentence', 'idiom', 'proverb'].includes(String(data.contentKind ?? data.entryType ?? data.lexicalKind ?? ''))) return [];
  const record = dictionaryRecordFrom(id, data);
  if (!record) return [];
  const meanings = [record.english, ...(Array.isArray(data.senses) ? data.senses.map(s => typeof s?.definition === 'string' ? s.definition : '') : []),
    ...(Array.isArray(data.englishTranslations) ? data.englishTranslations.filter(v => typeof v === 'string') : [])].filter(Boolean);
  const forms = Object.values(data.forms && typeof data.forms === 'object' ? data.forms : {}).filter((v): v is string => typeof v === 'string');
  const words = [...new Set([...record.renderings, ...forms])];
  return words.filter(word => {
    const tokens = kasemTokens(word);
    return word.length <= 160 && tokens.length > 0 && tokens.length <= 6 && tokens[0].start === 0
      && tokens.at(-1)!.end === word.length && tokens.every((token, i) => i === 0 || /^\s+$/u.test(word.slice(tokens[i - 1].end, token.start)));
  }).map(word => ({ id, word, meaning: [...new Set(meanings)].join('; ').slice(0, 1600),
    partOfSpeech: record.partOfSpeech, ipa: word === record.kasem ? record.ipa : '',
    // A recording of a headword is not a recording of every inflected form.
    audioUrl: word === record.kasem && typeof data.audioUrl === 'string' && /^https:\/\//.test(data.audioUrl) ? data.audioUrl : '',
    verified: Boolean(data.approvedBy || data.verified === true || data.reviewStatus === 'approved'),
    publicationLabel: data.publicationMode === 'owner-direct-source' ? 'Published source record' : data.approvedBy || data.verified === true || data.reviewStatus === 'approved' ? 'Approved dictionary entry' : 'Published dictionary record · review status not recorded' }));
}

const stop = new Set('the a an is are was were be been being to of at on in for with and or it this that i you he she we they my your his her our their do does did'.split(' '));
const irregular: Record<string, string> = { going: 'go', goes: 'go', went: 'go', gone: 'go', children: 'child', men: 'man', women: 'woman', feet: 'foot', teeth: 'tooth', came: 'come' };
function englishForm(value: string) {
  const word = value.toLowerCase();
  if (irregular[word]) return irregular[word];
  if (word.length > 4 && word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.length > 3 && word.endsWith('s') && !/(ss|us|is)$/u.test(word)) return word.slice(0, -1);
  return word;
}
function englishTokens(value: string) { return kasemTokens(value).map(t => englishForm(t.text)); }
export function englishGlosses(meaning: string) {
  return meaning.split(/[;,/|]/u).map(part => part.trim().replace(/^to\s+/i, ''))
    .map(englishTokens).filter(tokens => tokens.length && !tokens.every(t => stop.has(t)));
}
export function sourceRecommendations(source: string, candidates: readonly DictionaryCandidate[], limit = 24): DictionaryCandidate[] {
  const tokens = englishTokens(source), sentence = ` ${tokens.join(' ')} `;
  return candidates.flatMap(entry => {
    const matched = englishGlosses(entry.meaning).filter(gloss => sentence.includes(` ${gloss.join(' ')} `));
    if (!matched.length) return [];
    const best = matched.sort((a, b) => b.length - a.length)[0].join(' ');
    return [{ ...entry, matchedEnglish: best }];
  }).sort((a, b) => Number(b.verified) - Number(a.verified) || b.matchedEnglish!.length - a.matchedEnglish!.length || a.word.localeCompare(b.word) || a.id.localeCompare(b.id)).slice(0, limit);
}
export function createDictionaryIndex(candidates: readonly DictionaryCandidate[]) {
  const exact = new Map<string, DictionaryCandidate[]>(), tone = new Map<string, DictionaryCandidate[]>();
  for (const entry of candidates) {
    for (const [map, key] of [[exact, assistanceKey(entry.word)], [tone, toneKey(assistanceKey(entry.word))]] as const) {
      const group = map.get(key) ?? []; group.push(entry); map.set(key, group);
    }
  }
  return { exact, tone, candidates };
}
export function dictionaryMatches(terms: readonly string[], index: ReturnType<typeof createDictionaryIndex>, complete: boolean): DictionaryResult[] {
  return [...new Set(terms.map(assistanceKey))].map(key => {
    const matches = index.exact.get(key) ?? [];
    const additions = (index.tone.get(toneKey(key)) ?? []).filter(entry => missingToneMatch(key, assistanceKey(entry.word)));
    const similar = !matches.length && !additions.length && !key.includes(' ') && key.length > 2
      ? similarSpellings(key, index.candidates).flatMap(item => index.exact.get(assistanceKey(item.word))?.filter(entry => entry.id === item.id) ?? []) : [];
    const suggestions = (additions.length ? [...matches, ...additions] : similar).sort((a, b) => Number(b.verified) - Number(a.verified));
    return { key, status: additions.length ? 'review' : matches.length ? 'approved' : complete ? 'missing' : 'unknown',
      matches: matches.slice(0, 40), suggestions: suggestions.slice(0, 40), more: suggestions.length > 40 };
  });
}

export const getKasemDictionaryAssistance = onCall({ region: 'us-central1', invoker: 'public',
  enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true', timeoutSeconds: 60,
}, async req => {
  const uid = requireAuth(req);
  await consumeRateLimit('getKasemDictionaryAssistance', uid, 90);
  const terms = req.data?.terms ?? [], source = req.data?.source ?? '';
  if (typeof source !== 'string' || source.length > 2000 || !Array.isArray(terms) || terms.length > 80
    || terms.some(term => typeof term !== 'string' || term.length > 160 || !term.trim() || kasemTokens(term).length > 6)) {
    throw new HttpsError('invalid-argument', 'Send a source sentence and up to 80 short dictionary terms.');
  }
  const snapshot = await approvedSpellingSnapshot();
  return { results: dictionaryMatches(terms, snapshot.index, snapshot.complete),
    recommendations: source ? sourceRecommendations(source, snapshot.entries) : [], complete: snapshot.complete };
});
