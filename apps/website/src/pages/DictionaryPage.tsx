import { PageMotion } from "../components/PageMotion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { Link } from "../app/router";
import { ROUTES_BY_PATH } from "../content/navigation";
import {
  subscribeToPublishedDictionary,
  type DictionaryEntry,
} from "../features/dictionary/dictionaryData";
import { useDocumentMeta } from "../lib/useDocumentMeta";

import { createFromDiscovery, knowledgeFromDictionary } from "../content/creatorLinks";
import { discoverWords, readSavedWordIds } from "../features/dictionary/discovery";
import { ExperienceFeedback } from "../components/ExperienceFeedback";
import { ANALYTICS_EVENTS, trackEvent } from "../lib/analytics";

const route = ROUTES_BY_PATH.dictionary;
const SAVED_WORDS_KEY = "indigen-world:saved-dictionary-entries";
const PAGE_SIZE = 60;

function readSavedWords(): Set<string> {
  try {
    return readSavedWordIds(window.localStorage, SAVED_WORDS_KEY);
  } catch {
    return new Set();
  }
}

function DictionaryDetail({
  entry,
  saved,
  mobileOpen,
  onClose,
  onToggleSaved,
  saveMessage,
}: {
  entry: DictionaryEntry | null;
  saved: boolean;
  mobileOpen: boolean;
  onClose: () => void;
  onToggleSaved: () => void;
  saveMessage: string;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const [shareStatus, setShareStatus] = useState<"idle" | "copied" | "manual">("idle");
  const [audioFailed, setAudioFailed] = useState(false);
  useEffect(() => { setShareStatus("idle"); setAudioFailed(false); }, [entry?.id]);

  useEffect(() => {
    if (!mobileOpen) return;

    const dialog = dialogRef.current;
    const returnFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const backgroundElements = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".skip-link, .site-header, .dictionary-page__masthead, .dictionary-results, .dictionary-next, .site-footer"
      )
    );
    const previousInert = backgroundElements.map((element) => [element, element.inert] as const);
    const previousOverflow = document.body.style.overflow;
    const mobileQuery = window.matchMedia("(max-width: 899px)");
    const focusableSelector = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "audio[controls]",
      '[tabindex]:not([tabindex="-1"])',
    ].join(",");

    backgroundElements.forEach((element) => {
      element.inert = true;
    });
    document.body.style.overflow = "hidden";

    const focusDialog = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
        .filter((element) => !element.inert && element.getClientRects().length > 0);

      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && (activeElement === first || !dialog.contains(activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const handleViewportChange = (event: MediaQueryListEvent) => {
      if (!event.matches) onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    mobileQuery.addEventListener("change", handleViewportChange);

    return () => {
      window.cancelAnimationFrame(focusDialog);
      document.removeEventListener("keydown", handleKeyDown);
      mobileQuery.removeEventListener("change", handleViewportChange);
      previousInert.forEach(([element, inert]) => {
        element.inert = inert;
      });
      document.body.style.overflow = previousOverflow;
      window.requestAnimationFrame(() => {
        const target = returnFocus?.isConnected ? returnFocus : document.getElementById("dictionary-results-heading");
        target?.focus({ preventScroll: true });
      });
    };
  }, [mobileOpen, onClose]);

  if (!entry) {
    return (
      <aside className="dictionary-detail dictionary-detail--empty">
        <Icon name="book" size={32} />
        <h2>Choose a word</h2>
        <p>Select an entry to see its pronunciation, examples, context and source.</p>
      </aside>
    );
  }

  return (
    <aside
      ref={dialogRef}
      id="dictionary-entry-dialog"
      className={`dictionary-detail${mobileOpen ? " dictionary-detail--mobile-open" : ""}`}
      role={mobileOpen ? "dialog" : undefined}
      aria-modal={mobileOpen ? true : undefined}
      aria-labelledby="dictionary-entry-heading"
      tabIndex={mobileOpen ? -1 : undefined}
    >
      <div className="dictionary-detail__mobile-bar">
        <span>Dictionary entry</span>
        <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close entry">
          <Icon name="x" size={20} />
        </button>
      </div>

      <div className="dictionary-detail__scroll">
        <div className="dictionary-detail__status-row">
          <span className="dictionary-published"><Icon name="check" size={14} /> {entry.authenticationStatus === "gold" ? "Expert authenticated" : entry.authenticationStatus === "reviewed" ? "Community reviewed" : "Published entry"}</span>
          <button
            className={`dictionary-save${saved ? " dictionary-save--active" : ""}`}
            type="button"
            onClick={onToggleSaved}
            aria-pressed={saved}
          >
            <Icon name="bookmark" size={18} />
            {saved ? "Saved" : "Save word"}
          </button>
        </div>
        <p className="tiny dictionary-save-message" role="status">{saveMessage}</p>

        <p className="dictionary-detail__word-class">{entry.partOfSpeech}</p>
        <h2 id="dictionary-entry-heading">{entry.headword}</h2>
        <p className="dictionary-detail__translation">{entry.translation}</p>
        {entry.frenchTranslation && <p className="dictionary-detail__translation">French: {entry.frenchTranslation}</p>}

        <div className="dictionary-detail__chips" aria-label="Entry language and dialect">
          <span><Icon name="pin" size={16} /> {entry.dialect}</span>
          <span><Icon name="globe" size={16} /> Kasem</span>
        </div>

        <div className="dictionary-detail__cards">
          {entry.literalTranslation && <section className="dictionary-fact"><Icon name="book" size={22} /><div><h3>Literal translation</h3><p>{entry.literalTranslation}</p></div></section>}
          {entry.usageContext && <section className="dictionary-fact"><Icon name="context" size={22} /><div><h3>When it is used</h3><p>{entry.usageContext}</p></div></section>}
          <section className="dictionary-fact">
            <Icon name="volume" size={22} />
            <div>
              <h3>Pronunciation</h3>
              <p>{entry.pronunciation === "Audio not available yet" ? "No written pronunciation guide yet" : entry.pronunciation}</p>
              {entry.audioUrl ? (
                <audio key={entry.id} controls preload="none" src={entry.audioUrl} aria-label={`Pronunciation of ${entry.headword}`}
                  onError={() => setAudioFailed(true)}
                  onPlay={() => trackEvent(ANALYTICS_EVENTS.dictionaryAction, { action: "play_audio" })} />
              ) : (
                <span className="dictionary-fact__note">No recording has been published yet.</span>
              )}
              {audioFailed && <span className="dictionary-fact__note" role="status">This recording could not be loaded. Check your connection, or let us know through Suggest a correction below.</span>}
            </div>
          </section>

          <section className="dictionary-fact">
            <Icon name="chat" size={22} />
            <div>
              <h3>Example</h3>
              <p>{entry.example}</p>
              <p className="dictionary-fact__translation">{entry.exampleTranslation}</p>
            </div>
          </section>

          {entry.culturalNote && (
            <section className="dictionary-fact">
              <Icon name="context" size={22} />
              <div>
                <h3>Cultural context</h3>
                <p>{entry.culturalNote}</p>
              </div>
            </section>
          )}

          <section className="dictionary-fact">
            <Icon name="source" size={22} />
            <div>
              <h3>Recorded source</h3>
              <p>{entry.attribution}</p>
              <p className="dictionary-fact__translation"><Link to="impact-governance">Check cultural permissions before reusing material.</Link></p>
            </div>
          </section>
        </div>

        <div className="dictionary-share">
          <button className="dictionary-save" type="button" onClick={async () => {
            const url = `https://indigenworld.com/dictionary?entry=${encodeURIComponent(entry.id)}`;
            try { await navigator.clipboard.writeText(url); setShareStatus("copied"); }
            catch { setShareStatus("manual"); }
          }}>Copy entry link</button>
          <span className="tiny" role="status">{shareStatus === "copied" ? "Link copied." : shareStatus === "manual" ? "Copy the link below." : "Share this exact meaning and source."}</span>
          {shareStatus === "manual" && <input aria-label="Entry link to copy" readOnly value={`https://indigenworld.com/dictionary?entry=${encodeURIComponent(entry.id)}`} onFocus={(event) => event.target.select()} />}
        </div>

        <Button
          to={`contact?subject=publication-correction-takedown&entry=${encodeURIComponent(entry.id)}&word=${encodeURIComponent(entry.headword)}`}
          variant="secondary"
          className="dictionary-correction"
        >
          Suggest a correction
        </Button>
        <Button href={createFromDiscovery(`dictionary?entry=${encodeURIComponent(entry.id)}`)} external variant="secondary" className="dictionary-correction">Create a related story or lesson</Button>
        <p className="tiny">TribeStudio opens in a new tab and requires sign-in. Your source link follows you there. Corrections go to the review team.</p>
        <Button href={knowledgeFromDictionary(entry.id)} external variant="secondary" className="dictionary-correction">Contribute context or a pronunciation</Button>
        <p className="tiny">Open a knowledge record linked to this word, with your source, regional usage and permission choices.</p>
      </div>
    </aside>
  );
}

export function DictionaryPage() {
  useDocumentMeta(route.title, route.description);

  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [retryKey, setRetryKey] = useState(0);
  const [queryText, setQueryText] = useState(() => new URLSearchParams(window.location.search).get("q")?.slice(0, 200) ?? "");
  const [dialect, setDialect] = useState("");
  const [audioOnly, setAudioOnly] = useState(() => new URLSearchParams(window.location.search).get("audio") === "1");
  const [savedOnly, setSavedOnly] = useState(() => new URLSearchParams(window.location.search).get("saved") === "1");
  const [saveMessage, setSaveMessage] = useState("");
  const [missingLinkedEntry, setMissingLinkedEntry] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(() => new URLSearchParams(window.location.search).get("entry"));
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const linkedEntry = useRef(new URLSearchParams(window.location.search).get("entry"));
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const [savedWords, setSavedWords] = useState<Set<string>>(readSavedWords);

  useEffect(() => {
    setStatus("loading");
    return subscribeToPublishedDictionary(
      (nextEntries) => {
        setEntries(nextEntries);
        setStatus("ready");
      },
      () => setStatus("error")
    );
  }, [retryKey]);

  useEffect(() => {
    if (!linkedEntry.current || status !== "ready") return;
    if (entries.some((entry) => entry.id === linkedEntry.current)) setMobileDetailOpen(window.matchMedia("(max-width: 899px)").matches);
    else setMissingLinkedEntry(true);
    linkedEntry.current = null;
  }, [entries, status]);

  useEffect(() => setVisibleLimit(PAGE_SIZE), [queryText, dialect, audioOnly, savedOnly]);

  const groups = useMemo(() => discoverWords(entries, { query: queryText, dialect, audioOnly, savedOnly }, savedWords), [entries, queryText, dialect, audioOnly, savedOnly, savedWords]);
  const resultCount = groups.reduce((total, group) => total + group.entries.length, 0);
  const dialects = useMemo(() => [...new Set(entries.map((entry) => entry.dialect))].sort((a, b) => a.localeCompare(b)), [entries]);
  const visibleGroups = groups.slice(0, visibleLimit);
  const selectedEntry = entries.find((entry) => entry.id === selectedId) ?? null;
  const hasFilters = Boolean(queryText || dialect || audioOnly || savedOnly);
  const resetFilters = () => { setQueryText(""); setDialect(""); setAudioOnly(false); setSavedOnly(false); };
  const closeMobileDetail = useCallback(() => setMobileDetailOpen(false), []);
  useEffect(() => {
    if (status !== "ready" || mobileDetailOpen) return;
    if (!groups.some((group) => group.entries.some((entry) => entry.id === selectedId))) {
      setSelectedId(groups[0]?.entries[0]?.id ?? null);
    }
  }, [groups, status, mobileDetailOpen, selectedId]);
  useEffect(() => setSaveMessage(""), [selectedId]);

  const toggleSaved = () => {
    if (!selectedEntry) return;
    const next = new Set(savedWords);
    const removing = next.has(selectedEntry.id);
    if (removing) next.delete(selectedEntry.id);
    else next.add(selectedEntry.id);
    setSavedWords(next);
    try {
      window.localStorage.setItem(SAVED_WORDS_KEY, JSON.stringify([...next]));
      setSaveMessage(removing ? "Removed from saved words." : "Saved on this device. Find it in Saved words.");
    } catch {
      setSaveMessage("Browser storage is unavailable. Your saved list will last only while this page stays open.");
    }
    trackEvent(ANALYTICS_EVENTS.dictionaryAction, { action: removing ? "unsave" : "save" });
  };

  return (
    <section className="dictionary-page">
      <div className="dictionary-page__masthead">
        <PageMotion />
        <div className="container dictionary-page__intro">
          <div>
            <p className="eyebrow">Collection · Dictionary</p>
            <h1>Words with a living context.</h1>
            <p>Search published Kasem words, compare their recorded meanings, and keep a few to return to.</p>
            <p className="dictionary-page__role">
              No account needed. New to Kasem? <Link to="learn">Follow the learning guide</Link>.
            </p>
          </div>

          <label className="dictionary-search">
            <span className="sr-only">Search Kasem, English, or dialect</span>
            <Icon name="search" size={22} />
            <input
              type="search"
              value={queryText}
              onChange={(event) => setQueryText(event.target.value)}
              placeholder="Search Kasem, English, or dialect"
              autoComplete="off"
            />
            {queryText && (
              <button type="button" onClick={() => setQueryText("")} aria-label="Clear search">
                <Icon name="x" size={18} />
              </button>
            )}
          </label>
        </div>
      </div>

      <div className="container dictionary-workspace">
        <section className="dictionary-results" aria-labelledby="dictionary-results-heading">
          {missingLinkedEntry && <p className="dictionary-link-notice" role="status">The linked entry is not available in this public word collection. You can search other words below or <Link to="learn">explore the reference guides</Link>.</p>}
          <div className="dictionary-filters">
            <div className="dictionary-view" aria-label="Choose dictionary view">
              <button type="button" aria-pressed={!savedOnly} onClick={() => setSavedOnly(false)}>All words</button>
              <button type="button" aria-pressed={savedOnly} onClick={() => { setSavedOnly(true); trackEvent(ANALYTICS_EVENTS.dictionaryAction, { action: "view_saved" }); }}>Saved words</button>
            </div>
            <label className="dictionary-dialect">Dialect or source label<select value={dialect} onChange={(event) => setDialect(event.target.value)}><option value="">All dialects and sources</option>{dialects.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="dictionary-audio-filter"><input type="checkbox" checked={audioOnly} onChange={(event) => { setAudioOnly(event.target.checked); trackEvent(ANALYTICS_EVENTS.dictionaryAction, { action: "filter_audio" }); }} /> With a recording</label>
            {hasFilters && <button className="dictionary-reset" type="button" onClick={resetFilters}>Reset filters</button>}
            <p className="tiny">Saved words stay in this browser. Recordings and source details vary by entry.</p>
          </div>
          <div className="dictionary-results__heading">
            <div>
              <p className="eyebrow">Published collection</p>
              <h2 id="dictionary-results-heading" tabIndex={-1}>
                {status === "ready" ? `${resultCount.toLocaleString()} ${resultCount === 1 ? "entry" : "entries"}` : "Dictionary entries"}
              </h2>
              <p className="tiny" role="status">{status === "ready" && `${groups.length.toLocaleString()} ${groups.length === 1 ? "spelling" : "spellings"}${audioOnly ? " with recordings" : ""}${savedOnly ? " in your saved words" : ""}`}</p>
            </div>
            {savedWords.size > 0 && <span className="dictionary-saved-count"><Icon name="bookmark" size={15} /> {savedWords.size} saved</span>}
          </div>

          {status === "loading" && (
            <div className="dictionary-loading" role="status" aria-label="Loading dictionary">
              {Array.from({ length: 6 }, (_, index) => <span key={index} />)}
            </div>
          )}

          {status === "error" && (
            <div className="dictionary-state" role="alert">
              <Icon name="book" size={34} />
              <h3>The dictionary could not be refreshed.</h3>
              <p>Check your connection and try loading the published collection again.</p>
              <button type="button" onClick={() => setRetryKey((value) => value + 1)}>Try again</button>
            </div>
          )}

          {status === "ready" && resultCount === 0 && (
            <div className="dictionary-state">
              <Icon name="search" size={34} />
              <h3>{savedOnly ? "No saved words match this view" : hasFilters ? "No matching words" : "No entries have been published yet"}</h3>
              <p>{savedOnly ? "Open a word and choose Save word. You can also reset filters to find more entries." : hasFilters ? "Try a different spelling, a shorter English search, or turn off a filter. Tone marks can change a word's meaning." : "Published entries will appear here."}</p>
              {hasFilters && <button type="button" onClick={resetFilters}>Reset filters</button>}
              <Link to="contribute">Help add language and context</Link>
            </div>
          )}

          {status === "ready" && visibleGroups.length > 0 && (
            <div className="dictionary-entry-list">
              {visibleGroups.map((group) => <div className="dictionary-word-group" key={group.key}>
                {group.entries.length > 1 && <div className="dictionary-word-group__label"><strong>{group.entries[0].headword}</strong><span>{group.entries.length} records · compare meanings and sources</span></div>}
                {group.entries.map((entry) => (
                <button
                  key={entry.id}
                  className={`dictionary-entry-card${selectedId === entry.id ? " dictionary-entry-card--active" : ""}`}
                  type="button"
                  onClick={() => {
                    setSelectedId(entry.id);
                    if (window.matchMedia("(max-width: 899px)").matches) {
                      setMobileDetailOpen(true);
                    }
                  }}
                  aria-pressed={selectedId === entry.id}
                  aria-controls="dictionary-entry-dialog"
                >
                  <span className="dictionary-entry-card__icon"><Icon name="translate" size={23} /></span>
                  <span className="dictionary-entry-card__copy">
                    <strong>{entry.headword}</strong>
                    <span>{entry.translation}</span>
                    <small>{entry.partOfSpeech} · {entry.dialect}{entry.audioUrl ? " · Audio" : ""}</small>
                  </span>
                  {savedWords.has(entry.id) && <Icon name="bookmark" size={17} />}
                  <Icon name="chevron" size={20} />
                </button>
              ))}</div>)}
              {visibleGroups.length < groups.length && (
                <button className="dictionary-load-more" type="button" onClick={() => setVisibleLimit((value) => value + PAGE_SIZE)}>
                  Show more entries
                </button>
              )}
            </div>
          )}
        </section>

        <DictionaryDetail
          entry={selectedEntry}
          saved={selectedEntry ? savedWords.has(selectedEntry.id) : false}
          mobileOpen={mobileDetailOpen}
          onClose={closeMobileDetail}
          onToggleSaved={toggleSaved}
          saveMessage={saveMessage}
        />
      </div>
      <div className="container dictionary-next">
        <div><h2>Put a word in context.</h2><p>Whole expressions and sentences have their own collections. Learn how to read a source, find examples, and practise at your own pace.</p><Button to="learn" variant="secondary">Explore learning resources</Button></div>
        <ExperienceFeedback page="dictionary" />
      </div>
    </section>
  );
}
