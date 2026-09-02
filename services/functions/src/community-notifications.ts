import { FieldValue, GrpcStatus, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { COMMUNITY_CHANNEL_ID, pushToUser } from './push.js';

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
 *   type         like | repost | quote | reply | follow | mention | publication
 *                | thread_reply | post | milestone | reel_comment | welcome
 *   actor        { id, displayName, username, avatarUrl }  — who caused it
 *   title        the headline, already written for a human
 *   body         optional second line
 *   postId       the post it opens, when there is one
 *   postPreview  a short quote of that post
 *   route        explicit deep link for kinds with no post
 *   collapseKey  optional grouping key, so a burst is one lock-screen entry
 *   read         false until the member opens it
 *   createdAt    server timestamp
 *
 * ── Fan-out, and the switch that has to come with it ──────────────────────
 * Three of the kinds above are fan-outs: one action reaches many people
 * (a reply reaches a thread, a post reaches its author's followers, a
 * publication reaches a creator's followers). A fan-out with no off switch is
 * a spam machine, so every one of them passes through two gates before a row
 * is written:
 *
 *   1. `notificationPrefs` on the recipient's own profile — see
 *      [wantsNotification]. Absence means yes, exactly as `messagePreviews`
 *      does in push.ts, so a member who has never opened the settings screen
 *      keeps behaving as they did before the preference existed.
 *   2. mutes and blocks in both directions — see [silencedFor]. Somebody who
 *      muted an author has already said what they want, and saying it again
 *      through a fan-out would be the loudest possible way to ignore them.
 *
 * And every fan-out is capped, with a `log` line when the cap bites: a silent
 * truncation reads, from the outside, exactly like full coverage.
 */

const REGION = 'us-central1';

/** How much of a post is quoted inside an alert. */
const PREVIEW_LENGTH = 120;

/** Cap on how many people one post can notify by mentioning them. */
const MAX_MENTIONS = 10;

/**
 * Cap on how many thread followers one reply may wake.
 *
 * Small on purpose. A long thread is the case where "everybody who has ever
 * replied" stops being a conversation and starts being a broadcast, and the
 * people who care most about a thread are the ones already in it near the top.
 */
const MAX_THREAD_FANOUT = 25;

/**
 * Cap on how many followers one top-level post may wake.
 *
 * The single biggest fan-out in the app. 200 is well past anyone's follower
 * count at this stage, so in practice it never bites — it is here so that the
 * day somebody has 20,000 followers, the first symptom is a log line rather
 * than a function timing out halfway through writing rows.
 */
const MAX_FOLLOWER_FANOUT = 200;

/** Cap on how many people already talking under a reel one comment may wake. */
export const MAX_REEL_THREAD_FANOUT = 25;

/** How far back the thread-follower queries reach. */
const THREAD_SCAN_LIMIT = 200;

/**
 * How many mute/block edges are read when working out who has silenced an
 * author. Past this the fan-out is over-inclusive rather than under-inclusive,
 * which is the wrong way round — hence the warning.
 */
const SILENCE_SCAN_LIMIT = 500;

/** Like totals worth telling somebody about. */
export const LIKE_MILESTONES = [10, 50, 100, 500] as const;

/** Firestore refuses a `getAll` with too many refs; profiles are read in runs. */
const PROFILE_READ_CHUNK = 300;

type ActorStamp = {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
};

export type CommunityNotificationType =
  | 'like'
  | 'repost'
  | 'quote'
  | 'reply'
  | 'follow'
  | 'mention'
  | 'publication'
  | 'thread_reply'
  | 'post'
  | 'milestone'
  | 'reel_comment'
  | 'welcome'
  | 'leaderboard';

export function preview(text: unknown): string {
  if (typeof text !== 'string') return '';
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > PREVIEW_LENGTH
    ? `${collapsed.slice(0, PREVIEW_LENGTH - 1)}…`
    : collapsed;
}

/** The public identity to stamp on an alert, read once from the profile. */
export async function actorFor(
  db: FirebaseFirestore.Firestore,
  uid: string,
): Promise<ActorStamp> {
  const snap = await db.collection('communityProfiles').doc(uid).get();
  return actorFrom(uid, snap.data());
}

/** [actorFor]'s field mapping, away from Firestore so it can be tested. */
export function actorFrom(uid: string, data: unknown): ActorStamp {
  const record = data && typeof data === 'object'
    ? (data as Record<string, unknown>)
    : {};
  const displayName = record.displayName;
  const username = record.username;
  const avatarUrl = record.avatarUrl;
  return {
    id: uid,
    displayName: typeof displayName === 'string' && displayName.trim() ? displayName.trim() : 'A member',
    username: typeof username === 'string' ? username : '',
    avatarUrl: typeof avatarUrl === 'string' && avatarUrl ? avatarUrl : null,
  };
}

/**
 * The name and face to put on a publication alert.
 *
 * The community profile wins wherever it has something to say, because that is
 * the identity the app shows everywhere else. But a creator need not have
 * claimed a community handle at all — the studio and the community are two
 * doors into one account — and "A member published new work" is a worse alert
 * than none. So the name the piece was actually published under, already
 * stamped onto the record by publication.ts, fills the gap.
 *
 * Returns the raw field map rather than a stamp, so [actorFrom] stays the one
 * place that decides what an empty name falls back to.
 */
export function publicationIdentity(
  profile: unknown,
  attribution: unknown,
): Record<string, unknown> {
  const field = (source: unknown, key: string): string =>
    source && typeof source === 'object'
      ? (() => {
        const value = (source as Record<string, unknown>)[key];
        return typeof value === 'string' ? value.trim() : '';
      })()
      : '';
  return {
    displayName:
      field(profile, 'displayName') || field(attribution, 'displayName'),
    // Handles belong to the community side alone; a studio-only creator has
    // none, and inventing one would be a link to a profile that is not there.
    username: field(profile, 'username'),
    avatarUrl: field(profile, 'avatarUrl') || field(attribution, 'avatarUrl'),
  };
}

// ---------------------------------------------------------------------------
// Per-member preferences
// ---------------------------------------------------------------------------

/**
 * The switches a member has in Settings, stored as a map of booleans on
 * `communityProfiles/{uid}.notificationPrefs`.
 *
 * Kept on the profile rather than on the device row that `messagePreviews`
 * lives on, because these answer a different question. "Draw message text on
 * this lock screen" is about a handset — a shared tablet wants a different
 * answer from a private phone. "Tell me when somebody I follow posts" is about
 * the person, and following them to every device they sign in on is the only
 * behaviour that would not feel broken.
 */
export const notificationPreferenceKeys = [
  'followedPosts',
  'threadReplies',
  'milestones',
  'reelComments',
  'likes',
  'follows',
  'mentions',
  // Written by contributor-scores.ts: being overtaken on the board, and the
  // nightly nudge to a streak that is about to lapse. Both are fan-outs to
  // somebody who did not act, which is exactly the kind that needs an off
  // switch — see the note at the top of this file.
  'leaderboard',
  'streakReminders',
] as const;

export type NotificationPreference = (typeof notificationPreferenceKeys)[number];

/**
 * Whether [prefs] leaves [key] switched on.
 *
 * Absence is yes, at every level: no map, no entry, or a value that is not a
 * boolean. That is not laziness — it is the only reading that keeps a profile
 * written before this feature existed behaving exactly as it did yesterday,
 * and it is the same rule `messagePreviews` follows in push.ts. Only an
 * explicit `false`, which nothing but the settings screen writes, turns an
 * alert off.
 */
export function wantsNotification(prefs: unknown, key: NotificationPreference): boolean {
  if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) return true;
  return (prefs as Record<string, unknown>)[key] !== false;
}

/**
 * Which of [uids] still want [key], read in as few round trips as possible.
 *
 * One profile read per recipient is fine for a reply and ruinous for a 200-way
 * fan-out, so the profiles are fetched with `getAll` — the same batched read
 * the mention registry already uses — in runs of [PROFILE_READ_CHUNK].
 */
export async function recipientsWanting(
  db: FirebaseFirestore.Firestore,
  uids: string[],
  key: NotificationPreference,
): Promise<Set<string>> {
  const wanted = new Set<string>();
  for (let index = 0; index < uids.length; index += PROFILE_READ_CHUNK) {
    const run = uids.slice(index, index + PROFILE_READ_CHUNK);
    if (run.length === 0) continue;
    const profiles = await db.getAll(
      ...run.map((uid) => db.collection('communityProfiles').doc(uid)),
    );
    for (const profile of profiles) {
      // A recipient with no profile at all is still a real account with a
      // device row, and has certainly not switched anything off.
      if (wantsNotification(profile.get('notificationPrefs'), key)) {
        wanted.add(profile.id);
      }
    }
  }
  return wanted;
}

/** Whether [uid] alone still wants [key]. One read, for the single-recipient kinds. */
export async function wantsFrom(
  db: FirebaseFirestore.Firestore,
  uid: string,
  key: NotificationPreference,
): Promise<boolean> {
  const profile = await db.collection('communityProfiles').doc(uid).get();
  return wantsNotification(profile.get('notificationPrefs'), key);
}

// ---------------------------------------------------------------------------
// Mutes and blocks
// ---------------------------------------------------------------------------

/** The id shape both `communityMutes` and `communityBlocks` are keyed by. */
export function silenceEdgeId(uid: string, targetId: string): string {
  return `${uid}_${targetId}`;
}

/**
 * Whether nothing [authorId] does should reach [recipientId].
 *
 * Three edges, one batched read. Both directions of the block matter: somebody
 * who blocked an author must not hear from them, and somebody an author has
 * blocked must not be pinged *by* them either — an alert is a way to reach a
 * person, and blocking is supposed to close that door in both directions.
 */
export async function isSilenced(
  db: FirebaseFirestore.Firestore,
  recipientId: string,
  authorId: string,
): Promise<boolean> {
  if (!recipientId || !authorId || recipientId === authorId) return true;
  const edges = await db.getAll(
    db.collection('communityMutes').doc(silenceEdgeId(recipientId, authorId)),
    db.collection('communityBlocks').doc(silenceEdgeId(recipientId, authorId)),
    db.collection('communityBlocks').doc(silenceEdgeId(authorId, recipientId)),
  );
  return edges.some((edge) => edge.exists);
}

/**
 * Everybody [authorId]'s activity must not reach.
 *
 * Three queries whatever the size of the fan-out, rather than three document
 * reads per recipient: `targetId` and `uid` are ordinary fields, so Firestore's
 * automatic single-field indexes serve these without a composite index to
 * deploy.
 */
async function silencedFor(
  db: FirebaseFirestore.Firestore,
  authorId: string,
): Promise<Set<string>> {
  const [mutedBy, blockedBy, blocking] = await Promise.all([
    db.collection('communityMutes').where('targetId', '==', authorId).limit(SILENCE_SCAN_LIMIT).get(),
    db.collection('communityBlocks').where('targetId', '==', authorId).limit(SILENCE_SCAN_LIMIT).get(),
    db.collection('communityBlocks').where('uid', '==', authorId).limit(SILENCE_SCAN_LIMIT).get(),
  ]);

  const silenced = new Set<string>();
  for (const doc of [...mutedBy.docs, ...blockedBy.docs]) {
    const uid = doc.get('uid');
    if (typeof uid === 'string' && uid) silenced.add(uid);
  }
  for (const doc of blocking.docs) {
    const targetId = doc.get('targetId');
    if (typeof targetId === 'string' && targetId) silenced.add(targetId);
  }

  if (
    mutedBy.size >= SILENCE_SCAN_LIMIT
    || blockedBy.size >= SILENCE_SCAN_LIMIT
    || blocking.size >= SILENCE_SCAN_LIMIT
  ) {
    // Over-inclusive is the wrong direction to fail in: past this point a
    // fan-out can reach somebody who has plainly asked not to hear from this
    // author, and nothing else in the system would ever say so.
    logger.warn('Mute and block scan hit its limit; a fan-out may be over-inclusive', {
      authorId,
      limit: SILENCE_SCAN_LIMIT,
    });
  }

  return silenced;
}

// ---------------------------------------------------------------------------
// Choosing who to wake
// ---------------------------------------------------------------------------

/**
 * The recipients left once everybody who must not be woken is removed, capped.
 *
 * Pure, because this is the decision every fan-out in the file turns on and
 * every way of getting it wrong is invisible from the outside: alerting the
 * author about their own reply, alerting somebody twice for one post, alerting
 * somebody who muted the author, or quietly dropping half the thread.
 *
 * Order is preserved, so a caller that hands its candidates over in a sensible
 * order — the root author first, then the people who have spoken in the thread,
 * then the people who only saved it — decides who survives the cap rather than
 * leaving it to a Set's iteration order.
 */
export function eligibleRecipients({
  candidates,
  exclude = new Set<string>(),
  silenced = new Set<string>(),
  cap,
}: {
  candidates: Iterable<unknown>;
  exclude?: ReadonlySet<string>;
  silenced?: ReadonlySet<string>;
  cap: number;
}): { recipients: string[]; truncated: number } {
  const seen = new Set<string>();
  const eligible: string[] = [];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate) continue;
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    if (exclude.has(candidate) || silenced.has(candidate)) continue;
    eligible.push(candidate);
  }
  return {
    recipients: eligible.slice(0, cap),
    truncated: Math.max(0, eligible.length - cap),
  };
}

/**
 * Everybody who counts as following a thread, in the order they should be
 * woken if the cap bites.
 *
 * A thread follower is whoever wrote the root, whoever has replied anywhere
 * beneath it, or whoever bookmarked it. Bookmarks come last deliberately: a
 * save is the quietest of the three signals, and the loudest — having actually
 * spoken in the thread — should not be the one dropped.
 */
export function threadFollowerCandidates({
  rootAuthorId,
  replyAuthorIds,
  bookmarkUids,
}: {
  rootAuthorId?: unknown;
  replyAuthorIds: Iterable<unknown>;
  bookmarkUids: Iterable<unknown>;
}): string[] {
  const ordered: unknown[] = [rootAuthorId, ...replyAuthorIds, ...bookmarkUids];
  const seen = new Set<string>();
  const followers: string[] = [];
  for (const candidate of ordered) {
    if (typeof candidate !== 'string' || !candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    followers.push(candidate);
  }
  return followers;
}

/**
 * The largest like milestone [count] has reached, or null below the first one.
 *
 * Deliberately the *largest* rather than every one crossed. A post that goes
 * from 8 likes to 120 in the minute it is on the front page has genuinely
 * passed three thresholds, and telling its author so three times over would be
 * three alerts about one piece of news. The derived id
 * (`milestone_{postId}_{threshold}`) then makes each threshold's alert fire at
 * most once for the life of the post, so an unlike back down and a re-like
 * cannot ring the same bell twice.
 */
export function highestLikeMilestone(count: unknown): number | null {
  if (typeof count !== 'number' || !Number.isFinite(count)) return null;
  let reached: number | null = null;
  for (const threshold of LIKE_MILESTONES) {
    if (count >= threshold) reached = threshold;
  }
  return reached;
}

// ---------------------------------------------------------------------------
// Writing rows
// ---------------------------------------------------------------------------

export interface NotificationInput {
  recipientId: string;
  type: CommunityNotificationType;
  actor?: ActorStamp;
  title: string;
  body?: string;
  postId?: string | null;
  postPreview?: string;
  route?: string | null;
  /**
   * Groups alerts that supersede each other on the lock screen, so somebody
   * who follows a prolific poster gets one entry per author rather than a
   * stack. Carried on the row because the push fan-out is a separate trigger
   * that only ever sees the document.
   */
  collapseKey?: string | null;
  /** Stable id, used to make a repeated trigger idempotent. */
  id?: string;
}

/** The document body, shared by the single write and the batched fan-outs. */
function notificationBody(id: string, input: NotificationInput): Record<string, unknown> {
  return {
    id,
    recipientId: input.recipientId,
    type: input.type,
    ...(input.actor ? { actor: input.actor, actorId: input.actor.id } : {}),
    title: input.title,
    body: input.body ?? '',
    postId: input.postId ?? null,
    postPreview: input.postPreview ?? '',
    route: input.route ?? null,
    ...(input.collapseKey ? { collapseKey: input.collapseKey } : {}),
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  };
}

/**
 * Writes one notification. [onCommunityNotificationCreated] pushes it.
 *
 * `id` is derived from the edge that caused the alert (`like_{uid}_{postId}`
 * and friends), so an at-least-once trigger delivery lands on the same document
 * instead of stacking duplicates in somebody's centre.
 *
 * An alert that already exists is never rewritten. Two things depend on that: a
 * re-delivered trigger must not resurface something the member has already
 * read, and — because the id is derived from the edge — somebody must not be
 * able to un-like and re-like a post to ping its author over and over.
 *
 * `create` rather than a read-then-`set`, because the read-then-set spelling
 * leaves a window open between its two calls, and at-least-once delivery is
 * precisely the case where two copies of one event run at the same moment and
 * both find nothing there. `create` puts the check and the write in a single
 * round trip that Firestore arbitrates, so `ALREADY_EXISTS` is not a failure —
 * it is the answer that the other copy got there first, which is the outcome
 * this function wanted anyway.
 */
export async function writeCommunityNotification(
  db: FirebaseFirestore.Firestore,
  input: NotificationInput,
): Promise<void> {
  if (!input.recipientId) return;

  const ref = input.id
    ? db.collection('communityNotifications').doc(input.id)
    : db.collection('communityNotifications').doc();

  try {
    await ref.create(notificationBody(ref.id, input));
  } catch (error) {
    if ((error as { code?: number }).code === GrpcStatus.ALREADY_EXISTS) return;
    throw error;
  }
}

/**
 * Writes a whole fan-out at once.
 *
 * Two hundred sequential `get`-then-`set` pairs is two hundred round trips
 * inside one trigger, which is how a fan-out turns into a timeout. A
 * `BulkWriter` parallelises them, and `create` rather than `set` keeps the
 * "never rewrite an existing row" discipline honestly instead of by a
 * read-then-write that races itself: the derived id is the lock, and an
 * `ALREADY_EXISTS` is not a failure but the answer that this member has been
 * told already.
 */
export async function writeCommunityNotifications(
  db: FirebaseFirestore.Firestore,
  inputs: NotificationInput[],
): Promise<void> {
  const writable = inputs.filter((input) => input.recipientId && input.id);
  if (writable.length === 0) return;

  const writer = db.bulkWriter();
  writer.onWriteError((error) => {
    if (error.code === GrpcStatus.ALREADY_EXISTS) return false;
    return error.failedAttempts < 3;
  });

  for (const input of writable) {
    const ref = db.collection('communityNotifications').doc(input.id as string);
    // The per-document promise rejects once the retry policy above gives up.
    // Swallowed here rather than left unhandled: one member missing one alert
    // must not take the other 199 down with it.
    void writer.create(ref, notificationBody(ref.id, input)).catch(() => undefined);
  }

  await writer.close();
}

// ---------------------------------------------------------------------------
// Likes, and the milestones they add up to
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

    const postPreview = preview(post.get('text'));

    // ── The individual like ────────────────────────────────────────────────
    if (
      !(await isSilenced(db, authorId, uid))
      && (await wantsFrom(db, authorId, 'likes'))
    ) {
      const actor = await actorFor(db, uid);
      await writeCommunityNotification(db, {
        id: `like_${uid}_${postId}`,
        recipientId: authorId,
        type: 'like',
        actor,
        title: `${actor.displayName} liked your post`,
        postId,
        postPreview,
      });
    }

    // ── The total it added up to ───────────────────────────────────────────
    //
    // Hung off the like edge rather than off `communityPosts.likeCount` being
    // written, and the reason is which of the two *cannot* fire twice for one
    // piece of news. A post document is written for half a dozen reasons — a
    // text edit, a view, a reply total, a poll tally — so an update trigger
    // would run on all of them and have to re-derive whether a threshold had
    // moved; and because `likeCount` legitimately falls when somebody unlikes,
    // a before/after pair straddles the same threshold every time a member
    // changes their mind. The like edge is written exactly once per member per
    // post, the security rules require the count to move in the same commit
    // (see `communityLikeDelta` in firestore.rules) so the re-read below is
    // never stale, and `milestone_{postId}_{threshold}` is what makes each
    // threshold's alert final.
    const threshold = highestLikeMilestone(post.get('likeCount'));
    if (threshold === null) return;
    if (!(await wantsFrom(db, authorId, 'milestones'))) return;

    await writeCommunityNotification(db, {
      id: `milestone_${postId}_${threshold}`,
      recipientId: authorId,
      type: 'milestone',
      title: `Your post reached ${threshold} likes`,
      body: postPreview,
      postId,
      postPreview,
    });
  },
);

// ---------------------------------------------------------------------------
// Reshares
// ---------------------------------------------------------------------------

export const onCommunityRepostCreated = onDocumentCreated(
  { document: 'communityReposts/{repostId}', region: REGION },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    const reposterId = data.reposterId;
    const postId = data.postId;
    if (typeof reposterId !== 'string' || typeof postId !== 'string') return;

    const db = getFirestore();
    const post = await db.collection('communityPosts').doc(postId).get();
    if (!post.exists) return;
    const authorId = post.get('authorId');
    if (typeof authorId !== 'string' || authorId === reposterId) return;
    if (await isSilenced(db, authorId, reposterId)) return;

    const actor = await actorFor(db, reposterId);
    await writeCommunityNotification(db, {
      id: `repost_${reposterId}_${postId}`,
      recipientId: authorId,
      type: 'repost',
      actor,
      title: `${actor.displayName} reshared your post`,
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
    if (await isSilenced(db, followingId, followerId)) return;
    if (!(await wantsFrom(db, followingId, 'follows'))) return;

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
// Posts: replies, mentions, threads, and the people who follow the author
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

/**
 * The post a reply belongs under.
 *
 * `rootId` is written by the composer as `rootId ?? parentId ?? own id`, so a
 * reply carries the true root of a long thread and a top-level post carries
 * itself. `parentId` is the fallback for rows written before `rootId` existed,
 * where the conversation was only ever one level deep anyway.
 */
export function threadRootOf(data: {
  rootId?: unknown;
  parentId?: unknown;
}): string | null {
  const rootId = data.rootId;
  if (typeof rootId === 'string' && rootId) return rootId;
  const parentId = data.parentId;
  return typeof parentId === 'string' && parentId ? parentId : null;
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
    // parent's author does not arrive twice. Each of the fan-outs below adds
    // to it as it goes.
    const alerted = new Set<string>([authorId]);

    // Who this author's activity must not reach, whatever the reason. One set
    // of queries for the whole invocation rather than one per fan-out.
    const silenced = await silencedFor(db, authorId);

    const quotedPostId = data.quotedPostId;
    if (typeof quotedPostId === 'string' && quotedPostId) {
      const source = await db.collection('communityPosts').doc(quotedPostId).get();
      const sourceAuthor = source.get('authorId');
      if (
        typeof sourceAuthor === 'string'
        && !alerted.has(sourceAuthor)
        && !silenced.has(sourceAuthor)
      ) {
        alerted.add(sourceAuthor);
        await writeCommunityNotification(db, {
          id: `quote_${postId}`,
          recipientId: sourceAuthor,
          type: 'quote',
          actor,
          title: `${actor.displayName} quoted your post`,
          body: preview(text),
          postId,
          postPreview: preview(source.get('text')),
        });
      }
    }

    const parentId = data.parentId;
    if (typeof parentId === 'string' && parentId) {
      const parent = await db.collection('communityPosts').doc(parentId).get();
      const parentAuthor = parent.get('authorId');
      if (
        typeof parentAuthor === 'string'
        && !alerted.has(parentAuthor)
        && !silenced.has(parentAuthor)
      ) {
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
    if (handles.length > 0) {
      // Handles are the document ids of the username registry, so this is a
      // single batched read rather than a query per mention.
      const registry = await db.getAll(
        ...handles.map((handle) => db.collection('communityUsernames').doc(handle)),
      );
      const mentioned = eligibleRecipients({
        candidates: registry.map((entry) => entry.get('uid')),
        exclude: alerted,
        silenced,
        cap: MAX_MENTIONS,
      });
      const wanted = await recipientsWanting(db, mentioned.recipients, 'mentions');
      for (const uid of mentioned.recipients) {
        // Only somebody who was actually written to counts as alerted. Marking
        // the whole candidate list would mean a member who switched *mentions*
        // off silently lost their thread-reply alert too, which is not what
        // they asked for — they turned off one kind, not the conversation.
        if (!wanted.has(uid)) continue;
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
    }

    if (typeof parentId === 'string' && parentId) {
      await notifyThreadFollowers({
        db,
        actor,
        postId,
        text,
        root: threadRootOf(data),
        alerted,
        silenced,
      });
      // A reply is not a post its author's followers hear about. Their feed
      // shows the thread it belongs to, and a follower fan-out on every reply
      // would turn one conversation into a hundred lock screens.
      return;
    }

    await notifyAuthorFollowers({ db, actor, authorId, postId, text, alerted, silenced });
  },
);

/**
 * Wakes the people following the conversation this reply landed in.
 *
 * "Following a thread" is not a thing anybody opted into — there is no follow
 * button on a thread — so it is inferred from the three ways somebody shows a
 * thread matters to them: they started it, they have spoken in it, or they
 * saved it. All three are read from collections that already exist, with no
 * new edge for the client to write and no composite index to deploy:
 * `communityPosts.rootId` and `communityBookmarks.postId` are ordinary fields
 * served by Firestore's automatic single-field indexes.
 */
async function notifyThreadFollowers({
  db,
  actor,
  postId,
  text,
  root,
  alerted,
  silenced,
}: {
  db: FirebaseFirestore.Firestore;
  actor: ActorStamp;
  postId: string;
  text: string;
  root: string | null;
  alerted: Set<string>;
  silenced: ReadonlySet<string>;
}): Promise<void> {
  if (!root) return;

  const [rootPost, thread, bookmarks] = await Promise.all([
    db.collection('communityPosts').doc(root).get(),
    db.collection('communityPosts').where('rootId', '==', root).limit(THREAD_SCAN_LIMIT).get(),
    db.collection('communityBookmarks').where('postId', '==', root).limit(THREAD_SCAN_LIMIT).get(),
  ]);
  if (!rootPost.exists) return;

  const followers = threadFollowerCandidates({
    rootAuthorId: rootPost.get('authorId'),
    replyAuthorIds: thread.docs.map((doc) => doc.get('authorId')),
    bookmarkUids: bookmarks.docs.map((doc) => doc.get('uid')),
  });

  const chosen = eligibleRecipients({
    candidates: followers,
    exclude: alerted,
    silenced,
    cap: MAX_THREAD_FANOUT,
  });
  if (chosen.truncated > 0) {
    // Said out loud, because a cap that nobody can see reads exactly like full
    // coverage — and the people it drops are the ones who would notice.
    logger.info('Thread reply fan-out truncated', {
      postId,
      root,
      notified: chosen.recipients.length,
      dropped: chosen.truncated,
    });
  }

  const wanted = await recipientsWanting(db, chosen.recipients, 'threadReplies');
  const rootPreview = preview(rootPost.get('text'));

  await writeCommunityNotifications(
    db,
    chosen.recipients
      .filter((uid) => wanted.has(uid))
      .map((uid) => ({
        id: `thread_${postId}_${uid}`,
        recipientId: uid,
        type: 'thread_reply' as const,
        actor,
        title: `${actor.displayName} replied in a thread you're following`,
        body: preview(text),
        // The root, so tapping opens the conversation rather than one reply
        // torn out of the middle of it.
        postId: root,
        postPreview: rootPreview,
        collapseKey: `thread_${root}`,
      })),
  );

  for (const uid of chosen.recipients) alerted.add(uid);
}

/**
 * Wakes the people who follow this author, for a top-level post.
 *
 * The single biggest fan-out in the app, and the one the settings switch was
 * written for: `followedPosts` is checked for every recipient before a row is
 * written, and the whole run is collapsed under one key per author so that
 * following somebody prolific costs one lock-screen entry rather than a stack
 * of them.
 */
async function notifyAuthorFollowers({
  db,
  actor,
  authorId,
  postId,
  text,
  alerted,
  silenced,
}: {
  db: FirebaseFirestore.Firestore;
  actor: ActorStamp;
  authorId: string;
  postId: string;
  text: string;
  alerted: Set<string>;
  silenced: ReadonlySet<string>;
}): Promise<void> {
  const follows = await db
    .collection('communityFollows')
    .where('followingId', '==', authorId)
    .limit(MAX_FOLLOWER_FANOUT + 1)
    .get();
  if (follows.empty) return;

  const chosen = eligibleRecipients({
    candidates: follows.docs.map((doc) => doc.get('followerId')),
    exclude: alerted,
    silenced,
    cap: MAX_FOLLOWER_FANOUT,
  });
  if (chosen.truncated > 0 || follows.size > MAX_FOLLOWER_FANOUT) {
    logger.info('Followed-post fan-out truncated', {
      postId,
      authorId,
      notified: chosen.recipients.length,
      cap: MAX_FOLLOWER_FANOUT,
    });
  }

  const wanted = await recipientsWanting(db, chosen.recipients, 'followedPosts');
  const body = preview(text);

  await writeCommunityNotifications(
    db,
    chosen.recipients
      .filter((uid) => wanted.has(uid))
      .map((uid) => ({
        id: `newpost_${postId}_${uid}`,
        recipientId: uid,
        type: 'post' as const,
        actor,
        title: `${actor.displayName} posted`,
        body,
        postId,
        postPreview: body,
        // One entry per author, not per post. Somebody who posts six times
        // while your phone is off should be one line on the lock screen.
        collapseKey: `newpost_${authorId}`,
      })),
  );

  for (const uid of chosen.recipients) alerted.add(uid);
}

// ---------------------------------------------------------------------------
// The first day
// ---------------------------------------------------------------------------

/**
 * One nudge, the first time somebody claims a community handle.
 *
 * A second trigger on `communityProfiles/{uid}`, alongside the supporter-mark
 * mirror in subscriptions.ts. Deliberately not folded into that one: they have
 * nothing to do with each other beyond firing on the same document, one is a
 * billing correctness fix and this is a welcome message, and a Firestore path
 * happily carries as many independent triggers as it is given. Folding them
 * together would mean a failure in either one retrying the other.
 *
 * `welcome_{uid}` is the id, so an at-least-once delivery — or a member who
 * deletes their profile and makes another — still gets exactly one welcome.
 */
export const onCommunityProfileWelcome = onDocumentCreated(
  { document: 'communityProfiles/{uid}', region: REGION },
  async (event) => {
    const uid = event.params.uid;
    if (!uid) return;
    const snap = event.data;
    if (!snap) return;

    const db = getFirestore();
    const actor = actorFrom(uid, snap.data());
    const firstName = actor.displayName.split(/\s+/)[0] || 'friend';

    await writeCommunityNotification(db, {
      id: `welcome_${uid}`,
      recipientId: uid,
      type: 'welcome',
      title: `Welcome to Indigen World, ${firstName}`,
      body: 'Add a word, a story or a song to the record — the language stays '
        + 'alive by being used.',
      route: '/contribute',
    });
  },
);

// ---------------------------------------------------------------------------
// Poll tallying
// ---------------------------------------------------------------------------

/**
 * Tallies an immutable vote exactly once. `countedAt` is written inside the
 * same transaction as the post total, so a retried event cannot count twice.
 */
export const onCommunityPollVoteCreated = onDocumentCreated(
  { document: 'communityPollVotes/{voteId}', region: REGION },
  async (event) => {
    const initial = event.data;
    if (!initial) return;
    const db = getFirestore();
    const voteRef = initial.ref;

    await db.runTransaction(async (transaction) => {
      const vote = await transaction.get(voteRef);
      if (!vote.exists || vote.get('countedAt')) return;
      const postId = vote.get('postId');
      const optionId = vote.get('optionId');
      if (typeof postId !== 'string' || typeof optionId !== 'string') return;

      const postRef = db.collection('communityPosts').doc(postId);
      const post = await transaction.get(postRef);
      if (!post.exists) return;
      const poll = post.get('poll');
      if (!poll || typeof poll !== 'object' || !Array.isArray(poll.options)) return;
      const options = poll.options.map((option: unknown) => {
        if (!option || typeof option !== 'object') return option;
        const record = option as Record<string, unknown>;
        if (record.id !== optionId) return record;
        const current = typeof record.voteCount === 'number' ? record.voteCount : 0;
        return { ...record, voteCount: current + 1 };
      });
      if (!options.some((option: unknown) => (
        option && typeof option === 'object' && (option as Record<string, unknown>).id === optionId
      ))) return;

      const currentTotal = typeof poll.totalVotes === 'number' ? poll.totalVotes : 0;
      transaction.update(postRef, {
        poll: { ...poll, options, totalVotes: currentTotal + 1 },
      });
      transaction.update(voteRef, { countedAt: FieldValue.serverTimestamp() });
    });
  },
);

// ---------------------------------------------------------------------------
// Push fan-out
// ---------------------------------------------------------------------------

/** The prefix open-publishing.ts gives the creator's own "you are live" row. */
const CREATOR_PUBLICATION_PREFIX = 'publication_';

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

    const title = typeof data.title === 'string' ? data.title : 'Indigen World';
    const body = typeof data.body === 'string' && data.body ? data.body : (typeof data.postPreview === 'string' ? data.postPreview : '');
    const collapseKey = typeof data.collapseKey === 'string' && data.collapseKey
      ? data.collapseKey
      : undefined;

    await pushToUser(getFirestore(), recipientId, {
      title,
      body,
      channelId: COMMUNITY_CHANNEL_ID,
      // The app routes on these; keep every value a string, which is all FCM
      // data payloads carry.
      data: {
        type: String(data.type ?? 'announcement'),
        notificationId: snap.id,
        ...(typeof data.postId === 'string' && data.postId ? { postId: data.postId } : {}),
        ...(typeof data.route === 'string' && data.route ? { route: data.route } : {}),
        // Carried in the data payload as well as in the Android and APNs
        // options, because those two only collapse what the *system* draws.
        // An alert that lands while somebody is looking at the app is drawn by
        // the app itself (local_alerts.dart), and without this it had nothing
        // to collapse on — so a prolific poster stacked six rows for a member
        // who was in the app and one row for a member whose phone was locked.
        ...(collapseKey ? { collapseKey } : {}),
      },
      // `collapseKey` covers a device that was offline, `tag` covers what is
      // already on its screen — both are needed, see PushMessage.
      ...(collapseKey ? { collapseKey, tag: collapseKey } : {}),
    });

    await fanOutPublication(snap.id, data);
  },
);

/**
 * Tells a creator's followers when their work goes live on Explore.
 *
 * Hung off the creator's own publication row rather than off `publishedContent`
 * directly, because the decision "this is a first publication, not an edit" has
 * already been made once — in open-publishing.ts, which writes that row only
 * when the record did not previously exist. Watching `publishedContent` here
 * would mean making the same judgement a second time, from less information,
 * and getting it wrong means re-announcing a piece every time its creator fixes
 * a typo.
 *
 * The recursion guard is the id. The creator's row is `publication_{pubId}`;
 * the copies this writes are `pubfollow_{pubId}_{uid}`, which do not match the
 * prefix, so the rows this trigger creates cannot make it fan out again.
 */
async function fanOutPublication(
  notificationId: string,
  data: FirebaseFirestore.DocumentData,
): Promise<void> {
  if (data.type !== 'publication') return;
  if (!notificationId.startsWith(CREATOR_PUBLICATION_PREFIX)) return;
  const creatorId = data.recipientId;
  if (typeof creatorId !== 'string' || !creatorId) return;

  const publishedId = notificationId.slice(CREATOR_PUBLICATION_PREFIX.length);
  if (!publishedId) return;

  const db = getFirestore();
  const [profile, silenced, follows, published] = await Promise.all([
    db.collection('communityProfiles').doc(creatorId).get(),
    silencedFor(db, creatorId),
    db
      .collection('communityFollows')
      .where('followingId', '==', creatorId)
      .limit(MAX_FOLLOWER_FANOUT + 1)
      .get(),
    db.collection('publishedContent').doc(publishedId).get(),
  ]);
  if (follows.empty) return;

  const actor = actorFrom(
    creatorId,
    publicationIdentity(profile.data(), published.get('creatorAttribution')),
  );

  const chosen = eligibleRecipients({
    candidates: follows.docs.map((doc) => doc.get('followerId')),
    exclude: new Set([creatorId]),
    silenced,
    cap: MAX_FOLLOWER_FANOUT,
  });
  if (chosen.truncated > 0 || follows.size > MAX_FOLLOWER_FANOUT) {
    logger.info('Publication fan-out truncated', {
      publishedId,
      creatorId,
      notified: chosen.recipients.length,
      cap: MAX_FOLLOWER_FANOUT,
    });
  }

  // The same switch a followed post answers to. A publication *is* a post by
  // somebody you follow; splitting it into its own preference would mean
  // turning followed posts off and still being woken by them.
  const wanted = await recipientsWanting(db, chosen.recipients, 'followedPosts');
  const work = typeof data.body === 'string' ? data.body : '';

  await writeCommunityNotifications(
    db,
    chosen.recipients
      .filter((uid) => wanted.has(uid))
      .map((uid) => ({
        id: `pubfollow_${publishedId}_${uid}`,
        recipientId: uid,
        type: 'publication' as const,
        actor,
        title: `${actor.displayName} published new work`,
        body: work,
        // Explore is the home tab, and where a published piece lives.
        route: '/',
        collapseKey: `pubfollow_${creatorId}`,
      })),
  );
}
