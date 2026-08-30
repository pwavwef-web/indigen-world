// Production bootstrap: writes ONLY the platform configuration and the opening
// Kasem Creator Challenge campaign (WAITLIST_OPEN). No fictional users/submissions.
// Idempotent (fixed doc ids). Requires PROD_BOOTSTRAP=confirm to run against a
// live project, and must NOT be pointed at the emulator.
//
//   GOOGLE_CLOUD_QUOTA_PROJECT=project-kassena-7e026 PROD_BOOTSTRAP=confirm \
//     node firebase/seed/prod-bootstrap.mjs project-kassena-7e026

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.argv[2] || process.env.GCLOUD_PROJECT;
if (!projectId) { console.error('Usage: node prod-bootstrap.mjs <projectId>'); process.exit(1); }
if (process.env.FIRESTORE_EMULATOR_HOST) { console.error('Refusing: FIRESTORE_EMULATOR_HOST is set (this targets production).'); process.exit(1); }
if (process.env.PROD_BOOTSTRAP !== 'confirm') { console.error('Refusing: set PROD_BOOTSTRAP=confirm to write to production.'); process.exit(1); }

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();
const now = new Date().toISOString();
const life = { createdAt: now, updatedAt: now, version: 1 };
const WHATSAPP = 'https://whatsapp.com/channel/0029Vb8v3p49MF8yJiLMzH2r';

async function run() {
  await db.doc('platformConfiguration/creators').set({
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
    languages: [{ code: 'xsm', label: 'Kasem' }, { code: 'en', label: 'English' }],
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
    lifecycle: life,
  }, { merge: true });

  await db.doc('campaigns/kasem-creator-challenge').set({
    id: 'kasem-creator-challenge',
    slug: 'kasem-creator-challenge',
    title: 'Kasem Creator Challenge',
    initiative: 'Project Kassena',
    language: { collection: 'languages', id: 'kasem' },
    community: 'Kassena',
    description: 'The founding creator campaign for Kasem-language storytelling and culture.',
    brief: 'Create original Kasem-language content celebrating everyday life, storytelling and culture.',
    categories: ['storytelling', 'language-teaching', 'translation', 'interviews', 'oral-history', 'music', 'community-reporting', 'short-form-video', 'audio', 'written-content'],
    eligibility: 'Open to creators aged 18+, or under 18 with guardian consent.',
    geographies: [],
    status: 'WAITLIST_OPEN',
    prizeTiers: [{ label: 'To be announced' }],
    currency: 'GHS',
    maxEntriesPerCreator: 3,
    timeline: { waitlistOpensAt: now, submissionsOpenAt: null, submissionsCloseAt: null, revisionDeadlineAt: null, judgingFrom: null, winnersAnnouncedAt: null },
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
    lifecycle: life,
  }, { merge: true });

  console.log('✓ Production bootstrap complete: platformConfiguration/creators + kasem-creator-challenge (WAITLIST_OPEN)');
}

run().catch((err) => { console.error('Bootstrap failed:', err); process.exit(1); });
