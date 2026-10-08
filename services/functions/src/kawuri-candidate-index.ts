import { createHash } from 'node:crypto';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { dictionaryRecordFrom, englishSenses, normaliseTerm } from './kawuri-dictionary.js';

export const CANDIDATE_SOURCES = ['dictionaryEntries', 'submissions', 'knowledgeRecords', 'kasemSentences', 'grammarRules', 'expressionEntries', 'kasemEvidence'] as const;
export const CANDIDATE_PAGE_SIZE = 100;
export const CANDIDATE_MAX_PAGES = 4;
export const CANDIDATE_MAX_KEYS = 12;
export function candidateKey(value: string): string {
  return createHash('sha256').update(normaliseTerm(value).replace(/[’‘]/g, "'").replace(/[.!?]+$/g, '').trim()).digest('hex');
}
const strings = (value: unknown): string[] => typeof value === 'string' ? [value] : Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
export function candidateDocument(collection: string, id: string, data: Record<string, any> | undefined) {
  if (!data || !CANDIDATE_SOURCES.some(name => name === collection)) return null;
  let forms: string[] = [];
  if (collection === 'dictionaryEntries') {
    const word = dictionaryRecordFrom(id, data);
    if (word) forms = [word.english, ...englishSenses(word), ...word.renderings];
  } else if (collection === 'submissions') {
    if (!data.contributorPortal) return null;
    forms = [...strings(data.title), ...strings(data.body), ...strings(data.alternativeExpressions)];
  } else if (collection === 'knowledgeRecords') forms = [...strings(data.original), ...strings(data.english)];
  else if (collection === 'grammarRules') forms = [...strings(data.title), ...strings(data.englishTriggers)];
  else if (collection === 'kasemEvidence') forms = (Array.isArray(data.examples) ? data.examples : []).flatMap((row: Record<string, unknown>) => [...strings(row.english), ...strings(row.kasem)]);
  else forms = [...strings(data.kasem), ...strings(data.english), ...strings(data.phrase), ...strings(data.meaning), ...strings(data.alternatives)];
  // These keys select a sample. They never grant eligibility or supply wording.
  if (collection !== 'grammarRules') forms.push('examples:general');
  if (data.expressionKind === 'proverb' || data.datasetType === 'proverbs') forms.push('examples:proverbs');
  if (/\b(hello|greet|good morning|welcome)\b/i.test(forms.join(' '))) forms.push('examples:greetings');
  if (/\b(thank|gratitude)\b/i.test(forms.join(' '))) forms.push('examples:gratitude');
  const keys = [...new Set(forms.filter(value => value.trim() && value.length <= 1200).map(candidateKey))].slice(0, 80);
  return keys.length ? { schema: 1, collection, sourceId: id, keys } : null;
}
export async function findCandidates(terms: readonly string[]) {
  const keys = [...new Set(terms.filter(Boolean).map(candidateKey))].slice(0, CANDIDATE_MAX_KEYS);
  if (!keys.length) return { candidates: [], limited: false };
  const base = getFirestore().collection('kawuriCandidates').where('keys', 'array-contains-any', keys).orderBy(FieldPath.documentId());
  let cursor = '', limited = false;
  const candidates: { collection: string; sourceId: string }[] = [];
  for (let page = 0; page < CANDIDATE_MAX_PAGES; page++) {
    const query = cursor ? base.startAfter(cursor) : base;
    const result = await query.limit(CANDIDATE_PAGE_SIZE + 1).get();
    for (const doc of result.docs.slice(0, CANDIDATE_PAGE_SIZE)) {
      const row = doc.data();
      if (row.schema === 1 && CANDIDATE_SOURCES.some(name => name === row.collection)
        && typeof row.sourceId === 'string' && /^[A-Za-z0-9_-]{1,150}$/.test(row.sourceId)) candidates.push({ collection: row.collection, sourceId: row.sourceId });
    }
    limited = result.size > CANDIDATE_PAGE_SIZE;
    if (!limited) break;
    cursor = result.docs[CANDIDATE_PAGE_SIZE - 1]!.id;
  }
  return { candidates, limited };
}
export async function refreshCandidate(collection: string, id: string) {
  const db = getFirestore();
  // A delayed trigger reads current source state rather than its old event payload.
  await db.runTransaction(async tx => {
    const source = await tx.get(db.collection(collection).doc(id));
    const target = db.collection('kawuriCandidates').doc(collection + '-' + id);
    const candidate = candidateDocument(collection, id, source.data());
    if (candidate) tx.set(target, candidate); else tx.delete(target);
  });
}
const indexTrigger = (collection: string) => onDocumentWritten({ document: `${collection}/{recordId}`, region: 'us-central1', retry: true }, event => refreshCandidate(collection, event.params.recordId));
export const onDictionaryCandidate = indexTrigger('dictionaryEntries');
export const onContributorCandidate = indexTrigger('submissions');
export const onKnowledgeCandidate = indexTrigger('knowledgeRecords');
export const onSentenceCandidate = indexTrigger('kasemSentences');
export const onGrammarCandidate = indexTrigger('grammarRules');
export const onExpressionCandidate = indexTrigger('expressionEntries');
export const onEvidenceCandidate = indexTrigger('kasemEvidence');
