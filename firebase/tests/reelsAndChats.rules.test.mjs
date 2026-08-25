// Explore reel engagement and private chat Security Rules tests, run against
// the Firestore emulator.
//
//   npm run test:rules        (from the repo root — wraps this in emulators:exec)
//
// Covers two data models added to firebase/firestore.rules:
//
//   * reel engagement — appreciation, keep, impression and reply edges on
//     published reels, all owner-written, with public totals read by aggregate
//     count() rather than by any shared counter document;
//   * private conversations — a thread keyed by its two participants, where
//     both of them may write the thread document (a sender has to raise the
//     other side's unread count) but neither may change who is in it.

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
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'demo-indigen-world';
const host = '127.0.0.1';
const port = 8080;
const rulesPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'firestore.rules');

const AMINA = 'amina-uid';
const NYAABA = 'nyaaba-uid';
const AWINI = 'awini-uid';
const REEL = 'pub_reel-1';

// Sorted pair, exactly as ChatRepository.threadId computes it on the client.
const THREAD = [AMINA, NYAABA].sort().join('_');
const OTHERS_THREAD = [NYAABA, AWINI].sort().join('_');

function makeProfile(uid, username) {
  return {
    uid,
    username,
    displayName: 'Community member',
    displayNameLower: 'community member',
    bio: '',
    location: '',
    dialect: '',
    isVerified: false,
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
    // Deliberately no profile for AWINI: they are the signed-in account used
    // to prove that replying to a reel needs a public identity first.
    await setDoc(doc(db, `reelSaves/${AMINA}_${REEL}`), { uid: AMINA, reelId: REEL });
    await setDoc(doc(db, `reelViews/${AMINA}_${REEL}`), { viewerId: AMINA, reelId: REEL });
    await setDoc(doc(db, 'reelComments/comment-by-amina'), {
      reelId: REEL,
      authorId: AMINA,
      author: { displayName: 'Amina', username: 'amina_paga', avatarUrl: null },
      text: 'Ko gara.',
    });
    await setDoc(doc(db, `communityChats/${THREAD}`), {
      participants: [AMINA, NYAABA].sort(),
      participantProfiles: {
        [AMINA]: { displayName: 'Amina', username: 'amina_paga', avatarUrl: null },
        [NYAABA]: { displayName: 'Nyaaba', username: 'nyaaba', avatarUrl: null },
      },
    });
    await setDoc(doc(db, `communityChats/${THREAD}/messages/message-1`), {
      senderId: AMINA,
      text: 'De zaanem.',
    });
    await setDoc(doc(db, `communityChats/${OTHERS_THREAD}`), {
      participants: [NYAABA, AWINI].sort(),
      participantProfiles: {},
    });
    await setDoc(doc(db, `communityChats/${OTHERS_THREAD}/messages/message-1`), {
      senderId: NYAABA,
      text: 'Private.',
    });
  });
});

after(async () => {
  await env?.cleanup();
});

const db = (ctx) => ctx.firestore();

// ── Reel appreciations ──────────────────────────────────────────────────────

test('a member appreciates a reel under their own edge id', async () => {
  const amina = env.authenticatedContext(AMINA);
  await assertSucceeds(setDoc(doc(db(amina), `reelLikes/${AMINA}_${REEL}`), {
    uid: AMINA,
    reelId: REEL,
  }));
});

test('appreciations are public, so a reel can show its total', async () => {
  const anon = env.unauthenticatedContext();
  await assertSucceeds(getDoc(doc(db(anon), `reelLikes/${AMINA}_${REEL}`)));
});

test('an appreciation cannot be written under another member uid', async () => {
  const nyaaba = env.authenticatedContext(NYAABA);
  await assertFails(setDoc(doc(db(nyaaba), `reelLikes/${AMINA}_${REEL}`), {
    uid: AMINA,
    reelId: REEL,
  }));
});

test('an appreciation edge must be keyed by its owner and reel', async () => {
  // Otherwise one account could scatter edges the count query would still add up.
  const nyaaba = env.authenticatedContext(NYAABA);
  await assertFails(setDoc(doc(db(nyaaba), 'reelLikes/some-other-id'), {
    uid: NYAABA,
    reelId: REEL,
  }));
});

test('a guest cannot appreciate a reel', async () => {
  const anon = env.unauthenticatedContext();
  await assertFails(setDoc(doc(db(anon), `reelLikes/guest_${REEL}`), {
    uid: 'guest',
    reelId: REEL,
  }));
});

test('a member can withdraw their own appreciation but not somebody else', async () => {
  const amina = env.authenticatedContext(AMINA);
  const nyaaba = env.authenticatedContext(NYAABA);
  await assertFails(deleteDoc(doc(db(nyaaba), `reelLikes/${AMINA}_${REEL}`)));
  await assertSucceeds(deleteDoc(doc(db(amina), `reelLikes/${AMINA}_${REEL}`)));
});

// ── Keeps and impressions ───────────────────────────────────────────────────

test('keeps are private to their owner', async () => {
  const amina = env.authenticatedContext(AMINA);
  const nyaaba = env.authenticatedContext(NYAABA);
  const anon = env.unauthenticatedContext();
  await assertSucceeds(getDoc(doc(db(amina), `reelSaves/${AMINA}_${REEL}`)));
  await assertFails(getDoc(doc(db(nyaaba), `reelSaves/${AMINA}_${REEL}`)));
  await assertFails(getDoc(doc(db(anon), `reelSaves/${AMINA}_${REEL}`)));
});

test('a member keeps a reel under their own edge id', async () => {
  const nyaaba = env.authenticatedContext(NYAABA);
  await assertSucceeds(setDoc(doc(db(nyaaba), `reelSaves/${NYAABA}_${REEL}`), {
    uid: NYAABA,
    reelId: REEL,
  }));
});

test('an impression is idempotent for its owner and invisible to others', async () => {
  const amina = env.authenticatedContext(AMINA);
  const nyaaba = env.authenticatedContext(NYAABA);
  // Scrolling back to a reel rewrites the same row rather than adding one.
  await assertSucceeds(setDoc(doc(db(amina), `reelViews/${AMINA}_${REEL}`), {
    viewerId: AMINA,
    reelId: REEL,
  }));
  await assertFails(getDoc(doc(db(nyaaba), `reelViews/${AMINA}_${REEL}`)));
});

test('an impression cannot be recorded on behalf of somebody else', async () => {
  const nyaaba = env.authenticatedContext(NYAABA);
  await assertFails(setDoc(doc(db(nyaaba), `reelViews/${AMINA}_${REEL}`), {
    viewerId: AMINA,
    reelId: REEL,
  }));
});

// ── Reel replies ────────────────────────────────────────────────────────────

test('the reply thread under a public reel is public', async () => {
  const anon = env.unauthenticatedContext();
  await assertSucceeds(getDoc(doc(db(anon), 'reelComments/comment-by-amina')));
});

test('a member with a handle can reply to a reel', async () => {
  const nyaaba = env.authenticatedContext(NYAABA);
  await assertSucceeds(addDoc(collection(db(nyaaba), 'reelComments'), {
    reelId: REEL,
    authorId: NYAABA,
    author: { displayName: 'Nyaaba', username: 'nyaaba', avatarUrl: null },
    text: 'De N lei.',
  }));
});

test('replying needs a community profile, not just an account', async () => {
  // A reply with no handle behind it has nobody to answer.
  const awini = env.authenticatedContext(AWINI);
  await assertFails(addDoc(collection(db(awini), 'reelComments'), {
    reelId: REEL,
    authorId: AWINI,
    author: { displayName: 'Awini', username: 'awini', avatarUrl: null },
    text: 'Hello.',
  }));
});

test('a reply cannot be attributed to another member', async () => {
  const nyaaba = env.authenticatedContext(NYAABA);
  await assertFails(addDoc(collection(db(nyaaba), 'reelComments'), {
    reelId: REEL,
    authorId: AMINA,
    author: { displayName: 'Amina', username: 'amina_paga', avatarUrl: null },
    text: 'Not mine to say.',
  }));
});

test('an empty or oversized reply is refused', async () => {
  const nyaaba = env.authenticatedContext(NYAABA);
  const base = {
    reelId: REEL,
    authorId: NYAABA,
    author: { displayName: 'Nyaaba', username: 'nyaaba', avatarUrl: null },
  };
  await assertFails(addDoc(collection(db(nyaaba), 'reelComments'), { ...base, text: '' }));
  await assertFails(addDoc(collection(db(nyaaba), 'reelComments'), {
    ...base,
    text: 'x'.repeat(401),
  }));
});

test('a reply is withdrawn by its author, never rewritten', async () => {
  const amina = env.authenticatedContext(AMINA);
  const nyaaba = env.authenticatedContext(NYAABA);
  await assertFails(updateDoc(doc(db(amina), 'reelComments/comment-by-amina'), {
    text: 'Something else entirely.',
  }));
  await assertFails(deleteDoc(doc(db(nyaaba), 'reelComments/comment-by-amina')));
  await assertSucceeds(deleteDoc(doc(db(amina), 'reelComments/comment-by-amina')));
});

// ── Private conversations ───────────────────────────────────────────────────

test('only the two participants can read a thread', async () => {
  const amina = env.authenticatedContext(AMINA);
  const awini = env.authenticatedContext(AWINI);
  const anon = env.unauthenticatedContext();
  await assertSucceeds(getDoc(doc(db(amina), `communityChats/${THREAD}`)));
  await assertFails(getDoc(doc(db(awini), `communityChats/${THREAD}`)));
  await assertFails(getDoc(doc(db(anon), `communityChats/${THREAD}`)));
});

test('only the two participants can read the messages', async () => {
  const nyaaba = env.authenticatedContext(NYAABA);
  const awini = env.authenticatedContext(AWINI);
  await assertSucceeds(getDoc(doc(db(nyaaba), `communityChats/${THREAD}/messages/message-1`)));
  await assertFails(getDoc(doc(db(awini), `communityChats/${THREAD}/messages/message-1`)));
});

test('a thread must be keyed by its two participants in sorted order', async () => {
  // This is what stops a pair of members ending up with two conversations.
  const amina = env.authenticatedContext(AMINA);
  await assertFails(setDoc(doc(db(amina), 'communityChats/made-up-id'), {
    participants: [AMINA, AWINI].sort(),
    participantProfiles: {},
  }));
});

test('a member opens a thread they are part of', async () => {
  const amina = env.authenticatedContext(AMINA);
  const id = [AMINA, AWINI].sort().join('_');
  await assertSucceeds(setDoc(doc(db(amina), `communityChats/${id}`), {
    participants: [AMINA, AWINI].sort(),
    participantProfiles: {},
  }));
});

test('nobody can open a thread between two other people', async () => {
  const amina = env.authenticatedContext(AMINA);
  const id = [NYAABA, AWINI].sort().join('_');
  await assertFails(setDoc(doc(db(amina), `communityChats/${id}-fake`), {
    participants: [NYAABA, AWINI].sort(),
    participantProfiles: {},
  }));
  await assertFails(setDoc(doc(db(amina), `communityChats/${id}`), {
    participants: [NYAABA, AWINI].sort(),
    participantProfiles: {},
  }));
});

test('a participant may move unread counts but never the participant list', async () => {
  const nyaaba = env.authenticatedContext(NYAABA);
  await assertSucceeds(updateDoc(doc(db(nyaaba), `communityChats/${THREAD}`), {
    [`unread.${AMINA}`]: 1,
  }));
  await assertFails(updateDoc(doc(db(nyaaba), `communityChats/${THREAD}`), {
    participants: [NYAABA, AWINI].sort(),
  }));
});

test('an outsider cannot write to a thread or its messages', async () => {
  const awini = env.authenticatedContext(AWINI);
  await assertFails(updateDoc(doc(db(awini), `communityChats/${THREAD}`), {
    lastMessage: 'I was never here.',
  }));
  await assertFails(addDoc(collection(db(awini), `communityChats/${THREAD}/messages`), {
    senderId: AWINI,
    text: 'I was never here.',
  }));
});

test('a participant sends a message as themselves', async () => {
  const nyaaba = env.authenticatedContext(NYAABA);
  await assertSucceeds(addDoc(collection(db(nyaaba), `communityChats/${THREAD}/messages`), {
    senderId: NYAABA,
    text: 'Ko gara.',
  }));
});

test('a message cannot be forged in somebody else name', async () => {
  const nyaaba = env.authenticatedContext(NYAABA);
  await assertFails(addDoc(collection(db(nyaaba), `communityChats/${THREAD}/messages`), {
    senderId: AMINA,
    text: 'Words she never said.',
  }));
});

test('a message can be withdrawn by its sender, never edited', async () => {
  const amina = env.authenticatedContext(AMINA);
  const nyaaba = env.authenticatedContext(NYAABA);
  const path = `communityChats/${THREAD}/messages/message-1`;
  await assertFails(updateDoc(doc(db(amina), path), { text: 'Something else.' }));
  await assertFails(deleteDoc(doc(db(nyaaba), path)));
  await assertSucceeds(deleteDoc(doc(db(amina), path)));
});
