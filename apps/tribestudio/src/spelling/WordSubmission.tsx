import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { emptyDraft, PARTS_OF_SPEECH, partOfSpeechLabel } from '../creator/lexicon';
import { submitDictionaryEntry } from '../creator/dictionary-data';
import { spellingLookup, wordSubmissionStatus } from './data';

export function WordSubmission({ word, onClose }: { word: string; onClose: () => void }) {
  const [draft, setDraft] = useState(() => ({ ...emptyDraft(), headword: word, partOfSpeech: '', dialect: '' }));
  const [status, setStatus] = useState('checking');
  const [error, setError] = useState('');
  const sending = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    let active = true;
    void wordSubmissionStatus(word).then(result => { if (active) setStatus(result); })
      .catch(() => { if (active) { setStatus('failed'); setError('Could not check the dictionary and your pending words. Close and try again.'); } });
    return () => { active = false; };
  }, [word]);
  const message = status === 'approved' ? 'This word is already in the approved dictionary.'
    : status === 'pending' ? 'This word already has a submission awaiting review. It will appear in the dictionary only if approved.'
      : status === 'sent' ? 'Sent for review. Your original contribution is still here. This word is not in the approved dictionary yet.'
        : status === 'checking' ? 'Checking the dictionary and your pending words…' : '';
  return createPortal(<dialog className="ks-word-dialog" ref={dialog} aria-labelledby="ks-word-title"
    onCancel={event => { event.preventDefault(); if (!sending.current) onClose(); }}
    onClick={event => { event.stopPropagation(); if (event.target === dialog.current && !sending.current) onClose(); }}>
    <div className="ks-word-dialog__body">
      <div className="ts-row ts-row--between"><h2 id="ks-word-title">Add “{word}” for review</h2><button type="button" className="ts-btn ts-btn--ghost" aria-label="Close word contribution" disabled={status === 'sending'} onClick={onClose}>×</button></div>
      <p className="ts-hint">Public cultural material only. A Kasem-speaking reviewer checks every word. Points follow the existing approval rules.</p>
      {message ? <p role="status">{message}</p> : null}
      {error ? <p className="ts-error" role="alert">{error}</p> : null}
      {['available', 'sending'].includes(status) ? <form onSubmit={async event => {
        event.preventDefault(); event.stopPropagation(); if (sending.current) return;
        sending.current = true; setStatus('sending'); setError('');
        try {
          await submitDictionaryEntry(draft, true);
          spellingLookup.invalidate(word); setStatus('sent');
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : 'Could not send. Your details are still here.');
          try { setStatus(await wordSubmissionStatus(word)); } catch { setStatus('available'); }
        } finally { sending.current = false; }
      }}>
        <fieldset disabled={status === 'sending'} className="ks-word-fields">
          <label className="ts-field"><span className="ts-label">Kasem word</span><input className="ts-input" value={word} readOnly spellCheck={false} autoCorrect="off" autoCapitalize="none" lang="xsm" /></label>
          <label className="ts-field"><span className="ts-label">Meaning in English *</span><input className="ts-input" required maxLength={180} value={draft.senses[0].definition} onChange={e => setDraft(current => ({ ...current, senses: [{ ...current.senses[0], definition: e.target.value }] }))} /></label>
          <label className="ts-field"><span className="ts-label">Word class *</span><select className="ts-select" required value={draft.partOfSpeech} onChange={e => setDraft(current => ({ ...current, partOfSpeech: e.target.value }))}><option value="">Choose a word class</option>{PARTS_OF_SPEECH.map(option => <option key={option} value={option}>{partOfSpeechLabel(option)}</option>)}</select></label>
          <label className="ts-field"><span className="ts-label">Dialect *</span><select className="ts-select" required value={draft.dialect} onChange={e => setDraft(current => ({ ...current, dialect: e.target.value }))}><option value="">Choose a dialect</option>{['Navrongo', 'Paga', 'Chiana', 'Other', 'Not sure'].map(value => <option key={value}>{value}</option>)}</select></label>
          <label className="ts-field"><span className="ts-label">Source and attribution *</span><textarea className="ts-textarea" required maxLength={1200} rows={2} value={draft.source} onChange={e => setDraft(current => ({ ...current, source: e.target.value }))} /></label>
          <label className="ts-check"><input type="checkbox" required checked={draft.consentGranted} onChange={e => setDraft(current => ({ ...current, consentGranted: e.target.checked }))} /><span>I have permission to share this public word and source for community review.</span></label>
          <label className="ts-check"><input type="checkbox" checked={draft.publicationPermission} onChange={e => setDraft(current => ({ ...current, publicationPermission: e.target.checked }))} /><span>Allow publication if approved</span></label>
          <button className="ts-btn ts-btn--primary" type="submit">{status === 'sending' ? 'Sending…' : 'Submit word for review'}</button>
        </fieldset>
      </form> : <button type="button" className="ts-btn ts-btn--primary" onClick={onClose}>Return to my contribution</button>}
    </div>
  </dialog>, document.body);
}
