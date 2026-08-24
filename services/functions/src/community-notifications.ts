import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';

/**
 * Community notifications for the mobile app.
 *
 * Everything a member sees in their notifications centre is written here, by
 * the trusted backend, in response to something that actually happened. Clients
 * may only flip `read` on their own rows (see firestore.rules), so no account
 * can manufacture an alert — which matters because an alert is a channel
 * straight to somebody's lock screen.
 *
 * Shape of `communityNotifications/{id}`:
 *
 *   recipientId  uid the alert belongs to
 *   type         like | reply | follow | mention | publication
 *   actor        { id, displayName, username, avatarUrl }  — who caused it
 *   title        the headline, already written for a human
 *   body         optional second line
 *   postId       the post it opens, when there is one
 *   postPreview  a short quote of that post
 *   route        explicit deep link for kinds with no post
 *   read         false until the member opens it
 *   createdAt    server timestamp
 */

const REGION = 'us-central1';

/** How much of a post is quoted inside an alert. */
const PREVIEW_LENGTH = 120;

/** Cap on how many people one post can notify by mentioning them. */
const MAX_MENTIONS = 10;

type ActorStamp = {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
};

function preview(text: unknown): string {
  if (typeof text !== 'string') return '';
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > PREVIEW_LENGTH
    ? `${collapsed.slice(0, PREVIEW_LENGTH - 1)}…`
    : collapsed;
}

/** The public identity to stamp on an alert, read once from the profile. */
async function actorFor(
  db: FirebaseFirestore.Firestore,
  uid: string,
): Promise<ActorStamp> {
  const snap = await db.collection('communityProfiles').doc(uid).get();
  const displayName = snap.get('displayName');
  const username = snap.get('username');
  const avatarUrl = snap.get('avatarUrl');
  return {
    id: uid,
    displayName: typeof displayName === 'string' && displayName.trim() ? displayName.trim() : 'A member',
    username: typeof username === 'string' ? username : '',
    avatarUrl: typeof avatarUrl === 'string' && avatarUrl ? avatarUrl : null,
  };
}

interface NotificationInput {
  recipientId: string;
  type: 'like' | 'reply' | 'follow' | 'mention' | 'publication';
  actor?: ActorStamp;
  title: string;
  body?: string;
  postId?: string | null;
  postPreview?: string;
  route?: string | null;
  /** Stable id, used to make a repeated trigger idempotent. */
  id?: string;
}

/**
 * Writes one notification and pushes it.
 *
 * `id` is derived from the edge that caused the alert (`like_{uid}_{postId}`
 * and friends), so an at-least-once trigger delivery rewrites the same document
 * instead of stacking duplicates in somebody's centre.
 */
export async function writeCommunityNotification(
  db: FirebaseFirestore.Firestore,
  input: NotificationInput,
): Promise<void> {
  if (!input.recipientId) return;

  const ref = input.id
    ? db.collection('communityNotifications').doc(input.id)
    : db.collection('communityNotifications').doc();

  // Never rewrite an alert that already exists. Two things depend on this: a
  // re-delivered trigger must not resurface something the member already read,
  // and — because the id is derived from the edge — somebody cannot un-like and
  // re-like a post to ping its author over and over.
  const existing = await ref.get();
  if (existing.exists) return;

  await ref.set({
    id: ref.id,
    recipientId: input.recipientId,
    type: input.type,
    ...(input.actor ? { actor: input.actor, actorId: input.actor.id } : {}),
    title: input.title,
    body: input.body ?? '',
    postId: input.postId ?? null,
    postPreview: input.postPreview ?? '',
    route: input.route ?? null,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  });
}

// ---------------------------------------------------------------------------
// Likes
// ---------------------------------------------------------------------------

export const onCommunityLikeCreated = onDocumentCreated(
  { document: 'communityLikes/{likeId}', region: REGION },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    const uid = data.uid;
    const postId = data.postId;
    if (typeof uid !== 'string' || typeof postId !== 'string') return;

    const db = getFirestore();
    const post = await db.collection('communityPosts').doc(postId).get();
    if (!post.exists) return;

    const authorId = post.get('authorId');
    // Liking your own post is not news.
    if (typeof authorId !== 'string' || authorId === uid) return;

    const actor = await actorFor(db, uid);
    await writeCommunityNotification(db, {
      id: `like_${uid}_${postId}`,
      recipientId: authorId,
      type: 'like',
      actor,
      title: `${actor.displayName} liked your post`,
      postId,
      postPreview: preview(post.get('text')),
    });
  },
);

// ---------------------------------------------------------------------------
// Follows
// ---------------------------------------------------------------------------

export const onCommunityFollowCreated = onDocumentCreated(
  { document: 'communityFollows/{followId}', region: REGION },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    const followerId = data.followerId;
    const followingId = data.followingId;
    if (typeof followerId !== 'string' || typeof followingId !== 'string') return;
    if (followerId === followingId) return;

    const db = getFirestore();
    const actor = await actorFor(db, followerId);
    await writeCommunityNotification(db, {
      id: `follow_${followerId}_${followingId}`,
      recipientId: followingId,
      type: 'follow',
      actor,
      title: `${actor.displayName} followed you`,
      body: actor.username ? `@${actor.username}` : '',
      route: '/notifications',
    });
  },
);

// ---------------------------------------------------------------------------
// Replies and mentions
// ---------------------------------------------------------------------------

/** The handles named in a post body, lowercased and de-duplicated. */
export function mentionedHandles(text: unknown): string[] {
  if (typeof text !== 'string') return [];
  const matches = text.matchAll(/(?:^|[^\w@])@([a-z0-9_]{3,20})\b/gi);
  const handles = new Set<string>();
  for (const match of matches) {
    handles.add(match[1].toLowerCase());
    if (handles.size >= MAX_MENTIONS) break;
  }
  return [...handles];
}

export const onCommunityPostCreated = onDocumentCreated(
  { document: 'communityPosts/{postId}', region: REGION },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data();
    const authorId = data.authorId;
    if (typeof authorId !== 'string') return;

    const db = getFirestore();
    const actor = await actorFor(db, authorId);
    const text = typeof data.text === 'string' ? data.text : '';
    const postId = snap.id;

    // Everyone this post has already alerted, so a reply that also mentions the
    // parent's author does not arrive twice.
    const alerted = new Set<string>([authorId]);

    const parentId = data.parentId;
    if (typeof parentId === 'string' && parentId) {
      const parent = await db.collection('communityPosts').doc(parentId).get();
      const parentAuthor = parent.get('authorId');
      if (typeof parentAuthor === 'string' && !alerted.has(parentAuthor)) {
        alerted.add(parentAuthor);
        await writeCommunityNotification(db, {
          id: `reply_${postId}`,
          recipientId: parentAuthor,
          type: 'reply',
          actor,
          title: `${actor.displayName} replied to you`,
          body: preview(text),
          // Opens the thread the reply lives in, not the reply in isolation.
          postId: parentId,
          postPreview: preview(parent.get('text')),
        });
      }
    }

    const handles = mentionedHandles(text);
    if (handles.length === 0) return;

    // Handles are the document ids of the username registry, so this is a
    // single batched read rather than a query per mention.
    const registry = await db.getAll(
      ...handles.map((handle) => db.collection('communityUsernames').doc(handle)),
    );
    for (const entry of registry) {
      const uid = entry.get('uid');
      if (typeof uid !== 'string' || alerted.has(uid)) continue;
      alerted.add(uid);
      await writeCommunityNotification(db, {
        id: `mention_${postId}_${uid}`,
        recipientId: uid,
        type: 'mention',
        actor,
        title: `${actor.displayName} mentioned you`,
        body: preview(text),
        postId,
      });
    }
  },
);

// ---------------------------------------------------------------------------
// Push fan-out
// ---------------------------------------------------------------------------

/**
 * Delivers a freshly written notification to the recipient's devices.
 *
 * Dead tokens are pruned as they are discovered: FCM tells us precisely which
 * registrations are gone, and leaving them behind means every future alert pays
 * to send to a handset that was wiped months ago.
 */
export const onCommunityNotificationCreated = onDocumentCreated(
  { document: 'communityNotifications/{notificationId}', region: REGION },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data();
    const recipientId = data.recipientId;
    if (typeof recipientId !== 'string' || !recipientId) return;

    const db = getFirestore();
    const devices = await db
      .collection('communityDevices')
      .where('uid', '==', recipientId)
      .limit(20)
      .get();
    if (devices.empty) return;

    const tokens = devices.docs
      .map((doc) => doc.get('token'))
      .filter((token): token is string => typeof token === 'string' && token.length > 0);
    if (tokens.length === 0) return;

    const title = typeof data.title === 'string' ? data.title : 'Indigen World';
    const body = typeof data.body === 'string' && data.body ? data.body : (typeof data.postPreview === 'string' ? data.postPreview : '');

    try {
      const response = await getMessaging().sendEachForMulticast({
        tokens,
        notification: { title, body },
        // The app routes on these; keep every value a string, which is all FCM
        // data payloads carry.
        data: {
          type: String(data.type ?? 'announcement'),
          notificationId: snap.id,
          ...(typeof data.postId === 'string' && data.postId ? { postId: data.postId } : {}),
          ...(typeof data.route === 'string' && data.route ? { route: data.route } : {}),
        },
        android: {
          priority: 'high',
          notification: { channelId: 'indigen_community', clickAction: 'FLUTTER_NOTIFICATION_CLICK' },
        },
        apns: { payload: { aps: { sound: 'default' } } },
      });

      const stale: string[] = [];
      response.responses.forEach((result, index) => {
        const code = result.error?.code;
        if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-argument') {
          stale.push(tokens[index]);
        }
      });
      if (stale.length > 0) {
        const batch = db.batch();
        for (const token of stale) {
          batch.delete(db.collection('communityDevices').doc(token));
        }
        await batch.commit();
      }
    } catch (error) {
      // Push is the convenience layer; the in-app centre already has the row,
      // so a delivery failure must never retry-loop the trigger.
      logger.error('Community push fan-out failed', {
        errorType: error instanceof Error ? error.name : 'unknown',
      });
    }
  },
);
