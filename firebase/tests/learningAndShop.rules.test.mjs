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
