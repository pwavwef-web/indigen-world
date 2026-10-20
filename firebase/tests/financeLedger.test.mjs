// The project money ledger's arithmetic, with no Firestore:
//
//   npm run test:finance
//
// The amounts follow the worked example in the Finance brief (GH₵4,000
// received, GH₵200 spent on a Claude subscription). They are fixtures only;
// nothing here is, or becomes, a production record.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  accountBalances, addPeriod, balanceSeries, budgetImpact, budgetStatus, buildReport, convertToGhsMinor, csvText, effectOf, formatGhs,
  fundingSources, insights, monthlySeries, parseMoney, queryLedger, reportCsv, spendingByCategory, summarise, withRunningBalances,
} from '../../services/functions/lib/finance-ledger.js';

let seq = 0;
function txn(fields) {
  seq += 1;
  return {
    id: fields.id ?? `t${seq}`, number: `IWF-${String(seq).padStart(6, '0')}`, type: 'income', direction: null, adjustmentKind: null, amountMinor: 0, currency: 'GHS',
    original: null, date: '2026-04-01', description: 'Entry', categoryId: null, accountId: 'momo', toAccountId: null, counterparty: '', paymentMethod: '', reference: '',
    project: '', fundingSourceId: null, restricted: false, restrictionPurpose: '', fundedBy: null, notes: '', status: 'posted', postingSequence: seq,
    isReversal: false, reversalOf: null, reversedBy: null, correctionOf: null, recurringId: null, recurringDueDate: null, source: { kind: 'manual' },
    recordedBy: { uid: 'a', name: 'Admin' }, authorisedBy: null, attachments: [], createdAt: `2026-04-01T00:00:${String(seq % 60).padStart(2, '0')}Z`,
    updatedAt: '', submittedAt: null, approvedAt: null, postedAt: null, rejectedAt: null, rejectionReason: '', version: 1, ...fields,
  };
}

const barney = () => txn({ type: 'income', amountMinor: 400_000, date: '2026-04-01', description: 'Financial contribution towards Indigen World development', counterparty: 'Sir Barney', categoryId: 'project-funding', fundingSourceId: 'barney' });
const claude = () => txn({ type: 'expense', amountMinor: 20_000, date: '2026-04-05', description: 'Claude subscription for project development', counterparty: 'Anthropic / Claude', categoryId: 'ai-tools' });

test('the worked example: GH₵4,000 received and GH₵200 spent leaves GH₵3,800.00', () => {
  const books = [barney()];
  let s = summarise(books);
  assert.deepEqual([s.netIncomeMinor, s.netExpenseMinor, s.closingMinor], [400_000, 0, 400_000]);
  books.push(claude());
  s = summarise(books);
  assert.equal(s.netIncomeMinor, 400_000);
  assert.equal(s.netExpenseMinor, 20_000);
  assert.equal(s.closingMinor, 380_000);
  assert.equal(formatGhs(s.closingMinor), 'GH₵3,800.00');
  assert.deepEqual([s.counts.posted, s.counts.income, s.counts.expense], [2, 1, 1]);
});

test('drafts, pending, approved-unpaid, rejected and discarded entries never touch the balance', () => {
  const books = [barney(), ...['draft', 'pending_approval', 'approved', 'rejected', 'discarded'].map((status) => txn({ type: 'expense', amountMinor: 99_999, status, categoryId: 'ai-tools' }))];
  assert.equal(summarise(books).closingMinor, 400_000);
  assert.equal(accountBalances(books).get('momo'), 400_000);
  assert.equal(spendingByCategory(books).length, 0);
});

test('an internal transfer moves money between accounts without changing total funds, income or spending', () => {
  const books = [barney(), txn({ type: 'transfer', amountMinor: 150_000, accountId: 'momo', toAccountId: 'bank', date: '2026-04-02' })];
  const s = summarise(books);
  assert.deepEqual([s.closingMinor, s.incomeMinor, s.expenseMinor], [400_000, 400_000, 0]);
  const balances = accountBalances(books);
  assert.deepEqual([balances.get('momo'), balances.get('bank')], [250_000, 150_000]);
});

test('a reversal restores the balance exactly and both entries stay in the history', () => {
  const wrong = claude();
  const books = [barney(), { ...wrong, status: 'reversed', reversedBy: 'rev' }, txn({ ...wrong, id: 'rev', isReversal: true, reversalOf: wrong.id, date: '2026-04-06' })];
  const s = summarise(books);
  assert.equal(s.closingMinor, 400_000);
  assert.equal(s.netExpenseMinor, 0);
  assert.equal(s.counts.reversals, 1);
  assert.deepEqual([s.counts.posted, s.counts.expense, s.counts.reversed], [1, 0, 1], 'a reversed original is not counted as a live expense');
  const rows = withRunningBalances(books);
  assert.equal(rows.length, 3, 'nothing is hidden');
  assert.deepEqual(rows.map((r) => r.runningBalanceMinor), [400_000, 380_000, 400_000]);
  assert.equal(effectOf(books[2]).expenseMinor, -20_000);
});

test('refunds: money returned to us reduces spending; money we return reduces income', () => {
  const books = [barney(), claude(),
    txn({ type: 'refund', direction: 'in', amountMinor: 5_000, categoryId: 'ai-tools', date: '2026-04-07' }),
    txn({ type: 'refund', direction: 'out', amountMinor: 10_000, categoryId: 'project-funding', fundingSourceId: 'barney', date: '2026-04-08' })];
  const s = summarise(books);
  assert.equal(s.netExpenseMinor, 15_000);
  assert.equal(s.netIncomeMinor, 390_000);
  assert.equal(s.closingMinor, 375_000);
  assert.equal(spendingByCategory(books)[0].amountMinor, 15_000);
  assert.equal(fundingSources(books).find((r) => r.sourceId === 'barney').totalMinor, 390_000);
});

test('opening balances and adjustments are part of the balance and reported separately', () => {
  const books = [txn({ type: 'adjustment', adjustmentKind: 'opening', direction: 'in', amountMinor: 50_000, date: '2026-03-31' }), barney(), claude()];
  const s = summarise(books);
  assert.equal(s.closingMinor, 430_000);
  assert.equal(s.adjustmentsMinor, 50_000);
  const april = summarise(books, { from: '2026-04-01', to: '2026-04-30' });
  assert.equal(april.openingMinor, 50_000, 'the period opens with what came before it');
  assert.equal(april.closingMinor, 430_000);
});

test('running balances do not change with sorting, filtering or paging', () => {
  const books = [barney(), claude(), ...Array.from({ length: 30 }, (_, i) => txn({ type: 'expense', amountMinor: 1_000 + i, date: `2026-04-${String(6 + (i % 20)).padStart(2, '0')}`, categoryId: i % 2 ? 'ai-tools' : 'cloud-hosting' }))];
  const truth = new Map(withRunningBalances(books).map((r) => [r.txn.id, r.runningBalanceMinor]));
  for (const query of [{ sort: 'amount', order: 'asc', limit: 7 }, { sort: 'date', order: 'desc', offset: 10, limit: 5 }, { categoryId: 'ai-tools', limit: 50 }, { from: '2026-04-10', to: '2026-04-15' }, { q: 'claude' }]) {
    for (const row of queryLedger(books, query).rows) assert.equal(row.runningBalanceMinor, truth.get(row.txn.id), JSON.stringify(query));
  }
  const last = queryLedger(books, { sort: 'date', order: 'desc', limit: 1 }).rows[0];
  assert.equal(last.runningBalanceMinor, summarise(books).closingMinor, 'the newest row carries the current balance');
});

test('backdated entries slot into book order and later balances move with them', () => {
  const books = [barney(), claude(), txn({ type: 'expense', amountMinor: 10_000, date: '2026-04-03', categoryId: 'ai-tools' })];
  const rows = withRunningBalances(books).sort((a, b) => a.runningBalanceMinor - b.runningBalanceMinor);
  assert.deepEqual(rows.map((r) => r.runningBalanceMinor), [370_000, 390_000, 400_000]);
});

test('a date filter on a period never corrupts the lifetime balance', () => {
  const books = [barney(), claude(), txn({ type: 'expense', amountMinor: 30_000, date: '2026-05-10', categoryId: 'ai-tools' })];
  const may = summarise(books, { from: '2026-05-01', to: '2026-05-31' });
  assert.deepEqual([may.openingMinor, may.netExpenseMinor, may.closingMinor], [380_000, 30_000, 350_000]);
  assert.equal(summarise(books).closingMinor, 350_000);
});

test('charts reconcile with the summary: last balance point, monthly nets and category totals', () => {
  const books = [barney(), claude(), txn({ type: 'expense', amountMinor: 30_000, date: '2026-05-10', categoryId: 'cloud-hosting' })];
  const series = balanceSeries(books, {}, '2026-05-20');
  assert.equal(series.at(-1).balanceMinor, summarise(books).closingMinor);
  assert.equal(series.at(-1).date, '2026-05-20');
  const months = monthlySeries(books, {}, '2026-05-20');
  assert.deepEqual(months.map((m) => m.month), ['2026-04', '2026-05']);
  assert.equal(months.reduce((sum, m) => sum + m.netMinor, 0), summarise(books).closingMinor);
  assert.equal(spendingByCategory(books).reduce((sum, c) => sum + c.amountMinor, 0), summarise(books).netExpenseMinor);
  assert.equal(spendingByCategory(books).reduce((sum, c) => sum + c.shareBps, 0), 10_000);
});

test('funding sources: spending is attributed to a funder only when explicitly allocated', () => {
  const grant = txn({ type: 'income', amountMinor: 200_000, fundingSourceId: 'grant', restricted: true, restrictionPurpose: 'Research', categoryId: 'grants' });
  const books = [barney(), grant, claude(),
    txn({ type: 'expense', amountMinor: 50_000, fundedBy: 'grant', categoryId: 'research', date: '2026-04-09' }),
    txn({ type: 'expense', amountMinor: 25_000, fundedBy: 'grant', categoryId: 'research', status: 'approved', date: '2026-04-10' })];
  const rows = fundingSources(books);
  const g = rows.find((r) => r.sourceId === 'grant'), b = rows.find((r) => r.sourceId === 'barney');
  assert.deepEqual([g.totalMinor, g.restrictedMinor, g.spentMinor, g.committedMinor, g.remainingRestrictedMinor], [200_000, 200_000, 50_000, 25_000, 125_000]);
  assert.equal(b.spentMinor, 0, 'the unallocated Claude subscription is not charged to Sir Barney');
  assert.equal(b.contributions, 1);
});

test('budgets: actual, committed, warnings at the threshold and an explicit block policy', () => {
  const budget = { id: 'ai', name: 'AI Development Budget', categoryIds: ['ai-tools'], from: '2026-04-01', to: '2026-12-31', allocatedMinor: 200_000, alertAtBps: 8000, control: 'warn', status: 'active' };
  const books = [barney(), claude(), txn({ type: 'expense', amountMinor: 120_000, categoryId: 'ai-tools', date: '2026-04-20' }), txn({ type: 'expense', amountMinor: 30_000, categoryId: 'ai-tools', status: 'approved', date: '2026-04-21' })];
  const s = budgetStatus(budget, books);
  assert.deepEqual([s.actualMinor, s.committedMinor, s.remainingMinor, s.utilisedBps, s.state], [140_000, 30_000, 30_000, 8500, 'warning']);
  const big = txn({ type: 'expense', amountMinor: 40_000, categoryId: 'ai-tools', status: 'pending_approval', date: '2026-04-22' });
  assert.equal(budgetImpact([budget], books, big).blocked.length, 0, 'a warn-only budget never blocks a valid transaction');
  assert.equal(budgetImpact([budget], books, big).warnings[0].after.state, 'over');
  assert.equal(budgetImpact([{ ...budget, control: 'block' }], books, big).blocked.length, 1);
});

test('recurring expenses are not spending until a payment is posted, and due dates roll forward', () => {
  assert.equal(addPeriod('2026-01-31', 'monthly'), '2026-02-28');
  assert.equal(addPeriod('2026-02-28', 'monthly', 31), '2026-03-31');
  assert.equal(addPeriod('2026-12-15', 'quarterly'), '2027-03-15');
  assert.equal(addPeriod('2026-04-28', 'weekly'), '2026-05-05');
  assert.equal(addPeriod('2024-02-29', 'yearly'), '2025-02-28');
});

test('money parsing and conversion are exact', () => {
  assert.equal(parseMoney('4,000.00'), 400_000);
  assert.equal(parseMoney('GH₵ 0.1'), 10);
  assert.equal(parseMoney('200'), 20_000);
  assert.equal(parseMoney('1.005'), null, 'no third decimal');
  assert.equal(parseMoney('-5'), null);
  assert.equal(convertToGhsMinor(2_000, 'USD', '15.25'), 30_500, 'US$20 at 15.25 = GH₵305.00');
  assert.equal(convertToGhsMinor(1, 'USD', '0.005'), 0);
  assert.equal(convertToGhsMinor(1, 'USD', '1.5'), 2, '1.5 pesewas rounds half away from zero');
  assert.equal(convertToGhsMinor(10_000, 'XOF', '0.0257'), 25_700, '10,000 CFA at 0.0257 = GH₵257.00');
  assert.equal(0.1 + 0.2 === 0.3, false, 'which is why none of this uses floats');
  assert.equal(formatGhs(-20_000), '−GH₵200.00');
});

test('insights are factual sentences from the books', () => {
  const books = [barney(), claude()];
  const lines = insights({ txns: books, today: '2026-04-10', categoryName: (id) => id === 'ai-tools' ? 'AI Tools & Subscriptions' : id, sourceName: (id) => id,
    upcoming: [{ name: 'Claude', dueDate: '2026-04-15' }], budgets: [] }).map((i) => i.text);
  assert.ok(lines.includes('The available project balance is GH₵3,800.00.'));
  assert.ok(lines.includes('AI Tools & Subscriptions accounts for 100% of recorded expenditure.'));
  assert.ok(lines.some((l) => l.startsWith('1 renewal is due in the next 14 days: Claude')));
});

test('reports and CSV exports match the ledger, and spreadsheet formulas are neutralised', () => {
  const books = [barney(), claude(), txn({ type: 'expense', amountMinor: 1_000, description: '=HYPERLINK("x")', categoryId: 'ai-tools', date: '2026-04-06' })];
  const report = buildReport({ kind: 'monthly', from: '2026-04-01', to: '2026-04-30', generatedAt: '2026-05-01T00:00:00Z', txns: books,
    categoryName: (id) => id ?? 'Uncategorised', sourceName: (id) => id ?? '', accountName: (id) => id ?? '' });
  assert.equal(report.summary.closingMinor, 379_000);
  const ledger = report.tables.find((t) => t.title === 'Transactions');
  assert.equal(ledger.rows.length, 3);
  assert.equal(ledger.rows.at(-1).balanceMinor, 379_000);
  assert.equal(ledger.rows.reduce((sum, r) => sum + r.amountMinor, 0), report.summary.netMovementMinor);
  const csv = reportCsv(report);
  assert.match(csv, /Closing balance,3790\.00/);
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/, 'a description that looks like a formula is quoted, not executed');
  assert.match(csv, /,-200\.00,/, 'amounts stay numeric');
  assert.equal(csvText('@SUM(A1)'), "'@SUM(A1)");
});
