import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import { HttpsError } from 'firebase-functions/v2/https';
import { requireAuth, requireRole } from '../../services/functions/lib/auth.js';
import { guarded } from '../../services/functions/lib/contributor-common.js';

function harness() {
  const records = new Map([['contributorAccounts/alice', { status: 'active', journey: { participationDays: ['2026-10-12'], practiceCompleted: true } }]]);
  const get = (path, field) => field.split('.').reduce((value, key) => value?.[key], records.get(path));
  const ref = path => ({ path, get: async () => ({ get: key => get(path, key) }), set: async value => records.set(path, value) });
  const db = { doc: ref, runTransaction: async fn => fn({ get: async row => ({ get: key => get(row.path, key) }), update: (row, value) => records.set(row.path, { ...records.get(row.path), ...value }) }), collection: () => ({ where: () => ({ where: () => ({ limit: () => ({ get: async () => ({ docs: [{ get: key => ({ isPublished: true, phrase: 'Public', meaning: 'A public meaning', dialect: 'Navrongo' })[key] }, { get: key => ({ isPublished: false, phrase: 'Hidden', meaning: 'PRIVATE' })[key] }] }) }) }) }) }) };
  const code = readFileSync(new URL('../../services/functions/lib/contributor-journey.js', import.meta.url), 'utf8').replace(/^import[\s\S]*?;\n/gm, '').replace(/\bexport (?=(?:async )?function|const)/g, '');
  const api = runInNewContext(code + '\n;({journeyPreferences,collectionGoal,getContributorJourney,saveContributorJourney,setContributorCollectionGoal,getContributorCollectionGoal,findContributorExpressionMatches})', { getFirestore: () => db, HttpsError, requireAuth, requireRole, guarded, CONTRIBUTOR_CALL_OPTIONS: {}, consumeRateLimit: async () => {}, onCall: (_options, fn) => fn, requireActiveContributor: async uid => { if (get(`contributorAccounts/${uid}`, 'status') !== 'active') throw new HttpsError('permission-denied', 'Active required'); return { get: key => get(`contributorAccounts/${uid}`, key) }; } });
  return { ...api, records, request: (data = {}, uid = 'alice', role = 'contributor') => ({ auth: { uid, token: { role } }, data }) };
}
test('participation preferences are owned, bounded and cannot forge server activity or undo practice', async () => {
  const h = harness();
  await h.saveContributorJourney(h.request({ weeklyGoal: 4, sessionSize: 5, celebrations: false, participationDays: ['2099-01-01'], practiceCompleted: false }));
  const journey = h.records.get('contributorAccounts/alice').journey;
  assert.equal(journey.weeklyGoal, 4); assert.equal(journey.sessionSize, 5); assert.equal(journey.practiceCompleted, true);
  assert.deepEqual(journey.participationDays, ['2026-10-12']);
  await assert.rejects(h.saveContributorJourney(h.request({ weeklyGoal: 4, sessionSize: 5, celebrations: false }, 'bob')), { code: 'permission-denied' });
  for (const bad of [{ weeklyGoal: '3', sessionSize: 3, celebrations: true }, { weeklyGoal: 8, sessionSize: 3, celebrations: true }, { weeklyGoal: 3, sessionSize: 100, celebrations: true }]) assert.throws(() => h.journeyPreferences(bad), { code: 'invalid-argument' });
});
test('community goals require administrators, a valid date and a bounded target; inactive dates remain hidden', async () => {
  const h = harness();
  await assert.rejects(h.setContributorCollectionGoal(h.request({ enabled: true, day: '2026-10-13', target: 30 })), { code: 'permission-denied' });
  assert.throws(() => h.collectionGoal({ enabled: true, day: '2026-02-30', target: 30 }), { code: 'invalid-argument' });
  assert.throws(() => h.collectionGoal({ enabled: true, day: '2026-99-99', target: 30 }), { code: 'invalid-argument' });
  const today = new Date().toISOString().slice(0, 10);
  await h.setContributorCollectionGoal(h.request({ enabled: true, day: today, target: 30 }, 'admin', 'admin'));
  assert.equal((await h.getContributorJourney(h.request())).communityGoal.target, 30);
  await h.setContributorCollectionGoal(h.request({ enabled: true, day: '2020-01-01', target: 30 }, 'admin', 'super_admin'));
  assert.equal((await h.getContributorJourney(h.request())).communityGoal, null);
});
test('published-expression checks expose only public content and require active access', async () => {
  const h = harness();
  const result = await h.findContributorExpressionMatches(h.request({ phrase: 'Public' }));
  assert.equal(result.matches.length, 1); assert.equal(result.matches[0].meaning, 'A public meaning');
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
  await assert.rejects(h.findContributorExpressionMatches(h.request({ phrase: 'Public' }, 'bob')), { code: 'permission-denied' });
  await assert.rejects(h.findContributorExpressionMatches(h.request({ phrase: '' })), { code: 'invalid-argument' });
});
