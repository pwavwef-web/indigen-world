import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import { useRoute } from '../router';
import { Avatar, BrandMark, Icon, cx, type IconName } from './components';

/**
 * The application shell shared by the contributor and validator workspaces.
 *
 * It answers "where am I?" three times over — the highlighted section, the
 * trail above the content and the document title — and keeps the next action
 * one click away: the primary action sits under the brand on desktop and in
 * the middle of the phone's tab bar.
 *
 * Only sections a person may use are passed in, so the shell never shows a
 * door that opens onto "access denied".
 */

export interface NavBadge {
  text: string;
  tone: 'warning' | 'info' | 'danger' | 'neutral';
  /** Read out instead of the number: "2 returned for revision". */
  label: string;
}

export interface NavEntry {
  id: string;
  label: string;
  /** A shorter label for the phone tab bar. */
  short?: string;
  href: string;
  icon: IconName;
  badge?: NavBadge | null;
}

export interface RoleSwitch {
  current: 'contributor' | 'validator';
  contributorHref: string;
  validatorHref: string;
}

export interface ShellUser {
  name: string;
  email: string;
  photoUrl?: string;
  accountHref?: string;
  accountLabel?: string;
}

export interface AppShellProps {
  workspaceLabel: string;
  homeHref: string;
  nav: NavEntry[];
  secondary?: { label: string; items: NavEntry[] };
  activeId: string | null;
  primaryAction?: { id: string; label: string; short?: string; href: string; icon: IconName } | null;
  roles?: RoleSwitch | null;
  user: ShellUser;
  updates?: { href: string; count: number } | null;
  trail: { label: string; href?: string }[];
  /** Ids from `nav` shown in the phone tab bar, around the primary action. */
  mobileTabs: string[];
  title: string;
  banner?: ReactNode;
  editing?: boolean;
  wide?: boolean;
  onSignOut: () => void;
  className?: string;
  children: ReactNode;
}

/** An anchor that navigates inside the app without a reload, and still opens in a new tab when asked to. */
export function RouteLink({ to, children, className, ariaLabel, ariaCurrent, title, onNavigate }: {
  to: string;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
  ariaCurrent?: 'page' | 'true' | 'step';
  title?: string;
  onNavigate?: () => void;
}) {
  const { navigate } = useRoute();
  return (
    <a
      href={to}
      className={className}
      aria-label={ariaLabel}
      aria-current={ariaCurrent}
      title={title}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        onNavigate?.();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

function NavLink({ entry, active, variant, onNavigate }: { entry: NavEntry; active: boolean; variant: 'side' | 'sheet'; onNavigate?: () => void }) {
  return (
    <RouteLink
      to={entry.href}
      className={cx('cw-nav__link', `cw-nav__link--${variant}`)}
      ariaCurrent={active ? 'page' : undefined}
      ariaLabel={entry.badge ? `${entry.label}, ${entry.badge.label}` : undefined}
      onNavigate={onNavigate}
    >
      <Icon name={entry.icon} />
      <span className="cw-nav__label">{entry.label}</span>
      {entry.badge ? <span className={cx('cw-nav__badge', `cw-nav__badge--${entry.badge.tone}`)} aria-hidden="true">{entry.badge.text}</span> : null}
    </RouteLink>
  );
}

function RoleSwitcher({ roles, onNavigate }: { roles: RoleSwitch; onNavigate?: () => void }) {
  return (
    <nav className="cw-role-switch" aria-label="Switch workspace">
      <RouteLink to={roles.contributorHref} ariaCurrent={roles.current === 'contributor' ? 'true' : undefined} onNavigate={onNavigate}>Contributing</RouteLink>
      <RouteLink to={roles.validatorHref} ariaCurrent={roles.current === 'validator' ? 'true' : undefined} onNavigate={onNavigate}>Reviewing</RouteLink>
    </nav>
  );
}

export function AppShell(props: AppShellProps) {
  const {
    workspaceLabel, homeHref, nav, secondary, activeId, primaryAction, roles, user, updates, trail,
    mobileTabs, title, banner, editing = false, wide = false, onSignOut, className, children,
  } = props;
  const sheet = useRef<HTMLDialogElement>(null);
  const closeSheet = () => sheet.current?.close();

  useEffect(() => {
    document.title = `${title} · ${workspaceLabel} · TribeStudio`;
  }, [title, workspaceLabel]);

  const tabEntries = mobileTabs.map((id) => nav.find((entry) => entry.id === id)).filter((entry): entry is NavEntry => Boolean(entry));
  const inTabs = new Set(tabEntries.map((entry) => entry.id));
  const sheetEntries = [...nav.filter((entry) => !inTabs.has(entry.id)), ...(secondary?.items ?? [])];
  const sheetBadge = sheetEntries.find((entry) => entry.badge)?.badge ?? null;
  const moreActive = Boolean(activeId) && !inTabs.has(activeId ?? '') && activeId !== primaryAction?.id;
  const accountActive = activeId === 'account';

  const tab = (entry: NavEntry) => (
    <RouteLink
      key={entry.id}
      to={entry.href}
      className="cw-tab-link"
      ariaCurrent={entry.id === activeId ? 'page' : undefined}
      ariaLabel={entry.badge ? `${entry.label}, ${entry.badge.label}` : entry.label}
    >
      <Icon name={entry.icon} />
      <span className="cw-tab-link__label">{entry.short ?? entry.label}</span>
      {entry.badge ? <span className={cx('cw-nav__badge', `cw-nav__badge--${entry.badge.tone}`)} aria-hidden="true">{entry.badge.text}</span> : null}
    </RouteLink>
  );

  const half = Math.ceil(tabEntries.length / 2);

  return (
    <div className={cx('cw', editing && 'is-editing', className)}>
      <a href="#main-content" className="cw-skip">Skip to content</a>

      <aside className="cw-sidebar" aria-label={workspaceLabel}>
        <RouteLink to={homeHref} className="cw-brand" ariaLabel={`TribeStudio ${workspaceLabel}, home`}>
          <BrandMark />
          <span className="cw-brand__copy"><strong>TribeStudio</strong><small>{workspaceLabel}</small></span>
        </RouteLink>
        {roles ? <RoleSwitcher roles={roles} /> : null}
        {primaryAction ? (
          <div className="cw-sidebar__action">
            <RouteLink to={primaryAction.href} className="cw-btn cw-btn--primary" ariaCurrent={activeId === primaryAction.id ? 'page' : undefined}>
              <Icon name={primaryAction.icon} />{primaryAction.label}
            </RouteLink>
          </div>
        ) : null}
        <nav className="cw-nav-group" aria-label="Sections">
          {nav.map((entry) => <NavLink key={entry.id} entry={entry} active={entry.id === activeId} variant="side" />)}
        </nav>
        {secondary?.items.length ? (
          <nav className="cw-nav-group" aria-label={secondary.label}>
            <p className="cw-nav-group__label" aria-hidden="true">{secondary.label}</p>
            {secondary.items.map((entry) => <NavLink key={entry.id} entry={entry} active={entry.id === activeId} variant="side" />)}
          </nav>
        ) : null}
        <div className="cw-sidebar__footer">
          {user.accountHref ? (
            <RouteLink to={user.accountHref} className="cw-account-link" ariaCurrent={accountActive ? 'page' : undefined} title={user.accountLabel ?? 'Profile and settings'}>
              <Avatar name={user.name || user.email} photoUrl={user.photoUrl} />
              <span className="cw-account-link__who"><strong>{user.name || 'Your account'}</strong><small>{user.email}</small></span>
            </RouteLink>
          ) : (
            <div className="cw-account-link">
              <Avatar name={user.name || user.email} photoUrl={user.photoUrl} />
              <span className="cw-account-link__who"><strong>{user.name || 'Signed in'}</strong><small>{user.email}</small></span>
            </div>
          )}
          <button type="button" className="cw-signout" onClick={onSignOut}><Icon name="logout" />Sign out</button>
        </div>
      </aside>

      <header className="cw-topbar">
        <RouteLink to={homeHref} className="cw-topbar__home" ariaLabel={`${workspaceLabel} home`}><BrandMark /></RouteLink>
        <div className="cw-topbar__title"><strong>{title}</strong><small>{workspaceLabel}</small></div>
        <div className="cw-topbar__actions">
          {updates ? (
            <RouteLink to={updates.href} className="cw-updates-link" ariaLabel={updates.count ? `Updates, ${updates.count} new` : 'Updates'} ariaCurrent={activeId === 'activity' ? 'page' : undefined}>
              <Icon name="bell" />{updates.count ? <span className="cw-updates-link__dot" aria-hidden="true" /> : null}
            </RouteLink>
          ) : null}
          {user.accountHref ? (
            <RouteLink to={user.accountHref} className="cw-topbar__account" ariaLabel={user.accountLabel ?? 'Profile and settings'}>
              <Avatar name={user.name || user.email} photoUrl={user.photoUrl} size="small" />
            </RouteLink>
          ) : null}
        </div>
      </header>

      <div className="cw-main">
        <div className="cw-utility">
          <nav className="cw-trail" aria-label="You are here">
            {trail.map((step, index) => (
              <span key={`${step.label}-${index}`} className="cw-row">
                {index ? <span className="cw-trail__sep" aria-hidden="true">/</span> : null}
                {step.href && index < trail.length - 1
                  ? <RouteLink to={step.href}>{step.label}</RouteLink>
                  : <span aria-current={index === trail.length - 1 ? 'page' : undefined}>{step.label}</span>}
              </span>
            ))}
          </nav>
          {updates ? (
            <div className="cw-utility__actions">
              <RouteLink to={updates.href} className="cw-updates-link" ariaCurrent={activeId === 'activity' ? 'page' : undefined} ariaLabel={updates.count ? `Updates, ${updates.count} new` : 'Updates'}>
                <Icon name="bell" />Updates
                {updates.count ? <><span className="cw-updates-link__dot" aria-hidden="true" /><span className="cw-count cw-count--accent" aria-hidden="true">{updates.count}</span></> : null}
              </RouteLink>
            </div>
          ) : null}
        </div>
        {banner}
        <main id="main-content" tabIndex={-1} className={cx('cw-content', wide && 'cw-content--wide')}>
          {children}
        </main>
      </div>

      <nav className="cw-tabbar" aria-label="Sections">
        {tabEntries.slice(0, half).map(tab)}
        {primaryAction ? (
          <RouteLink to={primaryAction.href} className="cw-tab-link cw-tab-link--primary" ariaCurrent={activeId === primaryAction.id ? 'page' : undefined} ariaLabel={primaryAction.label}>
            <Icon name={primaryAction.icon} />
            <span className="cw-tab-link__label">{primaryAction.short ?? primaryAction.label}</span>
          </RouteLink>
        ) : null}
        {tabEntries.slice(half).map(tab)}
        <button
          type="button"
          className={cx('cw-tab-link', moreActive && 'is-active')}
          aria-haspopup="dialog"
          aria-label={sheetBadge ? `More sections, ${sheetBadge.label}` : 'More sections'}
          onClick={() => sheet.current?.showModal()}
        >
          <Icon name="more" />
          <span className="cw-tab-link__label">More</span>
          {sheetBadge ? <span className={cx('cw-nav__badge', `cw-nav__badge--${sheetBadge.tone}`)} aria-hidden="true">{sheetBadge.text}</span> : null}
        </button>
      </nav>

      <dialog
        ref={sheet}
        className="cw-sheet"
        aria-label="More sections"
        onClick={(event) => { if (event.target === event.currentTarget) closeSheet(); }}
      >
        <div className="cw-sheet__head">
          <strong>{workspaceLabel}</strong>
          <button type="button" className="cw-icon-button" onClick={closeSheet} aria-label="Close"><Icon name="close" /></button>
        </div>
        <div className="cw-sheet__body">
          {roles ? <RoleSwitcher roles={roles} onNavigate={closeSheet} /> : null}
          <nav className="cw-nav-group" aria-label="More sections">
            {sheetEntries.map((entry) => <NavLink key={entry.id} entry={entry} active={entry.id === activeId} variant="sheet" onNavigate={closeSheet} />)}
            {updates ? (
              <RouteLink to={updates.href} className="cw-nav__link cw-nav__link--sheet" ariaCurrent={activeId === 'activity' ? 'page' : undefined} onNavigate={closeSheet}>
                <Icon name="bell" /><span className="cw-nav__label">Updates</span>
                {updates.count ? <span className="cw-nav__badge cw-nav__badge--info" aria-hidden="true">{updates.count}</span> : null}
              </RouteLink>
            ) : null}
            {user.accountHref ? (
              <RouteLink to={user.accountHref} className="cw-nav__link cw-nav__link--sheet" ariaCurrent={accountActive ? 'page' : undefined} onNavigate={closeSheet}>
                <Icon name="account" /><span className="cw-nav__label">{user.accountLabel ?? 'Profile and settings'}</span>
              </RouteLink>
            ) : null}
          </nav>
          <div className="cw-sidebar__footer">
            <div className="cw-account-link">
              <Avatar name={user.name || user.email} photoUrl={user.photoUrl} />
              <span className="cw-account-link__who"><strong>{user.name || 'Signed in'}</strong><small>{user.email}</small></span>
            </div>
            <button type="button" className="cw-signout" onClick={() => { closeSheet(); onSignOut(); }}><Icon name="logout" />Sign out</button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
