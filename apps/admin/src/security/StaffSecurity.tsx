import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAllows, useSession } from '../session';
import { confirmAction } from '../ui/dialogs';
import { Badge, Button, Dialog, Field, LoadFailure, Notice, PageHeader, Panel, Skeleton, Toast } from '../ui/primitives';
import {
  beginEnrolment,
  confirmEnrolment,
  mfaStatus,
  replaceRecoveryCodes,
  resetStaffMfa,
  staffRoster,
  type MfaEnrolment,
  type MfaRosterRow,
  type MfaStatus,
} from './staffSession';
import { QrCode, RecoveryCodes } from './TwoStepGate';

/* ==========================================================================
   Staff security: your own two-step verification (new recovery codes, a new
   authenticator), and for administrators, who on the staff has set it up.
   Only the super administrator can reset someone else's.
   ========================================================================== */

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');

/** Move two-step verification to a new authenticator app (from a verified sign-in). */
function ReplaceAuthenticator({ onClose, onDone }: { onClose: () => void; onDone: (codes: string[]) => void }) {
  const [enrolment, setEnrolment] = useState<MfaEnrolment | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    beginEnrolment().then(setEnrolment, (reason: unknown) => setError(reason instanceof Error ? reason.message : 'Setup could not start.'));
  }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (code.length !== 6) { setError('Enter the six-digit code the new app shows.'); return; }
    setBusy(true); setError(null);
    try { onDone((await confirmEnrolment(code)).recoveryCodes); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'That code did not work.'); }
    finally { setBusy(false); }
  };
  return (
    <Dialog title="Use a new authenticator app" lede="Scan this with the new app. Your old app stops working once the new code is accepted." busy={busy} onClose={onClose}
      footer={<><Button disabled={busy} onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="replace-mfa" busy={busy} disabled={!enrolment}>Switch to this app</Button></>}>
      {enrolment ? (
        <form id="replace-mfa" className="ad-mfa__form" onSubmit={(event) => void submit(event)} noValidate>
          <div className="ad-mfa__scan">
            <QrCode text={enrolment.otpauthUrl} label="QR code for your new authenticator app" />
            <div className="ad-mfa__key"><span className="ts-label">Setup key</span><code className="ad-mfa__secret">{enrolment.secret.replace(/(.{4})/g, '$1 ').trim()}</code></div>
          </div>
          <Field label="Six-digit code from the new app" error={error ?? undefined}>
            <input className="ts-input ad-mfa__input" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
          </Field>
        </form>
      ) : error ? <Notice tone="danger" role="alert">{error}</Notice> : <Skeleton lines={4} label="Preparing a new setup key" />}
    </Dialog>
  );
}

/** Your own two-step verification. Used on the Staff security screen and from the account menu. */
export function MySecurity({ compact = false }: { compact?: boolean }) {
  const { user } = useSession();
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { setFailed(null); mfaStatus().then(setStatus, (reason: unknown) => setFailed(reason instanceof Error ? reason.message : 'Status could not be loaded.')); }, []);
  useEffect(load, [load]);

  const newCodes = async () => {
    if (!(await confirmAction({ title: 'Replace your recovery codes?', body: 'Your current recovery codes stop working immediately. Save the new ones before closing.', confirmLabel: 'Replace codes' }))) return;
    setBusy(true);
    try { setCodes((await replaceRecoveryCodes()).recoveryCodes); load(); }
    catch (reason) { setFailed(reason instanceof Error ? reason.message : 'New codes could not be made.'); }
    finally { setBusy(false); }
  };

  if (failed) return <LoadFailure body={failed} onRetry={load} />;
  if (!status) return <Skeleton lines={3} label="Loading two-step verification" />;
  return (
    <div className="ad-mfa__mine">
      <dl className="ad-mfa__facts">
        <div><dt>Two-step verification</dt><dd><Badge tone="success" dot>On · authenticator app</Badge></dd></div>
        <div><dt>This sign-in expires</dt><dd>{when(status.sessionExpiresAt)}</dd></div>
        <div><dt>Recovery codes left</dt><dd>{status.recoveryCodesLeft <= 3 ? <Badge tone="warning">{status.recoveryCodesLeft} left</Badge> : status.recoveryCodesLeft}</dd></div>
      </dl>
      {status.recoveryCodesLeft <= 3 ? <Notice tone="warning">You are running low on recovery codes. Make a new set and store it safely.</Notice> : null}
      {codes ? (
        <Notice tone="success" title="Your new recovery codes">
          <p>Save these now. They will not be shown again, and your old codes no longer work.</p>
          <RecoveryCodes codes={codes} account={user.email ?? user.uid} />
        </Notice>
      ) : null}
      <div className="ad-mfa__row">
        <Button icon="key" busy={busy} onClick={() => void newCodes()}>New recovery codes</Button>
        <Button icon="phone" disabled={busy} onClick={() => setReplacing(true)}>Use a new authenticator app</Button>
      </div>
      {!compact ? <p className="ts-hint">Codes come from the authenticator app you set up. Every sign-in asks for one, and a sign-in lasts at most 12 hours. The console also signs out after 30 minutes without activity.</p> : null}
      {replacing ? <ReplaceAuthenticator onClose={() => setReplacing(false)} onDone={(next) => { setReplacing(false); setCodes(next); load(); }} /> : null}
    </div>
  );
}

export function MySecurityDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Two-step verification" lede="Your sign-in security for the admin console." onClose={onClose} footer={<Button onClick={onClose}>Done</Button>}>
      <MySecurity compact />
    </Dialog>
  );
}

function Roster() {
  const { access, user } = useSession();
  const [people, setPeople] = useState<MfaRosterRow[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const load = useCallback(() => { setFailed(null); staffRoster().then((result) => setPeople(result.people), (reason: unknown) => setFailed(reason instanceof Error ? reason.message : 'Staff could not be listed.')); }, []);
  useEffect(load, [load]);

  const reset = async (person: MfaRosterRow) => {
    if (!(await confirmAction({
      title: `Reset two-step verification for ${person.email || person.uid}?`,
      body: 'Their authenticator and recovery codes stop working. They set up a new authenticator at their next sign-in. Only do this after confirming who is asking, outside email if you can.',
      confirmLabel: 'Reset', tone: 'danger',
    }))) return;
    setBusy(person.uid);
    try { await resetStaffMfa(person.uid); setToast(`Two-step verification reset for ${person.email || person.uid}.`); load(); }
    catch (reason) { setFailed(reason instanceof Error ? reason.message : 'The reset failed.'); }
    finally { setBusy(null); }
  };

  if (failed) return <LoadFailure body={failed} onRetry={load} />;
  if (!people) return <Skeleton lines={5} label="Loading staff" />;
  const missing = people.filter((person) => !person.enrolled).length;
  return (
    <>
      {missing ? <Notice tone="info">{missing} staff {missing === 1 ? 'account has' : 'accounts have'} not set up two-step verification yet. They are asked to at their next sign-in, and cannot use the console until they do.</Notice> : null}
      <div className="ad-table-scroll">
        <table className="ad-table" aria-label="Staff two-step verification">
          <thead><tr><th scope="col">Staff member</th><th scope="col">Role</th><th scope="col">Two-step verification</th><th scope="col">Last verified</th>{access.superAdmin ? <th scope="col"><span className="sr-only">Actions</span></th> : null}</tr></thead>
          <tbody>
            {people.map((person) => (
              <tr key={person.uid}>
                <td>{person.email || person.uid}</td>
                <td>{person.role ? person.role.replace('_', ' ') : 'Finance only'}</td>
                <td>{person.enrolled ? <Badge tone="success" dot>Set up</Badge> : <Badge tone="warning" dot>Not yet</Badge>}</td>
                <td className="ad-table__num">{when(person.lastVerifiedAt)}</td>
                {access.superAdmin ? (
                  <td className="ad-table__end">
                    {person.enrolled && person.uid !== user.uid ? <Button size="sm" variant="danger-ghost" busy={busy === person.uid} onClick={() => void reset(person)}>Reset</Button> : null}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {toast ? <Toast message={toast} onDone={() => setToast(null)} /> : null}
    </>
  );
}

export function StaffSecurityScreen() {
  const admin = useAllows('admin');
  return (
    <div className="ad-page">
      <PageHeader kicker="Governance" title="Staff security" description="Two-step verification protects every staff sign-in to this console. The super administrator role is owner-managed and cannot be granted from here." />
      <Panel title="Your two-step verification"><MySecurity /></Panel>
      {admin ? <Panel title="Staff" description="Everyone with a staff role or finance access. Only the super administrator can reset someone’s two-step verification."><Roster /></Panel> : null}
    </div>
  );
}
