import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getBlob, getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import type {
  Campaign,
  CreatorApplication,
  CreatorMembership,
  CreatorNotification,
  CreatorProfile,
  PlatformConfiguration,
  Submission,
} from '@indigen-world/contracts/creator-models';
import { db, functions, storage } from '../firebase';

/** Fallback used only if configuration has not loaded yet. Source of truth is Firestore. */
export const WHATSAPP_CHANNEL_URL =
  'https://whatsapp.com/channel/0029Vb8v3p49MF8yJiLMzH2r';

const CONFIG_ID = 'creators';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export async function fetchConfig(): Promise<PlatformConfiguration | null> {
  try {
    const snap = await getDoc(doc(db, 'platformConfiguration', CONFIG_ID));
    return snap.exists() ? (snap.data() as PlatformConfiguration) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

const LISTABLE_STATUSES = new Set([
  'WAITLIST_OPEN',
  'WAITLIST_CLOSED',
  'SUBMISSIONS_OPEN',
  'SUBMISSIONS_CLOSED',
  'JUDGING',
  'COMPLETED',
]);

export async function fetchPublicCampaigns(): Promise<Campaign[]> {
  const snap = await getDocs(query(collection(db, 'campaigns'), where('visibility', '==', 'public')));
  return snap.docs
    .map((d) => d.data() as Campaign)
    .filter((c) => LISTABLE_STATUSES.has(c.status));
}

export async function fetchCampaign(id: string): Promise<Campaign | null> {
  const snap = await getDoc(doc(db, 'campaigns', id));
  return snap.exists() ? (snap.data() as Campaign) : null;
}

/** The single source of truth for whether uploads/submissions are available. */
export function submissionsOpen(campaign: Pick<Campaign, 'status'> | null | undefined): boolean {
  return campaign?.status === 'SUBMISSIONS_OPEN';
}

export function waitlistOpen(campaign: Pick<Campaign, 'status'> | null | undefined): boolean {
  return campaign?.status === 'WAITLIST_OPEN';
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

export async function fetchMyProfile(uid: string): Promise<CreatorProfile | null> {
  const snap = await getDoc(doc(db, 'creatorProfiles', uid));
  return snap.exists() ? (snap.data() as CreatorProfile) : null;
}

export async function fetchMyMembership(uid: string): Promise<CreatorMembership | null> {
  const snap = await getDoc(doc(db, 'creatorMemberships', uid));
  return snap.exists() ? (snap.data() as CreatorMembership) : null;
}

/**
 * Makes sure a signed-in account has a creator profile, creating a minimal one
 * if it does not.
 *
 * Open publishing means somebody can arrive at the studio and post without ever
 * having applied to anything, but a submission still has to name a creator and
 * a published piece still has to carry an attribution. This mints exactly that:
 * a public display name and nothing else. Status stays `waitlisted` because
 * that is what the security rules allow a client to self-assign — approval is
 * still a decision only staff can make, and it still gates campaigns.
 *
 * Returns the existing profile untouched when there already is one, so this is
 * safe to call on every studio entry.
 */
export async function ensureCreatorProfile(
  uid: string,
  displayName: string,
  avatarUrl: string | null,
): Promise<CreatorProfile | null> {
  const existing = await fetchMyProfile(uid);
  if (existing) return existing;

  const now = new Date().toISOString();
  const profile: CreatorProfile = {
    id: uid,
    authUid: uid,
    public: {
      displayName: displayName.trim() || 'Indigen World creator',
      isPublic: true,
      avatarUrl,
    },
    status: 'waitlisted',
    schemaVersion: 1,
    lifecycle: { createdAt: now, updatedAt: now, version: 1 },
  };

  try {
    await setDoc(doc(db, 'creatorProfiles', uid), profile);
    return profile;
  } catch {
    // A losing race against another tab, or a rules rejection. Either way the
    // studio still opens; the submission form reports anything that blocks it.
    return fetchMyProfile(uid);
  }
}

/** Update editable profile fields; server-managed fields (status, reference, consentRefs) are untouched. */
export async function updateMyProfile(
  uid: string,
  current: CreatorProfile,
  patch: {
    public?: Partial<CreatorProfile['public']>;
    contact?: Partial<NonNullable<CreatorProfile['contact']>>;
    communityRelationship?: string;
    culturalCommunities?: string[];
    skills?: string[];
    experience?: string;
    motivation?: string;
    equipment?: string;
    locationPrivacy?: CreatorProfile['locationPrivacy'];
    availability?: string;
    recordingAccess?: string[];
    notificationPreferences?: CreatorProfile['notificationPreferences'];
  },
): Promise<void> {
  const now = new Date().toISOString();
  await updateDoc(doc(db, 'creatorProfiles', uid), {
    ...(patch.public ? { public: { ...current.public, ...patch.public } } : {}),
    ...(patch.contact ? { contact: { ...current.contact, ...patch.contact } } : {}),
    ...(patch.communityRelationship !== undefined ? { communityRelationship: patch.communityRelationship } : {}),
    ...(patch.culturalCommunities !== undefined ? { culturalCommunities: patch.culturalCommunities } : {}),
    ...(patch.skills !== undefined ? { skills: patch.skills } : {}),
    ...(patch.experience !== undefined ? { experience: patch.experience } : {}),
    ...(patch.motivation !== undefined ? { motivation: patch.motivation } : {}),
    ...(patch.equipment !== undefined ? { equipment: patch.equipment } : {}),
    ...(patch.locationPrivacy !== undefined ? { locationPrivacy: patch.locationPrivacy } : {}),
    ...(patch.availability !== undefined ? { availability: patch.availability } : {}),
    ...(patch.recordingAccess !== undefined ? { recordingAccess: patch.recordingAccess } : {}),
    ...(patch.notificationPreferences ? { notificationPreferences: patch.notificationPreferences } : {}),
    'lifecycle.updatedAt': now,
    'lifecycle.version': (current.lifecycle.version ?? 1) + 1,
  });
}

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

export interface ApplicationPayload {
  campaignId: string;
  profile: {
    public: Partial<CreatorProfile['public']>;
    contact: Partial<NonNullable<CreatorProfile['contact']>>;
    fullName?: string;
    communityRelationship?: string;
    culturalCommunities?: string[];
    skills?: string[];
    experience?: string;
    motivation?: string;
    equipment?: string;
    locationPrivacy?: CreatorProfile['locationPrivacy'];
    ageConfirmed: boolean;
    isMinor: boolean;
    recordingAccess?: string[];
    availability?: string;
    referralSource?: string;
  };
  consent: {
    termsAccepted: boolean;
    privacyAccepted: boolean;
    communicationsAccepted: boolean;
    accuracyConfirmed: boolean;
    termsVersion: string;
  };
}

export interface ApplicationResult {
  applicationId: string;
  reference: string;
  status: string;
  flaggedForManualReview: boolean;
}

/** Finalise a founding-creator application via the trusted Cloud Function. */
export async function submitApplication(payload: ApplicationPayload): Promise<ApplicationResult> {
  const call = httpsCallable<ApplicationPayload, ApplicationResult>(functions, 'submitCreatorApplication');
  const res = await call(payload);
  return res.data;
}

export async function fetchMyApplications(uid: string): Promise<CreatorApplication[]> {
  const snap = await getDocs(
    query(collection(db, 'creatorApplications'), where('authUid', '==', uid)),
  );
  return snap.docs.map((d) => d.data() as CreatorApplication);
}

// ---------------------------------------------------------------------------
// Submissions
// ---------------------------------------------------------------------------

export async function fetchMySubmissions(uid: string): Promise<Submission[]> {
  const snap = await getDocs(
    query(collection(db, 'submissions'), where('authUid', '==', uid)),
  );
  return snap.docs
    .map((d) => d.data() as Submission)
    .sort((a, b) => (b.lifecycle.updatedAt ?? '').localeCompare(a.lifecycle.updatedAt ?? ''));
}

export async function fetchSubmission(id: string): Promise<Submission | null> {
  const snap = await getDoc(doc(db, 'submissions', id));
  return snap.exists() ? (snap.data() as Submission) : null;
}

export function newSubmissionId(): string {
  return doc(collection(db, 'submissions')).id;
}

export interface SubmissionDraftInput {
  id: string;
  uid: string;
  campaignId: string;
  studioType: Submission['studioType'];
  title: string;
  category: string;
  primaryLanguage: string;
  dialect: string;
  description: string;
  body: string;
  tags: string[];
  targetAudience: string;
  sourceReferences: string;
  translationNotes: string;
  translation: NonNullable<Submission['translation']>;
  caption: string;
  altText: string;
  englishSummary: string;
  culturalContext: string;
  externalPostUrl: string;
  participants: { name?: string; role?: string }[];
  disclosures: { involvesMinors: boolean; usesThirdPartyMaterial: boolean; sourceInfo: string };
  attestations: {
    ownsOrHasRights: boolean;
    participantsConsented: boolean;
    guardianPermissionForMinors: boolean;
    noUnlawfulCopyright: boolean;
  };
  permissions: { review: boolean; publication: boolean; promotion: boolean; aiTraining: boolean };
  media?: Submission['media'];
  consentVersion: string;
}

function buildSubmission(input: SubmissionDraftInput, status: Submission['status'], existing?: Submission): Submission {
  const now = new Date().toISOString();
  return {
    id: input.id,
    authUid: input.uid,
    campaign: { collection: 'campaigns', id: input.campaignId },
    creator: { collection: 'creatorProfiles', id: input.uid },
    status,
    studioType: input.studioType,
    title: input.title.trim(),
    category: input.category,
    primaryLanguage: input.primaryLanguage || 'xsm',
    dialect: input.dialect,
    description: input.description,
    body: input.body,
    tags: input.tags,
    targetAudience: input.targetAudience,
    sourceReferences: input.sourceReferences,
    translationNotes: input.translationNotes,
    translation: input.translation,
    englishSummary: input.englishSummary,
    culturalContext: input.culturalContext,
    caption: input.caption,
    altText: input.altText,
    media: input.media ?? existing?.media,
    externalPostUrl: input.externalPostUrl || null,
    participants: input.participants,
    disclosures: input.disclosures,
    attestations: input.attestations,
    permissions: {
      review: input.permissions.review,
      publication: input.permissions.publication,
      promotion: input.permissions.promotion,
      aiTraining: input.permissions.aiTraining,
      consentVersion: input.consentVersion,
      recordedAt: status === 'SUBMITTED' || status === 'RESUBMITTED' ? now : null,
    },
    moderation: existing?.moderation ?? {
      reviewer: null,
      decidedAt: null,
      feedback: '',
      revisionDeadline: null,
      scores: {},
      publishedContent: null,
    },
    rewardEligible: existing?.rewardEligible ?? false,
    schemaVersion: 1,
    lifecycle: existing
      ? { ...existing.lifecycle, updatedAt: now, version: (existing.lifecycle.version ?? 1) + 1 }
      : { createdAt: now, updatedAt: now, version: 1 },
  };
}

export async function saveSubmission(
  input: SubmissionDraftInput,
  status: 'DRAFT' | 'SUBMITTED',
  existing?: Submission,
): Promise<void> {
  const current = existing ?? await fetchSubmission(input.id);
  const nextStatus = current?.status === 'NEEDS_REVISION' && status === 'SUBMITTED'
    ? 'RESUBMITTED'
    : status;
  const document = buildSubmission(input, nextStatus, current ?? undefined);
  await setDoc(doc(db, 'submissions', input.id), document);
}

/** Resumable upload of raw submission media into the private, structured Storage path. */
export function uploadSubmissionMedia(
  uid: string,
  campaignId: string,
  submissionId: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<{ storagePath: string; downloadUrl: string }> {
  const storagePath = `creator-submissions/${uid}/${campaignId}/${submissionId}/original`;
  const task = uploadBytesResumable(ref(storage, storagePath), file, { contentType: file.type });
  return new Promise((resolve, reject) => {
    task.on(
      'state_changed',
      (snapshot) => onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)),
      reject,
      async () => {
        const downloadUrl = await getDownloadURL(task.snapshot.ref);
        resolve({ storagePath, downloadUrl });
      },
    );
  });
}

// ---------------------------------------------------------------------------
// AI-assisted Studio video
// ---------------------------------------------------------------------------

export type StudioVideoOperation = 'generate_visual' | 'lip_sync';
export type StudioVideoStatus =
  | 'SUBMITTING'
  | 'QUEUED'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED';

export interface StudioVideoModelCapability {
  id: string;
  estimatedUsdPerSecond: number;
  requiresReferenceImage?: boolean;
  textRatios?: string[];
  imageRatios?: string[];
}

export interface StudioVideoCapabilities {
  pricingVersion: string;
  limits: {
    durationsSeconds: Array<5 | 10>;
    ratios: string[];
    minorsSupported: false;
    thirdPartyMaterialSupported: false;
    languageCode: 'xsm';
  };
  operations: Array<{
    operation: StudioVideoOperation;
    provider: 'runway' | 'fal';
    models: StudioVideoModelCapability[];
  }>;
}

export interface StudioVideoCostEstimate {
  amountUsd: number;
  billingUnit: 'output_second';
  rateUsd: number;
  pricingVersion: string;
}

export interface StudioVideoJob {
  id: string;
  operation: StudioVideoOperation;
  provider: 'runway' | 'fal';
  model: string;
  status: StudioVideoStatus;
  outputStoragePath: string | null;
  costEstimate: StudioVideoCostEstimate;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StudioVideoGovernanceInput {
  aiProcessingPermission: true;
  rightsConfirmed: true;
  culturalPermissionConfirmed: true;
  participantConsentConfirmed: boolean;
  voiceConsentConfirmed: boolean;
  likenessConsentConfirmed: boolean;
  containsRecognisablePerson: boolean;
  involvesMinors: false;
  usesThirdPartyMaterial: false;
  consentVersion: string;
}

interface StudioVideoInputBase {
  clientRequestId: string;
  durationSeconds: 5 | 10;
  governance: StudioVideoGovernanceInput;
  kasem: {
    languageCode: 'xsm';
    dialect: string;
    transcript: string;
    validationRef: string;
  };
}

export type CreateStudioVideoJobInput = StudioVideoInputBase & (
  | {
    operation: 'generate_visual';
    provider: 'runway';
    model: 'gen4_turbo' | 'gen4.5';
    prompt: string;
    ratio: '1280:720' | '720:1280' | '960:960';
    referenceImageStoragePath: string | null;
  }
  | {
    operation: 'lip_sync';
    provider: 'fal';
    model: 'lipsync-2' | 'lipsync-2-pro';
    videoStoragePath: string;
    audioStoragePath: string;
    syncMode: 'cut_off' | 'loop' | 'bounce' | 'silence' | 'remap';
  }
);

export async function fetchStudioVideoCapabilities(): Promise<StudioVideoCapabilities> {
  const call = httpsCallable<Record<string, never>, StudioVideoCapabilities>(
    functions,
    'getStudioVideoCapabilities',
  );
  const response = await call({});
  return response.data;
}

export async function createStudioVideoJob(
  input: CreateStudioVideoJobInput,
): Promise<StudioVideoJob> {
  const call = httpsCallable<CreateStudioVideoJobInput, StudioVideoJob>(
    functions,
    'createStudioVideoJob',
  );
  const response = await call(input);
  return response.data;
}

export async function refreshStudioVideoJob(jobId: string): Promise<StudioVideoJob> {
  const call = httpsCallable<{ jobId: string }, StudioVideoJob>(
    functions,
    'refreshStudioVideoJob',
  );
  const response = await call({ jobId });
  return response.data;
}

const STUDIO_ASSET_LIMITS = {
  image: 20 * 1024 * 1024,
  audio: 50 * 1024 * 1024,
  video: 200 * 1024 * 1024,
} as const;

export type StudioVideoAssetKind = keyof typeof STUDIO_ASSET_LIMITS;

/** Uploads provider input into a private, owner-scoped path accepted by the callable. */
export function uploadStudioVideoAsset(
  uid: string,
  kind: StudioVideoAssetKind,
  file: File,
  onProgress: (pct: number) => void,
): Promise<string> {
  if (!file.type.startsWith(`${kind}/`)) {
    return Promise.reject(new Error(`Choose a valid ${kind} file.`));
  }
  if (file.size <= 0 || file.size > STUDIO_ASSET_LIMITS[kind]) {
    const limitMb = STUDIO_ASSET_LIMITS[kind] / (1024 * 1024);
    return Promise.reject(new Error(`${kind[0].toUpperCase()}${kind.slice(1)} files must be under ${limitMb} MB.`));
  }
  const assetId = crypto.randomUUID();
  const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, '-').slice(-100) || `${kind}.bin`;
  const storagePath = `creator-submissions/${uid}/studio-video/${assetId}/${kind}-${safeName}`;
  const task = uploadBytesResumable(ref(storage, storagePath), file, { contentType: file.type });
  return new Promise((resolve, reject) => {
    task.on(
      'state_changed',
      (snapshot) => onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)),
      reject,
      () => resolve(storagePath),
    );
  });
}

/** Reads a private generated output with the signed-in user's Storage authorization. */
export async function loadStudioVideoOutput(storagePath: string): Promise<string> {
  const blob = await getBlob(ref(storage, storagePath), 200 * 1024 * 1024);
  return URL.createObjectURL(blob);
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export async function fetchMyNotifications(uid: string): Promise<CreatorNotification[]> {
  const snap = await getDocs(
    query(
      collection(db, 'notifications'),
      where('authUid', '==', uid),
      orderBy('lifecycle.createdAt', 'desc'),
      limit(50),
    ),
  );
  return snap.docs.map((d) => d.data() as CreatorNotification);
}

export async function markNotificationRead(notification: CreatorNotification): Promise<void> {
  await updateDoc(doc(db, 'notifications', notification.id), {
    read: true,
    'lifecycle.updatedAt': new Date().toISOString(),
  });
}
