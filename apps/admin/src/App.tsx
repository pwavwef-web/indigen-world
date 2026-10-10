import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { CommandPalette, useCommandPalette, type Command } from '@indigen-world/console-ui';
import { BrandMark } from '../../tribestudio/src/ui/BrandMark';
import { AttentionProvider, countValue, useAttention } from './attention';
import { auth, usingEmulators } from './firebase';
import { useAdminAuth } from './creators/data';
import { Home } from './home/Home';
import { AdminNotFoundPage } from './NotFoundPage';
import { RouterProvider, useRouter } from './router';
import {
  ACCESS_LABEL,
  resolve,
  sectionEntry,
  toolPath,
  visibleSections,
  visibleTools,
  type SectionDef,
  type StaffAccess,
  type ToolDef,
} from './routes';
import { SCREENS } from './screens';
import { SessionProvider, useSession } from './session';
import { DialogHost } from './ui/dialogs';
import { ScreenBoundary } from './ui/ErrorBoundary';
import { Icon, type IconName } from './ui/icons';
import { Loading, Notice, PermissionState, Skeleton } from './ui/primitives';
import { SectionFrame, TopBar } from './ui/Shell';

const provider = new GoogleAuthProvider();
const TeamSiteIntakePage = lazy(() => import('./team-sites/TeamSiteIntake').then((module) => ({ default: module.TeamSiteIntakePage })));

/* -- Signing in -------------------------------------------------------------------- */

function SignIn({ ready, error, onSignIn, busy }: { ready: boolean; error: string | null; onSignIn: () => void; busy: boolean }) {
  return (
    <div className="ts-auth ad-auth">
      <div className="ts-auth__vignette" aria-hidden="true" />
      <main id="main-content" tabIndex={-1} className="ts-auth__inner">
        <BrandMark size="3.5rem" draw className="ts-auth__mark" />
        <section className="ts-auth__card" aria-labelledby="auth-title">
          <span className="ts-auth__workspace"><Icon name="shield" />Indigen World · Administration</span>
          <div className="ts-auth__head">
            <h1 id="auth-title" className="ts-auth__title" tabIndex={-1}>Sign in to Administration</h1>
            <p className="ts-auth__lede">Use an authorised staff Google account. Your access follows the role on that account.</p>
          </div>
          <div className="ts-auth__form">
            {error ? <Notice tone="danger" role="alert">{error}</Notice> : null}
            {!ready ? (
              <div className="ts-auth__state" role="status" aria-live="polite"><span className="ts-spinner" aria-hidden="true" /><span>Checking your session…</span></div>
            ) : (
              <button type="button" className="ts-btn ts-btn--secondary ts-btn--lg ts-btn--block ts-auth__google" onClick={onSignIn} disabled={busy} aria-busy={busy || undefined}>
                <span className="ts-btn__spinner" aria-hidden="true" />
                {!busy ? (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z" />
                    <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" />
                    <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
                    <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z" />
                  </svg>
                ) : null}
                <span>{busy ? 'Opening Google…' : 'Continue with Google'}</span>
              </button>
            )}
          </div>
        </section>
        <p className="ts-auth__note">Protected internal workspace{usingEmulators ? ' · local emulators' : ''}. After signing in you return to the page you asked for.</p>
      </main>
    </div>
  );
}

/* -- The signed-in console ----------------------------------------------------------- */

const SECTION_BADGES: Partial<Record<SectionDef['id'], Record<string, (counts: ReturnType<typeof useAttention>['counts']) => number | null>>> = {
  finance: { redemptions: (c) => sum(countValue(c.redemptionsPending), countValue(c.redemptionsAwaitingDelivery)) },
  review: { pending: (c) => countValue(c.reviewPending) },
  community: { reports: (c) => countValue(c.openReports), forms: (c) => countValue(c.newForms) },
  creators: { applications: (c) => countValue(c.creatorApplications) },
};

function sum(...values: (number | null)[]): number | null {
  return values.every((value) => value !== null) ? values.reduce<number>((total, value) => total + (value ?? 0), 0) : null;
}

function ToolScreen({ section, tool }: { section: SectionDef; tool: ToolDef }) {
  const Screen = SCREENS[`${section.id}.${tool.id}`];
  if (!Screen) return <Notice tone="warning" title="This tool has no screen yet">The route exists but nothing is mounted for it.</Notice>;
  return (
    <ScreenBoundary key={`${section.id}.${tool.id}`} name={tool.slug ? tool.label : section.label}>
      <Suspense fallback={<div className="ad-loading"><Skeleton title lines={4} label={`Loading ${tool.label}`} /></div>}>
        <Screen />
      </Suspense>
    </ScreenBoundary>
  );
}

function Workspace() {
  const { access, signOut: leave } = useSession();
  const { pathname, navigate } = useRouter();
  const { counts, refresh } = useAttention();
  const palette = useCommandPalette();
  const result = resolve(pathname, access);

  useEffect(() => {
    if (result.kind === 'redirect') navigate(result.to, { replace: true });
  }, [navigate, result]);

  const title = result.kind === 'tool'
    ? `${result.tool.slug ? `${result.tool.label} · ` : ''}${result.section.label}`
    : result.kind === 'denied' ? result.section.label
      : result.kind === 'not-found' ? 'Page not found' : 'Home';

  // Name the tab and move focus to the new page so the change is announced.
  useEffect(() => {
    document.title = `${title} · Indigen World Admin`;
    const main = document.getElementById('main-content');
    main?.focus({ preventScroll: true });
  }, [title]);

  const commands = useMemo<Command[]>(() => {
    const go: Command[] = [{ id: 'go-home', group: 'Go to', label: 'Home', hint: 'All workspaces', icon: <Icon name="home" />, run: () => navigate('/') }];
    for (const section of visibleSections(access)) {
      go.push({ id: `section-${section.id}`, group: 'Workspaces', label: section.label, hint: section.description, icon: <Icon name={section.icon as IconName} />, keywords: section.tools.map((tool) => tool.label).join(' '), run: () => navigate(sectionEntry(section, access)) });
      for (const tool of visibleTools(section, access)) {
        if (!tool.slug && section.tools.length > 1 && tool.id === 'overview') continue;
        go.push({ id: `tool-${section.id}-${tool.id}`, group: section.label, label: tool.label, hint: tool.hint, trail: toolPath(section, tool), icon: <Icon name={tool.icon as IconName} />, keywords: `${section.label} ${tool.hint}`, run: () => navigate(toolPath(section, tool)) });
      }
    }
    return [
      ...go,
      { id: 'refresh-queues', group: 'Actions', label: 'Refresh queue counts', hint: 'Re-counts everything waiting for staff', icon: <Icon name="refresh" />, run: refresh },
      { id: 'sign-out', group: 'Actions', label: 'Sign out', icon: <Icon name="logout" />, run: leave },
    ];
  }, [access, leave, navigate, refresh]);

  let content;
  if (result.kind === 'home') {
    content = <main id="main-content" className="ad-main ad-main--home" tabIndex={-1}><Home /></main>;
  } else if (result.kind === 'tool' || result.kind === 'denied') {
    const badgeFns = SECTION_BADGES[result.section.id] ?? {};
    const badges = Object.fromEntries(Object.entries(badgeFns).map(([tool, fn]) => [tool, fn(counts)]));
    const allowedHere = visibleTools(result.section, access).length > 0;
    content = (
      <main id="main-content" className="ad-main" tabIndex={-1}>
        {result.kind === 'denied' && !allowedHere ? (
          <div className="ad-denied">
            <PermissionState body={`${result.section.label} needs ${ACCESS_LABEL[result.needs]}. Ask a super administrator if you need it, then sign out and back in.`} />
          </div>
        ) : (
          <SectionFrame section={result.section} tool={result.kind === 'tool' ? result.tool : result.tool} badges={badges}>
            {result.kind === 'tool'
              ? <ToolScreen section={result.section} tool={result.tool} />
              : <PermissionState body={`${result.tool?.label ?? result.section.label} needs ${ACCESS_LABEL[result.needs]}. The other ${result.section.label} tools are in the menu.`} />}
          </SectionFrame>
        )}
      </main>
    );
  } else if (result.kind === 'redirect') {
    content = <main id="main-content" className="ad-main" tabIndex={-1}><Loading label="Opening…" /></main>;
  } else {
    content = <main id="main-content" className="ad-main" tabIndex={-1}><AdminNotFoundPage /></main>;
  }

  return (
    <div className="ad-app">
      <a href="#main-content" className="ts-skip">Skip to content</a>
      <TopBar onSearch={() => palette.setOpen(true)} />
      {content}
      <CommandPalette open={palette.open} onClose={() => palette.setOpen(false)} commands={commands} />
    </div>
  );
}

function SignedIn({ user, access }: { user: NonNullable<ReturnType<typeof useAdminAuth>['user']>; access: StaffAccess }) {
  const leave = useCallback(() => { void signOut(auth); }, []);
  const session = useMemo(() => ({ user, access, signOut: leave }), [user, access, leave]);
  return (
    <SessionProvider value={session}>
      <AttentionProvider access={access}>
        <Workspace />
        <DialogHost />
      </AttentionProvider>
    </SessionProvider>
  );
}

function Console() {
  const { user, role, finance, superAdmin, ready } = useAdminAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const access = useMemo<StaffAccess>(() => ({ role, finance, superAdmin }), [role, finance, superAdmin]);

  if (!ready || !user) {
    const handleSignIn = async () => {
      setError(null);
      setBusy(true);
      try { await signInWithPopup(auth, provider); }
      catch (reason) {
        const code = (reason as { code?: string }).code;
        if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
          setError(reason instanceof Error ? reason.message : 'Sign-in failed.');
        }
      } finally { setBusy(false); }
    };
    return <SignIn ready={ready} error={error} busy={busy} onSignIn={() => void handleSignIn()} />;
  }
  return <SignedIn user={user} access={access} />;
}

export default function App() {
  // The public intake form lives on this site but needs no staff account.
  if (window.location.pathname.replace(/\/+$/, '') === '/team-site-intake') return <Suspense fallback={null}><TeamSiteIntakePage /></Suspense>;
  return <RouterProvider><Console /></RouterProvider>;
}
