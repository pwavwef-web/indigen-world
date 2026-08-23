// Firestore Security Rules tests for the creator system, run against the
// emulator. Covers the isolation and authorization invariants the brief requires:
//   * one creator cannot read another creator's submission
//   * a normal creator cannot approve or publish content
//   * raw submissions are not publicly readable
//   * published content is public only when published
//   * applications are not client-writable
//   * an admin without finance access cannot read payouts
//   * notifications: owner may only flip `read`
//   * team site intake can be submitted publicly but read only by staff

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const PROJECT_ID = 'demo-indigen-world';
const host = '127.0.0.1';
const port = 8080;
const rulesPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'firestore.rules');

const life = { createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z', version: 1 };
const membershipLife = { createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z' };

function submissionDoc(uid, { id, status }) {
  return {
    id,
    authUid: uid,
    campaign: { collection: 'campaigns', id: 'kasem-creator-challenge' },
    creator: { collection: 'creatorProfiles', id: uid },
    status,
    title: 'A submission',
    category: 'storytelling',
    primaryLanguage: 'xsm',
    dialect: 'navrongo',
    description: '',
    englishSummary: '',
    culturalContext: '',
    disclosures: { involvesMinors: false, usesThirdPartyMaterial: false },
    attestations: {},
    permissions: { review: true, publication: false, promotion: false, aiTraining: false },
    moderation: { reviewer: null, decidedAt: null, feedback: '', revisionDeadline: null, scores: {}, publishedContent: null },
    rewardEligible: false,
    lifecycle: { ...life },
  };
}

function teamSiteRequestDoc(overrides = {}) {
  return {
    formVersion: 1,
    status: 'new',
    submittedAt: '2026-08-20T00:00:00.000Z',
    fields: {
      fullName: 'Ada Team',
      displayName: 'Ada',
      roleTitle: 'Designer',
      teamCompany: 'Indigen World',
      email: 'ada@example.com',
      phone: '',
      location: '',
      sitePurpose: 'Portfolio site',
      audience: 'Clients and collaborators',
      visitorAction: 'Contact Ada',
      siteName: 'Ada Studio',
      tagline: '',
      brandColors: '',
      preferredStyle: '',
      inspirationLinks: '',
      shortBio: 'A short bio.',
      services: '',
      projects: '',
      testimonials: '',
      achievements: '',
      logoAvailable: '',
      profilePhotoAvailable: '',
      mediaNotes: '',
      socialLinks: '',
      bookingLink: '',
      paymentLink: '',
      portfolioLinks: '',
      contactFields: '',
      submissionDestination: '',
      extraNotes: '',
      exclusions: '',
      deadline: '',
    },
    desiredPages: ['Home', 'Contact'],
    features: ['Contact form'],
    ...overrides,
  };
}

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(rulesPath, 'utf8'), host, port },
  });

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'platformConfiguration/creators'), { id: 'creators', whatsappChannelUrl: 'https://example.com', lifecycle: life });
    await setDoc(doc(db, 'campaigns/public-open'), { id: 'public-open', slug: 'public-open', title: 'Open', initiative: 'Project Kasena', status: 'WAITLIST_OPEN', visibility: 'public', lifecycle: life });
    await setDoc(doc(db, 'campaigns/internal-draft'), { id: 'internal-draft', slug: 'internal-draft', title: 'Draft', initiative: 'Project Kasena', status: 'DRAFT', visibility: 'internal', lifecycle: life });
    await setDoc(doc(db, 'submissions/subA'), submissionDoc('creatorA', { id: 'subA', status: 'SUBMITTED' }));
    await setDoc(doc(db, 'submissions/subA-draft'), submissionDoc('creatorA', { id: 'subA-draft', status: 'DRAFT' }));
    await setDoc(doc(db, 'submissions/subB'), submissionDoc('creatorB', { id: 'subB', status: 'SUBMITTED' }));
    await setDoc(doc(db, 'creatorMemberships/creatorA'), {
      userId: 'creatorA',
      applicationId: 'appA',
      status: 'approved',
      roles: ['creator'],
      assignedLanguages: ['xsm'],
      assignedCommunities: ['Kasena'],
      assignedCampaigns: ['kasem-creator-challenge'],
      permissions: ['profile:write', 'submission:write'],
      approvedAt: '2026-08-01T00:00:00Z',
      approvedBy: 'admin1',
      ...membershipLife,
    });
    await setDoc(doc(db, 'creatorMemberships/creatorPending'), {
      userId: 'creatorPending',
      applicationId: 'appPending',
      status: 'pending',
      roles: ['creator'],
      assignedLanguages: [],
      assignedCommunities: [],
      assignedCampaigns: ['kasem-creator-challenge'],
      permissions: [],
      ...membershipLife,
    });
    await setDoc(doc(db, 'creatorMemberships/creatorSuspended'), {
      userId: 'creatorSuspended',
      applicationId: 'appSuspended',
      status: 'suspended',
      roles: ['creator'],
      assignedLanguages: [],
      assignedCommunities: [],
      assignedCampaigns: ['kasem-creator-challenge'],
      permissions: [],
      suspendedAt: '2026-08-01T00:00:00Z',
      suspensionReason: 'test',
      ...membershipLife,
    });
    await setDoc(doc(db, 'creatorApplications/appA'), { id: 'appA', authUid: 'creatorA', status: 'SUBMITTED', consent: {}, lifecycle: life });
    await setDoc(doc(db, 'publishedContent/pub-live'), { id: 'pub-live', title: 'Live', publicationStatus: 'published', lifecycle: life });
    await setDoc(doc(db, 'publishedContent/pub-hidden'), { id: 'pub-hidden', title: 'Hidden', publicationStatus: 'unpublished', lifecycle: life });
    await setDoc(doc(db, 'payouts/pay1'), { id: 'pay1', amount: 100, status: 'PENDING_VERIFICATION' });
    await setDoc(doc(db, 'notifications/notifA'), { id: 'notifA', authUid: 'creatorA', recipient: { collection: 'creatorProfiles', id: 'creatorA' }, type: 'application_update', title: 'Hi', read: false, lifecycle: life });
    await setDoc(doc(db, 'teamSiteRequests/requestA'), teamSiteRequestDoc());
  });
});

after(async () => {
  await env?.cleanup();
});

const db = (ctx) => ctx.firestore();

test('a guest can read a public campaign but not an internal one', async () => {
  const anon = env.unauthenticatedContext();
  await assertSucceeds(getDoc(doc(db(anon), 'campaigns/public-open')));
  await assertFails(getDoc(doc(db(anon), 'campaigns/internal-draft')));
});

test('platform configuration is public-read, admin-write only', async () => {
  const anon = env.unauthenticatedContext();
  const creator = env.authenticatedContext('creatorA');
  const admin = env.authenticatedContext('admin1', { role: 'admin' });
  await assertSucceeds(getDoc(doc(db(anon), 'platformConfiguration/creators')));
  await assertFails(setDoc(doc(db(creator), 'platformConfiguration/creators'), { id: 'creators', whatsappChannelUrl: 'https://evil.example', lifecycle: life }));
  await assertSucceeds(setDoc(doc(db(admin), 'platformConfiguration/creators'), { id: 'creators', whatsappChannelUrl: 'https://example.com', lifecycle: life }));
});

test('one creator cannot read another creator\'s submission', async () => {
  const creatorA = env.authenticatedContext('creatorA');
  const creatorB = env.authenticatedContext('creatorB');
  await assertSucceeds(getDoc(doc(db(creatorA), 'submissions/subA')));
  await assertFails(getDoc(doc(db(creatorB), 'submissions/subA')));
});

test('raw submissions are not publicly readable', async () => {
  const anon = env.unauthenticatedContext();
  await assertFails(getDoc(doc(db(anon), 'submissions/subA')));
});

test('a validator can read any submission for review', async () => {
  const validator = env.authenticatedContext('val1', { role: 'validator' });
  await assertSucceeds(getDoc(doc(db(validator), 'submissions/subA')));
});

test('a creator can create their own draft but not one that is already approved', async () => {
  const creatorA = env.authenticatedContext('creatorA');
  await assertSucceeds(setDoc(doc(db(creatorA), 'submissions/new-draft'), submissionDoc('creatorA', { id: 'new-draft', status: 'DRAFT' })));
  await assertFails(setDoc(doc(db(creatorA), 'submissions/cheat'), submissionDoc('creatorA', { id: 'cheat', status: 'APPROVED' })));
});

test('a pending applicant cannot create private studio submissions', async () => {
  const pending = env.authenticatedContext('creatorPending');
  await assertFails(setDoc(doc(db(pending), 'submissions/pending-draft'), submissionDoc('creatorPending', { id: 'pending-draft', status: 'DRAFT' })));
});

test('a suspended creator immediately loses submission write access', async () => {
  const suspended = env.authenticatedContext('creatorSuspended');
  await assertFails(setDoc(doc(db(suspended), 'submissions/suspended-draft'), submissionDoc('creatorSuspended', { id: 'suspended-draft', status: 'DRAFT' })));
});

test('a creator cannot create a submission owned by someone else', async () => {
  const creatorA = env.authenticatedContext('creatorA');
  await assertFails(setDoc(doc(db(creatorA), 'submissions/forge'), submissionDoc('creatorB', { id: 'forge', status: 'DRAFT' })));
});

test('a normal creator cannot approve or publish their own submission', async () => {
  const creatorA = env.authenticatedContext('creatorA');
  // Self-approve is denied (APPROVED is not a creator-settable status).
  await assertFails(updateDoc(doc(db(creatorA), 'submissions/subA-draft'), {
    status: 'APPROVED',
    'lifecycle.updatedAt': '2026-08-02T00:00:00Z',
    'lifecycle.version': 2,
  }));
  // Tampering with moderation is denied.
  await assertFails(updateDoc(doc(db(creatorA), 'submissions/subA-draft'), {
    'moderation.publishedContent': { collection: 'publishedContent', id: 'x' },
    'lifecycle.updatedAt': '2026-08-02T00:00:00Z',
    'lifecycle.version': 2,
  }));
});

test('a creator can resubmit their own draft', async () => {
  const creatorA = env.authenticatedContext('creatorA');
  await assertSucceeds(updateDoc(doc(db(creatorA), 'submissions/subA-draft'), {
    status: 'SUBMITTED',
    'lifecycle.updatedAt': '2026-08-02T00:00:00Z',
    'lifecycle.version': 2,
  }));
});

test('published content is world-readable only when published', async () => {
  const anon = env.unauthenticatedContext();
  await assertSucceeds(getDoc(doc(db(anon), 'publishedContent/pub-live')));
  await assertFails(getDoc(doc(db(anon), 'publishedContent/pub-hidden')));
});

test('no client may write published content directly', async () => {
  const admin = env.authenticatedContext('admin1', { role: 'admin' });
  await assertFails(setDoc(doc(db(admin), 'publishedContent/forge'), { id: 'forge', title: 'x', publicationStatus: 'published', lifecycle: life }));
});

test('applications are not client-writable; owner reads own, others cannot', async () => {
  const creatorA = env.authenticatedContext('creatorA');
  const creatorB = env.authenticatedContext('creatorB');
  await assertSucceeds(getDoc(doc(db(creatorA), 'creatorApplications/appA')));
  await assertFails(getDoc(doc(db(creatorB), 'creatorApplications/appA')));
  await assertFails(setDoc(doc(db(creatorA), 'creatorApplications/appA'), { id: 'appA', authUid: 'creatorA', status: 'APPROVED', consent: {}, lifecycle: life }));
});

test('an admin without finance access cannot read payouts; a finance user can', async () => {
  const admin = env.authenticatedContext('admin1', { role: 'admin' });
  const finance = env.authenticatedContext('fin1', { finance: true });
  await assertFails(getDoc(doc(db(admin), 'payouts/pay1')));
  await assertSucceeds(getDoc(doc(db(finance), 'payouts/pay1')));
});

test('a creator may only flip the read flag on their own notification', async () => {
  const creatorA = env.authenticatedContext('creatorA');
  const creatorB = env.authenticatedContext('creatorB');
  await assertSucceeds(updateDoc(doc(db(creatorA), 'notifications/notifA'), { read: true, 'lifecycle.updatedAt': '2026-08-02T00:00:00Z' }));
  await assertFails(updateDoc(doc(db(creatorA), 'notifications/notifA'), { title: 'hacked' }));
  await assertFails(getDoc(doc(db(creatorB), 'notifications/notifA')));
});

test('team site intake is public-create and staff-readable only', async () => {
  const anon = env.unauthenticatedContext();
  const creator = env.authenticatedContext('creatorA');
  const validator = env.authenticatedContext('val1', { role: 'validator' });
  await assertSucceeds(setDoc(doc(db(anon), 'teamSiteRequests/public-request'), teamSiteRequestDoc()));
  await assertFails(getDoc(doc(db(anon), 'teamSiteRequests/requestA')));
  await assertFails(getDoc(doc(db(creator), 'teamSiteRequests/requestA')));
  await assertSucceeds(getDoc(doc(db(validator), 'teamSiteRequests/requestA')));
});

test('team site intake rejects unexpected fields', async () => {
  const anon = env.unauthenticatedContext();
  await assertFails(setDoc(doc(db(anon), 'teamSiteRequests/bad-request'), teamSiteRequestDoc({ adminOnly: true })));
});

test('team site intake delete is admin-only', async () => {
  const validator = env.authenticatedContext('val1', { role: 'validator' });
  const admin = env.authenticatedContext('admin1', { role: 'admin' });
  await assertFails(deleteDoc(doc(db(validator), 'teamSiteRequests/requestA')));
  await assertSucceeds(deleteDoc(doc(db(admin), 'teamSiteRequests/requestA')));
});
