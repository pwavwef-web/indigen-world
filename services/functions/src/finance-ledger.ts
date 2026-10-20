/**
 * The project money ledger: pure arithmetic, no Firestore.
 *
 * Every figure Finance shows — balances, totals, charts, budgets, reports —
 * is computed here from the stored transactions, so the dashboard, the ledger
 * page, the exports and the PDF statements can never disagree with each other.
 *
 * ── Rules this file keeps ──────────────────────────────────────────────────
 * • Money is integer pesewas (GHS minor units) from input to output. Nothing
 *   here multiplies a cedi amount by a float; foreign-currency conversion uses
 *   BigInt on the decimal rate string.
 * • Only entries in COUNTING statuses are in the books. Drafts, entries
 *   awaiting approval, approved-but-unpaid commitments and rejected entries
 *   never move the balance.
 * • A posted entry is never rewritten. A reversal is a separate posted entry
 *   whose effect is the exact negative of the original; the original keeps its
 *   effect and is marked `reversed`, so the two cancel and both stay visible.
 * • Running balances are computed over the complete chronological history
 *   first and only then filtered, sorted or paged, so a filter or a page break
 *   can never change the balance shown on a row.
 * • Dates are calendar days in Africa/Accra, which is UTC all year.
 */

export const TXN_TYPES = ['income', 'expense', 'transfer', 'refund', 'adjustment'] as const;
export type TxnType = typeof TXN_TYPES[number];

export const TXN_STATUSES = ['draft', 'pending_approval', 'approved', 'posted', 'rejected', 'reversed', 'discarded'] as const;
export type TxnStatus = typeof TXN_STATUSES[number];

/** Statuses whose effect is in the official books. */
export const COUNTING: readonly TxnStatus[] = ['posted', 'reversed'];
export const isCounting = (status: TxnStatus): boolean => status === 'posted' || status === 'reversed';

export const ADJUSTMENT_KINDS = ['opening', 'correction', 'reconciliation'] as const;
export type AdjustmentKind = typeof ADJUSTMENT_KINDS[number];

export const ACCOUNT_TYPES = ['bank', 'mobile_money', 'cash', 'processor', 'wallet', 'other'] as const;
export type AccountType = typeof ACCOUNT_TYPES[number];

export const SOURCE_KINDS = ['individual', 'organisation', 'grant', 'donation', 'platform', 'other'] as const;
export type FundingSourceKind = typeof SOURCE_KINDS[number];

export const FREQUENCIES = ['weekly', 'monthly', 'quarterly', 'yearly'] as const;
export type Frequency = typeof FREQUENCIES[number];

/** Currencies a payment may originally be made in; minor digits per ISO 4217. */
export const CURRENCY_DIGITS: Record<string, number> = { GHS: 2, USD: 2, EUR: 2, GBP: 2, NGN: 2, XOF: 0 };

export const MAX_AMOUNT_MINOR = 100_000_000_000; // GH₵1 billion: a typo guard, not a policy.

export interface Attachment {
  id: string; name: string; contentType: string; size: number; sha256: string; path: string;
  uploadedBy: string; uploadedAt: string;
}

export interface Txn {
  id: string;
  number: string;
  type: TxnType;
  /** For refunds and adjustments: money coming in or going out. */
  direction: 'in' | 'out' | null;
  adjustmentKind: AdjustmentKind | null;
  amountMinor: number;
  currency: 'GHS';
  original: { currency: string; amountMinor: number; rate: string } | null;
  /** `YYYY-MM-DD`, the day the money moved. */
  date: string;
  description: string;
  categoryId: string | null;
  accountId: string | null;
  toAccountId: string | null;
  counterparty: string;
  paymentMethod: string;
  reference: string;
  project: string;
  fundingSourceId: string | null;
  restricted: boolean;
  restrictionPurpose: string;
  /** For expenses: the restricted funding source this spending is allocated to. */
  fundedBy: string | null;
  notes: string;
  status: TxnStatus;
  postingSequence: number | null;
  /** True for the entry that cancels another; its effect is negated. */
  isReversal: boolean;
  reversalOf: string | null;
  reversedBy: string | null;
  correctionOf: string | null;
  recurringId: string | null;
  recurringDueDate: string | null;
  source: { kind: 'manual' | 'platform' | 'recurring' | 'reconciliation'; platform?: string; ref?: string };
  recordedBy: { uid: string; name: string };
  authorisedBy: { uid: string; name: string } | null;
  attachments: Attachment[];
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
  postedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string;
  version: number;
}

export interface Effect {
  balanceMinor: number;
  incomeMinor: number;
  expenseMinor: number;
  refundInMinor: number;
  refundOutMinor: number;
  adjustmentMinor: number;
  openingMinor: number;
  movements: { accountId: string; deltaMinor: number }[];
}

const ZERO: Effect = { balanceMinor: 0, incomeMinor: 0, expenseMinor: 0, refundInMinor: 0, refundOutMinor: 0, adjustmentMinor: 0, openingMinor: 0, movements: [] };

/** What an entry does to the books, before considering its status. */
export function effectOf(txn: Pick<Txn, 'type' | 'direction' | 'adjustmentKind' | 'amountMinor' | 'accountId' | 'toAccountId' | 'isReversal'>): Effect {
  const a = txn.amountMinor;
  const account = txn.accountId ?? 'unassigned';
  let effect: Effect;
  switch (txn.type) {
    case 'income':
      effect = { ...ZERO, balanceMinor: a, incomeMinor: a, movements: [{ accountId: account, deltaMinor: a }] };
      break;
    case 'expense':
      effect = { ...ZERO, balanceMinor: -a, expenseMinor: a, movements: [{ accountId: account, deltaMinor: -a }] };
      break;
    case 'transfer':
      effect = { ...ZERO, movements: [{ accountId: account, deltaMinor: -a }, { accountId: txn.toAccountId ?? 'unassigned', deltaMinor: a }] };
      break;
    case 'refund':
      effect = txn.direction === 'in'
        ? { ...ZERO, balanceMinor: a, refundInMinor: a, movements: [{ accountId: account, deltaMinor: a }] }
        : { ...ZERO, balanceMinor: -a, refundOutMinor: a, movements: [{ accountId: account, deltaMinor: -a }] };
      break;
    case 'adjustment': {
      const signed = txn.direction === 'out' ? -a : a;
      effect = { ...ZERO, balanceMinor: signed, adjustmentMinor: signed, openingMinor: txn.adjustmentKind === 'opening' ? signed : 0,
        movements: [{ accountId: account, deltaMinor: signed }] };
      break;
    }
    default:
      effect = { ...ZERO };
  }
  return txn.isReversal ? negate(effect) : effect;
}

function negate(e: Effect): Effect {
  return {
    balanceMinor: -e.balanceMinor, incomeMinor: -e.incomeMinor, expenseMinor: -e.expenseMinor, refundInMinor: -e.refundInMinor,
    refundOutMinor: -e.refundOutMinor, adjustmentMinor: -e.adjustmentMinor, openingMinor: -e.openingMinor,
    movements: e.movements.map((m) => ({ accountId: m.accountId, deltaMinor: -m.deltaMinor })),
  };
}

/** Chronological book order: the day the money moved, then the order it was posted. */
export function bookOrder(a: Pick<Txn, 'date' | 'postingSequence' | 'createdAt' | 'id'>, b: Pick<Txn, 'date' | 'postingSequence' | 'createdAt' | 'id'>): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const sa = a.postingSequence ?? Number.MAX_SAFE_INTEGER, sb = b.postingSequence ?? Number.MAX_SAFE_INTEGER;
  if (sa !== sb) return sa - sb;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export interface BookRow { txn: Txn; effect: Effect; runningBalanceMinor: number | null }

/**
 * Every entry with its running project balance. Counting entries carry the
 * balance after them in full book order; drafts and the like carry null.
 */
export function withRunningBalances(txns: Txn[]): BookRow[] {
  const counting = txns.filter((t) => isCounting(t.status)).sort(bookOrder);
  const running = new Map<string, number>();
  let balance = 0;
  for (const t of counting) {
    balance += effectOf(t).balanceMinor;
    running.set(t.id, balance);
  }
  return txns.map((txn) => ({ txn, effect: effectOf(txn), runningBalanceMinor: running.get(txn.id) ?? null }));
}

/* -- Summaries ------------------------------------------------------------------------- */

export interface Summary {
  openingMinor: number;
  incomeMinor: number;
  refundsOutMinor: number;
  netIncomeMinor: number;
  expenseMinor: number;
  refundsInMinor: number;
  netExpenseMinor: number;
  adjustmentsMinor: number;
  netMovementMinor: number;
  closingMinor: number;
  /** `posted` counts live entries; a reversed original and its reversal are counted as `reversed` and `reversals`. */
  counts: { posted: number; income: number; expense: number; transfer: number; refund: number; adjustment: number; reversed: number; reversals: number };
}

export interface Range { from?: string | null; to?: string | null }

export const inRange = (date: string, range: Range): boolean =>
  (!range.from || date >= range.from) && (!range.to || date <= range.to);

/**
 * Income, spending and balance over a period. Opening is everything in the
 * books before `from`; closing is opening plus the period's movement. With no
 * range this is the lifetime position.
 */
export function summarise(txns: Txn[], range: Range = {}): Summary {
  const s: Summary = {
    openingMinor: 0, incomeMinor: 0, refundsOutMinor: 0, netIncomeMinor: 0, expenseMinor: 0, refundsInMinor: 0, netExpenseMinor: 0,
    adjustmentsMinor: 0, netMovementMinor: 0, closingMinor: 0,
    counts: { posted: 0, income: 0, expense: 0, transfer: 0, refund: 0, adjustment: 0, reversed: 0, reversals: 0 },
  };
  for (const t of txns) {
    if (!isCounting(t.status)) continue;
    const e = effectOf(t);
    if (range.from && t.date < range.from) { s.openingMinor += e.balanceMinor; continue; }
    if (range.to && t.date > range.to) continue;
    s.incomeMinor += e.incomeMinor;
    s.refundsOutMinor += e.refundOutMinor;
    s.expenseMinor += e.expenseMinor;
    s.refundsInMinor += e.refundInMinor;
    s.adjustmentsMinor += e.adjustmentMinor;
    s.netMovementMinor += e.balanceMinor;
    if (t.isReversal) s.counts.reversals += 1;
    else if (t.status === 'reversed') s.counts.reversed += 1;
    else { s.counts.posted += 1; s.counts[t.type] += 1; }
  }
  s.netIncomeMinor = s.incomeMinor - s.refundsOutMinor;
  s.netExpenseMinor = s.expenseMinor - s.refundsInMinor;
  s.closingMinor = s.openingMinor + s.netMovementMinor;
  return s;
}

/** Balances per account (transfers move money between them; the total is unchanged). */
export function accountBalances(txns: Txn[], asOf?: string): Map<string, number> {
  const balances = new Map<string, number>();
  for (const t of txns) {
    if (!isCounting(t.status) || (asOf && t.date > asOf)) continue;
    for (const m of effectOf(t).movements) balances.set(m.accountId, (balances.get(m.accountId) ?? 0) + m.deltaMinor);
  }
  return balances;
}

/** Approved expenses not yet paid: committed, not spent. */
export function committedMinor(txns: Txn[], filter: (t: Txn) => boolean = () => true): number {
  return txns.filter((t) => t.status === 'approved' && t.type === 'expense' && filter(t)).reduce((sum, t) => sum + t.amountMinor, 0);
}

/* -- Series for charts ----------------------------------------------------------------- */

export interface BalancePoint { date: string; balanceMinor: number }

/** The closing balance at each day money moved within the range, with the opening and end points. */
export function balanceSeries(txns: Txn[], range: Range, today: string): BalancePoint[] {
  const counting = txns.filter((t) => isCounting(t.status)).sort(bookOrder);
  const first = counting[0]?.date ?? today;
  const from = range.from ?? first;
  const to = range.to ?? today;
  let balance = 0;
  const byDay = new Map<string, number>();
  for (const t of counting) {
    const delta = effectOf(t).balanceMinor;
    if (t.date < from) { balance += delta; continue; }
    if (t.date > to) break;
    balance += delta;
    byDay.set(t.date, balance);
  }
  const opening = counting.filter((t) => t.date < from).reduce((sum, t) => sum + effectOf(t).balanceMinor, 0);
  const points: BalancePoint[] = [];
  if (!byDay.has(from)) points.push({ date: from, balanceMinor: opening });
  for (const [date, value] of byDay) points.push({ date, balanceMinor: value });
  const last = points.at(-1);
  if (last && last.date < to) points.push({ date: to, balanceMinor: last.balanceMinor });
  return points;
}

export interface MonthRow { month: string; incomeMinor: number; expenseMinor: number; netMinor: number }

export const monthOf = (date: string): string => date.slice(0, 7);

export function monthsBetween(fromMonth: string, toMonth: string): string[] {
  const out: string[] = [];
  let [y, m] = fromMonth.split('-').map(Number);
  const [ty, tm] = toMonth.split('-').map(Number);
  while ((y < ty || (y === ty && m <= tm)) && out.length < 240) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

/** Net income, net spending and net movement for every month in the range. */
export function monthlySeries(txns: Txn[], range: Range, today: string): MonthRow[] {
  const counting = txns.filter((t) => isCounting(t.status));
  const from = range.from ?? counting.map((t) => t.date).sort()[0] ?? today;
  const to = range.to ?? today;
  const rows = new Map(monthsBetween(monthOf(from), monthOf(to)).map((month) => [month, { month, incomeMinor: 0, expenseMinor: 0, netMinor: 0 }]));
  for (const t of counting) {
    if (!inRange(t.date, { from, to })) continue;
    const row = rows.get(monthOf(t.date));
    if (!row) continue;
    const e = effectOf(t);
    row.incomeMinor += e.incomeMinor - e.refundOutMinor;
    row.expenseMinor += e.expenseMinor - e.refundInMinor;
    row.netMinor += e.balanceMinor;
  }
  return [...rows.values()];
}

export interface CategoryRow { categoryId: string; amountMinor: number; shareBps: number; count: number }

/** Net spending per category (refunds received reduce the category they came back to). */
export function spendingByCategory(txns: Txn[], range: Range = {}): CategoryRow[] {
  const totals = new Map<string, { amountMinor: number; count: number }>();
  for (const t of txns) {
    if (!isCounting(t.status) || !inRange(t.date, range)) continue;
    const e = effectOf(t);
    const spent = e.expenseMinor - e.refundInMinor;
    if (!spent) continue;
    const key = t.categoryId ?? 'uncategorised';
    const row = totals.get(key) ?? { amountMinor: 0, count: 0 };
    row.amountMinor += spent;
    if (!t.isReversal && t.type === 'expense') row.count += 1;
    totals.set(key, row);
  }
  const total = [...totals.values()].reduce((sum, r) => sum + Math.max(0, r.amountMinor), 0);
  return [...totals.entries()]
    .map(([categoryId, r]) => ({ categoryId, amountMinor: r.amountMinor, count: r.count, shareBps: total > 0 ? Math.round((Math.max(0, r.amountMinor) * 10_000) / total) : 0 }))
    .filter((r) => r.amountMinor !== 0)
    .sort((a, b) => b.amountMinor - a.amountMinor);
}

/** Net income per category, for the income side of statements. */
export function incomeByCategory(txns: Txn[], range: Range = {}): CategoryRow[] {
  const totals = new Map<string, { amountMinor: number; count: number }>();
  for (const t of txns) {
    if (!isCounting(t.status) || !inRange(t.date, range)) continue;
    const e = effectOf(t);
    const received = e.incomeMinor - e.refundOutMinor;
    if (!received) continue;
    const key = t.categoryId ?? 'uncategorised';
    const row = totals.get(key) ?? { amountMinor: 0, count: 0 };
    row.amountMinor += received;
    if (!t.isReversal && t.type === 'income') row.count += 1;
    totals.set(key, row);
  }
  const total = [...totals.values()].reduce((sum, r) => sum + Math.max(0, r.amountMinor), 0);
  return [...totals.entries()]
    .map(([categoryId, r]) => ({ categoryId, amountMinor: r.amountMinor, count: r.count, shareBps: total > 0 ? Math.round((Math.max(0, r.amountMinor) * 10_000) / total) : 0 }))
    .filter((r) => r.amountMinor !== 0)
    .sort((a, b) => b.amountMinor - a.amountMinor);
}

/* -- Funding sources --------------------------------------------------------------------- */

export interface SourceRow {
  sourceId: string;
  totalMinor: number;
  restrictedMinor: number;
  contributions: number;
  firstDate: string | null;
  lastDate: string | null;
  /** Restricted money already spent on expenses allocated to this source. */
  spentMinor: number;
  /** Approved, unpaid expenses allocated to this source. */
  committedMinor: number;
  remainingRestrictedMinor: number;
  shareBps: number;
}

/**
 * What each funder gave, and — only where an expense was explicitly allocated
 * to them — what was spent from their restricted money. Unallocated spending
 * is never attributed to any funder.
 */
export function fundingSources(txns: Txn[], range: Range = {}): SourceRow[] {
  const rows = new Map<string, SourceRow>();
  const row = (id: string): SourceRow => {
    let r = rows.get(id);
    if (!r) {
      r = { sourceId: id, totalMinor: 0, restrictedMinor: 0, contributions: 0, firstDate: null, lastDate: null, spentMinor: 0, committedMinor: 0, remainingRestrictedMinor: 0, shareBps: 0 };
      rows.set(id, r);
    }
    return r;
  };
  for (const t of txns) {
    if (!inRange(t.date, range)) continue;
    if (t.fundingSourceId && isCounting(t.status) && (t.type === 'income' || (t.type === 'refund' && t.direction === 'out'))) {
      const e = effectOf(t);
      const r = row(t.fundingSourceId);
      const net = e.incomeMinor - e.refundOutMinor;
      r.totalMinor += net;
      if (t.restricted) r.restrictedMinor += net;
      if (t.type === 'income' && !t.isReversal && t.status === 'posted') {
        r.contributions += 1;
        if (!r.firstDate || t.date < r.firstDate) r.firstDate = t.date;
        if (!r.lastDate || t.date > r.lastDate) r.lastDate = t.date;
      }
    }
    if (t.fundedBy) {
      if (isCounting(t.status)) {
        const e = effectOf(t);
        row(t.fundedBy).spentMinor += e.expenseMinor - e.refundInMinor;
      } else if (t.status === 'approved' && t.type === 'expense') {
        row(t.fundedBy).committedMinor += t.amountMinor;
      }
    }
  }
  const total = [...rows.values()].reduce((sum, r) => sum + Math.max(0, r.totalMinor), 0);
  for (const r of rows.values()) {
    r.remainingRestrictedMinor = r.restrictedMinor - r.spentMinor - r.committedMinor;
    r.shareBps = total > 0 ? Math.round((Math.max(0, r.totalMinor) * 10_000) / total) : 0;
  }
  return [...rows.values()].sort((a, b) => b.totalMinor - a.totalMinor);
}

/* -- Budgets ------------------------------------------------------------------------------ */

export interface Budget {
  id: string; name: string; categoryIds: string[]; from: string; to: string; allocatedMinor: number;
  /** Warn at this share of the allocation, in basis points (8000 = 80%). */
  alertAtBps: number;
  /** `warn` never stops a transaction; `block` refuses spending beyond the allocation. */
  control: 'warn' | 'block';
  status: 'active' | 'archived';
}

export interface BudgetStatus {
  budgetId: string; actualMinor: number; committedMinor: number; remainingMinor: number; utilisedBps: number;
  state: 'ok' | 'warning' | 'over';
}

export function budgetStatus(budget: Budget, txns: Txn[], extra?: Txn): BudgetStatus {
  const applies = (t: Txn) => t.categoryId !== null && budget.categoryIds.includes(t.categoryId) && inRange(t.date, budget);
  const all = extra ? [...txns.filter((t) => t.id !== extra.id), extra] : txns;
  let actual = 0;
  for (const t of all) {
    if (!isCounting(t.status) || !applies(t)) continue;
    const e = effectOf(t);
    actual += e.expenseMinor - e.refundInMinor;
  }
  const committed = committedMinor(all, applies);
  const used = actual + committed;
  const utilisedBps = budget.allocatedMinor > 0 ? Math.round((used * 10_000) / budget.allocatedMinor) : (used > 0 ? 10_000 : 0);
  const state = used > budget.allocatedMinor ? 'over' : utilisedBps >= budget.alertAtBps ? 'warning' : 'ok';
  return { budgetId: budget.id, actualMinor: actual, committedMinor: committed, remainingMinor: budget.allocatedMinor - used, utilisedBps, state };
}

/**
 * What posting or committing [candidate] would do to each active budget it
 * falls in. `blocked` lists budgets with a spending-control policy that the
 * entry would push over their allocation.
 */
export function budgetImpact(budgets: Budget[], txns: Txn[], candidate: Txn): { warnings: { budget: Budget; after: BudgetStatus }[]; blocked: { budget: Budget; after: BudgetStatus }[] } {
  const warnings: { budget: Budget; after: BudgetStatus }[] = [];
  const blocked: { budget: Budget; after: BudgetStatus }[] = [];
  if (candidate.type !== 'expense' || candidate.isReversal) return { warnings, blocked };
  // A draft or pending entry is judged as if it were posted: that is the question being asked.
  if (!isCounting(candidate.status) && candidate.status !== 'approved') candidate = { ...candidate, status: 'posted' };
  for (const budget of budgets) {
    if (budget.status !== 'active' || !candidate.categoryId || !budget.categoryIds.includes(candidate.categoryId) || !inRange(candidate.date, budget)) continue;
    const before = budgetStatus(budget, txns);
    const after = budgetStatus(budget, txns, candidate);
    if (after.state === 'over' && budget.control === 'block' && after.remainingMinor < before.remainingMinor) blocked.push({ budget, after });
    else if (after.state !== 'ok') warnings.push({ budget, after });
  }
  return { warnings, blocked };
}

/* -- Recurring expenses ------------------------------------------------------------------- */

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** The next due date one billing period on, keeping the day of month where the month allows. */
export function addPeriod(date: string, frequency: Frequency, anchorDay?: number): string {
  const [y, m, d] = date.split('-').map(Number);
  if (frequency === 'weekly') {
    const next = new Date(Date.UTC(y, m - 1, d + 7));
    return next.toISOString().slice(0, 10);
  }
  const months = frequency === 'monthly' ? 1 : frequency === 'quarterly' ? 3 : 12;
  let ny = y, nm = m + months;
  while (nm > 12) { nm -= 12; ny += 1; }
  const day = Math.min(anchorDay ?? d, daysInMonth(ny, nm));
  return `${ny}-${String(nm).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`), b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/* -- Money ------------------------------------------------------------------------------- */

/** `4,000.00` / `4000` / `GH₵ 4,000.5` → 400050. Exact: parsed as text, never as a float. */
export function parseMoney(text: string, digits = 2): number | null {
  const clean = String(text ?? '').replace(/GH₵|GHS|₵|,|\s/gi, '');
  const pattern = digits === 0 ? /^(\d{1,12})$/ : new RegExp(`^(\\d{1,12})(?:\\.(\\d{1,${digits}}))?$`);
  const match = pattern.exec(clean);
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = digits === 0 ? 0 : Number((match[2] ?? '').padEnd(digits, '0'));
  return whole * 10 ** digits + fraction;
}

/** Converts a foreign amount at a decimal rate (GHS per one unit) to pesewas, rounding half away from zero. */
export function convertToGhsMinor(originalMinor: number, currency: string, rate: string): number {
  const digits = CURRENCY_DIGITS[currency];
  if (digits === undefined) throw new Error(`Unsupported currency ${currency}.`);
  const match = /^(\d{1,6})(?:\.(\d{1,8}))?$/.exec(rate.trim());
  if (!match) throw new Error('Enter the exchange rate as a positive decimal, for example 15.25.');
  const scale = (match[2] ?? '').length;
  const numerator = BigInt(match[1] + (match[2] ?? ''));
  if (numerator === 0n) throw new Error('The exchange rate must be above zero.');
  // pesewas = originalMinor / 10^digits × rate × 100
  const top = BigInt(originalMinor) * numerator * 100n;
  const bottom = 10n ** BigInt(digits + scale);
  const quotient = top / bottom, remainder = top % bottom;
  return Number(remainder * 2n >= bottom ? quotient + 1n : quotient);
}

/** `GH₵4,000.00`, `−GH₵200.00` — the one format every surface uses. */
export function formatGhs(minor: number): string {
  const negative = minor < 0;
  const abs = Math.abs(Math.trunc(minor));
  const whole = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '−' : ''}GH₵${whole}.${String(abs % 100).padStart(2, '0')}`;
}

/** `4000.00` for spreadsheets: plain, signed, two decimals. */
export function plainAmount(minor: number): string {
  const negative = minor < 0, abs = Math.abs(Math.trunc(minor));
  return `${negative ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export const formatBps = (bps: number): string => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;

/* -- Ledger queries ----------------------------------------------------------------------- */

export interface LedgerQuery {
  q?: string; from?: string; to?: string; types?: TxnType[]; statuses?: TxnStatus[] | 'books' | 'all';
  categoryId?: string; fundingSourceId?: string; accountId?: string;
  sort?: 'date' | 'amount'; order?: 'asc' | 'desc'; offset?: number; limit?: number;
}

export interface LedgerPage {
  rows: BookRow[]; total: number; offset: number; limit: number;
  /** Net movement of the filtered counting rows (not just this page). */
  filteredNetMinor: number;
}

export function queryLedger(txns: Txn[], query: LedgerQuery): LedgerPage {
  const rows = withRunningBalances(txns);
  const needle = (query.q ?? '').trim().toLowerCase();
  const statuses = query.statuses === 'all' ? null : query.statuses === 'books' || !query.statuses ? COUNTING : query.statuses;
  const filtered = rows.filter(({ txn: t }) => {
    if (statuses && !statuses.includes(t.status)) return false;
    if (query.from && t.date < query.from) return false;
    if (query.to && t.date > query.to) return false;
    if (query.types?.length && !query.types.includes(t.type)) return false;
    if (query.categoryId && t.categoryId !== query.categoryId) return false;
    if (query.fundingSourceId && t.fundingSourceId !== query.fundingSourceId && t.fundedBy !== query.fundingSourceId) return false;
    if (query.accountId && t.accountId !== query.accountId && t.toAccountId !== query.accountId) return false;
    if (needle && ![t.description, t.reference, t.number, t.counterparty, t.notes].some((f) => f.toLowerCase().includes(needle))) return false;
    return true;
  });
  const dir = query.order === 'asc' ? 1 : -1;
  filtered.sort((a, b) => {
    if (query.sort === 'amount') {
      const diff = Math.abs(a.effect.balanceMinor || a.txn.amountMinor) - Math.abs(b.effect.balanceMinor || b.txn.amountMinor);
      if (diff) return diff * dir;
    }
    return bookOrder(a.txn, b.txn) * dir;
  });
  const offset = Math.max(0, query.offset ?? 0);
  const limit = Math.min(500, Math.max(1, query.limit ?? 50));
  const filteredNetMinor = filtered.filter((r) => isCounting(r.txn.status)).reduce((sum, r) => sum + r.effect.balanceMinor, 0);
  return { rows: filtered.slice(offset, offset + limit), total: filtered.length, offset, limit, filteredNetMinor };
}

/* -- Audit -------------------------------------------------------------------------------- */

export interface FieldChange { field: string; before: unknown; after: unknown }

/** Field-by-field differences between two versions, for the audit timeline. */
export function diffFields(before: Record<string, unknown> | null, after: Record<string, unknown>, fields: readonly string[]): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const field of fields) {
    const a = before ? before[field] ?? null : null, b = after[field] ?? null;
    if (JSON.stringify(a) !== JSON.stringify(b)) changes.push({ field, before: a, after: b });
  }
  return changes;
}

export const EDITABLE_FIELDS = [
  'type', 'direction', 'adjustmentKind', 'amountMinor', 'original', 'date', 'description', 'categoryId', 'accountId', 'toAccountId',
  'counterparty', 'paymentMethod', 'reference', 'project', 'fundingSourceId', 'restricted', 'restrictionPurpose', 'fundedBy', 'notes',
] as const;

/* -- Insights ----------------------------------------------------------------------------- */

export interface Insight { id: string; tone: 'info' | 'success' | 'warning' | 'danger'; text: string }

/**
 * Plain observations computed from the books. Deterministic: the same records
 * always give the same sentences, and nothing here guesses.
 */
export function insights(input: {
  txns: Txn[]; today: string; categoryName: (id: string) => string; sourceName: (id: string) => string;
  upcoming: { name: string; dueDate: string }[]; budgets: { budget: Budget; status: BudgetStatus }[];
}): Insight[] {
  const out: Insight[] = [];
  const life = summarise(input.txns);
  if (!life.counts.posted && !life.counts.reversals) return [{ id: 'empty', tone: 'info', text: 'No transactions are posted yet. Record the first income or opening balance to start the books.' }];
  out.push({ id: 'balance', tone: life.closingMinor < 0 ? 'danger' : 'info', text: `The available project balance is ${formatGhs(life.closingMinor)}.` });
  const categories = spendingByCategory(input.txns);
  if (categories[0] && categories[0].amountMinor > 0) {
    out.push({ id: 'top-category', tone: 'info', text: `${input.categoryName(categories[0].categoryId)} accounts for ${formatBps(categories[0].shareBps)} of recorded expenditure.` });
  }
  const thisMonth = monthOf(input.today);
  const [py, pm] = thisMonth.split('-').map(Number);
  const prevMonth = pm === 1 ? `${py - 1}-12` : `${py}-${String(pm - 1).padStart(2, '0')}`;
  const monthly = monthlySeries(input.txns, { from: `${prevMonth}-01`, to: input.today }, input.today);
  const prev = monthly.find((m) => m.month === prevMonth), now = monthly.find((m) => m.month === thisMonth);
  if (prev && now && (prev.expenseMinor > 0 || now.expenseMinor > 0)) {
    if (now.expenseMinor > prev.expenseMinor) out.push({ id: 'spend-trend', tone: 'warning', text: `Spending this month (${formatGhs(now.expenseMinor)}) is already above last month (${formatGhs(prev.expenseMinor)}).` });
    else out.push({ id: 'spend-trend', tone: 'success', text: `Spending this month is ${formatGhs(now.expenseMinor)}, against ${formatGhs(prev.expenseMinor)} last month.` });
  }
  const soon = input.upcoming.filter((u) => daysBetween(input.today, u.dueDate) <= 14);
  if (soon.length) out.push({ id: 'renewals', tone: 'warning', text: `${soon.length} ${soon.length === 1 ? 'renewal is' : 'renewals are'} due in the next 14 days: ${soon.slice(0, 3).map((u) => u.name).join(', ')}${soon.length > 3 ? '…' : ''}.` });
  for (const { budget, status } of input.budgets) {
    if (status.state === 'over') out.push({ id: `budget-${budget.id}`, tone: 'danger', text: `${budget.name} is over its allocation by ${formatGhs(-status.remainingMinor)}.` });
    else if (status.state === 'warning') out.push({ id: `budget-${budget.id}`, tone: 'warning', text: `${budget.name} has used ${formatBps(status.utilisedBps)} of its allocation.` });
  }
  const sources = fundingSources(input.txns).filter((s) => s.restrictedMinor > 0);
  for (const s of sources.slice(0, 2)) {
    out.push({ id: `restricted-${s.sourceId}`, tone: s.remainingRestrictedMinor < 0 ? 'danger' : 'info', text: `${formatGhs(s.remainingRestrictedMinor)} of ${input.sourceName(s.sourceId)}’s restricted funding remains unspent.` });
  }
  const pending = input.txns.filter((t) => t.status === 'pending_approval').length;
  if (pending) out.push({ id: 'pending', tone: 'warning', text: `${pending} ${pending === 1 ? 'entry is' : 'entries are'} waiting for approval and not yet in the balance.` });
  return out;
}

/* -- CSV ---------------------------------------------------------------------------------- */

/** A text cell that a spreadsheet will not run as a formula. Numbers are written as plain numbers. */
export function csvText(value: unknown): string {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(columns: { key: string; label: string; numeric?: boolean }[], rows: Record<string, unknown>[]): string {
  const head = columns.map((c) => csvText(c.label)).join(',');
  const body = rows.map((row) => columns.map((c) => c.numeric ? String(row[c.key] ?? '') : csvText(row[c.key])).join(','));
  return [head, ...body].join('\r\n');
}

/* -- Reports ------------------------------------------------------------------------------ */

export const REPORT_KINDS = ['monthly', 'income_expenditure', 'transactions', 'funding_sources', 'categories', 'annual', 'audit'] as const;
export type ReportKind = typeof REPORT_KINDS[number];

export const REPORT_TITLES: Record<ReportKind, string> = {
  monthly: 'Monthly financial statement',
  income_expenditure: 'Income and expenditure report',
  transactions: 'Transaction history',
  funding_sources: 'Funding source report',
  categories: 'Expense category report',
  annual: 'Annual financial summary',
  audit: 'Audit trail report',
};

export interface ReportTable { title: string; columns: { key: string; label: string; numeric?: boolean; money?: boolean; weight?: number }[]; rows: Record<string, unknown>[] }
export interface Report {
  kind: ReportKind; title: string; from: string; to: string; generatedAt: string;
  summary: Summary | null;
  tables: ReportTable[];
  notes: string[];
}

export interface AuditLike { at: string; action: string; actorName: string; target: string; statusBefore: string | null; statusAfter: string | null; reason: string; changes: number }

export function buildReport(input: {
  kind: ReportKind; from: string; to: string; generatedAt: string; txns: Txn[];
  categoryName: (id: string | null) => string; sourceName: (id: string | null) => string; accountName: (id: string | null) => string;
  audit?: AuditLike[];
}): Report {
  const { kind, from, to, txns } = input;
  const range = { from, to };
  const summary = kind === 'audit' ? null : summarise(txns, range);
  const tables: ReportTable[] = [];
  const notes: string[] = [];
  const money = (key: string, label: string) => ({ key, label, numeric: true, money: true });
  const ledgerTable = (): ReportTable => {
    const rows = withRunningBalances(txns).filter((r) => isCounting(r.txn.status) && inRange(r.txn.date, range)).sort((a, b) => bookOrder(a.txn, b.txn));
    return {
      title: 'Transactions',
      columns: [{ key: 'date', label: 'Date' }, { key: 'number', label: 'Ref' }, { key: 'type', label: 'Type' }, { key: 'description', label: 'Description' },
        { key: 'category', label: 'Category' }, { key: 'account', label: 'Account' }, money('amountMinor', 'Amount (GH₵)'), money('balanceMinor', 'Balance (GH₵)'), { key: 'status', label: 'Status' }],
      rows: rows.map(({ txn: t, effect, runningBalanceMinor }) => ({
        date: t.date, number: t.number, type: typeLabel(t), description: t.description, category: input.categoryName(t.categoryId),
        account: t.type === 'transfer' ? `${input.accountName(t.accountId)} → ${input.accountName(t.toAccountId)}` : input.accountName(t.accountId),
        amountMinor: t.type === 'transfer' ? (t.isReversal ? -t.amountMinor : t.amountMinor) : effect.balanceMinor, balanceMinor: runningBalanceMinor, status: t.status,
      })),
    };
  };
  const categoryTable = (title: string, rows: CategoryRow[]): ReportTable => ({
    title,
    columns: [{ key: 'category', label: 'Category' }, { key: 'count', label: 'Entries', numeric: true }, money('amountMinor', 'Amount (GH₵)'), { key: 'share', label: 'Share' }],
    rows: rows.map((r) => ({ category: input.categoryName(r.categoryId), count: r.count, amountMinor: r.amountMinor, share: formatBps(r.shareBps) })),
  });
  const monthTable = (): ReportTable => ({
    title: 'By month',
    columns: [{ key: 'month', label: 'Month' }, money('incomeMinor', 'Income (GH₵)'), money('expenseMinor', 'Expenditure (GH₵)'), money('netMinor', 'Net movement (GH₵)')],
    rows: monthlySeries(txns, range, to).map((m) => ({ ...m })),
  });
  switch (kind) {
    case 'monthly':
    case 'income_expenditure':
      tables.push(categoryTable('Income by category', incomeByCategory(txns, range)));
      tables.push(categoryTable('Expenditure by category', spendingByCategory(txns, range)));
      if (kind === 'income_expenditure') tables.push(monthTable());
      tables.push(ledgerTable());
      break;
    case 'transactions':
      tables.push(ledgerTable());
      break;
    case 'funding_sources':
      tables.push({
        title: 'Funding sources',
        columns: [{ key: 'source', label: 'Source' }, { key: 'contributions', label: 'Contributions', numeric: true }, money('totalMinor', 'Received (GH₵)'),
          money('restrictedMinor', 'Restricted (GH₵)'), money('spentMinor', 'Spent from restricted (GH₵)'), money('remainingRestrictedMinor', 'Restricted remaining (GH₵)'), { key: 'share', label: 'Share' }],
        rows: fundingSources(txns, range).map((s) => ({ source: input.sourceName(s.sourceId), ...s, share: formatBps(s.shareBps) })),
      });
      notes.push('Spending is attributed to a funder only where the expense was explicitly allocated to their restricted funding.');
      break;
    case 'categories':
      tables.push(categoryTable('Expenditure by category', spendingByCategory(txns, range)));
      tables.push(monthTable());
      break;
    case 'annual':
      tables.push(monthTable());
      tables.push(categoryTable('Income by category', incomeByCategory(txns, range)));
      tables.push(categoryTable('Expenditure by category', spendingByCategory(txns, range)));
      break;
    case 'audit':
      tables.push({
        title: 'Audit events',
        columns: [{ key: 'at', label: 'When (UTC)' }, { key: 'action', label: 'Action' }, { key: 'actorName', label: 'By' }, { key: 'target', label: 'Entry' },
          { key: 'statusBefore', label: 'From' }, { key: 'statusAfter', label: 'To' }, { key: 'changes', label: 'Fields changed', numeric: true }, { key: 'reason', label: 'Reason' }],
        rows: (input.audit ?? []).map((a) => ({ ...a })),
      });
      break;
  }
  if (summary && kind !== 'transactions') notes.push('Figures include posted entries only. Drafts, entries awaiting approval and approved-but-unpaid expenses are excluded.');
  if (summary && summary.counts.reversals) notes.push(`${summary.counts.reversals} reversal ${summary.counts.reversals === 1 ? 'entry cancels' : 'entries cancel'} earlier postings in this period; both sides are listed.`);
  return { kind, title: REPORT_TITLES[kind], from, to, generatedAt: input.generatedAt, summary, tables, notes };
}

export function typeLabel(t: Pick<Txn, 'type' | 'direction' | 'adjustmentKind' | 'isReversal'>): string {
  const base = t.type === 'refund' ? (t.direction === 'in' ? 'Refund received' : 'Refund paid')
    : t.type === 'adjustment' ? (t.adjustmentKind === 'opening' ? 'Opening balance' : t.adjustmentKind === 'reconciliation' ? 'Reconciliation adjustment' : 'Adjustment')
      : t.type[0].toUpperCase() + t.type.slice(1);
  return t.isReversal ? `Reversal of ${base.toLowerCase()}` : base;
}

/** Report rows as CSV, with money in plain cedis and a header block naming the period. */
export function reportCsv(report: Report): string {
  const parts: string[] = [
    toCsv([{ key: 'k', label: 'Indigen World' }, { key: 'v', label: report.title }], [
      { k: 'Period', v: `${report.from} to ${report.to}` }, { k: 'Generated', v: report.generatedAt }, { k: 'Currency', v: 'GHS' },
    ]),
  ];
  if (report.summary) {
    const s = report.summary;
    parts.push(toCsv([{ key: 'k', label: 'Summary' }, { key: 'v', label: 'GH₵', numeric: true }], [
      { k: 'Opening balance', v: plainAmount(s.openingMinor) }, { k: 'Income', v: plainAmount(s.incomeMinor) }, { k: 'Refunds paid', v: plainAmount(-s.refundsOutMinor) },
      { k: 'Expenditure', v: plainAmount(-s.expenseMinor) }, { k: 'Refunds received', v: plainAmount(s.refundsInMinor) }, { k: 'Adjustments', v: plainAmount(s.adjustmentsMinor) },
      { k: 'Closing balance', v: plainAmount(s.closingMinor) },
    ]));
  }
  for (const table of report.tables) {
    const rows = table.rows.map((row) => Object.fromEntries(table.columns.map((c) => [c.key, c.money ? (row[c.key] == null ? '' : plainAmount(Number(row[c.key]))) : row[c.key]])));
    parts.push(`${csvText(table.title)}\r\n${toCsv(table.columns, rows)}`);
  }
  if (report.notes.length) parts.push(report.notes.map(csvText).join('\r\n'));
  return parts.join('\r\n\r\n');
}

/** Today in Accra (UTC+0, no daylight saving). */
export const accraToday = (now: Date = new Date()): string => now.toISOString().slice(0, 10);
