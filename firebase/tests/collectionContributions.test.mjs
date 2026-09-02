// Pure unit tests for the Collection contribution parser — no emulator, no network.
//
//   npm run build:functions && node --test firebase/tests/collectionContributions.test.mjs
//
// The subject here is cover art for a contributed song, and the reason it needs
// its own file is that every interesting case is a silent one. A cover that
// names another member's private upload discloses it to a reviewer with nothing
// in the logs to say so; a cover that never reaches `media.thumbnailPath` costs
// nobody an error, it just leaves the Now Playing screen grey for ever.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  COLLECTION_CAMPAIGN_ID,
  buildCollectionSubmissionDocument,
  contributionCoverPath,
  parseCollectionContributionInput,
  parseContributionCover,
} from '../../services/functions/lib/collection-contributions.js';

const uid = 'member-1';
const otherUid = 'member-2';
const prefix = `creator-submissions/${uid}/${COLLECTION_CAMPAIGN_ID}/`;
const NOW = '2026-03-01T12:00:00.000Z';

function recording(overrides = {}) {
  return {
    storagePath: `${prefix}song-1/recording.m4a`,
    mimeType: 'audio/mp4',
    sizeBytes: 4_000_000,
    mediaType: 'audio',
    ...overrides,
  };
}

function cover(overrides = {}) {
  return {
    storagePath: `${prefix}song-1/cover.jpg`,
    mimeType: 'image/jpeg',
    sizeBytes: 400_000,
    mediaType: 'image',
    ...overrides,
  };
}

function song(overrides = {}) {
  return {
    collectionKind: 'music',
    title: 'Nabiina',
    body: 'Lyrics in Kasem, as sung at the harvest.',
    format: 'Song',
    dialect: 'Navrongo',
    source: 'Sung by the contributor, recorded at home.',
    notes: '',
    media: recording(),
    cover: cover(),
    involvesMinors: null,
    usesThirdPartyMaterial: false,
    participantConsentConfirmed: true,
    rightsConfirmed: true,
    publicationPermission: true,
    ...overrides,
  };
}

// ── The prefix check, which is the whole point of parsing a path we were given ─

test('a cover under another member\'s prefix is refused', () => {
  assert.throws(
    () => parseContributionCover(
      cover({
        storagePath: `creator-submissions/${otherUid}/${COLLECTION_CAMPAIGN_ID}/song-9/cover.jpg`,
      }),
      uid,
    ),
    (error) => error?.code === 'permission-denied',
  );
  // The same refusal reaching the whole-payload parser, since that is the only
  // door the callable actually opens.
  assert.throws(
    () => parseCollectionContributionInput(
      song({
        cover: cover({
          storagePath: `creator-submissions/${otherUid}/${COLLECTION_CAMPAIGN_ID}/song-9/cover.jpg`,
        }),
      }),
      uid,
    ),
    (error) => error?.code === 'permission-denied',
  );
});

test('a cover outside the contributions campaign folder is refused', () => {
  assert.throws(
    () => parseContributionCover(
      cover({ storagePath: `creator-submissions/${uid}/studio-video/job-1/frame.jpg` }),
      uid,
    ),
    (error) => error?.code === 'permission-denied',
  );
  assert.throws(
    () => parseContributionCover(
      cover({ storagePath: `${prefix}../${otherUid}/cover.jpg` }),
      uid,
    ),
    (error) => error?.code === 'permission-denied',
  );
});

// ── It has to be a picture, and it has to say so twice ────────────────────────

test('a cover that is not an image is refused', () => {
  // Declared audio in the artwork slot.
  assert.throws(
    () => parseContributionCover(
      cover({ mediaType: 'audio', mimeType: 'audio/mp4' }),
      uid,
    ),
    (error) => error?.code === 'invalid-argument',
  );
  // Declared an image, but the file says otherwise — the two are asked
  // separately because they can disagree.
  assert.throws(
    () => parseContributionCover(cover({ mimeType: 'audio/mpeg' }), uid),
    (error) => error?.code === 'invalid-argument',
  );
  // No MIME type at all falls back to application/octet-stream, which is not an
  // image either.
  assert.throws(
    () => parseContributionCover(cover({ mimeType: '' }), uid),
    (error) => error?.code === 'invalid-argument',
  );
});

test('a cover larger than 8 MB is refused, while a recording that size is not', () => {
  assert.throws(
    () => parseContributionCover(cover({ sizeBytes: 9 * 1024 * 1024 }), uid),
    (error) => error?.code === 'invalid-argument'
      && /8 MB maximum/.test(String(error?.message)),
  );
  assert.equal(
    parseContributionCover(cover({ sizeBytes: 8 * 1024 * 1024 }), uid).sizeBytes,
    8 * 1024 * 1024,
  );
  // The recording keeps the 500 MB ceiling: the small one belongs to artwork
  // alone.
  const parsed = parseCollectionContributionInput(
    song({ media: recording({ sizeBytes: 60 * 1024 * 1024 }) }),
    uid,
  );
  assert.equal(parsed.media.sizeBytes, 60 * 1024 * 1024);
});

// ── Where the cover ends up ───────────────────────────────────────────────────

test('a valid cover lands on media.thumbnailPath and on the receipt', () => {
  const input = parseCollectionContributionInput(song(), uid);
  assert.equal(input.cover.storagePath, `${prefix}song-1/cover.jpg`);

  const document = buildCollectionSubmissionDocument('sub-1', uid, input, NOW);
  assert.equal(document.media.storagePath, `${prefix}song-1/recording.m4a`);
  assert.equal(document.media.thumbnailPath, `${prefix}song-1/cover.jpg`);
  assert.equal(document.media.captionsPath, null);
  // The receipt the contributor can read must agree with the submission only
  // reviewers can read.
  assert.equal(contributionCoverPath(input), document.media.thumbnailPath);
});

test('a song sent without a cover still publishes, with no thumbnail', () => {
  const input = parseCollectionContributionInput(song({ cover: null }), uid);
  assert.equal(input.cover, null);
  const document = buildCollectionSubmissionDocument('sub-2', uid, input, NOW);
  assert.equal(document.media.thumbnailPath, null);
  assert.equal(contributionCoverPath(input), null);
});

test('a cover with no recording is ignored — a cover for nothing is nothing', () => {
  const input = parseCollectionContributionInput(
    song({
      collectionKind: 'literature',
      format: 'Folktale',
      media: null,
      mediaUrl: '',
      cover: cover(),
    }),
    uid,
  );
  // Parsed, because it was validly uploaded; simply not used.
  assert.equal(input.cover.storagePath, `${prefix}song-1/cover.jpg`);
  assert.equal(contributionCoverPath(input), null);

  const document = buildCollectionSubmissionDocument('sub-3', uid, input, NOW);
  // No fabricated media object: a text contribution with a picture attached is
  // still a text contribution, not a recording whose upload failed.
  assert.equal('media' in document, false);
});
