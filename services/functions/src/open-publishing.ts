import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { finalisePublishedMedia, type PublishableMedia } from './published-media.js';
import { writeCommunityNotification } from './community-notifications.js';

/**
 * Open publishing from TribeStudio.
 *
 * Two routes reach the public Explore feed, and they answer different needs:
 *
 *   Open posts (no campaign)  — anyone with an account publishes directly. No
 *                               verification, no queue, no reviewer. What the
 *                               creator is asked for instead is the thing that
 *                               actually matters: that they hold the rights and
 *                               have the consent of anyone in the work. This
 *                               trigger does that publication.
 *
 *   Campaign entries          — commissioned calls with rewards and eligibility
 *                               attached, so they keep the reviewed path in
 *                               creators.ts (`decideSubmission`) and are
 *                               deliberately untouched here.
 *
 * Gating the everyday case behind review was throttling the platform's whole
 * purpose: a language stays alive by being used constantly, not by being
 * approved occasionally. Moderation for open posts is reactive — reports and
 * takedowns — rather than a gate in front of every upload.
 */

const REGION = 'us-central1';

/** Statuses a creator can leave a submission in when they mean "publish it". */
const READY_STATUSES = new Set(['SUBMITTED', 'RESUBMITTED']);

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Whether this submission belongs to a campaign.
 *
 * The client writes `campaign: { collection, id }` with an empty or `open` id
 * for a non-campaign post, so both the missing-field and the placeholder shapes
 * have to read as "not a campaign".
 */
export function isCampaignSubmission(campaign: unknown): boolean {
  if (!campaign || typeof campaign !== 'object') return false;
  const id = (campaign as Record<string, unknown>).id;
  if (typeof id !== 'string') return false;
  const trimmed = id.trim().toLowerCase();
  return trimmed.length > 0 && trimmed !== 'open' && trimmed !== 'none';
}

export const onSubmissionWritten = onDocumentWritten(
  { document: 'submissions/{submissionId}', region: REGION },
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;
    const submission = after.data();
    if (!submission) return;

    const submissionId = after.id;
    const status = submission.status;

    // Campaign entries keep the reviewed path.
    if (isCampaignSubmission(submission.campaign)) return;
    if (typeof status !== 'string' || !READY_STATUSES.has(status)) return;

    // Publishing is what the creator asked for; without that permission the
    // piece stays private no matter which route it took here.
    if (submission.permissions?.publication !== true) return;

    const authUid = submission.authUid;
    if (typeof authUid !== 'string' || !authUid) return;

    const db = getFirestore();
    const publishedRef = db.collection('publishedContent').doc(`pub_${submissionId}`);
    const existing = await publishedRef.get();

    // Idempotent: an at-least-once trigger, or a creator editing an already
    // published piece, rewrites the same record instead of making a second one.
    const alreadyPublic: string = existing.exists ? (existing.get('mediaUrl') ?? '') : '';
    const now = nowIso();

    const creatorId: string = submission.creator?.id ?? authUid;
    const profile = await db.collection('creatorProfiles').doc(creatorId).get();
    const displayName = profile.get('public.displayName') ?? 'Indigen World creator';
    const avatarUrl = profile.get('public.avatarUrl') ?? null;

    await publishedRef.set({
      id: publishedRef.id,
      submission: { collection: 'submissions', id: submissionId },
      campaign: null,
      creatorAttribution: { creatorId, displayName, avatarUrl },
      language: submission.primaryLanguage ?? 'xsm',
      dialect: submission.dialect ?? '',
      category: submission.category ?? '',
      title: submission.title ?? 'Untitled',
      description: submission.description ?? '',
      englishSummary: submission.englishSummary ?? '',
      mediaUrl: alreadyPublic,
      mediaType: submission.media?.mediaType ?? null,
      thumbnailUrl: existing.exists ? (existing.get('thumbnailUrl') ?? null) : null,
      captionsUrl: null,
      culturalNotes: submission.culturalContext ?? '',
      ageRating: submission.disclosures?.involvesMinors ? '13+' : 'all',
      tags: Array.isArray(submission.tags) ? submission.tags.slice(0, 20) : [],
      publicationStatus: 'published',
      // Keep the original publication moment across later edits, so an edit
      // does not shove an old piece back to the top of the feed.
      publishedAt: existing.exists ? (existing.get('publishedAt') ?? now) : now,
      licenceDisplay: `© ${displayName} · Published on Indigen World`,
      correctionState: 'none',
      // Records how this reached the public feed, so moderation and analytics
      // can tell an open post from a reviewed campaign entry.
      publicationRoute: 'open',
      schemaVersion: 1,
      lifecycle: existing.exists
        ? {
          createdAt: existing.get('lifecycle.createdAt') ?? now,
          updatedAt: now,
          version: (existing.get('lifecycle.version') ?? 1) + 1,
        }
        : { createdAt: now, updatedAt: now, version: 1 },
    });

    await after.ref.update({
      status: 'PUBLISHED',
      'moderation.publishedContent': { collection: 'publishedContent', id: publishedRef.id },
      'moderation.decidedAt': now,
      'lifecycle.updatedAt': now,
      'lifecycle.version': FieldValue.increment(1),
    });

    // Storage I/O runs after the documents land, and its failure is survivable:
    // the record is already public and the next write fills the URL in.
    const storagePath: string = submission.media?.storagePath ?? '';
    if (storagePath && !alreadyPublic) {
      const media: PublishableMedia = {
        contentId: publishedRef.id,
        storagePath,
        mimeType: submission.media?.mimeType ?? 'application/octet-stream',
        mediaType: submission.media?.mediaType ?? 'video',
        thumbnailPath: submission.media?.thumbnailPath ?? null,
      };
      try {
        await finalisePublishedMedia(publishedRef, media);
      } catch (error) {
        logger.error('Open publish media copy failed', {
          submissionId,
          errorType: error instanceof Error ? error.name : 'unknown',
        });
      }
    }

    // Only tell the creator the first time; an edit is not news.
    if (!existing.exists) {
      await writeCommunityNotification(db, {
        id: `publication_${publishedRef.id}`,
        recipientId: authUid,
        type: 'publication',
        title: 'Your work is live on Explore',
        body: typeof submission.title === 'string' ? submission.title : '',
        route: '/',
      });
    }
  },
);
