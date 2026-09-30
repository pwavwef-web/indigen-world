/**
 * Credit contributor expressions approved before points existed.
 * Dry run: node services/functions/scripts/backfill-contributor-points.mjs --project PROJECT
 * Write:   node services/functions/scripts/backfill-contributor-points.mjs --project PROJECT --commit
 * Requires application default credentials with Firestore access. Safe to rerun:
 * one rewardCredits document is created for each original submission.
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const project = args[args.indexOf('--project') + 1];
const commit = args.includes('--commit');
const revertSubmissionCredits = args.includes('--revert-submission-credits');
if (!project || project.startsWith('--')) throw new Error('Pass --project PROJECT.');
// Reuse the existing Firebase CLI login when gcloud ADC is unavailable.
// The short-lived ADC file stays outside the repository and is removed on exit.
if (args.includes('--firebase-login')) {
  const require = createRequire(import.meta.url);
  const { configstore } = require('firebase-tools/lib/configstore.js');
  const { clientId, clientSecret } = require('firebase-tools/lib/api.js');
  const refreshToken = configstore.get('tokens')?.refresh_token;
  if (!refreshToken) throw new Error('No Firebase CLI login found. Run firebase login first.');
  const temporary = mkdtempSync(join(tmpdir(), 'contributor-points-'));
  const credentialsPath = join(temporary, 'credentials.json');
  writeFileSync(credentialsPath, JSON.stringify({ type: 'authorized_user',
    client_id: clientId(), client_secret: clientSecret(), refresh_token: refreshToken }), { mode: 0o600 });
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;
  process.on('exit', () => rmSync(temporary, { recursive: true, force: true }));
  process.once('SIGINT', () => process.exit(130));
  process.once('SIGTERM', () => process.exit(143));
}
initializeApp({ projectId: project, credential: applicationDefault() });
const db = getFirestore();
const settings = (await db.doc('settings/contributorRewards').get()).data() ?? {};
const pointsPerExpression = settings.pointsPerExpression ?? 10;
const dailyCap = settings.dailyCap ?? 300;
if (![pointsPerExpression, dailyCap].every(value => Number.isSafeInteger(value) && value > 0)
  || dailyCap < pointsPerExpression) throw new Error('Invalid reward settings.');

async function* pages(collection) {
  let last;
  while (true) {
    let query = collection.orderBy('__name__').limit(200);
    if (last) query = query.startAfter(last);
    const page = await query.get();
    if (page.empty) return;
    yield page.docs;
    last = page.docs.at(-1);
  }
}

const totals = { accounts: 0, submittedItems: 0, eligible: 0, alreadyCredited: 0,
  awaitingApproval: 0, missingOriginal: 0, invalidOriginal: 0, credited: 0, zeroPoint: 0, points: 0 };
const candidates = [];
const reversals = [];
for await (const accounts of pages(db.collection('contributorAccounts'))) {
  for (const account of accounts) {
    totals.accounts++;
    for await (const works of pages(account.ref.collection('works'))) {
      for (const work of works) {
        for await (const items of pages(work.ref.collection('items'))) {
          for (const item of items) {
            if (!item.get('submissionId')) continue;
            totals.submittedItems++;
            const originalId = createHash('sha256').update(`${account.id}/${work.id}/${item.id}`).digest('hex');
            const originalRef = db.doc(`submissions/${originalId}`);
            const original = await originalRef.get();
            if (!original.exists) { totals.missingOriginal++; continue; }
            const portal = original.get('contributorPortal');
            const createdAt = original.get('lifecycle.createdAt');
            if (original.get('authUid') !== account.id || portal?.contributorId !== account.id
              || portal?.work !== work.id || portal?.item !== item.id || original.get('revisionOf')
              || typeof createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(createdAt)) {
              totals.invalidOriginal++; continue;
            }
            const creditRef = account.ref.collection('rewardCredits').doc(originalId);
            const credit = await creditRef.get();
            if (credit.exists) {
              totals.alreadyCredited++;
              if (credit.get('source') === 'historical-backfill') reversals.push({ accountRef: account.ref, creditRef });
              continue;
            }
            const reviewed = await db.doc(`submissions/${item.get('submissionId')}`).get();
            const reviewedPortal = reviewed.get('contributorPortal');
            if (!reviewed.exists || reviewedPortal?.contributorId !== account.id
              || reviewedPortal?.work !== work.id || reviewedPortal?.item !== item.id) {
              totals.invalidOriginal++; continue;
            }
            if (!['APPROVED', 'PUBLISHED'].includes(reviewed.get('status'))) {
              totals.awaitingApproval++; continue;
            }
            const decidedAt = reviewed.get('moderation.decidedAt');
            if (typeof decidedAt !== 'string' || Number.isNaN(Date.parse(decidedAt))) {
              totals.invalidOriginal++; continue;
            }
            totals.eligible++;
            candidates.push({ accountRef: account.ref, originalRef, reviewedRef: reviewed.ref, creditRef,
              work: work.id, item: item.id, day: new Date(decidedAt).toISOString().slice(0, 10), decidedAt });
          }
        }
      }
    }
  }
}

// Earlier approvals get the day's available awards first.
candidates.sort((a, b) => a.decidedAt.localeCompare(b.decidedAt));
if (revertSubmissionCredits && commit) {
  for (const { accountRef, creditRef } of reversals) {
    const removed = await db.runTransaction(async tx => {
      const credit = await tx.get(creditRef);
      if (!credit.exists || credit.get('source') !== 'historical-backfill') return 0;
      const dayRef = accountRef.collection('rewardDays').doc(String(credit.get('day')));
      const [account, day] = await Promise.all([tx.get(accountRef), tx.get(dayRef)]);
      const points = Number(credit.get('points') ?? 0);
      const balance = Number(account.get('rewardBalance') ?? 0);
      const lifetime = Number(account.get('rewardLifetime') ?? 0);
      const earned = Number(day.get('points') ?? 0);
      if (!account.exists || balance < points || lifetime < points || earned < points) {
        throw new Error(`Cannot safely reverse ${creditRef.path}.`);
      }
      if (points) {
        tx.update(accountRef, { rewardBalance: balance - points, rewardLifetime: lifetime - points });
        tx.update(dayRef, { points: earned - points, updatedAt: new Date().toISOString() });
      }
      tx.delete(creditRef);
      return points;
    });
    totals.points += removed;
    totals.credited++;
  }
} else if (commit) {
  for (const candidate of candidates) {
    const result = await db.runTransaction(async tx => {
      const dayRef = candidate.accountRef.collection('rewardDays').doc(candidate.day);
      const [account, original, reviewed, credit, day] = await Promise.all([
        tx.get(candidate.accountRef), tx.get(candidate.originalRef), tx.get(candidate.reviewedRef),
        tx.get(candidate.creditRef), tx.get(dayRef),
      ]);
      if (credit.exists) return null;
      const portal = original.get('contributorPortal');
      if (!account.exists || !original.exists || original.get('revisionOf')
        || original.get('authUid') !== candidate.accountRef.id
        || portal?.work !== candidate.work || portal?.item !== candidate.item
        || !reviewed.exists || !['APPROVED', 'PUBLISHED'].includes(reviewed.get('status'))
        || reviewed.get('moderation.decidedAt') !== candidate.decidedAt) {
        throw new Error(`Approved submission changed: ${candidate.reviewedRef.path}`);
      }
      const earned = Number(day.get('points') ?? 0);
      const award = Math.max(0, Math.min(pointsPerExpression, dailyCap - earned));
      const now = new Date().toISOString();
      tx.create(candidate.creditRef, { submissionId: candidate.reviewedRef.id,
        work: candidate.work, item: candidate.item, day: candidate.day,
        points: award, source: 'approval-backfill', createdAt: now });
      if (award > 0) {
        tx.set(dayRef, { day: candidate.day, points: earned + award, updatedAt: now });
        tx.update(candidate.accountRef, {
          rewardBalance: Number(account.get('rewardBalance') ?? 0) + award,
          rewardLifetime: Number(account.get('rewardLifetime') ?? 0) + award,
        });
      }
      return award;
    });
    if (result === null) { totals.alreadyCredited++; continue; }
    totals.credited++;
    totals.points += result;
    if (result === 0) totals.zeroPoint++;
  }
}
console.log(JSON.stringify({ mode: commit ? 'committed' : 'dry-run', project,
  operation: revertSubmissionCredits ? 'revert-submission-credits' : 'backfill',
  pointsPerExpression, dailyCap, reversibleCredits: reversals.length, ...totals }, null, 2));
if (totals.missingOriginal || totals.invalidOriginal) {
  process.exitCode = 2;
  console.error('Some submitted items could not be verified against an original submission; investigate before declaring the backfill complete.');
}
