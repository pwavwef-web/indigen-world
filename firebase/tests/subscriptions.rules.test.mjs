// Subscription and integrity Security Rules tests, run against the Firestore
// emulator.
//
//   npm run test:rules        (from the repo root — wraps this in emulators:exec)
//
// Three things are being pinned here, and all three are about the same idea:
// what somebody has paid for is decided by Google Play and written by the
// backend, and a phone gets to read the answer and nothing else.
//
//   * `entitlements/{uid}`      — the owner reads, nobody writes.
//   * `subscriptionPurchases`   — purchase tokens. Nobody reads, nobody writes.
//   * `deviceIntegrityChecks`   — not even the member it is about, because a
//                                 tamper attempt must not be handed its own
//                                 scorecard.
//
// Plus the one field a phone *does* write about its own subscription: the
// supporter mark stamped onto a post's author snapshot, which has to match the
// entitlement or the write is refused.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const PROJECT_ID = 'demo-indigen-world';
const host = '127.0.0.1';
const port = 8080;
const rulesPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'firestore.rules');

/// Subscribes at Patron, so their stamp may say `patron` and nothing else.
const PATRON = 'patron-uid';
/// Subscribes to nothing at all.
const FREE = 'free-uid';
const STAFF = 'staff-uid';

function entitlement(uid, overrides = {}) {
  return {
    uid,
    tier: 'patron',
    status: 'active',
    productId: 'indigen_patron',
    basePlanId: 'patron-yearly',
    offerId: '',
    source: 'play',
    autoRenewing: true,
    startedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2027-01-01T00:00:00.000Z',
    testPurchase: false,
    regionCode: 'GH',
    supporterMark: 'patron',
    entitled: true,
    purchaseDocId: 'a'.repeat(64),
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function profile(uid, username, overrides = {}) {
  return {
    uid,
    username,
    displayName: 'Member',
    bio: '',
    avatarUrl: null,
    bannerUrl: null,
    location: '',
    dialect: '',
    verifiedKind: '',
    supporterMark: '',
    phoneVerified: false,
    isVerified: false,
    ...overrides,
  };
}

function post(uid, id, supporterMark) {
  return {
    id,
    authorId: uid,
    author: {
      displayName: 'Member',
      username: uid === PATRON ? 'patron' : 'free',
      avatarUrl: null,
      verifiedKind: '',
      phoneVerified: false,
      supporterMark,
    },
    text: 'Kasem is worth writing down.',
    media: [],
    likeCount: 0,
    replyCount: 0,
    repostCount: 0,
    quoteCount: 0,
    viewCount: 0,
    parentId: null,
  };
}

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(rulesPath, 'utf8'), host, port },
  });

  // Everything here is server-authored, so the fixtures are written with rules
  // disabled — exactly as subscriptions.ts does with the Admin SDK.
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `entitlements/${PATRON}`), entitlement(PATRON));
    await setDoc(doc(db, `communityProfiles/${PATRON}`), profile(PATRON, 'patron', {
      supporterMark: 'patron',
    }));
    await setDoc(doc(db, `communityProfiles/${FREE}`), profile(FREE, 'free'));
    await setDoc(doc(db, `subscriptionPurchases/${'a'.repeat(64)}`), {
      docId: 'a'.repeat(64),
      uid: PATRON,
      purchaseToken: 'a-real-play-purchase-token',
      productId: 'indigen_patron',
    });
    await setDoc(doc(db, `playAccountIndex/${'b'.repeat(64)}`), { uid: PATRON });
    await setDoc(doc(db, `deviceIntegrityChecks/${PATRON}`), {
      uid: PATRON,
      decision: 'block',
      reasons: ['device_untrusted'],
      blocked: true,
      checkedAtMs: 1_770_000_000_000,
    });
  });
});

after(async () => {
  await env?.cleanup();
});

const db = (ctx) => ctx.firestore();

// ── entitlements ────────────────────────────────────────────────────────────

test('a member reads their own entitlement', async () => {
  await assertSucceeds(
    getDoc(doc(db(env.authenticatedContext(PATRON)), `entitlements/${PATRON}`)),
  );
});

test('nobody reads somebody else\'s entitlement', async () => {
  await assertFails(
    getDoc(doc(db(env.authenticatedContext(FREE)), `entitlements/${PATRON}`)),
  );
  await assertFails(
    getDoc(doc(db(env.unauthenticatedContext()), `entitlements/${PATRON}`)),
  );
});

test('staff read an entitlement, so support can answer a billing question', async () => {
  for (const role of ['validator', 'reviewer', 'admin', 'super_admin']) {
    const staff = env.authenticatedContext(STAFF, { role });
    await assertSucceeds(getDoc(doc(db(staff), `entitlements/${PATRON}`)));
  }
});

test('nobody writes an entitlement — not the owner, not an admin', async () => {
  const owner = env.authenticatedContext(PATRON);
  await assertFails(
    setDoc(doc(db(owner), `entitlements/${PATRON}`), entitlement(PATRON)),
  );
  await assertFails(
    updateDoc(doc(db(owner), `entitlements/${PATRON}`), { tier: 'creator' }),
  );
  await assertFails(deleteDoc(doc(db(owner), `entitlements/${PATRON}`)));

  // Granting yourself a subscription is the whole attack, so an admin claim
  // does not help either. A comped subscription goes through the Admin SDK.
  const admin = env.authenticatedContext(FREE, { role: 'admin' });
  await assertFails(
    setDoc(doc(db(admin), `entitlements/${FREE}`), entitlement(FREE)),
  );
});

test('a member cannot create an entitlement they do not have', async () => {
  await assertFails(
    setDoc(
      doc(db(env.authenticatedContext(FREE)), `entitlements/${FREE}`),
      entitlement(FREE, { tier: 'creator', supporterMark: 'studio' }),
    ),
  );
});

// ── purchase tokens and the account index ───────────────────────────────────

test('a purchase token is readable by nobody at all', async () => {
  // It is a bearer credential: anyone holding it can ask Play about the
  // purchase. That is why it lives here and not on the entitlement.
  const id = 'a'.repeat(64);
  for (const ctx of [
    env.authenticatedContext(PATRON),
    env.authenticatedContext(STAFF, { role: 'super_admin' }),
    env.unauthenticatedContext(),
  ]) {
    await assertFails(getDoc(doc(db(ctx), `subscriptionPurchases/${id}`)));
    await assertFails(setDoc(doc(db(ctx), `subscriptionPurchases/${id}`), { uid: FREE }));
  }
});

test('the Play account index is server-only in both directions', async () => {
  const id = 'b'.repeat(64);
  const member = env.authenticatedContext(FREE);
  await assertFails(getDoc(doc(db(member), `playAccountIndex/${id}`)));
  // Pointing an existing purchase at your own uid would be a stolen
  // subscription, so writing here is denied outright.
  await assertFails(setDoc(doc(db(member), `playAccountIndex/${id}`), { uid: FREE }));
});

// ── integrity verdicts ──────────────────────────────────────────────────────

test('a device integrity verdict is not readable by the device it judges', async () => {
  await assertFails(
    getDoc(doc(db(env.authenticatedContext(PATRON)), `deviceIntegrityChecks/${PATRON}`)),
  );
});

test('staff read integrity verdicts, and nobody writes one', async () => {
  const staff = env.authenticatedContext(STAFF, { role: 'admin' });
  await assertSucceeds(getDoc(doc(db(staff), `deviceIntegrityChecks/${PATRON}`)));
  await assertFails(
    setDoc(doc(db(staff), `deviceIntegrityChecks/${PATRON}`), { decision: 'allow' }),
  );
});

// ── the supporter mark on a profile ─────────────────────────────────────────

test('a new profile cannot arrive carrying a supporter mark', async () => {
  const newcomer = env.authenticatedContext('newcomer-uid');
  await assertFails(
    setDoc(
      doc(db(newcomer), 'communityProfiles/newcomer-uid'),
      profile('newcomer-uid', 'newcomer', { supporterMark: 'patron' }),
    ),
  );
  await assertSucceeds(
    setDoc(
      doc(db(newcomer), 'communityProfiles/newcomer-uid'),
      profile('newcomer-uid', 'newcomer'),
    ),
  );
});

test('a member cannot add a supporter mark to their own profile', async () => {
  await assertFails(
    updateDoc(doc(db(env.authenticatedContext(FREE)), `communityProfiles/${FREE}`), {
      supporterMark: 'studio',
    }),
  );
});

test('a member cannot remove the mark they do have', async () => {
  // The freeze runs both ways. The field is the server's, full stop.
  await assertFails(
    updateDoc(doc(db(env.authenticatedContext(PATRON)), `communityProfiles/${PATRON}`), {
      supporterMark: '',
    }),
  );
});

test('an ordinary profile edit still goes through', async () => {
  await assertSucceeds(
    updateDoc(doc(db(env.authenticatedContext(PATRON)), `communityProfiles/${PATRON}`), {
      displayName: 'Awiah',
      bio: 'Kasem speaker, Navrongo.',
    }),
  );
});

// ── the supporter mark stamped on a post ────────────────────────────────────

test('a subscriber may stamp the mark they actually hold', async () => {
  await assertSucceeds(
    setDoc(
      doc(db(env.authenticatedContext(PATRON)), 'communityPosts/post-patron'),
      post(PATRON, 'post-patron', 'patron'),
    ),
  );
});

test('a subscriber may not stamp a mark above the one they hold', async () => {
  await assertFails(
    setDoc(
      doc(db(env.authenticatedContext(PATRON)), 'communityPosts/post-overreach'),
      post(PATRON, 'post-overreach', 'studio'),
    ),
  );
});

test('a free member may not stamp any mark at all', async () => {
  await assertFails(
    setDoc(
      doc(db(env.authenticatedContext(FREE)), 'communityPosts/post-free-claim'),
      post(FREE, 'post-free-claim', 'supporter'),
    ),
  );
});

test('a post with no mark is unaffected, subscriber or not', async () => {
  // The common case, and the one that must not have got slower or stricter.
  await assertSucceeds(
    setDoc(
      doc(db(env.authenticatedContext(FREE)), 'communityPosts/post-free-plain'),
      post(FREE, 'post-free-plain', ''),
    ),
  );
  await assertSucceeds(
    setDoc(
      doc(db(env.authenticatedContext(PATRON)), 'communityPosts/post-patron-plain'),
      post(PATRON, 'post-patron-plain', ''),
    ),
  );
});

test('a reel comment is held to the same rule', async () => {
  const comment = (uid, supporterMark) => ({
    reelId: 'reel-1',
    authorId: uid,
    author: {
      displayName: 'Member',
      username: uid,
      avatarUrl: null,
      verifiedKind: '',
      phoneVerified: false,
      supporterMark,
    },
    text: 'Beautiful.',
  });

  await assertSucceeds(
    setDoc(
      doc(db(env.authenticatedContext(PATRON)), 'reelComments/comment-patron'),
      comment(PATRON, 'patron'),
    ),
  );
  await assertFails(
    setDoc(
      doc(db(env.authenticatedContext(FREE)), 'reelComments/comment-free'),
      comment(FREE, 'patron'),
    ),
  );
});
