import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DataTable, type DataColumn } from '@indigen-world/console-ui';
import { FIELD_TYPES, FORM_LANGUAGES, RESPONSE_STATUSES, RESPONSE_STATUS_LABELS, displayAnswer, topLevelFields } from '@indigen-world/contracts/forms';
import type { FormDefinition, FormField } from '@indigen-world/contracts/forms';
import type { FormSummary, FormsAccess, ResponseFilter, ResponseSummary, StatusCounts } from '@indigen-world/contracts/forms-api';
import '@indigen-world/console-ui/forms.css';
import { Link, useRouter } from '../router';
import {
  Button,
  Dialog,
  LoadFailure,
  Notice,
  PageHeader,
  PermissionState,
  Select,
  Skeleton,
  Toast,
} from '../ui/primitives';
import { errorMessage, formsAdmin, isDenied } from './data';
import { builderPath, dateOnly } from './format';
import { ResponseDetailPanel } from './ResponseDetail';
import { CheckRow, ChoiceCards, CountsSummary, ResponseStatusBadge } from './ui';
import './forms.css';

/* ==========================================================================
   Responses to a form: filters bound to the address, the answer columns an
   administrator chooses, and a detail panel with every revision, its
   history, consents, points and routing — and the reviewer decisions, since
   administrators review in every reviewer group. Exports carry stable keys
   and never links.
   ========================================================================== */

type Load =
  | { state: 'loading' }
  | { state: 'ready'; forms: FormSummary[]; access: FormsAccess }
  | { state: 'denied'; message: string }
  | { state: 'error'; message: string };

type Rows =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ready'; rows: ResponseSummary[]; nextCursor: string | null; scanned: number; loadingMore: boolean }
  | { state: 'error'; message: string };

const COLUMN_KEY = (formId: string) => `indigen-admin-form-columns:${formId}`;
/** A uid typed into the contributor box is sent to the server; anything else filters the loaded rows by name. */
const UID_PATTERN = /^[A-Za-z0-9_-]{20,128}$/;

function readColumns(formId: string): string[] | null {
  try {
    const raw = window.localStorage.getItem(COLUMN_KEY(formId));
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : null;
  } catch {
    return null;
  }
}

function writeColumns(formId: string, columns: string[] | null) {
  try {
    if (columns) window.localStorage.setItem(COLUMN_KEY(formId), JSON.stringify(columns));
    else window.localStorage.removeItem(COLUMN_KEY(formId));
  } catch {
    // A blocked storage quota only means the choice is not remembered.
  }
}

function answerFields(definition: FormDefinition | null): FormField[] {
  return definition ? topLevelFields(definition).map((entry) => entry.field).filter((field) => FIELD_TYPES[field.type]?.collects) : [];
}

function sumCounts(forms: FormSummary[]): { counts: StatusCounts; total: number } {
  const counts: StatusCounts = { draft: 0, submitted: 0, under_review: 0, changes_requested: 0, approved: 0, rejected: 0 };
  let total = 0;
  for (const form of forms) {
    for (const key of Object.keys(counts) as Array<keyof StatusCounts>) counts[key] += form.counts[key] ?? 0;
    total += form.totalSubmitted;
  }
  return { counts, total };
}

export function FormResponses() {
  const { params, setParams } = useRouter();
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [rows, setRows] = useState<Rows>({ state: 'idle' });
  const [definition, setDefinition] = useState<FormDefinition | null>(null);
  const [columns, setColumns] = useState<string[] | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'danger' | 'info' } | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const formId = params.get('form') ?? '';
  const versionParam = params.get('version') ?? '';
  const status = params.get('status') ?? 'all_submitted';
  const language = params.get('language') ?? '';
  const contributor = params.get('contributor') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const selectedId = params.get('item');
  const [contributorText, setContributorText] = useState(contributor);

  const filter = useMemo<ResponseFilter>(() => ({
    formId: formId || null,
    version: /^\d+$/.test(versionParam) ? Number(versionParam) : null,
    status: (status || 'all_submitted') as ResponseFilter['status'],
    languageId: language || null,
    contributorId: UID_PATTERN.test(contributor) ? contributor : null,
    from: from || null,
    to: to || null,
  }), [formId, versionParam, status, language, contributor, from, to]);

  const reloadForms = useCallback(async () => {
    try {
      const result = await formsAdmin({ action: 'overview' });
      setLoad({ state: 'ready', forms: result.forms, access: result.access });
    } catch (reason) {
      setLoad(isDenied(reason) ? { state: 'denied', message: errorMessage(reason, 'Responses need an admin role.') } : { state: 'error', message: errorMessage(reason, 'The forms could not be loaded.') });
    }
  }, []);
  useEffect(() => { void reloadForms(); }, [reloadForms]);

  // The selected form's current questions, for the answer columns.
  useEffect(() => {
    setDefinition(null);
    setColumns(formId ? readColumns(formId) : null);
    if (!formId) return;
    let alive = true;
    formsAdmin({ action: 'get', formId }).then((detail) => {
      if (alive) setDefinition(detail.current?.definition ?? detail.draft?.definition ?? null);
    }, () => { /* the table still works without answer columns */ });
    return () => { alive = false; };
  }, [formId]);

  const loadRows = useCallback(async () => {
    setRows({ state: 'loading' });
    try {
      const result = await formsAdmin({ action: 'listResponses', filter, limit: 100 });
      setRows({ state: 'ready', rows: result.rows, nextCursor: result.nextCursor, scanned: result.scanned, loadingMore: false });
    } catch (reason) {
      setRows({ state: 'error', message: errorMessage(reason, 'The responses could not be loaded.') });
    }
  }, [filter]);
  useEffect(() => { if (load.state === 'ready') void loadRows(); }, [loadRows, load.state]);

  const loadMore = async () => {
    if (rows.state !== 'ready' || !rows.nextCursor || rows.loadingMore) return;
    setRows({ ...rows, loadingMore: true });
    try {
      const result = await formsAdmin({ action: 'listResponses', filter, cursor: rows.nextCursor, limit: 100 });
      setRows({ state: 'ready', rows: [...rows.rows, ...result.rows.filter((row) => !rows.rows.some((item) => item.id === row.id))], nextCursor: result.nextCursor, scanned: rows.scanned + result.scanned, loadingMore: false });
    } catch (reason) {
      setRows({ ...rows, loadingMore: false });
      setToast({ message: errorMessage(reason, 'More responses could not be loaded.'), tone: 'danger' });
    }
  };

  const forms = load.state === 'ready' ? load.forms : [];
  const access = load.state === 'ready' ? load.access : null;
  const form = forms.find((item) => item.id === formId) ?? null;
  const fields = answerFields(definition);
  const chosen = (columns ?? fields.slice(0, 4).map((field) => field.id)).filter((id) => fields.some((field) => field.id === id));
  const versions = form ? [...new Set([...form.publishedVersions, ...form.retiredVersions])].sort((a, b) => b - a) : [];
  const nameNeedle = contributor && !UID_PATTERN.test(contributor) ? contributor.toLocaleLowerCase() : '';
  const shown = rows.state === 'ready'
    ? rows.rows.filter((row) => !nameNeedle || row.contributorName.toLocaleLowerCase().includes(nameNeedle) || row.contributorId.toLocaleLowerCase().includes(nameNeedle))
    : [];
  const totals = form ? { counts: form.counts, total: form.totalSubmitted } : sumCounts(forms);

  const open = (row: ResponseSummary) => {
    setParams({ item: row.id });
    if (!window.matchMedia?.('(min-width: 1281px)').matches) window.requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const tableColumns: DataColumn<ResponseSummary>[] = [
    {
      id: 'reference', header: 'Reference', sort: (row) => row.referenceId ?? row.id, search: (row) => `${row.referenceId ?? ''} ${row.id}`,
      cell: (row) => (
        <button type="button" className="afm-cell-link" aria-current={row.id === selectedId ? 'true' : undefined} onClick={() => open(row)}>
          <strong>{row.referenceId ?? 'Not submitted'}</strong>
          {!formId ? <small>{row.formTitle}</small> : null}
        </button>
      ),
    },
    { id: 'contributor', header: 'Contributor', sort: (row) => row.contributorName, search: (row) => `${row.contributorName} ${row.contributorId}`, cell: (row) => <span className="afm-cell-person"><strong>{row.contributorName || 'Contributor'}</strong><small><code>{row.contributorId}</code></small></span> },
    { id: 'status', header: 'Status', sort: (row) => row.status, cell: (row) => <ResponseStatusBadge status={row.status} /> },
    { id: 'version', header: 'Version', sort: (row) => row.formVersion, align: 'end', cell: (row) => `v${row.formVersion}${row.revision > 1 ? ` · rev ${row.revision}` : ''}` },
    { id: 'submitted', header: 'Submitted', sort: (row) => row.submittedAt ?? '', cell: (row) => dateOnly(row.submittedAt) },
    ...chosen.map((id): DataColumn<ResponseSummary> => {
      const field = fields.find((item) => item.id === id)!;
      return {
        id: `answer:${id}`,
        header: field.label || id,
        wrap: true,
        sort: (row) => displayAnswer(field, row.answers?.[id] ?? null),
        search: (row) => displayAnswer(field, row.answers?.[id] ?? null),
        cell: (row) => {
          const value = displayAnswer(field, row.answers?.[id] ?? null);
          return value ? <span className="afm-cell-answer">{value}</span> : <span className="ts-muted">—</span>;
        },
      };
    }),
  ];

  const selected = shown.find((row) => row.id === selectedId) ?? (rows.state === 'ready' ? rows.rows.find((row) => row.id === selectedId) : null) ?? null;

  return (
    <div className="ad-page">
      <PageHeader
        title="Responses"
        description="Read, review and export what contributors sent. Filters stay in the address, so a filtered view can be shared with another administrator."
        actions={<>
          <Button icon="refresh" onClick={() => void loadRows()} disabled={rows.state === 'loading'}>Refresh</Button>
          {access?.canExport ? <Button variant="primary" icon="download" disabled={!formId} onClick={() => setExporting(true)} title={formId ? undefined : 'Choose a form to export'}>Export…</Button> : null}
        </>}
      />

      {load.state === 'loading' ? <div className="ad-card-box ad-card-box__body afm-pad"><Skeleton title lines={6} label="Loading forms" /></div> : null}
      {load.state === 'denied' ? <PermissionState body={load.message} /> : null}
      {load.state === 'error' ? <LoadFailure title="The forms could not be loaded" body={load.message} onRetry={() => void reloadForms()} compact={false} /> : null}

      {load.state === 'ready' ? (
        <>
          <form className="afm-filters" aria-label="Filter responses" onSubmit={(event) => { event.preventDefault(); setParams({ contributor: contributorText || null, item: null }); }}>
            <Select label="Form" value={formId} className="afm-filters__form" onChange={(value) => setParams({ form: value || null, version: null, item: null })}
              options={[{ value: '', label: 'All forms' }, ...forms.map((item) => ({ value: item.id, label: `${item.title || 'Untitled form'}${item.status === 'archived' ? ' (archived)' : ''}` }))]} />
            <Select label="Version" value={versionParam} onChange={(value) => setParams({ version: value || null, item: null })}
              options={[{ value: '', label: 'All versions' }, ...versions.map((number) => ({ value: String(number), label: `Version ${number}` }))]} />
            <Select label="Status" value={status} onChange={(value) => setParams({ status: value === 'all_submitted' ? null : value, item: null })}
              options={[{ value: 'all_submitted', label: 'All submitted' }, ...RESPONSE_STATUSES.filter((value) => value !== 'draft').map((value) => ({ value, label: RESPONSE_STATUS_LABELS[value] }))]} />
            <Select label="Language" value={language} onChange={(value) => setParams({ language: value || null, item: null })}
              options={[{ value: '', label: 'All languages' }, ...FORM_LANGUAGES.map((item) => ({ value: item.id, label: item.label }))]} />
            <label className="afm-filters__field">
              <span className="afm-mini-label">Contributor</span>
              <input className="ts-input ts-input--sm" value={contributorText} placeholder="Name or account id" onChange={(event) => setContributorText(event.target.value)}
                onBlur={() => { if (contributorText !== contributor) setParams({ contributor: contributorText || null, item: null }); }} aria-describedby="afm-contributor-hint" />
            </label>
            <label className="afm-filters__field">
              <span className="afm-mini-label">Submitted from</span>
              <input className="ts-input ts-input--sm" type="date" value={from} max={to || undefined} onChange={(event) => setParams({ from: event.target.value || null, item: null })} />
            </label>
            <label className="afm-filters__field">
              <span className="afm-mini-label">Submitted to</span>
              <input className="ts-input ts-input--sm" type="date" value={to} min={from || undefined} onChange={(event) => setParams({ to: event.target.value || null, item: null })} />
            </label>
            <p id="afm-contributor-hint" className="ts-hint afm-filters__hint">An account id is searched on the server; a name filters the responses loaded below.</p>
          </form>

          <CountsSummary counts={totals.counts} totalSubmitted={totals.total} label={form ? `Responses to ${form.title || 'this form'}` : 'Responses to all forms'} />
          {form ? <p className="ts-hint">Counts cover every response to this form; the table follows the filters. <Link to={builderPath(form.id)} className="ts-link">Open the form in the builder</Link>.</p> : null}

          <div className={selectedId ? 'afm-desk' : 'afm-desk afm-desk--single'}>
            <section className="afm-desk__list" aria-label="Responses">
              {rows.state === 'error' ? <LoadFailure title="The responses could not be loaded" body={rows.message} onRetry={() => void loadRows()} /> : (
                <DataTable<ResponseSummary>
                  caption={form ? `Responses to ${form.title || 'this form'}` : 'Responses to all forms'}
                  columns={tableColumns}
                  rows={shown}
                  rowKey={(row) => row.id}
                  loading={rows.state === 'loading' || rows.state === 'idle'}
                  searchable
                  searchPlaceholder="Search loaded responses…"
                  initialSort={{ columnId: 'submitted', direction: 'desc' }}
                  pageSize={25}
                  rowClassName={(row) => (row.id === selectedId ? 'is-selected' : undefined)}
                  empty={{ title: 'No responses match', body: formId ? 'Try another status, version or date range.' : 'Choose a form, or widen the filters.' }}
                  actions={formId && fields.length ? <Button size="sm" variant="ghost" icon="layers" onClick={() => setChoosing(true)}>Columns</Button> : undefined}
                  footNote={rows.state === 'ready' ? <>
                    {rows.rows.length.toLocaleString('en-GB')} loaded{nameNeedle ? `, ${shown.length} matching “${contributor}”` : ''}.
                    {fields.length && chosen.length ? ' Answers are shown with the current version’s wording and option labels.' : ''}
                    {rows.nextCursor ? <> <Button size="sm" variant="link" busy={rows.loadingMore} onClick={() => void loadMore()}>Load more</Button></> : null}
                  </> : undefined}
                />
              )}
            </section>
            {selectedId ? (
              <div ref={detailRef} className="afm-desk__detail">
                <ResponseDetailPanel
                  key={selectedId}
                  responseId={selectedId}
                  summary={selected}
                  onClose={() => setParams({ item: null })}
                  onDecided={async (message) => {
                    setToast({ message, tone: 'success' });
                    await Promise.all([loadRows(), reloadForms()]);
                  }}
                  onNotice={(message, tone) => setToast({ message, tone })}
                />
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {choosing && formId ? (
        <ColumnsDialog fields={fields} chosen={chosen} onClose={() => setChoosing(false)}
          onSave={(next) => { setColumns(next); writeColumns(formId, next); setChoosing(false); }}
          onReset={() => { setColumns(null); writeColumns(formId, null); setChoosing(false); }} />
      ) : null}
      {exporting && form ? (
        <ExportDialog form={form} filter={filter} onClose={() => setExporting(false)} onDone={(message) => { setExporting(false); setToast({ message, tone: 'success' }); }} />
      ) : null}
      {toast ? <Toast message={toast.message} tone={toast.tone} onDone={() => setToast(null)} /> : null}
    </div>
  );
}

function ColumnsDialog({ fields, chosen, onClose, onSave, onReset }: {
  fields: FormField[];
  chosen: string[];
  onClose: () => void;
  onSave: (columns: string[]) => void;
  onReset: () => void;
}) {
  const [value, setValue] = useState<string[]>(chosen);
  return (
    <Dialog title="Answer columns" lede="Choose which answers appear in the table. The choice is remembered in this browser for this form." onClose={onClose}
      footer={<>
        <Button variant="ghost" onClick={onReset}>Reset to the first four</Button>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={() => onSave(fields.map((field) => field.id).filter((id) => value.includes(id)))}>Show these columns</Button>
      </>}>
      <fieldset className="afm-fieldset">
        <legend className="sr-only">Answers to show</legend>
        <div className="afm-checks">
          {fields.map((field) => (
            <CheckRow key={field.id} label={field.label || field.id} hint={`${FIELD_TYPES[field.type].label} · ${field.id}`} checked={value.includes(field.id)}
              onChange={(checked) => setValue((current) => (checked ? [...current, field.id] : current.filter((id) => id !== field.id)))} />
          ))}
        </div>
      </fieldset>
    </Dialog>
  );
}

function ExportDialog({ form, filter, onClose, onDone }: { form: FormSummary; filter: ResponseFilter; onClose: () => void; onDone: (message: string) => void }) {
  const [format, setFormat] = useState<'csv' | 'json'>('csv');
  const [scope, setScope] = useState<'submitted' | 'approved'>('submitted');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const narrowed = [filter.version ? `version ${filter.version}` : null, filter.languageId ? `language ${filter.languageId}` : null, filter.contributorId ? 'one contributor' : null, filter.from ? `from ${filter.from}` : null, filter.to ? `to ${filter.to}` : null].filter(Boolean);
  const run = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await formsAdmin({
        action: 'export', formId: form.id, format, scope,
        filter: { version: filter.version ?? null, languageId: filter.languageId ?? null, contributorId: filter.contributorId ?? null, from: filter.from ?? null, to: filter.to ?? null },
      });
      const blob = new Blob([result.content], { type: result.contentType || (format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json') });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename || `responses.${format}`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      onDone(`Exported ${result.count} ${result.count === 1 ? 'response' : 'responses'} as ${result.filename}.`);
    } catch (reason) {
      setError(errorMessage(reason, 'The export could not be prepared.'));
      setBusy(false);
    }
  };
  return (
    <Dialog title={`Export responses to “${form.title || 'this form'}”`} size="lg" busy={busy} onClose={onClose}
      footer={<>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="primary" icon="download" busy={busy} onClick={() => void run()}>Download {format.toUpperCase()}</Button>
      </>}>
      <div className="afm-stack">
        <ChoiceCards legend="Format" name="afm-export-format" value={format} onChange={setFormat}
          options={[
            { value: 'csv', label: 'CSV for spreadsheets', hint: 'One row per response, one column per answer key.' },
            { value: 'json', label: 'JSON for data work', hint: 'Every response plus each exported version’s full definition, so ids map back to the questions contributors saw.' },
          ]} />
        <ChoiceCards legend="Which responses" name="afm-export-scope" value={scope} onChange={setScope}
          options={[
            { value: 'submitted', label: 'Everything submitted', hint: 'Any status after submission: awaiting review, changes requested, approved and rejected.' },
            { value: 'approved', label: 'Approved only' },
          ]} />
        <p className="ts-hint">{narrowed.length ? `Uses the current filters: ${narrowed.join(', ')}.` : 'No other filter is applied: every version, language and date.'} The status filter is replaced by the choice above.</p>
        <section className="afm-explain" aria-labelledby="afm-export-columns">
          <h3 id="afm-export-columns" className="afm-h4">What the columns mean</h3>
          <ul>
            <li><strong>Fixed columns:</strong> reference_id, response_id, form_id, form_version, revision, status, contributor_id (the account id; names and emails are not exported), submitted_at, decided_at and granted_permissions.</li>
            <li><strong>Answer columns</strong> are named by stable answer keys, not by question wording, and cover every exported version.</li>
            <li><strong>Choices</strong> export option ids (several are joined with “; ”); the JSON export maps ids to labels.</li>
            <li><strong>Repeatable groups</strong> export a JSON list of entries keyed by sub-question key.</li>
            <li><strong>Attachments</strong> export as attachmentId:fileName. No download links are exported.</li>
            <li><strong>Spreadsheet safety:</strong> CSV is UTF-8 with a byte-order mark, text is quoted, and any cell starting with =, +, −, @, tab or carriage return gets a leading apostrophe so it is never run as a formula.</li>
          </ul>
        </section>
        <Notice tone="info" icon="shield">Exports are recorded in the audit trail with your name, the form and the filters.</Notice>
        {error ? <Notice tone="danger" role="alert">{error}</Notice> : null}
      </div>
    </Dialog>
  );
}
