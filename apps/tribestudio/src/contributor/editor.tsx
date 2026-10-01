import { useListMemory, useListScroll } from './listMemory';
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { contributionState, formatDate, itemStatus, STATUS_META, type Item, type Status } from './model';
import type { SaveAnswer } from './types';

/**
 * The translation workspace for one task: the expression list and the editor.
 *
 * The editor's save, autosave, recovery, conflict and review-before-submit
 * behaviour is the one released in September 2026 and covered by
 * scripts/workflows.test.mjs. The redesign changed how it is laid out and
 * worded, not how it saves:
 *   - the English source sits above the answer as the thing being translated;
 *   - optional detail ("Other ways to say it", "When would someone say this?")
 *     is grouped and labelled in plain words;
 *   - saving state, Save draft and Submit live in one action bar that stays
 *     in reach on a phone;
 *   - the Kawuri check and "Report a problem" are injected by the page so this
 *     module stays free of routing and network code beyond saving.
 */

const save = httpsCallable<Record<string, unknown>, { revision: number; submissionId?: string }>(functions, 'saveExpressionAnswer');

export interface EditorExtras {
  /** Builds a guideline link for a section id. */
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
    return { translation: value.translation, alternatives: value.alternatives, context: value.context ?? '', revision: value.revision };
  } catch {
    return null;
  }
}

function statusSlug(status: Status) {
  return status.toLocaleLowerCase().replace(/[^a-z]+/g, '-').replace(/(^-|-$)/g, '');
}

function GuideHint({ section, children, extras }: { section: string; children: ReactNode; extras: EditorExtras }) {
  const href = extras.guideHref ? extras.guideHref(section) : `/contributor/guide?section=${section}`;
  return (
    <a
      className="cw-guide-hint"
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
const FILTER_LABELS: Record<(typeof FILTERS)[number], string> = {
  All: 'All',
  'Not started': 'To do',
  Drafts: 'Drafts',
  Submitted: 'Submitted',
  'Needs revision': 'Returned',
  'I’m not sure': 'Unsure',
};

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
  useListScroll(`${positionKey}:scroll:${filter}:${query}`, items.length > 0, !mobileEditor);
  useListScroll(`${positionKey}:inner-scroll:${filter}:${query}`, items.length > 0, !mobileEditor, '.cw-list__items');
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
    setSelected(id);
    setMobileEditor(true);
    onSelectItem?.(id);
  };
  const counts = Object.fromEntries(FILTERS.map((label) => [label, label === 'All' ? items.length : items.filter((candidate) => contributionState(candidate) === label).length]));

  if (!items.length) {
    return <div className="cw-empty cw-empty--inline"><strong className="cw-empty__title">No expressions in this task yet</strong><p>The team has not added expressions to this task. Check back later, or report a problem if you expected some.</p></div>;
  }
  return (
    <>
      {confirmation ? <p className="cw-confirmation" role="status">{confirmation}</p> : null}
      <div className={'contributor-workspace' + (mobileEditor ? ' is-editing' : '')}>
        <section className="cw-list" aria-label="Expressions in this task">
          <div className="cw-list__tools">
            <label className="cw-search">
              <span className="cw-sr">Search expressions</span>
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input type="search" value={query} disabled={pending} onChange={(event) => { setQuery(event.target.value); setSelected(''); }} placeholder="Search this task" />
            </label>
            <div className="cw-filters cw-list__filters" role="group" aria-label="Filter expressions">
              {FILTERS.map((label) => (
                <button key={label} type="button" className="cw-filter" disabled={pending} aria-pressed={filter === label} onClick={() => { setFilter(label); setSelected(''); }}>
                  {FILTER_LABELS[label]}<span className="cw-filter__count">{counts[label]}</span>
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
                        <span className={`cw-dot cw-dot--status-${status}`} aria-hidden="true" />
                        {STATUS_META[status].label}{recovery ? ' · unsaved copy on this device' : ''}
                      </small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {!visible.length ? <p className="cw-muted cw-list__none">No expressions match. Try another search or filter.</p> : null}
        </section>
        <div className="cw-editor-pane">
          <button type="button" className="cw-back" disabled={pending} onClick={() => setMobileEditor(false)}>← All expressions</button>
          {item ? (
            <ExpressionEditor
              accountId={accountId}
              key={item.id}
              item={item}
              itemNumber={currentIndex + 1}
              itemTotal={items.length}
              hasNextIncomplete={hasNextIncomplete}
              work={work}
              saveAnswer={saveAnswer}
              extras={extras}
              onPending={(value) => { setPending(value); onPending(value); if (value) setSelected(item.id); }}
              onSkipped={() => {
                const index = items.findIndex((candidate) => candidate.id === item.id);
                const remaining = [...items.slice(index + 1), ...items.slice(0, index)].find((candidate) => contributionState(candidate) === 'Not started');
                setConfirmation(`“${item.expression}” is flagged as unsure. Nothing was sent for review.${!remaining ? ' No untouched expressions remain; flagged ones are under Unsure.' : ''}`);
                if (remaining) { setFilter('All'); setQuery(''); choose(remaining.id); } else setMobileEditor(false);
              }}
              onSubmitted={(next) => {
                const index = items.findIndex((candidate) => candidate.id === item.id);
                const remaining = [...items.slice(index + 1), ...items.slice(0, index)].find((candidate) => contributionState(candidate) === 'Not started');
                setConfirmation(`“${item.expression}” was sent for review. A reviewer will approve it or explain what to change; the decision appears in My submissions.${next && !remaining ? ' No untouched expressions remain — check Drafts for unfinished work.' : ''}`);
                if (next && remaining) { setFilter('All'); setQuery(''); choose(remaining.id); }
              }}
            />
          ) : <p className="cw-muted cw-editor-pane__empty">Choose an expression to begin.</p>}
          {/* Outside the editor's form: the report dialog has a form of its own. */}
          {item && extras.renderReport ? <div className="cw-editor__footer">{extras.renderReport(item.id)}</div> : null}
        </div>
      </div>
    </>
  );
}

const KASEM_CHARACTERS = Array.from('ɛƐəƏɣƔɩƖŋŊɔƆʋƲ');

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
  const [alternatives, setAlternatives] = useState(item.alternatives.join('\n'));
  const [context, setContext] = useState(item.context ?? '');
  const [alternativeCount, setAlternativeCount] = useState(item.alternatives.length);
  const [publication, setPublication] = useState(false);
  const [training, setTraining] = useState(false);
  const [status, setStatus] = useState('Saved');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [kawuriOpen, setKawuriOpen] = useState(false);
  const revision = useRef(item.revision), chain = useRef(Promise.resolve()), dirty = useRef(false), blocked = useRef(false);
  const payload = useRef({ translation, alternatives, context });
  payload.current = { translation, alternatives, context };
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
  const keepLocal = (answer: { translation: string; alternatives: string; context: string }) => {
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
  const persist = (submit = false, skip = false) => {
    const answer = { ...payload.current };
    chain.current = chain.current.then(async () => {
      if (blocked.current) throw new Error('Reload to recover this draft before continuing.');
      const result = await saveAnswer({
        work, item: item.id, revision: revision.current, translation: answer.translation,
        alternatives: answer.alternatives.split('\n').filter((value) => value.trim()), context: answer.context,
        submit, skip, publicationPermission: publication, aiTraining: training,
      });
      revision.current = result.data.revision;
      if (payload.current.translation === answer.translation && payload.current.alternatives === answer.alternatives
        && payload.current.context === answer.context) dirty.current = false;
      if (dirty.current) keepLocal(payload.current);
      else { try { if (storageKey) window.localStorage.removeItem(storageKey); } catch { /* Keep the acknowledged server copy. */ } }
      onPending(dirty.current || submitting.current);
      setStatus(submit ? 'Sent for review' : skip ? 'Flagged as unsure — not sent' : dirty.current ? 'Saving…' : 'Saved');
    }).catch((reason) => {
      blocked.current = true;
      // A dropped connection often arrives as a bare code ("internal") or no
      // message at all; the retry controls must still appear.
      const message = reason instanceof Error ? reason.message.replace(/^Firebase: /, '').trim() : '';
      setError(message && !/^[\w-]+$/.test(message) ? message : 'The save did not go through.');
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
  }, [translation, alternatives, context, locked, busy, recovery]);
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
  };
  const cannotSubmit = !translation.trim() ? 'Write the Kasem translation to submit.'
    : !publication ? 'Tick “I have permission to share” to submit.'
      : blocked.current ? 'Retry saving your draft before submitting.' : '';
  const submitHelp = recovery ? 'Restore or discard the recovered copy before submitting.'
    : cannotSubmit || 'Ready. You will see a summary before anything is sent.';
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
  const statusLine = locked
    ? (item.status === 'verified'
      ? `Approved${item.reviewedAt ? ` ${formatDate(item.reviewedAt)}` : ''} — approved expressions cannot be edited.`
      : `Submitted${item.submittedAt ? ` ${formatDate(item.submittedAt)}` : ''} — locked while a reviewer decides.`)
    : status;
  return (
    <form className="contributor-editor cw-editor" onInvalid={(event) => {
      event.currentTarget.querySelector<HTMLElement>(':invalid')?.scrollIntoView({ block: 'center' });
    }} onSubmit={(event) => {
      event.preventDefault();
      if (locked || recovery || blocked.current || cannotSubmit || busy || submitting.current) return;
      reviewNext.current = (event.nativeEvent as SubmitEvent | undefined)?.submitter?.getAttribute('value') === 'next';
      reviewDialog.current?.showModal();
    }}>
      <dialog ref={reviewDialog} className="cw-dialog contributor-review-dialog" aria-labelledby="review-answer-title" onCancel={(event) => { if (busy) event.preventDefault(); }}>
        <div className="cw-dialog__head"><h2 id="review-answer-title">Check before you send</h2></div>
        <div className="cw-dialog__body">
          <p className="cw-dialog__lede">Once sent, this expression is locked until a reviewer decides. Reviewers can approve it or return it with feedback.</p>
          <dl className="cw-review-list">
            <div><dt>English</dt><dd>{item.expression}</dd></div>
            <div><dt>Your Kasem</dt><dd className="review-answer-text" lang="xsm">{translation}</dd></div>
            <div><dt>Other ways to say it</dt><dd lang="xsm">{listedAlternatives.length ? <ul>{listedAlternatives.map((value, index) => <li key={index}>{value}</li>)}</ul> : 'None added'}</dd></div>
            <div><dt>When it is said</dt><dd>{context.trim() || 'No note added'}</dd></div>
            <div><dt>Sharing permission</dt><dd>{publication ? 'Given — it may be reviewed and published' : 'Not given'}</dd></div>
            <div><dt>AI training</dt><dd>{training ? 'Allowed if approved' : 'Not allowed'}</dd></div>
          </dl>
        </div>
        <div className="cw-dialog__foot contributor-review-actions">
          <button type="button" autoFocus disabled={busy} onClick={() => reviewDialog.current?.close()}>Back to editing</button>
          <button type="button" className="button--primary contributor-submit-cta" disabled={busy || Boolean(cannotSubmit)} onClick={() => void sendReviewedAnswer()}>{busy ? 'Submitting…' : 'Confirm submission'}</button>
        </div>
      </dialog>

      <header className="cw-editor__head">
        <div className="cw-editor__source">
          <p className="cw-editor__position">Expression {itemNumber} of {itemTotal} · English</p>
          <h2 className="cw-editor__expression">{item.expression}</h2>
        </div>
        <span className={`cw-badge cw-badge--${STATUS_META[detailed].tone} status-badge state-${statusSlug(state)}`}>{STATUS_META[detailed].label}</span>
      </header>

      {item.feedback ? (
        <section className={`cw-feedback ${revising ? 'cw-feedback--revise' : ''}`} aria-label="Reviewer feedback">
          <strong>{revising ? 'What the reviewer asked you to change' : 'Reviewer feedback'}</strong>
          <p>{item.feedback}</p>
          {revising ? <small>Revise your translation below, then resubmit it. Your earlier version and this decision stay on record. <GuideHint section="review" extras={extras}>How revisions work</GuideHint></small> : null}
        </section>
      ) : null}

      {recovery ? (
        <section className="cw-feedback cw-feedback--recovery" aria-label="Unsaved draft">
          <strong>An unsaved copy was found in this browser</strong>
          <p>{recovery.revision !== item.revision ? 'The saved version has changed since this copy was made. Compare both before restoring.' : 'Your previous edits can be recovered.'}</p>
          <pre className="contributor-recovery-text">{recovery.translation}{recovery.alternatives ? `\nOther ways to say it:\n${recovery.alternatives}` : ''}{recovery.context ? `\nWhen it is said:\n${recovery.context}` : ''}</pre>
          <div className="cw-inline-actions">
            {!locked ? <button type="button" onClick={() => {
              revision.current = item.revision;
              changeAnswer('translation', recovery.translation);
              changeAnswer('alternatives', recovery.alternatives);
              changeAnswer('context', recovery.context);
              setRecovery(null);
            }}>Restore draft</button> : null}
            <button type="button" onClick={() => { try { window.localStorage.removeItem(storageKey); } catch { /* Storage may be unavailable. */ } setRecovery(null); }}>Discard recovery copy</button>
          </div>
        </section>
      ) : null}
      {storageError ? <p role="alert" className="cw-inline-alert">{storageError}</p> : null}

      <div className="translation-field cw-field">
        <label className="cw-field-label" htmlFor={`translation-${item.id}`}>Kasem translation <span className="cw-field__tag">Required</span></label>
        <textarea
          id={`translation-${item.id}`}
          ref={(node) => { if (node && !activeField.current) activeField.current = node; }}
          onFocus={(event) => { activeField.current = event.currentTarget; }}
          required
          lang="xsm"
          maxLength={2000}
          rows={3}
          disabled={locked || busy || Boolean(recovery)}
          value={translation}
          placeholder="Write it the way you would say it"
          aria-describedby="translation-help"
          onChange={(event) => changeAnswer('translation', event.target.value)}
        />
        <small id="translation-help" className="cw-field__hint">Translate the meaning, not word for word, and use the Kasem letters below. <GuideHint section="good-contribution" extras={extras}>Translation tips</GuideHint></small>
      </div>

      {!locked ? (
        <div className="contributor-characters cw-letters" role="group" aria-label="Kasem letters">
          <span className="cw-letters__label" aria-hidden="true">Kasem letters</span>
          {KASEM_CHARACTERS.map((char) => (
            <button type="button" key={char} aria-label={`Insert ${char}`} disabled={busy || Boolean(recovery)} onMouseDown={(event) => event.preventDefault()} onClick={() => {
              const field = activeField.current;
              if (!field) return;
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
      ) : null}

      <details className="cw-optional" open={Boolean(item.alternatives.length || item.context)}>
        <summary><span>Add more detail</span><small>Optional · other ways to say it, and when it is said</small></summary>
        <div className="cw-optional__body">
          <section className="alternative-translations cw-field">
            <div className="cw-field-head">
              <span className="cw-field-label">Other ways to say it <span className="cw-field__tag">Optional</span></span>
              <small className="cw-field__hint">Up to 12. Each one is a complete way of saying it — explanations go in the note below. <GuideHint section="alternatives-context" extras={extras}>When to add one</GuideHint></small>
            </div>
            {alternativeValues.map((value, index) => (
              <label key={index}>
                <span className="cw-sr">Other way to say it {index + 1}</span>
                <span className="cw-alternative">
                  <input name="alternatives" lang="xsm" data-alternative-index={index} maxLength={500} disabled={locked || busy || Boolean(recovery)} value={value} placeholder={`Another natural way to say it (${index + 1})`} onFocus={(event) => { activeField.current = event.currentTarget; }} onChange={(event) => updateAlternative(index, event.target.value)} />
                  <button type="button" className="cw-icon-button" aria-label={`Remove alternative ${index + 1}`} disabled={busy || locked} onClick={() => removeAlternative(index)}>×</button>
                </span>
              </label>
            ))}
            {!locked && alternativeValues.length < 12 ? <button className="add-alternative" type="button" disabled={busy || Boolean(recovery)} onClick={() => setAlternativeCount((count) => Math.min(12, count + 1))}>+ Add another way to say it</button> : null}
          </section>

          <div className="cw-context-field cw-field">
            <label className="cw-field-label" htmlFor={`context-${item.id}`}>When would someone say this? <span className="cw-field__tag">Optional</span></label>
            <textarea
              id={`context-${item.id}`}
              name="context"
              maxLength={1000}
              rows={3}
              disabled={locked || busy || Boolean(recovery)}
              value={context}
              placeholder="For example: said to an elder when arriving at their home; casual among friends."
              aria-describedby="context-help"
              onFocus={(event) => { activeField.current = event.currentTarget; }}
              onChange={(event) => changeAnswer('context', event.target.value)}
            />
            <small id="context-help" className="cw-field__hint">Who says it, to whom, and how formal it is. For an idiom, add its literal meaning. Reviewers read this first. <GuideHint section="alternatives-context" extras={extras}>Context tips</GuideHint></small>
          </div>
        </div>
      </details>

      {!locked ? (
        <>
          <fieldset className="permission-section" aria-describedby="permission-note">
            <legend className="cw-field-label">Permission to share</legend>
            <label className="contributor-check contributor-check--required cw-check">
              <input type="checkbox" required disabled={busy || Boolean(recovery)} checked={publication} onChange={(event) => setPublication(event.target.checked)} />
              <span><strong>I have permission to share this for review and publication <span className="cw-field__tag">Required to submit</span></strong><span>Reviewers check it before anything is published.</span></span>
            </label>
            <label className="contributor-check cw-check">
              <input type="checkbox" disabled={busy || Boolean(recovery)} checked={training} onChange={(event) => setTraining(event.target.checked)} />
              <span><strong>Allow use for Kawuri AI training <span className="cw-field__tag">Optional</span></strong><span>Only if it is approved. You can leave this unticked.</span></span>
            </label>
            <p id="permission-note" className="cw-field__hint"><GuideHint section="review" extras={extras}>What these permissions mean</GuideHint></p>
          </fieldset>
          {error ? (
            <div role="alert" className="cw-inline-alert">
              <p>Your text is still here and a copy is kept in this browser. {error} Check your connection, then retry. If another device changed this draft, copy your text before reloading.</p>
              <button type="button" onClick={retrySave}>Retry save</button>
            </div>
          ) : null}
        </>
      ) : (
        <p role="status" className="cw-locked-note">{item.status === 'verified' ? 'Approved by a reviewer. Approved expressions cannot be edited.' : 'Submitted. It stays locked while it waits for review; the decision will appear here and in My submissions.'}</p>
      )}

      <div className="cw-editor__bar">
        <div className="editor-save-state">
          <span className={`save-indicator ${status === 'Couldn’t save' ? 'is-error' : status === 'Saving…' ? 'is-saving' : ''}`} aria-hidden="true" />
          <span role="status" aria-live="polite">{statusLine}</span>
        </div>
        {!locked ? (
          <div className="cw-editor__actions">
            <button type="button" className="cw-btn--ghost" disabled={busy || Boolean(recovery) || blocked.current || !dirty.current} onClick={() => void persist().catch(() => undefined)}>Save draft</button>
            {error ? <button type="button" disabled={busy} onClick={retrySave}>Retry save now</button> : null}
            {extras.renderKawuri ? (
              <button type="button" className="cw-kawuri-toggle" aria-expanded={kawuriOpen} onClick={() => setKawuriOpen((open) => !open)}>
                <svg className="cw-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.5l-1.9-5.7L4.5 11l5.6-2Z" /></svg>
                {kawuriOpen ? 'Hide Kawuri check' : 'Check with Kawuri'}
              </button>
            ) : null}
            <button type="submit" value={hasNextIncomplete ? 'next' : 'submit'} className="button--primary contributor-submit-cta" aria-describedby="submit-help" disabled={busy || Boolean(recovery) || blocked.current}>{busy ? 'Submitting…' : revising ? 'Resubmit for review' : 'Submit for review'}</button>
          </div>
        ) : null}
        {!locked ? <p id="submit-help" className="cw-editor__help">{submitHelp}</p> : null}
      </div>

      {kawuriOpen && extras.renderKawuri && !locked ? extras.renderKawuri(item.id, { translation, alternatives: listedAlternatives, context }, () => setKawuriOpen(false)) : null}

      {!locked ? (
        <section className="unsure-section">
          <div><strong>Not sure about this one?</strong><p>Flag it and move on. Your draft stays private and nothing is sent for review.</p></div>
          <button type="button" disabled={busy || Boolean(recovery) || blocked.current} onClick={async () => {
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
          }}>Flag as unsure and skip</button>
        </section>
      ) : null}
    </form>
  );
}
