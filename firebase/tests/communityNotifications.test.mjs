// Pure unit tests for the decisions the notification fan-outs turn on — no
// emulator, no network.
//
//   npm run build:functions && node --test firebase/tests/communityNotifications.test.mjs
//
// One action now reaches many people: a reply wakes a whole thread, a post
// wakes every follower, a publication wakes a creator's audience. Every way of
// getting that wrong is invisible from the outside — alerting somebody about
// their own reply, alerting them twice for one post, alerting somebody who
// muted the author, quietly dropping half the thread, or ringing the same
// milestone bell every time a member changes their mind about a like. So the
// judgement in each of those is a pure function, and this is where it is
// pinned down.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  LIKE_MILESTONES,
  actorFrom,
  eligibleRecipients,
  highestLikeMilestone,
  notificationPreferenceKeys,
  preview,
  publicationIdentity,
  silenceEdgeId,
  threadFollowerCandidates,
  threadRootOf,
  wantsNotification,
} from '../../services/functions/lib/community-notifications.js';
import {
  directReplyTarget,
  reelOwnerOf,
} from '../../services/functions/lib/reel-notifications.js';

// ---------------------------------------------------------------------------
// Preferences: absence has to mean "as before"
// ---------------------------------------------------------------------------

test('a member who has never opened the settings screen still hears everything', () => {
  // The whole design rests on this. If absence read as "off", shipping the
  // preferences would have silently muted every account already on the
  // platform, and the only symptom would have been a quiet app.
  for (const key of notificationPreferenceKeys) {
    assert.equal(wantsNotification(undefined, key), true);
    assert.equal(wantsNotification(null, key), true);
    assert.equal(wantsNotification({}, key), true);
  }
});

test('only an explicit false switches an alert off', () => {
  assert.equal(wantsNotification({ followedPosts: false }, 'followedPosts'), false);
  assert.equal(wantsNotification({ followedPosts: true }, 'followedPosts'), true);
  // Anything that is not a boolean is not an answer. A half-written map must
  // not be able to mute somebody by accident.
  assert.equal(wantsNotification({ followedPosts: 'no' }, 'followedPosts'), true);
  assert.equal(wantsNotification({ followedPosts: 0 }, 'followedPosts'), true);
  assert.equal(wantsNotification({ followedPosts: null }, 'followedPosts'), true);
});

test('one switch never answers for another', () => {
  const prefs = { followedPosts: false, likes: false };
  assert.equal(wantsNotification(prefs, 'followedPosts'), false);
  assert.equal(wantsNotification(prefs, 'likes'), false);
  assert.equal(wantsNotification(prefs, 'threadReplies'), true);
  assert.equal(wantsNotification(prefs, 'mentions'), true);
});

test('a notificationPrefs field of the wrong shape is ignored, not obeyed', () => {
  // The field is written by the client, so it can be anything at all.
  assert.equal(wantsNotification('false', 'likes'), true);
  assert.equal(wantsNotification([false], 'likes'), true);
  assert.equal(wantsNotification(42, 'likes'), true);
});

test('the switches the settings screen offers are exactly the ones read here', () => {
  // The mobile enum in notification_preferences.dart spells these out in the
  // same words. A key that drifts on one side is a switch that does nothing,
  // and nothing else in the system would say so.
  assert.deepEqual([...notificationPreferenceKeys].sort(), [
    'followedPosts',
    'follows',
    'leaderboard',
    'likes',
    'mentions',
    'milestones',
    'reelComments',
    'streakReminders',
    'threadReplies',
  ]);
});

// ---------------------------------------------------------------------------
// Who is left once everybody who must not be woken is removed
// ---------------------------------------------------------------------------

test('a fan-out never wakes somebody twice for one action', () => {
  const chosen = eligibleRecipients({
    candidates: ['amina', 'nyaaba', 'amina', 'amina'],
    cap: 10,
  });
  assert.deepEqual(chosen.recipients, ['amina', 'nyaaba']);
  assert.equal(chosen.truncated, 0);
});

test('somebody already alerted in this invocation is not alerted again', () => {
  // A reply that also mentions the parent's author must arrive once.
  const chosen = eligibleRecipients({
    candidates: ['author', 'amina', 'nyaaba'],
    exclude: new Set(['author', 'amina']),
    cap: 10,
  });
  assert.deepEqual(chosen.recipients, ['nyaaba']);
});

test('somebody who muted or blocked the author hears nothing', () => {
  const chosen = eligibleRecipients({
    candidates: ['amina', 'nyaaba', 'atia'],
    silenced: new Set(['nyaaba']),
    cap: 10,
  });
  assert.deepEqual(chosen.recipients, ['amina', 'atia']);
});

test('the cap keeps the front of the list and says how many it dropped', () => {
  // Silence here would read, from the outside, exactly like full coverage —
  // and the people it drops are the ones who would notice.
  const chosen = eligibleRecipients({
    candidates: ['a', 'b', 'c', 'd', 'e'],
    cap: 2,
  });
  assert.deepEqual(chosen.recipients, ['a', 'b']);
  assert.equal(chosen.truncated, 3);
});

test('the cap counts eligible people, not the raw candidate list', () => {
  // A hundred duplicates of one muted account must not report a truncation
  // that never happened, or the log line becomes noise nobody reads.
  const chosen = eligibleRecipients({
    candidates: ['a', 'muted', 'muted', 'a', 'b'],
    silenced: new Set(['muted']),
    cap: 5,
  });
  assert.deepEqual(chosen.recipients, ['a', 'b']);
  assert.equal(chosen.truncated, 0);
});

test('rubbish in the candidate list is dropped rather than written to', () => {
  // Candidates come straight out of `doc.get('authorId')`, which is whatever
  // is in the document.
  const chosen = eligibleRecipients({
    candidates: ['amina', null, undefined, '', 42, { uid: 'x' }],
    cap: 10,
  });
  assert.deepEqual(chosen.recipients, ['amina']);
});

test('an empty fan-out is an empty list, not a truncation', () => {
  const chosen = eligibleRecipients({ candidates: [], cap: 25 });
  assert.deepEqual(chosen.recipients, []);
  assert.equal(chosen.truncated, 0);
});

// ---------------------------------------------------------------------------
// Who counts as following a thread
// ---------------------------------------------------------------------------

test('the root author, then the people who spoke, then the people who saved', () => {
  // Order is what survives the cap. Having actually spoken in a thread is a
  // louder signal than having saved it, so a save is what gets dropped first.
  const followers = threadFollowerCandidates({
    rootAuthorId: 'root-author',
    replyAuthorIds: ['amina', 'nyaaba'],
    bookmarkUids: ['atia'],
  });
  assert.deepEqual(followers, ['root-author', 'amina', 'nyaaba', 'atia']);
});

test('somebody who wrote the root, replied and saved it appears once', () => {
  const followers = threadFollowerCandidates({
    rootAuthorId: 'amina',
    replyAuthorIds: ['amina', 'nyaaba', 'amina'],
    bookmarkUids: ['amina', 'nyaaba'],
  });
  assert.deepEqual(followers, ['amina', 'nyaaba']);
});

test('a thread whose root has been deleted still has its repliers', () => {
  const followers = threadFollowerCandidates({
    rootAuthorId: undefined,
    replyAuthorIds: ['amina'],
    bookmarkUids: [],
  });
  assert.deepEqual(followers, ['amina']);
});

test('a reply carries the true root of a long thread, not its parent', () => {
  // Tapping the alert has to open the conversation, not one reply torn out of
  // the middle of it.
  assert.equal(threadRootOf({ rootId: 'root-1', parentId: 'reply-9' }), 'root-1');
});

test('a reply written before rootId existed falls back to its parent', () => {
  assert.equal(threadRootOf({ parentId: 'parent-1' }), 'parent-1');
  assert.equal(threadRootOf({ rootId: '', parentId: 'parent-1' }), 'parent-1');
});

test('a top-level post is in no thread', () => {
  assert.equal(threadRootOf({}), null);
  assert.equal(threadRootOf({ parentId: null }), null);
  assert.equal(threadRootOf({ rootId: 7, parentId: 7 }), null);
});

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

test('nothing is announced below the first threshold', () => {
  assert.equal(highestLikeMilestone(0), null);
  assert.equal(highestLikeMilestone(9), null);
});

test('each threshold is announced from the like that reaches it', () => {
  for (const threshold of LIKE_MILESTONES) {
    assert.equal(highestLikeMilestone(threshold), threshold);
    assert.equal(highestLikeMilestone(threshold - 1) === threshold, false);
  }
});

test('a post that jumps three thresholds at once is one piece of news', () => {
  // Front-page traffic can carry a post from 8 likes to 120 inside a minute.
  // Telling its author three times over would be three alerts about one thing.
  assert.equal(highestLikeMilestone(120), 100);
  assert.equal(highestLikeMilestone(4000), 500);
});

test('an unlike cannot ring a bell on the way back down', () => {
  // The threshold answer falls with the count, and the derived id
  // (`milestone_{postId}_{threshold}`) is what makes the alert final — so
  // crossing 10 downwards and upwards again resolves to the same document.
  assert.equal(highestLikeMilestone(10), 10);
  assert.equal(highestLikeMilestone(9), null);
  assert.equal(highestLikeMilestone(10), 10);
});

test('a missing or nonsense like count announces nothing', () => {
  assert.equal(highestLikeMilestone(undefined), null);
  assert.equal(highestLikeMilestone(null), null);
  assert.equal(highestLikeMilestone('500'), null);
  assert.equal(highestLikeMilestone(Number.NaN), null);
  assert.equal(highestLikeMilestone(Number.POSITIVE_INFINITY), null);
});

// ---------------------------------------------------------------------------
// Mutes and blocks
// ---------------------------------------------------------------------------

test('a silence edge is keyed the way the client writes it', () => {
  // `communityOwnsEdge(edgeId, uid, targetId)` in firestore.rules requires
  // exactly this shape, so reading it any other way finds nothing and every
  // mute silently stops working.
  assert.equal(silenceEdgeId('amina', 'nyaaba'), 'amina_nyaaba');
  assert.notEqual(silenceEdgeId('amina', 'nyaaba'), silenceEdgeId('nyaaba', 'amina'));
});

// ---------------------------------------------------------------------------
// What an alert says
// ---------------------------------------------------------------------------

test('an actor with no profile is still named as somebody', () => {
  assert.equal(actorFrom('uid-1', undefined).displayName, 'A member');
  assert.equal(actorFrom('uid-1', { displayName: '   ' }).displayName, 'A member');
  assert.equal(actorFrom('uid-1', { displayName: ' Amina ' }).displayName, 'Amina');
});

test('a studio creator with no community handle is named from the record', () => {
  // The studio and the community are two doors into one account, so a creator
  // can publish without ever claiming a handle. "A member published new work"
  // is a worse alert than none.
  const identity = publicationIdentity(undefined, {
    creatorId: 'uid-1',
    displayName: 'Awiah Atia',
    avatarUrl: 'https://example.test/a.jpg',
  });
  assert.equal(actorFrom('uid-1', identity).displayName, 'Awiah Atia');
  assert.equal(actorFrom('uid-1', identity).avatarUrl, 'https://example.test/a.jpg');
  // No handle is invented: a link to a profile that is not there is worse
  // than no link.
  assert.equal(identity.username, '');
});

test('the community profile wins wherever it has something to say', () => {
  const identity = publicationIdentity(
    { displayName: 'Amina', username: 'amina', avatarUrl: 'https://example.test/p.jpg' },
    { displayName: 'A. Ayaribisa', avatarUrl: 'https://example.test/c.jpg' },
  );
  assert.deepEqual(identity, {
    displayName: 'Amina',
    username: 'amina',
    avatarUrl: 'https://example.test/p.jpg',
  });
});

test('a preview is one line, and never a wall of text', () => {
  assert.equal(preview('  a   post\nwith  space  '), 'a post with space');
  assert.equal(preview(undefined), '');
  assert.equal(preview(42), '');
  const long = preview('x'.repeat(400));
  assert.equal(long.length, 120);
  assert.ok(long.endsWith('…'));
});

// ---------------------------------------------------------------------------
// Reels
// ---------------------------------------------------------------------------

test('a reel comment names its parent only when the client said so', () => {
  // The replies sheet does not thread today, so this is almost always absent
  // and the fan-out falls back to everybody already talking under the reel.
  assert.equal(directReplyTarget({ parentCommentId: 'comment-1' }), 'comment-1');
  assert.equal(directReplyTarget({}), null);
  assert.equal(directReplyTarget({ parentCommentId: '' }), null);
  assert.equal(directReplyTarget({ parentCommentId: 7 }), null);
  assert.equal(directReplyTarget(null), null);
});

test('a reel is owned by the uid stamped on its attribution', () => {
  // `creatorProfiles` is keyed by the creator's auth uid, which is the same id
  // communityProfiles and communityDevices are keyed by — so no second lookup
  // is needed to turn one into the other.
  assert.equal(
    reelOwnerOf({ creatorAttribution: { creatorId: 'creator-1' } }),
    'creator-1',
  );
  assert.equal(reelOwnerOf({ creatorAttribution: {} }), null);
  assert.equal(reelOwnerOf({}), null);
  assert.equal(reelOwnerOf(undefined), null);
});
