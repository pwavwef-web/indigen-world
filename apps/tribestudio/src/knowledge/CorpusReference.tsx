import { useEffect, useState } from 'react';
import type { CorpusReference as Reference, KnowledgeServices } from './data';
import { Icon } from '../ui/icons';

export function CorpusReference({ services }: { services: KnowledgeServices }) {
  const [query, setQuery] = useState(''), [submitted, setSubmitted] = useState('');
  const [records, setRecords] = useState<Reference[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true; setBusy(true); setError(''); setRecords([]); setCursor(null);
    services.reference({ query: submitted }).then(result => { if (active) { setRecords(result.records); setCursor(result.nextCursor); } }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [services, submitted, attempt]);
  return (
    <section className="kw-reference">
      <div className="ts-section-head">
        <div className="ts-section-head__copy">
          <h2 className="ts-section-head__title">Corpus reference</h2>
          <p className="ts-section-head__desc">Only exact revisions released for Venacula appear here. Reference access does not grant editing rights; the record type stays visible.</p>
        </div>
      </div>
      <form className="ts-panel ts-panel--tight" onSubmit={e => { e.preventDefault(); setSubmitted(query); setAttempt(n => n + 1); }}>
        <label className="kw-field"><span>Search eligible titles, original text or translations</span><input type="search" maxLength={200} value={query} onChange={e => setQuery(e.target.value)} /></label>
        <button className="ts-btn ts-btn--primary" disabled={busy} aria-busy={busy || undefined}><span className="ts-btn__spinner" aria-hidden="true" /><Icon name="search" /><span>Search reference</span></button>
      </form>
      {error && <p role="alert" className="ts-notice ts-notice--danger"><Icon name="alert" className="ts-notice__icon" /><span>{error} <button type="button" className="ts-link" onClick={() => setAttempt(n => n + 1)}>Retry</button></span></p>}
      {busy && <p role="status" className="ts-loading"><span className="ts-spinner" aria-hidden="true" />Checking current rights and releases…</p>}
      {!busy && !error && !records.length && (
        <div className="ts-panel ts-panel--dashed"><div className="ts-empty ts-empty--compact"><span className="ts-empty__icon" aria-hidden="true"><Icon name="book" /></span><p className="ts-empty__title">No eligible records on this page</p><p className="ts-empty__body">Publication may still be awaiting policy approval.</p></div></div>
      )}
      <div className="ts-grid ts-grid--2 ts-stagger">
        {records.map(r => (
          <article className="ts-panel ts-panel--tight" key={`${r.recordId}:${r.revision}`}>
            <div className="ts-cluster"><span className="ts-badge ts-badge--success"><span className="ts-badge__dot" aria-hidden="true" /><span>Gold authenticated</span></span><span className="ts-badge ts-badge--outline">{r.category}</span></div>
            <h3 className="ts-card__title">{r.title}</h3>
            <p lang="xsm" style={{ fontWeight: 600 }}>{r.original}</p>
            <p className="ts-muted" style={{ fontSize: 'var(--fs-sm)' }}>{r.english}</p>
            {r.context || r.region ? <p className="ts-hint">{r.context} {r.region}</p> : null}
            {r.attribution ? <p className="ts-hint">{r.attribution}</p> : null}
            <small className="ts-faint">{r.displayId} · revision {r.revision} · <code>{r.recordId}</code></small>
          </article>
        ))}
      </div>
      {cursor && <button type="button" className="ts-btn" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { const result = await services.reference({ query: submitted, cursor }); setRecords(old => [...old, ...result.records]); setCursor(result.nextCursor); } catch (e) { setError(e instanceof Error ? e.message : 'Reference could not be loaded.'); } finally { setBusy(false); } }}>Check next page</button>}
    </section>
  );
}
