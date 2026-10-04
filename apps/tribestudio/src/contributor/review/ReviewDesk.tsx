import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref } from 'firebase/storage';
import { canValidate, signOutUser, useAuth } from '../../auth';
import { db, functions, storage } from '../../firebase';
import { useRoute } from '../../router';
import { AppShell, Badge, Icon, PageHeader, Steps, type IconName } from '../../ui';
import { fetchHeadwordMatches, type PublishedHeadword } from '../../creator/dictionary-data';
import { DESKS, DECISION_LABELS, DIMENSIONS, TARGETS, decisionsFor, decisionRequest, safeUrl, targetProblem, type Desk, type ReviewRecord } from './model';
import { reviewNav } from './nav';
import './review.css';

/** Only the authorized child mounts Firestore subscriptions. Direct URLs use the same guard. */
export function ReviewDesk() {
  const { ready, user, role } = useAuth();
  if (!ready) return <p role="status" className="ts-loading">Checking review access…</p>;
  if (!user || !canValidate(role)) return <p role="alert" className="ts-loading">Validator access required.</p>;
  return <AuthorizedDesk key={user.uid} />;
}

function useDecisionProtection(dirty: boolean, busy: boolean) {
  const state = useRef({ dirty, busy }); state.current = { dirty, busy };
  useEffect(() => {
    const protect = (event: Event) => {
      if (state.current.busy || (state.current.dirty && !window.confirm('Leave this review? Your unrecorded decision and notes will be lost.'))) event.preventDefault();
    };
    const unload = (event: BeforeUnloadEvent) => { if (state.current.dirty || state.current.busy) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('studio:before-navigate', protect); window.addEventListener('review:before-record', protect); window.addEventListener('beforeunload', unload);
    return () => { window.removeEventListener('studio:before-navigate', protect); window.removeEventListener('review:before-record', protect); window.removeEventListener('beforeunload', unload); };
  }, []);
  return state;
}

function recordVersion(item: ReviewRecord | undefined) {
  return item ? JSON.stringify([item.status, item.lifecycle?.version, item.revision, item.updatedAt, item.lifecycle?.updatedAt]) : '';
}

function millis(value: unknown): number {
  const raw = value as { toMillis?: () => number } | string | undefined;
  if (raw && typeof raw === 'object' && typeof raw.toMillis === 'function') return raw.toMillis();
  return Date.parse(String(raw ?? '')) || 0;
}

function age(row: ReviewRecord): string {
  const created = millis(row.lifecycle?.createdAt ?? row.createdAt);
  if (!created) return '';
  const minutes = Math.round((Date.now() - created) / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

const STATUS_TONE: Record<string, 'info' | 'success' | 'warning' | 'danger' | 'neutral' | 'violet'> = {
  SUBMITTED: 'info', RESUBMITTED: 'info', IN_REVIEW: 'info', pending: 'info', submitted: 'info',
  APPROVED: 'success', PUBLISHED: 'success', ACTIVE: 'success', approved: 'success', confirmed: 'success', reviewed: 'success',
  NEEDS_REVISION: 'warning', UNDER_REVIEW: 'violet', PAUSED: 'warning', disputed: 'warning', 'needs-permission': 'warning',
  REJECTED: 'danger', rejected: 'danger', withdrawn: 'neutral',
};

function AuthorizedDesk() {
  const { user } = useAuth();
  const { path, search, navigate } = useRoute();
  const params = new URLSearchParams(search);
  const requested = params.get('desk') as Desk;
  const desk: Desk = Object.hasOwn(DESKS, requested) ? requested : 'contributions';
  const config = DESKS[desk];
  const requestedStatus = params.get('status');
  const status = config.queues.some(([value]) => value === requestedStatus) ? requestedStatus! : config.queues[0][0];
  const [rows, setRows] = useState<ReviewRecord[]>([]);
  const [selected, setSelected] = useState<ReviewRecord | null>(null);
  const [needle, setNeedle] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0), [notice, setNotice] = useState('');
  const [deciding, setDeciding] = useState(false);
  useEffect(() => {
    setRows([]); setLoading(true); setError(''); setSelected(null); setCategory('');
    return onSnapshot(query(collection(db, config.collection), where('status', '==', status), limit(60)), snapshot => {
      const next = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as ReviewRecord));
      const date = (row: ReviewRecord) => { const value = row.lifecycle?.createdAt ?? row.createdAt; return value?.toMillis?.() ?? (Date.parse(value ?? '') || 0); };
      next.sort((a,b) => date(a) - date(b));
      setRows(next); setLoading(false);
    }, reason => { setError(reason.message); setLoading(false); });
  }, [config.collection,status,attempt]);
  const title = (row: ReviewRecord) => row.title || row.name || row.headline || row.examples?.[0]?.kasem || 'Untitled contribution';
  const kind = (row: ReviewRecord) => row.collectionKind || row.studioType || row.origin || row.kind || row.format || config.label;
  const filtered = rows.filter(row => (!category || kind(row) === category) && [title(row),row.body,row.translation,row.id].join(' ').toLocaleLowerCase().includes(needle.trim().toLocaleLowerCase()));
  const latest = rows.find(row => row.id === selected?.id);
  const stale = Boolean(selected && recordVersion(latest) !== recordVersion(selected));
  const switchQueue = (nextDesk: Desk, nextStatus: string) => { setNotice(''); navigate('/contributor/review?desk=' + nextDesk + '&status=' + nextStatus); };
  const choose = (row: ReviewRecord) => {
    if (row.id === selected?.id) return;
    if (window.dispatchEvent(new Event('review:before-record', { cancelable: true }))) { setSelected(row); setNotice(''); setDeciding(false); }
  };
  // Arrow keys move through the queue without leaving it.
  const moveFocus = (event: KeyboardEvent<HTMLElement>) => {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('.rv-queue__item')];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index === -1) return;
    event.preventDefault();
    buttons[Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))]?.focus();
  };
  const statusLabel = (value: string) => config.queues.find(([key]) => key === value)?.[1] || value;
  const step = selected ? (deciding ? 2 : 1) : 0;

  return (
    <AppShell
      workspace="review"
      nav={reviewNav({ path, desk })}
      title={`${config.label} review`}
      trail={selected ? [title(selected)] : undefined}
      account={{ name: user?.displayName || user?.email || 'Validator', photo: user?.photoURL, role: 'Validator' }}
      onSignOut={() => void signOutUser()}
    >
      <div className={`ts-page rv${selected ? ' has-selection' : ''}`}>
        <PageHeader
          kicker="Validator portal"
          title={`${config.label} review`}
          description="Read the source, inspect the evidence, then record a decision. Every decision is kept with the record and sent to its contributor."
          actions={<Steps compact label="Review process" current={step} className="rv-steps" steps={[
            { title: 'Choose', icon: 'inbox' },
            { title: 'Inspect', icon: 'eye' },
            { title: 'Decide', icon: 'shield' },
          ]} />}
        />

        <div className="rv-queues">
          <div className="ts-chips ts-chips--scroll" role="group" aria-label="Queue status">
            {config.queues.map(([value, label]) => (
              <button key={value} type="button" className="ts-chip" aria-pressed={status === value} onClick={() => switchQueue(desk, value)}>
                <span className="ts-dot" style={{ ['--dot' as string]: `var(--${STATUS_TONE[value] === 'success' ? 'success-dot' : STATUS_TONE[value] === 'warning' ? 'warning-dot' : STATUS_TONE[value] === 'danger' ? 'danger-dot' : 'c-blue'})` }} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
          <div className="ts-toolbar">
            <label className="ts-search">
              <span className="sr-only">Search review queue</span>
              <Icon name="search" />
              <input type="search" value={needle} onChange={event => setNeedle(event.target.value)} placeholder="Search title, text or record ID" />
            </label>
            <label>
              <span className="sr-only">Filter category</span>
              <select className="ts-select ts-select--sm" value={category} onChange={event => setCategory(event.target.value)}>
                <option value="">All categories</option>
                {[...new Set(rows.map(kind))].map(value => <option key={value}>{value}</option>)}
              </select>
            </label>
            <span className="ts-toolbar__count" title="Up to 60 records per queue are loaded, oldest first.">{filtered.length} of {rows.length} loaded{rows.length >= 60 ? ' · first 60' : ''}</span>
          </div>
        </div>

        {notice ? <p role="status" className="ts-notice ts-notice--success"><Icon name="check-circle" className="ts-notice__icon" /><span>{notice}</span></p> : null}

        {loading ? (
          <div className="ts-panel"><div className="ts-skeleton" role="status" aria-label="Loading the queue"><span className="ts-skel ts-skel--title" /><span className="ts-skel ts-skel--line" /><span className="ts-skel ts-skel--line" style={{ width: '80%' }} /></div></div>
        ) : error ? (
          <div className="ts-panel" role="alert">
            <div className="ts-empty ts-empty--compact">
              <span className="ts-empty__icon ts-empty__icon--danger" aria-hidden="true"><Icon name="wifi-off" /></span>
              <p className="ts-empty__title">Could not load this queue</p>
              <p className="ts-empty__body">{error}</p>
              <div className="ts-empty__actions"><button type="button" className="ts-btn ts-btn--primary" onClick={() => setAttempt(n => n + 1)}><Icon name="refresh" />Try again</button></div>
            </div>
          </div>
        ) : !rows.length ? (
          <div className="ts-panel ts-panel--dashed">
            <div className="ts-empty ts-empty--compact">
              <span className="ts-empty__icon ts-empty__icon--success" aria-hidden="true"><Icon name="check" /></span>
              <p className="ts-empty__title">Nothing {statusLabel(status).toLowerCase()} here</p>
              <p className="ts-empty__body">This queue is clear. Choose another status above, or another desk in the sidebar.</p>
            </div>
          </div>
        ) : (
          <div className="rv-grid">
            <section aria-label="Records in this queue" className="rv-queue" onKeyDown={moveFocus}>
              {filtered.map(row => (
                <button key={row.id} type="button" className="rv-queue__item" aria-pressed={selected?.id === row.id} onClick={() => choose(row)}>
                  <span className="rv-queue__top">
                    <span className="rv-queue__kind">{kind(row)}</span>
                    <span className="rv-queue__age">{age(row)}</span>
                  </span>
                  <strong className="rv-queue__title">{title(row)}</strong>
                  <span className="rv-queue__meta">
                    <Badge tone={STATUS_TONE[row.status] ?? 'neutral'} dot>{statusLabel(row.status)}</Badge>
                    <code>{row.id.slice(0, 10)}</code>
                  </span>
                </button>
              ))}
              {!filtered.length ? <p className="ts-hint rv-queue__none">No matching records. Clear the search or category filter.</p> : null}
              <p className="ts-hint rv-queue__note"><Icon name="info" />Up to 60 records per queue, oldest first.</p>
            </section>
            {selected ? (
              <div className="rv-record-col">
                <button type="button" className="ts-btn ts-btn--ghost ts-btn--sm rv-back" onClick={() => { if (window.dispatchEvent(new Event('review:before-record', { cancelable: true }))) setSelected(null); }}><Icon name="back" />Back to the queue</button>
                {stale ? (
                  <div className="ts-notice ts-notice--warning rv-stale" role="alert">
                    <Icon name="alert" className="ts-notice__icon" />
                    <div className="ts-notice__body">
                      <strong className="ts-notice__title">This record changed while you were reviewing it</strong>
                      <p>Your notes are still below, but decisions are locked. Load the latest version before deciding.</p>
                    </div>
                    <div className="ts-notice__action">
                      <button type="button" className="ts-btn ts-btn--sm ts-btn--dark" disabled={!latest} onClick={() => { if (latest && window.dispatchEvent(new Event('review:before-record', { cancelable: true }))) setSelected({ ...latest }); }}>{latest ? 'Load latest version' : 'Record has left this queue'}</button>
                    </div>
                  </div>
                ) : null}
                <ReviewDetail key={selected.id + ':' + recordVersion(selected)} desk={desk} item={selected} stale={stale} statusLabel={statusLabel(selected.status)} onDeciding={setDeciding} onSaved={message => { setNotice(message); setSelected(null); setDeciding(false); }} />
              </div>
            ) : (
              <div className="ts-panel ts-panel--dashed rv-placeholder">
                <div className="ts-empty">
                  <span className="ts-empty__icon" aria-hidden="true"><Icon name="eye" /></span>
                  <p className="ts-empty__title">Select a record to review</p>
                  <p className="ts-empty__body">Its source material, recorded permissions, history and the decisions available in this status appear here. Use the arrow keys to move through the queue.</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function humanKey(key: string) {
  const spaced = key.replace(/([A-Z])/g, ' $1').replace(/[_-]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function Evidence({ label, value }: { label: string; value: unknown }) {
  if (value == null || value === '') return null;
  if (typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') return <Evidence label={label} value={value.toDate().toLocaleString()} />;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (!entries.length) return null;
    const allBooleans = entries.every(([, child]) => typeof child === 'boolean');
    return (
      <div className="rv-evidence">
        <span className="rv-evidence__label">{label}</span>
        {allBooleans ? (
          <div className="rv-flags">
            {entries.map(([key, child]) => (
              <span key={key} className={`rv-flag${child ? ' is-yes' : ''}`}><Icon name={child ? 'check' : 'close'} />{humanKey(key)}</span>
            ))}
          </div>
        ) : (
          <div className="rv-nested">{entries.map(([key, child]) => <Evidence key={key} label={Array.isArray(value) ? `Item ${Number(key) + 1}` : humanKey(key)} value={child} />)}</div>
        )}
      </div>
    );
  }
  return (
    <div className="rv-evidence">
      <span className="rv-evidence__label">{label}</span>
      <p className="rv-evidence__value">{typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}</p>
    </div>
  );
}

function Media({ path, type, alt }: { path: string; type: string; alt: string }) {
  const [url, setUrl] = useState(''), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  useEffect(() => { let active = true; setUrl(''); setError(''); void getDownloadURL(ref(storage, path)).then(value => { if (active) setUrl(value); }).catch(() => { if (active) setError('The attachment could not be loaded. Check it before approving.'); }); return () => { active = false; }; }, [path, attempt]);
  if (error) return <p role="alert" className="ts-notice ts-notice--danger"><Icon name="alert" className="ts-notice__icon" /><span>{error} <button type="button" className="ts-link" onClick={() => setAttempt(n => n + 1)}>Retry attachment</button></span></p>;
  if (!url) return <p role="status" className="ts-hint rv-media-loading"><span className="ts-spinner ts-spinner--sm" aria-hidden="true" />Loading attachment…</p>;
  if (type === 'audio') return <div className="rv-media rv-media--audio"><Icon name="audio" /><audio controls src={url} aria-label={alt} /></div>;
  if (type === 'video') return <div className="rv-media"><video controls playsInline src={url} aria-label={alt} /></div>;
  if (type === 'image') return <div className="rv-media"><img src={url} alt={alt} /></div>;
  return <a href={url} target="_blank" rel="noreferrer" className="ts-btn ts-btn--sm"><Icon name="external" />Open attachment</a>;
}

const CONSEQUENCES: Record<string, string> = {
  APPROVE: 'Records approval. Publication follows the established rules for this category.',
  REQUEST_REVISION: 'Returns this work to its contributor with your feedback for correction.',
  REJECT: 'Records rejection and sends your feedback to the contributor.',
  PUBLISH: 'Publishes this approved work to its permitted audience.',
  ESCALATE_CULTURAL: 'Moves this record to cultural review.',
  PAUSE: 'Pauses the running advert.',
  RESUME: 'Resumes this advert.',
  approve: 'Adds this name through the existing name review process.',
  reject: 'Rejects the name request with your reason.',
};

const DECISION_ICON: Record<string, IconName> = {
  APPROVE: 'check', PUBLISH: 'globe', REQUEST_REVISION: 'refresh', REJECT: 'x-circle', ESCALATE_CULTURAL: 'flag',
  PAUSE: 'pause', RESUME: 'play', approve: 'check', reject: 'x-circle',
};

const DECISION_TONE: Record<string, 'positive' | 'caution' | 'negative' | 'neutral'> = {
  APPROVE: 'positive', PUBLISH: 'positive', RESUME: 'positive', approve: 'positive',
  REQUEST_REVISION: 'caution', ESCALATE_CULTURAL: 'neutral', PAUSE: 'caution',
  REJECT: 'negative', reject: 'negative',
};

function Section({ title, icon, children }: { title: string; icon: IconName; children: ReactNode }) {
  return (
    <section className="rv-section">
      <h3 className="rv-section__title"><Icon name={icon} />{title}</h3>
      {children}
    </section>
  );
}

function ReviewDetail({ desk, item, stale, statusLabel, onSaved, onDeciding }: { desk: Desk; item: ReviewRecord; stale: boolean; statusLabel: string; onSaved: (message: string) => void; onDeciding: (deciding: boolean) => void }) {
  const [decision, setDecision] = useState(''), [feedback, setFeedback] = useState('');
  // Enable after the backend release for dictionary answer targets is verified.
  const answerTargetsAvailable = false;
  const [target, setTarget] = useState(answerTargetsAvailable ? item.moderation?.publishAs || 'headword' : 'headword'), [entryId, setEntryId] = useState(item.moderation?.linkedEntryId || '');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const protection = useDecisionProtection(Boolean(decision || feedback || entryId), busy);
  const sending = useRef(false);
  const actions = decisionsFor(desk, item);
  const dictionary = desk === 'contributions' && item.collectionKind?.toLowerCase() === 'dictionary';
  const attachment = desk === 'adverts' ? item.creative : item.media;
  const external = safeUrl(item.externalPostUrl || item.ctaUrl);
  const reasonRequired = ['REJECT', 'REQUEST_REVISION', 'reject'].includes(decision);
  const reasonShort = reasonRequired && feedback.trim().length < 5;
  useEffect(() => { onDeciding(Boolean(decision)); }, [decision]);

  return (
    <div className="rv-detail">
      <article className="ts-panel rv-record" aria-labelledby="rv-record-title">
        <header className="rv-record__head">
          <div className="ts-stack" style={{ ['--gap' as string]: '0.4rem' }}>
            <div className="ts-cluster">
              <Badge tone={STATUS_TONE[item.status] ?? 'neutral'} dot>{statusLabel}</Badge>
              <span className="ts-badge ts-badge--outline">{item.collectionKind || item.studioType || item.format || DESKS[desk].label}</span>
            </div>
            <h2 className="rv-record__title" id="rv-record-title">{item.title || item.name || item.headline || 'Submission'}</h2>
            <p className="rv-record__meta">
              <span>Record <code>{item.id}</code></span>
              <button type="button" className="ts-link" style={{ fontSize: 'var(--fs-xs)' }} onClick={() => { void navigator.clipboard?.writeText(item.id).then(() => setCopied(true)).catch(() => undefined); }}><Icon name="copy" />{copied ? 'Copied' : 'Copy ID'}</button>
              {item.lifecycle?.version || item.revision ? <span>Revision {item.lifecycle?.version || item.revision}</span> : null}
            </p>
          </div>
        </header>

        {item.expression ? (
          <>
            <div className="rv-compare">
              <div className="rv-compare__side"><span className="rv-compare__label"><Icon name="globe" />Original meaning / prompt</span><p>{item.expression.meaning || item.title}</p></div>
              <span className="rv-compare__arrow" aria-hidden="true"><Icon name="arrow" /></span>
              <div className="rv-compare__side rv-compare__side--answer"><span className="rv-compare__label"><Icon name="translation" />Submitted expression</span><p lang="xsm">{item.expression.phrase || item.body}</p></div>
            </div>
            <Evidence label="Use and context" value={item.expression.usageContext || item.usageContext || item.culturalContext} />
            <Evidence label="Source" value={item.expression.source?.detail || item.sourceReferences} />
            <details className="ts-disclosure"><summary><Icon name="doc" /><span>Expression details and recorded consent</span><Icon name="chevron" className="ts-disclosure__chev" /></summary><div className="ts-disclosure__body"><Evidence label="Complete expression record" value={item.expression} /></div></details>
          </>
        ) : (
          <Section title="Submitted material" icon="doc">
            {['body', 'translation', 'senses', 'forms', 'kasemExample', 'englishExample', 'wordQueuePrompt', 'sourceReferences', 'culturalContext', 'explanation', 'question', 'answer', 'wrongSpan', 'meaning', 'note', 'handle'].map(key => <Evidence key={key} label={({ body: 'Source material', sourceReferences: 'Source', kasemExample: 'Kasem example', englishExample: 'English example', wrongSpan: 'Reported error', wordQueuePrompt: 'Original prompt', senses: 'Meanings', forms: 'Word forms', culturalContext: 'Cultural context' } as Record<string, string>)[key] || humanKey(key)} value={item[key]} />)}
          </Section>
        )}

        <div className="rv-facts">
          <Evidence label="Format" value={item.format || item.studioType || item.collectionKind} />
          <Evidence label="Language / dialect" value={item.dialect || item.primaryLanguage} />
        </div>

        {attachment?.storagePath ? <Section title="Attachment" icon="image"><Media path={attachment.storagePath} type={attachment.mediaType} alt={item.title || item.name || 'Submitted attachment'} /></Section> : null}
        {external ? <p><a className="ts-btn ts-btn--sm" href={external} target="_blank" rel="noreferrer"><Icon name="external" />Open {desk === 'adverts' ? 'advert destination' : 'external post'}</a></p> : null}

        {desk === 'adverts' ? (
          <Section title="Campaign" icon="opportunities">
            <div className="rv-facts">
              <Evidence label="Headline" value={item.headline} /><Evidence label="Where it runs" value={item.placements} /><Evidence label="Regions" value={item.regions} />
              <Evidence label="Duration (days)" value={item.durationDays} /><Evidence label="Daily budget (GH₵)" value={(Number(item.dailyBudgetPesewas || 0) / 100).toFixed(2)} />
              <Evidence label="Total budget (GH₵)" value={(Number(item.totalBudgetPesewas || 0) / 100).toFixed(2)} /><Evidence label="Payment" value={item.payment?.status || 'unpaid'} /><Evidence label="Button label" value={item.ctaLabel} />
            </div>
          </Section>
        ) : null}

        {desk === 'contributions' ? (
          <Section title="Rights and permissions" icon="shield">
            <Evidence label="Permissions" value={item.permissions ? Object.fromEntries(Object.entries(item.permissions).filter(([,value]) => typeof value === 'boolean')) : 'Not recorded'} />
            <details className="ts-disclosure"><summary><Icon name="users" /><span>Rights, participants and consent record</span><Icon name="chevron" className="ts-disclosure__chev" /></summary><div className="ts-disclosure__body"><Evidence label="Complete permission record" value={item.permissions || 'Not recorded'} /><Evidence label="Participant consent" value={item.attestations || 'Not recorded'} /><Evidence label="Third-party material and minors" value={item.disclosures || 'Not recorded'} /></div></details>
            <Evidence label="Previous feedback" value={item.moderation?.feedback} />
          </Section>
        ) : null}

        {desk === 'sentences' ? (
          <Section title="Recorded permission" icon="shield">
            <Evidence label="Recorded permission" value={item.permissions || 'Not recorded'} />
            <Evidence label="Reviewers of this revision" value={item.reviewerIds?.length ?? 0} />
            <Evidence label="Review guidance" value="Legacy notes may need migration and permission before review. Independent reviewers determine confirmation." />
          </Section>
        ) : null}

        <details className="ts-disclosure"><summary><Icon name="info" /><span>Additional source information</span><Icon name="chevron" className="ts-disclosure__chev" /></summary><div className="ts-disclosure__body">{['description','translationNotes','ipa','kasemDefinition','etymology','alsoUsedAs','attribution'].map(key => <Evidence key={key} label={humanKey(key)} value={item[key]} />)}</div></details>
        <details className="ts-disclosure"><summary><Icon name="clock" /><span>Review history and metadata</span><Icon name="chevron" className="ts-disclosure__chev" /></summary><div className="ts-disclosure__body"><Evidence label="Previous review" value={item.reviewNote || item.reviewFeedback || item.previousReview} /><Evidence label="Moderation" value={item.moderation} /><Evidence label="Review history" value={item.reviews} /><Evidence label="Created" value={item.lifecycle?.createdAt || item.createdAt} /><Evidence label="Last updated" value={item.lifecycle?.updatedAt || item.updatedAt} /><Evidence label="Revision of" value={item.revisionOf} /></div></details>

        {desk === 'sentences' ? <SentenceReview item={item} stale={stale} onSaved={onSaved} /> : null}
      </article>

      {desk !== 'sentences' ? (
        <aside className="rv-decide" aria-label="Decision">
          {dictionary ? <EntryLookup initial={item.body || ''} selected={entryId} onSelect={setEntryId} /> : null}
          {actions.length ? (
            <form className="ts-panel rv-decide__form" onSubmit={async event => {
              event.preventDefault(); if (sending.current || stale) return; sending.current = true; setError(''); setBusy(true);
              try { const request = decisionRequest(desk, item, decision, feedback, target, entryId); await httpsCallable(functions, request.callable, { timeout: 120000 })(request.data); protection.current = { dirty: false, busy: false }; onSaved('Decision recorded. The queue has been updated.'); }
              catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save the decision.'); }
              finally { sending.current = false; setBusy(false); }
            }}>
              <div className="ts-panel__heading">
                <h2 className="ts-panel__title">Your decision</h2>
                <p className="ts-panel__desc">Choose one. The contributor sees your feedback.</p>
              </div>
              <fieldset className="rv-choices" disabled={busy || stale}>
                <legend className="sr-only">Decision</legend>
                {actions.map(value => (
                  <label key={value} className={`rv-choice rv-choice--${DECISION_TONE[value] ?? 'neutral'}`}>
                    <input type="radio" name="decision" value={value} required checked={decision === value} onChange={() => setDecision(value)} />
                    <span className="rv-choice__icon" aria-hidden="true"><Icon name={DECISION_ICON[value] ?? 'check'} /></span>
                    <span className="rv-choice__label">{desk === 'adverts' && value === 'APPROVE' ? 'Approve and run' : DECISION_LABELS[value]}</span>
                  </label>
                ))}
              </fieldset>
              {answerTargetsAvailable && dictionary && ['APPROVE', 'PUBLISH'].includes(decision) ? <><label className="ts-field"><span className="ts-label">Use this answer as</span><select className="ts-select" disabled={busy} value={target} onChange={event => setTarget(event.target.value)}>{Object.entries(TARGETS).map(([value, label]) => <option key={value} value={value} disabled={Boolean(targetProblem(value, item))}>{label}{targetProblem(value, item) ? ` — ${targetProblem(value, item)}` : ''}</option>)}</select></label>{['variant', 'example'].includes(target) ? <p className="ts-hint">Choose the existing word above that this {target === 'variant' ? 'variant' : 'example'} belongs to.</p> : null}</> : null}
              {decision ? <p className="ts-consequence" role="status"><Icon name="shield" /><span>{CONSEQUENCES[decision]}</span></p> : <p className="ts-hint">Each option says what it does once you choose it.</p>}
              <label className="ts-field">
                <span className="ts-label">Feedback to the contributor{reasonRequired ? <span className="ts-required" aria-hidden="true">*</span> : <span className="ts-optional">Optional</span>}</span>
                <textarea className="ts-textarea" maxLength={desk === 'adverts' ? 1000 : 2000} required={reasonRequired} minLength={reasonRequired ? 5 : undefined} disabled={busy || stale} value={feedback} onChange={event => setFeedback(event.target.value)} aria-invalid={reasonShort && feedback.length > 0 ? true : undefined} placeholder={reasonRequired ? 'Say what to change, or why it cannot be accepted.' : 'A note the contributor will see with the decision.'} />
                <small className={reasonShort && feedback.length > 0 ? 'ts-error' : undefined}>{reasonRequired ? (reasonShort ? 'A reason of at least 5 characters is required for this decision.' : 'Required for this decision.') : 'Shared with the contributor.'}</small>
              </label>
              {decision === 'PUBLISH' || (desk === 'adverts' && decision === 'APPROVE') ? <p className="ts-notice ts-notice--warning"><Icon name="globe" className="ts-notice__icon" /><span>This decision makes the work available to its audience.</span></p> : null}
              {error ? <p role="alert" className="ts-notice ts-notice--danger"><Icon name="alert" className="ts-notice__icon" /><span>{error}</span></p> : null}
              <button className="ts-btn ts-btn--primary ts-btn--lg ts-btn--block" disabled={busy || stale || !decision} aria-busy={busy || undefined}><span className="ts-btn__spinner" aria-hidden="true" /><span>{busy ? 'Saving…' : stale ? 'Load the latest version first' : 'Record decision'}</span></button>
            </form>
          ) : (
            <div className="ts-panel ts-panel--tint"><p className="ts-hint"><Icon name="lock" /> No review actions are available in this status.</p></div>
          )}
        </aside>
      ) : (
        <aside className="rv-decide" aria-label="Sentence review guidance">
          <div className="ts-panel ts-panel--tint">
            <p className="ts-overline">How sentence review works</p>
            <p style={{ fontSize: 'var(--fs-sm)' }}>Judge each version on meaning, grammar, naturalness and context fit. Use “Cannot judge” whenever you are unsure. Disagreements are preserved; confirmation depends on independent reviewers and recorded permission.</p>
          </div>
        </aside>
      )}
    </div>
  );
}

function EntryLookup({ initial, selected, onSelect }: { initial: string; selected: string; onSelect: (id: string) => void }) {
  const [spelling, setSpelling] = useState(initial), [matches, setMatches] = useState<PublishedHeadword[]>([]);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  return (
    <section className="ts-panel ts-panel--tight rv-lookup" aria-label="Dictionary check">
      <p className="ts-overline">Dictionary check</p>
      <label className="ts-field"><span className="ts-label">Check an existing spelling</span><input className="ts-input ts-input--sm" lang="xsm" value={spelling} onChange={event => setSpelling(event.target.value)} /></label>
      <button type="button" className="ts-btn ts-btn--sm" disabled={busy || !spelling.trim()} aria-busy={busy || undefined} onClick={async () => { setBusy(true); setError(''); try { setMatches(await fetchHeadwordMatches(spelling)); } catch { setError('Could not check the dictionary. Try again.'); } finally { setBusy(false); } }}><span className="ts-btn__spinner" aria-hidden="true" /><Icon name="search" />{busy ? 'Checking…' : 'Check dictionary'}</button>
      {error ? <p role="alert" className="ts-error"><Icon name="alert" />{error}</p> : null}
      <p className="ts-hint">A matching spelling may have another meaning. Compare it before choosing.</p>
      {matches.map(entry => <label className="ts-check ts-check--card" key={entry.id}><input type="radio" name="linked-entry" checked={selected === entry.id} onChange={() => onSelect(entry.id)} /><span className="ts-check__copy"><strong lang="xsm">{entry.kasemText}</strong><small>{entry.englishText} · {entry.partOfSpeech}</small></span></label>)}
      {selected ? <button type="button" className="ts-link" onClick={() => onSelect('')}><Icon name="close" />Clear linked word</button> : null}
    </section>
  );
}

function SentenceReview({ item, stale, onSaved }: { item: ReviewRecord; stale: boolean; onSaved: (message: string) => void }) {
  const examples: Record<string, any>[] = Array.isArray(item.examples) ? item.examples : [];
  const [judgments, setJudgments] = useState(() => examples.map(() => ({ meaning: 'cannot-judge', grammar: 'cannot-judge', naturalness: 'cannot-judge', contextFit: 'cannot-judge', annotationApproved: false, explanation: '' } as Record<string, any>)));
  const [competent, setCompetent] = useState(false), [preference, setPreference] = useState('cannot-judge');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const protection = useDecisionProtection(competent || preference !== 'cannot-judge' || judgments.some(row => Object.entries(row).some(([key,value]) => key === 'annotationApproved' ? value : key === 'explanation' ? Boolean(value) : value !== 'cannot-judge')), busy);
  const sending = useRef(false);
  const change = (index: number, key: string, value: unknown) => setJudgments(rows => rows.map((row, i) => i === index ? { ...row, [key]: value } : row));
  return (
    <form className="rv-sentences" onSubmit={async event => {
      event.preventDefault(); if (sending.current || stale) return; sending.current = true; setBusy(true); setError('');
      try { const result = await httpsCallable(functions, 'decideGrammarNote')({ noteId: item.id, revision: item.revision ?? 1, dialectCompetent: competent, preference, judgments }); protection.current = { dirty: false, busy: false }; onSaved(`Sentence review recorded: ${(result.data as { status?: string }).status || 'saved'}.`); }
      catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not record review.'); }
      finally { sending.current = false; setBusy(false); }
    }}>
      <h3 className="rv-section__title"><Icon name="scale" />Your sentence review</h3>
      <div className="rv-versions">
        {examples.map((example, index) => (
          <fieldset key={index} disabled={busy} className="rv-version">
            <legend>Version {index + 1}</legend>
            {['kasem', 'english', 'dialect', 'context', 'literal', 'note', 'source', 'annotations', 'permissions'].map(key => <Evidence key={key} label={humanKey(key)} value={example[key]} />)}
            {example.audioPath ? <SentenceAudio item={item} index={index} /> : null}
            <div className="rv-dimensions">
              {Object.entries(DIMENSIONS).map(([dimension, values]) => (
                <label key={dimension} className="ts-field"><span className="ts-label">{dimension === 'contextFit' ? 'Context fit' : humanKey(dimension)}</span><select className="ts-select ts-select--sm" value={judgments[index][dimension]} onChange={event => change(index, dimension, event.target.value)}>{Object.entries(values).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              ))}
            </div>
            <label className="ts-field"><span className="ts-label">Explain concerns or context differences</span><textarea className="ts-textarea" maxLength={2000} value={judgments[index].explanation} onChange={event => change(index, 'explanation', event.target.value)} /></label>
            <label className="ts-check"><input type="checkbox" checked={judgments[index].annotationApproved} onChange={event => change(index, 'annotationApproved', event.target.checked)} /><span className="ts-check__copy"><strong>I also confirm this example’s annotation and explanation</strong></span></label>
          </fieldset>
        ))}
      </div>
      <label className="ts-check ts-check--card ts-check--required"><input required type="checkbox" disabled={busy} checked={competent} onChange={event => setCompetent(event.target.checked)} /><span className="ts-check__copy"><strong>I can judge the dialect in these examples</strong><small>Required to record a sentence review.</small></span></label>
      {examples.length > 1 ? <label className="ts-field"><span className="ts-label">Comparison preference</span><select className="ts-select" disabled={busy} value={preference} onChange={event => setPreference(event.target.value)}>{[['cannot-judge', 'Cannot judge'], ['first', 'First version'], ['second', 'Second version'], ['tie', 'Both work'], ['context-dependent', 'Depends on context']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label> : null}
      <p className="ts-hint">Reviews preserve disagreements. Confirmation depends on independent reviewers and recorded permission.</p>
      {error ? <p role="alert" className="ts-notice ts-notice--danger">{error}</p> : null}
      <button className="ts-btn ts-btn--primary ts-btn--lg" disabled={busy || stale || !competent || !examples.length || ['withdrawn', 'needs-permission'].includes(item.status)} aria-busy={busy || undefined}><span className="ts-btn__spinner" aria-hidden="true" /><span>{busy ? 'Saving…' : 'Record sentence review'}</span></button>
    </form>
  );
}

function SentenceAudio({ item, index }: { item: ReviewRecord; index: number }) {
  const [url, setUrl] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return (
    <div className="rv-media rv-media--audio">
      <Icon name="audio" />
      {url ? <audio controls src={url} aria-label={`Speaker recording for version ${index + 1}`} /> : (
        <button type="button" className="ts-btn ts-btn--sm" disabled={busy} aria-busy={busy || undefined} onClick={async () => {
          setBusy(true); setError('');
          try { const result = await httpsCallable(functions, 'readGrammarAudio')({ noteId: item.id, revision: item.revision, example: index }); const data = result.data as { audio: string; contentType: string }; const bytes = Uint8Array.from(atob(data.audio), char => char.charCodeAt(0)); setUrl(URL.createObjectURL(new Blob([bytes], { type: data.contentType }))); }
          catch { setError('Could not play the private recording.'); } finally { setBusy(false); }
        }}><span className="ts-btn__spinner" aria-hidden="true" /><Icon name="play" />{busy ? 'Loading recording…' : 'Load speaker recording'}</button>
      )}
      {error ? <p role="alert" className="ts-error"><Icon name="alert" />{error}</p> : null}
    </div>
  );
}
