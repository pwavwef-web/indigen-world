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

const route = ROUTES_BY_PATH.dictionary;
const SAVED_WORDS_KEY = "indigen-world:saved-dictionary-entries";
const PAGE_SIZE = 60;

function readSavedWords(): Set<string> {
  try {
    const value = JSON.parse(window.localStorage.getItem(SAVED_WORDS_KEY) ?? "[]");
    return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
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
}: {
  entry: DictionaryEntry | null;
  saved: boolean;
  mobileOpen: boolean;
  onClose: () => void;
  onToggleSaved: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!mobileOpen) return;

    const dialog = dialogRef.current;
    const returnFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const backgroundElements = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".site-header, .dictionary-page__masthead, .dictionary-results, .site-footer"
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
        if (returnFocus?.isConnected) returnFocus.focus();
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
          <span className="dictionary-published"><Icon name="check" size={14} /> Published entry</span>
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

        <p className="dictionary-detail__word-class">{entry.partOfSpeech}</p>
        <h2 id="dictionary-entry-heading">{entry.headword}</h2>
        <p className="dictionary-detail__translation">{entry.translation}</p>

        <div className="dictionary-detail__chips" aria-label="Entry language and dialect">
          <span><Icon name="pin" size={16} /> {entry.dialect}</span>
          <span><Icon name="globe" size={16} /> Kasem</span>
        </div>

        <div className="dictionary-detail__cards">
          <section className="dictionary-fact">
            <Icon name="volume" size={22} />
            <div>
              <h3>Pronunciation</h3>
              <p>{entry.pronunciation}</p>
              {entry.audioUrl ? (
                <audio controls preload="none" src={entry.audioUrl} aria-label={`Pronunciation of ${entry.headword}`} />
              ) : (
                <span className="dictionary-fact__note">No recording has been published yet.</span>
              )}
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
              <h3>Source and rights</h3>
              <p>{entry.attribution}</p>
            </div>
          </section>
        </div>

        <Button
          to="contact?subject=publication-correction-takedown"
          variant="secondary"
          className="dictionary-correction"
        >
          Suggest a correction
        </Button>
      </div>
    </aside>
  );
}

export function DictionaryPage() {
  useDocumentMeta(route.title, route.description);

  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [retryKey, setRetryKey] = useState(0);
  const [queryText, setQueryText] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
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
    if (!selectedId && entries.length) setSelectedId(entries[0].id);
  }, [entries, selectedId]);

  useEffect(() => setVisibleLimit(PAGE_SIZE), [queryText]);

  const normalizedQuery = queryText.trim().toLocaleLowerCase();
  const filteredEntries = useMemo(() => {
    if (!normalizedQuery) return entries;
    return entries.filter((entry) =>
      [entry.headword, entry.translation, entry.dialect]
        .some((value) => value.toLocaleLowerCase().includes(normalizedQuery))
    );
  }, [entries, normalizedQuery]);
  const visibleEntries = filteredEntries.slice(0, visibleLimit);
  const selectedEntry = filteredEntries.find((entry) => entry.id === selectedId) ?? null;
  const closeMobileDetail = useCallback(() => setMobileDetailOpen(false), []);

  const toggleSaved = () => {
    if (!selectedEntry) return;
    setSavedWords((current) => {
      const next = new Set(current);
      if (next.has(selectedEntry.id)) next.delete(selectedEntry.id);
      else next.add(selectedEntry.id);
      window.localStorage.setItem(SAVED_WORDS_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  return (
    <section className="dictionary-page">
      <div className="dictionary-page__masthead">
        <div className="container dictionary-page__intro">
          <div>
            <p className="eyebrow">Collection · Dictionary</p>
            <h1>Words with a living context.</h1>
            <p>Search the community-published Kasem dictionary by Kasem, English, or dialect.</p>
            <p className="dictionary-page__role">
              Use the website for quick search and sharing. The mobile app carries the same
              reviewed entries into an offline-friendly learning experience. {" "}
              <Link to="get-involved?route=mobile-app-waitlist">Join the mobile app waitlist</Link>.
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
          <div className="dictionary-results__heading">
            <div>
              <p className="eyebrow">Published collection</p>
              <h2 id="dictionary-results-heading">
                {status === "ready" ? `${filteredEntries.length.toLocaleString()} ${filteredEntries.length === 1 ? "entry" : "entries"}` : "Dictionary entries"}
              </h2>
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

          {status === "ready" && filteredEntries.length === 0 && (
            <div className="dictionary-state">
              <Icon name="search" size={34} />
              <h3>{normalizedQuery ? "No matching words" : "No entries have been published yet"}</h3>
              <p>{normalizedQuery ? "Try a different Kasem word, English translation, or dialect." : "Published, community-reviewed entries will appear here."}</p>
              {normalizedQuery && <button type="button" onClick={() => setQueryText("")}>Clear search</button>}
            </div>
          )}

          {status === "ready" && visibleEntries.length > 0 && (
            <div className="dictionary-entry-list">
              {visibleEntries.map((entry) => (
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
                    <small>{entry.partOfSpeech} · {entry.dialect}</small>
                  </span>
                  {savedWords.has(entry.id) && <Icon name="bookmark" size={17} />}
                  <Icon name="chevron" size={20} />
                </button>
              ))}
              {visibleEntries.length < filteredEntries.length && (
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
        />
      </div>
    </section>
  );
}
