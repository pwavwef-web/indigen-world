import { useListMemory, useListScroll } from './listMemory';
import { ReviewTiming } from './ReviewTiming';
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { contributionState, itemStatus, STATUS_META, type Item, type Status } from './model';
import type { SaveAnswer } from './types';
import { Icon } from '../ui/icons';
import { KasemField } from '../spelling/KasemField';
import { DictionaryRecommendations, DictionaryReview } from '../spelling/DictionaryAssistance';
import { EMPTY_DETAILS, parseContributorDetails, detailsContext, type ContributorDetails } from '@indigen-world/contracts/contributor-details';
import { duplicateHints } from './journeyModel';
import { MilestoneBurst, useJourney } from './Journey';
import { motionAllowed } from '../ui/motion';

/**
 * The translation workspace: the expression list and the editor.
 *
 * The editor's save, autosave, recovery, conflict and review-before-submit
 * behaviour is the one released in September 2026 and covered by
 * scripts/workflows.test.mjs; the rebuild moved it here and added three
 * things around it without changing how it saves:
 *   - an optional usage note (who says it, to whom, when), saved with the
 *     draft and shown to reviewers first;
 *   - links from each field to the matching Platform guide section;
 *   - an inline Kawuri check and "Report a problem", injected by the page so
 *     this module stays free of routing and network code beyond saving.
 *
 * Its controls are plain elements with design-system classes rather than kit
 * components, so the workflow tests can drive them directly.
 */

const save = httpsCallable<Record<string, unknown>, { revision: number; submissionId?: string }>(functions, 'saveExpressionAnswer');

export interface EditorExtras {
  checkDuplicates?: (phrase: string) => Promise<{ matches: { phrase: string; meaning: string; variety: string }[] }>;
  initialStep?: string;
  variety?: string;
  previousTranslation?: (itemId: string) => string | undefined;
  duplicateItems?: Item[];
  /** Builds a Platform guide link for a section id. */
  guideHref?: (section: string) => string;
  /** In-app navigation for guide links; a plain link is used without it. */
  onNavigate?: (to: string) => void;
  /** Renders the Kawuri draft check for the open expression's current, unsaved text. */
  renderKawuri?: (itemId: string, draft: { translation: string; alternatives: string[]; context: string }, close: () => void) => ReactNode;
  /** Renders "Report a problem" with the open expression attached. */
  renderReport?: (itemId: string) => ReactNode;
}

interface LocalDraft {
  translation: string;
  alternatives: string;
  context: string;
  revision: number;
  details: ContributorDetails;
}

export function readLocalDraft(key: string): LocalDraft | null {
  if (!key) return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? 'null');
    if (!value || typeof value.translation !== 'string' || value.translation.length > 2000
      || typeof value.alternatives !== 'string' || value.alternatives.length > 3500
      || !Number.isInteger(value.revision)) return null;
    // Copies made before the usage note existed have no `context`.
    if (value.context !== undefined && (typeof value.context !== 'string' || value.context.length > 1000)) return null;
    return { translation: value.translation, alternatives: value.alternatives, context: value.context ?? '', revision: value.revision,
      details: value.details ? parseContributorDetails(value.details) : { ...EMPTY_DETAILS, alternativeNotes: [] } };
  } catch {
    return null;
  }
}

function statusSlug(status: Status) {
  return status.toLocaleLowerCase().replace(/[^a-z]+/g, '-').replace(/(^-|-$)/g, '');
}

const DOT: Record<string, string> = {
  approved: 'var(--success-dot)', awaiting_review: 'var(--c-blue)', returned: 'var(--warning-dot)',
  draft: 'var(--c-blue-soft)', unsure: '#a78bfa', not_started: 'var(--border-strong)', archived: '#94a3b8',
};

function GuideHint({ section, children, extras }: { section: string; children: ReactNode; extras: EditorExtras }) {
  const href = extras.guideHref ? extras.guideHref(section) : `/contributor/guide?section=${section}`;
  return (
    <a
      className="ts-link cw-guide-hint"
      href={href}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        if (!extras.onNavigate || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        extras.onNavigate(href);
      }}
    >
      {children}
    </a>
  );
}

const FILTERS = ['All', 'Not started', 'Drafts', 'Submitted', 'Needs revision', 'I’m not sure'] as const;

export function ContributionWorkspace({ items, work, onPending, accountId, saveAnswer = save, initialItem, onSelectItem, onEditingChange, extras = {} }: {
  items: Item[];
  work: string;
  accountId?: string;
  onPending: (pending: boolean) => void;
  saveAnswer?: SaveAnswer;
  initialItem?: string;
  onSelectItem?: (itemId: string) => void;
  /** Told when the phone layout switches between the list and the editor. */
  onEditingChange?: (editing: boolean) => void;
  extras?: EditorExtras;
}) {
  const positionKey = accountId ? `contributor-position:${accountId}:${work}` : '';
  const [selected, setSelected] = useState(() => {
    if (initialItem && items.some((item) => item.id === initialItem)) return initialItem;
    try { return positionKey ? window.localStorage.getItem(positionKey) ?? '' : ''; } catch { return ''; }
  });
  useEffect(() => {
    if (positionKey && selected) {
      try { window.localStorage.setItem(positionKey, selected); } catch { /* Position memory is optional. */ }
    }
  }, [positionKey, selected]);
  const [filter, setFilter] = useListMemory<(typeof FILTERS)[number]>(`${positionKey}:filter`, 'All', FILTERS);
  const [query, setQuery] = useListMemory<string>(`${positionKey}:query`, '');
  const [pending, setPending] = useState(false);
  const [mobileEditor, setMobileEditor] = useState(Boolean(initialItem));
  const [confirmation, setConfirmation] = useState('');
  const journey = useJourney();
  const [sessionDone, setSessionDone] = useState<string[]>([]);
  const [paused, setPaused] = useState(false);
  useListScroll(`${positionKey}:scroll:${filter}:${query}`, items.length>0, !mobileEditor);
  useListScroll(`${positionKey}:inner-scroll:${filter}:${query}`, items.length>0, !mobileEditor, '.cw-list__items');
  useEffect(() => {
    onEditingChange?.(mobileEditor);
    return () => onEditingChange?.(false);
  }, [mobileEditor]);

  const visible = items.filter((item) => (filter === 'All' || contributionState(item) === filter)
    && [item.expression, item.translation, ...item.alternatives].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const item = items.find((candidate) => candidate.id === selected) ?? visible[0];
  const currentIndex = item ? items.findIndex((candidate) => candidate.id === item.id) : -1;
  const hasNextIncomplete = items.some((candidate, index) => index !== currentIndex && contributionState(candidate) !== 'Submitted');
  const choose = (id: string) => {
    if (paused) { setPaused(false); setSessionDone([]); }
    setSelected(id);
    setMobileEditor(true);
    onSelectItem?.(id);
  };
  const counts = Object.fromEntries(FILTERS.map((label) => [label, label === 'All' ? items.length : items.filter((candidate) => contributionState(candidate) === label).length]));
  const nextSession = items.find(candidate => !sessionDone.includes(candidate.id) && ['Not started', 'Drafts', 'Needs revision'].includes(contributionState(candidate)));

  if (!items.length) {
    return (
      <div className="ts-empty ts-empty--boxed">
        <span className="ts-empty__icon" aria-hidden="true"><Icon name="inbox" /></span>
        <p className="ts-empty__title">No expressions in this assignment</p>
        <p className="ts-empty__body">The team has not added expressions yet. Check back later, or report a problem if you expected some.</p>
      </div>
    );
  }
  return (
    <>
      <div className="cq-session-bar"><span className="cq-eyebrow"><Icon name="target" />Your small session</span><span>{sessionDone.length} / {journey.value.sessionSize} sent for review</span><label className="cq-small">Session size <select aria-label="Session size" value={journey.value.sessionSize} disabled={pending || journey.loading || journey.saving || Boolean(journey.error) || sessionDone.length > 0} onChange={event => void journey.save({ sessionSize: Number(event.target.value) })}><option value={3}>3 expressions</option><option value={5}>5 expressions</option></select></label></div>
      {confirmation ? <p className="ts-notice ts-notice--success cw-confirmation cq-confirmation" role="status"><MilestoneBurst active={journey.value.celebrations && motionAllowed()} /><Icon name="check-circle" className="ts-notice__icon" /><span>{confirmation}</span></p> : null}
      {paused ? <section className="cq-session-complete" aria-label="Session complete"><span className="cq-session-medal"><Icon name="check" /></span><div><h2>A thoughtful session, complete.</h2><p>{sessionDone.length} expressions sent for review. {nextSession ? 'Take a break or begin another small session.' : 'Your remaining work is submitted or flagged unsure.'}</p></div><button type="button" className="ts-btn ts-btn--primary" disabled={!nextSession} onClick={() => { if (nextSession) choose(nextSession.id); }}>Start another session<Icon name="arrow" /></button></section> : null}
      <div className={'contributor-workspace' + (mobileEditor ? ' is-editing' : '')}>
        <section className="cw-list" aria-label="Expressions in this assignment">
          <div className="cw-list__tools">
            <label className="ts-search">
              <span className="sr-only">Search expressions</span>
              <Icon name="search" />
              <input type="search" value={query} disabled={pending} onChange={(event) => { setQuery(event.target.value); setSelected(''); }} placeholder="Search expressions and translations" />
            </label>
            <div className="ts-chips ts-chips--scroll" role="group" aria-label="Filter expressions">
              {FILTERS.map((label) => (
                <button key={label} type="button" className="ts-chip" disabled={pending} aria-pressed={filter === label} onClick={() => { setFilter(label); setSelected(''); }}>
                  {label === 'I’m not sure' ? 'Unsure' : label}<span className="ts-count">{counts[label]}</span>
                </button>
              ))}
            </div>
          </div>
          <ul className="cw-list__items">
            {visible.map((candidate, index) => {
              const status = itemStatus(candidate);
              const recovery = accountId ? readLocalDraft(`contributor-draft:${accountId}:${work}:${candidate.id}`) : null;
              return (
                <li key={candidate.id}>
                  <button type="button" className={`cw-list__item state-${statusSlug(contributionState(candidate))}`} disabled={pending} aria-current={item?.id === candidate.id ? 'true' : undefined} onClick={() => choose(candidate.id)}>
                    <span className="cw-list__number" aria-hidden="true">{items.indexOf(candidate) + 1 || index + 1}</span>
                    <span className="cw-list__copy">
                      <strong>{candidate.expression}</strong>
                      <small>
                        <span className="ts-dot" style={{ ['--dot' as string]: DOT[status] ?? 'var(--text-4)' }} aria-hidden="true" />
                        {STATUS_META[status].label}{recovery ? ' · Unsaved copy on this device' : ''}
                      </small>
                    </span>
                    <Icon name="chevron" className="cw-list__go" />
                  </button>
                </li>
              );
            })}
          </ul>
          {!visible.length ? <p className="ts-muted cw-list__none">No expressions match. Try another search or filter.</p> : null}
        </section>
        <div className="cw-editor-pane">
          <button type="button" className="ts-btn ts-btn--ghost ts-btn--sm cw-back" disabled={pending} onClick={() => setMobileEditor(false)}><Icon name="back" />All expressions</button>
          {item && !paused ? (
            <ExpressionEditor
              accountId={accountId}
              key={item.id}
              item={item}
              itemNumber={currentIndex + 1}
              itemTotal={items.length}
              hasNextIncomplete={hasNextIncomplete}
              work={work}
              saveAnswer={saveAnswer}
              extras={{ ...extras, duplicateItems: items }}
              onPending={(value) => { setPending(value); onPending(value); if (value) setSelected(item.id); }}
              onSkipped={() => {
                const index = items.findIndex((candidate) => candidate.id === item.id);
                const remaining = [...items.slice(index + 1), ...items.slice(0, index)].find((candidate) => contributionState(candidate) === 'Not started');
                setConfirmation(`“${item.expression}” was flagged as unsure. Nothing was sent for review.${!remaining ? ' No untouched expressions remain; flagged ones are under the Unsure filter.' : ''}`);
                if (remaining) { setFilter('All'); setQuery(''); choose(remaining.id); } else setMobileEditor(false);
              }}
              onSubmitted={(next) => {
                const index = items.findIndex((candidate) => candidate.id === item.id);
                const remaining = [...items.slice(index + 1), ...items.slice(0, index)].find((candidate) => !sessionDone.includes(candidate.id) && ['Not started', 'Drafts', 'Needs revision'].includes(contributionState(candidate)));
                const completed = [...new Set([...sessionDone, item.id])];
                setSessionDone(completed);
                const sessionComplete = completed.length >= journey.value.sessionSize;
                if (sessionComplete) { setPaused(true); setMobileEditor(false); if (remaining) setSelected(remaining.id); }
                setConfirmation(`“${item.expression}” was sent to the Review Desk.${next && !remaining ? ' No untouched expressions remain. Check Drafts for unfinished work.' : ''}`);
                if (next && remaining && !sessionComplete) { setFilter('All'); setQuery(''); choose(remaining.id); }
              }}
            />
          ) : !paused ? <p className="ts-muted">Choose an expression to begin.</p> : null}
          {/* Outside the editor's form: the report dialog has a form of its own. */}
          {item && extras.renderReport ? <div className="cw-editor__footer">{extras.renderReport(item.id)}</div> : null}
        </div>
      </div>
    </>
  );
}

const KASEM_CHARACTERS = Array.from('ɛƐŋŊɔƆáéóè');

export function ExpressionEditor({ item, itemNumber = 1, itemTotal = 1, hasNextIncomplete = false, work, onPending, onSubmitted, onSkipped, accountId, saveAnswer = save, extras = {} }: {
  item: Item;
  itemNumber?: number;
  itemTotal?: number;
  hasNextIncomplete?: boolean;
  work: string;
  accountId?: string;
  onPending: (pending: boolean) => void;
  onSubmitted?: (next: boolean) => void;
  onSkipped?: () => void;
  saveAnswer?: SaveAnswer;
  extras?: EditorExtras;
}) {
  const [translation, setTranslation] = useState(item.translation);
  const translationField = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [alternatives, setAlternatives] = useState(item.alternatives.join('\n'));
  const [context, setContext] = useState(item.context ?? '');
  const [details, setDetails] = useState<ContributorDetails>(() => ({ ...EMPTY_DETAILS, variety: extras.variety ?? '', ...item.details, alternativeNotes: item.details?.alternativeNotes ?? [] }));
  const steps = ['understand', 'translate', 'context', 'check'];
  const [step, setStep] = useState(() => steps.includes(extras.initialStep ?? '') ? steps.indexOf(extras.initialStep!) : item.submissionId && !['rejected', 'needs_revision'].includes(item.status) ? 3 : item.translation.trim() ? 1 : 0);
  const panelHeading = useRef<HTMLHeadingElement>(null);
  const moveStep = (next: number) => { setStep(next); if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(() => panelHeading.current?.focus({ preventScroll: true })); };
  const [alternativeCount, setAlternativeCount] = useState(item.alternatives.length);
  const [publication, setPublication] = useState(false);
  const [status, setStatus] = useState('Saved');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [kawuriOpen, setKawuriOpen] = useState(false);
  const [publishedMatches, setPublishedMatches] = useState<{ phrase: string; meaning: string; variety: string }[] | null>(null);
  const [duplicateBusy, setDuplicateBusy] = useState(false), [duplicateError, setDuplicateError] = useState('');
  const duplicateRequest = useRef(0);
  useEffect(() => { duplicateRequest.current++; setPublishedMatches(null); setDuplicateError(''); setDuplicateBusy(false); }, [translation]);
  const checkPublished = async () => {
    if (!extras.checkDuplicates || !translation.trim()) return;
    const request = ++duplicateRequest.current;
    setDuplicateBusy(true); setDuplicateError('');
    try { const result = await extras.checkDuplicates(translation); if (request === duplicateRequest.current) setPublishedMatches(result.matches); }
    catch { if (request === duplicateRequest.current) setDuplicateError('Published expressions could not be checked. You can still send this for human review.'); }
    finally { if (request === duplicateRequest.current) setDuplicateBusy(false); }
  };
  const revision = useRef(item.revision), chain = useRef(Promise.resolve()), dirty = useRef(false), blocked = useRef(false);
  const payload = useRef({ translation, alternatives, context, details });
  payload.current = { translation, alternatives, context, details };
  const submitting = useRef(false);
  const activeField = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const [sent, setSent] = useState(false);
  const reviewDialog = useRef<HTMLDialogElement>(null);
  const reviewNext = useRef(false);
  const revising = ['rejected', 'needs_revision'].includes(item.status);
  useEffect(() => { if (['rejected', 'needs_revision'].includes(item.status)) setSent(false); }, [item.status]);
  const locked = (Boolean(item.submissionId) && !revising) || sent;
  const storageKey = accountId ? `contributor-draft:${accountId}:${work}:${item.id}` : '';
  const [recovery, setRecovery] = useState(() => readLocalDraft(storageKey));
  const [storageError, setStorageError] = useState('');
  const keepLocal = (answer: { translation: string; alternatives: string; context: string; details: ContributorDetails }) => {
    if (!storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ ...answer, revision: revision.current }));
      setStorageError('');
    } catch {
      setStorageError('This browser cannot keep a recovery copy. Keep this page open until “Saved” appears.');
    }
  };
  const changeAnswer = (field: 'translation' | 'alternatives' | 'context', value: string) => {
    payload.current = { ...payload.current, [field]: value };
    keepLocal(payload.current);
    dirty.current = true;
    onPending(true);
    setStatus(blocked.current ? 'Couldn’t save' : 'Saving…');
    if (field === 'translation') setTranslation(value);
    else if (field === 'alternatives') setAlternatives(value);
    else setContext(value);
  };
  const changeDetails = (patch: Partial<ContributorDetails>) => {
    const next = { ...payload.current.details, ...patch };
    payload.current = { ...payload.current, details: next };
    keepLocal(payload.current); dirty.current = true; onPending(true);
    setStatus(blocked.current ? 'Couldn’t save' : 'Saving…'); setDetails(next);
  };
  const persist = (submit = false, skip = false) => {
    const answer = { ...payload.current };
    chain.current = chain.current.then(async () => {
      if (blocked.current) throw new Error('Reload to recover this draft before continuing.');
      const result = await saveAnswer({
        work, item: item.id, revision: revision.current, translation: answer.translation,
        alternatives: answer.alternatives.split('\n').filter((value) => value.trim()), context: answer.context,
        details: { ...answer.details, alternativeNotes: answer.alternatives.split('\n').flatMap((value, index) => value.trim() ? [answer.details.alternativeNotes[index] ?? ''] : []) },
        submit, skip, publicationPermission: publication,
      });
      revision.current = result.data.revision;
      if (payload.current.translation === answer.translation && payload.current.alternatives === answer.alternatives
        && payload.current.context === answer.context && JSON.stringify(payload.current.details) === JSON.stringify(answer.details)) dirty.current = false;
      if (dirty.current) keepLocal(payload.current);
      else { try { if (storageKey) window.localStorage.removeItem(storageKey); } catch { /* Keep the acknowledged server copy. */ } }
      onPending(dirty.current || submitting.current);
      setStatus(submit ? 'Sent to the Review Desk' : skip ? 'Flagged as unsure — not submitted' : dirty.current ? 'Saving…' : 'Saved');
    }).catch((reason) => {
      blocked.current = true;
      setError(reason instanceof Error ? reason.message : 'Saving failed.');
      setStatus('Couldn’t save');
      throw reason;
    });
    return chain.current;
  };
  useEffect(() => {
    if (!dirty.current || locked || busy || recovery || blocked.current) return;
    setStatus('Saving…');
    const timer = window.setTimeout(() => { void persist().catch(() => undefined); }, 700);
    return () => window.clearTimeout(timer);
  }, [translation, alternatives, context, details, locked, busy, recovery]);
  useEffect(() => {
    const guard = (event: Event) => {
      if (dirty.current) {
        event.preventDefault();
        if (event instanceof BeforeUnloadEvent) event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', guard);
    window.addEventListener('studio:before-navigate', guard);
    return () => {
      window.removeEventListener('beforeunload', guard);
      window.removeEventListener('studio:before-navigate', guard);
      // Changes are copied to browser storage synchronously while typing.
    };
  }, []);
  const savedAlternatives = alternatives ? alternatives.split('\n') : [];
  const alternativeValues = Array.from({ length: Math.max(alternativeCount, savedAlternatives.length) }, (_, index) => savedAlternatives[index] ?? '');
  const updateAlternative = (index: number, value: string) => {
    const next = [...alternativeValues];
    next[index] = value.replace(/\n/g, ' ');
    setAlternativeCount(next.length);
    changeAnswer('alternatives', next.join('\n'));
  };
  const removeAlternative = (index: number) => {
    const next = alternativeValues.filter((_, current) => current !== index);
    setAlternativeCount(next.length);
    changeAnswer('alternatives', next.join('\n'));
    changeDetails({ alternativeNotes: details.alternativeNotes.filter((_, current) => current !== index) });
  };
  const cannotSubmit = !translation.trim() ? 'Enter a Kasem translation to submit.'
    : detailsContext(details, context).length > 1500 ? 'Shorten the combined usage note and setting to 1,500 characters.'
    : !publication ? 'Tick the required sharing permission to submit.'
      : blocked.current ? 'Retry saving your draft before submitting.' : '';
  const submitHelp = recovery ? 'Restore or discard the recovered draft before submitting.'
    : cannotSubmit || 'Ready to send. You can review your answer before confirming.';
  const sendReviewedAnswer = async () => {
    if (locked || recovery || blocked.current || cannotSubmit || busy || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    onPending(true);
    try {
      await persist(true);
      setSent(true);
      reviewDialog.current?.close();
      onSubmitted?.(reviewNext.current);
    } catch {
      reviewDialog.current?.close();
    } finally {
      submitting.current = false;
      setBusy(false);
      onPending(dirty.current);
    }
  };
  const retrySave = () => {
    blocked.current = false;
    chain.current = Promise.resolve();
    setError('');
    setStatus('Saving…');
    void persist().catch(() => undefined);
  };
  const state = contributionState(item);
  const detailed = itemStatus(item);
  const listedAlternatives = savedAlternatives.filter((value) => value.trim());
  const duplicates = duplicateHints(translation, extras.duplicateItems ?? [], item.id);
  const previousTranslation = extras.previousTranslation?.(item.id);
  const stepTitles = ['Understand the expression', 'Write natural Kasem', 'Give it a setting', 'Check & send for review'];
  const checklist = [
    { title: 'A Kasem translation is present', done: Boolean(translation.trim()), required: true, target: 1 },
    { title: 'Draft is saved safely', done: !dirty.current && !blocked.current && !recovery, required: true, target: 1 },
    { title: 'Usage context helps the reviewer', done: Boolean(context.trim() || details.situation.trim()), required: false, target: 2 },
    { title: 'Language variety is recorded', done: Boolean(details.variety.trim()), required: false, target: 0 },
    { title: 'Sharing permission is confirmed', done: publication || locked, required: true, target: 3 },
  ];
  const saveTone = status === 'Couldn’t save' ? ' is-error' : status === 'Saving…' ? ' is-saving' : '';
  const chipTone = STATUS_META[detailed].tone;
  return (
    <form className="contributor-editor cq-editor" noValidate onInvalid={(event) => {
      event.currentTarget.querySelector<HTMLElement>(':invalid')?.scrollIntoView({ block: 'center' });
    }} onSubmit={(event) => {
      event.preventDefault();
      if (locked || recovery || blocked.current || busy || submitting.current) return;
      if (cannotSubmit) { moveStep(!translation.trim() ? 1 : detailsContext(details, context).length > 1500 ? 2 : 3); return; }
      reviewNext.current = (event.nativeEvent as SubmitEvent | undefined)?.submitter?.getAttribute('value') === 'next';
      reviewDialog.current?.showModal();
    }}>
      <dialog ref={reviewDialog} className="ts-dialog contributor-review-dialog" aria-labelledby="review-answer-title" onCancel={(event) => { if (busy) event.preventDefault(); }}>
        <div className="ts-dialog__head">
          <div>
            <h2 className="ts-dialog__title" id="review-answer-title">Review your submission</h2>
            <p className="ts-dialog__lede">Once confirmed, this expression is locked until a reviewer decides.</p>
          </div>
        </div>
        <div className="ts-dialog__body">
          <dl className="ts-kv">
            <div><dt>English expression</dt><dd>{item.expression}</dd></div>
            <div><dt>Kasem translation</dt><dd className="review-answer-text" lang="xsm">{translation}</dd></div>
            <div><dt>Alternatives</dt><dd>{listedAlternatives.length ? <ul className="cw-review-alts">{listedAlternatives.map((value, index) => <li key={index} lang="xsm">{value}</li>)}</ul> : 'None added.'}</dd></div>
            <div><dt>Usage note</dt><dd>{context.trim() || 'None added.'}</dd></div>
            <div><dt>Language variety</dt><dd>{details.variety || 'Not recorded'}</dd></div>
            <div><dt>Speaker and setting</dt><dd>{detailsContext(details) || 'None added.'}</dd></div>
            <div><dt>Sharing permission</dt><dd>{publication ? 'Granted' : 'Not granted'}</dd></div>
            <div><dt>Model training and evaluation</dt><dd>Included under your contributor agreement</dd></div>
          </dl>
          <DictionaryReview value={translation} />
          <p className="ts-consequence cw-review-next"><Icon name="send" /><span>Next: a reviewer reads it and approves it or returns it with feedback. You will see the decision on this expression and in Activity.</span></p>
        </div>
        <div className="ts-dialog__foot contributor-review-actions">
          <button type="button" className="ts-btn ts-btn--ghost" autoFocus disabled={busy} onClick={() => reviewDialog.current?.close()}>Back to editing</button>
          <button type="button" className="ts-btn ts-btn--primary contributor-submit-cta" disabled={busy || Boolean(cannotSubmit)} onClick={() => void sendReviewedAnswer()}>{busy ? 'Submitting…' : 'Confirm submission'}</button>
        </div>
      </dialog>

      <header className="cw-editor__head">
        <div className="cw-editor__heading">
          <p className="ts-kicker">Expression {itemNumber} of {itemTotal}</p>
          <h2 className="cw-editor__expression">{item.expression}</h2>
        </div>
        <span className={`ts-badge ts-badge--${chipTone === 'neutral' ? 'neutral' : chipTone} status-badge state-${statusSlug(state)}`}><span className="ts-badge__dot" aria-hidden="true" /><span>{STATUS_META[detailed].label}</span></span>
      </header>

      <DictionaryRecommendations source={item.expression} disabled={locked || busy || Boolean(recovery)} onInsert={word => {
        const input = translationField.current;
        if (!input || input.disabled || input.readOnly) return;
        const start = input.selectionStart ?? input.value.length, end = input.selectionEnd ?? start;
        const before = input.value.slice(0, start), after = input.value.slice(end);
        const inserted = (/\p{L}|\p{M}/u.test(before.slice(-1)) ? ' ' : '') + word + (/^[\p{L}\p{M}]/u.test(after) ? ' ' : '');
        if (input.value.length - (end - start) + inserted.length > input.maxLength) return;
        moveStep(1);
        window.requestAnimationFrame(() => {
          if (input.value !== translation) return;
          input.scrollIntoView({ block: 'center', behavior: 'instant' });
          input.focus({ preventScroll: true }); input.setSelectionRange(start, end);
          if (!document.execCommand('insertText', false, inserted)) setError(`Your browser could not insert while preserving undo. Paste “${word}” at the selected cursor position.`);
        });
      }} />

      <ReviewTiming item={item} />
      {item.feedback ? (
        <section className="cw-feedback" aria-label="Reviewer feedback">
          <span className="cw-feedback__icon" aria-hidden="true"><Icon name="message" /></span>
          <div>
            <strong>Reviewer feedback</strong>
            <p>{item.feedback}</p>
            {revising && previousTranslation ? <details className="cq-previous"><summary>Your previously submitted version</summary><p lang="xsm">{previousTranslation}</p></details> : null}
            {revising ? <small>Revise your translation below, then resubmit it. Your earlier version and this decision stay on record. <GuideHint section="review" extras={extras}>How revisions work</GuideHint></small> : null}
          </div>
        </section>
      ) : null}

      {recovery ? (
        <section className="cw-feedback cw-feedback--recovery" aria-label="Unsaved draft">
          <span className="cw-feedback__icon" aria-hidden="true"><Icon name="refresh" /></span>
          <div>
            <strong>Unsaved draft found on this device</strong>
            <p>{recovery.revision !== item.revision ? 'The saved version has changed since this copy was made. Compare both before restoring.' : 'Your previous edits can be recovered.'}</p>
            <pre className="contributor-recovery-text" lang="xsm">{recovery.translation}{recovery.alternatives ? `\nAlternatives:\n${recovery.alternatives}` : ''}{recovery.context ? `\nUsage note:\n${recovery.context}` : ''}</pre>
            <div className="ts-cluster">
              {!locked ? <button type="button" className="ts-btn ts-btn--primary ts-btn--sm" onClick={() => {
                revision.current = item.revision;
                changeAnswer('translation', recovery.translation);
                changeAnswer('alternatives', recovery.alternatives);
                changeAnswer('context', recovery.context);
                changeDetails(recovery.details);
                setRecovery(null);
              }}>Restore draft</button> : null}
              <button type="button" className="ts-btn ts-btn--ghost ts-btn--sm" onClick={() => { try { window.localStorage.removeItem(storageKey); } catch { /* Storage may be unavailable. */ } setRecovery(null); }}>Discard recovery copy</button>
            </div>
          </div>
        </section>
      ) : null}
      {storageError ? <p role="alert" className="ts-notice ts-notice--warning">{storageError}</p> : null}

      <div className="editor-save-state cw-savebar">
        <span className={`ts-save${saveTone}`}>
          <span className="ts-save__mark" aria-hidden="true"><Icon name={status === 'Couldn’t save' ? 'alert' : locked ? 'lock' : 'check'} /></span>
          <span role="status" aria-live="polite">{locked ? (item.status === 'verified' ? 'Approved — locked' : 'Submitted — locked while under review') : status}</span>
        </span>
        <span className="cw-savebar__actions">
          {!locked ? <button type="button" className="ts-btn ts-btn--ghost ts-btn--sm" disabled={busy || Boolean(recovery) || blocked.current || !dirty.current} onClick={() => void persist().catch(() => undefined)}>Save draft</button> : null}
          {error && !locked ? <button type="button" className="ts-btn ts-btn--sm" disabled={busy} onClick={retrySave}>Retry save now</button> : null}
          {extras.renderKawuri && !locked ? (
            <button type="button" className="ts-btn ts-btn--soft ts-btn--sm cw-kawuri-toggle" aria-expanded={kawuriOpen} onClick={() => { moveStep(3); setKawuriOpen((open) => !open); }}>
              <Icon name="kawuri" />
              {kawuriOpen ? 'Hide Kawuri check' : 'Check with Kawuri'}
            </button>
          ) : null}
        </span>
      </div>

      <div className="cq-editor-nav"><span className="cq-sticky-source">{item.expression}</span><nav className="cq-stepper" aria-label="Contribution sections" style={{ ['--step' as string]: step }}>
        {['Understand', 'Translate', 'Context', 'Check & send'].map((label, index) => <button key={label} type="button" aria-current={step === index ? 'step' : undefined} aria-controls={`contribution-section-${index}`} onClick={() => moveStep(index)}><span>{(index === 1 && translation.trim()) || (index === 2 && (context.trim() || details.situation.trim())) || (index === 3 && locked) ? <Icon name="check" /> : index + 1}</span><strong>{label}</strong><small>{index === 2 ? 'Optional details' : index === step ? 'You are here' : index === 1 && translation.trim() ? 'Translation added' : 'Open section'}</small></button>)}
      </nav></div>
      <div className="cq-section-heading"><span className="cq-eyebrow">Section {step + 1} of 4</span><h3 tabIndex={-1} ref={panelHeading}>{stepTitles[step]}</h3><p>{['Picture a real conversation before you begin.', 'Use the way you would say it in everyday life.', 'A little context can make the meaning much clearer.', 'Check your own answer. Reviewers confirm its accuracy.'][step]}</p></div>
      <section id="contribution-section-0" className="cq-step-panel" hidden={step !== 0} aria-label="Understand">
        <blockquote className="cq-source"><span className="cq-eyebrow">English expression</span><p>{item.expression}</p></blockquote>
        <div className="cq-understand-tips"><span><Icon name="users" /><strong>Picture the conversation</strong><small>Who would say this, and what are they trying to convey?</small></span><span><Icon name="translation" /><strong>Keep the intended meaning</strong><small>A natural expression may use different words from the English.</small></span></div>
        <label className="ts-field"><span className="ts-label">Kasem language variety <span className="ts-optional">Optional</span></span><input className="ts-input" value={details.variety} maxLength={80} disabled={locked || busy || Boolean(recovery)} placeholder="For example, Navrongo · or Not sure" onChange={event => changeDetails({ variety: event.target.value })} /><small className="ts-hint">Assignment guidance is prefilled when available. Correct it if your expression uses another variety.</small></label>
        <GuideHint section="good-contribution" extras={extras}>Read the contribution tips<Icon name="arrow" /></GuideHint>
      </section>

      <section id="contribution-section-1" className="cq-step-panel" hidden={step !== 1} aria-label="Translate">

      <label className="ts-field translation-field">
        <span className="ts-label">Kasem translation <span aria-hidden="true" className="ts-required">*</span></span>
        <KasemField
          dictionaryAssistance
          className="ts-textarea cw-translation"
          aria-label="Kasem translation"
          lang="xsm"
          ref={(node) => { translationField.current = node; if (node && !activeField.current) activeField.current = node; }}
          onFocus={(event) => { activeField.current = event.currentTarget; }}
          required
          maxLength={2000}
          disabled={locked || busy || Boolean(recovery)}
          value={translation}
          placeholder="Write the Kasem the way you would say it"
          aria-describedby="translation-help"
          onChange={(event) => changeAnswer('translation', event.target.value)}
        />
        <small className="ts-hint" id="translation-help">Write it as you would say it. <GuideHint section="good-contribution" extras={extras}>Translation tips</GuideHint></small>
      </label>
      {revising && item.feedback ? <p className="cq-inline-feedback"><Icon name="message" /><span>{item.feedback}</span></p> : null}
      </section>

      {!locked ? (
        <div className="contributor-characters cq-character-bar" hidden={step !== 1 && step !== 2} role="group" aria-label="Kasem characters">
          <small>Insert a Kasem letter · <a href="/spelling-guide.html" target="_blank" rel="noreferrer">Spelling guide</a> · <a href="/grammar-guide.html" target="_blank" rel="noreferrer">Grammar guide</a></small>
          <div>
            {KASEM_CHARACTERS.map((char) => (
              <button type="button" key={char} className="cw-letter" aria-label={`Insert ${char}`} disabled={busy || Boolean(recovery)} onMouseDown={(event) => event.preventDefault()} onClick={() => {
                const field = activeField.current;
                if (!field || field.closest('[hidden]')) return;
                if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) && document.activeElement !== field) return;
                const start = field.selectionStart ?? field.value.length;
                const end = field.selectionEnd ?? start;
                const value = field.value.slice(0, start) + char + field.value.slice(end);
                if (value.length > field.maxLength) return;
                const alternativeIndex = field.dataset.alternativeIndex;
                if (field.name === 'alternatives' && alternativeIndex !== undefined) updateAlternative(Number(alternativeIndex), value);
                else if (field.name === 'context') changeAnswer('context', value);
                else changeAnswer('translation', value);
                window.requestAnimationFrame(() => { field.focus(); field.setSelectionRange(start + char.length, start + char.length); });
              }}>{char}</button>
            ))}
          </div>
        </div>
      ) : null}

      <section id="contribution-section-2" className="cq-step-panel" hidden={step !== 2} aria-label="Context">
      <div className="cq-context-grid">{[{ key: 'speaker' as const, label: 'Who says it?', placeholder: 'A host, a child, a friend…', max: 160 }, { key: 'listener' as const, label: 'To whom?', placeholder: 'An elder, a neighbour, a group…', max: 160 }, { key: 'situation' as const, label: 'In what situation?', placeholder: 'What is happening in this conversation?', max: 300 }, { key: 'literalMeaning' as const, label: 'Literal meaning', placeholder: 'Useful when the phrase is an idiom', max: 300 }].map(field => <label key={field.key} className="ts-field"><span className="ts-label">{field.label}<span className="ts-optional">Optional</span></span><input className="ts-input" maxLength={field.max} value={details[field.key]} disabled={locked || busy || Boolean(recovery)} placeholder={field.placeholder} onChange={event => changeDetails({ [field.key]: event.target.value })} /></label>)}</div>
      <label className="ts-field"><span className="ts-label">Tone <span className="ts-optional">Optional</span></span><select className="ts-select" aria-label="Expression tone" value={details.register} disabled={locked || busy || Boolean(recovery)} onChange={event => changeDetails({ register: event.target.value })}><option value="">Choose if useful</option>{['Everyday', 'Respectful', 'Informal', 'Formal', 'Playful', 'Not sure'].map(value => <option key={value}>{value}</option>)}</select></label>
      <details className="ts-disclosure cw-optional" open>
        <summary><Icon name="layers" /><span>Alternatives and usage note<small>Optional · reviewers read the usage note first</small></span><Icon name="chevron" className="ts-disclosure__chev" /></summary>
        <div className="ts-disclosure__body">
          <section className="alternative-translations ts-stack ts-stack--sm">
            <div className="ts-row ts-row--between" style={{ flexWrap: 'wrap' }}>
              <span className="ts-label">Alternative translations</span>
              <small className="ts-hint">Up to 12 · <GuideHint section="alternatives-context" extras={extras}>When to add one</GuideHint></small>
            </div>
            {alternativeValues.map((value, index) => (
              <div key={index} className="cw-alternative cq-alternative-row">
                <label><span className="sr-only">Alternative {index + 1}</span>
                <KasemField as="input" aria-label={`Alternative ${index + 1}`} className="ts-input ts-input--sm" lang="xsm" name="alternatives" data-alternative-index={index} maxLength={500} disabled={locked || busy || Boolean(recovery)} value={value} placeholder={`Another natural way to say it (${index + 1})`} onFocus={(event) => { activeField.current = event.currentTarget; }} onChange={(event) => updateAlternative(index, event.target.value)} />
                </label><select className="ts-select ts-select--sm" aria-label={`Difference for alternative ${index + 1}`} disabled={locked || busy || Boolean(recovery)} value={details.alternativeNotes[index] ?? ''} onChange={event => { const notes = [...details.alternativeNotes]; notes[index] = event.target.value; changeDetails({ alternativeNotes: notes.map(value => value ?? '') }); }}><option value="">Difference (optional)</option><option value="polite">More polite</option><option value="informal">Informal</option><option value="regional">Regional</option><option value="emphasis">Different emphasis</option><option value="other">Other</option></select>
                <button type="button" className="ts-btn ts-btn--ghost ts-btn--icon ts-btn--sm" aria-label={`Remove alternative ${index + 1}`} disabled={busy || locked} onClick={() => removeAlternative(index)}><Icon name="close" /></button>
              </div>
            ))}
            {!locked && alternativeValues.length < 12 ? <button className="add-alternative ts-btn ts-btn--ghost ts-btn--sm" type="button" disabled={busy || Boolean(recovery)} onClick={() => setAlternativeCount((count) => Math.min(12, count + 1))}><Icon name="plus" />Add an alternative</button> : null}
          </section>

          <label className="ts-field cw-context-field">
            <span className="ts-label">Usage note <span className="ts-optional">Optional</span></span>
            <textarea
              className="ts-textarea"
              name="context"
              maxLength={1000}
              rows={3}
              disabled={locked || busy || Boolean(recovery)}
              value={context}
              placeholder="Who says this, to whom, and when? Formal or casual? Anything a reviewer should know."
              aria-describedby="context-help"
              onFocus={(event) => { activeField.current = event.currentTarget; }}
              onChange={(event) => changeAnswer('context', event.target.value)}
            />
            <small className="ts-hint" id="context-help">For idioms, add the literal and intended meaning. {detailsContext(details, context).length} / 1,500 characters across the usage note and setting. <GuideHint section="alternatives-context" extras={extras}>Context tips</GuideHint></small>
          </label>
        </div>
      </details>
      </section>

      <section id="contribution-section-3" className="cq-step-panel" hidden={step !== 3} aria-label="Check and send">
        <DictionaryReview value={translation} />
        <div className="cq-answer-preview"><span className="cq-eyebrow">Your answer</span><p lang="xsm">{translation.trim() || 'Your Kasem translation will appear here.'}</p><small>{details.variety || 'Language variety not recorded'}</small></div>
        <ul className="cq-readiness" aria-label="Ready for review checklist">{checklist.map(check => <li key={check.title} className={check.done ? 'is-ready' : ''}><Icon name={check.done ? 'check-circle' : check.required ? 'circle' : 'info'} /><span>{check.title}<small>{check.done ? 'Done' : check.required ? 'Needed before sending' : 'Suggestion · optional'}</small></span>{!check.done ? <button type="button" onClick={() => moveStep(check.target)}>Open<Icon name="arrow" /></button> : null}</li>)}</ul>
        {extras.checkDuplicates && !locked ? <div className="cq-published-check"><button type="button" className="ts-btn ts-btn--ghost ts-btn--sm" disabled={duplicateBusy || !translation.trim()} onClick={() => void checkPublished()}><Icon name="search" />{duplicateBusy ? 'Checking published expressions…' : 'Check published expressions'}</button>{publishedMatches ? <p className="cq-small" role="status">{publishedMatches.length ? `This exact wording is published: ${publishedMatches.map(match => `${match.meaning}${match.variety ? ` (${match.variety})` : ''}`).join(' · ')}` : 'No exact published wording found. Similar expressions may still exist.'}</p> : null}{duplicateError ? <p className="cq-error" role="status">{duplicateError}</p> : null}</div> : null}
        {duplicates.length ? <div className="cq-duplicate"><Icon name="layers" /><div><strong>This wording appears in your assignment already.</strong><p>{duplicates.map(item => item.expression).join(' · ')}</p><label className="ts-field"><span className="ts-label">What makes this a distinct variant? <span className="ts-optional">Optional</span></span><textarea className="ts-textarea" rows={2} maxLength={300} value={details.variantNote} disabled={locked || busy || Boolean(recovery)} onChange={event => changeDetails({ variantNote: event.target.value })} /></label><small>A reviewer will decide whether the variant is distinct.</small></div></div> : null}
        {extras.renderKawuri && !locked ? <button type="button" className="ts-btn ts-btn--soft" aria-expanded={kawuriOpen} onClick={() => setKawuriOpen(value => !value)}><Icon name="kawuri" />{kawuriOpen ? 'Hide Kawuri suggestions' : 'Ask Kawuri for suggestions'}</button> : null}
        {kawuriOpen && extras.renderKawuri ? detailsContext(details, context).length <= 1500 ? extras.renderKawuri(item.id, { translation, alternatives: listedAlternatives, context: detailsContext(details, context) }, () => setKawuriOpen(false)) : <p className="cq-error">Shorten your combined usage notes to 1,500 characters to use the draft check.</p> : null}

      {!locked ? (
        <>
          <section className="permission-section cw-permission" aria-labelledby="submission-permission-title">
            <h3 id="submission-permission-title" className="sr-only">Permission to submit</h3>
            <label className="ts-check ts-check--card ts-check--required">
              <input type="checkbox" required disabled={busy || Boolean(recovery)} checked={publication} onChange={(event) => setPublication(event.target.checked)} />
              <span className="ts-check__copy">
                <strong>I have permission to share this expression</strong>
                <small>For review, expression publication and model training. Required to submit. Your draft is saved automatically either way.</small>
              </span>
            </label>
            <p className="ts-hint">All submissions are used for language model training and evaluation under your contributor agreement. Reviewed expressions stay in the expression collection; the dictionary contains words. <GuideHint section="review" extras={extras}>What these permissions mean</GuideHint></p>
          </section>
        </>
      ) : <p className="cq-success"><Icon name="shield" />{item.status === 'verified' ? 'Accepted by a reviewer.' : 'Submitted for review.'} Follow publication and point decisions in My contributions and Points & rewards.</p>}
      </section>
      {!locked ? (
        <>
          {error ? (
            <div role="alert" className="ts-notice ts-notice--danger">
              <Icon name="alert" className="ts-notice__icon" />
              <div className="ts-notice__body">
                <p>Your text is still here. Check your connection and retry. {error} If another device changed this draft, copy your text before reloading.</p>
              </div>
              <div className="ts-notice__action"><button type="button" className="ts-btn ts-btn--sm" onClick={retrySave}>Retry save</button></div>
            </div>
          ) : null}
          <div className="cq-section-actions" hidden={step === 3}><button type="button" className="ts-btn ts-btn--ghost" disabled={step === 0} onClick={() => moveStep(step - 1)}><Icon name="back" />Back</button><span className="cq-small">{step === 2 ? 'Optional details · skip if not useful' : 'Your draft saves as you work'}</span>{step < 3 ? <button type="button" className="ts-btn ts-btn--primary" onClick={() => moveStep(step + 1)}>Continue<Icon name="arrow" /></button> : null}</div>
          <div className="contributor-submit-wrap cw-submit" hidden={step !== 3}>
            <p id="submit-help" className={cannotSubmit || recovery ? 'ts-hint' : 'ts-hint cw-submit__ready'}>{!cannotSubmit && !recovery ? <Icon name="check-circle" /> : null}{submitHelp}</p>
            <button type="submit" value={hasNextIncomplete ? 'next' : 'submit'} className="ts-btn ts-btn--primary ts-btn--lg contributor-submit-cta" aria-describedby="submit-help" disabled={busy || Boolean(recovery) || blocked.current}>{busy ? 'Submitting…' : revising ? 'Resubmit for review →' : 'Submit for review →'}</button>
          </div>
          <section className="unsure-section cw-unsure">
            <div>
              <strong>Not sure about this one?</strong>
              <p>Flag it and move on. Your draft stays private and nothing is sent for review.</p>
              <select className="ts-select ts-select--sm" aria-label="Why are you unsure?" disabled={busy || Boolean(recovery) || blocked.current} value={details.uncertainty} onChange={event => changeDetails({ uncertainty: event.target.value })}><option value="">Reason (optional)</option><option value="unclear-prompt">The English is unclear</option><option value="unfamiliar">I don’t know this expression</option><option value="several-meanings">It could mean several things</option><option value="variety">Unsure about the language variety</option><option value="other">Another reason</option></select>
            </div>
            <button type="button" className="ts-btn ts-btn--ghost ts-btn--sm" disabled={busy || Boolean(recovery) || blocked.current} onClick={async () => {
              submitting.current = true;
              setBusy(true);
              onPending(true);
              try {
                await persist(false, true);
                onSkipped?.();
              } catch {
                /* Keep the expression open for retry. */
              } finally {
                submitting.current = false;
                setBusy(false);
                onPending(dirty.current);
              }
            }}>Skip / I’m not sure →</button>
          </section>
        </>
      ) : (
        <p role="status" className="ts-notice ts-notice--neutral cw-locked-note"><Icon name="lock" className="ts-notice__icon" /><span>{item.status === 'verified' ? 'Approved by the Review Desk. Approved expressions cannot be edited.' : 'Submitted. It stays locked while it waits for review; you will see the decision here and in Activity.'}</span></p>
      )}
    </form>
  );
}
