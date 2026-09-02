import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import {
  type CommunityNotificationType,
  type NotificationPreference,
  actorFrom,
  recipientsWanting,
  wantsNotification,
  writeCommunityNotification,
  writeCommunityNotifications,
} from './community-notifications.js';
import { type CollectionKind, canonicalCollectionKind } from './publication.js';

/**
 * Contribution points, the contributors board, and the two alerts that make
 * either of them worth having.
 *
 * ── The one decision this whole file exists to protect ────────────────────
 * `learnProgress/{uid}` is owner-writable. Read the rule: a member may create
 * and update their own row, `xp` and `streakDays` included. That is deliberate
 * and it is right — learning works signed out, the lesson is finished on the
 * device before there is any network, and `LearnProgress.merge` reconciles a
 * phone against the server by taking the more generous of the two copies,
 * because a unit somebody really finished must never be lost to a stale
 * write. Every one of those properties depends on the owner being allowed to
 * write the number.
 *
 * And every one of them makes that number useless for a ranking. A leaderboard
 * built on a field its owner can set is not a leaderboard; it is a text box
 * with a trophy next to it. The first person to open the app's own Firestore
 * traffic would be on top of it that afternoon, and the honest contributors
 * underneath would be the ones who noticed.
 *
 * So the two numbers live apart:
 *
 *   learnProgress/{uid}       XP from lessons. Owner-writable, device-first,
 *                             generous on merge. Yours, and only about you.
 *   contributorScores/{uid}   Points from work the community accepted. Public
 *                             to read — it is a leaderboard — and written by
 *                             nothing but this backend, off the back of a
 *                             review decision no client can forge.
 *
 * The Learn tab is welcome to draw both totals side by side; that is what was
 * asked for and it reads well. What it must not do is add them into one number
 * or store them in one document, because exactly one of the two can be trusted
 * and a merged total inherits the weaker half. The alternative considered and
 * rejected was a single `learnProgress.contributionPoints` field written only
 * by the backend: rules cannot express "this field is server-only while its
 * neighbours are owner-writable" without splitting the document anyway, and the
 * first client that wrote the whole map back — which is precisely what
 * `LearnProgress.toFirestore` does — would have overwritten it.
 *
 * ── What a member's row holds ─────────────────────────────────────────────
 *
 *   uid                  the member
 *   points               the running total
 *   approvedCount        contributions accepted, all kinds
 *   wordCount            of those, dictionary words
 *   otherCount           of those, everything else
 *   streakDays           consecutive days they contributed accepted work
 *   lastContributionDay  'YYYY-MM-DD', the day the newest one was submitted
 *   lastReminderDay      'YYYY-MM-DD', the last day the streak sweep nudged
 *   displayName          denormalised identity, so the board is ONE query
 *   username
 *   avatarUrl
 *   updatedAt
 *
 * Denormalising the name and face is what keeps the board a single ordered
 * read instead of fifty profile lookups behind it. The price is staleness, and
 * it is paid honestly: the stamp is refreshed from `communityProfiles`
 * every time this file touches the row, so a member who changes their name or
 * picture appears under the new one from their next accepted contribution
 * onward. Until then the board shows who they were, which is a good deal
 * cheaper than being wrong about fifty people to be current about one.
 */

const REGION = 'us-central1';

/** Where a member's running total lives. Public read, backend-only write. */
const SCORES = 'contributorScores';

/**
 * The idempotency ledger: one document per contribution that has ever paid.
 *
 * Keyed by the contribution id rather than by anything derived from time or
 * from the score, so a re-delivered trigger — and Firestore triggers are
 * at-least-once, not exactly-once — lands on a document that already exists
 * and stops. Created inside the same transaction that moves the points, so
 * there is no window in which the score has been raised and the marker has
 * not.
 */
const AWARDS = 'contributorPointAwards';

/**
 * Statuses that mean the community accepted the work.
 *
 * `decideSubmission` lowercases the submission status onto the contribution,
 * so APPROVE lands as 'approved' and PUBLISH as 'published'. Publication
 * always follows approval — it refuses to run from any other status — so in
 * practice only the first of the two ever pays. Both are listed anyway,
 * because a points system that silently paid nothing if the review workflow
 * ever gained a shortcut would be discovered by a contributor, not by us.
 * Paying twice is not the risk here: the award marker is.
 */
const AWARDING_STATUSES = new Set(['approved', 'published']);

/**
 * What each kind of accepted work is worth.
 *
 * One sentence, because somebody is going to read a notification saying they
 * earned 25 points and want to know why: a word is worth 10, a written piece
 * — a proverb, an idiom, a story on the page — is worth 25, and a recording,
 * whether that is a song, a story told aloud, or a film, is worth 50.
 *
 * The scale is flat and it is meant to be. Multipliers, decay, bonus streaks
 * and "your fifth word this week counts double" all make a total that nobody
 * can check by hand, and a total nobody can check by hand is one that people
 * stop believing the first time it moves in a way they did not expect. The
 * numbers are ordered by the effort a contribution actually costs: looking up
 * one word takes minutes, writing down a proverb properly takes a sitting,
 * and recording anything takes an afternoon and a quiet room.
 */
const CONTRIBUTION_POINTS: Record<CollectionKind, number> = {
  dictionary: 10,
  literature: 25,
  music: 50,
  audiobooks: 50,
  video: 50,
};

/**
 * What an unrecognised kind pays.
 *
 * The floor rather than zero. A contribution whose kind this file does not
 * know is a new Collection destination that shipped before this table was
 * updated — a bug on our side — and the member who did the work should not be
 * the one who absorbs it. The log line is how we find out.
 */
const DEFAULT_POINTS = 10;

/** How deep the contributors board goes, for both display and "you were passed". */
const LEADERBOARD_DEPTH = 50;

/** How many people one contribution may tell that they have been overtaken. */
const MAX_PASSED_NOTICES = 3;

/**
 * The shortest streak worth defending.
 *
 * Two, not one. Nudging somebody the day after their very first contribution
 * is how a thank-you turns into a demand, and the person who has done one
 * thing has not yet formed the habit the reminder is supposed to protect.
 */
const MIN_REMINDER_STREAK = 2;

/** How many score rows the daily sweep reads before it stops looking. */
const REMINDER_SCAN_LIMIT = 500;

/**
 * How many people one sweep may nudge.
 *
 * Well past the number of live streaks this project has, so in practice it
 * never bites. It is here so that the day it would, the first symptom is the
 * log line below rather than a scheduled function timing out with half the
 * reminders sent and no record of which half.
 */
const MAX_STREAK_REMINDERS = 200;

/** Firestore's batch ceiling is 500 writes; the reminder stamps go in runs. */
const REMINDER_STAMP_CHUNK = 400;

/**
 * Where a leaderboard alert and a streak nudge send the member.
 *
 * Both point at the contribution screen, which exists today. `/learn`, where
 * the board itself is going to live, is a shell tab with no path in
 * `app_router.dart`, and a route the router cannot match lands the member on
 * go_router's error page — a worse outcome than sending them somewhere useful
 * but not exactly where they expected. One constant each, so pointing them at
 * a real leaderboard screen later is a one-line change.
 */
const LEADERBOARD_ROUTE = '/contribute';
const CONTRIBUTE_ROUTE = '/contribute';

/**
 * The notification kind these alerts are written as.
 *
 * `CommunityNotificationType` in community-notifications.ts does not list it
 * yet and that file belongs to another change, so the value is asserted here
 * rather than added there. The cast is safe in both directions that matter:
 * `onCommunityNotificationCreated` reads `data.type` off the document with
 * `String(...)` and pushes whatever it finds, and the mobile client's
 * `NotificationKind.parse` falls through to `announcement` for a value it does
 * not know — so a member on an older build gets the alert with a generic icon
 * rather than no alert at all.
 */
const LEADERBOARD_TYPE: CommunityNotificationType = 'leaderboard';

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

/**
 * The two switches these alerts answer to.
 *
 * Both are members of `notificationPreferenceKeys` in community-notifications.ts,
 * so they appear in Settings alongside likes, follows and mentions. Narrowed to
 * a two-value type here rather than accepting the whole union, because the two
 * fan-outs in this file may only ever consult their own switches — reading, say,
 * `mentions` to decide whether to send a streak nudge would be a bug no test
 * would catch.
 */
export const contributorPreferenceKeys = [
  'leaderboard',
  'streakReminders',
] as const satisfies readonly NotificationPreference[];

export type ContributorPreference = (typeof contributorPreferenceKeys)[number];

/**
 * Whether [prefs] leaves [key] switched on, for one member.
 *
 * A thin wrapper on `wantsNotification`, so the "absence means yes" rule is
 * decided in exactly one place for the whole app. Absence has to mean yes:
 * every account on the platform predates these two keys, and reading a missing
 * entry as "off" would ship a feature that is silent for everybody who already
 * has an account and loud only for people who sign up afterwards.
 *
 * Both fan-outs below reach the identical rule through `recipientsWanting`,
 * which batches the profile reads rather than paying one round trip per
 * recipient. This is the single-member spelling of it, and it is what the
 * tests pin, because a preference gate that inverted itself would be invisible
 * from the outside until somebody complained about a quiet app.
 */
export function wantsContributorNotification(
  prefs: unknown,
  key: ContributorPreference,
): boolean {
  return wantsNotification(prefs, key);
}

// ---------------------------------------------------------------------------
// Days, and why they are UTC
// ---------------------------------------------------------------------------

/**
 * Milliseconds in a day, used for day arithmetic.
 *
 * Exact, because the arithmetic below is done in UTC. In a local zone with
 * daylight saving this constant is a bug twice a year; in UTC there is no such
 * day and `Date` carries no leap seconds, so adding 86,400,000ms to midnight
 * lands on midnight.
 */
const DAY_MS = 86_400_000;

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The calendar day [date] falls on, in UTC.
 *
 * The brief offered a choice: the member's own local day as their phone
 * reports it, or UTC. This takes UTC, for two reasons that happen to point the
 * same way.
 *
 * The first is that for the people this project is built for they are the same
 * day. Ghana keeps GMT year round and has never observed daylight saving, so
 * Africa/Accra is UTC+0 in January and in July; the scheduled sweeps in ads.ts
 * and subscriptions.ts already lean on that by asking for 'Africa/Accra' and
 * getting a clock that never shifts. A member in Accra crossing midnight
 * crosses it here too.
 *
 * The second is what happens when they are not the same day. A local day
 * reported by the client is a number the client chooses, and a streak is
 * exactly the kind of thing somebody would change their phone's clock to
 * protect. Trusting it here would reintroduce, into the one collection built
 * to be untrusting, the property that made `learnProgress` unusable as a
 * ranking in the first place. The cost is real and worth naming: a contributor
 * in Toronto submits at 8pm on Tuesday and this file files it under Wednesday.
 * Their streak still works — it is consecutive days either way — it is simply
 * cut on a line drawn five hours before their own midnight.
 */
export function contributionDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * [day] moved by [delta] days, or null if [day] is not a day.
 *
 * Null rather than a thrown error or a silently wrong answer: every caller
 * here is deciding whether a streak continues, and "I cannot tell" has to be
 * distinguishable from "yesterday", or a corrupt stamp would read as a broken
 * streak and quietly reset somebody's count.
 */
export function shiftDay(day: unknown, delta: number): string | null {
  if (typeof day !== 'string' || !DAY_PATTERN.test(day)) return null;
  const midnight = Date.parse(`${day}T00:00:00.000Z`);
  if (Number.isNaN(midnight)) return null;
  return contributionDay(new Date(midnight + delta * DAY_MS));
}

/**
 * The day a stored timestamp falls on, or null.
 *
 * Accepts the three shapes a `createdAt` arrives in: a Firestore `Timestamp`
 * (what the contribution actually holds), a `Date`, and an ISO string (what
 * the submission's own `lifecycle.createdAt` uses). Written defensively rather
 * than assuming the first, because the caller falls back to "now" and a wrong
 * guess there is a streak day silently attributed to the wrong date.
 */
export function dayOf(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : contributionDay(value);
  }
  if (value && typeof value === 'object' && typeof (value as { toDate?: unknown }).toDate === 'function') {
    const date = (value as { toDate: () => Date }).toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? contributionDay(date) : null;
  }
  if (typeof value === 'string') {
    if (DAY_PATTERN.test(value)) return value;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : contributionDay(new Date(parsed));
  }
  return null;
}

// ---------------------------------------------------------------------------
// The points table
// ---------------------------------------------------------------------------

/**
 * What one accepted contribution of [kind] pays.
 *
 * Aliases are resolved through `canonicalCollectionKind` rather than matched
 * literally, because that function is already the one place in the codebase
 * that knows a 'proverb' is Literature and an 'oral-reading' is an Audiobook.
 * A second table of aliases here would drift from it, and the symptom would be
 * a member paid the fallback for a kind we do in fact recognise.
 */
export function pointsForContribution(kind: unknown): number {
  const canonical = canonicalCollectionKind(kind);
  return canonical ? CONTRIBUTION_POINTS[canonical] : DEFAULT_POINTS;
}

/** Whether [kind] is a dictionary word, which is counted separately on the row. */
export function isWordContribution(kind: unknown): boolean {
  return canonicalCollectionKind(kind) === 'dictionary';
}

/**
 * Whether this status change is the moment the work was accepted.
 *
 * Asked as a transition rather than a state so that a later edit to an already
 * approved contribution — a reviewer fixing feedback, the publish step moving
 * 'approved' to 'published' — is not a second acceptance. The award marker
 * would catch that anyway; this catches it a transaction earlier and for free.
 */
export function isNewlyApproved(before: unknown, after: unknown): boolean {
  const from = typeof before === 'string' ? before.trim().toLowerCase() : '';
  const to = typeof after === 'string' ? after.trim().toLowerCase() : '';
  return AWARDING_STATUSES.has(to) && !AWARDING_STATUSES.has(from);
}

// ---------------------------------------------------------------------------
// The score row
// ---------------------------------------------------------------------------

export interface ContributorScoreState {
  points: number;
  approvedCount: number;
  wordCount: number;
  otherCount: number;
  streakDays: number;
  lastContributionDay: string | null;
  lastReminderDay: string | null;
}

export interface ContributionAward {
  /** The canonical Collection kind, or null when it could not be resolved. */
  collectionKind: CollectionKind | null;
  points: number;
  /** The UTC day the contribution was submitted, not the day it was reviewed. */
  day: string;
  isWord: boolean;
}

/** A row with nothing in it: what a member's first accepted contribution starts from. */
export const EMPTY_SCORE: ContributorScoreState = {
  points: 0,
  approvedCount: 0,
  wordCount: 0,
  otherCount: 0,
  streakDays: 0,
  lastContributionDay: null,
  lastReminderDay: null,
};

function intOf(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

function dayStringOf(value: unknown): string | null {
  return typeof value === 'string' && DAY_PATTERN.test(value) ? value : null;
}

/** Reads a stored row into the shape the pure arithmetic below works on. */
export function readScoreState(data: unknown): ContributorScoreState {
  const record = data && typeof data === 'object' && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {};
  return {
    points: intOf(record.points),
    approvedCount: intOf(record.approvedCount),
    wordCount: intOf(record.wordCount),
    otherCount: intOf(record.otherCount),
    streakDays: intOf(record.streakDays),
    lastContributionDay: dayStringOf(record.lastContributionDay),
    lastReminderDay: dayStringOf(record.lastReminderDay),
  };
}

/**
 * The award this contribution is worth, given its kind and when it was made.
 *
 * [day] is the day of submission, deliberately, and not the day a reviewer got
 * round to it. A streak is a record of somebody's habit; hanging it on the
 * review queue would mean a member who contributed every day for a week and
 * waited a fortnight for the batch to be read ends up with a streak of one,
 * and a member who contributed once ends up with whatever streak the reviewer's
 * working pattern happened to draw.
 */
export function buildAward(kind: unknown, day: string): ContributionAward {
  return {
    collectionKind: canonicalCollectionKind(kind),
    points: pointsForContribution(kind),
    day,
    isWord: isWordContribution(kind),
  };
}

/**
 * The streak after a contribution made on [day].
 *
 * The day boundary is the calendar's, not a twenty-four hour timer, following
 * `LearnProgress.isSameDay` exactly: somebody who contributes at 11pm and again
 * after breakfast has contributed on two days, and that is what a daily habit
 * means to the person keeping it.
 *
 * The fourth case is the one worth explaining. Reviews do not arrive in the
 * order the work was submitted — a reviewer opens whichever item they open —
 * so a contribution from Monday can be approved after one from Wednesday. When
 * that happens the older day is dropped rather than written back. Writing it
 * back would move `lastContributionDay` backwards, and the next approval would
 * then read as a gap and reset a streak the member never broke. Re-deriving the
 * whole streak from history instead would mean a query over every accepted
 * contribution on every approval, to correct a case that changes nothing the
 * member can see. So a late approval of older work pays its points and leaves
 * the streak where it stands: the streak can be lengthened by contributing, and
 * never shortened by the review queue running slowly.
 */
export function nextStreak(
  previous: Pick<ContributorScoreState, 'streakDays' | 'lastContributionDay'>,
  day: string,
): { streakDays: number; lastContributionDay: string } {
  const last = previous.lastContributionDay;
  if (!last) return { streakDays: 1, lastContributionDay: day };
  // Already counted today; a second contribution on one day is not a second day.
  if (day === last) {
    return { streakDays: Math.max(previous.streakDays, 1), lastContributionDay: last };
  }
  // Older work, approved late. See the note above.
  if (day < last) {
    return { streakDays: Math.max(previous.streakDays, 1), lastContributionDay: last };
  }
  const consecutive = shiftDay(last, 1) === day;
  const base = previous.streakDays > 0 ? previous.streakDays : 1;
  return { streakDays: consecutive ? base + 1 : 1, lastContributionDay: day };
}

/** The row after [award] lands on [previous]. Pure; the transaction writes it. */
export function nextScore(
  previous: ContributorScoreState,
  award: ContributionAward,
): ContributorScoreState {
  const streak = nextStreak(previous, award.day);
  return {
    points: previous.points + award.points,
    approvedCount: previous.approvedCount + 1,
    wordCount: previous.wordCount + (award.isWord ? 1 : 0),
    otherCount: previous.otherCount + (award.isWord ? 0 : 1),
    streakDays: streak.streakDays,
    lastContributionDay: streak.lastContributionDay,
    // Owned by the reminder sweep alone; carried through so an award never
    // clears it and lets somebody be nudged twice in a day.
    lastReminderDay: previous.lastReminderDay,
  };
}

// ---------------------------------------------------------------------------
// "Somebody passed you"
// ---------------------------------------------------------------------------

export interface RankedScore {
  uid: string;
  points: number;
  displayName: string;
}

/** The board's own projection of a stored row. */
export function rankedScoreFrom(uid: string, data: unknown): RankedScore {
  const record = data && typeof data === 'object' && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {};
  const displayName = record.displayName;
  return {
    uid,
    points: intOf(record.points),
    displayName: typeof displayName === 'string' && displayName.trim()
      ? displayName.trim()
      : 'A member',
  };
}

/**
 * Who this member has just overtaken, nearest first.
 *
 * Somebody was passed when they were above the member before the award and are
 * below them after it — strictly, so a tie in either direction is not a pass.
 * Sharing a total with somebody is not the same as beating them, and telling
 * them otherwise is the kind of small dishonesty that makes people stop reading
 * the notifications.
 *
 * [ranked] is the top [LEADERBOARD_DEPTH] rows, which is where the "only tell
 * people inside the top 50" rule comes from: rather than asking each passed
 * member for their rank — three more queries for an answer that is nearly
 * always the same — the window itself is the top of the board, so anybody not
 * in it is not told by construction. Being overtaken at rank 400 is not news,
 * and finding out that it was would cost three reads per contribution forever.
 *
 * The list is sorted here rather than trusted from the caller. It arrives from
 * an `orderBy('points', 'desc')`, but a helper whose correctness depends on the
 * caller having remembered the direction is a helper that will one day be
 * called by somebody who did not.
 */
export function membersPassed(options: {
  uid: string;
  previousPoints: number;
  points: number;
  ranked: readonly RankedScore[];
  limit?: number;
}): RankedScore[] {
  const { uid, previousPoints, points, ranked } = options;
  const limit = options.limit ?? MAX_PASSED_NOTICES;
  if (points <= previousPoints || limit <= 0) return [];
  return [...ranked]
    .sort((a, b) => b.points - a.points)
    .filter((row) => row.uid !== uid && row.points > previousPoints && row.points < points)
    .slice(0, limit);
}

/**
 * The id of the alert telling [passedUid] that [contributionId] overtook them.
 *
 * Derived from the contribution rather than minted, so a re-delivered trigger
 * writes the same document and `writeCommunityNotification`'s `create` refuses
 * it. Without this a retried event would tell the same person the same news
 * twice — and unlike a duplicated score, a duplicated notification is one the
 * member sees.
 */
export function leaderboardNotificationId(contributionId: string, passedUid: string): string {
  return `leaderboard_${contributionId}_${passedUid}`;
}

/** The id of [uid]'s streak nudge for [day]. One per person per day, by construction. */
export function streakReminderNotificationId(uid: string, day: string): string {
  return `streak_${uid}_${day}`;
}

// ---------------------------------------------------------------------------
// Awarding
// ---------------------------------------------------------------------------

/**
 * Moves a member's points when their contribution is accepted.
 *
 * ── Why this document, and not the submission ─────────────────────────────
 * `collectionContributions/{contributionId}` rather than
 * `submissions/{submissionId}`, for three reasons. The idempotency marker has
 * to be keyed by something stable and one-per-contribution, and this document's
 * id is exactly that. Everything the award needs — `authUid`, `collectionKind`,
 * `createdAt`, `status` — is on this one row, so the transaction reads no
 * second document to find out who is being paid for what. And the
 * member-facing contribution is one-to-one with this row, whereas a submission
 * also exists for TribeStudio work that never went through the Collection
 * forms at all.
 *
 * Another trigger watches this same document to move the `wordQueue` row. That
 * is fine and intended: Firestore fans one write out to every function
 * subscribed to the path, and the two never touch the same documents — this one
 * writes `contributorScores`, `contributorPointAwards`, `communityNotifications`
 * and `auditLogs`, and nothing else.
 *
 * ── Why a transaction ─────────────────────────────────────────────────────
 * Because the marker and the points must land together or not at all. A
 * read-then-write would leave a window in which a redelivered copy of the same
 * event finds no marker and pays a second time, and a doubled score is not
 * something anybody can spot afterwards — the points have no receipt of their
 * own once they are in the total. The marker created inside the transaction is
 * that receipt.
 */
export const awardContributorPoints = onDocumentUpdated(
  { document: 'collectionContributions/{contributionId}', region: REGION },
  async (event) => {
    const before = event.data?.before;
    const after = event.data?.after;
    if (!after?.exists) return;
    if (!isNewlyApproved(before?.get('status'), after.get('status'))) return;

    const contributionId = after.id;
    const uid = after.get('authUid');
    if (typeof uid !== 'string' || !uid) {
      logger.error('An approved contribution has no author to pay', { contributionId });
      return;
    }

    const kind = after.get('collectionKind') ?? after.get('category');
    if (canonicalCollectionKind(kind) === null) {
      logger.warn('Paying the floor for an unrecognised contribution kind', {
        contributionId,
        kind: String(kind ?? ''),
        points: DEFAULT_POINTS,
      });
    }

    // The day the member did the work, not the day a reviewer read it. `now`
    // is only a fallback for a row whose `createdAt` is unreadable, which would
    // itself be a bug worth the wrong streak day it causes.
    const now = new Date();
    const award = buildAward(kind, dayOf(after.get('createdAt')) ?? contributionDay(now));

    const db = getFirestore();
    const awardRef = db.collection(AWARDS).doc(contributionId);
    const scoreRef = db.collection(SCORES).doc(uid);
    const profileRef = db.collection('communityProfiles').doc(uid);
    const auditRef = db.collection('auditLogs').doc();

    const moved = await db.runTransaction(async (tx) => {
      // One round trip for all three, and every read before every write, which
      // Firestore requires of a transaction.
      const [awardSnap, scoreSnap, profileSnap] = await tx.getAll(awardRef, scoreRef, profileRef);
      if (awardSnap.exists) return null;

      const previous = readScoreState(scoreSnap.data());
      const next = nextScore(previous, award);
      // Refreshed on every touch: this is the stamp the leaderboard renders, so
      // a rename reaches the board on the member's next accepted contribution.
      const identity = actorFrom(uid, profileSnap.data());

      tx.set(scoreRef, {
        uid,
        points: next.points,
        approvedCount: next.approvedCount,
        wordCount: next.wordCount,
        otherCount: next.otherCount,
        streakDays: next.streakDays,
        lastContributionDay: next.lastContributionDay,
        displayName: identity.displayName,
        username: identity.username,
        avatarUrl: identity.avatarUrl,
        updatedAt: FieldValue.serverTimestamp(),
      }, {
        // Merge, so the sweep's `lastReminderDay` survives an award landing in
        // the same day. A full `set` here would clear it and let somebody be
        // nudged a second time that evening.
        merge: true,
      });

      tx.create(awardRef, {
        contributionId,
        uid,
        points: award.points,
        collectionKind: award.collectionKind,
        contributionDay: award.day,
        pointsAfter: next.points,
        awardedAt: FieldValue.serverTimestamp(),
      });

      tx.set(auditRef, {
        id: auditRef.id,
        // Nobody decided this one; a review decision did, and it is already
        // audited under creator.submission.decide.
        actor: { collection: 'system', id: 'awardContributorPoints' },
        action: 'contributor.points.award',
        target: { collection: SCORES, id: uid },
        outcome: 'success',
        source: 'functions',
        before: { points: previous.points, streakDays: previous.streakDays },
        after: { points: next.points, streakDays: next.streakDays },
        metadata: {
          contributionId,
          collectionKind: award.collectionKind,
          points: award.points,
          contributionDay: award.day,
        },
        occurredAt: now.toISOString(),
      });

      return {
        previousPoints: previous.points,
        points: next.points,
        displayName: identity.displayName,
        username: identity.username,
        avatarUrl: identity.avatarUrl,
      };
    });

    // Null means the marker was already there: this event has been delivered
    // before and everything below it has already happened.
    if (!moved) return;

    await notifyMembersPassed(db, {
      contributionId,
      uid,
      previousPoints: moved.previousPoints,
      points: moved.points,
      actor: {
        id: uid,
        displayName: moved.displayName,
        username: moved.username,
        avatarUrl: moved.avatarUrl,
      },
    });
  },
);

/**
 * Tells the people this contribution overtook.
 *
 * Runs after the score write rather than inside it, on purpose: the ranking
 * query has to see the new total, and a transaction cannot read what it has not
 * yet committed. The consequence is that a failure here loses the alerts and
 * keeps the points, which is the right way round — the points are the record,
 * the alert is the courtesy.
 */
async function notifyMembersPassed(
  db: FirebaseFirestore.Firestore,
  options: {
    contributionId: string;
    uid: string;
    previousPoints: number;
    points: number;
    actor: { id: string; displayName: string; username: string; avatarUrl: string | null };
  },
): Promise<void> {
  const { contributionId, uid, previousPoints, points, actor } = options;
  if (points <= previousPoints) return;

  // One query, ordered on one field, so no composite index — the board and the
  // "who did I pass" window are the same read.
  const board = await db
    .collection(SCORES)
    .orderBy('points', 'desc')
    .limit(LEADERBOARD_DEPTH)
    .get();

  const passed = membersPassed({
    uid,
    previousPoints,
    points,
    ranked: board.docs.map((doc) => rankedScoreFrom(doc.id, doc.data())),
  });
  if (passed.length === 0) return;

  const wanted = await recipientsWanting(
    db,
    passed.map((row) => row.uid),
    'leaderboard',
  );

  // Written one at a time rather than through the BulkWriter the streak sweep
  // uses: this is at most three rows by construction, and `create` on each is
  // the same "an existing alert is never rewritten" guarantee without a writer
  // to open and close for three documents.
  for (const row of passed) {
    if (!wanted.has(row.uid)) continue;
    await writeCommunityNotification(db, {
      id: leaderboardNotificationId(contributionId, row.uid),
      recipientId: row.uid,
      type: LEADERBOARD_TYPE,
      actor,
      title: `${actor.displayName} has passed you`,
      body: `${points} points to your ${row.points} on the contributors board.`,
      route: LEADERBOARD_ROUTE,
      // One entry per member, however many people pass them in an evening. A
      // stack of "you were passed" alerts is a worse experience than the news
      // itself is worth.
      collapseKey: 'leaderboard',
    });
  }
}

// ---------------------------------------------------------------------------
// Streak reminders
// ---------------------------------------------------------------------------

export interface ReminderCandidate {
  streakDays: number;
  lastContributionDay: string | null;
  lastReminderDay: string | null;
}

/**
 * Whether [candidate] should be nudged on [today].
 *
 * Three gates, and the middle one is the interesting one: the member is
 * reminded only when their last contribution day was *yesterday* — not merely
 * "not today". A streak whose last day was a week ago is already over, and a
 * message about keeping alive something that has already ended reads as a
 * machine that has not been paying attention. So the eligible set is exactly
 * the people whose streak is alive and whose streak breaks tonight, which is
 * the same judgement `LearnProgress.streakAtRisk` makes on the device.
 *
 * `lastReminderDay` is the idempotency gate: the sweep may run twice, or be
 * retried after a partial failure, and nobody hears about it a second time.
 */
export function shouldRemindStreak(candidate: ReminderCandidate, today: string): boolean {
  if (candidate.streakDays < MIN_REMINDER_STREAK) return false;
  if (candidate.lastReminderDay === today) return false;
  const yesterday = shiftDay(today, -1);
  return yesterday !== null && candidate.lastContributionDay === yesterday;
}

/**
 * The evening nudge for a streak that ends at midnight.
 *
 * Eighteen hundred rather than the small hours the other sweeps in this project
 * run at (`expireAdCampaigns` at 03:00, `reconcileSubscriptions` at 03:15).
 * Those two are housekeeping and nobody reads them; this one asks somebody to
 * do something today, and a request that lands at three in the morning is read
 * at eight with most of the day gone. Six in the evening leaves an evening.
 *
 * Africa/Accra for the timezone and UTC for the day arithmetic, which is the
 * same clock — Ghana keeps GMT year round with no daylight saving — so the run
 * happens at 18:00 on precisely the day the streak is about to break.
 */
export const remindContributorStreaks = onSchedule(
  {
    region: REGION,
    schedule: 'every day 18:00',
    timeZone: 'Africa/Accra',
  },
  async () => {
    const db = getFirestore();
    const today = contributionDay(new Date());

    // Filtered on the one field that can be indexed for free, and finished in
    // memory. The alternative — a composite index on streakDays plus
    // lastContributionDay — would buy a smaller read of a set that is small by
    // construction: only members with a live streak of two or more are here at
    // all.
    const candidates = await db
      .collection(SCORES)
      .where('streakDays', '>=', MIN_REMINDER_STREAK)
      .limit(REMINDER_SCAN_LIMIT)
      .get();

    if (candidates.size === REMINDER_SCAN_LIMIT) {
      logger.warn('The streak sweep read its whole scan limit; some streaks were not considered', {
        scanned: candidates.size,
        limit: REMINDER_SCAN_LIMIT,
      });
    }

    const due = candidates.docs.filter((doc) => {
      const state = readScoreState(doc.data());
      return shouldRemindStreak(state, today);
    });

    const capped = due.slice(0, MAX_STREAK_REMINDERS);
    if (due.length > capped.length) {
      logger.warn('The streak reminder cap bit; the rest will be nudged tomorrow', {
        due: due.length,
        sent: capped.length,
        cap: MAX_STREAK_REMINDERS,
      });
    }
    if (capped.length === 0) return;

    const wanted = await recipientsWanting(
      db,
      capped.map((doc) => doc.id),
      'streakReminders',
    );

    const sending = capped.filter((doc) => wanted.has(doc.id));

    // The row goes in first and the stamp second. If the stamp fails, the
    // derived notification id still refuses a duplicate tomorrow; if the order
    // were reversed, a failure between them would lose the reminder entirely and
    // the stamp would say it had been sent.
    await writeCommunityNotifications(db, sending.map((doc) => {
      const streakDays = readScoreState(doc.data()).streakDays;
      return {
        id: streakReminderNotificationId(doc.id, today),
        recipientId: doc.id,
        // Written as a notification row rather than pushed directly, so it also
        // sits in the notification centre for somebody who had their phone face
        // down all evening. `onCommunityNotificationCreated` does the push.
        type: LEADERBOARD_TYPE,
        title: `Keep your ${streakDays}-day streak going`,
        body: 'Add one contribution today and the streak carries on once it has been reviewed.',
        route: CONTRIBUTE_ROUTE,
        collapseKey: 'streak',
      };
    }));

    for (let index = 0; index < sending.length; index += REMINDER_STAMP_CHUNK) {
      const run = sending.slice(index, index + REMINDER_STAMP_CHUNK);
      const batch = db.batch();
      for (const doc of run) batch.update(doc.ref, { lastReminderDay: today });
      try {
        await batch.commit();
      } catch (error) {
        logger.error('Could not stamp a run of streak reminders', {
          count: run.length,
          error: String(error),
        });
      }
    }

    logger.info('Streak reminders sent', {
      scanned: candidates.size,
      due: due.length,
      sent: sending.length,
      mutedByPreference: capped.length - sending.length,
    });
  },
);
