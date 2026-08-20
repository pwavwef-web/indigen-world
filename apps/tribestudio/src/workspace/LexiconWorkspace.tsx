import { useCallback, useEffect, useMemo, useState } from 'react';
import { enums } from '@indigen-world/contracts';
import lexicalEntrySchema from '@indigen-world/contracts/schemas/lexical-entry.schema.json';
import { Link } from '../router';
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
  return <span className={`badge badge--${status}`}>{STATUS_LABELS[status] ?? status}</span>;
}

/** The original contributor/validator lexicon workspace, preserved and mounted at /workspace. */
export function LexiconWorkspace() {
  const { user, role } = useAuth();
  const [tab, setTab] = useState<'contribute' | 'review'>('contribute');
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const flash = useCallback((kind: 'ok' | 'err', text: string) => {
    setToast({ kind, text });
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  if (!user) return null;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <Link to="/studio" className="button button--ghost button--small">← Workspace</Link>
          <span className="brand__text">
            <strong>Lexicon workspace</strong>
            <small>Contribute &amp; validate</small>
          </span>
        </div>
        <div className="topbar__account">
          <span className="account-name">
            {user.displayName ?? user.email}
            {role ? <span className="role-chip">{role}</span> : null}
          </span>
        </div>
      </header>

      <nav className="tabs">
        <button type="button" className={tab === 'contribute' ? 'tab is-active' : 'tab'} onClick={() => setTab('contribute')}>
          Contribute
        </button>
        {canValidate(role) ? (
          <button type="button" className={tab === 'review' ? 'tab is-active' : 'tab'} onClick={() => setTab('review')}>
            Review queue
          </button>
        ) : null}
      </nav>

      <main className="content">
        {tab === 'contribute' && canContribute(role) ? (
          <ContributeTab role={role} uid={user.uid} flash={flash} />
        ) : tab === 'contribute' ? (
          <section className="panel">
            <h2>Contributor access required</h2>
            <p className="notice">An administrator must grant your account a contributor role before these controls are available.</p>
          </section>
        ) : (
          <ReviewTab flash={flash} />
        )}
      </main>

      {toast ? <div className={`toast toast--${toast.kind}`}>{toast.text}</div> : null}
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
  const [form, setForm] = useState<EntryInput>(() => emptyForm('kasem'));
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
      if (langs.length > 0) setForm((f) => ({ ...f, languageId: langs[0].id }));
    });
    void loadEntries();
  }, [loadEntries]);

  const update = <K extends keyof EntryInput>(key: K, value: EntryInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const valid = form.headword.trim() && form.definition.trim();

  const save = async (status: 'draft' | 'submitted') => {
    if (!valid) {
      flash('err', 'A headword and definition are required.');
      return;
    }
    if (status === 'submitted' && !form.consentGranted) {
      flash('err', 'Please confirm consent before submitting for review.');
      return;
    }
    setBusy(true);
    try {
      await createEntry(uid, form, status);
      flash('ok', status === 'submitted' ? 'Submitted for validation.' : 'Draft saved.');
      setForm(emptyForm(form.languageId));
      await loadEntries();
    } catch (err) {
      flash('err', err instanceof Error ? err.message : 'Save failed.');
    } finally {
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
    <div className="grid">
      <section className="panel">
        <h2>Add a Kasem entry</h2>
        {!canContribute(role) ? (
          <p className="notice">
            Your account does not yet have contributor access. An administrator must grant a role
            before submissions will be accepted.
          </p>
        ) : null}

        <div className="field">
          <label htmlFor="headword">Headword *</label>
          <input id="headword" value={form.headword} onChange={(e) => update('headword', e.target.value)} placeholder="e.g. nia" />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="pos">Part of speech</label>
            <select id="pos" value={form.partOfSpeech} onChange={(e) => update('partOfSpeech', e.target.value)}>
              {PARTS_OF_SPEECH.map((p) => (<option key={p} value={p}>{p}</option>))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="lang">Language</label>
            <select id="lang" value={form.languageId} onChange={(e) => update('languageId', e.target.value)}>
              {languageOptions.map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="def">Definition *</label>
          <textarea id="def" value={form.definition} onChange={(e) => update('definition', e.target.value)} placeholder="Meaning in plain language" />
        </div>

        <div className="field">
          <label htmlFor="en">English translation</label>
          <input id="en" value={form.englishTranslation} onChange={(e) => update('englishTranslation', e.target.value)} placeholder="e.g. water" />
        </div>

        <div className="field">
          <label htmlFor="ex">Example sentence</label>
          <input id="ex" value={form.example} onChange={(e) => update('example', e.target.value)} placeholder="e.g. Nia pe yogo." />
        </div>

        <div className="field">
          <label htmlFor="tier">Cultural permission</label>
          <select id="tier" value={form.culturalPermissionTier} onChange={(e) => update('culturalPermissionTier', e.target.value)}>
            {TIERS.map((t) => (<option key={t} value={t}>{TIER_LABELS[t] ?? t}</option>))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="licence">Publication licence</label>
          <select id="licence" value={form.licence} onChange={(e) => update('licence', e.target.value)}>
            {LICENCES.map((licence) => (<option key={licence} value={licence}>{licence.replaceAll('_', ' ')}</option>))}
          </select>
        </div>

        <label className="checkbox">
          <input type="checkbox" checked={form.consentGranted} onChange={(e) => update('consentGranted', e.target.checked)} />
          I confirm I have the right to contribute this and consent to its publication review under the selected licence.
        </label>

        <div className="actions">
          <button type="button" className="button button--ghost-dark" disabled={busy} onClick={() => void save('draft')}>Save draft</button>
          <button type="button" className="button button--primary" disabled={busy} onClick={() => void save('submitted')}>Submit for review</button>
        </div>
      </section>

      <section className="panel">
        <h2>My submissions</h2>
        {entries.length === 0 ? (
          <p className="notice">No submissions yet.</p>
        ) : (
          <ul className="list">
            {entries.map((e) => (
              <li key={e.id} className="list__item">
                <div>
                  <strong>{e.headword}</strong>
                  <span className="muted"> · {e.partOfSpeech}</span>
                  <p className="muted">{e.senses[0]?.definition}</p>
                </div>
                <div className="list__side">
                  <StatusBadge status={e.governance.validationStatus} />
                  {['draft', 'needs_changes'].includes(e.governance.validationStatus) ? (
                    <button type="button" className="button button--small" onClick={() => void resubmit(e)}>Submit</button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ReviewTab({ flash }: { flash: (kind: 'ok' | 'err', text: string) => void }) {
  const [queue, setQueue] = useState<LexicalEntryDoc[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});

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
      flash('ok', `Recorded: ${res.newStatus}.`);
      await load();
    } catch (err) {
      flash('err', err instanceof Error ? err.message : 'Decision failed.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="panel">
      <h2>Validation queue</h2>
      <p className="panel__hint">Submitted entries awaiting a validator decision.</p>
      {loading ? (
        <p className="notice">Loading…</p>
      ) : queue.length === 0 ? (
        <p className="notice">The queue is empty.</p>
      ) : (
        <ul className="list">
          {queue.map((e) => (
            <li key={e.id} className="list__item">
              <div>
                <strong>{e.headword}</strong>
                <span className="muted"> · {e.partOfSpeech}</span>
                <p className="muted">{e.senses[0]?.definition}</p>
                <p className="tiny">
                  {TIER_LABELS[e.governance.culturalPermissionTier] ?? e.governance.culturalPermissionTier} · contributor {e.governance.contributor.id}
                </p>
              </div>
              <div className="list__side list__side--stack">
                <label htmlFor={`review-${e.id}`} className="tiny">Required review reason</label>
                <textarea id={`review-${e.id}`} value={notes[e.id] ?? ''} minLength={10} maxLength={2000} onChange={(event) => setNotes((current) => ({ ...current, [e.id]: event.target.value }))} />
                <button type="button" className="button button--small button--approve" disabled={busyId === e.id || (notes[e.id]?.trim().length ?? 0) < 10} onClick={() => void decide(e.id, 'approved')}>Approve</button>
                <button type="button" className="button button--small" disabled={busyId === e.id || (notes[e.id]?.trim().length ?? 0) < 10} onClick={() => void decide(e.id, 'needs_changes')}>Needs changes</button>
                <button type="button" className="button button--small button--reject" disabled={busyId === e.id || (notes[e.id]?.trim().length ?? 0) < 10} onClick={() => void decide(e.id, 'rejected')}>Reject</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
