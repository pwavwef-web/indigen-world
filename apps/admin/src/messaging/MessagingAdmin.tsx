import { useCallback, useEffect, useState } from 'react';
import { Button } from '@indigen-world/web-ui';
import { fetchSmsBalance, sendTestSms, type SmsBalance } from './data';

/**
 * Messaging console: shows the Arkesel SMS balance and sends a manual test SMS.
 * Both operations go through admin-only callable Functions, so the API key is
 * never exposed to the browser. Admin-gated by the parent shell.
 */
export function MessagingAdmin() {
  const [balance, setBalance] = useState<SmsBalance | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(true);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  const [to, setTo] = useState('0557535673');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const loadBalance = useCallback(async () => {
    setLoadingBalance(true);
    setBalanceError(null);
    try {
      setBalance(await fetchSmsBalance());
    } catch (err) {
      setBalanceError(err instanceof Error ? err.message : 'Could not load the SMS balance.');
    } finally {
      setLoadingBalance(false);
    }
  }, []);

  useEffect(() => {
    void loadBalance();
  }, [loadBalance]);

  const submit = async () => {
    setSending(true);
    setFlash(null);
    setSendError(null);
    try {
      const res = await sendTestSms(to.trim(), message.trim() || undefined);
      setFlash(`Sent to ${res.recipient}${res.id ? ` · id ${res.id}` : ''}.`);
      void loadBalance();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'The test SMS could not be sent.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="messaging-admin">
      <section className="panel">
        <h2>SMS balance (Arkesel)</h2>
        <p className="panel__hint">
          High-priority notifications are delivered by SMS through Arkesel. The account balance is shown below.
        </p>
        {loadingBalance ? (
          <p className="muted">Loading balance…</p>
        ) : balanceError ? (
          <p className="error-line">{balanceError}</p>
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
          <Button variant="ghost" onClick={() => void loadBalance()} disabled={loadingBalance}>
            Refresh balance
          </Button>
        </div>
      </section>

      <section className="panel">
        <h2>Send a test SMS</h2>
        <p className="panel__hint">Confirm the integration and sender ID by sending a one-off message to any Ghana number.</p>
        {flash ? <div className="admin-flash">{flash}</div> : null}
        {sendError ? <p className="error-line">{sendError}</p> : null}
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
    </div>
  );
}
