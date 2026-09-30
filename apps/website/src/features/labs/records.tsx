import { useEffect, useState } from "react";
import type {
  Experiment,
  FeedbackStatus,
  LabsAudit,
  LabsFeedback,
  LabsUpdate,
  PracticeSession,
  StoryDraft,
} from "@indigen-world/contracts/labs";
import { Link } from "../../app/router";
import { labsCall } from "./api";
import { Field, SourceNotes, TaskStatus, useTask } from "./LabsPage";
type Page<T> = { records: T[]; nextCursor: string | null };
function usePage<T>(action: string, args: Record<string, unknown> = {}) {
  const [records, setRecords] = useState<T[]>([]),
    [nextCursor, setCursor] = useState<string | null>(null),
    [loaded, setLoaded] = useState(false),
    [refresh, setRefresh] = useState(0),
    task = useTask(),
    argsKey = JSON.stringify(args);
  useEffect(() => {
    let active = true;
    setRecords([]);
    setLoaded(false);
    setCursor(null);
    void task.run(async () => {
      const page = await labsCall<Page<T>>(action, JSON.parse(argsKey));
      if (active) {
        setRecords(page.records);
        setCursor(page.nextCursor);
        setLoaded(true);
      }
    });
    return () => {
      active = false;
    };
  }, [action, argsKey, refresh]);
  const more = () =>
    void task.run(async () => {
      const page = await labsCall<Page<T>>(action, {
        ...JSON.parse(argsKey),
        cursor: nextCursor,
      });
      setRecords((r) => [...r, ...page.records]);
      setCursor(page.nextCursor);
    });
  return {
    records,
    loaded,
    nextCursor,
    more,
    task,
    reload: () => setRefresh((n) => n + 1),
  };
}
function PageControls({ page }: { page: ReturnType<typeof usePage> }) {
  return (
    <>
      <TaskStatus task={page.task} />
      {page.task.busy && <p role="status">Loading…</p>}
      {page.task.error && (
        <button className="labs-text-button" onClick={page.reload}>
          Retry
        </button>
      )}
      {page.nextCursor && (
        <button
          className="labs-button labs-secondary"
          disabled={page.task.busy}
          onClick={page.more}
        >
          Load more
        </button>
      )}
    </>
  );
}
export function Activity() {
  const [tab, setTab] = useState("drafts"),
    page = usePage<StoryDraft | PracticeSession | LabsFeedback>("activity", {
      kind: tab,
    });
  return (
    <>
      <div className="labs-page-heading">
        <p className="labs-eyebrow">YOUR SPACE</p>
        <h1>A little progress, kept here.</h1>
        <p>
          Your private drafts, practice sessions and feedback. Practice results
          describe participation, not fluency.
        </p>
      </div>
      <div className="labs-tabs" role="group" aria-label="Activity type">
        {[
          ["drafts", "Story drafts"],
          ["sessions", "Practice sessions"],
          ["feedback", "My feedback"],
        ].map(([key, label]) => (
          <button
            key={key}
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="labs-record-list">
        {page.records.map((record) => (
          <article className="labs-panel" key={record.id}>
            {tab === "drafts" ? (
              <>
                <span className="labs-tag">Private draft</span>
                <h2>{(record as StoryDraft).title}</h2>
                <p>
                  {(record as StoryDraft).format} ·{" "}
                  {(record as StoryDraft).audience} · revision{" "}
                  {(record as StoryDraft).revision}
                </p>
                <Link
                  className="labs-text-link"
                  to={`/labs/cultural-story?draft=${record.id}`}
                >
                  Reopen draft →
                </Link>
                <p className="labs-meta">
                  Reopen to export or delete this draft.
                </p>
              </>
            ) : tab === "sessions" ? (
              <>
                <span className="labs-tag">
                  {(record as PracticeSession).completedAt
                    ? "Completed"
                    : "Started"}
                </span>
                <h2>{(record as PracticeSession).topic}</h2>
                <p>
                  {(record as PracticeSession).completedAt
                    ? `${(record as PracticeSession).score} of ${(record as PracticeSession).questions.length} answers matched`
                    : "This session has not been completed."}
                </p>
                <details>
                  <summary>Reviewed material and results</summary>
                  {(record as PracticeSession).questions.map((q, i) => (
                    <div key={q.id}>
                      <p>
                        {(record as PracticeSession).answers[i] === undefined
                          ? "Unanswered"
                          : `Your choice: ${q.choices[(record as PracticeSession).answers[i]]}`}{" "}
                        · Reviewed match: {q.choices[q.answer]}
                      </p>
                      <SourceNotes sources={[q.source]} />
                    </div>
                  ))}
                </details>
              </>
            ) : (
              <>
                <span className="labs-tag">
                  {(record as LabsFeedback).status}
                </span>
                <h2>{(record as LabsFeedback).type}</h2>
                <p>{(record as LabsFeedback).description}</p>
                {(record as LabsFeedback).response && (
                  <p className="labs-notice">
                    Team response: {(record as LabsFeedback).response}
                  </p>
                )}
                <p className="labs-meta">
                  {record.experimentId} · v{record.version} ·{" "}
                  {(record as LabsFeedback).reference || "General feedback"}
                </p>
              </>
            )}
            <p className="labs-meta">{record.createdAt.slice(0, 10)}</p>
          </article>
        ))}
      </div>
      {page.loaded && !page.records.length && (
        <div className="labs-empty">
          <h2>Nothing here yet</h2>
          <p>
            {tab === "drafts"
              ? "Save a private story draft and come back to it here."
              : tab === "sessions"
                ? "Start a practice session to see your participation here."
                : "Submit feedback from an experiment to follow its review status."}
          </p>
          <Link to="/labs/experiments">Explore experiments →</Link>
        </div>
      )}
      <PageControls page={page} />
    </>
  );
}
export function Updates() {
  const page = usePage<LabsUpdate>("updates");
  return (
    <>
      <div className="labs-page-heading">
        <p className="labs-eyebrow">AS WE LEARN</p>
        <h1>Follow the experiments.</h1>
        <p>Changes, limitations and next steps, shared by the Labs team.</p>
      </div>
      <div className="labs-record-list">
        {page.records.map((u) => (
          <article className="labs-panel" key={u.id}>
            <span className="labs-tag">
              {u.experimentId} · v{u.version}
            </span>
            <h2>{u.title}</h2>
            <p className="labs-preserve">{u.body}</p>
            <p className="labs-meta">{u.createdAt.slice(0, 10)}</p>
            <Link to={`/labs/${u.experimentId}`}>Open experiment →</Link>
          </article>
        ))}
      </div>
      {page.loaded && !page.records.length && (
        <div className="labs-empty">
          <h2>No updates published yet</h2>
          <p>
            Updates will appear here when the team publishes a change. Current
            versions and limitations are on each experiment page.
          </p>
        </div>
      )}
      <PageControls page={page} />
    </>
  );
}
function ConfigForm({
  experiment,
  onChanged,
}: {
  experiment: Experiment;
  onChanged: () => void;
}) {
  const [enabled, setEnabled] = useState(experiment.enabled),
    [status, setStatus] = useState(experiment.status),
    [access, setAccess] = useState(experiment.access),
    [version, setVersion] = useState(experiment.version),
    [limitations, setLimitations] = useState(experiment.limitations),
    task = useTask();
  return (
    <form
      className="labs-panel"
      onSubmit={(e) => {
        e.preventDefault();
        void task.run(async () => {
          await labsCall("adminConfig", {
            experimentId: experiment.id,
            enabled,
            status,
            access,
            version,
            limitations,
          });
          task.setMessage("Controls saved and audited.");
          onChanged();
        });
      }}
    >
      <h2>{experiment.name}</h2>
      <label className="labs-check">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Enabled (uncheck to pause execution)
      </label>
      <div className="labs-form-grid">
        <Field label="Lifecycle">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
          >
            {["prototype", "alpha", "beta", "graduated", "retired"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
        <Field label="Access">
          <select
            value={access}
            onChange={(e) => setAccess(e.target.value as typeof access)}
          >
            {["public", "signed-in", "invited testers"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Version">
        <input
          maxLength={40}
          required
          value={version}
          onChange={(e) => setVersion(e.target.value)}
        />
      </Field>
      <Field label="Known limitations">
        <textarea
          maxLength={3000}
          rows={4}
          required
          value={limitations}
          onChange={(e) => setLimitations(e.target.value)}
        />
      </Field>
      <button className="labs-button" disabled={task.busy}>
        Save experiment controls
      </button>
      <TaskStatus task={task} />
    </form>
  );
}
function ReviewForm({
  feedback,
  onChanged,
}: {
  feedback: LabsFeedback;
  onChanged: () => void;
}) {
  const [status, setStatus] = useState<FeedbackStatus>(feedback.status),
    [response, setResponse] = useState(feedback.response),
    [notes, setNotes] = useState(""),
    [notesReady, setNotesReady] = useState(false),
    task = useTask();
  useEffect(() => {
    let active = true;
    void task.run(async () => {
      const result = await labsCall<{ notes: string }>("adminNotes", {
        id: feedback.id,
      });
      if (active) {
        setNotes(result.notes);
        setNotesReady(true);
      }
    });
    return () => {
      active = false;
    };
  }, [feedback.id]);
  return (
    <form
      className="labs-panel"
      onSubmit={(e) => {
        e.preventDefault();
        void task.run(async () => {
          await labsCall("adminReview", {
            id: feedback.id,
            status,
            response,
            notes,
          });
          onChanged();
        });
      }}
    >
      <span className="labs-tag">
        {feedback.type} · {feedback.experimentId}
      </span>
      <h3>{feedback.status}</h3>
      <p className="labs-preserve">{feedback.description}</p>
      {feedback.steps && (
        <p className="labs-preserve">Steps: {feedback.steps}</p>
      )}
      <p className="labs-meta">
        {feedback.reference || "No private reference attached"} · v
        {feedback.version}
        <br />
        Contact consent: {feedback.contactConsent ? "Yes" : "No"} ·{" "}
        {feedback.createdAt.slice(0, 10)}
      </p>
      {feedback.type === "language issue" && (
        <p className="labs-meta">
          Source: {feedback.sourceRef || "No question source attached"}{" "}
          {feedback.sourceUrl && (
            <a href={feedback.sourceUrl}>Open public source ↗</a>
          )}
        </p>
      )}
      {feedback.type === "language issue" && (
        <p className="labs-notice">
          Resolve only after independent language review. This queue never edits
          source records. Use the existing contributor review workflow for an
          approved correction.
        </p>
      )}
      <Field label="Review status">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as FeedbackStatus)}
        >
          {["submitted", "reviewing", "planned", "resolved", "closed"].map(
            (v) => (
              <option key={v}>{v}</option>
            ),
          )}
        </select>
      </Field>
      <Field label="Response visible to the reporter">
        <textarea
          maxLength={3000}
          rows={3}
          value={response}
          onChange={(e) => setResponse(e.target.value)}
        />
      </Field>
      <Field label="Internal notes — administrators only">
        <textarea
          maxLength={6000}
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={!notesReady}
        />
      </Field>
      <button className="labs-button" disabled={task.busy || !notesReady}>
        Save review
      </button>
      <TaskStatus task={task} />
    </form>
  );
}
function FeedbackQueue() {
  const [status, setStatus] = useState("submitted"),
    page = usePage<LabsFeedback>("adminFeedback", { status });
  return (
    <>
      <Field label="Queue status">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {["submitted", "reviewing", "planned", "resolved", "closed"].map(
            (v) => (
              <option key={v}>{v}</option>
            ),
          )}
        </select>
      </Field>
      {page.records.map((f) => (
        <ReviewForm key={f.id} feedback={f} onChanged={page.reload} />
      ))}
      {page.loaded && !page.records.length && (
        <p>No feedback with this status.</p>
      )}
      <PageControls page={page} />
    </>
  );
}
function PublishUpdate({ experiments }: { experiments: Experiment[] }) {
  const [experimentId, setExperimentId] = useState(experiments[0].id),
    [title, setTitle] = useState(""),
    [body, setBody] = useState(""),
    [version, setVersion] = useState(experiments[0].version),
    task = useTask();
  return (
    <form
      className="labs-panel"
      onSubmit={(e) => {
        e.preventDefault();
        void task.run(async () => {
          await labsCall("adminUpdate", { experimentId, title, body, version });
          setTitle("");
          setBody("");
          task.setMessage(
            "Update published to Labs and recorded in the audit trail.",
          );
        });
      }}
    >
      <h2>Publish an experiment update</h2>
      <p>
        This publishes to the Labs Updates section. Blogger release posts are
        prepared separately.
      </p>
      <Field label="Experiment">
        <select
          value={experimentId}
          onChange={(e) => {
            setExperimentId(e.target.value);
            setVersion(
              experiments.find((x) => x.id === e.target.value)!.version,
            );
          }}
        >
          {experiments.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Version">
        <input
          maxLength={40}
          required
          value={version}
          onChange={(e) => setVersion(e.target.value)}
        />
      </Field>
      <Field label="Title">
        <input
          maxLength={160}
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>
      <Field label="What changed and who can use it">
        <textarea
          maxLength={5000}
          rows={6}
          required
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </Field>
      <button className="labs-button" disabled={task.busy}>
        Publish update
      </button>
      <TaskStatus task={task} />
    </form>
  );
}
function TesterAccess({ experiments }: { experiments: Experiment[] }) {
  const [uid, setUid] = useState(""),
    [experimentId, setExperimentId] = useState(experiments[0].id),
    [invited, setInvited] = useState(true),
    task = useTask();
  return (
    <form
      className="labs-panel"
      onSubmit={(e) => {
        e.preventDefault();
        void task.run(async () => {
          await labsCall("adminInvite", { uid, experimentId, invited });
          task.setMessage("Tester access updated and audited.");
        });
      }}
    >
      <h2>Invited tester access</h2>
      <Field label="Existing Firebase account UID">
        <input
          required
          value={uid}
          maxLength={128}
          onChange={(e) => setUid(e.target.value)}
        />
      </Field>
      <Field label="Experiment">
        <select
          value={experimentId}
          onChange={(e) => setExperimentId(e.target.value)}
        >
          {experiments.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </Field>
      <label className="labs-check">
        <input
          type="checkbox"
          checked={invited}
          onChange={(e) => setInvited(e.target.checked)}
        />
        Allow this account as an invited tester
      </label>
      <button className="labs-button" disabled={task.busy}>
        Save tester access
      </button>
      <TaskStatus task={task} />
    </form>
  );
}
function Audit() {
  const page = usePage<LabsAudit>("adminAudit");
  return (
    <>
      <h2>Administrative audit trail</h2>
      {page.records.map((a) => (
        <article className="labs-panel" key={a.id}>
          <h3>{a.action}</h3>
          <p>{a.targetId}</p>
          <p className="labs-meta">
            By {a.actorUid} · {a.occurredAt}
          </p>
        </article>
      ))}
      {page.loaded && !page.records.length && (
        <p>No administrative changes recorded yet.</p>
      )}
      <PageControls page={page} />
    </>
  );
}
export function Admin({
  experiments,
  onChanged,
}: {
  experiments: Experiment[];
  onChanged: () => void;
}) {
  const [tab, setTab] = useState("Summary"),
    [metrics, setMetrics] = useState<Record<string, unknown>[]>([]),
    task = useTask();
  useEffect(() => {
    void task.run(async () => {
      setMetrics(
        (await labsCall<{ metrics: Record<string, unknown>[] }>("adminSummary"))
          .metrics,
      );
    });
  }, []);
  return (
    <>
      <div className="labs-page-heading">
        <p className="labs-eyebrow">LABS ADMINISTRATION</p>
        <h1>Care for the experiments.</h1>
        <p>Control availability, listen to testers and explain what changes.</p>
      </div>
      <div className="labs-tabs" role="group" aria-label="Admin area">
        {["Summary", "Controls", "Feedback", "Updates", "Testers", "Audit"].map(
          (v) => (
            <button key={v} aria-pressed={tab === v} onClick={() => setTab(v)}>
              {v}
            </button>
          ),
        )}
      </div>
      {tab === "Summary" ? (
        <>
          <TaskStatus task={task} />
          <button
            className="labs-text-button"
            disabled={task.busy}
            onClick={() =>
              void task.run(async () => {
                setMetrics(
                  (
                    await labsCall<{ metrics: Record<string, unknown>[] }>(
                      "adminSummary",
                    )
                  ).metrics,
                );
              })
            }
          >
            Refresh summary
          </button>
          <div className="labs-grid">
            {metrics.map((m) => {
              const count = (key: string) => Number(m[key]) || 0;
              return (
                <section className="labs-panel" key={String(m.experimentId)}>
                  <h2>
                    {experiments.find((e) => e.id === m.experimentId)?.name}
                  </h2>
                  <dl className="labs-metrics">
                    {[
                      ["Experiment opens", "experimentOpened"],
                      ["Sessions started", "sessionStarted"],
                      ["Sessions completed", "sessionCompleted"],
                      ["Draft saves", "draftSaved"],
                      ["Feedback submitted", "feedbackSubmitted"],
                      ["Product links opened", "relatedProductOpened"],
                    ].map(([label, key]) => (
                      <div key={key}>
                        <dt>{label}</dt>
                        <dd>{count(key)}</dd>
                      </div>
                    ))}
                  </dl>
                  {m.experimentId === "kasem-practice" && (
                    <p>
                      Completion rate:{" "}
                      {count("sessionStarted")
                        ? `${Math.round((count("sessionCompleted") / count("sessionStarted")) * 100)}%`
                        : "No sessions yet"}
                    </p>
                  )}
                </section>
              );
            })}
          </div>
          <p className="labs-meta">
            Counts come from server aggregates. Practice completion rate =
            completed signed-in sessions ÷ started signed-in sessions since this
            release. Abandoned sessions stay in the denominator. Repeated
            completions count once. Opens, saves and link opens count successful
            requests, not unique people. No draft or feedback text is sent to
            analytics.
          </p>
        </>
      ) : tab === "Controls" ? (
        <div className="labs-grid">
          {experiments.map((e) => (
            <ConfigForm
              key={e.id + e.updatedAt}
              experiment={e}
              onChanged={onChanged}
            />
          ))}
        </div>
      ) : tab === "Feedback" ? (
        <FeedbackQueue />
      ) : tab === "Updates" ? (
        <PublishUpdate experiments={experiments} />
      ) : tab === "Testers" ? (
        <TesterAccess experiments={experiments} />
      ) : (
        <Audit />
      )}
    </>
  );
}
