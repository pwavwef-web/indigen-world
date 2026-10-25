import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { RESPONSE_STATUS_LABELS } from '@indigen-world/contracts/forms';
import type { ResponseSummary } from '@indigen-world/contracts/forms-api';
import { signOutUser, useAuth } from '../../../auth';
import { useRoute } from '../../../router';
import { AppShell, Badge, Button, EmptyState, Icon, LoadFailure, PageHeader, SearchField, Skeleton, Steps, type NavItem } from '../../../ui';
import { reviewNav } from '../../review/nav';
import { ReviewVerification } from '../../ReviewVerification';
import { STATUS_TONE } from '../forms-model';
import { formsReview, reviewFailure, type ReviewFailure } from './review-data';
import {
  DECISION_COPY, QUEUE_FILTERS, deskSearch, matchesReference, nextItemAfter, oldestFirst, queueFilter, rewardOutcome, routingOutcome,
  safeId, waited, type QueueFilter,
} from './review-model';
import { ResponseReview, type Decided } from './ResponseReview';
import '@indigen-world/console-ui/forms.css';
import '../../portal.css';
import '../../review/review.css';
import '../forms.css';
import './forms-review.css';

/*
 * The Indigen Forms review desk: /contributor/review?desk=forms, with
 * &status= (queue filter), &form= (one form) and &item= (the open response).
 * Every read and decision goes through the `formsReview` callable, an
 * onStaffCall, so the desk loads nothing before two-step verification
 * (ReviewVerification). The development preview at
 * /contributor/preview/forms-review renders the same desk against an
 * in-memory fixture; a production build cannot reach it.
 */

export const FORMS_REVIEW_PREVIEW_PATH = '/contributor/preview/forms-review';
const LIVE_PATH = '/contributor/review';
const COMPACT = '(max-width: 1023px)';

interface DeskNotice { tone: 'success' | 'info'; title: string; body: string }

export function FormsReviewDesk({ preview = false }: { preview?: boolean }) {
  // The preview exists only in development builds; anywhere else this is the live, verified desk.
  const isPreview = preview && import.meta.env.DEV;
  const { user, role } = useAuth();
  const { path, search } = useRoute();
  const item = safeId(new URLSearchParams(search).get('item'));
  const [trail, setTrail] = useState<string | null>(null);
  const [deciding, setDeciding] = useState(false);
  const base = isPreview ? FORMS_REVIEW_PREVIEW_PATH : LIVE_PATH;
  const nav: NavItem[] = isPreview
    ? [
      { to: '/contributor/preview', label: 'Contributor Home', icon: 'home', group: '' },
      { to: `${FORMS_REVIEW_PREVIEW_PATH}?desk=forms`, label: 'Form responses', icon: 'list', group: 'Review desks', active: true },
    ]
    : reviewNav({ path, desk: 'forms' });
  const desk = (
    <Desk
      preview={isPreview}
      base={base}
      canRetryRouting={!isPreview && (role === 'admin' || role === 'super_admin')}
      onTrail={setTrail}
      onDeciding={setDeciding}
    />
  );
  return (
    <AppShell
      workspace="review"
      nav={nav}
      title="Form responses"
      trail={item && trail ? [trail] : undefined}
      account={isPreview
        ? { name: 'Sample Reviewer', role: 'Synthetic preview' }
        : { name: user?.displayName || user?.email || 'Reviewer', photo: user?.photoURL, role: 'Validator' }}
      onSignOut={() => { if (!isPreview) void signOutUser(); }}
      banner={isPreview ? (
        <div className="ts-banner" role="note">
          <strong>Local preview · synthetic review fixture</strong>
          <span>Responses, files and decisions are sample data held in this tab. No production reads or writes; two-step verification is skipped only here.</span>
        </div>
      ) : undefined}
    >
      <div className={`ts-page rv fr-desk${item ? ' has-selection' : ''}`}>
        <PageHeader
          kicker="Validator portal"
          title="Form responses"
          description="Responses to Indigen Forms. Read the answers and the permissions exactly as the contributor gave them, follow the form’s review instructions, then record a decision. The contributor is told, and every decision is kept with the response."
          actions={<Steps compact label="Review process" current={item ? (deciding ? 2 : 1) : 0} className="rv-steps" steps={[
            { title: 'Choose', icon: 'inbox' },
            { title: 'Inspect', icon: 'eye' },
            { title: 'Decide', icon: 'shield' },
          ]} />}
        />
        {isPreview ? desk : <ReviewVerification>{desk}</ReviewVerification>}
      </div>
    </AppShell>
  );
}

function Desk({ preview, base, canRetryRouting, onTrail, onDeciding }: {
  preview: boolean;
  base: string;
  canRetryRouting: boolean;
  onTrail(label: string | null): void;
  onDeciding(deciding: boolean): void;
}) {
  const { search, navigate } = useRoute();
  const params = new URLSearchParams(search);
  const status = queueFilter(params.get('status'));
  const formId = safeId(params.get('form'));
  const item = safeId(params.get('item'));
  const queueKey = `${formId ?? ''}|${status}`;

  const [rows, setRows] = useState<ResponseSummary[]>([]);
  const [rowsKey, setRowsKey] = useState('');
  const [forms, setForms] = useState<Array<{ id: string; title: string }>>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [failure, setFailure] = useState<ReviewFailure | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [needle, setNeedle] = useState('');
  const [notice, setNotice] = useState<DeskNotice | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const focusNotice = useRef(false);
  const returnFocus = useRef<string | null>(null);
  const focusDetail = useRef(false);

  const href = (next: { status?: QueueFilter; form?: string | null; item?: string | null }) =>
    base + deskSearch({ status: next.status ?? status, form: next.form === undefined ? formId : next.form, item: next.item === undefined ? item : next.item });

  useEffect(() => {
    let active = true;
    setFailure(null);
    formsReview(preview, { action: 'queue', status, formId, cursor: null })
      .then((result) => {
        if (!active) return;
        setRows(result.rows);
        setRowsKey(queueKey);
        setCursor(result.nextCursor);
        if (result.forms.length) setForms(result.forms);
        setCounts((current) => ({ ...current, [queueKey]: `${result.rows.length}${result.nextCursor ? '+' : ''}` }));
      })
      .catch((error: unknown) => { if (active) setFailure(reviewFailure(error, 'The review queue')); });
    return () => { active = false; };
  }, [preview, status, formId, refresh]);

  // A new filter starts clean: no search left over, and no message about a list no longer shown.
  useEffect(() => {
    setNeedle('');
    setNotice(null);
  }, [status, formId]);

  // After a decision the result is announced where focus lands; after Back, focus returns to the response left.
  useEffect(() => {
    if (focusNotice.current && notice) {
      focusNotice.current = false;
      noticeRef.current?.focus();
    }
  }, [notice]);
  useEffect(() => {
    if (!item && returnFocus.current) {
      const target = document.querySelector<HTMLElement>(`[data-response-id="${CSS.escape(returnFocus.current)}"]`);
      if (target) { target.focus(); returnFocus.current = null; }
    }
  }, [item, rows]);
  useEffect(() => { if (!item) onTrail(null); }, [item]);

  const loading = rowsKey !== queueKey && !failure;
  const shownRows = loading ? [] : rows;
  const visible = shownRows.filter((row) => matchesReference(row, needle));
  const filter = QUEUE_FILTERS.find((entry) => entry.value === status)!;
  const formTitle = forms.find((entry) => entry.id === formId)?.title ?? null;
  const compact = () => typeof window.matchMedia === 'function' && window.matchMedia(COMPACT).matches;

  const choose = (id: string) => {
    if (id === item) return;
    // On a phone the queue gives way to the response, so focus moves to its heading.
    focusDetail.current = compact();
    navigate(href({ item: id }));
  };
  const back = () => {
    returnFocus.current = item;
    navigate(href({ item: null }));
  };
  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setMoreError('');
    try {
      const result = await formsReview(preview, { action: 'queue', status, formId, cursor });
      setRows((current) => [...current, ...result.rows.filter((row) => !current.some((existing) => existing.id === row.id))]);
      setCursor(result.nextCursor);
      setCounts((current) => ({ ...current, [queueKey]: `${rows.length + result.rows.length}${result.nextCursor ? '+' : ''}` }));
    } catch (error) {
      setMoreError(reviewFailure(error, 'The review queue').message);
    } finally {
      setLoadingMore(false);
    }
  };

  const decided = (result: Decided) => {
    const copy = DECISION_COPY[result.decision];
    const parts = [result.outcome.replayed ? 'It had already been recorded; nothing was recorded twice.' : 'The contributor has been told.'];
    if (result.decision === 'approve') {
      parts.push(rewardOutcome(result.outcome.reward, 0).text, routingOutcome(result.outcome.routing).text);
    }
    const ids = visible.map((row) => row.id);
    const next = nextItemAfter(ids, result.responseId);
    parts.push(next ? 'The next response in the queue is open.' : 'That was the last response in this view.');
    // Focus goes to this message, not to the next response's heading.
    focusNotice.current = true;
    focusDetail.current = false;
    setNotice({ tone: 'success', title: `${copy.done}: ${result.referenceId ?? result.responseId}`, body: parts.join(' ') });
    // Counts for other filters are now out of date; this one is reloaded.
    setCounts({});
    setRefresh((count) => count + 1);
    navigate(href({ item: next }), { replace: true });
  };

  const started = (referenceId: string | null) => {
    setNotice({ tone: 'info', title: `Review started: ${referenceId ?? 'response'}`, body: 'It now shows as under review to other reviewers. The contributor is not notified.' });
    setRefresh((count) => count + 1);
  };

  // Arrow keys, Home and End move through the queue without leaving it.
  const moveFocus = (event: KeyboardEvent<HTMLElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('.rv-queue__item')];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index === -1) return;
    event.preventDefault();
    const target = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : index + (event.key === 'ArrowDown' ? 1 : -1);
    buttons[Math.max(0, Math.min(buttons.length - 1, target))]?.focus();
  };

  let queueBody: ReactNode;
  if (failure) {
    queueBody = <LoadFailure title="The queue did not load" body={failure.message} onRetry={() => setRefresh((count) => count + 1)} />;
  } else if (loading) {
    queueBody = <Skeleton lines={4} label="Loading the queue" />;
  } else if (!shownRows.length) {
    queueBody = (
      <EmptyState
        compact
        icon="check"
        tone="success"
        title={`Nothing here: ${filter.label.toLowerCase()}`}
        body={formTitle ? `${filter.empty} (Showing ${formTitle} only.)` : filter.empty}
      />
    );
  } else {
    queueBody = (
      <>
        {visible.map((row) => (
          <button
            key={row.id}
            type="button"
            className="rv-queue__item fr-queue__item"
            data-response-id={row.id}
            aria-pressed={item === row.id}
            onClick={() => choose(row.id)}
          >
            <span className="rv-queue__top">
              <span className="rv-queue__kind">{row.formTitle}</span>
              <span className="rv-queue__age" title={oldestFirst(status) ? 'Waiting since it was submitted' : 'Since the decision'}>
                {waited(oldestFirst(status) ? row.submittedAt : row.decidedAt ?? row.updatedAt)}
              </span>
            </span>
            <strong className="rv-queue__title fr-ref">{row.referenceId ?? row.id}</strong>
            <span className="fr-queue__who">{row.contributorName || 'Unnamed contributor'}</span>
            <span className="rv-queue__meta">
              <Badge tone={STATUS_TONE[row.status] ?? 'neutral'} dot>{RESPONSE_STATUS_LABELS[row.status] ?? row.status}</Badge>
              <span className="fr-queue__extra">
                {row.revision > 1 ? `Revision ${row.revision}` : ''}
                {row.revision > 1 && row.attachmentCount ? ' · ' : ''}
                {row.attachmentCount ? `${row.attachmentCount} file${row.attachmentCount === 1 ? '' : 's'}` : ''}
              </span>
            </span>
          </button>
        ))}
        {!visible.length ? <p className="ts-hint rv-queue__none">No loaded response matches that reference ID. Clear the search, or load more.</p> : null}
        <p className="ts-hint rv-queue__note">
          <Icon name="info" />
          {oldestFirst(status) ? 'Oldest first, so nothing waits too long.' : 'Most recent first.'} Search covers the loaded responses.
        </p>
        {cursor ? <Button variant="secondary" busy={loadingMore} onClick={() => void loadMore()}>Load more</Button> : null}
        {moreError ? <p className="ts-error" role="alert"><Icon name="alert" />{moreError}</p> : null}
      </>
    );
  }

  const selectedRow = item ? rows.find((row) => row.id === item) ?? null : null;

  return (
    <>
      <div className="rv-queues fr-queues">
        <div className="ts-chips ts-chips--scroll" role="group" aria-label="Queue status">
          {QUEUE_FILTERS.map((entry) => {
            const count = counts[`${formId ?? ''}|${entry.value}`];
            return (
              <button
                key={entry.value}
                type="button"
                className="ts-chip"
                aria-pressed={status === entry.value}
                onClick={() => { if (entry.value !== status) navigate(href({ status: entry.value, item: null })); }}
              >
                {entry.label}
                {count !== undefined ? (
                  <>
                    <span className="ts-count" aria-hidden="true">{count}</span>
                    <span className="ts-sr">{`, ${count} loaded`}</span>
                  </>
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="ts-toolbar fr-toolbar">
          <SearchField value={needle} onChange={setNeedle} label="Search by reference ID" placeholder="Search by reference ID" />
          <label className="fr-form-filter">
            <span className="sr-only">Show responses to one form</span>
            <select
              className="ts-select ts-select--sm"
              value={formId ?? ''}
              onChange={(event) => navigate(href({ form: event.target.value || null, item: null }))}
            >
              <option value="">All forms</option>
              {forms.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
              {formId && !forms.some((entry) => entry.id === formId) ? <option value={formId}>{formId}</option> : null}
            </select>
          </label>
          <span className="ts-toolbar__count" aria-live="polite">
            {loading ? 'Loading…' : `${visible.length} of ${shownRows.length} loaded${cursor ? ' · more to load' : ''}`}
          </span>
        </div>
      </div>

      {notice ? (
        <div ref={noticeRef} tabIndex={-1} className="fr-notice">
          <div className={`ts-notice ts-notice--${notice.tone}`} role="status">
            <Icon name={notice.tone === 'success' ? 'check-circle' : 'info'} className="ts-notice__icon" />
            <div className="ts-notice__body">
              <strong className="ts-notice__title">{notice.title}</strong>
              <p>{notice.body}</p>
            </div>
            <div className="ts-notice__action">
              <button type="button" className="ts-btn ts-btn--ghost ts-btn--sm" onClick={() => setNotice(null)}>
                <Icon name="close" /><span>Dismiss<span className="ts-sr"> message</span></span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="rv-grid fr-grid">
        <section aria-label="Responses in this queue" className="rv-queue" onKeyDown={moveFocus}>
          {queueBody}
        </section>
        {item ? (
          <div className="rv-record-col">
            <button type="button" className="ts-btn ts-btn--ghost ts-btn--sm rv-back" onClick={back}><Icon name="back" />Back to the queue</button>
            <ResponseReview
              key={item}
              preview={preview}
              responseId={item}
              queueRow={selectedRow}
              focusOnLoad={focusDetail.current}
              canRetryRouting={canRetryRouting}
              onDecided={decided}
              onStarted={started}
              onBack={back}
              onTrail={onTrail}
              onDeciding={onDeciding}
            />
          </div>
        ) : (
          <div className="ts-panel ts-panel--dashed rv-placeholder">
            <EmptyState
              icon="eye"
              title="Select a response to review"
              body="Its answers, the permissions as worded on the form, the review instructions, its history and the decisions open to you appear here. Use the arrow keys to move through the queue."
            />
          </div>
        )}
      </div>
    </>
  );
}
