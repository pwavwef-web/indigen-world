import { useEffect, useState } from "react";
import type {
  Experiment,
  LabsFeedback,
  LabsUpdate,
  PracticeSession,
  StoryDraft,
} from "@indigen-world/contracts/labs";
import { Link } from "../../app/router";
import { labsCall } from "./api";
import { accessFor, present, type LabsViewer } from "./access";
import { featuredOrder } from "./cards";
import { PURPOSE_PHOTOS } from "./labs-media";

type Page<T> = { records: T[]; nextCursor: string | null };
const dateLabel = (iso: string) =>
  Number.isFinite(Date.parse(iso))
    ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    : "";

const OUTCOMES = [
  ["Learn", "Practice draws only on reviewed dictionary entries and expressions. Listening questions appear only when a reviewed recording exists."],
  ["Contribute", "Word Trail translations and Culture Quest notes go to review queues. They stay proposals until reviewers check them, and game points or XP are never payments."],
  ["Create", "Story drafts are private to your account. Your writing is kept apart from the source notes, so imagination is never mistaken for a reviewed fact."],
  ["Shape", "Feedback from any experiment reaches the Labs team. Follow its status, and any reply, in My activity."],
] as const;

export function PurposeSection() {
  const [main, inset] = PURPOSE_PHOTOS;
  return (
    <section className="lab-section lab-purpose" id="why" aria-labelledby="why-heading" tabIndex={-1}>
      <div className="lab-purpose__media" data-reveal>
        <figure className="lab-purpose__main">
          <img src={main.src} srcSet={main.srcSet} sizes="(min-width: 900px) 40vw, 100vw" width={main.width} height={main.height} alt={main.alt} loading="lazy" decoding="async" style={{ objectPosition: main.focus }} />
          <figcaption>{main.caption}</figcaption>
        </figure>
        <figure className="lab-purpose__inset">
          <img src={inset.src} srcSet={inset.srcSet} sizes="(min-width: 900px) 18vw, 45vw" width={inset.width} height={inset.height} alt={inset.alt} loading="lazy" decoding="async" style={{ objectPosition: inset.focus }} />
          <figcaption>{inset.caption}</figcaption>
        </figure>
      </div>
      <div className="lab-purpose__copy" data-reveal>
        <p className="lab-eyebrow">Why this lab exists</p>
        <h2 id="why-heading">Culture does not stand still. Neither should the ways we experience it.</h2>
        <p className="lab-section__lede">
          Labs is where Indigen World tries new ideas in the open, with the people they are for. Each experiment is small,
          clearly labelled and tied to the real work of keeping Kasem language and Kassena culture present in daily life
          online.
        </p>
        <dl className="lab-outcomes">
          {OUTCOMES.map(([term, detail]) => (
            <div key={term}>
              <dt>{term}</dt>
              <dd>{detail}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

type Recent =
  | { kind: "draft"; at: string; record: StoryDraft }
  | { kind: "session"; at: string; record: PracticeSession }
  | { kind: "feedback"; at: string; record: LabsFeedback };

/** Recent private activity, read from the same owner-only activity pages as My activity. */
export function ContinueExploring({ experiments, viewer }: { experiments: Experiment[]; viewer: LabsViewer }) {
  const [recent, setRecent] = useState<Recent[] | null>(null),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    const page = <T,>(kind: string) => labsCall<Page<T>>("activity", { kind }).then((p) => p.records ?? []);
    Promise.all([page<StoryDraft>("drafts"), page<PracticeSession>("sessions"), page<LabsFeedback>("feedback")])
      .then(([drafts, sessions, feedback]) => {
        if (!live) return;
        setRecent(
          [
            ...drafts.map((record) => ({ kind: "draft" as const, at: record.updatedAt || record.createdAt, record })),
            ...sessions.map((record) => ({ kind: "session" as const, at: record.completedAt || record.createdAt, record })),
            ...feedback.map((record) => ({ kind: "feedback" as const, at: record.updatedAt || record.createdAt, record })),
          ]
            .sort((a, b) => b.at.localeCompare(a.at))
            .slice(0, 3),
        );
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [viewer.uid]);
  const name = (id: string) => experiments.find((e) => e.id === id)?.name ?? id;
  const start = featuredOrder(experiments).find((e) => accessFor(e, viewer) === "open");
  return (
    <section className="lab-section lab-continue" aria-labelledby="continue-heading">
      <div className="lab-section__head" data-reveal>
        <div>
          <p className="lab-eyebrow">Your lab</p>
          <h2 id="continue-heading">Continue exploring.</h2>
        </div>
        <Link className="lab-text-link" to="/labs/activity">
          All my activity <span aria-hidden="true">→</span>
        </Link>
      </div>
      {failed ? (
        <p className="lab-quiet">Your recent activity could not load just now. It is still kept in My activity.</p>
      ) : !recent ? (
        <div className="lab-continue__list" aria-busy="true">
          {[0, 1, 2].map((i) => <div key={i} className="lab-skeleton" />)}
          <span className="lab-visually-hidden" role="status">Loading your recent activity</span>
        </div>
      ) : !recent.length ? (
        <div className="lab-continue__empty">
          <p>
            Nothing saved yet. Practice sessions, story drafts and feedback you send will appear here so you can pick up
            where you left off.
          </p>
          {start && (
            <Link className="lab-btn" to={`/labs/${start.slug}`}>
              Start with {start.name} <span aria-hidden="true">→</span>
            </Link>
          )}
        </div>
      ) : (
        <ul className="lab-continue__list">
          {recent.map((item) => (
            <li key={`${item.kind}-${item.record.id}`} className="lab-continue__item" data-kind={item.kind}>
              {item.kind === "draft" ? (
                <>
                  <span className="lab-continue__kind">Story draft · {name(item.record.experimentId)}</span>
                  <strong>{item.record.title || "Untitled draft"}</strong>
                  <span>Revision {item.record.revision} · {item.record.format} · {dateLabel(item.at)}</span>
                  <Link to={`/labs/cultural-story?draft=${item.record.id}`}>Reopen draft <span aria-hidden="true">→</span></Link>
                </>
              ) : item.kind === "session" ? (
                <>
                  <span className="lab-continue__kind">Practice · {name(item.record.experimentId)}</span>
                  <strong>{item.record.topic}</strong>
                  <span>
                    {item.record.completedAt
                      ? `${item.record.score} of ${item.record.questions.length} answers matched`
                      : "Not finished"}{" "}
                    · {dateLabel(item.at)}
                  </span>
                  <Link to={`/labs/${experiments.find((e) => e.id === item.record.experimentId)?.slug ?? item.record.experimentId}`}>Practise again <span aria-hidden="true">→</span></Link>
                </>
              ) : (
                <>
                  <span className="lab-continue__kind">Feedback · {name(item.record.experimentId)}</span>
                  <strong>{item.record.type}</strong>
                  <span>Status: {item.record.status} · {dateLabel(item.at)}</span>
                  <Link to="/labs/activity">Follow it <span aria-hidden="true">→</span></Link>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Published Labs updates; an honest empty state when the team has not posted any. */
export function UpdatesStrip({ experiments }: { experiments: Experiment[] }) {
  const [updates, setUpdates] = useState<LabsUpdate[] | null>(null),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    labsCall<Page<LabsUpdate>>("updates")
      .then((p) => live && setUpdates((p.records ?? []).slice(0, 3)))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);
  const name = (id: string) => experiments.find((e) => e.id === id)?.name ?? id;
  return (
    <section className="lab-section lab-updates" aria-labelledby="updates-heading">
      <div className="lab-section__head" data-reveal>
        <div>
          <p className="lab-eyebrow">Lab notes</p>
          <h2 id="updates-heading">What changed, and why.</h2>
        </div>
        <Link className="lab-text-link" to="/labs/updates">
          All updates <span aria-hidden="true">→</span>
        </Link>
      </div>
      {updates?.length ? (
        <ul className="lab-updates__list">
          {updates.map((u) => (
            <li key={u.id} data-reveal>
              <article className="lab-update">
                <p className="lab-update__meta">
                  {name(u.experimentId)} · v{u.version}
                  {dateLabel(u.createdAt) && <> · <time dateTime={u.createdAt}>{dateLabel(u.createdAt)}</time></>}
                </p>
                <h3>{u.title}</h3>
                <p>{u.body.length > 220 ? `${u.body.slice(0, 220).replace(/\s+\S*$/, "")}…` : u.body}</p>
                <Link to={`/labs/${u.experimentId}`}>
                  Open {name(u.experimentId)} <span aria-hidden="true">→</span>
                </Link>
              </article>
            </li>
          ))}
        </ul>
      ) : (
        <div className="lab-quiet-card">
          <p>
            {failed
              ? "Lab notes could not load just now."
              : !updates
                ? "Loading lab notes…"
                : "No lab notes have been published yet. Each experiment page lists its current version and known limits."}
          </p>
          <a className="lab-text-link" href="https://updates.indigenworld.com/">
            Release stories on the Indigen World blog <span aria-hidden="true">↗</span>
          </a>
        </div>
      )}
    </section>
  );
}

export function ShapeTheLab({ experiments, signedIn }: { experiments: Experiment[]; signedIn: boolean }) {
  const open = featuredOrder(experiments).filter((e) => !["retired", "graduated"].includes(e.status)).map(present);
  return (
    <section className="lab-section lab-shape" aria-labelledby="shape-heading">
      <div className="lab-shape__inner" data-reveal>
        <div>
          <p className="lab-eyebrow lab-eyebrow--light">Help shape the lab</p>
          <h2 id="shape-heading">Tell us what worked, and what didn't.</h2>
          <p>
            Found a rough edge, a language issue or an idea? Each experiment has its own feedback form. Reports go to the
            Labs team's review queue, and you can follow every one in My activity.
            {!signedIn && " Sending feedback needs a free Indigen World account."}
          </p>
        </div>
        <ul className="lab-shape__links">
          {open.map((e) => (
            <li key={e.id}>
              <Link to={`/labs/${e.slug}#feedback`}>
                <span>Feedback on</span> {e.name} <span aria-hidden="true">→</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
