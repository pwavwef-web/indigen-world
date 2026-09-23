import { useMemo, useState } from 'react';
import {
  Alert,
  DataTable,
  PageHeader,
  Panel,
  SegmentedControl,
  Spinner,
  StatusPill,
  toneForStatus,
  type DataColumn,
} from '@indigen-world/console-ui';
import {
  decideContributorPayment,
  decidePayoutVerification,
  openPayoutStatement,
  rerunPayoutStatementCheck,
  type AutomatedCheck,
  type ContributorDirectoryRow,
  type ContributorPaymentRequest,
  type ContributorPayments,
  type ContributorPayoutProfile,
  type FieldOutcome,
  type PayoutHistoryEvent,
  type VerificationStatus,
} from './data';

/**
 * The finance desk for contributor payout verification.
 *
 * Separation of duties: everything here needs the `finance` claim on an admin
 * account, or a super administrator — checked by every callable behind it,
 * not only by this screen. An admin without it sees why, and nothing else.
 *
 * What a reviewer decides:
 *   bank  — the account, against the statement the contributor uploaded. The
 *           automated check (if switched on) is evidence to weigh, never a
 *           verdict; the statement itself is one click away, through a
 *           five-minute link that is recorded in the audit log.
 *   MoMo  — ownership of the wallet and its registered name. The contributor
 *           has already proved control of the number with a one-time code;
 *           that code proves nothing about whose wallet it is.
 * Each decision names the version of the details it was made on, so it cannot
 * land on details the contributor changed after the desk was opened.
 */

type Filter = 'review' | 'action' | 'verified' | 'rejected' | 'all';

interface QueueEntry {
  key: string;
  profile: ContributorPayoutProfile;
  method: 'bank' | 'momo';
  status: VerificationStatus;
  submittedAt: string;
}

const STATUS_LABEL: Record<VerificationStatus, string> = {
  pending: 'Pending review',
  verified: 'Verified',
  needs_action: 'Needs action',
  rejected: 'Rejected',
};

const CHECK_LABEL: Record<AutomatedCheck['state'], string> = {
  off: 'Check off',
  not_run: 'Not run',
  consistent: 'Consistent',
  mismatch: 'Mismatch',
  uncertain: 'Uncertain',
  unreadable: 'Unreadable',
  unavailable: 'Could not run',
};

const OUTCOME_LABEL: Record<FieldOutcome, string> = {
  match: 'matches',
  partial: 'partly visible, consistent',
  mismatch: 'does not match',
  not_found: 'not found',
};

function dateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function checkTone(state: AutomatedCheck['state']): 'success' | 'warning' | 'danger' | 'neutral' | 'info' {
  if (state === 'consistent') return 'success';
  if (state === 'mismatch') return 'danger';
  if (state === 'unreadable' || state === 'uncertain') return 'warning';
  return 'neutral';
}

export function ContributorPaymentsDesk({ payments, contributors, loading, canReview, onReload, onNotice }: {
  payments: ContributorPayments;
  contributors: ContributorDirectoryRow[];
  loading: boolean;
  canReview: boolean;
  onReload: () => Promise<void>;
  onNotice: (message: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>('review');
  const [expanded, setExpanded] = useState<string | null>(null);
  const nameFor = (id: string) => contributors.find((item) => item.id === id)?.displayName || id;
  const queue = useMemo<QueueEntry[]>(() => payments.profiles.flatMap((profile) => [
    ...(profile.bank ? [{ key: `${profile.id}:bank`, profile, method: 'bank' as const, status: profile.bank.status, submittedAt: profile.bank.submittedAt }] : []),
    ...(profile.momo ? [{ key: `${profile.id}:momo`, profile, method: 'momo' as const, status: profile.momo.ownershipStatus, submittedAt: profile.momo.submittedAt }] : []),
  ]), [payments.profiles]);
  const matches = (entry: QueueEntry) => filter === 'all'
    || (filter === 'review' && entry.status === 'pending')
    || (filter === 'action' && entry.status === 'needs_action')
    || (filter === 'verified' && entry.status === 'verified')
    || (filter === 'rejected' && entry.status === 'rejected');
  const rows = queue.filter(matches);
  const count = (status: VerificationStatus) => queue.filter((entry) => entry.status === status).length;

  if (!canReview) {
    return (
      <Panel>
        <PageHeader kicker="Separation of duties" title="Finance access required" body="Contributor bank statements, full account numbers and MoMo wallets are visible only to finance reviewers." />
        <Alert tone="info" title="How access is granted">
          A super administrator adds the custom claim <code>finance: true</code> to an admin account (see docs/creator-system.md, “Finance”), and the reviewer signs out and back in. Every payment-detail callable checks the claim on the server, so this screen cannot be opened around it.
        </Alert>
      </Panel>
    );
  }

  const columns: DataColumn<QueueEntry>[] = [
    { id: 'contributor', header: 'Contributor', cell: (entry) => <div className="contributor-primary"><strong>{nameFor(entry.profile.contributorId)}</strong><small>{entry.profile.contributorId}</small></div>, sort: (entry) => nameFor(entry.profile.contributorId), search: (entry) => `${nameFor(entry.profile.contributorId)} ${entry.profile.contributorId}` },
    { id: 'method', header: 'Method', cell: (entry) => entry.method === 'bank' ? <div className="contributor-primary"><strong>Bank account</strong><small>{entry.profile.bank?.bankName}</small></div> : <div className="contributor-primary"><strong>MoMo wallet</strong><small>{entry.profile.momo?.networkLabel}</small></div>, sort: (entry) => entry.method },
    { id: 'status', header: 'Status', cell: (entry) => <StatusPill tone={toneForStatus(entry.status === 'needs_action' ? 'revision' : entry.status)}>{STATUS_LABEL[entry.status]}</StatusPill>, sort: (entry) => entry.status, search: (entry) => entry.status },
    { id: 'evidence', header: 'Evidence', cell: (entry) => entry.method === 'bank'
      ? <div className="contributor-status-stack"><StatusPill tone={checkTone(entry.profile.bank!.automatedCheck.state)}>{CHECK_LABEL[entry.profile.bank!.automatedCheck.state]}</StatusPill><small>{entry.profile.bank?.statement ? 'Statement on file' : 'No statement'}{entry.profile.bank?.legacy ? ' · legacy' : ''}</small></div>
      : <div className="contributor-status-stack"><StatusPill tone="success">Code confirmed</StatusPill><small>{dateTime(entry.profile.momo?.phoneVerifiedAt)}</small></div> },
    { id: 'submitted', header: 'Submitted', cell: (entry) => dateTime(entry.submittedAt), sort: (entry) => entry.submittedAt },
    { id: 'open', header: 'Review', align: 'end', cell: (entry) => <button type="button" className="button button--small" onClick={() => setExpanded(expanded === entry.key ? null : entry.key)}>{expanded === entry.key ? 'Close' : 'Open'}</button> },
  ];

  return (
    <div className="contributor-payments-admin">
      <Panel>
        <PageHeader
          kicker="Finance · private payout information"
          title="Payment verification"
          body={`Verify bank accounts against the statement on file and MoMo wallets against their registered name. Automated statement checks are ${payments.statementCheck === 'enabled' ? 'on — treat them as evidence, not a verdict' : 'off for this deployment'}.`}
          actions={<button type="button" onClick={() => void onReload()} disabled={loading}>{loading ? <><Spinner /> Refreshing</> : 'Refresh'}</button>}
        />
        <DataTable
          caption="Payment details awaiting a decision"
          columns={columns}
          rows={rows}
          rowKey={(entry) => entry.key}
          loading={loading}
          searchable
          searchPlaceholder="Search contributor…"
          initialSort={{ columnId: 'submitted', direction: 'asc' }}
          expandedId={expanded}
          filters={<SegmentedControl label="Verification status" value={filter} onChange={setFilter} options={[
            { id: 'review', label: 'To review', count: count('pending') },
            { id: 'action', label: 'Needs action', count: count('needs_action') },
            { id: 'verified', label: 'Verified', count: count('verified') },
            { id: 'rejected', label: 'Rejected', count: count('rejected') },
            { id: 'all', label: 'All', count: queue.length },
          ]} />}
          empty={{ title: filter === 'review' ? 'Nothing waiting for review' : 'Nothing here', body: 'Submissions from contributors appear here as they arrive.' }}
          renderDetail={(entry) => <VerificationDetail entry={entry} name={nameFor(entry.profile.contributorId)} statementCheck={payments.statementCheck} onDone={async (message) => { onNotice(message); setExpanded(null); await onReload(); }} onNotice={onNotice} />}
        />
      </Panel>
      <PaymentRequests requests={payments.requests} nameFor={nameFor} onReload={onReload} onNotice={onNotice} />
    </div>
  );
}

function VerificationDetail({ entry, name, statementCheck, onDone, onNotice }: {
  entry: QueueEntry;
  name: string;
  statementCheck: 'enabled' | 'off';
  onDone: (message: string) => Promise<void>;
  onNotice: (message: string) => void;
}) {
  const bank = entry.method === 'bank' ? entry.profile.bank : null;
  const momo = entry.method === 'momo' ? entry.profile.momo : null;
  const section = bank ?? momo!;
  const [decision, setDecision] = useState<'verify' | 'needs_action' | 'reject'>('verify');
  const [reason, setReason] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const history = entry.profile.history.filter((event) => event.method === entry.method);
  const problem = decision !== 'verify' && reason.trim().length < 5 ? 'Give the contributor a reason of at least five characters.'
    : decision === 'needs_action' && nextStep.trim().length < 5 ? 'Tell the contributor what to do next.'
      : decision === 'verify' && bank && !bank.statement ? 'A bank account cannot be verified without a statement on file.' : '';

  const openStatement = async () => {
    // Opened synchronously so the popup blocker treats it as the click it is.
    const win = window.open('', '_blank');
    setBusy('statement'); setError('');
    try {
      const link = await openPayoutStatement(entry.profile.contributorId);
      if (win) {
        win.opener = null;
        win.location.href = link.url;
      } else {
        window.location.assign(link.url);
      }
      onNotice('Statement opened. The link expires in five minutes and the opening is recorded.');
    } catch (reason) {
      win?.close();
      setError(reason instanceof Error ? reason.message : 'The statement could not be opened.');
    } finally { setBusy(''); }
  };
  const rerun = async () => {
    setBusy('rerun'); setError('');
    try {
      const state = await rerunPayoutStatementCheck(entry.profile.contributorId);
      await onDone(`Automated check finished: ${CHECK_LABEL[state].toLowerCase()}.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The check could not run.'); } finally { setBusy(''); }
  };
  const submit = async () => {
    if (problem) return;
    const verb = decision === 'verify' ? 'verify' : decision === 'needs_action' ? 'mark as needing action' : 'reject';
    if (!window.confirm(`${verb[0].toUpperCase()}${verb.slice(1)} ${name}’s ${entry.method === 'bank' ? 'bank account' : 'MoMo wallet'}? The contributor is notified and the decision is recorded in the audit log.`)) return;
    setBusy('decide'); setError('');
    try {
      await decidePayoutVerification({ contributorId: entry.profile.contributorId, method: entry.method, decision, reason: reason.trim(), nextStep: nextStep.trim(), version: section.version });
      await onDone(`${name}: ${entry.method === 'bank' ? 'bank account' : 'MoMo wallet'} ${decision === 'verify' ? 'verified' : decision === 'needs_action' ? 'marked as needing action' : 'rejected'}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The decision could not be saved.');
    } finally { setBusy(''); }
  };

  return (
    <div className="payout-detail">
      {error ? <Alert title="Something went wrong">{error}</Alert> : null}
      {bank ? (
        <>
          <div className="payout-facts">
            <div><span>Bank</span><strong>{bank.bankName}</strong></div>
            <div><span>Branch</span><strong>{bank.branch || '—'}</strong></div>
            <div><span>Account holder</span><strong>{bank.accountName}</strong></div>
            <div><span>Account number</span><strong><code>{bank.accountNumber}</code></strong></div>
            <div><span>Submitted</span><strong>{dateTime(bank.submittedAt)} · version {bank.version}</strong></div>
            <div><span>Last decision</span><strong>{bank.decidedAt ? `${dateTime(bank.decidedAt)}${bank.decidedBy ? ` by ${bank.decidedBy}` : ''}` : '—'}</strong></div>
          </div>
          {bank.legacy ? <Alert tone="warning" title="Saved before statements were required">These details were accepted by the first payment release without a statement. Ask for one before relying on them.</Alert> : null}
          <div className="payout-evidence">
            <div>
              <h4>Statement</h4>
              {bank.statement ? (
                <>
                  <p>{bank.statement.contentType === 'application/pdf' ? 'PDF' : bank.statement.contentType} · {Math.round(bank.statement.sizeBytes / 1024)} KB · uploaded {dateTime(bank.statement.uploadedAt)}</p>
                  <p className="muted">SHA-256 {bank.statement.sha256.slice(0, 16)}…</p>
                  <button type="button" className="button--primary" disabled={busy !== ''} onClick={() => void openStatement()}>{busy === 'statement' ? 'Opening…' : 'Open statement'}</button>
                  <p className="muted">Opens a link valid for five minutes. Each opening is recorded against your account.</p>
                </>
              ) : <p className="muted">No statement on file.</p>}
            </div>
            <div>
              <h4>Automated check <StatusPill tone={checkTone(bank.automatedCheck.state)}>{CHECK_LABEL[bank.automatedCheck.state]}</StatusPill></h4>
              {bank.automatedCheck.fields ? (
                <ul className="payout-fields">
                  <li>Account holder name {OUTCOME_LABEL[bank.automatedCheck.fields.accountName]}</li>
                  <li>Bank {OUTCOME_LABEL[bank.automatedCheck.fields.bankName]}</li>
                  <li>Account number {OUTCOME_LABEL[bank.automatedCheck.fields.accountNumber]}</li>
                </ul>
              ) : null}
              {bank.automatedCheck.evidence ? (
                <p className="muted">Read from the document: “{bank.automatedCheck.evidence.accountHolderName || '—'}”, “{bank.automatedCheck.evidence.bankName || '—'}”, account ending {bank.automatedCheck.evidence.accountNumberLast4 || '—'} ({bank.automatedCheck.evidence.documentKind.replace('_', ' ')}).</p>
              ) : null}
              {bank.automatedCheck.unavailableReason ? <p className="muted">Reason: {bank.automatedCheck.unavailableReason}</p> : null}
              {bank.automatedCheck.ranAt ? <p className="muted">{bank.automatedCheck.model ?? 'Model'} · {dateTime(bank.automatedCheck.ranAt)}</p> : null}
              <p className="muted">Evidence only. It cannot tell whether a document is genuine or who owns the account.</p>
              {statementCheck === 'enabled' && bank.statement ? <button type="button" disabled={busy !== ''} onClick={() => void rerun()}>{busy === 'rerun' ? 'Checking…' : 'Run the check again'}</button> : null}
            </div>
          </div>
        </>
      ) : momo ? (
        <>
          <div className="payout-facts">
            <div><span>Network</span><strong>{momo.networkLabel}</strong></div>
            <div><span>Wallet number</span><strong><code>{momo.walletNumber}</code></strong></div>
            <div><span>Registered name (as entered)</span><strong>{momo.registeredName}</strong></div>
            <div><span>Phone control</span><strong>Code confirmed {dateTime(momo.phoneVerifiedAt)}</strong></div>
            <div><span>Submitted</span><strong>{dateTime(momo.submittedAt)} · version {momo.version}</strong></div>
            <div><span>Last decision</span><strong>{momo.decidedAt ? `${dateTime(momo.decidedAt)}${momo.decidedBy ? ` by ${momo.decidedBy}` : ''}` : '—'}</strong></div>
          </div>
          <Alert tone="info" title="What the code proved">The contributor answered a one-time code sent to this number, so they control the phone. It does not prove the wallet is registered in their name. Confirm the registered name with your MoMo provider’s name check before verifying.</Alert>
        </>
      ) : null}

      <div className="payout-decision">
        <h4>Decision</h4>
        <div className="payout-decision__choices" role="radiogroup" aria-label="Decision">
          {(['verify', 'needs_action', 'reject'] as const).map((choice) => (
            <label key={choice}><input type="radio" name={`decision-${entry.key}`} checked={decision === choice} onChange={() => setDecision(choice)} />{choice === 'verify' ? 'Verify' : choice === 'needs_action' ? 'Needs action from the contributor' : 'Reject'}</label>
          ))}
        </div>
        <label>{decision === 'verify' ? 'Note (optional, recorded in history)' : 'Reason shown to the contributor'}<textarea rows={3} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
        {decision !== 'verify' ? <label>{decision === 'needs_action' ? 'Next step for the contributor' : 'Next step (optional)'}<textarea rows={2} maxLength={500} value={nextStep} onChange={(event) => setNextStep(event.target.value)} placeholder="For example: upload a statement where the full account number is visible." /></label> : null}
        {problem ? <p className="payout-problem">{problem}</p> : null}
        <div className="row-actions">
          <button type="button" className={decision === 'reject' ? 'danger' : 'button--primary'} disabled={busy !== '' || Boolean(problem)} onClick={() => void submit()}>{busy === 'decide' ? 'Saving…' : 'Record decision'}</button>
        </div>
      </div>

      {history.length ? (
        <div className="payout-history">
          <h4>History</h4>
          <ol>
            {history.map((event: PayoutHistoryEvent, index) => (
              <li key={`${event.at}-${index}`}><time>{dateTime(event.at)}</time><span><strong>{event.action.replace('.', ' · ').replaceAll('_', ' ')}</strong>{event.note ? ` — ${event.note}` : ''}</span><small>{event.actor === 'finance' ? `Finance${event.actorId ? ` (${event.actorId})` : ''}` : event.actor === 'system' ? 'Automated' : 'Contributor'}</small></li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

function PaymentRequests({ requests, nameFor, onReload, onNotice }: {
  requests: ContributorPaymentRequest[];
  nameFor: (id: string) => string;
  onReload: () => Promise<void>;
  onNotice: (message: string) => void;
}) {
  const [busy, setBusy] = useState('');
  const decide = async (request: ContributorPaymentRequest, action: 'approve' | 'reject' | 'paid') => {
    const note = action === 'reject' ? window.prompt('Reason for rejecting this request') ?? ''
      : window.prompt(action === 'paid' ? 'Optional payment note' : 'Optional approval note') ?? '';
    if (action === 'reject' && !note.trim()) return;
    const paymentReference = action === 'paid' ? window.prompt('Enter the bank or MoMo payment reference') ?? '' : '';
    if (action === 'paid' && !paymentReference.trim()) return;
    setBusy(request.id);
    try {
      await decideContributorPayment(request.id, action, note, paymentReference);
      onNotice(action === 'paid' ? 'Payment marked as paid.' : `Payment request ${action === 'approve' ? 'approved' : 'rejected'}.`);
      await onReload();
    } catch (reason) { onNotice(reason instanceof Error ? reason.message : 'The payment request could not be updated.'); } finally { setBusy(''); }
  };
  return (
    <Panel>
      <PageHeader kicker="Contributor requests" title="Payment requests" body="Requests are only accepted against verified details. Approve valid requests, reject with a reason, and record the reference once paid." />
      {requests.length ? (
        <div className="admin-payment-list">
          {requests.map((request) => {
            const snapshot: Record<string, string> = { ...(request.bankSnapshot ?? {}), ...(request.payoutSnapshot ?? {}) };
            return (
              <article key={request.id}>
                <div>
                  <strong>{nameFor(request.contributorId)} · {new Intl.NumberFormat(undefined, { style: 'currency', currency: request.currency }).format(request.amountMinor / 100)}</strong>
                  <small>{dateTime(request.createdAt)} · {request.description}</small>
                  <p>{request.payoutMethod === 'momo'
                    ? <>{snapshot.registeredName} · MoMo <code>{snapshot.walletNumber}</code></>
                    : <>{snapshot.accountName}<br />{snapshot.bankName} · <code>{snapshot.accountNumber}</code></>}</p>
                  {request.adminNote ? <p>{request.adminNote}</p> : null}
                  {request.paymentReference ? <p>Reference: <code>{request.paymentReference}</code></p> : null}
                </div>
                <div>
                  <StatusPill tone={toneForStatus(request.status)}>{request.status}</StatusPill>
                  {request.status === 'submitted' ? <><button type="button" className="button--primary" disabled={busy === request.id} onClick={() => void decide(request, 'approve')}>Approve</button><button type="button" className="danger" disabled={busy === request.id} onClick={() => void decide(request, 'reject')}>Reject</button></> : null}
                  {request.status === 'approved' ? <button type="button" className="button--primary" disabled={busy === request.id} onClick={() => void decide(request, 'paid')}>Mark paid</button> : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : <p className="muted">No payment requests yet.</p>}
    </Panel>
  );
}
