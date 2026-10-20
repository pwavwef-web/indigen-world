import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useSession } from '../session';
import { askText, confirmAction } from '../ui/dialogs';
import { Icon } from '../ui/icons';
import { Badge, Button, Dialog, Field, Notice, Skeleton, cx } from '../ui/primitives';
import {
  CURRENCIES, CURRENCY_DIGITS, STATUS_META, TYPE_OPTIONS, base64Bytes, day, download, duplicateOf, errorText, fileSize, finance, ghs, money,
  openAttachment, parseMoney, previewGhs, requestKey, toInput, uploadReceipt, when,
  type Config, type Txn, type TxnDetail, type TxnStatus, type TxnType,
} from './money';

/* ==========================================================================
   Recording and reviewing one transaction.

   The form never decides what is in the books: it sends the fields and an
   intent (draft, submit, commit or post) and the server checks the level,
   completeness, duplicates, budgets and payment references. Posted entries
   open read-only; they change only by reversal or correction.
   ========================================================================== */

export function StatusBadge({ status }: { status: TxnStatus }) {
  const meta = STATUS_META[status];
  return <Badge tone={meta.tone} dot title={meta.hint}>{meta.label}</Badge>;
}

export function Amount({ minor, signed = true, strong = false }: { minor: number; signed?: boolean; strong?: boolean }) {
  const tone = minor > 0 ? 'in' : minor < 0 ? 'out' : 'flat';
  const text = ghs(minor, { signed });
  return strong ? <strong className={`fm-amt fm-amt--${tone}`}>{text}</strong> : <span className={`fm-amt fm-amt--${tone}`}>{text}</span>;
}

const PAYMENT_METHODS = ['Mobile Money', 'Bank transfer', 'Cash', 'Card', 'Paystack', 'Cheque'];

export interface TxnPrefill extends Partial<Pick<Txn, 'type' | 'direction' | 'adjustmentKind' | 'date' | 'description' | 'categoryId' | 'accountId' | 'toAccountId' | 'counterparty' | 'paymentMethod' | 'reference' | 'project' | 'fundingSourceId' | 'restricted' | 'restrictionPurpose' | 'fundedBy' | 'notes'>> {
  amountMinor?: number; currency?: string; originalMinor?: number; rate?: string; recurringId?: string; recurringDueDate?: string;
}

interface FormState {
  type: TxnType; direction: 'in' | 'out'; adjustmentKind: 'opening' | 'correction' | 'reconciliation'; amount: string; currency: string; rate: string; date: string;
  description: string; categoryId: string; accountId: string; toAccountId: string; counterparty: string; paymentMethod: string; reference: string; project: string;
  fundingSourceId: string; restricted: boolean; restrictionPurpose: string; fundedBy: string; notes: string;
}

function initialState(config: Config, prefill: TxnPrefill | undefined, existing: Txn | undefined): FormState {
  const src = existing ?? prefill ?? {};
  const original = existing?.original;
  const currency = original?.currency ?? prefill?.currency ?? 'GHS';
  const digits = CURRENCY_DIGITS[currency] ?? 2;
  return {
    type: src.type ?? 'income', direction: src.direction ?? 'in', adjustmentKind: src.adjustmentKind ?? 'opening',
    amount: original ? toInput(original.amountMinor, digits) : currency !== 'GHS' && prefill?.originalMinor ? toInput(prefill.originalMinor, digits) : toInput(existing?.amountMinor ?? prefill?.amountMinor),
    currency, rate: original?.rate ?? prefill?.rate ?? '', date: src.date ?? config.today, description: src.description ?? '', categoryId: src.categoryId ?? '',
    accountId: src.accountId ?? (config.accounts.filter((a) => a.status === 'active').length === 1 ? config.accounts.find((a) => a.status === 'active')!.id : ''),
    toAccountId: src.toAccountId ?? '', counterparty: src.counterparty ?? '', paymentMethod: src.paymentMethod ?? '', reference: src.reference ?? '', project: src.project ?? '',
    fundingSourceId: src.fundingSourceId ?? '', restricted: src.restricted ?? false, restrictionPurpose: src.restrictionPurpose ?? '', fundedBy: src.fundedBy ?? '', notes: src.notes ?? '',
  };
}

export function TransactionForm({ config, prefill, existing, onClose, onSaved }: {
  config: Config;
  prefill?: TxnPrefill;
  existing?: Txn;
  onClose: () => void;
  onSaved: (message: string, id: string) => void;
}) {
  const { user } = useSession();
  const [form, setForm] = useState<FormState>(() => initialState(config, prefill, existing));
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [key] = useState(requestKey);
  const set = <K extends keyof FormState>(field: K, value: FormState[K]) => setForm((f) => ({ ...f, [field]: value }));
  const admin = config.level === 'admin';
  const digits = CURRENCY_DIGITS[form.currency] ?? 2;
  const parsed = parseMoney(form.amount, digits);
  const ghsMinor = form.currency === 'GHS' ? parsed : parsed !== null ? previewGhs(parsed, form.currency, form.rate) : null;
  const activeAccounts = config.accounts.filter((a) => a.status === 'active');
  const categories = config.categories.filter((c) => c.active && (form.type === 'income' ? c.kind !== 'expense' : form.type === 'expense' ? c.kind !== 'income' : true));
  const sources = config.sources.filter((s) => s.status === 'active');
  const future = form.date > config.today;

  const problem = useMemo(() => {
    if (parsed === null || parsed <= 0) return 'Enter the amount, for example 1,250.00.';
    if (form.currency !== 'GHS' && (ghsMinor === null || ghsMinor <= 0)) return 'Enter the exchange rate (cedis for one unit).';
    if (form.description.trim().length < 3) return 'Describe what the money was for.';
    return '';
  }, [parsed, ghsMinor, form.currency, form.description]);

  const fields = () => ({
    type: form.type, direction: form.type === 'refund' || form.type === 'adjustment' ? form.direction : null,
    adjustmentKind: form.type === 'adjustment' ? form.adjustmentKind : null,
    amountMinor: form.currency === 'GHS' ? parsed : ghsMinor,
    original: form.currency === 'GHS' ? null : { currency: form.currency, amountMinor: parsed, rate: form.rate.trim() },
    date: form.date, description: form.description, categoryId: form.type === 'transfer' ? null : form.categoryId || null, accountId: form.accountId || null,
    toAccountId: form.type === 'transfer' ? form.toAccountId || null : null, counterparty: form.counterparty, paymentMethod: form.paymentMethod, reference: form.reference,
    project: form.project, fundingSourceId: form.type === 'income' || form.type === 'refund' ? form.fundingSourceId || null : null,
    restricted: form.type === 'income' && Boolean(form.fundingSourceId) && form.restricted, restrictionPurpose: form.restricted ? form.restrictionPurpose : '',
    fundedBy: form.type === 'expense' ? form.fundedBy || null : null, notes: form.notes,
  });

  async function save(intent: 'draft' | 'submit' | 'commit' | 'post', allowDuplicate = false): Promise<void> {
    setBusy(intent);
    setError('');
    try {
      const result = await finance<{ id: string; number: string; status: TxnStatus; replayed: boolean; budgetWarnings: string[] }>('save', {
        id: existing?.id, fields: fields(), intent, requestKey: key, allowDuplicate, expectedVersion: existing?.version,
        recurringId: prefill?.recurringId, recurringDueDate: prefill?.recurringDueDate,
      });
      let note = '';
      if (file) {
        try { await uploadReceipt(user.uid, file, { targetType: 'transaction', targetId: result.id }); }
        catch (uploadError) { note = ` The receipt was not attached: ${errorText(uploadError)} Open the entry to try again.`; }
      }
      const verb = { draft: 'saved as a draft', submit: 'submitted for approval', commit: 'approved as an unpaid commitment', post: 'posted to the books' }[intent];
      onSaved(`${result.number} ${verb}.${result.budgetWarnings?.length ? ` Budget: ${result.budgetWarnings.join(' ')}` : ''}${note}`, result.id);
    } catch (reason) {
      if (duplicateOf(reason)) {
        const ok = await confirmAction({ title: 'This looks like an entry that already exists', body: errorText(reason), confirmLabel: 'Record it anyway' });
        if (ok) return save(intent, true);
        setError('Not recorded. Check the existing entry first.');
      } else setError(errorText(reason, 'The entry could not be saved.'));
    } finally {
      setBusy(null);
    }
  }

  const submit = (event: FormEvent) => { event.preventDefault(); if (!problem) void save(admin ? (future ? 'draft' : 'post') : 'submit'); };
  const typeHint = TYPE_OPTIONS.find((t) => t.value === form.type)?.hint;

  return (
    <Dialog
      size="xl"
      title={existing ? `Edit ${existing.number}` : 'Add transaction'}
      lede={existing ? 'Only entries that are not yet in the books can be edited.' : 'Record money that came in, went out or moved between accounts.'}
      onClose={onClose}
      busy={Boolean(busy)}
      className="fm-form-dialog"
      footer={
        <div className="fm-form-foot">
          {error ? <p className="ts-error" role="alert"><Icon name="alert" />{error}</p> : problem ? <p className="ts-hint">{problem}</p> : <p className="ts-hint">{admin ? (future ? 'Dated in the future: save it as a draft or approve it as unpaid.' : 'Posting puts it in the official books immediately.') : 'A finance administrator approves it before it counts.'}</p>}
          <div className="fm-form-foot__actions">
            <Button variant="ghost" onClick={onClose} disabled={Boolean(busy)}>Cancel</Button>
            <Button onClick={() => void save('draft')} busy={busy === 'draft'} disabled={Boolean(busy) || Boolean(problem)}>Save draft</Button>
            {admin ? (
              <>
                {form.type === 'expense' ? <Button onClick={() => void save('commit')} busy={busy === 'commit'} disabled={Boolean(busy) || Boolean(problem)} title="Approved but not yet paid: reserved, not spent">Approve as unpaid</Button> : null}
                <Button variant="primary" icon="check" onClick={() => void save('post')} busy={busy === 'post'} disabled={Boolean(busy) || Boolean(problem) || future}>Record & post</Button>
              </>
            ) : (
              <Button variant="primary" icon="send" onClick={() => void save('submit')} busy={busy === 'submit'} disabled={Boolean(busy) || Boolean(problem)}>Submit for approval</Button>
            )}
          </div>
        </div>
      }
    >
      <form className="fm-form" onSubmit={submit} noValidate>
        <fieldset className="fm-types" disabled={existing?.source.kind === 'platform'}>
          <legend className="ts-label">Transaction type</legend>
          {TYPE_OPTIONS.map((t) => (
            <label key={t.value} className={cx('fm-type', form.type === t.value && 'fm-type--on', `fm-type--${t.value}`)}>
              <input type="radio" name="type" value={t.value} checked={form.type === t.value} onChange={() => set('type', t.value)} />
              <span>{t.label}</span>
            </label>
          ))}
        </fieldset>
        {typeHint ? <p className="ts-hint fm-form__wide">{typeHint}</p> : null}

        {form.type === 'refund' ? (
          <Field label="Direction" required className="fm-form__wide">
            <select className="ts-select" value={form.direction} onChange={(e) => set('direction', e.target.value as 'in' | 'out')}>
              <option value="in">Refund received — money returned to Indigen World (reduces spending)</option>
              <option value="out">Refund paid — money Indigen World returned (reduces income)</option>
            </select>
          </Field>
        ) : null}
        {form.type === 'adjustment' ? (
          <>
            <Field label="Kind of adjustment" required>
              <select className="ts-select" value={form.adjustmentKind} onChange={(e) => set('adjustmentKind', e.target.value as FormState['adjustmentKind'])}>
                <option value="opening">Opening balance</option><option value="correction">Authorised correction</option><option value="reconciliation">Reconciliation adjustment</option>
              </select>
            </Field>
            <Field label="Effect" required>
              <select className="ts-select" value={form.direction} onChange={(e) => set('direction', e.target.value as 'in' | 'out')}>
                <option value="in">Adds to the balance</option><option value="out">Removes from the balance</option>
              </select>
            </Field>
          </>
        ) : null}

        <Field label="Amount" required hint={form.currency !== 'GHS' && ghsMinor ? `Recorded as ${ghs(ghsMinor)} at ${form.rate} cedis per ${form.currency}.` : 'In cedis and pesewas, for example 1,250.00.'}>
          <div className="fm-money">
            <select className="ts-select" aria-label="Currency" value={form.currency} onChange={(e) => set('currency', e.target.value)} disabled={existing?.source.kind === 'platform'}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c === 'GHS' ? 'GH₵' : c}</option>)}
            </select>
            <input className="ts-input fm-num" inputMode="decimal" autoComplete="off" value={form.amount} onChange={(e) => set('amount', e.target.value)} placeholder="0.00" disabled={existing?.source.kind === 'platform'} />
          </div>
        </Field>
        {form.currency !== 'GHS' ? (
          <Field label={`Exchange rate (GH₵ per 1 ${form.currency})`} required hint="The rate actually applied to the payment; the original amount is kept beside the cedi figure.">
            <input className="ts-input fm-num" inputMode="decimal" value={form.rate} onChange={(e) => set('rate', e.target.value)} placeholder="15.25" />
          </Field>
        ) : null}
        <Field label="Transaction date" required hint={future ? 'A future date can be saved, or approved as unpaid, but not posted.' : 'The day the money moved (Africa/Accra).'}>
          <input className="ts-input" type="date" value={form.date} onChange={(e) => set('date', e.target.value)} max="2100-12-31" />
        </Field>

        <Field label="Description" required className="fm-form__wide" counter={`${form.description.length} / 300`}>
          <input className="ts-input" value={form.description} maxLength={300} onChange={(e) => set('description', e.target.value)} placeholder={form.type === 'expense' ? 'What the money was spent on' : 'What the money is for'} />
        </Field>

        {form.type !== 'transfer' ? (
          <Field label="Category" required={form.type === 'income' || form.type === 'expense'} optional={form.type === 'refund' || form.type === 'adjustment'}>
            <select className="ts-select" value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              <option value="">Choose a category…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        ) : null}
        <Field label={form.type === 'transfer' ? 'From account' : form.type === 'income' || (form.type === 'refund' && form.direction === 'in') ? 'Received into' : 'Paid from'} required hint={activeAccounts.length ? undefined : 'No accounts yet: a finance administrator adds them under Accounts.'}>
          <select className="ts-select" value={form.accountId} onChange={(e) => set('accountId', e.target.value)}>
            <option value="">Choose an account…</option>
            {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        {form.type === 'transfer' ? (
          <Field label="To account" required>
            <select className="ts-select" value={form.toAccountId} onChange={(e) => set('toAccountId', e.target.value)}>
              <option value="">Choose an account…</option>
              {activeAccounts.filter((a) => a.id !== form.accountId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
        ) : null}

        <Field label={form.type === 'income' ? 'Sender' : form.type === 'expense' ? 'Recipient' : 'Sender or recipient'} optional>
          <input className="ts-input" value={form.counterparty} maxLength={160} onChange={(e) => set('counterparty', e.target.value)} placeholder={form.type === 'income' ? 'Person or organisation that paid' : 'Person or business paid'} />
        </Field>
        <Field label="Payment method" optional>
          <input className="ts-input" list="fm-methods" value={form.paymentMethod} maxLength={60} onChange={(e) => set('paymentMethod', e.target.value)} />
        </Field>
        <datalist id="fm-methods">{PAYMENT_METHODS.map((m) => <option key={m} value={m} />)}</datalist>
        <Field label="Payment reference" optional hint="MoMo transaction ID, bank reference or invoice number. A reference posts once per account.">
          <input className="ts-input ts-input--mono" value={form.reference} maxLength={120} onChange={(e) => set('reference', e.target.value)} />
        </Field>
        <Field label="Project or department" optional>
          <input className="ts-input" value={form.project} maxLength={120} onChange={(e) => set('project', e.target.value)} />
        </Field>

        {form.type === 'income' || form.type === 'refund' ? (
          <Field label="Funding source" optional hint="Who the money came from. Add funders under Funding sources.">
            <select className="ts-select" value={form.fundingSourceId} onChange={(e) => set('fundingSourceId', e.target.value)}>
              <option value="">Not linked to a funder</option>
              {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        ) : null}
        {form.type === 'income' && form.fundingSourceId ? (
          <div className="fm-form__wide fm-restrict">
            <label className="ts-check"><input type="checkbox" checked={form.restricted} onChange={(e) => set('restricted', e.target.checked)} /> <span>Restricted to a particular purpose</span></label>
            {form.restricted ? <Field label="Restricted purpose" required><input className="ts-input" value={form.restrictionPurpose} maxLength={300} onChange={(e) => set('restrictionPurpose', e.target.value)} placeholder="For example: research and data collection only" /></Field> : null}
          </div>
        ) : null}
        {form.type === 'expense' ? (
          <Field label="Paid from restricted funds of" optional hint="Only when this spending is explicitly allocated to a funder’s restricted money.">
            <select className="ts-select" value={form.fundedBy} onChange={(e) => set('fundedBy', e.target.value)}>
              <option value="">General (unrestricted) funds</option>
              {sources.filter((s) => !s.system).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        ) : null}

        <Field label="Supporting document" optional hint="Receipt, invoice or payment confirmation: PDF, JPEG, PNG or WebP up to 10 MB." className="fm-form__wide">
          <input className="ts-input" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Field>
        <Field label="Internal notes" optional className="fm-form__wide" counter={`${form.notes.length} / 2,000`}>
          <textarea className="ts-textarea" rows={2} maxLength={2000} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        <p className="ts-hint fm-form__wide">Recorded by {user.displayName ?? user.email}. {prefill?.recurringId ? 'Posting this payment moves the subscription’s next due date forward.' : ''}</p>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

/* -- Detail ---------------------------------------------------------------------------------- */

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return <div className="ad-fact"><dt>{label}</dt><dd>{children}</dd></div>;
}

const ACTION_LABEL: Record<string, string> = {
  'transaction.created.draft': 'Created as a draft', 'transaction.created.pending_approval': 'Created and submitted for approval', 'transaction.created.posted': 'Recorded and posted',
  'transaction.created.approved': 'Recorded and approved as unpaid', 'transaction.updated.draft': 'Edited', 'transaction.updated.pending_approval': 'Submitted for approval',
  'transaction.updated.posted': 'Edited and posted', 'transaction.updated.approved': 'Edited and approved as unpaid', 'transaction.approved.posted': 'Approved and posted',
  'transaction.approved.committed': 'Approved as unpaid', 'transaction.paid': 'Marked paid and posted', 'transaction.rejected': 'Rejected', 'transaction.discarded': 'Discarded',
  'transaction.reversed': 'Reversed', 'transaction.created.reversal': 'Reversal posted', 'platform.recorded': 'Logged from the platform', 'document.attached': 'Document attached',
  'document.viewed': 'Document opened', 'transaction.record_downloaded': 'Record downloaded',
};
export const actionLabel = (action: string) => ACTION_LABEL[action] ?? action.replace(/[._]/g, ' ');

function show(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
export function changeText(field: string, before: unknown, after: unknown): string {
  if (field === 'amountMinor') return `Amount: ${typeof before === 'number' ? ghs(before) : '—'} → ${typeof after === 'number' ? ghs(after) : '—'}`;
  return `${field.replace(/([A-Z])/g, ' $1').replace(/Id$/, '').toLowerCase()}: ${show(before)} → ${show(after)}`;
}

export function TransactionDetail({ id, config, onClose, onChanged, onEdit, onOpen }: {
  id: string;
  config: Config;
  onClose: () => void;
  onChanged: (message: string) => void;
  onEdit: (txn: Txn) => void;
  onOpen: (id: string) => void;
}) {
  const { user } = useSession();
  const [detail, setDetail] = useState<TxnDetail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [approveAccount, setApproveAccount] = useState('');
  const load = async () => {
    try { const d = await finance<TxnDetail>('get', { id }); setDetail(d); setApproveAccount(d.txn.accountId ?? ''); setError(''); }
    catch (reason) { setError(errorText(reason, 'This entry could not be loaded.')); }
  };
  useEffect(() => { void load(); }, [id]);
  const admin = config.level === 'admin';
  const editor = config.level !== 'viewer';
  const t = detail?.txn;

  async function act(name: string, operation: string, data: Record<string, unknown>, message: string) {
    setBusy(name);
    setError('');
    try { await finance(operation, { id, expectedVersion: t?.version, ...data }); onChanged(message); await load(); }
    catch (reason) { setError(errorText(reason)); }
    finally { setBusy(null); }
  }
  const withReason = async (title: string, label: string, run: (reason: string) => Promise<void>, min = 5, body?: ReactNode) => {
    const reason = await askText({ title, body, label, required: true, minLength: min, maxLength: 1000, multiline: true, tone: 'danger', confirmLabel: title });
    if (reason) await run(reason);
  };

  return (
    <Dialog size="lg" onClose={onClose} busy={Boolean(busy)} className="fm-detail"
      title={t ? <span className="fm-detail__title">{t.number} <StatusBadge status={t.status} /></span> : 'Transaction'}
      lede={t ? `${t.typeLabel} · ${day(t.date)}` : undefined}>
      {!t && !error ? <Skeleton title lines={6} label="Loading the entry" /> : null}
      {error ? <Notice tone="danger" title="That did not work">{error}</Notice> : null}
      {t ? (
        <div className="fm-detail__body">
          <div className="fm-detail__hero">
            <Amount minor={t.type === 'transfer' ? t.amountMinor : t.signedMinor || (t.type === 'expense' || t.direction === 'out' ? -t.amountMinor : t.amountMinor)} strong />
            <p>{t.description}</p>
            {t.original ? <p className="ts-hint">Originally {money(t.original.amountMinor, t.original.currency)} at {t.original.rate} cedis per {t.original.currency}.</p> : null}
            {t.runningBalanceMinor !== null ? <p className="ts-hint">Project balance after this entry: <strong>{ghs(t.runningBalanceMinor)}</strong></p> : <p className="ts-hint">{STATUS_META[t.status].hint}</p>}
          </div>
          {t.status === 'rejected' && t.rejectionReason ? <Notice tone="danger" title="Rejected">{t.rejectionReason}</Notice> : null}
          {t.source.kind === 'platform' && t.status === 'pending_approval' ? <Notice tone="info" title="Logged automatically from the platform">This came from a confirmed platform record ({t.source.ref}). Check it against the provider (for example that it was not a test payment), choose the account the money is in, and approve it — or dismiss it with a reason.</Notice> : null}
          {detail!.budgetImpact.length ? <Notice tone="warning" title="Budget">Posting this would take {detail!.budgetImpact.join(', ')} past its alert level.</Notice> : null}

          <dl className="ad-facts ad-facts--grid">
            <Fact label="Category">{t.type === 'transfer' ? 'Internal transfer' : t.categoryName}</Fact>
            <Fact label={t.type === 'transfer' ? 'From → to' : 'Account'}>{t.type === 'transfer' ? `${t.accountName} → ${t.toAccountName ?? '—'}` : t.accountName}</Fact>
            <Fact label="Sender / recipient">{t.counterparty || '—'}</Fact>
            <Fact label="Payment method">{t.paymentMethod || '—'}</Fact>
            <Fact label="Payment reference">{t.reference ? <code>{t.reference}</code> : '—'}</Fact>
            <Fact label="Project / department">{t.project || '—'}</Fact>
            <Fact label="Funding source">{t.fundingSourceName ? `${t.fundingSourceName}${t.restricted ? ` · restricted: ${t.restrictionPurpose}` : ''}` : '—'}</Fact>
            <Fact label="Restricted allocation">{t.fundedByName ?? '—'}</Fact>
            <Fact label="Recorded by">{t.recordedBy.name}<small className="fm-sub">{when(t.createdAt)}</small></Fact>
            <Fact label="Authorised by">{t.authorisedBy ? <>{t.authorisedBy.name}<small className="fm-sub">{when(t.approvedAt)}</small></> : '—'}</Fact>
            {t.notes ? <Fact label="Internal notes"><span className="fm-pre">{t.notes}</span></Fact> : null}
          </dl>

          {detail!.linked.length ? (
            <section aria-labelledby="fm-linked">
              <h3 id="fm-linked" className="fm-h3">Linked entries</h3>
              <ul className="fm-links">
                {detail!.linked.map((l) => <li key={l.id}><button type="button" className="ts-link" onClick={() => onOpen(l.id)}>{l.number}</button> {l.isReversal ? 'reversal' : l.id === t.correctionOf ? 'the entry this corrects' : t.reversalOf === l.id ? 'the reversed entry' : 'correction'} · <StatusBadge status={l.status} /></li>)}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="fm-docs">
            <h3 id="fm-docs" className="fm-h3">Supporting documents</h3>
            {t.attachments.length ? (
              <ul className="fm-files">
                {t.attachments.map((a) => (
                  <li key={a.id}>
                    <Icon name={a.contentType === 'application/pdf' ? 'doc' : 'image'} />
                    <span><strong>{a.name}</strong><small className="fm-sub">{fileSize(a.size)} · {a.uploadedBy} · {when(a.uploadedAt)}</small></span>
                    <Button size="sm" variant="ghost" icon="eye" onClick={() => openAttachment({ targetType: 'transaction', targetId: t.id }, a).catch((e) => setError(errorText(e)))}>Open</Button>
                  </li>
                ))}
              </ul>
            ) : <p className="ts-muted">No documents attached.</p>}
            {editor ? (
              <label className="ts-btn ts-btn--secondary ts-btn--sm fm-upload">
                <Icon name="upload" /><span>{busy === 'upload' ? 'Uploading…' : 'Attach a receipt'}</span>
                <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={busy !== null} onChange={async (e) => {
                  const f = e.target.files?.[0]; e.target.value = '';
                  if (!f) return;
                  setBusy('upload'); setError('');
                  try { await uploadReceipt(user.uid, f, { targetType: 'transaction', targetId: t.id }); onChanged('Document attached.'); await load(); }
                  catch (reason) { setError(errorText(reason)); }
                  finally { setBusy(null); }
                }} />
              </label>
            ) : null}
          </section>

          <section aria-labelledby="fm-history">
            <h3 id="fm-history" className="fm-h3">Audit history</h3>
            <ol className="fm-timeline">
              {detail!.audit.map((a) => (
                <li key={a.id}>
                  <span className="fm-timeline__dot" aria-hidden="true" />
                  <div>
                    <p><strong>{actionLabel(a.action)}</strong> · {a.actor?.name}</p>
                    <p className="fm-sub">{when(a.at)}{a.statusBefore !== a.statusAfter && a.statusAfter ? ` · ${a.statusBefore ? STATUS_META[a.statusBefore as TxnStatus]?.label ?? a.statusBefore : 'new'} → ${STATUS_META[a.statusAfter as TxnStatus]?.label ?? a.statusAfter}` : ''}</p>
                    {a.reason ? <p className="fm-quote">“{a.reason}”</p> : null}
                    {a.changes?.length && !a.action.includes('created') ? <ul className="fm-changes">{a.changes.map((c) => <li key={c.field}>{changeText(c.field, c.before, c.after)}</li>)}</ul> : null}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <div className="fm-detail__actions">
            <Button size="sm" icon="download" onClick={async () => {
              setBusy('voucher');
              try { const r = await finance<{ filename: string; pdfBase64: string }>('voucher', { id: t.id }); download(r.filename, base64Bytes(r.pdfBase64) as BlobPart, 'application/pdf'); }
              catch (reason) { setError(errorText(reason)); } finally { setBusy(null); }
            }} busy={busy === 'voucher'}>Download record (PDF)</Button>
            {editor && ['draft', 'pending_approval', 'rejected'].includes(t.status) && (admin || t.recordedBy.uid === user.uid) ? <Button size="sm" icon="edit" onClick={() => onEdit(t)}>Edit</Button> : null}
            {editor && (t.status === 'draft' || t.status === 'rejected') ? <Button size="sm" icon="send" busy={busy === 'submit'} onClick={() => void act('submit', 'submit', {}, `${t.number} submitted for approval.`)}>Submit for approval</Button> : null}
            {editor && ['draft', 'rejected', 'pending_approval'].includes(t.status) && (admin || (t.recordedBy.uid === user.uid && t.source.kind !== 'platform')) ? (
              <Button size="sm" variant="danger-ghost" icon="trash" onClick={() => void withReason(t.source.kind === 'platform' ? 'Dismiss platform record' : 'Discard entry', 'Reason', (reason) => act('discard', 'discard', { reason }, `${t.number} discarded; it stays in the audit trail.`), t.source.kind === 'platform' ? 3 : 0)}>{t.source.kind === 'platform' ? 'Dismiss' : 'Discard'}</Button>
            ) : null}
            {admin && t.status === 'pending_approval' ? <Button size="sm" variant="danger-ghost" icon="x-circle" onClick={() => void withReason('Reject', 'Reason for the person who recorded it', (reason) => act('reject', 'reject', { reason }, `${t.number} rejected.`), 3)}>Reject</Button> : null}
            {admin && t.status === 'approved' ? (
              <>
                <Button size="sm" variant="danger-ghost" icon="x-circle" onClick={() => void withReason('Cancel commitment', 'Reason', (reason) => act('reject', 'reject', { reason }, `${t.number} cancelled.`), 3)}>Cancel commitment</Button>
                <Button size="sm" variant="primary" icon="check" busy={busy === 'paid'} onClick={async () => {
                  const reference = await askText({ title: 'Mark paid', body: 'Record that the money has now been paid. It enters the books on today’s date.', label: 'Payment reference', required: false, maxLength: 120, confirmLabel: 'Mark paid and post' });
                  if (reference !== null) await act('paid', 'markPaid', { reference, date: config.today }, `${t.number} paid and posted.`);
                }}>Mark paid</Button>
              </>
            ) : null}
            {admin && t.status === 'posted' && !t.isReversal ? (
              <>
                <Button size="sm" variant="danger-ghost" icon="undo" onClick={() => void withReason('Reverse entry', 'Why is this being reversed?', (reason) => act('reverse', 'reverse', { reason }, `${t.number} reversed. The original and its reversal both stay in the books.`), 5,
                  'A linked reversal entry cancels this one from today. Nothing is deleted; both stay visible in the ledger and the audit trail.')}>Reverse</Button>
                <Button size="sm" icon="redo" onClick={() => void withReason('Correct entry', 'What was wrong?', async (reason) => {
                  setBusy('correct');
                  try { const r = await finance<{ correctionId: string; correctionNumber: string }>('correct', { id, reason, expectedVersion: t.version }); onChanged(`${t.number} reversed; correction ${r.correctionNumber} opened as a draft.`); onOpen(r.correctionId); }
                  catch (e) { setError(errorText(e)); } finally { setBusy(null); }
                }, 5, 'This reverses the entry and opens a corrected draft prefilled from it, linked both ways.')}>Correct</Button>
              </>
            ) : null}
          </div>
          {admin && ['pending_approval', 'draft'].includes(t.status) ? (
            <div className="fm-approve">
              <Field label="Account the money is in" required>
                <select className="ts-select" value={approveAccount} onChange={(e) => setApproveAccount(e.target.value)}>
                  <option value="">Choose an account…</option>
                  {config.accounts.filter((a) => a.status === 'active').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
              <div className="fm-approve__buttons">
                {t.type === 'expense' ? <Button busy={busy === 'commit'} disabled={!approveAccount || Boolean(busy)} onClick={() => void act('commit', 'approve', { mode: 'commit', accountId: approveAccount }, `${t.number} approved as unpaid.`)}>Approve as unpaid</Button> : null}
                <Button variant="primary" icon="check" busy={busy === 'post'} disabled={!approveAccount || Boolean(busy) || t.date > config.today} onClick={() => void act('post', 'approve', { mode: 'post', accountId: approveAccount }, `${t.number} approved and posted.`)}>Approve & post</Button>
              </div>
              {t.recordedBy.uid === user.uid && config.settings.requireSecondApprover ? <p className="ts-hint">Two-person approval is on, so another finance administrator must approve your own entry.</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}
