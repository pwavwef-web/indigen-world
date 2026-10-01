import { useEffect, useRef, useState } from 'react';
import { EmptyState, Field, Icon, LetterPalette, Notice, PageHeader, Panel, ProgressBar, Skeleton, insertAtCaret } from '../components';
import { friendlyError } from '../model';
import type { UploadedAudio, WordOption } from '../types';
import { AudioCapture, type CapturedAudio } from '../recorder';
import { PortalLink, useWorkspace } from '../workspace';
import { SentPanel, Steps, useRequestId } from './flow';

const STEPS = [
  { id: 'word', label: 'Choose a word' },
  { id: 'record', label: 'Record it' },
  { id: 'send', label: 'Check and send' },
];

/**
 * Record how a published dictionary word is said. The recording belongs to
 * the word that already exists (`submitPronunciationRecording`): an approval
 * attaches it to that entry when the entry has no sound yet, and never
 * replaces a recording that is already published.
 */
export function RecordingFlow({ entry }: { entry: string }) {
  const data = useWorkspace();
  const [step, setStep] = useState(0);
  const [word, setWord] = useState<WordOption | null>(null);
  const [needing, setNeeding] = useState<WordOption[] | null>(null);
  const [needingError, setNeedingError] = useState('');
  const [spelling, setSpelling] = useState('');
  const [results, setResults] = useState<WordOption[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [audio, setAudio] = useState<CapturedAudio | null>(null);
  const [consent, setConsent] = useState<'' | 'yes' | 'no'>('');
  const [uploaded, setUploaded] = useState<UploadedAudio | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [stepError, setStepError] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [requestId, renewRequest] = useRequestId(`contributor-request:${data.uid}:recording`);
  const sending = useRef(false);
  const searchField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    data.services.wordsNeedingRecording().then((words) => {
      if (!active) return;
      setNeeding(words);
      if (entry) {
        const match = words.find((candidate) => candidate.id === entry);
        if (match) setWord(match);
      }
    }).catch(() => { if (active) { setNeeding([]); setNeedingError('The list of words without a recording could not be loaded. You can still search by spelling.'); } });
    return () => { active = false; };
  }, [data.services, entry]);

  const search = async () => {
    const value = spelling.trim();
    if (!value) return;
    setSearching(true);
    try { setResults(await data.services.findWords(value)); } catch { setResults([]); } finally { setSearching(false); }
  };

  const next = () => {
    if (step === 0 && !word) { setStepError('Choose the word you will record.'); return; }
    if (step === 1 && !audio) { setStepError('Record the word, or choose an audio file.'); return; }
    if (step === 1 && !consent) { setStepError('Choose whether reviewers may publish your recording.'); return; }
    setStepError('');
    setStep(step + 1);
    window.requestAnimationFrame(() => document.getElementById('flow-step-title')?.focus());
  };

  const send = async () => {
    if (sending.current || busy || !word || !audio || !consent) return;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      let file = uploaded;
      if (!file) {
        setProgress(0);
        file = await data.services.uploadAudio(audio.file, 'pronunciation', setProgress);
        setUploaded(file);
      }
      const result = await data.services.submitRecording({
        entryId: word.id, storagePath: file.storagePath, durationMs: audio.durationMs, publishConsent: consent === 'yes', requestId,
      });
      setSent(result.id);
      renewRequest();
    } catch (reason) {
      setError(friendlyError(reason, 'Sending your recording').message);
    } finally {
      sending.current = false;
      setBusy(false);
      setProgress(null);
    }
  };

  const breadcrumb = <><PortalLink to={data.paths.section('contribute')}>Start a contribution</PortalLink><span aria-hidden="true">/</span><span aria-current="page">Pronunciation</span></>;

  if (sent && word) {
    return (
      <div className="cw-page">
        <PageHeader breadcrumb={breadcrumb} title="Pronunciation" />
        <SentPanel
          title="Recording sent for review"
          actions={<>
            <PortalLink to={data.paths.section('contributions', { view: `recording.${sent}` })} className="cw-btn cw-btn--primary">Follow it in My submissions</PortalLink>
            <PortalLink to={data.paths.section('contribute', { type: 'recording' })} className="cw-btn">Record another word</PortalLink>
          </>}
        >
          <p>Your recording of “<span lang="xsm">{word.kasem}</span>” is with the review team. A person listens to it — nothing scores Kasem speech automatically.</p>
          <ol className="cw-next-steps">
            <li>{consent === 'yes' ? 'If approved and the word has no recording yet, yours becomes its pronunciation. If it already has one, yours is kept as an additional take.' : 'If approved, it is kept for review only, as you chose.'}</li>
            <li>If it is not accepted, the reviewer says why, and you can record it again.</li>
          </ol>
        </SentPanel>
      </div>
    );
  }

  const wordList = (words: WordOption[], name: string) => (
    <div className="cw-choices cw-choices--2" role="radiogroup" aria-label={name}>
      {words.map((option) => (
        <label key={option.id} className="cw-choice-card">
          <input type="radio" name="recording-word" checked={word?.id === option.id} onChange={() => { setWord(option); setStepError(''); setUploaded(null); }} />
          <span><strong lang="xsm">{option.kasem}{option.homographIndex ? <sup>{option.homographIndex}</sup> : null}</strong><span>{option.english}{option.partOfSpeech ? ` · ${option.partOfSpeech}` : ''}{option.hasAudio ? ' · already has a recording' : ''}</span></span>
        </label>
      ))}
    </div>
  );

  return (
    <div className="cw-page cw-flow">
      <PageHeader breadcrumb={breadcrumb} title="Record how a word is said" description="Choose a word from the published dictionary, record yourself saying it once, and send it to a reviewer." />
      <div className="cw-flow__layout">
        <div className="cw-flow__main">
          <Steps steps={STEPS} current={step} onSelect={(index) => { setStep(index); setStepError(''); }} />
          <div className="cw-panel cw-flow__form">
            <div className="cw-flow__head">
              <p className="cw-small cw-muted">Step {step + 1} of {STEPS.length}</p>
              <h2 id="flow-step-title" tabIndex={-1}>{STEPS[step].label}</h2>
            </div>

            {step === 0 ? (
              <div className="cw-form">
                <form className="cw-recording-search" role="search" onSubmit={(event) => { event.preventDefault(); void search(); }}>
                  <Field id="recording-spelling" label="Find a word by its spelling" hint="Type the Kasem word exactly as the dictionary spells it.">
                    <div className="cw-row cw-recording-search__row">
                      <input id="recording-spelling" ref={searchField} lang="xsm" value={spelling} aria-describedby="recording-spelling-hint" onChange={(event) => setSpelling(event.target.value)} />
                      <button type="submit" disabled={searching || !spelling.trim()}>{searching ? 'Searching…' : 'Search'}</button>
                    </div>
                  </Field>
                  <LetterPalette onInsert={(letter) => {
                    const field = searchField.current;
                    if (!field) return;
                    const { value, caret } = insertAtCaret(field, letter);
                    setSpelling(value);
                    window.requestAnimationFrame(() => { field.focus(); field.setSelectionRange(caret, caret); });
                  }} />
                </form>
                {results ? (results.length ? wordList(results, 'Search results') : <p className="cw-muted">No published word is spelled “<span lang="xsm">{spelling}</span>”. Check the spelling, or choose from the list below.</p>) : null}
                <div className="cw-stack cw-stack--sm">
                  <h3 className="cw-subhead">Words without a recording yet</h3>
                  {needing === null ? <Skeleton lines={3} label="Loading words" /> : needingError ? <p className="cw-muted">{needingError}</p> : needing.length ? wordList(needing, 'Words without a recording') : (
                    <EmptyState title="Every listed word has a recording" icon="check" variant="inline">Search above to record another take of a word that already has one.</EmptyState>
                  )}
                </div>
              </div>
            ) : null}

            {step === 1 && word ? (
              <div className="cw-form">
                <div className="cw-word-card">
                  <span className="cw-small cw-muted">You are recording</span>
                  <strong lang="xsm">{word.kasem}</strong>
                  <span className="cw-muted">{word.english}</span>
                </div>
                <Panel title="Before you record" className="cw-guidance">
                  <ul className="cw-plain-list cw-small">
                    <li>Find a quiet place, away from fans, traffic and other voices.</li>
                    <li>Hold your phone about a hand’s length from your mouth.</li>
                    <li>Say the word once, clearly, the way you normally would. Leave a short pause before and after.</li>
                    <li>Listen back. If it is unclear, record it again — only the take you send is kept.</li>
                  </ul>
                </Panel>
                <AudioCapture value={audio} onChange={(next) => { setAudio(next); setUploaded(null); setStepError(''); }} disabled={busy} label="Pronunciation" />
                <fieldset className="cw-field">
                  <legend className="cw-field-label">May reviewers publish your recording with the word? <span className="cw-field__tag">Required</span></legend>
                  <div className="cw-choices cw-choices--2">
                    <label className="cw-choice-card">
                      <input type="radio" name="recording-consent" checked={consent === 'yes'} onChange={() => { setConsent('yes'); setStepError(''); }} />
                      <span><strong>Yes, it may be published</strong><span>If approved, anyone reading the word can hear it.</span></span>
                    </label>
                    <label className="cw-choice-card">
                      <input type="radio" name="recording-consent" checked={consent === 'no'} onChange={() => { setConsent('no'); setStepError(''); }} />
                      <span><strong>No, keep it for review only</strong><span>Reviewers can hear it; it is never published.</span></span>
                    </label>
                  </div>
                </fieldset>
              </div>
            ) : null}

            {step === 2 && word && audio ? (
              <div className="cw-form">
                <dl className="cw-review-list">
                  <div><dt>Word</dt><dd lang="xsm">{word.kasem}</dd></div>
                  <div><dt>Meaning</dt><dd>{word.english}</dd></div>
                  <div><dt>Your take</dt><dd><audio controls src={audio.url} preload="metadata" aria-label="Your recording" /></dd></div>
                  <div><dt>Length</dt><dd>{(audio.durationMs / 1000).toFixed(1)} seconds</dd></div>
                  <div><dt>Publication</dt><dd>{consent === 'yes' ? 'May be published with the word' : 'Keep for review only'}</dd></div>
                </dl>
                {progress !== null ? <div className="cw-stack cw-stack--sm"><span className="cw-small">Uploading… {Math.round(progress * 100)}%</span><ProgressBar value={Math.round(progress * 100)} max={100} label="Recording upload" /></div> : null}
                {error ? (
                  <div role="alert" className="cw-inline-alert">
                    <p><strong>It was not sent.</strong> {error}</p>
                    <p>Your recording is still on this page{uploaded ? ' and already uploaded' : ''}. Keep this page open and try again — it will not be filed twice.</p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {stepError ? <p className="cw-field__error" role="alert"><Icon name="alert" />{stepError}</p> : null}

            <div className="cw-flowbar">
              <span className="cw-draft-state is-empty"><span className="cw-draft-state__dot" aria-hidden="true" />Recordings stay on this page until you send them</span>
              <div className="cw-flowbar__actions">
                {step > 0 ? <button type="button" className="cw-btn--ghost" disabled={busy} onClick={() => { setStep(step - 1); setStepError(''); }}><Icon name="back" className="cw-icon--sm" />Back</button> : null}
                {step < 2
                  ? <button type="button" className="button--primary" onClick={next}>Continue<Icon name="arrow" className="cw-icon--sm" /></button>
                  : <button type="button" className="button--primary" disabled={busy} aria-busy={busy} onClick={() => void send()}>{busy ? 'Sending…' : error ? 'Try sending again' : 'Send for review'}</button>}
              </div>
            </div>
          </div>
        </div>
        <aside className="cw-flow__aside" aria-label="About pronunciations">
          <Panel title="What happens after you send it">
            <ol className="cw-next-steps">
              <li>A person listens to your recording. Nothing transcribes or scores Kasem speech automatically.</li>
              <li>If approved and you allowed it, it is attached to the word — a published recording is never replaced.</li>
              <li>If it is not accepted, the reviewer says why, and you can record it again.</li>
            </ol>
          </Panel>
          {!audio ? <Notice tone="neutral" title="Your microphone">The browser asks for permission the first time you record. You can also upload a short audio file.</Notice> : null}
        </aside>
      </div>
    </div>
  );
}
