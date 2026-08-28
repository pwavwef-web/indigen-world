/** Shared, side-effect-free projection from a reviewed submission to the public model. */

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
  publicationRoute?: 'open' | 'reviewed' | 'collection_review';
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
    submission: { collection: 'submissions', id: input.submissionId },
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
    title: text(submission.title) || 'Untitled',
    description,
    body,
    englishSummary: text(submission.englishSummary),
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
    licenceDisplay: `© ${input.displayName} · Published with permission by Indigen World`,
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
