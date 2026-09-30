/**
 * The language loop: one id per word, requests, what a reviewer may decide an
 * answer becomes, the records those decisions write, Kawuri's lessons and its
 * account of words it cannot verify.
 *
 * Pure helpers only; the callables' transactions are exercised by the
 * emulator suites.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  ANONYMOUS_CREDIT,
  PUBLISH_AS,
  buildLanguageResourceDocument,
  buildQueueTrainingPair,
  contributorCredit,
  languageResourceId,
  languageResourceKindFor,
  parsePublishAs,
  parseRequestSource,
  parseRequestTopic,
  parseRequestedWord,
  publishAsProblem,
  queueAnswerAsExpression,
  queueWordIdFor,
  requestedQueueRow,
  unverifiedBriefing,
  unverifiedStateFor,
} from '../../services/functions/lib/language-loop.js';
import {
  LESSON_COMPLETE_MARKER,
  lessonRules,
  lessonTermsFrom,
  parseLessonRequest,
  stripLessonMarker,
} from '../../services/functions/lib/kawuri-lessons.js';
import { parseQueueOrigin, parseWordTranslationInput } from '../../services/functions/lib/word-queue.js';
import { publicationTargetFor } from '../../services/functions/lib/publication.js';
import { expressionFromSubmission } from '../../services/functions/lib/expressions.js';

const seed = readFileSync(new URL('../../data/word-seed/word-queue.ndjson', import.meta.url), 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line));

test('a word has the same queue id however it is reached, matching every seeded row', () => {
  assert.ok(seed.length > 10_000);
  for (const row of seed) {
    assert.equal(queueWordIdFor(row.word), row.id, `id for "${row.word}"`);
  }
  // Case never splits one word into two requests.
  assert.equal(queueWordIdFor('Goat'), queueWordIdFor('goat'));
});

test('requested words are English, short and lowercased', () => {
  assert.equal(parseRequestedWord('  Goat '), 'goat');
  assert.equal(parseRequestedWord('Good   morning'), 'good morning');
  assert.equal(parseRequestedWord("don't"), "don't");
  assert.equal(parseRequestedWord('a'), 'a');
  for (const bad of ['', '   ', 'goat2', 'one two three four', 'kɔ', 'x'.repeat(41), '-goat', 42, null]) {
    assert.throws(() => parseRequestedWord(bad), { code: 'invalid-argument' }, String(bad));
  }
});

test('a topic is one of the dictionary subject fields, and a source defaults to search', () => {
  assert.equal(parseRequestTopic('Animals'), 'animals');
  assert.equal(parseRequestTopic(''), null);
  assert.throws(() => parseRequestTopic('technology'), { code: 'invalid-argument' });
  assert.equal(parseRequestSource('topic'), 'topic');
  assert.equal(parseRequestSource('elsewhere'), 'search');
});

test('a requested row sits among the common words, names its topic and never its asker', () => {
  const row = requestedQueueRow('goat', 'animals', '2026-09-28T10:00:00.000Z');
  assert.equal(row.id, queueWordIdFor('goat'));
  assert.equal(row.status, 'open');
  assert.equal(row.tier, 'requested');
  assert.ok(row.rank < 1000);
  assert.deepEqual(row.topics, ['animals']);
  assert.equal(row.sentence, '');
  assert.equal(row.requestCount, 1);
  assert.equal(JSON.stringify(row).includes('uid'), false);
});

test('publishAs defaults to a headword and refuses anything unknown', () => {
  assert.deepEqual([...PUBLISH_AS], ['headword', 'variant', 'expression', 'example', 'translation-pair', 'training']);
  assert.equal(parsePublishAs(undefined), 'headword');
  assert.equal(parsePublishAs('Example'), 'example');
  assert.throws(() => parsePublishAs('poem'), { code: 'invalid-argument' });
  assert.equal(languageResourceKindFor('example'), 'example');
  assert.equal(languageResourceKindFor('translation-pair'), 'translation-pair');
  assert.equal(languageResourceKindFor('training'), null);
  assert.equal(languageResourceKindFor('headword'), null);
});

const answer = {
  title: 'water',
  body: 'na',
  translations: ['na'],
  dialect: 'Paga',
  kasemExample: 'na bam zura mo',
  englishExample: 'I drank water.',
  authUid: 'member-1',
  wordQueueId: queueWordIdFor('water'),
  wordQueueOrigin: 'explore',
  wordQueuePrompt: {
    word: 'water',
    sentence: 'She drank a glass of water.',
    sentenceSource: 'tatoeba',
    tatoebaId: '1234',
    tatoebaContributor: 'CK',
    licence: 'CC BY 2.0 FR',
  },
  permissions: { publication: true, aiTraining: false, consentVersion: 'collection-contribution-v1' },
  attribution: { preference: 'name' },
};

test('training use needs the contributor’s consent; examples and pairs need their sentences', () => {
  assert.match(publishAsProblem('training', answer), /did not agree/);
  assert.equal(publishAsProblem('training', { ...answer, permissions: { ...answer.permissions, aiTraining: true } }), null);
  assert.equal(publishAsProblem('example', answer), null);
  assert.match(publishAsProblem('example', { ...answer, kasemExample: '' }), /no Kasem sentence/);
  assert.equal(publishAsProblem('translation-pair', answer), null);
  assert.match(
    publishAsProblem('translation-pair', { ...answer, kasemExample: '' }),
    /English sentence and its Kasem/,
  );
  assert.equal(publishAsProblem('headword', { ...answer, kasemExample: '' }), null);
});

test('credit follows the contributor’s choice and never publishes an e-mail address', () => {
  assert.equal(contributorCredit(answer, 'Akua'), 'Akua');
  assert.equal(contributorCredit({ ...answer, attribution: { preference: 'anonymous' } }, 'Akua'), ANONYMOUS_CREDIT);
  assert.equal(contributorCredit(answer, 'akua@example.com'), ANONYMOUS_CREDIT);
  assert.equal(contributorCredit({}, ''), ANONYMOUS_CREDIT);
});

test('a language resource carries its provenance, its sentence licence and a withdrawal pointer', () => {
  const doc = buildLanguageResourceDocument({
    submissionId: 's1',
    contributionId: 'c1',
    submission: answer,
    kind: 'translation-pair',
    publish: true,
    entryId: null,
    displayName: 'Akua',
    existing: null,
    now: '2026-09-28T10:00:00.000Z',
  });
  assert.equal(doc.id, languageResourceId('s1'));
  assert.equal(doc.isPublished, true);
  assert.equal(doc.english, 'water');
  assert.equal(doc.kasem, 'na');
  assert.equal(doc.englishSentence, 'She drank a glass of water.');
  assert.deepEqual(doc.englishSentenceCredit, { source: 'Tatoeba', id: '1234', contributor: 'CK', licence: 'CC BY 2.0 FR' });
  assert.equal(doc.kasemSentence, 'na bam zura mo');
  assert.equal(doc.credit, 'Akua');
  assert.deepEqual(doc.sourceContribution, { collection: 'collectionContributions', id: 'c1' });
  assert.equal(doc.provenance.origin, 'explore');
  assert.equal(doc.provenance.wordQueueId, queueWordIdFor('water'));
  assert.equal(doc.consent.aiTraining, false);
  assert.equal(doc.publishedAt, '2026-09-28T10:00:00.000Z');
  // Nothing about the member beyond the credit they allowed.
  assert.equal(JSON.stringify(doc).includes('member-1'), false);

  const approved = buildLanguageResourceDocument({
    submissionId: 's1', contributionId: 'c1', submission: answer, kind: 'example', publish: false,
    entryId: 'collection_e1', displayName: 'Akua', existing: doc, now: '2026-09-29T10:00:00.000Z',
  });
  assert.equal(approved.isPublished, false);
  assert.equal(approved.entryId, 'collection_e1');
  assert.equal(approved.createdAt, doc.createdAt);
});

test('a training pair has the contributor portal’s shape', () => {
  const pair = buildQueueTrainingPair({ submissionId: 's1', submission: answer, reviewedAt: 'now' });
  assert.equal(pair.id, 's1');
  assert.equal(pair.kind, 'word-queue');
  assert.equal(pair.english, 'water');
  assert.equal(pair.kasem, 'na');
  assert.equal(pair.sourceSubmission, 's1');
  assert.equal(pair.contributorId, 'member-1');
});

test('an answer published as an expression is the member’s own, and an idiom stays one', () => {
  const expression = expressionFromSubmission(queueAnswerAsExpression({ ...answer, sentenceFit: 'idiom' }));
  assert.equal(expression.phrase, 'na');
  assert.equal(expression.meaning, 'water');
  assert.equal(expression.kind, 'idiom');
  assert.equal(expression.source.type, 'self');
  assert.match(expression.source.detail, /word queue/);
});

test('a withdrawal reaches an answer published as a language resource', () => {
  const target = publicationTargetFor(
    { ...answer, collectionKind: 'dictionary', moderation: { publishedContent: { collection: 'languageResources', id: 'lr_s1' } } },
    's1',
  );
  assert.deepEqual(target, { collection: 'languageResources', id: 'lr_s1' });
  // A forged pointer at somebody else's record is not trusted.
  const forged = publicationTargetFor(
    { ...answer, collectionKind: 'dictionary', moderation: { publishedContent: { collection: 'languageResources', id: 'lr_other' } } },
    's1',
  );
  assert.notEqual(forged.id, 'lr_other');
});

test('Kawuri reports where an unverified word stands, without ever seeing unreviewed Kasem', () => {
  assert.equal(unverifiedStateFor(null), 'not-in-queue');
  assert.equal(unverifiedStateFor({ status: 'open', pendingCount: 2 }), 'waiting-review');
  assert.equal(unverifiedStateFor({ status: 'open', pendingCount: 0 }), 'unanswered');
  assert.equal(unverifiedStateFor({ status: 'translated' }), 'translated');
  assert.equal(unverifiedStateFor({ status: 'retired' }), 'not-in-queue');
  const briefing = unverifiedBriefing([
    { term: 'goat', wordQueueId: 'goat-x', state: 'waiting-review' },
    { term: 'granary', wordQueueId: 'granary-x', state: 'not-in-queue' },
  ]);
  assert.match(briefing, /"goat".*waiting for a reviewer/);
  assert.match(briefing, /not verified yet/);
  assert.match(briefing, /must not guess/);
  assert.match(briefing, /"granary"/);
  assert.equal(unverifiedBriefing([]), '');
});

test('a lesson request names an entry or a post, and nothing else', () => {
  assert.deepEqual(parseLessonRequest({ kind: 'entry', id: 'collection_abc' }), { kind: 'entry', id: 'collection_abc' });
  assert.deepEqual(parseLessonRequest({ kind: 'community', id: 'p1' }), { kind: 'community', id: 'p1' });
  assert.equal(parseLessonRequest(null), null);
  assert.equal(parseLessonRequest({ kind: 'entry' }), null);
  assert.throws(() => parseLessonRequest({ kind: 'course', id: 'x' }), { code: 'invalid-argument' });
  assert.throws(() => parseLessonRequest({ kind: 'entry', id: '../secrets' }), { code: 'invalid-argument' });
});

test('the lesson marker is stripped and reported however the model formats it', () => {
  assert.deepEqual(stripLessonMarker(`Well done!\n${LESSON_COMPLETE_MARKER}`), { reply: 'Well done!', complete: true });
  assert.deepEqual(stripLessonMarker('Well done! `[[ lesson-complete ]]`  '), { reply: 'Well done!', complete: true });
  assert.deepEqual(stripLessonMarker('How do you say water?'), { reply: 'How do you say water?', complete: false });
  assert.match(lessonRules('the word na', ''), /\[\[lesson-complete\]\]/);
  assert.match(lessonRules('a post', 'The post is the topic, not a source.'), /not a source/);
});

test('a post lesson looks up the words the post is about, not its filler', () => {
  const terms = lessonTermsFrom('Women shaping clay pots', 'Pottery in Sirigu: the women of the village shape clay by hand.');
  assert.ok(terms.includes('women'));
  assert.ok(terms.includes('clay'));
  assert.ok(terms.includes('pottery'));
  assert.equal(terms.includes('the'), false);
  assert.equal(terms.includes('by'), false);
});

test('a queue answer carries its origin, its credit choice and consent only when given', () => {
  const base = { wordId: 'water-abc123', translations: 'na', partOfSpeech: 'noun', dialect: 'Paga' };
  const plain = parseWordTranslationInput(base, 'member-1');
  assert.equal(plain.aiTraining, false);
  assert.equal(plain.credit, 'name');
  assert.equal(plain.origin, 'queue');
  assert.equal(plain.reviseContributionId, null);
  const chosen = parseWordTranslationInput({
    ...base, aiTraining: true, credit: 'anonymous', origin: 'explore', reviseContributionId: 'c123',
  }, 'member-1');
  assert.equal(chosen.aiTraining, true);
  assert.equal(chosen.credit, 'anonymous');
  assert.equal(chosen.origin, 'explore');
  assert.equal(chosen.reviseContributionId, 'c123');
  // Consent is never inferred from something that merely looks like yes.
  assert.equal(parseWordTranslationInput({ ...base, aiTraining: 'true' }, 'member-1').aiTraining, false);
  assert.equal(parseQueueOrigin('kawuri'), 'kawuri');
  assert.equal(parseQueueOrigin('elsewhere'), 'queue');
});
