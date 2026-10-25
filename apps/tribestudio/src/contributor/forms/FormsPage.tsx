import { useEffect, useMemo, useState } from 'react';
import { FORM_CATEGORIES } from '@indigen-world/contracts/forms';
import type { ResponseStatus } from '@indigen-world/contracts/forms';
import type { AvailableForm, MyResponse } from '@indigen-world/contracts/forms-api';
import { Badge, Button, ButtonLink, Count, EmptyState, FilterChips, Icon, LoadFailure, SkeletonCards, Skeleton, Tabs } from '../../ui';
import { PageHeader } from '../components';
import { relativeTime } from '../model';
import { PortalLink, useWorkspace } from '../workspace';
import { FORMS_CHANGED, formsCall, formsFailure, loadFormsList, type FormsFailure } from './forms-data';
import { cardAction, cardStatus, estimatedTime, scheduleText } from './forms-model';
import { FormFillRoute } from './FormFill';
import { FormSubmissionPage } from './FormSubmission';
import { StatusBadge } from './parts';
import '@indigen-world/console-ui/forms.css';
import './forms.css';

/**
 * Indigen Forms in the contributor portal (/contributor/forms): the forms open
 * to this contributor, their own responses, one form to fill, and one response
 * to follow. Everything comes from the formsContributor callable; the
 * development preview uses an in-memory fixture (forms-preview.ts).
 */
export function FormsPage({ formId, submissionId, query }: { formId?: string; submissionId?: string; query: URLSearchParams }) {
  if (submissionId) return <FormSubmissionPage responseId={submissionId} />;
  if (formId) return <FormFillRoute formId={formId} query={query} />;
  return <FormsList tab={query.get('tab') === 'mine' ? 'mine' : 'available'} />;
}

type FormsListResult = Awaited<ReturnType<typeof loadFormsList>>;

function FormsList({ tab }: { tab: 'available' | 'mine' }) {
  const data = useWorkspace();
  const [list, setList] = useState<FormsListResult | null>(null);
  const [failure, setFailure] = useState<FormsFailure | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setFailure(null);
    loadFormsList(data.preview, attempt > 0).then((next) => { if (active) setList(next); })
      .catch((error) => { if (active) setFailure(formsFailure(error, 'Available forms')); });
    return () => { active = false; };
  }, [data.preview, attempt]);
  useEffect(() => {
    const changed = () => setAttempt((count) => count + 1);
    window.addEventListener(FORMS_CHANGED, changed);
    return () => window.removeEventListener(FORMS_CHANGED, changed);
  }, []);

  const attention = list?.attention ?? 0;
  return (
    <div className="ts-page fm-page">
      <PageHeader
        kicker="Contribute"
        title="Available forms"
        description="Questionnaires and collections from the Indigen World team. Each one says what it asks for, how long it takes and how your answers may be used."
      />
      <Tabs
        label="Forms"
        items={[
          { id: 'available', label: 'Available', to: data.paths.section('forms'), active: tab === 'available', icon: 'list' },
          {
            id: 'mine', label: 'My submissions', to: data.paths.section('forms', { tab: 'mine' }), active: tab === 'mine', icon: 'inbox',
            badge: attention ? <span className="fm-tab-count"><Count value={attention} tone="warning" /><span className="ts-sr"> need changes</span></span> : undefined,
          },
        ]}
      />
      {tab === 'available' ? (
        <AvailableForms list={list} failure={failure} onRetry={() => setAttempt((count) => count + 1)} />
      ) : (
        <MyResponses />
      )}
    </div>
  );
}

/* -- Available -------------------------------------------------------------------------- */

function AvailableForms({ list, failure, onRetry }: { list: FormsListResult | null; failure: FormsFailure | null; onRetry: () => void }) {
  if (failure && !list) return <LoadFailure title="Forms could not be loaded" body={failure.message} onRetry={onRetry} />;
  if (!list) return <SkeletonCards count={3} label="Loading forms" />;
  if (!list.forms.length) {
    return (
      <EmptyState
        boxed
        icon="list"
        title="No forms are open to you right now"
        body="Forms are short questionnaires from the Indigen World team, such as a word collection, a translation check or an oral history. When one is opened to contributors like you, it appears here with how long it takes and when it closes."
      />
    );
  }
  return (
    <section aria-label="Forms you can answer" className="fm-cards">
      {list.forms.map((form) => <FormCard key={form.id} form={form} />)}
    </section>
  );
}

const CLOSED_NOTE: Record<string, string> = {
  paused: 'Paused for now. Drafts are kept and can be submitted when it reopens.',
  closed: 'Closed to new responses.',
  past_deadline: 'The deadline has passed. It is closed to new responses.',
  not_yet_open: 'Not open yet. You can start a draft now and submit it once the form opens.',
  retired: 'Not taking responses on this version.',
  archived: 'Not taking responses.',
  not_published: 'Not taking responses.',
};

function FormCard({ form }: { form: AvailableForm }) {
  const { paths } = useWorkspace();
  const titleId = `fm-card-${form.id}`;
  const category = FORM_CATEGORIES.find((entry) => entry.id === form.category)?.label ?? 'Form';
  const status = cardStatus(form);
  const schedule = scheduleText({ opensAt: form.opensAt, closesAt: form.closesAt });
  const time = estimatedTime(form.estimatedMinutes);
  const action = cardAction(form);
  const note = !form.open && form.closedReason ? CLOSED_NOTE[form.closedReason] : '';
  // Every card has the same buttons; the name says which form (visible words first).
  const named = (text: string) => ({ 'aria-label': `${text}: ${form.title}`, children: text });
  return (
    <article className="fm-card" aria-labelledby={titleId}>
      <div className="fm-card__top">
        <span className="ts-kicker">{category}</span>
        {status ? <Badge tone={status.tone} dot>{status.label}</Badge> : null}
      </div>
      <h2 className="fm-card__title" id={titleId}>{form.title}</h2>
      {form.description ? <p className="fm-card__desc">{form.description}</p> : null}
      <ul className="fm-card__meta">
        {time ? <li><Icon name="clock" />{time}</li> : null}
        {schedule ? <li className={`fm-tone--${schedule.tone}`}><Icon name="calendar" />{schedule.label}</li> : null}
        {form.policy === 'once' ? <li><Icon name="user" />One response per contributor</li> : null}
      </ul>
      {note ? <p className="fm-card__note"><Icon name={form.closedReason === 'not_yet_open' ? 'info' : 'lock'} />{note}</p> : null}
      <div className="fm-card__actions">
        {action.kind === 'revise' ? (
          <ButtonLink variant="primary" iconRight="arrow" to={action.responseId ? paths.form(form.id, { response: action.responseId }) : paths.section('forms', { tab: 'mine' })} {...named('Revise')} />
        ) : action.kind === 'continue' ? (
          <ButtonLink variant="primary" iconRight="arrow" to={paths.form(form.id, { response: action.responseId })} {...named('Continue draft')} />
        ) : action.kind === 'start' ? (
          <ButtonLink variant="primary" iconRight="arrow" to={paths.form(form.id)} {...named('Start')} />
        ) : action.kind === 'start_another' ? (
          <>
            <ButtonLink variant="primary" icon="plus" to={paths.form(form.id, { new: '1' })} {...named('Start another response')} />
            {action.latestResponseId ? <ButtonLink variant="ghost" to={paths.formSubmission(action.latestResponseId)} {...named('View my latest')} /> : null}
          </>
        ) : action.kind === 'view' ? (
          <ButtonLink variant="secondary" to={paths.formSubmission(action.responseId)} {...named('View my response')} />
        ) : (
          <span className="ts-muted">Not taking responses</span>
        )}
      </div>
    </article>
  );
}

/* -- My submissions ------------------------------------------------------------------- */

type MineFilter = 'all' | 'changes' | 'draft' | 'in_review' | 'decided';
const MINE_FILTERS: { id: MineFilter; label: string; statuses: ResponseStatus[] | null }[] = [
  { id: 'all', label: 'All', statuses: null },
  { id: 'changes', label: 'Changes requested', statuses: ['changes_requested'] },
  { id: 'draft', label: 'Drafts', statuses: ['draft'] },
  { id: 'in_review', label: 'Waiting for review', statuses: ['submitted', 'under_review'] },
  { id: 'decided', label: 'Decided', statuses: ['approved', 'rejected'] },
];

function snippet(text: string, max = 160): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

function MyResponses() {
  const data = useWorkspace();
  const [rows, setRows] = useState<MyResponse[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [failure, setFailure] = useState<FormsFailure | null>(null);
  const [more, setMore] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState<MineFilter>('all');

  useEffect(() => {
    let active = true;
    setFailure(null);
    formsCall(data.preview, { action: 'mine', cursor: null }).then((page) => {
      if (!active) return;
      setRows(page.responses);
      setCursor(page.nextCursor);
    }).catch((error) => { if (active) setFailure(formsFailure(error, 'Your form responses')); });
    return () => { active = false; };
  }, [data.preview, attempt]);
  useEffect(() => {
    const changed = () => setAttempt((count) => count + 1);
    window.addEventListener(FORMS_CHANGED, changed);
    return () => window.removeEventListener(FORMS_CHANGED, changed);
  }, []);

  const loadMore = async () => {
    if (!cursor) return;
    setMore(true);
    try {
      const page = await formsCall(data.preview, { action: 'mine', cursor });
      setRows((current) => [...(current ?? []), ...page.responses.filter((row) => !(current ?? []).some((existing) => existing.id === row.id))]);
      setCursor(page.nextCursor);
    } catch (error) {
      setFailure(formsFailure(error, 'More responses'));
    } finally {
      setMore(false);
    }
  };

  const counts = useMemo(() => Object.fromEntries(MINE_FILTERS.map((entry) => [entry.id, (rows ?? []).filter((row) => !entry.statuses || entry.statuses.includes(row.status)).length])), [rows]);
  if (failure && !rows) return <LoadFailure title="Your responses could not be loaded" body={failure.message} onRetry={() => setAttempt((count) => count + 1)} />;
  if (!rows) return <Skeleton lines={5} label="Loading your responses" />;
  if (!rows.length) {
    return (
      <EmptyState
        boxed
        icon="inbox"
        title="You have not sent a form response yet"
        body="When you answer a form, your drafts and submissions are listed here with their reference IDs, review status and any feedback from reviewers."
        actions={<ButtonLink variant="primary" iconRight="arrow" to={data.paths.section('forms')}>See available forms</ButtonLink>}
      />
    );
  }
  const active = MINE_FILTERS.find((entry) => entry.id === filter) ?? MINE_FILTERS[0];
  const shown = rows.filter((row) => !active.statuses || active.statuses.includes(row.status));
  return (
    <section className="ts-stack ts-stack--md" aria-label="My form responses">
      <div className="ts-toolbar">
        <FilterChips<MineFilter>
          label="Filter responses"
          scroll
          value={filter}
          onChange={setFilter}
          options={MINE_FILTERS.map((entry) => ({ value: entry.id, label: entry.label, count: counts[entry.id] }))}
        />
      </div>
      {failure ? <p className="ts-error" role="alert"><Icon name="alert" />{failure.message}</p> : null}
      {shown.length ? (
        <ul className="fm-rows">
          {shown.map((row) => (
            <li key={row.id}>
              <article className={`fm-row fm-row--${row.status}`} aria-labelledby={`fm-row-${row.id}`}>
                <div className="fm-row__main">
                  <h2 className="fm-row__title" id={`fm-row-${row.id}`}>
                    <PortalLink to={data.paths.formSubmission(row.id)}>{row.formTitle}</PortalLink>
                  </h2>
                  <p className="fm-row__meta">
                    {row.referenceId ? <code className="fm-row__ref">{row.referenceId}</code> : <span>No reference yet (draft)</span>}
                    <span aria-hidden="true">·</span>
                    <span>{`Updated ${relativeTime(row.updatedAt)}`}</span>
                    {row.revision > 1 ? <><span aria-hidden="true">·</span><span>{`Revision ${row.revision}`}</span></> : null}
                  </p>
                  {row.feedback && (row.status === 'changes_requested' || row.status === 'rejected') ? (
                    <p className="fm-row__feedback"><strong>Reviewer: </strong>{snippet(row.feedback)}</p>
                  ) : null}
                </div>
                <div className="fm-row__side">
                  <StatusBadge status={row.status} />
                  {row.canEdit && row.status === 'changes_requested' ? (
                    <ButtonLink size="sm" variant="primary" to={data.paths.form(row.formId, { response: row.id })} aria-label={`Revise: ${row.formTitle}`}>Revise</ButtonLink>
                  ) : row.canEdit && row.status === 'draft' ? (
                    <ButtonLink size="sm" variant="secondary" to={data.paths.form(row.formId, { response: row.id })} aria-label={`Continue: ${row.formTitle}`}>Continue</ButtonLink>
                  ) : null}
                </div>
              </article>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState compact icon="filter" title="Nothing here" body="No responses match this filter." actions={<Button size="sm" onClick={() => setFilter('all')}>Show all</Button>} />
      )}
      {cursor ? <div><Button busy={more} onClick={() => void loadMore()}>Show more</Button></div> : null}
    </section>
  );
}
