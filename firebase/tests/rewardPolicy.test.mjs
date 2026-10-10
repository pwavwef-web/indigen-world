import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_AWARD_POLICY, DEFAULT_REDEMPTION_POLICY, PolicyError, bundlePoints, computeAward, liabilityEstimate,
  overallScore, parseAwardPolicy, parseRedemptionPolicy, profitableSplit, quotePoints, redemptionValueMinor,
} from '../../services/functions/lib/reward-policy.js';
import { EMPTY_ACCOUNT, LedgerError, applyEntry, entryId, openingFromLegacy } from '../../services/functions/lib/points-ledger.js';
import { ledgerTypeFor, providerOutcome, redemptionTransition } from '../../services/functions/lib/contributor-rewards.js';

const policy = structuredClone(DEFAULT_REDEMPTION_POLICY);
const award = structuredClone(DEFAULT_AWARD_POLICY);
const all = (score) => ({ accuracy: score, completeness: score, technical: score, metadata: score });

test('the four published redemption examples are exact', () => {
  assert.equal(redemptionValueMinor(300, policy), 500);
  assert.equal(redemptionValueMinor(900, policy), 1550);
  assert.equal(redemptionValueMinor(1800, policy), 3200);
  assert.equal(redemptionValueMinor(3000, policy), 5500);
  const q = quotePoints(900, policy);
  assert.deepEqual([q.baseMinor, q.bonusMinor, q.totalMinor], [1500, 50, 1550]);
  assert.deepEqual(q.bands.map(b => [b.fromPoint, b.toPoint, b.bonusBps]), [[1, 300, 0], [301, 900, 500]]);
});

test('bonus bands are marginal at every boundary, never retroactive', () => {
  // value(p+1) - value(p) is the marginal rate of point p+1, in exact thirds of a pesewa.
  const exact = p => quotePoints(p, policy).bands.reduce((sum, b) => sum + b.points * 500 * (10000 + b.bonusBps), 0) / 3_000_000;
  for (const [boundary, before, after] of [[300, 0, 500], [900, 500, 1000], [1800, 1000, 1500]]) {
    assert.ok(Math.abs(exact(boundary) - exact(boundary - 1) - (5 / 3) * (1 + before / 10000)) < 1e-9);
    assert.ok(Math.abs(exact(boundary + 1) - exact(boundary) - (5 / 3) * (1 + after / 10000)) < 1e-9);
  }
  // A retroactive multiplier would pay 1.05 × 301 points; marginal pays only 1 point at +5%.
  assert.equal(redemptionValueMinor(301, policy), Math.round((300 * 500 + 525) / 300));
  assert.equal(quotePoints(301, policy).totalMinor, 502);
});

test('rounding happens once on the total and is half-up', () => {
  // 301 points: 150000 + 525 = 150525 / 300 = 501.75 → 502.
  assert.equal(redemptionValueMinor(301, policy), 502);
  // 302 points: 150000 + 1050 = 151050 / 300 = 503.5 → 504 (half-up).
  assert.equal(redemptionValueMinor(302, policy), 504);
  for (let p = 300; p <= 6000; p++) assert.ok(redemptionValueMinor(p + 1, policy) >= redemptionValueMinor(p, policy));
});

test('splitting a redemption is never profitable, even after rounding', () => {
  assert.equal(profitableSplit(policy), null);
  // A minimum below the first band end would let two rounded halves beat the whole.
  const loose = { ...policy, minimumPoints: 100 };
  const split = profitableSplit(loose);
  assert.ok(split, 'expected a profitable split to be detected');
  assert.throws(() => parseRedemptionPolicy(loose), PolicyError);
  assert.throws(() => parseRedemptionPolicy({ ...policy, bands: [{ upToPoints: 300, bonusBps: 500 }, { upToPoints: null, bonusBps: 0 }] }), /cannot fall/);
});

test('next band hint names the next better rate', () => {
  assert.deepEqual(quotePoints(300, policy).nextBand, { atPoint: 301, bonusBps: 500 });
  assert.deepEqual(quotePoints(900, policy).nextBand, { atPoint: 901, bonusBps: 1000 });
  assert.equal(quotePoints(3000, policy).nextBand, null);
});

test('data bundles cost whole points and show the residual', () => {
  const config = parseRedemptionPolicy({ ...policy, dataBundles: [{ id: 'mtn-test', network: 'MTN', label: 'Test bundle', priceMinor: 1000 }] });
  const priced = bundlePoints(config.dataBundles[0], config);
  assert.equal(redemptionValueMinor(priced.points, config) >= 1000, true);
  assert.equal(redemptionValueMinor(priced.points - 1, config) < 1000, true);
  assert.equal(priced.residualMinor, priced.valueMinor - 1000);
  assert.throws(() => parseRedemptionPolicy({ ...policy, dataBundles: [{ id: 'tiny', network: 'MTN', label: 'Tiny', priceMinor: 200 }] }), /cannot be offered/);
});

test('award bands, multipliers and the exact calculation sentence', () => {
  assert.equal(computeAward(award, 'expressions', all(59)).points, 0);
  assert.equal(computeAward(award, 'expressions', all(59)).band, null);
  assert.equal(computeAward(award, 'expressions', all(60)).points, 20);
  assert.equal(computeAward(award, 'expressions', all(79)).band, 'standard');
  const strong = computeAward(award, 'expressions', all(80));
  assert.equal(strong.points, 25);
  assert.equal(strong.calculation, '20 category points × 1.25 strong-quality multiplier = 25 points');
  assert.equal(computeAward(award, 'expressions', all(89)).band, 'strong');
  assert.equal(computeAward(award, 'expressions', all(90)).points, 30);
  assert.equal(computeAward(award, 'expressions', all(100)).band, 'exceptional');
});

test('a short expression can reach the top band: length is not a dimension', () => {
  const a = computeAward(award, 'expressions', { accuracy: 95, completeness: 92, technical: 90, metadata: 90 });
  assert.equal(a.band, 'exceptional');
});

test('non-applicable dimensions are excluded and weights renormalised', () => {
  const s = overallScore({ accuracy: 90, completeness: 80, technical: null, metadata: null }, award.categories.expressions.weights);
  // 50×90 + 25×80 over 75.
  assert.equal(s.display, Math.round(((50 * 90 + 25 * 80) / 75) * 10) / 10);
  assert.deepEqual(s.excluded, ['technical', 'metadata']);
});

test('accuracy can never be renormalised away: no accuracy score, no award or estimate', () => {
  assert.throws(() => computeAward(award, 'expressions', { accuracy: null, completeness: 100, technical: 100, metadata: 100 }), /Accuracy needs a score/);
});

test('effort units are capped and bounded by category maximum', () => {
  const config = parseAwardPolicy({ ...award, categories: { ...award.categories, audiobooks: { ...award.categories.audiobooks, enabled: true } } });
  const padded = computeAward(config, 'audiobooks', all(90), 100000);
  const capped = computeAward(config, 'audiobooks', all(90), 300);
  assert.equal(capped.effortUnits, 10);
  assert.equal(padded.effortUnits, 10, 'padding past the cap earns nothing more');
  assert.equal(padded.points, 120);
  assert.equal(padded.bounded, 'max');
});

test('award policy refuses to switch off validator confirmation or enable automated settlement', () => {
  assert.throws(() => parseAwardPolicy({ ...award, requireValidatorConfirmation: false }), /Validator confirmation/);
  assert.throws(() => parseAwardPolicy({ ...award, automatedSettlement: true }), /shadow calibration/);
  assert.throws(() => parseAwardPolicy({ ...award, bands: [award.bands[0], { ...award.bands[1], multiplierBps: 9000 }, award.bands[2]] }), /lower multiplier/);
});

test('ledger balances cannot go negative and each movement is exact', () => {
  let s = applyEntry(EMPTY_ACCOUNT, 'opening_balance', 600).next;
  s = applyEntry(s, 'award', 25).next;
  assert.equal(s.available, 625);
  s = applyEntry(s, 'reservation', 600).next;
  assert.deepEqual([s.available, s.reserved], [25, 600]);
  assert.throws(() => applyEntry(s, 'reservation', 26), LedgerError);
  assert.throws(() => applyEntry(s, 'release', 601), LedgerError);
  s = applyEntry(s, 'settlement', 600).next;
  assert.deepEqual([s.available, s.reserved, s.lifetimeRedeemed], [25, 0, 600]);
  assert.throws(() => applyEntry(s, 'opening_balance', 1), LedgerError);
  assert.throws(() => applyEntry(s, 'adjustment', -26), LedgerError);
});

test('legacy balances open once, with discrepancies reported rather than invented', () => {
  assert.deepEqual(openingFromLegacy({ rewardBalance: 300, rewardLifetime: 900 }), { available: 300, lifetimeEarned: 900, legacyCommittedPoints: 600, problems: [] });
  const bad = openingFromLegacy({ rewardBalance: -5 });
  assert.equal(bad.available, 0);
  assert.ok(bad.problems.length >= 1);
  assert.equal(entryId('award', 'abc'), 'award_abc');
  assert.ok(entryId('x', 'y'.repeat(200)).length < 60);
});

test('redemption transitions release or settle exactly once and hold ambiguous outcomes', () => {
  assert.deepEqual(redemptionTransition('submitted', 'approve'), { next: 'approved', movement: null });
  assert.deepEqual(redemptionTransition('approved', 'mark_ambiguous'), { next: 'needs_reconciliation', movement: null });
  assert.deepEqual(redemptionTransition('needs_reconciliation', 'fulfill'), { next: 'fulfilled', movement: 'settle' });
  assert.deepEqual(redemptionTransition('needs_reconciliation', 'fail'), { next: 'failed', movement: 'release' });
  assert.equal(redemptionTransition('needs_reconciliation', 'reject'), null, 'an ambiguous payment cannot simply be refunded');
  assert.equal(redemptionTransition('approved', 'cancel'), null);
  for (const final of ['fulfilled', 'failed', 'rejected', 'cancelled']) {
    for (const action of ['approve', 'reject', 'fulfill', 'fail', 'mark_ambiguous', 'cancel']) assert.equal(redemptionTransition(final, action), null);
  }
  assert.equal(ledgerTypeFor('legacy', 'release'), 'legacy_refund');
  assert.equal(ledgerTypeFor('ledger-v1', 'settle'), 'settlement');
});

test('provider outcomes: timeouts wait, repeats are no-ops, late success after refund is a discrepancy', () => {
  assert.deepEqual(providerOutcome('approved', 'timeout'), { action: 'mark_ambiguous', discrepancy: null });
  assert.deepEqual(providerOutcome('needs_reconciliation', 'delivered'), { action: 'fulfill', discrepancy: null });
  assert.deepEqual(providerOutcome('fulfilled', 'delivered'), { action: null, discrepancy: null });
  assert.deepEqual(providerOutcome('failed', 'delivered'), { action: null, discrepancy: 'late-success-after-release' });
  assert.deepEqual(providerOutcome('fulfilled', 'failed'), { action: null, discrepancy: 'failure-after-delivery' });
});

test('liability gives a base and an upper estimate from real balances', () => {
  const l = liabilityEstimate([900, 3000, 100], policy);
  assert.equal(l.atBaseMinor, 1500 + 5000 + Math.round(100 * 5 / 3));
  assert.equal(l.upperMinor, 1550 + 5500 + Math.round(100 * 5 / 3));
  assert.equal(l.belowMinimumPoints, 100);
});

test('the Python worker contract: shared vectors are current and a real worker result passes the backend validator', async () => {
  const { readFileSync } = await import('node:fs');
  const { execFileSync } = await import('node:child_process');
  const { vectors } = await import('../../services/assessment-worker/tests/make_vectors.mjs');
  const committed = JSON.parse(readFileSync(new URL('../../services/assessment-worker/tests/fixtures/policy_vectors.json', import.meta.url), 'utf8'));
  assert.deepEqual(committed, JSON.parse(JSON.stringify(vectors())), 'Run node services/assessment-worker/tests/make_vectors.mjs');
  const { validateWorkerResult } = await import('../../services/functions/lib/reward-assessment.js');
  const cwd = new URL('../../services/assessment-worker/', import.meta.url);
  let output;
  try {
    output = execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['-m', 'assessment_worker.cli', 'assess', 'examples/job.example.json'],
      { cwd, encoding: 'utf8', env: { ...process.env, ASSESSMENT_KAWURI: 'off', PYTHONIOENCODING: 'utf-8' } });
  } catch (error) {
    if (error.code === 'ENOENT') return; // no Python on this machine; the worker's own suite covers it
    throw error;
  }
  const result = JSON.parse(output);
  const checked = validateWorkerResult(result, { submissionId: 'sub-example-1', contributionKey: 'key-example-1', category: 'expressions' });
  assert.equal(checked.routing, 'validator-review');
  assert.equal(checked.dimensions.accuracy.basis, 'unavailable');
});

test('the browser preview copy of the reward arithmetic is identical to the server module', async () => {
  const { execFileSync } = await import('node:child_process');
  execFileSync(process.execPath, [new URL('../../scripts/sync-reward-policy.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), '--check']);
});
