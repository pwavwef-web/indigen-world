import { useEffect, useRef, useState } from 'react';
import { PORTAL_TYPES, PORTAL_USES, PORTAL_FORMATS, PORTAL_LIMITS, PORTAL_STATES, portalIssues, type PortalType, type PortalUse } from '@indigen-world/contracts/portal-contributions';
import { KasemField } from '../spelling/KasemField';
import { DictionaryRecommendations } from '../spelling/DictionaryAssistance';
import { Icon } from '../ui';
import { useRoute } from '../router';
import { PortalLink, useWorkspace } from './workspace';
import { blankContribution, portalCall, portalMessage, uploadPortalFile, type PortalInput, type PortalFile, type PortalRecord, type PortalTransferTask } from './portal-data';

interface LocalDraft { input: PortalInput; existing?: PortalRecord; pending?: { signature: string; requestId: string }; lostFiles?: string[] }
interface Transfer { id: string; file?: File; name: string; percent: number; state: string; error?: string; result?: PortalFile; task?: PortalTransferTask; url?: string }
const draftKey = (uid: string, type: PortalType) => `tribestudio:recovery:v1:${encodeURIComponent(uid)}:portal-${type}`;
export function readPortalDraft(uid: string, type: PortalType): LocalDraft | null { try { const d = JSON.parse(localStorage.getItem(draftKey(uid, type)) || 'null'); return d?.input?.type === type && d.input.content && d.input.uses && d.input.rights && Array.isArray(d.input.files) && (!d.existing || d.existing.owner === uid) ? d : null; } catch { return null; } }
export function portalDrafts(uid: string) { return (Object.keys(PORTAL_TYPES) as PortalType[]).flatMap(type => { const draft = readPortalDraft(uid, type); return draft ? [{ type, title: draft.input.title || PORTAL_TYPES[type].label }] : []; }); }

export function ContributionWorkspace({ type }: { type: PortalType }) {
  const data = useWorkspace(), { search } = useRoute(), resumeId = new URLSearchParams(search).get('resume');
  const restored = useRef(readPortalDraft(data.uid, type));
  const [input, setInput] = useState<PortalInput>(() => restored.current?.input ?? blankContribution(type));
  const [existing, setExisting] = useState<PortalRecord | undefined>(restored.current?.existing);
  const pending = useRef(restored.current?.pending);
  const [transfers, setTransfers] = useState<Transfer[]>([]), transfersRef = useRef(transfers); transfersRef.current = transfers;
  const [lostFiles, setLostFiles] = useState(restored.current?.lostFiles ?? []);
  const [saveState, setSaveState] = useState('Start a contribution. Nothing submitted.'), [error, setError] = useState('');
  const [busy, setBusy] = useState(false), [preview, setPreview] = useState(false), [loading, setLoading] = useState(Boolean(resumeId));
  const [limits, setLimits] = useState<(typeof PORTAL_LIMITS & { uploadsEnabled: boolean }) | null>(null);
  useEffect(() => { if (['documents', 'audio', 'words'].includes(type)) portalCall<any>(data.preview, 'capabilities').then(l => setLimits({ ...PORTAL_LIMITS, ...l })).catch(e => setError(portalMessage(e))); }, [type]);
  const [recording, setRecording] = useState(false), recorder = useRef<MediaRecorder | null>(null), stream = useRef<MediaStream | null>(null);
  const mounted = useRef(true), recordingRef = useRef(false);
  const field = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const batch = useRef(crypto.randomUUID()), inputRef = useRef(input); inputRef.current = input;
  const locked = Boolean(existing && !['draft', 'changes_requested', 'rejected'].includes(existing.status));
  const lockedRef = useRef(locked); lockedRef.current = locked;
  const unsaved = useRef(false), saving = useRef(false); saving.current = busy;
  const localPayload = useRef<LocalDraft>({ input });
  localPayload.current = { input, existing, pending: pending.current, lostFiles: [...lostFiles, ...transfers.filter(t => t.state !== 'uploaded').map(t => t.name)] };
  const persist = () => {
    if (lockedRef.current) return true;
    try {
      const local = localPayload.current;
      if (JSON.stringify(local.input) === JSON.stringify(blankContribution(type)) && !local.existing && !local.pending && !local.lostFiles?.length) localStorage.removeItem(draftKey(data.uid, type));
      else localStorage.setItem(draftKey(data.uid, type), JSON.stringify(local));
      unsaved.current = false; return true;
    }
    catch { unsaved.current = true; setSaveState('Not saved. Device storage is unavailable. Save an account draft before leaving.'); return false; }
  };
  useEffect(() => {
    if (JSON.stringify(input) === JSON.stringify(blankContribution(type)) && !transfers.length && !existing) return;
    if (persist() && !locked) setSaveState(existing ? `Device recovery saved · account version ${existing.version} saved at ${new Date(existing.updatedAt).toLocaleTimeString()}` : 'Draft saved on this device · choose Save draft to save to your account');
  }, [input, existing, transfers, lostFiles]);
  useEffect(() => {
    const protect = (event: Event) => {
      persist();
      if ((unsaved.current || saving.current || recordingRef.current || transfersRef.current.some(t => t.state === 'uploading')) && !window.confirm('Some work has not finished saving, recording or uploading. Leave anyway? Unfinished files must be selected again.')) event.preventDefault();
    };
    const unload = (event: BeforeUnloadEvent) => { persist(); if (unsaved.current || saving.current || recordingRef.current || transfersRef.current.some(t => t.state === 'uploading')) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('studio:before-navigate', protect); window.addEventListener('beforeunload', unload);
    mounted.current = true;
    return () => { mounted.current = false; window.removeEventListener('studio:before-navigate', protect); window.removeEventListener('beforeunload', unload); transfersRef.current.forEach(t => { t.task?.cancel(); if (t.url) URL.revokeObjectURL(t.url); }); recorder.current?.state === 'recording' && recorder.current.stop(); stream.current?.getTracks().forEach(t => t.stop()); };
  }, [type]);
  useEffect(() => {
    if (!resumeId) return;
    let active = true; setLoading(true);
    portalCall(data.preview, 'get', { id: resumeId }).then(({ record }: { record: PortalRecord }) => {
      if (!active) return;
      if (record.type !== type) throw new Error('Open this contribution in its own workspace.');
      const local = restored.current;
      if (local && (!local.existing || local.existing.id !== record.id || local.existing.version !== record.version)) {
        setError('An independent device draft is open. Save it before opening the requested contribution.'); return;
      }
      setExisting(record); if (!local) setInput(record); setSaveState(`Account version ${record.version} · ${PORTAL_STATES[record.status]}`);
    }).catch(e => { if (active) setError(portalMessage(e)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [resumeId]);
  const update = <K extends keyof PortalInput>(name: K, value: PortalInput[K]) => { setInput(r => ({ ...r, [name]: value })); setPreview(false); };
  const content = (name: string, value: any) => update('content', { ...input.content, [name]: value });
  const editTransfer = (id: string, patch: Partial<Transfer>) => setTransfers(items => items.map(t => t.id === id ? { ...t, ...patch } : t));
  const start = async (transfer: Transfer) => {
    if (!transfer.file || !mounted.current) return;
    if (data.preview) { editTransfer(transfer.id, { state: 'local', error: 'Preview only · selected on this device, not uploaded.' }); return; }
    editTransfer(transfer.id, { state: 'uploading', error: '', percent: 0 });
    try {
      const upload = await uploadPortalFile(data.uid, batch.current, transfer.file, percent => editTransfer(transfer.id, { percent }));
      if (!mounted.current) { upload.task.cancel(); await upload.done.catch(() => {}); return; }
      editTransfer(transfer.id, { task: upload.task });
      const result = await upload.done;
      editTransfer(transfer.id, { state: 'uploaded', result, percent: 100 });
      setInput(r => ({ ...r, files: [...r.files.filter(f => f.path !== result.path), result] }));
    } catch (e) { editTransfer(transfer.id, { state: 'failed', error: portalMessage(e) }); }
  };
  const choose = (files: File[]) => {
    if (!limits?.uploadsEnabled) { setError('Upload capabilities are unavailable or uploads are paused. Keep your draft and retry later.'); return; }
    if (files.some(file => file.size > limits.maxFileBytes)) { setError('A file exceeds the configured upload limit.'); return; }
    const current = transfersRef.current;
    if (input.files.length + current.filter(t => t.state !== 'uploaded').length + files.length > limits.maxFiles || [...current.map(t => t.file?.size ?? 0), ...files.map(f => f.size)].reduce((a, b) => a + b, 0) > limits.maxBatchBytes) { setError('Use at most 10 files and 50 MB per batch.'); return; }
    const next = files.map(file => ({ id: crypto.randomUUID(), name: file.name, file, percent: 0, state: 'selected', url: file.type.startsWith('audio/') || file.type.startsWith('video/') ? URL.createObjectURL(file) : undefined }));
    setTransfers(t => [...t, ...next]); setLostFiles(names => names.filter(name => !files.some(f => f.name === name)));
    // A small bounded queue keeps batches responsive and cost predictable.
    void (async () => { for (const transfer of next) await start(transfer); })();
  };
  const record = async () => {
    if (recording) { recordingRef.current = false; recorder.current?.stop(); setRecording(false); return; }
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Recording is unavailable in this browser. Upload a recording instead.');
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) { media.getTracks().forEach(t => t.stop()); return; }
      stream.current = media;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const rec = new MediaRecorder(media, { mimeType }), chunks: BlobPart[] = []; recorder.current = rec;
      rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => { media.getTracks().forEach(t => t.stop()); recordingRef.current = false; if (mounted.current) choose([new File(chunks, `recording-${Date.now()}.${mimeType === 'audio/webm' ? 'webm' : 'm4a'}`, { type: mimeType })]); };
      rec.start(); recordingRef.current = true; setRecording(true);
    } catch (e) { setError(portalMessage(e)); }
  };
  const save = async (submit: boolean) => {
    setBusy(true); setError('');
    const signature = JSON.stringify({ input, version: existing?.version, submit });
    if (pending.current?.signature !== signature) pending.current = { signature, requestId: crypto.randomUUID() };
    localPayload.current.pending = pending.current; persist();
    try {
      const result = await portalCall<{ record: PortalRecord }>(data.preview, 'save', { record: input, id: existing?.id, version: existing?.version, submit, requestId: pending.current.requestId });
      setExisting(result.record); setPreview(false); pending.current = undefined;
      if (submit) { localStorage.removeItem(draftKey(data.uid, type)); setSaveState(`Submitted for review · Receipt ${result.record.id}:${result.record.version}`); }
      else setSaveState(`Account draft saved · version ${result.record.version} · ${new Date(result.record.updatedAt).toLocaleTimeString()}`);
      window.dispatchEvent(new Event('portal:changed'));
    } catch (e) { setError(portalMessage(e)); setSaveState('Account save not confirmed. Device recovery retained. Retry uses the same request ID.'); }
    finally { setBusy(false); }
  };
  const insert = (word: string) => {
    const el = field.current, value = inputRef.current.content.text || '', start = el?.selectionStart ?? value.length, end = el?.selectionEnd ?? start;
    content('text', value.slice(0, start) + word + value.slice(end));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + word.length, start + word.length); });
  };
  const uploadType = ['documents', 'audio', 'words'].includes(type), meta = PORTAL_TYPES[type];
  const issues = portalIssues(input), activeUploads = transfers.some(t => t.state === 'uploading');
  const normalField = (label: string, name: string, multiline = false, hint?: string) => <label className="pw-field"><span>{label}</span>{multiline ? <textarea aria-label={label} value={input.content[name] ?? ''} rows={3} maxLength={30000} onChange={e => content(name, e.target.value)} /> : <input aria-label={label} value={input.content[name] ?? ''} maxLength={2000} onChange={e => content(name, e.target.value)} />}{hint ? <small>{hint}</small> : null}</label>;
  if (loading) return <p role="status">Opening your saved contribution…</p>;
  return <div className="ts-page pw-workspace">
    <header className="pw-heading"><div><h1>{meta.label}</h1><p>{meta.description}</p></div>{type === 'translations' ? <PortalLink to={data.paths.section('assignments')} className="ts-btn ts-btn--secondary">Assigned sentences<Icon name="arrow" /></PortalLink> : null}</header>
    <div className="pw-work-grid"><section className="pw-card pw-editor" aria-label="Contribution editor">
      <div className="pw-section-head"><h2>{['documents', 'audio'].includes(type) ? 'Add your materials' : type === 'translations' ? `${input.content.sourceLanguage || 'Source'} → ${input.language}` : 'Your contribution'}</h2><span role="status" className="pw-save"><Icon name={locked ? 'check-circle' : 'cloud'} />{saveState}</span></div>
      {error ? <p className="ts-notice ts-notice--danger" role="alert">{error}</p> : null}
      {existing?.feedback ? <blockquote className="pw-feedback"><strong>Feedback from reviewer</strong><p>{existing.feedback}</p></blockquote> : null}
      {locked ? <div className="pw-receipt"><Icon name="check-circle" /><h3>{PORTAL_STATES[existing!.status]}</h3><p>Receipt: <strong>{existing!.id}:{existing!.version}</strong></p><p>{existing!.status === 'submitted' ? 'Your saved version is with reviewers. Follow processing and feedback from My submissions on Home.' : 'This version is kept in your contribution history.'}</p><PortalLink to={data.paths.base + '?panel=submissions&record=' + existing!.id} className="ts-btn ts-btn--primary">View submission & history</PortalLink><button className="ts-btn ts-btn--secondary" onClick={() => { setExisting(undefined); setInput(blankContribution(type)); setTransfers([]); setSaveState('New contribution'); }}>Start another</button></div> : <>
      <fieldset disabled={busy} className="pw-fields">
      {uploadType ? <><div className="pw-drop" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); choose([...e.dataTransfer.files]); }}><Icon name={type === 'audio' ? 'mic' : 'upload'} /><p>{type === 'words' ? 'Add pronunciation (optional)' : 'Drop files here or choose files'}</p><label className="ts-btn ts-btn--secondary">Choose files<input type="file" disabled={!limits?.uploadsEnabled} multiple accept={type !== 'documents' ? '.mp3,.wav,.m4a,.webm' : Object.keys(PORTAL_FORMATS).map(e => '.' + e).join(',')} className="sr-only" onChange={e => { choose([...e.target.files ?? []]); e.target.value = ''; }} /></label>{type !== 'documents' ? <button type="button" className="ts-btn ts-btn--secondary" onClick={() => void record()}>{recording ? 'Stop recording' : 'Record audio'}</button> : null}</div><small className="pw-format">{limits ? `Current limits: ${limits.maxFiles} files · ${Math.round(limits.maxFileBytes / 1048576)} MB each · ${Math.round(limits.maxBatchBytes / 1048576)} MB per batch. ${limits.uploadsEnabled ? "Uploads open." : "Uploads paused."} ` : "Checking current upload limits… "}{type !== 'documents' ? 'Optional pronunciation: MP3, WAV, M4A, WebM' : 'PDF, DOCX, TXT, Markdown, CSV, XLSX, JSON/JSONL, JPEG/PNG, MP3/WAV/M4A, WebM, MP4'}. Platform ceilings: 10 files, 20 MB each, 50 MB total. Text/CSV/JSON extraction up to 2 MB; other formats require manual review. No archives or macros.</small>
      {lostFiles.length ? <p role="alert">Select these unfinished files again: {lostFiles.join(', ')}. They were not uploaded.</p> : null}
      <div className="pw-transfers">{transfers.map(t => <div className="pw-file" key={t.id}><Icon name={t.state === 'uploaded' ? 'check-circle' : 'doc'} /><div><strong>{t.name}</strong><small>{t.state === 'uploaded' ? 'Uploaded privately · awaiting inspection after submission' : t.error || `${t.state} · ${t.percent}%`}</small>{t.state === 'uploading' ? <progress max={100} value={t.percent} aria-label={`Upload progress for ${t.name}`} /> : null}{t.url ? <audio controls src={t.url} aria-label={`Replay ${t.name}`} /> : null}</div>{t.state === 'uploading' ? <><button type="button" className="ts-link" onClick={() => t.task?.snapshot.state === 'paused' ? t.task.resume() : t.task?.pause()}>Pause / resume</button><button type="button" className="ts-link" onClick={() => t.task?.cancel()}>Cancel</button></> : t.state === 'failed' ? <button type="button" className="ts-link" onClick={() => void start(t)}>Retry upload</button> : null}<button type="button" className="ts-link" aria-label={`Remove ${t.name}`} onClick={() => { t.task?.cancel(); setTransfers(rows => rows.filter(x => x.id !== t.id)); if (t.result) update('files', input.files.filter(f => f.path !== t.result!.path)); }}>Remove</button></div>)}</div>
      {input.files.map((f, index) => <div className="pw-file-meta" key={f.path}><strong>{f.name}</strong><details><summary>Individual file details (optional)</summary>{(['title', 'language', 'source', 'description'] as const).map(k => <label className="pw-field" key={k}><span>File {k}</span><input value={f[k] ?? ''} onChange={e => update('files', input.files.map((file, i) => i === index ? { ...file, [k]: e.target.value } : file))} /></label>)}</details>{!transfers.some(t => t.result?.path === f.path) ? <><small>Private upload reference retained; server checks it on submission.</small><button type="button" className="ts-link" onClick={() => update('files', input.files.filter(x => x.path !== f.path))}>Remove file</button></> : null}</div>)}
      </> : null}
      <label className="pw-field"><span>Title *</span><input value={input.title} maxLength={240} onChange={e => update('title', e.target.value)} /></label>
      <div className="pw-pair"><label className="pw-field"><span>Language *</span><input value={input.language} maxLength={80} onChange={e => update('language', e.target.value)} /></label>{type === 'documents' ? <label className="pw-field"><span>Material type</span><select aria-label="Material type" value={input.content.category ?? ''} onChange={e => content('category', e.target.value)}><option value="">Choose material type</option>{['Field notes', 'Research draft', 'Thesis', 'Dictionary / glossary', 'Interview transcript', 'Dataset', 'Scanned pages', 'Recording', 'Video', 'Other source material'].map(x => <option key={x}>{x}</option>)}</select></label> : normalField('Dialect (optional)', 'dialect')}</div>
      {type === 'translations' ? <>{normalField('Source language', 'sourceLanguage')}{normalField('Source sentence *', 'sourceText', true)}</> : null}
      {type === 'corrections' ? normalField('Original record URL or ID *', 'originalRecord', false, 'The original remains intact; this proposal is reviewed separately.') : null}
      {type !== 'audio' ? <label className="pw-field"><span>{type === 'translations' ? 'Your translation *' : type === 'words' ? 'Term or expression *' : type === 'documents' ? 'Description (optional)' : type === 'corrections' ? 'Proposed change *' : 'Story or account *'}</span>{input.language.toLowerCase().includes('kasem') || input.language === 'xsm' ? <KasemField ref={field} dictionaryAssistance as="textarea" rows={type === 'stories' ? 7 : 3} value={input.content.text ?? ''} maxLength={30000} onChange={e => content('text', e.target.value)} /> : <textarea ref={field as React.RefObject<HTMLTextAreaElement>} value={input.content.text ?? ''} rows={3} onChange={e => content('text', e.target.value)} />}</label> : <>{normalField('Transcript (optional)', 'transcript', true)}<label className="pw-check"><input type="checkbox" checked={input.content.needsTranscription === true} onChange={e => content('needsTranscription', e.target.checked)} /><span>Needs transcription · manual review is available</span></label>{normalField('Pseudonymous speaker reference', 'speaker', false, 'Use the same reference for recordings of the same speaker; avoid personal contact details.')}</>}
      {type === 'words' ? <>{normalField('Meaning(s) *', 'meaning', true, 'Distinguish alternative meanings and regional variants.')}{normalField('Usage example', 'example', true)}</> : null}
      {type === 'corrections' ? normalField('Reason and evidence *', 'reason', true) : null}
      {type === 'translations' || type === 'words' ? <><div className="pw-characters" aria-label="Insert Kasem characters">{'ɛ ɔ ŋ ɩ ʋ á à é è í ì ó ò ú ù'.split(' ').map(char => <button type="button" key={char} onMouseDown={e => e.preventDefault()} onClick={() => insert(char)}>{char}</button>)}</div><DictionaryRecommendations source={type === 'translations' ? input.content.sourceText || '' : input.content.meaning || ''} disabled={busy} onInsert={insert} /></> : null}
      {normalField('Source or author *', 'source', false, 'For original work, identify yourself or your chosen attribution. For other sources, name the author or source.')}
      <details className="pw-optional"><summary>Dialect, context & attribution (optional)</summary>{normalField('Context or locality', 'context', true)}{type === 'documents' ? normalField('Dialect', 'dialect') : null}{normalField('Script (optional)', 'script')}{normalField('Alternative forms or variants', 'variants')}{normalField('Source URL / reference', 'sourceUrl')}{normalField('Date or version', 'date')}{normalField('Public attribution preference', 'attribution')}{normalField('Restrictions on sharing', 'restrictions', true)}</details>
      <label className="pw-field"><span>How was this created?</span><select value={input.provenance} onChange={e => update('provenance', e.target.value)}>{[['original', 'Original'], ['transcribed', 'Transcribed'], ['translated', 'Translated'], ['ai_assisted', 'AI-assisted'], ['ai_generated', 'AI-generated']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label className="pw-field"><span>Ownership or permission *</span><select aria-label="Ownership or permission *" value={input.rights.ownership} onChange={e => update('rights', { ...input.rights, ownership: e.target.value })}><option value="">Choose an answer</option><option value="own">I own this material</option><option value="permission">I have permission from the rights holder</option><option value="unclear">Rights need clarification · review only</option></select></label>
      {(['sensitive', 'confidential', 'cultural', ...((type === 'audio' || input.files.some(f => /^(audio|video)\//.test(f.mime))) ? ['speakers'] : [])] as const).map(k => <label className="pw-check" key={k}><input type="checkbox" checked={input.rights[k as keyof typeof input.rights] === true} onChange={e => update('rights', { ...input.rights, [k]: e.target.checked })} /><span>{({ sensitive: 'Contains personal or sensitive information', confidential: 'Contains confidential material', cultural: 'Includes restricted cultural knowledge', speakers: 'Recorded speakers permitted storage and review of this recording; this does not include voice cloning' } as Record<string, string>)[k]}</span></label>)}
      </fieldset>
      {preview ? <section className="pw-preview" aria-label="Submission preview"><h3>Preview your contribution</h3><p><strong>{input.title || 'Untitled'}</strong> · {input.language}</p><p className="pw-preserve">{input.content.text || input.content.transcript}</p><p>{input.files.length} privately uploaded files · {input.provenance.replace('_', '-')}</p><p>Allowed uses: {Object.entries(input.uses).filter(([, v]) => v).map(([k]) => PORTAL_USES[k as PortalUse][0]).join(', ') || 'None selected'}</p>{issues.length ? <ul>{issues.map(x => <li key={x}>{x}</li>)}</ul> : <p>Ready for review. A saved receipt will follow submission.</p>}<button type="button" className="ts-btn ts-btn--primary" disabled={busy || issues.length > 0 || activeUploads || lostFiles.length > 0 || transfers.some(t => ['failed', 'local', 'selected'].includes(t.state))} onClick={() => void save(true)}>{busy ? 'Submitting…' : 'Submit for review'}</button></section> : null}
      <div className="pw-actions"><button type="button" className="ts-btn ts-btn--primary" disabled={busy || recording || activeUploads} onClick={() => setPreview(true)}>Preview & submit</button><button type="button" className="ts-btn ts-btn--secondary" disabled={busy} onClick={() => void save(false)}>{busy ? 'Saving…' : 'Save draft'}</button></div>
      </>}
    </section><aside className="pw-aside"><section className="pw-card"><h2>{type === 'documents' ? 'How may we use this?' : 'Contribution guide'}</h2>{type !== 'documents' ? <><p className="pw-tip"><Icon name="check-circle" /><span>Keep tone marks and the dialect you know. Flag uncertainties for your reviewer.</span></p><p className="pw-example"><strong>Example</strong>{meta.example}</p><h3>How may we use this?</h3></> : null}{(Object.entries(PORTAL_USES) as [PortalUse, [string, string]][]).map(([k, [title, description]]) => <label key={k} className="pw-check pw-use"><input type="checkbox" checked={input.uses[k]} disabled={busy || locked} onChange={e => update('uses', { ...input.uses, [k]: e.target.checked })} /><span><strong>{title}</strong><small>{description}</small></span></label>)}<p className="pw-footnote">Choose only uses you can authorise. Review does not approve public sharing or training.</p></section><section className="pw-card"><h2>Before you submit</h2><p>Working drafts are welcome. Include the source and tell us about sensitive content.</p><p>Files stay private. Extracted text is machine output and remains unverified until reviewed.</p><p>OCR, automatic transcription, and an external malware scanner are not configured. PDF, Office, image and media files require manual review.</p><p>Rewards: pending assessment. Upload size and candidate count do not create a payout.</p></section><section className="pw-card"><h2>Your progress</h2><ol className="pw-progress"><li>Draft</li><li className={preview ? 'active' : ''}>Preview</li><li className={locked ? 'active' : ''}>Submit</li></ol><PortalLink to={data.paths.base + '?panel=submissions'} className="ts-link">Open my submissions<Icon name="arrow" /></PortalLink></section></aside></div>
  </div>;
}
