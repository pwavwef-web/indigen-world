// Pure unit tests for the arithmetic behind contribution points — no emulator,
// no network.
//
//   npm run build:functions && node --test firebase/tests/contributorScores.test.mjs
//
// Every judgement in contributor-scores.ts is wrong in a way that is invisible
// from the outside. A points table that pays the floor for a kind we do in fact
// recognise looks like a member being cheap with their effort. A streak that
// resets across a day boundary looks like the member forgetting to contribute.
// A "who did I pass" window that is inclusive at the edges tells somebody they
// were overtaken by a person they are level with. A reminder predicate that
// reads "not today" instead of "yesterday" nags people whose streak ended a
// fortnight ago. And an award that is not idempotent doubles a total that has
// no receipt of its own. So each of those is a pure function, and this is where
// they are pinned down.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  EMPTY_SCORE,
  buildAward,
  contributionDay,
  contributorPreferenceKeys,
  dayOf,
  isNewlyApproved,
  isWordContribution,
  leaderboardNotificationId,
  membersPassed,
  nextScore,
  nextStreak,
  pointsForContribution,
  rankedScoreFrom,
  readScoreState,
  shiftDay,
  shouldRemindStreak,
  streakReminderNotificationId,
  wantsContributorNotification,
} from '../../services/functions/lib/contributor-scores.js';

// ---------------------------------------------------------------------------
// The points table
// ---------------------------------------------------------------------------

test('the scale is the one sentence the notification has to be able to justify', () => {
  // A word 10, a written piece 25, a recording 50. Nothing fractional, nothing
  // that compounds, nothing that depends on what anybody else did.
  assert.equal(pointsForContribution('dictionary'), 10);
  assert.equal(pointsForContribution('literature'), 25);
  assert.equal(pointsForContribution('music'), 50);
  assert.equal(pointsForContribution('audiobooks'), 50);
  assert.equal(pointsForContribution('video'), 50);
});

test('an idiom or a proverb is paid as the written work it is', () => {
  // canonicalCollectionKind already knows a proverb is Literature; a second
  // table of aliases in the points file would drift from it and the symptom
  // would be a member paid 10 for a sitting's work.
  assert.equal(pointsForContribution('proverb'), 25);
  assert.equal(pointsForContribution('folklore'), 25);
  assert.equal(pointsForContribution('oral-history'), 25);
  assert.equal(pointsForContribution('song'), 50);
  assert.equal(pointsForContribution('oral-reading'), 50);
  assert.equal(pointsForContribution('word-entry'), 10);
});

test('an unrecognised kind is paid the floor, never nothing', () => {
  // A kind this table has not heard of is our bug, and the member who did the
  // work should not be the one who absorbs it.
  for (const kind of ['sculpture', '', null, undefined, 42, {}]) {
    assert.equal(pointsForContribution(kind), 10);
  }
});

test('only a dictionary word counts against the word tally', () => {
  assert.equal(isWordContribution('dictionary'), true);
  assert.equal(isWordContribution('vocabulary'), true);
  assert.equal(isWordContribution('literature'), false);
  assert.equal(isWordContribution('music'), false);
  assert.equal(isWordContribution(null), false);
});

// ---------------------------------------------------------------------------
// The approval transition
// ---------------------------------------------------------------------------

test('points are paid on the transition into acceptance, not on being accepted', () => {
  assert.equal(isNewlyApproved('submitted', 'approved'), true);
  assert.equal(isNewlyApproved(undefined, 'approved'), true);
  // Publishing follows approving. The marker would stop the second payment
  // anyway; this stops it a transaction earlier and for free.
  assert.equal(isNewlyApproved('approved', 'published'), false);
  assert.equal(isNewlyApproved('approved', 'approved'), false);
  assert.equal(isNewlyApproved('published', 'published'), false);
});

test('nothing else pays', () => {
  assert.equal(isNewlyApproved('submitted', 'rejected'), false);
  assert.equal(isNewlyApproved('submitted', 'withdrawn'), false);
  assert.equal(isNewlyApproved('approved', 'withdrawn'), false);
  assert.equal(isNewlyApproved('submitted', 'needs_revision'), false);
  assert.equal(isNewlyApproved(null, null), false);
});

test('a status is read case-insensitively, because two writers spell it two ways', () => {
  // decideSubmission lowercases the submission status onto the contribution;
  // the submission itself carries APPROVED. A future writer doing either must
  // not silently stop paying anybody.
  assert.equal(isNewlyApproved('SUBMITTED', 'APPROVED'), true);
  assert.equal(isNewlyApproved('APPROVED', 'PUBLISHED'), false);
});

// ---------------------------------------------------------------------------
// Days
// ---------------------------------------------------------------------------

test('a day is a UTC calendar day', () => {
  assert.equal(contributionDay(new Date('2026-09-01T23:59:59.999Z')), '2026-09-01');
  assert.equal(contributionDay(new Date('2026-09-02T00:00:00.000Z')), '2026-09-02');
});

test('day arithmetic crosses months, years and leap days', () => {
  assert.equal(shiftDay('2026-09-01', 1), '2026-09-02');
  assert.equal(shiftDay('2026-09-30', 1), '2026-10-01');
  assert.equal(shiftDay('2026-12-31', 1), '2027-01-01');
  assert.equal(shiftDay('2027-01-01', -1), '2026-12-31');
  assert.equal(shiftDay('2028-02-28', 1), '2028-02-29');
  assert.equal(shiftDay('2028-03-01', -1), '2028-02-29');
});

test('a stamp that is not a day says so instead of guessing', () => {
  // "I cannot tell" has to be distinguishable from "yesterday", or a corrupt
  // stamp reads as a broken streak and silently resets somebody's count.
  for (const bad of ['', 'yesterday', '2026-9-1', '2026-09-01T00:00:00Z', null, 17]) {
    assert.equal(shiftDay(bad, 1), null);
  }
});

test('a createdAt is read from every shape it actually arrives in', () => {
  assert.equal(dayOf(new Date('2026-09-01T10:00:00Z')), '2026-09-01');
  // The Firestore Timestamp the contribution really holds.
  assert.equal(dayOf({ toDate: () => new Date('2026-09-01T10:00:00Z') }), '2026-09-01');
  // The ISO string the submission's lifecycle uses.
  assert.equal(dayOf('2026-09-01T10:00:00.000Z'), '2026-09-01');
  assert.equal(dayOf('2026-09-01'), '2026-09-01');
  assert.equal(dayOf(null), null);
  assert.equal(dayOf('not a date'), null);
  assert.equal(dayOf(new Date('nonsense')), null);
});

// ---------------------------------------------------------------------------
// Streaks
// ---------------------------------------------------------------------------

test('a first contribution starts a streak of one', () => {
  assert.deepEqual(
    nextStreak({ streakDays: 0, lastContributionDay: null }, '2026-09-01'),
    { streakDays: 1, lastContributionDay: '2026-09-01' },
  );
});

test('a streak continues across a day boundary, not on a 24-hour timer', () => {
  // The rule LearnProgress.isSameDay already sets on the device: somebody who
  // contributes at 11pm and again after breakfast has contributed on two days.
  assert.deepEqual(
    nextStreak({ streakDays: 3, lastContributionDay: '2026-09-01' }, '2026-09-02'),
    { streakDays: 4, lastContributionDay: '2026-09-02' },
  );
  // Across a month end and a year end too, because the arithmetic is the day
  // string's, not a subtraction of two timestamps.
  assert.deepEqual(
    nextStreak({ streakDays: 9, lastContributionDay: '2026-12-31' }, '2027-01-01'),
    { streakDays: 10, lastContributionDay: '2027-01-01' },
  );
});

test('a second contribution on one day is not a second day', () => {
  assert.deepEqual(
    nextStreak({ streakDays: 4, lastContributionDay: '2026-09-02' }, '2026-09-02'),
    { streakDays: 4, lastContributionDay: '2026-09-02' },
  );
});

test('a gap resets the streak to the day that broke it', () => {
  assert.deepEqual(
    nextStreak({ streakDays: 12, lastContributionDay: '2026-09-01' }, '2026-09-03'),
    { streakDays: 1, lastContributionDay: '2026-09-03' },
  );
  assert.deepEqual(
    nextStreak({ streakDays: 12, lastContributionDay: '2026-08-01' }, '2026-09-03'),
    { streakDays: 1, lastContributionDay: '2026-09-03' },
  );
});

test('older work approved late pays its points and leaves the streak alone', () => {
  // Reviews do not arrive in submission order. Writing the older day back would
  // move lastContributionDay backwards, and the next approval would then read
  // as a gap and reset a streak the member never broke.
  assert.deepEqual(
    nextStreak({ streakDays: 5, lastContributionDay: '2026-09-05' }, '2026-09-01'),
    { streakDays: 5, lastContributionDay: '2026-09-05' },
  );
});

test('a row with a stamp but no count still reads as a live streak of one', () => {
  // Not reachable from this file's own writes; it is what a hand-repaired or
  // half-migrated row would look like, and it must not make the next
  // consecutive day count as zero.
  assert.deepEqual(
    nextStreak({ streakDays: 0, lastContributionDay: '2026-09-01' }, '2026-09-02'),
    { streakDays: 2, lastContributionDay: '2026-09-02' },
  );
});

// ---------------------------------------------------------------------------
// The whole row
// ---------------------------------------------------------------------------

test('a first award builds the row from nothing', () => {
  const award = buildAward('dictionary', '2026-09-01');
  assert.deepEqual(nextScore(EMPTY_SCORE, award), {
    points: 10,
    approvedCount: 1,
    wordCount: 1,
    otherCount: 0,
    streakDays: 1,
    lastContributionDay: '2026-09-01',
    lastReminderDay: null,
  });
});

test('words and everything else are tallied apart', () => {
  const day = '2026-09-01';
  const afterWord = nextScore(EMPTY_SCORE, buildAward('dictionary', day));
  const afterSong = nextScore(afterWord, buildAward('music', day));
  const afterProverb = nextScore(afterSong, buildAward('proverb', day));
  assert.equal(afterProverb.points, 85);
  assert.equal(afterProverb.approvedCount, 3);
  assert.equal(afterProverb.wordCount, 1);
  assert.equal(afterProverb.otherCount, 2);
  // Three contributions on one day is one day of streak.
  assert.equal(afterProverb.streakDays, 1);
});

test('an award never clears the reminder stamp', () => {
  // If it did, a member who contributed after the evening sweep could be nudged
  // a second time that night.
  const previous = { ...EMPTY_SCORE, lastReminderDay: '2026-09-01' };
  assert.equal(nextScore(previous, buildAward('music', '2026-09-01')).lastReminderDay, '2026-09-01');
});

test('a stored row is read defensively, because nothing else may write it', () => {
  assert.deepEqual(readScoreState(undefined), EMPTY_SCORE);
  assert.deepEqual(readScoreState(null), EMPTY_SCORE);
  assert.deepEqual(readScoreState([1, 2, 3]), EMPTY_SCORE);
  assert.deepEqual(
    readScoreState({ points: -5, approvedCount: 2.7, streakDays: 'four', lastContributionDay: 'soon' }),
    { ...EMPTY_SCORE, approvedCount: 2 },
  );
  assert.deepEqual(
    readScoreState({
      points: 85,
      approvedCount: 3,
      wordCount: 1,
      otherCount: 2,
      streakDays: 4,
      lastContributionDay: '2026-09-01',
      lastReminderDay: '2026-09-02',
    }),
    {
      points: 85,
      approvedCount: 3,
      wordCount: 1,
      otherCount: 2,
      streakDays: 4,
      lastContributionDay: '2026-09-01',
      lastReminderDay: '2026-09-02',
    },
  );
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

test('a redelivered award changes nothing, because the ids are derived', () => {
  // The transaction refuses on contributorPointAwards/{contributionId}; these
  // are the two derived ids that make the *alerts* idempotent as well, which
  // matters more, because a duplicate alert is one the member actually sees.
  assert.equal(
    leaderboardNotificationId('contribution-1', 'passed-1'),
    leaderboardNotificationId('contribution-1', 'passed-1'),
  );
  assert.notEqual(
    leaderboardNotificationId('contribution-1', 'passed-1'),
    leaderboardNotificationId('contribution-2', 'passed-1'),
  );
  assert.notEqual(
    leaderboardNotificationId('contribution-1', 'passed-1'),
    leaderboardNotificationId('contribution-1', 'passed-2'),
  );
  assert.equal(
    streakReminderNotificationId('member-1', '2026-09-02'),
    streakReminderNotificationId('member-1', '2026-09-02'),
  );
  assert.notEqual(
    streakReminderNotificationId('member-1', '2026-09-02'),
    streakReminderNotificationId('member-1', '2026-09-03'),
  );
});

test('applying one award twice is exactly twice, so the marker is the only guard', () => {
  // Stated rather than assumed: nextScore is deliberately not idempotent — it
  // adds. Every protection against a doubled total lives in the transaction's
  // award marker, and this is the test that says so out loud.
  const award = buildAward('music', '2026-09-01');
  const once = nextScore(EMPTY_SCORE, award);
  const twice = nextScore(once, award);
  assert.equal(once.points, 50);
  assert.equal(twice.points, 100);
  assert.equal(twice.approvedCount, 2);
});

// ---------------------------------------------------------------------------
// Who did I pass
// ---------------------------------------------------------------------------

const board = [
  { uid: 'ama', points: 300, displayName: 'Ama' },
  { uid: 'kofi', points: 120, displayName: 'Kofi' },
  { uid: 'yaa', points: 110, displayName: 'Yaa' },
  { uid: 'kwesi', points: 100, displayName: 'Kwesi' },
  { uid: 'me', points: 130, displayName: 'Me' },
  { uid: 'abena', points: 40, displayName: 'Abena' },
];

test('the people passed are the ones who were above and are now below', () => {
  const passed = membersPassed({
    uid: 'me',
    previousPoints: 80,
    points: 130,
    ranked: board,
  });
  // Nearest first: Kofi at 120, then Yaa at 110, then Kwesi at 100. Ama at 300
  // was never passed and Abena at 40 was never ahead.
  assert.deepEqual(passed.map((row) => row.uid), ['kofi', 'yaa', 'kwesi']);
});

test('a tie in either direction is not a pass', () => {
  // Sharing a total with somebody is not beating them, and saying otherwise is
  // the kind of small dishonesty that makes people stop reading alerts.
  const passed = membersPassed({
    uid: 'me',
    previousPoints: 100,
    points: 120,
    ranked: board,
  });
  assert.deepEqual(passed.map((row) => row.uid), ['yaa']);
});

test('at most three people hear about one contribution', () => {
  const crowd = Array.from({ length: 20 }, (_, index) => ({
    uid: `member-${index}`,
    points: 100 + index,
    displayName: `Member ${index}`,
  }));
  const passed = membersPassed({
    uid: 'me',
    previousPoints: 90,
    points: 500,
    ranked: crowd,
  });
  assert.equal(passed.length, 3);
  // The three nearest below, not three at random.
  assert.deepEqual(passed.map((row) => row.points), [119, 118, 117]);
});

test('the member never passes themselves, and a flat award passes nobody', () => {
  assert.deepEqual(
    membersPassed({ uid: 'me', previousPoints: 120, points: 130, ranked: board }),
    [],
  );
  assert.deepEqual(
    membersPassed({ uid: 'me', previousPoints: 130, points: 130, ranked: board }),
    [],
  );
});

test('being passed outside the top of the board is not news', () => {
  // The window IS the top of the board — the caller hands over the top rows and
  // nothing else — so somebody at rank 400 is excluded by construction rather
  // than by three extra rank queries per contribution.
  const topOfBoard = board.filter((row) => row.points >= 100);
  const passed = membersPassed({
    uid: 'me',
    previousPoints: 30,
    points: 130,
    ranked: topOfBoard,
  });
  assert.equal(passed.some((row) => row.uid === 'abena'), false);
});

test('the window does not trust the caller to have sorted it', () => {
  const shuffled = [...board].sort((a, b) => a.points - b.points);
  const passed = membersPassed({
    uid: 'me',
    previousPoints: 80,
    points: 130,
    ranked: shuffled,
  });
  assert.deepEqual(passed.map((row) => row.uid), ['kofi', 'yaa', 'kwesi']);
});

test('a board row with no name still renders as somebody', () => {
  assert.deepEqual(
    rankedScoreFrom('uid-1', { points: 40, displayName: '  ' }),
    { uid: 'uid-1', points: 40, displayName: 'A member' },
  );
  assert.deepEqual(
    rankedScoreFrom('uid-1', undefined),
    { uid: 'uid-1', points: 0, displayName: 'A member' },
  );
});

// ---------------------------------------------------------------------------
// Streak reminders
// ---------------------------------------------------------------------------

const today = '2026-09-02';

function candidate(overrides = {}) {
  return {
    streakDays: 4,
    lastContributionDay: '2026-09-01',
    lastReminderDay: null,
    ...overrides,
  };
}

test('the nudge goes to a streak that is alive and breaks tonight', () => {
  assert.equal(shouldRemindStreak(candidate(), today), true);
});

test('nobody is nagged on day one', () => {
  assert.equal(shouldRemindStreak(candidate({ streakDays: 1 }), today), false);
  assert.equal(shouldRemindStreak(candidate({ streakDays: 0 }), today), false);
  assert.equal(shouldRemindStreak(candidate({ streakDays: 2 }), today), true);
});

test('somebody who has already contributed today is left alone', () => {
  assert.equal(
    shouldRemindStreak(candidate({ lastContributionDay: today }), today),
    false,
  );
});

test('a streak that is already over is not resurrected by a reminder', () => {
  // "Not today" would nag somebody whose last contribution was a fortnight ago
  // about keeping alive a thing that ended, which reads as a machine that has
  // not been paying attention.
  assert.equal(
    shouldRemindStreak(candidate({ lastContributionDay: '2026-08-20' }), today),
    false,
  );
  assert.equal(
    shouldRemindStreak(candidate({ lastContributionDay: null }), today),
    false,
  );
});

test('one nudge per person per day, whatever the sweep does', () => {
  assert.equal(
    shouldRemindStreak(candidate({ lastReminderDay: today }), today),
    false,
  );
  // Yesterday's stamp does not block today's nudge.
  assert.equal(
    shouldRemindStreak(candidate({ lastReminderDay: '2026-09-01' }), today),
    true,
  );
});

test('a today that is not a day nudges nobody rather than everybody', () => {
  assert.equal(shouldRemindStreak(candidate(), 'today'), false);
});

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

test('a member who has never seen these switches still hears both alerts', () => {
  // Every account on the platform predates these keys. Reading absence as "off"
  // would ship a feature that is silent for everybody who already has an account.
  for (const key of contributorPreferenceKeys) {
    assert.equal(wantsContributorNotification(undefined, key), true);
    assert.equal(wantsContributorNotification(null, key), true);
    assert.equal(wantsContributorNotification({}, key), true);
    assert.equal(wantsContributorNotification({ likes: false }, key), true);
  }
});

test('only an explicit false switches one off, and it switches only that one off', () => {
  assert.equal(wantsContributorNotification({ leaderboard: false }, 'leaderboard'), false);
  assert.equal(wantsContributorNotification({ leaderboard: false }, 'streakReminders'), true);
  assert.equal(wantsContributorNotification({ streakReminders: false }, 'streakReminders'), false);
  // A half-written map must not be able to mute somebody by accident.
  assert.equal(wantsContributorNotification({ leaderboard: 'no' }, 'leaderboard'), true);
  assert.equal(wantsContributorNotification({ leaderboard: 0 }, 'leaderboard'), true);
  assert.equal(wantsContributorNotification({ leaderboard: null }, 'leaderboard'), true);
});
