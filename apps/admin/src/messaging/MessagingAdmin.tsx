import { useCallback, useEffect, useMemo, useState } from 'react';
import { BrandMark } from '../../../tribestudio/src/ui/BrandMark';
import { useLeaveGuard } from '../router';
import { confirmAction } from '../ui/dialogs';
import { Icon } from '../ui/icons';
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  Field,
  LoadFailure,
  Notice,
  PageHeader,
  Skeleton,
  Toast,
  cx,
} from '../ui/primitives';
import {
  deleteSmsContactGroup,
  fetchSmsBalance,
  listSmsCampaigns,
  listSmsContactGroups,
  normalizeGhanaPhone,
  saveSmsContactGroup,
  sendSmsCampaign,
  sendTestSms,
  splitRecipients,
  type CampaignAudience,
  type CampaignSummary,
  type ContactGroup,
  type SmsBalance,
} from './data';
import './messaging.css';

/**
 * Messaging: compose an announcement (to pasted or saved numbers, or a
 * broadcast to every app user), schedule it, dry-run it in Arkesel's sandbox,
 * keep contact groups, read the history and send a single test. Every
 * privileged call goes through admin-only callables — the Arkesel key never
 * reaches the browser.
 */

type View = 'compose' | 'groups' | 'history' | 'test';

const COPY: Record<View, { title: string; description: string }> = {
  compose: { title: 'Messaging', description: 'Send announcements and manage your audience.' },
  groups: { title: 'Contact groups', description: 'Reusable lists of numbers for announcements.' },
  history: { title: 'Campaign history', description: 'Announcements sent, scheduled and dry-run.' },
  test: { title: 'Test SMS', description: 'Send one message to check the integration and sender ID.' },
};

export function MessagingAdmin({ view }: { view: View }) {
  return (
    <div className="ad-page messaging-admin">
      <PageHeader title={COPY[view].title} description={COPY[view].description} actions={<BalanceCard />} />
      {view === 'compose' ? <Compose /> : null}
      {view === 'groups' ? <ContactGroups /> : null}
      {view === 'history' ? <History /> : null}
      {view === 'test' ? <TestSms /> : null}
    </div>
  );
}

/* -- Balance ------------------------------------------------------------------------------ */

function useBalance() {
  const [balance, setBalance] = useState<SmsBalance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setBalance(await fetchSmsBalance()); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not load the SMS balance.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return { balance, error, loading, load };
}

function BalanceCard() {
  const { balance, error, loading, load } = useBalance();
  return (
    <div className="ad-balance" aria-live="polite">
      <span className="ad-balance__icon" aria-hidden="true"><Icon name="coins" /></span>
      <span className="ad-balance__copy">
        <span className="ad-balance__label">SMS balance</span>
        {loading ? <span className="ad-balance__value">…</span>
          : error ? <span className="ad-balance__error">Unavailable <button type="button" className="ts-link" onClick={() => void load()}>Retry</button></span>
            : <>
              <span className="ad-balance__value">{balance?.mainBalance ?? '—'}</span>
              <span className="ad-balance__sub">{balance?.smsBalance != null ? `${balance.smsBalance.toLocaleString('en-GB')} SMS units · ` : ''}Provided by Arkesel</span>
            </>}
      </span>
    </div>
  );
}

/* -- Segment counting ---------------------------------------------------------------------- */

// GSM-7 vs UCS-2, matching how Arkesel bills message parts.
const GSM7 = /^[A-Za-z0-9 \r\n@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/;
export function segments(message: string): { chars: number; parts: number; unicode: boolean } {
  const chars = message.length;
  if (chars === 0) return { chars: 0, parts: 0, unicode: false };
  const unicode = !GSM7.test(message);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  const parts = chars <= single ? 1 : Math.ceil(chars / multi);
  return { chars, parts, unicode };
}

function parseRecipients(raw: string) {
  const valid = new Set<string>();
  const invalid = new Set<string>();
  for (const token of splitRecipients(raw)) {
    const number = normalizeGhanaPhone(token);
    if (number) valid.add(number);
    else invalid.add(token);
  }
  return { valid: [...valid], invalid: [...invalid] };
}

function ghanaTime(local: string): string {
  if (!local) return '';
  const [date, time] = local.split('T');
  const [year, month, day] = date.split('-').map(Number);
  return `${new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })} at ${time} (Ghana time)`;
}

/* -- Compose ---------------------------------------------------------------------------------- */

function Compose() {
  const [audience, setAudience] = useState<CampaignAudience>('numbers');
  const [recipients, setRecipients] = useState('');
  const [message, setMessage] = useState('');
  const [timing, setTiming] = useState<'now' | 'schedule'>('now');
  const [scheduledAt, setScheduledAt] = useState('');
  const [sandbox, setSandbox] = useState(false);
  const [groups, setGroups] = useState<ContactGroup[] | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => { listSmsContactGroups().then(setGroups, () => setGroups([])); }, []);
  useLeaveGuard(Boolean(message.trim()) && !sending, 'Your announcement has not been sent. Leave and lose it?');

  const parsed = useMemo(() => parseRecipients(recipients), [recipients]);
  const seg = segments(message);
  const broadcast = audience === 'all';
  const minDate = new Date(Date.now() + 5 * 60_000).toISOString().slice(0, 16);
  const problems = {
    recipients: !broadcast && parsed.valid.length === 0 ? 'Add at least one valid Ghana number.' : '',
    message: !message.trim() ? 'Write the announcement.' : '',
    schedule: timing === 'schedule' && !scheduledAt ? 'Choose when to send it.' : '',
  };
  const ready = !problems.recipients && !problems.message && !problems.schedule;
  const recipientLabel = broadcast ? 'All app users' : `${parsed.valid.length} ${parsed.valid.length === 1 ? 'recipient' : 'recipients'}`;

  const appendGroup = (id: string) => {
    const group = groups?.find((item) => item.id === id);
    if (!group) return;
    setRecipients((prev) => (prev.trim() ? `${prev.trim()}, ${group.numbers.join(', ')}` : group.numbers.join(', ')));
  };

  const send = async () => {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await sendSmsCampaign({
        audience,
        message: message.trim(),
        recipients: broadcast ? undefined : recipients,
        scheduledAt: timing === 'schedule' && scheduledAt ? scheduledAt : undefined,
        sandbox,
      });
      const verb = res.status === 'scheduled'
        ? `Scheduled for ${res.recipientCount} ${res.recipientCount === 1 ? 'recipient' : 'recipients'}`
        : res.status === 'partial'
          ? `Partly sent — ${res.sentCount} of ${res.recipientCount}`
          : res.status === 'failed'
            ? `Not delivered — 0 of ${res.recipientCount} accepted`
            : `Sent to ${res.sentCount} ${res.sentCount === 1 ? 'recipient' : 'recipients'}`;
      const skipped = res.invalid.length ? ` · ${res.invalid.length} skipped as invalid` : '';
      setToast(`${verb}${sandbox ? ' (sandbox — not delivered)' : ''}${skipped}.`);
      setReviewing(false);
      setMessage('');
      setTouched(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The announcement could not be sent. Nothing was sent.');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className="ad-desk ad-compose">
        <form className="ad-card-box" aria-labelledby="compose-title" noValidate onSubmit={(event) => { event.preventDefault(); setTouched(true); if (ready) setReviewing(true); }}>
          <div className="ad-card-box__head"><h2 id="compose-title">New announcement</h2></div>
          <div className="ad-card-box__body ts-stack">
            <fieldset className="ad-fieldset">
              <legend className="ts-label">Audience</legend>
              <div className="ad-choice-row" role="radiogroup" aria-label="Audience">
                {([['numbers', 'Specific numbers', 'users'], ['all', 'All app users', 'globe']] as const).map(([value, label, icon]) => (
                  <label key={value} className={cx('ad-choice', audience === value && 'is-selected')}>
                    <input type="radio" name="audience" value={value} checked={audience === value} onChange={() => setAudience(value)} />
                    <Icon name={icon} /><span>{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            {broadcast ? (
              <Notice tone="warning">Every app user with a phone number (Firebase accounts and creator profile contacts) is resolved when you send. The exact count is reported afterwards.</Notice>
            ) : (
              <>
                {groups && groups.length ? (
                  <Field label="Load a contact group" optional>
                    <select className="ts-select" value="" onChange={(event) => { if (event.target.value) appendGroup(event.target.value); }}>
                      <option value="">Choose a group…</option>
                      {groups.map((group) => <option key={group.id} value={group.id}>{group.name} ({group.count})</option>)}
                    </select>
                  </Field>
                ) : null}
                <Field label="Recipients" required hint="Ghana numbers separated by commas, spaces or new lines — 0244 000 000 or 233244000000."
                  error={touched ? problems.recipients : undefined}>
                  <textarea className="ts-textarea" rows={3} value={recipients} onChange={(event) => setRecipients(event.target.value)} placeholder="0557535673, 0244000000" />
                </Field>
                <p className="ad-summary-line">
                  <Badge tone="success">{parsed.valid.length} valid</Badge>
                  {parsed.invalid.length ? <Badge tone="danger" title={parsed.invalid.join(', ')}>{parsed.invalid.length} invalid — skipped</Badge> : null}
                </p>
              </>
            )}
            <Field label="Message" required error={touched ? problems.message : undefined}
              counter={`${seg.chars} characters · ${seg.parts} SMS${seg.parts === 1 ? '' : ' parts'}${seg.unicode ? ' · unicode' : ''}`}>
              <textarea className="ts-textarea" rows={4} maxLength={900} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Type the announcement…" />
            </Field>
            <fieldset className="ad-fieldset">
              <legend className="ts-label">Delivery</legend>
              <div className="ad-choice-row">
                <label className={cx('ad-choice', timing === 'now' && 'is-selected')}>
                  <input type="radio" name="timing" checked={timing === 'now'} onChange={() => setTiming('now')} /><span>Send now</span>
                </label>
                <label className={cx('ad-choice', timing === 'schedule' && 'is-selected')}>
                  <input type="radio" name="timing" checked={timing === 'schedule'} onChange={() => setTiming('schedule')} /><span>Schedule</span>
                </label>
                <label className="ts-check ad-choice ad-choice--plain">
                  <input type="checkbox" checked={sandbox} onChange={(event) => setSandbox(event.target.checked)} />
                  <span className="ts-check__copy"><strong>Sandbox test</strong><small>Dry-run: not delivered or billed</small></span>
                </label>
              </div>
            </fieldset>
            {timing === 'schedule' ? (
              <Field label="Send at (Ghana time)" required error={touched ? problems.schedule : undefined} hint="Ghana is on GMT all year.">
                <input className="ts-input" type="datetime-local" min={minDate} value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />
              </Field>
            ) : null}
            {error ? <Notice tone="danger">{error}</Notice> : null}
            <div className="ad-detail__actions">
              <Button type="submit" variant="primary" iconRight="arrow">Review announcement</Button>
            </div>
          </div>
        </form>
        <aside className="ad-detail ad-preview" aria-labelledby="preview-title">
          <h2 id="preview-title">Message preview</h2>
          <div className="ad-phone" aria-hidden="true">
            <div className="ad-phone__bar"><span>9:41</span><span className="ad-phone__notch" /><span>SMS</span></div>
            <div className="ad-phone__sender"><BrandMark size="2.2rem" /><span>Indigen</span></div>
            <div className="ad-phone__thread">
              {message.trim() ? <p className="ad-phone__bubble">{message}</p> : <p className="ad-phone__empty">Your message appears here.</p>}
            </div>
          </div>
          <p className="sr-only" aria-live="polite">{message.trim() ? `Preview: ${message}` : ''}</p>
          <div className="ad-detail__section">
            <div className="ad-person">
              <span className="ad-notify__icon"><Icon name="users" /></span>
              <span><strong>{recipientLabel}</strong><small>{broadcast ? 'Resolved when sent' : 'Review the list before sending.'}</small></span>
            </div>
          </div>
        </aside>
      </div>
      {reviewing ? (
        <Dialog
          title={sandbox ? 'Review sandbox test' : timing === 'schedule' ? 'Review scheduled announcement' : 'Review announcement'}
          lede={sandbox ? 'Sandbox mode: Arkesel accepts the request but nothing is delivered or billed.' : 'Check everything below. A sent SMS cannot be recalled.'}
          busy={sending}
          onClose={() => setReviewing(false)}
          footer={<>
            <Button onClick={() => setReviewing(false)} disabled={sending}>Back to edit</Button>
            <Button variant="primary" icon="send" busy={sending} onClick={() => void send()}>
              {sandbox ? 'Run sandbox test' : timing === 'schedule' ? 'Schedule announcement' : broadcast ? 'Broadcast now' : 'Send now'}
            </Button>
          </>}
        >
          <dl className="ad-facts">
            <div className="ad-fact"><dt>Audience</dt><dd>{broadcast ? 'All app users with a phone number' : `${parsed.valid.length} Ghana ${parsed.valid.length === 1 ? 'number' : 'numbers'}${parsed.invalid.length ? ` (${parsed.invalid.length} invalid skipped)` : ''}`}</dd></div>
            <div className="ad-fact"><dt>Timing</dt><dd>{timing === 'schedule' ? ghanaTime(scheduledAt) : 'Immediately'}</dd></div>
            <div className="ad-fact"><dt>Length</dt><dd>{seg.chars} characters · {seg.parts} SMS {seg.parts === 1 ? 'part' : 'parts'} per recipient{seg.unicode ? ' (unicode)' : ''}</dd></div>
            <div className="ad-fact"><dt>Estimated SMS parts</dt><dd>{broadcast ? `${seg.parts} per user — the total depends on how many users are resolved` : `${(seg.parts * parsed.valid.length).toLocaleString('en-GB')} (${seg.parts} × ${parsed.valid.length})`}. The cost in cedis is set by your Arkesel plan.</dd></div>
            <div className="ad-fact"><dt>Message</dt><dd className="ad-prewrap ad-message-box">{message.trim()}</dd></div>
          </dl>
          {error ? <Notice tone="danger">{error}</Notice> : null}
        </Dialog>
      ) : null}
      {toast ? <Toast message={toast} onDone={() => setToast(null)} /> : null}
    </>
  );
}

/* -- Contact groups --------------------------------------------------------------------------- */

function ContactGroups() {
  const [groups, setGroups] = useState<ContactGroup[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [numbers, setNumbers] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try { setGroups(await listSmsContactGroups()); }
    catch (err) { setLoadError(err instanceof Error ? err.message : 'Could not load contact groups.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useLeaveGuard(Boolean(name.trim() || numbers.trim()) && !busy);

  const validCount = useMemo(() => parseRecipients(numbers).valid.length, [numbers]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await saveSmsContactGroup({ name: name.trim(), recipients: numbers });
      setToast(`Saved “${name.trim()}” with ${res.count} ${res.count === 1 ? 'number' : 'numbers'}${res.invalid.length ? ` · ${res.invalid.length} skipped` : ''}.`);
      setName('');
      setNumbers('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The group could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (group: ContactGroup) => {
    if (!(await confirmAction({ title: `Delete “${group.name}”?`, body: `${group.count} saved numbers. Announcements already sent are not affected.`, confirmLabel: 'Delete group', tone: 'danger' }))) return;
    setError(null);
    try { await deleteSmsContactGroup(group.id); setToast(`Deleted “${group.name}”.`); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'The group could not be deleted.'); }
  };

  return (
    <div className="ad-desk">
      <section className="ad-card-box" aria-labelledby="groups-title">
        <div className="ad-card-box__head"><h2 id="groups-title">Saved groups</h2><Button variant="ghost" icon="refresh" onClick={() => void load()}>Refresh</Button></div>
        {loadError ? <LoadFailure body={loadError} onRetry={() => void load()} /> : groups === null ? <div className="ad-card-box__body"><Skeleton lines={4} label="Loading groups" /></div> : groups.length ? (
          <div className="ad-table-scroll">
            <table className="ad-table ad-table--static">
              <thead><tr><th scope="col">Name</th><th scope="col">Numbers</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={group.id}>
                    <td><strong>{group.name}</strong></td>
                    <td className="ad-table__num">{group.count}</td>
                    <td className="ad-table__end"><Button size="sm" variant="danger-ghost" onClick={() => void remove(group)}>Delete</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState compact icon="users" title="No saved groups yet" body="Save a list here to load it into an announcement." />}
        {error ? <div className="ad-card-box__body"><Notice tone="danger">{error}</Notice></div> : null}
      </section>
      <form className="ad-detail" aria-labelledby="new-group" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <h2 id="new-group">New group</h2>
        <Field label="Group name" required><input className="ts-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Founding creators" /></Field>
        <Field label="Numbers" required hint="Separated by commas, spaces or new lines." counter={`${validCount} valid`}>
          <textarea className="ts-textarea" rows={5} value={numbers} onChange={(event) => setNumbers(event.target.value)} />
        </Field>
        <Button type="submit" variant="primary" busy={busy} disabled={!name.trim() || validCount === 0}>Save group</Button>
      </form>
      {toast ? <Toast message={toast} onDone={() => setToast(null)} /> : null}
    </div>
  );
}

/* -- History ------------------------------------------------------------------------------------ */

const STATUS: Record<string, { label: string; tone: 'success' | 'info' | 'warning' | 'danger' | 'neutral' }> = {
  sent: { label: 'Sent', tone: 'success' },
  scheduled: { label: 'Scheduled', tone: 'info' },
  partial: { label: 'Partly sent', tone: 'warning' },
  failed: { label: 'Failed', tone: 'danger' },
};

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function History() {
  const [campaigns, setCampaigns] = useState<CampaignSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    setCampaigns(null);
    try { setCampaigns(await listSmsCampaigns()); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not load campaign history.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return (
    <section className="ad-card-box" aria-labelledby="history-title">
      <div className="ad-card-box__head"><h2 id="history-title">Announcements</h2><Button variant="ghost" icon="refresh" onClick={() => void load()}>Refresh</Button></div>
      {error ? <LoadFailure body={error} onRetry={() => void load()} /> : campaigns === null ? <div className="ad-card-box__body"><Skeleton lines={5} label="Loading history" /></div> : campaigns.length === 0 ? (
        <EmptyState compact icon="message" title="No announcements sent yet" />
      ) : (
        <div className="ad-table-scroll">
          <table className="ad-table ad-table--static">
            <thead><tr><th scope="col">Message</th><th scope="col">Audience</th><th scope="col">Delivered</th><th scope="col">Status</th><th scope="col">When</th></tr></thead>
            <tbody>
              {campaigns.map((campaign) => {
                const status = STATUS[campaign.status] ?? { label: campaign.status, tone: 'neutral' as const };
                return (
                  <tr key={campaign.id}>
                    <td className="ad-history-message">
                      <span>{campaign.message.length > 90 ? `${campaign.message.slice(0, 90)}…` : campaign.message}</span>
                      {campaign.sandbox ? <Badge>Sandbox</Badge> : null}
                    </td>
                    <td>{campaign.audience === 'all' ? 'All app users' : 'Numbers'}</td>
                    <td className="ad-table__num">{campaign.sentCount} / {campaign.recipientCount}</td>
                    <td><Badge tone={status.tone} dot>{status.label}</Badge></td>
                    <td className="ad-table__num">{campaign.scheduledFor ? <>Scheduled {formatWhen(campaign.scheduledFor)}</> : formatWhen(campaign.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* -- Test SMS ------------------------------------------------------------------------------------ */

function TestSms() {
  const [to, setTo] = useState('0557535673');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const valid = Boolean(normalizeGhanaPhone(to));

  const submit = async () => {
    if (!valid || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await sendTestSms(to.trim(), message.trim() || undefined);
      setToast(`Test sent to ${res.recipient}${res.id ? ` · id ${res.id}` : ''}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The test SMS could not be sent.');
    } finally {
      setSending(false);
    }
  };

  return (
    <form className="ad-card-box ad-narrow" aria-labelledby="test-title" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <div className="ad-card-box__head"><h2 id="test-title">Send a test</h2></div>
      <div className="ad-card-box__body ts-stack">
        <Field label="Recipient (Ghana number)" required error={to.trim() && !valid ? 'Enter a Ghana mobile number.' : undefined}>
          <input className="ts-input" value={to} onChange={(event) => setTo(event.target.value)} inputMode="tel" placeholder="0557535673" />
        </Field>
        <Field label="Message" optional hint="Leave blank to send the default test message.">
          <textarea className="ts-textarea" rows={3} value={message} onChange={(event) => setMessage(event.target.value)} />
        </Field>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <div><Button type="submit" variant="primary" icon="send" busy={sending} disabled={!valid}>Send test SMS</Button></div>
        <p className="ts-hint">A test is delivered and billed like any other message.</p>
      </div>
      {toast ? <Toast message={toast} onDone={() => setToast(null)} /> : null}
    </form>
  );
}
