import { useEffect, useMemo, useRef, useState } from "react";
import { subscribeToDictionary, type DictionaryEntry } from "./firebase";

const LETTERS = "ABCDEƐFGHIƖJKLMNŊOƆPQRSTUƲVWXYZ".split("");
const RECENT_KEY = "kasena-dictionary:recent-words";
const SAVED_KEY = "kasena-dictionary:saved-words";

function firstLetter(word: string): string {
  return word.normalize("NFD").replace(/^[^\p{L}]+/u, "").charAt(0).toUpperCase();
}

function normalizeSearch(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase().trim();
}

function readSaved(key = SAVED_KEY): Set<string> {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "[]");
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
    <article className="detail" aria-label={`Definition of ${entry.headword}`}>
      <div className="detail__topline">
        <span className="published-pill">Reviewed entry</span>
        <button className={saved ? "save-button is-saved" : "save-button"} type="button" onClick={onToggleSaved} aria-pressed={saved}>
          <span aria-hidden="true">{saved ? "★" : "☆"}</span> {saved ? "Saved" : "Save"}
        </button>
      </div>

      <p className="word-class">{entry.partOfSpeech}</p>
      <h2 lang="xsm">{entry.headword}</h2>
      <p className="meaning-label">English meaning</p>
      <p className="translation">{entry.translation}</p>
      <div className="entry-meta"><span>Kasem</span>{entry.dialect !== "Kasem" && <span>{entry.dialect}</span>}</div>

      <dl className="definition-list">
        {(entry.audioUrl || !/^(No written guide yet|Audio not available yet)$/.test(entry.pronunciation)) && <div>
          <dt>Pronunciation</dt>
          <dd>{entry.pronunciation}</dd>
          {entry.audioUrl && <audio key={entry.id} controls preload="none" src={entry.audioUrl} aria-label={`Pronunciation of ${entry.headword}`} />}
        </div>}
        {entry.example !== "No example yet" && <div className="example-block">
          <dt>Example</dt>
          <dd lang="xsm">{entry.example}</dd>
          {entry.exampleTranslation !== "No translated example yet" && <dd className="example-translation">{entry.exampleTranslation}</dd>}
        </div>}
        {entry.culturalNote && <div><dt>Usage and context</dt><dd>{entry.culturalNote}</dd></div>}
      </dl>
      <details className="source-note"><summary>Source and attribution</summary><p>{entry.attribution}</p></details>
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
  const [recentOnly, setRecentOnly] = useState(false);
  const [recent, setRecent] = useState<string[]>(() => [...readSaved(RECENT_KEY)]);
  const [mobileDetail, setMobileDetail] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const openEntry = (id: string) => {
    setSelectedId(id);
    setMobileDetail(true);
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(".definition-panel")?.scrollTo(0, 0);
      if (window.matchMedia("(max-width: 700px)").matches) document.querySelector<HTMLElement>(".panel-heading")?.focus();
    });
    setRecent(current => {
      const next = [id, ...current.filter(value => value !== id)].slice(0, 50);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* Keep session history. */ }
      return next;
    });
  };
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); setMobileDetail(false); requestAnimationFrame(() => searchRef.current?.focus());
      }
      if (event.key === "Escape") setMobileDetail(false);
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
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
      name: "search_kasem_dictionary",
      title: "Search Kasem Dictionary",
      description: "Search the visible Kasem Dictionary by a Kasem or English word.",
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
        const normalized = normalizeSearch(query);
        const matches = entries.filter((entry) => [entry.headword, entry.translation, entry.partOfSpeech, entry.dialect]
          .some((value) => normalizeSearch(value).includes(normalized))).length;
        setQueryText(query);
        setLetter(null);
        setSavedOnly(false);
        setRecentOnly(false);
        return { query, matches };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);

    return () => lifecycle.abort();
  }, [entries]);

  const normalizedQuery = normalizeSearch(queryText);
  const availableLetters = useMemo(() => new Set(entries.map((entry) => firstLetter(entry.headword))), [entries]);
  const filtered = useMemo(() => entries.filter((entry) => {
    const matchesSearch = !normalizedQuery || [entry.headword, entry.translation, entry.partOfSpeech, entry.dialect]
      .some((value) => normalizeSearch(value).includes(normalizedQuery));
    const matchesLetter = !letter || firstLetter(entry.headword) === letter;
    const matchesSaved = !savedOnly || saved.has(entry.id);
    return matchesSearch && matchesLetter && matchesSaved && (!recentOnly || recent.includes(entry.id));
  }).sort((a, b) => {
    if (recentOnly) return recent.indexOf(a.id) - recent.indexOf(b.id);
    const rank = (entry: DictionaryEntry) => {
      const words = [entry.headword, entry.translation].map(value => normalizeSearch(value));
      return words.includes(normalizedQuery) ? 0 : words.some(value => value.startsWith(normalizedQuery)) ? 1 : 2;
    };
    return rank(a) - rank(b);
  }), [entries, letter, normalizedQuery, saved, savedOnly, recentOnly, recent]);

  useEffect(() => {
    if (filtered.length && !filtered.some((entry) => entry.id === selectedId)) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  const selected = filtered.find((entry) => entry.id === selectedId) ?? null;
  const selectedIndex = filtered.findIndex(entry => entry.id === selectedId);
  const dailyWord = entries.length ? entries[Math.floor(Date.now() / 86400000) % entries.length] : null;
  const exploreEntry = (id: string) => {
    setQueryText(""); setLetter(null); setSavedOnly(false); setRecentOnly(false); openEntry(id);
  };
  const returnToResults = () => {
    setMobileDetail(false);
    requestAnimationFrame(() => searchRef.current?.focus());
  };
  const toggleSaved = () => {
    if (!selected) return;
    setSaved((current) => {
      const next = new Set(current);
      if (next.has(selected.id)) next.delete(selected.id);
      else next.add(selected.id);
      try { localStorage.setItem(SAVED_KEY, JSON.stringify([...next])); } catch { /* Keep session bookmarks. */ }
      return next;
    });
  };

  return (
    <div className={mobileDetail ? "app-shell showing-detail" : "app-shell"}>
      <header className="app-header">
        <a className="brand" href="/" aria-label="Kasem Dictionary home">
          <span className="brand__mark" aria-hidden="true">K</span>
          <span><strong>Kasem</strong><small>Dictionary</small></span>
        </a>
        <nav className="header-links" aria-label="Dictionary links">
          <span className="language-pair">Kasem <b aria-hidden="true">↔</b> English</span>
          <a href="https://indigenworld.com/dictionary">Indigen World <span aria-hidden="true">↗</span></a>
        </nav>
      </header>

      <main>
        <section className="dictionary-app" aria-label="Dictionary browser">
          <div className="browse-panel">
            <section className="search-area" aria-labelledby="app-title">
              <p className="eyebrow">THE KASEM COLLECTION</p>
              <h1 id="app-title">Look up a word</h1>
              <label className="search-box">
                <span className="search-box__icon" aria-hidden="true">⌕</span>
                <span className="sr-only">Search Kasem or English</span>
                <input ref={searchRef} type="text" inputMode="search" value={queryText}
                  onChange={event => { setQueryText(event.target.value); setLetter(null); }}
                  onKeyDown={event => {
                    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                      event.preventDefault();
                      const index = Math.max(0, Math.min(filtered.length - 1, selectedIndex + (event.key === "ArrowDown" ? 1 : -1)));
                      if (filtered[index]) { setSelectedId(filtered[index].id); requestAnimationFrame(() => document.querySelector(".word-card.is-active")?.scrollIntoView({ block: "nearest" })); }
                    }
                    if (event.key === "Enter" && selected) openEntry(selected.id);
                  }}
                  placeholder="Search Kasem or English" autoComplete="off" />
                {queryText && <button type="button" onClick={() => setQueryText("")} aria-label="Clear search">×</button>}
              </label>
              <p className="search-hint">Find a word. Discover its meaning. <kbd>⌘ / Ctrl K</kbd></p>
              <div className="character-keys" aria-label="Kasem characters">
                <span>Kasem keys</span>{["ɛ", "ɩ", "ŋ", "ɔ", "ʋ"].map(character => <button type="button" key={character} onClick={() => {
                  const input = searchRef.current;
                  const start = input?.selectionStart ?? queryText.length;
                  const end = input?.selectionEnd ?? start;
                  setQueryText(queryText.slice(0, start) + character + queryText.slice(end)); setLetter(null);
                  requestAnimationFrame(() => { input?.focus(); input?.setSelectionRange(start + character.length, start + character.length); });
                }}>{character}</button>)}
              </div>
            </section>
            <div className="view-tabs" role="group" aria-label="Word list view">
              <button type="button" className={!savedOnly && !recentOnly ? "is-active" : ""} onClick={() => { setSavedOnly(false); setRecentOnly(false); }} aria-pressed={!savedOnly && !recentOnly}>All words</button>
              <button type="button" className={recentOnly ? "is-active" : ""} onClick={() => { setRecentOnly(true); setSavedOnly(false); }} aria-pressed={recentOnly}>Recent</button>
              <button type="button" className={savedOnly ? "is-active" : ""} onClick={() => { setSavedOnly(true); setRecentOnly(false); }} aria-pressed={savedOnly}>Saved {saved.size || ""}</button>
            </div>
            <details className="alphabet-disclosure"><summary>Browse alphabetically <span>A–Z</span></summary><div className="alphabet" aria-label="Browse by first letter">
              <button type="button" className={letter === null ? "is-active" : ""} onClick={() => setLetter(null)} aria-pressed={letter === null}>All</button>
              {LETTERS.map((item) => (
                <button key={item} type="button" className={letter === item ? "is-active" : ""} disabled={status === "ready" && !availableLetters.has(item)} onClick={() => setLetter(item)} aria-pressed={letter === item}>{item}</button>
              ))}
            </div>

            </details>
            <div className="result-heading" aria-live="polite">
              <div><span>{letter ? `${letter} words` : savedOnly ? "Saved words" : recentOnly ? "Recent words" : "All words"}</span><strong>{status === "ready" ? filtered.length.toLocaleString() : "—"}</strong></div>
              <span className="live-badge"><i /> {status === "ready" ? "Up to date" : status === "loading" ? "Connecting" : "Unavailable"}</span>
            </div>

            {status === "loading" && <div className="loading-list" role="status" aria-label="Loading dictionary"><i /><i /><i /><i /></div>}
            {status === "error" && <div className="list-state" role="alert"><h2>Unable to refresh the dictionary</h2><p>Check your connection and try again.</p><button type="button" onClick={() => setRetry((value) => value + 1)}>Try again</button></div>}
            {status === "ready" && filtered.length === 0 && <div className="list-state"><h2>{savedOnly || recentOnly || queryText || letter ? "No matching words" : "Published entries are being prepared"}</h2><p>{recentOnly ? "Words you open will appear here." : savedOnly ? "Save a word to keep it in your personal list." : queryText || letter ? "Try another word or clear your filters." : "Reviewed Kasem entries will appear here as they are approved for publication."}</p>{(savedOnly || recentOnly || queryText || letter) && <button type="button" onClick={() => { setSavedOnly(false); setRecentOnly(false); setQueryText(""); setLetter(null); }}>Clear filters</button>}</div>}
            {status === "ready" && filtered.length > 0 && <div className="word-list">{filtered.map((entry) => (
              <button key={entry.id} type="button" className={selectedId === entry.id ? "word-card is-active" : "word-card"} onClick={() => openEntry(entry.id)} aria-pressed={selectedId === entry.id}>
                <span className="word-card__letter" aria-hidden="true">{firstLetter(entry.headword)}</span>
                <span><strong>{entry.headword}</strong><small>{entry.translation}</small><em>{entry.partOfSpeech}</em></span>
                {saved.has(entry.id) && <b aria-label="Saved word">★</b>}
                <i aria-hidden="true">›</i>
              </button>
            ))}</div>}
          </div>

          <div className="definition-panel">
            <div className="panel-heading" tabIndex={-1}><div><span className="eyebrow">KASEM · ENGLISH</span><h2>Definition</h2></div><button className="mobile-back" type="button" onClick={returnToResults}>← Results</button>
              <div className="entry-navigation" aria-label="Navigate results"><button type="button" aria-label="Previous word" disabled={selectedIndex <= 0} onClick={() => openEntry(filtered[selectedIndex - 1].id)}>←</button><span>{selectedIndex >= 0 ? selectedIndex + 1 : 0} / {filtered.length}</span><button type="button" aria-label="Next word" disabled={selectedIndex < 0 || selectedIndex >= filtered.length - 1} onClick={() => openEntry(filtered[selectedIndex + 1].id)}>→</button></div>
            </div>
            <EntryDetail entry={selected} saved={selected ? saved.has(selected.id) : false} onToggleSaved={toggleSaved} />
          </div>
          <aside className="explore-panel" aria-label="Explore dictionary">
            <h2>Explore</h2>
            <p className="explore-label">Nearby words</p>
            <p className="explore-description">Continue through the Kasem dictionary.</p>
            {selected && entries.slice(Math.max(0, entries.findIndex(entry => entry.id === selected.id) - 2), entries.findIndex(entry => entry.id === selected.id) + 6).filter(entry => entry.id !== selected.id).map(entry => (
              <button className="nearby-word" type="button" key={entry.id} onClick={() => { exploreEntry(entry.id); }}><strong>{entry.headword}</strong><span>{entry.translation}</span></button>
            ))}
            {!selected && <p className="explore-description">Choose a word to explore nearby entries.</p>}
            {dailyWord && <div className="collection-note"><span>WORD OF THE DAY</span><h3 lang="xsm">{dailyWord.headword}</h3><p>{dailyWord.translation}</p><button type="button" onClick={() => exploreEntry(dailyWord.id)}>Discover this word <span aria-hidden="true">↗</span></button></div>}
            <div className="keyboard-note"><span>Make yourself at home</span><p>↑ ↓ Move through search results<br />Enter Open a word<br />Esc Return to results</p></div>
          </aside>
        </section>
      </main>

      <footer><span>Kasem Dictionary</span><span>Only reviewed, published entries are shown.</span></footer>
    </div>
  );
}
