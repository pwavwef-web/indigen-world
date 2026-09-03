// Pure unit tests for backend helpers — no emulator, no network.
//
//   npm run build:functions && node --test firebase/tests/functionHelpers.test.mjs
//
// These four functions decide who gets notified, which publication route a
// submission takes, and what reaches the model. All of them are quiet failure
// modes: a mention parser that misses a handle silently drops somebody's alert,
// and a campaign check that reads the wrong shape silently publishes a
// reviewed entry without review.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mentionedHandles } from '../../services/functions/lib/community-notifications.js';
import {
  isMutedBy,
  preview as messagePreview,
  recipientOf,
  senderName,
  shouldAlert,
} from '../../services/functions/lib/chat-notifications.js';
import { isCampaignSubmission } from '../../services/functions/lib/open-publishing.js';
import {
  finishReasonFromGemini,
  normaliseTurns,
  replyFromGemini,
  vertexEndpoint,
} from '../../services/functions/lib/kawuri.js';
import {
  dictionaryBriefing,
  dictionaryRecordFrom,
  englishSenses,
  matchDictionary,
  normaliseTerm,
  translationTerms,
} from '../../services/functions/lib/kawuri-dictionary.js';
import {
  KAWURI_AVATAR_STORAGE_PATH,
  KAWURI_AVATAR_URL,
  summonsKawuri,
} from '../../services/functions/lib/community-kawuri.js';
import {
  buildPublishedContentDocument,
  canonicalCollectionKind,
} from '../../services/functions/lib/publication.js';
import {
  buildCollectionSubmissionDocument,
  parseCollectionContributionInput,
} from '../../services/functions/lib/collection-contributions.js';
import { parseAdCampaignInput } from '../../services/functions/lib/ads.js';

// ── Mentions ────────────────────────────────────────────────────────────────

test('Kawuri uses the public Firebase community avatar', () => {
  assert.equal(
    KAWURI_AVATAR_STORAGE_PATH,
    'community-avatars/kawuri/kawuri-community-avatar.png',
  );
  assert.match(KAWURI_AVATAR_URL, /^https:\/\/firebasestorage\.googleapis\.com\//);
  assert.match(KAWURI_AVATAR_URL, /community-avatars%2Fkawuri%2F/);
});

test('Kawuri is summoned only by its reserved mention', () => {
  assert.equal(summonsKawuri('@kawuri can you help?'), true);
  assert.equal(summonsKawuri('Ask @KAWURI.'), true);
  assert.equal(summonsKawuri('kawuri can you help?'), false);
  assert.equal(summonsKawuri('mail me@kawuri.test'), false);
});

test('mentionedHandles finds handles wherever they sit in a post', () => {
  assert.deepEqual(mentionedHandles('@amina_paga de zaanem'), ['amina_paga']);
  assert.deepEqual(mentionedHandles('ko gara @nyaaba'), ['nyaaba']);
  assert.deepEqual(mentionedHandles('(@nyaaba) said so'), ['nyaaba']);
  assert.deepEqual(mentionedHandles('@amina and @nyaaba'), ['amina', 'nyaaba']);
});

test('mentionedHandles lowercases and de-duplicates', () => {
  // The username registry is keyed by the lowercase handle, and one post must
  // never notify the same person twice.
  assert.deepEqual(mentionedHandles('@Amina @amina @AMINA'), ['amina']);
});

test('mentionedHandles ignores things that only look like handles', () => {
  assert.deepEqual(mentionedHandles('write to me@example.com'), []);
  assert.deepEqual(mentionedHandles('@ab is too short'), []);
  assert.deepEqual(mentionedHandles('email a@b.c'), []);
  assert.deepEqual(mentionedHandles(''), []);
  assert.deepEqual(mentionedHandles(null), []);
  assert.deepEqual(mentionedHandles(42), []);
});

test('mentionedHandles caps how many people one post can alert', () => {
  // Otherwise a single post is a broadcast weapon.
  const text = Array.from({ length: 40 }, (_, i) => `@member${String(i).padStart(2, '0')}`).join(' ');
  assert.equal(mentionedHandles(text).length, 10);
});

// ── Publication route ───────────────────────────────────────────────────────

test('isCampaignSubmission recognises a real campaign', () => {
  assert.equal(
    isCampaignSubmission({ collection: 'campaigns', id: 'kasem-creator-challenge' }),
    true,
  );
});

test('isCampaignSubmission treats every "no campaign" shape as open', () => {
  // The studio writes 'open'; older or partial documents may carry an empty id
  // or no campaign at all. Reading any of these as a campaign would push an
  // everyday post into the reviewed queue and it would never publish.
  assert.equal(isCampaignSubmission({ collection: 'campaigns', id: 'open' }), false);
  assert.equal(isCampaignSubmission({ collection: 'campaigns', id: 'OPEN' }), false);
  assert.equal(isCampaignSubmission({ collection: 'campaigns', id: '  ' }), false);
  assert.equal(isCampaignSubmission({ collection: 'campaigns', id: '' }), false);
  assert.equal(isCampaignSubmission({ collection: 'campaigns', id: 'none' }), false);
  assert.equal(isCampaignSubmission({}), false);
  assert.equal(isCampaignSubmission(null), false);
  assert.equal(isCampaignSubmission(undefined), false);
  assert.equal(isCampaignSubmission({ id: 7 }), false);
});

// ── Collection contribution publication ────────────────────────────────────

const collectionInput = (overrides = {}) => ({
  collectionKind: 'literature',
  title: 'The Baobab Promise',
  body: 'A complete long-form story that must survive review and publication.',
  format: 'Folktale',
  dialect: 'Navrongo',
  source: 'Community storyteller',
  mediaUrl: '',
  notes: 'Check the spelling with a Navrongo reviewer.',
  relatedEntryId: null,
  involvesMinors: false,
  usesThirdPartyMaterial: false,
  participantConsentConfirmed: true,
  rightsConfirmed: true,
  publicationPermission: true,
  ...overrides,
});

test('collection contribution maps to a reviewed canonical submission', () => {
  const parsed = parseCollectionContributionInput(collectionInput());
  const submission = buildCollectionSubmissionDocument(
    'collection-1',
    'member-1',
    parsed,
    '2026-08-24T00:00:00.000Z',
  );
  assert.equal(submission.status, 'SUBMITTED');
  assert.equal(submission.collectionKind, 'literature');
  assert.equal(submission.body, parsed.body);
  assert.deepEqual(submission.campaign, {
    collection: 'campaigns',
    id: 'collection-contributions',
  });
  assert.equal(submission.permissions.publication, true);
  assert.equal(submission.disclosures.involvesMinors, false);
  assert.equal(submission.disclosures.usesThirdPartyMaterial, false);
  assert.equal(submission.attestations.participantsConsented, true);
});

test('collection governance answers are explicit and participant consent is required', () => {
  for (const key of ['usesThirdPartyMaterial', 'participantConsentConfirmed']) {
    const input = collectionInput();
    delete input[key];
    assert.throws(
      () => parseCollectionContributionInput(input),
      (error) => error?.code === 'invalid-argument',
      `${key} must not silently default`,
    );
  }
  assert.throws(
    () => parseCollectionContributionInput(collectionInput({ participantConsentConfirmed: false })),
    (error) => error?.code === 'failed-precondition',
  );
});

test('an unasked minors question stays null rather than becoming a declared No', () => {
  // The mobile forms only put the question where a person is the subject, so
  // a reviewer has to be able to tell "nobody asked" from "they said no".
  const input = collectionInput();
  delete input.involvesMinors;
  const parsed = parseCollectionContributionInput(input);
  assert.equal(parsed.involvesMinors, null);
  const submission = buildCollectionSubmissionDocument(
    'collection-minors',
    'member-1',
    parsed,
    '2026-08-24T00:00:00.000Z',
  );
  assert.equal(submission.disclosures.involvesMinors, null);
  assert.equal(
    parseCollectionContributionInput(collectionInput({ involvesMinors: true })).involvesMinors,
    true,
  );
});

test('an uploaded file must live in the calling member\'s own submission folder', () => {
  const good = {
    storagePath: 'creator-submissions/member-1/collection-contributions/abc/song.mp3',
    mimeType: 'audio/mpeg',
    sizeBytes: 4096,
    mediaType: 'audio',
  };
  const parsed = parseCollectionContributionInput(
    collectionInput({ collectionKind: 'music', format: 'Song', media: good }),
    'member-1',
  );
  assert.equal(parsed.media.storagePath, good.storagePath);

  // Storage rules stop a member writing into somebody else's prefix, but
  // nothing stops them naming one here.
  assert.throws(
    () => parseCollectionContributionInput(
      collectionInput({ collectionKind: 'music', format: 'Song', media: good }),
      'member-2',
    ),
    (error) => error?.code === 'permission-denied',
  );
});

test('a song or a narration cannot be submitted without its recording', () => {
  for (const collectionKind of ['music', 'audiobooks']) {
    assert.throws(
      () => parseCollectionContributionInput(
        collectionInput({ collectionKind, format: 'Song' }),
        'member-1',
      ),
      (error) => error?.code === 'failed-precondition',
      `${collectionKind} must carry its audio`,
    );
  }
  // A written work may arrive as typed text alone.
  assert.ok(parseCollectionContributionInput(collectionInput(), 'member-1'));
});

test('Dictionary examples survive the canonical submission projection', () => {
  const parsed = parseCollectionContributionInput(collectionInput({
    collectionKind: 'dictionary',
    kasemExample: 'Amo dole kokwolo.',
    englishExample: 'I threw the bottle away.',
  }));
  const submission = buildCollectionSubmissionDocument(
    'collection-dictionary',
    'member-dictionary',
    parsed,
    '2026-08-24T00:00:00.000Z',
  );
  assert.equal(submission.kasemExample, 'Amo dole kokwolo.');
  assert.equal(submission.englishExample, 'I threw the bottle away.');
});

test('publication keeps Literature body and maps it into the current mobile description', () => {
  const parsed = parseCollectionContributionInput(collectionInput());
  const submission = buildCollectionSubmissionDocument(
    'collection-2',
    'member-2',
    parsed,
    '2026-08-24T00:00:00.000Z',
  );
  const published = buildPublishedContentDocument({
    submissionId: 'collection-2',
    publishedId: 'pub_collection-2',
    submission,
    creatorId: 'member-2',
    displayName: 'Community contributor',
    avatarUrl: null,
    publicationStatus: 'published',
    now: '2026-08-24T01:00:00.000Z',
  });
  assert.equal(published.collectionKind, 'literature');
  assert.equal(published.body, parsed.body);
  assert.equal(published.description, parsed.body);
  assert.equal(published.publicationRoute, 'collection_review');
});

test('Audiobooks retain an approved external recording and infer audio media', () => {
  const parsed = parseCollectionContributionInput(collectionInput({
    collectionKind: 'audiobooks',
    mediaUrl: 'https://media.example.org/story.mp3',
  }));
  const submission = buildCollectionSubmissionDocument(
    'collection-3',
    'member-3',
    parsed,
    '2026-08-24T00:00:00.000Z',
  );
  const published = buildPublishedContentDocument({
    submissionId: 'collection-3',
    publishedId: 'pub_collection-3',
    submission,
    creatorId: 'member-3',
    displayName: 'Community contributor',
    avatarUrl: null,
    publicationStatus: 'published',
    now: '2026-08-24T01:00:00.000Z',
  });
  assert.equal(published.collectionKind, 'audiobooks');
  assert.equal(published.mediaType, 'audio');
  assert.equal(published.mediaUrl, 'https://media.example.org/story.mp3');
});

test('collection aliases resolve while unknown categories stay unclassified', () => {
  assert.equal(canonicalCollectionKind('oral-reading'), 'audiobooks');
  assert.equal(canonicalCollectionKind('audio'), 'audiobooks');
  assert.equal(canonicalCollectionKind('narration'), 'audiobooks');
  assert.equal(canonicalCollectionKind('storytelling'), 'literature');
  assert.equal(canonicalCollectionKind('festival'), null);
});

// ── Kawuri ──────────────────────────────────────────────────────────────────

test('normaliseTurns keeps the recent tail, oldest first', () => {
  const turns = Array.from({ length: 30 }, (_, i) => ({ role: 'user', text: `turn ${i}` }));
  const out = normaliseTurns(turns);
  assert.equal(out.length, 12);
  assert.equal(out[out.length - 1].text, 'turn 29');
});

test('normaliseTurns ends on a user turn, because the model requires it', () => {
  const out = normaliseTurns([
    { role: 'user', text: 'a question' },
    { role: 'model', text: 'an answer' },
  ]);
  assert.deepEqual(out, [{ role: 'user', text: 'a question' }]);
});

test('normaliseTurns drops empty turns and unknown roles default to user', () => {
  assert.deepEqual(
    normaliseTurns([{ role: 'assistant', text: '  hi  ' }, { text: '' }, { role: 'user', text: 'q' }]),
    [{ role: 'user', text: 'hi' }, { role: 'user', text: 'q' }],
  );
});

test('normaliseTurns rejects junk without throwing', () => {
  assert.deepEqual(normaliseTurns(undefined), []);
  assert.deepEqual(normaliseTurns('not an array'), []);
  assert.deepEqual(normaliseTurns([null, 5, 'x']), []);
});

test('vertexEndpoint targets the project it is deployed into', () => {
  // Kawuri authenticates as the function's own service account against Vertex
  // AI, so the project has to come from the runtime rather than from a key.
  const url = vertexEndpoint('project-kassena-7e026');
  assert.match(url, /^https:\/\/[a-z0-9-]+-aiplatform\.googleapis\.com\/v1\//);
  assert.ok(url.includes('/projects/project-kassena-7e026/'));
  assert.ok(url.endsWith(':generateContent'));
  // No key is ever appended — that is the point of the Vertex route.
  assert.ok(!url.includes('key='));
});

test('replyFromGemini pulls the answer out, and survives every empty shape', () => {
  assert.equal(
    replyFromGemini({ candidates: [{ content: { parts: [{ text: 'Elders first.' }] } }] }),
    'Elders first.',
  );
  // Streamed answers arrive as several parts.
  assert.equal(
    replyFromGemini({ candidates: [{ content: { parts: [{ text: 'a' }, { text: 'b' }] } }] }),
    'ab',
  );
  // A blocked generation has candidates but no parts.
  assert.equal(replyFromGemini({ candidates: [{ finishReason: 'SAFETY' }] }), '');
  assert.equal(replyFromGemini({ candidates: [] }), '');
  assert.equal(replyFromGemini({}), '');
  assert.equal(replyFromGemini(null), '');
  assert.equal(replyFromGemini('nonsense'), '');
});

test('finishReasonFromGemini surfaces a truncated answer', () => {
  // The failure this exists for: the reply is a real, non-empty string that
  // simply stops mid-sentence. Without the reason there is nothing to tell it
  // apart from a short answer.
  assert.equal(
    finishReasonFromGemini({ candidates: [{ finishReason: 'MAX_TOKENS' }] }),
    'MAX_TOKENS',
  );
  assert.equal(finishReasonFromGemini({ candidates: [{ finishReason: 'STOP' }] }), 'STOP');
  assert.equal(finishReasonFromGemini({ candidates: [] }), '');
  assert.equal(finishReasonFromGemini(null), '');
});

// ── Kawuri's dictionary lookup ──────────────────────────────────────────────
//
// The rule Kawuri is held to is "never invent Kasem". These helpers are what
// let it answer a translation anyway: they decide which questions are asking
// about a word, which published entries answer them, and what the model is
// told when nothing does.

const WATER = dictionaryRecordFrom('e1', {
  kasemText: 'na',
  translations: ['na', 'nabon'],
  englishText: 'water, rain water',
  partOfSpeech: 'noun',
  dialect: 'Nankana',
  kasemExample: 'Ba wo na.',
  englishExample: 'They drank water.',
});

const GREETING = dictionaryRecordFrom('e2', {
  headword: 'Zaanem',
  translation: 'greeting / hello',
  partOfSpeech: 'noun',
});

test('translationTerms reads the word out of every way people ask', () => {
  assert.deepEqual(translationTerms('How do you say water in Kasem?'), ['water']);
  assert.deepEqual(translationTerms('what is the Kasem word for water'), ['water']);
  assert.deepEqual(translationTerms('What does zaanem mean?'), ['zaanem']);
  assert.deepEqual(translationTerms('translate "good morning" into Kasem'), [
    'good morning',
    'good',
    'morning',
  ]);
  assert.deepEqual(translationTerms('water in kasem'), ['water']);
});

test('translationTerms stays quiet when nobody asked about a word', () => {
  // A false positive only costs a dictionary read; being noisy about every
  // question would put a "nothing matched" block in front of answers that were
  // never about vocabulary at all.
  assert.deepEqual(translationTerms('Who reviews a contribution?'), []);
  assert.deepEqual(translationTerms(''), []);
  assert.deepEqual(translationTerms('Tell me about Paga.'), []);
});

test('a stored entry is read whichever schema generation wrote it', () => {
  assert.equal(WATER.kasem, 'na');
  assert.deepEqual(WATER.renderings, ['na', 'nabon']);
  assert.equal(WATER.english, 'water, rain water');
  // Legacy rows: `headword` is the Kasem side and singular `translation` is the
  // English one — the opposite of what the plural field means today.
  assert.equal(GREETING.kasem, 'Zaanem');
  assert.equal(GREETING.english, 'greeting / hello');
  assert.equal(dictionaryRecordFrom('x', { partOfSpeech: 'noun' }), null);
});

test('englishSenses splits the list members actually type', () => {
  assert.deepEqual(englishSenses(WATER), ['water', 'rain water']);
  assert.deepEqual(englishSenses(GREETING), ['greeting', 'hello']);
});

test('matchDictionary finds an entry by either side, exact matches first', () => {
  const records = [WATER, GREETING];
  assert.deepEqual(matchDictionary(records, ['water']), [WATER]);
  // The Kasem side, and case-folded — a member types what they saw in a post.
  assert.deepEqual(matchDictionary(records, ['zaanem']), [GREETING]);
  // A sense buried in a list is still the answer to that word.
  assert.deepEqual(matchDictionary(records, ['hello']), [GREETING]);
  assert.deepEqual(matchDictionary(records, ['aeroplane']), []);
});

test('matchDictionary prefers the whole phrase over its parts', () => {
  const morning = dictionaryRecordFrom('e3', { kasemText: 'zaa', englishText: 'morning' });
  const goodMorning = dictionaryRecordFrom('e4', {
    kasemText: 'zaa nintwem',
    englishText: 'good morning',
  });
  // translationTerms puts the phrase first, and the ranking has to keep it there.
  const matches = matchDictionary(
    [morning, goodMorning],
    translationTerms('translate "good morning" into Kasem'),
  );
  assert.equal(matches[0], goodMorning);
});

test('a dictionary miss is stated, not left as silence', () => {
  const briefing = dictionaryBriefing(['aeroplane'], []);
  assert.match(briefing, /NO entry/);
  assert.match(briefing, /Contribute/);
  // Nothing is owed when the question was not about a word.
  assert.equal(dictionaryBriefing([], []), '');
});

test('a dictionary hit is handed over whole, with its alternates and example', () => {
  const briefing = dictionaryBriefing(['water'], [WATER]);
  assert.match(briefing, /Kasem: na/);
  assert.match(briefing, /also written: nabon/);
  assert.match(briefing, /water, rain water/);
  assert.match(briefing, /Ba wo na\./);
  assert.match(briefing, /ONLY Kasem you may state as confirmed/);
});

test('normaliseTerm folds what a sentence hangs off a word', () => {
  assert.equal(normaliseTerm('  Water?  '), 'water');
  assert.equal(normaliseTerm('“Zaanem,”'), 'zaanem');
  assert.equal(normaliseTerm('good   morning'), 'good morning');
});

// ── Direct-message alerts ───────────────────────────────────────────────────
//
// Every decision the message trigger makes before it reaches FCM. All of them
// fail quietly: a wrong recipient sends somebody else's private message to the
// wrong lock screen, and a wrong debounce either buzzes a phone once per word
// typed or silently stops delivering altogether.

test('recipientOf picks the other participant, and only when there is one', () => {
  assert.equal(recipientOf(['amina', 'nyaaba'], 'amina'), 'nyaaba');
  assert.equal(recipientOf(['amina', 'nyaaba'], 'nyaaba'), 'amina');
  // A malformed thread must produce no alert rather than a misdirected one.
  assert.equal(recipientOf(['amina'], 'amina'), null);
  assert.equal(recipientOf(['a', 'b', 'c'], 'a'), null);
  assert.equal(recipientOf(null, 'amina'), null);
  assert.equal(recipientOf(['amina', 42], 'amina'), null);
});

test('isMutedBy only answers for the person who muted', () => {
  assert.equal(isMutedBy(['amina'], 'amina'), true);
  assert.equal(isMutedBy(['amina'], 'nyaaba'), false);
  assert.equal(isMutedBy([], 'amina'), false);
  assert.equal(isMutedBy(undefined, 'amina'), false);
});

test('shouldAlert rings for the first message in a quiet conversation', () => {
  // Nothing was waiting, so this is news however recently the thread rang.
  assert.equal(
    shouldAlert({ outstanding: 1, lastPushAtMillis: 1_000, nowMillis: 1_100 }),
    true,
  );
  assert.equal(
    shouldAlert({ outstanding: undefined, lastPushAtMillis: null, nowMillis: 0 }),
    true,
  );
});

test('shouldAlert stays quiet for a burst', () => {
  // Four messages typed in a row are one thought, and one buzz.
  assert.equal(
    shouldAlert({ outstanding: 2, lastPushAtMillis: 1_000, nowMillis: 2_000 }),
    false,
  );
  assert.equal(
    shouldAlert({ outstanding: 9, lastPushAtMillis: 1_000, nowMillis: 45_000 }),
    false,
  );
});

test('shouldAlert rings again once the quiet period has passed', () => {
  // Still unread, but this is a new beat in the conversation rather than the
  // tail of the last one.
  assert.equal(
    shouldAlert({ outstanding: 2, lastPushAtMillis: 1_000, nowMillis: 46_000 }),
    true,
  );
  // A thread that has never rung has nothing to stay quiet about.
  assert.equal(
    shouldAlert({ outstanding: 5, lastPushAtMillis: null, nowMillis: 0 }),
    true,
  );
});

test('senderName falls back rather than titling an alert with nothing', () => {
  const profiles = { amina: { displayName: 'Amina' }, blank: { displayName: '  ' } };
  assert.equal(senderName(profiles, 'amina'), 'Amina');
  assert.equal(senderName(profiles, 'blank'), 'A member');
  assert.equal(senderName(profiles, 'missing'), 'A member');
  assert.equal(senderName(undefined, 'amina'), 'A member');
});

test('messagePreview collapses whitespace and truncates long messages', () => {
  // A message typed across several lines has to arrive as one lock-screen row.
  assert.equal(messagePreview('  de   zaanem\n\nko gara '), 'de zaanem ko gara');
  const long = 'a'.repeat(300);
  assert.equal(messagePreview(long).length, 120);
  assert.ok(messagePreview(long).endsWith('…'));
});

// ── Advertising ─────────────────────────────────────────────────────────────
//
// Campaigns are the one thing in this backend that will eventually move money,
// so what a phone is allowed to assert about one is the whole security story.

function adInput(overrides = {}) {
  return {
    name: 'Shea butter, dry season',
    objective: 'awareness',
    headline: 'Pure shea from Paga',
    body: 'Cold-pressed, unrefined, sold by the tin.',
    ctaLabel: 'Ask for it',
    placements: ['community'],
    regions: ['Upper East'],
    dailyBudgetPesewas: 2000,
    durationDays: 7,
    creative: {
      storagePath: 'creator-submissions/advertiser-1/ad-campaigns/abc/shea.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 90_000,
      mediaType: 'image',
    },
    ...overrides,
  };
}

test('a campaign is priced by the server, never by the caller', () => {
  // The client sends a daily budget and a duration. Everything with a currency
  // symbol on it is computed here — a total a phone can choose is a total a
  // phone can choose to be zero.
  const parsed = parseAdCampaignInput(adInput({
    subtotalPesewas: 1,
    taxPesewas: 0,
    totalBudgetPesewas: 1,
  }), 'advertiser-1');

  assert.equal(parsed.subtotalPesewas, 2000 * 7);
  assert.equal(parsed.taxPesewas, Math.round(2000 * 7 * 0.06));
  assert.equal(parsed.totalBudgetPesewas, parsed.subtotalPesewas + parsed.taxPesewas);
});

test('an advert creative must live in the caller own upload folder', () => {
  assert.ok(parseAdCampaignInput(adInput(), 'advertiser-1'));

  // Storage rules stop a member writing into somebody else's prefix, but
  // nothing stops them naming one here — and a campaign that pointed a
  // reviewer at another member's private upload would be a disclosure.
  assert.throws(
    () => parseAdCampaignInput(adInput(), 'advertiser-2'),
    (error) => error?.code === 'permission-denied',
  );

  // And the Collection review prefix is not an advertising prefix.
  assert.throws(
    () => parseAdCampaignInput(adInput({
      creative: {
        storagePath: 'creator-submissions/advertiser-1/collection-contributions/abc/song.mp3',
        mimeType: 'audio/mpeg',
        sizeBytes: 10,
        mediaType: 'image',
      },
    }), 'advertiser-1'),
    (error) => error?.code === 'permission-denied',
  );
});

test('a campaign cannot be submitted without a creative', () => {
  assert.throws(
    () => parseAdCampaignInput(adInput({ creative: null }), 'advertiser-1'),
    (error) => error?.code === 'failed-precondition',
  );
});

test('an advert creative is an image or a video, and nothing else', () => {
  const video = parseAdCampaignInput(adInput({
    creative: {
      storagePath: 'creator-submissions/advertiser-1/ad-campaigns/abc/clip.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 4_000_000,
      mediaType: 'video',
    },
  }), 'advertiser-1');
  assert.equal(video.creative.mediaType, 'video');

  for (const mediaType of ['audio', 'document', '']) {
    assert.throws(
      () => parseAdCampaignInput(adInput({
        creative: {
          storagePath: 'creator-submissions/advertiser-1/ad-campaigns/abc/f',
          mimeType: 'application/octet-stream',
          sizeBytes: 10,
          mediaType,
        },
      }), 'advertiser-1'),
      (error) => error?.code === 'invalid-argument',
      `${mediaType || 'empty'} is not an advert creative`,
    );
  }
});

test('budget and duration are held inside their stated bounds', () => {
  for (const overrides of [
    { dailyBudgetPesewas: 100 },     // under the floor
    { dailyBudgetPesewas: 900_000 }, // over the ceiling
    { durationDays: 0 },
    { durationDays: 400 },
    { dailyBudgetPesewas: 'lots' },
  ]) {
    assert.throws(
      () => parseAdCampaignInput(adInput(overrides), 'advertiser-1'),
      (error) => error?.code === 'invalid-argument',
      JSON.stringify(overrides),
    );
  }
});

test('a link objective needs a real destination; the others carry none', () => {
  assert.throws(
    () => parseAdCampaignInput(adInput({ objective: 'visits' }), 'advertiser-1'),
    (error) => error?.code === 'failed-precondition',
  );
  assert.throws(
    () => parseAdCampaignInput(
      adInput({ objective: 'visits', ctaUrl: 'javascript:alert(1)' }),
      'advertiser-1',
    ),
    (error) => error?.code === 'invalid-argument',
  );

  const visits = parseAdCampaignInput(
    adInput({ objective: 'visits', ctaUrl: 'https://shea.example/paga' }),
    'advertiser-1',
  );
  assert.equal(visits.ctaUrl, 'https://shea.example/paga');

  // A link on an awareness campaign is dropped rather than quietly served.
  const awareness = parseAdCampaignInput(
    adInput({ ctaUrl: 'https://shea.example/paga' }),
    'advertiser-1',
  );
  assert.equal(awareness.ctaUrl, '');
});

test('placements are drawn from the surfaces that actually exist', () => {
  assert.deepEqual(
    parseAdCampaignInput(
      adInput({ placements: ['community', 'explore', 'community'] }),
      'advertiser-1',
    ).placements,
    ['community', 'explore'],
  );
  assert.throws(
    () => parseAdCampaignInput(adInput({ placements: ['inbox'] }), 'advertiser-1'),
    (error) => error?.code === 'invalid-argument',
  );
  assert.throws(
    () => parseAdCampaignInput(adInput({ placements: [] }), 'advertiser-1'),
    (error) => error?.code === 'invalid-argument',
  );
});

// ── Video as a Collection kind ──────────────────────────────────────────────

test('a video contribution is recognised and cannot arrive without its footage', () => {
  assert.equal(canonicalCollectionKind('video'), 'video');
  assert.equal(canonicalCollectionKind('Short Film'), 'video');
  assert.equal(canonicalCollectionKind('documentary'), 'video');

  assert.throws(
    () => parseCollectionContributionInput(
      collectionInput({ collectionKind: 'video', format: 'Documentary' }),
      'member-1',
    ),
    (error) => error?.code === 'failed-precondition',
  );

  const parsed = parseCollectionContributionInput(collectionInput({
    collectionKind: 'video',
    format: 'Documentary',
    media: {
      storagePath: 'creator-submissions/member-1/collection-contributions/abc/harvest.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 8_000_000,
      mediaType: 'video',
    },
  }), 'member-1');
  const submission = buildCollectionSubmissionDocument(
    'collection-video',
    'member-1',
    parsed,
    '2026-08-27T00:00:00.000Z',
  );
  assert.equal(submission.studioType, 'video');
  assert.equal(submission.collectionKind, 'video');
});
