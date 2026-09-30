import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth';
import { useRoute } from '../router';
import { blankRecord, editable, knowledgeServices, missingFields, needsCulturalReview, STATUS_LABELS,
  type AudioClip, type CatalogEntry, type DatasetType, type KnowledgeRecord, type KnowledgeServices,
  type RecordDetail, type RecordInput, type ReviewInput } from './data';
import './knowledge.css';

const DATASET_MARKS: Record<DatasetType, string> = { lexicon: 'Aa', grammar: '↔', expressions: '“ ”', sentences: '≡', proverbs: '◈', literature: '▤', dialogue: '↗', pronunciation: '◖', culture: '✧', qa: '?' };
const PERMISSIONS = [
  ['review', 'Community review', 'Allow authorised reviewers to assess this record. Required to submit.'],
  ['sourceConfirmed', 'I have permission to contribute this source', 'Confirm the speaker or rights holder permits this contribution. Required to submit.'],
  ['publication', 'Public display', 'Allow a later, separately approved public release.'],
  ['providerRetrieval', 'AI reference retrieval', 'Allow a later authorised AI service to consult this record.'],
  ['modelTraining', 'Model training', 'Allow later use in a governed training dataset.'],
  ['evaluation', 'Evaluation', 'Allow later use to test language systems.'],
  ['audio', 'Recordings', 'Allow the attached recordings to be stored and heard within this workspace.'],
] as const;
const date = (value: string) => value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const message = (error: unknown) => error instanceof Error ? error.message : 'The request could not be completed. Please retry.';
const canLeave = () => window.dispatchEvent(new Event('knowledge:before-record', { cancelable: true }));

export function KnowledgeWorkspace() {
  const { user } = useAuth();
  const { search } = useRoute();
  return <KnowledgeDesk uid={user?.uid ?? ''} services={knowledgeServices} related={new URLSearchParams(search).get('related') ?? ''} />;
}

export function KnowledgeDesk({ uid, services, preview = false, related = '' }: {
  uid: string; services: KnowledgeServices; preview?: boolean; related?: string;
}) {
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [records, setRecords] = useState<KnowledgeRecord[]>([]);
  const [canReview, setCanReview] = useState(false);
  const [scope, setScope] = useState<'mine' | 'review'>('mine');
  const [category, setCategory] = useState<DatasetType | ''>('');
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [detail, setDetail] = useState<RecordDetail | null>(null);
  const [newType, setNewType] = useState<DatasetType | null>(null);
  const [opening, setOpening] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const listEpoch = useRef(0);
  const openEpoch = useRef(0);
  useEffect(() => {
    const epoch = ++listEpoch.current;
    setLoading(true); setError(''); setRecords([]); setCursor(null);
    services.list({ scope }).then((result) => {
      if (epoch !== listEpoch.current) return;
      setRecords(result.records); setCatalog(result.catalog); setCanReview(result.canReview); setCursor(result.nextCursor);
    }).catch((reason) => { if (epoch === listEpoch.current) setError(message(reason)); })
      .finally(() => { if (epoch === listEpoch.current) setLoading(false); });
    return () => { listEpoch.current += 1; };
  }, [scope, attempt, services]);
  useEffect(() => { document.title = 'Knowledge workspace · TribeStudio'; }, []);
  const open = async (record: KnowledgeRecord) => {
    if (!canLeave()) return;
    const epoch = ++openEpoch.current;
    setOpening(true); setError(''); setNotice('');
    try {
      const result = await services.get(record.id);
      if (epoch === openEpoch.current) { setDetail(result); setNewType(null); }
    } catch (reason) { if (epoch === openEpoch.current) setError(message(reason)); }
    finally { if (epoch === openEpoch.current) setOpening(false); }
  };
  const create = () => {
    if (!canLeave()) return;
    openEpoch.current += 1; setOpening(false); setDetail(null); setNewType(category || 'sentences'); setNotice('');
  };
  const saved = async (record: KnowledgeRecord, text: string) => {
    setNotice(text); setDetail({ record, reviews: [], history: detail?.history ?? [] }); setNewType(null);
    setRecords((current) => [record, ...current.filter((item) => item.id !== record.id)]);
    try { setDetail(await services.get(record.id)); } catch { setNotice(`${text} Review history could not be refreshed; reopen the record to retry.`); }
  };
  const loadMore = async () => {
    if (!cursor) return;
    const epoch = listEpoch.current;
    setLoading(true); setError('');
    try {
      const result = await services.list({ scope, cursor });
      if (epoch === listEpoch.current) { setRecords((current) => [...current, ...result.records.filter((item) => !current.some((existing) => existing.id === item.id))]); setCursor(result.nextCursor); }
    } catch (reason) { if (epoch === listEpoch.current) setError(message(reason)); }
    finally { if (epoch === listEpoch.current) setLoading(false); }
  };
  const visible = records.filter((record) => (!category || record.datasetType === category)
    && (!status || record.status === status)
    && `${record.title} ${record.original} ${record.english} ${record.id} ${record.region}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const selectedType = detail?.record.datasetType ?? newType;
  return <div className={`kw${preview ? ' kw--preview' : ''}`}>
    {preview ? <div className="kw-preview" role="status">LOCAL PREVIEW · All example records are synthetic. Saves and reviews stay in this browser session.</div> : null}
    <header className="kw-hero">
      <div><p className="kw-eyebrow">KAWURI · KASEM KNOWLEDGE</p><h1>Every detail has a source.</h1><p>A shared workspace for language, culture and the evidence behind them. Collect carefully. Review together.</p></div>
      <button type="button" className="kw-primary" disabled={!catalog.length || opening} onClick={create}><span aria-hidden="true">＋</span> New record</button>
    </header>
    <div className="kw-principles"><span><i aria-hidden="true">01</i> Preserve the original</span><span><i aria-hidden="true">02</i> Keep context attached</span><span><i aria-hidden="true">03</i> Human review, explicit rights</span></div>
    <nav className="kw-catalog" aria-label="Dataset areas">
      <button type="button" className={!category ? 'is-selected' : ''} onClick={() => setCategory('')} aria-pressed={!category}><span aria-hidden="true">⊞</span><strong>All areas</strong><small>One connected archive</small></button>
      {catalog.map((area) => <button key={area.id} type="button" className={category === area.id ? 'is-selected' : ''} onClick={() => setCategory(area.id)} aria-pressed={category === area.id} title={area.description}><span aria-hidden="true">{DATASET_MARKS[area.id]}</span><strong>{area.label}</strong><small>{records.filter((record) => record.datasetType === area.id).length} loaded</small></button>)}
    </nav>
    <div className="kw-workspace-heading"><div><p className="kw-eyebrow">KNOWLEDGE WORKSPACE</p><h2>{catalog.find((area) => area.id === category)?.label ?? 'Your records, with their evidence'}</h2></div><p>Draft → submitted → human review → Gold</p></div>
    <div className="kw-info">Records stay private to you and authorised reviewers. Gold means two qualified people reviewed the same revision. It does not publish a record or put it into AI training.</div>
    {error ? <div className="kw-alert" role="alert">{error} <button type="button" onClick={() => setAttempt((value) => value + 1)}>Retry loading records</button></div> : null}
    {notice ? <div className="kw-success" role="status">{notice}</div> : null}
    <div className="kw-desk">
      <section className="kw-records" aria-label="Records">
        <div className="kw-tabs" role="group" aria-label="Record scope"><button type="button" aria-pressed={scope === 'mine'} onClick={() => setScope('mine')}>My records</button>{canReview ? <button type="button" aria-pressed={scope === 'review'} onClick={() => setScope('review')}>Review queue</button> : null}</div>
        <label className="kw-search">Search loaded records<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Title, Kasem, reference…" /></label>
        <label className="kw-search">Review status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Every status</option>{Object.entries(STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <div className="kw-record-list" aria-busy={loading}>
          {visible.map((record) => <button type="button" key={record.id} className={`kw-record${detail?.record.id === record.id ? ' is-active' : ''}`} onClick={() => void open(record)} disabled={opening} aria-pressed={detail?.record.id === record.id}>
            <div><span className={`kw-badge kw-badge--${record.status}`}>{STATUS_LABELS[record.status]}</span><small>v{record.revision}</small></div><strong>{record.title || 'Untitled draft'}</strong><p>{record.english || record.original || 'Ready for your next detail'}</p><footer><span>{catalog.find((area) => area.id === record.datasetType)?.label}</span><span>{date(record.updatedAt)}</span></footer>
          </button>)}
          {loading ? <p className="kw-empty" role="status">Loading records…</p> : !visible.length ? <p className="kw-empty">{records.length ? 'No loaded records match these filters.' : scope === 'review' ? 'No records are ready for review yet.' : 'Start with one record. Save a draft as you gather the details.'}</p> : null}
        </div>
        {cursor ? <button type="button" className="kw-more" disabled={loading} onClick={() => void loadMore()}>Load more records</button> : null}
        <p className="kw-footnote">Counts and filters cover loaded records.</p>
      </section>
      <section className="kw-detail" aria-label="Record detail" aria-busy={opening}>
        {opening ? <p className="kw-empty" role="status">Opening the latest revision…</p> : selectedType ? <RecordEditor key={`${detail?.record.id ?? `new-${selectedType}`}:${detail?.record.revision ?? 0}`} uid={uid} services={services} catalog={catalog} initial={detail} type={selectedType} related={related} canReview={canReview} onSaved={saved} /> : <div className="kw-welcome"><div aria-hidden="true">◈</div><p className="kw-eyebrow">A PLACE FOR THE FULL STORY</p><h2>Choose a record or begin one.</h2><p>Words, conversations, recordings and cultural knowledge belong beside their sources, translations and context.</p><button type="button" className="kw-primary" disabled={!catalog.length} onClick={create}>Create your first record</button><small>Incomplete drafts are welcome. Nothing is marked correct just because its fields are filled.</small></div>}
      </section>
    </div>
  </div>;
}

function Field({ label, hint, value, onChange, multiline = false, required = false, max = 30000, lang }: {
  label: string; hint?: string; value: string; onChange: (value: string) => void; multiline?: boolean; required?: boolean; max?: number; lang?: string;
}) {
  return <label className="kw-field"><span>{label}{required ? <b aria-label="required"> *</b> : null}</span>{hint ? <small>{hint}</small> : null}{multiline ? <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={3} maxLength={max} lang={lang} /> : <input value={value} onChange={(event) => onChange(event.target.value)} maxLength={max} lang={lang} />}</label>;
}

function RecordEditor({ uid, services, catalog, initial, type, related, canReview, onSaved }: {
  uid: string; services: KnowledgeServices; catalog: CatalogEntry[]; initial: RecordDetail | null; type: DatasetType;
  related: string; canReview: boolean; onSaved: (record: KnowledgeRecord, text: string) => Promise<void>;
}) {
  const existing = initial?.record;
  const [draft, setDraft] = useState<RecordInput>(() => {
    const record = existing ? editable(existing) : blankRecord(type);
    if (!existing && /^(?:dictionaryEntries|expressionEntries|kasemEvidence):[A-Za-z0-9_-]{1,150}$/.test(related)) record.relatedRecordIds = [related];
    return record;
  });
  const baseline = useRef(JSON.stringify(draft));
  const pendingRequest = useRef<{ fingerprint: string; id: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState<number | null>(null);
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
  const [audioLoading, setAudioLoading] = useState<number | null>(null);
  const urls = useRef<string[]>([]);
  const [withdrawConfirm, setWithdrawConfirm] = useState(false);
  const readOnly = Boolean(existing && (existing.authorUid !== uid || existing.status === 'withdrawn'));
  const dirty = !readOnly && JSON.stringify(draft) !== baseline.current;
  const area = catalog.find((entry) => entry.id === draft.datasetType);
  const missing = useMemo(() => missingFields(draft, area), [draft, area]);
  const update = <K extends keyof RecordInput>(key: K, value: RecordInput[K]) => setDraft((record) => ({ ...record, [key]: value }));
  useEffect(() => {
    const protect = (event: Event) => { if ((dirty || uploading !== null || busy) && !window.confirm('Leave this record? Unsaved changes and unfinished uploads will not be kept.')) event.preventDefault(); };
    const unload = (event: BeforeUnloadEvent) => { if (dirty || uploading !== null || busy) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('studio:before-navigate', protect); window.addEventListener('knowledge:before-record', protect); window.addEventListener('beforeunload', unload);
    return () => { window.removeEventListener('studio:before-navigate', protect); window.removeEventListener('knowledge:before-record', protect); window.removeEventListener('beforeunload', unload); };
  }, [dirty, uploading, busy]);
  useEffect(() => () => { urls.current.forEach((url) => URL.revokeObjectURL(url)); }, []);
  const save = async (submit: boolean) => {
    setBusy(true); setError('');
    const fingerprint = JSON.stringify({ record: draft, submit, revision: existing?.revision });
    if (pendingRequest.current?.fingerprint !== fingerprint) pendingRequest.current = { fingerprint, id: crypto.randomUUID() };
    try {
      const result = await services.save({ ...(existing ? { id: existing.id, revision: existing.revision } : {}), requestId: pendingRequest.current.id, record: draft, submit });
      baseline.current = JSON.stringify(draft);
      await onSaved(result.record, submit ? 'Submitted for human review. Track the decision and any requested changes here.' : 'Draft saved to your account. You can continue on another device.');
    } catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  };
  const attach = async (file: File) => {
    setUploading(0); setError('');
    try {
      const path = await services.upload(uid, file, setUploading);
      const url = URL.createObjectURL(file); urls.current.push(url); setAudioUrls((current) => ({ ...current, [path]: url }));
      setDraft((current) => ({ ...current, audio: [...current.audio, { path, label: file.name, transcript: '', speakerId: '', region: current.region, kind: 'in_context', environment: '', quality: '' }] }));
    } catch (reason) { setError(message(reason)); }
    finally { setUploading(null); }
  };
  const listen = async (index: number) => {
    if (!existing) return;
    setAudioLoading(index); setError('');
    try {
      const response = await services.audio(existing.id, existing.revision, index);
      const bytes = Uint8Array.from(atob(response.audio), (character) => character.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: response.contentType }));
      urls.current.push(url); setAudioUrls((current) => ({ ...current, [draft.audio[index].path]: url }));
    } catch (reason) { setError(message(reason)); }
    finally { setAudioLoading(null); }
  };
  const changeClip = (index: number, change: Partial<AudioClip>) => update('audio', draft.audio.map((clip, position) => position === index ? { ...clip, ...change } : clip));
  const withdraw = async () => {
    if (!existing) return;
    setBusy(true); setError('');
    try { const result = await services.withdraw(existing.id, existing.revision); baseline.current = JSON.stringify(draft); await onSaved(result.record, 'Record withdrawn. Further review and workspace audio access are blocked.'); }
    catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  };
  return <div className="kw-editor">
    <header className="kw-editor-head"><div><p className="kw-eyebrow">{existing ? existing.id : 'NEW RECORD'}</p><h2>{existing?.title || `Document ${area?.label.toLocaleLowerCase() ?? 'knowledge'}`}</h2></div><span className={`kw-badge kw-badge--${existing?.status ?? 'draft'}`}>{existing ? STATUS_LABELS[existing.status] : 'Unsaved draft'}</span></header>
    {existing ? <div className="kw-revision">Revision {existing.revision} · Updated {date(existing.updatedAt)} · {existing.reviewCount} human review{existing.reviewCount === 1 ? '' : 's'}{existing.authorUid === uid ? ' · Your contribution' : ''}</div> : null}
    {existing?.status === 'gold' && !readOnly ? <p className="kw-info">Saving changes creates a new revision. Its review starts again and the Gold status is removed.</p> : null}
    {existing?.status === 'withdrawn' ? <p className="kw-info">This record is withdrawn and cannot be edited or reviewed. Start a new record to contribute again.</p> : null}
    <div className="kw-editor-body">
      <form className="kw-form" onSubmit={(event) => { event.preventDefault(); void save(false); }}>
        <fieldset disabled={readOnly || busy}>
          <section className="kw-section"><div className="kw-section-title"><span>01</span><div><h3>The original and its meaning</h3><p>Keep the speaker’s words exactly. Write a natural translation separately.</p></div></div>
            <label className="kw-field"><span>Dataset area</span><select value={draft.datasetType} disabled={Boolean(existing)} onChange={(event) => update('datasetType', event.target.value as DatasetType)}>{catalog.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select><small>{area?.description}</small></label>
            <Field label="Record title" required value={draft.title} onChange={(value) => update('title', value)} max={180} />
            <Field label="Original Kasem" required multiline lang="xsm" hint="Diacritics, wording and spacing are preserved. Do not fill gaps with an AI guess." value={draft.original} onChange={(value) => update('original', value)} />
            <Field label="Natural English meaning" required multiline value={draft.english} onChange={(value) => update('english', value)} />
            <Field label="French translation" multiline hint="Optional. Leave blank if it has not been supplied." value={draft.french} onChange={(value) => update('french', value)} />
            <Field label="When and how it is used" required multiline hint="Describe the situation, who is speaking to whom, and what came before." value={draft.context} onChange={(value) => update('context', value)} max={6000} />
          </section>
          <section className="kw-section"><div className="kw-section-title"><span>02</span><div><h3>{area?.label} details</h3><p>Record what is known. Say “unknown” where the analysis is unresolved.</p></div></div>
            {area?.fields.map((field) => <Field key={field.key} label={field.label} hint={field.hint} multiline={field.multiline} required={field.required} value={draft.details[field.key] ?? ''} onChange={(value) => update('details', { ...draft.details, [field.key]: value })} />)}
          </section>
          <section className="kw-section"><div className="kw-section-title"><span>03</span><div><h3>Source and place</h3><p>Give a reviewer enough information to trace the contribution.</p></div></div>
            <Field label="Region or dialect" required value={draft.region} onChange={(value) => update('region', value)} max={200} hint="Use the speaker’s own description. Mark uncertainty explicitly." />
            <label className="kw-field"><span>Source type</span><select value={draft.sourceType} onChange={(event) => update('sourceType', event.target.value as RecordInput['sourceType'])}><option value="speaker">Speaker or knowledge holder</option><option value="literature">Written work</option><option value="recording">Recording</option><option value="other">Other source</option></select></label>
            <Field label="Source attribution" required multiline value={draft.source} onChange={(value) => update('source', value)} hint="A speaker reference or credited source. Avoid unnecessary personal contact details." max={2000} />
            <Field label="Source reference" required={['literature', 'recording'].includes(draft.sourceType)} value={draft.sourceReference} onChange={(value) => update('sourceReference', value)} hint="Book and page, recording and timestamp, or a traceable reference." max={2000} />
          </section>
          <section className="kw-section"><div className="kw-section-title"><span>04</span><div><h3>Variants and connections</h3><p>Different usage is evidence. Keep each alternative with its own context.</p></div></div>
            {draft.variants.map((variant, index) => <div className="kw-inset" key={index}><div className="kw-inset-head"><strong>Variant {index + 1}</strong><button type="button" onClick={() => update('variants', draft.variants.filter((_, position) => position !== index))}>Remove</button></div>{(['form', 'context', 'note'] as const).map((key) => <Field key={key} label={{ form: 'Alternative form', context: 'Where / when it is used', note: 'Difference or uncertainty' }[key]} value={variant[key]} onChange={(value) => update('variants', draft.variants.map((item, position) => position === index ? { ...item, [key]: value } : item))} />)}</div>)}
            <button type="button" className="kw-secondary" disabled={draft.variants.length >= 12} onClick={() => update('variants', [...draft.variants, { form: '', context: '', note: '' }])}>＋ Add a variant</button>
            <Field label="Related record references" multiline hint="One reference per line: a KSM record ID or dictionaryEntries:entry-id. Linking never copies content or grants permission." value={draft.relatedRecordIds.join('\n')} onChange={(value) => update('relatedRecordIds', value.split('\n'))} max={4000} />
          </section>
          <section className="kw-section"><div className="kw-section-title"><span>05</span><div><h3>Recordings tied to exact words</h3><p>One clip, its exact transcript and its speaker. A transcript is not a timing alignment.</p></div></div>
            {draft.audio.map((clip, index) => <div className="kw-inset" key={clip.path}><div className="kw-inset-head"><strong>Recording {index + 1}</strong><button type="button" onClick={() => update('audio', draft.audio.filter((_, position) => position !== index))}>Remove</button></div>
              <Field label="Clip label" value={clip.label} onChange={(value) => changeClip(index, { label: value })} />
              <Field label="Exact spoken transcript" multiline required lang="xsm" value={clip.transcript} onChange={(value) => changeClip(index, { transcript: value })} />
              <div className="kw-field-pair"><Field label="Speaker reference" required value={clip.speakerId} onChange={(value) => changeClip(index, { speakerId: value })} /><Field label="Speaker region" required value={clip.region} onChange={(value) => changeClip(index, { region: value })} /></div>
              <label className="kw-field"><span>Recording kind</span><select value={clip.kind} onChange={(event) => changeClip(index, { kind: event.target.value as AudioClip['kind'] })}><option value="in_context">In a sentence or conversation</option><option value="isolated">Word or sound on its own</option></select></label>
              <Field label="Recording environment" value={clip.environment} onChange={(value) => changeClip(index, { environment: value })} hint="For example: quiet room, outdoor voices, background music." />
              <Field label="Quality and uncertainty" value={clip.quality} onChange={(value) => changeClip(index, { quality: value })} hint="Describe what can be heard clearly and what needs another take." />
            </div>)}
            {!readOnly ? <label className="kw-upload"><strong>＋ Attach a recording</strong><span>Audio file · under 20 MB · {draft.audio.length}/12 clips</span><input type="file" accept="audio/*" disabled={uploading !== null || draft.audio.length >= 12} onChange={(event) => { const file = event.target.files?.[0]; if (file) void attach(file); event.target.value = ''; }} /></label> : null}
            {uploading !== null ? <p role="status">Uploading recording… {uploading}%</p> : null}
          </section>
          <section className="kw-section"><div className="kw-section-title"><span>06</span><div><h3>Permissions belong to this record</h3><p>Choose each use separately. Optional permissions start off. Nothing here triggers publication or training.</p></div></div>
            <label className="kw-field"><span>Cultural access</span><select value={draft.permissions.culturalAccess} onChange={(event) => update('permissions', { ...draft.permissions, culturalAccess: event.target.value as RecordInput['permissions']['culturalAccess'] })}><option value="open">Open cultural material</option><option value="restricted">Restricted to an appropriate community</option><option value="sensitive">Culturally sensitive</option></select></label>
            {PERMISSIONS.map(([key, label, hint]) => <label className="kw-check" key={key}><input type="checkbox" checked={draft.permissions[key]} onChange={(event) => update('permissions', { ...draft.permissions, [key]: event.target.checked })} /><span><strong>{label}</strong><small>{hint}</small></span></label>)}
            <Field label="Licence and source terms" multiline value={draft.permissions.licence} onChange={(value) => update('permissions', { ...draft.permissions, licence: value })} max={2000} />
          </section>
        </fieldset>
        {draft.audio.length ? <section className="kw-section"><h3>Listen to attached clips</h3>{draft.audio.map((clip, index) => <div className="kw-listen" key={clip.path}><strong>{clip.label || `Recording ${index + 1}`}</strong>{audioUrls[clip.path] ? <audio controls preload="metadata" src={audioUrls[clip.path]} aria-label={`Play ${clip.label || `recording ${index + 1}`}`} /> : existing && existing.status !== 'withdrawn' ? <button type="button" disabled={audioLoading !== null} onClick={() => void listen(index)}>{audioLoading === index ? 'Loading private recording…' : 'Load private recording'}</button> : <p>Playback is unavailable.</p>}</div>)}</section> : null}
        {error ? <div className="kw-alert" role="alert">{error}</div> : null}
        {!readOnly ? <div className="kw-actions"><span role="status">{busy ? 'Saving…' : uploading !== null ? 'Recording upload in progress' : dirty ? 'Unsaved changes' : existing ? 'Saved to your account' : 'New draft'}</span><button type="submit" className="kw-secondary" disabled={busy || uploading !== null}>Save draft</button><button type="button" className="kw-primary" disabled={busy || uploading !== null || missing.length > 0} onClick={() => void save(true)}>Submit for review</button></div> : null}
      </form>
      <aside className="kw-evidence">
        <div className="kw-readiness"><p className="kw-eyebrow">BEFORE REVIEW</p><h3>{missing.length ? `${missing.length} detail${missing.length === 1 ? '' : 's'} to add` : 'Ready to submit'}</h3><p>Completeness is a preparation check. It is not proof of accuracy.</p>{missing.length ? <ul>{missing.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="kw-ready">Required fields and permissions are present.</p>}<small>Save a draft at any time.</small></div>
        {existing?.warnings.length ? <div className="kw-readiness"><h3>Review attention</h3><ul>{existing.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div> : null}
        <div className="kw-readiness"><h3>What earns Gold?</h3><p>Two independent, qualified people approve this exact revision. A dispute keeps it out of Gold.</p>{needsCulturalReview(draft) ? <p>This record also needs cultural competence from each reviewer.</p> : null}<p>Changing the record starts a fresh review.</p></div>
        {existing && canReview && existing.authorUid !== uid && !['draft', 'withdrawn', 'gold'].includes(existing.status) ? <ReviewPanel record={existing} services={services} reviews={initial?.reviews ?? []} onSaved={onSaved} /> : null}
        {initial ? <div className="kw-readiness"><h3>Review feedback</h3>{initial.reviews.length ? initial.reviews.map((review, index) => <div className="kw-history" key={index}><strong>{review.decision.replaceAll('_', ' ')}</strong><small>Revision {review.revision} · {date(review.createdAt)}</small><p>{review.note || 'No additional note.'}</p></div>) : <p>No review feedback is available yet.</p>}{existing?.authorUid !== uid ? <small>Independent reviewers see their own feedback only.</small> : null}<h3>Revision history</h3>{initial.history.length ? initial.history.map((revision, index) => <p className="kw-history" key={index}><strong>Revision {revision.revision}</strong><small>{revision.status.replaceAll('_', ' ')} · {date(revision.createdAt)}</small></p>) : <p>The first saved revision starts this history.</p>}</div> : null}
        {existing && existing.authorUid === uid && existing.status !== 'withdrawn' ? <div className="kw-readiness"><h3>Withdraw this record</h3><p>Stops further review and workspace audio access. This record cannot be reopened.</p>{withdrawConfirm ? <><p>Withdraw revision {existing.revision} now?</p><button type="button" disabled={busy} onClick={() => void withdraw()}>Confirm withdrawal</button><button type="button" onClick={() => setWithdrawConfirm(false)}>Keep record</button></> : <button type="button" disabled={busy || dirty || uploading !== null} onClick={() => setWithdrawConfirm(true)}>Withdraw record</button>}</div> : null}
      </aside>
    </div>
  </div>;
}

function ReviewPanel({ record, services, reviews, onSaved }: { record: KnowledgeRecord; services: KnowledgeServices; reviews: RecordDetail['reviews']; onSaved: (record: KnowledgeRecord, text: string) => Promise<void> }) {
  const [decision, setDecision] = useState<ReviewInput['decision']>('approve');
  const [language, setLanguage] = useState(false);
  const [cultural, setCultural] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const reviewed = reviews.some((review) => review.revision === record.revision);
  const send = async () => {
    setBusy(true); setError('');
    try { const result = await services.review({ id: record.id, revision: record.revision, decision, languageCompetent: language, culturalCompetent: cultural, note }); await onSaved(result.record, 'Your independent review was recorded for this revision.'); }
    catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  };
  return <section className="kw-readiness kw-review"><p className="kw-eyebrow">INDEPENDENT REVIEW</p><h3>Your assessment</h3>{reviewed ? <p>You have already reviewed this revision. Reviews are retained unchanged.</p> : <><p>Read the original, meaning, context, source and recordings before deciding.</p><label className="kw-check"><input type="checkbox" checked={language} onChange={(event) => setLanguage(event.target.checked)} /><span>I can assess this Kasem variety.</span></label>{needsCulturalReview(record) ? <label className="kw-check"><input type="checkbox" checked={cultural} onChange={(event) => setCultural(event.target.checked)} /><span>I can assess this cultural context and its restrictions.</span></label> : null}<label className="kw-field"><span>Decision</span><select value={decision} onChange={(event) => setDecision(event.target.value as ReviewInput['decision'])}><option value="approve">Approve this revision</option><option value="changes_requested">Request changes</option><option value="dispute">Raise a dispute</option></select></label><Field label="Review explanation" multiline required={decision !== 'approve'} value={note} onChange={setNote} max={4000} />{error ? <p role="alert">{error}</p> : null}<button type="button" className="kw-primary" disabled={busy || !language || (needsCulturalReview(record) && !cultural) || (decision !== 'approve' && note.trim().length < 10)} onClick={() => void send()}>{busy ? 'Recording review…' : 'Record review'}</button></>}</section>;
}
