// Development-only stand-in for the callable Functions the admin console
// uses, for browser checks on this machine where the Functions emulator cannot
// load (Node 24). It speaks the callable protocol on the emulator port and
// keeps clearly labelled sample data in memory. It never touches production,
// and nothing here is real: names are "Local test" and money is sample money.
//
//   npm run build:functions   # the redemption rule is read from the real build
//   node apps/admin/scripts/dev/fixture-callables.mjs
//
// Backend behaviour itself is covered by firebase/tests/contributorPortal.test.mjs.
//
// The point-redemption answers below predate the points ledger (October 2026).
// For Finance screens use services/functions/scripts/dev/callable-bridge.mjs,
// which serves the real compiled callables against the emulators.

import { createServer } from 'node:http';
import { redemptionTransition } from '../../../../services/functions/lib/contributor-rewards.js';

const PORT = 5001;
const day = 86_400_000;
const at = (offsetDays, hour = 9) => new Date(Date.UTC(2026, 9, 10, hour) - offsetDays * day).toISOString();

let settings = { pointsPerExpression: 10, dailyCap: 300, redemptionMinimum: 300, cedisPerRedemption: 5 };
const balances = { 'uid-ama': 120, 'uid-kofi': 40, 'uid-esi': 0, 'uid-yaw': 0 };
const redemption = (id, contributorId, points, kind, network, phone, status, offset, extra = {}) => ({
  id, contributorId, points, kind, network, phoneNumber: phone, status, currency: 'GHS',
  amountMinor: Math.round(points / 300 * 5 * 100), description: `${points} points for ${kind}`,
  createdAt: at(offset), updatedAt: at(offset), decidedAt: null, decidedBy: null, paidAt: null, paymentReference: '', adminNote: '', ...extra,
});
const redemptions = [
  redemption('red-pending-1', 'uid-ama', 300, 'airtime', 'MTN', '+233241234567', 'submitted', 0.2),
  redemption('red-pending-2', 'uid-kofi', 600, 'data', 'Telecel', '+233201234567', 'submitted', 0.5),
  redemption('red-approved', 'uid-esi', 450, 'airtime', 'AT', '+233271234567', 'approved', 1, { decidedAt: at(0.8), decidedBy: 'ui-admin' }),
  redemption('red-delivered', 'uid-ama', 300, 'airtime', 'MTN', '+233241234567', 'fulfilled', 3, { decidedAt: at(2.8), paidAt: at(2.5), paymentReference: 'LOCAL-TEST-REF-001' }),
  redemption('red-rejected', 'uid-yaw', 300, 'data', 'MTN', '+233551234567', 'rejected', 5, { decidedAt: at(4.5), adminNote: 'The number could not receive data bundles (local test).' }),
];

const contributor = (id, authUid, displayName, roles, invitation, accountStatus, works, extra = {}) => ({
  id, authUid, displayName, photoUrl: '', biography: '', expertise: ['language'], location: 'Navrongo (test)', website: '', socialLinks: '',
  email: `${id}@example.test`, phone: '+233200000000', notes: '', roles, contributionTypes: ['expressions'],
  permissions: { submit: true, edit: true, review: false, publish: false }, status: 'active', publicVisibility: 'hidden', accountStatus,
  invitation: { status: invitation, sentAt: at(20), resentAt: '', resendCount: 0, sms: invitation === 'not_invited' ? null : { status: 'accepted', to: '+233•••••0000' } },
  createdAt: at(30), lastActiveAt: accountStatus === 'active' ? at(1) : '', works, ...extra,
});
const work = (id, title, itemCount, submittedCount, verifiedCount) => ({ id, title, instructions: 'Local test instructions.', deadline: at(-5).slice(0, 10), createdAt: at(10), itemCount, submittedCount, verifiedCount, revisionCount: 0 });
const contributors = [
  contributor('c-ama', 'uid-ama', 'Local test · Ama', ['translator'], 'accepted', 'active', [work('w1', 'Everyday expressions', 10, 6, 4), work('w2', 'Market words', 15, 15, 12)]),
  contributor('c-kofi', 'uid-kofi', 'Local test · Kofi', ['translator', 'reviewer'], 'accepted', 'active', [work('w3', 'Greetings', 12, 3, 1)]),
  contributor('c-esi', 'uid-esi', 'Local test · Esi', ['storyteller'], 'accepted', 'active', [work('w4', 'Folk tales', 5, 1, 0)]),
  contributor('c-yaw', 'uid-yaw', 'Local test · Yaw', ['translator'], 'pending', 'active', []),
  contributor('c-abena', null, 'Local test · Abena', ['researcher'], 'not_invited', 'none', []),
];

const groups = [{ id: 'g1', name: 'Local test · founding creators', numbers: ['233241234567', '233201234567'], count: 2 }];
const campaigns = [
  { id: 'sms-1', message: 'Local test: our contributor session starts at 7 PM GMT.', audience: 'numbers', recipientCount: 42, sentCount: 42, status: 'sent', sandbox: false, scheduledFor: null, createdAt: at(2) },
  { id: 'sms-2', message: 'Local test: scheduled reminder.', audience: 'numbers', recipientCount: 12, sentCount: 0, status: 'scheduled', sandbox: false, scheduledFor: at(-1), createdAt: at(1) },
  { id: 'sms-3', message: 'Local test: sandbox dry-run.', audience: 'all', recipientCount: 380, sentCount: 380, status: 'sent', sandbox: true, scheduledFor: null, createdAt: at(4) },
];

class CallableError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new CallableError(status, message); };

function summary() {
  return Object.fromEntries(['submitted', 'approved', 'fulfilled', 'rejected'].map((status) => {
    const rows = redemptions.filter((row) => row.status === status);
    return [status, { count: rows.length, points: rows.reduce((s, r) => s + r.points, 0), amountMinor: rows.reduce((s, r) => s + r.amountMinor, 0) }];
  }));
}

const handlers = {
  listContributorRewards: (data) => data?.summaryOnly
    ? { summary: summary(), truncated: false, requests: [] }
    : { rewards: settings, summary: summary(), truncated: false, requests: [...redemptions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) },
  setContributorRewardSettings: (data) => {
    for (const key of Object.keys(settings)) if (!Number.isSafeInteger(data[key]) || data[key] < 1 || data[key] > 100000) fail('INVALID_ARGUMENT', `Invalid ${key}.`);
    if (data.dailyCap < data.pointsPerExpression) fail('INVALID_ARGUMENT', 'Daily cap must cover one expression.');
    settings = { pointsPerExpression: data.pointsPerExpression, dailyCap: data.dailyCap, redemptionMinimum: data.redemptionMinimum, cedisPerRedemption: data.cedisPerRedemption };
    return settings;
  },
  decideContributorRedemption: (data) => {
    const row = redemptions.find((item) => item.id === data.requestId) ?? fail('NOT_FOUND', 'Redemption not found.');
    if (data.action === 'reject' && !String(data.note ?? '').trim()) fail('INVALID_ARGUMENT', 'Add a reason for rejection.');
    if (data.action === 'fulfill' && !String(data.paymentReference ?? '').trim()) fail('INVALID_ARGUMENT', 'Add a delivery reference.');
    if (data.expectedStatus && data.expectedStatus !== row.status) fail('ABORTED', 'This request was updated by someone else. Reload it before deciding.');
    const next = redemptionTransition(row.status, data.action) ?? fail('FAILED_PRECONDITION', 'This redemption is no longer in the expected state.');
    const now = new Date().toISOString();
    if (data.action === 'reject') balances[row.contributorId] = (balances[row.contributorId] ?? 0) + row.points;
    Object.assign(row, { status: next, adminNote: String(data.note ?? '').trim(), updatedAt: now, decidedBy: 'ui-admin' },
      data.action === 'fulfill' ? { paidAt: now, paymentReference: String(data.paymentReference).trim() } : { decidedAt: now });
    return { requestId: row.id, status: next, pointsReturned: data.action === 'reject' ? row.points : 0 };
  },
  listExpressionContributors: () => ({ contributors }),
  listContributorPayments: () => ({ statementCheck: 'off', profiles: [], requests: [] }),
  smsBalance: () => ({ smsBalance: 1240, mainBalance: 'GH₵ 180.00 (local test)' }),
  listSmsCampaigns: () => ({ campaigns }),
  listSmsContactGroups: () => ({ groups }),
  saveSmsContactGroup: (data) => {
    const numbers = String(data.recipients).split(/[\s,;|]+/).filter(Boolean);
    const group = { id: `g${groups.length + 1}`, name: data.name, numbers, count: numbers.length };
    groups.push(group);
    return { ok: true, id: group.id, count: group.count, invalid: [] };
  },
  deleteSmsContactGroup: (data) => { groups.splice(groups.findIndex((g) => g.id === data.id), 1); return { ok: true }; },
  sendSmsCampaign: (data) => {
    const count = data.audience === 'all' ? 380 : String(data.recipients ?? '').split(/[\s,;|]+/).filter(Boolean).length;
    const status = data.scheduledAt ? 'scheduled' : 'sent';
    campaigns.unshift({ id: `sms-${campaigns.length + 1}`, message: data.message, audience: data.audience, recipientCount: count, sentCount: status === 'sent' ? count : 0, status, sandbox: Boolean(data.sandbox), scheduledFor: data.scheduledAt ? new Date(`${data.scheduledAt}:00Z`).toISOString() : null, createdAt: new Date().toISOString() });
    return { ok: true, id: campaigns[0].id, status, recipientCount: count, sentCount: status === 'sent' ? count : 0, invalid: [], scheduled: status === 'scheduled' };
  },
  sendTestSms: (data) => ({ ok: true, id: 'local-test', recipient: data.to }),
  listSupportCases: () => ({ cases: [], whatsapp: { enabled: false, number: '' } }),
  listContributorIssues: () => ({ issues: [] }),
};

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type, x-firebase-appcheck, x-firebase-gmpid, x-firebase-client');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const name = req.url?.split('/').pop() ?? '';
  let body = '';
  for await (const chunk of req) body += chunk;
  const reply = (status, payload) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(payload)); };
  try {
    if (!req.headers.authorization) fail('UNAUTHENTICATED', 'Sign in is required.');
    const handler = handlers[name] ?? fail('UNIMPLEMENTED', `${name} is not available in the local fixture server.`);
    const result = await handler(JSON.parse(body || '{}').data ?? {});
    console.log(`200 ${name}`);
    reply(200, { result });
  } catch (error) {
    const status = error instanceof CallableError ? error.status : 'INTERNAL';
    const http = { INVALID_ARGUMENT: 400, FAILED_PRECONDITION: 400, UNAUTHENTICATED: 401, PERMISSION_DENIED: 403, NOT_FOUND: 404, ABORTED: 409, UNIMPLEMENTED: 501 }[status] ?? 500;
    console.log(`${http} ${name}: ${error.message}`);
    reply(http, { error: { status, message: error.message } });
  }
});

server.listen(PORT, '127.0.0.1', () => console.log(`Local fixture callables on http://127.0.0.1:${PORT}`));
