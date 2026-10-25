import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { FORM_CATEGORIES, FORM_LANGUAGES, FORM_STATUSES, FORM_STATUS_LABELS, FORM_TEMPLATES } from '@indigen-world/contracts/forms';
import type { FormStatus } from '@indigen-world/contracts/forms';
import type { ActivityEntry, FormSummary, FormsAccess } from '@indigen-world/contracts/forms-api';
import { Link, useRouter } from '../router';
import { confirmAction } from '../ui/dialogs';
import { Icon, type IconName } from '../ui/icons';
import {
  Badge,
  Button,
  ButtonLink,
  Dialog,
  EmptyState,
  Field,
  LoadFailure,
  Notice,
  PageHeader,
  PermissionState,
  SearchField,
  Select,
  Skeleton,
  Toast,
} from '../ui/primitives';
import { errorMessage, formsAdmin, isDenied } from './data';
import { COUNT_DEFINITIONS, awaitingReview, builderPath, dateOnly, dateTime, responsesPath } from './format';
import { CheckRow, FormStatusBadge } from './ui';
import './forms.css';

/* ==========================================================================
   All forms: what exists, what state each is in, how many responses wait,
   and the lifecycle moves (pause, close, archive and back). Nothing here
   deletes anything: pausing and closing keep every draft and response, and
   archiving only hides a form.
   ========================================================================== */

type Load =
  | { state: 'loading' }
  | { state: 'ready'; forms: FormSummary[]; access: FormsAccess; recent: ActivityEntry[] }
  | { state: 'denied'; message: string }
  | { state: 'error'; message: string };

type Sort = 'activity' | 'awaiting' | 'title' | 'closing';

const labelOf = (list: ReadonlyArray<{ id: string; label: string }>, id: string) => list.find((item) => item.id === id)?.label ?? id;

interface StatusMove {
  to: FormStatus;
  label: string;
  icon: IconName;
  danger?: boolean;
  confirm: { title: string; body: string; label: string };
}

/** The lifecycle moves offered for a form, following FORM_STATUS_TRANSITIONS and what the server allows. */
function statusMoves(form: FormSummary, access: FormsAccess): { moves: StatusMove[]; publishOnly: boolean } {
  const title = form.title || 'this form';
  const moves: StatusMove[] = [];
  let publishOnly = false;
  const reopen = (label: string, verb: string): StatusMove => ({
    to: 'published', label, icon: 'play',
    confirm: { title: `${verb} “${title}”?`, body: 'Contributors in its audience can open it and submit again. Drafts they started are still there.', label },
  });
  if (form.status === 'published') {
    moves.push({ to: 'paused', label: 'Pause', icon: 'pause', confirm: { title: `Pause “${title}”?`, body: 'Contributors cannot submit while it is paused. Every draft and response is kept, and you can resume it at any time.', label: 'Pause form' } });
    moves.push({ to: 'closed', label: 'Close', icon: 'lock', confirm: { title: `Close “${title}”?`, body: 'No new responses are accepted. Every draft and response is kept, reviewers can still decide on what was submitted, and you can reopen it later.', label: 'Close form' } });
  } else if (form.status === 'paused') {
    if (access.canPublish) moves.push(reopen('Resume', 'Resume')); else publishOnly = true;
    moves.push({ to: 'closed', label: 'Close', icon: 'lock', confirm: { title: `Close “${title}”?`, body: 'No new responses are accepted. Every draft and response is kept, and you can reopen it later.', label: 'Close form' } });
  } else if (form.status === 'closed') {
    if (form.currentVersion && access.canPublish) moves.push(reopen('Reopen', 'Reopen')); else if (form.currentVersion) publishOnly = true;
    moves.push({ to: 'archived', label: 'Archive', icon: 'archive', danger: true, confirm: { title: `Archive “${title}”?`, body: 'It is hidden from contributors and from this list (choose the Archived filter to see it). Nothing is deleted: versions, drafts, responses and history are all kept, and you can restore it.', label: 'Archive form' } });
  } else if (form.status === 'draft') {
    moves.push({ to: 'archived', label: 'Archive', icon: 'archive', danger: true, confirm: { title: `Archive “${title}”?`, body: 'It was never published, so no contributor has seen it. It is hidden from this list; nothing is deleted and you can restore it.', label: 'Archive form' } });
  } else if (form.status === 'archived') {
    const to: FormStatus = form.currentVersion ? 'closed' : 'draft';
    moves.push({ to, label: 'Restore', icon: 'undo', confirm: { title: `Restore “${title}”?`, body: form.currentVersion ? 'It comes back closed, so you can check it before reopening it to contributors.' : 'It comes back as an unpublished draft.', label: 'Restore form' } });
  }
  return { moves, publishOnly };
}

export function FormsDashboard() {
  const { params, setParams, navigate } = useRouter();
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'danger' | 'info' } | null>(null);
  const [activity, setActivity] = useState<{ entries: ActivityEntry[]; more: boolean; loading: boolean; error: string }>({ entries: [], more: true, loading: false, error: '' });
  const status = params.get('status') ?? '';
  const category = params.get('category') ?? '';
  const language = params.get('language') ?? '';
  const sort = (params.get('sort') ?? 'activity') as Sort;

  const reload = useCallback(async () => {
    try {
      const result = await formsAdmin({ action: 'overview' });
      setLoad({ state: 'ready', forms: result.forms, access: result.access, recent: result.recent });
      setActivity({ entries: result.recent, more: true, loading: false, error: '' });
    } catch (reason) {
      setLoad(isDenied(reason) ? { state: 'denied', message: errorMessage(reason, 'Forms need an admin role.') } : { state: 'error', message: errorMessage(reason, 'The forms could not be loaded.') });
    }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const forms = load.state === 'ready' ? load.forms : [];
  const needle = search.trim().toLocaleLowerCase();
  const shown = useMemo(() => {
    const list = forms.filter((form) => {
      if (status ? form.status !== status : form.status === 'archived') return false;
      if (category && form.category !== category) return false;
      if (language && !form.languageIds.includes(language)) return false;
      if (needle && ![form.title, form.description, form.id].some((value) => value?.toLocaleLowerCase().includes(needle))) return false;
      return true;
    });
    const time = (value: string | null) => (value ? Date.parse(value) || 0 : 0);
    return [...list].sort((a, b) => {
      if (sort === 'title') return (a.title || '').localeCompare(b.title || '', 'en', { sensitivity: 'base' });
      if (sort === 'awaiting') return awaitingReview(b.counts) - awaitingReview(a.counts);
      if (sort === 'closing') return (time(a.closesAt) || Infinity) - (time(b.closesAt) || Infinity);
      return time(b.lastActivityAt ?? b.updatedAt) - time(a.lastActivityAt ?? a.updatedAt);
    });
  }, [forms, status, category, language, needle, sort]);
  const archivedCount = forms.filter((form) => form.status === 'archived').length;

  const move = async (form: FormSummary, next: StatusMove) => {
    if (busy) return;
    if (!(await confirmAction({ title: next.confirm.title, body: next.confirm.body, confirmLabel: next.confirm.label, tone: next.danger ? 'danger' : 'primary' }))) return;
    setBusy(form.id);
    try {
      const result = await formsAdmin({ action: 'setStatus', formId: form.id, status: next.to });
      setToast({ message: `“${form.title || 'Untitled form'}” is now ${FORM_STATUS_LABELS[result.status].toLowerCase()}.`, tone: 'success' });
      await reload();
    } catch (reason) {
      setToast({ message: errorMessage(reason, 'The status could not be changed. Nothing was changed.'), tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };

  const duplicate = async (form: FormSummary) => {
    if (busy) return;
    setBusy(form.id);
    try {
      const result = await formsAdmin({ action: 'duplicate', formId: form.id });
      navigate(builderPath(result.formId));
    } catch (reason) {
      setToast({ message: errorMessage(reason, 'The form could not be duplicated.'), tone: 'danger' });
      setBusy(null);
    }
  };

  const loadMoreActivity = async () => {
    setActivity((current) => ({ ...current, loading: true, error: '' }));
    try {
      const result = await formsAdmin({ action: 'activity', limit: 50 });
      setActivity({ entries: result.entries, more: false, loading: false, error: '' });
    } catch (reason) {
      setActivity((current) => ({ ...current, loading: false, error: errorMessage(reason, 'Activity could not be loaded.') }));
    }
  };

  const access = load.state === 'ready' ? load.access : null;
  return (
    <div className="ad-page">
      <PageHeader
        title="Forms"
        description="Build contribution forms, choose who sees them, and follow their responses through review."
        actions={<>
          <Button icon="refresh" onClick={() => { setLoad({ state: 'loading' }); void reload(); }} disabled={load.state === 'loading'}>Refresh</Button>
          <Button variant="primary" icon="plus" onClick={() => setCreating(true)} disabled={load.state !== 'ready' || !access?.canManage}>New form</Button>
        </>}
      />

      <div className="ad-toolbar afm-toolbar" role="search" aria-label="Find forms">
        <SearchField label="Search forms" placeholder="Search by title or description…" value={search} onChange={setSearch} />
        <Select label="Status" value={status} onChange={(value) => setParams({ status: value || null })}
          options={[{ value: '', label: 'All statuses (not archived)' }, ...FORM_STATUSES.map((value) => ({ value, label: FORM_STATUS_LABELS[value] }))]} />
        <Select label="Category" value={category} onChange={(value) => setParams({ category: value || null })}
          options={[{ value: '', label: 'All categories' }, ...FORM_CATEGORIES.map((item) => ({ value: item.id, label: item.label }))]} />
        <Select label="Language" value={language} onChange={(value) => setParams({ language: value || null })}
          options={[{ value: '', label: 'All languages' }, ...FORM_LANGUAGES.map((item) => ({ value: item.id, label: item.label }))]} />
        <Select label="Sort" value={sort} onChange={(value) => setParams({ sort: value === 'activity' ? null : value })}
          options={[{ value: 'activity', label: 'Recent activity first' }, { value: 'awaiting', label: 'Most awaiting review' }, { value: 'closing', label: 'Closing soonest' }, { value: 'title', label: 'Title A–Z' }]} />
      </div>

      {load.state === 'loading' ? <div className="ad-card-box ad-card-box__body afm-pad"><Skeleton title lines={6} label="Loading forms" /></div> : null}
      {load.state === 'denied' ? <PermissionState body={load.message} /> : null}
      {load.state === 'error' ? <LoadFailure title="The forms could not be loaded" body={load.message} onRetry={() => { setLoad({ state: 'loading' }); void reload(); }} compact={false} /> : null}

      {load.state === 'ready' ? (
        <div className="afm-dashboard">
          <section className="afm-dashboard__forms" aria-labelledby="afm-forms-title">
            <div className="afm-list-head">
              <h2 id="afm-forms-title" className="afm-h2">{status ? `${FORM_STATUS_LABELS[status as FormStatus] ?? status} forms` : 'Forms'} <span className="ts-muted">({shown.length})</span></h2>
              {!status && archivedCount ? <button type="button" className="ts-link afm-linkbutton" onClick={() => setParams({ status: 'archived' })}>{archivedCount} archived {archivedCount === 1 ? 'form is' : 'forms are'} hidden</button> : null}
            </div>
            <details className="afm-counts__help">
              <summary><Icon name="chevron" className="afm-chev" />How the response counts are defined</summary>
              <ul>{COUNT_DEFINITIONS.map((item) => <li key={item.term}><strong>{item.term}:</strong> {item.detail}</li>)}</ul>
            </details>
            {shown.length ? (
              <ul className="afm-form-list">
                {shown.map((form) => (
                  <FormCard key={form.id} form={form} access={load.access} busy={busy === form.id} disabled={Boolean(busy)}
                    onMove={(next) => void move(form, next)} onDuplicate={() => void duplicate(form)} />
                ))}
              </ul>
            ) : forms.length ? (
              <EmptyState boxed icon="search" title="No forms match" body="Try another search, status, category or language." />
            ) : (
              <EmptyState boxed icon="list" title="No forms yet" body="Start from one of the five templates or a blank form. Nothing is shown to contributors until you publish it."
                actions={access?.canManage ? <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>New form</Button> : undefined} />
            )}
          </section>

          <aside className="ad-card-box afm-activity" aria-labelledby="afm-activity-title">
            <div className="ad-card-box__head"><h2 id="afm-activity-title" className="afm-h2">Recent activity</h2></div>
            <div className="ad-card-box__body">
              {activity.entries.length ? (
                <ol className="afm-activity__list">
                  {activity.entries.map((entry) => (
                    <li key={entry.id}>
                      <p className="afm-activity__summary">{entry.summary}</p>
                      <p className="ts-hint">
                        {entry.actorName || 'System'} · <time dateTime={entry.occurredAt}>{dateTime(entry.occurredAt)}</time>
                        {entry.formId ? <> · <Link to={builderPath(entry.formId)} className="ts-link">{entry.formTitle || 'Open form'}</Link></> : null}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : <p className="ts-hint">Nothing has happened yet.</p>}
              {activity.error ? <Notice tone="danger">{activity.error}</Notice> : null}
              {activity.more && activity.entries.length ? <Button size="sm" variant="ghost" busy={activity.loading} onClick={() => void loadMoreActivity()}>Show more activity</Button> : null}
            </div>
          </aside>
        </div>
      ) : null}

      {creating && access ? <NewFormDialog onClose={() => setCreating(false)} onCreated={(formId) => { setCreating(false); navigate(builderPath(formId)); }} /> : null}
      {toast ? <Toast message={toast.message} tone={toast.tone} onDone={() => setToast(null)} /> : null}
    </div>
  );
}

function FormCard({ form, access, busy, disabled, onMove, onDuplicate }: {
  form: FormSummary;
  access: FormsAccess;
  busy: boolean;
  disabled: boolean;
  onMove: (move: StatusMove) => void;
  onDuplicate: () => void;
}) {
  const { moves, publishOnly } = statusMoves(form, access);
  const title = form.title || 'Untitled form';
  const counts = [
    { label: 'Submitted', value: form.totalSubmitted },
    { label: 'Awaiting review', value: awaitingReview(form.counts) },
    { label: 'Changes requested', value: form.counts.changes_requested ?? 0 },
    { label: 'Approved', value: form.counts.approved ?? 0 },
    { label: 'Rejected', value: form.counts.rejected ?? 0 },
  ];
  const headingId = `afm-form-${form.id}`;
  return (
    <li className="afm-form-card" aria-labelledby={headingId} aria-busy={busy || undefined}>
      <div className="afm-form-card__head">
        <div className="afm-form-card__title">
          <h3 id={headingId}><Link to={builderPath(form.id)}>{title}</Link></h3>
          <p className="ts-hint">{labelOf(FORM_CATEGORIES, form.category)}{form.languageIds.length ? ` · ${form.languageIds.map((id) => labelOf(FORM_LANGUAGES, id)).join(', ')}` : ''}</p>
        </div>
        <div className="afm-form-card__badges">
          <FormStatusBadge status={form.status} />
          {form.draftVersion ? <Badge tone="accent">{form.currentVersion ? `Draft v${form.draftVersion} in progress` : 'Unpublished draft'}</Badge> : null}
        </div>
      </div>
      {form.description ? <p className="afm-form-card__desc">{form.description}</p> : null}
      <dl className="afm-form-card__counts" aria-label={`Responses to ${title}`}>
        {counts.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value.toLocaleString('en-GB')}</dd></div>)}
      </dl>
      <dl className="afm-form-card__meta">
        <div><dt>Live version</dt><dd>{form.currentVersion ? `v${form.currentVersion}` : 'Not published yet'}{form.retiredVersions.length ? ` · ${form.retiredVersions.length} retired` : ''}</dd></div>
        <div><dt>Closes</dt><dd>{form.closesAt ? dateTime(form.closesAt) : 'No closing date'}</dd></div>
        <div><dt>Audience</dt><dd>{form.audienceText || 'All signed-in contributors'}</dd></div>
        <div><dt>Last activity</dt><dd>{dateOnly(form.lastActivityAt ?? form.updatedAt)}{form.updatedByName ? ` · ${form.updatedByName}` : ''}</dd></div>
      </dl>
      <div className="afm-form-card__actions">
        <ButtonLink to={builderPath(form.id)} size="sm" variant="secondary" icon="edit" aria-label={`Edit ${title}`}>Edit</ButtonLink>
        <ButtonLink to={responsesPath(form.id)} size="sm" variant="secondary" icon="inbox" aria-label={`Responses to ${title}`}>Responses</ButtonLink>
        {access.canManage ? <Button size="sm" variant="ghost" icon="copy" disabled={disabled} onClick={onDuplicate} aria-label={`Duplicate ${title}`}>Duplicate</Button> : null}
        {access.canManage ? moves.map((next) => (
          <Button key={next.to} size="sm" variant={next.danger ? 'danger-ghost' : 'ghost'} icon={next.icon} disabled={disabled} busy={busy} onClick={() => onMove(next)} aria-label={`${next.label} ${title}`}>{next.label}</Button>
        )) : null}
      </div>
      {publishOnly ? <p className="ts-hint">Only the administrators allowed to publish can {form.status === 'paused' ? 'resume' : 'reopen'} this form.</p> : null}
    </li>
  );
}

function NewFormDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (formId: string) => void }) {
  const [choice, setChoice] = useState<string>('blank');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const template = FORM_TEMPLATES.find((item) => item.id === choice) ?? null;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await formsAdmin({ action: 'create', templateId: template?.id ?? null, ...(title.trim() ? { title } : {}) });
      onCreated(result.formId);
    } catch (reason) {
      setError(errorMessage(reason, 'The form could not be created.'));
      setBusy(false);
    }
  };
  const formId = 'afm-new-form';
  return (
    <Dialog title="New form" lede="Start blank or from a template. It stays a private draft until you publish it." size="lg" busy={busy} onClose={onClose}
      footer={<>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="primary" type="submit" form={formId} busy={busy}>Create draft</Button>
      </>}>
      <form id={formId} className="ts-stack" onSubmit={(event) => void submit(event)} noValidate>
        <fieldset className="afm-fieldset">
          <legend className="ts-label">Start from</legend>
          <div className="afm-checks afm-checks--columns">
            <CheckRow type="radio" name="afm-template" card label="Blank form" hint="One empty section. Add your own questions." checked={choice === 'blank'} onChange={(checked) => { if (checked) setChoice('blank'); }} />
            {FORM_TEMPLATES.map((item) => (
              <CheckRow key={item.id} type="radio" name="afm-template" card label={item.name} hint={item.description} checked={choice === item.id} onChange={(checked) => { if (checked) setChoice(item.id); }} />
            ))}
          </div>
        </fieldset>
        <Field label="Title" optional hint={template ? `Leave empty to use “${template.name}”. You can change it later.` : 'You can change it later in the builder.'}>
          <input className="ts-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={template?.name ?? 'Untitled form'} />
        </Field>
        {template ? <Notice tone="info">Templates are ordinary drafts: every question, rule, review setting and destination can be changed before you publish.</Notice> : null}
        {error ? <Notice tone="danger" role="alert">{error}</Notice> : null}
      </form>
    </Dialog>
  );
}
