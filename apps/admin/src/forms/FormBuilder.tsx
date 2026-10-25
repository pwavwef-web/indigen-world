import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FIELD_TYPES, allFieldIds, findField, validateDefinition } from '@indigen-world/contracts/forms';
import type { FieldType, FormDefinition, Issue } from '@indigen-world/contracts/forms';
import type { Cohort, FormSummary, FormsAccess, VersionMeta } from '@indigen-world/contracts/forms-api';
import '@indigen-world/console-ui/forms.css';
import { Link, useLeaveGuard, useRouter } from '../router';
import { confirmAction } from '../ui/dialogs';
import { Icon } from '../ui/icons';
import {
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  LoadFailure,
  Notice,
  PageHeader,
  PermissionState,
  Skeleton,
  Toast,
  cx,
} from '../ui/primitives';
import { Canvas } from './builder/Canvas';
import { FieldSettings, SectionSettings, deleteField } from './builder/FieldSettings';
import { FormSettings, SETTINGS_TABS } from './builder/FormSettings';
import { Palette } from './builder/Palette';
import { Preview } from './builder/Preview';
import { PublishDialog, type PublishState } from './builder/PublishDialog';
import type { Apply, Selection } from './builder/types';
import { callError, errorIssues, errorMessage, errorReason, formsAdmin, isConflict, isDenied } from './data';
import { dateTime, responsesPath, timeOnly } from './format';
import { addField, getField, indexIssues, insertionPoint, issueTarget, locateField, type SettingsTab } from './model';
import { FormStatusBadge, SaveIndicator, TabPanel, Tabs, useAnnouncer } from './ui';
import './forms.css';

/* ==========================================================================
   The form builder. A form has at most one draft version; it is edited here
   and saved explicitly (button or Ctrl/Cmd+S) with the revision it was loaded
   at, so two administrators can never silently overwrite each other. A form
   with no draft shows its live version read-only until someone starts a new
   version. Publishing goes through the server's own summary and checks.
   ========================================================================== */

type View = 'build' | 'settings' | 'preview';
type Pane = 'palette' | 'canvas' | 'field';

type Load =
  | { state: 'loading' }
  | { state: 'ready' }
  | { state: 'denied'; message: string }
  | { state: 'missing' }
  | { state: 'error'; message: string };

interface DraftMeta {
  version: number;
  revision: number;
  updatedAt: string;
  updatedByName: string;
}

interface Conflict {
  updatedByName: string;
  updatedAt: string | null;
}

const NO_DEFINITION = { sections: [], destination: { type: 'general_intake', mapping: {} } } as unknown as FormDefinition;

/** Issues from several checks, each listed once. */
function mergeIssues(...lists: Issue[][]): Issue[] {
  const seen = new Set<string>();
  return lists.flat().filter((issue) => {
    const key = `${issue.path}\n${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const VIEWS: Array<{ id: View; label: string }> = [
  { id: 'build', label: 'Questions' },
  { id: 'settings', label: 'Form settings' },
  { id: 'preview', label: 'Preview' },
];

export function FormBuilder() {
  const { params } = useRouter();
  const formId = params.get('form');
  if (!formId) return <ChooseForm />;
  return <BuilderScreen key={formId} formId={formId} />;
}

/** /forms/builder without ?form: send the administrator to the list. */
function ChooseForm() {
  return (
    <div className="ad-page">
      <PageHeader title="Form builder" description="Open a form from the list to edit it, or start a new one." />
      <EmptyState boxed icon="list" title="Choose a form to edit" body="Every form opens here from All forms."
        actions={<ButtonLink to="/forms" variant="primary" icon="grid">All forms</ButtonLink>} />
    </div>
  );
}

function focusByKey(key: string) {
  const find = (value: string) => document.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(value)}"]`);
  let target = find(key);
  if (!target || (target as HTMLButtonElement).disabled) {
    // A move to the top or bottom disables the button that was pressed: keep
    // focus on the moved question instead.
    const id = key.split(':').slice(1).join(':');
    target = find(`field-select:${id}`) ?? find(`section-select:${id}`) ?? target;
  }
  target?.focus({ preventScroll: false });
}

function BuilderScreen({ formId }: { formId: string }) {
  const { params, setParams } = useRouter();
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [form, setForm] = useState<FormSummary | null>(null);
  const [versions, setVersions] = useState<VersionMeta[]>([]);
  const [definition, setDefinition] = useState<FormDefinition | null>(null);
  const [draft, setDraft] = useState<DraftMeta | null>(null);
  const [live, setLive] = useState<{ version: number; publishedAt: string } | null>(null);
  const [savedJson, setSavedJson] = useState('');
  const [save, setSave] = useState<{ state: 'idle' | 'saving' | 'saved' | 'error'; at: string | null; message: string }>({ state: 'idle', at: null, message: '' });
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [access, setAccess] = useState<FormsAccess | null>(null);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [publishedTypes, setPublishedTypes] = useState<Map<string, FieldType>>(new Map());
  const [publishedOptions, setPublishedOptions] = useState<Map<string, Set<string>>>(new Map());
  const [selection, setSelection] = useState<Selection>({ fieldId: null, sectionId: null });
  const [pane, setPane] = useState<Pane>('canvas');
  const [publish, setPublish] = useState<PublishState | null>(null);
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishError, setPublishError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'danger' | 'info' } | null>(null);
  const [announcer, announce] = useAnnouncer();
  const pendingFocus = useRef<string | null>(null);
  /** The draft as last loaded or saved, readable right after a save inside the same handler. */
  const draftRef = useRef<DraftMeta | null>(null);
  draftRef.current = draft;
  const view =(VIEWS.some((item) => item.id === params.get('view')) ? params.get('view') : 'build') as View;
  const tab = (SETTINGS_TABS.some((item) => item.id === params.get('tab')) ? params.get('tab') : 'details') as SettingsTab;
  const readOnly = !draft;

  /* -- Loading ------------------------------------------------------------------ */

  const loadForm = useCallback(async () => {
    try {
      const [detail, accessResult, cohortResult] = await Promise.all([
        formsAdmin({ action: 'get', formId }),
        formsAdmin({ action: 'access' }),
        formsAdmin({ action: 'listCohorts' }).catch(() => ({ cohorts: [] as Cohort[] })),
      ]);
      setForm(detail.form);
      setVersions(detail.versions);
      setAccess(accessResult);
      setCohorts(cohortResult.cohorts);
      setLive(detail.current ? { version: detail.current.version, publishedAt: detail.current.publishedAt } : null);
      const shown = detail.draft?.definition ?? detail.current?.definition ?? null;
      setDraft(detail.draft ? { version: detail.draft.version, revision: detail.draft.revision, updatedAt: detail.draft.updatedAt, updatedByName: detail.draft.updatedByName } : null);
      setDefinition(shown);
      setSavedJson(shown ? JSON.stringify(shown) : '');
      setConflict(null);
      setSave({ state: 'idle', at: null, message: '' });
      setLoad(shown ? { state: 'ready' } : { state: 'missing' });

      // Answer keys that a published or retired version already uses keep their meaning forever.
      const numbers = [...new Set([...detail.form.publishedVersions, ...detail.form.retiredVersions])];
      let definitions: FormDefinition[];
      try {
        definitions = await Promise.all(numbers.map(async (number) => (
          detail.current && detail.current.version === number
            ? detail.current.definition
            : (await formsAdmin({ action: 'getVersion', formId, version: number })).definition
        )));
      } catch {
        // Without the older versions, lock every key on screen rather than risk renaming a published one.
        definitions = [detail.current?.definition, numbers.length ? shown : null].filter((item): item is FormDefinition => Boolean(item));
      }
      const types = new Map<string, FieldType>();
      // Option ids too: a new option must never take the id of one an earlier version had.
      const options = new Map<string, Set<string>>();
      for (const published of definitions) {
        for (const id of allFieldIds(published)) {
          const field = findField(published, id);
          if (field && !types.has(id)) types.set(id, field.type);
          for (const option of field?.settings?.options ?? []) {
            if (!options.has(id)) options.set(id, new Set());
            options.get(id)!.add(option.id);
          }
        }
      }
      setPublishedTypes(types);
      setPublishedOptions(options);
    } catch (reason) {
      const { code } = callError(reason);
      if (isDenied(reason)) setLoad({ state: 'denied', message: errorMessage(reason, 'Forms need an admin role.') });
      else if (code === 'not-found') setLoad({ state: 'missing' });
      else setLoad({ state: 'error', message: errorMessage(reason, 'The form could not be loaded.') });
    }
  }, [formId]);
  useEffect(() => { void loadForm(); }, [loadForm]);

  /** Refresh the form head and versions without touching the definition being edited. */
  const refreshMeta = useCallback(async () => {
    try {
      const detail = await formsAdmin({ action: 'get', formId });
      setForm(detail.form);
      setVersions(detail.versions);
    } catch {
      // The next full load reports any problem.
    }
  }, [formId]);

  /* -- Editing ------------------------------------------------------------------- */

  const apply = useCallback<Apply>((next, options) => {
    if (!draft) return;
    setDefinition(next);
    if (options?.select) {
      const select = options.select;
      const sectionId = select.sectionId ?? (select.fieldId ? next.sections[locateField(next, select.fieldId)?.sectionIndex ?? -1]?.id ?? null : null);
      setSelection({ fieldId: select.fieldId, sectionId });
    }
    if (options?.focus) pendingFocus.current = options.focus;
    if (options?.announce) announce(options.announce);
  }, [draft, announce]);

  useLayoutEffect(() => {
    const key = pendingFocus.current;
    if (!key) return;
    pendingFocus.current = null;
    focusByKey(key);
  });

  const json = useMemo(() => (definition ? JSON.stringify(definition) : ''), [definition]);
  const dirty = !readOnly && json !== savedJson;
  useLeaveGuard(dirty, 'Your changes to this form are not saved. Leave without saving?');

  const validation = useMemo(() => (definition && !readOnly ? validateDefinition(definition, { forPublish: true }) : null), [definition, readOnly]);
  const issues: Issue[] = validation?.issues ?? [];
  const issueIndex = useMemo(() => indexIssues(definition ?? NO_DEFINITION, issues), [definition, issues]);
  const previewDefinition = readOnly ? definition : validation?.definition ?? definition;
  const tabCounts = useMemo(() => new Map([...issueIndex.byTab.entries()].map(([key, list]) => [key, list.length])), [issueIndex]);

  const select = useCallback((next: Selection) => {
    if (!definition) return;
    const sectionId = next.sectionId ?? (next.fieldId ? definition.sections[locateField(definition, next.fieldId)?.sectionIndex ?? -1]?.id ?? null : null);
    setSelection({ fieldId: next.fieldId, sectionId });
  }, [definition]);

  const addFromPalette = (type: FieldType) => {
    if (!definition || readOnly) return;
    const at = insertionPoint(definition, selection);
    if (!at) return;
    const result = addField(definition, type, at);
    if (!result) return;
    apply(result.definition, {
      select: { fieldId: result.field.id, sectionId: at.sectionId },
      focus: `field-label:${result.field.id}`,
      announce: `Added a ${FIELD_TYPES[type].label} question. Its settings are open.`,
    });
    setPane('field');
  };

  /* -- Saving -------------------------------------------------------------------------- */

  const saving = save.state === 'saving';
  const saveDraft = useCallback(async (options: { overwrite?: boolean } = {}): Promise<boolean> => {
    if (!definition || !draft || saving) return false;
    const sent = definition;
    const sentJson = JSON.stringify(sent);
    // Nothing new to store (Ctrl+S on a saved draft): no request, no new revision.
    if (!options.overwrite && sentJson === savedJson && save.state !== 'error') return true;
    setSave((current) => ({ ...current, state: 'saving', message: '' }));
    try {
      let expectedRevision = draft.revision;
      if (options.overwrite) {
        // Deliberate overwrite: take the revision that is stored now, then save this version over it.
        const latest = await formsAdmin({ action: 'get', formId });
        if (!latest.draft || latest.draft.version !== draft.version) {
          // Never over a different draft: this one was published or discarded, and maybe a new one started.
          throw Object.assign(new Error(`Draft version ${draft.version} was published or discarded by someone else, so there is nothing to save over. Copy anything you need, then reload.`), { code: 'failed-precondition' });
        }
        expectedRevision = latest.draft.revision;
      }
      const result = await formsAdmin({ action: 'saveDraft', formId, definition: sent, version: draft.version, expectedRevision });
      draftRef.current = { ...draft, revision: result.revision, updatedAt: result.updatedAt };
      setDraft((current) => (current ? { ...current, revision: result.revision, updatedAt: result.updatedAt } : current));
      setSavedJson(sentJson);
      setConflict(null);
      setSave({ state: 'saved', at: timeOnly(new Date(result.updatedAt || Date.now())), message: '' });
      announce('Draft saved.');
      void refreshMeta();
      return true;
    } catch (reason) {
      if (isConflict(reason)) {
        const details = callError(reason).details ?? {};
        setConflict({ updatedByName: typeof details.updatedByName === 'string' && details.updatedByName ? details.updatedByName : 'Another administrator', updatedAt: typeof details.updatedAt === 'string' ? details.updatedAt : null });
        setSave((current) => ({ ...current, state: 'error', message: 'Someone else saved this draft. Your changes are still here.' }));
      } else {
        const message = errorReason(reason) === 'no-draft'
          ? 'There is no draft to save any more: it was published or discarded. Copy anything you need, then reload.'
          : errorMessage(reason, 'The draft could not be saved. Your changes are still here.');
        setSave((current) => ({ ...current, state: 'error', message }));
      }
      return false;
    }
  }, [definition, draft, saving, savedJson, save.state, formId, announce, refreshMeta]);

  const saveRef = useRef(saveDraft);
  saveRef.current = saveDraft;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const loadTheirs = async () => {
    if (!(await confirmAction({ title: 'Load their version?', body: 'Your unsaved changes in this browser are discarded and the draft as it is stored now is loaded. Copy anything you want to keep first.', confirmLabel: 'Load their version', tone: 'danger' }))) return;
    setSavedJson(json); // allow the reload without the leave prompt
    setLoad({ state: 'loading' });
    await loadForm();
  };

  /* -- Lifecycle actions ------------------------------------------------------------------- */

  const startDraft = async () => {
    if (busy) return;
    setBusy('start');
    try {
      const result = await formsAdmin({ action: 'startDraft', formId });
      await loadForm();
      setToast({ message: `Version ${result.version} is a draft copy of the live version. Edit it, then publish it.`, tone: 'success' });
    } catch (reason) {
      setToast({ message: errorMessage(reason, 'A new version could not be started.'), tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };

  const discardDraft = async () => {
    if (!draft || busy) return;
    const ok = await confirmAction({
      title: `Discard draft version ${draft.version}?`,
      body: <p>Every change in this draft is lost. The live version {live ? `(version ${live.version})` : ''} stays exactly as it is, and so do all responses.</p>,
      confirmLabel: 'Discard draft',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy('discard');
    try {
      await formsAdmin({ action: 'discardDraft', formId, version: draft.version, expectedRevision: draft.revision });
      setSavedJson(json);
      await loadForm();
      setToast({ message: 'Draft discarded. The live version is unchanged.', tone: 'success' });
    } catch (reason) {
      if (isConflict(reason)) setToast({ message: 'Someone else saved this draft since you opened it. Reload before discarding it.', tone: 'danger' });
      else if (errorReason(reason) === 'no-draft') {
        // Published or discarded elsewhere: show what is there now rather than claim a discard.
        setSavedJson(json);
        await loadForm();
        setToast({ message: `Nothing was discarded: draft version ${draft.version} had already been published or discarded by someone else. The form is reloaded as it is now.`, tone: 'danger' });
      } else setToast({ message: errorMessage(reason, 'The draft could not be discarded.'), tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };

  const retire = async (version: number) => {
    const ok = await confirmAction({
      title: `Retire version ${version}?`,
      body: <>
        <p>Contributors with an unsent draft on version {version} can no longer submit it; they are asked to start again on the current version.</p>
        <p>Responses already submitted on version {version} keep their questions and stay reviewable. Nothing is deleted.</p>
      </>,
      confirmLabel: `Retire version ${version}`,
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await formsAdmin({ action: 'retireVersion', formId, version });
      await refreshMeta();
      setToast({ message: `Version ${version} is retired.`, tone: 'success' });
    } catch (reason) {
      setToast({ message: errorMessage(reason, 'The version could not be retired.'), tone: 'danger' });
    }
  };

  const openPublish = async () => {
    if (!draft) return;
    if (dirty && !(await saveDraft())) return;
    const shown = draftRef.current;
    if (!shown) return;
    setPublishError('');
    setPublish({ state: 'loading' });
    try {
      const result = await formsAdmin({ action: 'publishPreview', formId });
      if (result.version !== shown.version || result.revision !== shown.revision) {
        // The stored draft is no longer the one on screen: never summarise (or publish) someone else's save as this one.
        setPublish(null);
        setConflict({ updatedByName: 'Another administrator', updatedAt: null });
        return;
      }
      // Every problem the builder shows blocks publishing as well, whatever the server's copy says.
      setPublish({ state: 'ready', ...result, issues: mergeIssues(result.issues, issues) });
    } catch (reason) {
      setPublish({ state: 'error', message: errorMessage(reason, 'The publishing summary could not be prepared.') });
    }
  };

  const doPublish = async () => {
    if (publish?.state !== 'ready' || publishBusy || !draft) return;
    if (publish.issues.length || issues.length) return;
    setPublishBusy(true);
    setPublishError('');
    try {
      // The draft this builder shows, at the revision it shows: a later save by someone else is a conflict.
      const result = await formsAdmin({ action: 'publish', formId, version: draft.version, expectedRevision: draft.revision });
      setPublish(null);
      setParams({ view: null, tab: null });
      await loadForm();
      setToast({
        message: result.status === 'paused' || result.status === 'closed'
          ? `Version ${result.version} is now the current version. The form is still ${result.status}, so nobody can submit until you ${result.status === 'paused' ? 'resume' : 'reopen'} it.`
          : `Version ${result.version} is live. Contributors in its audience can now fill it.`,
        tone: 'success',
      });
    } catch (reason) {
      const found = errorIssues(reason);
      if (found.length) setPublish({ ...publish, issues: found });
      else if (isConflict(reason)) {
        setPublish(null);
        const details = callError(reason).details ?? {};
        setConflict({ updatedByName: typeof details.updatedByName === 'string' && details.updatedByName ? details.updatedByName : 'Another administrator', updatedAt: typeof details.updatedAt === 'string' ? details.updatedAt : null });
      } else setPublishError(errorMessage(reason, 'The form could not be published. Nothing was changed.'));
    } finally {
      setPublishBusy(false);
    }
  };

  /** Take the administrator to the place an issue is about. */
  const showIssue = (issue: Issue) => {
    if (!definition) return;
    setPublish(null);
    const target = issueTarget(definition, issue.path);
    const fieldId = target.fieldId ?? (getField(definition, issue.path.split('.')[0]) ? issue.path.split('.')[0] : null);
    if (fieldId) {
      setParams({ view: null, tab: null });
      select({ fieldId, sectionId: null });
      setPane('field');
      pendingFocus.current = `field-label:${fieldId}`;
      return;
    }
    if (target.sectionId) {
      setParams({ view: null, tab: null });
      select({ fieldId: null, sectionId: target.sectionId });
      setPane('field');
      pendingFocus.current = `section-title:${target.sectionId}`;
      return;
    }
    if (target.tab) {
      setParams({ view: 'settings', tab: target.tab });
      return;
    }
    setParams({ view: null, tab: null });
    setPane('canvas');
  };

  /* -- Render -------------------------------------------------------------------------------- */

  if (load.state === 'loading') return <div className="ad-page"><div className="ad-card-box ad-card-box__body afm-pad"><Skeleton title lines={8} label="Loading the form" /></div></div>;
  if (load.state === 'denied') return <div className="ad-page"><PermissionState body={load.message} /></div>;
  if (load.state === 'error') return <div className="ad-page"><LoadFailure title="The form could not be loaded" body={load.message} onRetry={() => { setLoad({ state: 'loading' }); void loadForm(); }} compact={false} /></div>;
  if (load.state === 'missing' || !definition || !form) {
    return (
      <div className="ad-page">
        <EmptyState boxed icon="search" title="This form was not found" body="It may have been removed from this list, or the link is wrong."
          actions={<ButtonLink to="/forms" variant="primary" icon="grid">All forms</ButtonLink>} />
      </div>
    );
  }

  const title = definition.title || 'Untitled form';
  const saveState = readOnly ? 'readonly' : saving ? 'saving' : save.state === 'error' ? 'error' : dirty ? 'dirty' : 'saved';
  const issueCount = issues.length;

  return (
    <div className="ad-page afm-builder-page">
      {announcer}
      <PageHeader
        kicker={<Link to="/forms" className="ts-link"><Icon name="back" /> All forms</Link>}
        title={title}
        description={readOnly
          ? `Version ${live?.version ?? form.currentVersion ?? '—'} is live. Published versions cannot be changed; start a new version to edit.`
          : `Draft version ${draft?.version}${live ? ` · version ${live.version} stays live until this one is published` : ' · not published yet'}`}
        meta={<div className="afm-head-meta">
          <FormStatusBadge status={form.status} />
          {draft ? <Badge tone="accent">Draft v{draft.version}</Badge> : null}
          <SaveIndicator state={saveState} savedAt={save.at} />
          {!readOnly && draft ? <span className="ts-hint">Last saved by {draft.updatedByName || 'an administrator'} · {dateTime(draft.updatedAt)}</span> : null}
        </div>}
        actions={readOnly ? <>
          <ButtonLink to={responsesPath(formId)} icon="inbox">Responses</ButtonLink>
          {access?.canManage && form.status !== 'archived' ? <Button variant="primary" icon="edit" busy={busy === 'start'} onClick={() => void startDraft()}>Edit as new version</Button> : null}
        </> : <>
          {live ? <Button variant="ghost" icon="trash" busy={busy === 'discard'} disabled={Boolean(busy)} onClick={() => void discardDraft()}>Discard draft</Button> : null}
          <Button icon="check" busy={saving} disabled={!dirty && save.state !== 'error'} onClick={() => void saveDraft()} aria-keyshortcuts="Control+S Meta+S">Save draft</Button>
          <Button variant="primary" icon="send" disabled={saving} onClick={() => void openPublish()}>Publish…</Button>
        </>}
      />

      {conflict ? (
        <Notice tone="danger" title={`${conflict.updatedByName} saved this draft${conflict.updatedAt ? ` at ${dateTime(conflict.updatedAt)}` : ''}`} role="alert"
          action={<div className="afm-actions">
            <Button size="sm" onClick={() => void loadTheirs()}>Load their version</Button>
            <Button size="sm" variant="primary" busy={saving} onClick={() => void saveDraft({ overwrite: true })}>Keep mine and save over it</Button>
          </div>}>
          Your changes are still here and have not been saved. Load their version to continue from what they saved, or save yours over it deliberately.
        </Notice>
      ) : save.state === 'error' && save.message ? <Notice tone="danger" role="alert">{save.message}</Notice> : null}

      {readOnly ? (
        <Notice tone="info" icon="lock" title={`Version ${live?.version ?? form.currentVersion} is live and read-only`}>
          Editing starts a new draft version. Contributors keep using version {live?.version ?? form.currentVersion} until you publish the new one, and responses already submitted keep their original questions.
        </Notice>
      ) : null}

      {!readOnly && issueCount ? (
        <details className="afm-issues">
          <summary><Icon name="alert" /> {issueCount === 1 ? '1 problem to fix before publishing' : `${issueCount} problems to fix before publishing`}</summary>
          <ul>
            {issues.map((issue, index) => (
              <li key={index}><button type="button" className="ts-link afm-linkbutton" onClick={() => showIssue(issue)}>{issue.message}</button></li>
            ))}
          </ul>
        </details>
      ) : null}

      <Tabs label="Builder views" idPrefix="afm-view" value={view} onChange={(next) => setParams({ view: next === 'build' ? null : next })}
        tabs={VIEWS.map((item) => ({
          id: item.id,
          label: item.label,
          badge: item.id === 'settings' && tabCounts.size ? <Badge tone="warning">{[...tabCounts.values()].reduce((a, b) => a + b, 0)}</Badge> : undefined,
        }))} />

      {view === 'build' ? (
        <TabPanel idPrefix="afm-view" id="build" className="afm-builder">
          <div className="afm-panes-switch" role="group" aria-label="Show">
            {!readOnly ? <button type="button" className={cx('ts-tab', pane === 'palette' && 'is-active')} aria-pressed={pane === 'palette'} onClick={() => setPane('palette')}><Icon name="plus" />Add question</button> : null}
            <button type="button" className={cx('ts-tab', pane === 'canvas' && 'is-active')} aria-pressed={pane === 'canvas'} onClick={() => setPane('canvas')}><Icon name="list" />Questions</button>
            <button type="button" className={cx('ts-tab', pane === 'field' && 'is-active')} aria-pressed={pane === 'field'} onClick={() => setPane('field')}><Icon name="settings" />Settings</button>
          </div>
          <div className={cx('afm-builder__grid', readOnly && 'is-readonly')}>
            {!readOnly ? (
              <aside className={cx('afm-pane afm-pane--palette', pane === 'palette' && 'is-active')} aria-label="Add a question">
                <h2 className="afm-pane__title">Add a question</h2>
                <Palette onAdd={addFromPalette} />
              </aside>
            ) : null}
            <div className={cx('afm-pane afm-pane--canvas', pane === 'canvas' && 'is-active')}>
              <h2 className="sr-only">Questions</h2>
              <Canvas
                definition={definition}
                readOnly={readOnly}
                selection={selection}
                onSelect={select}
                apply={apply}
                issues={issueIndex}
                onDeleteField={(fieldId) => void deleteField(definition, fieldId, apply)}
                onOpenSettings={() => setPane('field')}
              />
            </div>
            <aside className={cx('afm-pane afm-pane--settings', pane === 'field' && 'is-active')} aria-label="Settings of the selected item">
              {selection.fieldId ? (
                <FieldSettings fieldId={selection.fieldId} definition={definition} readOnly={readOnly} apply={apply} issues={issues} publishedTypes={publishedTypes} publishedOptions={publishedOptions} select={select} />
              ) : selection.sectionId ? (
                <SectionSettings sectionId={selection.sectionId} definition={definition} readOnly={readOnly} apply={apply} issues={issues} />
              ) : (
                <EmptyState compact icon="edit" title="Select a question or section" body={readOnly ? 'Its settings are shown here.' : 'Its settings open here. Add questions from the list of question types.'} />
              )}
            </aside>
          </div>
        </TabPanel>
      ) : null}

      {view === 'settings' ? (
        <TabPanel idPrefix="afm-view" id="settings">
          <FormSettings definition={definition} readOnly={readOnly} apply={apply} issues={issues} issueCounts={tabCounts} access={access} cohorts={cohorts}
            form={form} versions={versions} onRetire={(version) => void retire(version)} tab={tab} onTab={(next) => setParams({ tab: next === 'details' ? null : next })} />
        </TabPanel>
      ) : null}

      {view === 'preview' && previewDefinition ? (
        <TabPanel idPrefix="afm-view" id="preview">
          <Preview key={json} definition={previewDefinition} />
        </TabPanel>
      ) : null}

      {publish ? (
        <PublishDialog value={publish} access={access} formStatus={form.status} busy={publishBusy} error={publishError} onPublish={() => void doPublish()} onClose={() => setPublish(null)} onShowIssue={showIssue} />
      ) : null}
      {toast ? <Toast message={toast.message} tone={toast.tone} onDone={() => setToast(null)} /> : null}
      <p className="ts-hint afm-foot-note">Form id <code>{formId}</code></p>
    </div>
  );
}
