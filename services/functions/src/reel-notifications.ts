import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import {
  MAX_REEL_THREAD_FANOUT,
  actorFor,
  actorFrom,
  eligibleRecipients,
  isSilenced,
  preview,
  recipientsWanting,
  wantsFrom,
  writeCommunityNotification,
  writeCommunityNotifications,
} from './community-notifications.js';

/**
 * Alerts for the conversation under a published Explore reel.
 *
 * `reelComments/{commentId}` is the only engagement collection on a reel that
 * is worth waking somebody for. Appreciations and keeps are deliberately silent
 * — a reel can collect a hundred of either in an afternoon, and none of them is
 * something anybody needs to be told about individually; the totals under the
 * reel already say it. A comment is somebody speaking, and being spoken to
 * without hearing about it is the failure worth avoiding.
 *
 * Shape of a comment, as `reel_engagement.dart` writes it:
 *
 *   reelId           the `publishedContent` document the reel came from
 *   authorId         who wrote it
 *   author           denormalised { displayName, username, avatarUrl, … }
 *   text             the comment, at most 400 characters
 *   parentCommentId  optional; see [directReplyTarget]
 *   createdAt        server timestamp
 *
 * Everything here rides on `COMMUNITY_CHANNEL_ID` through the shared fan-out in
 * community-notifications.ts. No new Android channel: an id the app has not
 * created at start-up makes Android invent the channel at default importance,
 * silently and permanently, so a channel is only ever worth adding in
 * local_alerts.dart and here at the same time — and reel replies are ordinary
 * community activity, which is exactly what that channel is for.
 */

const REGION = 'us-central1';

/** How many earlier comments are read when working out who is in the thread. */
const REEL_THREAD_SCAN_LIMIT = 100;

/**
 * The comment this one is a direct reply to, if the client said so.
 *
 * The replies sheet does not thread today — every comment sits at the top level
 * of one reel — so this is almost always absent, and the fan-out below falls
 * back to "everybody already talking under this reel". It is read anyway
 * because the field costs nothing to honour and because the day the sheet grows
 * threading, "somebody replied to your comment" should be the alert that
 * arrives rather than the vaguer one.
 */
export function directReplyTarget(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const parentCommentId = (data as Record<string, unknown>).parentCommentId;
  return typeof parentCommentId === 'string' && parentCommentId ? parentCommentId : null;
}

/**
 * The uid that owns a published piece, read from its attribution block.
 *
 * `creatorProfiles` is keyed by the creator's auth uid (see firestore.rules,
 * where the owner check is `isOwner(creatorId)`), so the id stamped onto the
 * publication is the same id `communityProfiles` and `communityDevices` are
 * keyed by — no second lookup to translate one into the other.
 */
export function reelOwnerOf(published: unknown): string | null {
  if (!published || typeof published !== 'object') return null;
  const attribution = (published as Record<string, unknown>).creatorAttribution;
  if (!attribution || typeof attribution !== 'object') return null;
  const creatorId = (attribution as Record<string, unknown>).creatorId;
  return typeof creatorId === 'string' && creatorId ? creatorId : null;
}

export const onReelCommentCreated = onDocumentCreated(
  { document: 'reelComments/{commentId}', region: REGION },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data();
    const reelId = data.reelId;
    const authorId = data.authorId;
    if (typeof reelId !== 'string' || !reelId) return;
    if (typeof authorId !== 'string' || !authorId) return;

    const db = getFirestore();
    const commentId = snap.id;
    const text = preview(data.text);

    // The comment already carries its author's public identity, stamped by the
    // client on every send, so the ordinary case costs no profile read at all.
    const actor = data.author && typeof data.author === 'object'
      ? actorFrom(authorId, data.author)
      : await actorFor(db, authorId);

    // Nobody hears about this comment twice, and the author never hears about
    // their own.
    const alerted = new Set<string>([authorId]);

    // ── Somebody replied to your comment ──────────────────────────────────
    const parentCommentId = directReplyTarget(data);
    if (parentCommentId) {
      const parent = await db.collection('reelComments').doc(parentCommentId).get();
      const parentAuthor = parent.get('authorId');
      if (
        typeof parentAuthor === 'string'
        && !alerted.has(parentAuthor)
        && !(await isSilenced(db, parentAuthor, authorId))
        && (await wantsFrom(db, parentAuthor, 'reelComments'))
      ) {
        alerted.add(parentAuthor);
        await writeCommunityNotification(db, {
          id: `reelreply_${commentId}`,
          recipientId: parentAuthor,
          type: 'reel_comment',
          actor,
          title: `${actor.displayName} replied to your comment`,
          body: text,
          // Explore is the home tab and where the reel lives. There is no
          // per-reel route in the app's router yet, so pointing at a made-up
          // one would be a deep link that quietly goes nowhere.
          route: '/',
          collapseKey: `reel_${reelId}`,
        });
      }
    }

    // ── Somebody commented on your reel ───────────────────────────────────
    const published = await db.collection('publishedContent').doc(reelId).get();
    const ownerId = reelOwnerOf(published.data());
    if (
      ownerId
      && !alerted.has(ownerId)
      && !(await isSilenced(db, ownerId, authorId))
      && (await wantsFrom(db, ownerId, 'reelComments'))
    ) {
      alerted.add(ownerId);
      const workTitle = published.get('title');
      await writeCommunityNotification(db, {
        id: `reelcomment_${commentId}`,
        recipientId: ownerId,
        type: 'reel_comment',
        actor,
        title: `${actor.displayName} commented on your work`,
        body: text,
        postPreview: typeof workTitle === 'string' ? workTitle : '',
        route: '/',
        collapseKey: `reel_${reelId}`,
      });
    }

    // ── Everybody else already talking under this reel ────────────────────
    //
    // The reel's comments are one flat conversation, so somebody who has
    // spoken under it is in that conversation in exactly the way a community
    // thread's earlier repliers are — and this is the reel-side answer to the
    // same question `notifyThreadFollowers` answers. Capped hard, and every
    // recipient still has to have left `reelComments` switched on.
    const thread = await db
      .collection('reelComments')
      .where('reelId', '==', reelId)
      .limit(REEL_THREAD_SCAN_LIMIT)
      .get();

    const chosen = eligibleRecipients({
      candidates: thread.docs.map((doc) => doc.get('authorId')),
      exclude: alerted,
      silenced: await silencedSet(db, thread.docs.map((doc) => doc.get('authorId')), authorId, alerted),
      cap: MAX_REEL_THREAD_FANOUT,
    });
    if (chosen.truncated > 0) {
      logger.info('Reel comment fan-out truncated', {
        reelId,
        commentId,
        notified: chosen.recipients.length,
        dropped: chosen.truncated,
      });
    }

    const wanted = await recipientsWanting(db, chosen.recipients, 'reelComments');

    await writeCommunityNotifications(
      db,
      chosen.recipients
        .filter((uid) => wanted.has(uid))
        .map((uid) => ({
          id: `reelthread_${commentId}_${uid}`,
          recipientId: uid,
          type: 'reel_comment' as const,
          actor,
          title: `${actor.displayName} also commented on a reel you replied to`,
          body: text,
          route: '/',
          // One reel is one entry on the lock screen, however busy its
          // conversation gets while a phone is off.
          collapseKey: `reel_${reelId}`,
        })),
    );
  },
);

/**
 * Which of this reel's earlier commenters must not hear from [authorId].
 *
 * Deliberately the per-pair check rather than the query-based one
 * `silencedFor` runs: the candidate list here is at most a couple of dozen
 * distinct people, and three whole-collection queries to filter twenty
 * candidates costs more than the twenty batched document reads it saves.
 */
async function silencedSet(
  db: FirebaseFirestore.Firestore,
  candidates: unknown[],
  authorId: string,
  alerted: ReadonlySet<string>,
): Promise<Set<string>> {
  const distinct = eligibleRecipients({
    candidates,
    exclude: alerted,
    cap: MAX_REEL_THREAD_FANOUT,
  }).recipients;

  const silenced = new Set<string>();
  const verdicts = await Promise.all(
    distinct.map(async (uid) => ({ uid, silenced: await isSilenced(db, uid, authorId) })),
  );
  for (const verdict of verdicts) {
    if (verdict.silenced) silenced.add(verdict.uid);
  }
  return silenced;
}
