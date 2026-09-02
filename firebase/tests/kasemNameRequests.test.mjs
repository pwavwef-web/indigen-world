// Pure unit tests for asking that a Kassena name be added — no emulator, no
// network.
//
//   npm run build:functions && node --test firebase/tests/kasemNameRequests.test.mjs
//
// Three things in this feature fail silently, and all three are here.
//
// The fold is the first. `Awɛlɩmwɛ` is a name and `awelimwe` is what a handle
// can hold, and the client draws the second while the server decides on it. If
// the two tables ever disagree, a member takes a name and then does not get the
// ring for it, and nothing anywhere says why. The table below is pinned in the
// same words in apps/mobile/test/features/community/kasem_name_test.dart.
//
// The second is validation. A name folding to two letters, or a handle built on
// a different name than the one being asked for, reaches a reviewer as work
// with no possible useful outcome — approved, and then unclaimable.
//
// The third is which channels an answer goes out on. `onNotificationCreated`
// sends an SMS when the channels ask for one *or* when priority is 'high', so a
// rejection marked high would text somebody their bad news at whatever hour it
// was decided. That costs the project money and costs the member their evening.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { carriesKasemName, foldKasemToAscii } from '../../services/functions/lib/kasem-handle.js';
import {
  KASEM_NAME_KINDS,
  kasemNameSlug,
  nameDecisionNotification,
  parseKasemNameRequestInput,
  ringGranted,
} from '../../services/functions/lib/kasem-name-requests.js';

// ── The fold, which both sides have to agree on ─────────────────────────────

test('the six letters a keyboard cannot type fold to ones it can', () => {
  // ŋ becomes `ng` because that is how the sound is written when the letter is
  // unavailable; the rest fall back to their bare vowel.
  assert.equal(foldKasemToAscii('Awɛlɩmwɛ'), 'awelimwe');
  assert.equal(foldKasemToAscii('Bɔŋɔ'), 'bongo');
  assert.equal(foldKasemToAscii('Kʋra'), 'kvra');
  assert.equal(foldKasemToAscii('Nyaaba'), 'nyaaba');
});

test('tone is dropped however it was written', () => {
  // A precomposed vowel, and the same word as a bare vowel plus a combining
  // acute — which is what the composer's tone keys produce. Both have to reach
  // the same handle or `Bá` becomes `b`.
  assert.equal(foldKasemToAscii('Bá'), 'ba');
  assert.equal(foldKasemToAscii('Bá'), 'ba');
});

test('nothing a handle cannot hold survives the fold', () => {
  assert.equal(foldKasemToAscii('A-wine!'), 'awine');
  assert.equal(foldKasemToAscii('  Paga  '), 'paga');
});

// ── What a request has to be before a reviewer sees it ──────────────────────

function request(overrides = {}) {
  return {
    name: 'Awɛlɩmwɛ',
    meaning: 'Given after a long wait',
    kind: 'given',
    note: 'My grandmother in Chiana bears this name.',
    ...overrides,
  };
}

test('the ascii is derived, never taken from the client', () => {
  // The whole security property of the collection. A request that could name
  // its own fold could award the ring for anything: "John" filed as "nyaaba".
  const parsed = parseKasemNameRequestInput(request({ ascii: 'nyaaba' }));
  assert.equal(parsed.ascii, 'awelimwe');
  assert.equal(parsed.name, 'Awɛlɩmwɛ');
});

test('a name that folds to fewer than three letters is refused', () => {
  // Not a formality: a handle needs three characters, so approving this would
  // publish a name nobody could ever take.
  assert.throws(() => parseKasemNameRequestInput(request({ name: 'Bá' })), /at least three/);
  assert.throws(() => parseKasemNameRequestInput(request({ name: '' })), /properly spelled/);
});

test('a request with nothing written on it is refused', () => {
  // A reviewer cannot tell whether a string is a real Kassena name by looking
  // at it, so a request with no case for it is unanswerable rather than hard.
  assert.throws(() => parseKasemNameRequestInput(request({ note: 'yes' })), /who bears this name/);
});

test('kind is one of three, and anything else means given', () => {
  assert.deepEqual([...KASEM_NAME_KINDS], ['given', 'clan', 'place']);
  assert.equal(parseKasemNameRequestInput(request({ kind: 'clan' })).kind, 'clan');
  assert.equal(parseKasemNameRequestInput(request({ kind: 'place' })).kind, 'place');
  assert.equal(parseKasemNameRequestInput(request({ kind: 'nickname' })).kind, 'given');
  assert.equal(parseKasemNameRequestInput(request({ kind: 42 })).kind, 'given');
});

test('a handle is optional, and normalised when it is there', () => {
  assert.equal(parseKasemNameRequestInput(request()).handle, '');
  assert.equal(
    parseKasemNameRequestInput(request({ handle: '@Awelimwe' })).handle,
    'awelimwe',
  );
});

test('a handle that is not shaped like a handle is refused', () => {
  assert.throws(
    () => parseKasemNameRequestInput(request({ handle: '7awelimwe' })),
    /3 to 20 characters/,
  );
  assert.throws(
    () => parseKasemNameRequestInput(request({ handle: 'aw' })),
    /3 to 20 characters/,
  );
});

test('a handle the platform speaks under is refused', () => {
  assert.throws(
    () => parseKasemNameRequestInput(request({ name: 'Kawuri', handle: 'kawuri' })),
    /reserved/,
  );
});

test('a handle that carries a different name than the one asked for is refused', () => {
  // Otherwise approving publishes one name and hands out a handle built on
  // another, and the ring is awarded for neither.
  assert.throws(
    () => parseKasemNameRequestInput(request({ handle: 'john_smith' })),
    /does not carry/,
  );
});

test('a handle built around the name is accepted', () => {
  // Somebody is not punished for adding a village or a number to a name — the
  // same rule the ring itself is awarded by.
  for (const handle of ['awelimwe', 'awelimwe_paga', 'awelimwe7']) {
    assert.equal(parseKasemNameRequestInput(request({ handle })).handle, handle);
    assert.equal(carriesKasemName(handle, new Set(['awelimwe'])), true);
  }
});

test('a published name takes its own fold as its document id', () => {
  // The same id `saveKasemName` writes from the admin console, so a name
  // approved from a phone is a name the console can edit afterwards.
  assert.equal(kasemNameSlug('awelimwe'), 'awelimwe');
});

// ── What the member is told, and on which channels ──────────────────────────

test('a handle handed over is worth an SMS', () => {
  const notice = nameDecisionNotification({
    decision: 'approve',
    name: 'Nyaaba',
    handle: 'nyaaba',
    handleOutcome: 'applied',
    note: '',
  });
  assert.equal(notice.title, 'Your username has been approved');
  assert.equal(notice.body, '@nyaaba is yours. Your picture now wears the kente ring.');
  assert.deepEqual([...notice.channels], ['in_app', 'push', 'sms']);
  assert.equal(notice.priority, 'high');
});

test('a member who was already called that gets the same news', () => {
  // Their handle did not move; the name being published is what puts the ring
  // on their picture, which is the thing they asked for.
  assert.equal(ringGranted('already-yours'), true);
  assert.equal(ringGranted('applied'), true);
  assert.equal(ringGranted('taken'), false);
  assert.equal(ringGranted('not-requested'), false);

  const notice = nameDecisionNotification({
    decision: 'approve',
    name: 'Nyaaba',
    handle: 'nyaaba',
    handleOutcome: 'already-yours',
    note: '',
  });
  assert.match(notice.body, /kente ring/);
});

test('a name published with no handle asked for says so and stands alone', () => {
  const notice = nameDecisionNotification({
    decision: 'approve',
    name: 'Awɛlɩmwɛ',
    handle: '',
    handleOutcome: 'not-requested',
    note: '',
  });
  // The body has to make sense as an SMS: no app around it, no title bar and
  // nothing to tap, so the name itself has to be in the sentence.
  assert.equal(notice.body, 'The name Awɛlɩmwɛ is now on the list. You can take it in the app.');
  assert.deepEqual([...notice.channels], ['in_app', 'push', 'sms']);
  assert.equal(notice.priority, 'high');
});

test('a handle that could not be applied is explained, not hidden', () => {
  const spent = nameDecisionNotification({
    decision: 'approve',
    name: 'Awɛlɩmwɛ',
    handle: 'awelimwe',
    handleOutcome: 'already-changed',
    note: '',
  });
  assert.match(spent.body, /now on the list/);
  assert.match(spent.body, /one name change/);
  assert.equal(spent.title, 'Your Kassena name was added');

  const taken = nameDecisionNotification({
    decision: 'approve',
    name: 'Awɛlɩmwɛ',
    handle: 'awelimwe',
    handleOutcome: 'taken',
    note: '',
  });
  assert.match(taken.body, /has since been taken/);

  const noProfile = nameDecisionNotification({
    decision: 'approve',
    name: 'Awɛlɩmwɛ',
    handle: 'awelimwe',
    handleOutcome: 'no-profile',
    note: '',
  });
  assert.match(noProfile.body, /community profile/);
});

test('a rejection is never an SMS, and is never high priority', () => {
  // `onNotificationCreated` sends an SMS when the channels ask for one OR when
  // priority is 'high'. Both have to be right, or a "no" texts somebody at
  // eleven at night and the project pays Arkesel for the privilege.
  const notice = nameDecisionNotification({
    decision: 'reject',
    name: 'Awɛlɩmwɛ',
    handle: 'awelimwe',
    handleOutcome: 'not-requested',
    note: 'This is a place in Burkina Faso rather than a name.',
  });
  assert.deepEqual([...notice.channels], ['in_app', 'push']);
  assert.equal(notice.channels.includes('sms'), false);
  assert.equal(notice.priority, 'normal');
  // The reviewer's own words, because a member who cannot read the reason
  // cannot ask again with a better note.
  assert.match(notice.body, /This is a place in Burkina Faso rather than a name\./);
  assert.match(notice.body, /Awɛlɩmwɛ has not been added/);
});
