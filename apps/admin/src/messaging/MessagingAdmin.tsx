import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@indigen-world/web-ui';
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

/**
 * Messaging console. Beyond the SMS balance and a one-off test message, admins
 * can compose announcements (to a pasted list of numbers or a broadcast to all
 * app users), schedule them for a future time, dry-run them in Arkesel sandbox
 * mode, reuse saved contact groups, and review recent campaign history. Every
 * privileged call goes through admin-only callable Functions — the Arkesel API
 * key never reaches the browser. Admin-gated by the parent shell.
 */
export function MessagingAdmin() {
  return (
    <div className="messaging-admin">
      <BalancePanel />
      <ComposePanel />
      <ContactGroupsPanel />
      <HistoryPanel />
      <TestSmsPanel />
    </div>
  );
}

/* ------------------------------------------------------------------ Balance */

function BalancePanel() {
  const [balance, setBalance] = useState<SmsBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBalance(await fetchSmsBalance());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the SMS balance.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="panel">
      <h2>SMS balance (Arkesel)</h2>
      <p className="panel__hint">
        Announcements and high-priority notifications are delivered by SMS through Arkesel. The account balance is shown below.
      </p>
      {loading ? (
        <p className="muted">Loading balance…</p>
      ) : error ? (
        <p className="error-line">{error}</p>
      ) : (
        <div className="metric-grid">
          <div className="metric">
            <span className="metric__value">{balance?.smsBalance ?? '—'}</span>
            <span className="metric__label">SMS units</span>
          </div>
          <div className="metric">
            <span className="metric__value">{balance?.mainBalance ?? '—'}</span>
            <span className="metric__label">Main balance</span>
          </div>
        </div>
      )}
      <div style={{ marginTop: '0.75rem' }}>
        <Button variant="ghost" onClick={() => void load()} disabled={loading}>
          Refresh balance
        </Button>
      </div>
    </section>
  );
}

/* --------------------------------------------------------- Segment counting */

// Rough GSM-7 vs UCS-2 estimate, matching how Arkesel bills message parts.
const GSM7 = /^[A-Za-z0-9 \r\n@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/;
function segments(message: string): { chars: number; parts: number; unicode: boolean } {
  const chars = message.length;
  if (chars === 0) return { chars: 0, parts: 0, unicode: false };
  const unicode = !GSM7.test(message);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  const parts = chars <= single ? 1 : Math.ceil(chars / multi);
  return { chars, parts, unicode };
}

/* ------------------------------------------------------------- Compose form */

function ComposePanel() {
  const [audience, setAudience] = useState<CampaignAudience>('numbers');
  const [recipients, setRecipients] = useState('');
  const [message, setMessage] = useState('');
  const [scheduled, setScheduled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [sandbox, setSandbox] = useState(false);

  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [sending, setSending] = useState(false);
  const [confirmBroadcast, setConfirmBroadcast] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listSmsContactGroups().then(setGroups).catch(() => {/* non-fatal */});
  }, []);

  const parsed = useMemo(() => {
    const valid = new Set<string>();
    const invalid = new Set<string>();
    for (const token of splitRecipients(recipients)) {
      const n = normalizeGhanaPhone(token);
      if (n) valid.add(n);
      else invalid.add(token);
    }
    return { valid: [...valid], invalid: [...invalid] };
  }, [recipients]);

  const seg = segments(message);
  const isBroadcast = audience === 'all';
  const canSend =
    Boolean(message.trim()) &&
    (isBroadcast || parsed.valid.length > 0) &&
    (!scheduled || Boolean(scheduledAt)) &&
    !sending;

  const appendGroup = (id: string) => {
    const group = groups.find((g) => g.id === id);
    if (!group) return;
    setRecipients((prev) => (prev.trim() ? `${prev.trim()}, ${group.numbers.join(', ')}` : group.numbers.join(', ')));
  };

  const sendLabel = sandbox
    ? 'Send test (sandbox)'
    : scheduled
      ? 'Schedule announcement'
      : isBroadcast
        ? 'Broadcast to all users'
        : 'Send announcement';

  const doSend = async () => {
    setSending(true);
    setFlash(null);
    setError(null);
    try {
      const res = await sendSmsCampaign({
        audience,
        message: message.trim(),
        recipients: isBroadcast ? undefined : recipients,
        scheduledAt: scheduled && scheduledAt ? scheduledAt : undefined,
        sandbox,
      });
      const verb =
        res.status === 'scheduled'
          ? `Scheduled for ${res.recipientCount} recipient(s)`
          : res.status === 'partial'
            ? `Partially sent — ${res.sentCount} of ${res.recipientCount}`
            : `Sent to ${res.sentCount} recipient(s)`;
      const skipped = res.invalid.length ? ` · ${res.invalid.length} skipped as invalid` : '';
      setFlash(`${verb}${sandbox ? ' (sandbox — not delivered)' : ''}${skipped}.`);
      if (!scheduled) setMessage('');
      setConfirmBroadcast(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The announcement could not be sent.');
    } finally {
      setSending(false);
    }
  };

  const onSendClick = () => {
    // Guard mass / live sends behind an explicit second click.
    const risky = (isBroadcast || parsed.valid.length >= 25) && !sandbox;
    if (risky && !confirmBroadcast) {
      setConfirmBroadcast(true);
      return;
    }
    void doSend();
  };

  return (
    <section className="panel">
      <h2>Compose an announcement</h2>
      <p className="panel__hint">
        Send an SMS now or schedule it. Choose a specific list of numbers or broadcast to every app user. Turn on sandbox to dry-run without delivering or being charged.
      </p>
      {flash ? <div className="admin-flash">{flash}</div> : null}
      {error ? <p className="error-line">{error}</p> : null}

      <div className="admin-form">
        <div className="seg-toggle" role="radiogroup" aria-label="Audience">
          <button
            type="button"
            role="radio"
            aria-checked={audience === 'numbers'}
            className={audience === 'numbers' ? 'seg is-active' : 'seg'}
            onClick={() => { setAudience('numbers'); setConfirmBroadcast(false); }}
          >
            Specific numbers
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={audience === 'all'}
            className={audience === 'all' ? 'seg is-active' : 'seg'}
            onClick={() => { setAudience('all'); setConfirmBroadcast(false); }}
          >
            All app users (broadcast)
          </button>
        </div>

        {isBroadcast ? (
          <p className="broadcast-note">
            This will resolve every app user with a phone number (Firebase Auth accounts and creator profile contacts) and send to all of them.
          </p>
        ) : (
          <>
            <label>
              Recipients
              <textarea
                value={recipients}
                onChange={(e) => { setRecipients(e.target.value); setConfirmBroadcast(false); }}
                placeholder="Paste numbers separated by comma, pipe, semicolon, spaces or new lines — e.g. 0557535673, 0244000000 | 233201234567"
                rows={4}
              />
            </label>
            <div className="chip-row">
              <span className="chip chip--ok">{parsed.valid.length} valid</span>
              {parsed.invalid.length > 0 ? (
                <span className="chip chip--bad" title={parsed.invalid.join(', ')}>
                  {parsed.invalid.length} invalid
                </span>
              ) : null}
              {groups.length > 0 ? (
                <label className="group-load">
                  Load group
                  <select
                    value=""
                    onChange={(e) => { if (e.target.value) { appendGroup(e.target.value); e.target.value = ''; } }}
                  >
                    <option value="">Choose…</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name} ({g.count})</option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          </>
        )}

        <label>
          Message
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type the announcement…"
            rows={4}
            maxLength={900}
          />
        </label>
        <div className="chip-row">
          <span className="muted small">
            {seg.chars} chars · {seg.parts} SMS part{seg.parts === 1 ? '' : 's'}
            {seg.unicode ? ' · unicode' : ''}
          </span>
        </div>

        <div className="form-row">
          <label className="inline-check">
            <input type="checkbox" checked={scheduled} onChange={(e) => setScheduled(e.target.checked)} />
            Schedule for later
          </label>
          <label className="inline-check">
            <input type="checkbox" checked={sandbox} onChange={(e) => setSandbox(e.target.checked)} />
            Sandbox (dry-run, not delivered or billed)
          </label>
        </div>
        {scheduled ? (
          <label>
            Send at (Ghana time)
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </label>
        ) : null}

        {confirmBroadcast ? (
          <div className="confirm-bar">
            <span>
              {isBroadcast
                ? 'Broadcast this message to every app user?'
                : `Send this message to ${parsed.valid.length} recipients?`}
              {' '}This cannot be undone.
            </span>
            <div className="confirm-actions">
              <button type="button" className="primary" disabled={sending} onClick={() => void doSend()}>
                {sending ? 'Sending…' : 'Yes, send'}
              </button>
              <button type="button" onClick={() => setConfirmBroadcast(false)} disabled={sending}>Cancel</button>
            </div>
          </div>
        ) : (
          <button type="button" className="primary" disabled={!canSend} onClick={onSendClick}>
            {sending ? 'Sending…' : sendLabel}
          </button>
        )}
      </div>
    </section>
  );
}

/* -------------------------------------------------------- Saved groups list */

function ContactGroupsPanel() {
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [name, setName] = useState('');
  const [numbers, setNumbers] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setGroups(await listSmsContactGroups());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load contact groups.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const validCount = useMemo(
    () => new Set(splitRecipients(numbers).map(normalizeGhanaPhone).filter(Boolean)).size,
    [numbers],
  );

  const save = async () => {
    setBusy(true);
    setFlash(null);
    setError(null);
    try {
      const res = await saveSmsContactGroup({ name: name.trim(), recipients: numbers });
      setFlash(`Saved “${name.trim()}” with ${res.count} number(s)${res.invalid.length ? ` · ${res.invalid.length} skipped` : ''}.`);
      setName('');
      setNumbers('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The group could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await deleteSmsContactGroup(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The group could not be deleted.');
    }
  };

  return (
    <section className="panel">
      <h2>Saved contact groups</h2>
      <p className="panel__hint">Reusable lists of numbers you can load into an announcement without re-pasting them.</p>
      {flash ? <div className="admin-flash">{flash}</div> : null}
      {error ? <p className="error-line">{error}</p> : null}

      {groups.length > 0 ? (
        <table className="admin-table" style={{ marginBottom: 16 }}>
          <thead>
            <tr><th>Name</th><th>Numbers</th><th aria-label="actions" /></tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.id}>
                <td>{g.name}</td>
                <td><span className="badge2">{g.count}</span></td>
                <td className="row-actions">
                  <button type="button" className="danger" onClick={() => void remove(g.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">No saved groups yet.</p>
      )}

      <div className="admin-form">
        <div className="form-row">
          <label>
            Group name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Founding creators" />
          </label>
          <div className="chip-row" style={{ alignItems: 'end' }}>
            <span className="chip chip--ok">{validCount} valid</span>
          </div>
        </div>
        <label>
          Numbers
          <textarea
            value={numbers}
            onChange={(e) => setNumbers(e.target.value)}
            placeholder="Paste numbers separated by comma, pipe, semicolon, spaces or new lines"
            rows={3}
          />
        </label>
        <button type="button" className="primary" disabled={busy || !name.trim() || validCount === 0} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save group'}
        </button>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- Campaign history */

const STATUS_LABELS: Record<string, string> = {
  sent: 'Sent',
  scheduled: 'Scheduled',
  partial: 'Partial',
  failed: 'Failed',
};

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

function HistoryPanel() {
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCampaigns(await listSmsCampaigns());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load campaign history.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="panel">
      <div className="tab-head">
        <h2>Announcement history</h2>
        <Button variant="ghost" onClick={() => void load()} disabled={loading}>Refresh</Button>
      </div>
      {loading ? (
        <p className="muted">Loading history…</p>
      ) : error ? (
        <p className="error-line">{error}</p>
      ) : campaigns.length === 0 ? (
        <p className="muted">No announcements sent yet.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Message</th>
              <th>Audience</th>
              <th>Recipients</th>
              <th>Status</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id}>
                <td>
                  {c.message.length > 60 ? `${c.message.slice(0, 60)}…` : c.message}
                  {c.sandbox ? <span className="badge2" style={{ marginLeft: 6 }}>sandbox</span> : null}
                </td>
                <td>{c.audience === 'all' ? 'Broadcast' : 'Numbers'}</td>
                <td>{c.sentCount}/{c.recipientCount}</td>
                <td><span className={`badge2 status-${c.status}`}>{STATUS_LABELS[c.status] ?? c.status}</span></td>
                <td>{c.scheduledFor ? `⏱ ${formatWhen(c.scheduledFor)}` : formatWhen(c.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/* --------------------------------------------------------------- Test SMS */

function TestSmsPanel() {
  const [to, setTo] = useState('0557535673');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSending(true);
    setFlash(null);
    setError(null);
    try {
      const res = await sendTestSms(to.trim(), message.trim() || undefined);
      setFlash(`Sent to ${res.recipient}${res.id ? ` · id ${res.id}` : ''}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The test SMS could not be sent.');
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="panel">
      <h2>Send a test SMS</h2>
      <p className="panel__hint">Confirm the integration and sender ID by sending a one-off message to any Ghana number.</p>
      {flash ? <div className="admin-flash">{flash}</div> : null}
      {error ? <p className="error-line">{error}</p> : null}
      <div className="admin-form">
        <div className="form-row">
          <label>
            Recipient (Ghana number)
            <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="0557535673" inputMode="tel" />
          </label>
        </div>
        <label>
          Message (optional)
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Leave blank to send the default test message."
            rows={3}
          />
        </label>
        <button type="button" className="primary" disabled={sending || !to.trim()} onClick={() => void submit()}>
          {sending ? 'Sending…' : 'Send test SMS'}
        </button>
      </div>
    </section>
  );
}
