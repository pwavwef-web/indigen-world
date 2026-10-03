import { useEffect, useState } from 'react';
import type { CorpusReference as Reference, KnowledgeServices } from './data';

export function CorpusReference({ services }: { services: KnowledgeServices }) {
  const [query, setQuery] = useState(''), [submitted, setSubmitted] = useState('');
  const [records, setRecords] = useState<Reference[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true; setBusy(true); setError(''); setRecords([]); setCursor(null);
    services.reference({ query: submitted }).then(result => { if (active) { setRecords(result.records); setCursor(result.nextCursor); } }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [services, submitted, attempt]);
  return <section className="kw-reference"><h2>Corpus reference</h2><p>Only exact revisions released for Venacula appear here. Reference access does not grant editing rights. The record type stays visible.</p>
    <form onSubmit={e => { e.preventDefault(); setSubmitted(query); setAttempt(n => n + 1); }}><label className="kw-field"><span>Search eligible titles, original text or translations</span><input type="search" maxLength={200} value={query} onChange={e => setQuery(e.target.value)} /></label><button className="kw-primary" disabled={busy}>Search reference</button></form>
    {error && <p role="alert">{error} <button onClick={() => setAttempt(n => n + 1)}>Retry</button></p>}
    {busy && <p role="status">Checking current rights and releases…</p>}
    {!busy && !error && !records.length && <p>No eligible records in this page. Publication may still be awaiting policy approval.</p>}
    {records.map(r => <article className="kw-inset" key={`${r.recordId}:${r.revision}`}><span className="kw-badge">{r.category} · Gold authenticated</span><h3>{r.title}</h3><p lang="xsm">{r.original}</p><p>{r.english}</p><p>{r.context} {r.region}</p><p>{r.attribution}</p><small>{r.displayId} · revision {r.revision} · {r.recordId}</small></article>)}
    {cursor && <button disabled={busy} onClick={async () => { setBusy(true); setError(''); try { const result = await services.reference({ query: submitted, cursor }); setRecords(old => [...old, ...result.records]); setCursor(result.nextCursor); } catch (e) { setError(e instanceof Error ? e.message : 'Reference could not be loaded.'); } finally { setBusy(false); } }}>Check next page</button>}
  </section>;
}
