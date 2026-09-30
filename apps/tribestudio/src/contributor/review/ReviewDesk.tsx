import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref } from 'firebase/storage';
import { canValidate, signOutUser, useAuth } from '../../auth';
import { db, functions, storage } from '../../firebase';
import { Link } from '../../router';
import { fetchHeadwordMatches, type PublishedHeadword } from '../../creator/dictionary-data';
import { BrandMark, Card, PageHeader } from '../components';
import { DESKS, DECISION_LABELS, DIMENSIONS, TARGETS, decisionsFor, decisionRequest, safeUrl, targetProblem, type Desk, type ReviewRecord } from './model';
import './review.css';

/** Only the authorized child mounts Firestore subscriptions. Direct URLs use the same guard. */
export function ReviewDesk() {
  const { ready, user, role } = useAuth();
  if (!ready) return <p role="status">Checking review access…</p>;
  if (!user || !canValidate(role)) return <p role="alert">Validator access required.</p>;
  return <AuthorizedDesk key={user.uid} />;
}

function AuthorizedDesk() {
  const [desk, setDesk] = useState<Desk>('contributions');
  const [status, setStatus] = useState('SUBMITTED');
  const [rows, setRows] = useState<ReviewRecord[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0), [notice, setNotice] = useState('');
  const config = DESKS[desk];
  useEffect(() => { document.title = 'Review desk · Contributor portal'; }, []);
  useEffect(() => {
    setRows([]); setLoading(true); setError(''); setSelected('');
    return onSnapshot(query(collection(db, config.collection), where('status', '==', status), limit(60)), snapshot => {
      const next = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as ReviewRecord));
      const date = (row: ReviewRecord) => { const value = row.lifecycle?.createdAt ?? row.createdAt; return value?.toMillis?.() ?? (Date.parse(value ?? '') || 0); };
      next.sort((a, b) => date(b) - date(a));
      setRows(next); setLoading(false);
    }, reason => { setError(reason.message); setLoading(false); });
  }, [config.collection, status, attempt]);
  const item = rows.find(row => row.id === selected);
  const switchDesk = (next: Desk) => { setDesk(next); setStatus(DESKS[next].queues[0][0]); setSelected(''); setNotice(''); };
  return <div className="cw iwx review-desk">
    <a className="cw-skip" href="#main-content">Skip to content</a>
    <header className="review-header"><BrandMark /><strong>Contributor portal · Review desk</strong><nav aria-label="Portal"><Link to="/contributor">Contributor workspace</Link><Link to="/studio">TribeStudio</Link><button onClick={() => void signOutUser()}>Sign out</button></nav></header>
    <main id="main-content" tabIndex={-1} className="review-main">
      <PageHeader kicker="Validator workspace" title="Review desk" description="Check the evidence, hear the recording, and give the contributor a clear answer." />
      <nav className="review-tabs" aria-label="Review queues">{(Object.keys(DESKS) as Desk[]).map(key => <button key={key} aria-pressed={desk === key} onClick={() => switchDesk(key)}>{DESKS[key].label}</button>)}</nav>
      <nav className="review-tabs" aria-label="Queue status">{config.queues.map(([value, label]) => <button key={value} aria-pressed={status === value} onClick={() => { setStatus(value); setSelected(''); }}>{label}</button>)}</nav>
      {notice ? <p role="status" className="review-notice">{notice}</p> : null}
      {loading ? <p role="status">Loading the queue…</p> : error ? <p role="alert">Could not load the queue: {error} <button onClick={() => setAttempt(n => n + 1)}>Try again</button></p> : !rows.length ? <Card><p>Nothing in this queue yet.</p></Card> : <div className="review-grid">
        <section aria-label="Items in this queue" className="review-list">{rows.map(row => <button key={row.id} aria-pressed={selected === row.id} onClick={() => { setSelected(row.id); setNotice(''); }}><strong>{row.title || row.name || row.headline || 'Untitled contribution'}</strong><small>{row.collectionKind || row.origin || row.kind || row.format || config.label} · {row.status}</small></button>)}<small>Showing up to 60 items per queue.</small></section>
        {item ? <ReviewDetail key={`${desk}:${item.id}:${item.lifecycle?.version ?? item.revision ?? item.status}`} desk={desk} item={item} onSaved={message => { setNotice(message); setSelected(''); }} /> : <Card><p>Select an item to read its evidence and record a decision.</p></Card>}
      </div>}
    </main>
  </div>;
}

function Evidence({ label, value }: { label: string; value: unknown }) {
  if (value == null || value === '') return null;
  const content = typeof value === 'object' ? <div className="review-nested">{Object.entries(value).map(([key, child]) => <Evidence key={key} label={Array.isArray(value) ? `Item ${Number(key) + 1}` : key.replace(/([A-Z])/g, ' $1')} value={child} />)}</div> : <p>{typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}</p>;
  return <div className="review-evidence"><strong>{label}</strong>{content}</div>;
}

function Media({ path, type, alt }: { path: string; type: string; alt: string }) {
  const [url, setUrl] = useState(''), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  useEffect(() => { let active = true; setUrl(''); setError(''); void getDownloadURL(ref(storage, path)).then(value => { if (active) setUrl(value); }).catch(() => { if (active) setError('The attachment could not be loaded. Check it before approving.'); }); return () => { active = false; }; }, [path, attempt]);
  if (error) return <p role="alert">{error} <button onClick={() => setAttempt(n => n + 1)}>Retry attachment</button></p>;
  if (!url) return <p role="status">Loading attachment…</p>;
  if (type === 'audio') return <audio controls src={url} aria-label={alt} />;
  if (type === 'video') return <video controls playsInline src={url} aria-label={alt} />;
  if (type === 'image') return <img src={url} alt={alt} />;
  return <a href={url} target="_blank" rel="noreferrer">Open attachment</a>;
}

function ReviewDetail({ desk, item, onSaved }: { desk: Desk; item: ReviewRecord; onSaved: (message: string) => void }) {
  const [decision, setDecision] = useState(''), [feedback, setFeedback] = useState('');
  // Enable after the backend release for dictionary answer targets is verified.
  const answerTargetsAvailable = false;
  const [target, setTarget] = useState(answerTargetsAvailable ? item.moderation?.publishAs || 'headword' : 'headword'), [entryId, setEntryId] = useState(item.moderation?.linkedEntryId || '');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const actions = decisionsFor(desk, item);
  const dictionary = desk === 'contributions' && item.collectionKind?.toLowerCase() === 'dictionary';
  const attachment = desk === 'adverts' ? item.creative : item.media;
  const external = safeUrl(item.externalPostUrl || item.ctaUrl);
  return <Card className="review-detail" title={item.title || item.name || item.headline || 'Submission'} meta={item.status}>
    {['body', 'description', 'format', 'dialect', 'sourceReferences', 'translationNotes', 'kasemExample', 'englishExample', 'senses', 'forms', 'ipa', 'kasemDefinition', 'etymology', 'alsoUsedAs', 'translation', 'culturalContext', 'wordQueuePrompt', 'explanation', 'question', 'answer', 'wrongSpan', 'meaning', 'kind', 'note', 'handle'].map(key => <Evidence key={key} label={({ sourceReferences: 'Source', translationNotes: 'Translation notes', kasemExample: 'Kasem example', englishExample: 'English example', wrongSpan: 'Reported error', wordQueuePrompt: 'Original prompt', senses: 'Meanings', forms: 'Word forms', ipa: 'Pronunciation', kasemDefinition: 'Meaning in Kasem', alsoUsedAs: 'Also used as', culturalContext: 'Cultural context' } as Record<string, string>)[key] || key.replace(/([A-Z])/g, ' $1')} value={item[key]} />)}
    {desk === 'adverts' ? <><Evidence label="Headline" value={item.headline} /><Evidence label="Where it runs" value={item.placements} /><Evidence label="Regions" value={item.regions} /><Evidence label="Duration (days)" value={item.durationDays} /><Evidence label="Daily budget (GH₵)" value={(Number(item.dailyBudgetPesewas || 0) / 100).toFixed(2)} /><Evidence label="Total budget (GH₵)" value={(Number(item.totalBudgetPesewas || 0) / 100).toFixed(2)} /><Evidence label="Payment" value={item.payment?.status || 'unpaid'} /><Evidence label="Button label" value={item.ctaLabel} /></> : null}
    {desk === 'contributions' ? <><Evidence label="Permissions" value={item.permissions || 'Not recorded'} /><Evidence label="Participant consent" value={item.attestations || 'Not recorded'} /><Evidence label="Third-party material and minors" value={item.disclosures || 'Not recorded'} /><Evidence label="Attribution" value={item.attribution} /><Evidence label="Previous feedback" value={item.moderation?.feedback} /></> : null}
    <Evidence label="Previous review" value={item.reviewNote || item.reviewFeedback} />
    {desk === 'sentences' ? <><Evidence label="Recorded permission" value={item.permissions || 'Not recorded'} /><Evidence label="Reviewers of this revision" value={item.reviewerIds?.length ?? 0} /><Evidence label="Review guidance" value="Legacy notes may need migration and permission before review. Independent reviewers determine confirmation." /></> : null}
    {external ? <p><a href={external} target="_blank" rel="noreferrer">Open {desk === 'adverts' ? 'advert destination' : 'external post'}</a></p> : null}
    {attachment?.storagePath ? <Media path={attachment.storagePath} type={attachment.mediaType} alt={item.title || item.name || 'Submitted attachment'} /> : null}
    {dictionary ? <EntryLookup initial={item.body || ''} selected={entryId} onSelect={setEntryId} /> : null}
    {desk === 'sentences' ? <SentenceReview item={item} onSaved={onSaved} /> : actions.length ? <form className="review-form" onSubmit={async event => {
      event.preventDefault(); setError(''); setBusy(true);
      try { const request = decisionRequest(desk, item, decision, feedback, target, entryId); await httpsCallable(functions, request.callable, { timeout: 120000 })(request.data); onSaved('Decision recorded. The queue has been updated.'); }
      catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save the decision.'); }
      finally { setBusy(false); }
    }}>
      <label>Decision<select required disabled={busy} value={decision} onChange={event => setDecision(event.target.value)}><option value="">Choose a decision</option>{actions.map(value => <option key={value} value={value}>{desk === 'adverts' && value === 'APPROVE' ? 'Approve and run' : DECISION_LABELS[value]}</option>)}</select></label>
      {answerTargetsAvailable && dictionary && ['APPROVE', 'PUBLISH'].includes(decision) ? <><label>Use this answer as<select disabled={busy} value={target} onChange={event => setTarget(event.target.value)}>{Object.entries(TARGETS).map(([value, label]) => <option key={value} value={value} disabled={Boolean(targetProblem(value, item))}>{label}{targetProblem(value, item) ? ` — ${targetProblem(value, item)}` : ''}</option>)}</select></label>{['variant', 'example'].includes(target) ? <p>Choose the existing word above that this {target === 'variant' ? 'variant' : 'example'} belongs to.</p> : null}</> : null}
      <label>Feedback to the contributor<textarea maxLength={desk === 'adverts' ? 1000 : 2000} required={['REJECT', 'REQUEST_REVISION', 'reject'].includes(decision)} minLength={['REJECT', 'REQUEST_REVISION', 'reject'].includes(decision) ? 5 : undefined} disabled={busy} value={feedback} onChange={event => setFeedback(event.target.value)} /></label>
      {decision === 'PUBLISH' || (desk === 'adverts' && decision === 'APPROVE') ? <p>This decision makes the work available to its audience.</p> : null}
      {error ? <p role="alert">{error}</p> : null}<button className="button--primary" disabled={busy || !decision}>{busy ? 'Saving…' : 'Record decision'}</button>
    </form> : <p>No review actions are available in this status.</p>}
  </Card>;
}

function EntryLookup({ initial, selected, onSelect }: { initial: string; selected: string; onSelect: (id: string) => void }) {
  const [spelling, setSpelling] = useState(initial), [matches, setMatches] = useState<PublishedHeadword[]>([]);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  return <section className="review-form" aria-label="Dictionary check"><label>Check an existing spelling<input value={spelling} onChange={event => setSpelling(event.target.value)} /></label><button type="button" disabled={busy || !spelling.trim()} onClick={async () => { setBusy(true); setError(''); try { setMatches(await fetchHeadwordMatches(spelling)); } catch { setError('Could not check the dictionary. Try again.'); } finally { setBusy(false); } }}>{busy ? 'Checking…' : 'Check dictionary'}</button>{error ? <p role="alert">{error}</p> : null}<p>A matching spelling may have another meaning. Compare it before choosing.</p>{matches.map(entry => <label className="review-checkbox" key={entry.id}><input type="radio" name="linked-entry" checked={selected === entry.id} onChange={() => onSelect(entry.id)} />{entry.kasemText} — {entry.englishText} ({entry.partOfSpeech})</label>)}{selected ? <button type="button" onClick={() => onSelect('')}>Clear linked word</button> : null}</section>;
}

function SentenceReview({ item, onSaved }: { item: ReviewRecord; onSaved: (message: string) => void }) {
  const examples: Record<string, any>[] = Array.isArray(item.examples) ? item.examples : [];
  const [judgments, setJudgments] = useState(() => examples.map(() => ({ meaning: 'cannot-judge', grammar: 'cannot-judge', naturalness: 'cannot-judge', contextFit: 'cannot-judge', annotationApproved: false, explanation: '' } as Record<string, any>)));
  const [competent, setCompetent] = useState(false), [preference, setPreference] = useState('cannot-judge');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const change = (index: number, key: string, value: unknown) => setJudgments(rows => rows.map((row, i) => i === index ? { ...row, [key]: value } : row));
  return <form className="review-form" onSubmit={async event => {
    event.preventDefault(); setBusy(true); setError('');
    try { const result = await httpsCallable(functions, 'decideGrammarNote')({ noteId: item.id, revision: item.revision ?? 1, dialectCompetent: competent, preference, judgments }); onSaved(`Sentence review recorded: ${(result.data as { status?: string }).status || 'saved'}.`); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not record review.'); }
    finally { setBusy(false); }
  }}>
    {examples.map((example, index) => <fieldset key={index} disabled={busy}><legend>Version {index + 1}</legend>{['kasem', 'english', 'dialect', 'context', 'literal', 'note', 'source', 'annotations', 'permissions'].map(key => <Evidence key={key} label={key} value={example[key]} />)}
      {example.audioPath ? <SentenceAudio item={item} index={index} /> : null}
      {Object.entries(DIMENSIONS).map(([dimension, values]) => <label key={dimension}>{dimension === 'contextFit' ? 'Context fit' : dimension}<select value={judgments[index][dimension]} onChange={event => change(index, dimension, event.target.value)}>{Object.entries(values).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>)}
      <label>Explain concerns or context differences<textarea maxLength={2000} value={judgments[index].explanation} onChange={event => change(index, 'explanation', event.target.value)} /></label>
      <label className="review-checkbox"><input type="checkbox" checked={judgments[index].annotationApproved} onChange={event => change(index, 'annotationApproved', event.target.checked)} />I also confirm this example’s annotation and explanation</label>
    </fieldset>)}
    <label className="review-checkbox"><input required type="checkbox" disabled={busy} checked={competent} onChange={event => setCompetent(event.target.checked)} />I can judge the dialect in these examples</label>
    {examples.length > 1 ? <label>Comparison preference<select disabled={busy} value={preference} onChange={event => setPreference(event.target.value)}>{[['cannot-judge', 'Cannot judge'], ['first', 'First version'], ['second', 'Second version'], ['tie', 'Both work'], ['context-dependent', 'Depends on context']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label> : null}
    <p>Reviews preserve disagreements. Confirmation depends on independent reviewers and recorded permission.</p>
    {error ? <p role="alert">{error}</p> : null}<button className="button--primary" disabled={busy || !competent || !examples.length || ['withdrawn', 'needs-permission'].includes(item.status)}>{busy ? 'Saving…' : 'Record sentence review'}</button>
  </form>;
}

function SentenceAudio({ item, index }: { item: ReviewRecord; index: number }) {
  const [url, setUrl] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return <div>{url ? <audio controls src={url} aria-label={`Speaker recording for version ${index + 1}`} /> : <button type="button" disabled={busy} onClick={async () => {
    setBusy(true); setError('');
    try { const result = await httpsCallable(functions, 'readGrammarAudio')({ noteId: item.id, revision: item.revision, example: index }); const data = result.data as { audio: string; contentType: string }; const bytes = Uint8Array.from(atob(data.audio), char => char.charCodeAt(0)); setUrl(URL.createObjectURL(new Blob([bytes], { type: data.contentType }))); }
    catch { setError('Could not play the private recording.'); } finally { setBusy(false); }
  }}>{busy ? 'Loading recording…' : 'Load speaker recording'}</button>}{error ? <p role="alert">{error}</p> : null}</div>;
}
