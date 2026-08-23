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
