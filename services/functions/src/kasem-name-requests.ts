import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { requireAuth, requireRole } from './auth.js';
import { consumeRateLimit } from './rate-limit.js';
import {
  HANDLE_SHAPE,
  type HandleClaimRefusal,
  carriesKasemName,
  claimHandleInTransaction,
  foldKasemToAscii,
  isReservedHandle,
  publishedKasemNames,
} from './kasem-handle.js';

/**
 * Asking for a Kassena name to be added to the list, and answering.
 *
 * ── Why members have to be able to ask ────────────────────────────────────
 * The ring is awarded for carrying a real Kassena name, and the only list of
 * those is the one the admin console publishes. That was fine while the list
 * was the project's own idea of which names matter, and wrong the moment a
 * member typed their grandmother's name into the handle field and was told
 * "This is only for taking a Kassena name." The name *was* Kassena. The list
 * had simply never heard of it, and there was nowhere to say so.
 *
 * So a member asks, a reviewer decides, and an approval does both halves of the
 * thing the member actually wanted: it publishes the name for everybody, and —
 * when the request carried one — hands them the handle in the same transaction.
 * Splitting those into "approved, now go and claim it" would mean the member
 * comes back to a screen that can still refuse them, because somebody else took
 * the handle in between.
 *
 * ── What the server will not take from a client ───────────────────────────
 * `ascii` above all. It is what the ring is awarded on, and a request that
 * could name its own fold is a request that could award the ring for anything —
 * "John", folded to "nyaaba". It is derived here, with the same
 * `foldKasemToAscii` `claimKasemHandle` uses, from the name as written.
 */

/** What a name can be: a given name, a clan name, or a place. */
export const KASEM_NAME_KINDS = ['given', 'clan', 'place'] as const;
export type KasemNameKind = (typeof KASEM_NAME_KINDS)[number];

/** A name written properly is short. Sixty characters is generous for one. */
const MAX_NAME = 60;
const MAX_MEANING = 200;
const MAX_NOTE = 1000;

/**
 * The shortest note worth reviewing.
 *
 * A reviewer is being asked to decide whether a string is a real Kassena name,
 * which is not something anybody can tell by looking at it. "Yes" as the whole
 * justification is a request that cannot be answered, so it is refused at the
 * door rather than left to rot in the queue.
 */
const MIN_NOTE = 10;

const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === 'true';

const CALL_OPTIONS = {
  enforceAppCheck: ENFORCE_APP_CHECK,
  consumeAppCheckToken: ENFORCE_APP_CHECK,
  invoker: 'public' as const,
};

function asString(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** What a member asked for, once the server has decided it is answerable. */
export interface KasemNameRequestInput {
  /** As it is properly written, diacritics and all — `Awɛlɩmwɛ`. */
  readonly name: string;
  /** Folded here and never accepted from the client — `awelimwe`. */
  readonly ascii: string;
  readonly meaning: string;
  readonly kind: KasemNameKind;
  readonly note: string;
  /** The handle they want if this is also a whitelist-my-claim request. */
  readonly handle: string;
}

/**
 * Reads and validates the shape of a request, deriving everything derivable.
 *
 * Pure, and exported for that reason: every refusal in here is a sentence
 * somebody reads on a phone, and pinning them down in a test is cheaper than
 * discovering in production that a name folding to two letters was accepted and
 * can never be claimed.
 */
export function parseKasemNameRequestInput(data: unknown): KasemNameRequestInput {
  const raw = (data ?? {}) as Record<string, unknown>;
  const name = asString(raw.name, MAX_NAME);
  if (name.length === 0) {
    throw new HttpsError('invalid-argument', 'Write the name as it is properly spelled.');
  }

  const ascii = foldKasemToAscii(name);
  if (ascii.length < 3) {
    // Not a formality: the handle a name earns is its fold, and a fold shorter
    // than three characters cannot be part of any handle, so an approval would
    // publish a name nobody could ever take.
    throw new HttpsError(
      'invalid-argument',
      'That name does not give enough letters for a handle. A handle needs at least three.',
    );
  }

  const kindRaw = asString(raw.kind, 20).toLowerCase();
  const kind = (KASEM_NAME_KINDS as readonly string[]).includes(kindRaw)
    ? (kindRaw as KasemNameKind)
    : 'given';

  const note = asString(raw.note, MAX_NOTE);
  if (note.length < MIN_NOTE) {
    throw new HttpsError(
      'invalid-argument',
      'Say who bears this name or where it is from. A reviewer cannot tell from the spelling alone.',
    );
  }

  const handle = asString(raw.handle, 40).toLowerCase().replace(/^@/, '');
  if (handle.length > 0) {
    if (!HANDLE_SHAPE.test(handle)) {
      throw new HttpsError(
        'invalid-argument',
        'A handle is 3 to 20 characters: lowercase letters, numbers and underscores, starting with a letter.',
      );
    }
    if (isReservedHandle(handle)) {
      throw new HttpsError('invalid-argument', 'That handle is reserved.');
    }
    if (!carriesKasemName(handle, new Set([ascii]))) {
      // Otherwise approving would publish one name and hand out a handle built
      // on a different one, and the ring would be awarded for neither.
      throw new HttpsError(
        'invalid-argument',
        `@${handle} does not carry ${name}. Ask for the handle that holds the name you are asking for.`,
      );
    }
  }

  return {
    name,
    ascii,
    meaning: asString(raw.meaning, MAX_MEANING),
    kind,
    note,
    handle,
  };
}

/** The document id a published name takes. Its fold, which is already unique. */
export function kasemNameSlug(ascii: string): string {
  return ascii;
}

/** How the handle half of an approval turned out. */
export type HandleOutcome = 'not-requested' | 'applied' | HandleClaimRefusal;

/**
 * Whether the member ends up wearing the ring.
 *
 * `already-yours` counts. A member whose handle was already the folded name has
 * simply been waiting for the name to be published, and it now is.
 */
export function ringGranted(outcome: HandleOutcome): boolean {
  return outcome === 'applied' || outcome === 'already-yours';
}

export interface NameDecisionNotice {
  readonly title: string;
  readonly body: string;
  readonly channels: readonly string[];
  readonly priority: 'high' | 'normal';
  readonly link: string;
}

/**
 * What the member is told, and on which channels.
 *
 * ── Why a rejection is not an SMS ─────────────────────────────────────────
 * An SMS costs the project money and costs the member their attention wherever
 * they happen to be standing. A "yes" earns that: it is the end of something
 * they asked for and it changes what their account is called. A "no" does not
 * need to interrupt anybody's day — it waits in the app.
 *
 * Note the `priority`, which is doing real work: `onNotificationCreated` sends
 * an SMS when the channels ask for one **or** when `priority == 'high'`. A
 * rejection marked high would go out by SMS whatever its channels said.
 *
 * The bodies stand alone on purpose. An SMS arrives with no app around it, no
 * title bar and nothing to tap, so "Approved" would be meaningless; the name or
 * the handle has to be in the sentence itself.
 */
export function nameDecisionNotification(input: {
  readonly decision: 'approve' | 'reject';
  readonly name: string;
  readonly handle: string;
  readonly handleOutcome: HandleOutcome;
  readonly note: string;
}): NameDecisionNotice {
  const { name, handle, handleOutcome, note } = input;

  if (input.decision === 'reject') {
    return {
      title: 'About the Kassena name you asked for',
      body: note
        ? `${name} has not been added to the list. ${note}`
        : `${name} has not been added to the list.`,
      channels: ['in_app', 'push'],
      priority: 'normal',
      link: '/notifications',
    };
  }

  if (ringGranted(handleOutcome)) {
    return {
      title: 'Your username has been approved',
      body: `@${handle} is yours. Your picture now wears the kente ring.`,
      channels: ['in_app', 'push', 'sms'],
      priority: 'high',
      link: '/profile',
    };
  }

  return {
    title: 'Your Kassena name was added',
    body: `The name ${name} is now on the list.${handleTail(handle, handleOutcome)}`,
    channels: ['in_app', 'push', 'sms'],
    priority: 'high',
    link: '/profile',
  };
}

/** The sentence after "the name is on the list", which depends on the handle. */
function handleTail(handle: string, outcome: HandleOutcome): string {
  switch (outcome) {
    case 'already-changed':
      return ` @${handle} could not be given to you — you have already had your one name change.`;
    case 'taken':
      return ` @${handle} has since been taken, but you can still take another handle that carries the name.`;
    case 'no-profile':
      return ' Set up your community profile, then you can take it in the app.';
    default:
      return ' You can take it in the app.';
  }
}

/**
 * A member asks for a name to be added, and optionally for a handle with it.
 *
 * Refused rather than queued when the answer is already knowable: a name
 * already on the published list, a second pending request for the same name
 * from the same member, or a handle that is reserved or already somebody
 * else's. All three would otherwise reach a reviewer as work with no possible
 * useful outcome.
 */
export const requestKasemName = onCall(CALL_OPTIONS, async (req) => {
  const uid = requireAuth(req);
  // Three a day. Somebody thinking of their family's names is unaffected;
  // somebody feeding the reviewers a dictionary is.
  await consumeRateLimit('requestKasemName', uid, 3, 24 * 60 * 60 * 1000);

  const input = parseKasemNameRequestInput(req.data);
  const db = getFirestore();

  const published = await publishedKasemNames();
  if (published.has(input.ascii)) {
    throw new HttpsError(
      'already-exists',
      `${input.name} is already on the list — you can take it now, without asking.`,
    );
  }

  // Single-field equality, filtered here rather than in a second `where`, so no
  // composite index is needed — the same trade every queue in this project
  // makes.
  const mine = await db.collection('kasemNameRequests').where('uid', '==', uid).limit(50).get();
  const duplicate = mine.docs.some(
    (doc) => doc.get('status') === 'pending' && doc.get('ascii') === input.ascii,
  );
  if (duplicate) {
    throw new HttpsError(
      'already-exists',
      'You have already asked for this name. It is with the reviewers.',
    );
  }

  if (input.handle) {
    const taken = await db.collection('communityUsernames').doc(input.handle).get();
    if (taken.exists && taken.get('uid') !== uid) {
      throw new HttpsError('already-exists', 'That handle is already taken.');
    }
  }

  // Denormalised so the review desk can name the person without reading a
  // profile per card — the queue is a list, and a list that fans out into one
  // read per row is a list that loads in pieces.
  const profile = await db.collection('communityProfiles').doc(uid).get();

  const requestRef = db.collection('kasemNameRequests').doc();
  const auditRef = db.collection('auditLogs').doc();
  const batch = db.batch();
  batch.set(requestRef, {
    id: requestRef.id,
    uid,
    name: input.name,
    ascii: input.ascii,
    meaning: input.meaning,
    kind: input.kind,
    note: input.note,
    handle: input.handle,
    requester: {
      username: String(profile.get('username') ?? ''),
      displayName: String(profile.get('displayName') ?? ''),
    },
    status: 'pending',
    reviewerUid: null,
    reviewNote: '',
    handleOutcome: input.handle ? 'pending' : 'not-requested',
    createdAt: FieldValue.serverTimestamp(),
    decidedAt: null,
  });
  batch.set(auditRef, {
    id: auditRef.id,
    action: 'community.kasemNameRequested',
    actorUid: uid,
    targetUid: uid,
    detail: `${input.name} (${input.ascii})${input.handle ? ` -> @${input.handle}` : ''}`,
    createdAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  logger.info('Kassena name requested', { uid, ascii: input.ascii, withHandle: Boolean(input.handle) });
  return { id: requestRef.id, ascii: input.ascii, status: 'pending' };
});

/**
 * A reviewer answers. Approving publishes the name and, where one was asked
 * for, hands over the handle in the same transaction.
 *
 * The handle is the part that can fail on its own — the member may have spent
 * their one change since asking, or somebody else may have taken it — and when
 * it does, the name is still published and the request still says so. Failing
 * the whole approval over it would mean a reviewer who has already read the
 * note and decided the name is real cannot record that decision, which helps
 * nobody.
 */
export const decideKasemNameRequest = onCall(CALL_OPTIONS, async (req) => {
  // `validator` rather than `admin`: the same claim that decides submissions
  // and adverts, so the review desk is one desk. `requireRole` lets reviewers
  // and admins through by inheritance.
  const uid = requireAuth(req);
  requireRole(req, 'validator');
  await consumeRateLimit('decideKasemNameRequest', uid, 120);

  const data = (req.data ?? {}) as Record<string, unknown>;
  const requestId = asString(data.requestId, 200);
  const decision = asString(data.decision, 20).toLowerCase();
  const note = asString(data.note, MAX_NOTE);
  if (!requestId || (decision !== 'approve' && decision !== 'reject')) {
    throw new HttpsError('invalid-argument', 'A requestId and a decision are required.');
  }
  if (decision === 'reject' && note.length < 5) {
    // A member told "no" with no reason cannot do anything with it — not even
    // ask again with a better note.
    throw new HttpsError('invalid-argument', 'Say why. The member will read it.');
  }

  const db = getFirestore();
  const requestRef = db.collection('kasemNameRequests').doc(requestId);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(requestRef);
    if (!snap.exists) {
      throw new HttpsError('not-found', 'That request no longer exists.');
    }
    if (snap.get('status') !== 'pending') {
      throw new HttpsError('failed-precondition', 'That request has already been answered.');
    }

    const memberUid = String(snap.get('uid') ?? '');
    const name = String(snap.get('name') ?? '');
    const ascii = String(snap.get('ascii') ?? '');
    const handle = String(snap.get('handle') ?? '');
    if (!memberUid || !name || ascii.length < 3) {
      throw new HttpsError('failed-precondition', 'That request is missing what it needs to be decided.');
    }

    const auditRef = db.collection('auditLogs').doc();

    if (decision === 'reject') {
      tx.update(requestRef, {
        status: 'rejected',
        reviewerUid: uid,
        reviewNote: note,
        decidedAt: FieldValue.serverTimestamp(),
      });
      tx.set(auditRef, {
        id: auditRef.id,
        action: 'community.kasemNameRequestRejected',
        actorUid: uid,
        targetUid: memberUid,
        detail: `${name} (${ascii})`,
        createdAt: FieldValue.serverTimestamp(),
      });
      return { memberUid, name, handle, handleOutcome: 'not-requested' as HandleOutcome };
    }

    // ── Reads first, all of them ─────────────────────────────────────────
    // Firestore refuses a read after a write in a transaction, and the handle
    // claim below both reads and writes, so everything this needs is fetched
    // before it is called.
    const nameRef = db.collection('kasemNames').doc(kasemNameSlug(ascii));
    const existing = await tx.get(nameRef);
    const highest = await tx.get(
      db.collection('kasemNames').orderBy('order', 'desc').limit(1),
    );
    const nextOrder = highest.empty ? 0 : Number(highest.docs[0]?.get('order') ?? 0) + 1;
    const order = existing.exists ? Number(existing.get('order') ?? nextOrder) : nextOrder;

    let handleOutcome: HandleOutcome = 'not-requested';
    if (handle) {
      const outcome = await claimHandleInTransaction(tx, {
        uid: memberUid,
        handle,
        actorUid: uid,
        action: 'community.kasemHandleApproved',
      });
      handleOutcome = outcome.ok ? 'applied' : outcome.reason;
    }

    // The same shape `saveKasemName` writes from the admin console, so a name
    // approved from a phone is a name the console can edit afterwards.
    tx.set(
      nameRef,
      {
        id: nameRef.id,
        name,
        ascii,
        meaning: String(snap.get('meaning') ?? ''),
        kind: String(snap.get('kind') ?? 'given'),
        order,
        published: true,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    tx.update(requestRef, {
      status: 'approved',
      reviewerUid: uid,
      reviewNote: note,
      handleOutcome,
      handleApplied: ringGranted(handleOutcome),
      decidedAt: FieldValue.serverTimestamp(),
    });
    tx.set(auditRef, {
      id: auditRef.id,
      action: 'community.kasemNameRequestApproved',
      actorUid: uid,
      targetUid: memberUid,
      detail: `${name} (${ascii})${handle ? ` -> @${handle} [${handleOutcome}]` : ''}`,
      createdAt: FieldValue.serverTimestamp(),
    });

    return { memberUid, name, handle, handleOutcome };
  });

  // Outside the transaction on purpose. The notification is a consequence of
  // the decision, not part of it: a fan-out trigger that failed must not be
  // able to roll back a published name, and a retried transaction must not be
  // able to send the same SMS twice.
  const notice = nameDecisionNotification({
    decision: decision === 'approve' ? 'approve' : 'reject',
    name: result.name,
    handle: result.handle,
    handleOutcome: result.handleOutcome,
    note,
  });
  const now = new Date().toISOString();
  const notificationRef = db.collection('notifications').doc();
  await notificationRef.set({
    id: notificationRef.id,
    recipient: { collection: 'creatorProfiles', id: result.memberUid },
    authUid: result.memberUid,
    type: 'name_decision',
    priority: notice.priority,
    channels: [...notice.channels],
    title: notice.title,
    body: notice.body,
    link: notice.link,
    read: false,
    schemaVersion: 1,
    lifecycle: { createdAt: now, updatedAt: now, version: 1 },
  });

  logger.info('Kassena name request decided', {
    requestId,
    decision,
    reviewer: uid,
    handleOutcome: result.handleOutcome,
  });
  return { status: decision === 'approve' ? 'approved' : 'rejected', handleOutcome: result.handleOutcome };
});
