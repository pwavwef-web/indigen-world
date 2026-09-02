/** Shared, side-effect-free projection from a reviewed submission to the public model. */

import {
  canonicalLexicalKind,
  normaliseTranslations,
  type LexicalKind,
} from './lexical-kinds.js';

export const COLLECTION_KINDS = [
  'music',
  'dictionary',
  'literature',
  'audiobooks',
  'video',
] as const;

export type CollectionKind = (typeof COLLECTION_KINDS)[number];

type JsonRecord = Record<string, any>;

export interface PublishedProjectionInput {
  submissionId: string;
  publishedId: string;
  submission: JsonRecord;
  existing?: JsonRecord | null;
  creatorId: string;
  displayName: string;
  avatarUrl: string | null;
  publicationStatus: 'published' | 'unpublished';
  now: string;
  publicationRoute?: 'open' | 'reviewed' | 'collection_review' | 'admin';
  /**
   * The record this publication was projected from.
   *
   * Defaults to the submission, which is where all community work comes from.
   * Admin-published library material has no submission — nobody submitted it,
   * an administrator entered it — and the contract requires this pointer, so
   * that route supplies one rather than leaving a reference to a `submissions`
   * document that was never written and can never be fetched.
   */
  sourceReference?: { collection: string; id: string } | null;
  /**
   * Overrides the "© {displayName} · Published with permission by Indigen
   * World" line. Community work is published *with permission* from the person
   * who made it; a library audiobook carries whatever licence the rights holder
   * actually granted, and claiming otherwise on their behalf would be a rights
   * statement this code has no business inventing.
   */
  licenceDisplay?: string | null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Resolves legacy category names to the four canonical Collection destinations.
 * Explicit `collectionKind` always wins; aliases keep older TribeStudio content
 * discoverable without rewriting historical records.
 */
export function canonicalCollectionKind(value: unknown): CollectionKind | null {
  const normalized = text(value).toLowerCase().replace(/[\s_]+/g, '-');
  if ((COLLECTION_KINDS as readonly string[]).includes(normalized)) {
    return normalized as CollectionKind;
  }
  if (/^(audio|narration)$/.test(normalized)
    || /(audiobook|audio-book|oral-reading|spoken-word|narrated)/.test(normalized)) {
    return 'audiobooks';
  }
  if (/(dictionary|lexical|vocabulary|word-entry)/.test(normalized)) return 'dictionary';
  if (/(music|song|instrumental)/.test(normalized)) return 'music';
  if (/(video|film|reel|documentary|footage)/.test(normalized)) return 'video';
  if (/(literature|story|poetry|oral-history|written|book|folklore|proverb)/.test(normalized)) {
    return 'literature';
  }
  return null;
}

export function collectionKindForSubmission(submission: JsonRecord): CollectionKind | null {
  return canonicalCollectionKind(submission.collectionKind)
    ?? canonicalCollectionKind(submission.category);
}

/**
 * The list of meanings a lexical submission carries, for the public record.
 *
 * A submission written before `translations` existed has only `body`, and for a
 * dictionary entry that body *is* the list — so it is read through the same
 * parser rather than published as one long headword. Every other kind gets an
 * empty list unless it declared one: a song's body is lyrics, and splitting
 * lyrics on their commas would publish nonsense.
 *
 * Deriving here rather than at write time is deliberate. Fifteen thousand
 * historical rows are not going to be back-filled, and a projection that can
 * reconstruct the field on demand means they never have to be.
 */
export function submissionTranslations(
  submission: JsonRecord,
  kind: CollectionKind | null,
): string[] {
  if (submission.translations != null) return normaliseTranslations(submission.translations);
  return kind === 'dictionary' ? normaliseTranslations(submission.body) : [];
}

/** What kind of lexical item this is; `word` unless the submission said otherwise. */
export function submissionLexicalKind(submission: JsonRecord): LexicalKind {
  return canonicalLexicalKind(submission.lexicalKind);
}

function inferredMediaType(submission: JsonRecord, kind: CollectionKind | null): string | null {
  const declared = text(submission.media?.mediaType);
  if (['image', 'audio', 'video', 'document'].includes(declared)) return declared;
  if (kind === 'music' || kind === 'audiobooks') return 'audio';
  if (kind === 'literature') return 'document';
  if (kind === 'video') return 'video';
  return null;
}

/**
 * Produces only public fields. Long-form `body` and external recording links
 * are deliberately retained: losing either makes Literature or Audiobooks look
 * empty even after a successful review.
 */
export function buildPublishedContentDocument(input: PublishedProjectionInput): JsonRecord {
  const { submission, existing, now } = input;
  const kind = collectionKindForSubmission(submission);
  const body = text(submission.body);
  const description = text(submission.description) || body;
  const currentMediaUrl = text(existing?.mediaUrl);
  const externalMediaUrl = text(submission.externalPostUrl);
  const currentPublishedAt = text(existing?.publishedAt);
  const previousLifecycle = existing?.lifecycle && typeof existing.lifecycle === 'object'
    ? existing.lifecycle as JsonRecord
    : null;
  const route = input.publicationRoute
    ?? (submission.collectionContribution ? 'collection_review' : 'reviewed');

  return {
    id: input.publishedId,
    submission: input.sourceReference ?? { collection: 'submissions', id: input.submissionId },
    campaign: submission.campaign ?? null,
    creatorAttribution: {
      creatorId: input.creatorId,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl,
    },
    language: text(submission.primaryLanguage) || 'xsm',
    dialect: text(submission.dialect),
    category: text(submission.category),
    collectionKind: kind,
    // Carried through unconditionally rather than only for lexical material.
    // A song publishing with `lexicalKind: 'word'` is meaningless noise, and it
    // is the price of one rule instead of two: every reader can read the field
    // without first asking what kind of record it is looking at.
    lexicalKind: submissionLexicalKind(submission),
    translations: submissionTranslations(submission, kind),
    title: text(submission.title) || 'Untitled',
    description,
    body,
    englishSummary: text(submission.englishSummary),
    // Public media URLs are carried forward, never recomputed. They are minted
    // by finalisePublishedMedia *after* the publishing transaction commits, so
    // on a re-publish the record already holds the only copy of them: a song
    // republished after an edit keeps the recording and the cover art it was
    // published with, and the artwork does not blink out of the Now Playing
    // screen while a second copy is made that was never needed.
    mediaUrl: currentMediaUrl || externalMediaUrl,
    mediaType: inferredMediaType(submission, kind),
    thumbnailUrl: existing?.thumbnailUrl ?? null,
    captionsUrl: existing?.captionsUrl ?? null,
    culturalNotes: text(submission.culturalContext),
    ageRating: submission.disclosures?.involvesMinors ? '13+' : 'all',
    tags: Array.isArray(submission.tags)
      ? submission.tags.filter((tag: unknown): tag is string => typeof tag === 'string').slice(0, 20)
      : [],
    publicationStatus: input.publicationStatus,
    publishedAt: input.publicationStatus === 'published'
      ? (currentPublishedAt || now)
      : (currentPublishedAt || null),
    licenceDisplay: text(input.licenceDisplay)
      || `© ${input.displayName} · Published with permission by Indigen World`,
    sourceAttribution: text(submission.sourceReferences),
    publicationRoute: route,
    correctionState: text(existing?.correctionState) || 'none',
    schemaVersion: 1,
    lifecycle: previousLifecycle
      ? {
          createdAt: text(previousLifecycle.createdAt) || now,
          updatedAt: now,
          version: Number(previousLifecycle.version ?? 1) + 1,
        }
      : { createdAt: now, updatedAt: now, version: 1 },
  };
}
