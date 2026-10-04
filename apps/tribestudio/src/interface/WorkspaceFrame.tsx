import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CommandPalette, useCommandPalette } from '@indigen-world/console-ui';
import { Link, useRoute } from '../router';
import { Icon, type IconName } from './icons';
import './workspace.css';

export interface WorkspaceDestination {
  to: string;
  label: string;
  icon: IconName;
  group: string;
  active?: boolean;
  badge?: ReactNode;
  hint?: string;
}

function WorkspaceMark() {
  return <span className="iw-brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M6 25V12l10-6 10 6v13M11 24V15m5 9V12m5 12v-9" /></svg></span>;
}

/** The same map, controls and focus behavior for every operational workspace. */
export function WorkspaceFrame({ identity, destinations, children, account, photo, onSignOut, immersive = false, banner, primary }: {
  identity: 'Create' | 'Contribute' | 'Review';
  destinations: WorkspaceDestination[];
  children: ReactNode;
  account: string;
  photo?: string | null;
  onSignOut: () => void;
  immersive?: boolean;
  banner?: ReactNode;
  primary?: { to: string; label: string };
}) {
  const { path, navigate } = useRoute();
  const drawer = useRef<HTMLDialogElement>(null);
  const palette = useCommandPalette();
  const [online, setOnline] = useState(navigator.onLine);
  const previous = useRef(path);
  const current = destinations.find(item => item.active);
  const groups = [...new Set(destinations.map(item => item.group))];
  useEffect(() => {
    drawer.current?.close();
    document.title = `${current?.label ?? identity} · TribeStudio`;
    if (previous.current !== path) document.getElementById('main-content')?.focus({ preventScroll: true });
    previous.current = path;
  }, [path, current?.label, identity]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  const commands = useMemo(() => destinations.map(item => ({ id: item.to, label: item.label, group: item.group, hint: item.hint, icon: <Icon name={item.icon} />, run: () => navigate(item.to) })), [destinations, navigate]);
  const navigation = (mobile = false) => <nav aria-label={`${identity} workspace`} className="iw-nav">
    {groups.map(group => <div className="iw-nav-group" key={group}><p>{group}</p>{destinations.filter(item => item.group === group).map(item =>
      <Link key={item.to} to={item.to} aria-current={item.active ? 'page' : undefined} className={`iw-nav-link${item.active ? ' is-active' : ''}`} onClick={() => { if (mobile) drawer.current?.close(); }}>
        <Icon name={item.icon} /><span>{item.label}</span>{item.badge ? <span className="iw-nav-badge">{item.badge}</span> : null}
      </Link>)}</div>)}
  </nav>;
  const brand = <Link to={destinations[0]?.to ?? '/studio'} className="iw-brand"><WorkspaceMark /><span><strong>TribeStudio</strong><small>INDIGEN WORLD</small></span></Link>;
  return <div className={`iw-workspace iwx iw-workspace--${identity.toLowerCase()}${immersive ? ' iw-workspace--immersive' : ''}`}>
    <a href="#main-content" className="skip-link">Skip to workspace content</a>
    <aside className="iw-sidebar">{brand}<div className="iw-workspace-label"><Icon name={identity === 'Review' ? 'shield' : identity === 'Contribute' ? 'guide' : 'video'} /><strong>{identity}</strong><span>Workspace</span></div>
      {primary ? <Link to={primary.to} className="iw-button iw-button--primary iw-start"><Icon name="plus" />{primary.label}</Link> : null}
      {navigation()}
      <div className="iw-account"><span className="iw-avatar" aria-hidden="true">{photo ? <img src={photo} alt="" referrerPolicy="no-referrer" /> : account.slice(0, 1).toUpperCase()}</span><span><strong>{account}</strong><small>{identity === 'Review' ? 'Validator' : identity === 'Contribute' ? 'Contributor' : 'Creator'}</small></span><button type="button" aria-label="Sign out" onClick={() => { if (window.dispatchEvent(new Event('studio:before-navigate', { cancelable: true }))) onSignOut(); }}><Icon name="logout" /></button></div>
    </aside>
    <div className="iw-body">
      <header className="iw-topbar"><button type="button" className="iw-menu" aria-label="Open workspace navigation" aria-haspopup="dialog" onClick={() => drawer.current?.showModal()}><Icon name="menu" /></button><div className="iw-location"><span>{identity}</span><Icon name="chevron" /><strong>{current?.label ?? 'Workspace'}</strong></div><button type="button" className="iw-jump" aria-label="Go to a workspace page" aria-keyshortcuts="Control+k Meta+k" onClick={() => palette.setOpen(true)}><Icon name="search" /><span>Go to…</span><kbd>Ctrl K</kbd></button></header>
      {banner}
      {!online ? <div className="iw-offline" role="status"><Icon name="alert" /><span>You’re offline. Keep drafts open; saving and uploads need a connection.</span></div> : null}
      <main id="main-content" className="iw-main" tabIndex={-1}>{children}</main>
      <footer className="iw-status studio__status"><span><i className={online ? '' : 'is-offline'} />{online ? 'Online' : 'Offline'}</span><span>Indigen World · {identity} workspace</span></footer>
    </div>
    <dialog ref={drawer} className="iw-nav-drawer" aria-label="Workspace navigation" onClick={event => { if (event.target === event.currentTarget) drawer.current?.close(); }}><div className="iw-drawer-head">{brand}<button type="button" aria-label="Close workspace navigation" onClick={() => drawer.current?.close()}><Icon name="close" /></button></div><strong className="iw-drawer-role">{identity} workspace</strong>{navigation(true)}<button type="button" className="iw-drawer-signout" onClick={() => { if (window.dispatchEvent(new Event('studio:before-navigate', { cancelable: true }))) onSignOut(); }}><Icon name="logout" />Sign out</button></dialog>
    <CommandPalette open={palette.open} onClose={() => palette.setOpen(false)} commands={commands} />
  </div>;
}

export function ProcessGuide({ steps, current, label }: { steps: { title: string; detail: string; icon?: IconName }[]; current?: number; label: string }) {
  return <ol className="iw-process" aria-label={label}>{steps.map((step, index) => <li key={step.title} aria-current={current === index ? 'step' : undefined} className={current === index ? 'is-current' : ''}><span className="iw-process-marker">{step.icon ? <Icon name={step.icon} /> : index + 1}</span><span><strong>{step.title}</strong><small>{step.detail}</small></span>{index < steps.length - 1 ? <Icon name="chevron" /> : null}</li>)}</ol>;
}

/** Entry and access states keep the same identity as the workspace they open. */
export function WorkspaceEntry({ children, title = 'Make and manage your work.', description = 'Keep your material, drafts and next steps together.' }: { children: ReactNode; title?: string; description?: string }) {
  return <div className="iw-auth iw-entry"><aside className="iw-entry-guide"><Link to="/studio" className="iw-entry-brand"><WorkspaceMark /><strong>TribeStudio</strong><span>INDIGEN WORLD</span></Link><p className="iw-entry-kicker">Create workspace</p><h2>{title}</h2><p>{description}</p><ProcessGuide label="Creator workflow" steps={[{ title: 'Create', detail: 'Choose a format and save your draft', icon: 'doc' }, { title: 'Preview', detail: 'Check your material and permissions', icon: 'search' }, { title: 'Continue', detail: 'Publish open posts or follow campaign review', icon: 'check' }]} /></aside><main id="main-content" className="iw-entry-main" tabIndex={-1}><section className="iw-entry-panel">{children}</section><p className="iw-entry-help"><Link to="/creators/guidelines">Creator guidance</Link><span>·</span><Link to="/contributor/support">Sign-in support</Link></p></main></div>;
}

/** Native dialog supplies focus trapping, Escape and return-to-trigger behavior. */
export function WorkspaceDialog({ title, children, onClose, busy = false, className = '' }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  return <dialog ref={dialog} className={`iw-dialog ${className}`} aria-label={title} onCancel={event => { event.preventDefault(); if (!busy) close.current(); }}><div className="iw-dialog-head"><h2>{title}</h2><button type="button" aria-label="Close dialog" disabled={busy} onClick={onClose}><Icon name="close" /></button></div>{children}</dialog>;
}
