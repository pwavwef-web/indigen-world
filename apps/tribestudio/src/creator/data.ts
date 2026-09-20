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
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import type {
  Campaign,
  CreatorApplication,
  CreatorMembership,
  CreatorNotification,
  CreatorProfile,
  PlatformConfiguration,
  PublishedContent,
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
  media?: Submission['media'] | null;
  consentVersion: string;
}

function buildSubmission(input: SubmissionDraftInput, status: Submission['status'], existing?: Submission): Submission {
  const now = new Date().toISOString();
  const retained = { ...existing };
  if (input.media === null) delete retained.media;
  return {
    ...retained,
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
    ...((input.media === undefined ? existing?.media : input.media)
      ? { media: (input.media === undefined ? existing?.media : input.media)! } : {}),
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
  existing?: Submission | null,
): Promise<void> {
  // A newly generated ID has no readable document yet under ownership rules.
  // Explicit null creates it without a read; undefined refreshes a saved draft.
  const current = existing === undefined ? await fetchSubmission(input.id) : existing;
  const nextStatus = current?.status === 'NEEDS_REVISION'
    ? (status === 'SUBMITTED' ? 'RESUBMITTED' : 'NEEDS_REVISION')
    : status;
  const document = buildSubmission(input, nextStatus, current ?? undefined);
  await setDoc(doc(db, 'submissions', input.id), document);
}

/**
 * The public record of this creator's work, as readers see it.
 *
 * A creator could previously see only that a private submission row said
 * PUBLISHED — not the published page, not the thumbnail, not the attribution
 * line, and not the shareable link. The composite index for exactly this query
 * (publicationStatus + creatorAttribution.creatorId + publishedAt) is already
 * deployed, and the read rule already allows anyone to read a published row.
 */
export async function fetchMyPublished(creatorId: string): Promise<PublishedContent[]> {
  const snap = await getDocs(
    query(
      collection(db, 'publishedContent'),
      where('publicationStatus', '==', 'published'),
      where('creatorAttribution.creatorId', '==', creatorId),
      orderBy('publishedAt', 'desc'),
      limit(60),
    ),
  );
  return snap.docs.map((d) => d.data() as PublishedContent);
}

/**
 * Points, counts and streak as the backend computed them.
 *
 * Mirrors `ContributorScoreState` in services/functions/src/contributor-scores.ts.
 * The dashboard used to invent all of this from the length of the submissions
 * array, so the web workspace and the phone leaderboard described the same
 * person differently — and a creator with ten unreviewed posts was congratulated
 * for work nobody had accepted yet.
 */
export interface ContributorScore {
  points: number;
  approvedCount: number;
  wordCount: number;
  otherCount: number;
  streakDays: number;
  lastContributionDay: string | null;
}

const EMPTY_CONTRIBUTOR_SCORE: ContributorScore = {
  points: 0,
  approvedCount: 0,
  wordCount: 0,
  otherCount: 0,
  streakDays: 0,
  lastContributionDay: null,
};

/**
 * A contributor with no accepted work has no score row, which is not an error:
 * it is a zero. The document is world-readable and server-written only.
 */
export async function fetchMyContributorScore(uid: string): Promise<ContributorScore> {
  const snap = await getDoc(doc(db, 'contributorScores', uid));
  if (!snap.exists()) return EMPTY_CONTRIBUTOR_SCORE;
  const data = snap.data() as Record<string, unknown>;
  return {
    points: Number(data.points ?? 0),
    approvedCount: Number(data.approvedCount ?? 0),
    wordCount: Number(data.wordCount ?? 0),
    otherCount: Number(data.otherCount ?? 0),
    streakDays: Number(data.streakDays ?? 0),
    lastContributionDay: typeof data.lastContributionDay === 'string'
      ? data.lastContributionDay
      : null,
  };
}

/**
 * Whether a post belongs to a campaign rather than the open feed.
 *
 * Mirrors `isCampaignSubmission` in services/functions/src/open-publishing.ts:
 * an empty id, `open` or `none` all mean "not a campaign".
 */
export function isCampaignSubmission(submission: Pick<Submission, 'campaign'>): boolean {
  const id = submission.campaign?.id;
  if (typeof id !== 'string') return false;
  const trimmed = id.trim().toLowerCase();
  return trimmed.length > 0 && trimmed !== 'open' && trimmed !== 'none';
}

/**
 * Whether this creator may still change this post from their own browser.
 *
 * Not a product opinion — this is what firestore.rules permits: an update is
 * allowed only from DRAFT, NEEDS_REVISION or PUBLISHED, and the PUBLISHED case
 * only for an open post, because a campaign entry freezes when it is entered.
 * Offering the action anywhere else would be a button that always fails.
 */
export function canEditSubmission(submission: Pick<Submission, 'status' | 'campaign'>): boolean {
  if (submission.status === 'DRAFT' || submission.status === 'NEEDS_REVISION') return true;
  return submission.status === 'PUBLISHED' && !isCampaignSubmission(submission);
}

/** Withdrawal is the same rule: it is an update, to the WITHDRAWN status. */
export function canWithdrawSubmission(
  submission: Pick<Submission, 'status' | 'campaign'>,
): boolean {
  return canEditSubmission(submission);
}

/**
 * Takes a post down.
 *
 * For a published open post this is a consent revocation, and the deployed
 * `onSubmissionWritten` trigger unpublishes the public record in the same
 * invocation. Only `status` and the lifecycle move: the rules require
 * `moderation` and `rewardEligible` to be byte-identical to their previous
 * values, and an updateDoc that never mentions them satisfies that exactly.
 */
export async function withdrawSubmission(submission: Submission): Promise<void> {
  await updateDoc(doc(db, 'submissions', submission.id), {
    status: 'WITHDRAWN',
    'lifecycle.updatedAt': new Date().toISOString(),
    'lifecycle.version': (submission.lifecycle?.version ?? 0) + 1,
  });
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
        try {
          const downloadUrl = await getDownloadURL(task.snapshot.ref);
          resolve({ storagePath, downloadUrl });
        } catch (error) {
          reject(error);
        }
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

export type StudioVideoProvider = 'runway' | 'fal' | 'gemini';

export interface StudioVideoModelCapability {
  id: string;
  /** Which service serves this model. Chosen by the model, not the operation. */
  provider: StudioVideoProvider;
  /** What to call it in front of a creator. */
  label?: string;
  estimatedUsdPerSecond: number;
  requiresReferenceImage?: boolean;
  /**
   * Lengths this model will make. Runway takes 5 or 10 seconds and Gemini
   * Omni 4, 6, 8 or 10, so there is no single list to offer.
   */
  durationsSeconds?: number[];
  textRatios?: string[];
  imageRatios?: string[];
}

export interface StudioVideoCapabilities {
  pricingVersion: string;
  limits: {
    durationsSeconds: number[];
    ratios: string[];
    minorsSupported: false;
    thirdPartyMaterialSupported: false;
    languageCode: 'xsm';
  };
  operations: Array<{
    operation: StudioVideoOperation;
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
  provider: StudioVideoProvider;
  model: string;
  status: StudioVideoStatus;
  outputStoragePath: string | null;
  costEstimate: StudioVideoCostEstimate;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  /** Present on documents read directly for the job list, not on callable results. */
  prompt?: string;
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
  durationSeconds: number;
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
    provider: 'runway' | 'gemini';
    model: string;
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

/** Shapes a raw job document into the same view the callables return. */
function toStudioVideoJob(id: string, data: Record<string, unknown>): StudioVideoJob {
  const input = data.input as Record<string, unknown> | undefined;
  return {
    id,
    operation: data.operation as StudioVideoJob['operation'],
    provider: data.provider as StudioVideoJob['provider'],
    model: String(data.model ?? ''),
    status: data.status as StudioVideoJob['status'],
    outputStoragePath: (data.outputStoragePath as string | null) ?? null,
    costEstimate: data.costEstimate as StudioVideoJob['costEstimate'],
    failureReason: (data.failureReason as string | null) ?? null,
    createdAt: String(data.createdAt ?? ''),
    updatedAt: String(data.updatedAt ?? ''),
    prompt: typeof input?.prompt === 'string' ? input.prompt : '',
  };
}

/**
 * Every video this creator has asked for, newest first.
 *
 * Read straight from Firestore rather than through a callable: the rules on
 * `studioVideoJobs` already scope a read to `ownerUid`, and a job that is
 * still running must be findable without spending a provider poll to list it.
 */
export async function fetchMyStudioVideoJobs(uid: string): Promise<StudioVideoJob[]> {
  const snap = await getDocs(
    query(
      collection(db, 'studioVideoJobs'),
      where('ownerUid', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(60),
    ),
  );
  return snap.docs.map((d) => toStudioVideoJob(d.id, d.data() as Record<string, unknown>));
}

/**
 * Reads one job document without contacting a provider.
 *
 * Reopening a job used to go through `refreshStudioVideoJob`, which meant a
 * single failed poll — an exhausted allowance, a provider outage — rendered
 * the builder form again as though no job existed. A creator would then pay
 * for a second generation of a video already being made. The document read is
 * the source of truth for what exists; advancing it is a separate concern.
 */
export async function fetchStudioVideoJob(jobId: string): Promise<StudioVideoJob | null> {
  const snap = await getDoc(doc(db, 'studioVideoJobs', jobId));
  return snap.exists() ? toStudioVideoJob(snap.id, snap.data() as Record<string, unknown>) : null;
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

export interface StudioVideoPlayback {
  playbackUrl: string;
  downloadUrl: string;
  expiresAt: string;
}

/**
 * Short-lived signed URLs for a finished video.
 *
 * Replaces a `getBlob` read. That was an XHR, so it was subject to bucket CORS
 * and failed on the deployed origin before Storage authorization was even
 * consulted — the creator was told the preview could not be loaded for a video
 * that was perfectly fine. It also pulled up to 200MB into the tab before
 * anything could play. A signed URL is loaded directly by the <video> element,
 * streams, and expires.
 */
export async function fetchStudioVideoPlayback(jobId: string): Promise<StudioVideoPlayback> {
  const call = httpsCallable<{ jobId: string }, StudioVideoPlayback>(
    functions,
    'getStudioVideoPlaybackUrl',
  );
  const response = await call({ jobId });
  return response.data;
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
