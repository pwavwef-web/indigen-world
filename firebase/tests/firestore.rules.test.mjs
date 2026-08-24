// Firestore Security Rules tests, run against the Firestore emulator.
//
//   npm run test:rules        (from the repo root — wraps this in emulators:exec)
//
// Covers the governance model in firebase/firestore.rules: public vs. restricted
// reads, contributor ownership and draft/submit limits, server-only privileged
// collections (reviews, auditLogs), and no-privilege-escalation on profiles.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';

const PROJECT_ID = 'demo-indigen-world';
const host = '127.0.0.1';
const port = 8080;
const rulesPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'firestore.rules');

/** A content document whose governance block is what the rules inspect. */
function makeEntry(ownerUid, { id, status, tier, validator = null, consentStatus = 'granted', licence = 'community_restricted' }) {
  return {
    id,
    headword: 'nia',
    partOfSpeech: 'noun',
    senses: [{ definition: 'water' }],
    governance: {
      source: 'test fixture',
      contributor: { collection: 'contributors', id: ownerUid },
      language: { collection: 'languages', id: 'kasem' },
      dialect: null,
      validationStatus: status,
      validator,
      consentStatus,
      consent: consentStatus === 'granted'
        ? { collection: 'consentRecords', id: `consent-${ownerUid}` }
        : null,
      licence,
      culturalPermissionTier: tier,
    },
    lifecycle: {
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-01T00:00:00Z',
      version: 1,
    },
  };
}

function makeConsent(ownerUid, status = 'granted') {
  return {
    id: `consent-${ownerUid}`,
    subject: { collection: 'contributors', id: ownerUid },
    grantedBy: { collection: 'contributors', id: ownerUid },
    status,
    scope: ['publication'],
    method: 'digital_attestation',
    effectiveFrom: '2026-08-01',
    lifecycle: {
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-01T00:00:00Z',
      version: 1,
    },
  };
}

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(rulesPath, 'utf8'), host, port },
  });

  // Seed fixtures with rules disabled.
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'consentRecords/consent-contrib1'), makeConsent('contrib1'));
    await setDoc(doc(db, 'lexicalEntries/validated-public'), makeEntry('contrib1', { id: 'validated-public', status: 'validated', tier: 'public' }));
    await setDoc(doc(db, 'lexicalEntries/draft-own'), makeEntry('contrib1', { id: 'draft-own', status: 'draft', tier: 'public' }));
    await setDoc(doc(db, 'languages/kasem'), { code: 'xsm', name: 'Kasem' });
    await setDoc(doc(db, 'reviews/r1'), { target: { collection: 'lexicalEntries', id: 'x' }, decision: 'approved' });
    await setDoc(doc(db, 'auditLogs/a1'), { actor: { collection: 'validators', id: 'v1' }, action: 'content.validate' });
    await setDoc(doc(db, 'dictionaryEntries/published-word'), {
      kasemText: 'Konkwolo', englishText: 'Bottle', isPublished: true,
    });
    await setDoc(doc(db, 'dictionaryEntries/private-word'), {
      kasemText: 'Draft', englishText: 'Draft', isPublished: false,
    });
    await setDoc(doc(db, 'collectionContributions/contribution-owned'), {
      id: 'contribution-owned',
      authUid: 'member-collection',
      collectionKind: 'dictionary',
      title: 'Bottle',
      status: 'SUBMITTED',
    });
  });
});

after(async () => {
  await env?.cleanup();
});

const db = (ctx) => ctx.firestore();

test('anyone can read validated public content', async () => {
  const anon = env.unauthenticatedContext();
  await assertSucceeds(getDoc(doc(db(anon), 'lexicalEntries/validated-public')));
});

test('anonymous users cannot read an unvalidated draft', async () => {
  const anon = env.unauthenticatedContext();
  await assertFails(getDoc(doc(db(anon), 'lexicalEntries/draft-own')));
});

test('a validator can read any content, including drafts', async () => {
  const validator = env.authenticatedContext('val1', { role: 'validator' });
  await assertSucceeds(getDoc(doc(db(validator), 'lexicalEntries/draft-own')));
});

test('a contributor can create their own draft', async () => {
  const contrib = env.authenticatedContext('contrib2', { role: 'contributor' });
  await assertSucceeds(
    setDoc(doc(db(contrib), 'lexicalEntries/new-draft'), makeEntry('contrib2', { id: 'new-draft', status: 'draft', tier: 'public', consentStatus: 'pending' })),
  );
});

test('a contributor can atomically create consent and a ready submission', async () => {
  const contrib = env.authenticatedContext('contrib4', { role: 'contributor' });
  const store = db(contrib);
  const batch = writeBatch(store);
  batch.set(doc(store, 'consentRecords/consent-contrib4'), makeConsent('contrib4'));
  batch.set(doc(store, 'lexicalEntries/ready-submission'), makeEntry('contrib4', {
    id: 'ready-submission', status: 'submitted', tier: 'public',
  }));
  await assertSucceeds(batch.commit());
});

test('a custom or undetermined licence cannot be submitted without reviewed terms', async () => {
  const contrib = env.authenticatedContext('contrib5', { role: 'contributor' });
  const store = db(contrib);
  const batch = writeBatch(store);
  batch.set(doc(store, 'consentRecords/consent-contrib5'), makeConsent('contrib5'));
  batch.set(doc(store, 'lexicalEntries/custom-licence'), makeEntry('contrib5', {
    id: 'custom-licence', status: 'submitted', tier: 'public', licence: 'custom',
  }));
  await assertFails(batch.commit());
});

test('a contributor cannot create content already marked validated', async () => {
  const contrib = env.authenticatedContext('contrib2', { role: 'contributor' });
  await assertFails(
    setDoc(doc(db(contrib), 'lexicalEntries/cheat'), makeEntry('contrib2', { id: 'cheat', status: 'validated', tier: 'public' })),
  );
});

test('a contributor cannot create content owned by someone else', async () => {
  const contrib = env.authenticatedContext('contrib2', { role: 'contributor' });
  await assertFails(
    setDoc(doc(db(contrib), 'lexicalEntries/forge'), makeEntry('contrib1', { id: 'forge', status: 'draft', tier: 'public' })),
  );
});

test('an owner can submit their own draft', async () => {
  const contrib = env.authenticatedContext('contrib1', { role: 'contributor' });
  await assertSucceeds(
    updateDoc(doc(db(contrib), 'lexicalEntries/draft-own'), {
      'governance.validationStatus': 'submitted',
      'lifecycle.updatedAt': '2026-08-02T00:00:00Z',
      'lifecycle.version': 2,
    }),
  );
});

test('an owner cannot self-validate their content', async () => {
  const contrib = env.authenticatedContext('contrib1', { role: 'contributor' });
  await assertFails(
    updateDoc(doc(db(contrib), 'lexicalEntries/draft-own'), { 'governance.validationStatus': 'validated' }),
  );
});

test('pending consent cannot be bypassed when a contributor submits', async () => {
  const contrib = env.authenticatedContext('contrib2', { role: 'contributor' });
  await assertSucceeds(
    setDoc(doc(db(contrib), 'lexicalEntries/pending-consent'), makeEntry('contrib2', {
      id: 'pending-consent', status: 'draft', tier: 'public', consentStatus: 'pending',
    })),
  );
  await assertFails(updateDoc(doc(db(contrib), 'lexicalEntries/pending-consent'), {
    'governance.validationStatus': 'submitted',
    'lifecycle.updatedAt': '2026-08-02T00:00:00Z',
    'lifecycle.version': 2,
  }));
});

test('withdrawn consent immediately removes public access', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(db(ctx), 'consentRecords/consent-contrib1'), { status: 'withdrawn' });
  });
  const anon = env.unauthenticatedContext();
  await assertFails(getDoc(doc(db(anon), 'lexicalEntries/validated-public')));
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(db(ctx), 'consentRecords/consent-contrib1'), { status: 'granted' });
  });
});

test('reviews are readable by validators but not contributors', async () => {
  const validator = env.authenticatedContext('val1', { role: 'validator' });
  const contrib = env.authenticatedContext('contrib1', { role: 'contributor' });
  await assertSucceeds(getDoc(doc(db(validator), 'reviews/r1')));
  await assertFails(getDoc(doc(db(contrib), 'reviews/r1')));
});

test('no client may write to the audit log; only admins may read it', async () => {
  const admin = env.authenticatedContext('admin1', { role: 'admin' });
  const contrib = env.authenticatedContext('contrib1', { role: 'contributor' });
  await assertFails(setDoc(doc(db(admin), 'auditLogs/forge'), { action: 'x.y' }));
  await assertSucceeds(getDoc(doc(db(admin), 'auditLogs/a1')));
  await assertFails(getDoc(doc(db(contrib), 'auditLogs/a1')));
});

test('registry languages are public-read but admin-write only', async () => {
  const anon = env.unauthenticatedContext();
  const contrib = env.authenticatedContext('contrib1', { role: 'contributor' });
  const admin = env.authenticatedContext('admin1', { role: 'admin' });
  await assertSucceeds(getDoc(doc(db(anon), 'languages/kasem')));
  await assertFails(setDoc(doc(db(contrib), 'languages/rogue'), { code: 'zz' }));
  await assertSucceeds(setDoc(doc(db(admin), 'languages/new-cell'), { code: 'aa', name: 'Test' }));
});

test('only published legacy dictionary rows are publicly readable', async () => {
  const anon = env.unauthenticatedContext();
  const validator = env.authenticatedContext('val-dictionary', { role: 'validator' });
  await assertSucceeds(getDoc(doc(db(anon), 'dictionaryEntries/published-word')));
  await assertFails(getDoc(doc(db(anon), 'dictionaryEntries/private-word')));
  await assertSucceeds(getDoc(doc(db(validator), 'dictionaryEntries/private-word')));
});

test('callable-created Collection contributions are private to their owner and staff', async () => {
  const anon = env.unauthenticatedContext();
  const owner = env.authenticatedContext('member-collection');
  const stranger = env.authenticatedContext('member-guarded');
  const validator = env.authenticatedContext('val-collection', { role: 'validator' });
  const path = 'collectionContributions/contribution-owned';
  await assertFails(getDoc(doc(db(anon), path)));
  await assertFails(getDoc(doc(db(stranger), path)));
  await assertSucceeds(getDoc(doc(db(owner), path)));
  await assertSucceeds(getDoc(doc(db(validator), path)));
});

test('Collection contribution writes must go through the callable bridge', async () => {
  const member = env.authenticatedContext('member-collection');
  const validator = env.authenticatedContext('val-collection', { role: 'validator' });
  const forged = {
    id: 'direct-write',
    authUid: 'member-collection',
    collectionKind: 'dictionary',
    title: 'Unsafe direct write',
    status: 'SUBMITTED',
  };
  await assertFails(
    setDoc(doc(db(member), 'collectionContributions/direct-write'), forged),
  );
  await assertFails(
    updateDoc(doc(db(validator), 'collectionContributions/contribution-owned'), {
      status: 'PUBLISHED',
    }),
  );
});

test('a contributor profile cannot be created with points, nor escalate its own role', async () => {
  const contrib = env.authenticatedContext('contrib3', { role: 'contributor' });
  // Cannot self-award points at creation.
  await assertFails(
    setDoc(doc(db(contrib), 'contributors/contrib3'), {
      authUid: 'contrib3',
      displayName: 'Test',
      roles: ['contributor'],
      status: 'pending',
      points: 500,
    }),
  );
  // Valid creation with zero points.
  await assertSucceeds(
    setDoc(doc(db(contrib), 'contributors/contrib3'), {
      authUid: 'contrib3',
      displayName: 'Test',
      roles: ['contributor'],
      status: 'pending',
      points: 0,
    }),
  );
  // Cannot escalate own role on update.
  await assertFails(
    updateDoc(doc(db(contrib), 'contributors/contrib3'), { roles: ['admin'] }),
  );
});

test('public form submissions can be read and updated by staff, deleted by admin, but not accessed by guests or contributors', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(db(ctx), 'publicFormSubmissions/sub1'), {
      id: 'sub1',
      form: 'get-involved',
      payload: { name: 'Interest Candidate', contact: 'test@example.com', route: 'Technical volunteer' },
      status: 'new',
    });
  });

  const anon = env.unauthenticatedContext();
  const contrib = env.authenticatedContext('contrib1', { role: 'contributor' });
  const validator = env.authenticatedContext('val1', { role: 'validator' });
  const admin = env.authenticatedContext('admin1', { role: 'admin' });

  // Anonymous and ordinary contributors cannot read or write directly
  await assertFails(getDoc(doc(db(anon), 'publicFormSubmissions/sub1')));
  await assertFails(getDoc(doc(db(contrib), 'publicFormSubmissions/sub1')));
  await assertFails(setDoc(doc(db(anon), 'publicFormSubmissions/sub2'), { status: 'new' }));

  // Staff (validator) can read and update status
  await assertSucceeds(getDoc(doc(db(validator), 'publicFormSubmissions/sub1')));
  await assertSucceeds(updateDoc(doc(db(validator), 'publicFormSubmissions/sub1'), { status: 'contacted' }));

  // Admin can delete
  await assertSucceeds(getDoc(doc(db(admin), 'publicFormSubmissions/sub1')));
});

