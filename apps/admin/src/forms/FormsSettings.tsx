import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { FORM_LIMITS } from '@indigen-world/contracts/forms';
import type { Cohort, FormsAccess } from '@indigen-world/contracts/forms-api';
import { Badge, Button, Dialog, EmptyState, Field, LoadFailure, Notice, PageHeader, Panel, PermissionState, Skeleton, Toast } from '../ui/primitives';
import { callError, errorMessage, errorUnknown, formsAdmin, isConflict, isDenied } from './data';
import { dateOnly, dateTime } from './format';
import { NumberInput, Switch } from './ui';
import './forms.css';

/* ==========================================================================
   Forms settings: named cohorts for audience targeting, who may publish and
   export (edited only by the owner super administrator), and the points
   limits Finance sets. Each part is read-only for anyone who may not change
   it, with the reason shown.
   ========================================================================== */

type Load =
  | { state: 'loading' }
  | { state: 'ready'; access: FormsAccess; cohorts: Cohort[] }
  | { state: 'denied'; message: string }
  | { state: 'error'; message: string };

/** One entry per line (or comma): account emails or ids. Identifiers, not prose, so surrounding spaces are dropped. */
function entries(text: string): string[] {
  return [...new Set(text.split(/[\n,]/).map((line) => line.trim()).filter(Boolean))];
}

export function FormsSettings() {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [editing, setEditing] = useState<Cohort | 'new' | null>(null);
  const [unknown, setUnknown] = useState<{ cohort: string; entries: string[] } | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'danger' | 'info' } | null>(null);

  const reload = useCallback(async () => {
    try {
      const [access, cohorts] = await Promise.all([formsAdmin({ action: 'access' }), formsAdmin({ action: 'listCohorts' })]);
      setLoad({ state: 'ready', access, cohorts: cohorts.cohorts });
    } catch (reason) {
      setLoad(isDenied(reason) ? { state: 'denied', message: errorMessage(reason, 'Forms settings need an admin role.') } : { state: 'error', message: errorMessage(reason, 'Forms settings could not be loaded.') });
    }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  return (
    <div className="ad-page">
      <PageHeader title="Forms settings" description="Cohorts for targeting forms, who may publish and export, and Finance’s points limits." />
      {load.state === 'loading' ? <div className="ad-card-box ad-card-box__body afm-pad"><Skeleton title lines={6} label="Loading forms settings" /></div> : null}
      {load.state === 'denied' ? <PermissionState body={load.message} /> : null}
      {load.state === 'error' ? <LoadFailure title="Forms settings could not be loaded" body={load.message} onRetry={() => void reload()} compact={false} /> : null}
      {load.state === 'ready' ? (
        <div className="afm-settings-page">
          <Panel title="Cohorts" description="Named groups of contributors. A form whose audience is “Chosen groups” can be limited to them."
            actions={load.access.canManage ? <Button size="sm" variant="primary" icon="plus" onClick={() => setEditing('new')}>New cohort</Button> : undefined}>
            {unknown ? (
              <Notice tone="warning" title={`Some entries for “${unknown.cohort}” were not found`} action={<Button size="sm" variant="ghost" onClick={() => setUnknown(null)}>Dismiss</Button>}>
                These were not added, because no contributor account matches them: {unknown.entries.join(', ')}. Check the spelling, or ask the person to sign in to the contributor portal first.
              </Notice>
            ) : null}
            {load.cohorts.length ? (
              <ul className="afm-cohorts">
                {load.cohorts.map((cohort) => (
                  <li key={cohort.id} className="afm-cohort">
                    <div className="afm-cohort__copy">
                      <strong>{cohort.name}</strong>
                      {cohort.description ? <span>{cohort.description}</span> : null}
                      <small className="ts-hint">{cohort.memberCount} {cohort.memberCount === 1 ? 'member' : 'members'} · updated {dateOnly(cohort.updatedAt)} · id <code>{cohort.id}</code></small>
                    </div>
                    {load.access.canManage ? <Button size="sm" variant="secondary" icon="edit" onClick={() => setEditing(cohort)} aria-label={`Edit cohort ${cohort.name}`}>Edit</Button> : null}
                  </li>
                ))}
              </ul>
            ) : <EmptyState compact icon="users" title="No cohorts yet" body="Create one to target a form at a named list of contributors, such as a workshop group." />}
          </Panel>

          <AccessPanel access={load.access} onSaved={(access) => { setLoad({ ...load, access }); setToast({ message: 'Publishing and export access saved.', tone: 'success' }); }} />
          <PointsPanel access={load.access} onSaved={(access) => { setLoad({ ...load, access }); setToast({ message: 'Points limits saved.', tone: 'success' }); }} />
        </div>
      ) : null}

      {editing ? (
        <CohortDialog cohort={editing === 'new' ? null : editing} onClose={() => setEditing(null)}
          onSaved={async (cohort, notFound) => {
            setEditing(null);
            setUnknown(notFound.length ? { cohort: cohort.name, entries: notFound } : null);
            setToast({ message: `Cohort “${cohort.name}” saved with ${cohort.memberCount} ${cohort.memberCount === 1 ? 'member' : 'members'}.`, tone: 'success' });
            await reload();
          }} />
      ) : null}
      {toast ? <Toast message={toast.message} tone={toast.tone} onDone={() => setToast(null)} /> : null}
    </div>
  );
}

function CohortDialog({ cohort, onClose, onSaved }: { cohort: Cohort | null; onClose: () => void; onSaved: (cohort: Cohort, unknown: string[]) => void }) {
  const [name, setName] = useState(cohort?.name ?? '');
  const [description, setDescription] = useState(cohort?.description ?? '');
  const [members, setMembers] = useState('');
  // An existing cohort's members are replaced as a whole, so it saves only once they have loaded, and
  // with the version they were loaded at: a list that never loaded, or that someone changed since, is never saved over.
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loading, setLoading] = useState(Boolean(cohort));
  const [loadError, setLoadError] = useState('');
  const [changedAt, setChangedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState<string[]>([]);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!cohort) return;
    let alive = true;
    setLoading(true);
    setLoadError('');
    formsAdmin({ action: 'getCohort', cohortId: cohort.id }).then((result) => {
      if (!alive) return;
      setMembers((result.cohort.members ?? []).map((member) => member.email || member.uid).join('\n'));
      setLoadedAt(result.cohort.updatedAt);
      setChangedAt(null);
      setLoading(false);
    }, (reason) => {
      if (!alive) return;
      setLoadError(errorMessage(reason, 'The members could not be loaded.'));
      setLoading(false);
    });
    return () => { alive = false; };
  }, [cohort, loadAttempt]);

  const membersReady = !cohort || loadedAt !== null;

  const save = async (overwriteAt?: string) => {
    setTouched(true);
    if (!name.trim() || busy || loading || !membersReady) return;
    setBusy(true);
    setError('');
    setNotFound([]);
    try {
      const result = await formsAdmin({
        action: 'saveCohort', cohortId: cohort?.id ?? null, name, description, members: entries(members),
        ...(cohort ? { expectedUpdatedAt: overwriteAt ?? loadedAt } : {}),
      });
      onSaved(result.cohort, result.unknown ?? []);
    } catch (reason) {
      if (isConflict(reason)) {
        const updatedAt = callError(reason).details?.updatedAt;
        setChangedAt(typeof updatedAt === 'string' ? updatedAt : '');
      } else {
        const unknown = errorUnknown(reason);
        setNotFound(unknown);
        setError(unknown.length ? 'Nothing was saved, because some entries do not match a contributor account.' : errorMessage(reason, 'The cohort could not be saved.'));
      }
      setBusy(false);
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void save();
  };
  const count = entries(members).length;
  const formId = 'afm-cohort-form';
  const membersHint = loading ? 'Loading members…'
    : !membersReady ? 'The current members could not be loaded, so this cohort cannot be saved yet: saving now would replace them.'
      : `One per line: the contributor’s email address or account id. ${count} ${count === 1 ? 'entry' : 'entries'}. Entries that match no account are listed back, never guessed.`;
  return (
    <Dialog title={cohort ? `Edit cohort “${cohort.name}”` : 'New cohort'} size="lg" busy={busy} onClose={onClose}
      footer={<>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="primary" type="submit" form={formId} busy={busy} disabled={loading || !membersReady || changedAt !== null}>Save cohort</Button>
      </>}>
      <form id={formId} className="ts-stack" onSubmit={submit} noValidate>
        {loadError && !membersReady ? (
          <Notice tone="danger" role="alert" title="The members could not be loaded"
            action={<Button size="sm" busy={loading} onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Retry</Button>}>
            {loadError}
          </Notice>
        ) : null}
        {changedAt !== null ? (
          <Notice tone="danger" role="alert" title={`Another administrator changed this cohort${changedAt ? ` at ${dateTime(changedAt)}` : ''}`}
            action={<div className="afm-actions">
              <Button size="sm" disabled={busy} onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Load their members</Button>
              {changedAt ? <Button size="sm" variant="primary" busy={busy} onClick={() => void save(changedAt)}>Save mine over theirs</Button> : null}
            </div>}>
            Nothing was saved and your list is still here. Load their members to start again from what they saved (your edits to the list are replaced), or save yours over theirs deliberately.
          </Notice>
        ) : null}
        <Field label="Name" required error={touched && !name.trim() ? 'Give the cohort a name.' : undefined}>
          <input className="ts-input" value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Description" optional hint="Who is in it and why, for other administrators.">
          <input className="ts-input" value={description} onChange={(event) => setDescription(event.target.value)} />
        </Field>
        <Field label="Members" hint={membersHint}>
          <textarea className="ts-textarea ts-input--mono" rows={8} value={members} disabled={loading || !membersReady} spellCheck={false} onChange={(event) => setMembers(event.target.value)} />
        </Field>
        {notFound.length ? <Notice tone="warning" title="Not found">{notFound.join(', ')}</Notice> : null}
        {error ? <Notice tone="danger" role="alert">{error}</Notice> : null}
      </form>
    </Dialog>
  );
}

function AccessPanel({ access, onSaved }: { access: FormsAccess; onSaved: (access: FormsAccess) => void }) {
  const [publishers, setPublishers] = useState(access.publishers.map((person) => person.uid).join('\n'));
  const [exporters, setExporters] = useState(access.exporters.map((person) => person.uid).join('\n'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const editable = access.canConfigureAccess;
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editable || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await formsAdmin({ action: 'saveAccess', publishers: entries(publishers), exporters: entries(exporters) });
      setPublishers(result.publishers.map((person) => person.uid).join('\n'));
      setExporters(result.exporters.map((person) => person.uid).join('\n'));
      onSaved(result);
    } catch (reason) {
      const unknown = errorUnknown(reason);
      setError(unknown.length ? `Nothing was saved. These entries match no administrator account: ${unknown.join(', ')}.` : errorMessage(reason, 'Access could not be saved.'));
    } finally {
      setBusy(false);
    }
  };
  const people = (list: FormsAccess['publishers']) => (list.length ? list.map((person) => person.name || person.uid).join(', ') : 'Every administrator');
  return (
    <Panel title="Who can publish and export" description="An empty list means every administrator may do it. Building forms, reviewing and managing cohorts are open to every administrator.">
      <div className="afm-stack">
        <div className="afm-badges">
          <Badge tone={access.canPublish ? 'success' : 'neutral'}>{access.canPublish ? 'You can publish' : 'You cannot publish'}</Badge>
          <Badge tone={access.canExport ? 'success' : 'neutral'}>{access.canExport ? 'You can export' : 'You cannot export'}</Badge>
        </div>
        {editable ? (
          <form className="afm-stack" onSubmit={(event) => void save(event)}>
            <div className="afm-grid-2">
              <Field label="Publishers" hint={`Now: ${people(access.publishers)}. One administrator email or account id per line.`}>
                <textarea className="ts-textarea ts-input--mono" rows={5} value={publishers} spellCheck={false} onChange={(event) => setPublishers(event.target.value)} />
              </Field>
              <Field label="Exporters" hint={`Now: ${people(access.exporters)}. One administrator email or account id per line.`}>
                <textarea className="ts-textarea ts-input--mono" rows={5} value={exporters} spellCheck={false} onChange={(event) => setExporters(event.target.value)} />
              </Field>
            </div>
            {error ? <Notice tone="danger" role="alert">{error}</Notice> : null}
            <div><Button type="submit" variant="primary" busy={busy}>Save access</Button></div>
          </form>
        ) : (
          <>
            <dl className="afm-facts">
              <div><dt>Publishers</dt><dd>{people(access.publishers)}</dd></div>
              <div><dt>Exporters</dt><dd>{people(access.exporters)}</dd></div>
            </dl>
            <p className="ts-hint">Only the owner super administrator can change these lists.</p>
          </>
        )}
      </div>
    </Panel>
  );
}

function PointsPanel({ access, onSaved }: { access: FormsAccess; onSaved: (access: FormsAccess) => void }) {
  const [enabled, setEnabled] = useState(access.rewards.enabled);
  const [perResponse, setPerResponse] = useState<number | null>(access.rewards.maxPointsPerResponse);
  const [dailyCap, setDailyCap] = useState<number | null>(access.rewards.dailyCap);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const editable = access.canEditRewards;
  const invalid = perResponse === null || perResponse < 0 || perResponse > FORM_LIMITS.maxPoints || dailyCap === null || dailyCap < 0;
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editable || busy || invalid) return;
    setBusy(true);
    setError('');
    try {
      onSaved(await formsAdmin({ action: 'saveRewardSettings', enabled, maxPointsPerResponse: perResponse ?? 0, dailyCap: dailyCap ?? 0 }));
    } catch (reason) {
      setError(errorMessage(reason, 'The points limits could not be saved.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="Points limits" description="Points for approved responses go through the existing contributor points ledger, once per response. These limits apply on top of each form’s own setting.">
      {editable ? (
        <form className="afm-stack" onSubmit={(event) => void save(event)}>
          <Switch label="Forms may award points" hint="When off, approvals award nothing until Finance switches it back on." checked={enabled} onChange={setEnabled} />
          <div className="afm-grid-2">
            <Field label="Most points per response" hint={`0 to ${FORM_LIMITS.maxPoints}. A form asking for more cannot be published.`} error={perResponse !== null && (perResponse < 0 || perResponse > FORM_LIMITS.maxPoints) ? `Use 0 to ${FORM_LIMITS.maxPoints}.` : undefined}>
              <NumberInput integer value={perResponse} onValue={setPerResponse} />
            </Field>
            <Field label="Most points per contributor per day" hint="Points beyond this daily limit are not awarded.">
              <NumberInput integer value={dailyCap} onValue={setDailyCap} />
            </Field>
          </div>
          {error ? <Notice tone="danger" role="alert">{error}</Notice> : null}
          <div><Button type="submit" variant="primary" busy={busy} disabled={invalid}>Save points limits</Button></div>
        </form>
      ) : (
        <>
          <dl className="afm-facts">
            <div><dt>Forms may award points</dt><dd>{access.rewards.enabled ? 'Yes' : 'No'}</dd></div>
            <div><dt>Most per response</dt><dd>{access.rewards.maxPointsPerResponse}</dd></div>
            <div><dt>Most per contributor per day</dt><dd>{access.rewards.dailyCap}</dd></div>
          </dl>
          <p className="ts-hint">Only Finance can change these limits.</p>
        </>
      )}
    </Panel>
  );
}
