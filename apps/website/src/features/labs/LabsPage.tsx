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
import { errorMessage, labsCall, useLabsAccount } from "./api";
import { PracticeWorkspace, StoryWorkspace } from "./workspaces";
import { Activity, Admin, Updates } from "./records";
import { QuestWorkspace } from "./quest";
import { RunnerWorkspace } from "./runner";
import { MODE_LABELS, accessFor, accessNote, present, type AccessState, type LabsViewer } from "./access";
import { Collection, FeaturedRow, ModeShortcuts, StatusBadge } from "./cards";
import { HeroCarousel } from "./HeroCarousel";
import { ContinueExploring, PurposeSection, ShapeTheLab, UpdatesStrip } from "./home";
import { HERO_PHOTOS } from "./labs-media";
import { ExperimentPreview } from "./previews";
import { LabsFooter, LabsHeader, SignInPanel } from "./shell";
import "@fontsource-variable/sora/wght.css";
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
interface Bootstrap {
  development: boolean;
  experiments: Experiment[];
  invited: string[];
  canAdmin: boolean;
  aiEnabled: boolean;
}
const WORKSPACE_TITLES: Record<string, string> = {
  "kasem-practice": "A few minutes of practice",
  "word-trail": "Every word takes you further",
  "culture-quest": "An expedition with a purpose",
  "cultural-story": "A story starts here",
};
/** What stands between the visitor and the workspace, said plainly. */
function AccessGate({
  experiment,
  state,
  onRetry,
}: {
  experiment: Experiment;
  state: AccessState;
  onRetry: () => void;
}) {
  if (state === "sign-in")
    return (
      <div className="lab-gate lab-gate--signin">
        <SignInPanel
          title={`Sign in to start ${experiment.name}`}
          intro={
            <>
              Your progress{present(experiment).modes.includes("contribute") ? " and contributions are" : " is"} saved to
              your free Indigen World account. Once you sign in, {experiment.name} opens right here.
            </>
          }
        />
      </div>
    );
  const copy: Record<Exclude<AccessState, "open" | "sign-in">, [string, string]> = {
    checking: ["Checking availability…", "Confirming this experiment is open for you."],
    unconfirmed: [
      "Availability could not be confirmed",
      "The Labs service did not answer. Nothing has been lost; try again in a moment.",
    ],
    "invite-only": [
      "Invited testers only",
      "The team is testing this version with a smaller group. The details on this page stay open to everyone.",
    ],
    paused: [
      "Taking a pause",
      "The team has paused new work while this experiment is improved. Your saved activity is still available.",
    ],
    retired: ["This experiment is retired", "You can still read the details and open your saved activity."],
    graduated: ["This experiment has graduated", "You can still read the details and open your saved activity."],
  };
  const [title, body] = copy[state as keyof typeof copy];
  return (
    <div className="lab-gate" role={state === "checking" ? "status" : undefined}>
      <h3>{title}</h3>
      <p>{body}</p>
      {state === "unconfirmed" && (
        <button type="button" className="lab-btn lab-btn--secondary" onClick={onRetry}>
          Try again
        </button>
      )}
      {["paused", "retired", "graduated"].includes(state) && (
        <Link className="lab-text-link" to="/labs/activity">
          Open my activity <span aria-hidden="true">→</span>
        </Link>
      )}
    </div>
  );
}
function ExperimentShell({
  experiment: raw,
  viewer,
  aiEnabled,
  onRetry,
}: {
  experiment: Experiment;
  viewer: LabsViewer;
  aiEnabled: boolean;
  onRetry: () => void;
}) {
  const experiment = present(raw),
    state = accessFor(experiment, viewer),
    allowed = state === "open",
    userId = viewer.uid,
    loaded = viewer.loaded,
    [previewActive, setPreviewActive] = useState(false);
  useEffect(() => {
    if (loaded)
      void labsCall("event", {
        experimentId: experiment.id,
        type: "experimentOpened",
      }).catch(() => {});
  }, [experiment.id, loaded]);
  // Links such as "Feedback on Word Trail" land on the form once the page exists.
  useEffect(() => {
    if (window.location.hash === "#feedback")
      requestAnimationFrame(() => document.getElementById("feedback")?.scrollIntoView());
  }, []);
  return (
    <>
      <div className="lab-detail">
        <div className="lab-detail__copy">
          <Link className="lab-back" to="/labs/experiments">
            <span aria-hidden="true">←</span> All experiments
          </Link>
          <div className="lab-card__meta">
            <StatusBadge experiment={experiment} />
            <span className="lab-card__modes">{experiment.modes.map((m) => MODE_LABELS[m]).join(" · ")}</span>
            <span className="lab-card__modes">v{experiment.version}</span>
          </div>
          <h1>{experiment.name}</h1>
          <p className="lab-detail__purpose">{experiment.purpose}</p>
          <p className="lab-detail__summary">{experiment.summary}</p>
          <p className="lab-access" data-state={state}>
            <span className="lab-access__dot" aria-hidden="true" />
            {accessNote(experiment, state)}
          </p>
        </div>
        <div
          className="lab-detail__media"
          onPointerEnter={(e) => e.pointerType === "mouse" && setPreviewActive(true)}
          onPointerLeave={() => setPreviewActive(false)}
        >
          <ExperimentPreview experiment={experiment} active={previewActive} />
        </div>
      </div>
      <div className="labs-workspace-layout">
        <section className="labs-panel labs-workspace" aria-labelledby="workspace-heading">
          <h2 id="workspace-heading">{WORKSPACE_TITLES[experiment.id] ?? experiment.name}</h2>
          {!allowed &&
          !(
            userId &&
            experiment.id === "cultural-story" &&
            new URLSearchParams(window.location.search).has("draft")
          ) ? (
            <AccessGate experiment={experiment} state={state} onRetry={onRetry} />
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
            <dl className="lab-facts">
              <div><dt>Access</dt><dd>{experiment.access}</dd></div>
              <div><dt>Availability</dt><dd>{experiment.enabled ? "Enabled" : "Paused"}</dd></div>
              <div><dt>Updated</dt><dd>{experiment.updatedAt.slice(0, 10)}</dd></div>
            </dl>
            <a
              className="lab-text-link"
              href={experiment.destination}
              onClick={() => {
                void labsCall("event", {
                  experimentId: experiment.id,
                  type: "relatedProductOpened",
                }).catch(() => {});
              }}
            >
              {experiment.destinationLabel} <span aria-hidden="true">↗</span>
            </a>
          </section>
          <section className="labs-panel" id="feedback" tabIndex={-1}>
            {userId ? (
              <FeedbackForm experiment={experiment} />
            ) : (
              <>
                <h3>Help shape what comes next</h3>
                <p>Sign in to send feedback on {experiment.name} and follow its review status in My activity.</p>
              </>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
function PageHead({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="lab-page-head">
      <p className="lab-eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      {children && <p className="lab-section__lede">{children}</p>}
    </div>
  );
}
export function LabsPage() {
  const { path } = useRoute(),
    { user, ready } = useLabsAccount(),
    [data, setData] = useState<Bootstrap | null>(null),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0),
    [controlMessage, setControlMessage] = useState(""),
    reload = useCallback(() => setRefresh((n) => n + 1), []);
  useEffect(() => {
    if (!ready) return;
    let live = true;
    setData(null);
    setError("");
    labsCall<Bootstrap>("bootstrap")
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e) => {
        if (live) setError(errorMessage(e));
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
    detail = experiments.find((e) => path === `labs/${e.slug}`),
    // Account and access UI all derive from this one view of the visitor.
    viewer: LabsViewer = {
      authReady: ready,
      uid: user?.uid,
      loaded: !!data,
      failed: !!error,
      invited: data?.invited ?? [],
      canAdmin: data?.canAdmin ?? false,
    };
  return (
    <div className="labs-root lab-root">
      <LabsHeader user={user} ready={ready} canAdmin={viewer.canAdmin} />
      {path === "labs" && (
        <HeroCarousel photos={HERO_PHOTOS}>
          <p className="lab-eyebrow lab-eyebrow--light">
            <span className="lab-live-dot" aria-hidden="true" /> Indigen World Labs
          </p>
          <h1>
            Living culture.
            <br />
            <em>New possibilities.</em>
          </h1>
          <p className="lab-hero__lede">
            Play with language. Explore stories. Help shape what comes next for the cultures we call home.
          </p>
          <div className="lab-hero__actions">
            <a className="lab-btn lab-btn--light" href="#featured-experiments">
              Explore experiments <span aria-hidden="true">↓</span>
            </a>
            <a className="lab-btn lab-btn--ghost" href="#why">
              Why this lab exists
            </a>
          </div>
        </HeroCarousel>
      )}
      <div className="lab-container">
        {data?.development && (
          <p className="labs-notice">
            Local development demo. Fixture entries demonstrate the workflow and
            are not reviewed Kasem or cultural material. They are excluded from
            production.
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
            <FeaturedRow experiments={experiments} viewer={viewer} />
            <ModeShortcuts experiments={experiments} />
            {user && <ContinueExploring key={user.uid} experiments={experiments} viewer={viewer} />}
            <PurposeSection />
            <UpdatesStrip experiments={experiments} />
          </>
        ) : path === "labs/experiments" ? (
          <>
            <PageHead eyebrow="The experiments" title="Find your next small discovery.">
              Every experiment in Labs, with what you do in it and who can take part today.
            </PageHead>
            <Collection experiments={experiments} viewer={viewer} />
          </>
        ) : detail ? (
          <ExperimentShell
            experiment={detail}
            viewer={viewer}
            aiEnabled={data?.aiEnabled ?? false}
            onRetry={reload}
          />
        ) : path === "labs/activity" ? (
          user ? (
            <Activity key={user.uid} />
          ) : (
            <>
              <PageHead eyebrow="Your space" title="My activity">
                Your private story drafts, practice sessions and feedback live here once you sign in.
              </PageHead>
              {ready && (
                <div className="lab-gate lab-gate--signin">
                  <SignInPanel title="Sign in to see your activity" />
                </div>
              )}
            </>
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
            <PageHead
              eyebrow="Administration"
              title={!ready || (!data && !error) ? "Checking access…" : "Admin access required"}
            >
              This workspace is available to administrators with a trusted account role.
            </PageHead>
          )
        ) : null}
      </div>
      {path === "labs" && <ShapeTheLab experiments={experiments} signedIn={!!user} />}
      <LabsFooter />
    </div>
  );
}
