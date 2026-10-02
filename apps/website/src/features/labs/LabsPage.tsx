import { PageMotion } from "../../components/PageMotion";
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  LABS_REGISTRY,
  type Experiment,
  type LabsSource,
} from "@indigen-world/contracts/labs";
import { Link, useRoute } from "../../app/router";
import { useDocumentMeta } from "../../lib/useDocumentMeta";
import {
  errorMessage,
  labsCall,
  loginEmail,
  loginGoogle,
  logout,
  useLabsAccount,
} from "./api";
import { PracticeWorkspace, StoryWorkspace } from "./workspaces";
import { Activity, Admin, Updates } from "./records";
import { QuestWorkspace } from "./quest";
import { RunnerWorkspace } from "./runner";
import "./labs.css";

export function useTask() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, message, setMessage, run };
}
export function TaskStatus({ task }: { task: ReturnType<typeof useTask> }) {
  return (
    <>
      {task.error && (
        <p className="labs-notice labs-error" role="alert">
          {task.error}
        </p>
      )}
      {task.message && (
        <p className="labs-notice" role="status">
          {task.message}
        </p>
      )}
    </>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="labs-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Account() {
  const [open, setOpen] = useState(false),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    task = useTask();
  return (
    <div className="labs-account">
      <button
        className="labs-button labs-button-small"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        Sign in ↗
      </button>
      {open && (
        <div className="labs-login labs-panel">
          <h2>Your Indigen World account</h2>
          <p>
            Use the same account as the app or TribeStudio. Sign in to save
            practice, drafts and feedback.
          </p>
          <button
            className="labs-button labs-secondary"
            disabled={task.busy}
            onClick={() =>
              void task.run(async () => {
                await loginGoogle();
              })
            }
          >
            Continue with Google
          </button>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void task.run(async () => {
                await loginEmail(email, password);
              });
            }}
          >
            <Field label="Email">
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
            <button className="labs-button" disabled={task.busy}>
              Sign in with email
            </button>
          </form>
          <TaskStatus task={task} />
          <a href="https://tribestudio.indigenworld.com/studio">
            Account help in TribeStudio
          </a>
        </div>
      )}
    </div>
  );
}
export function FeedbackForm({
  experiment,
  reference = "",
  languageIssue = false,
}: {
  experiment: Experiment;
  reference?: string;
  languageIssue?: boolean;
}) {
  const task = useTask(),
    [type, setType] = useState(languageIssue ? "language issue" : "suggestion"),
    [description, setDescription] = useState(""),
    [steps, setSteps] = useState(""),
    [consent, setConsent] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void task.run(async () => {
      await labsCall("submitFeedback", {
        experimentId: experiment.id,
        version: experiment.version,
        type,
        reference,
        description,
        steps,
        contactConsent: consent,
      });
      setDescription("");
      setSteps("");
      task.setMessage("Feedback submitted. Follow its status in My activity.");
    });
  };
  return (
    <form className="labs-form" onSubmit={submit}>
      <h3>Help shape this experiment</h3>
      <p>
        No private draft text or recording is attached automatically. Language
        reports go to a review queue.
      </p>
      {reference && <p className="labs-meta">Reference: {reference}</p>}
      <Field label="Feedback type">
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {experiment.feedbackTypes.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </Field>
      <Field label="What happened, or what would help?">
        <textarea
          required
          maxLength={5000}
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <Field label="Steps to reproduce (optional)">
        <textarea
          maxLength={3000}
          rows={2}
          value={steps}
          onChange={(e) => setSteps(e.target.value)}
        />
      </Field>
      <label className="labs-check">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        You may contact me through my existing account about this report.
      </label>
      <button className="labs-button" disabled={task.busy}>
        {task.busy ? "Submitting…" : "Submit feedback"}
      </button>
      <TaskStatus task={task} />
    </form>
  );
}
export function SourceNotes({ sources }: { sources: LabsSource[] }) {
  return (
    <div className="labs-sources">
      <h3>Reviewed source notes</h3>
      {!sources.length ? (
        <p>
          No reviewed source selected. This draft is entirely your own creative
          work.
        </p>
      ) : (
        sources.map((s) => (
          <article key={s.ref}>
            <span className="labs-tag">
              {s.kind} ·{" "}
              {s.developmentFixture
                ? "development fixture — simulated review"
                : "reviewed"}
            </span>
            <p className="labs-source-original">{s.original}</p>
            <p>{s.meaning}</p>
            {s.audioCredit && <p className="labs-meta">{s.audioCredit}</p>}
            {s.context && <p>{s.context}</p>}
            <p className="labs-meta">
              {s.attribution} · {s.ref} · revision {s.revision}
            </p>
            {s.url && <a href={s.url}>Open source ↗</a>}
          </article>
        ))
      )}
    </div>
  );
}
function Preview({ experiment }: { experiment: Experiment }) {
  return (
    <div
      className={`labs-preview labs-preview-${experiment.id}`}
      aria-hidden="true"
    >
      {experiment.id === "word-trail" ? (<><span className="labs-preview-label">RUN / CONTRIBUTE</span><div className="labs-preview-word">Dodge.<br />Translate.<br /><em>Keep going.</em></div><span className="labs-preview-foot">A word opens the next section.</span></>) : experiment.id === "culture-quest" ? (<><span className="labs-preview-label">PLAY / CONTRIBUTE</span><div className="labs-preview-word">Explore.<br />Contribute.<br /><em>Level up.</em></div><span className="labs-preview-foot">Three missions. A living archive.</span></>) : experiment.id === "kasem-practice" ? (
        <>
          <span className="labs-preview-label">KASEM / PRACTICE</span>
          <div className="labs-preview-word">
            Listen.
            <br />
            Match.
            <br />
            <em>Remember.</em>
          </div>
          <div className="labs-preview-options">
            <span>Meaning</span>
            <span>Expression</span>
            <span>Reviewed audio</span>
          </div>
        </>
      ) : (
        <>
          <span className="labs-preview-label">CULTURE / CREATE</span>
          <div className="labs-paper">
            <span>Source → Story</span>
            <div />
            <div />
            <div />
            <p>
              A beginning.
              <br />A moment.
              <br />
              <em>Your voice.</em>
            </p>
          </div>
          <span className="labs-preview-foot">
            Rooted in sources. Open to imagination.
          </span>
        </>
      )}
    </div>
  );
}
function ExperimentCard({ experiment }: { experiment: Experiment }) {
  return (
    <article className="labs-card">
      <Link
        to={`/labs/${experiment.slug}`}
        className="labs-preview-link"
        aria-label={`Explore ${experiment.name}`}
      >
        <Preview experiment={experiment} />
      </Link>
      <div className="labs-card-body">
        <div className="labs-row">
          <span className="labs-meta">{experiment.category}</span>
          <span className="labs-tag">{experiment.status}</span>
        </div>
        <h3>
          <Link to={`/labs/${experiment.slug}`}>{experiment.name}</Link>
        </h3>
        <p>{experiment.purpose}</p>
        <div className="labs-card-bottom">
          <span className="labs-meta">
            {!experiment.enabled
              ? "Paused"
              : experiment.status === "retired"
                ? "Retired"
                : experiment.access === "signed-in"
                  ? "Sign in to participate"
                  : experiment.access}
          </span>
          <Link to={`/labs/${experiment.slug}`}>Explore ↗</Link>
        </div>
      </div>
    </article>
  );
}
function Catalogue({ experiments }: { experiments: Experiment[] }) {
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState("All"),
    [status, setStatus] = useState("All"),
    found = experiments.filter(
      (e) =>
        `${e.name} ${e.purpose}`.toLowerCase().includes(search.toLowerCase()) &&
        (category === "All" || e.category === category) &&
        (status === "All" || e.status === status),
    );
  return (
    <>
      <div className="labs-page-heading">
        <PageMotion placement="inline" />
        <p className="labs-eyebrow">THE EXPERIMENTS</p>
        <h1>Find your next small discovery.</h1>
        <p>
          Focused experiments. Try what interests you and tell us what you
          learn.
        </p>
      </div>
      <div className="labs-filters">
        <Field label="Search experiments">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Language, stories…"
          />
        </Field>
        <Field label="Category">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {["All", "Language", "Creating", "Contributing"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Lifecycle">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {["All", "prototype", "alpha", "beta", "graduated", "retired"].map(
              (c) => (
                <option key={c}>{c}</option>
              ),
            )}
          </select>
        </Field>
      </div>
      <div className="labs-grid">
        {found.map((e) => (
          <ExperimentCard key={e.id} experiment={e} />
        ))}
      </div>
      {!found.length && (
        <p className="labs-notice">No experiments match these filters.</p>
      )}
    </>
  );
}
interface Bootstrap {
  development: boolean;
  experiments: Experiment[];
  invited: string[];
  canAdmin: boolean;
  aiEnabled: boolean;
}
function ExperimentShell({
  experiment,
  loaded,
  userId,
  invited,
  canAdmin,
  aiEnabled,
}: {
  experiment: Experiment;
  loaded: boolean;
  userId?: string;
  invited: string[];
  canAdmin: boolean;
  aiEnabled: boolean;
}) {
  const retired = ["retired", "graduated"].includes(experiment.status),
    allowed =
      loaded &&
      experiment.enabled &&
      !retired &&
      (!["culture-quest", "word-trail"].includes(experiment.id) || !!userId) &&
      (experiment.access === "public" || !!userId) &&
      (experiment.access !== "invited testers" ||
        invited.includes(experiment.id) ||
        canAdmin);
  useEffect(() => {
    if (loaded)
      void labsCall("event", {
        experimentId: experiment.id,
        type: "experimentOpened",
      }).catch(() => {});
  }, [experiment.id, loaded]);
  return (
    <>
      <Link className="labs-back" to="/labs/experiments">
        ← All experiments
      </Link>
      <div className="labs-detail-heading">
        <PageMotion placement="inline" />
        <div>
          <p className="labs-eyebrow">
            {experiment.category.toUpperCase()} /{" "}
            {experiment.status.toUpperCase()}
          </p>
          <h1>{experiment.name}</h1>
          <p>{experiment.purpose}</p>
        </div>
        <span className="labs-tag">v{experiment.version}</span>
      </div>
      <div className="labs-workspace-layout">
        <section className="labs-panel labs-workspace">
          <h2>
            {experiment.id === "kasem-practice"
              ? "A few minutes of practice"
              : experiment.id === "word-trail" ? "Every word takes you further" : experiment.id === "culture-quest" ? "An expedition with a purpose" : "A story starts here"}
          </h2>
          {!allowed &&
          !(
            userId &&
            experiment.id === "cultural-story" &&
            new URLSearchParams(window.location.search).has("draft")
          ) ? (
            <div className="labs-empty">
              <span aria-hidden="true">◌</span>
              <h3>
                {!loaded
                  ? "Waiting for the Labs service"
                  : retired
                    ? experiment.status === "graduated"
                      ? "This experiment has graduated"
                      : "This experiment is retired"
                    : !experiment.enabled
                      ? "Taking a pause"
                      : !userId
                        ? "Your practice, your account"
                        : "Invited testers only"}
              </h3>
              <p>
                {!loaded
                  ? "Availability could not be confirmed. Use Retry above before starting."
                  : retired
                    ? "You can still read the details and open your saved activity."
                    : !experiment.enabled
                      ? "The team has paused new work while this experiment is improved. Your activity is still available."
                      : !userId
                        ? "Sign in above with your Indigen World account to try this experiment and keep your activity."
                        : "The team is testing this version with a smaller group."}
              </p>
            </div>
          ) : experiment.id === "word-trail" ? (
            <RunnerWorkspace key={userId} />
          ) : experiment.id === "culture-quest" ? (
            <QuestWorkspace key={userId} />
          ) : experiment.id === "kasem-practice" ? (
            <PracticeWorkspace
              key={userId ?? "guest"}
              experiment={experiment}
              signedIn={!!userId}
            />
          ) : (
            <StoryWorkspace
              key={userId ?? "guest"}
              experiment={experiment}
              signedIn={!!userId}
              aiEnabled={aiEnabled}
              canExecute={allowed}
            />
          )}
        </section>
        <aside className="labs-sidebar">
          <section className="labs-panel">
            <h3>How to try it</h3>
            <p>{experiment.instructions}</p>
            <h3>What to keep in mind</h3>
            <p>{experiment.limitations}</p>
            <div className="labs-rule" />
            <p className="labs-meta">
              Access: {experiment.access}
              <br />
              Availability: {experiment.enabled ? "Enabled" : "Paused"}
              <br />
              Updated: {experiment.updatedAt.slice(0, 10)}
            </p>
            <a
              className="labs-text-link"
              href={experiment.destination}
              onClick={() => {
                void labsCall("event", {
                  experimentId: experiment.id,
                  type: "relatedProductOpened",
                }).catch(() => {});
              }}
            >
              {experiment.destinationLabel} ↗
            </a>
          </section>
          <section className="labs-panel">
            {userId ? (
              <FeedbackForm experiment={experiment} />
            ) : (
              <>
                <h3>Help shape what comes next</h3>
                <p>Sign in to submit feedback and follow its review status.</p>
              </>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
export function LabsPage() {
  const { path } = useRoute(),
    { user, ready } = useLabsAccount(),
    [data, setData] = useState<Bootstrap | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [refresh, setRefresh] = useState(0),
    [controlMessage, setControlMessage] = useState(""),
    accountTask = useTask(),
    reload = useCallback(() => setRefresh((n) => n + 1), []);
  useEffect(() => {
    if (!ready) return;
    let live = true;
    setData(null);
    setLoading(true);
    setError("");
    labsCall<Bootstrap>("bootstrap")
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e) => {
        if (live) setError(errorMessage(e));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [user, ready, refresh]);
  useDocumentMeta(
    "Labs",
    "Try new ways to learn, create, and connect with indigenous culture. Help shape what comes next.",
    { noindex: path !== "labs" },
  );
  const experiments = data?.experiments ?? [...LABS_REGISTRY],
    detail = experiments.find((e) => path === `labs/${e.slug}`);
  return (
    <div className="labs-root">
      <header className="labs-header">
        <Link className="labs-brand" to="/labs">
          <span className="labs-brand-mark" aria-hidden="true">
            i<span>·</span>
          </span>
          <span>
            Indigen World <strong>Labs</strong>
          </span>
        </Link>
        <div className="labs-header-end">
          <a className="labs-world-link" href="/">
            Back to Indigen World ↗
          </a>
          {user ? (
            <button
              className="labs-button labs-button-small labs-secondary"
              disabled={accountTask.busy}
              onClick={() =>
                void accountTask.run(async () => {
                  await logout();
                })
              }
            >
              Sign out
            </button>
          ) : ready ? (
            <Account />
          ) : (
            <span>Loading account…</span>
          )}
        </div>
      </header>
      <nav className="labs-nav" aria-label="Labs">
        <div>
          {[
            ["labs", "Home"],
            ["labs/experiments", "Experiments"],
            ["labs/activity", "My activity"],
            ["labs/updates", "Updates"],
            ...(data?.canAdmin ? [["labs/admin", "Admin"]] : []),
          ].map(([route, label]) => (
            <Link
              key={route}
              to={`/${route}`}
              aria-current={path === route ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </div>
        <span className="labs-beta">A space to try what’s next</span>
      </nav>
      <div className="labs-container">
        {data?.development && (
          <p className="labs-notice">
            Local development demo. Fixture entries demonstrate the workflow and
            are not reviewed Kasem or cultural material. They are excluded from
            production.
          </p>
        )}
        <TaskStatus task={accountTask} />
        {loading && (
          <p className="labs-service" role="status">
            Checking experiment availability…
          </p>
        )}
        {error && (
          <div className="labs-notice labs-error" role="alert">
            {error}{" "}
            <button className="labs-text-button" onClick={reload}>
              Retry
            </button>
          </div>
        )}
        {path === "labs" ? (
          <>
            <section className="labs-hero">
              <div>
                <p className="labs-eyebrow">
                  <span className="labs-live-dot" /> INDIGEN WORLD LABS
                </p>
                <h1>
                  Small experiments.
                  <br />
                  <em>Living culture.</em>
                </h1>
                <p className="labs-intro">
                  Try new ways to learn, create, and connect with indigenous
                  culture. Help shape what comes next.
                </p>
                <Link className="labs-button" to="/labs/experiments">
                  Explore experiments ↗
                </Link>
                <p className="labs-hero-note">
                  Made for the curious. Built with the community.
                </p>
              </div>
              <div className="labs-hero-art labs-hero-art--motion">
                <PageMotion placement="art" />
              </div>
            </section>
            <section>
              <div className="labs-section-heading">
                <div>
                  <p className="labs-eyebrow">START EXPLORING</p>
                  <h2>More ways to get involved.</h2>
                </div>
                <Link to="/labs/experiments">View all experiments ↗</Link>
              </div>
              <div className="labs-grid">
                {experiments.map((e) => (
                  <ExperimentCard key={e.id} experiment={e} />
                ))}
              </div>
            </section>
            <section className="labs-principles">
              <div>
                <span>01 / TRY</span>
                <h3>Something small, something useful.</h3>
                <p>
                  A short practice session. A story idea. Start wherever your
                  curiosity takes you.
                </p>
              </div>
              <div>
                <span>02 / TELL US</span>
                <h3>Your experience matters.</h3>
                <p>
                  Share a language concern, a rough edge or an idea. Follow your
                  feedback as it is reviewed.
                </p>
              </div>
              <div>
                <span>03 / FOLLOW ALONG</span>
                <h3>Experiments grow and change.</h3>
                <p>
                  Some become part of Indigen World. Others pause or retire.
                  We’ll explain what changes.
                </p>
                <Link to="/labs/updates">Follow the updates ↗</Link>
              </div>
            </section>
          </>
        ) : path === "labs/experiments" ? (
          <Catalogue experiments={experiments} />
        ) : detail ? (
          <ExperimentShell
            experiment={detail}
            loaded={!!data}
            userId={user?.uid}
            invited={data?.invited ?? []}
            canAdmin={data?.canAdmin ?? false}
            aiEnabled={data?.aiEnabled ?? false}
          />
        ) : path === "labs/activity" ? (
          user ? (
            <Activity key={user.uid} />
          ) : (
            <div className="labs-empty">
              <PageMotion placement="inline" />
              <h1>My activity</h1>
              <p>
                Sign in above to reopen your private drafts, practice sessions
                and feedback.
              </p>
            </div>
          )
        ) : path === "labs/updates" ? (
          <Updates />
        ) : path === "labs/admin" ? (
          data?.canAdmin ? (
            <>
              {controlMessage && (
                <p className="labs-notice" role="status">
                  {controlMessage}
                </p>
              )}
              <Admin
                experiments={experiments}
                onChanged={() => {
                  setControlMessage("Experiment controls saved and audited.");
                  reload();
                }}
              />
            </>
          ) : (
            <div className="labs-empty">
              <PageMotion placement="inline" />
              <h1>Admin access required</h1>
              <p>
                This workspace is available to administrators with a trusted
                account role.
              </p>
            </div>
          )
        ) : null}
      </div>
      <footer className="labs-footer">
        <Link to="/labs">Indigen World Labs</Link>
        <span>Culture belongs in the future.</span>
        <div>
          <a href="/privacy">Privacy</a>
          <a href="/contribute">Contribute</a>
          <a href="/">Indigen World ↗</a>
        </div>
      </footer>
    </div>
  );
}
