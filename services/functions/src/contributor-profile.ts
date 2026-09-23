import { getAuth, type UserRecord } from 'firebase-admin/auth';
import { getFirestore, type DocumentSnapshot } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireAuth } from './auth.js';
import { consumeRateLimit } from './rate-limit.js';
import {
  CONTRIBUTOR_CALL_OPTIONS,
  auditEntry,
  boundedText,
  guarded,
  maskTail,
  requireActiveContributor,
} from './contributor-common.js';
import { refreshPulseIdentity, visibilityOf, type ActivityVisibility } from './contributor-pulse.js';

/**
 * What a contributor can see and change about themselves.
 *
 * `contributors/{uid}` is the administrator-managed profile: public fields, a
 * private half with contact details and internal editorial notes, roles and
 * workspace permissions. Contributors read it only through
 * [getContributorSelf], which leaves the internal notes out, and change only
 * the descriptive fields [updateContributorSelf] accepts. Roles, permissions,
 * status and public visibility stay with administrators; firestore.rules no
 * longer lets an owner write the document directly (see the note there).
 *
 * `contributorSettings/{uid}` holds the contributor's own choices: how they
 * appear in the community pulse and which updates reach them by email or SMS.
 * Owner-readable, written only here so every value is validated.
 */

export const DIALECTS = ['Navrongo', 'Paga', 'Chiana', 'Other', 'Not sure'] as const;

export interface ContributorSettings {
  activityVisibility: ActivityVisibility;
  notifications: { reviewEmail: boolean; paymentEmail: boolean; paymentSms: boolean };
  updatedAt: string;
}

export const DEFAULT_SETTINGS: ContributorSettings = {
  activityVisibility: 'anonymous',
  notifications: { reviewEmail: true, paymentEmail: true, paymentSms: false },
  updatedAt: '',
};

export function normaliseSettings(data: Record<string, unknown> | undefined): ContributorSettings {
  const notifications = (data?.notifications ?? {}) as Record<string, unknown>;
  return {
    activityVisibility: visibilityOf(data?.activityVisibility),
    notifications: {
      reviewEmail: notifications.reviewEmail !== false,
      paymentEmail: notifications.paymentEmail !== false,
      paymentSms: notifications.paymentSms === true,
    },
    updatedAt: typeof data?.updatedAt === 'string' ? data.updatedAt : '',
  };
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function selfView(uid: string, account: DocumentSnapshot, profile: DocumentSnapshot, settings: DocumentSnapshot, user: UserRecord | null) {
  const publicProfile = (profile.get('public') ?? {}) as Record<string, unknown>;
  const privateProfile = (profile.get('private') ?? {}) as Record<string, unknown>;
  const language = (profile.get('languageProfile') ?? {}) as Record<string, unknown>;
  const permissions = (profile.get('permissions') ?? {}) as Record<string, unknown>;
  const hasPermissions = Boolean(profile.get('permissions'));
  return {
    contributorId: uid,
    profile: {
      displayName: text(publicProfile.displayName) || user?.displayName || '',
      photoUrl: text(publicProfile.photoUrl),
      location: text(publicProfile.location),
      biography: text(publicProfile.biography),
      dialect: text(language.dialect),
      otherLanguages: text(language.otherLanguages),
      expertise: Array.isArray(publicProfile.expertise) ? publicProfile.expertise.map(String) : [],
      roles: Array.isArray(profile.get('roles')) ? (profile.get('roles') as unknown[]).map(String) : [],
      contributionTypes: Array.isArray(profile.get('contributionTypes'))
        ? (profile.get('contributionTypes') as unknown[]).map(String) : [],
      publicVisibility: profile.get('publicVisibility') === 'public' ? 'public' : 'hidden',
    },
    contact: {
      email: user?.email ?? text(privateProfile.email),
      phoneMasked: maskTail(text(privateProfile.phone) || text(account.get('phoneNumber'))),
    },
    account: {
      status: text(account.get('status')),
      activatedAt: text(account.get('activatedAt')),
      invitedAt: text(account.get('invitation.sentAt')),
      createdAt: user?.metadata.creationTime ?? '',
      lastSignInAt: user?.metadata.lastSignInTime ?? '',
      signInMethods: user ? user.providerData.map((provider) => provider.providerId) : [],
    },
    // Older invitations predate recorded permissions and keep full access,
    // exactly as saveExpressionAnswer reads them.
    permissions: {
      edit: !hasPermissions || permissions.edit === true,
      submit: !hasPermissions || permissions.submit === true,
    },
    settings: normaliseSettings(settings.data() as Record<string, unknown> | undefined),
  };
}

async function loadSelf(uid: string) {
  const account = await requireActiveContributor(uid);
  const db = getFirestore();
  const [profile, settings] = await Promise.all([
    db.doc(`contributors/${uid}`).get(),
    db.doc(`contributorSettings/${uid}`).get(),
  ]);
  let user: UserRecord | null = null;
  try {
    user = await getAuth().getUser(uid);
  } catch (error) {
    if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
  }
  return selfView(uid, account, profile, settings, user);
}

export const getContributorSelf = onCall(CONTRIBUTOR_CALL_OPTIONS, guarded('getContributorSelf', async (req) => {
  const uid = requireAuth(req);
  await consumeRateLimit('getContributorSelf', uid, 60);
  return loadSelf(uid);
}));

/**
 * A profile photo must be one this contributor uploaded to their own avatar
 * folder in this project's bucket — never an arbitrary URL rendered to staff.
 */
export function ownAvatarUrl(value: string, uid: string, bucket: string): boolean {
  if (!value) return true;
  const prefix = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(`creator-avatars/${uid}/`)}`;
  return value.startsWith(prefix) && value.length <= 2000;
}

export function profileInput(raw: Record<string, unknown>) {
  const dialect = boundedText(raw.dialect, 40, 'Kasem variety', { optional: true });
  if (dialect && !(DIALECTS as readonly string[]).includes(dialect)) {
    throw new HttpsError('invalid-argument', 'Choose Navrongo, Paga, Chiana, Other or Not sure.');
  }
  return {
    displayName: boundedText(raw.displayName, 80, 'Display name', { min: 2 }),
    location: boundedText(raw.location, 120, 'Town or region', { optional: true }),
    biography: boundedText(raw.biography, 1000, 'About you', { optional: true, multiline: true }),
    dialect,
    otherLanguages: boundedText(raw.otherLanguages, 200, 'Other languages', { optional: true }),
    photoUrl: boundedText(raw.photoUrl, 2000, 'Photo', { optional: true }),
  };
}

export const updateContributorSelf = onCall(CONTRIBUTOR_CALL_OPTIONS, guarded('updateContributorSelf', async (req) => {
  const uid = requireAuth(req);
  await consumeRateLimit('updateContributorSelf', uid, 20);
  await requireActiveContributor(uid, { activated: true });
  const input = profileInput((req.data ?? {}) as Record<string, unknown>);
  if (!ownAvatarUrl(input.photoUrl, uid, getStorage().bucket().name)) {
    throw new HttpsError('invalid-argument', 'Upload your photo from this page.');
  }
  const db = getFirestore();
  const profileRef = db.doc(`contributors/${uid}`);
  const auditRef = db.collection('auditLogs').doc();
  const now = new Date().toISOString();
  let nameChanged = false;
  await db.runTransaction(async (tx) => {
    const before = await tx.get(profileRef);
    const previous = {
      displayName: text(before.get('public.displayName')),
      location: text(before.get('public.location')),
      biography: text(before.get('public.biography')),
      photoUrl: text(before.get('public.photoUrl')),
      dialect: text(before.get('languageProfile.dialect')),
      otherLanguages: text(before.get('languageProfile.otherLanguages')),
    };
    nameChanged = previous.displayName !== input.displayName;
    tx.set(profileRef, {
      id: uid,
      authUid: before.get('authUid') ?? uid,
      public: {
        displayName: input.displayName,
        location: input.location,
        biography: input.biography,
        photoUrl: input.photoUrl,
      },
      languageProfile: { dialect: input.dialect, otherLanguages: input.otherLanguages },
      lifecycle: {
        createdAt: before.get('lifecycle.createdAt') ?? now,
        updatedAt: now,
        version: Number(before.get('lifecycle.version') ?? 0) + 1,
      },
    }, { merge: true });
    tx.set(auditRef, {
      id: auditRef.id,
      ...auditEntry({
        actor: uid, action: 'contributor.profile.self_update', target: uid,
        before: previous, after: input, at: now,
      }),
    });
  });
  if (nameChanged) await refreshPulseIdentity(uid).catch(() => undefined);
  return loadSelf(uid);
}));

export function settingsInput(raw: Record<string, unknown>): Omit<ContributorSettings, 'updatedAt'> {
  const visibility = raw.activityVisibility;
  if (visibility !== 'name' && visibility !== 'anonymous' && visibility !== 'hidden') {
    throw new HttpsError('invalid-argument', 'Choose how you appear in community activity.');
  }
  const notifications = (raw.notifications ?? {}) as Record<string, unknown>;
  for (const key of ['reviewEmail', 'paymentEmail', 'paymentSms']) {
    if (typeof notifications[key] !== 'boolean') {
      throw new HttpsError('invalid-argument', 'Notification choices must be on or off.');
    }
  }
  return {
    activityVisibility: visibility,
    notifications: {
      reviewEmail: notifications.reviewEmail as boolean,
      paymentEmail: notifications.paymentEmail as boolean,
      paymentSms: notifications.paymentSms as boolean,
    },
  };
}

export const saveContributorSettings = onCall(CONTRIBUTOR_CALL_OPTIONS, guarded('saveContributorSettings', async (req) => {
  const uid = requireAuth(req);
  await consumeRateLimit('saveContributorSettings', uid, 30);
  await requireActiveContributor(uid);
  const input = settingsInput((req.data ?? {}) as Record<string, unknown>);
  const db = getFirestore();
  const ref = db.doc(`contributorSettings/${uid}`);
  const now = new Date().toISOString();
  const before = normaliseSettings((await ref.get()).data() as Record<string, unknown> | undefined);
  await ref.set({ contributorId: uid, ...input, updatedAt: now });
  if (before.activityVisibility !== input.activityVisibility) {
    await refreshPulseIdentity(uid).catch(() => undefined);
  }
  return normaliseSettings({ ...input, updatedAt: now });
}));
