// Routing rules for the administration map — no browser needed.
//
//   node --experimental-strip-types --test apps/admin/scripts/routes.test.mjs

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LEGACY_REDIRECTS,
  SECTIONS,
  hasFinanceAccess,
  resolve,
  sectionEntry,
  toolPath,
  visibleSections,
  visibleTools,
} from '../src/routes.ts';

const admin = { role: 'admin', finance: false, superAdmin: false };
const financeAdmin = { role: 'admin', finance: true, superAdmin: false };
const validator = { role: 'validator', finance: false, superAdmin: false };
const nobody = { role: null, finance: false, superAdmin: false };

test('the home launcher has the nine approved sections in order', () => {
  assert.deepEqual(SECTIONS.map((section) => section.label), [
    'Finance', 'Collections', 'Messaging', 'Creators', 'Contributors',
    'Review Desk', 'Learning', 'Community', 'Governance',
  ]);
});

test('every tool path resolves to that tool for someone allowed to use it', () => {
  const superAdmin = { role: 'super_admin', finance: false, superAdmin: true };
  for (const section of SECTIONS) {
    for (const tool of section.tools) {
      const result = resolve(toolPath(section, tool), superAdmin);
      assert.equal(result.kind, 'tool', toolPath(section, tool));
      assert.equal(result.tool.id, tool.id);
      assert.equal(result.section.id, section.id);
    }
  }
});

test('trailing slashes and the home path resolve', () => {
  assert.equal(resolve('/', admin).kind, 'home');
  assert.equal(resolve('/finance/redemptions/', admin).tool.id, 'redemptions');
});

test('old console addresses redirect into the new hierarchy and land on a tool', () => {
  const everyone = { role: 'super_admin', finance: true, superAdmin: true };
  for (const [from, to] of Object.entries(LEGACY_REDIRECTS)) {
    assert.deepEqual(resolve(from, everyone), { kind: 'redirect', to }, from);
    let next = resolve(to, everyone);
    if (next.kind === 'redirect') next = resolve(next.to, everyone);
    assert.ok(['tool', 'home'].includes(next.kind), `${from} → ${to} lands on ${next.kind}`);
  }
  assert.equal(LEGACY_REDIRECTS['/contributors/rewards'], '/finance/redemptions', 'staff redemptions now belong to Finance');
});

test('a section address without a front tool opens the first tool the person may use', () => {
  assert.deepEqual(resolve('/collections', admin), { kind: 'redirect', to: '/collections/heroes' });
  assert.deepEqual(resolve('/learning', admin), { kind: 'redirect', to: '/learning/lessons' });
  // Validators cannot edit lessons, so Learning opens on illustrations.
  assert.deepEqual(resolve('/learning', validator), { kind: 'redirect', to: '/learning/illustrations' });
  assert.deepEqual(resolve('/community', validator), { kind: 'redirect', to: '/community/forms' });
  assert.equal(sectionEntry(SECTIONS.find((s) => s.id === 'learning'), validator), '/learning/illustrations');
});

test('denied access names the permission instead of a 404', () => {
  const finance = resolve('/finance/redemptions', validator);
  assert.equal(finance.kind, 'denied');
  assert.equal(finance.needs, 'admin');
  const payouts = resolve('/finance/payouts', admin);
  assert.equal(payouts.kind, 'denied');
  assert.equal(payouts.needs, 'finance');
  assert.equal(resolve('/finance/payouts', financeAdmin).kind, 'tool');
  assert.equal(resolve('/learning/lessons', validator).kind, 'denied');
  assert.equal(resolve('/review', nobody).kind, 'denied');
});

test('unknown addresses are an explicit not-found', () => {
  assert.equal(resolve('/nowhere', admin).kind, 'not-found');
  assert.equal(resolve('/finance/bank-payouts', admin).kind, 'not-found');
  assert.equal(resolve('/financeX', admin).kind, 'not-found');
});

test('navigation reflects permissions', () => {
  assert.deepEqual(visibleSections(validator).map((s) => s.id), ['creators', 'review', 'learning', 'community']);
  assert.equal(visibleSections(nobody).length, 0);
  assert.equal(visibleSections(admin).length, 9);
  const finance = SECTIONS.find((s) => s.id === 'finance');
  assert.ok(!visibleTools(finance, admin).some((t) => t.id === 'payouts'));
  assert.ok(visibleTools(finance, financeAdmin).some((t) => t.id === 'payouts'));
});

test('finance access mirrors the server rule', () => {
  assert.equal(hasFinanceAccess({ role: 'validator', finance: true, superAdmin: false }), false);
  assert.equal(hasFinanceAccess(financeAdmin), true);
  assert.equal(hasFinanceAccess({ role: null, finance: false, superAdmin: true }), true);
  assert.equal(hasFinanceAccess({ role: 'super_admin', finance: false, superAdmin: false }), true);
});
