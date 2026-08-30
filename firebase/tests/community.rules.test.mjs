// Community feed Security Rules tests, run against the Firestore emulator.
//
//   npm run test:rules        (from the repo root — wraps this in emulators:exec)
//
// Covers the mobile Community tab's data model in firebase/firestore.rules:
// public reads, owner-only profile and handle writes, post ownership, and the
// constrained like / reply counters that let one member move another member's
// post counter by exactly one step without opening the document up.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  deleteDoc,
  doc,
  getDoc,
  increment,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

const PROJECT_ID = 'demo-indigen-world';
const host = '127.0.0.1';
const port = 8080;
const rulesPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'firestore.rules');

const AMINA = 'amina-uid';
const NYAABA = 'nyaaba-uid';

function makeProfile(uid, username, overrides = {}) {
  return {
    uid,
    username,
    displayName: 'Amina Ayaribisa',
    displayNameLower: 'amina ayaribisa',
    bio: '',
    location: '',
    dialect: '',
    isVerified: false,
    verifiedKind: '',
    phoneVerified: false,
    ...overrides,
  };
}

function makePost(authorUid, overrides = {}) {
  return {
    authorId: authorUid,
    author: { displayName: 'Amina Ayaribisa', username: 'amina_paga', avatarUrl: null },
    text: 'De zaanem.',
    media: [],
    hasMedia: false,
    likeCount: 0,
    replyCount: 0,
    repostCount: 0,
    quoteCount: 0,
    viewCount: 0,
    parentId: null,
    isReply: false,
    rootId: 'post1',
    kasemConfirmed: true,
    ...overrides,
  };
}

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(rulesPath, 'utf8'), host, port },
  });

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `communityProfiles/${AMINA}`), makeProfile(AMINA, 'amina_paga'));
    await setDoc(doc(db, `communityProfiles/${NYAABA}`), makeProfile(NYAABA, 'nyaaba'));
    await setDoc(doc(db, 'communityUsernames/amina_paga'), { uid: AMINA });
    await setDoc(doc(db, 'communityUsernames/nyaaba'), { uid: NYAABA });
    await setDoc(doc(db, 'communityPosts/post1'), makePost(AMINA));
    await setDoc(doc(db, 'communityPosts/post-liked'), makePost(AMINA, { likeCount: 1 }));
    await setDoc(doc(db, `communityLikes/${NYAABA}_post-liked`), {
      uid: NYAABA,
      postId: 'post-liked',
    });
    await setDoc(doc(db, `communityBookmarks/${AMINA}_post1`), {
      uid: AMINA,
      postId: 'post1',
    });
    // Notifications are server-authored, so the fixtures are written with rules
    // disabled — exactly as the Cloud Functions trigger does in production.
    await setDoc(doc(db, 'communityNotifications/notif-for-amina'), {
      id: 'notif-for-amina',
      recipientId: AMINA,
      type: 'like',
      actor: { id: NYAABA, displayName: 'Nyaaba Atanga', username: 'nyaaba', avatarUrl: null },
      title: 'Nyaaba Atanga liked your post',
      body: '',
      postId: 'post1',
      postPreview: 'De zaanem.',
      route: null,
      read: false,
    });
    await setDoc(doc(db, 'communityDevices/token-amina'), {
      uid: AMINA,
      token: 'token-amina',
      platform: 'android',
    });
  });
});

after(async () => {
  await env?.cleanup();
});

const db = (ctx) => ctx.firestore();

// ── Reads ───────────────────────────────────────────────────────────────────

test('guests can read community profiles and posts', async () => {
  const anon = env.unauthenticatedContext();
  await assertSucceeds(getDoc(doc(db(anon), `communityProfiles/${AMINA}`)));
  await assertSucceeds(getDoc(doc(db(anon), 'communityPosts/post1')));
  await assertSucceeds(getDoc(doc(db(anon), 'communityUsernames/amina_paga')));
});

test('saved posts are private to their owner', async () => {
  const owner = env.authenticatedContext(AMINA);
  const other = env.authenticatedContext(NYAABA);
  const anon = env.unauthenticatedContext();

  await assertSucceeds(getDoc(doc(db(owner), `communityBookmarks/${AMINA}_post1`)));
  await assertFails(getDoc(doc(db(other), `communityBookmarks/${AMINA}_post1`)));
  await assertFails(getDoc(doc(db(anon), `communityBookmarks/${AMINA}_post1`)));
});

// ── Profiles and handles ────────────────────────────────────────────────────

test('a member creates their own profile, and only their own', async () => {
  const newcomer = env.authenticatedContext('awine-uid');
  await assertSucceeds(
    setDoc(doc(db(newcomer), 'communityProfiles/awine-uid'), makeProfile('awine-uid', 'awine')),
  );
  await assertFails(
    setDoc(doc(db(newcomer), 'communityProfiles/someone-else'), makeProfile('someone-else', 'someone')),
  );
});

test('malformed handles and self-granted verification are rejected', async () => {
  const newcomer = env.authenticatedContext('handle-uid');
  const store = db(newcomer);

  // Uppercase, too short, and leading digit all fail the rules pattern.
  await assertFails(setDoc(doc(store, 'communityProfiles/handle-uid'), makeProfile('handle-uid', 'Amina')));
  await assertFails(setDoc(doc(store, 'communityProfiles/handle-uid'), makeProfile('handle-uid', 'ab')));
  await assertFails(setDoc(doc(store, 'communityProfiles/handle-uid'), makeProfile('handle-uid', '1amina')));
  await assertFails(
    setDoc(doc(store, 'communityProfiles/handle-uid'), makeProfile('handle-uid', 'valid_one', { isVerified: true })),
  );
});

test('verification is granted, never claimed', async () => {
  const newcomer = env.authenticatedContext('claimant-uid');
  const store = db(newcomer);

  // Not on the way in...
  await assertFails(
    setDoc(doc(store, 'communityProfiles/claimant-uid'), makeProfile('claimant-uid', 'claimant', { verifiedKind: 'elder' })),
  );
  await assertFails(
    setDoc(doc(store, 'communityProfiles/claimant-uid'), makeProfile('claimant-uid', 'claimant', { phoneVerified: true })),
  );
  await assertSucceeds(
    setDoc(doc(store, 'communityProfiles/claimant-uid'), makeProfile('claimant-uid', 'claimant')),
  );
});

test('and cannot be given to yourself afterwards', async () => {
  const amina = db(env.authenticatedContext(AMINA));

  // The mark staff grant.
  await assertFails(
    setDoc(doc(amina, `communityProfiles/${AMINA}`), makeProfile(AMINA, 'amina_paga', { verifiedKind: 'project' })),
  );
  // The half the member is supposed to earn by answering an SMS. Only the
  // verification callable may set it, and that runs with admin credentials.
  await assertFails(
    setDoc(doc(amina, `communityProfiles/${AMINA}`), makeProfile(AMINA, 'amina_paga', { phoneVerified: true })),
  );
  // Everything a member legitimately owns still moves.
  await assertSucceeds(
    setDoc(doc(amina, `communityProfiles/${AMINA}`), makeProfile(AMINA, 'amina_paga', { bio: 'Learning every day.' })),
  );
});

test('the codes behind a verification belong to nobody', async () => {
  const amina = db(env.authenticatedContext(AMINA));
  const anon = db(env.unauthenticatedContext());

  // A client that could read this could answer its own challenge; one that
  // could write it could mark itself verified. Both callables bypass rules.
  await assertFails(getDoc(doc(amina, `phoneVerifications/${AMINA}`)));
  await assertFails(setDoc(doc(amina, `phoneVerifications/${AMINA}`), { codeHash: 'x' }));
  await assertFails(getDoc(doc(anon, 'phoneVerifications/anybody')));
  // And the record of which numbers are spoken for is not a lookup service for
  // asking whether a given number is on the platform.
  await assertFails(getDoc(doc(amina, 'verifiedPhones/somefingerprint')));
  await assertFails(setDoc(doc(amina, 'verifiedPhones/somefingerprint'), { uid: AMINA }));
});

test('a handle cannot be taken twice', async () => {
  const newcomer = env.authenticatedContext('squatter-uid');
  // amina_paga is already registered in the seed.
  await assertFails(
    setDoc(doc(db(newcomer), 'communityUsernames/amina_paga'), { uid: 'squatter-uid' }),
  );
  await assertSucceeds(
    setDoc(doc(db(newcomer), 'communityUsernames/squatter'), { uid: 'squatter-uid' }),
  );
});

test('the handle and verification flag are frozen after creation', async () => {
  const owner = env.authenticatedContext(AMINA);
  const store = db(owner);

  await assertSucceeds(updateDoc(doc(store, `communityProfiles/${AMINA}`), { bio: 'Paga born.' }));
  await assertFails(updateDoc(doc(store, `communityProfiles/${AMINA}`), { username: 'renamed' }));
  await assertFails(updateDoc(doc(store, `communityProfiles/${AMINA}`), { isVerified: true }));
});

test('one member cannot edit another member profile', async () => {
  const other = env.authenticatedContext(NYAABA);
  await assertFails(updateDoc(doc(db(other), `communityProfiles/${AMINA}`), { bio: 'hijacked' }));
});

// ── Posting ─────────────────────────────────────────────────────────────────

test('a member with a profile can post as themselves', async () => {
  const amina = env.authenticatedContext(AMINA);
  await assertSucceeds(
    setDoc(doc(db(amina), 'communityPosts/new-post'), makePost(AMINA, { rootId: 'new-post' })),
  );
});

test('posting as someone else, or without a profile, is rejected', async () => {
  const amina = env.authenticatedContext(AMINA);
  await assertFails(
    setDoc(doc(db(amina), 'communityPosts/impersonation'), makePost(NYAABA)),
  );

  const strangerWithoutProfile = env.authenticatedContext('no-profile-uid');
  await assertFails(
    setDoc(doc(db(strangerWithoutProfile), 'communityPosts/no-profile'), makePost('no-profile-uid')),
  );
});

test('a new post cannot arrive with counters or oversized media already set', async () => {
  const amina = env.authenticatedContext(AMINA);
  const store = db(amina);

  await assertFails(
    setDoc(doc(store, 'communityPosts/prefilled-likes'), makePost(AMINA, { likeCount: 99 })),
  );
  await assertFails(
    setDoc(doc(store, 'communityPosts/prefilled-replies'), makePost(AMINA, { replyCount: 5 })),
  );
  await assertFails(
    setDoc(doc(store, 'communityPosts/prefilled-reposts'), makePost(AMINA, { repostCount: 5 })),
  );
  await assertFails(
    setDoc(doc(store, 'communityPosts/prefilled-quotes'), makePost(AMINA, { quoteCount: 5 })),
  );
  await assertFails(
    setDoc(doc(store, 'communityPosts/prefilled-views'), makePost(AMINA, { viewCount: 5 })),
  );
  await assertFails(
    setDoc(
      doc(store, 'communityPosts/too-much-media'),
      makePost(AMINA, {
        hasMedia: true,
        media: [1, 2, 3, 4, 5].map((n) => ({ url: `https://example.test/${n}.jpg`, type: 'image' })),
      }),
    ),
  );
  await assertFails(
    setDoc(doc(store, 'communityPosts/too-long'), makePost(AMINA, { text: 'x'.repeat(501) })),
  );
});

test('only the author may edit a post body', async () => {
  const amina = env.authenticatedContext(AMINA);
  const nyaaba = env.authenticatedContext(NYAABA);

  await assertSucceeds(
    updateDoc(doc(db(amina), 'communityPosts/post1'), { text: 'De zaanem, ko gara.' }),
  );
  await assertFails(
    updateDoc(doc(db(nyaaba), 'communityPosts/post1'), { text: 'edited by a stranger' }),
  );
  // The author cannot smuggle a counter change in alongside a text edit.
  await assertFails(
    updateDoc(doc(db(amina), 'communityPosts/post1'), { text: 'ok', likeCount: 50 }),
  );
});

test('only the author or staff may delete a post', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(db(ctx), 'communityPosts/deletable'), makePost(AMINA));
    await setDoc(doc(db(ctx), 'communityPosts/staff-deletable'), makePost(AMINA));
  });

  const nyaaba = env.authenticatedContext(NYAABA);
  const amina = env.authenticatedContext(AMINA);
  const validator = env.authenticatedContext('val1', { role: 'validator' });

  await assertFails(deleteDoc(doc(db(nyaaba), 'communityPosts/deletable')));
  await assertSucceeds(deleteDoc(doc(db(amina), 'communityPosts/deletable')));
  await assertSucceeds(deleteDoc(doc(db(validator), 'communityPosts/staff-deletable')));
});

// ── Likes: the constrained cross-user counter ───────────────────────────────

test('a like is a batch of one edge plus a one-step counter move', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(db(ctx), 'communityPosts/likeable'), makePost(AMINA));
  });

  const nyaaba = env.authenticatedContext(NYAABA);
  const store = db(nyaaba);
  const batch = writeBatch(store);
  batch.set(doc(store, `communityLikes/${NYAABA}_likeable`), {
    uid: NYAABA,
    postId: 'likeable',
  });
  batch.update(doc(store, 'communityPosts/likeable'), { likeCount: increment(1) });
  await assertSucceeds(batch.commit());
});

test('the counter cannot move without the matching like edge', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(db(ctx), 'communityPosts/unbacked'), makePost(AMINA));
  });

  const nyaaba = env.authenticatedContext(NYAABA);
  await assertFails(
    updateDoc(doc(db(nyaaba), 'communityPosts/unbacked'), { likeCount: increment(1) }),
  );
});

test('a like cannot inflate the counter by more than one', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(db(ctx), 'communityPosts/inflatable'), makePost(AMINA));
  });

  const nyaaba = env.authenticatedContext(NYAABA);
  const store = db(nyaaba);
  const batch = writeBatch(store);
  batch.set(doc(store, `communityLikes/${NYAABA}_inflatable`), {
    uid: NYAABA,
    postId: 'inflatable',
  });
  batch.update(doc(store, 'communityPosts/inflatable'), { likeCount: increment(25) });
  await assertFails(batch.commit());
});

test('unliking removes the edge and steps the counter back down', async () => {
  const nyaaba = env.authenticatedContext(NYAABA);
  const store = db(nyaaba);
  const batch = writeBatch(store);
  batch.delete(doc(store, `communityLikes/${NYAABA}_post-liked`));
  batch.update(doc(store, 'communityPosts/post-liked'), { likeCount: increment(-1) });
  await assertSucceeds(batch.commit());
});

test('a like edge must be keyed to the member creating it', async () => {
  const nyaaba = env.authenticatedContext(NYAABA);
  const store = db(nyaaba);

  // Right shape, wrong owner in the document id.
  await assertFails(
    setDoc(doc(store, `communityLikes/${AMINA}_post1`), { uid: AMINA, postId: 'post1' }),
  );
  // Right owner in the id, but claiming to be someone else in the body.
  await assertFails(
    setDoc(doc(store, `communityLikes/${NYAABA}_post1`), { uid: AMINA, postId: 'post1' }),
  );
});

test('reply totals move one step at a time', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(db(ctx), 'communityPosts/repliable'), makePost(AMINA));
  });

  const nyaaba = env.authenticatedContext(NYAABA);
  await assertSucceeds(
    updateDoc(doc(db(nyaaba), 'communityPosts/repliable'), { replyCount: increment(1) }),
  );
  await assertFails(
    updateDoc(doc(db(nyaaba), 'communityPosts/repliable'), { replyCount: increment(9) }),
  );
});

// ── Reshares, quotes, views and polls ───────────────────────────────────────

test('a reshare is an owned edge plus one counter step', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(db(ctx), 'communityPosts/reshareable'), makePost(AMINA));
  });
  const store = db(env.authenticatedContext(NYAABA));
  const batch = writeBatch(store);
  batch.set(doc(store, `communityReposts/${NYAABA}_reshareable`), {
    reposterId: NYAABA,
    postId: 'reshareable',
    reposter: { displayName: 'Nyaaba', username: 'nyaaba', avatarUrl: null },
  });
  batch.update(doc(store, 'communityPosts/reshareable'), { repostCount: increment(1) });
  await assertSucceeds(batch.commit());
});

test('a reshare counter cannot move without its deterministic edge', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(db(ctx), 'communityPosts/fake-reshare'), makePost(AMINA));
  });
  await assertFails(
    updateDoc(doc(db(env.authenticatedContext(NYAABA)), 'communityPosts/fake-reshare'), {
      repostCount: increment(1),
    }),
  );
});

test('a quote atomically creates its post and edge and updates the source', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(db(ctx), 'communityPosts/quoteable'), makePost(AMINA));
  });
  const store = db(env.authenticatedContext(NYAABA));
  const batch = writeBatch(store);
  batch.set(
    doc(store, 'communityPosts/quote-post'),
    makePost(NYAABA, {
      rootId: 'quote-post',
      text: 'N kana de.',
      quotedPostId: 'quoteable',
      quotedPost: makePost(AMINA),
    }),
  );
  batch.set(doc(store, `communityQuotes/${NYAABA}_quoteable`), {
    uid: NYAABA,
    sourcePostId: 'quoteable',
    quotePostId: 'quote-post',
  });
  batch.update(doc(store, 'communityPosts/quoteable'), { quoteCount: increment(1) });
  await assertSucceeds(batch.commit());
});

test('one signed-in viewer creates one atomic view edge', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(db(ctx), 'communityPosts/viewable'), makePost(AMINA));
  });
  const viewer = env.authenticatedContext(NYAABA);
  const store = db(viewer);
  // The client asks whether it has already counted this post before writing.
  // A missing edge must read as absent rather than as a refusal, or no first
  // impression is ever counted.
  await assertSucceeds(getDoc(doc(store, `communityViews/${NYAABA}_viewable`)));
  const batch = writeBatch(store);
  batch.set(doc(store, `communityViews/${NYAABA}_viewable`), {
    viewerId: NYAABA,
    postId: 'viewable',
  });
  batch.update(doc(store, 'communityPosts/viewable'), { viewCount: increment(1) });
  await assertSucceeds(batch.commit());

  await assertSucceeds(getDoc(doc(store, `communityViews/${NYAABA}_viewable`)));
  await assertSucceeds(
    getDoc(doc(db(env.authenticatedContext(AMINA)), `communityViews/${NYAABA}_viewable`)),
  );
  await assertFails(
    getDoc(doc(db(env.unauthenticatedContext()), `communityViews/${NYAABA}_viewable`)),
  );
});

test('polls accept 2–4 choices and each member gets one immutable vote', async () => {
  const aminaStore = db(env.authenticatedContext(AMINA));
  const endsAt = Timestamp.fromMillis(Date.now() + 86_400_000);
  await assertSucceeds(
    setDoc(
      doc(aminaStore, 'communityPosts/poll-post'),
      makePost(AMINA, {
        rootId: 'poll-post',
        poll: {
          options: [
            { id: 'option_0', text: 'A', voteCount: 0 },
            { id: 'option_1', text: 'B', voteCount: 0 },
          ],
          endsAt,
          totalVotes: 0,
        },
      }),
    ),
  );
  const voterStore = db(env.authenticatedContext(NYAABA));
  const voteRef = doc(voterStore, `communityPollVotes/${NYAABA}_poll-post`);
  await assertSucceeds(getDoc(voteRef));
  await assertSucceeds(
    setDoc(voteRef, { uid: NYAABA, postId: 'poll-post', optionId: 'option_0' }),
  );
  await assertFails(updateDoc(voteRef, { optionId: 'option_1' }));
  await assertSucceeds(getDoc(voteRef));
  await assertSucceeds(
    getDoc(doc(aminaStore, `communityPollVotes/${NYAABA}_poll-post`)),
  );
});

test('hide, mute and block edges are private and owned', async () => {
  const owner = db(env.authenticatedContext(NYAABA));
  const other = db(env.authenticatedContext(AMINA));
  const edges = [
    ['communityHiddenPosts', 'post1', { uid: NYAABA, postId: 'post1' }],
    ['communityMutes', AMINA, { uid: NYAABA, targetId: AMINA }],
    ['communityBlocks', AMINA, { uid: NYAABA, targetId: AMINA }],
  ];
  for (const [collection, target, data] of edges) {
    const edge = `${NYAABA}_${target}`;
    await assertSucceeds(setDoc(doc(owner, `${collection}/${edge}`), data));
    await assertSucceeds(getDoc(doc(owner, `${collection}/${edge}`)));
    await assertFails(getDoc(doc(other, `${collection}/${edge}`)));
  }
});

// ── Follows ─────────────────────────────────────────────────────────────────

test('a follow edge is owned by the follower and cannot point at yourself', async () => {
  const nyaaba = env.authenticatedContext(NYAABA);
  const store = db(nyaaba);

  await assertSucceeds(
    setDoc(doc(store, `communityFollows/${NYAABA}_${AMINA}`), {
      followerId: NYAABA,
      followingId: AMINA,
    }),
  );
  // Following on someone else's behalf.
  await assertFails(
    setDoc(doc(store, `communityFollows/${AMINA}_${NYAABA}`), {
      followerId: AMINA,
      followingId: NYAABA,
    }),
  );
  // Following yourself.
  await assertFails(
    setDoc(doc(store, `communityFollows/${NYAABA}_${NYAABA}`), {
      followerId: NYAABA,
      followingId: NYAABA,
    }),
  );
  // Document id that does not match the edge it claims to describe.
  await assertFails(
    setDoc(doc(store, 'communityFollows/mismatched'), {
      followerId: NYAABA,
      followingId: AMINA,
    }),
  );
});

test('only the follower can unfollow', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(db(ctx), `communityFollows/${AMINA}_${NYAABA}`), {
      followerId: AMINA,
      followingId: NYAABA,
    });
  });

  const nyaaba = env.authenticatedContext(NYAABA);
  const amina = env.authenticatedContext(AMINA);
  await assertFails(deleteDoc(doc(db(nyaaba), `communityFollows/${AMINA}_${NYAABA}`)));
  await assertSucceeds(deleteDoc(doc(db(amina), `communityFollows/${AMINA}_${NYAABA}`)));
});

// ── Reports ─────────────────────────────────────────────────────────────────

test('members file reports as themselves; only staff read them', async () => {
  const nyaaba = env.authenticatedContext(NYAABA);
  const validator = env.authenticatedContext('val1', { role: 'validator' });

  await assertSucceeds(
    setDoc(doc(db(nyaaba), 'communityReports/report1'), {
      postId: 'post1',
      reporterId: NYAABA,
      reason: 'Not written in Kasem',
      status: 'open',
    }),
  );
  await assertFails(
    setDoc(doc(db(nyaaba), 'communityReports/report2'), {
      postId: 'post1',
      reporterId: AMINA,
      reason: 'framing someone else',
      status: 'open',
    }),
  );

  await assertFails(getDoc(doc(db(nyaaba), 'communityReports/report1')));
  await assertSucceeds(getDoc(doc(db(validator), 'communityReports/report1')));
});

// ── Notifications ───────────────────────────────────────────────────────────

test('a member reads only their own notifications', async () => {
  const owner = env.authenticatedContext(AMINA);
  const other = env.authenticatedContext(NYAABA);
  const anon = env.unauthenticatedContext();

  await assertSucceeds(getDoc(doc(db(owner), 'communityNotifications/notif-for-amina')));
  await assertFails(getDoc(doc(db(other), 'communityNotifications/notif-for-amina')));
  await assertFails(getDoc(doc(db(anon), 'communityNotifications/notif-for-amina')));
});

test('nobody can forge a notification', async () => {
  // An alert is a channel straight to somebody's lock screen. Only the trusted
  // backend may open it.
  const nyaaba = env.authenticatedContext(NYAABA);
  await assertFails(setDoc(doc(db(nyaaba), 'communityNotifications/forged'), {
    id: 'forged',
    recipientId: AMINA,
    type: 'like',
    title: 'Tap here',
    read: false,
  }));

  const amina = env.authenticatedContext(AMINA);
  await assertFails(setDoc(doc(db(amina), 'communityNotifications/self-forged'), {
    id: 'self-forged',
    recipientId: AMINA,
    type: 'like',
    title: 'Tap here',
    read: false,
  }));
});

test('a member may mark their own notification read, and nothing else', async () => {
  const owner = env.authenticatedContext(AMINA);
  await assertSucceeds(updateDoc(doc(db(owner), 'communityNotifications/notif-for-amina'), {
    read: true,
  }));
  // Rewriting the headline, or unrelated fields, is denied.
  await assertFails(updateDoc(doc(db(owner), 'communityNotifications/notif-for-amina'), {
    title: 'Something else entirely',
  }));
  await assertFails(updateDoc(doc(db(owner), 'communityNotifications/notif-for-amina'), {
    read: false,
    postId: 'post-liked',
  }));
});

test('a member cannot mark somebody else notification read', async () => {
  const other = env.authenticatedContext(NYAABA);
  await assertFails(updateDoc(doc(db(other), 'communityNotifications/notif-for-amina'), {
    read: true,
  }));
});

test('notifications cannot be deleted by their recipient', async () => {
  const owner = env.authenticatedContext(AMINA);
  await assertFails(deleteDoc(doc(db(owner), 'communityNotifications/notif-for-amina')));
});

// ── Push registrations ──────────────────────────────────────────────────────

test('a member registers a device under their own uid', async () => {
  const owner = env.authenticatedContext(AMINA);
  await assertSucceeds(setDoc(doc(db(owner), 'communityDevices/token-new'), {
    uid: AMINA,
    token: 'token-new',
    platform: 'android',
  }));
});

test('a device row cannot be claimed for another account', async () => {
  const nyaaba = env.authenticatedContext(NYAABA);
  await assertFails(setDoc(doc(db(nyaaba), 'communityDevices/token-steal'), {
    uid: AMINA,
    token: 'token-steal',
    platform: 'android',
  }));
});

test('a device row must be keyed by the token it carries', async () => {
  // Otherwise one account could scatter rows the fan-out would still read.
  const owner = env.authenticatedContext(AMINA);
  await assertFails(setDoc(doc(db(owner), 'communityDevices/some-other-id'), {
    uid: AMINA,
    token: 'token-amina',
    platform: 'android',
  }));
});

test('a device may carry a lock-screen preview preference, if it is a bool', async () => {
  // The fan-out reads this per token to decide whether a message body reaches
  // the lock screen, so a string or a number there would quietly mean "yes".
  const owner = env.authenticatedContext(AMINA);
  await assertSucceeds(setDoc(doc(db(owner), 'communityDevices/token-new'), {
    uid: AMINA,
    token: 'token-new',
    platform: 'android',
    messagePreviews: false,
  }));
  await assertFails(setDoc(doc(db(owner), 'communityDevices/token-new'), {
    uid: AMINA,
    token: 'token-new',
    platform: 'android',
    messagePreviews: 'no',
  }));
});

test('nobody can read another member device tokens', async () => {
  // Knowing somebody's tokens is knowing how to reach their handset.
  const other = env.authenticatedContext(NYAABA);
  const anon = env.unauthenticatedContext();
  await assertFails(getDoc(doc(db(other), 'communityDevices/token-amina')));
  await assertFails(getDoc(doc(db(anon), 'communityDevices/token-amina')));
});

test('a member can unregister their own device on sign-out', async () => {
  const owner = env.authenticatedContext(AMINA);
  await assertSucceeds(deleteDoc(doc(db(owner), 'communityDevices/token-new')));
});
