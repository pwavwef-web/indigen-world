import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import qrcode from 'qrcode-generator';
import { BrandMark } from '../../../tribestudio/src/ui/BrandMark';
import { Icon } from '../ui/icons';
import { Button, Field, Notice } from '../ui/primitives';
import {
  beginEnrolment,
  confirmEnrolment,
  mfaStatus,
  verifyCode,
  verifyRecoveryCode,
  type MfaEnrolment,
} from './staffSession';

/* ==========================================================================
   Two-step verification, between Google sign-in and the console. Everyone
   with staff standing passes through it on every sign-in: the first time to
   set up an authenticator app, afterwards to enter a code from it. The
   console only opens once the server has added this sign-in to the account's
   verified sessions and the refreshed ID token carries it.
   ========================================================================== */

type Phase =
  | { kind: 'loading' }
  | { kind: 'failed'; message: string }
  | { kind: 'intro' }
  | { kind: 'scan'; enrolment: MfaEnrolment }
  | { kind: 'saved-codes'; codes: string[] }
  | { kind: 'verify'; lockedUntil: string | null };

/** The QR code an authenticator app scans, drawn as SVG (no markup injection, no canvas). */
export function QrCode({ text, label }: { text: string; label: string }) {
  const { size, path } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount();
    let d = '';
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) if (qr.isDark(row, col)) d += `M${col} ${row}h1v1h-1z`;
    }
    return { size: count, path: d };
  }, [text]);
  return (
    <svg className="ad-mfa__qr" viewBox={`-4 -4 ${size + 8} ${size + 8}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect x={-4} y={-4} width={size + 8} height={size + 8} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}

function groupSecret(secret: string) {
  return secret.replace(/(.{4})/g, '$1 ').trim();
}

/** Save recovery codes as a text file, the one place they are ever shown. */
export function downloadCodes(codes: string[], account: string) {
  const text = [
    'Indigen World Admin — two-step verification recovery codes',
    `Account: ${account}`,
    `Created: ${new Date().toISOString()}`,
    '',
    'Each code works once, in place of an authenticator code. Keep them somewhere safe and offline.',
    '',
    ...codes,
    '',
  ].join('\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'indigen-admin-recovery-codes.txt';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function RecoveryCodes({ codes, account }: { codes: string[]; account: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(codes.join('\n')); setCopied(true); } catch { setCopied(false); }
  };
  return (
    <div className="ad-mfa__codes-wrap">
      <ol className="ad-mfa__codes" aria-label="Recovery codes">
        {codes.map((code) => <li key={code}><code>{code}</code></li>)}
      </ol>
      <div className="ad-mfa__row">
        <Button size="sm" icon="copy" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy codes'}</Button>
        <Button size="sm" icon="download" onClick={() => downloadCodes(codes, account)}>Download .txt</Button>
      </div>
    </div>
  );
}

function CodeInput({ value, onChange, recovery = false, autoFocus = true }: { value: string; onChange: (value: string) => void; recovery?: boolean; autoFocus?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus, recovery]);
  return recovery ? (
    <input ref={ref} className="ts-input ad-mfa__input" value={value} onChange={(event) => onChange(event.target.value.toUpperCase())}
      autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="XXXX-XXXX-XXXX" maxLength={20} />
  ) : (
    <input ref={ref} className="ts-input ad-mfa__input" value={value} onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
      inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" placeholder="123456" maxLength={6} />
  );
}

export function TwoStepGate({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const account = user.email ?? user.uid;

  const load = useCallback(async () => {
    setPhase({ kind: 'loading' });
    try {
      const status = await mfaStatus();
      if (status.verified) { await user.getIdToken(true); return; }
      setPhase(status.enrolled ? { kind: 'verify', lockedUntil: status.lockedUntil } : { kind: 'intro' });
    } catch (reason) {
      setPhase({ kind: 'failed', message: reason instanceof Error ? reason.message : 'Two-step verification could not be checked.' });
    }
  }, [user]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [phase.kind]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await work(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Something went wrong. Try again.'); } finally { setBusy(false); }
  };

  /** The verification is on the account's claims; a fresh ID token carries it and the console opens. */
  const enter = () => run(async () => { await user.getIdToken(true); });

  const start = () => run(async () => { setCode(''); setPhase({ kind: 'scan', enrolment: await beginEnrolment() }); });

  const confirm = (event: FormEvent) => {
    event.preventDefault();
    if (code.length !== 6) { setError('Enter the six-digit code your app shows.'); return; }
    void run(async () => {
      const result = await confirmEnrolment(code);
      setCode('');
      setPhase({ kind: 'saved-codes', codes: result.recoveryCodes });
    });
  };

  const verify = (event: FormEvent) => {
    event.preventDefault();
    if (!recovery && code.length !== 6) { setError('Enter the six-digit code your app shows.'); return; }
    if (recovery && code.replace(/[^A-Z0-9]/g, '').length !== 12) { setError('Enter one of your twelve-character recovery codes.'); return; }
    void run(async () => {
      if (recovery) await verifyRecoveryCode(code); else await verifyCode(code);
      await user.getIdToken(true);
    });
  };

  let title = 'Two-step verification';
  let lede = '';
  let body = null;

  if (phase.kind === 'loading') {
    body = <div className="ts-auth__state" role="status" aria-live="polite"><span className="ts-spinner" aria-hidden="true" /><span>Checking two-step verification…</span></div>;
  } else if (phase.kind === 'failed') {
    title = 'Two-step verification is unavailable';
    body = <>
      <Notice tone="danger" role="alert">{phase.message}</Notice>
      <Button variant="primary" block onClick={() => void load()}>Try again</Button>
    </>;
  } else if (phase.kind === 'intro') {
    title = 'Set up two-step verification';
    lede = 'The admin console now asks for a code from an authenticator app every time you sign in. It takes about a minute, once.';
    body = <>
      <ol className="ad-mfa__steps">
        <li><strong>Install an authenticator app</strong> on your phone if you have none: Google Authenticator, Microsoft Authenticator, 1Password or any app that supports time-based codes.</li>
        <li><strong>Scan the QR code</strong> on the next screen with it.</li>
        <li><strong>Enter the six-digit code</strong> it shows, then save your recovery codes.</li>
      </ol>
      {error ? <Notice tone="danger" role="alert">{error}</Notice> : null}
      <Button variant="primary" size="lg" block busy={busy} onClick={() => void start()}>Set up authenticator</Button>
    </>;
  } else if (phase.kind === 'scan') {
    title = 'Scan with your authenticator app';
    lede = `Scan the code, or type the setup key, then enter the six-digit code the app shows. This setup expires in ${phase.enrolment.expiresInMinutes} minutes.`;
    body = <form className="ad-mfa__form" onSubmit={confirm} noValidate>
      <div className="ad-mfa__scan">
        <QrCode text={phase.enrolment.otpauthUrl} label={`QR code to add ${account} to an authenticator app`} />
        <div className="ad-mfa__key">
          <span className="ts-label">Setup key</span>
          <code className="ad-mfa__secret" aria-label="Setup key">{groupSecret(phase.enrolment.secret)}</code>
          <p className="ts-hint">Account: {phase.enrolment.account}. Type: time-based.</p>
        </div>
      </div>
      <Field label="Six-digit code" error={error ?? undefined}><CodeInput value={code} onChange={setCode} /></Field>
      <Button type="submit" variant="primary" size="lg" block busy={busy}>Verify and turn on</Button>
      <Button variant="ghost" block disabled={busy} onClick={() => { setError(null); setPhase({ kind: 'intro' }); }}>Start again</Button>
    </form>;
  } else if (phase.kind === 'saved-codes') {
    title = 'Save your recovery codes';
    lede = 'If you lose your phone, each of these codes lets you in once instead of an authenticator code. They are shown only now.';
    body = <>
      <RecoveryCodes codes={phase.codes} account={account} />
      <label className="ts-check">
        <input type="checkbox" checked={saved} onChange={(event) => setSaved(event.target.checked)} />
        <span className="ts-check__copy"><strong>I have saved these recovery codes somewhere safe</strong></span>
      </label>
      {error ? <Notice tone="danger" role="alert">{error}</Notice> : null}
      <Button variant="primary" size="lg" block disabled={!saved} busy={busy} onClick={() => void enter()}>Continue to the console</Button>
    </>;
  } else {
    title = 'Enter your verification code';
    lede = recovery
      ? 'Enter one of the recovery codes you saved when you set up two-step verification. Each one works once.'
      : 'Open your authenticator app and enter the six-digit code for Indigen World Admin.';
    const locked = phase.lockedUntil && Date.parse(phase.lockedUntil) > Date.now();
    body = <form className="ad-mfa__form" onSubmit={verify} noValidate>
      {locked ? <Notice tone="warning" role="alert">Too many wrong codes. Try again after {new Date(phase.lockedUntil!).toLocaleTimeString()}.</Notice> : null}
      <Field label={recovery ? 'Recovery code' : 'Six-digit code'} error={error ?? undefined}>
        <CodeInput value={code} onChange={setCode} recovery={recovery} />
      </Field>
      <Button type="submit" variant="primary" size="lg" block busy={busy}>Verify</Button>
      <Button variant="link" disabled={busy} onClick={() => { setRecovery(!recovery); setCode(''); setError(null); }}>
        {recovery ? 'Use my authenticator app instead' : 'Lost your phone? Use a recovery code'}
      </Button>
      <details className="ts-auth__help">
        <summary><Icon name="chevron" />No phone and no recovery codes?</summary>
        <p>Ask the super administrator to reset your two-step verification from Governance → Staff security. You will set it up again at your next sign-in.</p>
      </details>
    </form>;
  }

  return (
    <div className="ts-auth ad-auth">
      <div className="ts-auth__vignette" aria-hidden="true" />
      <main id="main-content" tabIndex={-1} className="ts-auth__inner">
        <BrandMark size="3.5rem" className="ts-auth__mark" />
        <section className="ts-auth__card ad-mfa" aria-labelledby="mfa-title">
          <span className="ts-auth__workspace"><Icon name="lock" />Indigen World · Administration</span>
          <div className="ts-auth__head">
            <h1 id="mfa-title" ref={heading} className="ts-auth__title" tabIndex={-1}>{title}</h1>
            {lede ? <p className="ts-auth__lede">{lede}</p> : null}
          </div>
          <div className="ts-auth__form">{body}</div>
        </section>
        <p className="ts-auth__note">
          Signed in as {account}. <button type="button" className="ad-mfa__signout" onClick={onSignOut} disabled={busy}>Sign out</button>
        </p>
      </main>
    </div>
  );
}
