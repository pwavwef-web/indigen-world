// TypeScript models for the creator system, mirroring the canonical JSON Schemas
// under ./schemas. Import with `import type` only — this file has no runtime.
//
//   import type { Campaign, CreatorProfile } from '@indigen-world/contracts/creator-models';

export type CampaignStatus =
  | 'DRAFT'
  | 'WAITLIST_OPEN'
  | 'WAITLIST_CLOSED'
  | 'SUBMISSIONS_OPEN'
  | 'SUBMISSIONS_CLOSED'
  | 'JUDGING'
  | 'COMPLETED'
  | 'ARCHIVED';

export type CreatorApplicationStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'NEEDS_INFO'
  | 'WAITLISTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'SUSPENDED'
  | 'WITHDRAWN';

export type CreatorMembershipStatus =
  | 'pending'
  | 'waitlisted'
  | 'approved'
  | 'rejected'
  | 'suspended'
  | 'revoked';

export type CreatorMembershipRole =
  | 'creator'
  | 'reviewer'
  | 'admin'
  | 'super_admin';

export type SubmissionStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'NEEDS_REVISION'
  | 'RESUBMITTED'
  | 'APPROVED'
  | 'SCHEDULED'
  | 'PUBLISHED'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'ARCHIVED';

export type ContentStudioType = 'writing' | 'video' | 'audio' | 'image' | 'translation';
export type CollectionKind = 'music' | 'dictionary' | 'literature' | 'audiobooks';

export type PaymentStatus =
  | 'NOT_ELIGIBLE'
  | 'PENDING_VERIFICATION'
  | 'APPROVED'
  | 'PROCESSING'
  | 'PAID'
  | 'FAILED'
  | 'DISPUTED'
  | 'CANCELLED';

export type KasemProficiency = 'native' | 'advanced' | 'intermediate' | 'learning';
export type ContactMethod = 'whatsapp' | 'phone' | 'email' | 'sms';
export type PublicationStatus =
  | 'scheduled'
  | 'published'
  | 'unpublished'
  | 'archived'
  | 'correction'
  | 'takedown';
export type CreatorConsentScope = 'review' | 'publication' | 'promotion' | 'ai_training';

export interface Reference {
  collection: string;
  id: string;
}

export interface RecordLifecycle {
  createdAt: string;
  updatedAt: string;
  version: number;
  auditRefs?: Reference[];
}

export interface PrizeTier {
  label: string;
  amount?: number;
  currency?: string;
  count?: number;
}

export interface CampaignFaq {
  question: string;
  answer: string;
}

export interface Campaign {
  id: string;
  slug: string;
  title: string;
  initiative: string;
  language?: Reference | null;
  community?: string;
  description?: string;
  brief?: string;
  categories?: string[];
  eligibility?: string;
  geographies?: string[];
  status: CampaignStatus;
  prizeTiers?: PrizeTier[];
  totalPrizeCommitment?: number;
  currency?: string;
  maxEntriesPerCreator?: number;
  timeline?: {
    waitlistOpensAt?: string | null;
    submissionsOpenAt?: string | null;
    submissionsCloseAt?: string | null;
    revisionDeadlineAt?: string | null;
    judgingFrom?: string | null;
    winnersAnnouncedAt?: string | null;
  };
  fileRequirements?: {
    maxFileBytes?: number;
    acceptedMimeTypes?: string[];
    minDurationSeconds?: number;
    maxDurationSeconds?: number;
  };
  judgingRubric?: { key: string; label: string; weight?: number }[];
  consentRequirements?: CreatorConsentScope[];
  termsVersion?: string;
  faqs?: CampaignFaq[];
  featuredImageUrl?: string;
  sponsor?: string;
  visibility: 'public' | 'internal';
  schemaVersion?: number;
  lifecycle: RecordLifecycle;
}

export interface SocialLink {
  platform: string;
  url: string;
}

export interface CreatorProfile {
  id: string;
  authUid: string;
  reference?: string;
  public: {
    displayName: string;
    username?: string;
    isPublic?: boolean;
    avatarUrl?: string | null;
    initials?: string;
    bio?: string;
    country?: string | null;
    region?: string;
    community?: string;
    languagesSpoken?: string[];
    kasemProficiency?: KasemProficiency;
    dialect?: string;
    canWriteKasem?: boolean;
    canTranslateToEnglish?: boolean;
    interests?: string[];
    formats?: string[];
    socialLinks?: SocialLink[];
  };
  contact?: {
    email?: string;
    phone?: string;
    preferredContactMethod?: ContactMethod;
    preferredLanguage?: string;
  };
  fullName?: string;
  communityRelationship?: string;
  culturalCommunities?: string[];
  skills?: string[];
  experience?: string;
  motivation?: string;
  equipment?: string;
  locationPrivacy?: 'public' | 'region_only' | 'private';
  ageConfirmed?: boolean;
  isMinor?: boolean;
  guardianConsentStatus?: 'not_required' | 'pending' | 'granted' | 'declined';
  recordingAccess?: string[];
  availability?: string;
  referralSource?: string;
  notificationPreferences?: { email?: boolean; inApp?: boolean };
  profileCompletion?: number;
  status?: 'waitlisted' | 'active' | 'suspended' | 'withdrawn';
  consentRefs?: Reference[];
  schemaVersion?: number;
  lifecycle: RecordLifecycle;
}

export interface CreatorMembership {
  userId: string;
  applicationId: string;
  status: CreatorMembershipStatus;
  roles: CreatorMembershipRole[];
  assignedLanguages: string[];
  assignedCommunities: string[];
  assignedCampaigns: string[];
  permissions: string[];
  approvedAt?: string | null;
  approvedBy?: string | null;
  suspendedAt?: string | null;
  suspensionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatorApplication {
  id: string;
  authUid: string;
  reference?: string;
  campaign?: Reference | null;
  profile?: Reference | null;
  status: CreatorApplicationStatus;
  dedupeKeys?: { email?: string; phone?: string };
  snapshot?: Record<string, unknown>;
  consent: {
    termsAccepted: boolean;
    privacyAccepted: boolean;
    communicationsAccepted?: boolean;
    accuracyConfirmed: boolean;
    termsVersion: string;
    acceptedAt: string;
  };
  review?: {
    decidedBy?: Reference | null;
    decidedAt?: string | null;
    reason?: string;
    tags?: string[];
  };
  flaggedForManualReview?: boolean;
  schemaVersion?: number;
  lifecycle: RecordLifecycle;
}

export interface Submission {
  id: string;
  authUid: string;
  campaign: Reference;
  creator: Reference;
  status: SubmissionStatus;
  studioType?: ContentStudioType;
  title: string;
  category?: string;
  collectionKind?: CollectionKind;
  collectionContribution?: Reference | null;
  relatedEntryId?: string | null;
  format?: string;
  kasemExample?: string;
  englishExample?: string;
  primaryLanguage?: string;
  dialect?: string;
  description?: string;
  body?: string;
  tags?: string[];
  targetAudience?: string;
  sourceReferences?: string;
  translationNotes?: string;
  translation?: {
    sourceLanguage?: string;
    targetLanguage?: string;
    sourceContent?: string;
    translatedContent?: string;
    translatorNotes?: string;
  };
  englishSummary?: string;
  culturalContext?: string;
  caption?: string;
  altText?: string;
  media?: {
    storagePath?: string;
    mimeType?: string;
    sizeBytes?: number;
    mediaType?: 'image' | 'audio' | 'video' | 'document';
    thumbnailPath?: string | null;
    captionsPath?: string | null;
  };
  externalPostUrl?: string | null;
  participants?: { name?: string; role?: string }[];
  disclosures: {
    involvesMinors: boolean;
    usesThirdPartyMaterial: boolean;
    sourceInfo?: string;
  };
  attestations?: {
    ownsOrHasRights?: boolean;
    participantsConsented?: boolean;
    guardianPermissionForMinors?: boolean;
    noUnlawfulCopyright?: boolean;
  };
  permissions: {
    review: boolean;
    publication?: boolean;
    promotion?: boolean;
    aiTraining?: boolean;
    consentVersion?: string;
    recordedAt?: string | null;
  };
  moderation?: {
    reviewer?: Reference | null;
    decidedAt?: string | null;
    feedback?: string;
    revisionDeadline?: string | null;
    scores?: Record<string, number>;
    publishedContent?: Reference | null;
  };
  rewardEligible?: boolean;
  schemaVersion?: number;
  lifecycle: RecordLifecycle;
}

export interface PublishedContent {
  id: string;
  submission: Reference;
  campaign: Reference | null;
  creatorAttribution: {
    creatorId: string;
    displayName: string;
    avatarUrl?: string | null;
  };
  language?: string;
  dialect?: string;
  category?: string;
  collectionKind?: CollectionKind | null;
  title: string;
  description?: string;
  body?: string;
  englishSummary?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'audio' | 'video' | 'document' | null;
  thumbnailUrl?: string | null;
  captionsUrl?: string | null;
  culturalNotes?: string;
  ageRating?: 'all' | '7+' | '13+' | '16+' | '18+';
  tags?: string[];
  publicationStatus: PublicationStatus;
  publishedAt?: string | null;
  licenceDisplay?: string;
  sourceAttribution?: string;
  publicationRoute?: 'open' | 'reviewed' | 'collection_review';
  correctionState?: 'none' | 'corrected' | 'takedown_requested' | 'removed';
  schemaVersion?: number;
  lifecycle: RecordLifecycle;
}

export type NotificationType =
  | 'application_update'
  | 'campaign_opening'
  | 'submission_deadline'
  | 'review_decision'
  | 'revision_request'
  | 'publication_notice'
  | 'winner_announcement'
  | 'payment_update'
  | 'policy_change'
  | 'announcement';

export interface CreatorNotification {
  id: string;
  recipient: Reference;
  authUid: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  read: boolean;
  channels?: ('in_app' | 'email')[];
  schemaVersion?: number;
  lifecycle: RecordLifecycle;
}

export interface DialectOption {
  slug: string;
  label: string;
}

export interface CategoryOption {
  slug: string;
  label: string;
  description?: string;
}

export interface GuidelineSection {
  heading: string;
  body: string;
}

export interface PlatformConfiguration {
  id: string;
  whatsappChannelUrl: string;
  supportEmail?: string;
  supportUrl?: string;
  dialects?: DialectOption[];
  contentCategories?: CategoryOption[];
  contentFormats?: string[];
  languages?: { code: string; label: string }[];
  rejectionReasons?: string[];
  reviewCriteria?: { key: string; label: string }[];
  mediaRestrictions?: { maxFileBytes?: number; acceptedMimeTypes?: string[] };
  guidelines?: GuidelineSection[];
  faqs?: CampaignFaq[];
  termsVersion?: string;
  privacyVersion?: string;
  schemaVersion?: number;
  lifecycle: RecordLifecycle;
}
