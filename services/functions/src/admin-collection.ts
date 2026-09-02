import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireAuth, requireRole, type Role } from './auth.js';
import { buildPublishedContentDocument } from './publication.js';
import { finalisePublishedMedia } from './published-media.js';
import { consumeRateLimit } from './rate-limit.js';

/**
 * Audiobooks published by the Indigen World library itself.
 *
 * ── Why this is not a contribution ────────────────────────────────────────
 * Recording a book is not the same act as contributing a song. It involves a
 * rights holder, a narrator who is usually not the person uploading, files that
 * run to hours, and a licence somebody negotiated — none of which fits a phone
 * form, and all of which the community review queue would have to take on trust
 * from whoever pressed send. So audiobook contribution has come off the phone
 * and lives beside the Apps directory in the admin console instead.
 *
 * ── Why a callable at all ─────────────────────────────────────────────────
 * `publishedContent` is `allow write: if false` in the Firestore rules: it is
 * the one collection the mobile app consumes, and nothing with a browser is
 * allowed to write into it. The Admin SDK bypasses those rules, so the console
 * asks these two functions to do it — which also means every audiobook that
 * appears in the library leaves an audit record naming the person who put it
 * there, exactly as a reviewer's publication does.
 */

const REGION = 'us-central1';

// App Check enforcement follows the other callable functions in this project.
const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === 'true';

/**
 * The Storage prefix an audiobook's files must live in.
 *
 * Checked rather than trusted, exactly as the Collection contributions are: the
 * Storage rules decide who may write here, but nothing stops a caller *naming*
 * a path they did not write, and a publish that copied an arbitrary bucket
 * object into the world-readable `published-media/` path would be a disclosure
 * the rules never saw.
 */
export const AUDIOBOOK_STORAGE_PREFIX = 'collection-audiobooks/';

/** Matches the Storage ceiling for narration; a full book is a long file. */
const MAX_AUDIO_BYTES = 500 * 1024 * 1024;

/** Cover art, same small ceiling a contributed song's cover gets. */
const MAX_COVER_BYTES = 8 * 1024 * 1024;

/**
 * Firestore document ids as the shared contract defines an identifier. Applied
 * to the caller-supplied id because it becomes a document path and half of a
 * Storage path; anything with a slash or a dot segment in it is not an id.
 */
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * BCP 47 / ISO 639-3, as the shared contract defines a language code. Checked
 * because the field is a form input on a console: "Kasem" typed where `xsm`
 * belongs is a record no language filter will ever match, and nothing downstream
 * would complain about it.
 */
const LANGUAGE_PATTERN = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

/**
 * The creator the library publishes as.
 *
 * Not the administrator's own uid, deliberately. `creatorAttribution.creatorId`
 * is what the mobile creator page queries by, so publishing under the uid of
 * whoever happened to be signed in would file the national library's audiobooks
 * on that person's creator profile — and move them the day a different
 * administrator did the next one. The audit log records who acted; this records
 * who published.
 */
export const ADMIN_AUDIOBOOK_CREATOR_ID = 'indigen-world-library';

/** One file the admin console has already uploaded to Storage. */
export interface AdminAudiobookFile {
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
}

export interface AdminAudiobookInput {
  /** Supplied to rewrite an existing record; null mints a fresh one. */
  audiobookId: string | null;
  title: string;
  author: string;
  narrator: string;
  description: string;
  body: string;
  category: string;
  dialect: string;
  language: string;
  licenceDisplay: string;
  audio: AdminAudiobookFile;
  cover: AdminAudiobookFile | null;
  published: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

function requiredText(data: Record<string, unknown>, key: string, max: number): string {
  const value = data[key];
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > max) {
    throw new HttpsError('invalid-argument', `${key} is required and must be at most ${max} characters.`);
  }
  return value.trim();
}

function optionalText(data: Record<string, unknown>, key: string, max: number): string {
  const value = data[key];
  if (value == null) return '';
  if (typeof value !== 'string' || value.trim().length > max) {
    throw new HttpsError('invalid-argument', `${key} must be at most ${max} characters.`);
  }
  return value.trim();
}

function parseRecordId(raw: unknown, key: string): string {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!ID_PATTERN.test(value)) {
    throw new HttpsError('invalid-argument', `${key} is required and must be a valid record id.`);
  }
  return value;
}

/** An absent id is a new audiobook rather than a malformed one. */
function parseOptionalRecordId(raw: unknown, key: string): string | null {
  if (raw == null || raw === '') return null;
  return parseRecordId(raw, key);
}

/** Kasem unless the console says otherwise; everything here is Kasena work. */
function parseLanguage(value: string): string {
  if (!value) return 'xsm';
  const language = value.toLowerCase();
  if (!LANGUAGE_PATTERN.test(language)) {
    throw new HttpsError('invalid-argument', 'language must be a language code such as xsm or en.');
  }
  return language;
}

/**
 * Validates one uploaded file reference.
 *
 * The declared MIME type is checked as well as the path because the two are
 * what the published record is built from: a cover that is really an audio file
 * would be handed to an image decoder on the lock screen, and narration that is
 * really a PDF would be handed to the player. The Storage rules make the same
 * two demands on the way in; this is the same fence on the way out.
 */
function parseAudiobookFile(
  raw: unknown,
  key: string,
  expectations: { mimePrefix: string; maxBytes: number },
): AdminAudiobookFile {
  if (raw == null) {
    throw new HttpsError('invalid-argument', `${key} is required.`);
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new HttpsError('invalid-argument', `${key} must be an object.`);
  }
  const data = raw as Record<string, unknown>;
  const storagePath = typeof data.storagePath === 'string' ? data.storagePath.trim() : '';
  if (!storagePath.startsWith(AUDIOBOOK_STORAGE_PREFIX) || storagePath.includes('..')) {
    throw new HttpsError(
      'permission-denied',
      `${key} must be a file uploaded to the ${AUDIOBOOK_STORAGE_PREFIX} folder.`,
    );
  }
  const mimeType = typeof data.mimeType === 'string' ? data.mimeType.trim().toLowerCase() : '';
  if (!mimeType.startsWith(expectations.mimePrefix)) {
    throw new HttpsError('invalid-argument', `${key} must be a ${expectations.mimePrefix}* file.`);
  }
  const sizeBytes = typeof data.sizeBytes === 'number' ? Math.round(data.sizeBytes) : 0;
  if (sizeBytes < 0 || sizeBytes > expectations.maxBytes) {
    throw new HttpsError(
      'invalid-argument',
      `${key} is too large (${Math.round(expectations.maxBytes / (1024 * 1024))} MB maximum).`,
    );
  }
  return { storagePath, mimeType, sizeBytes };
}

/** Cover art is optional; an audiobook without one still plays. */
function parseOptionalAudiobookFile(
  raw: unknown,
  key: string,
  expectations: { mimePrefix: string; maxBytes: number },
): AdminAudiobookFile | null {
  if (raw == null) return null;
  return parseAudiobookFile(raw, key, expectations);
}

/** Pure input validation, shared by the callable and its unit tests. */
export function parseAdminAudiobookInput(raw: unknown): AdminAudiobookInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new HttpsError('invalid-argument', 'Audiobook details are required.');
  }
  const data = raw as Record<string, unknown>;
  if (typeof data.published !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Choose whether this audiobook is published.');
  }
  return {
    audiobookId: parseOptionalRecordId(data.audiobookId, 'audiobookId'),
    title: requiredText(data, 'title', 180),
    author: requiredText(data, 'author', 180),
    narrator: requiredText(data, 'narrator', 180),
    description: requiredText(data, 'description', 4000),
    // Optional, though the shelf copy is not: an audiobook is a recording, and
    // most of them will never have a transcript typed out. Where one exists it
    // is the whole text of the work and belongs in `body`, which is the field
    // the reader screen renders; where one does not, the synopsis stands in so
    // the record is never blank.
    body: optionalText(data, 'body', 200_000),
    category: requiredText(data, 'category', 80),
    dialect: requiredText(data, 'dialect', 80),
    language: parseLanguage(optionalText(data, 'language', 20)),
    licenceDisplay: optionalText(data, 'licenceDisplay', 300),
    audio: parseAudiobookFile(data.audio, 'audio', {
      mimePrefix: 'audio/',
      maxBytes: MAX_AUDIO_BYTES,
    }),
    cover: parseOptionalAudiobookFile(data.cover, 'cover', {
      mimePrefix: 'image/',
      maxBytes: MAX_COVER_BYTES,
    }),
    published: data.published,
  };
}

/**
 * The one line that says who made this recording.
 *
 * Author and narrator are two different people doing two different things, and
 * the player has exactly one artist line to say so in. Collapsing them when
 * they are the same person avoids "Ama Atonsi · narrated by Ama Atonsi" on
 * every lock screen.
 */
export function audiobookAttribution(input: AdminAudiobookInput): string {
  if (!input.narrator || input.narrator.toLowerCase() === input.author.toLowerCase()) {
    return input.author;
  }
  return `${input.author} · narrated by ${input.narrator}`;
}

/**
 * Projects an admin audiobook into the public `publishedContent` shape.
 *
 * ── Why a synthetic submission ────────────────────────────────────────────
 * `buildPublishedContentDocument` is the one place that knows what a published
 * record looks like — every field, in the order the contract declares them, and
 * the carry-forward rules that stop a re-publish blanking a media URL. Writing
 * a second projection here would mean two shapes to keep in step, and the one
 * that is only exercised by audiobooks is the one that would quietly fall
 * behind. So the audiobook is handed to it as the record it projects from. Two
 * small options were added to that function rather than faked: `sourceReference`
 * (nothing was submitted, so the pointer the contract requires cannot name a
 * submissions document that does not exist) and `licenceDisplay` (a library
 * audiobook carries the rights holder's own terms, not "published with
 * permission" by a contributor who does not exist).
 */
export function buildAdminAudiobookDocument(args: {
  id: string;
  input: AdminAudiobookInput;
  existing?: Record<string, any> | null;
  now: string;
}): Record<string, unknown> {
  const { id, input, existing = null, now } = args;
  const attribution = audiobookAttribution(input);
  const shelf = input.category.trim().toLowerCase();

  const submission = {
    campaign: null,
    primaryLanguage: input.language,
    dialect: input.dialect,
    // `category` is what the Collection screens group by and what the lock
    // screen shows as the album line, so it is the destination, not the genre.
    // The genre the administrator typed travels as a tag, where a shelf name
    // belongs.
    category: 'audiobooks',
    collectionKind: 'audiobooks',
    title: input.title,
    description: input.description,
    body: input.body || input.description,
    englishSummary: '',
    culturalContext: '',
    sourceReferences: attribution,
    externalPostUrl: null,
    media: {
      storagePath: input.audio.storagePath,
      mimeType: input.audio.mimeType,
      mediaType: 'audio',
    },
    tags: shelf && shelf !== 'audiobooks' ? ['audiobooks', shelf] : ['audiobooks'],
    // Asked and answered rather than left undeclared: a library recording is
    // published material with a known rights holder, not a field recording of a
    // named individual.
    disclosures: { involvesMinors: false },
  };

  const document = buildPublishedContentDocument({
    submissionId: id,
    publishedId: id,
    submission,
    existing,
    creatorId: ADMIN_AUDIOBOOK_CREATOR_ID,
    displayName: attribution,
    avatarUrl: null,
    publicationStatus: input.published ? 'published' : 'unpublished',
    now,
    publicationRoute: 'admin',
    // The record is its own source. A dangling pointer into `submissions` would
    // be worse than a circular one: anything resolving it would fetch nothing
    // and have no way to tell "deleted" from "never existed".
    sourceReference: { collection: 'publishedContent', id },
    licenceDisplay: input.licenceDisplay || `© ${input.author} · Published by Indigen World`,
  });

  // Putting a removed audiobook back is a deliberate act. Without this the
  // `removed` mark left by deleteAdminAudiobook would be carried forward by the
  // projection and the console would go on showing a live record as taken down.
  if (input.published) document.correctionState = 'none';

  return document;
}

/**
 * Admin-only: publish (or re-publish) a library audiobook.
 *
 * Idempotent on `audiobookId`: an edit rewrites the same record, so correcting
 * a title never leaves two audiobooks on the shelf. The Storage copy runs after
 * the transaction commits, because Storage I/O cannot run inside a Firestore
 * transaction.
 */
export const publishAdminAudiobook = onCall(
  {
    region: REGION,
    enforceAppCheck: ENFORCE_APP_CHECK,
    consumeAppCheckToken: ENFORCE_APP_CHECK,
    invoker: 'public',
  },
  async (req) => {
    const uid = requireAuth(req);
    const actorRole: Role = requireRole(req, 'admin');
    await consumeRateLimit('publishAdminAudiobook', uid, 30);
    const input = parseAdminAudiobookInput(req.data);

    const db = getFirestore();
    const publishedRef = input.audiobookId
      ? db.collection('publishedContent').doc(input.audiobookId)
      : db.collection('publishedContent').doc();
    const auditRef = db.collection('auditLogs').doc();
    const now = nowIso();

    await db.runTransaction(async (tx) => {
      const existingSnap = await tx.get(publishedRef);
      const existing = existingSnap.exists ? (existingSnap.data() as Record<string, any>) : null;
      // An id is just a string, and `publishedContent` holds every published
      // song, film and story in the app. Without this, a mistyped audiobookId
      // would overwrite a member's reviewed work with an audiobook, destroying
      // its link to the submission and review that approved it.
      if (existing && existing.publicationRoute !== 'admin') {
        throw new HttpsError(
          'failed-precondition',
          'That record was published through community review and cannot be edited here.',
        );
      }
      const previousStatus = existing ? String(existing.publicationStatus ?? 'unknown') : null;

      tx.set(publishedRef, buildAdminAudiobookDocument({
        id: publishedRef.id,
        input,
        existing,
        now,
      }));
      tx.set(auditRef, {
        id: auditRef.id,
        actor: { collection: 'users', id: uid, role: actorRole },
        action: 'collection.audiobook.publish',
        target: { collection: 'publishedContent', id: publishedRef.id },
        outcome: 'success',
        source: 'functions',
        before: previousStatus ? { publicationStatus: previousStatus } : null,
        after: {
          publicationStatus: input.published ? 'published' : 'unpublished',
          title: input.title,
        },
        metadata: {
          collectionKind: 'audiobooks',
          author: input.author,
          narrator: input.narrator,
          hasCover: input.cover != null,
          edit: existing != null,
        },
        occurredAt: now,
      });
    });

    // Post-commit: the narration and its cover become world-readable and their
    // download URLs land on the record. A failure here is reported rather than
    // thrown, so the administrator keeps the id: publishing is idempotent, and
    // sending the same id again retries the copy instead of shelving a second
    // audiobook.
    let mediaPublished = true;
    try {
      await finalisePublishedMedia(publishedRef, {
        contentId: publishedRef.id,
        storagePath: input.audio.storagePath,
        mimeType: input.audio.mimeType,
        mediaType: 'audio',
        thumbnailPath: input.cover?.storagePath ?? null,
      });
    } catch (error) {
      mediaPublished = false;
      console.error(`finalisePublishedMedia failed for audiobook ${publishedRef.id}`, error);
    }

    return { id: publishedRef.id, mediaPublished };
  },
);

/**
 * Admin-only: take a library audiobook off the shelf.
 *
 * Unpublished and marked removed, never deleted. Nothing in this codebase hard
 * deletes a published record: the audit trail has to keep pointing at something,
 * and a member who downloaded a chapter should not have their library silently
 * rewritten because a document vanished.
 */
export const deleteAdminAudiobook = onCall(
  {
    region: REGION,
    enforceAppCheck: ENFORCE_APP_CHECK,
    consumeAppCheckToken: ENFORCE_APP_CHECK,
    invoker: 'public',
  },
  async (req) => {
    const uid = requireAuth(req);
    const actorRole: Role = requireRole(req, 'admin');
    await consumeRateLimit('deleteAdminAudiobook', uid, 30);
    if (!req.data || typeof req.data !== 'object' || Array.isArray(req.data)) {
      throw new HttpsError('invalid-argument', 'audiobookId is required.');
    }
    const audiobookId = parseRecordId(
      (req.data as Record<string, unknown>).audiobookId,
      'audiobookId',
    );

    const db = getFirestore();
    const publishedRef = db.collection('publishedContent').doc(audiobookId);
    const auditRef = db.collection('auditLogs').doc();
    const now = nowIso();

    return db.runTransaction(async (tx) => {
      const snap = await tx.get(publishedRef);
      if (!snap.exists) {
        throw new HttpsError('not-found', 'Audiobook not found.');
      }
      const record = snap.data() as Record<string, any>;
      // Community work is unpublished through the review workflow, which also
      // moves the submission and tells the creator. Doing it here would strip a
      // reel off the app leaving its submission still marked PUBLISHED.
      if (record.publicationRoute !== 'admin') {
        throw new HttpsError(
          'failed-precondition',
          'That record was published through community review; unpublish it there.',
        );
      }
      const previousStatus = String(record.publicationStatus ?? 'unknown');

      tx.update(publishedRef, {
        publicationStatus: 'unpublished',
        correctionState: 'removed',
        'lifecycle.updatedAt': now,
        'lifecycle.version': FieldValue.increment(1),
      });
      tx.set(auditRef, {
        id: auditRef.id,
        actor: { collection: 'users', id: uid, role: actorRole },
        action: 'collection.audiobook.delete',
        target: { collection: 'publishedContent', id: audiobookId },
        outcome: 'success',
        source: 'functions',
        before: { publicationStatus: previousStatus, correctionState: record.correctionState ?? 'none' },
        after: { publicationStatus: 'unpublished', correctionState: 'removed' },
        metadata: { collectionKind: 'audiobooks', title: String(record.title ?? '') },
        occurredAt: now,
      });

      return {
        id: audiobookId,
        previousStatus,
        status: 'unpublished' as const,
      };
    });
  },
);
