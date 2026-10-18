import { useEffect, useState, useSyncExternalStore } from 'react';
import { dictionarySpans, reviewedSpans, hasTone } from '@indigen-world/contracts/dictionary-assistance';
import type { SpellingResult, SpellingSuggestion } from '@indigen-world/contracts/kasem-spelling';
import { dictionaryLookup, sentenceRecommendations } from './data';
import { WordSubmission } from './WordSubmission';
import './spelling.css';

const settingKey = 'indigen-dictionary-assistance-v1';
type Settings = { suggestions: boolean; highlighting: boolean };
const defaults: Settings = { suggestions: true, highlighting: true };
let settings = defaults;
try { const saved = JSON.parse(localStorage.getItem(settingKey) ?? 'null'); if (saved) settings = { suggestions: saved.suggestions !== false, highlighting: saved.highlighting !== false }; } catch { /* Optional preferences. */ }
const listeners = new Set<() => void>();
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function useDictionarySettings() { return useSyncExternalStore(subscribe, () => settings); }
function changeSetting(key: keyof Settings, value: boolean) {
  settings = { ...settings, [key]: value };
  try { localStorage.setItem(settingKey, JSON.stringify(settings)); } catch { /* Editing still works. */ }
  listeners.forEach(listener => listener());
}
export function DictionarySettings() {
  const preferences = useDictionarySettings();
  return <details className="da-settings"><summary>Dictionary settings</summary><label><input type="checkbox" checked={preferences.suggestions} onChange={e => changeSetting('suggestions', e.target.checked)} />Dictionary suggestions</label><label><input type="checkbox" checked={preferences.highlighting} onChange={e => changeSetting('highlighting', e.target.checked)} />Tone-mark highlighting</label></details>;
}
export function MarkedSpelling({ word }: { word: string }) {
  const segments = [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(word)];
  return <span lang="xsm" className="da-spelling">{segments.map((part, i) => hasTone(part.segment) ? <mark key={i}>{part.segment}</mark> : part.segment)}</span>;
}
export function DictionaryChoice({ entry, onSelect, label, disabled }: { entry: SpellingSuggestion; onSelect: () => void; label: string; disabled?: boolean }) {
  return <div className="da-choice"><button type="button" className="ks-suggestion" disabled={disabled} aria-label={label} onMouseDown={e => e.preventDefault()} onClick={onSelect}>
    <span><MarkedSpelling word={entry.word} /><small>{entry.meaning || 'Meaning not recorded'}</small><small>{[entry.partOfSpeech, entry.ipa ? `/${entry.ipa}/` : '', entry.publicationLabel || (entry.verified ? '✓ Approved dictionary entry' : 'Similar spelling — check meaning')].filter(Boolean).join(' · ')}</small></span><span aria-hidden="true">↵</span>
  </button>{entry.audioUrl ? <audio controls tabIndex={0} preload="none" src={entry.audioUrl} aria-label={`Pronunciation of ${entry.word}`} /> : null}</div>;
}

export function DictionaryRecommendations({ source, disabled, onInsert }: { source: string; disabled: boolean; onInsert: (word: string) => void }) {
  const preferences = useDictionarySettings();
  const [data, setData] = useState<{ source: string; entries: SpellingSuggestion[]; complete: boolean } | null>(null);
  const [failed, setFailed] = useState(false), [loading, setLoading] = useState(false), [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setFailed(false); setData(null);
    if (!preferences.suggestions || !source.trim()) return;
    const spinner = setTimeout(() => { if (active) setLoading(true); }, 600);
    void sentenceRecommendations(source).then(result => { if (active) setData({ source, entries: result.recommendations, complete: result.complete }); })
      .catch(() => { if (active) setFailed(true); }).finally(() => { clearTimeout(spinner); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(spinner); };
  }, [source, preferences.suggestions, retry]);
  return <section className="da-panel" aria-label="Words from your dictionary"><div className="da-panel__head"><strong>📖 Words from your dictionary</strong><DictionarySettings /></div>
    <p className="ts-hint">Vocabulary help, not a sentence translation. Choose words for your intended meaning and write natural Kasem.</p>
    {!preferences.suggestions ? <p className="ts-hint">Dictionary suggestions are off.</p> : <>
      {loading ? <p role="status" className="ts-hint">Looking in the dictionary…</p> : null}
      {failed ? <p role="status" className="ts-hint">Dictionary help is unavailable. You can keep writing and submit. <button type="button" className="ks-check" onClick={() => setRetry(v => v + 1)}>Try again</button></p> : null}
      {data?.source === source ? <>{data.entries.length ? <details className="da-vocabulary" open><summary>{data.entries.length} dictionary choices · tap to insert at your cursor</summary><div className="da-recommendations">{data.entries.map(entry => <DictionaryChoice key={entry.id + entry.word} entry={entry} disabled={disabled} label={`Insert ${entry.word}: ${entry.meaning}`} onSelect={() => onInsert(entry.word)} />)}</div></details> : <p className="ts-hint">No close English meaning matches found. Translate in your own words.</p>}{!data.complete ? <p className="ts-hint">Only part of the dictionary could be checked.</p> : null}</> : null}
    </>}
  </section>;
}

export function useDictionaryReview(value: string, enabled = true) {
  const [state, setState] = useState<{ value: string; rows: SpellingResult[] } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!enabled || !value.trim()) { setState(null); return; }
    let active = true;
    const timer = setTimeout(() => { void dictionaryLookup.lookup(dictionarySpans(value).map(t => t.key)).then(rows => { if (active) setState({ value, rows }); }); }, 550);
    const refresh = setTimeout(() => { if (active) setRetry(v => v + 1); }, 16_000);
    const online = () => setRetry(v => v + 1); window.addEventListener('online', online);
    return () => { active = false; clearTimeout(timer); clearTimeout(refresh); window.removeEventListener('online', online); };
  }, [value, enabled, retry]);
  return state?.value === value ? state.rows : [];
}
export function DictionaryReview({ value }: { value: string }) {
  const preferences = useDictionarySettings(), rows = useDictionaryReview(value, preferences.suggestions);
  const [adding, setAdding] = useState('');
  if (!preferences.suggestions || !value.trim()) return null;
  const spans = reviewedSpans(value, rows), count = (status: string) => spans.filter(t => t.result?.status === status).length;
  const missing = [...new Set(spans.filter(t => t.result?.status === 'missing').map(t => t.text))];
  const unknown = spans.some(t => !t.result || t.result.status === 'unknown');
  return <aside className="da-review" aria-label="Dictionary review"><strong>Dictionary review</strong><div className="da-review__counts"><span>✓ Dictionary matches: {count('approved')}</span><span>◉ Review suggested: {count('review')}</span><span>○ Not in dictionary: {count('missing')}</span></div>
    <p className="ts-hint">These are vocabulary checks, not proof of grammatical or contextual accuracy. New words, dialectal forms and unfamiliar constructions can still be submitted.</p>
    {unknown ? <p className="ts-hint" role="status">Some words are still unchecked. Dictionary help may be unavailable; submission remains available.</p> : null}
    {missing.length ? <div className="da-gaps"><p>{missing.length} word{missing.length === 1 ? '' : 's'} may be missing from our dictionary. Help us document them.</p>{missing.map(word => <button type="button" className="ts-btn ts-btn--soft ts-btn--sm" key={word} onClick={() => setAdding(word)}>Nominate “{word}”</button>)}</div> : null}
    {adding ? <WordSubmission word={adding} onClose={() => setAdding('')} /> : null}
  </aside>;
}
