import { createHash } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { requireAuth, requireRole } from './auth.js';
import { guarded } from './contributor-common.js';
import { rewardSettings } from './contributor-rewards.js';
import { consumeRateLimit } from './rate-limit.js';
import { ARKESEL_API_KEY, isSmsConfigured, normalizeMsisdn, sendSmsToMsisdn } from './sms.js';
import { COLLECTION_CAMPAIGN_ID, buildCollectionCampaignDocument, buildCollectionContributionReceipt,
  buildCollectionSubmissionDocument, parseCollectionContributionInput } from './collection-contributions.js';

const options = { region: 'us-central1', invoker: 'public' as const,
  enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true' };
const origin = 'https://tribestudio.indigenworld.com';
const contributorRoles = ['translator', 'storyteller', 'researcher', 'reviewer'] as const;
const contributionTypes = ['expressions', 'articles', 'stories', 'research', 'audio'] as const;
const accountStatuses = ['active', 'suspended', 'deactivated'] as const;
function text(value: unknown, max: number, optional = false): string {
  if (typeof value !== 'string' || value.trim().length > max || (!optional && !value.trim())) {
    throw new HttpsError('invalid-argument', 'Missing or oversized text.');
  }
  return value.trim();
}
function optionalText(value: unknown, max: number): string {
  if (value == null || value === '') return '';
  return text(value, max, true);
}
function optionalUrl(value: unknown, max: number): string {
  const result = optionalText(value, max);
  if (!result) return '';
  try {
    const parsed = new URL(result);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return parsed.toString();
  } catch {
    // Fall through to the same field-safe message for malformed URLs.
  }
  throw new HttpsError('invalid-argument', 'Profile links must use an http or https URL.');
}
function id(value: unknown): string {
  const result = text(value, 128);
  if (!/^[a-zA-Z0-9_-]+$/.test(result)) throw new HttpsError('invalid-argument', 'Invalid identifier.');
  return result;
}
function selectedStrings<T extends string>(value: unknown, allowed: readonly T[], field: string): T[] {
  if (!Array.isArray(value)) throw new HttpsError('invalid-argument', `${field} must be a list.`);
  const values = [...new Set(value.map(entry => String(entry)))];
  if (values.some(entry => !allowed.includes(entry as T))) {
    throw new HttpsError('invalid-argument', `${field} includes an unsupported value.`);
  }
  return values as T[];
}
function profileFields(raw: Record<string, unknown>) {
  const publicInput = raw.public && typeof raw.public === 'object'
    ? raw.public as Record<string, unknown>
    : {};
  const privateInput = raw.private && typeof raw.private === 'object'
    ? raw.private as Record<string, unknown>
    : {};
  const permissionInput = raw.permissions && typeof raw.permissions === 'object'
    ? raw.permissions as Record<string, unknown>
    : {};
  return {
    public: {
      displayName: text(publicInput.displayName, 120),
      photoUrl: optionalUrl(publicInput.photoUrl, 2000),
      biography: optionalText(publicInput.biography, 2000),
      expertise: selectedStrings(publicInput.expertise ?? [], [
        'language', 'culture', 'history', 'music', 'storytelling', 'research', 'editing',
      ], 'Expertise'),
      location: optionalText(publicInput.location, 160),
      website: optionalUrl(publicInput.website, 2000),
      socialLinks: optionalText(publicInput.socialLinks, 3000),
    },
    private: {
      email: optionalText(privateInput.email, 254).toLowerCase(),
      phone: optionalText(privateInput.phone, 80),
      notes: optionalText(privateInput.notes, 5000),
    },
    roles: selectedStrings(raw.roles ?? [], contributorRoles, 'Roles'),
    contributionTypes: selectedStrings(raw.contributionTypes ?? [], contributionTypes, 'Contribution types'),
    permissions: {
      submit: permissionInput.submit === true,
      edit: permissionInput.edit === true,
      review: permissionInput.review === true,
      publish: permissionInput.publish === true,
    },
  };
}
function auditRecord(actor: string, action: string, target: string, before: unknown, after: unknown,
  metadata: Record<string, unknown> = {}) {
  return {
    actor: { collection: 'contributors', id: actor },
    action,
    target: { collection: 'contributors', id: target },
    outcome: 'success',
    source: 'functions',
    before,
    after,
    metadata,
    occurredAt: new Date().toISOString(),
  };
}
export function parseExpressionAnswer(raw: Record<string, unknown>) {
  const translation = text(raw.translation, 2000, true);
  if (!Array.isArray(raw.alternatives) || raw.alternatives.length > 12) {
    throw new HttpsError('invalid-argument', 'Use at most twelve alternate expressions.');
  }
  const alternatives = [...new Set(raw.alternatives.map(v => text(v, 500, true)).filter(Boolean))]
    .filter(v => v !== translation);
  if (alternatives.join('\n').length > 3500) {
    throw new HttpsError('invalid-argument', 'Alternate expressions must total no more than 3,500 characters.');
  }
  // Optional usage note: who says it, to whom, where. Only a client that shows
  // the field sends it, so an older build never blanks a note it cannot see.
  if (raw.context == null) return { translation, alternatives };
  return { translation, alternatives, context: text(raw.context, 1000, true) };
}

/** Reviewer notes for a submitted expression: usage first, then the alternatives. */
export function expressionReviewNotes(alternatives: string[], context = ''): string {
  return [
    context ? `Context and usage:\n${context}` : '',
    alternatives.length ? `Other ways of saying it in Kasem:\n${alternatives.join('\n')}` : '',
  ].filter(Boolean).join('\n\n').slice(0, 4000);
}

export function assignmentInstructions(raw: Record<string, unknown>) {
  return Object.fromEntries(['dialect', 'tone', 'deadline', 'helpContact'].map(key => [key, raw[key] == null ? '' : text(raw[key], 500, true)]));
}

export function contributorPhone(value: unknown): string {
  const raw = text(value, 80);
  if (!/^[+\d\s().-]+$/.test(raw)) throw new HttpsError('invalid-argument', 'Enter a valid SMS phone number.');
  const phone = normalizeMsisdn(raw);
  if (!/^[1-9]\d{7,14}$/.test(phone)) throw new HttpsError('invalid-argument', 'Enter a phone number with country code, or a Ghana number such as 0241234567.');
  return '+' + phone;
}

export function contributorInvitationMessage(email: string, phone: string, portalUrl: string, temporary: boolean): string {
  return `Indigen World: Your contributor assignment is ready. ${portalUrl}\nEmail: ${email}\n`
    + (temporary ? `Temporary password: your phone number ${phone}. Sign in, then choose a new password.`
      : 'Sign in with your existing password. If forgotten, use Forgot password on the portal.');
}

async function deliverContributorInvitation(uid: string, email: string, phone: string, portalUrl: string, temporary: boolean, passwordPhone = phone) {
  const result = await sendSmsToMsisdn(phone.slice(1), contributorInvitationMessage(email, passwordPhone, portalUrl, temporary));
  const sms = { status: result.ok ? 'accepted' : 'failed', to: phone, id: result.id ?? null,
    attemptedAt: new Date().toISOString() };
  await getFirestore().doc(`contributorAccounts/${uid}`).update({ 'invitation.sms': sms });
  return sms;
}

// An invitation sends an SMS only after its account and assignment have been saved.
export const inviteExpressionContributor = onCall({ ...options, secrets: [ARKESEL_API_KEY] }, async req => {
  const actor = requireAuth(req); requireRole(req, 'admin');
  await consumeRateLimit('inviteExpressionContributor', actor, 10);
  const email = text(req.data?.email, 254).toLowerCase();
  const requestedContributorId = req.data?.contributorId == null ? '' : id(req.data.contributorId);
  const requestId = id(req.data?.requestId);
  const phoneNumber = contributorPhone(req.data?.phoneNumber);
  if (!isSmsConfigured()) throw new HttpsError('failed-precondition', 'SMS is not configured. No invitation was created.');
  const expressions = req.data?.expressions;
  if (!Array.isArray(expressions) || !expressions.length || expressions.length > 100) {
    throw new HttpsError('invalid-argument', 'Provide 1–100 expressions.');
  }
  const prompts = [...new Set(expressions.map(v => text(v, 180)))];
  const title = req.data?.title == null ? 'Everyday expressions' : text(req.data.title, 120);
  const instructions = optionalText(req.data?.instructions, 3000);
  const deadline = optionalText(req.data?.deadline, 40);
  const guidance = assignmentInstructions(req.data ?? {});
  let user;
  let createdUser = false;
  if (requestedContributorId) {
    try {
      user = await getAuth().getUser(requestedContributorId);
      if (user.email?.toLowerCase() !== email) {
        throw new HttpsError('already-exists', 'This contributor profile is linked to a different email address.');
      }
    } catch (error) {
      if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
      try {
        const existing = await getAuth().getUserByEmail(email);
        if (existing.uid !== requestedContributorId) {
          throw new HttpsError('already-exists', 'That email already belongs to another account.');
        }
        user = existing;
      } catch (emailError) {
        if ((emailError as { code?: string }).code !== 'auth/user-not-found') throw emailError;
        user = await getAuth().createUser({
          uid: requestedContributorId,
          email,
          password: phoneNumber,
          displayName: optionalText(req.data?.displayName, 120) || undefined,
        });
        createdUser = true;
      }
    }
  } else {
    try { user = await getAuth().getUserByEmail(email); }
    catch (error) {
      if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
      user = await getAuth().createUser({ email, password: phoneNumber, displayName: optionalText(req.data?.displayName, 120) || undefined });
      createdUser = true;
    }
  }
  const db = getFirestore();
  const accountRef = db.doc(`contributorAccounts/${user.uid}`);
  const profileRef = db.doc(`contributors/${user.uid}`);
  const [accountBefore, profileBefore] = await Promise.all([accountRef.get(), profileRef.get()]);
  if (accountBefore.exists && accountBefore.get('invitation.status') !== 'cancelled') {
    if (accountBefore.get('invitation.requestId') === requestId) {
      const work = String(accountBefore.get('defaultWork'));
      return { contributorId: user.uid, work, portalUrl: `${origin}/contributor/${user.uid}/${work}`,
        loginMethod: accountBefore.get('temporaryPhonePassword') === true ? 'phone' : 'existing',
        sms: accountBefore.get('invitation.sms') ?? { status: 'pending', to: phoneNumber } };
    }
    throw new HttpsError('already-exists', 'This contributor is already invited. Use Resend invitation or assign another set.');
  }
  if (user.disabled) {
    // A cancelled invitation is explicitly reversible. Other disabled accounts
    // must be reactivated from Access & visibility before new work is assigned.
    if (requestedContributorId && accountBefore.get('invitation.status') === 'cancelled') {
      user = await getAuth().updateUser(user.uid, { disabled: false });
    } else {
      throw new HttpsError('failed-precondition', 'This account is disabled. Reactivate it before assigning work.');
    }
  }
  if (!user.customClaims?.role) {
    await getAuth().setCustomUserClaims(user.uid, { ...(user.customClaims ?? {}), role: 'contributor' });
  }
  const work = createHash('sha256').update(`${actor}/${requestId}`).digest('hex').slice(0, 24);
  const path = `/contributor/${user.uid}/${work}`;
  const now = new Date().toISOString();
  const batch = db.batch();
  const invitation = {
    status: 'pending', sentAt: now, resentAt: null, resendCount: 0, cancelledAt: null, requestId,
    sms: { status: 'pending', to: phoneNumber },
  };
  const needsActivation = !accountBefore.exists || accountBefore.get('requiresPasswordChange') === true;
  const temporaryPhonePassword = createdUser || accountBefore.get('temporaryPhonePassword') === true;
  const passwordPhone = temporaryPhonePassword && !createdUser
    ? String(accountBefore.get('phoneNumber') ?? phoneNumber) : phoneNumber;
  const accountData = { authUid: user.uid, contributorId: user.uid, status: 'active',
    requiresPasswordChange: needsActivation, temporaryPhonePassword, phoneNumber: passwordPhone,
    defaultWork: work, invitedBy: actor, invitation, updatedAt: now };
  if (accountBefore.exists) batch.update(accountRef, accountData, { lastUpdateTime: accountBefore.updateTime! });
  else batch.create(accountRef, accountData);
  batch.set(profileRef, {
    id: user.uid,
    authUid: user.uid,
    public: {
      displayName: optionalText(req.data?.displayName, 120)
        || profileBefore.get('public.displayName') || user.displayName || email.split('@')[0],
      photoUrl: profileBefore.get('public.photoUrl') ?? '',
      biography: profileBefore.get('public.biography') ?? '',
      expertise: profileBefore.get('public.expertise') ?? [],
      location: profileBefore.get('public.location') ?? '',
      website: profileBefore.get('public.website') ?? '',
      socialLinks: profileBefore.get('public.socialLinks') ?? '',
    },
    private: {
      email,
      phone: phoneNumber,
      notes: profileBefore.get('private.notes') ?? '',
    },
    roles: profileBefore.get('roles') ?? ['translator'],
    contributionTypes: profileBefore.get('contributionTypes') ?? ['expressions'],
    permissions: { ...(profileBefore.get('permissions') ?? { review: false, publish: false }), submit: true, edit: true },
    status: 'active',
    publicVisibility: profileBefore.get('publicVisibility') ?? 'hidden',
    lifecycle: {
      createdAt: profileBefore.get('lifecycle.createdAt') ?? now,
      updatedAt: now,
      version: Number(profileBefore.get('lifecycle.version') ?? 0) + 1,
    },
  }, { merge: true });
  batch.create(db.doc(`contributorAccounts/${user.uid}/works/${work}`), {
    ...guidance, id: work, title, language: 'xsm', kind: 'expressions', instructions, deadline,
    assignedBy: actor, createdAt: now,
  });
  for (const expression of prompts) {
    const key = createHash('sha256').update(expression).digest('hex').slice(0, 24);
    batch.set(db.doc(`contributorAccounts/${user.uid}/works/${work}/items/${key}`), {
      id: key, expression, translation: '', alternatives: [], revision: 0, status: 'draft', updatedAt: now,
    });
  }
  const auditRef = db.collection('auditLogs').doc();
  batch.set(auditRef, { id: auditRef.id, ...auditRecord(actor, 'contributor.invite', user.uid,
    accountBefore.exists ? { status: accountBefore.get('status') } : null,
    { status: 'active', invitation: 'pending', work, expressionCount: prompts.length },
    { email, work, expressionCount: prompts.length }) });
  await batch.commit();
  const sms = await deliverContributorInvitation(user.uid, email, phoneNumber, origin + path, temporaryPhonePassword, passwordPhone);
  return { contributorId: user.uid, work, portalUrl: origin + path,
    loginMethod: temporaryPhonePassword ? 'phone' : 'existing', sms };
});

/** Exchange the temporary phone-number password for a contributor-chosen password. */
export const activateExpressionContributor = onCall(options, guarded('activateExpressionContributor', async req => {
  const uid = requireAuth(req);
  if (req.auth?.token.firebase?.sign_in_provider !== 'password') {
    throw new HttpsError('permission-denied', 'Sign in with your email and temporary password.');
  }
  await consumeRateLimit('activateExpressionContributor', uid, 10);
  const password = req.data?.password;
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    throw new HttpsError('invalid-argument', 'Choose a password of 8–128 characters.');
  }
  const ref = getFirestore().doc('contributorAccounts/' + uid);
  const account = await ref.get();
  if (account.get('status') !== 'active' || account.get('requiresPasswordChange') !== true) {
    throw new HttpsError('failed-precondition', 'This account does not need activation.');
  }
  if (password.replace(/\D/g, '') === String(account.get('phoneNumber')).replace(/\D/g, '')) {
    throw new HttpsError('invalid-argument', 'Choose a new password different from your phone number.');
  }
  await getAuth().updateUser(uid, { password });
  await ref.update({ requiresPasswordChange: false, temporaryPhonePassword: false,
    'invitation.status': 'accepted', activatedAt: new Date().toISOString() });
  return { activated: true };
}));

/** Assign another set to the same contributor without changing their credentials. */
export const assignContributorExpressions = onCall(options, async req => {
  const actor = requireAuth(req); requireRole(req, 'admin');
  await consumeRateLimit('assignContributorExpressions', actor, 30);
  const uid = id(req.data?.contributorId);
  if (!Array.isArray(req.data?.expressions) || !req.data.expressions.length || req.data.expressions.length > 100) {
    throw new HttpsError('invalid-argument', 'Provide 1–100 expressions.');
  }
  const prompts = [...new Set<string>(req.data.expressions.map((v: unknown) => text(v, 180)))];
  const title = req.data.title == null ? 'Everyday expressions' : text(req.data.title, 120);
  const instructions = optionalText(req.data?.instructions, 3000);
  const deadline = optionalText(req.data?.deadline, 40);
  const guidance = assignmentInstructions(req.data ?? {});
  const db = getFirestore(), account = db.doc(`contributorAccounts/${uid}`);
  const work = account.collection('works').doc();
  // A work id is already globally random, and using it for this one-to-one
  // audit record keeps assignment creation inside the same transaction.
  const auditRef = db.doc(`auditLogs/${work.id}`);
  const now = new Date().toISOString();
  await db.runTransaction(async tx => {
    const member = await tx.get(account);
    if (member.get('status') !== 'active') throw new HttpsError('failed-precondition', 'Invite this contributor before assigning work.');
    tx.create(work, { ...guidance, id: work.id, title, kind: 'expressions', language: 'xsm', instructions, deadline,
      assignedBy: actor, createdAt: now });
    for (const expression of prompts) {
      const key = createHash('sha256').update(expression).digest('hex').slice(0, 24);
      tx.create(work.collection('items').doc(key), {
        id: key, expression, translation: '', alternatives: [], revision: 0, status: 'draft', updatedAt: now,
      });
    }
    tx.update(account, { defaultWork: work.id, updatedAt: now });
    tx.create(auditRef, { id: auditRef.id, ...auditRecord(actor, 'contributor.assignment.create', uid,
      null, { work: work.id, title, expressionCount: prompts.length, deadline }, { work: work.id }) });
  });
  return { contributorId: uid, work: work.id, portalUrl: `${origin}/contributor/${uid}/${work.id}` };
});

/** A bounded, joined directory for the admin console. Private contact fields never leave this admin-only callable. */
export const listExpressionContributors = onCall(options, async req => {
  const actor = requireAuth(req); requireRole(req, 'admin');
  await consumeRateLimit('listExpressionContributors', actor, 60);
  const db = getFirestore();
  const [profileSnapshot, accountSnapshot] = await Promise.all([
    db.collection('contributors').limit(300).get(),
    db.collection('contributorAccounts').limit(300).get(),
  ]);
  const profiles = new Map(profileSnapshot.docs.map(snapshot => [snapshot.id, snapshot]));
  const accounts = new Map(accountSnapshot.docs.map(snapshot => [snapshot.id, snapshot]));
  const contributorIds = [...new Set([...profiles.keys(), ...accounts.keys()])];
  const contributors = await Promise.all(contributorIds.map(async contributorId => {
    const profile = profiles.get(contributorId);
    const account = accounts.get(contributorId);
    const publicProfile = (profile?.get('public') ?? {}) as Record<string, unknown>;
    const privateProfile = (profile?.get('private') ?? {}) as Record<string, unknown>;
    let authUser: Awaited<ReturnType<ReturnType<typeof getAuth>['getUser']>> | null = null;
    if (account || profile?.get('authUid')) {
      try { authUser = await getAuth().getUser(String(profile?.get('authUid') ?? account?.id)); }
      catch (error) {
        if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
      }
    }
    const workSnapshots = account
      ? (await account.ref.collection('works').orderBy('createdAt', 'desc').limit(50).get()).docs
      : [];
    const works = await Promise.all(workSnapshots.map(async work => {
      const items = await work.ref.collection('items').limit(200).get();
      const statuses = items.docs.map(item => String(item.get('status') ?? 'draft'));
      return {
        id: work.id,
        title: String(work.get('title') ?? 'Expression assignment'),
        instructions: String(work.get('instructions') ?? ''),
        deadline: String(work.get('deadline') ?? ''),
        createdAt: String(work.get('createdAt') ?? ''),
        itemCount: items.size,
        submittedCount: items.docs.filter(item => Boolean(item.get('submissionId'))).length,
        verifiedCount: statuses.filter(status => status === 'verified').length,
        revisionCount: statuses.filter(status => ['needs_revision', 'rejected'].includes(status)).length,
      };
    }));
    const storedInvitation = (account?.get('invitation') ?? {}) as Record<string, unknown>;
    const sentAt = String(storedInvitation.sentAt ?? '');
    const accepted = account?.get('requiresPasswordChange') !== true && Boolean(authUser?.metadata.lastSignInTime && sentAt
      && new Date(authUser.metadata.lastSignInTime).getTime() >= new Date(sentAt).getTime());
    const invitationStatus = storedInvitation.status === 'cancelled'
      ? 'cancelled'
      : accepted ? 'accepted' : account ? 'pending' : 'not_invited';
    return {
      id: contributorId,
      authUid: authUser?.uid ?? null,
      displayName: String(publicProfile.displayName ?? authUser?.displayName ?? privateProfile.email ?? 'Contributor'),
      photoUrl: String(publicProfile.photoUrl ?? ''),
      biography: String(publicProfile.biography ?? ''),
      expertise: Array.isArray(publicProfile.expertise) ? publicProfile.expertise.map(String) : [],
      location: String(publicProfile.location ?? ''),
      website: String(publicProfile.website ?? ''),
      socialLinks: String(publicProfile.socialLinks ?? ''),
      email: String(privateProfile.email ?? authUser?.email ?? ''),
      phone: String(privateProfile.phone ?? ''),
      notes: String(privateProfile.notes ?? ''),
      roles: Array.isArray(profile?.get('roles')) ? (profile?.get('roles') as unknown[]).map(String) : [],
      contributionTypes: Array.isArray(profile?.get('contributionTypes'))
        ? (profile?.get('contributionTypes') as unknown[]).map(String) : [],
      permissions: profile?.get('permissions') ?? { submit: true, edit: true, review: false, publish: false },
      status: String(profile?.get('status') ?? (account ? 'active' : 'pending')),
      publicVisibility: String(profile?.get('publicVisibility') ?? 'hidden'),
      accountStatus: String(account?.get('status') ?? 'none'),
      invitation: {
        status: invitationStatus,
        sentAt,
        resentAt: String(storedInvitation.resentAt ?? ''),
        resendCount: Number(storedInvitation.resendCount ?? 0),
        sms: storedInvitation.sms ?? null,
      },
      createdAt: String(profile?.get('lifecycle.createdAt') ?? authUser?.metadata.creationTime ?? ''),
      lastActiveAt: String(authUser?.metadata.lastSignInTime ?? ''),
      works,
    };
  }));
  return { contributors };
});

/** Create a profile-only contributor or edit the public/private halves of an existing record. */
export const saveContributorProfile = onCall(options, async req => {
  const actor = requireAuth(req); requireRole(req, 'admin');
  await consumeRateLimit('saveContributorProfile', actor, 30);
  const input = profileFields((req.data ?? {}) as Record<string, unknown>);
  const db = getFirestore();
  const contributorId = req.data?.contributorId == null
    ? db.collection('contributors').doc().id
    : id(req.data.contributorId);
  const profileRef = db.doc(`contributors/${contributorId}`);
  const auditRef = db.collection('auditLogs').doc();
  const now = new Date().toISOString();
  await db.runTransaction(async tx => {
    const before = await tx.get(profileRef);
    const visibility = req.data?.publicVisibility === 'public' ? 'public' : 'hidden';
    const next = {
      id: contributorId,
      authUid: before.get('authUid') ?? null,
      ...input,
      status: before.get('status') ?? 'active',
      publicVisibility: visibility,
      lifecycle: {
        createdAt: before.get('lifecycle.createdAt') ?? now,
        updatedAt: now,
        version: Number(before.get('lifecycle.version') ?? 0) + 1,
      },
    };
    tx.set(profileRef, next);
    tx.create(auditRef, { id: auditRef.id, ...auditRecord(actor,
      before.exists ? 'contributor.profile.update' : 'contributor.profile.create', contributorId,
      before.exists ? before.data() : null, next) });
  });
  return { contributorId };
});

/** Manage the relationship, login and public profile as three independent switches. */
export const setContributorAccess = onCall(options, async req => {
  const actor = requireAuth(req); requireRole(req, 'admin');
  await consumeRateLimit('setContributorAccess', actor, 30);
  const contributorId = id(req.data?.contributorId);
  const profileStatus = req.data?.profileStatus == null ? null : String(req.data.profileStatus);
  const accountStatus = req.data?.accountStatus == null ? null : String(req.data.accountStatus);
  const publicVisibility = req.data?.publicVisibility == null ? null : String(req.data.publicVisibility);
  if (profileStatus !== null && !['active', 'inactive'].includes(profileStatus)) {
    throw new HttpsError('invalid-argument', 'Unknown contributor status.');
  }
  if (accountStatus !== null && !accountStatuses.includes(accountStatus as typeof accountStatuses[number])) {
    throw new HttpsError('invalid-argument', 'Unknown account status.');
  }
  if (publicVisibility !== null && !['public', 'hidden'].includes(publicVisibility)) {
    throw new HttpsError('invalid-argument', 'Unknown profile visibility.');
  }
  const reason = optionalText(req.data?.reason, 1000);
  if ((profileStatus === 'inactive' || accountStatus === 'suspended' || accountStatus === 'deactivated') && !reason) {
    throw new HttpsError('invalid-argument', 'Record a reason for restricting this contributor.');
  }
  const db = getFirestore();
  const profileRef = db.doc(`contributors/${contributorId}`);
  const accountRef = db.doc(`contributorAccounts/${contributorId}`);
  const [profile, account] = await Promise.all([profileRef.get(), accountRef.get()]);
  if (!profile.exists && !account.exists) throw new HttpsError('not-found', 'Contributor not found.');
  if (accountStatus !== null && !account.exists) throw new HttpsError('failed-precondition', 'This profile has no login account.');
  if (accountStatus !== null) {
    try { await getAuth().updateUser(contributorId, { disabled: accountStatus !== 'active' }); }
    catch (error) {
      if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
    }
  }
  const now = new Date().toISOString();
  const batch = db.batch();
  const profilePatch: Record<string, unknown> = { lifecycle: {
    createdAt: profile.get('lifecycle.createdAt') ?? now,
    updatedAt: now,
    version: Number(profile.get('lifecycle.version') ?? 0) + 1,
  } };
  if (profileStatus !== null) profilePatch.status = profileStatus;
  if (publicVisibility !== null) profilePatch.publicVisibility = publicVisibility;
  if (reason) profilePatch.lastStatusReason = reason;
  batch.set(profileRef, profilePatch, { merge: true });
  if (accountStatus !== null) batch.update(accountRef, { status: accountStatus, updatedAt: now, lastStatusReason: reason });
  const auditRef = db.collection('auditLogs').doc();
  const before = { profileStatus: profile.get('status') ?? null, accountStatus: account.get('status') ?? 'none',
    publicVisibility: profile.get('publicVisibility') ?? 'hidden' };
  const after = { profileStatus: profileStatus ?? before.profileStatus, accountStatus: accountStatus ?? before.accountStatus,
    publicVisibility: publicVisibility ?? before.publicVisibility };
  batch.set(auditRef, { id: auditRef.id, ...auditRecord(actor, 'contributor.access.update', contributorId,
    before, after, { reason }) });
  await batch.commit();
  return { contributorId, ...after };
});

export const resendContributorInvitation = onCall({ ...options, secrets: [ARKESEL_API_KEY] }, async req => {
  const actor = requireAuth(req); requireRole(req, 'admin');
  await consumeRateLimit('resendContributorInvitation', actor, 20);
  const contributorId = id(req.data?.contributorId);
  const db = getFirestore();
  const accountRef = db.doc(`contributorAccounts/${contributorId}`);
  const account = await accountRef.get();
  if (!account.exists || account.get('status') !== 'active' || account.get('invitation.status') === 'cancelled') {
    throw new HttpsError('failed-precondition', 'This invitation is not available to resend.');
  }
  const user = await getAuth().getUser(contributorId);
  if (user.disabled) throw new HttpsError('failed-precondition', 'Reactivate this account before resending.');
  const profile = await db.doc(`contributors/${contributorId}`).get();
  const phone = contributorPhone(profile.get('private.phone') || account.get('phoneNumber'));
  if (!isSmsConfigured()) throw new HttpsError('failed-precondition', 'SMS is not configured.');
  if (!user.email) throw new HttpsError('failed-precondition', 'This contributor has no email address.');
  const work = String(account.get('defaultWork') ?? '');
  if (!work) throw new HttpsError('failed-precondition', 'Assign work before resending this invitation.');
  const path = `/contributor/${contributorId}/${work}`;
  const now = new Date().toISOString();
  const batch = db.batch();
  batch.update(accountRef, { 'invitation.status': 'pending', 'invitation.resentAt': now,
    'invitation.resendCount': Number(account.get('invitation.resendCount') ?? 0) + 1, updatedAt: now });
  const auditRef = db.collection('auditLogs').doc();
  batch.set(auditRef, { id: auditRef.id, ...auditRecord(actor, 'contributor.invitation.resend', contributorId,
    null, { resentAt: now }, {}) });
  await batch.commit();
  const temporary = account.get('temporaryPhonePassword') === true;
  // Editing a contact number must not silently change the temporary password.
  const passwordPhone = temporary ? String(account.get('phoneNumber')) : phone;
  const result = await sendSmsToMsisdn(phone.slice(1), contributorInvitationMessage(user.email, passwordPhone, origin + path, temporary));
  const sms = { status: result.ok ? 'accepted' : 'failed', to: phone, id: result.id ?? null, attemptedAt: now };
  await accountRef.update({ 'invitation.sms': sms });
  return { portalUrl: origin + path, loginMethod: temporary ? 'phone' : 'existing', sms };
});

export const cancelContributorInvitation = onCall(options, async req => {
  const actor = requireAuth(req); requireRole(req, 'admin');
  await consumeRateLimit('cancelContributorInvitation', actor, 20);
  const contributorId = id(req.data?.contributorId);
  const reason = text(req.data?.reason, 1000);
  const db = getFirestore();
  const accountRef = db.doc(`contributorAccounts/${contributorId}`);
  const profileRef = db.doc(`contributors/${contributorId}`);
  const [account, profile] = await Promise.all([accountRef.get(), profileRef.get()]);
  if (!account.exists || account.get('invitation.status') === 'cancelled') {
    throw new HttpsError('failed-precondition', 'This invitation is not pending.');
  }
  const user = await getAuth().getUser(contributorId);
  const sentAt = String(account.get('invitation.sentAt') ?? '');
  if (user.metadata.lastSignInTime && sentAt
    && new Date(user.metadata.lastSignInTime).getTime() >= new Date(sentAt).getTime()) {
    throw new HttpsError('failed-precondition', 'This invitation has already been accepted. Suspend the account instead.');
  }
  await getAuth().updateUser(contributorId, { disabled: true });
  const now = new Date().toISOString();
  const batch = db.batch();
  batch.update(accountRef, { status: 'deactivated', 'invitation.status': 'cancelled',
    'invitation.cancelledAt': now, updatedAt: now, lastStatusReason: reason });
  batch.set(profileRef, { status: 'inactive', publicVisibility: 'hidden',
    lastStatusReason: reason, lifecycle: {
      createdAt: profile.get('lifecycle.createdAt') ?? now,
      updatedAt: now,
      version: Number(profile.get('lifecycle.version') ?? 0) + 1,
    } }, { merge: true });
  const auditRef = db.collection('auditLogs').doc();
  batch.set(auditRef, { id: auditRef.id, ...auditRecord(actor, 'contributor.invitation.cancel', contributorId,
    { status: account.get('status'), invitation: account.get('invitation.status') },
    { status: 'deactivated', invitation: 'cancelled' }, { reason }) });
  await batch.commit();
  return { contributorId };
});

export const saveExpressionAnswer = onCall(options, guarded('saveExpressionAnswer', async req => {
  const uid = requireAuth(req);
  await consumeRateLimit('saveExpressionAnswer', uid, 120);
  const work = id(req.data?.work), item = id(req.data?.item);
  const answer = parseExpressionAnswer(req.data ?? {});
  const submit = req.data?.submit === true;
  const skip = req.data?.skip === true;
  if (skip && submit) throw new HttpsError('invalid-argument', 'Skip does not submit an answer.');
  if (submit && (!answer.translation || req.data?.publicationPermission !== true)) {
    throw new HttpsError('failed-precondition', 'Add a translation and confirm permission to publish.');
  }
  const db = getFirestore(), account = db.doc(`contributorAccounts/${uid}`);
  const ref = account.collection('works').doc(work).collection('items').doc(item);
  const firstSubmissionId = createHash('sha256').update(`${uid}/${work}/${item}`).digest('hex');
  const now = new Date().toISOString();
  return db.runTransaction(async tx => {
    const [member, row, campaign, profile] = await Promise.all([tx.get(account), tx.get(ref),
      tx.get(db.doc(`campaigns/${COLLECTION_CAMPAIGN_ID}`)), tx.get(db.doc(`contributors/${uid}`))]);
    if (member.get('requiresPasswordChange') === true) throw new HttpsError('failed-precondition', 'Activate your account and choose your own password first.');
    if (member.get('status') !== 'active' || !row.exists) throw new HttpsError('permission-denied', 'An active invitation is required.');
    const permissions = profile.get('permissions') as Record<string, unknown> | undefined;
    // Older invitations predate contributor profiles, so a missing permissions
    // map retains their existing access. Once an administrator records the
    // profile, its edit/submit switches become authoritative here.
    if (permissions && permissions.edit !== true) {
      throw new HttpsError('permission-denied', 'Editing access is not enabled for this contributor.');
    }
    if (submit && permissions && permissions.submit !== true) {
      throw new HttpsError('permission-denied', 'Submission access is not enabled for this contributor.');
    }
    const previousId = row.get('submissionId') as string | undefined;
    const previous = previousId ? await tx.get(db.doc(`submissions/${previousId}`)) : null;
    const canRevise = previous?.exists && previous.get('authUid') === uid
      && ['REJECTED', 'NEEDS_REVISION'].includes(previous.get('status'));
    if (previousId && !canRevise) {
      if (submit && answer.translation === row.get('translation')
        && JSON.stringify(answer.alternatives) === JSON.stringify(row.get('alternatives'))
        && (answer.context === undefined || answer.context === (row.get('context') ?? ''))) {
        return { revision: row.get('revision'), submissionId: previousId };
      }
      throw new HttpsError('failed-precondition', 'Submitted expressions are locked for review.');
    }
    if (req.data?.revision !== row.get('revision')) throw new HttpsError('aborted', 'This draft changed on another device. Reload before editing.');
    const revision = row.get('revision') + 1;
    // Each review round is immutable; retries return the current round above.
    const submissionId = previousId
      ? createHash('sha256').update(`${uid}/${work}/${item}/revision/${revision}`).digest('hex')
      : firstSubmissionId;
    if (submit) {
      const input = parseCollectionContributionInput({ collectionKind: 'dictionary', lexicalKind: 'phrase',
        title: row.get('expression'), body: answer.translation, translations: [answer.translation, ...answer.alternatives],
        format: 'Expression', dialect: 'Kasem', source: 'Invited speaker — everyday expression',
        notes: expressionReviewNotes(answer.alternatives, answer.context ?? row.get('context') ?? ''),
        rightsConfirmed: true, publicationPermission: true, participantConsentConfirmed: true,
        usesThirdPartyMaterial: false }, uid);
      // Expressions are complete utterances: commas and slashes are not word-list delimiters.
      input.translations = [answer.translation, ...answer.alternatives];
      const submission = buildCollectionSubmissionDocument(submissionId, uid, input, now);
      const portal = { contributorId: uid, work, item };
      if (!campaign.exists) tx.set(campaign.ref, buildCollectionCampaignDocument(now));
      if (previousId) tx.delete(db.doc(`contributorTrainingPairs/${previousId}`));
      const usageContext = answer.context ?? row.get('context') ?? '';
      tx.create(db.doc(`submissions/${submissionId}`), { ...submission, contributorPortal: portal,
        ...(previousId ? { revisionOf: previousId, previousReview: previous?.get('moderation') ?? null } : {}),
        ...(usageContext ? { usageContext } : {}),
        alternativeExpressions: answer.alternatives, permissions: { ...(submission.permissions as object),
          aiTraining: req.data?.aiTraining === true, consentVersion: 'contributor-expression-v1' } });
      tx.create(db.doc(`collectionContributions/${submissionId}`), {
        ...buildCollectionContributionReceipt(submissionId, submissionId, uid, input),
        contributorPortal: portal, alternativeExpressions: answer.alternatives,
        ...(usageContext ? { usageContext } : {}),
      });
      const day = now.slice(0, 10);
      if (!previousId && member.get('streakLastDay') !== day) {
        const yesterday = new Date(Date.parse(`${day}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
        const streak = member.get('streakLastDay') === yesterday ? Number(member.get('streakCount') ?? 0) + 1 : 1;
        tx.update(account, { streakLastDay: day, streakCount: streak,
          streakBest: Math.max(streak, Number(member.get('streakBest') ?? 0)) });
      }
    }
    tx.update(ref, { ...answer, revision, updatedAt: now, unsure: skip,
      ...(skip ? { skippedAt: now } : {}),
      ...(submit ? { submissionId, submittedAt: now, status: 'submitted', feedback: '', reviewedAt: null } : {}) });
    return { revision, ...(submit ? { submissionId } : {}) };
  });
}));


// Contributor payout details, their verification and payment requests live in
// contributor-payments.ts.

// Read current state in the transaction: delayed/repeated events cannot restore withdrawn data.
export const onContributorExpressionReviewed = onDocumentWritten(
  { document: 'submissions/{submissionId}', region: 'us-central1', retry: true }, async event => {
    const db = getFirestore(), submission = db.doc(`submissions/${event.params.submissionId}`);
    await db.runTransaction(async tx => {
      const snap = await tx.get(submission), data = snap.data();
      const portal = data?.contributorPortal;
      if (!portal) return;
      if (portal.contributorId !== data.authUid) return;
      const itemRef = db.doc(`contributorAccounts/${portal.contributorId}/works/${portal.work}/items/${portal.item}`);
      const item = await tx.get(itemRef);
      if (item.get('submissionId') !== snap.id) return;
      const dictionary = await tx.get(db.doc(`dictionaryEntries/collection_${snap.id}`));
      const verified = ['APPROVED', 'PUBLISHED'].includes(data.status);
      const firstSubmissionId = createHash('sha256').update(`${portal.contributorId}/${portal.work}/${portal.item}`).digest('hex');
      const accountRef = db.doc(`contributorAccounts/${portal.contributorId}`);
      const creditRef = accountRef.collection('rewardCredits').doc(firstSubmissionId);
      const approvalDate = typeof data.moderation?.decidedAt === 'string' && !Number.isNaN(Date.parse(data.moderation.decidedAt))
        ? new Date(data.moderation.decidedAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
      const dayRef = accountRef.collection('rewardDays').doc(approvalDate);
      const [credit, account, day, rewards] = verified ? await Promise.all([
        tx.get(creditRef), tx.get(accountRef), tx.get(dayRef), tx.get(db.doc('settings/contributorRewards')),
      ]) : [null, null, null, null];
      if (verified && credit && !credit.exists && account?.exists) {
        const settings = rewardSettings(rewards?.data() ?? {});
        const earned = Number(day?.get('points') ?? 0);
        const award = Math.max(0, Math.min(settings.pointsPerExpression, settings.dailyCap - earned));
        const now = new Date().toISOString();
        tx.create(creditRef, { submissionId: snap.id, work: portal.work, item: portal.item,
          day: approvalDate, points: award, source: 'approval', createdAt: now });
        if (award > 0) {
          tx.set(dayRef, { day: approvalDate, points: earned + award, updatedAt: now });
          tx.update(accountRef, { rewardBalance: Number(account.get('rewardBalance') ?? 0) + award,
            rewardLifetime: Number(account.get('rewardLifetime') ?? 0) + award });
        }
      }
      tx.update(itemRef, {
        status: verified ? 'verified' : String(data.status).toLowerCase(), feedback: data.moderation?.feedback ?? '',
        reviewedAt: data.moderation?.decidedAt ?? null,
      });
      const training = db.doc(`contributorTrainingPairs/${snap.id}`);
      if (verified && dictionary.get('isPublished') === true
        && data.permissions?.aiTraining === true && data.permissions?.publication === true) {
        tx.set(training, { id: snap.id, language: 'xsm', english: data.title, kasem: data.body,
          alternatives: data.alternativeExpressions ?? [], sourceSubmission: snap.id,
          contributorId: data.authUid, consentVersion: data.permissions.consentVersion,
          reviewedAt: data.moderation?.decidedAt ?? null, kind: 'expression' });
      } else tx.delete(training);
    });
  });

// Issue reports contain only contributor-supplied text and validated assignment IDs.
export const reportContributorIssue = onCall(options, guarded('reportContributorIssue', async req => {
  const uid = requireAuth(req);
  await consumeRateLimit('reportContributorIssue', uid, 10);
  const db = getFirestore();
  if ((await db.doc(`contributorAccounts/${uid}`).get()).get('status') !== 'active') throw new HttpsError('permission-denied', 'An active contributor account is required.');
  const category = text(req.data?.category, 30), description = text(req.data?.description, 2000);
  if (!['translation', 'assignment', 'saving', 'account', 'other'].includes(category)) throw new HttpsError('invalid-argument', 'Choose a valid issue type.');
  const work = req.data?.work ? id(req.data.work) : '', item = req.data?.item ? id(req.data.item) : '';
  if (!work && (item || !['account', 'other'].includes(category))) throw new HttpsError('invalid-argument', 'Choose an assignment for this issue type.');
  if (work) {
    const assignment = db.doc(`contributorAccounts/${uid}/works/${work}`);
    if (!(await assignment.get()).exists || (item && !(await assignment.collection('items').doc(item).get()).exists)) throw new HttpsError('permission-denied', 'Assignment or expression is unavailable.');
  }
  const requestId = id(req.data?.requestId);
  const ref = db.collection('contributorIssues').doc(createHash('sha256').update(`${uid}:${requestId}`).digest('hex'));
  await db.runTransaction(async tx => {
    if ((await tx.get(ref)).exists) return;
    tx.create(ref, { contributorId: uid, work, item, category, description, status: 'open', replies: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  });
  return { id: ref.id };
}));

export const getContributorIssues = onCall(options, guarded('getContributorIssues', async req => {
  const uid = requireAuth(req);
  await consumeRateLimit('getContributorIssues', uid, 60);
  const docs = await getFirestore().collection('contributorIssues').where('contributorId', '==', uid).get();
  return { issues: docs.docs.map(doc => ({ id: doc.id, ...doc.data(), createdAt: doc.get('createdAt') })).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))) };
}));

export const listContributorIssues = onCall(options, async req => {
  requireRole(req, 'admin');
  const docs = await getFirestore().collection('contributorIssues').orderBy('createdAt', 'desc').limit(200).get();
  return { issues: docs.docs.map(doc => ({ id: doc.id, ...doc.data(), createdAt: doc.get('createdAt') })) };
});

export const updateContributorIssue = onCall(options, async req => {
  requireRole(req, 'admin');
  const actor = requireAuth(req);
  await consumeRateLimit('updateContributorIssue', actor, 60);
  const issueId = id(req.data?.id), status = text(req.data?.status, 30), reply = optionalText(req.data?.reply, 2000);
  if (!['open', 'in_progress', 'resolved'].includes(status)) throw new HttpsError('invalid-argument', 'Invalid status.');
  const db = getFirestore(), ref = db.collection('contributorIssues').doc(issueId);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Issue not found.');
    const replies = snap.get('replies') ?? [];
    if (reply && replies.length >= 50) throw new HttpsError('resource-exhausted', 'This report has reached its reply limit.');
    const now = new Date().toISOString();
    tx.update(ref, { status, updatedAt: now, replies: reply ? [...replies, { text: reply, createdAt: now }] : replies });
    tx.create(db.collection('auditLogs').doc(), { actor, action: 'contributor.issue.update', targetId: issueId, status, createdAt: now });
  });
  return { ok: true };
});
