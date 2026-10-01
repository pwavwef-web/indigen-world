import { useEffect, useRef, useState } from 'react';
import { Field, Icon, LetterPalette, Notice, PageHeader, Panel, ProgressBar, describedBy, insertAtCaret } from '../components';
import { friendlyError } from '../model';
import { PARTS_OF_SPEECH, partOfSpeechLabel } from '../../creator/lexicon';
import type { UploadedAudio, WordDraft, WordOption } from '../types';
import { AudioCapture, type CapturedAudio } from '../recorder';
import { PortalLink, useWorkspace } from '../workspace';
import { FlowBar, SentPanel, Steps, focusFirstError, useBrowserDraft, useRequestId } from './flow';

const STEPS = [
  { id: 'word', label: 'The word' },
  { id: 'meaning', label: 'Meaning and example' },
  { id: 'source', label: 'Source and permission' },
  { id: 'review', label: 'Check and send' },
];

const DIALECTS = ['Navrongo', 'Paga', 'Chiana', 'Other', 'Not sure'];

const FIELDS_BY_STEP: string[][] = [
  ['word-headword', 'word-class', 'word-dialect'],
  ['word-meaning'],
  ['word-source', 'word-consent', 'word-publish'],
  [],
];

export function emptyWord(): WordDraft {
  return {
    headword: '', partOfSpeech: '', meaning: '', dialect: '', exampleKasem: '', exampleEnglish: '',
    source: '', notes: '', consentGranted: false, publicationPermission: '', pronunciation: null,
  };
}

export function wordErrors(step: number, draft: WordDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (step === 0) {
    if (!draft.headword.trim()) errors['word-headword'] = 'Write the word in Kasem.';
    else if (/\s/.test(draft.headword.trim())) errors['word-headword'] = 'Write one word. Phrases and sayings are shared as everyday expressions.';
    if (!draft.partOfSpeech) errors['word-class'] = 'Choose the kind of word it is.';
    if (!draft.dialect) errors['word-dialect'] = 'Choose a dialect, or “Not sure”.';
  }
  if (step === 1) {
    if (!draft.meaning.trim()) errors['word-meaning'] = 'Say what the word means in English.';
    else if (draft.meaning.trim().toLocaleLowerCase() === draft.headword.trim().toLocaleLowerCase()) errors['word-meaning'] = 'This is the same as the Kasem. Write the English meaning.';
  }
  if (step === 2) {
    if (!draft.source.trim()) errors['word-source'] = 'Say where the word comes from.';
    if (!draft.consentGranted) errors['word-consent'] = 'Confirm you may share it for review.';
    if (!draft.publicationPermission) errors['word-publish'] = 'Choose whether it may be published after review.';
  }
  return errors;
}

/**
 * Add a dictionary word: one Kasem word, its meaning and an example. It
 * travels the same path as a word added at the dictionary desk or on a
 * phone (`submitCollectionContribution`), and is published to the dictionary
 * as a word entry once a reviewer approves it.
 */
export function WordFlow() {
  const data = useWorkspace();
  const { value: draft, setValue: setDraft, status, clear } = useBrowserDraft<WordDraft>(
    `contributor-word-draft:${data.uid}`,
    emptyWord,
    (value) => !value.headword.trim() && !value.meaning.trim(),
  );
  const [requestId, renewRequest] = useRequestId(`contributor-request:${data.uid}:word`);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [attempted, setAttempted] = useState<Record<number, boolean>>({});
  const [matches, setMatches] = useState<WordOption[]>([]);
  const [audio, setAudio] = useState<CapturedAudio | null>(null);
  const [uploaded, setUploaded] = useState<UploadedAudio | null>(draft.pronunciation);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const sending = useRef(false);
  const lastField = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const update = (patch: Partial<WordDraft>) => setDraft((current) => ({ ...current, ...patch }));
  useEffect(() => { if (attempted[step]) setErrors(wordErrors(step, draft)); }, [attempted, draft, step]);

  const checkExisting = async () => {
    const spelling = draft.headword.trim();
    if (!spelling || /\s/.test(spelling)) { setMatches([]); return; }
    try { setMatches(await data.services.findWords(spelling)); } catch { setMatches([]); }
  };

  const goTo = (target: number) => {
    if (target > step) {
      const found = wordErrors(step, draft);
      setAttempted((current) => ({ ...current, [step]: true }));
      setErrors(found);
      if (Object.keys(found).length) { focusFirstError(FIELDS_BY_STEP[step], found); return; }
    }
    setErrors({});
    setStep(target);
    window.requestAnimationFrame(() => document.getElementById('flow-step-title')?.focus());
  };

  const send = async () => {
    if (sending.current || busy) return;
    for (let index = 0; index < 3; index += 1) {
      const found = wordErrors(index, draft);
      if (Object.keys(found).length) { setStep(index); setErrors(found); setAttempted((current) => ({ ...current, [index]: true })); return; }
    }
    sending.current = true;
    setBusy(true);
    setSendError('');
    try {
      // The recording is uploaded once; a retry after a failed send reuses it.
      let pronunciation = uploaded;
      if (audio && !pronunciation) {
        setProgress(0);
        pronunciation = await data.services.uploadAudio(audio.file, 'word', setProgress);
        setUploaded(pronunciation);
      }
      const result = await data.services.submitWord({ ...draft, pronunciation }, requestId);
      setSent(result.contributionId || 'sent');
      clear();
      renewRequest();
    } catch (reason) {
      setSendError(friendlyError(reason, 'Sending your word').message);
    } finally {
      sending.current = false;
      setBusy(false);
      setProgress(null);
    }
  };

  const insert = (letter: string) => {
    const field = lastField.current ?? document.getElementById('word-headword') as HTMLInputElement | null;
    if (!field) return;
    const { value, caret } = insertAtCaret(field, letter);
    update(field.id === 'word-example-kasem' ? { exampleKasem: value } : { headword: value });
    window.requestAnimationFrame(() => { field.focus(); field.setSelectionRange(caret, caret); });
  };

  const breadcrumb = <><PortalLink to={data.paths.section('contribute')}>Start a contribution</PortalLink><span aria-hidden="true">/</span><span aria-current="page">Dictionary word</span></>;

  if (sent) {
    return (
      <div className="cw-page">
        <PageHeader breadcrumb={breadcrumb} title="Dictionary word" />
        <SentPanel
          title="Sent for review"
          actions={<>
            <PortalLink to={sent !== 'sent' ? data.paths.section('contributions', { view: `word.${sent}` }) : data.paths.section('contributions')} className="cw-btn cw-btn--primary">Follow it in My submissions</PortalLink>
            <PortalLink to={data.paths.section('contribute', { type: 'word' })} className="cw-btn">Add another word</PortalLink>
          </>}
        >
          <p>Your word is with the review team. A Kasem-speaking reviewer checks the spelling and the meaning before anything is published.</p>
          <ol className="cw-next-steps">
            <li>If it is approved and you allowed publication, it is published to the Kasem dictionary as a word entry, credited to you.</li>
            <li>If the dictionary already has the word, the reviewer may link yours to it rather than publish a duplicate.</li>
          </ol>
        </SentPanel>
      </div>
    );
  }

  const error = (id: string) => errors[id];

  return (
    <div className="cw-page cw-flow">
      <PageHeader breadcrumb={breadcrumb} title="Add a dictionary word" description="One Kasem word, what it means, and an example of it in use. Reviewers check every word before it reaches the dictionary." />
      <div className="cw-flow__layout">
        <div className="cw-flow__main">
          <Steps steps={STEPS} current={step} onSelect={goTo} />
          <form className="cw-panel cw-flow__form" noValidate onSubmit={(event) => { event.preventDefault(); if (step < 3) goTo(step + 1); else void send(); }}>
            <div className="cw-flow__head">
              <p className="cw-small cw-muted">Step {step + 1} of {STEPS.length}</p>
              <h2 id="flow-step-title" tabIndex={-1}>{STEPS[step].label}</h2>
            </div>

            {step === 0 ? (
              <div className="cw-form">
                <Field id="word-headword" label="The word in Kasem" required error={error('word-headword')} hint="One word, spelled with the Kasem letters." example={<><strong>For example:</strong> the word you use for “water” at home.</>}>
                  <input id="word-headword" lang="xsm" maxLength={80} value={draft.headword} aria-invalid={Boolean(error('word-headword'))} aria-describedby={describedBy('word-headword', { error: error('word-headword'), hint: true, example: true })}
                    onFocus={(event) => { lastField.current = event.currentTarget; }} onBlur={() => void checkExisting()} onChange={(event) => { update({ headword: event.target.value }); setMatches([]); }} />
                </Field>
                <LetterPalette onInsert={insert} />
                {matches.length ? (
                  <Notice tone="neutral" title="The dictionary already has this spelling">
                    <ul className="cw-plain-list">
                      {matches.map((match) => <li key={match.id}><span lang="xsm">{match.kasem}</span> — {match.english}{match.partOfSpeech ? ` (${match.partOfSpeech})` : ''}</li>)}
                    </ul>
                    <p>If yours has a different meaning, carry on: Kasem has many words that share a spelling. If it is the same word, there is no need to add it again.</p>
                  </Notice>
                ) : null}
                <div className="cw-form-grid">
                  <Field id="word-class" label="What kind of word is it?" required error={error('word-class')}>
                    <select id="word-class" value={draft.partOfSpeech} aria-invalid={Boolean(error('word-class'))} aria-describedby={describedBy('word-class', { error: error('word-class') })} onChange={(event) => update({ partOfSpeech: event.target.value })}>
                      <option value="">Choose a word class</option>
                      {PARTS_OF_SPEECH.map((value) => <option key={value} value={value}>{partOfSpeechLabel(value)}</option>)}
                    </select>
                  </Field>
                  <Field id="word-dialect" label="Which dialect?" required error={error('word-dialect')} hint="“Not sure” is a valid answer.">
                    <select id="word-dialect" value={draft.dialect} aria-invalid={Boolean(error('word-dialect'))} aria-describedby={describedBy('word-dialect', { error: error('word-dialect'), hint: true })} onChange={(event) => update({ dialect: event.target.value })}>
                      <option value="">Choose a dialect</option>
                      {DIALECTS.map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </Field>
                </div>
              </div>
            ) : null}

            {step === 1 ? (
              <div className="cw-form">
                <Field id="word-meaning" label="What does it mean in English?" required error={error('word-meaning')} hint="If it has several meanings, give the most common one. Separate close synonyms with commas." example={<><strong>For example:</strong> “water; also a drink offered to a visitor”.</>}>
                  <input id="word-meaning" maxLength={180} value={draft.meaning} aria-invalid={Boolean(error('word-meaning'))} aria-describedby={describedBy('word-meaning', { error: error('word-meaning'), hint: true, example: true })} onChange={(event) => update({ meaning: event.target.value })} />
                </Field>
                <div className="cw-form-grid">
                  <Field id="word-example-kasem" label="An example sentence in Kasem" optional hint="A short sentence that uses the word.">
                    <textarea id="word-example-kasem" lang="xsm" rows={2} maxLength={400} value={draft.exampleKasem} aria-describedby="word-example-kasem-hint" onFocus={(event) => { lastField.current = event.currentTarget; }} onChange={(event) => update({ exampleKasem: event.target.value })} />
                  </Field>
                  <Field id="word-example-english" label="The same sentence in English" optional hint="So reviewers can check the example.">
                    <textarea id="word-example-english" rows={2} maxLength={400} value={draft.exampleEnglish} aria-describedby="word-example-english-hint" onChange={(event) => update({ exampleEnglish: event.target.value })} />
                  </Field>
                </div>
                <div className="cw-field">
                  <span className="cw-field-label">Say the word <span className="cw-field__tag">Optional</span></span>
                  <p className="cw-field__hint">A short recording of you saying the word. If approved, it becomes the word’s pronunciation. Recordings are kept on this page only until you send.</p>
                  {uploaded && !audio ? (
                    <p className="cw-small"><Icon name="check" className="cw-icon--sm" /> A recording is already uploaded for this word. <button type="button" className="cw-link-button" onClick={() => { setUploaded(null); update({ pronunciation: null }); }}>Remove it</button></p>
                  ) : (
                    <AudioCapture value={audio} onChange={(next) => { setAudio(next); setUploaded(null); update({ pronunciation: null }); }} disabled={busy} label="Pronunciation" />
                  )}
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="cw-form">
                <Field id="word-source" label="Where does this word come from?" required error={error('word-source')} hint="Your own speech, a family member, an elder, or a written source." example={<><strong>For example:</strong> “I use it at home in Paga.”</>}>
                  <input id="word-source" maxLength={600} value={draft.source} aria-invalid={Boolean(error('word-source'))} aria-describedby={describedBy('word-source', { error: error('word-source'), hint: true, example: true })} onChange={(event) => update({ source: event.target.value })} />
                </Field>
                <Field id="word-notes" label="Anything a reviewer should know?" optional hint="Where it is used, who uses it, or how it differs between villages.">
                  <textarea id="word-notes" rows={3} maxLength={1000} value={draft.notes} aria-describedby="word-notes-hint" onChange={(event) => update({ notes: event.target.value })} />
                </Field>
                <fieldset className="cw-field cw-consent">
                  <legend className="cw-field-label">Permission <span className="cw-field__tag">Required</span></legend>
                  <label className="cw-check" id="word-consent" tabIndex={-1}>
                    <input type="checkbox" checked={draft.consentGranted} aria-invalid={Boolean(error('word-consent'))} onChange={(event) => update({ consentGranted: event.target.checked })} />
                    <span><strong>I may share this word for community review, and it is public everyday language — nothing sacred or restricted.</strong></span>
                  </label>
                  {error('word-consent') ? <p className="cw-field__error"><Icon name="alert" />{error('word-consent')}</p> : null}
                </fieldset>
                <fieldset className="cw-field" id="word-publish" tabIndex={-1}>
                  <legend className="cw-field-label">After review <span className="cw-field__tag">Required</span></legend>
                  <div className="cw-choices cw-choices--2">
                    <label className="cw-choice-card">
                      <input type="radio" name="word-publish" checked={draft.publicationPermission === 'yes'} onChange={() => update({ publicationPermission: 'yes' })} />
                      <span><strong>Publish it in the dictionary</strong><span>If approved, it appears as a word entry, credited to you.</span></span>
                    </label>
                    <label className="cw-choice-card">
                      <input type="radio" name="word-publish" checked={draft.publicationPermission === 'no'} onChange={() => update({ publicationPermission: 'no' })} />
                      <span><strong>Keep it for review only</strong><span>It is reviewed and kept, but never published.</span></span>
                    </label>
                  </div>
                  {error('word-publish') ? <p className="cw-field__error"><Icon name="alert" />{error('word-publish')}</p> : null}
                </fieldset>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="cw-form">
                <p className="cw-muted">Check what you are sending. You can go back to any step to change it.</p>
                <dl className="cw-review-list">
                  <div><dt>Word</dt><dd lang="xsm">{draft.headword}</dd></div>
                  <div><dt>Word class</dt><dd>{partOfSpeechLabel(draft.partOfSpeech)}</dd></div>
                  <div><dt>Dialect</dt><dd>{draft.dialect}</dd></div>
                  <div><dt>Meaning</dt><dd>{draft.meaning}</dd></div>
                  <div><dt>Example</dt><dd>{draft.exampleKasem ? <><span lang="xsm">{draft.exampleKasem}</span>{draft.exampleEnglish ? ` — ${draft.exampleEnglish}` : ''}</> : 'None added'}</dd></div>
                  <div><dt>Pronunciation</dt><dd>{audio || uploaded ? 'Recording attached' : 'None'}</dd></div>
                  <div><dt>Source</dt><dd>{draft.source}</dd></div>
                  <div><dt>After review</dt><dd>{draft.publicationPermission === 'yes' ? 'Publish it in the dictionary' : 'Keep it for review only'}</dd></div>
                </dl>
                {progress !== null ? <div className="cw-stack cw-stack--sm"><span className="cw-small">Uploading the recording… {Math.round(progress * 100)}%</span><ProgressBar value={Math.round(progress * 100)} max={100} label="Recording upload" /></div> : null}
                {sendError ? (
                  <div role="alert" className="cw-inline-alert">
                    <p><strong>It was not sent.</strong> {sendError}</p>
                    <p>Your word is still here and saved in this browser{uploaded ? ', and the recording is already uploaded' : ''}. Trying again is safe: it will not be filed twice.</p>
                  </div>
                ) : null}
              </div>
            ) : null}

            <FlowBar status={status}>
              {step > 0 ? <button type="button" className="cw-btn--ghost" disabled={busy} onClick={() => goTo(step - 1)}><Icon name="back" className="cw-icon--sm" />Back</button> : null}
              {step < 3
                ? <button type="submit" className="button--primary">Continue<Icon name="arrow" className="cw-icon--sm" /></button>
                : <button type="submit" className="button--primary" disabled={busy} aria-busy={busy}>{busy ? 'Sending…' : sendError ? 'Try sending again' : 'Send for review'}</button>}
            </FlowBar>
          </form>
        </div>
        <aside className="cw-flow__aside" aria-label="About dictionary words">
          <Panel title="What happens after you send it">
            <ol className="cw-next-steps">
              <li>A Kasem-speaking reviewer checks the spelling, the meaning and the example.</li>
              <li>They approve it, link it to a word the dictionary already has, or explain why not.</li>
              <li>Approved words you allow to be published appear in the Kasem dictionary, credited to you.</li>
            </ol>
          </Panel>
          <Panel title="Phrases and sayings">
            <p className="cw-small">A greeting, idiom or proverb is not a single word. <PortalLink to={data.paths.section('contribute', { type: 'expression' })}>Share it as an everyday expression</PortalLink> so it keeps its meaning and context.</p>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
