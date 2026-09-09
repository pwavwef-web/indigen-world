import { useEffect, useMemo, useState } from "react";
import { subscribeToDictionary, type DictionaryEntry } from "./firebase";

const LETTERS = "ABCDEFGHIJKLMNOƆPQRSTUVWXYZ".split("");
const SAVED_KEY = "kasena-dictionary:saved-words";

function firstLetter(word: string): string {
  return word.normalize("NFD").replace(/^[^A-Za-zƆɔ]+/g, "").charAt(0).toUpperCase();
}

function readSaved(): Set<string> {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVED_KEY) ?? "[]");
    return new Set(Array.isArray(saved) ? saved.filter((value): value is string => typeof value === "string") : []);
  } catch {
    return new Set();
  }
}

function EntryDetail({ entry, saved, onToggleSaved }: {
  entry: DictionaryEntry | null;
  saved: boolean;
  onToggleSaved: () => void;
}) {
  if (!entry) {
    return (
      <section className="detail empty-detail" aria-live="polite">
        <span className="empty-detail__glyph" aria-hidden="true">Aa</span>
        <h2>Choose a word</h2>
        <p>Select an entry to read its meaning, pronunciation and use in context.</p>
      </section>
    );
  }

  return (
    <article className="detail">
      <div className="detail__topline">
        <span className="published-pill">Reviewed entry</span>
        <button className={saved ? "save-button is-saved" : "save-button"} type="button" onClick={onToggleSaved} aria-pressed={saved}>
          <span aria-hidden="true">{saved ? "★" : "☆"}</span> {saved ? "Saved" : "Save"}
        </button>
      </div>

      <p className="word-class">{entry.partOfSpeech}</p>
      <h2>{entry.headword}</h2>
      <p className="translation">{entry.translation}</p>
      <div className="entry-meta"><span>Kasem</span><span>{entry.dialect}</span></div>

      <dl className="definition-list">
        <div>
          <dt>Pronunciation</dt>
          <dd>{entry.pronunciation}</dd>
          {entry.audioUrl && <audio controls preload="none" src={entry.audioUrl} aria-label={`Pronunciation of ${entry.headword}`} />}
        </div>
        <div>
          <dt>Example</dt>
          <dd lang="xsm">{entry.example}</dd>
          <dd className="example-translation">{entry.exampleTranslation}</dd>
        </div>
        {entry.culturalNote && <div><dt>Usage and context</dt><dd>{entry.culturalNote}</dd></div>}
        <div className="source-note"><dt>Source</dt><dd>{entry.attribution}</dd></div>
      </dl>
    </article>
  );
}

export function App() {
  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);
  const [queryText, setQueryText] = useState("");
  const [letter, setLetter] = useState<string | null>(null);
  const [savedOnly, setSavedOnly] = useState(false);
  const [saved, setSaved] = useState<Set<string>>(readSaved);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setStatus("loading");
    return subscribeToDictionary(
      (next) => {
        setEntries(next);
        setStatus("ready");
      },
      () => setStatus("error")
    );
  }, [retry]);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();

    void Promise.resolve(context.registerTool({
      name: "search_kasena_dictionary",
      title: "Search Kasena Dictionary",
      description: "Search the visible Kasena Dictionary by a Kasem or English word.",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string", minLength: 1, maxLength: 120 } },
        required: ["query"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!input || typeof input !== "object" || !("query" in input) || typeof input.query !== "string") {
          throw new Error("A text query is required.");
        }
        const query = input.query.trim();
        if (!query || query.length > 120) throw new Error("The query must contain 1 to 120 characters.");
        const normalized = query.toLocaleLowerCase();
        const matches = entries.filter((entry) => [entry.headword, entry.translation, entry.partOfSpeech, entry.dialect]
          .some((value) => value.toLocaleLowerCase().includes(normalized))).length;
        setQueryText(query);
        setLetter(null);
        setSavedOnly(false);
        return { query, matches };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);

    return () => lifecycle.abort();
  }, [entries]);

  const normalizedQuery = queryText.trim().toLocaleLowerCase();
  const availableLetters = useMemo(() => new Set(entries.map((entry) => firstLetter(entry.headword))), [entries]);
  const filtered = useMemo(() => entries.filter((entry) => {
    const matchesSearch = !normalizedQuery || [entry.headword, entry.translation, entry.partOfSpeech, entry.dialect]
      .some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
    const matchesLetter = !letter || firstLetter(entry.headword) === letter;
    const matchesSaved = !savedOnly || saved.has(entry.id);
    return matchesSearch && matchesLetter && matchesSaved;
  }), [entries, letter, normalizedQuery, saved, savedOnly]);

  useEffect(() => {
    if (filtered.length && !filtered.some((entry) => entry.id === selectedId)) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  const selected = filtered.find((entry) => entry.id === selectedId) ?? null;
  const toggleSaved = () => {
    if (!selected) return;
    setSaved((current) => {
      const next = new Set(current);
      if (next.has(selected.id)) next.delete(selected.id);
      else next.add(selected.id);
      localStorage.setItem(SAVED_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="/" aria-label="Kasena Dictionary home">
          <span className="brand__mark" aria-hidden="true">K</span>
          <span><strong>Kasena</strong><small>Dictionary</small></span>
        </a>
        <span className="language-pair">Kasem <b aria-hidden="true">↔</b> English</span>
      </header>

      <main>
        <section className="search-area" aria-labelledby="app-title">
          <p className="kicker">Independent Kasem language resource</p>
          <h1 id="app-title">Find the word you need.</h1>
          <label className="search-box">
            <span className="search-box__icon" aria-hidden="true">⌕</span>
            <span className="sr-only">Search Kasem or English</span>
            <input
              type="search"
              value={queryText}
              onChange={(event) => { setQueryText(event.target.value); setLetter(null); }}
              placeholder="Search Kasem or English"
              autoComplete="off"
            />
            {queryText && <button type="button" onClick={() => setQueryText("")} aria-label="Clear search">×</button>}
          </label>
        </section>

        <section className="dictionary-app" aria-label="Dictionary browser">
          <div className="browse-panel">
            <div className="view-tabs" role="group" aria-label="Word list view">
              <button type="button" className={!savedOnly ? "is-active" : ""} onClick={() => setSavedOnly(false)} aria-pressed={!savedOnly}>All words</button>
              <button type="button" className={savedOnly ? "is-active" : ""} onClick={() => setSavedOnly(true)} aria-pressed={savedOnly}>Saved {saved.size || ""}</button>
            </div>

            <div className="alphabet" aria-label="Browse by first letter">
              <button type="button" className={letter === null ? "is-active" : ""} onClick={() => setLetter(null)} aria-pressed={letter === null}>All</button>
              {LETTERS.map((item) => (
                <button key={item} type="button" className={letter === item ? "is-active" : ""} disabled={status === "ready" && !availableLetters.has(item)} onClick={() => setLetter(item)} aria-pressed={letter === item}>{item}</button>
              ))}
            </div>

            <div className="result-heading">
              <div><span>{letter ? `${letter} words` : savedOnly ? "Saved words" : "Published words"}</span><strong>{status === "ready" ? filtered.length.toLocaleString() : "—"}</strong></div>
              <span className="live-badge"><i /> Live collection</span>
            </div>

            {status === "loading" && <div className="loading-list" role="status" aria-label="Loading dictionary"><i /><i /><i /><i /></div>}
            {status === "error" && <div className="list-state" role="alert"><h2>Unable to refresh the dictionary</h2><p>Check your connection and try again.</p><button type="button" onClick={() => setRetry((value) => value + 1)}>Try again</button></div>}
            {status === "ready" && filtered.length === 0 && <div className="list-state"><h2>{savedOnly || queryText || letter ? "No matching words" : "Published entries are being prepared"}</h2><p>{savedOnly ? "Save a word to keep it in your personal list." : queryText || letter ? "Try another word or clear your filters." : "Reviewed Kasem entries will appear here as they are approved for publication."}</p>{(savedOnly || queryText || letter) && <button type="button" onClick={() => { setSavedOnly(false); setQueryText(""); setLetter(null); }}>Clear filters</button>}</div>}
            {status === "ready" && filtered.length > 0 && <div className="word-list">{filtered.map((entry) => (
              <button key={entry.id} type="button" className={selectedId === entry.id ? "word-card is-active" : "word-card"} onClick={() => setSelectedId(entry.id)} aria-pressed={selectedId === entry.id}>
                <span className="word-card__letter" aria-hidden="true">{firstLetter(entry.headword)}</span>
                <span><strong>{entry.headword}</strong><small>{entry.translation}</small><em>{entry.partOfSpeech}</em></span>
                {saved.has(entry.id) && <b aria-label="Saved word">★</b>}
                <i aria-hidden="true">›</i>
              </button>
            ))}</div>}
          </div>

          <EntryDetail entry={selected} saved={selected ? saved.has(selected.id) : false} onToggleSaved={toggleSaved} />
        </section>
      </main>

      <footer><span>Kasena Dictionary</span><span>Only reviewed, published entries are shown.</span></footer>
    </div>
  );
}
