import { useRef, useState, type FormEvent } from 'react';
import { Card, ErrorNote, Icon, Notice, Skeleton, VerificationChip, cx, useNow } from '../components';
import { formatBytes, formatDate, formatDateTime, friendlyError, type FriendlyError } from '../model';
import { MOMO_NETWORKS, type BankView, type CheckState, type FieldOutcome, type MomoChallengeView, type MomoNetwork, type MomoView, type PaymentsView, type PayoutMethod } from '../types';
import { PortalLink, useShared, useWorkspace } from '../workspace';

/**
 * Payment details and their verification.
 *
 * What each status proves is said in words next to it, because the two
 * methods prove different things: a bank account is verified by a finance
 * reviewer against a statement; a MoMo code proves control of a phone number
 * and nothing more, so the wallet's ownership and registered name are a
 * separate status a finance reviewer decides. Full numbers are never shown
 * back after saving — the server only returns them masked.
 */

const GHANA_BANKS = [
  'Absa Bank Ghana', 'Access Bank Ghana', 'Agricultural Development Bank (ADB)', 'ARB Apex Bank', 'Bank of Africa Ghana',
  'CalBank', 'Consolidated Bank Ghana (CBG)', 'Ecobank Ghana', 'FBNBank Ghana', 'Fidelity Bank Ghana', 'First Atlantic Bank',
  'First National Bank Ghana', 'GCB Bank', 'Guaranty Trust Bank (GTBank) Ghana', 'National Investment Bank (NIB)', 'OmniBSIC Bank',
  'Prudential Bank', 'Republic Bank Ghana', 'Société Générale Ghana', 'Stanbic Bank Ghana', 'Standard Chartered Bank Ghana',
  'United Bank for Africa (UBA) Ghana', 'Universal Merchant Bank (UMB)', 'Zenith Bank Ghana',
];

export function PaymentsPanel() {
  const { payments } = useShared();
  if (payments.state === 'loading' && !payments.value) return <Card><Skeleton lines={6} label="Loading payment details" /></Card>;
  if (!payments.value) {
    return (
      <div className="cw-stack">
        <ErrorNote title="Payment details could not be loaded" error={payments.error ?? { message: 'Try again in a moment.', reference: null, code: '' }} onRetry={payments.refresh} />
        <Card title="Your details are safe">
          <p className="cw-muted">Nothing has been changed. Payment details are stored on the server, not in this browser, and are only shown here once the payment service responds.</p>
        </Card>
      </div>
    );
  }
  return <PaymentDetails view={payments.value} onChange={payments.set} />;
}

function PaymentDetails({ view, onChange }: { view: PaymentsView; onChange: (next: PaymentsView) => void }) {
  const data = useWorkspace();
  const [preferredBusy, setPreferredBusy] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);
  const bankReady = view.bank?.status === 'verified';
  const momoReady = view.momo?.ownershipStatus === 'verified';
  const choosePreferred = async (method: PayoutMethod) => {
    setPreferredBusy(true); setError(null);
    try { onChange(await data.services.setPreferred(method)); } catch (reason) { setError(friendlyError(reason, 'Saving your payment choice')); } finally { setPreferredBusy(false); }
  };
  return (
    <div className="cw-stack">
      <Card title="Where payments are sent" meta="Payments go only to details a finance reviewer has verified.">
        <div className={cx('cw-readiness', view.payoutReady ? 'is-ready' : 'is-not-ready')}>
          <Icon name={view.payoutReady ? 'shield' : 'clock'} />
          <div>
            <strong>{view.payoutReady ? 'Ready to receive payments' : 'Not ready for payments yet'}</strong>
            <p>{view.payoutReady
              ? `Payments will be sent to your ${view.preferredMethod === 'momo' && momoReady ? 'MoMo wallet' : bankReady ? 'bank account' : 'MoMo wallet'}.`
              : 'Add a bank account or MoMo wallet below. It can be used once a finance reviewer verifies it.'}</p>
          </div>
        </div>
        {view.bank && view.momo ? (
          <fieldset className="cw-choice-group cw-choice-group--inline" disabled={preferredBusy}>
            <legend className="cw-field-label">Pay me by</legend>
            {(['bank', 'momo'] as const).map((method) => (
              <label key={method} className={cx('cw-choice', view.preferredMethod === method && 'is-selected')}>
                <input type="radio" name="preferred" checked={view.preferredMethod === method} onChange={() => void choosePreferred(method)} />
                <span><strong>{method === 'bank' ? 'Bank account' : 'MoMo wallet'}</strong><small>{(method === 'bank' ? bankReady : momoReady) ? 'Verified' : 'Not verified yet'}</small></span>
              </label>
            ))}
          </fieldset>
        ) : null}
        {error ? <ErrorNote error={error} /> : null}
        <p className="cw-muted">Rates and payment schedules are not published in this workspace yet. <PortalLink to={data.paths.section('guide', { section: 'payments' })} className="cw-text-link">Payment details and eligibility</PortalLink></p>
      </Card>
      <BankSection bank={view.bank} checkMode={view.statementCheck} onChange={onChange} />
      <MomoSection momo={view.momo} challenge={view.momoChallenge} onChange={onChange} />
      {view.history.length ? <HistoryCard history={view.history} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bank
// ---------------------------------------------------------------------------

const OUTCOME: Record<FieldOutcome, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral'; mark: string }> = {
  match: { label: 'matches', tone: 'success', mark: '✓' },
  partial: { label: 'partly visible, consistent', tone: 'neutral', mark: '~' },
  mismatch: { label: 'does not match', tone: 'danger', mark: '✕' },
  not_found: { label: 'not found on the statement', tone: 'warning', mark: '?' },
};

const CHECK_TEXT: Record<CheckState, { tone: 'info' | 'success' | 'warning' | 'neutral'; text: string }> = {
  off: { tone: 'neutral', text: 'Automated statement checks are off. A finance reviewer reads your statement.' },
  not_run: { tone: 'neutral', text: 'The automated statement check has not run yet. A finance reviewer will read your statement either way.' },
  consistent: { tone: 'success', text: 'The name, bank and account number on your statement agree with what you entered. This is not a verification: a finance reviewer still decides.' },
  mismatch: { tone: 'warning', text: 'Something on your statement does not agree with what you entered. Check your details below, or upload a clearer statement. A finance reviewer will also look.' },
  uncertain: { tone: 'info', text: 'Some details could not be confirmed from the statement. A finance reviewer will check them.' },
  unreadable: { tone: 'warning', text: 'Account details could not be read from this file. Upload a clearer PDF or photo of the page showing your name, bank and account number.' },
  unavailable: { tone: 'neutral', text: 'The automated check could not run this time. A finance reviewer will read your statement.' },
};

function statusExplanation(bank: BankView): string {
  if (bank.legacy && !bank.statement) return 'Saved before statements were required. Upload a statement so a finance reviewer can complete verification.';
  switch (bank.status) {
    case 'pending': return 'A finance reviewer will compare your statement with these details. You will be told the outcome.';
    case 'verified': return `Verified by a finance reviewer${bank.decidedAt ? ` on ${formatDate(bank.decidedAt, true)}` : ''}. Payments can be sent to this account.`;
    case 'needs_action': return 'A finance reviewer needs something from you before this account can be verified.';
    case 'rejected': return 'A finance reviewer could not verify these details. You can submit corrected details with a new statement.';
    default: return '';
  }
}

function BankSection({ bank, checkMode, onChange }: { bank: BankView | null; checkMode: 'enabled' | 'off'; onChange: (next: PaymentsView) => void }) {
  const data = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);
  const remove = async () => {
    setBusy(true); setError(null);
    try { onChange(await data.services.removeMethod('bank')); setConfirmRemove(false); } catch (reason) { setError(friendlyError(reason, 'Removing your bank details')); } finally { setBusy(false); }
  };
  const status = bank ? bank.status : 'not_started';
  return (
    <Card
      className="cw-method"
      title={<><Icon name="bank" />Bank account</>}
      actions={<VerificationChip status={status} label={bank?.legacy && !bank.statement ? 'Statement needed' : undefined} />}
    >
      {error ? <ErrorNote error={error} /> : null}
      {!bank || editing ? (
        <BankForm current={bank} checkMode={checkMode} onCancel={bank ? () => setEditing(false) : undefined} onSaved={(next) => { onChange(next); setEditing(false); }} />
      ) : (
        <>
          <p className="cw-method__status">{statusExplanation(bank)}</p>
          {(bank.status === 'needs_action' || bank.status === 'rejected') && (bank.statusReason || bank.nextStep) ? (
            <Notice tone={bank.status === 'rejected' ? 'danger' : 'warning'} title={bank.status === 'rejected' ? 'Why it was rejected' : 'What the reviewer needs'} role="status">
              {bank.statusReason ? <p>{bank.statusReason}</p> : null}
              {bank.nextStep ? <p><strong>Next step:</strong> {bank.nextStep}</p> : null}
            </Notice>
          ) : null}
          <dl className="cw-facts">
            <div><dt>Bank</dt><dd>{bank.bankName}{bank.branch ? ` · ${bank.branch}` : ''}</dd></div>
            <div><dt>Account holder</dt><dd>{bank.accountName}</dd></div>
            <div><dt>Account number</dt><dd><span className="cw-masked">{bank.accountNumberMasked}</span></dd></div>
            <div><dt>Statement</dt><dd>{bank.statement ? `${bank.statement.contentType === 'application/pdf' ? 'PDF' : 'Image'} · ${formatBytes(bank.statement.sizeBytes)} · uploaded ${formatDate(bank.statement.uploadedAt, true)}` : 'None on file'}</dd></div>
            <div><dt>Submitted</dt><dd>{bank.submittedAt ? formatDateTime(bank.submittedAt) : '—'}</dd></div>
          </dl>
          {bank.status !== 'verified' || bank.automatedCheck.state !== 'off' ? <CheckSummary check={bank.automatedCheck} /> : null}
          {confirmRemove ? (
            <Notice tone="warning" title="Remove your bank details?" action={<div className="cw-inline-actions"><button type="button" onClick={() => setConfirmRemove(false)} disabled={busy}>Keep them</button><button type="button" className="danger" onClick={() => void remove()} disabled={busy}>{busy ? 'Removing…' : 'Remove'}</button></div>}>
              <p>The details and your statement are deleted. Payments cannot go to this account until you add it again and it is verified.</p>
            </Notice>
          ) : (
            <div className="cw-inline-actions">
              <button type="button" className={bank.status === 'verified' ? '' : 'button--primary'} onClick={() => setEditing(true)}>
                {bank.status === 'verified' ? 'Change details' : bank.legacy && !bank.statement ? 'Upload a statement' : 'Update details or statement'}
              </button>
              <button type="button" className="cw-link-button" onClick={() => setConfirmRemove(true)}>Remove</button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function CheckSummary({ check }: { check: BankView['automatedCheck'] }) {
  const meta = CHECK_TEXT[check.state];
  return (
    <div className={cx('cw-check-summary', `cw-check-summary--${meta.tone}`)}>
      <strong>Automated statement check</strong>
      <p>{meta.text}</p>
      {check.fields ? (
        <ul>
          {(['accountName', 'bankName', 'accountNumber'] as const).map((key) => (
            <li key={key} className={`is-${OUTCOME[check.fields![key]].tone}`}>
              <span aria-hidden="true">{OUTCOME[check.fields![key]].mark}</span>
              {key === 'accountName' ? 'Account holder name' : key === 'bankName' ? 'Bank' : 'Account number'} {OUTCOME[check.fields![key]].label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function BankForm({ current, checkMode, onCancel, onSaved }: {
  current: BankView | null;
  checkMode: 'enabled' | 'off';
  onCancel?: () => void;
  onSaved: (next: PaymentsView) => void;
}) {
  const data = useWorkspace();
  const [bankName, setBankName] = useState(current?.bankName ?? '');
  const [accountName, setAccountName] = useState(current?.accountName ?? '');
  const [accountNumber, setAccountNumber] = useState('');
  const [branch, setBranch] = useState(current?.branch ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'submitting'>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [touched, setTouched] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const cleanNumber = accountNumber.replace(/[\s-]/g, '');
  const problems = {
    bankName: bankName.trim().length < 2 ? 'Enter your bank’s name.' : '',
    accountName: accountName.trim().length < 2 ? 'Enter the name on the account, exactly as the bank has it.' : '',
    accountNumber: !/^[A-Za-z0-9]{6,34}$/.test(cleanNumber) ? 'Enter the account number: 6 to 34 letters or digits.' : '',
    file: !file ? 'Choose your statement.' : !['application/pdf', 'image/jpeg', 'image/png'].includes(file.type) ? 'Choose a PDF, JPEG or PNG file.'
      : file.size > 10 * 1024 * 1024 ? 'That file is larger than 10 MB.' : file.size < 1024 ? 'That file is too small to be a statement.' : '',
  };
  const invalid = Object.values(problems).some(Boolean);
  const busy = phase !== 'idle';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (invalid || busy || !file) return;
    setError(null);
    try {
      setPhase('uploading');
      setProgress(0);
      const statement = await data.services.uploadStatement(file, setProgress);
      setPhase('submitting');
      onSaved(await data.services.submitBank({ bankName: bankName.trim(), accountName: accountName.trim(), accountNumber: cleanNumber, branch: branch.trim(), statement }));
    } catch (reason) {
      setError(friendlyError(reason, 'Submitting your bank details'));
    } finally {
      setPhase('idle');
    }
  };
  const show = (key: keyof typeof problems) => (touched && problems[key] ? problems[key] : '');
  return (
    <form className="cw-form" onSubmit={(event) => void submit(event)} noValidate>
      {current?.status === 'verified' ? (
        <Notice tone="warning" title="Changing verified details restarts verification">
          <p>Your current account stays on record, but new details cannot be used for payment until a finance reviewer verifies them. A new statement is required.</p>
        </Notice>
      ) : null}
      {error ? <ErrorNote error={error} /> : null}
      <div className="cw-form-grid">
        <label className="cw-field">
          <span className="cw-field-label">Bank name</span>
          <input list="ghana-banks" value={bankName} maxLength={120} autoComplete="off" aria-invalid={Boolean(show('bankName'))} onChange={(event) => setBankName(event.target.value)} />
          <datalist id="ghana-banks">{GHANA_BANKS.map((name) => <option key={name} value={name} />)}</datalist>
          {show('bankName') ? <small className="cw-text-danger">{show('bankName')}</small> : <small>Choose from the list or type a rural or community bank.</small>}
        </label>
        <label className="cw-field">
          <span className="cw-field-label">Branch <small>(optional)</small></span>
          <input value={branch} maxLength={160} autoComplete="off" onChange={(event) => setBranch(event.target.value)} />
        </label>
        <label className="cw-field">
          <span className="cw-field-label">Account holder name</span>
          <input value={accountName} maxLength={160} autoComplete="name" aria-invalid={Boolean(show('accountName'))} onChange={(event) => setAccountName(event.target.value)} />
          <small className={show('accountName') ? 'cw-text-danger' : undefined}>{show('accountName') || 'Exactly as it appears on your statement.'}</small>
        </label>
        <label className="cw-field">
          <span className="cw-field-label">Account number</span>
          <input value={accountNumber} maxLength={60} inputMode="numeric" autoComplete="off" spellCheck={false} aria-invalid={Boolean(show('accountNumber'))} placeholder={current ? `Re-enter it (currently ${current.accountNumberMasked})` : ''} onChange={(event) => setAccountNumber(event.target.value)} />
          <small className={show('accountNumber') ? 'cw-text-danger' : undefined}>{show('accountNumber') || 'Shown masked after you save.'}</small>
        </label>
      </div>

      <div className="cw-upload">
        <div className="cw-upload__copy">
          <span className="cw-field-label">Bank statement or bank letter</span>
          <p>A recent statement, or a letter from your bank, showing <strong>your name, the bank and the account number</strong>. You may cover transactions and balances — they are not needed.</p>
          <ul className="cw-upload__facts">
            <li><strong>Why:</strong> so a finance reviewer can confirm the account is yours before any payment is sent.</li>
            <li><strong>Who sees it:</strong> only authorised finance reviewers, through a link that expires after five minutes. Every opening is recorded.</li>
            <li><strong>Automated check:</strong> {checkMode === 'enabled' ? 'the name, bank and account number on it are compared with what you typed. It never approves anything by itself.' : 'off. A person reads it.'}</li>
            <li><strong>Accepted:</strong> PDF, JPEG or PNG, up to 10 MB.</li>
          </ul>
        </div>
        <div className="cw-upload__picker">
          <input ref={fileInput} id="statement-file" type="file" className="cw-sr" tabIndex={-1} aria-hidden="true" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" onChange={(event) => { setFile(event.target.files?.[0] ?? null); }} />
          <button type="button" onClick={() => fileInput.current?.click()} disabled={busy}><Icon name="upload" />{file ? 'Choose a different file' : 'Choose file'}</button>
          <span className="cw-upload__file" aria-live="polite">{file ? `${file.name} · ${formatBytes(file.size)}` : 'No file chosen'}</span>
          {show('file') ? <small className="cw-text-danger">{show('file')}</small> : null}
        </div>
      </div>

      {phase !== 'idle' ? (
        <div className="cw-progress-line" role="status">
          <span>{phase === 'uploading' ? `Uploading statement… ${Math.round(progress * 100)}%` : checkMode === 'enabled' ? 'Submitting and running the automated check…' : 'Submitting…'}</span>
          <progress max={1} value={phase === 'uploading' ? progress : undefined} />
        </div>
      ) : null}
      <div className="cw-form__actions">
        {onCancel ? <button type="button" onClick={onCancel} disabled={busy}>Cancel</button> : null}
        <button type="submit" className="button--primary" disabled={busy}>{busy ? 'Working…' : 'Submit for verification'}</button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// MoMo
// ---------------------------------------------------------------------------

function ownershipExplanation(momo: MomoView): string {
  switch (momo.ownershipStatus) {
    case 'pending': return `A finance reviewer confirms the wallet is registered to “${momo.registeredName}”. A code sent to the phone cannot prove that, so it is checked separately.`;
    case 'verified': return `Confirmed by a finance reviewer${momo.decidedAt ? ` on ${formatDate(momo.decidedAt, true)}` : ''}. Payments can be sent to this wallet.`;
    case 'needs_action': return 'A finance reviewer needs something from you before this wallet can be used.';
    case 'rejected': return 'A finance reviewer could not confirm this wallet. You can verify a different number or correct the registered name.';
    default: return '';
  }
}

function MomoSection({ momo, challenge, onChange }: { momo: MomoView | null; challenge: MomoChallengeView | null; onChange: (next: PaymentsView) => void }) {
  const data = useWorkspace();
  const [changing, setChanging] = useState(false);
  const [pending, setPending] = useState<{ network: MomoNetwork; walletNumber: string; registeredName: string } | null>(null);
  const [code, setCode] = useState<MomoChallengeView | null>(challenge);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);
  const status = momo ? momo.ownershipStatus : code ? 'pending' : 'not_started';
  const remove = async () => {
    setBusy(true); setError(null);
    try { onChange(await data.services.removeMethod('momo')); setConfirmRemove(false); } catch (reason) { setError(friendlyError(reason, 'Removing your MoMo wallet')); } finally { setBusy(false); }
  };
  const showForm = (!momo || changing) && !code;
  return (
    <Card
      className="cw-method"
      title={<><Icon name="phone" />MoMo wallet</>}
      actions={<VerificationChip status={status} label={code && !momo ? 'Code sent' : undefined} />}
    >
      {error ? <ErrorNote error={error} /> : null}
      {code ? (
        <CodeEntry
          challenge={code}
          pending={pending}
          onVerified={(next) => { onChange(next); setCode(null); setPending(null); setChanging(false); }}
          onRestart={() => { setCode(null); setChanging(true); }}
          onResent={(next) => setCode(next)}
        />
      ) : showForm ? (
        <MomoForm
          current={momo}
          onCancel={momo ? () => setChanging(false) : undefined}
          onSent={(details, next) => { setPending(details); setCode(next); }}
        />
      ) : momo ? (
        <>
          <dl className="cw-facts">
            <div><dt>Network</dt><dd>{momo.networkLabel}</dd></div>
            <div><dt>Wallet number</dt><dd><span className="cw-masked">{momo.walletNumberMasked}</span></dd></div>
            <div><dt>Registered name</dt><dd>{momo.registeredName}</dd></div>
          </dl>
          <ul className="cw-proof">
            <li className="is-verified">
              <Icon name="check" />
              <div><strong>Phone number control — verified</strong><p>Confirmed with a one-time code on {formatDate(momo.phoneVerifiedAt, true)}. This proves you control the number.</p></div>
            </li>
            <li className={`is-${momo.ownershipStatus}`}>
              <Icon name={momo.ownershipStatus === 'verified' ? 'check' : momo.ownershipStatus === 'pending' ? 'clock' : 'alert'} />
              <div><strong>Wallet ownership and registered name — <VerificationChip status={momo.ownershipStatus} /></strong><p>{ownershipExplanation(momo)}</p></div>
            </li>
          </ul>
          {(momo.ownershipStatus === 'needs_action' || momo.ownershipStatus === 'rejected') && (momo.statusReason || momo.nextStep) ? (
            <Notice tone={momo.ownershipStatus === 'rejected' ? 'danger' : 'warning'} title={momo.ownershipStatus === 'rejected' ? 'Why it was rejected' : 'What the reviewer needs'} role="status">
              {momo.statusReason ? <p>{momo.statusReason}</p> : null}
              {momo.nextStep ? <p><strong>Next step:</strong> {momo.nextStep}</p> : null}
            </Notice>
          ) : null}
          {confirmRemove ? (
            <Notice tone="warning" title="Remove this MoMo wallet?" action={<div className="cw-inline-actions"><button type="button" onClick={() => setConfirmRemove(false)} disabled={busy}>Keep it</button><button type="button" className="danger" onClick={() => void remove()} disabled={busy}>{busy ? 'Removing…' : 'Remove'}</button></div>}>
              <p>Payments cannot go to this wallet until you verify it again.</p>
            </Notice>
          ) : (
            <div className="cw-inline-actions">
              <button type="button" onClick={() => setChanging(true)}>Use a different number</button>
              <button type="button" className="cw-link-button" onClick={() => setConfirmRemove(true)}>Remove</button>
            </div>
          )}
        </>
      ) : null}
    </Card>
  );
}

function MomoForm({ current, onCancel, onSent }: {
  current: MomoView | null;
  onCancel?: () => void;
  onSent: (details: { network: MomoNetwork; walletNumber: string; registeredName: string }, challenge: MomoChallengeView) => void;
}) {
  const data = useWorkspace();
  const [network, setNetwork] = useState<MomoNetwork>(current?.network ?? 'mtn');
  const [walletNumber, setWalletNumber] = useState('');
  const [registeredName, setRegisteredName] = useState(current?.registeredName ?? '');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);
  const digits = walletNumber.replace(/\D/g, '');
  const numberProblem = !/^(0\d{9}|233\d{9}|\d{9})$/.test(digits) ? 'Enter a Ghana mobile number, such as 024 123 4567.' : '';
  const nameProblem = registeredName.trim().length < 2 ? 'Enter the name exactly as your MoMo account shows it.' : '';
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (numberProblem || nameProblem || busy) return;
    setBusy(true); setError(null);
    const details = { network, walletNumber: walletNumber.trim(), registeredName: registeredName.trim() };
    try {
      const sent = await data.services.startMomo(details);
      onSent(details, { network, walletNumberMasked: sent.walletNumberMasked, registeredName: details.registeredName, expiresAt: sent.expiresAt, resendAvailableAt: sent.resendAvailableAt, attemptsLeft: sent.attemptsLeft });
    } catch (reason) {
      setError(friendlyError(reason, 'Sending your verification code'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="cw-form" onSubmit={(event) => void submit(event)} noValidate>
      {current ? (
        <Notice tone="warning" title="A new number needs verifying again">
          <p>Your current wallet stays in place until the new number is confirmed. Once confirmed, the new wallet waits for a finance reviewer before it can be used.</p>
        </Notice>
      ) : null}
      {error ? <ErrorNote error={error} /> : null}
      <div className="cw-form-grid">
        <label className="cw-field">
          <span className="cw-field-label">Network</span>
          <select value={network} onChange={(event) => setNetwork(event.target.value as MomoNetwork)}>
            {(Object.keys(MOMO_NETWORKS) as MomoNetwork[]).map((key) => <option key={key} value={key}>{MOMO_NETWORKS[key]}</option>)}
          </select>
        </label>
        <label className="cw-field">
          <span className="cw-field-label">Wallet number</span>
          <input type="tel" inputMode="tel" autoComplete="tel-national" value={walletNumber} maxLength={20} placeholder="024 123 4567" aria-invalid={Boolean(touched && numberProblem)} onChange={(event) => setWalletNumber(event.target.value)} />
          <small className={touched && numberProblem ? 'cw-text-danger' : undefined}>{touched && numberProblem ? numberProblem : 'A Ghana number that can receive SMS.'}</small>
        </label>
        <label className="cw-field cw-field--wide">
          <span className="cw-field-label">Registered name on the wallet</span>
          <input value={registeredName} maxLength={120} autoComplete="name" aria-invalid={Boolean(touched && nameProblem)} onChange={(event) => setRegisteredName(event.target.value)} />
          <small className={touched && nameProblem ? 'cw-text-danger' : undefined}>{touched && nameProblem ? nameProblem : 'Exactly as your MoMo account shows it — a finance reviewer checks it.'}</small>
        </label>
      </div>
      <p className="cw-muted">We will text a six-digit code to this number from “Indigen”. It expires after 10 minutes. We never ask for this code by phone.</p>
      <div className="cw-form__actions">
        {onCancel ? <button type="button" onClick={onCancel} disabled={busy}>Cancel</button> : null}
        <button type="submit" className="button--primary" disabled={busy}>{busy ? 'Sending…' : 'Send code'}</button>
      </div>
    </form>
  );
}

function clock(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function CodeEntry({ challenge, pending, onVerified, onRestart, onResent }: {
  challenge: MomoChallengeView;
  pending: { network: MomoNetwork; walletNumber: string; registeredName: string } | null;
  onVerified: (next: PaymentsView) => void;
  onRestart: () => void;
  onResent: (next: MomoChallengeView) => void;
}) {
  const data = useWorkspace();
  const now = useNow(1000);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [notice, setNotice] = useState('');
  const expiresIn = new Date(challenge.expiresAt).getTime() - now;
  const resendIn = new Date(challenge.resendAvailableAt).getTime() - now;
  const expired = expiresIn <= 0;
  const confirm = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || code.length !== 6 || expired) return;
    setBusy(true); setError(null); setNotice('');
    try {
      onVerified(await data.services.confirmMomo(code));
    } catch (reason) {
      const friendly = friendlyError(reason, 'Checking your code');
      setError(friendly);
      if (/expired|no tries|Too many|no code/i.test(friendly.message)) setCode('');
    } finally {
      setBusy(false);
    }
  };
  const resend = async () => {
    if (!pending) return;
    setBusy(true); setError(null); setNotice('');
    try {
      const sent = await data.services.startMomo(pending);
      onResent({ ...challenge, walletNumberMasked: sent.walletNumberMasked, expiresAt: sent.expiresAt, resendAvailableAt: sent.resendAvailableAt, attemptsLeft: sent.attemptsLeft });
      setCode('');
      setNotice('A new code is on its way. Earlier codes no longer work.');
    } catch (reason) {
      setError(friendlyError(reason, 'Sending a new code'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="cw-form cw-code" onSubmit={(event) => void confirm(event)}>
      <p>We sent a six-digit code to <strong className="cw-masked">{challenge.walletNumberMasked}</strong> ({MOMO_NETWORKS[challenge.network]}). The SMS provider accepted it for delivery; it usually arrives within a minute.</p>
      {error ? <ErrorNote error={error} /> : null}
      {notice ? <Notice tone="success" role="status">{notice}</Notice> : null}
      <label className="cw-field cw-code__field">
        <span className="cw-field-label">Verification code</span>
        <input
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          disabled={expired}
          aria-describedby="code-help"
          className="cw-code__input"
        />
        <small id="code-help" role="timer" aria-live="off">{expired ? 'This code has expired. Ask for a new one.' : `Expires in ${clock(expiresIn)}.`}</small>
      </label>
      <div className="cw-form__actions cw-form__actions--spread">
        <div className="cw-inline-actions">
          {pending ? (
            <button type="button" className="cw-link-button" disabled={busy || resendIn > 0} onClick={() => void resend()}>
              {resendIn > 0 ? `Resend code in ${clock(resendIn)}` : 'Resend code'}
            </button>
          ) : null}
          <button type="button" className="cw-link-button" disabled={busy} onClick={onRestart}>{pending ? 'Use a different number' : 'Start again'}</button>
        </div>
        <button type="submit" className="button--primary" disabled={busy || code.length !== 6 || expired}>{busy ? 'Checking…' : 'Confirm code'}</button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

const ACTIONS: Record<string, string> = {
  'bank.submitted': 'Bank details submitted for review',
  'bank.resubmitted_after_verification': 'Verified bank details changed — review restarted',
  'bank.automated_check': 'Automated statement check ran',
  'bank.verify': 'Bank account verified',
  'bank.needs_action': 'Bank account needs action',
  'bank.reject': 'Bank account rejected',
  'bank.removed': 'Bank details removed',
  'momo.phone_verified': 'MoMo number confirmed by code',
  'momo.phone_reconfirmed': 'MoMo number confirmed again',
  'momo.verify': 'MoMo wallet verified',
  'momo.needs_action': 'MoMo wallet needs action',
  'momo.reject': 'MoMo wallet rejected',
  'momo.removed': 'MoMo wallet removed',
};

function HistoryCard({ history }: { history: PaymentsView['history'] }) {
  return (
    <Card title="Verification history" meta="Every change to your payment details and every decision on them.">
      <ol className="cw-history">
        {history.slice(0, 12).map((event, index) => (
          <li key={`${event.at}-${index}`}>
            <time dateTime={event.at}>{formatDateTime(event.at)}</time>
            <div>
              <strong>{ACTIONS[event.action] ?? event.action}</strong>
              {event.note ? <p>{event.note}</p> : null}
              <small>{event.actor === 'finance' ? 'Finance reviewer' : event.actor === 'system' ? 'Automated' : 'You'}</small>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
