import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { allSchemas } from '@indigen-world/contracts';
import commonSchema from '@indigen-world/contracts/schemas/common.schema.json' with { type: 'json' };
import { requireAuth, requireRole } from './auth.js';
import { consumeRateLimit } from './rate-limit.js';

// Canonical validation statuses come from the shared contract, not a local copy.
const VALIDATION_STATUSES = new Set<string>(
  (commonSchema.$defs as { validationStatus: { enum: string[] } }).validationStatus.enum,
);

const CONTENT_COLLECTIONS = new Set(['lexicalEntries', 'sentencePairs']);
const COLLECTION_SCHEMA_IDS: Record<string, string> = {
  lexicalEntries: 'https://schemas.indigen-world.org/v0/lexical-entry.schema.json',
  sentencePairs: 'https://schemas.indigen-world.org/v0/sentence-pair.schema.json',
};
const COLLECTION_SCOPES: Record<string, string> = {
  lexicalEntries: 'lexical',
  sentencePairs: 'sentence',
};
const PUBLICATION_LICENCES = new Set([
  'community_restricted',
  'cc_by',
  'cc_by_sa',
  'cc_by_nc',
  'public_domain',
]);
// App Check enforcement is opt-in (see creators.ts): enable via ENFORCE_APP_CHECK=true
// on the deployed functions once App Check is configured for the web apps.
const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === 'true';

let contentValidators: Map<string, ValidateFunction> | undefined;

function getContentValidator(collection: string): ValidateFunction | undefined {
  if (!contentValidators) {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats.default(ajv);
    for (const schema of allSchemas) ajv.addSchema(schema);
    contentValidators = new Map(
      Object.entries(COLLECTION_SCHEMA_IDS).flatMap(([name, schemaId]) => {
        const validate = ajv.getSchema(schemaId);
        return validate ? [[name, validate]] : [];
      }),
    );
  }
  return contentValidators.get(collection);
}

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
export const decideReview = onCall({
  enforceAppCheck: ENFORCE_APP_CHECK,
  consumeAppCheckToken: ENFORCE_APP_CHECK,
  invoker: 'public',
}, async (req) => {
  const uid = requireAuth(req);
  const actorRole = requireRole(req, 'validator');
  await consumeRateLimit('decideReview', uid, 30);

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
  const reviewNotes = typeof notes === 'string' ? notes.trim() : '';
  if (reviewNotes.length < 10 || reviewNotes.length > 2000) {
    throw new HttpsError('invalid-argument', 'A review reason of 10–2000 characters is required.');
  }
  const requestedChanges = Array.isArray(changesRequested)
    ? changesRequested.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  if (decision === 'needs_changes' && requestedChanges.length === 0) {
    throw new HttpsError('invalid-argument', 'List at least one requested change.');
  }

  const db = getFirestore();
  const targetRef = db.doc(`${targetCollection}/${targetId}`);
  const reviewRef = db.collection('reviews').doc();
  const auditRef = db.collection('auditLogs').doc();
  const validatorRef = { collection: 'validators', id: uid };
  const validatorDocRef = db.collection('validators').doc(uid);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(targetRef);
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Target content not found.');
    }
    const previousStatus: string = snap.get('governance.validationStatus') ?? 'draft';
    const isEscalationFollowUp = previousStatus === 'in_review' && actorRole === 'admin';
    if (previousStatus !== 'submitted' && !isEscalationFollowUp) {
      throw new HttpsError('failed-precondition', 'Only submitted content can be reviewed; escalations require an admin.');
    }
    if (isEscalationFollowUp && decision === 'escalated') {
      throw new HttpsError('failed-precondition', 'Escalated content must receive a final decision.');
    }

    const content = snap.data() as Record<string, any>;
    const governance = content.governance as Record<string, any> | undefined;
    if (!governance || governance.contributor?.id === uid) {
      throw new HttpsError('permission-denied', 'Validators cannot review their own contributions.');
    }

    const validatorSnap = await tx.get(validatorDocRef);
    const validator = validatorSnap.data() as Record<string, any> | undefined;
    if (!validatorSnap.exists || validator?.status !== 'active') {
      throw new HttpsError('permission-denied', 'An active validator profile is required.');
    }
    if (validator.contributor?.id === governance.contributor?.id) {
      throw new HttpsError('permission-denied', 'Validators cannot review their own contributions.');
    }
    const languageId = governance.language?.id;
    const languageAuthorised = Array.isArray(validator.languages)
      && validator.languages.some((item: any) => item?.collection === 'languages' && item?.id === languageId);
    const scopes = Array.isArray(validator.authorityScope) ? validator.authorityScope : [];
    if (!languageAuthorised || (!scopes.includes('all') && !scopes.includes(COLLECTION_SCOPES[targetCollection]))) {
      throw new HttpsError('permission-denied', 'This content is outside the validator’s language or content scope.');
    }

    const consentRef = governance.consent;
    if (governance.consentStatus !== 'granted' || consentRef?.collection !== 'consentRecords'
      || typeof consentRef.id !== 'string') {
      throw new HttpsError('failed-precondition', 'Active, referenced consent is required.');
    }
    const consentSnap = await tx.get(db.collection('consentRecords').doc(consentRef.id));
    const consent = consentSnap.data() as Record<string, any> | undefined;
    const today = new Date().toISOString().slice(0, 10);
    const consentActive = consentSnap.exists
      && consent?.status === 'granted'
      && consent?.subject?.id === governance.contributor?.id
      && Array.isArray(consent?.scope)
      && consent.scope.includes('publication')
      && typeof consent.effectiveFrom === 'string'
      && consent.effectiveFrom <= today
      && (consent.expiresAt == null || (typeof consent.expiresAt === 'string' && consent.expiresAt >= today));
    if (newStatus === 'validated') {
      if (!consentActive) {
        throw new HttpsError('failed-precondition', 'Consent is missing, withdrawn, expired, or does not permit publication.');
      }
      if (!PUBLICATION_LICENCES.has(governance.licence)) {
        throw new HttpsError('failed-precondition', 'The selected licence does not permit publication.');
      }
    }

    const now = new Date().toISOString();
    const nextContent = structuredClone(content);
    nextContent.governance.validationStatus = newStatus;
    nextContent.governance.validator = validatorRef;
    nextContent.lifecycle.updatedAt = now;
    nextContent.lifecycle.version = Number(nextContent.lifecycle.version ?? 0) + 1;
    nextContent.lifecycle.auditRefs = [
      ...(Array.isArray(nextContent.lifecycle.auditRefs) ? nextContent.lifecycle.auditRefs : []),
      { collection: 'auditLogs', id: auditRef.id },
    ];
    const validate = getContentValidator(targetCollection);
    if (!validate || !validate(nextContent)) {
      throw new HttpsError('failed-precondition', 'Content does not match the canonical schema.', {
        errors: validate?.errors?.map((error) => ({
          instancePath: error.instancePath,
          message: error.message,
        })),
      });
    }

    tx.update(targetRef, {
      'governance.validationStatus': newStatus,
      'governance.validator': validatorRef,
      'lifecycle.updatedAt': now,
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
      notes: reviewNotes,
      changesRequested: requestedChanges,
      decidedAt: now,
      lifecycle: {
        createdAt: now,
        updatedAt: now,
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
      occurredAt: now,
    });

    return { reviewId: reviewRef.id, previousStatus, newStatus };
  });
});
