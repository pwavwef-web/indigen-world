// Writes the policy snapshot and award vectors the Python port is checked against.
// Run: node services/assessment-worker/tests/make_vectors.mjs   (after npm run build:functions)
// firebase/tests/rewardPolicy.test.mjs fails if the committed file drifts from the TS policy.
import { writeFileSync } from 'node:fs';
import { DEFAULT_AWARD_POLICY, DEFAULT_AWARD_POLICY_ID, computeAward } from '../../functions/lib/reward-policy.js';

export function vectors() {
  const cases = [];
  const scoreSets = [[59, 59, 59, 59], [60, 60, 60, 60], [79, 80, 90, 70], [80, 80, 80, 80], [89, 95, 95, 95], [90, 90, 90, 90],
    [100, 100, 100, 100], [70, 95, null, null], [95, 92, 90, 90], [40, 100, 100, 100]];
  for (const category of ['expressions', 'dictionary', 'literature', 'audiobooks']) {
    for (const [accuracy, completeness, technical, metadata] of scoreSets) {
      for (const effort of category === 'audiobooks' ? [0, 95, 100000] : category === 'literature' ? [0, 12] : [0]) {
        const scores = { accuracy, completeness, technical, metadata };
        const award = computeAward(DEFAULT_AWARD_POLICY, category, scores, effort);
        cases.push({ category, scores, effort, band: award.band, points: award.points, score: award.score });
      }
    }
  }
  return { policyId: DEFAULT_AWARD_POLICY_ID, policy: DEFAULT_AWARD_POLICY, cases };
}

if (process.argv[1]?.endsWith('make_vectors.mjs')) {
  writeFileSync(new URL('./fixtures/policy_vectors.json', import.meta.url), `${JSON.stringify(vectors(), null, 1)}\n`);
  console.log('wrote fixtures/policy_vectors.json');
}
