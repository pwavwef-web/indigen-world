import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import type { User } from "firebase/auth";
import { Link, useRoute } from "../../app/router";
import { BrandMark } from "../../components/BrandMark";
import { loginEmail, loginGoogle, logout } from "./api";
import { ALL_PHOTOS } from "./labs-media";
import { Field, TaskStatus, useTask } from "./LabsPage";

const NAV: [string, string][] = [
  ["labs", "Home"],
  ["labs/experiments", "Experiments"],
  ["labs/activity", "My activity"],
  ["labs/updates", "Updates"],
];

/** Closes a popover on Escape (returning focus to its trigger) or an outside click. */
function useDismiss(open: boolean, close: () => void, root: RefObject<HTMLElement | null>, trigger: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        trigger.current?.focus();
      }
    };
    const pointer = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) close();
    };
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", pointer);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", pointer);
    };
  }, [open, close, root, trigger]);
}

/** Google or email sign-in with the shared Indigen World account. Used in the header and in experiment gates. */
export function SignInPanel({ title = "Sign in to Indigen World", intro }: { title?: string; intro?: ReactNode }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    task = useTask(),
    headingId = useId();
  return (
    <section className="lab-signin" aria-labelledby={headingId}>
      <h2 id={headingId}>{title}</h2>
      <p>
        {intro ??
          "Use the same account as the Indigen World app and TribeStudio. You'll stay on this page."}
      </p>
      <button
        type="button"
        className="lab-btn lab-btn--secondary lab-btn--block"
        disabled={task.busy}
        onClick={() => void task.run(async () => { await loginGoogle(); })}
      >
        Continue with Google
      </button>
      <div className="lab-signin__or" aria-hidden="true"><span>or</span></div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void task.run(async () => { await loginEmail(email, password); });
        }}
      >
        <Field label="Email">
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Password">
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <button className="lab-btn lab-btn--block" disabled={task.busy}>
          {task.busy ? "Signing in…" : "Sign in with email"}
        </button>
      </form>
      <TaskStatus task={task} />
      <a className="lab-signin__help" href="https://tribestudio.indigenworld.com/studio">
        Need help with your account? Visit TribeStudio <span aria-hidden="true">↗</span>
      </a>
    </section>
  );
}

function AccountControl({ user, ready }: { user: User | null; ready: boolean }) {
  const [open, setOpen] = useState(false),
    root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    task = useTask(),
    panelId = useId(),
    { path } = useRoute();
  useDismiss(open, () => setOpen(false), root, trigger);
  useEffect(() => setOpen(false), [path, user?.uid]);
  if (!ready)
    return (
      <span className="lab-account-pending" role="status">
        <span className="lab-visually-hidden">Checking your account</span>
      </span>
    );
  const name = user?.displayName || user?.email || "Your account";
  return (
    <div className="lab-account" ref={root}>
      <button
        ref={trigger}
        type="button"
        className={user ? "lab-account__trigger" : "lab-btn lab-btn--small"}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
      >
        {user ? (
          <>
            <span className="lab-avatar" aria-hidden="true">{name.trim()[0]?.toUpperCase()}</span>
            <span className="lab-visually-hidden">Account menu for {name}</span>
          </>
        ) : (
          "Sign in"
        )}
      </button>
      {open && (
        <div className="lab-popover" id={panelId}>
          {user ? (
            <div className="lab-account__menu">
              <p className="lab-account__who">
                <span>Signed in as</span>
                <strong>{name}</strong>
              </p>
              <Link to="/labs/activity">My activity</Link>
              <button
                type="button"
                className="lab-btn lab-btn--secondary lab-btn--block"
                disabled={task.busy}
                onClick={() => void task.run(async () => { await logout(); })}
              >
                {task.busy ? "Signing out…" : "Sign out"}
              </button>
              <TaskStatus task={task} />
            </div>
          ) : (
            <SignInPanel />
          )}
        </div>
      )}
    </div>
  );
}

export function LabsHeader({ user, ready, canAdmin }: { user: User | null; ready: boolean; canAdmin: boolean }) {
  const { path } = useRoute(),
    [menu, setMenu] = useState(false),
    toggle = useRef<HTMLButtonElement>(null),
    sheet = useRef<HTMLDivElement>(null),
    root = useRef<HTMLElement>(null),
    menuId = useId(),
    links = canAdmin ? [...NAV, ["labs/admin", "Admin"] as [string, string]] : NAV;
  // Experiment pages belong to Experiments in the navigation.
  const active = (route: string) =>
    path === route ||
    (route === "labs/experiments" && path.startsWith("labs/") && !NAV.some(([r]) => r === path) && path !== "labs/admin");
  useEffect(() => setMenu(false), [path]);
  useDismiss(menu, () => setMenu(false), root, toggle);
  useEffect(() => {
    if (menu) sheet.current?.querySelector<HTMLElement>("a")?.focus();
  }, [menu]);
  const nav = (className: string) =>
    links.map(([route, label]) => (
      <Link key={route} className={className} to={`/${route}`} aria-current={active(route) ? "page" : undefined}>
        {label}
      </Link>
    ));
  return (
    <header className="lab-header" ref={root}>
      <div className="lab-header__bar">
        <Link className="lab-brand" to="/labs" aria-label="Indigen World Labs home">
          <span className="lab-brand__tile"><BrandMark /></span>
          <span className="lab-brand__word">
            Indigen World <strong>Labs</strong>
          </span>
        </Link>
        <nav className="lab-nav" aria-label="Labs">{nav("lab-nav__link")}</nav>
        <div className="lab-header__end">
          <a className="lab-world-link" href="/">
            Indigen World <span aria-hidden="true">↗</span>
          </a>
          <AccountControl user={user} ready={ready} />
          <button
            ref={toggle}
            type="button"
            className="lab-menu-toggle"
            aria-expanded={menu}
            aria-controls={menuId}
            onClick={() => setMenu(!menu)}
          >
            <span className="lab-menu-toggle__icon" aria-hidden="true" />
            <span className="lab-visually-hidden">{menu ? "Close menu" : "Open menu"}</span>
          </button>
        </div>
      </div>
      <div className="lab-sheet" id={menuId} ref={sheet} hidden={!menu}>
        <nav aria-label="Labs (mobile)">{nav("lab-sheet__link")}</nav>
        <a className="lab-sheet__world" href="/">
          Back to Indigen World <span aria-hidden="true">↗</span>
        </a>
      </div>
    </header>
  );
}

export function LabsFooter() {
  return (
    <footer className="lab-footer">
      <div className="lab-footer__inner">
        <div className="lab-footer__brand">
          <Link to="/labs">Indigen World Labs</Link>
          <p>Experiments for learning, creating and contributing around living languages and cultures.</p>
        </div>
        <nav className="lab-footer__links" aria-label="Labs footer">
          <Link to="/labs/experiments">Experiments</Link>
          <Link to="/labs/updates">Updates</Link>
          <a href="/contribute">Contribute</a>
          <a href="/privacy">Privacy</a>
          <a href="/">Indigen World ↗</a>
        </nav>
      </div>
      <details className="lab-credits">
        <summary>Photo credits and licences</summary>
        <p>
          Real photographs from Wikimedia Commons, credited to their photographers. Places and scenes are described as the
          photographers recorded them.
        </p>
        <ul>
          {ALL_PHOTOS.filter((p, i, all) => all.findIndex((q) => q.sourceUrl === p.sourceUrl) === i).map((p) => (
            <li key={p.id}>
              <a href={p.sourceUrl}>{p.caption}</a> — {p.credit},{" "}
              <a href={p.licenceUrl}>{p.licence}</a>
            </li>
          ))}
        </ul>
      </details>
    </footer>
  );
}
