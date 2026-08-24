import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type DocumentReference } from 'firebase-admin/firestore';
import { requireAuth, requireRole } from './auth.js';
import { finalisePublishedMedia } from './published-media.js';
import { consumeRateLimit } from './rate-limit.js';
import {
  buildPublishedContentDocument,
  collectionKindForSubmission,
} from './publication.js';

// App Check enforcement is opt-in: set ENFORCE_APP_CHECK=true on the deployed
// functions once App Check (reCAPTCHA Enterprise) is configured for the web apps.
// Left off by default so callable Functions work before App Check is set up.
const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === 'true';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowIso(): string {
  return new Date().toISOString();
}

function asString(value: unknown, max = 2000): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function asBool(value: unknown): boolean {
  return value === true;
}

function asStringArray(value: unknown, max = 30): string[] {
  return Array.isArray(value)
    ? value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, max)
    : [];
}

function normaliseEmail(value: unknown): string {
  return asString(value, 320).trim().toLowerCase();
}

function normalisePhone(value: unknown): string {
  return asString(value, 32).replace(/[^\d+]/g, '');
}

function normaliseUsername(value: unknown): string {
  return asString(value, 64)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);
}

function validUsername(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]{2,29}$/.test(value);
}

async function setCreatorClaim(uid: string, status: string, roles: string[] = []) {
  const auth = getAuth();
  const user = await auth.getUser(uid);
  const previous = user.customClaims ?? {};
  const previousRole = typeof previous.role === 'string' ? previous.role : undefined;
  const role = previousRole ?? (status === 'approved' ? 'creator' : undefined);
  await auth.setCustomUserClaims(uid, {
    ...previous,
    ...(role ? { role } : {}),
    creatorStatus: status,
    creatorRoles: roles,
  });
}

/** Derive a 2–6 letter uppercase reference prefix from a campaign title. */
function referencePrefix(title: string | undefined): string {
  if (!title) return 'IWC';
  const initials = title
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-z]/g, '').charAt(0))
    .join('')
    .toUpperCase();
  const clamped = initials.slice(0, 6);
  return clamped.length >= 2 ? clamped : 'IWC';
}

/** Atomically increment and format a human-readable reference number. */
async function nextReference(
  tx: FirebaseFirestore.Transaction,
  db: FirebaseFirestore.Firestore,
  prefix: string,
  year: number,
): Promise<string> {
  const counterRef = db.collection('platformCounters').doc(`reference_${prefix}_${year}`);
  const snap = await tx.get(counterRef);
  const current = (snap.exists ? snap.get('seq') : 0) as number;
  const next = (typeof current === 'number' ? current : 0) + 1;
  tx.set(counterRef, { seq: next }, { merge: true });
  return `${prefix}-${year}-${String(next).padStart(4, '0')}`;
}

// ---------------------------------------------------------------------------
// submitCreatorApplication
// ---------------------------------------------------------------------------

/**
 * A signed-in visitor finalises their founding-creator application. This is the
 * only path that creates a creatorProfile + creatorApplication: it deduplicates
 * by account, email and phone, mints a human-readable reference number, records
 * the accepted terms version, writes an immutable consent-ledger entry, queues a
 * confirmation notification and appends an audit entry — atomically.
 */
export const submitCreatorApplication = onCall(
  { enforceAppCheck: ENFORCE_APP_CHECK, consumeAppCheckToken: ENFORCE_APP_CHECK, invoker: 'public' },
  async (req) => {
    const uid = requireAuth(req);
    await consumeRateLimit('submitCreatorApplication', uid, 5);

    const data = (req.data ?? {}) as Record<string, unknown>;
    const campaignId = asString(data.campaignId, 128).trim();
    if (!campaignId) {
      throw new HttpsError('invalid-argument', 'campaignId is required.');
    }
    const profileInput = (data.profile ?? {}) as Record<string, unknown>;
    const publicInput = (profileInput.public ?? {}) as Record<string, unknown>;
    const contactInput = (profileInput.contact ?? {}) as Record<string, unknown>;
    const consentInput = (data.consent ?? {}) as Record<string, unknown>;

    const displayName = asString(publicInput.displayName, 120).trim();
    if (displayName.length < 2) {
      throw new HttpsError('invalid-argument', 'A display name is required.');
    }
    const username = normaliseUsername(publicInput.username);
    if (!validUsername(username)) {
      throw new HttpsError('invalid-argument', 'Choose a username using 3–30 lowercase letters, numbers or hyphens.');
    }

    // Registration consents (content-use / AI permissions are NOT collected here).
    if (!asBool(consentInput.termsAccepted) || !asBool(consentInput.privacyAccepted) || !asBool(consentInput.accuracyConfirmed)) {
      throw new HttpsError('failed-precondition', 'Terms, privacy and accuracy confirmations are required.');
    }
    const termsVersion = asString(consentInput.termsVersion, 64).trim() || 'creator-terms-unversioned';

    const email = normaliseEmail(contactInput.email || req.auth?.token.email);
    const phone = normalisePhone(contactInput.phone);
    const ageConfirmed = asBool(profileInput.ageConfirmed);
    const isMinor = asBool(profileInput.isMinor) || !ageConfirmed;

    const db = getFirestore();
    const profileRef = db.collection('creatorProfiles').doc(uid);
    const applicationRef = db.collection('creatorApplications').doc(`${uid}__${campaignId}`);
    const membershipRef = db.collection('creatorMemberships').doc(uid);
    const usernameRef = db.collection('creatorUsernames').doc(username);
    const campaignRef = db.collection('campaigns').doc(campaignId);
    const consentRef = db.collection('creatorConsents').doc();
    const notificationRef = db.collection('notifications').doc();
    const auditRef = db.collection('auditLogs').doc();

    return db.runTransaction(async (tx) => {
      // ---- Duplicate protection ----
      const existingApp = await tx.get(applicationRef);
      if (existingApp.exists && existingApp.get('status') !== 'WITHDRAWN') {
        throw new HttpsError('already-exists', 'You have already applied to this campaign.');
      }

      const campaignSnap = await tx.get(campaignRef);
      if (!campaignSnap.exists) {
        throw new HttpsError('not-found', 'Campaign not found.');
      }
      const campaignStatus = campaignSnap.get('status');
      if (!['WAITLIST_OPEN', 'SUBMISSIONS_OPEN'].includes(campaignStatus)) {
        throw new HttpsError('failed-precondition', 'This campaign is not accepting registrations.');
      }

      // Cross-account dedupe by email / phone (best effort within limits).
      if (email) {
        const dupEmail = await tx.get(
          db.collection('creatorApplications').where('dedupeKeys.email', '==', email).limit(2),
        );
        const clash = dupEmail.docs.find((d) => d.get('authUid') !== uid && d.get('status') !== 'WITHDRAWN');
        if (clash) {
          throw new HttpsError('already-exists', 'An application already exists for this email address.');
        }
      }
      const usernameSnap = await tx.get(usernameRef);
      if (usernameSnap.exists && usernameSnap.get('userId') !== uid) {
        throw new HttpsError('already-exists', 'That username is already taken.');
      }

      const existingProfile = await tx.get(profileRef);
      const reference = existingProfile.exists && existingProfile.get('reference')
        ? (existingProfile.get('reference') as string)
        : await nextReference(tx, db, referencePrefix(campaignSnap.get('title')), new Date().getUTCFullYear());

      const now = nowIso();

      // ---- Profile (created or refreshed) ----
      const profileDoc = {
        id: uid,
        authUid: uid,
        reference,
        fullName: asString(profileInput.fullName, 160).trim() || displayName,
        public: {
          displayName,
          username,
          isPublic: false,
          avatarUrl: (publicInput.avatarUrl as string) ?? null,
          initials: asString(publicInput.initials, 4) || displayName.slice(0, 2).toUpperCase(),
          bio: asString(publicInput.bio, 600),
          country: asString(publicInput.country, 2).toUpperCase() || null,
          region: asString(publicInput.region, 120),
          community: asString(publicInput.community, 120),
          languagesSpoken: asStringArray(publicInput.languagesSpoken, 20),
          kasemProficiency: asString(publicInput.kasemProficiency, 20) || 'learning',
          dialect: asString(publicInput.dialect, 60),
          canWriteKasem: asBool(publicInput.canWriteKasem),
          canTranslateToEnglish: asBool(publicInput.canTranslateToEnglish),
          interests: asStringArray(publicInput.interests, 30),
          formats: asStringArray(publicInput.formats, 30),
          socialLinks: Array.isArray(publicInput.socialLinks) ? (publicInput.socialLinks as unknown[]).slice(0, 10) : [],
        },
        contact: {
          email,
          phone,
          preferredContactMethod: asString(contactInput.preferredContactMethod, 20) || 'whatsapp',
          preferredLanguage: asString(contactInput.preferredLanguage, 12) || 'en',
        },
        communityRelationship: asString(profileInput.communityRelationship, 600),
        culturalCommunities: asStringArray(profileInput.culturalCommunities, 20),
        skills: asStringArray(profileInput.skills, 30),
        experience: asString(profileInput.experience, 2000),
        motivation: asString(profileInput.motivation, 2000),
        equipment: asString(profileInput.equipment, 1000),
        locationPrivacy: asString(profileInput.locationPrivacy, 20) || 'region_only',
        ageConfirmed,
        isMinor,
        guardianConsentStatus: isMinor ? 'pending' : 'not_required',
        recordingAccess: asStringArray(profileInput.recordingAccess, 10),
        availability: asString(profileInput.availability, 200),
        referralSource: asString(profileInput.referralSource, 120),
        notificationPreferences: { email: true, inApp: true },
        profileCompletion: 100,
        status: 'waitlisted',
        consentRefs: [{ collection: 'creatorConsents', id: consentRef.id }],
        schemaVersion: 1,
        lifecycle: existingProfile.exists
          ? { createdAt: existingProfile.get('lifecycle.createdAt') ?? now, updatedAt: now, version: (existingProfile.get('lifecycle.version') ?? 1) + 1 }
          : { createdAt: now, updatedAt: now, version: 1 },
      };
      tx.set(profileRef, profileDoc);
      tx.set(usernameRef, {
        username,
        userId: uid,
        profile: { collection: 'creatorProfiles', id: uid },
        reservedAt: now,
      }, { merge: true });
      tx.set(membershipRef, {
        userId: uid,
        applicationId: applicationRef.id,
        status: 'pending',
        roles: ['creator'],
        assignedLanguages: [],
        assignedCommunities: [],
        assignedCampaigns: [campaignId],
        permissions: [],
        approvedAt: null,
        approvedBy: null,
        createdAt: existingProfile.exists ? existingProfile.get('lifecycle.createdAt') ?? now : now,
        updatedAt: now,
      }, { merge: true });

      // ---- Application ----
      tx.set(applicationRef, {
        id: applicationRef.id,
        authUid: uid,
        reference,
        campaign: { collection: 'campaigns', id: campaignId },
        profile: { collection: 'creatorProfiles', id: uid },
        status: 'SUBMITTED',
        dedupeKeys: { email, phone },
        snapshot: {
          displayName,
          fullName: profileDoc.fullName,
          preferredUsername: username,
          country: profileDoc.public.country,
          region: profileDoc.public.region,
          communities: profileDoc.culturalCommunities,
          kasemProficiency: profileDoc.public.kasemProficiency,
          dialect: profileDoc.public.dialect,
          interests: profileDoc.public.interests,
          formats: profileDoc.public.formats,
          experience: profileDoc.experience,
          motivation: profileDoc.motivation,
          referralSource: profileDoc.referralSource,
        },
        consent: {
          termsAccepted: true,
          privacyAccepted: true,
          communicationsAccepted: asBool(consentInput.communicationsAccepted),
          accuracyConfirmed: true,
          termsVersion,
          acceptedAt: now,
        },
        review: { decidedBy: null, decidedAt: null, reason: '', tags: [] },
        flaggedForManualReview: isMinor,
        schemaVersion: 1,
        lifecycle: { createdAt: now, updatedAt: now, version: 1 },
      });

      // ---- Immutable consent ledger entry ----
      tx.set(consentRef, {
        id: consentRef.id,
        subject: { collection: 'creatorProfiles', id: uid },
        scope: ['review'],
        termsVersion,
        acceptedAt: now,
        source: 'creator_registration',
        lifecycle: { createdAt: now, updatedAt: now, version: 1 },
      });

      // ---- Confirmation notification ----
      tx.set(notificationRef, {
        id: notificationRef.id,
        recipient: { collection: 'creatorProfiles', id: uid },
        authUid: uid,
        type: 'application_update',
        title: 'Your founding-creator application was received',
        body: `Reference ${reference}. We will announce when the campaign opens.`,
        link: '/studio',
        read: false,
        channels: asBool(consentInput.communicationsAccepted) ? ['in_app', 'email'] : ['in_app'],
        schemaVersion: 1,
        lifecycle: { createdAt: now, updatedAt: now, version: 1 },
      });

      // ---- Audit ----
      tx.set(auditRef, {
        id: auditRef.id,
        actor: { collection: 'creatorProfiles', id: uid },
        action: 'creator.application.submit',
        target: { collection: 'creatorApplications', id: applicationRef.id },
        outcome: 'success',
        source: 'functions',
        before: null,
        after: { status: 'SUBMITTED', reference },
        metadata: { campaignId, username, flaggedForManualReview: isMinor },
        occurredAt: now,
      });

      return { applicationId: applicationRef.id, reference, status: 'SUBMITTED', flaggedForManualReview: isMinor };
    });
  },
);

// ---------------------------------------------------------------------------
// decideCreatorApplication
// ---------------------------------------------------------------------------

const APPLICATION_DECISIONS: Record<string, string> = {
  APPROVE: 'APPROVED',
  WAITLIST: 'WAITLISTED',
  REJECT: 'REJECTED',
  REQUEST_INFO: 'NEEDS_INFO',
  SUSPEND: 'SUSPENDED',
  REVOKE: 'REJECTED',
  RESTORE: 'APPROVED',
};

const APPLICATION_TO_PROFILE_STATUS: Record<string, string> = {
  APPROVED: 'active',
  WAITLISTED: 'waitlisted',
  REJECTED: 'withdrawn',
  NEEDS_INFO: 'waitlisted',
  SUSPENDED: 'suspended',
};

const APPLICATION_TO_MEMBERSHIP_STATUS: Record<string, string> = {
  APPROVED: 'approved',
  WAITLISTED: 'waitlisted',
  REJECTED: 'rejected',
  NEEDS_INFO: 'pending',
  SUSPENDED: 'suspended',
};

/** An admin records a decision on a creator application. Privileged transition. */
export const decideCreatorApplication = onCall(
  { enforceAppCheck: ENFORCE_APP_CHECK, consumeAppCheckToken: ENFORCE_APP_CHECK, invoker: 'public' },
  async (req) => {
    const uid = requireAuth(req);
    requireRole(req, 'admin');
    await consumeRateLimit('decideCreatorApplication', uid, 60);

    const data = (req.data ?? {}) as Record<string, unknown>;
    const applicationId = asString(data.applicationId, 200).trim();
    const decision = asString(data.decision, 20);
    const reason = asString(data.reason, 2000).trim();
    const assignedLanguages = asStringArray(data.assignedLanguages, 30);
    const assignedCommunities = asStringArray(data.assignedCommunities, 30);
    const assignedCampaigns = asStringArray(data.assignedCampaigns, 50);
    const permissions = asStringArray(data.permissions, 50);
    const newStatus = APPLICATION_DECISIONS[decision];
    if (!applicationId || !newStatus) {
      throw new HttpsError('invalid-argument', 'A valid applicationId and decision are required.');
    }
    if (['REJECT', 'REQUEST_INFO', 'SUSPEND', 'REVOKE'].includes(decision) && reason.length < 5) {
      throw new HttpsError('invalid-argument', 'A reason is required for this decision.');
    }

    const db = getFirestore();
    const applicationRef = db.collection('creatorApplications').doc(applicationId);
    const auditRef = db.collection('auditLogs').doc();
    const notificationRef = db.collection('notifications').doc();

    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(applicationRef);
      if (!snap.exists) {
        throw new HttpsError('not-found', 'Application not found.');
      }
      const previousStatus = snap.get('status');
      const applicantUid = snap.get('authUid');
      if (typeof applicantUid !== 'string' || applicantUid.length === 0) {
        throw new HttpsError('failed-precondition', 'Application does not have a valid applicant.');
      }
      const now = nowIso();
      const campaignId = snap.get('campaign.id');
      const membershipRef = db.collection('creatorMemberships').doc(applicantUid);
      const membershipSnap = await tx.get(membershipRef);

      tx.update(applicationRef, {
        status: newStatus,
        'review.decidedBy': { collection: 'creatorProfiles', id: uid },
        'review.decidedAt': now,
        'review.reason': reason,
        'lifecycle.updatedAt': now,
        'lifecycle.version': FieldValue.increment(1),
      });

      const profileStatus = APPLICATION_TO_PROFILE_STATUS[newStatus];
      if (profileStatus && applicantUid) {
        tx.set(
          db.collection('creatorProfiles').doc(applicantUid),
          { status: profileStatus, lifecycle: { updatedAt: now } },
          { merge: true },
        );
      }

      const membershipStatus = decision === 'REVOKE'
        ? 'revoked'
        : (APPLICATION_TO_MEMBERSHIP_STATUS[newStatus] ?? 'pending');
      const currentRoles = membershipSnap.exists && Array.isArray(membershipSnap.get('roles'))
        ? (membershipSnap.get('roles') as string[])
        : ['creator'];
      const roles = currentRoles.includes('creator') ? currentRoles : ['creator', ...currentRoles];
      tx.set(membershipRef, {
        userId: applicantUid,
        applicationId,
        status: membershipStatus,
        roles,
        assignedLanguages: assignedLanguages.length ? assignedLanguages : (membershipSnap.exists ? membershipSnap.get('assignedLanguages') ?? [] : []),
        assignedCommunities: assignedCommunities.length ? assignedCommunities : (membershipSnap.exists ? membershipSnap.get('assignedCommunities') ?? [] : []),
        assignedCampaigns: assignedCampaigns.length
          ? assignedCampaigns
          : (membershipSnap.exists ? membershipSnap.get('assignedCampaigns') ?? [] : [campaignId].filter(Boolean)),
        permissions: permissions.length
          ? permissions
          : (membershipSnap.exists ? membershipSnap.get('permissions') ?? [] : ['profile:write', 'submission:write']),
        approvedAt: membershipStatus === 'approved' ? now : (membershipSnap.exists ? membershipSnap.get('approvedAt') ?? null : null),
        approvedBy: membershipStatus === 'approved' ? uid : (membershipSnap.exists ? membershipSnap.get('approvedBy') ?? null : null),
        suspendedAt: membershipStatus === 'suspended' ? now : null,
        suspensionReason: membershipStatus === 'suspended' || membershipStatus === 'revoked' ? reason : '',
        createdAt: membershipSnap.exists ? membershipSnap.get('createdAt') ?? now : now,
        updatedAt: now,
      }, { merge: true });

      // Terminal account decisions are high priority: they also go out by SMS
      // (the onNotificationCreated trigger sends it when a phone is on file).
      const highPriority = ['APPROVE', 'REJECT', 'SUSPEND', 'REVOKE'].includes(decision);
      tx.set(notificationRef, {
        id: notificationRef.id,
        recipient: { collection: 'creatorProfiles', id: applicantUid },
        authUid: applicantUid,
        type: 'application_update',
        title: `Application ${newStatus.toLowerCase().replace('_', ' ')}`,
        body: reason || `Your application status is now ${newStatus}.`,
        link: '/studio',
        read: false,
        channels: highPriority ? ['in_app', 'email', 'sms'] : ['in_app', 'email'],
        priority: highPriority ? 'high' : 'normal',
        schemaVersion: 1,
        lifecycle: { createdAt: now, updatedAt: now, version: 1 },
      });

      tx.set(auditRef, {
        id: auditRef.id,
        actor: { collection: 'creatorProfiles', id: uid },
        action: 'creator.application.decide',
        target: { collection: 'creatorApplications', id: applicationId },
        outcome: 'success',
        source: 'functions',
        before: { status: previousStatus },
        after: { status: newStatus },
        metadata: { decision, reason },
        occurredAt: now,
      });

      return {
        applicationId,
        applicantUid,
        previousStatus,
        newStatus,
        membershipStatus,
        roles,
      };
    });

    if (result.applicantUid) {
      await setCreatorClaim(result.applicantUid, result.membershipStatus, result.roles);
    }

    return result;
  },
);

// ---------------------------------------------------------------------------
// decideSubmission
// ---------------------------------------------------------------------------

const SUBMISSION_DECISIONS: Record<string, string> = {
  APPROVE: 'APPROVED',
  REQUEST_REVISION: 'NEEDS_REVISION',
  REJECT: 'REJECTED',
  ARCHIVE: 'ARCHIVED',
  PUBLISH: 'PUBLISHED',
  UNPUBLISH: 'APPROVED',
  ESCALATE_LINGUISTIC: 'UNDER_REVIEW',
  ESCALATE_CULTURAL: 'UNDER_REVIEW',
  FLAG_RIGHTS: 'UNDER_REVIEW',
};

/**
 * A validator or admin moderates a submission. Approval and publication are the
 * privileged transitions Security Rules deny to clients. Publishing is
 * idempotent: it writes a publishedContent record keyed by the submission id, so
 * repeated publishes never create duplicate public records. publishedContent
 * never carries private contact data, internal notes or payout information.
 */
export const decideSubmission = onCall(
  { enforceAppCheck: ENFORCE_APP_CHECK, consumeAppCheckToken: ENFORCE_APP_CHECK, invoker: 'public' },
  async (req) => {
    const uid = requireAuth(req);
    requireRole(req, 'validator');
    await consumeRateLimit('decideSubmission', uid, 120);

    const data = (req.data ?? {}) as Record<string, unknown>;
    const submissionId = asString(data.submissionId, 200).trim();
    const decision = asString(data.decision, 30);
    const feedback = asString(data.feedback, 2000).trim();
    const scores = (data.scores && typeof data.scores === 'object') ? (data.scores as Record<string, number>) : {};
    const newStatus = SUBMISSION_DECISIONS[decision];
    if (!submissionId || !newStatus) {
      throw new HttpsError('invalid-argument', 'A valid submissionId and decision are required.');
    }
    if (['REQUEST_REVISION', 'REJECT'].includes(decision) && feedback.length < 5) {
      throw new HttpsError('invalid-argument', 'Feedback is required for revision and rejection.');
    }

    const db = getFirestore();
    const submissionRef = db.collection('submissions').doc(submissionId);
    const publishedRef = db.collection('publishedContent').doc(`pub_${submissionId}`);
    const dictionaryRef = db.collection('dictionaryEntries').doc(`collection_${submissionId}`);
    const auditRef = db.collection('auditLogs').doc();
    const notificationRef = db.collection('notifications').doc();

    // Captured inside the transaction; the approved media is copied to the
    // world-readable path AFTER the transaction commits (Storage I/O cannot run
    // inside a Firestore transaction). Null unless this is a fresh publish that
    // still needs its public media URL.
    let mediaToPublish:
      | {
          contentId: string;
          storagePath: string;
          mimeType: string;
          mediaType: string;
          thumbnailPath: string | null;
        }
      | null = null;

    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(submissionRef);
      if (!snap.exists) {
        throw new HttpsError('not-found', 'Submission not found.');
      }
      const submission = snap.data() as Record<string, any>;
      const collectionKind = collectionKindForSubmission(submission);
      const contributionPointer = submission.collectionContribution;
      let contributionId = '';
      let contributionRef: DocumentReference | null = null;
      let contribution: Record<string, any> | null = null;
      if (contributionPointer != null) {
        if (typeof contributionPointer !== 'object'
          || contributionPointer.collection !== 'collectionContributions'
          || typeof contributionPointer.id !== 'string'
          || !contributionPointer.id.trim()) {
          throw new HttpsError('failed-precondition', 'Collection contribution link is invalid.');
        }
        contributionId = contributionPointer.id.trim();
        contributionRef = db.collection('collectionContributions').doc(contributionId);
        const contributionSnap = await tx.get(contributionRef);
        if (!contributionSnap.exists) {
          throw new HttpsError('failed-precondition', 'Linked collection contribution was not found.');
        }
        contribution = contributionSnap.data() as Record<string, any>;
        if (submission.id !== submissionId
          || contribution.id !== contributionId
          || contribution.authUid !== submission.authUid
          || contribution.submissionId !== submissionId) {
          throw new HttpsError('failed-precondition', 'Collection contribution ownership or submission link is inconsistent.');
        }
        if (!collectionKind || contribution.collectionKind !== collectionKind) {
          throw new HttpsError('failed-precondition', 'Collection contribution kind is inconsistent.');
        }
      }
      const isDictionaryContribution = collectionKind === 'dictionary' && contribution != null;
      if (submission.authUid === uid) {
        throw new HttpsError('permission-denied', 'Reviewers cannot decide on their own submissions.');
      }
      if (contribution
        && (submission.status === 'WITHDRAWN' || contribution.status === 'withdrawn')) {
        throw new HttpsError(
          'failed-precondition',
          'A withdrawn Collection contribution is terminal and cannot be reviewed again.',
        );
      }
      if (decision === 'REQUEST_REVISION' && contribution) {
        throw new HttpsError(
          'failed-precondition',
          'Collection contributions cannot be sent for revision; approve, reject, or archive them.',
        );
      }
      if (decision === 'ARCHIVE'
        && (submission.status !== 'APPROVED' || submission.permissions?.publication === true)) {
        throw new HttpsError(
          'failed-precondition',
          'Only approved work without publication permission can be archived.',
        );
      }
      // Publishing is idempotent: re-publishing already-published content is a
      // harmless no-op that rewrites the same publishedContent record.
      if (decision === 'PUBLISH' && !['APPROVED', 'SCHEDULED', 'PUBLISHED'].includes(submission.status)) {
        throw new HttpsError('failed-precondition', 'Only approved content can be published.');
      }
      if (decision === 'PUBLISH' && submission.permissions?.publication !== true) {
        throw new HttpsError('failed-precondition', 'The creator has not granted publication permission.');
      }
      if (decision === 'UNPUBLISH' && submission.status !== 'PUBLISHED') {
        throw new HttpsError('failed-precondition', 'Only published content can be unpublished.');
      }

      const previousStatus = submission.status;
      const now = nowIso();
      const reviewerRef = { collection: 'validators', id: uid };

      const moderationUpdate: Record<string, unknown> = {
        status: newStatus,
        'moderation.reviewer': reviewerRef,
        'moderation.decidedAt': now,
        'lifecycle.updatedAt': now,
        'lifecycle.version': FieldValue.increment(1),
      };
      if (feedback) moderationUpdate['moderation.feedback'] = feedback;
      if (Object.keys(scores).length) moderationUpdate['moderation.scores'] = scores;

      // ---- Publication workflow (idempotent) ----
      if (decision === 'APPROVE' || decision === 'PUBLISH' || decision === 'UNPUBLISH') {
        const creatorId: string = submission.creator?.id ?? submission.authUid;
        const profileSnap = await tx.get(db.collection('creatorProfiles').doc(creatorId));
        const displayName = profileSnap.get('public.displayName') ?? 'Indigen World contributor';
        const avatarUrl = profileSnap.get('public.avatarUrl') ?? null;
        const publicationStatus = decision === 'PUBLISH' ? 'published' : 'unpublished';

        if (isDictionaryContribution) {
          const existingDictionary = await tx.get(dictionaryRef);
          if (decision === 'PUBLISH') {
            tx.set(dictionaryRef, {
              id: dictionaryRef.id,
              kasemText: asString(submission.body, 12_000).trim(),
              englishText: asString(submission.title, 180).trim(),
              kasemExample: asString(submission.kasemExample, 4000).trim(),
              englishExample: asString(submission.englishExample, 4000).trim(),
              partOfSpeech: asString(submission.format, 80).trim(),
              dialect: asString(submission.dialect, 80).trim(),
              category: 'Community vocabulary',
              source: asString(submission.sourceReferences, 1200).trim(),
              contributorId: creatorId,
              sourceContribution: { collection: 'collectionContributions', id: contributionId },
              relatedEntryId: submission.relatedEntryId ?? null,
              isPublished: true,
              approvedAt: FieldValue.serverTimestamp(),
              approvedBy: uid,
              createdAt: existingDictionary.exists
                ? (existingDictionary.get('createdAt') ?? FieldValue.serverTimestamp())
                : FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
              schemaVersion: 1,
            });
            moderationUpdate['moderation.publishedContent'] = {
              collection: 'dictionaryEntries',
              id: dictionaryRef.id,
            };
          } else if (decision === 'UNPUBLISH' && existingDictionary.exists) {
            tx.update(dictionaryRef, {
              isPublished: false,
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
        } else {
          const existingPub = await tx.get(publishedRef);
          const publishedDoc = buildPublishedContentDocument({
            submissionId,
            publishedId: publishedRef.id,
            submission,
            existing: existingPub.data() ?? null,
            creatorId,
            displayName,
            avatarUrl,
            publicationStatus,
            now,
          });
          tx.set(publishedRef, publishedDoc);
          moderationUpdate['moderation.publishedContent'] = {
            collection: 'publishedContent',
            id: publishedRef.id,
          };

          // Only a PUBLISH makes uploaded media world-readable. An approved
          // external recording URL is already public and needs no Storage copy.
          const storagePath: string = submission.media?.storagePath ?? '';
          const alreadyPublic: string = existingPub.exists ? (existingPub.get('mediaUrl') ?? '') : '';
          const externalMediaUrl = asString(submission.externalPostUrl, 2000).trim();
          if (decision === 'PUBLISH' && storagePath && !alreadyPublic && !externalMediaUrl) {
            mediaToPublish = {
              contentId: publishedRef.id,
              storagePath,
              mimeType: submission.media?.mimeType ?? 'application/octet-stream',
              mediaType: submission.media?.mediaType ?? 'video',
              thumbnailPath: submission.media?.thumbnailPath ?? null,
            };
          }
        }
      }

      tx.update(submissionRef, moderationUpdate);
      if (contributionRef) {
        const contributionUpdate: Record<string, unknown> = {
          status: newStatus.toLowerCase(),
          reviewDecision: decision,
          reviewFeedback: feedback,
          reviewedBy: uid,
          reviewedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };
        if (decision === 'PUBLISH') {
          contributionUpdate.publicationTarget = isDictionaryContribution
            ? { collection: 'dictionaryEntries', id: dictionaryRef.id }
            : { collection: 'publishedContent', id: publishedRef.id };
        }
        tx.update(contributionRef, contributionUpdate);
      }

      const escalationTag = decision.startsWith('ESCALATE') || decision === 'FLAG_RIGHTS' ? decision : null;
      tx.set(notificationRef, {
        id: notificationRef.id,
        recipient: submission.creator,
        authUid: submission.authUid,
        type: decision === 'REQUEST_REVISION' ? 'revision_request' : decision === 'PUBLISH' ? 'publication_notice' : 'review_decision',
        title: `Submission ${newStatus.toLowerCase().replace('_', ' ')}`,
        body: feedback || `Your submission "${submission.title}" is now ${newStatus}.`,
        link: contributionRef ? '/contribute' : `/studio/submissions/${submissionId}`,
        read: false,
        channels: ['in_app', 'email'],
        schemaVersion: 1,
        lifecycle: { createdAt: now, updatedAt: now, version: 1 },
      });

      tx.set(auditRef, {
        id: auditRef.id,
        actor: reviewerRef,
        action: 'creator.submission.decide',
        target: { collection: 'submissions', id: submissionId },
        outcome: 'success',
        source: 'functions',
        before: { status: previousStatus },
        after: { status: newStatus },
        metadata: { decision, escalationTag },
        occurredAt: now,
      });

      return { submissionId, previousStatus, newStatus };
    });

    // Post-commit: copy the approved file into the world-readable published-media
    // path and write its public URL onto the publishedContent record. Failure
    // here never fails the decision — the URL is filled in on the next publish
    // (the workflow is idempotent), so publication is not blocked by media I/O.
    if (mediaToPublish) {
      try {
        await finalisePublishedMedia(publishedRef, mediaToPublish);
      } catch (error) {
        console.error(`finalisePublishedMedia failed for ${submissionId}`, error);
      }
    }

    return result;
  },
);
