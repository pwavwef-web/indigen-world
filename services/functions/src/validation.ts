import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import commonSchema from '@indigen-world/contracts/schemas/common.schema.json';
import { requireAuth, requireRole } from './lib/auth.js';

// Canonical validation statuses come from the shared contract, not a local copy.
const VALIDATION_STATUSES = new Set<string>(
  (commonSchema.$defs as { validationStatus: { enum: string[] } }).validationStatus.enum,
);

const CONTENT_COLLECTIONS = new Set(['lexicalEntries', 'sentencePairs']);

// A validator's decision maps to the resulting content status.
const DECISION_TO_STATUS: Record<string, string> = {
  approved: 'validated',
  rejected: 'rejected',
  needs_changes: 'needs_changes',
  escalated: 'in_review',
};

/**
 * A validator (or admin) records a review decision on a content record. This is
 * the privileged transition the Security Rules deny to clients: it updates the
 * content's validation status, writes an immutable review, and appends an audit
 * entry — atomically.
 */
export const decideReview = onCall(async (req) => {
  const uid = requireAuth(req);
  requireRole(req, 'validator');

  const { targetCollection, targetId, decision, notes, changesRequested } = req.data ?? {};

  if (typeof targetCollection !== 'string' || !CONTENT_COLLECTIONS.has(targetCollection)) {
    throw new HttpsError('invalid-argument', 'Unsupported target collection.');
  }
  if (typeof targetId !== 'string' || targetId.length === 0) {
    throw new HttpsError('invalid-argument', 'targetId is required.');
  }
  const newStatus = DECISION_TO_STATUS[decision];
  if (!newStatus || !VALIDATION_STATUSES.has(newStatus)) {
    throw new HttpsError('invalid-argument', `Unknown decision: ${String(decision)}.`);
  }

  const db = getFirestore();
  const targetRef = db.doc(`${targetCollection}/${targetId}`);
  const reviewRef = db.collection('reviews').doc();
  const auditRef = db.collection('auditLogs').doc();
  const validatorRef = { collection: 'validators', id: uid };

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(targetRef);
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Target content not found.');
    }
    const previousStatus: string = snap.get('governance.validationStatus') ?? 'draft';

    tx.update(targetRef, {
      'governance.validationStatus': newStatus,
      'governance.validator': validatorRef,
      'lifecycle.updatedAt': FieldValue.serverTimestamp(),
      'lifecycle.version': FieldValue.increment(1),
      'lifecycle.auditRefs': FieldValue.arrayUnion({ collection: 'auditLogs', id: auditRef.id }),
    });

    tx.set(reviewRef, {
      id: reviewRef.id,
      target: { collection: targetCollection, id: targetId },
      validator: validatorRef,
      decision,
      previousStatus,
      newStatus,
      notes: typeof notes === 'string' ? notes : null,
      changesRequested: Array.isArray(changesRequested) ? changesRequested : [],
      decidedAt: FieldValue.serverTimestamp(),
      lifecycle: {
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        version: 1,
      },
    });

    tx.set(auditRef, {
      id: auditRef.id,
      actor: validatorRef,
      action: 'content.validate',
      target: { collection: targetCollection, id: targetId },
      outcome: 'success',
      source: 'functions',
      before: { validationStatus: previousStatus },
      after: { validationStatus: newStatus },
      metadata: { reviewId: reviewRef.id, decision },
      occurredAt: FieldValue.serverTimestamp(),
    });

    return { reviewId: reviewRef.id, previousStatus, newStatus };
  });
});
