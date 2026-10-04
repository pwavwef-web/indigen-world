import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { enums } from '@indigen-world/contracts';
import lexicalEntrySchema from '@indigen-world/contracts/schemas/lexical-entry.schema.json';
import { canContribute, canValidate, useAuth, type Role } from '../auth';
import {
  createEntry,
  decideReview,
  fetchLanguages,
  fetchMyEntries,
  fetchSubmittedQueue,
  submitDraft,
  type Decision,
  type EntryInput,
  type LanguageOption,
  type LexicalEntryDoc,
} from '../data';
import { Badge, Button, EmptyState, Icon, Notice, PageHeader, Panel, Segmented, Steps, type Tone } from '../ui';
import './lexicon.css';

const PARTS_OF_SPEECH = (lexicalEntrySchema.properties.partOfSpeech.enum as string[]) ?? [];
const TIERS = enums.culturalPermissionTier;
const LICENCES = (enums.licence as string[]).filter(
  (licence) => !['undetermined', 'all_rights_reserved', 'custom'].includes(licence),
);

const TIER_LABELS: Record<string, string> = {
  public: 'Public',
  community_only: 'Community only',
  restricted: 'Restricted',
  sacred_restricted: 'Sacred / restricted',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  in_review: 'In review',
  needs_changes: 'Needs changes',
  validated: 'Validated',
  rejected: 'Rejected',
  retired: 'Retired',
};

const STATUS_TONE: Record<string, Tone> = {
  draft: 'neutral', submitted: 'info', in_review: 'info', needs_changes: 'warning', validated: 'success', rejected: 'danger', retired: 'neutral',
};

const emptyForm = (languageId: string): EntryInput => ({
  headword: '',
  partOfSpeech: PARTS_OF_SPEECH[0] ?? 'noun',
  definition: '',
  englishTranslation: '',
  example: '',
  languageId,
  culturalPermissionTier: 'public',
  consentGranted: false,
  licence: 'community_restricted',
});

function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? 'neutral'} dot>{STATUS_LABELS[status] ?? status}</Badge>;
}

/** The original contributor/validator lexicon workspace, preserved and mounted at /workspace. */
export function LexiconWorkspace() {
  const { user, role } = useAuth();
  const [tab, setTab] = useState<'contribute' | 'review'>(() => (canValidate(role) && !canContribute(role) ? 'review' : 'contribute'));
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const timer = useRef(0);

  const flash = useCallback((kind: 'ok' | 'err', text: string) => {
    setToast({ kind, text });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 4000);
  }, []);

  if (!user) return null;

  return (
    <div className="ts-page">
      <PageHeader
        kicker="Lexicon"
        title="Lexicon tools"
        description="Create lexical entries for validation, or decide on entries waiting in the validation queue."
      />
      <div className="ts-row ts-row--between" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
        <Segmented
          label="Lexicon task"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'contribute', label: 'Contribute', icon: 'pen' },
            ...(canValidate(role) ? [{ value: 'review' as const, label: 'Validation queue', icon: 'shield' as const }] : []),
          ]}
        />
        <Steps compact label="Lexical entry workflow" className="lx-steps" steps={[
          { title: 'Describe', icon: 'edit' },
          { title: 'Permissions', icon: 'lock' },
          { title: 'Validation', icon: 'shield' },
        ]} />
      </div>

      {toast ? <Notice tone={toast.kind === 'ok' ? 'success' : 'danger'} role={toast.kind === 'ok' ? 'status' : 'alert'}>{toast.text}</Notice> : null}

      <section aria-label="Lexicon task content" className="ts-enter" key={tab}>
        {tab === 'contribute' && canContribute(role) ? (
          <ContributeTab role={role} uid={user.uid} flash={flash} />
        ) : tab === 'contribute' ? (
          <EmptyState boxed icon="lock" title="Contributor access required" body="An administrator must grant your account a contributor role before these controls are available." />
        ) : (
          <ReviewTab flash={flash} />
        )}
      </section>
    </div>
  );
}

function ContributeTab({
  role,
  uid,
  flash,
}: {
  role: Role;
  uid: string;
  flash: (kind: 'ok' | 'err', text: string) => void;
}) {
  const [languages, setLanguages] = useState<LanguageOption[]>([]);
  const [form, setForm] = useState<EntryInput>(() => {
    try { const saved = JSON.parse(localStorage.getItem('tribestudio:lexicon-draft:' + uid) || 'null'); if (saved && typeof saved.headword === 'string' && typeof saved.definition === 'string') return { ...emptyForm('kasem'), ...saved }; } catch { /* Recovery is optional. */ }
    return emptyForm('kasem');
  });
  const saving = useRef(false);
  useEffect(() => { try { localStorage.setItem('tribestudio:lexicon-draft:' + uid, JSON.stringify(form)); } catch { /* Keep the editor open if storage is unavailable. */ } }, [form,uid]);
  const [entries, setEntries] = useState<LexicalEntryDoc[]>([]);
  const [busy, setBusy] = useState(false);

  const languageOptions = useMemo(
    () => (languages.length > 0 ? languages : [{ id: 'kasem', name: 'Kasem' }]),
    [languages],
  );

  const loadEntries = useCallback(async () => {
    try {
      setEntries(await fetchMyEntries(uid));
    } catch (err) {
      flash('err', err instanceof Error ? err.message : 'Could not load your submissions.');
    }
  }, [uid, flash]);

  useEffect(() => {
    void fetchLanguages().then((langs) => {
      setLanguages(langs);
      if (langs.length > 0) setForm((f) => ({ ...f, languageId: langs.some(lang => lang.id === f.languageId) ? f.languageId : langs[0].id }));
    });
    void loadEntries();
  }, [loadEntries]);

  const update = <K extends keyof EntryInput>(key: K, value: EntryInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const valid = form.headword.trim() && form.definition.trim();

  const save = async (status: 'draft' | 'submitted') => {
    if (saving.current) return;
    if (!valid) {
      flash('err', 'A headword and definition are required.');
      return;
    }
    if (status === 'submitted' && !form.consentGranted) {
      flash('err', 'Please confirm consent before submitting for review.');
      return;
    }
    saving.current = true;
    setBusy(true);
    try {
      await createEntry(uid, form, status);
      flash('ok', status === 'submitted' ? 'Submitted for validation.' : 'Draft saved.');
      setForm(emptyForm(form.languageId));
      await loadEntries();
    } catch (err) {
      flash('err', err instanceof Error ? err.message : 'Save failed.');
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  const resubmit = async (entry: LexicalEntryDoc) => {
    if (entry.governance.consentStatus !== 'granted') {
      const confirmed = window.confirm(
        'I confirm I have the right to contribute this material and consent to publication review under the selected licence.',
      );
      if (!confirmed) return;
    }
    try {
      await submitDraft(entry, uid);
      flash('ok', 'Draft submitted for validation.');
      await loadEntries();
    } catch (err) {
      flash('err', err instanceof Error ? err.message : 'Submit failed.');
    }
  };

  return (
    <div className="ts-split ts-split--even">
      <Panel title="Add a Kasem entry" description="Kept in this browser until you save it.">
        {!canContribute(role) ? (
          <Notice tone="warning">Your account does not yet have contributor access. An administrator must grant a role before submissions will be accepted.</Notice>
        ) : null}
        <div className="ts-stack ts-stack--md">
          <label className="ts-field" htmlFor="headword">
            <span className="ts-label">Headword <span className="ts-required" aria-hidden="true">*</span></span>
            <input className="ts-input" id="headword" lang="xsm" value={form.headword} onChange={(e) => update('headword', e.target.value)} placeholder="e.g. nia" />
          </label>
          <div className="lx-pair">
            <label className="ts-field" htmlFor="pos">
              <span className="ts-label">Part of speech</span>
              <select className="ts-select" id="pos" value={form.partOfSpeech} onChange={(e) => update('partOfSpeech', e.target.value)}>
                {PARTS_OF_SPEECH.map((p) => (<option key={p} value={p}>{p}</option>))}
              </select>
            </label>
            <label className="ts-field" htmlFor="lang">
              <span className="ts-label">Language</span>
              <select className="ts-select" id="lang" value={form.languageId} onChange={(e) => update('languageId', e.target.value)}>
                {languageOptions.map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}
              </select>
            </label>
          </div>
          <label className="ts-field" htmlFor="def">
            <span className="ts-label">Definition <span className="ts-required" aria-hidden="true">*</span></span>
            <textarea className="ts-textarea" id="def" value={form.definition} onChange={(e) => update('definition', e.target.value)} placeholder="Meaning in plain language" />
          </label>
          <div className="lx-pair">
            <label className="ts-field" htmlFor="en">
              <span className="ts-label">English translation</span>
              <input className="ts-input" id="en" value={form.englishTranslation} onChange={(e) => update('englishTranslation', e.target.value)} placeholder="e.g. water" />
            </label>
            <label className="ts-field" htmlFor="ex">
              <span className="ts-label">Example sentence</span>
              <input className="ts-input" id="ex" lang="xsm" value={form.example} onChange={(e) => update('example', e.target.value)} placeholder="A real Kasem sentence" />
            </label>
          </div>
          <div className="lx-pair">
            <label className="ts-field" htmlFor="tier">
              <span className="ts-label">Cultural permission</span>
              <select className="ts-select" id="tier" value={form.culturalPermissionTier} onChange={(e) => update('culturalPermissionTier', e.target.value)}>
                {TIERS.map((t) => (<option key={t} value={t}>{TIER_LABELS[t] ?? t}</option>))}
              </select>
            </label>
            <label className="ts-field" htmlFor="licence">
              <span className="ts-label">Publication licence</span>
              <select className="ts-select" id="licence" value={form.licence} onChange={(e) => update('licence', e.target.value)}>
                {LICENCES.map((licence) => (<option key={licence} value={licence}>{licence.replaceAll('_', ' ')}</option>))}
              </select>
            </label>
          </div>
          <label className="ts-check ts-check--card ts-check--required">
            <input type="checkbox" checked={form.consentGranted} onChange={(e) => update('consentGranted', e.target.checked)} />
            <span className="ts-check__copy"><strong>Consent to publication review</strong><small>I confirm I have the right to contribute this and consent to its publication review under the selected licence. Required to submit.</small></span>
          </label>
          <div className="ts-panel__foot">
            <span className="ts-hint">Submitted entries go to the validation queue.</span>
            <div className="ts-cluster">
              <Button disabled={busy} onClick={() => void save('draft')}>Save draft</Button>
              <Button variant="primary" iconRight="send" busy={busy} onClick={() => void save('submitted')}>Submit for review</Button>
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="My submissions" description="Drafts and entries returned with changes can be submitted from here.">
        {entries.length === 0 ? (
          <EmptyState compact icon="book" title="No submissions yet" body="Entries you save or submit appear here with their validation status." />
        ) : (
          <ul className="ts-list">
            {entries.map((e) => (
              <li key={e.id}>
                <div className="ts-list__row">
                  <span className="ts-list__lead" aria-hidden="true"><Icon name="book" /></span>
                  <span className="ts-list__main">
                    <span className="ts-list__title" lang="xsm">{e.headword} <span className="ts-faint" style={{ fontWeight: 400 }}>· {e.partOfSpeech}</span></span>
                    <span className="ts-list__meta">{e.senses[0]?.definition}</span>
                  </span>
                  <span className="ts-list__trail">
                    <StatusBadge status={e.governance.validationStatus} />
                    {['draft', 'needs_changes'].includes(e.governance.validationStatus) ? (
                      <Button size="sm" variant="soft" onClick={() => void resubmit(e)}>Submit</Button>
                    ) : null}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function ReviewTab({ flash }: { flash: (kind: 'ok' | 'err', text: string) => void }) {
  const [queue, setQueue] = useState<LexicalEntryDoc[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [filterTier, setFilterTier] = useState<string>('all');
  const [inspectingId, setInspectingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setQueue(await fetchSubmittedQueue());
    } catch (err) {
      flash('err', err instanceof Error ? err.message : 'Could not load the queue.');
    } finally {
      setLoading(false);
    }
  }, [flash]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (id: string, decision: Decision) => {
    setBusyId(id);
    try {
      const reason = notes[id]?.trim() ?? '';
      const res = await decideReview(id, decision, reason, decision === 'needs_changes' ? [reason] : []);
      flash('ok', `Recorded decision: ${res.newStatus}.`);
      await load();
    } catch (err) {
      flash('err', err instanceof Error ? err.message : 'Decision failed.');
    } finally {
      setBusyId(null);
    }
  };

  const filteredQueue = queue.filter(
    (e) => filterTier === 'all' || e.governance.culturalPermissionTier === filterTier,
  );

  return (
    <div className="ts-stack">
      <div className="ts-toolbar">
        <div className="ts-stack" style={{ ['--gap' as string]: '0.15rem', flex: '1 1 18rem' }}>
          <h2 className="ts-section-head__title">Elder &amp; custodian validation queue</h2>
          <p className="ts-hint">Review submitted lexical entries for dialect fidelity, orthography and cultural permission.</p>
        </div>
        <label htmlFor="tier-filter" className="ts-row" style={{ gap: '0.5rem' }}>
          <span className="ts-hint">Tier</span>
          <select className="ts-select ts-select--sm" id="tier-filter" value={filterTier} onChange={(e) => setFilterTier(e.target.value)}>
            <option value="all">All tiers ({queue.length})</option>
            {TIERS.map((t) => (
              <option key={t} value={t}>{TIER_LABELS[t] ?? t}</option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <div className="ts-panel"><div className="ts-skeleton" role="status" aria-label="Loading validation queue"><span className="ts-skel ts-skel--title" /><span className="ts-skel ts-skel--line" /><span className="ts-skel ts-skel--line" style={{ width: '72%' }} /></div></div>
      ) : filteredQueue.length === 0 ? (
        <EmptyState boxed icon="check" tone="success" title="The validation queue is clear" body="No entries are awaiting review at this tier." />
      ) : (
        <ul className="lx-queue ts-stagger">
          {filteredQueue.map((e) => {
            const isInspecting = inspectingId === e.id;
            const note = notes[e.id] ?? '';
            const noteShort = note.trim().length < 10;
            return (
              <li key={e.id} className="ts-panel lx-entry">
                <div className="lx-entry__main">
                  <div className="ts-cluster">
                    <strong className="lx-entry__headword" lang="xsm">{e.headword}</strong>
                    <Badge>{e.partOfSpeech}</Badge>
                    <Badge tone={e.governance.culturalPermissionTier === 'public' ? 'success' : 'warning'} dot>
                      {TIER_LABELS[e.governance.culturalPermissionTier] ?? e.governance.culturalPermissionTier}
                    </Badge>
                  </div>
                  <p className="lx-entry__definition">{e.senses[0]?.definition}</p>
                  {isInspecting ? (
                    <dl className="ts-facts ts-enter">
                      <div className="ts-fact"><dt>English translation</dt><dd>{e.senses[0]?.translations?.[0]?.text || '—'}</dd></div>
                      <div className="ts-fact"><dt>Example in Kasem</dt><dd lang="xsm">{e.senses[0]?.examples?.[0] || '—'}</dd></div>
                      <div className="ts-fact"><dt>Contributor &amp; consent</dt><dd>{e.governance.contributor.id} · {e.governance.consentStatus}</dd></div>
                    </dl>
                  ) : null}
                  <button type="button" className="ts-link" aria-expanded={isInspecting} onClick={() => setInspectingId(isInspecting ? null : e.id)}>
                    <Icon name={isInspecting ? 'up' : 'eye'} />{isInspecting ? 'Hide details' : 'Inspect translation, example and consent'}
                  </button>
                </div>

                <div className="lx-entry__decide">
                  <label className="ts-field" htmlFor={`review-${e.id}`}>
                    <span className="ts-label">Review notes <span className="ts-required" aria-hidden="true">*</span></span>
                    <textarea
                      className="ts-textarea"
                      id={`review-${e.id}`}
                      value={note}
                      minLength={10}
                      maxLength={2000}
                      placeholder="Feedback, a correction, or the reason for approval"
                      onChange={(event) => setNotes((current) => ({ ...current, [e.id]: event.target.value }))}
                    />
                    <small className={noteShort && note.length ? 'ts-error' : undefined}>{noteShort ? `At least 10 characters (${note.trim().length}/10) before a decision.` : 'Shared with the contributor.'}</small>
                  </label>
                  <div className="lx-decisions" role="group" aria-label={`Decision for ${e.headword}`}>
                    <Button size="sm" className="lx-decision lx-decision--approve" icon="check" disabled={busyId === e.id || noteShort} onClick={() => void decide(e.id, 'approved')}>Approve</Button>
                    <Button size="sm" className="lx-decision lx-decision--changes" icon="refresh" disabled={busyId === e.id || noteShort} onClick={() => void decide(e.id, 'needs_changes')}>Needs changes</Button>
                    <Button size="sm" className="lx-decision lx-decision--reject" icon="x-circle" disabled={busyId === e.id || noteShort} onClick={() => void decide(e.id, 'rejected')}>Reject</Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
