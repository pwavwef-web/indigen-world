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
  KASEM_CHARACTERS,
  MAX_SENSES,
  PARTS_OF_SPEECH,
  SENSE_DOMAINS,
  SENSE_REGISTERS,
  clearDraft,
  completeness,
  domainLabel,
  emptyDraft,
  emptySense,
  formGroupsFor,
  loadDraft,
  partOfSpeechLabel,
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
} from '../dictionary-data';

const TIERS = enums.culturalPermissionTier as readonly string[];
const TIER_LABELS: Record<string, string> = {
  public: 'Public',
  community_only: 'Community only',
  restricted: 'Restricted',
  sacred_restricted: 'Sacred / restricted',
};

const DIALECTS = ['Navrongo', 'Paga', 'Chiana', 'Other', 'Not sure'];

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
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [matches, setMatches] = useState<PublishedHeadword[]>([]);
  const [mine, setMine] = useState<MyDictionaryContribution[]>([]);
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
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? start;
    const next = `${field.value.slice(0, start)}${char}${field.value.slice(end)}`;
    // Set through the native setter so React's synthetic onChange fires and the
    // draft state actually updates — assigning `.value` alone is invisible to
    // React and the character would vanish on the next render.
    const prototype =
      field instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    setter?.call(field, next);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.focus();
    const caret = start + char.length;
    field.setSelectionRange(caret, caret);
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

  const submit = async () => {
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
    setBusy(true);
    try {
      await submitDictionaryEntry(draft);
      clearDraft();
      setDraft(emptyDraft());
      setMatches([]);
      flash('ok', 'Sent for review. It joins the same queue as phone contributions.');
      await loadMine();
    } catch (err) {
      flash('err', err instanceof Error ? err.message : 'The entry was not sent.');
    } finally {
      setBusy(false);
    }
  };

  if (!user) return null;

  return (
    <div className="dict">
      <header className="dict__head">
        <div>
          <p className="hero__eyebrow">Dictionary</p>
          <h1>Write an entry</h1>
          <p className="panel__hint">
            Everything here reaches the same review desk and the same published dictionary
            as a contribution made on a phone. Only the headword, one meaning and a source
            are required — the rest is there for the words you know well.
          </p>
        </div>
        <div className="dict__meter" aria-label="How complete this entry is">
          <div className="dict__meter-ring" style={{ ['--pct' as string]: `${progress.score}%` }}>
            <strong>{progress.score}%</strong>
          </div>
          <ul className="dict__meter-list">
            {progress.items.map((item) => (
              <li key={item.label} className={item.done ? 'is-done' : ''} title={item.hint}>
                <span aria-hidden="true">{item.done ? '✓' : '○'}</span> {item.label}
              </li>
            ))}
          </ul>
        </div>
      </header>

      {restored ? (
        <p className="callout callout--info dict__restored">
          An unfinished entry was restored from this browser. Nothing was sent.
        </p>
      ) : null}

      <div className="dict__cols">
        {/* ---------------------------------------------------------------- */}
        {/* The editor                                                        */}
        {/* ---------------------------------------------------------------- */}
        <div className="dict__editor">
          <section className="panel">
            <h2>The word</h2>

            <KasemPalette onInsert={insertCharacter} />

            <div className="field">
              <label htmlFor="headword">Kasem headword *</label>
              <input
                id="headword"
                value={draft.headword}
                onFocus={trackFocus}
                onChange={(e) => update('headword', e.target.value)}
                placeholder="e.g. bakeira"
                autoComplete="off"
              />
              <p className="field__hint">
                Exactly as it is said and spelled. Several spellings of the same word can be
                separated with commas — the first becomes the headword.
              </p>
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
              <div className="field">
                <label htmlFor="pos">Word class *</label>
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
              <div className="field">
                <label htmlFor="dialect">Dialect or region *</label>
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
              <div className="field">
                <label>Is it also used another way?</label>
                <div className="chips">
                  {crossClassOffers(draft.partOfSpeech).map((id) => (
                    <button
                      key={id}
                      type="button"
                      className={
                        draft.alsoUsedAs.includes(id) ? 'chip chip--on' : 'chip'
                      }
                      aria-pressed={draft.alsoUsedAs.includes(id)}
                      onClick={() => toggleAlsoUsedAs(id)}
                    >
                      {partOfSpeechLabel(id)}
                    </button>
                  ))}
                </div>
                <p className="field__hint">
                  A Kasem word is routinely more than one class. Saying so here draws both
                  halves of its paradigm on the entry.
                </p>
              </div>
            ) : null}

            <div className="field">
              <label htmlFor="ipa">How it is said (IPA)</label>
              <input
                id="ipa"
                value={draft.ipa}
                onFocus={trackFocus}
                onChange={(e) => update('ipa', e.target.value)}
                placeholder="bàkéːrà"
              />
              <p className="field__hint">
                Without the slashes — the entry adds them. The transcription is what
                survives when there is no speaker to ask.
              </p>
            </div>
          </section>

          {/* -------------------------------------------------------------- */}
          <section className="panel">
            <div className="panel__head panel__head--spread">
              <div>
                <h2>What it means</h2>
                <p className="panel__hint">
                  A word rarely means one thing. Give each meaning its own entry below so
                  its example sentence goes with it.
                </p>
              </div>
              <span className="badge">{draft.senses.length} of {MAX_SENSES}</span>
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
              className="button button--ghost-dark dict__add"
              onClick={addSense}
              disabled={draft.senses.length >= MAX_SENSES}
            >
              + Add another meaning
            </button>
          </section>

          {/* -------------------------------------------------------------- */}
          {formGroups.size > 0 ? (
            <section className="panel">
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
                        <div className="field" key={slot.id}>
                          <label htmlFor={`form-${slot.id}`}>{slot.label}</label>
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
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
            </section>
          ) : null}

          {/* -------------------------------------------------------------- */}
          <section className="panel">
            <h2>The rest of the entry</h2>

            <div className="field">
              <label htmlFor="kasem-def">The whole word, said in Kasem</label>
              <textarea
                id="kasem-def"
                value={draft.kasemDefinition}
                onFocus={trackFocus}
                onChange={(e) => update('kasemDefinition', e.target.value)}
                placeholder="What you would say to a child who asked what this word means"
              />
              <p className="field__hint">
                The only text on the record written in the language rather than about it,
                and the most valuable string this project collects.
              </p>
            </div>

            <div className="field">
              <label htmlFor="etymology">Where the word comes from</label>
              <textarea
                id="etymology"
                value={draft.etymology}
                onFocus={trackFocus}
                onChange={(e) => update('etymology', e.target.value)}
                placeholder="A borrowing, a compound, a story — where anybody knows"
              />
              <p className="field__hint">
                Usually nobody has written this down, and leaving it blank says so honestly.
              </p>
            </div>

            <div className="field">
              <label htmlFor="source">Where it came from *</label>
              <input
                id="source"
                value={draft.source}
                onChange={(e) => update('source', e.target.value)}
                placeholder="Who told you, or which book it is in"
              />
            </div>

            <div className="field">
              <label htmlFor="notes">Context for reviewers</label>
              <textarea
                id="notes"
                value={draft.notes}
                onChange={(e) => update('notes', e.target.value)}
                placeholder="Usage, permissions, spelling notes, or attribution"
              />
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="tier">Cultural permission</label>
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

            <label className="checkbox">
              <input
                type="checkbox"
                checked={draft.consentGranted}
                onChange={(e) => update('consentGranted', e.target.checked)}
              />
              I have permission to share this for community review, and it is nothing
              private, sacred, disputed or copyrighted.
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={draft.publicationPermission}
                onChange={(e) => update('publicationPermission', e.target.checked)}
              />
              Indigen World may publish this entry if it is approved.
            </label>

            <div className="actions">
              <button
                type="button"
                className="button button--ghost-dark"
                disabled={busy}
                onClick={() => {
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
                className="button button--primary"
                disabled={busy}
                onClick={() => void submit()}
              >
                {busy ? 'Sending…' : 'Send for review'}
              </button>
            </div>
          </section>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* The preview                                                       */}
        {/* ---------------------------------------------------------------- */}
        <aside className="dict__preview-col">
          <div className="dict__preview-sticky">
            <h2 className="dict__preview-heading">As a learner will see it</h2>
            <EntryPreview draft={draft} />
            <p className="tiny dict__preview-note">
              The same layout the app draws, from the fields on the left. Sections that are
              empty are not drawn at all — an entry with nothing recorded is shorter, never
              padded with prose about what it does not have.
            </p>
          </div>
        </aside>
      </div>

      {/* ------------------------------------------------------------------ */}
      <section className="panel dict__mine">
        <h2>Entries you have sent</h2>
        {loadingMine ? (
          <p className="notice">Loading…</p>
        ) : mine.length === 0 ? (
          <p className="notice">Nothing yet. The first entry you send appears here.</p>
        ) : (
          <ul className="list">
            {mine.map((item) => (
              <li key={item.id} className="list__item">
                <div>
                  <strong>{item.body}</strong>
                  <span className="muted"> · {item.title}</span>
                  {item.senseCount > 1 ? (
                    <span className="muted"> · {item.senseCount} meanings</span>
                  ) : null}
                  {item.reviewFeedback ? (
                    <p className="muted tiny">{item.reviewFeedback}</p>
                  ) : null}
                </div>
                <div className="list__side">
                  <span className={`badge badge--${item.status}`}>{item.status}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {toast ? <div className={`toast toast--${toast.kind}`}>{toast.text}</div> : null}
    </div>
  );
}

/* ==================================================================== */
/* The character palette                                                 */
/* ==================================================================== */

/**
 * The letters no keyboard on the contributor's desk produces.
 *
 * Not a convenience: 785 of the 1200 published entries carry at least one of
 * them. Without this the workaround is to type the nearest ASCII letter, which
 * files the word under a headword that is a different word.
 */
function KasemPalette({ onInsert }: { onInsert: (char: string) => void }) {
  return (
    <div className="dict__palette" role="group" aria-label="Kasem letters">
      <span className="dict__palette-label">Kasem letters</span>
      {KASEM_CHARACTERS.map((entry) => (
        <button
          key={entry.char}
          type="button"
          className={entry.combining ? 'dict__key dict__key--mark' : 'dict__key'}
          title={`${entry.name}${entry.combining ? ' (attaches to the letter before it)' : ''}`}
          aria-label={entry.name}
          onClick={() => onInsert(entry.char)}
        >
          {entry.combining ? `◌${entry.char}` : entry.char}
        </button>
      ))}
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
            className="button button--small button--ghost"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label={`Move meaning ${index + 1} up`}
          >
            ↑
          </button>
          <button
            type="button"
            className="button button--small button--ghost"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            aria-label={`Move meaning ${index + 1} down`}
          >
            ↓
          </button>
          <button
            type="button"
            className="button button--small button--ghost"
            onClick={onRemove}
            disabled={total <= 1}
            aria-label={`Remove meaning ${index + 1}`}
          >
            ✕
          </button>
        </div>
      </div>

      <div className="field">
        <label htmlFor={`def-${sense.key}`}>
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
          <div className="field">
            <label htmlFor={`ex-k-${sense.key}-${exampleIndex}`}>
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
          <div className="field">
            <label htmlFor={`ex-e-${sense.key}-${exampleIndex}`}>What that sentence means</label>
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
              className="button button--small button--ghost dict__example-drop"
              onClick={() => onRemoveExample(exampleIndex)}
              aria-label={`Remove sentence ${exampleIndex + 1}`}
            >
              ✕
            </button>
          ) : null}
        </div>
      ))}

      <div className="dict__sense-actions">
        <button
          type="button"
          className="button button--small button--ghost"
          onClick={onAddExample}
          disabled={sense.examples.length >= 4}
        >
          + Another sentence
        </button>
        <button
          type="button"
          className="button button--small button--ghost"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          {open ? 'Fewer details' : 'More about this meaning'}
        </button>
      </div>

      {open ? (
        <div className="dict__sense-more">
          <div className="field-row">
            <div className="field">
              <label htmlFor={`reg-${sense.key}`}>How is it said?</label>
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
            <div className="field">
              <label htmlFor={`dom-${sense.key}`}>What is it about?</label>
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
            <div className="field">
              <label htmlFor={`pos-${sense.key}`}>Word class for this meaning</label>
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
              <p className="field__hint">
                A word that is a noun in its first meanings and a verb in a later one is
                ordinary. Saying so here groups the meanings the way a dictionary does.
              </p>
            </div>
          ) : null}

          <div className="field">
            <label htmlFor={`kd-${sense.key}`}>This meaning, said in Kasem</label>
            <textarea
              id={`kd-${sense.key}`}
              value={sense.kasemDefinition}
              onFocus={onFocusField}
              onChange={(e) => onChange({ kasemDefinition: e.target.value })}
            />
          </div>

          <div className="field">
            <label htmlFor={`un-${sense.key}`}>When is it used?</label>
            <textarea
              id={`un-${sense.key}`}
              value={sense.usageNote}
              onChange={(e) => onChange({ usageNote: e.target.value })}
              placeholder="The occasion for it, or who says it"
            />
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor={`syn-${sense.key}`}>Kasem words that mean the same</label>
              <input
                id={`syn-${sense.key}`}
                value={sense.synonyms}
                onFocus={onFocusField}
                onChange={(e) => onChange({ synonyms: e.target.value })}
                placeholder="Separate them with commas"
              />
            </div>
            <div className="field">
              <label htmlFor={`ant-${sense.key}`}>And words that mean the opposite</label>
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
        <p className="muted">
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
          <span className="dict__pv-chip">📍 {draft.dialect}</span>
        ) : null}
        <span className="dict__pv-chip">🌐 Kasem</span>
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
