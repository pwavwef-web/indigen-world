/**
 * The four privileged things a validator or an admin may do to a word that is
 * already in the dictionary: look for the one that is already there, correct
 * it, fold two of them into one, and — for an admin, and only with a reason on
 * the record — remove one outright.
 *
 * ── Why these are callables and not Security Rules ────────────────────────
 * `firestore.rules` says `allow write: if false` on `dictionaryEntries`, and
 * that stays true. Every rule this module enforces is a rule about the *shape*
 * of the archive — that a headword is never blanked, that a homograph number is
 * never silently reused, that a merge leaves a forwarding address, that a
 * deletion carries the whole document into the audit log first — and none of
 * those is expressible in a Security Rule. Opening the collection to a client
 * that promises to behave is how an archive acquires a row nobody can explain.
 *
 * ── What a reviewer sees, and when ────────────────────────────────────────
 * [findDictionaryEntryMatches] is the one that runs during review. A validator
 * opening a dictionary contribution is told, before they decide anything,
 * whether the archive already holds that word — and shown what it holds, so
 * "already exists" is a fact they can check rather than a warning they have to
 * take on trust. Two entries under one spelling is a homograph, not an error,
 * so it prompts and never blocks.
 */

import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { FieldValue, getFirestore, type Query } from 'firebase-admin/firestore';
import { requireAuth, requireRole } from './auth.js';
import { consumeRateLimit } from './rate-limit.js';
import {
  assignHomographIndex,
  headwordKey,
  MAX_HOMOGRAPH_PEERS,
  type HomographPeer,
} from './kasem-homographs.js';
import {
  applyEntryPatch,
  mergeEntryDocuments,
  mergePreview,
  parseEntryPatch,
  rankDuplicates,
  renumberOnRespell,
  MAX_REASON_LENGTH,
  MIN_REASON_LENGTH,
  type DuplicateCandidate,
  type MergeSide,
} from './dictionary-edits.js';

const REGION = 'us-central1';
const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === 'true';
const ENTRIES = 'dictionaryEntries';

/**
 * The most documents a duplicate lookup will read.
 *
 * Bounded because this runs on every dictionary contribution a validator
 * opens, and an unbounded scan of a growing archive would make the review desk
 * slower every month. See [gatherCandidates] for how the reads are targeted so
 * the bound is generous rather than restrictive.
 */
const MAX_CANDIDATE_READS = 200;

type JsonRecord = Record<string, any>;

function callableOptions() {
  return {
    region: REGION,
    enforceAppCheck: ENFORCE_APP_CHECK,
    consumeAppCheckToken: ENFORCE_APP_CHECK,
    invoker: 'public' as const,
  };
}

function requireReason(raw: unknown): string {
  const reason = typeof raw === 'string' ? raw.trim() : '';
  if (reason.length < MIN_REASON_LENGTH || reason.length > MAX_REASON_LENGTH) {
    throw new HttpsError(
      'invalid-argument',
      `A reason of ${MIN_REASON_LENGTH}–${MAX_REASON_LENGTH} characters is required — it is the only record of why this word changed.`,
    );
  }
  return reason;
}

function requireId(raw: unknown, name: string): string {
  const id = typeof raw === 'string' ? raw.trim() : '';
  if (!id || id.length > 300) {
    throw new HttpsError('invalid-argument', `${name} is required.`);
  }
  return id;
}

function nowIso(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Finding what already exists
// ---------------------------------------------------------------------------

/**
 * Reads the entries that could plausibly be the same word as [headword].
 *
 * ── Why four queries and not one scan ─────────────────────────────────────
 * `headwordKey` is written by every publication since it was introduced and is
 * absent from the oldest rows in the archive, which is exactly where the
 * duplicates accumulated. A lookup that trusted it would report "no existing
 * entry" most confidently for the entries most likely to be duplicated.
 *
 * So the candidates are gathered four ways — the grouping key, the spelling as
 * written, the spelling lowercased, and a prefix range over the spelling for
 * near misses — and de-duplicated by document id. Every one of them is a
 * single-field query on a field Firestore indexes automatically, so this needs
 * no composite index and no scan.
 *
 * Unpublished rows are included deliberately. An entry that was withdrawn is
 * still an entry under that spelling, its homograph number is still spent, and
 * a reviewer about to publish a second copy of it needs to know it is there.
 */
async function gatherCandidates(headword: string): Promise<JsonRecord[]> {
  const db = getFirestore();
  const key = headwordKey(headword);
  if (!key) return [];
  const collection = db.collection(ENTRIES);
  const written = headword.trim();
  const lowered = written.toLowerCase();
  // Two letters, not three. `rankDuplicates` throws away anything below a 0.7
  // similarity, so the sweep's only job is to reach the neighbourhood cheaply
  // — and a three-letter prefix misses the near miss that differs in its third
  // character, which is among the commonest ways a Kasem word gets retyped.
  const sweep = (value: string) =>
    collection
      .orderBy('kasemText')
      .startAt(value.slice(0, 2))
      .endAt(`${value.slice(0, 2)}`)
      .limit(MAX_CANDIDATE_READS);

  const queries: Query[] = [
    collection.where('headwordKey', '==', key).limit(MAX_HOMOGRAPH_PEERS),
    collection.where('kasemText', '==', written).limit(40),
    ...(lowered !== written ? [collection.where('kasemText', '==', lowered).limit(40)] : []),
    // The near-miss sweep, as a prefix range over the spelling. U+F8FF is the
    // last code point Firestore orders before the next prefix, which is the
    // documented way to ask for "every value starting with this" without a
    // second stored field to query.
    sweep(written),
    // The same sweep over the lower-cased spelling, for rows filed under a
    // capital. Skipped when the word was typed in lower case already, so the
    // ordinary contribution costs three reads rather than four.
    ...(lowered !== written ? [sweep(lowered)] : []),
  ];

  const snapshots = await Promise.all(queries.map((query) => query.get()));
  const byId = new Map<string, JsonRecord>();
  for (const snapshot of snapshots) {
    for (const doc of snapshot.docs) {
      if (byId.has(doc.id)) continue;
      byId.set(doc.id, { ...doc.data(), id: doc.id });
    }
  }
  return [...byId.values()];
}

/**
 * What the archive already holds under a spelling.
 *
 * Answers the prompt a validator sees on a dictionary contribution — *this word
 * already exists, would you like to merge them?* — and the picker on the merge
 * screen. Read-only: it decides nothing and writes nothing, which is why it is
 * open to any reviewer rather than to admins alone.
 *
 * Accepts either a `headword` outright or a `submissionId`, because at review
 * time the word is in a submission that has not been published yet and asking
 * the client to dig `body` out of it would put the definition of "the headword"
 * in two places.
 */
export const findDictionaryEntryMatches = onCall(callableOptions(), async (req) => {
  const uid = requireAuth(req);
  requireRole(req, 'validator');
  await consumeRateLimit('findDictionaryEntryMatches', uid, 240);

  const data = (req.data ?? {}) as JsonRecord;
  const excludeId = typeof data.excludeEntryId === 'string' ? data.excludeEntryId.trim() : '';
  let headword = typeof data.headword === 'string' ? data.headword.trim() : '';

  if (!headword && typeof data.submissionId === 'string' && data.submissionId.trim()) {
    const snap = await getFirestore().collection('submissions').doc(data.submissionId.trim()).get();
    if (!snap.exists) throw new HttpsError('not-found', 'Submission not found.');
    // `body` is where a dictionary contribution keeps its Kasem word — the same
    // field `creators.ts` publishes as `kasemText`.
    headword = String(snap.get('body') ?? '').trim();
  }
  if (!headword) {
    throw new HttpsError('invalid-argument', 'A headword or a submissionId is required.');
  }

  const candidates: DuplicateCandidate[] = rankDuplicates(headword, await gatherCandidates(headword), {
    excludeId,
    limit: 25,
  });
  return {
    headword,
    headwordKey: headwordKey(headword),
    exactCount: candidates.filter((row) => row.exact).length,
    matches: candidates,
  };
});

/**
 * Both sides of a proposed merge, field by field, as the compare screen draws
 * them.
 *
 * Separate from the merge itself so a reviewer can look before they decide, and
 * so what they looked at is produced by the same code that will run — a preview
 * assembled on the client would drift from the merge the first time a field was
 * added to one and not the other.
 */
export const previewDictionaryMerge = onCall(callableOptions(), async (req) => {
  const uid = requireAuth(req);
  requireRole(req, 'validator');
  await consumeRateLimit('previewDictionaryMerge', uid, 120);

  const data = (req.data ?? {}) as JsonRecord;
  const targetId = requireId(data.targetId, 'targetId');
  const sourceId = requireId(data.sourceId, 'sourceId');
  if (targetId === sourceId) {
    throw new HttpsError('invalid-argument', 'An entry cannot be merged into itself.');
  }

  const db = getFirestore();
  const [targetSnap, sourceSnap] = await Promise.all([
    db.collection(ENTRIES).doc(targetId).get(),
    db.collection(ENTRIES).doc(sourceId).get(),
  ]);
  if (!targetSnap.exists) throw new HttpsError('not-found', 'The entry to keep was not found.');
  if (!sourceSnap.exists) throw new HttpsError('not-found', 'The duplicate was not found.');

  const target = targetSnap.data() as JsonRecord;
  const source = sourceSnap.data() as JsonRecord;
  return {
    target: { id: targetId, kasemText: target.kasemText ?? '', englishText: target.englishText ?? '' },
    source: { id: sourceId, kasemText: source.kasemText ?? '', englishText: source.englishText ?? '' },
    rows: mergePreview(target, source),
  };
});

// ---------------------------------------------------------------------------
// Editing a published entry
// ---------------------------------------------------------------------------

/**
 * A validator or admin corrects a published entry in place and republishes it.
 *
 * ── Why this does not go through a submission ─────────────────────────────
 * Because there is nobody to send it back to. The correction path that existed
 * asked a validator who had spotted a typo to contribute a fresh entry and have
 * a second validator approve it — which produced a duplicate, needed two people
 * for a one-character fix, and left the wrong entry live in the meantime. A
 * word already in the archive is edited where it is.
 *
 * ── What survives an edit, and why ────────────────────────────────────────
 * `contributorId`, `sourceContribution`, `createdAt` and `approvedBy` are the
 * provenance of the entry and are not in [EDITABLE_FIELDS], so no patch can
 * reach them: the person who gave the word keeps the credit for it however many
 * times a reviewer tidies the spelling afterwards. `audioUrl` likewise — the
 * recording is a fact about a speaker's voice, not a text field.
 *
 * `homographIndex` survives too, except on a respelling that moves the entry
 * into a different group. See [renumberOnRespell] for that one case.
 */
export const editDictionaryEntry = onCall(callableOptions(), async (req) => {
  const uid = requireAuth(req);
  requireRole(req, 'validator');
  await consumeRateLimit('editDictionaryEntry', uid, 120);

  const data = (req.data ?? {}) as JsonRecord;
  const entryId = requireId(data.entryId, 'entryId');
  const reason = requireReason(data.reason);
  const patch = parseEntryPatch(data.patch);
  if (patch.size === 0) {
    throw new HttpsError('invalid-argument', 'The edit changed nothing this backend can store.');
  }

  const db = getFirestore();
  const entryRef = db.collection(ENTRIES).doc(entryId);
  const auditRef = db.collection('auditLogs').doc();

  // The peers are read outside the transaction only when the headword is
  // actually moving groups, because a transaction takes all of its reads before
  // any of its writes and a query cannot be issued after the entry has been
  // read and inspected. Re-read inside so the numbering is still consistent.
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(entryRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Entry not found.');
    const existing: JsonRecord = { ...(snap.data() as JsonRecord), id: entryId };

    if (existing.mergedInto) {
      throw new HttpsError(
        'failed-precondition',
        'This entry has been merged into another one. Edit the entry it points at.',
      );
    }

    const result = applyEntryPatch(existing, patch);

    if (renumberOnRespell(result)) {
      const peerSnapshot = await tx.get(
        db.collection(ENTRIES).where('headwordKey', '==', result.newHeadwordKey).limit(MAX_HOMOGRAPH_PEERS),
      );
      const peers: HomographPeer[] = peerSnapshot.docs
        .filter((doc) => doc.id !== entryId)
        .map((doc) => ({
          id: doc.id,
          kasem: String(doc.get('kasemText') ?? ''),
          homographIndex: Number(doc.get('homographIndex') ?? 0) || 0,
        }));
      // `assignHomographIndex` returns the entry's own number when it finds
      // itself among the peers, which is exactly what must NOT happen here —
      // the number it carries belongs to the group it is leaving. Excluding it
      // above is what makes this hand out the next free number in the new
      // group instead.
      const renumbered = assignHomographIndex(entryId, peers);
      if (renumbered !== Number(existing.homographIndex ?? 0)) {
        result.update.homographIndex = renumbered;
        result.changes.push({
          field: 'homographIndex',
          before: existing.homographIndex ?? 0,
          after: renumbered,
        });
      }
    }

    if (Object.keys(result.update).length === 0) {
      return { entryId, changed: [] as string[], unchanged: true };
    }

    const now = nowIso();
    tx.update(entryRef, {
      ...result.update,
      editedBy: uid,
      editedAt: FieldValue.serverTimestamp(),
      editReason: reason,
      // A count on the document and the log in `auditLogs`, rather than a
      // revision array on the entry. The array is the tempting shape and it is
      // the one that eventually makes a much-corrected word too large to read;
      // the audit collection is one place, queryable across every entry, and
      // already what `AuditLogViewer` in the admin console reads.
      revisionCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });

    tx.set(auditRef, {
      id: auditRef.id,
      actor: { collection: 'validators', id: uid },
      action: 'dictionary.entry.edit',
      target: { collection: ENTRIES, id: entryId },
      outcome: 'success',
      source: 'functions',
      before: Object.fromEntries(result.changes.map((change) => [change.field, change.before ?? null])),
      after: Object.fromEntries(result.changes.map((change) => [change.field, change.after ?? null])),
      metadata: { reason, headword: result.update.kasemText ?? existing.kasemText ?? '' },
      occurredAt: now,
    });

    return {
      entryId,
      changed: result.changes.map((change) => change.field),
      unchanged: false,
    };
  });
});

// ---------------------------------------------------------------------------
// Merging
// ---------------------------------------------------------------------------

function parseChoices(raw: unknown): Record<string, MergeSide> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, MergeSide> = {};
  for (const [field, side] of Object.entries(raw as JsonRecord)) {
    if (side === 'source' || side === 'target') out[field] = side;
  }
  return out;
}

/**
 * Folds a duplicate into the entry that stays, and retires it.
 *
 * ── Which one is the target ───────────────────────────────────────────────
 * The caller decides, and the screen makes the consequence explicit: the target
 * keeps its document id, so every saved word, shared link, Kawuri citation and
 * printed reference that points at it keeps working, and every one that points
 * at the source is redirected rather than broken. The right target is almost
 * always the older, better-cited entry even when the newer one has the better
 * text — the text moves across, the identity cannot.
 *
 * ── Why the source is retired rather than deleted ─────────────────────────
 * A hard delete leaves a dangling id: a member's saved word, a link somebody
 * sent, a Kawuri answer that quoted it. Retiring writes `mergedInto` and
 * unpublishes, so the document is out of the dictionary but a reader arriving
 * at the old id can still be sent to the word it became. `disposition: 'delete'`
 * removes it outright for the case where it genuinely should never have
 * existed — an admin-only decision, with the whole document preserved in the
 * audit entry.
 */
export const mergeDictionaryEntries = onCall(callableOptions(), async (req) => {
  const uid = requireAuth(req);
  const role = requireRole(req, 'validator');
  await consumeRateLimit('mergeDictionaryEntries', uid, 60);

  const data = (req.data ?? {}) as JsonRecord;
  const targetId = requireId(data.targetId, 'targetId');
  const sourceId = requireId(data.sourceId, 'sourceId');
  const reason = requireReason(data.reason);
  const choices = parseChoices(data.choices);
  const disposition = data.disposition === 'delete' ? 'delete' : 'retire';
  if (targetId === sourceId) {
    throw new HttpsError('invalid-argument', 'An entry cannot be merged into itself.');
  }
  if (disposition === 'delete' && role !== 'admin' && role !== 'super_admin') {
    throw new HttpsError(
      'permission-denied',
      'Deleting the duplicate outright is an admin decision. Retire it instead — it stays out of the dictionary and old links still resolve.',
    );
  }

  const db = getFirestore();
  const targetRef = db.collection(ENTRIES).doc(targetId);
  const sourceRef = db.collection(ENTRIES).doc(sourceId);
  const auditRef = db.collection('auditLogs').doc();

  return db.runTransaction(async (tx) => {
    // Sequential rather than `Promise.all`: a Firestore transaction tracks the
    // reads it has performed, and issuing two through one await is the shape
    // that has historically produced the most confusing retry behaviour. Two
    // document reads are not the cost worth optimising here.
    const targetSnap = await tx.get(targetRef);
    const sourceSnap = await tx.get(sourceRef);
    if (!targetSnap.exists) throw new HttpsError('not-found', 'The entry to keep was not found.');
    if (!sourceSnap.exists) throw new HttpsError('not-found', 'The duplicate was not found.');
    const target: JsonRecord = { ...(targetSnap.data() as JsonRecord), id: targetId };
    const source: JsonRecord = { ...(sourceSnap.data() as JsonRecord), id: sourceId };

    if (source.mergedInto?.id === targetId) {
      // Already done. Idempotent rather than an error: a reviewer whose
      // connection dropped mid-merge should be able to press the button again.
      return { targetId, sourceId, changed: [] as string[], kept: [] as string[], alreadyMerged: true };
    }
    if (target.mergedInto) {
      throw new HttpsError(
        'failed-precondition',
        'The entry you are merging into has itself been merged away. Merge into the entry it points at.',
      );
    }

    const merged = mergeEntryDocuments({ target, source, choices });
    const now = nowIso();

    if (Object.keys(merged.update).length > 0) {
      tx.update(targetRef, {
        ...merged.update,
        // Kept as a list rather than a single id: a headword contributed by
        // four people over two years is merged three times, and an entry that
        // remembered only the last of them would credit one contributor and
        // silently drop three.
        mergedFrom: FieldValue.arrayUnion({ collection: ENTRIES, id: sourceId }),
        editedBy: uid,
        editedAt: FieldValue.serverTimestamp(),
        editReason: reason,
        revisionCount: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      tx.update(targetRef, {
        mergedFrom: FieldValue.arrayUnion({ collection: ENTRIES, id: sourceId }),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    if (disposition === 'delete') {
      tx.delete(sourceRef);
    } else {
      tx.update(sourceRef, {
        isPublished: false,
        mergedInto: { collection: ENTRIES, id: targetId },
        mergedAt: FieldValue.serverTimestamp(),
        mergedBy: uid,
        mergeReason: reason,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    tx.set(auditRef, {
      id: auditRef.id,
      actor: { collection: 'validators', id: uid },
      action: 'dictionary.entry.merge',
      target: { collection: ENTRIES, id: targetId },
      outcome: 'success',
      source: 'functions',
      before: {
        target: Object.fromEntries(merged.changes.map((change) => [change.field, change.before ?? null])),
        // The whole duplicate, so a merge that turns out to have been wrong can
        // be undone from the log even when the document was deleted outright.
        source,
      },
      after: Object.fromEntries(merged.changes.map((change) => [change.field, change.after ?? null])),
      metadata: {
        reason,
        sourceId,
        disposition,
        keptFromTarget: merged.kept,
        headword: target.kasemText ?? '',
      },
      occurredAt: now,
    });

    return {
      targetId,
      sourceId,
      changed: merged.changes.map((change) => change.field),
      kept: merged.kept,
      disposition,
      alreadyMerged: false,
    };
  });
});

// ---------------------------------------------------------------------------
// Deleting
// ---------------------------------------------------------------------------

/**
 * An admin removes an entry from the archive.
 *
 * ── Why this is not the same as unpublishing ──────────────────────────────
 * Unpublishing takes a word out of the dictionary and leaves the document, its
 * homograph number and its history in place, and it is the right answer to
 * almost everything: a disputed spelling, a word withdrawn by its contributor,
 * an entry waiting for a second opinion. Deleting is for the case where the row
 * should never have been written — a test entry, a paste of the wrong field, a
 * genuine duplicate with nothing worth merging — and it is irreversible from
 * the collection's point of view.
 *
 * So the document is copied into the audit entry before it goes. That is the
 * one thing that makes this survivable: an entry deleted in error can be
 * reconstructed from `auditLogs`, by hand, by somebody who knows it happened.
 * The homograph number it held is still spent, and stays spent.
 */
export const deleteDictionaryEntry = onCall(callableOptions(), async (req) => {
  const uid = requireAuth(req);
  requireRole(req, 'admin');
  await consumeRateLimit('deleteDictionaryEntry', uid, 30);

  const data = (req.data ?? {}) as JsonRecord;
  const entryId = requireId(data.entryId, 'entryId');
  const reason = requireReason(data.reason);

  const db = getFirestore();
  const entryRef = db.collection(ENTRIES).doc(entryId);
  const auditRef = db.collection('auditLogs').doc();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(entryRef);
    if (!snap.exists) {
      // Idempotent for the same reason the merge is: a retry after a dropped
      // connection should report success, not invent a failure.
      return { entryId, deleted: false, alreadyGone: true };
    }
    const entry = snap.data() as JsonRecord;

    tx.delete(entryRef);
    tx.set(auditRef, {
      id: auditRef.id,
      actor: { collection: 'validators', id: uid },
      action: 'dictionary.entry.delete',
      target: { collection: ENTRIES, id: entryId },
      outcome: 'success',
      source: 'functions',
      before: entry,
      after: null,
      metadata: { reason, headword: entry.kasemText ?? '' },
      occurredAt: nowIso(),
    });

    return { entryId, deleted: true, alreadyGone: false };
  });
});
