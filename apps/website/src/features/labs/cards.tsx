import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { LABS_REGISTRY } from "@indigen-world/contracts/labs";
import type { Experiment, LabsMode } from "@indigen-world/contracts/labs";
import { Link } from "../../app/router";
import {
  MODE_LABELS,
  MODES,
  STATUS_LABELS,
  accessFor,
  accessNote,
  actionVerb,
  present,
  statusBadge,
  type LabsViewer,
} from "./access";
import { ExperimentPreview } from "./previews";

export function StatusBadge({ experiment }: { experiment: Experiment }) {
  const badge = statusBadge(experiment);
  return <span className="lab-badge" data-tone={badge.tone}>{badge.label}</span>;
}

export function ExperimentCard({ experiment: raw, viewer, featured = false }: { experiment: Experiment; viewer: LabsViewer; featured?: boolean }) {
  const experiment = present(raw),
    state = accessFor(experiment, viewer),
    verb = actionVerb(experiment, state),
    headingId = useId(),
    [active, setActive] = useState(false);
  return (
    <article
      className={`lab-card${featured ? " lab-card--featured" : ""}`}
      aria-labelledby={headingId}
      data-active={active}
      onPointerEnter={(e) => e.pointerType === "mouse" && setActive(true)}
      onPointerLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setActive(false)}
    >
      <ExperimentPreview experiment={experiment} active={active} />
      <div className="lab-card__body">
        <div className="lab-card__meta">
          <StatusBadge experiment={experiment} />
          <span className="lab-card__modes">{experiment.modes.map((m) => MODE_LABELS[m]).join(" · ")}</span>
        </div>
        <h3 id={headingId}>{experiment.name}</h3>
        <p className="lab-card__summary">{experiment.summary}</p>
        <div className="lab-card__foot">
          <p className="lab-access" data-state={state}>
            <span className="lab-access__dot" aria-hidden="true" />
            {accessNote(experiment, state)}
          </p>
          <Link
            className={`lab-btn${["open", "checking", "unconfirmed"].includes(state) ? "" : " lab-btn--secondary"}`}
            to={`/labs/${experiment.slug}`}
            aria-label={`${verb}: ${experiment.name}`}
          >
            {verb} <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </article>
  );
}

/** What this visitor can start comes first; retired and graduated experiments stay in the full collection, not the spotlight. */
export function featuredOrder(experiments: Experiment[], viewer?: LabsViewer) {
  const rank = (e: Experiment) => {
    if (["retired", "graduated"].includes(e.status)) return 3;
    if (!e.enabled) return 2;
    return viewer && accessFor(e, viewer) === "invite-only" ? 1 : 0;
  };
  // Within a rank, keep the registry's curated order so admin edits do not reshuffle the row.
  const curated = (e: Experiment) => {
    const i = LABS_REGISTRY.findIndex((r) => r.id === e.id);
    return i < 0 ? LABS_REGISTRY.length : i;
  };
  return [...experiments].sort((a, b) => rank(a) - rank(b) || curated(a) - curated(b));
}

export function FeaturedRow({ experiments, viewer }: { experiments: Experiment[]; viewer: LabsViewer }) {
  const track = useRef<HTMLUListElement>(null),
    [edges, setEdges] = useState({ start: true, end: false }),
    featured = featuredOrder(experiments, viewer).filter((e) => !["retired", "graduated"].includes(e.status));
  const measure = () => {
    const el = track.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 });
  };
  const order = featured.map((e) => e.id).join();
  // Scroll snapping keeps the previously snapped card in view when cards
  // reorder (for example once availability loads); start from the first card.
  useLayoutEffect(() => {
    if (track.current) track.current.scrollLeft = 0;
    measure();
  }, [order]);
  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  const scroll = (direction: number) => {
    const el = track.current;
    const card = el?.querySelector("li");
    if (!el || !card) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: direction * (card.getBoundingClientRect().width + 20), behavior: reduced ? "auto" : "smooth" });
  };
  return (
    <section className="lab-section lab-featured" id="featured-experiments" aria-labelledby="featured-heading" tabIndex={-1}>
      <div className="lab-section__head" data-reveal>
        <div>
          <p className="lab-eyebrow">Featured experiments</p>
          <h2 id="featured-heading">Try something unexpected.</h2>
          <p className="lab-section__lede">
            Small games and tools, each one a different way into Kasem language and culture. Pick one and start in a minute.
          </p>
        </div>
        <div className="lab-row-controls">
          <button type="button" className="lab-icon-btn lab-icon-btn--light" disabled={edges.start} onClick={() => scroll(-1)}>
            <span aria-hidden="true">←</span>
            <span className="lab-visually-hidden">Scroll featured experiments back</span>
          </button>
          <button type="button" className="lab-icon-btn lab-icon-btn--light" disabled={edges.end} onClick={() => scroll(1)}>
            <span aria-hidden="true">→</span>
            <span className="lab-visually-hidden">Scroll featured experiments forward</span>
          </button>
        </div>
      </div>
      <ul className="lab-featured__track" ref={track} onScroll={measure}>
        {featured.map((e) => (
          <li key={e.id}>
            <ExperimentCard experiment={e} viewer={viewer} featured />
          </li>
        ))}
      </ul>
      <Link className="lab-text-link" to="/labs/experiments">
        See the full collection <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}

/** Mode shortcuts with live counts from the registry. */
export function ModeShortcuts({ experiments }: { experiments: Experiment[] }) {
  const counts = MODES.map((mode) => [mode, experiments.filter((e) => present(e).modes.includes(mode)).length] as const).filter(([, n]) => n > 0);
  const copy: Record<LabsMode, string> = {
    play: "Games that move language forward",
    learn: "Practice with reviewed material",
    create: "Make something from a source",
    contribute: "Send knowledge to reviewers",
  };
  return (
    <nav className="lab-modes" aria-label="Browse experiments by what you want to do">
      {counts.map(([mode, n]) => (
        <Link key={mode} className="lab-mode" data-reveal to={`/labs/experiments?mode=${mode}`}>
          <strong>{MODE_LABELS[mode]}</strong>
          <span>{copy[mode]}</span>
          <small>
            {n} experiment{n === 1 ? "" : "s"} <span aria-hidden="true">→</span>
          </small>
        </Link>
      ))}
    </nav>
  );
}

function initialFilters() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode");
  return { mode: ((MODES as string[]).includes(mode ?? "") ? mode : "all") as LabsMode | "all", query: params.get("q") ?? "" };
}

export function Collection({ experiments, viewer }: { experiments: Experiment[]; viewer: LabsViewer }) {
  const [filters] = useState(initialFilters),
    [mode, setMode] = useState<LabsMode | "all">(filters.mode),
    [query, setQuery] = useState(filters.query),
    [status, setStatus] = useState("all"),
    presented = useMemo(() => featuredOrder(experiments).map(present), [experiments]),
    modes = MODES.filter((m) => presented.some((e) => e.modes.includes(m))),
    statuses = [...new Set(presented.map((e) => e.status))],
    needle = query.trim().toLowerCase(),
    found = presented.filter(
      (e) =>
        (mode === "all" || e.modes.includes(mode)) &&
        (status === "all" || e.status === status) &&
        (!needle || `${e.name} ${e.purpose} ${e.summary} ${e.instructions}`.toLowerCase().includes(needle)),
    );
  // Keep the address shareable without remounting the page.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (mode === "all") params.delete("mode");
    else params.set("mode", mode);
    if (needle) params.set("q", query.trim());
    else params.delete("q");
    const search = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${search ? `?${search}` : ""}`);
  }, [mode, needle, query]);
  const clear = () => {
    setMode("all");
    setQuery("");
    setStatus("all");
  };
  return (
    <section className="lab-collection" aria-labelledby="collection-heading">
      <div className="lab-toolbar">
        <div className="lab-chips" role="group" aria-label="Filter by what you want to do">
          {(["all", ...modes] as const).map((m) => {
            const count = m === "all" ? presented.length : presented.filter((e) => e.modes.includes(m)).length;
            return (
              <button key={m} type="button" className="lab-chip" aria-pressed={mode === m} onClick={() => setMode(m)}>
                {m === "all" ? "All" : MODE_LABELS[m]} <span>{count}</span>
              </button>
            );
          })}
        </div>
        <div className="lab-toolbar__fields">
          <label className="lab-search">
            <span className="lab-visually-hidden">Search experiments</span>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search experiments" />
          </label>
          {statuses.length > 1 && (
            <label className="lab-select">
              <span className="lab-visually-hidden">Lifecycle</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="all">Any stage</option>
                {statuses.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </label>
          )}
        </div>
      </div>
      <h2 id="collection-heading" className="lab-visually-hidden">All experiments</h2>
      <p className="lab-results" role="status">
        {found.length === presented.length ? `All ${found.length} experiments` : `${found.length} of ${presented.length} experiments`}
      </p>
      {found.length ? (
        <ul className="lab-grid">
          {found.map((e) => (
            <li key={e.id} data-reveal>
              <ExperimentCard experiment={e} viewer={viewer} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="lab-empty">
          <h3>Nothing matches {needle ? `“${query.trim()}”` : "these filters"} yet.</h3>
          <p>
            Labs is small for now: {presented.length} experiments. Try another word, or browse them all — and if you have an idea
            for a new one, send it as feedback from any experiment.
          </p>
          <button type="button" className="lab-btn lab-btn--secondary" onClick={clear}>
            Clear filters
          </button>
        </div>
      )}
    </section>
  );
}
