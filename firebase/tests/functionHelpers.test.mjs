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
import { isCampaignSubmission } from '../../services/functions/lib/open-publishing.js';
import { normaliseTurns, replyFromGemini, vertexEndpoint } from '../../services/functions/lib/kawuri.js';
import {
  buildPublishedContentDocument,
  canonicalCollectionKind,
} from '../../services/functions/lib/publication.js';
import {
  buildCollectionSubmissionDocument,
  parseCollectionContributionInput,
} from '../../services/functions/lib/collection-contributions.js';

// ── Mentions ────────────────────────────────────────────────────────────────

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
