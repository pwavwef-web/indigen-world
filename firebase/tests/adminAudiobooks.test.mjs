// Pure unit tests for admin audiobook publishing — no emulator, no network.
//
//   npm run build:functions && node --test firebase/tests/adminAudiobooks.test.mjs
//
// Audiobooks are the one thing in the library that no member submitted and no
// reviewer approved: an administrator types them in beside the Apps directory
// and they appear in the same `publishedContent` collection the mobile app
// reads. That makes two things worth pinning down here. First, the projection —
// an audiobook that lands with the wrong `collectionKind` or `mediaType` is not
// broken, it is simply invisible, because the Collection stream filters on
// exactly those fields. Second, the file checks: `publishedContent` is the only
// collection the app consumes, so a mistyped path is the difference between
// publishing a book and copying an arbitrary bucket object into the
// world-readable path.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ADMIN_AUDIOBOOK_CREATOR_ID,
  AUDIOBOOK_STORAGE_PREFIX,
  audiobookAttribution,
  buildAdminAudiobookDocument,
  parseAdminAudiobookInput,
} from '../../services/functions/lib/admin-collection.js';

const NOW = '2026-03-01T12:00:00.000Z';
const EARLIER = '2026-01-05T08:00:00.000Z';
const id = 'audiobook-1';

function audio(overrides = {}) {
  return {
    storagePath: `${AUDIOBOOK_STORAGE_PREFIX}${id}/narration.m4a`,
    mimeType: 'audio/mp4',
    sizeBytes: 120 * 1024 * 1024,
    ...overrides,
  };
}

function cover(overrides = {}) {
  return {
    storagePath: `${AUDIOBOOK_STORAGE_PREFIX}${id}/cover.jpg`,
    mimeType: 'image/jpeg',
    sizeBytes: 500_000,
    ...overrides,
  };
}

function payload(overrides = {}) {
  return {
    audiobookId: id,
    title: 'Sɔŋɔ ne Kasem',
    author: 'Ayaaba Adongo',
    narrator: 'Ama Atonsi',
    description: 'Ten Kasena folktales, read aloud for listeners learning the language.',
    body: '',
    category: 'Folktales',
    dialect: 'Navrongo',
    language: 'xsm',
    licenceDisplay: '',
    audio: audio(),
    cover: cover(),
    published: true,
    ...overrides,
  };
}

// ── The uploaded files ───────────────────────────────────────────────────────

test('narration must live under the audiobook prefix', () => {
  assert.throws(
    () => parseAdminAudiobookInput(payload({
      audio: audio({ storagePath: 'creator-submissions/member-1/collection-contributions/a/x.m4a' }),
    })),
    (error) => error?.code === 'permission-denied',
  );
  assert.throws(
    () => parseAdminAudiobookInput(payload({
      audio: audio({ storagePath: `${AUDIOBOOK_STORAGE_PREFIX}../learn-images/goat.png` }),
    })),
    (error) => error?.code === 'permission-denied',
  );
  assert.throws(
    () => parseAdminAudiobookInput(payload({
      cover: cover({ storagePath: 'ad-creatives/campaign-1/banner.jpg' }),
    })),
    (error) => error?.code === 'permission-denied',
  );
});

test('narration must be audio and a cover must be an image', () => {
  assert.throws(
    () => parseAdminAudiobookInput(payload({ audio: audio({ mimeType: 'application/pdf' }) })),
    (error) => error?.code === 'invalid-argument',
  );
  assert.throws(
    () => parseAdminAudiobookInput(payload({ cover: cover({ mimeType: 'audio/mpeg' }) })),
    (error) => error?.code === 'invalid-argument',
  );
  assert.throws(
    () => parseAdminAudiobookInput(payload({ audio: null })),
    (error) => error?.code === 'invalid-argument',
  );
});

test('the two size ceilings are the ones the Storage rules enforce', () => {
  assert.throws(
    () => parseAdminAudiobookInput(payload({ audio: audio({ sizeBytes: 501 * 1024 * 1024 }) })),
    (error) => error?.code === 'invalid-argument' && /500 MB maximum/.test(String(error?.message)),
  );
  assert.throws(
    () => parseAdminAudiobookInput(payload({ cover: cover({ sizeBytes: 9 * 1024 * 1024 }) })),
    (error) => error?.code === 'invalid-argument' && /8 MB maximum/.test(String(error?.message)),
  );
  // A whole narrated book is a big file; 400 MB of it is normal, not suspicious.
  assert.equal(
    parseAdminAudiobookInput(payload({ audio: audio({ sizeBytes: 400 * 1024 * 1024 }) })).audio.sizeBytes,
    400 * 1024 * 1024,
  );
});

// ── The rest of the form ─────────────────────────────────────────────────────

test('the shelf copy is required and the transcript is not', () => {
  for (const key of ['title', 'author', 'narrator', 'description', 'category', 'dialect']) {
    assert.throws(
      () => parseAdminAudiobookInput(payload({ [key]: '   ' })),
      (error) => error?.code === 'invalid-argument',
      `${key} should be required`,
    );
  }
  const parsed = parseAdminAudiobookInput(payload({ body: null, language: null }));
  assert.equal(parsed.body, '');
  assert.equal(parsed.language, 'xsm');
});

test('the language is a code, not the name of a language', () => {
  // "Kasem" typed where xsm belongs is a record no language filter matches, and
  // nothing downstream would ever complain about it.
  assert.throws(
    () => parseAdminAudiobookInput(payload({ language: 'Kasem' })),
    (error) => error?.code === 'invalid-argument',
  );
  assert.equal(parseAdminAudiobookInput(payload({ language: 'EN' })).language, 'en');
});

test('publication is an explicit choice, never inferred', () => {
  assert.throws(
    () => parseAdminAudiobookInput(payload({ published: 'yes' })),
    (error) => error?.code === 'invalid-argument',
  );
  assert.throws(
    () => parseAdminAudiobookInput(null),
    (error) => error?.code === 'invalid-argument',
  );
});

test('a supplied id must be an id, not a path', () => {
  assert.throws(
    () => parseAdminAudiobookInput(payload({ audiobookId: '../publishedContent/pub_1' })),
    (error) => error?.code === 'invalid-argument',
  );
  // Absent means "a new audiobook", which is not an error.
  assert.equal(parseAdminAudiobookInput(payload({ audiobookId: null })).audiobookId, null);
});

// ── The projection the mobile app reads ──────────────────────────────────────

test('an audiobook lands where the Collection stream looks for it', () => {
  const input = parseAdminAudiobookInput(payload());
  const document = buildAdminAudiobookDocument({ id, input, existing: null, now: NOW });

  // watchCollection filters on publicationStatus + collectionKind and orders by
  // publishedAt; the player refuses anything whose mediaType is not exactly
  // 'audio'.
  assert.equal(document.publicationStatus, 'published');
  assert.equal(document.collectionKind, 'audiobooks');
  assert.equal(document.category, 'audiobooks');
  assert.equal(document.mediaType, 'audio');
  assert.equal(document.publishedAt, NOW);
  assert.equal(document.publicationRoute, 'admin');
  assert.equal(document.id, id);
  // Nothing was submitted, so the pointer the contract requires names the
  // record itself rather than a submission that was never written.
  assert.deepEqual(document.submission, { collection: 'publishedContent', id });
  assert.equal(document.campaign, null);
  // The genre the administrator typed is a tag; the destination is the category.
  assert.deepEqual(document.tags, ['audiobooks', 'folktales']);
  assert.equal(document.language, 'xsm');
  assert.equal(document.dialect, 'Navrongo');
  assert.equal(document.correctionState, 'none');
  assert.deepEqual(document.lifecycle, { createdAt: NOW, updatedAt: NOW, version: 1 });
});

test('the attribution names the author and the narrator', () => {
  const input = parseAdminAudiobookInput(payload());
  const document = buildAdminAudiobookDocument({ id, input, existing: null, now: NOW });
  assert.deepEqual(document.creatorAttribution, {
    creatorId: ADMIN_AUDIOBOOK_CREATOR_ID,
    displayName: 'Ayaaba Adongo · narrated by Ama Atonsi',
    avatarUrl: null,
  });
  // Never the administrator's own uid: a creator page query would otherwise
  // file the library's audiobooks under whoever was signed in that day.
  assert.equal(document.creatorAttribution.creatorId, 'indigen-world-library');
  // One person doing both jobs is said once.
  assert.equal(
    audiobookAttribution({ author: 'Ama Atonsi', narrator: 'ama atonsi' }),
    'Ama Atonsi',
  );
});

test('the licence line is the rights holder\'s, not a permission we invented', () => {
  const standard = buildAdminAudiobookDocument({
    id,
    input: parseAdminAudiobookInput(payload()),
    existing: null,
    now: NOW,
  });
  assert.equal(standard.licenceDisplay, '© Ayaaba Adongo · Published by Indigen World');

  const negotiated = buildAdminAudiobookDocument({
    id,
    input: parseAdminAudiobookInput(payload({ licenceDisplay: 'CC BY-NC 4.0 · Kasena Heritage Trust' })),
    existing: null,
    now: NOW,
  });
  assert.equal(negotiated.licenceDisplay, 'CC BY-NC 4.0 · Kasena Heritage Trust');
});

test('the synopsis stands in for a transcript, and a transcript wins when there is one', () => {
  const withoutTranscript = buildAdminAudiobookDocument({
    id,
    input: parseAdminAudiobookInput(payload()),
    existing: null,
    now: NOW,
  });
  assert.equal(withoutTranscript.body, withoutTranscript.description);
  assert.notEqual(withoutTranscript.body, '');

  const withTranscript = buildAdminAudiobookDocument({
    id,
    input: parseAdminAudiobookInput(payload({ body: 'Chapter one. The hare and the hyena…' })),
    existing: null,
    now: NOW,
  });
  assert.equal(withTranscript.body, 'Chapter one. The hare and the hyena…');
  assert.match(String(withTranscript.description), /^Ten Kasena folktales/);
});

// ── Editing one that is already on the shelf ─────────────────────────────────

test('an edit keeps the media, the artwork and the original publication date', () => {
  const existing = {
    mediaUrl: 'https://firebasestorage.googleapis.com/original?token=a',
    thumbnailUrl: 'https://firebasestorage.googleapis.com/thumbnail?token=b',
    publishedAt: EARLIER,
    correctionState: 'none',
    lifecycle: { createdAt: EARLIER, updatedAt: EARLIER, version: 4 },
  };
  const document = buildAdminAudiobookDocument({
    id,
    input: parseAdminAudiobookInput(payload({ title: 'Sɔŋɔ ne Kasem (corrected)' })),
    existing,
    now: NOW,
  });

  // The URLs are minted after the write, so the record holds the only copy of
  // them: a corrected title must not take a playing audiobook off the air, and
  // the artwork must not blink out while it is copied again for no reason.
  assert.equal(document.mediaUrl, existing.mediaUrl);
  assert.equal(document.thumbnailUrl, existing.thumbnailUrl);
  assert.equal(document.publishedAt, EARLIER);
  assert.equal(document.title, 'Sɔŋɔ ne Kasem (corrected)');
  assert.deepEqual(document.lifecycle, { createdAt: EARLIER, updatedAt: NOW, version: 5 });
});

test('unpublishing keeps the record and its date; re-publishing clears the removal', () => {
  const live = {
    mediaUrl: 'https://firebasestorage.googleapis.com/original?token=a',
    publishedAt: EARLIER,
    correctionState: 'none',
    lifecycle: { createdAt: EARLIER, updatedAt: EARLIER, version: 2 },
  };
  const hidden = buildAdminAudiobookDocument({
    id,
    input: parseAdminAudiobookInput(payload({ published: false })),
    existing: live,
    now: NOW,
  });
  assert.equal(hidden.publicationStatus, 'unpublished');
  assert.equal(hidden.publishedAt, EARLIER);

  // deleteAdminAudiobook leaves correctionState 'removed'. Putting the book
  // back is a deliberate act, so the mark goes with it — otherwise the console
  // shows a live audiobook as taken down for ever.
  const removed = { ...live, correctionState: 'removed', publicationStatus: 'unpublished' };
  const restored = buildAdminAudiobookDocument({
    id,
    input: parseAdminAudiobookInput(payload()),
    existing: removed,
    now: NOW,
  });
  assert.equal(restored.publicationStatus, 'published');
  assert.equal(restored.correctionState, 'none');

  // An unpublish, by contrast, leaves the mark exactly as it found it.
  const stillRemoved = buildAdminAudiobookDocument({
    id,
    input: parseAdminAudiobookInput(payload({ published: false })),
    existing: removed,
    now: NOW,
  });
  assert.equal(stillRemoved.correctionState, 'removed');
});
