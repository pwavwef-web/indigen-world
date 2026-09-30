import { useEffect, useState } from "react";
import type {
  Experiment,
  LabsSource,
  PracticeSession,
  StoryDraft,
} from "@indigen-world/contracts/labs";
import { labsCall } from "./api";
import {
  FeedbackForm,
  Field,
  SourceNotes,
  TaskStatus,
  useTask,
} from "./LabsPage";
function ReviewedAudio({ source }: { source: LabsSource }) {
  const [unavailable, setUnavailable] = useState(false);
  return (
    <div>
      <audio
        controls
        preload="none"
        src={source.audioUrl}
        aria-label="Reviewed pronunciation"
        onError={() => setUnavailable(true)}
      />
      {source.audioCredit && <p className="labs-meta">{source.audioCredit}</p>}
      {unavailable && (
        <p className="labs-notice" role="status">
          The recording is unavailable. You can continue using the reviewed
          spelling: {source.original}.
        </p>
      )}
    </div>
  );
}
function useSources(experimentId: string, enabled = true) {
  const [content, setContent] = useState<{
      sources: LabsSource[];
      topics: string[];
    } | null>(null),
    [retry, setRetry] = useState(0),
    task = useTask();
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    setContent(null);
    void task.run(async () => {
      const data = await labsCall<{ sources: LabsSource[]; topics: string[] }>(
        "sources",
        { experimentId },
      );
      if (live) setContent(data);
    });
    return () => {
      live = false;
    };
  }, [experimentId, retry, enabled]);
  return { content, task, retry: () => setRetry((n) => n + 1) };
}
export function PracticeWorkspace({
  experiment,
  signedIn,
}: {
  experiment: Experiment;
  signedIn: boolean;
}) {
  const { content, task: sourceTask, retry } = useSources(experiment.id),
    task = useTask(),
    [topic, setTopic] = useState(""),
    [session, setSession] = useState<PracticeSession | null>(null),
    [answers, setAnswers] = useState<number[]>([]),
    [index, setIndex] = useState(0),
    [report, setReport] = useState(""),
    [done, setDone] = useState(false),
    question = session?.questions[index],
    answered = answers[index] !== undefined;
  const start = () =>
    void task.run(async () => {
      const result = await labsCall<{ session: PracticeSession }>(
        "startPractice",
        { topic: topic || content?.topics[0] },
      );
      setSession(result.session);
      setAnswers([]);
      setIndex(0);
      setDone(false);
      setReport("");
    });
  const finish = () =>
    void task.run(async () => {
      if (signedIn) {
        const result = await labsCall<{ session: PracticeSession }>(
          "completePractice",
          { id: session!.id, answers },
        );
        setSession(result.session);
      }
      setDone(true);
    });
  return (
    <>
      <TaskStatus task={sourceTask} />
      {sourceTask.error && (
        <button className="labs-text-button" onClick={retry}>
          Retry source loading
        </button>
      )}
      <TaskStatus task={task} />
      {!session ? (
        <>
          <p>
            Choose a topic supported by the reviewed archive. Each session has
            up to six questions, with source notes after every answer.
          </p>
          {sourceTask.busy && (
            <p role="status">Looking for reviewed material…</p>
          )}
          {content && !content.topics.length ? (
            <div className="labs-empty">
              <h3>More reviewed material is needed</h3>
              <p>
                There are not enough distinct meanings in this sample of the
                archive to make a fair question. Nothing has been invented to
                fill the gap.
              </p>
              <a href="/contribute">Help contribute reviewed material ↗</a>
            </div>
          ) : (
            content && (
              <>
                <Field label="Practice topic">
                  <select
                    value={topic || content.topics[0]}
                    onChange={(e) => setTopic(e.target.value)}
                  >
                    {content.topics.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </Field>
                <button
                  className="labs-button"
                  disabled={task.busy}
                  onClick={start}
                >
                  {task.busy ? "Starting…" : "Start a short session →"}
                </button>
                <p className="labs-meta">
                  Participation and practice performance, without a fluency
                  claim.
                </p>
              </>
            )
          )}
        </>
      ) : done ? (
        <div className="labs-results">
          <p className="labs-eyebrow">SESSION COMPLETE</p>
          <h3>
            {answers.filter((a, i) => a === session.questions[i].answer).length}{" "}
            of {session.questions.length} answers matched
          </h3>
          <p>
            {signedIn
              ? "Your session is saved in My activity."
              : "This public trial is not saved. Sign in to keep your next session."}{" "}
            Keep practising at your own pace.
          </p>
          {session.questions.map((q, i) => (
            <div className="labs-result-item" key={q.id}>
              <span className="labs-tag">
                {answers[i] === q.answer ? "Matched" : "Keep practising"}
              </span>
              <p>
                {q.source.original} — {q.source.meaning}
              </p>
              <p className="labs-meta">Your choice: {q.choices[answers[i]]}</p>
              <SourceNotes sources={[q.source]} />
              {signedIn && (
                <button
                  className="labs-text-button"
                  onClick={() => setReport(q.id)}
                >
                  Report a language issue
                </button>
              )}
            </div>
          ))}
          <button
            className="labs-button"
            onClick={() => {
              setSession(null);
              setReport("");
            }}
          >
            Try another session
          </button>
        </div>
      ) : (
        question && (
          <div className="labs-question">
            <div className="labs-row">
              <span className="labs-meta">
                Question {index + 1} of {session.questions.length}
              </span>
              <span className="labs-tag">
                {question.mode === "matching"
                  ? "Match the expression"
                  : question.mode === "listening"
                    ? "Listen for meaning"
                    : "Choose the meaning"}
              </span>
            </div>
            <progress
              aria-label="Session progress"
              value={index}
              max={session.questions.length}
            />
            <h3 className="labs-question-text">{question.prompt}</h3>
            {question.mode === "listening" && (
              <ReviewedAudio key={question.id} source={question.source} />
            )}
            <div className="labs-choices">
              {question.choices.map((option, i) => (
                <button
                  key={i}
                  className={
                    answered && i === question.answer
                      ? "labs-answer-correct"
                      : answered && i === answers[index]
                        ? "labs-answer-selected"
                        : ""
                  }
                  disabled={answered || task.busy}
                  onClick={() => setAnswers((a) => [...a, i])}
                >
                  <span>{String.fromCharCode(65 + i)}</span>
                  {option}
                  {answered && i === question.answer && (
                    <strong>Correct match</strong>
                  )}
                </button>
              ))}
            </div>
            {answered && (
              <>
                <p className="labs-notice" role="status">
                  {answers[index] === question.answer
                    ? "That matches the reviewed entry."
                    : `The reviewed match is “${question.choices[question.answer]}”.`}{" "}
                  This question uses the meaning in the source below.
                </p>
                <SourceNotes sources={[question.source]} />
                <div className="labs-actions">
                  {signedIn && (
                    <button
                      className="labs-text-button"
                      onClick={() => setReport(question.id)}
                    >
                      Report a language issue
                    </button>
                  )}
                  <button
                    className="labs-button"
                    disabled={task.busy}
                    onClick={() => {
                      if (index === session.questions.length - 1) finish();
                      else {
                        setIndex((i) => i + 1);
                        setReport("");
                      }
                    }}
                  >
                    {task.busy
                      ? "Saving…"
                      : index === session.questions.length - 1
                        ? "Finish session →"
                        : "Next question →"}
                  </button>
                </div>
              </>
            )}
          </div>
        )
      )}
      {report && session && (
        <div className="labs-report">
          <FeedbackForm
            key={report}
            experiment={experiment}
            reference={`session:${session.id}:${report}`}
            languageIssue
          />
          <button className="labs-text-button" onClick={() => setReport("")}>
            Close report
          </button>
        </div>
      )}
    </>
  );
}
function template(
  format: string,
  audience: string,
  length: string,
  context: string,
) {
  const structure =
    format === "short video script"
      ? "Opening shot:\n\nNarration:\n\nClosing shot:"
      : format === "scene outline"
        ? "Scene 1 — setting:\n\nScene 2 — change:\n\nScene 3 — ending:"
        : "Opening:\n\nA moment of change:\n\nEnding:";
  return `CREATIVE ADDITIONS — not reviewed cultural information\nAudience: ${audience}\nApproximate length: ${length}\n\n${structure}\n\nYour context (unverified):\n${context}`;
}
function exported(draft: {
  title: string;
  creative: string;
  sources: LabsSource[];
}) {
  return `${draft.title}\n\n${draft.creative}\n\nREVIEWED SOURCE NOTES — quoted separately from creative additions\n\n${draft.sources.map((s) => `${s.original}\n${s.meaning}\n${s.context}\nSource: ${s.ref} (revision ${s.revision})\nAttribution: ${s.attribution}\n${s.url}`).join("\n\n")}`;
}
export function StoryWorkspace({
  experiment,
  signedIn,
  aiEnabled,
  canExecute = true,
}: {
  experiment: Experiment;
  signedIn: boolean;
  aiEnabled: boolean;
  canExecute?: boolean;
}) {
  const {
      content,
      task: sourceTask,
      retry,
    } = useSources(experiment.id, canExecute),
    task = useTask(),
    [draft, setDraft] = useState<StoryDraft | null>(null),
    [draftId, setDraftId] = useState<string>(crypto.randomUUID()),
    [title, setTitle] = useState("My cultural story"),
    [audience, setAudience] = useState("Everyone"),
    [length, setLength] = useState("About 1 minute"),
    [format, setFormat] = useState("short story"),
    [context, setContext] = useState(""),
    [creative, setCreative] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [suggestion, setSuggestion] = useState(""),
    [dirty, setDirty] = useState(false),
    [report, setReport] = useState(false);
  useEffect(() => {
    const draftParam = new URLSearchParams(window.location.search).get("draft");
    if (!draftParam || !signedIn) return;
    void task.run(async () => {
      const { draft: saved } = await labsCall<{ draft: StoryDraft }>(
        "getDraft",
        { id: draftParam },
      );
      setDraft(saved);
      setDraftId(saved.id);
      setTitle(saved.title);
      setAudience(saved.audience);
      setLength(saved.length);
      setFormat(saved.format);
      setContext(saved.context);
      setCreative(saved.creative);
      setSelected(saved.sources.map((s) => s.ref));
      setDirty(false);
    });
  }, [signedIn]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const sources =
      draft?.sources ??
      (content?.sources ?? []).filter((s) => selected.includes(s.ref)),
    values = {
      id: draftId,
      revision: draft?.revision ?? 0,
      title,
      audience,
      length,
      format,
      context,
      creative,
      sourceRefs: selected,
    };
  const save = () =>
    void task.run(async () => {
      const { draft: saved } = await labsCall<{ draft: StoryDraft }>(
        "saveDraft",
        values,
      );
      setDraft(saved);
      setDirty(false);
      task.setMessage("Private draft saved. Reopen it from My activity.");
    });
  const assist = () =>
    void task.run(async () => {
      const result = await labsCall<{ creative: string }>(
        "assistStory",
        values,
      );
      setSuggestion(result.creative);
      task.setMessage(
        "Suggestion ready. Review it before applying it to your creative section.",
      );
    });
  return (
    <>
      <p>
        A guided editor for stories and video ideas. Keep reviewed information
        in the source notes; put your imagination in the creative section.
      </p>
      {!canExecute && (
        <p className="labs-notice">
          This experiment is unavailable for new work. You can copy, export or
          delete your existing saved draft. Saving and assistance are paused.
        </p>
      )}
      <TaskStatus task={sourceTask} />
      {sourceTask.error && (
        <button className="labs-text-button" onClick={retry}>
          Retry source loading
        </button>
      )}
      <TaskStatus task={task} />
      <div className="labs-story-step">
        <span className="labs-step">01</span>
        <h3>Start with something trusted</h3>
      </div>
      {draft ? (
        <p>
          Source references are retained with this draft. Start a new draft to
          choose different sources.
        </p>
      ) : (
        <>
          {sourceTask.busy && <p role="status">Loading reviewed sources…</p>}
          {content && !content.sources.length && (
            <p className="labs-notice">
              No eligible reviewed source is available in this archive sample.
              You can shape your own story, clearly marked as creative work.
            </p>
          )}
          <Field label="Reviewed source material (optional, up to five)">
            <select
              multiple
              size={Math.min(6, Math.max(2, content?.sources.length ?? 2))}
              disabled={!content}
              value={selected}
              onChange={(e) => {
                setSelected(
                  Array.from(e.target.selectedOptions)
                    .map((o) => o.value)
                    .slice(0, 5),
                );
                setDirty(true);
              }}
            >
              {content?.sources.map((s) => (
                <option key={s.ref} value={s.ref}>
                  {s.kind}: {s.original.slice(0, 60)} — {s.meaning.slice(0, 80)}
                </option>
              ))}
            </select>
          </Field>
          <p className="labs-meta">
            Use Ctrl / Command to select multiple sources. On mobile, use the
            selection picker. Published language material can inspire a story;
            it does not establish cultural facts.
          </p>
        </>
      )}
      <SourceNotes sources={sources} />
      <div className="labs-story-step">
        <span className="labs-step">02</span>
        <h3>Give your story a shape</h3>
      </div>
      <div onChange={() => setDirty(true)}>
        <Field label="Draft title">
          <input
            value={title}
            maxLength={160}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <div className="labs-form-grid">
          <Field label="Audience">
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
            >
              {["Everyone", "Young readers", "Community members"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Approximate length">
            <select value={length} onChange={(e) => setLength(e.target.value)}>
              {["About 1 minute", "About 3 minutes", "About 5 minutes"].map(
                (v) => (
                  <option key={v}>{v}</option>
                ),
              )}
            </select>
          </Field>
        </div>
        <Field label="Format">
          <select value={format} onChange={(e) => setFormat(e.target.value)}>
            {["short story", "short video script", "scene outline"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
        <Field label="Your context (creative and unverified)">
          <textarea
            rows={3}
            maxLength={4000}
            placeholder="Who is the story for? What moment would you like to explore?"
            value={context}
            onChange={(e) => setContext(e.target.value)}
          />
        </Field>
      </div>
      <div className="labs-actions">
        <button
          className="labs-button labs-secondary"
          disabled={!!creative || task.busy || !canExecute}
          onClick={() => {
            setCreative(template(format, audience, length, context));
            setDirty(true);
          }}
        >
          Start with a guided template
        </button>
        <button
          className="labs-button labs-secondary"
          disabled={!aiEnabled || !signedIn || task.busy || !canExecute}
          onClick={assist}
        >
          {task.busy ? "Please wait…" : "Ask Kawuri for structure"}
        </button>
      </div>
      <p className="labs-meta">
        {!aiEnabled
          ? "Automatic assistance is unavailable: the Labs Vertex AI setting is not enabled. The guided editor works without it."
          : !signedIn
            ? "Sign in to use automatic assistance."
            : "Optional AI assistance sends your context and the selected public meanings to Vertex AI. Suggestions are unverified. Five requests per account per day."}
      </p>
      {suggestion && (
        <div className="labs-notice">
          <h3>Review the suggested creative section</h3>
          <pre>{suggestion}</pre>
          <button
            className="labs-button"
            onClick={() => {
              setCreative(suggestion);
              setSuggestion("");
              setDirty(true);
            }}
          >
            Apply suggestion
          </button>
          <button
            className="labs-text-button"
            onClick={() => setSuggestion("")}
          >
            Discard
          </button>
        </div>
      )}
      <div className="labs-story-step">
        <span className="labs-step">03</span>
        <h3>Make it your own</h3>
      </div>
      <Field label="Creative section — not reviewed cultural information">
        <textarea
          className="labs-draft-editor"
          rows={14}
          maxLength={20000}
          value={creative}
          placeholder="Write your story, or start with the guided template above."
          onChange={(e) => {
            setCreative(e.target.value);
            setDirty(true);
          }}
        />
      </Field>
      <p className="labs-meta">
        Kasem in the source notes is preserved exactly. Changes or new claims in
        your creative section are your additions and need independent review.
      </p>
      <div className="labs-actions">
        <button
          className="labs-button"
          disabled={
            !canExecute ||
            !signedIn ||
            !creative.trim() ||
            task.busy ||
            (!content && !draft)
          }
          onClick={save}
        >
          {task.busy ? "Please wait…" : "Save private draft"}
        </button>
        <button
          className="labs-button labs-secondary"
          disabled={!creative}
          onClick={() =>
            void task.run(async () => {
              await navigator.clipboard.writeText(
                exported({ title, creative, sources }),
              );
              task.setMessage("Draft and source notes copied.");
            })
          }
        >
          Copy text
        </button>
        <button
          className="labs-button labs-secondary"
          disabled={!creative}
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([exported({ title, creative, sources })], {
                type: "text/plain;charset=utf-8",
              }),
            );
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = "indigen-world-story.txt";
            anchor.click();
            URL.revokeObjectURL(url);
          }}
        >
          Export .txt
        </button>
      </div>
      <p className="labs-meta">
        {!signedIn
          ? "Sign in to save. You can copy or export your local work."
          : dirty
            ? "You have unsaved changes."
            : draft
              ? `Saved privately · revision ${draft.revision}`
              : "Only you can reopen saved drafts."}
      </p>
      {draft && (
        <div className="labs-actions">
          <button
            className="labs-text-button"
            onClick={() => setReport(!report)}
          >
            Give feedback on this draft workflow
          </button>
          <button
            className="labs-text-button labs-danger"
            disabled={task.busy}
            onClick={() => {
              if (
                window.confirm(
                  "Delete this saved draft? Export any text you want to keep first.",
                )
              )
                void task.run(async () => {
                  await labsCall("deleteDraft", { id: draft.id });
                  setDraft(null);
                  setDraftId(crypto.randomUUID());
                  setCreative("");
                  setSelected([]);
                  setDirty(false);
                  task.setMessage("Saved draft deleted.");
                });
            }}
          >
            Delete saved draft
          </button>
        </div>
      )}
      {report && draft && (
        <FeedbackForm experiment={experiment} reference={`draft:${draft.id}`} />
      )}
    </>
  );
}
