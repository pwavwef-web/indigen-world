/**
 * Open every contributor's points ledger from the legacy balance fields, and
 * reconcile what the legacy records say against each other.
 *
 * Dry run (default, read-only):
 *   node services/functions/scripts/migrate-points-ledger.mjs --project PROJECT [--firebase-login] [--report FILE]
 * Commit (writes opening entries, stamps legacy requests):
 *   ... --commit
 * Roll back to the legacy fields (keeps the ledger as history, never deletes):
 *   ... --rollback
 * Against the emulator: set FIRESTORE_EMULATOR_HOST and pass --project demo-…
 *
 * Build first (`npm run build:functions`): the script uses the same compiled
 * ledger code as the deployed functions, so the opening entry it writes is
 * byte-for-byte what a lazy opening would write.
 *
 * Safe to rerun. An account is opened once (`opening_<uid>`); an account the
 * functions already opened lazily is left alone and only reconciled. Historic
 * awards are NOT replayed as new awards and balances are NOT reduced: where
 * the legacy records disagree, the discrepancy is reported for Finance and the
 * opening balance is the balance contributors actually saw (`rewardBalance`).
 */
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { commitLedger, openLedger, openingFromLegacy, post, readAccountState, entryId } from '../lib/points-ledger.js';

const args = process.argv.slice(2);
const value = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const project = value('--project');
const commit = args.includes('--commit');
const rollback = args.includes('--rollback');
const reportPath = value('--report');
if (!project || project.startsWith('--')) throw new Error('Pass --project PROJECT.');
if (commit && rollback) throw new Error('Choose --commit or --rollback, not both.');
if (args.includes('--firebase-login')) {
  const require = createRequire(import.meta.url);
  const { configstore } = require('firebase-tools/lib/configstore.js');
  const { clientId, clientSecret } = require('firebase-tools/lib/api.js');
  const refreshToken = configstore.get('tokens')?.refresh_token;
  if (!refreshToken) throw new Error('No Firebase CLI login found. Run firebase login first.');
  const temporary = mkdtempSync(join(tmpdir(), 'points-ledger-'));
  const credentialsPath = join(temporary, 'credentials.json');
  writeFileSync(credentialsPath, JSON.stringify({ type: 'authorized_user', client_id: clientId(), client_secret: clientSecret(), refresh_token: refreshToken }), { mode: 0o600 });
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;
  process.on('exit', () => rmSync(temporary, { recursive: true, force: true }));
}
initializeApp(process.env.FIRESTORE_EMULATOR_HOST ? { projectId: project } : { projectId: project, credential: applicationDefault() });
const db = getFirestore();
const now = new Date().toISOString();
const CLOSED = new Set(['rejected', 'cancelled', 'failed']);

async function* pages(query) {
  let last;
  while (true) {
    let page = query.orderBy('__name__').limit(300);
    if (last) page = page.startAfter(last);
    const snap = await page.get();
    if (snap.empty) return;
    yield snap.docs;
    last = snap.docs.at(-1);
  }
}

const totals = {
  mode: commit ? 'commit' : rollback ? 'rollback' : 'dry-run', project, at: now,
  accounts: 0, alreadyOpen: 0, opened: 0, toOpen: 0, rolledBack: 0, reconciledAfterRollback: 0,
  legacyBalancePoints: 0, legacyLifetimePoints: 0, creditPoints: 0,
  legacyOpenRequests: 0, legacyOpenPoints: 0, legacyOpenValueMinor: 0, legacyRequestsStamped: 0,
  ledgerAvailablePoints: 0, ledgerReservedPoints: 0,
  discrepancies: 0,
};
const discrepancies = [];

// Requests by contributor, in one pass.
const requestsBy = new Map();
for await (const docs of pages(db.collection('contributorRedemptions'))) {
  for (const doc of docs) {
    const d = doc.data();
    if (!['airtime', 'data'].includes(d.kind)) continue;
    const list = requestsBy.get(d.contributorId) ?? [];
    list.push({ ref: doc.ref, id: doc.id, ...d });
    requestsBy.set(d.contributorId, list);
  }
}

for await (const docs of pages(db.collection('contributorAccounts'))) {
  for (const legacyDoc of docs) {
    totals.accounts++;
    const uid = legacyDoc.id;
    const legacy = legacyDoc.data();
    const opening = openingFromLegacy(legacy);
    let credits = 0;
    for await (const rows of pages(legacyDoc.ref.collection('rewardCredits'))) for (const row of rows) credits += Number(row.get('points') ?? 0);
    const requests = requestsBy.get(uid) ?? [];
    const legacyRequests = requests.filter(r => r.settlementPath !== 'ledger-v1');
    const committedLegacy = legacyRequests.filter(r => !CLOSED.has(r.status)).reduce((s, r) => s + Number(r.points ?? 0), 0);
    const open = legacyRequests.filter(r => ['submitted', 'approved', 'needs_reconciliation'].includes(r.status));
    totals.legacyBalancePoints += opening.available;
    totals.legacyLifetimePoints += opening.lifetimeEarned;
    totals.creditPoints += credits;
    totals.legacyOpenRequests += open.length;
    totals.legacyOpenPoints += open.reduce((s, r) => s + Number(r.points ?? 0), 0);
    totals.legacyOpenValueMinor += open.reduce((s, r) => s + Number(r.amountMinor ?? 0), 0);
    const problems = [...opening.problems];
    if (legacy.rewardLifetime !== undefined && credits !== Number(legacy.rewardLifetime)) problems.push(`rewardLifetime ${legacy.rewardLifetime} ≠ sum of rewardCredits ${credits}`);
    if (legacy.rewardBalance !== undefined && Number(legacy.rewardLifetime ?? 0) - committedLegacy !== Number(legacy.rewardBalance)) {
      problems.push(`rewardBalance ${legacy.rewardBalance} ≠ rewardLifetime ${legacy.rewardLifetime ?? 0} − points in non-closed legacy requests ${committedLegacy}`);
    }
    const accountRef = db.collection('contributorPointAccounts').doc(uid);
    const existing = await accountRef.get();
    if (existing.exists) {
      totals.alreadyOpen++;
      const state = readAccountState(existing.data());
      totals.ledgerAvailablePoints += state.available;
      totals.ledgerReservedPoints += state.reserved;
    } else totals.toOpen++;
    if (problems.length) { totals.discrepancies++; discrepancies.push({ contributorId: uid, problems }); }

    if (commit) {
      // Re-migration after a rollback: legacy code may have changed rewardBalance since.
      if (existing.exists && existing.get('rolledBackAt')) {
        await db.runTransaction(async tx => {
          const [acc, leg] = await Promise.all([tx.get(accountRef), tx.get(legacyDoc.ref)]);
          if (!acc.get('rolledBackAt')) return;
          const session = await openLedger(db, tx, uid, now);
          const delta = Number(leg.get('rewardBalance') ?? 0) - session.state.available;
          if (delta !== 0) post(session, { id: entryId('remigrate', `${uid}:${acc.get('rolledBackAt')}`), type: 'adjustment', points: delta,
            reason: 'Re-migration after rollback: changes made by the previous system while it was restored.', actor: { kind: 'migration', id: 'migrate-points-ledger' } });
          commitLedger(session);
          tx.set(accountRef, { rolledBackAt: null }, { merge: true });
          tx.set(legacyDoc.ref, { rewardLedger: { openedAt: acc.get('openedAt') ?? now, reopenedAt: now } }, { merge: true });
        });
        totals.reconciledAfterRollback++;
      } else if (!existing.exists) {
        const opened = await db.runTransaction(async tx => {
          const session = await openLedger(db, tx, uid, now);
          if (session.opened) return false; // opened lazily meanwhile
          commitLedger(session);
          return true;
        });
        if (opened) totals.opened++;
      }
      for (const r of legacyRequests.filter(r => r.settlementPath !== 'legacy')) {
        await r.ref.set({ settlementPath: 'legacy' }, { merge: true });
        totals.legacyRequestsStamped++;
      }
    }

    if (rollback && existing.exists && !existing.get('rolledBackAt')) {
      await db.runTransaction(async tx => {
        const acc = await tx.get(accountRef);
        if (!acc.exists || acc.get('rolledBackAt')) return;
        const state = readAccountState(acc.data());
        // The previous system deducts points on request, so its balance is the
        // ledger's AVAILABLE points (reserved points are already out of it).
        tx.set(legacyDoc.ref, { rewardBalance: state.available, rewardLifetime: state.lifetimeEarned, rewardLedger: null }, { merge: true });
        tx.set(accountRef, { rolledBackAt: now }, { merge: true });
        const audit = db.collection('auditLogs').doc();
        tx.set(audit, { id: audit.id, domain: 'contributor-rewards', action: 'contributor.reward.ledger.rollback', actor: { collection: 'system', id: 'migrate-points-ledger' },
          target: { collection: 'contributorPointAccounts', id: uid }, before: null, after: { rewardBalance: state.available, rewardLifetime: state.lifetimeEarned },
          outcome: 'success', source: 'script', reason: 'Rollback to legacy balance fields', metadata: {}, occurredAt: now });
      });
      totals.rolledBack++;
    }
  }
}

const report = { totals, discrepancies };
if (reportPath) writeFileSync(reportPath, JSON.stringify(report, null, 2));
// Aggregates only on stdout; per-account detail goes to the --report file (keep it outside Git).
console.log(JSON.stringify(totals, null, 2));
console.log(`${discrepancies.length} account(s) with discrepancies${reportPath ? ` — details in ${reportPath}` : ' — pass --report FILE for details'}.`);
