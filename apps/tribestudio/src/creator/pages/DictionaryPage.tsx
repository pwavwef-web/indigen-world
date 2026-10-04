/**
 * The dictionary desk: write a full Kasem entry, and see it as a learner will.
 *
 * ── What this replaces, and why it is a new page ─────────────────────────
 * The old lexicon workspace modelled an entry as six strings — headword, one
 * word class, one definition, one English translation, one example. Everything
 * the archive learned about Kasem entries since then lived only on the phone:
 * the paradigm that the noun class is induced from, the IPA, the meaning
 * stated in Kasem, the etymology, the other classes a word is used as, and the
 * several senses a word carries. The person best placed to write a careful
 * entry — somebody at a desk, with a keyboard and a reference open — had the
 * worst tool in the project.
 *
 * ── The two-column shape is the point ────────────────────────────────────
 * A contributor filling in eleven paradigm slots has no idea what any of it
 * will look like, and a lexicographer who cannot see the page they are setting
 * makes decisions that read badly. The right-hand column is not a nicety: it
 * is the same layout the mobile entry screen draws, from the same fields, so
 * "what will a learner see" is answered while the entry is being written
 * rather than after it is published.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { enums } from '@indigen-world/contracts';
import { useAuth } from '../../auth';
import {
  type EntryDraft,
  type SenseDraft,
  FORM_SLOTS,
  MAX_SENSES,
  PARTS_OF_SPEECH,
  SENSE_DOMAINS,
  SENSE_REGISTERS,
  articleIn,
  clearDraft,
  completeness,
  domainLabel,
  emptyDraft,
  emptySense,
  formGroupsFor,
  loadDraft,
  partOfSpeechLabel,
  pronounForDefinite,
  registerLabel,
  saveDraft,
  splitList,
} from '../lexicon';
import {
  type MyDictionaryContribution,
  type PublishedHeadword,
  fetchHeadwordMatches,
  fetchMyDictionaryContributions,
  renderings,
  submitDictionaryEntry,
  withdrawDictionaryContribution,
  canWithdrawContribution,
  reviewDraft,
  type AssistCheck,
} from '../dictionary-data';
import { TableShell } from '@indigen-world/console-ui';
import { VoiceRecorder } from '../components';
import { KasemPalette, insertIntoField } from '../KasemPalette';
import { uploadSubmissionMedia } from '../data';
import { Badge, Dialog, EmptyState, Icon, Notice, PageHeader, Skeleton, Steps, type Tone } from '../../ui';

const TIERS = enums.culturalPermissionTier as readonly string[];
const TIER_LABELS: Record<string, string> = {
  public: 'Public',
  community_only: 'Community only',
  restricted: 'Restricted',
  sacred_restricted: 'Sacred / restricted',
};

const DIALECTS = ['Navrongo', 'Paga', 'Chiana', 'Other', 'Not sure'];

/** Contribution statuses as the review desk writes them, in the studio's tones. */
function statusTone(status: string): Tone {
  const value = status.toLowerCase();
  if (value === 'published' || value === 'approved') return 'success';
  if (value === 'rejected') return 'danger';
  if (value === 'needs_revision' || value === 'revision_requested') return 'warning';
  if (value === 'withdrawn') return 'neutral';
  return 'info';
}

/** The cross-class offers, kept short for the reason the mobile form keeps them short. */
function crossClassOffers(declared: string): string[] {
  switch (declared) {
    case 'noun':
    case 'proper-noun':
      return ['verb', 'adjective'];
    case 'verb':
    case 'auxiliary-verb':
      return ['noun', 'adjective'];
    case 'adjective':
      return ['noun', 'verb'];
    default:
      return [];
  }
}

export function DictionaryPage() {
  const { user } = useAuth();
  const [draft, setDraft] = useState<EntryDraft>(() => loadDraft() ?? emptyDraft());
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const sending = useRef(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [matches, setMatches] = useState<PublishedHeadword[]>([]);
  const [mine, setMine] = useState<MyDictionaryContribution[]>([]);
  const [audioPct, setAudioPct] = useState<number | null>(null);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [confirmWithdraw, setConfirmWithdraw] = useState<string | null>(null);
  const [assist, setAssist] = useState<AssistCheck[]>([]);
  const [loadingMine, setLoadingMine] = useState(true);
  const [restored] = useState(() => loadDraft() != null);

  // The field the character palette last touched. A palette that always types
  // into the headword would be useless on the eleven paradigm slots and the
  // example sentences, which are exactly the places a contributor needs it.
  const lastFocused = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const flash = useCallback((kind: 'ok' | 'err', text: string) => {
    setToast({ kind, text });
    window.setTimeout(() => setToast(null), 4500);
  }, []);

  const update = useCallback(<K extends keyof EntryDraft>(key: K, value: EntryDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  }, []);

  // Autosave. Debounced so a fast typist does not write to localStorage on
  // every keystroke, and short enough that a stray reload loses a sentence
  // rather than a session.
  useEffect(() => {
    const timer = window.setTimeout(() => saveDraft(draft), 600);
    return () => window.clearTimeout(timer);
  }, [draft]);

  const latestDraft = useRef(draft); latestDraft.current = draft;
  useEffect(() => {
    const flush = () => saveDraft(latestDraft.current);
    window.addEventListener('studio:before-navigate', flush); window.addEventListener('pagehide', flush);
    return () => { flush(); window.removeEventListener('studio:before-navigate', flush); window.removeEventListener('pagehide', flush); };
  }, []);

  // What already exists under this spelling. Debounced against typing for the
  // same reason, and it warns rather than blocks — see `fetchHeadwordMatches`.
  useEffect(() => {
    const headword = draft.headword.trim();
    if (headword.length < 2) {
      setMatches([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      void fetchHeadwordMatches(headword)
        .then((found) => {
          if (active) setMatches(found);
        })
        // A lookup that fails clears the warning rather than leaving the
        // previous headword's matches on screen. Stale duplicates are worse
        // than none: they would tell somebody their word already exists under
        // a spelling they have since changed.
        .catch(() => {
          if (active) setMatches([]);
        });
    }, 450);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [draft.headword]);

  const loadMine = useCallback(async () => {
    if (!user) return;
    setLoadingMine(true);
    try {
      setMine(await fetchMyDictionaryContributions(user.uid));
    } catch {
      flash('err', 'Your previous entries could not be loaded.');
    } finally {
      setLoadingMine(false);
    }
  }, [user, flash]);

  useEffect(() => {
    void loadMine();
  }, [loadMine]);

  const classes = useMemo(
    () => [draft.partOfSpeech, ...draft.alsoUsedAs],
    [draft.partOfSpeech, draft.alsoUsedAs],
  );
  const formGroups = useMemo(() => formGroupsFor(classes), [classes]);
  const progress = useMemo(() => completeness(draft), [draft]);

  /** Inserts a character at the cursor of whichever field was last focused. */
  const insertCharacter = (char: string) => {
    const field = lastFocused.current;
    if (!field) {
      flash('err', 'Click into a box first, then choose the letter.');
      return;
    }
    insertIntoField(field, char);
  };

  const trackFocus = (event: { currentTarget: HTMLInputElement | HTMLTextAreaElement }) => {
    lastFocused.current = event.currentTarget;
  };

  const setSense = (index: number, patch: Partial<SenseDraft>) => {
    setDraft((current) => ({
      ...current,
      senses: current.senses.map((sense, i) => (i === index ? { ...sense, ...patch } : sense)),
    }));
  };

  const addSense = () => {
    setDraft((current) =>
      current.senses.length >= MAX_SENSES
        ? current
        : { ...current, senses: [...current.senses, emptySense()] },
    );
  };

  const removeSense = (index: number) => {
    setDraft((current) =>
      current.senses.length <= 1
        ? current
        : { ...current, senses: current.senses.filter((_, i) => i !== index) },
    );
  };

  const moveSense = (index: number, delta: number) => {
    setDraft((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.senses.length) return current;
      const senses = [...current.senses];
      const [moved] = senses.splice(index, 1);
      senses.splice(target, 0, moved);
      return { ...current, senses };
    });
  };

  const setExample = (senseIndex: number, exampleIndex: number, patch: Partial<{ kasem: string; english: string }>) => {
    setDraft((current) => ({
      ...current,
      senses: current.senses.map((sense, i) =>
        i === senseIndex
          ? {
              ...sense,
              examples: sense.examples.map((example, j) =>
                j === exampleIndex ? { ...example, ...patch } : example,
              ),
            }
          : sense,
      ),
    }));
  };

  const addExample = (senseIndex: number) => {
    setDraft((current) => ({
      ...current,
      senses: current.senses.map((sense, i) =>
        i === senseIndex && sense.examples.length < 4
          ? { ...sense, examples: [...sense.examples, { kasem: '', english: '' }] }
          : sense,
      ),
    }));
  };

  const removeExample = (senseIndex: number, exampleIndex: number) => {
    setDraft((current) => ({
      ...current,
      senses: current.senses.map((sense, i) =>
        i === senseIndex && sense.examples.length > 1
          ? { ...sense, examples: sense.examples.filter((_, j) => j !== exampleIndex) }
          : sense,
      ),
    }));
  };

  const toggleAlsoUsedAs = (id: string) => {
    setDraft((current) => ({
      ...current,
      alsoUsedAs: current.alsoUsedAs.includes(id)
        ? current.alsoUsedAs.filter((value) => value !== id)
        : [...current.alsoUsedAs, id].slice(0, 4),
    }));
  };

  const canSubmit =
    Boolean(draft.headword.trim()) &&
    Boolean(draft.senses[0]?.definition.trim()) &&
    Boolean(draft.source.trim()) &&
    draft.consentGranted;

  // Debounced, because the callable is rate-limited per minute and because
  // advice that arrives on every keystroke is noise. Both sides have to carry
  // something before there is anything to judge.
  const assistKasem = draft.headword.trim();
  const assistEnglish = draft.senses[0]?.definition.trim() ?? '';
  const assistPos = draft.partOfSpeech;
  useEffect(() => {
    if (assistKasem.length < 2 || assistEnglish.length < 2) {
      setAssist([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      void reviewDraft({ kasem: assistKasem, english: assistEnglish, partOfSpeech: assistPos })
        .then((checks) => { if (active) setAssist(checks); });
    }, 800);
    return () => { active = false; window.clearTimeout(timer); };
  }, [assistKasem, assistEnglish, assistPos]);

  /**
   * Uploads a headword recording into this contributor's own submission
   * prefix, which is the only prefix submitCollectionContribution will accept.
   * The same helper the post wizard uses, with the collection campaign id.
   */
  const attachPronunciation = async (file: File) => {
    if (!user) return;
    setAudioPct(0);
    try {
      const { storagePath } = await uploadSubmissionMedia(
        user.uid,
        'collection-contributions',
        `pronunciation-${Date.now()}`,
        file,
        setAudioPct,
      );
      update('pronunciation', {
        storagePath,
        mimeType: file.type || 'audio/webm',
        sizeBytes: file.size,
        mediaType: 'audio' as const,
        name: file.name,
      });
      setAudioPct(100);
      flash('ok', 'Pronunciation attached. It will play on the published entry.');
    } catch (err) {
      setAudioPct(null);
      flash('err', err instanceof Error ? err.message : 'The recording could not be uploaded.');
    }
  };

  const withdraw = async (contributionId: string) => {
    setWithdrawing(contributionId);
    try {
      await withdrawDictionaryContribution(contributionId);
      setConfirmWithdraw(null);
      flash('ok', 'Withdrawn. It is no longer in the queue or published anywhere.');
      await loadMine();
    } catch (err) {
      flash('err', err instanceof Error ? err.message : 'That could not be withdrawn.');
    } finally {
      setWithdrawing(null);
    }
  };

  const submit = async () => {
    if (sending.current) return;
    if (!canSubmit) {
      flash(
        'err',
        !draft.headword.trim()
          ? 'The Kasem headword is required.'
          : !draft.senses[0]?.definition.trim()
            ? 'At least one meaning is required.'
            : !draft.source.trim()
              ? 'Say where this word came from.'
              : 'Confirm the rights pledge before sending.',
      );
      return;
    }
    sending.current = true; setBusy(true);
    try {
      await submitDictionaryEntry(draft);
      setReviewing(false);
      clearDraft();
      setDraft(emptyDraft());
      setMatches([]);
      flash('ok', 'Sent for review. It joins the same queue as phone contributions.');
      await loadMine();
    } catch (err) {
      flash('err', err instanceof Error ? err.message : 'The entry was not sent.');
    } finally {
      sending.current = false; setBusy(false);
    }
  };

  if (!user) return null;

  return (
    <div className="ts-page dict">
      <PageHeader
        kicker="Dictionary"
        title="Write an entry"
        description="Add a headword, meaning and source. Preview the entry as you write; optional details stay close to the word."
      />

      <div className="dict__top">
        <section className="ts-panel ts-panel--tight dict__guide" aria-label="Dictionary contribution process">
          <Steps label="Dictionary contribution process" steps={[
            { title: 'Describe the word', detail: 'Headword, meanings and examples', icon: 'book' },
            { title: 'Check the entry', detail: 'Source, permission and pronunciation', icon: 'search' },
            { title: 'Send for review', detail: 'Follow the decision in your contribution history', icon: 'shield' },
          ]} />
        </section>
      </div>

      {reviewing ? (
        <Dialog title="Review dictionary entry" lede="This remains a dictionary word. A reviewer checks it before publication." onClose={() => setReviewing(false)} busy={busy}>
          <dl className="ts-kv">
            <div><dt>Headword</dt><dd className="cr-kasem">{draft.headword}</dd></div>
            <div><dt>Meanings</dt><dd>{draft.senses.map(sense => sense.definition).filter(Boolean).join('; ')}</dd></div>
            <div><dt>Source</dt><dd>{draft.source}</dd></div>
            <div><dt>Publication permission</dt><dd>{draft.publicationPermission ? 'Granted if approved' : 'Not granted'}</dd></div>
          </dl>
          {toast?.kind === 'err' ? <p className="ts-error" role="alert"><Icon name="alert" />{toast.text}</p> : null}
          <div className="cr-dialog-actions">
            <button type="button" className="ts-btn ts-btn--ghost" disabled={busy} onClick={() => setReviewing(false)}>Back to editing</button>
            <button type="button" className="ts-btn ts-btn--primary" disabled={busy} onClick={() => void submit()}><Icon name="send" />{busy ? 'Sending…' : 'Confirm and send'}</button>
          </div>
        </Dialog>
      ) : null}
      {restored ? (
        <Notice tone="info" icon="refresh">An unfinished entry was restored from this browser. Nothing was sent.</Notice>
      ) : null}

      <div className="dict__cols">
        {/* ---------------------------------------------------------------- */}
        {/* The editor                                                        */}
        {/* ---------------------------------------------------------------- */}
        <div className="dict__editor">
          <section className="ts-panel dict__panel">
            <h2>The word</h2>

            <KasemPalette onInsert={insertCharacter} />

            <div className="ts-field">
              <label className="ts-label" htmlFor="headword">Kasem headword *</label>
              <input
                id="headword"
                value={draft.headword}
                onFocus={trackFocus}
                onChange={(e) => update('headword', e.target.value)}
                placeholder="e.g. bakeira"
                autoComplete="off"
              />
              <p className="ts-hint">
                Exactly as it is said and spelled. Several spellings of the same word can be
                separated with commas — the first becomes the headword.
              </p>
            </div>

            {assist.length > 0 ? (
              <div className="dict__assist" role="status">
                <p className="dict__assist-title"><Icon name="info" />Before you send — worth a look</p>
                <ul>
                  {assist.map((check) => (
                    <li key={check.id} className={`dict__assist-item dict__assist-item--${check.severity}`}>
                      <strong>{check.title}</strong>
                      <p>{check.detail}</p>
                      {check.entries && check.entries.length > 0 ? (
                        <p className="tiny muted">
                          {check.entries
                            .map((entry) => `${entry.kasem} — ${entry.english}`)
                            .join(' · ')}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <p className="tiny muted">
                  This is advice, not a rule. If your word is right, send it.
                </p>
              </div>
            ) : null}

            <div className="ts-field">
              <label className="ts-label" htmlFor="pronunciation">Say the word (optional)</label>
              <p className="ts-hint">
                A recording of the headword being said. It becomes the pronunciation a reader
                hears on the published entry, so a word entered at a desk is no more silent than
                one entered on a phone.
              </p>
              <VoiceRecorder onAudioReady={(file) => void attachPronunciation(file)} />
              {audioPct !== null && audioPct < 100 ? (
                <div className="upload"><div className="upload__bar"><span style={{ width: `${audioPct}%` }} /></div><span className="ts-hint">Uploading… {audioPct}%</span></div>
              ) : null}
              {draft.pronunciation ? (
                <p className="ts-file dict__asset">
                  <span className="ts-file__icon" aria-hidden="true"><Icon name="audio" /></span>
                  <span className="ts-file__name">{draft.pronunciation.name}</span>
                  <button
                    type="button"
                    className="ts-btn ts-btn--ghost ts-btn--sm"
                    onClick={() => { update('pronunciation', null); setAudioPct(null); }}
                  >
                    Remove
                  </button>
                </p>
              ) : null}
            </div>

            {matches.length > 0 ? (
              <div className="callout callout--warn dict__dupes">
                <strong>
                  {matches.length === 1
                    ? 'One entry is already written this way'
                    : `${matches.length} entries are already written this way`}
                </strong>
                <ul>
                  {matches.map((match) => (
                    <li key={match.id}>
                      <b>
                        {match.kasemText}
                        {match.homographIndex > 0 ? superscript(match.homographIndex) : ''}
                      </b>
                      <span className="muted">
                        {' '}
                        {match.partOfSpeech ? `· ${match.partOfSpeech} ` : ''}· {match.englishText}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="tiny">
                  If yours is another meaning of the same word, add it as a meaning below
                  rather than as a new entry. If it is a genuinely different word that
                  happens to be spelled the same, carry on — it will be numbered.
                </p>
              </div>
            ) : null}

            <div className="field-row">
              <div className="ts-field">
                <label className="ts-label" htmlFor="pos">Word class *</label>
                <select
                  id="pos"
                  value={draft.partOfSpeech}
                  onChange={(e) => update('partOfSpeech', e.target.value)}
                >
                  {PARTS_OF_SPEECH.map((id) => (
                    <option key={id} value={id}>
                      {partOfSpeechLabel(id)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="ts-field">
                <label className="ts-label" htmlFor="dialect">Dialect or region *</label>
                <select
                  id="dialect"
                  value={draft.dialect}
                  onChange={(e) => update('dialect', e.target.value)}
                >
                  {DIALECTS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {crossClassOffers(draft.partOfSpeech).length > 0 ? (
              <div className="ts-field">
                <p className="ts-label" id="also-used-label">Is it also used another way?</p>
                <div className="ts-chips" role="group" aria-labelledby="also-used-label">
                  {crossClassOffers(draft.partOfSpeech).map((id) => (
                    <button
                      key={id}
                      type="button"
                      className="ts-chip"
                      aria-pressed={draft.alsoUsedAs.includes(id)}
                      onClick={() => toggleAlsoUsedAs(id)}
                    >
                      {partOfSpeechLabel(id)}
                    </button>
                  ))}
                </div>
                <p className="ts-hint">
                  A Kasem word is routinely more than one class. Saying so here draws both
                  halves of its paradigm on the entry.
                </p>
              </div>
            ) : null}

            <div className="ts-field">
              <label className="ts-label" htmlFor="ipa">How it is said (IPA)</label>
              <input
                id="ipa"
                value={draft.ipa}
                onFocus={trackFocus}
                onChange={(e) => update('ipa', e.target.value)}
                placeholder="bàkéːrà"
              />
              <p className="ts-hint">
                Without the slashes — the entry adds them. The transcription is what
                survives when there is no speaker to ask.
              </p>
            </div>
          </section>

          {/* -------------------------------------------------------------- */}
          <section className="ts-panel dict__panel">
            <div className="panel__head panel__head--spread">
              <div>
                <h2>What it means</h2>
                <p className="panel__hint">
                  A word rarely means one thing. Give each meaning its own entry below so
                  its example sentence goes with it.
                </p>
              </div>
              <Badge tone="accent">{draft.senses.length} of {MAX_SENSES}</Badge>
            </div>

            {draft.senses.map((sense, index) => (
              <SenseEditor
                key={sense.key}
                sense={sense}
                index={index}
                total={draft.senses.length}
                declaredClass={draft.partOfSpeech}
                onFocusField={trackFocus}
                onChange={(patch) => setSense(index, patch)}
                onRemove={() => removeSense(index)}
                onMove={(delta) => moveSense(index, delta)}
                onExample={(exampleIndex, patch) => setExample(index, exampleIndex, patch)}
                onAddExample={() => addExample(index)}
                onRemoveExample={(exampleIndex) => removeExample(index, exampleIndex)}
              />
            ))}

            <button
              type="button"
              className="ts-btn ts-btn--secondary dict__add"
              onClick={addSense}
              disabled={draft.senses.length >= MAX_SENSES}
            >
              <Icon name="plus" />Add another meaning
            </button>
          </section>

          {/* -------------------------------------------------------------- */}
          {formGroups.size > 0 ? (
            <section className="ts-panel dict__panel">
              <h2>The forms it takes</h2>
              <p className="panel__hint">
                Questions about talking, not about grammar. The noun class is worked out
                from the answers — nobody is asked to name it.
              </p>
              {(['noun', 'verb', 'agreement'] as const)
                .filter((group) => formGroups.has(group))
                .map((group) => (
                  <div key={group} className="dict__forms">
                    <h3 className="dict__forms-title">
                      {group === 'noun'
                        ? 'As a thing'
                        : group === 'verb'
                          ? 'As an action'
                          : 'Changes with the word it goes with'}
                    </h3>
                    <div className="dict__forms-grid">
                      {FORM_SLOTS.filter((slot) => slot.group === group).map((slot) => (
                        <div className="ts-field" key={slot.id}>
                          <label className="ts-label" htmlFor={`form-${slot.id}`}>{slot.label}</label>
                          <input
                            id={`form-${slot.id}`}
                            value={draft.forms[slot.id] ?? ''}
                            onFocus={trackFocus}
                            onChange={(e) =>
                              update('forms', { ...draft.forms, [slot.id]: e.target.value })
                            }
                            placeholder={slot.hint}
                            autoComplete="off"
                          />
                          {slot.id === 'pronoun' ? (
                            <PronounNote
                              definite={draft.forms.definite ?? ''}
                              pronoun={draft.forms.pronoun ?? ''}
                            />
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
            </section>
          ) : null}

          {/* -------------------------------------------------------------- */}
          <section className="ts-panel dict__panel">
            <h2>The rest of the entry</h2>

            <div className="ts-field">
              <label className="ts-label" htmlFor="kasem-def">The whole word, said in Kasem</label>
              <textarea
                id="kasem-def"
                value={draft.kasemDefinition}
                onFocus={trackFocus}
                onChange={(e) => update('kasemDefinition', e.target.value)}
                placeholder="What you would say to a child who asked what this word means"
              />
              <p className="ts-hint">
                The only text on the record written in the language rather than about it,
                and the most valuable string this project collects.
              </p>
            </div>

            <div className="ts-field">
              <label className="ts-label" htmlFor="etymology">Where the word comes from</label>
              <textarea
                id="etymology"
                value={draft.etymology}
                onFocus={trackFocus}
                onChange={(e) => update('etymology', e.target.value)}
                placeholder="A borrowing, a compound, a story — where anybody knows"
              />
              <p className="ts-hint">
                Usually nobody has written this down, and leaving it blank says so honestly.
              </p>
            </div>

            <div className="ts-field">
              <label className="ts-label" htmlFor="source">Where it came from *</label>
              <input
                id="source"
                value={draft.source}
                onChange={(e) => update('source', e.target.value)}
                placeholder="Who told you, or which book it is in"
              />
            </div>

            <div className="ts-field">
              <label className="ts-label" htmlFor="notes">Context for reviewers</label>
              <textarea
                id="notes"
                value={draft.notes}
                onChange={(e) => update('notes', e.target.value)}
                placeholder="Usage, permissions, spelling notes, or attribution"
              />
            </div>

            <div className="field-row">
              <div className="ts-field">
                <label className="ts-label" htmlFor="tier">Cultural permission</label>
                <p className="ts-hint">This dictionary accepts public cultural material only. Community-only, restricted and sacred material cannot be submitted here.</p>
                <select
                  id="tier"
                  value={draft.culturalPermissionTier}
                  onChange={(e) => update('culturalPermissionTier', e.target.value)}
                >
                  {TIERS.map((tier) => (
                    <option key={tier} value={tier}>
                      {TIER_LABELS[tier] ?? tier}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="ts-check ts-check--card">
              <input
                type="checkbox"
                checked={draft.consentGranted}
                onChange={(e) => update('consentGranted', e.target.checked)}
              />
              I have permission to share this for community review, and it is nothing
              private, sacred, disputed or copyrighted.
            </label>
            <label className="ts-check ts-check--card">
              <input
                type="checkbox"
                checked={draft.publicationPermission}
                onChange={(e) => update('publicationPermission', e.target.checked)}
              />
              Indigen World may publish this entry if it is approved.
            </label>

            <div className="cr-compose__actions dict__actions">
              <button
                type="button"
                className="ts-btn ts-btn--ghost"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm('Clear this entry and its saved draft?')) return;
                  clearDraft();
                  setDraft(emptyDraft());
                  setMatches([]);
                  flash('ok', 'Cleared.');
                }}
              >
                Start again
              </button>
              <button
                type="button"
                className="ts-btn ts-btn--primary"
                disabled={busy}
                onClick={() => { if (canSubmit) setReviewing(true); else void submit(); }}
              >
                {busy ? 'Sending…' : 'Review entry'}<Icon name="arrow" />
              </button>
            </div>
          </section>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* The preview                                                       */}
        {/* ---------------------------------------------------------------- */}
        <aside className="dict__preview-col">
          <div className="dict__preview-sticky">
            <section className="ts-panel ts-panel--tight dict__meter" aria-label="How complete this entry is">
              <div className="dict__meter-ring" style={{ ['--pct' as string]: `${progress.score}%` }}>
                <strong>{progress.score}%</strong>
              </div>
              <ul className="dict__meter-list">
                {progress.items.map((item) => (
                  <li key={item.label} className={item.done ? 'is-done' : ''} title={item.hint}>
                    <span className="dict__meter-mark" aria-hidden="true">{item.done ? <Icon name="check" /> : null}</span>
                    <span>{item.label}</span>
                    <span className="sr-only">{item.done ? '(done)' : '(not yet)'}</span>
                  </li>
                ))}
              </ul>
            </section>
            <h2 className="dict__preview-heading">As a learner will see it</h2>
            <EntryPreview draft={draft} />
            <p className="ts-hint dict__preview-note">
              Preview updates as you write. Empty sections are omitted.
            </p>
          </div>
        </aside>
      </div>

      {/* ------------------------------------------------------------------ */}
      <section className="ts-panel dict__mine" aria-labelledby="dict-mine-title">
        <div className="ts-panel__head"><div><h2 id="dict-mine-title" className="ts-panel__title">Entries you have sent</h2><p className="ts-panel__desc">Each entry and where its review stands.</p></div></div>
        {loadingMine ? (
          <Skeleton lines={3} label="Loading your entries" />
        ) : mine.length === 0 ? (
          <EmptyState compact icon="book" title="Nothing sent yet" body="The first entry you send appears here, with its review status." />
        ) : (
          <ul className="dict__mine-list ts-stagger">
            {mine.map((item) => (
              <li key={item.id} className="dict__mine-item">
                <div className="dict__mine-main">
                  <p className="dict__mine-word">
                    <strong className="cr-kasem">{item.body}</strong>
                    <span className="ts-muted">{item.title}</span>
                    {item.senseCount > 1 ? <span className="ts-faint">{item.senseCount} meanings</span> : null}
                  </p>
                  {item.reviewFeedback ? (
                    <p className="cr-mine__feedback"><span>Reviewer:</span> {item.reviewFeedback}</p>
                  ) : null}
                </div>
                <div className="cr-mine__actions">
                  <Badge tone={statusTone(item.status)} dot caps>{item.status.replace(/_/g, ' ')}</Badge>
                  {canWithdrawContribution(item.status) ? (
                    confirmWithdraw === item.id ? (
                      <span className="cr-mine__confirm">
                        <button
                          type="button"
                          className="ts-btn ts-btn--danger ts-btn--sm"
                          disabled={withdrawing === item.id}
                          onClick={() => void withdraw(item.id)}
                        >
                          {withdrawing === item.id ? 'Withdrawing…' : 'Confirm'}
                        </button>
                        <button
                          type="button"
                          className="ts-btn ts-btn--ghost ts-btn--sm"
                          disabled={withdrawing === item.id}
                          onClick={() => setConfirmWithdraw(null)}
                        >
                          Keep
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="ts-btn ts-btn--ghost ts-btn--sm"
                        onClick={() => setConfirmWithdraw(item.id)}
                      >
                        {item.status.toLowerCase() === 'published' ? 'Revoke publication' : 'Withdraw'}
                      </button>
                    )
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {toast ? <div className={`cr-toast cr-toast--${toast.kind}`} role={toast.kind === 'err' ? 'alert' : 'status'}><Icon name={toast.kind === 'err' ? 'alert' : 'check'} />{toast.text}</div> : null}
    </div>
  );
}

/* ==================================================================== */
/* One meaning                                                           */
/* ==================================================================== */

function SenseEditor({
  sense,
  index,
  total,
  declaredClass,
  onChange,
  onRemove,
  onMove,
  onExample,
  onAddExample,
  onRemoveExample,
  onFocusField,
}: {
  sense: SenseDraft;
  index: number;
  total: number;
  declaredClass: string;
  onChange: (patch: Partial<SenseDraft>) => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
  onExample: (exampleIndex: number, patch: Partial<{ kasem: string; english: string }>) => void;
  onAddExample: () => void;
  onRemoveExample: (exampleIndex: number) => void;
  onFocusField: (event: { currentTarget: HTMLInputElement | HTMLTextAreaElement }) => void;
}) {
  const [open, setOpen] = useState(index > 0);
  return (
    <div className="dict__sense">
      <div className="dict__sense-head">
        <span className="dict__sense-number">{index + 1}</span>
        <strong>Meaning {index + 1}</strong>
        <div className="dict__sense-tools">
          <button
            type="button"
            className="ts-btn ts-btn--ghost ts-btn--sm"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label={`Move meaning ${index + 1} up`}
          >
            <Icon name="up" />
          </button>
          <button
            type="button"
            className="ts-btn ts-btn--ghost ts-btn--sm"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            aria-label={`Move meaning ${index + 1} down`}
          >
            <Icon name="down" />
          </button>
          <button
            type="button"
            className="ts-btn ts-btn--ghost ts-btn--sm"
            onClick={onRemove}
            disabled={total <= 1}
            aria-label={`Remove meaning ${index + 1}`}
          >
            <Icon name="trash" />
          </button>
        </div>
      </div>

      <div className="ts-field">
        <label className="ts-label" htmlFor={`def-${sense.key}`}>
          {index === 0 ? 'What it means in English *' : 'What else it means'}
        </label>
        <input
          id={`def-${sense.key}`}
          value={sense.definition}
          onFocus={onFocusField}
          onChange={(e) => onChange({ definition: e.target.value })}
          placeholder={index === 0 ? 'e.g. bottle' : 'A different meaning of the same word'}
        />
      </div>

      {sense.examples.map((example, exampleIndex) => (
        <div className="dict__example" key={`${sense.key}-ex-${exampleIndex}`}>
          <div className="ts-field">
            <label className="ts-label" htmlFor={`ex-k-${sense.key}-${exampleIndex}`}>
              Kasem sentence for this meaning
            </label>
            <input
              id={`ex-k-${sense.key}-${exampleIndex}`}
              value={example.kasem}
              onFocus={onFocusField}
              onChange={(e) => onExample(exampleIndex, { kasem: e.target.value })}
              placeholder="Use the word with THIS meaning"
            />
          </div>
          <div className="ts-field">
            <label className="ts-label" htmlFor={`ex-e-${sense.key}-${exampleIndex}`}>What that sentence means</label>
            <input
              id={`ex-e-${sense.key}-${exampleIndex}`}
              value={example.english}
              onChange={(e) => onExample(exampleIndex, { english: e.target.value })}
              placeholder="In English"
            />
          </div>
          {sense.examples.length > 1 ? (
            <button
              type="button"
              className="ts-btn ts-btn--ghost ts-btn--sm ts-btn--icon dict__example-drop"
              onClick={() => onRemoveExample(exampleIndex)}
              aria-label={`Remove sentence ${exampleIndex + 1}`}
            >
              <Icon name="close" />
            </button>
          ) : null}
        </div>
      ))}

      <div className="dict__sense-actions">
        <button
          type="button"
          className="ts-btn ts-btn--ghost ts-btn--sm"
          onClick={onAddExample}
          disabled={sense.examples.length >= 4}
        >
          <Icon name="plus" />Another sentence
        </button>
        <button
          type="button"
          className="ts-btn ts-btn--ghost ts-btn--sm"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          {open ? 'Fewer details' : 'More about this meaning'}
        </button>
      </div>

      {open ? (
        <div className="dict__sense-more">
          <div className="field-row">
            <div className="ts-field">
              <label className="ts-label" htmlFor={`reg-${sense.key}`}>How is it said?</label>
              <select
                id={`reg-${sense.key}`}
                value={sense.register}
                onChange={(e) => onChange({ register: e.target.value })}
              >
                <option value="">Not sure</option>
                {SENSE_REGISTERS.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="ts-field">
              <label className="ts-label" htmlFor={`dom-${sense.key}`}>What is it about?</label>
              <select
                id={`dom-${sense.key}`}
                value={sense.domain}
                onChange={(e) => onChange({ domain: e.target.value })}
              >
                <option value="">Not sure</option>
                {SENSE_DOMAINS.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {index > 0 ? (
            <div className="ts-field">
              <label className="ts-label" htmlFor={`pos-${sense.key}`}>Word class for this meaning</label>
              <select
                id={`pos-${sense.key}`}
                value={sense.partOfSpeech}
                onChange={(e) => onChange({ partOfSpeech: e.target.value })}
              >
                <option value="">
                  Same as the word itself
                  {declaredClass ? ` (${partOfSpeechLabel(declaredClass)})` : ''}
                </option>
                {PARTS_OF_SPEECH.map((id) => (
                  <option key={id} value={id}>
                    {partOfSpeechLabel(id)}
                  </option>
                ))}
              </select>
              <p className="ts-hint">
                A word that is a noun in its first meanings and a verb in a later one is
                ordinary. Saying so here groups the meanings the way a dictionary does.
              </p>
            </div>
          ) : null}

          <div className="ts-field">
            <label className="ts-label" htmlFor={`kd-${sense.key}`}>This meaning, said in Kasem</label>
            <textarea
              id={`kd-${sense.key}`}
              value={sense.kasemDefinition}
              onFocus={onFocusField}
              onChange={(e) => onChange({ kasemDefinition: e.target.value })}
            />
          </div>

          <div className="ts-field">
            <label className="ts-label" htmlFor={`un-${sense.key}`}>When is it used?</label>
            <textarea
              id={`un-${sense.key}`}
              value={sense.usageNote}
              onChange={(e) => onChange({ usageNote: e.target.value })}
              placeholder="The occasion for it, or who says it"
            />
          </div>

          <div className="field-row">
            <div className="ts-field">
              <label className="ts-label" htmlFor={`syn-${sense.key}`}>Kasem words that mean the same</label>
              <input
                id={`syn-${sense.key}`}
                value={sense.synonyms}
                onFocus={onFocusField}
                onChange={(e) => onChange({ synonyms: e.target.value })}
                placeholder="Separate them with commas"
              />
            </div>
            <div className="ts-field">
              <label className="ts-label" htmlFor={`ant-${sense.key}`}>And words that mean the opposite</label>
              <input
                id={`ant-${sense.key}`}
                value={sense.antonyms}
                onFocus={onFocusField}
                onChange={(e) => onChange({ antonyms: e.target.value })}
                placeholder="Separate them with commas"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ==================================================================== */
/* The preview                                                           */
/* ==================================================================== */

const SUPERSCRIPTS = ['', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
function superscript(index: number): string {
  return SUPERSCRIPTS[index] ?? '';
}

/**
 * The entry as the app draws it.
 *
 * ── Kept in step with entry_detail_screen.dart by hand, and deliberately ──
 * A shared renderer across Flutter and React does not exist and inventing one
 * would be a far larger project than the page it serves. What keeps the two
 * honest is that both read the same fields in the same order, and both follow
 * the same rule: a section with nothing in it is not drawn. The failure this
 * guards against is not a pixel difference — it is a contributor filling in a
 * field that the app never shows, which is a question the archive should not
 * have asked.
 */
function EntryPreview({ draft }: { draft: EntryDraft }) {
  const spellings = renderings(draft.headword);
  const headword = spellings[0] ?? '';
  const senses = draft.senses.filter((sense) => sense.definition.trim());
  const gloss = senses.map((sense) => sense.definition.trim()).join(', ');
  const classes = [draft.partOfSpeech, ...draft.alsoUsedAs];
  const groups = formGroupsFor(classes);
  const answered = FORM_SLOTS.filter((slot) => (draft.forms[slot.id] ?? '').trim());

  // Grouped by class, entry's own first — the one convention every printed
  // dictionary shares, because it answers "is this the noun or the verb?"
  // before a reader has to read a definition to find out.
  const byClass = new Map<string, SenseDraft[]>();
  for (const sense of senses) {
    const key = sense.partOfSpeech || draft.partOfSpeech;
    byClass.set(key, [...(byClass.get(key) ?? []), sense]);
  }
  const orderedClasses = [
    ...(byClass.has(draft.partOfSpeech) ? [draft.partOfSpeech] : []),
    ...[...byClass.keys()].filter((key) => key !== draft.partOfSpeech),
  ];

  if (!headword && senses.length === 0) {
    return (
      <div className="dict__preview dict__preview--empty">
        <span className="dict__preview-empty-icon" aria-hidden="true"><Icon name="book" /></span>
        <p className="ts-muted">
          Type a headword and a meaning, and the entry appears here exactly as the app
          will draw it.
        </p>
      </div>
    );
  }

  let number = 0;

  return (
    <div className="dict__preview">
      <div className="dict__pv-top">
        <span className="dict__pv-pill">PUBLISHED ENTRY</span>
        <span className="dict__pv-class">{partOfSpeechLabel(draft.partOfSpeech)}</span>
      </div>

      <h3 className="dict__pv-headword">{headword || '—'}</h3>

      {spellings.length > 1 ? (
        <p className="dict__pv-also">Also: {spellings.slice(1).join(' · ')}</p>
      ) : null}

      {gloss ? <p className="dict__pv-gloss">{gloss}</p> : null}

      <div className="dict__pv-chips">
        {draft.dialect && draft.dialect !== 'Not sure' ? (
          <span className="dict__pv-chip"><Icon name="pin" />{draft.dialect}</span>
        ) : null}
        <span className="dict__pv-chip"><Icon name="globe" />Kasem</span>
      </div>

      {/* The senses. Numbered only when there is more than one to tell apart. */}
      {orderedClasses.map((key) => (
        <div key={key}>
          {orderedClasses.length > 1 ? (
            <p className="dict__pv-classhead">
              {key === 'noun' || key === 'proper-noun'
                ? 'AS A THING'
                : key === 'verb' || key === 'auxiliary-verb'
                  ? 'AS AN ACTION'
                  : partOfSpeechLabel(key).toUpperCase()}
            </p>
          ) : null}
          {(byClass.get(key) ?? []).map((sense) => {
            number += 1;
            return (
              <div className="dict__pv-sense" key={sense.key}>
                <div className="dict__pv-sense-head">
                  {senses.length > 1 ? (
                    <span className="dict__pv-sense-n">{number}</span>
                  ) : null}
                  <strong>{sense.definition}</strong>
                </div>
                {sense.register || sense.domain ? (
                  <div className="dict__pv-tags">
                    {sense.register ? <span>{registerLabel(sense.register)}</span> : null}
                    {sense.domain ? <span>{domainLabel(sense.domain)}</span> : null}
                  </div>
                ) : null}
                {sense.kasemDefinition.trim() ? (
                  <p className="dict__pv-note">
                    <b>In Kasem</b>
                    {sense.kasemDefinition}
                  </p>
                ) : null}
                {sense.usageNote.trim() ? (
                  <p className="dict__pv-note">
                    <b>When it is used</b>
                    {sense.usageNote}
                  </p>
                ) : null}
                {sense.examples
                  .filter((example) => example.kasem.trim() || example.english.trim())
                  .map((example, i) => (
                    <div className="dict__pv-example" key={i}>
                      {example.kasem.trim() ? <span>{example.kasem}</span> : null}
                      {example.english.trim() ? <em>{example.english}</em> : null}
                    </div>
                  ))}
                {sense.synonyms.trim() ? (
                  <p className="dict__pv-xref">
                    <b>Words that mean the same</b>
                    {splitList(sense.synonyms).map((word) => (
                      <span key={word}>{word}</span>
                    ))}
                  </p>
                ) : null}
                {sense.antonyms.trim() ? (
                  <p className="dict__pv-xref">
                    <b>The opposite</b>
                    {splitList(sense.antonyms).map((word) => (
                      <span key={word}>{word}</span>
                    ))}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}

      {draft.ipa.trim() ? (
        <div className="dict__pv-card">
          <b>How it is said</b>
          <code>/{draft.ipa.trim()}/</code>
        </div>
      ) : null}

      {draft.kasemDefinition.trim() && senses.length === 0 ? (
        <div className="dict__pv-card">
          <b>In Kasem</b>
          <p>{draft.kasemDefinition}</p>
        </div>
      ) : null}

      {answered.length > 0 ? (
        <div className="dict__pv-card">
          <b>{groups.has('noun') ? 'As a thing' : 'The forms it takes'}</b>
          <TableShell label="Recorded forms">
            <table className="dict__pv-table">
              <tbody>
                {groups.has('noun') && draft.partOfSpeech === 'noun' ? (
                  <tr>
                    <td>One</td>
                    <td>{headword}</td>
                  </tr>
                ) : null}
                {answered.map((slot) => (
                  <tr key={slot.id}>
                    <td>{previewFormLabel(slot.id)}</td>
                    <td>{draft.forms[slot.id]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
        </div>
      ) : null}

      {draft.alsoUsedAs.length > 0 ? (
        <div className="dict__pv-card">
          <b>Also used as</b>
          <p>
            This word is also used as{' '}
            {draft.alsoUsedAs.map((id) => partOfSpeechLabel(id).toLowerCase()).join(' and ')}.
          </p>
        </div>
      ) : null}

      {draft.etymology.trim() ? (
        <div className="dict__pv-card">
          <b>Where it comes from</b>
          <p>{draft.etymology}</p>
        </div>
      ) : null}

      <div className="dict__pv-card dict__pv-card--muted">
        <b>Source and rights</b>
        <p>{draft.source.trim() || 'Not yet stated'}</p>
      </div>
    </div>
  );
}

/**
 * What the determiner rule makes of the pronoun that was typed.
 *
 * ── Why it never fills the box in ────────────────────────────────────────
 * A speaker stated that the determiner decides the pronoun, so the desk can
 * work out what to expect as soon as the definite form is typed. Writing it
 * into the field would put a *derivation* into the archive wearing the clothes
 * of an *attestation* — and an attestation is the only thing that could ever
 * correct the rule. So it shows, and the contributor decides.
 *
 * Silent for the four determiners with no pronoun on record, and silent when
 * the answer already agrees. The disagreement is the interesting case, and it
 * is phrased as a question rather than a warning: the contributor is a speaker
 * and the rule is four rows old.
 */
function PronounNote({ definite, pronoun }: { definite: string; pronoun: string }) {
  const expected = pronounForDefinite(definite);
  if (!expected) return null;
  const given = pronoun.trim().toLowerCase();
  if (given === expected) return null;
  const article = articleIn(definite);
  return (
    <p className="dict__pronoun-note">
      Words said with “{article}” are usually called “{expected}” afterwards.
      {given ? ' If that is not what you say, keep yours — the exception is worth more than the rule.' : ''}
    </p>
  );
}

/** The reader-facing label for a paradigm row — matches `nounForms` in the app. */
function previewFormLabel(slot: string): string {
  switch (slot) {
    case 'definite':
      return 'The one';
    case 'plural':
      return 'Many';
    case 'pluralDefinite':
      return 'The many';
    case 'counted':
      return 'Two';
    case 'pronoun':
      return 'Stands for it';
    case 'present':
      return 'Now';
    case 'past':
      return 'Yesterday';
    case 'future':
      return 'Tomorrow';
    case 'pluralSubject':
      return 'Several doing it';
    case 'imperative':
      return 'Telling somebody';
    case 'agreeingOne':
      return 'Used with';
    case 'agreeingTwo':
      return 'And with';
    default:
      return slot;
  }
}
