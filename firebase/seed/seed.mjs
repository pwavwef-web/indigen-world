// Development seed for the creator system. Writes fictional fixtures into the
// Firebase emulator so the founding-creator flows can be exercised end to end.
//
//   npm run seed            (from repo root — wraps this in emulators:exec)
//
// Uses the Admin SDK, which bypasses Security Rules, so it also creates the
// server-managed records (approved applications, published content) that clients
// can never write themselves. All personal data here is invented.

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-indigen-world';
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('Refusing to seed: FIRESTORE_EMULATOR_HOST is not set (emulator only).');
  process.exit(1);
}

initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();

const T = '2026-08-01T00:00:00Z';
const life = (createdAt = T, version = 1) => ({ createdAt, updatedAt: createdAt, version });

const WHATSAPP = 'https://whatsapp.com/channel/0029Vb8v3p49MF8yJiLMzH2r';

async function seed() {
  const batch = db.batch();

  // ---- Platform configuration ----
  batch.set(db.doc('platformConfiguration/creators'), {
    id: 'creators',
    whatsappChannelUrl: WHATSAPP,
    supportEmail: 'creators@indigen.world',
    supportUrl: '/studio/help',
    dialects: [
      { slug: 'navrongo', label: 'Navrongo' },
      { slug: 'paga', label: 'Paga' },
      { slug: 'chiana', label: 'Chiana' },
      { slug: 'other', label: 'Other' },
      { slug: 'not-sure', label: 'Not sure' },
    ],
    contentCategories: [
      { slug: 'storytelling', label: 'Storytelling' },
      { slug: 'language-teaching', label: 'Language teaching' },
      { slug: 'translation', label: 'Translation' },
      { slug: 'interviews', label: 'Interviews' },
      { slug: 'oral-history', label: 'Oral history' },
      { slug: 'music', label: 'Music' },
      { slug: 'food', label: 'Food' },
      { slug: 'fashion', label: 'Fashion' },
      { slug: 'games', label: 'Games' },
      { slug: 'tourism', label: 'Tourism' },
      { slug: 'community-reporting', label: 'Community reporting' },
      { slug: 'photography', label: 'Photography' },
      { slug: 'short-form-video', label: 'Short-form video' },
      { slug: 'long-form-video', label: 'Long-form video' },
      { slug: 'audio', label: 'Audio' },
      { slug: 'written-content', label: 'Written content' },
    ],
    contentFormats: ['Short video', 'Long video', 'Audio', 'Image', 'Written'],
    languages: [
      { code: 'xsm', label: 'Kasem' },
      { code: 'en', label: 'English' },
    ],
    rejectionReasons: ['Not original work', 'Copyright concerns', 'Missing consent', 'Off-brief', 'Quality below threshold'],
    reviewCriteria: [
      { key: 'language', label: 'Kasem-language quality' },
      { key: 'creativity', label: 'Creativity' },
      { key: 'cultural', label: 'Cultural value' },
      { key: 'originality', label: 'Originality' },
      { key: 'technical', label: 'Technical quality' },
    ],
    mediaRestrictions: { maxFileBytes: 524288000, acceptedMimeTypes: ['video/mp4', 'audio/mpeg', 'image/jpeg', 'image/png'] },
    guidelines: [
      { heading: 'Eligible content', body: 'Original Kasem-language content across the listed categories.' },
      { heading: 'Originality requirements', body: 'Content must be your own or used with permission.' },
    ],
    faqs: [
      { question: 'Who may join?', answer: 'Anyone with a connection to Kasem language or culture. You do not need to be a professional creator.' },
      { question: 'Is joining free?', answer: 'Yes. Joining the founding creators programme is always free.' },
      { question: 'Does every submission receive money?', answer: 'No. Registration and submission never guarantee selection, publication or payment.' },
    ],
    termsVersion: 'creator-terms-2026-08',
    privacyVersion: 'privacy-2026-08',
    schemaVersion: 1,
    lifecycle: life(),
  });

  // ---- Campaign (WAITLIST_OPEN) ----
  batch.set(db.doc('campaigns/kasem-creator-challenge'), {
    id: 'kasem-creator-challenge',
    slug: 'kasem-creator-challenge',
    title: 'Kasem Creator Challenge',
    initiative: 'Project Kasena',
    language: { collection: 'languages', id: 'kasem' },
    community: 'Kasena',
    description: 'The founding creator campaign for Kasem-language storytelling and culture.',
    brief: 'Create original Kasem-language content celebrating everyday life, storytelling and culture.',
    categories: ['storytelling', 'language-teaching', 'translation', 'interviews', 'oral-history', 'music', 'community-reporting', 'short-form-video', 'audio', 'written-content'],
    eligibility: 'Open to creators aged 18+, or under 18 with guardian consent.',
    geographies: [],
    status: 'WAITLIST_OPEN',
    prizeTiers: [{ label: 'Grand prize', count: 1 }],
    currency: 'GHS',
    maxEntriesPerCreator: 3,
    timeline: { waitlistOpensAt: T, submissionsOpenAt: null, submissionsCloseAt: null, revisionDeadlineAt: null, judgingFrom: null, winnersAnnouncedAt: null },
    fileRequirements: { maxFileBytes: 524288000, acceptedMimeTypes: ['video/mp4', 'audio/mpeg', 'image/jpeg'], maxDurationSeconds: 300 },
    judgingRubric: [
      { key: 'language', label: 'Kasem-language quality', weight: 1 },
      { key: 'creativity', label: 'Creativity', weight: 1 },
    ],
    consentRequirements: ['review', 'publication'],
    termsVersion: 'creator-terms-2026-08',
    faqs: [{ question: 'When do submissions open?', answer: 'We will announce the date. Join the waitlist to hear first.' }],
    sponsor: 'Indigen World',
    visibility: 'public',
    schemaVersion: 1,
    lifecycle: life(),
  });

  // ---- Profiles (complete + incomplete + active) ----
  const profile = (uid, name, extra = {}) => ({
    id: uid,
    authUid: uid,
    reference: extra.reference,
    public: {
      displayName: name,
      username: uid.replace(/^creator-/, ''),
      isPublic: extra.status === 'active',
      avatarUrl: null,
      initials: name.slice(0, 2).toUpperCase(),
      bio: extra.bio ?? '',
      country: 'GH',
      region: extra.region ?? 'Navrongo',
      community: 'Kasena',
      languagesSpoken: ['Kasem', 'English'],
      kasemProficiency: extra.proficiency ?? 'native',
      dialect: extra.dialect ?? 'navrongo',
      canWriteKasem: true,
      canTranslateToEnglish: true,
      interests: extra.interests ?? ['storytelling'],
      formats: ['Short video'],
      socialLinks: [],
    },
    fullName: `${name} Example`,
    contact: { email: `${uid}@example.com`, phone: '+233200000000', preferredContactMethod: 'whatsapp', preferredLanguage: 'en' },
    communityRelationship: 'Born and raised in the community.',
    culturalCommunities: ['Kasena'],
    skills: extra.interests ?? ['storytelling'],
    experience: 'Fictional experience for local testing.',
    motivation: 'Fictional motivation for local testing.',
    equipment: 'Smartphone',
    locationPrivacy: 'region_only',
    ageConfirmed: true,
    isMinor: false,
    guardianConsentStatus: 'not_required',
    recordingAccess: ['smartphone'],
    availability: 'Weekends',
    referralSource: 'WhatsApp',
    notificationPreferences: { email: true, inApp: true },
    profileCompletion: extra.completion ?? 100,
    status: extra.status ?? 'waitlisted',
    consentRefs: [],
    schemaVersion: 1,
    lifecycle: life(),
  });

  batch.set(db.doc('creatorProfiles/creator-ama'), profile('creator-ama', 'Ama the Storyteller', { reference: 'KCC-2026-0001', bio: 'Sharing Kasem folktales for a new generation.', interests: ['storytelling', 'culture'] }));
  batch.set(db.doc('creatorProfiles/creator-kwame'), profile('creator-kwame', 'Kwame Beats', { reference: 'KCC-2026-0002', completion: 55, proficiency: 'intermediate', dialect: 'paga', interests: ['music'] }));
  batch.set(db.doc('creatorProfiles/creator-efua'), profile('creator-efua', 'Efua Teaches', { reference: 'KCC-2026-0003', status: 'active', proficiency: 'advanced', dialect: 'chiana', interests: ['education', 'language-lessons'] }));
  for (const [uid, username] of [['creator-ama', 'ama'], ['creator-kwame', 'kwame'], ['creator-efua', 'efua']]) {
    batch.set(db.doc(`creatorUsernames/${username}`), {
      username,
      userId: uid,
      profile: { collection: 'creatorProfiles', id: uid },
      reservedAt: T,
    });
  }

  // ---- Applications across statuses ----
  const application = (uid, status, extra = {}) => ({
    id: `${uid}__kasem-creator-challenge`,
    authUid: uid,
    reference: extra.reference,
    campaign: { collection: 'campaigns', id: 'kasem-creator-challenge' },
    profile: { collection: 'creatorProfiles', id: uid },
    status,
    dedupeKeys: { email: `${uid}@example.com`, phone: '+233200000000' },
    snapshot: { displayName: extra.name, country: 'GH', region: extra.region ?? 'Navrongo', kasemProficiency: extra.proficiency ?? 'native', dialect: extra.dialect ?? 'navrongo', interests: extra.interests ?? ['storytelling'], formats: ['Short video'], referralSource: 'WhatsApp' },
    consent: { termsAccepted: true, privacyAccepted: true, communicationsAccepted: true, accuracyConfirmed: true, termsVersion: 'creator-terms-2026-08', acceptedAt: T },
    review: { decidedBy: null, decidedAt: null, reason: '', tags: [] },
    flaggedForManualReview: extra.flagged ?? false,
    schemaVersion: 1,
    lifecycle: life(),
  });

  batch.set(db.doc('creatorApplications/creator-ama__kasem-creator-challenge'), application('creator-ama', 'SUBMITTED', { reference: 'KCC-2026-0001', name: 'Ama the Storyteller', interests: ['storytelling', 'culture'] }));
  batch.set(db.doc('creatorApplications/creator-kwame__kasem-creator-challenge'), application('creator-kwame', 'UNDER_REVIEW', { reference: 'KCC-2026-0002', name: 'Kwame Beats', dialect: 'paga', proficiency: 'intermediate', interests: ['music'] }));
  batch.set(db.doc('creatorApplications/creator-efua__kasem-creator-challenge'), application('creator-efua', 'APPROVED', { reference: 'KCC-2026-0003', name: 'Efua Teaches', dialect: 'chiana', proficiency: 'advanced', interests: ['education'] }));
  batch.set(db.doc('creatorApplications/creator-yaa__kasem-creator-challenge'), application('creator-yaa', 'WAITLISTED', { reference: 'KCC-2026-0004', name: 'Yaa Poet', interests: ['poetry'] }));
  batch.set(db.doc('creatorApplications/creator-teen__kasem-creator-challenge'), { ...application('creator-teen', 'NEEDS_INFO', { reference: 'KCC-2026-0005', name: 'Young Voice', flagged: true }), flaggedForManualReview: true });

  const membership = (uid, status, applicationId, extra = {}) => ({
    userId: uid,
    applicationId,
    status,
    roles: ['creator'],
    assignedLanguages: ['xsm'],
    assignedCommunities: ['Kasena'],
    assignedCampaigns: ['kasem-creator-challenge'],
    permissions: status === 'approved' ? ['profile:write', 'submission:write'] : [],
    approvedAt: status === 'approved' ? T : null,
    approvedBy: status === 'approved' ? 'seed-admin' : null,
    createdAt: T,
    updatedAt: T,
    ...extra,
  });

  batch.set(db.doc('creatorMemberships/creator-ama'), membership('creator-ama', 'pending', 'creator-ama__kasem-creator-challenge'));
  batch.set(db.doc('creatorMemberships/creator-kwame'), membership('creator-kwame', 'pending', 'creator-kwame__kasem-creator-challenge'));
  batch.set(db.doc('creatorMemberships/creator-efua'), membership('creator-efua', 'approved', 'creator-efua__kasem-creator-challenge'));

  // ---- Submissions across statuses ----
  const submission = (id, uid, status, title, extra = {}) => ({
    id,
    authUid: uid,
    campaign: { collection: 'campaigns', id: 'kasem-creator-challenge' },
    creator: { collection: 'creatorProfiles', id: uid },
    status,
    title,
    category: extra.category ?? 'storytelling',
    primaryLanguage: 'xsm',
    dialect: extra.dialect ?? 'navrongo',
    description: extra.description ?? 'A Kasem-language piece.',
    englishSummary: extra.summary ?? 'English summary of the content.',
    culturalContext: 'Shared to celebrate Kasena culture.',
    media: { storagePath: `creator-submissions/${uid}/kasem-creator-challenge/${id}/original`, mimeType: 'video/mp4', sizeBytes: 10485760, mediaType: 'video', thumbnailPath: null, captionsPath: null },
    externalPostUrl: null,
    participants: [],
    disclosures: { involvesMinors: false, usesThirdPartyMaterial: false, sourceInfo: '' },
    attestations: { ownsOrHasRights: true, participantsConsented: true, guardianPermissionForMinors: true, noUnlawfulCopyright: true },
    permissions: { review: true, publication: extra.publication ?? true, promotion: false, aiTraining: false, consentVersion: 'creator-terms-2026-08', recordedAt: T },
    moderation: { reviewer: null, decidedAt: null, feedback: extra.feedback ?? '', revisionDeadline: null, scores: {}, publishedContent: extra.publishedRef ?? null },
    rewardEligible: false,
    schemaVersion: 1,
    lifecycle: life(),
  });

  batch.set(db.doc('submissions/sub-ama-draft'), submission('sub-ama-draft', 'creator-ama', 'DRAFT', 'The Clever Hare (draft)'));
  batch.set(db.doc('submissions/sub-ama-submitted'), submission('sub-ama-submitted', 'creator-ama', 'SUBMITTED', 'Market Day Tales'));
  batch.set(db.doc('submissions/sub-kwame-revision'), submission('sub-kwame-revision', 'creator-kwame', 'NEEDS_REVISION', 'Harvest Song', { category: 'music', feedback: 'Please add an English summary and improve the audio levels.' }));
  batch.set(db.doc('submissions/sub-efua-approved'), submission('sub-efua-approved', 'creator-efua', 'PUBLISHED', 'Counting in Kasem', { category: 'language-lessons', dialect: 'chiana', publishedRef: { collection: 'publishedContent', id: 'pub_sub-efua-approved' } }));

  // ---- Published content (mobile-app contract) ----
  batch.set(db.doc('publishedContent/pub_sub-efua-approved'), {
    id: 'pub_sub-efua-approved',
    submission: { collection: 'submissions', id: 'sub-efua-approved' },
    campaign: { collection: 'campaigns', id: 'kasem-creator-challenge' },
    creatorAttribution: { creatorId: 'creator-efua', displayName: 'Efua Teaches', avatarUrl: null },
    language: 'xsm',
    dialect: 'chiana',
    category: 'language-lessons',
    title: 'Counting in Kasem',
    description: 'Learn to count from one to ten in Kasem.',
    englishSummary: 'A short lesson counting one to ten in Kasem.',
    mediaUrl: 'https://cdn.example.com/pub_sub-efua-approved.mp4',
    thumbnailUrl: null,
    captionsUrl: null,
    culturalNotes: 'Numbers are taught through a call-and-response rhyme.',
    ageRating: 'all',
    tags: ['lesson', 'kasena', 'numbers'],
    publicationStatus: 'published',
    publishedAt: '2026-08-20T00:00:00Z',
    licenceDisplay: '© Efua Teaches · Published with permission by Indigen World',
    correctionState: 'none',
    schemaVersion: 1,
    lifecycle: life('2026-08-20T00:00:00Z'),
  });

  // ---- Notifications ----
  batch.set(db.doc('notifications/notif-ama-1'), {
    id: 'notif-ama-1',
    recipient: { collection: 'creatorProfiles', id: 'creator-ama' },
    authUid: 'creator-ama',
    type: 'application_update',
    title: 'Your founding-creator application was received',
    body: 'Reference KCC-2026-0001. We will announce when the campaign opens.',
    link: '/studio',
    read: false,
    channels: ['in_app', 'email'],
    schemaVersion: 1,
    lifecycle: life(),
  });
  batch.set(db.doc('notifications/notif-efua-1'), {
    id: 'notif-efua-1',
    recipient: { collection: 'creatorProfiles', id: 'creator-efua' },
    authUid: 'creator-efua',
    type: 'publication_notice',
    title: 'Your content was published',
    body: '"Counting in Kasem" is now live in Indigen World.',
    link: '/studio/submissions/sub-efua-approved',
    read: true,
    channels: ['in_app'],
    schemaVersion: 1,
    lifecycle: life('2026-08-20T00:00:00Z'),
  });

  await batch.commit();
  console.log('✓ Seeded creator fixtures into project', PROJECT_ID);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
