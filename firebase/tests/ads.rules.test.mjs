// Advertising Security Rules tests, run against the Firestore emulator.
//
//   npm run test:rules        (from the repo root — wraps this in emulators:exec)
//
// `adCampaigns` is the collection that will eventually carry money, so the
// rules on it are deliberately the strictest in the project: every client
// write is denied outright, including the owner's, because status, payment
// state and impression counts are all things a phone must never be able to
// assert about itself. Creating, editing and cancelling go through the
// callables in services/functions/src/ads.ts.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const PROJECT_ID = 'demo-indigen-world';
const host = '127.0.0.1';
const port = 8080;
const rulesPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'firestore.rules');

const ADVERTISER = 'advertiser-uid';
const STRANGER = 'stranger-uid';
const VALIDATOR = 'validator-uid';

function makeCampaign(ownerUid, overrides = {}) {
  return {
    id: 'campaign-1',
    ownerUid,
    name: 'Shea butter, dry season',
    objective: 'awareness',
    headline: 'Pure shea from Paga',
    body: 'Cold-pressed, unrefined, sold by the tin.',
    ctaLabel: 'Ask for it',
    ctaUrl: '',
    placements: ['community'],
    regions: ['Upper East'],
    dailyBudgetPesewas: 2000,
    durationDays: 7,
    subtotalPesewas: 14_000,
    taxPesewas: 840,
    totalBudgetPesewas: 14_840,
    currency: 'GHS',
    creative: {
      storagePath: `creator-submissions/${ownerUid}/ad-campaigns/abc/shea.jpg`,
      mimeType: 'image/jpeg',
      sizeBytes: 90_000,
      mediaType: 'image',
      previewUrl: null,
    },
    status: 'PENDING_PAYMENT',
    payment: {
      provider: 'paystack',
      status: 'unpaid',
      reference: null,
      amountPesewas: 14_840,
      paidAt: null,
    },
    metrics: { impressions: 0, clicks: 0 },
    reviewer: null,
    reviewFeedback: '',
    startsAt: null,
    endsAt: null,
    schemaVersion: 1,
    ...overrides,
  };
}

// The public projection of a campaign that is actually running. Deliberately
// none of the campaign's money: no budget, no payment, no owner, no metrics.
function makePlacement(campaignId, overrides = {}) {
  return {
    campaignId,
    headline: 'Pure shea from Paga',
    body: 'Cold-pressed, unrefined, sold by the tin.',
    ctaLabel: 'Ask for it',
    ctaUrl: '',
    objective: 'awareness',
    placements: ['community'],
    regions: ['Upper East'],
    creativeUrl: 'https://firebasestorage.googleapis.com/v0/b/demo/o/ad-creatives',
    mediaType: 'image',
    startsAt: '2026-01-01T00:00:00.000Z',
    endsAt: '2026-01-08T00:00:00.000Z',
    active: true,
    ...overrides,
  };
}

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(rulesPath, 'utf8'), host, port },
  });

  // Campaigns are server-authored, so the fixture is written with rules
  // disabled — exactly as the callable does in production.
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'adCampaigns/campaign-1'), makeCampaign(ADVERTISER));
    await setDoc(doc(ctx.firestore(), 'adPlacements/campaign-1'), makePlacement('campaign-1'));
    await setDoc(
      doc(ctx.firestore(), 'adPlacements/campaign-paused'),
      makePlacement('campaign-paused', { active: false }),
    );
  });
});

after(async () => {
  await env?.cleanup();
});

const db = (ctx) => ctx.firestore();

// ── Reads ───────────────────────────────────────────────────────────────────

test('an advertiser can read their own campaign', async () => {
  const owner = env.authenticatedContext(ADVERTISER);
  await assertSucceeds(getDoc(doc(db(owner), 'adCampaigns/campaign-1')));
});

test('staff can read any campaign, so it can be moderated', async () => {
  for (const role of ['validator', 'reviewer', 'admin', 'super_admin']) {
    const staff = env.authenticatedContext(VALIDATOR, { role });
    await assertSucceeds(getDoc(doc(db(staff), 'adCampaigns/campaign-1')));
  }
});

test('nobody else can read a campaign', async () => {
  // A campaign carries a budget and an unserved creative. Neither is public
  // until the advert actually runs.
  await assertFails(
    getDoc(doc(db(env.authenticatedContext(STRANGER)), 'adCampaigns/campaign-1')),
  );
  await assertFails(
    getDoc(doc(db(env.unauthenticatedContext()), 'adCampaigns/campaign-1')),
  );
});

// ── Writes ──────────────────────────────────────────────────────────────────

test('no client may create a campaign directly', async () => {
  // Creation is priced server-side. A client-written campaign is a campaign
  // that set its own total.
  const owner = env.authenticatedContext(ADVERTISER);
  await assertFails(
    setDoc(doc(db(owner), 'adCampaigns/campaign-self'), makeCampaign(ADVERTISER, {
      id: 'campaign-self',
    })),
  );
});

test('even the owner cannot edit their own campaign', async () => {
  const owner = env.authenticatedContext(ADVERTISER);

  // The obvious attacks: mark it paid, start it running, invent an audience.
  await assertFails(updateDoc(doc(db(owner), 'adCampaigns/campaign-1'), {
    'payment.status': 'paid',
  }));
  await assertFails(updateDoc(doc(db(owner), 'adCampaigns/campaign-1'), {
    status: 'ACTIVE',
  }));
  await assertFails(updateDoc(doc(db(owner), 'adCampaigns/campaign-1'), {
    'metrics.impressions': 500_000,
  }));
  // And the innocuous one, which the rules also refuse: a campaign is edited
  // through updateAdCampaign so the price is recomputed with it.
  await assertFails(updateDoc(doc(db(owner), 'adCampaigns/campaign-1'), {
    headline: 'Now with free delivery',
  }));
});

test('staff cannot write a campaign from a client either', async () => {
  const staff = env.authenticatedContext(VALIDATOR, { role: 'admin' });
  await assertFails(updateDoc(doc(db(staff), 'adCampaigns/campaign-1'), {
    status: 'ACTIVE',
  }));
});

test('a campaign cannot be deleted from a client', async () => {
  // Cancelling is a status transition with an audit entry, not a deletion:
  // a campaign that was live has to stay accountable for having been live.
  const owner = env.authenticatedContext(ADVERTISER);
  await assertFails(deleteDoc(doc(db(owner), 'adCampaigns/campaign-1')));
});

// ── Placements ──────────────────────────────────────────────────────────────
//
// The other half of the model: the campaign stays private, and what it bought
// is served from a separate document that carries nothing worth hiding.

test('anyone at all can read a running advert', async () => {
  // Including signed out. An advertiser paid to reach the whole audience, and
  // a guest scrolling Explore is part of that audience.
  await assertSucceeds(
    getDoc(doc(db(env.unauthenticatedContext()), 'adPlacements/campaign-1')),
  );
  await assertSucceeds(
    getDoc(doc(db(env.authenticatedContext(STRANGER)), 'adPlacements/campaign-1')),
  );
});

test('a paused advert is readable by nobody but staff', async () => {
  // `active: false` is how a pause takes an advert out of the feed, so a reader
  // who can still fetch the document has been served something a reviewer
  // stopped.
  await assertFails(
    getDoc(doc(db(env.unauthenticatedContext()), 'adPlacements/campaign-paused')),
  );
  await assertFails(
    getDoc(doc(db(env.authenticatedContext(STRANGER)), 'adPlacements/campaign-paused')),
  );
  const staff = env.authenticatedContext(VALIDATOR, { role: 'admin' });
  await assertSucceeds(getDoc(doc(db(staff), 'adPlacements/campaign-paused')));
});

test('no client may write a placement', async () => {
  // The projection is derived from a reviewed, paid campaign. A client that
  // could write one could put unreviewed copy in front of everybody, with no
  // campaign and no payment behind it.
  const owner = env.authenticatedContext(ADVERTISER);
  const staff = env.authenticatedContext(VALIDATOR, { role: 'admin' });
  await assertFails(
    setDoc(doc(db(owner), 'adPlacements/campaign-self'), makePlacement('campaign-self')),
  );
  await assertFails(
    updateDoc(doc(db(owner), 'adPlacements/campaign-1'), { headline: 'Free delivery' }),
  );
  await assertFails(
    updateDoc(doc(db(staff), 'adPlacements/campaign-paused'), { active: true }),
  );
  await assertFails(deleteDoc(doc(db(owner), 'adPlacements/campaign-1')));
});
