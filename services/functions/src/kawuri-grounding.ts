import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { dictionaryRecordFrom, englishSenses, normaliseTerm, sentenceRequest, translationTerms, type DictionaryRecord } from './kawuri-dictionary.js';
import { publicSentences, type EvidenceNote } from './kasem-evidence.js';
import { heldOutEvidenceIds } from './kasem-dataset.js';
import { resolveKnowledge } from './knowledge-release.js';
import type { knowledgeProjection } from './knowledge-policy.js';
import { directSourceCorpusRecord } from './kawuri-corpus.js';
import { grammarRecordFrom, matchSpellingRules, matchBookGrammarRules, type GrammarRecord } from './kawuri-grammar.js';
import { DIRECT_SOURCE_BOOK_IDS, publishedSourceManifest } from './kasem-source-books.js';

/** No provider-authored text crosses this boundary. Plans select a lookup or a
 * fixed help topic; all displayed language comes from current source records. */
export const HELP = {
  dictionary: 'Open the dictionary to search published words and their recorded meanings. Tap a word to see its details. You can also ask me about a particular word.',
  contribute: 'Open Contribute to submit a word or correction. Give the spelling, meaning, dialect and source. A validator reviews the submission before it joins the published collection.',
  community: 'Open Community to ask speakers, read posts and reply. Taking part requires an account and a community handle. Community posts are not automatically reviewed language evidence.',
  learn: 'Open Learn for the lesson path. Preview lesson content is not validated guidance. For practice with me, choose a published dictionary word; I will use its recorded spelling and meaning.',
  explore: 'Open Explore to watch published cultural reels. You can publish your own work through TribeStudio when you hold the rights and have the consent of anyone featured. Campaign submissions follow their own review process.',
  collection: 'Open Collection to find the words, places, songs and symbols you have saved.',
  tools: 'Open Tools in Kawuri to choose a creation or analysis tool. Availability depends on the tool and your account allowance. These tools do not validate Kasem translations.',
  account: 'Open Settings to manage your account. For help with a private account or payment issue, use the support options in the app.',
  about: 'I can show recorded Kasem words and reviewed expressions, help you practise a dictionary word, or explain where to find things in Indigen World. Tell me the word, expression or app feature you want help with.',
} as const;
export type HelpTopic = keyof typeof HELP;
export type ExampleCategory = 'general' | 'greetings' | 'gratitude' | 'proverbs';
export interface GroundingPlan {
  kind: 'language' | 'app' | 'unsupported';
  query: string;
  examples: boolean;
  category: ExampleCategory;
  topic: HelpTopic;
}
export interface GroundingTurn { role: 'user' | 'model'; text: string }
export interface QuotedExpression {
  id: string; english: string; kasem: string; alternatives: string[];
  dialect: string; context: string; source: 'contributor' | 'evidence' | 'corpus' | 'book';
  category?: string; attribution?: string;
}
export interface GroundingSources { words: DictionaryRecord[]; expressions: QuotedExpression[]; spellingRules?: GrammarRecord[] }
export interface GroundedAnswer {
  configured: true; reply: string;
  verified: { entryId: string; kasem: string; english: string }[];
  lessonComplete?: boolean;
}

const MAX_RECORDS = 4000;
const LIMIT = 4;
const MISSING = 'I do not have a reviewed record I can quote for that request. I will not guess a Kasem word, assemble a sentence or invent a response. Ask a speaker in Community, or contribute it for review.';
const UNAVAILABLE = 'I could not check the language records just now, so I cannot give a verified answer. Try again, or open the dictionary to check its saved entries.';
export function comparable(value: string): string {
  return normaliseTerm(value).replace(/[’‘]/g, "'").replace(/[.!?]+$/g, '').trim();
}
function clean(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }

/** Ambiguous bundles and editorial instructions are withheld, not rewritten.
 * Accepted forms retain every character from the reviewed source. */
export function quotableForm(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim()) && value.length <= 1200
    && !/[\r\n()[\]{}]|(?:^|\s)\d+[.)]\s/.test(value)
    && !/\b(use this|ignore|instruction|instead|preferred|system prompt)\b/i.test(value);
}

/** The projection is only an index. Its payload and consent are never trusted. */
export function contributorExpression(id: string, source: Record<string, unknown> | undefined): QuotedExpression | null {
  if (!source) return null;
  const portal = source.contributorPortal as Record<string, unknown> | undefined;
  const permissions = source.permissions as Record<string, unknown> | undefined;
  if (!portal || !source.authUid || portal.contributorId !== source.authUid
    || !['APPROVED', 'PUBLISHED'].includes(clean(source.status))
    || permissions?.publication !== true || permissions?.aiTraining !== true
    || source.withdrawn === true || source.deleted === true
    || (permissions.status !== undefined && permissions.status !== 'active')
    || (permissions.expiresAt !== undefined && permissions.expiresAt !== null
      && (!Number.isFinite(Date.parse(String(permissions.expiresAt))) || Date.parse(String(permissions.expiresAt)) <= Date.now()))) return null;
  const english = clean(source.title);
  const candidates = [source.body, ...(Array.isArray(source.alternativeExpressions) ? source.alternativeExpressions : [])]
    .filter(quotableForm).map(clean);
  const forms = [...new Set(candidates)];
  if (!english || !forms.length) return null;
  return { id, english, kasem: forms[0]!, alternatives: forms.slice(1),
    dialect: clean(source.dialect), context: clean(source.usageContext), source: 'contributor' };
}

/** Accept only projections from the existing destination resolver. It rechecks
 * policy, exact revision, reviewer grants, rights, splits and relationships. */
export function releasedExpression(record: ReturnType<typeof knowledgeProjection>): QuotedExpression | null {
  if (record.destination !== 'kawuri' || record.authentication !== 'gold'
    || !['lexicon', 'expressions', 'sentences', 'proverbs'].includes(record.category)
    || (record.valueStates?.english !== undefined && record.valueStates.english !== 'known')
    || !record.english.trim() || !quotableForm(record.original)) return null;
  return { id: record.recordId + '-r' + record.revision, english: record.english, kasem: record.original,
    alternatives: [], dialect: record.region, context: record.context, source: 'corpus',
    category: record.category, attribution: record.attribution };
}

async function loadReleasedExpressions(): Promise<QuotedExpression[]> {
  const expressions: QuotedExpression[] = [];
  let cursor = '';
  for (let page = 0; page < MAX_RECORDS / 100; page++) {
    const result = await resolveKnowledge('kawuri', '', cursor, 100);
    for (const record of result.records) {
      const expression = releasedExpression(record);
      if (expression) expressions.push(expression);
    }
    if (!result.nextCursor) return expressions;
    cursor = result.nextCursor;
  }
  throw new Error('Released corpus requires a paginated retrieval index.');
}

function isWord(data: Record<string, unknown>): boolean {
  return data.isPublished === true && data.contentKind !== 'expression'
    && data.collectionKind !== 'expressions' && !['phrase', 'idiom', 'proverb'].includes(clean(data.lexicalKind));
}

/** Read publication and withdrawal state fresh. No dictionary cache or provider
 * upload; evaluation evidence remains excluded even from this local lookup. */
export async function loadGroundingSources(): Promise<GroundingSources> {
  const db = getFirestore();
  const [dictionary, pairs, evidence, released] = await Promise.all([
    db.collection('dictionaryEntries').where('isPublished', '==', true).limit(MAX_RECORDS + 1).get(),
    db.collection('contributorTrainingPairs').limit(MAX_RECORDS + 1).get(),
    db.collection('kasemEvidence').where('schemaVersion', '==', 2).limit(MAX_RECORDS + 1).get(),
    loadReleasedExpressions(),
  ]);
  if ([dictionary, pairs, evidence].some(snapshot => snapshot.size > MAX_RECORDS)) throw new Error('Grounding index requires pagination.');
  const words = dictionary.docs.flatMap(doc => {
    const data = doc.data();
    const record = isWord(data) ? dictionaryRecordFrom(doc.id, data) : null;
    return record && record.kasem && record.english ? [record] : [];
  });
  const expressions: QuotedExpression[] = [...released];
  // Bound getAll batches; source IDs are Firestore document IDs, not paths from clients.
  for (let offset = 0; offset < pairs.size; offset += 100) {
    const page = pairs.docs.slice(offset, offset + 100);
    const sources = await db.getAll(...page.map(doc => db.collection('submissions').doc(doc.id)));
    for (const source of sources) {
      const record = contributorExpression(source.id, source.data());
      if (record) expressions.push(record);
    }
  }
  if (process.env.KASEM_EVIDENCE_RETRIEVAL !== 'false') {
    const notes = evidence.docs.map(doc => ({ ...doc.data(), id: doc.id }) as EvidenceNote);
    const heldOut = heldOutEvidenceIds(notes);
    for (const note of notes) {
      if (heldOut.has(note.id)) continue;
      for (const row of publicSentences(note, new Date().toISOString())) {
        if (!quotableForm(row.kasem)) continue;
        const context = row.context as { situation?: string; preceding?: string } | undefined;
        expressions.push({ id: clean(row.id), english: clean(row.english), kasem: clean(row.kasem), alternatives: [],
          dialect: clean(row.dialect), context: [context?.situation, context?.preceding].filter(Boolean).join('\n'), source: 'evidence' });
      }
    }
  }
  const spellingRules: GrammarRecord[] = [];
  for (const importId of DIRECT_SOURCE_BOOK_IDS) {
    const importManifest = await db.collection('dictionaryImports').doc(importId).get();
    const sourceManifest = { ...importManifest.data(), importId };
    if (!publishedSourceManifest(importId, sourceManifest)) continue;
    const [sentences, rules, phrases] = await Promise.all([
      db.collection('kasemSentences').where('importId', '==', importId).limit(501).get(),
      db.collection('grammarRules').where('importId', '==', importId).limit(101).get(),
      db.collection('expressionEntries').where('importBatch', '==', importId).limit(101).get(),
    ]);
    if (sentences.size > 500 || rules.size > 100 || phrases.size > 100) throw new Error('Book import exceeds the retrieval bound.');
    for (const doc of sentences.docs) {
      const row = directSourceCorpusRecord(doc.id, doc.data(), sourceManifest);
      if (row && quotableForm(row.kasem)) expressions.push({ id: doc.id, english: row.english, kasem: row.kasem,
        alternatives: [], dialect: row.dialect, context: row.note, source: 'book', attribution: clean(doc.get('attribution')) });
    }
    for (const doc of rules.docs) {
      if (doc.get('status') !== 'published' || doc.get('publicationMode') !== 'owner-direct-source' || doc.get('importId') !== importId) continue;
      const row = grammarRecordFrom(doc.id, doc.data());
      if (row) spellingRules.push(row);
    }
    for (const doc of phrases.docs) {
      if (doc.get('isPublished') === true && doc.get('publicationMode') === 'owner-direct-source' && quotableForm(doc.get('phrase'))) {
        expressions.push({ id: doc.id, english: clean(doc.get('meaning')), kasem: clean(doc.get('phrase')),
          alternatives: [], dialect: clean(doc.get('dialect')), context: clean(doc.get('culturalNote')),
          source: 'book', attribution: clean(doc.get('attribution')) });
      }
    }
  }
  return { words, expressions, spellingRules };
}

export function parseGroundingPlan(raw: unknown): GroundingPlan | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const p = raw as Record<string, unknown>;
  if (!['language', 'app', 'unsupported'].includes(clean(p.kind))
    || typeof p.query !== 'string' || p.query.length > 240
    || typeof p.examples !== 'boolean'
    || !['general', 'greetings', 'gratitude', 'proverbs'].includes(clean(p.category))
    || typeof p.topic !== 'string' || !Object.hasOwn(HELP, p.topic)) return null;
  // Extra text (including a malicious or hallucinated reply) is deliberately discarded.
  return { kind: p.kind as GroundingPlan['kind'], query: p.query,
    examples: p.examples, category: p.category as ExampleCategory, topic: p.topic as HelpTopic };
}

/** Local recognition covers broad requests and recovery when the planner fails. */
export function localGroundingPlan(turns: readonly GroundingTurn[]): GroundingPlan {
  const latest = turns.at(-1)?.text.replace(/@kawuri\b/gi, '').trim() ?? '';
  const base: GroundingPlan = { kind: 'language', query: latest, examples: false, category: 'general', topic: 'about' };
  if (/^(hi|hello|hey|help|what can you do)[.!?]*$/i.test(latest)) return { ...base, kind: 'app' };
  if (/\b(?:open|where|how|find|use|submit|save|manage)\b/i.test(latest)
    && !/\b(?:say|translate|mean|kasem|expression|phrase|pronounce)\b/i.test(latest)) {
    const topic = (Object.keys(HELP) as HelpTopic[]).find(key => key !== 'about' && new RegExp(`\\b${key}\\b`, 'i').test(latest));
    if (topic) return { ...base, kind: 'app', topic };
  }
  if (/\b(?:expression|phrase|greeting|proverb|idiom|vocabulary)s?\b/i.test(latest)
    && /\b(?:some|common|useful|everyday|teach|show|learn|give|help|list|three|few|more)\b/i.test(latest)) {
    const category: ExampleCategory = /\b(?:greeting|hello)s?\b/i.test(latest) ? 'greetings'
      : /\b(?:thank|gratitude)\b/i.test(latest) ? 'gratitude' : /\b(?:proverb|idiom)s?\b/i.test(latest) ? 'proverbs' : 'general';
    return { ...base, examples: true, category };
  }
  const query = sentenceRequest(latest) || translationTerms(latest)[0];
  if (query) return { ...base, query };
  if (/^(?:yes|more|continue|another|some more|give me more|show me more)[.!?]*$/i.test(latest)) {
    const prior = turns.slice(0, -1).filter(turn => turn.role === 'user');
    if (prior.length) return localGroundingPlan(prior);
  }
  return base;
}

function queryWasAsked(query: string, turns: readonly GroundingTurn[]): boolean {
  const wanted = comparable(query);
  // Prefer the current user turn. Only explicit references may reuse earlier user text.
  const latest = turns.at(-1)?.text ?? '';
  const candidates = /\b(?:that|it|those|same|again|more|continue)\b/i.test(latest)
    ? turns.filter(turn => turn.role === 'user') : turns.slice(-1).filter(turn => turn.role === 'user');
  return Boolean(wanted) && candidates.some(turn =>
    (` ${comparable(turn.text)} `).includes(` ${wanted} `));
}

export function chooseGroundingPlan(turns: readonly GroundingTurn[], planned: GroundingPlan | null): GroundingPlan {
  const local = localGroundingPlan(turns);
  if (isSpellingQuestion(turns.at(-1)?.text ?? '') || isBookGrammarQuestion(turns.at(-1)?.text ?? '')) return { ...local, kind: 'language', query: turns.at(-1)?.text ?? '' };
  if (local.examples || local.kind === 'app') return local;
  if (!planned) return local;
  if (planned.kind === 'app') return planned;
  if (planned.kind === 'language' && !planned.examples && queryWasAsked(planned.query, turns)) return planned;
  // Examples can only be enabled by an actual user's broad request, never a model instruction.
  return local;
}

function expressionBlock(record: QuotedExpression, index: number): string {
  return [`${index + 1}. Recorded meaning: ${record.english}`, `Kasem: ${record.kasem}`,
    ...record.alternatives.map(form => `Recorded alternative: ${form}`),
    record.dialect ? `Recorded dialect: ${record.dialect}` : '',
    record.context ? `${record.source === 'book' ? 'Source context' : "Contributor's recorded context"}: ${record.context}` : '',
    record.attribution ? `Recorded attribution: ${record.attribution}` : '',
    `Source: ${record.source === 'book' ? 'printed book record, published directly by owner request; no speaker review claimed' : record.source === 'contributor' ? 'reviewed contributor expression' : record.source === 'corpus'
      ? 'authenticated Kawuri corpus (' + record.id + ')' : 'reviewed sentence evidence'}.`]
    .filter(Boolean).join('\n');
}
function wordBlock(record: DictionaryRecord, index: number): string {
  return [`${index + 1}. Recorded meaning: ${record.english}`, `Kasem: ${record.kasem}`,
    ...record.renderings.filter(form => form !== record.kasem).map(form => `Recorded alternative: ${form}`),
    record.dialect ? `Recorded dialect: ${record.dialect}` : '', 'Source: published dictionary.']
    .filter(Boolean).join('\n');
}
function categoryMatches(record: QuotedExpression, category: ExampleCategory): boolean {
  if (record.category === 'lexicon') return false;
  if (category === 'proverbs') return record.source === 'corpus' && record.category === 'proverbs';
  if (category === 'greetings') return /^(?:hello|hi|how are you|good (?:morning|afternoon|evening|night)|welcome|goodbye|see you)/i.test(record.english);
  if (category === 'gratitude') return /^thank/i.test(record.english);
  return true;
}

export function renderGroundedAnswer(plan: GroundingPlan, sources: GroundingSources): GroundedAnswer {
  const result = (reply: string, words: DictionaryRecord[] = []): GroundedAnswer => ({ configured: true, reply,
    verified: words.map(word => ({ entryId: word.id, kasem: word.kasem, english: word.english })) });
  if (plan.kind === 'app') return result(HELP[plan.topic]);
  if (plan.kind === 'unsupported') return result(HELP.about);
  if (isSpellingQuestion(plan.query)) {
    const rules = matchSpellingRules(sources.spellingRules ?? [], plan.query.replace(/\bspell\b/gi, 'spelling'));
    if (rules.length) return result(['Kasem spelling reference — Kasem Language Committee, Bureau of Ghana Languages, 1997. Ghana Kasem writing:',
      ...rules.map(rule => [rule.title, rule.summary, rule.note,
        ...rule.examples.map(example => `${example.kasem} — ${example.english}`), `Source rule: ${rule.id}`].filter(Boolean).join('\n')),
      'Read the complete spelling guide: https://kasem-dictionary.web.app/spelling-guide.html'].join('\n\n'));
  }
  if (isBookGrammarQuestion(plan.query)) {
    const rules = matchBookGrammarRules(sources.spellingRules ?? [], plan.query);
    if (rules.length) return result(['Kasem grammar reference — P. L. Hewer, A Basic Grammar of Kasem, GILLBT, first printed 1983; supplied 2014 printing.',
      ...rules.map(rule => [rule.title, rule.summary, rule.note,
        ...rule.examples.map(example => `${example.kasem} — ${example.english}`), `Source rule: ${rule.id}`].filter(Boolean).join('\n')),
      'Read the complete grammar guide: https://kasem-dictionary.web.app/grammar-guide.html'].join('\n\n'));
    if (/\bgrammar\b/i.test(plan.query)) return result('The grammar guide covers sounds and writing, greetings, clauses, noun phrases and pronouns, place and time, joining clauses, noun classes, verb phrases, and small words and questions. Read the book reference: https://kasem-dictionary.web.app/grammar-guide.html');
  }
  const wanted = comparable(plan.query);
  const expressions = sources.expressions.filter(record => plan.examples ? categoryMatches(record, plan.category)
    : [record.english, record.kasem, ...record.alternatives].some(form => comparable(form) === wanted))
    .sort((a, b) => a.english.localeCompare(b.english) || a.id.localeCompare(b.id))
    .filter((record, index, all) => all.findIndex(other => comparable(other.english) === comparable(record.english)
      && other.kasem === record.kasem) === index).slice(0, LIMIT);
  if (expressions.length) return result([
    expressions.some(record => record.source === 'book') ? 'These published source records match your request:' : plan.examples ? 'Here are reviewed expressions from our records:' : 'These reviewed records match the wording you asked about:',
    ...expressions.map(expressionBlock),
    'These are recorded forms, not a claim that they fit every situation. Check the recorded context and dialect; ask a speaker when your situation differs.',
  ].join('\n\n'));
  if (plan.examples) return result(MISSING);
  const words = sources.words.filter(word => [word.english, ...englishSenses(word), ...word.renderings]
    .some(form => comparable(form) === wanted)).slice(0, LIMIT);
  if (words.length) return result(['The published dictionary records:', ...words.map(wordBlock)].join('\n\n'), words);
  return result(MISSING);
}

function isSpellingQuestion(question: string): boolean {
  return /\b(spell(?:ing)?|orthography|alphabet|vowels?|consonants?|tone|diacritics?|labiali[sz]ation|word division|hyphens?)\b/i.test(question);
}

function isBookGrammarQuestion(question: string): boolean {
  return /\b(grammar|tenses?|aspect|past|future|present|continuous|progressive|habitual|noun(?:s| classes?)?|clauses?|word order|pronouns?|determiners?|articles?|numerals?|counting|conditionals?|adjectives?|adverbs?|possessi\w+|relative|agreement|imperatives?|commands?|particles?|questions?|negatives?|negation|joining|purpose|result)\b/i.test(question);
}

export function renderGroundedLesson(turns: readonly GroundingTurn[], entries: DictionaryRecord[]): GroundedAnswer {
  const words = entries.slice(0, LIMIT);
  const verified = words.map(word => ({ entryId: word.id, kasem: word.kasem, english: word.english }));
  if (!words.length) return { configured: true, reply: MISSING, verified, lessonComplete: true };
  const word = words[0]!;
  const previousQuestions = turns.filter(turn => turn.role === 'model' && turn.text.includes('Practice question:')).length;
  const attempted = turns.at(-1)?.text ?? '';
  if (previousQuestions > 0) {
    const correct = word.renderings.some(form => comparable(form) === comparable(attempted));
    if (!correct) return { configured: true, reply: ['That does not match the recorded spelling. The dictionary records:', wordBlock(word, 0),
      'Practice question: Can you type the recorded Kasem form?'].join('\n\n'), verified, lessonComplete: false };
    if (previousQuestions >= 3) return { configured: true, reply: ['That matches the recorded spelling. Practice complete.', wordBlock(word, 0)].join('\n\n'), verified, lessonComplete: true };
  }
  return { configured: true, reply: [previousQuestions ? 'That matches the recorded spelling.' : 'Let us practise a published dictionary word.',
    wordBlock(word, 0), 'Practice question: Can you type the recorded Kasem form?'].join('\n\n'), verified, lessonComplete: false };
}

export async function groundedAnswerFor(turns: readonly GroundingTurn[], planned: GroundingPlan | null,
  load: () => Promise<GroundingSources> = loadGroundingSources): Promise<GroundedAnswer> {
  const plan = chooseGroundingPlan(turns, planned);
  if (plan.kind === 'app' || plan.kind === 'unsupported') return renderGroundedAnswer(plan, { words: [], expressions: [] });
  try { return renderGroundedAnswer(plan, await load()); }
  catch (error) {
    logger.warn('Kawuri grounding unavailable; returning no language', { errorType: error instanceof Error ? error.name : 'unknown' });
    return { configured: true, reply: UNAVAILABLE, verified: [] };
  }
}
