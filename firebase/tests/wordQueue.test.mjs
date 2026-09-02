// Pure unit tests for the guided word queue — no emulator, no network.
//
//   npm run build:functions && node --test firebase/tests/wordQueue.test.mjs
//
// The subject is a fifteen-thousand-row production collection and the pure
// functions that decide what a member is shown, what their answer becomes, and
// when a word stops being asked. Every one of those is a silent failure if it
// goes wrong: a filter that leaks re-offers a word somebody already skipped, a
// counter that double-counts pins a word out of the queue for ever, and an
// attribution helper that invents a contributor is a licence breach that no
// test suite anywhere else in this repo would catch.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  LEXICAL_KINDS,
  MAX_TRANSLATIONS,
  MAX_TRANSLATION_LENGTH,
  PARTS_OF_SPEECH,
  canonicalLexicalKind,
  canonicalPartOfSpeech,
  isPartOfSpeechId,
  normaliseTranslations,
  parseTranslations,
  partOfSpeechLabel,
} from '../../services/functions/lib/lexical-kinds.js';

import {
  MAX_PROGRESS_IDS,
  appendProgressId,
  buildWordQueueContributionInput,
  nextQueueRowState,
  parseQueueBatchLimit,
  parseWordTranslationInput,
  progressIds,
  queueOutcomeForStatus,
  queueWordAttribution,
  selectQueueBatch,
  wordQueuePromptStamp,
  wordQueueSourceLine,
} from '../../services/functions/lib/word-queue.js';

import {
  buildCollectionSubmissionDocument,
  parseCollectionContributionInput,
} from '../../services/functions/lib/collection-contributions.js';

import {
  buildPublishedContentDocument,
  submissionTranslations,
} from '../../services/functions/lib/publication.js';

const NOW = '2026-09-02T09:00:00.000Z';
const uid = 'member-1';

/** A seeded row, in the exact shape data/word-seed/word-queue.ndjson ships. */
function row(overrides = {}) {
  return {
    id: 'the-bbccdf',
    word: 'the',
    lookup: 'the',
    sentence: 'All you have to do is wash the dishes.',
    sentenceSource: 'tatoeba',
    tatoebaId: '16521',
    tatoebaContributor: 'CK',
    licence: 'CC BY 2.0 FR',
    tier: 'core',
    rank: 1,
    status: 'open',
    approvedCount: 0,
    pendingCount: 0,
    skipCount: 0,
    ...overrides,
  };
}

function answer(overrides = {}) {
  return {
    wordId: 'the-bbccdf',
    translations: 'kʋm, nɩ',
    partOfSpeech: 'noun',
    dialect: 'Navrongo',
    ...overrides,
  };
}

// ── parseTranslations: the field the whole dictionary hangs off ──────────────

test('commas and slashes both split, and so does a keyboard return', () => {
  assert.deepEqual(parseTranslations('water, rain'), ['water', 'rain']);
  assert.deepEqual(parseTranslations('hello / good morning'), ['hello', 'good morning']);
  assert.deepEqual(parseTranslations('a, b / c\nd'), ['a', 'b', 'c', 'd']);
  // Runs of separators are one separator, not several empty translations.
  assert.deepEqual(parseTranslations('a,,//b'), ['a', 'b']);
});

test('whitespace is trimmed and collapsed, so one answer is one answer', () => {
  assert.deepEqual(parseTranslations('  water  ,   rain water '), ['water', 'rain water']);
  assert.deepEqual(parseTranslations('good   morning'), ['good morning']);
});

test('duplicates go, case-insensitively, and the first spelling is the one kept', () => {
  assert.deepEqual(parseTranslations('Water, water, WATER'), ['Water']);
  assert.deepEqual(parseTranslations('rain / Rain water / rain'), ['rain', 'Rain water']);
  // Order-stable: re-parsing stored output changes nothing.
  const once = parseTranslations('Water, rain, water');
  assert.deepEqual(parseTranslations(once.join(', ')), once);
});

test('junk yields nothing rather than an entry made of punctuation', () => {
  for (const junk of ['', '   ', ',,,', '///', '\n\n', ' , / , ']) {
    assert.deepEqual(parseTranslations(junk), []);
  }
  // Not a string at all — the parser is total and never throws.
  assert.deepEqual(parseTranslations(undefined), []);
  assert.deepEqual(parseTranslations(null), []);
  assert.deepEqual(parseTranslations(42), []);
});

test('the count is capped after de-duplication, not before', () => {
  // Twelve pieces, four of them repeats: eight distinct survive rather than the
  // first eight pieces typed.
  const typed = 'a, b, c, d, a, e, f, b, g, h, i, j';
  const parsed = parseTranslations(typed);
  assert.equal(parsed.length, MAX_TRANSLATIONS);
  assert.deepEqual(parsed, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
});

test('an over-long translation is truncated, not thrown away with its neighbours', () => {
  const essay = 'x'.repeat(MAX_TRANSLATION_LENGTH + 80);
  const parsed = parseTranslations(`${essay}, water`);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].length, MAX_TRANSLATION_LENGTH);
  // The good translation beside the paste survives, which is the whole point of
  // truncating rather than rejecting.
  assert.equal(parsed[1], 'water');
});

test('a list arrives at the same answer as the string it came from', () => {
  assert.deepEqual(normaliseTranslations(['water', 'Water', 'rain']), ['water', 'rain']);
  assert.deepEqual(normaliseTranslations('water, Water, rain'), ['water', 'rain']);
  assert.deepEqual(normaliseTranslations(['water, rain']), ['water', 'rain']);
  assert.deepEqual(normaliseTranslations(null), []);
  assert.deepEqual(normaliseTranslations({ water: true }), []);
});

// ── The word-class list ──────────────────────────────────────────────────────

test('every part of speech is an { id, label } with a unique, storable id', () => {
  assert.ok(PARTS_OF_SPEECH.length >= 25);
  const ids = new Set();
  for (const entry of PARTS_OF_SPEECH) {
    assert.equal(typeof entry.id, 'string');
    assert.equal(typeof entry.label, 'string');
    assert.ok(entry.id.length > 0 && entry.label.length > 0);
    assert.match(entry.id, /^[a-z][a-z-]*$/, `${entry.id} must be a stable slug`);
    assert.equal(ids.has(entry.id), false, `${entry.id} is listed twice`);
    ids.add(entry.id);
  }
});

test('the list describes a language, ideophones included', () => {
  const ids = PARTS_OF_SPEECH.map((entry) => entry.id);
  for (const required of [
    'noun', 'proper-noun', 'pronoun', 'verb', 'auxiliary-verb', 'adjective', 'adverb',
    'preposition', 'postposition', 'conjunction', 'determiner', 'article', 'numeral',
    'quantifier', 'particle', 'interjection', 'ideophone', 'classifier', 'prefix',
    'suffix', 'phrase', 'idiom', 'proverb', 'other', 'unknown',
  ]) {
    assert.ok(ids.includes(required), `${required} is missing from PARTS_OF_SPEECH`);
  }
  // Named on its own line because it is the one the six-item dropdown forced
  // into "other", and Kasem has a great many of them.
  assert.ok(isPartOfSpeechId('ideophone'));
});

test('ids, labels and the abbreviations linguists actually type all resolve', () => {
  assert.equal(canonicalPartOfSpeech('proper-noun'), 'proper-noun');
  assert.equal(canonicalPartOfSpeech('Proper noun'), 'proper-noun');
  assert.equal(canonicalPartOfSpeech('proper_noun'), 'proper-noun');
  assert.equal(canonicalPartOfSpeech('  ADJ '), 'adjective');
  assert.equal(canonicalPartOfSpeech('Noun'), 'noun');
  assert.equal(canonicalPartOfSpeech('expressive'), 'ideophone');
  assert.equal(partOfSpeechLabel('ideophone'), 'Ideophone');
  // Null, not a silent fall back to "unknown": the caller decides whether an
  // unrecognised class is a client bug or historical data.
  assert.equal(canonicalPartOfSpeech('gerundive-transgressive'), null);
  assert.equal(canonicalPartOfSpeech(null), null);
});

test('a word, a phrase, an idiom and a proverb are four different things', () => {
  assert.deepEqual([...LEXICAL_KINDS], ['word', 'phrase', 'idiom', 'proverb']);
  assert.equal(canonicalLexicalKind('proverb'), 'proverb');
  assert.equal(canonicalLexicalKind('Idiom'), 'idiom');
  assert.equal(canonicalLexicalKind('saying'), 'proverb');
  // The default, which is what a song and every pre-existing record carries.
  assert.equal(canonicalLexicalKind(undefined), 'word');
  assert.equal(canonicalLexicalKind('nonsense'), 'word');
});

// ── Licensing: Tatoeba credit is shown, and never invented ───────────────────

test('an attributed sentence carries its id, contributor and licence', () => {
  const attribution = queueWordAttribution(row());
  assert.deepEqual(attribution, {
    tatoebaId: '16521',
    contributor: 'CK',
    licence: 'CC BY 2.0 FR',
  });
  const line = wordQueueSourceLine(row());
  assert.match(line, /#16521/);
  assert.match(line, /CK/);
  assert.match(line, /CC BY 2\.0 FR/);
});

test('an unattributed sentence gets NO credit rather than an invented one', () => {
  const unattributed = row({
    sentenceSource: 'unattributed',
    tatoebaId: null,
    tatoebaContributor: null,
    licence: null,
    sentence: 'Maya walked to the station before sunrise. [Original example]',
  });
  assert.equal(queueWordAttribution(unattributed), null);

  const line = wordQueueSourceLine(unattributed);
  assert.match(line, /no third-party credit/);
  assert.equal(/Tatoeba/.test(line), false);
  assert.equal(/CC BY/.test(line), false);

  const stamp = wordQueuePromptStamp('to-4374aa', unattributed);
  assert.equal(stamp.tatoebaId, null);
  assert.equal(stamp.tatoebaContributor, null);
  assert.equal(stamp.licence, null);
  assert.equal(stamp.sentenceSource, 'unattributed');
});

test('a row claiming Tatoeba with no id still gets no credit', () => {
  assert.equal(queueWordAttribution(row({ tatoebaId: null })), null);
  assert.equal(queueWordAttribution(row({ tatoebaId: '' })), null);
  // A contributor Tatoeba records as anonymous keeps the id and the licence,
  // and simply names nobody.
  const anonymous = queueWordAttribution(row({ tatoebaContributor: '' }));
  assert.equal(anonymous.contributor, '');
  assert.equal(/ by /.test(wordQueueSourceLine(row({ tatoebaContributor: '' }))), false);
});

// ── Choosing a batch ─────────────────────────────────────────────────────────

function queueRows(...specs) {
  return specs.map(([id, rank, pendingCount = 0]) => ({
    id,
    data: row({ id, word: id, rank, pendingCount }),
  }));
}

test('words the member has answered or skipped never come back', () => {
  const rows = queueRows(['a', 1], ['b', 2], ['c', 3], ['d', 4]);
  const batch = selectQueueBatch(rows, { answered: ['b'], skipped: ['d'] }, 10);
  assert.deepEqual(batch.words.map((word) => word.id), ['a', 'c']);
  assert.equal(batch.freshCount, 2);
});

test('rank order survives the filter, so the commonest words come first', () => {
  const rows = queueRows(['a', 1], ['b', 2], ['c', 3], ['d', 4], ['e', 5]);
  const batch = selectQueueBatch(rows, { answered: ['a'], skipped: [] }, 3);
  assert.deepEqual(batch.words.map((word) => word.id), ['b', 'c', 'd']);
  assert.deepEqual(batch.words.map((word) => word.rank), [2, 3, 4]);
});

test('a word somebody else is answering is deprioritised, not withheld', () => {
  // b and c are in review; a and d are free.
  const rows = queueRows(['a', 1], ['b', 2, 1], ['c', 3, 2], ['d', 4]);
  const batch = selectQueueBatch(rows, { answered: [], skipped: [] }, 10);
  // Free words first, in rank order, then the busy ones behind them — also in
  // rank order.
  assert.deepEqual(batch.words.map((word) => word.id), ['a', 'd', 'b', 'c']);
  assert.equal(batch.freshCount, 2);
});

test('when every open word is in review the queue still hands some out', () => {
  // The case that killed the exclude-them design: a review backlog must not
  // empty the queue.
  const rows = queueRows(['a', 1, 1], ['b', 2, 3], ['c', 3, 1]);
  const batch = selectQueueBatch(rows, { answered: [], skipped: [] }, 2);
  assert.deepEqual(batch.words.map((word) => word.id), ['a', 'b']);
  assert.equal(batch.freshCount, 0);
});

test('the limit is honoured and an empty scan is not an error', () => {
  const rows = queueRows(['a', 1], ['b', 2], ['c', 3]);
  assert.equal(selectQueueBatch(rows, { answered: [], skipped: [] }, 2).words.length, 2);
  assert.equal(selectQueueBatch(rows, { answered: [], skipped: [] }, 0).words.length, 0);
  assert.deepEqual(
    selectQueueBatch(rows, { answered: ['a', 'b', 'c'], skipped: [] }, 5).words,
    [],
  );
  assert.deepEqual(selectQueueBatch([], { answered: [], skipped: [] }, 5).words, []);
});

test('the batch carries the sentence and its credit, so the client cannot omit them', () => {
  const [word] = selectQueueBatch(
    [{ id: 'the-bbccdf', data: row() }],
    { answered: [], skipped: [] },
    1,
  ).words;
  assert.equal(word.word, 'the');
  assert.equal(word.sentence, 'All you have to do is wash the dishes.');
  assert.equal(word.attribution.tatoebaId, '16521');
  assert.equal(word.attribution.contributor, 'CK');
});

test('the batch size is clamped rather than trusted', () => {
  assert.equal(parseQueueBatchLimit(undefined), 20);
  assert.equal(parseQueueBatchLimit({}), 20);
  assert.equal(parseQueueBatchLimit({ limit: 5 }), 5);
  assert.equal(parseQueueBatchLimit({ limit: 5000 }), 50);
  assert.equal(parseQueueBatchLimit({ limit: 0 }), 1);
  assert.equal(parseQueueBatchLimit({ limit: -3 }), 1);
  assert.equal(parseQueueBatchLimit({ limit: 7.9 }), 7);
  assert.throws(
    () => parseQueueBatchLimit({ limit: 'twenty' }),
    (error) => error?.code === 'invalid-argument',
  );
});

// ── The member's progress document ───────────────────────────────────────────

test('progress lists are read defensively and appended without duplicates', () => {
  assert.deepEqual(progressIds(['a', 'b']), ['a', 'b']);
  assert.deepEqual(progressIds(['a', 7, null, '', 'b']), ['a', 'b']);
  assert.deepEqual(progressIds(undefined), []);
  assert.deepEqual(progressIds('a'), []);

  assert.deepEqual(appendProgressId(['a'], 'b'), ['a', 'b']);
  // Idempotent, and the id does not move — which is how the callable tells a
  // real skip from a retry of one.
  assert.deepEqual(appendProgressId(['a', 'b'], 'a'), ['a', 'b']);
  assert.equal(appendProgressId(['a', 'b'], 'a').length, 2);
});

test('at the cap the oldest ids are dropped, never the newest', () => {
  const full = Array.from({ length: 4 }, (_, index) => `w${index}`);
  assert.deepEqual(appendProgressId(full, 'w4', 4), ['w1', 'w2', 'w3', 'w4']);
  // The real cap is enormous by design; assert it is where the comment says.
  assert.equal(MAX_PROGRESS_IDS, 2000);
  const atCap = Array.from({ length: MAX_PROGRESS_IDS }, (_, index) => `w${index}`);
  const next = appendProgressId(atCap, 'fresh');
  assert.equal(next.length, MAX_PROGRESS_IDS);
  assert.equal(next.at(-1), 'fresh');
  assert.equal(next.includes('w0'), false);
});

// ── Closing the loop: the status transition, and doing it once ───────────────

test('contribution statuses map onto the three counter states', () => {
  assert.equal(queueOutcomeForStatus('submitted'), 'pending');
  assert.equal(queueOutcomeForStatus('UNDER_REVIEW'), 'pending');
  assert.equal(queueOutcomeForStatus('approved'), 'approved');
  assert.equal(queueOutcomeForStatus('published'), 'approved');
  assert.equal(queueOutcomeForStatus('rejected'), 'released');
  assert.equal(queueOutcomeForStatus('withdrawn'), 'released');
  assert.equal(queueOutcomeForStatus('archived'), 'released');
  // An unrecognised status moves nothing: not knowing is not a reason to count.
  assert.equal(queueOutcomeForStatus('marinating'), null);
  assert.equal(queueOutcomeForStatus(''), null);
  assert.equal(queueOutcomeForStatus(undefined), null);
});

test('an approval moves the word out of the queue', () => {
  const state = nextQueueRowState(row({ pendingCount: 1 }), 'pending', 'approved');
  assert.deepEqual(state, { pendingCount: 0, approvedCount: 1, status: 'translated' });
});

test('a rejection releases the word back to the queue', () => {
  const state = nextQueueRowState(row({ pendingCount: 1 }), 'pending', 'released');
  assert.deepEqual(state, { pendingCount: 0, approvedCount: 0, status: 'open' });
});

test('withdrawing the only approved translation reopens the word', () => {
  const translated = row({ status: 'translated', approvedCount: 1, pendingCount: 0 });
  const state = nextQueueRowState(translated, 'approved', 'released');
  assert.deepEqual(state, { pendingCount: 0, approvedCount: 0, status: 'open' });
  // A second approved translation still standing keeps it translated.
  const stillTranslated = nextQueueRowState(
    row({ status: 'translated', approvedCount: 2 }),
    'approved',
    'released',
  );
  assert.deepEqual(stillTranslated, { pendingCount: 0, approvedCount: 1, status: 'translated' });
});

test('the transition is idempotent — an at-least-once trigger counts once', () => {
  // The ledger already says `approved`; a repeat delivery computes nothing.
  assert.equal(nextQueueRowState(row({ approvedCount: 1 }), 'approved', 'approved'), null);
  assert.equal(nextQueueRowState(row({ pendingCount: 1 }), 'pending', 'pending'), null);
  assert.equal(nextQueueRowState(row(), 'none', 'none'), null);

  // And applying the same move twice from its own result is stable, which is
  // what the ledger guarantees at the call site.
  const first = nextQueueRowState(row({ pendingCount: 1 }), 'pending', 'approved');
  const repeat = nextQueueRowState({ ...row(), ...first }, 'approved', 'approved');
  assert.equal(repeat, null);
});

test('counters clamp at zero rather than going negative', () => {
  // A row whose pendingCount was lost to a console edit or a re-seed.
  const state = nextQueueRowState(row({ pendingCount: 0 }), 'pending', 'released');
  assert.equal(state.pendingCount, 0);
  const approved = nextQueueRowState(row({ approvedCount: 0, status: 'translated' }), 'approved', 'released');
  assert.deepEqual(approved, { pendingCount: 0, approvedCount: 0, status: 'open' });
});

test('a retired word is never dragged back into circulation by a counter', () => {
  const retired = row({ status: 'retired', pendingCount: 1 });
  assert.equal(nextQueueRowState(retired, 'pending', 'approved').status, 'retired');
  assert.equal(nextQueueRowState(retired, 'pending', 'released').status, 'retired');
});

test('a first sighting counts from nothing', () => {
  assert.deepEqual(
    nextQueueRowState(row(), 'none', 'pending'),
    { pendingCount: 1, approvedCount: 0, status: 'open' },
  );
  assert.deepEqual(
    nextQueueRowState(row(), 'none', 'approved'),
    { pendingCount: 0, approvedCount: 1, status: 'translated' },
  );
  // Released from nothing is a no-op on the counters but still settles status.
  assert.deepEqual(
    nextQueueRowState(row(), 'none', 'released'),
    { pendingCount: 0, approvedCount: 0, status: 'open' },
  );
});

// ── An answer, and what it becomes ───────────────────────────────────────────

test('an answer is validated before it becomes a contribution', () => {
  const parsed = parseWordTranslationInput(answer());
  assert.deepEqual(parsed.translations, ['kʋm', 'nɩ']);
  assert.equal(parsed.partOfSpeech, 'noun');
  assert.equal(parsed.partOfSpeechLabel, 'Noun');
  assert.equal(parsed.publicationPermission, true);

  assert.throws(
    () => parseWordTranslationInput(answer({ translations: '  ,, // ' })),
    (error) => error?.code === 'invalid-argument',
  );
  assert.throws(
    () => parseWordTranslationInput(answer({ partOfSpeech: 'thingummy' })),
    (error) => error?.code === 'invalid-argument',
  );
  assert.throws(
    () => parseWordTranslationInput(answer({ dialect: '' })),
    (error) => error?.code === 'invalid-argument',
  );
  assert.throws(
    () => parseWordTranslationInput(answer({ wordId: '' })),
    (error) => error?.code === 'invalid-argument',
  );
  // A wordId is a document id, not a path.
  assert.throws(
    () => parseWordTranslationInput(answer({ wordId: 'wordQueue/the-bbccdf' })),
    (error) => error?.code === 'invalid-argument',
  );
});

test('a member may still withhold publication of an individual answer', () => {
  assert.equal(
    parseWordTranslationInput(answer({ publicationPermission: false })).publicationPermission,
    false,
  );
});

test('a queue answer lands in the ordinary review desk, carrying its prompt', () => {
  const input = buildWordQueueContributionInput(row(), parseWordTranslationInput(answer()));
  // English is the prompt and Kasem is the answer — the direction the existing
  // publication branch reads (englishText: title, kasemText: body).
  assert.equal(input.title, 'the');
  assert.equal(input.body, 'kʋm, nɩ');
  assert.deepEqual(input.translations, ['kʋm', 'nɩ']);
  assert.equal(input.collectionKind, 'dictionary');
  assert.equal(input.lexicalKind, 'word');
  assert.equal(input.format, 'Noun');
  assert.match(input.source, /#16521/);

  const document = buildCollectionSubmissionDocument('sub-1', uid, input, NOW);
  assert.equal(document.status, 'SUBMITTED');
  assert.equal(document.studioType, 'translation');
  assert.equal(document.collectionKind, 'dictionary');
  assert.equal(document.lexicalKind, 'word');
  assert.deepEqual(document.translations, ['kʋm', 'nɩ']);
  assert.equal(document.title, 'the');
  assert.equal(document.body, 'kʋm, nɩ');
  // A word has no recording, so no media object is fabricated for it.
  assert.equal('media' in document, false);
});

// ── Backward compatibility: nothing already in the collection changes shape ──

test('an old contribution with only a body still parses and still publishes', () => {
  const legacy = parseCollectionContributionInput({
    collectionKind: 'dictionary',
    title: 'water',
    body: 'kʋm',
    format: 'Noun',
    dialect: 'Navrongo',
    source: 'Heard at home.',
    usesThirdPartyMaterial: false,
    participantConsentConfirmed: true,
    rightsConfirmed: true,
    publicationPermission: true,
  }, uid);
  assert.equal(legacy.body, 'kʋm');
  assert.equal(legacy.lexicalKind, 'word');
  // Derived, not demanded: the body is the list of meanings for a word.
  assert.deepEqual(legacy.translations, ['kʋm']);

  const document = buildCollectionSubmissionDocument('sub-2', uid, legacy, NOW);
  assert.equal(document.body, 'kʋm');
  assert.deepEqual(document.translations, ['kʋm']);
});

test('a submission written before the field existed reconstructs its list on publish', () => {
  // Exactly what is sitting in Firestore today: no translations, no lexicalKind.
  const historical = {
    id: 'sub-3',
    authUid: uid,
    collectionKind: 'dictionary',
    category: 'dictionary',
    title: 'water',
    body: 'kʋm, nɩ',
    dialect: 'Navrongo',
    primaryLanguage: 'xsm',
    tags: [],
  };
  assert.deepEqual(submissionTranslations(historical, 'dictionary'), ['kʋm', 'nɩ']);
  assert.equal(submissionTranslations(historical, 'dictionary').length, 2);
});

test('a song is not a word: its lyrics are never split into translations', () => {
  const song = {
    collectionKind: 'music',
    category: 'music',
    title: 'Nabiina',
    body: 'One line, then another, and a third.',
    tags: [],
  };
  assert.deepEqual(submissionTranslations(song, 'music'), []);

  const published = buildPublishedContentDocument({
    submissionId: 'sub-4',
    publishedId: 'pub_sub-4',
    submission: song,
    existing: null,
    creatorId: uid,
    displayName: 'A contributor',
    avatarUrl: null,
    publicationStatus: 'published',
    now: NOW,
  });
  assert.deepEqual(published.translations, []);
  assert.equal(published.body, 'One line, then another, and a third.');
  assert.equal(published.lexicalKind, 'word');
});

test('an explicit list on a submission wins over anything derived from the body', () => {
  const submission = {
    collectionKind: 'dictionary',
    category: 'dictionary',
    body: 'kʋm, nɩ, something else',
    translations: ['kʋm', 'nɩ'],
    tags: [],
  };
  assert.deepEqual(submissionTranslations(submission, 'dictionary'), ['kʋm', 'nɩ']);
});
