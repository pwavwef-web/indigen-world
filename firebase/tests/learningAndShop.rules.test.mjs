// Security Rules tests for the learning path, the app directory and the shop,
// run against the Firestore emulator.
//
//   npm run test:rules        (from the repo root — wraps this in emulators:exec)
//
// Three properties matter here and none of them are obvious from the rules
// file alone:
//
//   * A draft lesson is invisible. An unfinished question is a wrong answer
//     waiting to be taught, so only published lessons are world-readable.
//   * Learning progress is private to the member it belongs to. What somebody
//     has and has not learned is theirs, not the community's.
//   * An order is a *request*. A member may ask to buy something; only staff
//     may say it has been fulfilled.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const PROJECT_ID = 'demo-indigen-world';
const host = '127.0.0.1';
const port = 8080;
const rulesPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'firestore.rules');

const LEARNER = 'learner-uid';
const OTHER = 'other-uid';
const ADMIN = { sub: 'admin-uid', role: 'admin' };
const VALIDATOR = { sub: 'validator-uid', role: 'validator' };

function makeLesson(overrides = {}) {
  return {
    id: 'unit1-say-hello',
    title: 'Say hello',
    unitTitle: 'Start a conversation',
    unitSubtitle: 'Greetings and courtesy',
    unitOrder: 1,
    order: 1,
    minutes: 2,
    xp: 15,
    iconName: 'wave',
    published: true,
    questions: [
      {
        prompt: 'Choose the greeting',
        support: '',
        answers: ['De zaanem', 'Ko gara'],
        correctAnswer: 0,
        explanation: 'The welcome phrase in this unit.',
      },
    ],
    ...overrides,
  };
}

function makeProgress(uid, overrides = {}) {
  return {
    uid,
    completedLessons: ['unit1-say-hello'],
    lessonXp: { 'unit1-say-hello': 15 },
    sparkXp: 5,
    xp: 20,
    streakDays: 2,
    lastStreakClaim: null,
    ...overrides,
  };
}

function makeOrder(uid, overrides = {}) {
  return {
    uid,
    contact: '+233 20 000 0000',
    note: '',
    status: 'requested',
    items: [
      { productId: 'shea-250', name: 'Shea butter 250g', quantity: 2, priceMinor: 4500, currency: 'GHS' },
    ],
    totalMinor: 9000,
    currency: 'GHS',
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
    await setDoc(doc(db, 'learnLessons/unit1-say-hello'), makeLesson());
    await setDoc(
      doc(db, 'learnLessons/unit9-draft'),
      makeLesson({ id: 'unit9-draft', published: false }),
    );
    await setDoc(doc(db, `learnProgress/${LEARNER}`), makeProgress(LEARNER));
    await setDoc(doc(db, 'collectionApps/kasem-bible'), {
      id: 'kasem-bible',
      name: 'Kasem Bible',
      published: true,
      order: 1,
      links: { android: 'https://play.google.com/store/apps/details?id=example' },
    });
    await setDoc(doc(db, 'shopProducts/shea-250'), {
      id: 'shea-250',
      name: 'Shea butter 250g',
      published: true,
      order: 1,
      priceMinor: 4500,
      currency: 'GHS',
    });
    await setDoc(doc(db, 'kasemHeroes/awe-atanga'), {
      id: 'awe-atanga',
      name: 'Awe Atanga',
      field: 'Chief',
      published: true,
      order: 1,
    });
    await setDoc(doc(db, 'kasemHeroes/unpublished'), {
      id: 'unpublished',
      name: 'Still being written',
      published: false,
      order: 2,
    });
    await setDoc(doc(db, 'kasemNames/nyaaba'), {
      id: 'nyaaba',
      name: 'Nyaaba',
      ascii: 'nyaaba',
      kind: 'given',
      published: true,
      order: 1,
    });
    await setDoc(doc(db, 'kasemNameRequests/req-1'), {
      id: 'req-1',
      uid: LEARNER,
      name: 'Awɛlɩmwɛ',
      ascii: 'awelimwe',
      kind: 'given',
      handle: 'awelimwe',
      status: 'pending',
    });
    await setDoc(doc(db, 'kasemNameRequests/req-2'), {
      id: 'req-2',
      uid: OTHER,
      name: 'Apɔka',
      ascii: 'apoka',
      kind: 'given',
      handle: '',
      status: 'pending',
    });
    await setDoc(doc(db, 'wordQueue/the-8f7a9c'), {
      id: 'the-8f7a9c', word: 'the', lookup: 'the', rank: 1, tier: 'core',
      sentence: 'Give him an inch and he will take a yard.',
      sentenceSource: 'tatoeba', status: 'open',
      approvedCount: 0, pendingCount: 0, skipCount: 0,
    });
    await setDoc(doc(db, 'wordQueue/done-111111'), {
      id: 'done-111111', word: 'water', lookup: 'water', rank: 2, tier: 'core',
      sentence: 'The water is cold.', sentenceSource: 'tatoeba',
      status: 'translated', approvedCount: 1, pendingCount: 0, skipCount: 0,
    });
    await setDoc(doc(db, `wordQueueProgress/${LEARNER}`), {
      uid: LEARNER, answered: ['the-8f7a9c'], skipped: [],
    });
    await setDoc(doc(db, `contributorScores/${LEARNER}`), {
      uid: LEARNER, points: 340, approvedCount: 12, streakDays: 3,
      displayName: 'A member', username: 'nyaaba', avatarUrl: null,
    });
    await setDoc(doc(db, 'contributorPointAwards/contrib-1'), {
      contributionId: 'contrib-1', uid: LEARNER, points: 10,
    });
    await setDoc(doc(db, 'shopOrders/order-1'), makeOrder(LEARNER));
  });
});

after(async () => {
  await env?.cleanup();
});

const db = (ctx) => ctx.firestore();

// ── Lessons ─────────────────────────────────────────────────────────────────

test('guests read published lessons but never drafts', async () => {
  const anon = env.unauthenticatedContext();
  await assertSucceeds(getDoc(doc(db(anon), 'learnLessons/unit1-say-hello')));
  await assertFails(getDoc(doc(db(anon), 'learnLessons/unit9-draft')));
});

test('staff can read a draft lesson they are still writing', async () => {
  const validator = env.authenticatedContext(VALIDATOR.sub, { role: VALIDATOR.role });
  await assertSucceeds(getDoc(doc(db(validator), 'learnLessons/unit9-draft')));
});

test('only an admin may write a lesson', async () => {
  const learner = env.authenticatedContext(LEARNER);
  const validator = env.authenticatedContext(VALIDATOR.sub, { role: VALIDATOR.role });
  const admin = env.authenticatedContext(ADMIN.sub, { role: ADMIN.role });

  await assertFails(setDoc(doc(db(learner), 'learnLessons/rogue'), makeLesson({ id: 'rogue' })));
  await assertFails(setDoc(doc(db(validator), 'learnLessons/rogue'), makeLesson({ id: 'rogue' })));
  await assertSucceeds(setDoc(doc(db(admin), 'learnLessons/rogue'), makeLesson({ id: 'rogue' })));
});

test('a lesson without questions is not a lesson', async () => {
  const admin = env.authenticatedContext(ADMIN.sub, { role: ADMIN.role });
  await assertFails(
    setDoc(doc(db(admin), 'learnLessons/empty'), makeLesson({ id: 'empty', questions: [] })),
  );
  await assertFails(
    setDoc(doc(db(admin), 'learnLessons/untitled'), makeLesson({ id: 'untitled', title: '' })),
  );
});

// ── Progress ────────────────────────────────────────────────────────────────

test('learning progress is private to the member it belongs to', async () => {
  const owner = env.authenticatedContext(LEARNER);
  const other = env.authenticatedContext(OTHER);
  const anon = env.unauthenticatedContext();
  const admin = env.authenticatedContext(ADMIN.sub, { role: ADMIN.role });

  await assertSucceeds(getDoc(doc(db(owner), `learnProgress/${LEARNER}`)));
  await assertFails(getDoc(doc(db(other), `learnProgress/${LEARNER}`)));
  await assertFails(getDoc(doc(db(anon), `learnProgress/${LEARNER}`)));
  // Not even an admin: this one is nobody else's business.
  await assertFails(getDoc(doc(db(admin), `learnProgress/${LEARNER}`)));
});

test('a member writes their own progress and nobody else’s', async () => {
  const owner = env.authenticatedContext(LEARNER);
  const other = env.authenticatedContext(OTHER);

  await assertSucceeds(
    setDoc(doc(db(owner), `learnProgress/${LEARNER}`), makeProgress(LEARNER, { xp: 35 })),
  );
  await assertFails(
    setDoc(doc(db(other), `learnProgress/${LEARNER}`), makeProgress(LEARNER, { xp: 999 })),
  );
  // The uid inside the document has to be the one in the path, so a row cannot
  // be written that claims to belong to somebody else.
  await assertFails(
    setDoc(doc(db(other), `learnProgress/${OTHER}`), makeProgress(LEARNER)),
  );
});

test('progress cannot be negative', async () => {
  const owner = env.authenticatedContext(LEARNER);
  await assertFails(
    setDoc(doc(db(owner), `learnProgress/${LEARNER}`), makeProgress(LEARNER, { xp: -1 })),
  );
  await assertFails(
    setDoc(doc(db(owner), `learnProgress/${LEARNER}`), makeProgress(LEARNER, { streakDays: -3 })),
  );
});

// ── Apps and shop ───────────────────────────────────────────────────────────

test('the app directory and shop are guest-readable, admin-written', async () => {
  const anon = env.unauthenticatedContext();
  const learner = env.authenticatedContext(LEARNER);
  const admin = env.authenticatedContext(ADMIN.sub, { role: ADMIN.role });

  await assertSucceeds(getDoc(doc(db(anon), 'collectionApps/kasem-bible')));
  await assertSucceeds(getDoc(doc(db(anon), 'shopProducts/shea-250')));
  await assertFails(setDoc(doc(db(learner), 'shopProducts/forged'), { name: 'Forged', published: true }));
  await assertSucceeds(setDoc(doc(db(admin), 'shopProducts/forged'), { name: 'Forged', published: true }));
});

test('the heroes and the names are guest-readable, admin-written', async () => {
  const anon = env.unauthenticatedContext();
  const learner = env.authenticatedContext(LEARNER);
  const admin = env.authenticatedContext(ADMIN.sub, { role: ADMIN.role });

  // Both are read by guests: Collection and the Learn card are open to
  // somebody who has not signed in, and so is the ring on a byline.
  await assertSucceeds(getDoc(doc(db(anon), 'kasemHeroes/awe-atanga')));
  await assertSucceeds(getDoc(doc(db(anon), 'kasemNames/nyaaba')));

  // An account somebody is still writing is not published yet.
  await assertFails(getDoc(doc(db(anon), 'kasemHeroes/unpublished')));

  // Nobody contributes here from the app. A claim about who somebody was is
  // not something to crowd-source, and a name list anybody could add to is a
  // ring anybody could award themselves.
  await assertFails(
    setDoc(doc(db(learner), 'kasemHeroes/forged'), { name: 'Me', published: true }),
  );
  await assertFails(
    setDoc(doc(db(learner), 'kasemNames/forged'), { name: 'Me', ascii: 'me', published: true }),
  );
  await assertSucceeds(
    setDoc(doc(db(admin), 'kasemHeroes/forged'), { name: 'Real', published: true }),
  );
  await assertSucceeds(
    setDoc(doc(db(admin), 'kasemNames/awine'), { name: 'Awine', ascii: 'awine', published: true }),
  );
});

test('a name request is read by its asker and the reviewers, and written by nobody', async () => {
  const owner = env.authenticatedContext(LEARNER);
  const other = env.authenticatedContext(OTHER);
  const anon = env.unauthenticatedContext();
  const validator = env.authenticatedContext(VALIDATOR.sub, { role: VALIDATOR.role });

  // The asker reads their own, so the claim screen can say "you already asked
  // for this" instead of letting them spend a day's quota asking twice.
  await assertSucceeds(getDoc(doc(db(owner), 'kasemNameRequests/req-1')));
  // A reviewer reads the queue they are reviewing.
  await assertSucceeds(getDoc(doc(db(validator), 'kasemNameRequests/req-2')));
  // Nobody else. A request names somebody's grandmother and the handle they
  // want; it is not a public list.
  await assertFails(getDoc(doc(db(other), 'kasemNameRequests/req-1')));
  await assertFails(getDoc(doc(db(anon), 'kasemNameRequests/req-1')));

  // Every write is the callables' — and it has to be. `ascii` is what decides
  // who wears the kente ring, and `status` is what decides whether a name goes
  // on the list at all; a phone that could write either could award the ring
  // for anything.
  await assertFails(
    setDoc(doc(db(owner), 'kasemNameRequests/forged'), {
      uid: LEARNER,
      name: 'Me',
      ascii: 'me',
      status: 'approved',
    }),
  );
  await assertFails(
    updateDoc(doc(db(owner), 'kasemNameRequests/req-1'), { status: 'approved' }),
  );
  await assertFails(
    updateDoc(doc(db(validator), 'kasemNameRequests/req-1'), { status: 'approved' }),
  );
});

// ── The guided word queue ───────────────────────────────────────────────────

test('an open queue word is public, a translated one is staff-only', async () => {
  const anon = env.unauthenticatedContext();
  const validator = env.authenticatedContext(VALIDATOR.sub, { role: VALIDATOR.role });

  // The size of the backlog is the honest state of the language's coverage,
  // not something to keep behind a login.
  await assertSucceeds(getDoc(doc(db(anon), 'wordQueue/the-8f7a9c')));
  // A word that has left the queue carries review state rather than public
  // information.
  await assertFails(getDoc(doc(db(anon), 'wordQueue/done-111111')));
  await assertSucceeds(getDoc(doc(db(validator), 'wordQueue/done-111111')));
});

test('nobody writes the queue from a client, not even staff', async () => {
  const learner = env.authenticatedContext(LEARNER);
  const admin = env.authenticatedContext(ADMIN.sub, { role: ADMIN.role });

  // `status` and the counters ARE the integrity of the queue: a phone that
  // could set `status: 'translated'` could retire a word it never answered,
  // and one that could move `approvedCount` could empty the backlog.
  await assertFails(
    updateDoc(doc(db(learner), 'wordQueue/the-8f7a9c'), { status: 'translated' }),
  );
  await assertFails(
    updateDoc(doc(db(learner), 'wordQueue/the-8f7a9c'), { approvedCount: 99 }),
  );
  await assertFails(
    setDoc(doc(db(admin), 'wordQueue/invented'), { word: 'x', status: 'open' }),
  );
});

test('a member reads their own queue progress and nobody else writes it', async () => {
  const owner = env.authenticatedContext(LEARNER);
  const other = env.authenticatedContext(OTHER);

  await assertSucceeds(getDoc(doc(db(owner), `wordQueueProgress/${LEARNER}`)));
  // Writing somebody else's would silently re-offer words they had already
  // dealt with — exactly what the list exists to prevent.
  await assertFails(getDoc(doc(db(other), `wordQueueProgress/${LEARNER}`)));
  await assertFails(
    updateDoc(doc(db(owner), `wordQueueProgress/${LEARNER}`), { skipped: [] }),
  );
  await assertFails(
    setDoc(doc(db(other), `wordQueueProgress/${OTHER}`), { uid: OTHER, answered: [] }),
  );
});

// ── The contributors board ──────────────────────────────────────────────────

test('the board is public to read and writable by nobody at all', async () => {
  const anon = env.unauthenticatedContext();
  const owner = env.authenticatedContext(LEARNER);
  const admin = env.authenticatedContext(ADMIN.sub, { role: ADMIN.role });

  // A board is worth reading, so it is readable; the identity on the row is a
  // copy of an already-public community profile.
  await assertSucceeds(getDoc(doc(db(anon), `contributorScores/${LEARNER}`)));

  // The whole reason this collection exists rather than a field on the
  // owner-writable learnProgress document. If its owner can write it, it is
  // not a ranking — it is a text box with a trophy next to it.
  await assertFails(
    updateDoc(doc(db(owner), `contributorScores/${LEARNER}`), { points: 999999 }),
  );
  await assertFails(
    setDoc(doc(db(owner), `contributorScores/${LEARNER}`), { uid: LEARNER, points: 999999 }),
  );
  await assertFails(
    setDoc(doc(db(admin), `contributorScores/${OTHER}`), { uid: OTHER, points: 1 }),
  );
});

test('the award ledger is staff-readable and never client-written', async () => {
  const owner = env.authenticatedContext(LEARNER);
  const validator = env.authenticatedContext(VALIDATOR.sub, { role: VALIDATOR.role });

  // 'Why do I have 340 points' is a question support gets asked.
  await assertSucceeds(getDoc(doc(db(validator), 'contributorPointAwards/contrib-1')));
  await assertFails(getDoc(doc(db(owner), 'contributorPointAwards/contrib-1')));
  // Forging a receipt would let one approval pay twice, undetectably.
  await assertFails(
    setDoc(doc(db(owner), 'contributorPointAwards/forged'), { uid: LEARNER, points: 500 }),
  );
});

// ── Orders ──────────────────────────────────────────────────────────────────

test('a member may ask to buy, and read only their own request', async () => {
  const buyer = env.authenticatedContext(LEARNER);
  const other = env.authenticatedContext(OTHER);
  const staff = env.authenticatedContext(VALIDATOR.sub, { role: VALIDATOR.role });

  await assertSucceeds(setDoc(doc(db(buyer), 'shopOrders/order-2'), makeOrder(LEARNER)));
  await assertSucceeds(getDoc(doc(db(buyer), 'shopOrders/order-1')));
  await assertFails(getDoc(doc(db(other), 'shopOrders/order-1')));
  await assertSucceeds(getDoc(doc(db(staff), 'shopOrders/order-1')));
});

test('an order arrives as a request and only staff can move it on', async () => {
  const buyer = env.authenticatedContext(LEARNER);
  const staff = env.authenticatedContext(VALIDATOR.sub, { role: VALIDATOR.role });

  // Nobody gets to mark their own order fulfilled.
  await assertFails(
    setDoc(doc(db(buyer), 'shopOrders/order-3'), makeOrder(LEARNER, { status: 'fulfilled' })),
  );
  await assertFails(updateDoc(doc(db(buyer), 'shopOrders/order-1'), { status: 'fulfilled' }));
  await assertSucceeds(updateDoc(doc(db(staff), 'shopOrders/order-1'), { status: 'contacted' }));
});

test('an order needs a way to reach the person who placed it', async () => {
  const buyer = env.authenticatedContext(LEARNER);
  await assertFails(
    setDoc(doc(db(buyer), 'shopOrders/order-4'), makeOrder(LEARNER, { contact: '' })),
  );
  await assertFails(
    setDoc(doc(db(buyer), 'shopOrders/order-5'), makeOrder(LEARNER, { items: [] })),
  );
});
