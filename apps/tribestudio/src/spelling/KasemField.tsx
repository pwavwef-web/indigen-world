import { useEffect, useId, useLayoutEffect, useRef, useState, type ChangeEvent, type FocusEvent, type Ref, type TextareaHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { kasemTokens, replaceOccurrence, type KasemToken, type SpellingResult } from '@indigen-world/contracts/kasem-spelling';
import { spellingLookup, dictionaryLookup } from './data';
import { dictionarySpans, reviewedSpans, rebaseDecisions } from '@indigen-world/contracts/dictionary-assistance';
import { DictionaryChoice, useDictionarySettings } from './DictionaryAssistance';
import { WordSubmission } from './WordSubmission';
import './spelling.css';

type NativeField = HTMLInputElement | HTMLTextAreaElement;
type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'onFocus' | 'ref'> & {
  as?: 'input' | 'textarea'; enabled?: boolean; type?: string; ref?: Ref<NativeField>;
  dictionaryAssistance?: boolean;
  onChange?: (event: ChangeEvent<NativeField>) => void;
  onFocus?: (event: FocusEvent<NativeField>) => void;
};

/** The native control owns editing, selection, clipboard, IME and undo. The
 * pointer-transparent mirror only paints dotted underlines and measures words. */
export function KasemField({ as = 'textarea', enabled = true, dictionaryAssistance = false, ref: externalRef, onChange, onFocus, ...props }: Props) {
  const field = useRef<NativeField | null>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLSpanElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const id = useId();
  const value = String(props.value ?? '');
  const [results, setResults] = useState<SpellingResult[]>([]);
  const [composing, setComposing] = useState(false);
  const [selected, setSelected] = useState<{ token: KasemToken; rect: DOMRect; snapshot: string; keyboard: boolean } | null>(null);
  const [editNotice, setEditNotice] = useState('');
  const [adding, setAdding] = useState('');
  const [retry, setRetry] = useState(0);
  const [, setDecisionVersion] = useState(0);
  const decisions = useRef<KasemToken[]>([]), previous = useRef(value);
  const preferences = useDictionarySettings();
  if (previous.current !== value) {
    decisions.current = rebaseDecisions(previous.current, value, decisions.current); previous.current = value;
  }
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const tokens = dictionaryAssistance ? reviewedSpans(value, results) : kasemTokens(value);
  const editable = enabled && preferences.suggestions && !props.disabled && !props.readOnly;
  const missingKeys = new Set(results.filter(row => row.status === 'missing' || row.status === 'review').map(row => row.key));
  const missing = !composing && editable ? tokens.filter(token => missingKeys.has(token.key)
    && !decisions.current.some(d => d.start === token.start && d.end === token.end && d.text === token.text)) : [];
  const missingStarts = new Set(missing.map(token => token.start));

  useEffect(() => {
    if (!editable || composing || !value.trim()) { setResults([]); return; }
    let active = true;
    const timer = window.setTimeout(() => {
      const lookup = dictionaryAssistance ? dictionaryLookup : spellingLookup;
      void lookup.lookup((dictionaryAssistance ? dictionarySpans(value) : tokens).map(token => token.key)).then(rows => {
        if (active) setResults(rows);
      });
    }, 550);
    // Refresh bounded cache entries, and retry unknowns after an outage.
    const refresh = window.setTimeout(() => { if (active) setRetry(current => current + 1); }, 16_000);
    return () => { active = false; window.clearTimeout(timer); window.clearTimeout(refresh); };
  }, [value, editable, composing, retry, dictionaryAssistance]);
  useEffect(() => { setSelected(null); }, [value, editable, composing]);

  const syncMirror = () => {
    const input = field.current, copy = mirror.current, clip = viewport.current;
    if (!input || !copy || !clip) return;
    const style = getComputedStyle(input);
    for (const property of ['font-family', 'font-size', 'font-weight', 'font-style', 'font-variant', 'font-feature-settings', 'font-variation-settings', 'line-height', 'letter-spacing', 'word-spacing', 'text-align', 'text-indent', 'text-transform', 'direction', 'tab-size', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left']) {
      copy.style.setProperty(property, style.getPropertyValue(property));
    }
    clip.style.left = `${input.offsetLeft + input.clientLeft}px`;
    clip.style.top = `${input.offsetTop + input.clientTop}px`;
    clip.style.width = `${input.clientWidth}px`; clip.style.height = `${input.clientHeight}px`;
    clip.style.borderRadius = style.borderRadius;
    copy.style.width = `${input.clientWidth}px`;
    copy.style.whiteSpace = as === 'input' ? 'pre' : 'pre-wrap';
    copy.style.overflowWrap = as === 'input' ? 'normal' : 'break-word';
    copy.style.wordBreak = style.wordBreak;
    copy.style.transform = `translate(${-input.scrollLeft}px, ${-input.scrollTop}px)`;
  };
  useLayoutEffect(syncMirror, [value, results, composing, as]);
  useEffect(() => {
    if (!field.current) return;
    const observer = new ResizeObserver(syncMirror); observer.observe(field.current);
    void document.fonts.ready.then(syncMirror);
    return () => observer.disconnect();
  }, [as]);

  const close = (restore = false) => { setSelected(null); if (restore) window.requestAnimationFrame(() => field.current?.focus({ preventScroll: true })); };
  useLayoutEffect(() => {
    const menu = popup.current;
    if (!selected || !menu) return;
    // Rich meanings can make this taller than the original spelling menu.
    // Measure it so every choice stays inside the mobile/desktop viewport.
    menu.style.top = `${Math.max(12, Math.min(selected.rect.bottom + 6, window.innerHeight - menu.getBoundingClientRect().height - 12))}px`;
  }, [selected, results]);
  useEffect(() => {
    if (!selected) return;
    if (selected.keyboard) popup.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => { if (!popup.current?.contains(event.target as Node) && event.target !== field.current) close(); };
    const scroll = (event: Event) => { if (!(event.target instanceof Node) || !popup.current?.contains(event.target)) close(); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); close(true); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', scroll);
    window.addEventListener('scroll', scroll, true);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); window.removeEventListener('resize', scroll); window.removeEventListener('scroll', scroll, true); };
  }, [selected]);
  const open = (token: KasemToken, rect?: DOMRect, keyboard = false) => {
    const span = mirror.current?.querySelector<HTMLSpanElement>(`[data-start="${token.start}"]`);
    if (span) setSelected({ token, rect: rect ?? span.getBoundingClientRect(), snapshot: value, keyboard });
  };
  const assign = (node: NativeField | null) => {
    field.current = node;
    if (typeof externalRef === 'function') externalRef(node);
    else if (externalRef) externalRef.current = node;
  };
  const handlers = {
    ...props, ref: assign, onChange, onFocus,
    ...(enabled ? { spellCheck: false, autoCorrect: 'off', autoCapitalize: 'none', lang: 'xsm' } : {}),
    'aria-describedby': [props['aria-describedby'], editable ? `${id}-help` : ''].filter(Boolean).join(' ') || undefined,
    onScroll: () => { syncMirror(); close(); },
    onCompositionStart: () => { setComposing(true); close(); },
    onCompositionEnd: () => setComposing(false),
    onPointerDown: (event: React.PointerEvent<NativeField>) => { pointer.current = { x: event.clientX, y: event.clientY }; },
    onPointerUp: (event: React.PointerEvent<NativeField>) => {
      const start = pointer.current; pointer.current = null;
      if (!editable || composing || !start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5
        || event.currentTarget.selectionStart !== event.currentTarget.selectionEnd) return;
      for (const token of preferences.highlighting ? missing : []) {
        const span = mirror.current?.querySelector<HTMLSpanElement>(`[data-start="${token.start}"]`);
        const rect = span && [...span.getClientRects()].find(rect => event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom + 3);
        if (rect) { open(token, rect); return; }
      }
      close();
    },
    onKeyDown: (event: React.KeyboardEvent<NativeField>) => {
      if (event.altKey && event.key === 'ArrowDown' && !composing && missing.length) {
        event.preventDefault(); const caret = event.currentTarget.selectionStart ?? 0;
        open(missing.find(token => token.start <= caret && caret <= token.end) ?? missing.find(token => token.start >= caret) ?? missing[0], undefined, true);
      }
    },
  };
  let offset = 0;
  const decorations = tokens.flatMap(token => {
    const before = value.slice(offset, token.start); offset = token.end;
    return [before, <span key={token.start} data-start={token.start} className={preferences.highlighting && missingStarts.has(token.start) ? 'ks-missing' : undefined}>{token.text}</span>];
  });
  const chosen = selected && results.find(row => row.key === selected.token.key);
  const popupWidth = Math.min(300, window.innerWidth - 24);
  return <>
    <span className="ks-field">
      {as === 'input' ? <input {...handlers as React.InputHTMLAttributes<HTMLInputElement>} ref={assign} /> : <textarea {...handlers as React.TextareaHTMLAttributes<HTMLTextAreaElement>} ref={assign} />}
      <span className="ks-mirror-viewport" ref={viewport} aria-hidden="true"><div className="ks-mirror" ref={mirror}>{decorations}{value.slice(offset)}{'\u200b'}</div></span>
    </span>
    {editable ? <span className="ks-help" id={`${id}-help`}>
      {missing.length ? <button type="button" className="ks-check" onClick={event => { event.preventDefault(); open(missing[0], undefined, true); }} aria-label={`Review ${missing.length} dictionary suggestions`}>Dictionary: {missing.length} word{missing.length === 1 ? '' : 's'} to check</button> : null}
      <span className="sr-only">Dotted underlines offer dictionary or tone-mark review. They do not mean a word is incorrect. Press Alt and Down Arrow to review a word.</span>
    </span> : null}
    {editNotice ? <span className="ts-hint" role="status">{editNotice}</span> : null}
    {selected && !adding ? createPortal(<div className="ks-popup" role="dialog" aria-label={`Dictionary assistance for ${selected.token.text}`} ref={popup}
      style={{ width: popupWidth, left: Math.max(12, Math.min(selected.rect.left, window.innerWidth - popupWidth - 12)), top: Math.max(12, Math.min(selected.rect.bottom + 6, window.innerHeight - 320)) }}
      onClick={event => { event.stopPropagation(); }}
      onKeyDown={event => {
        const buttons = [...event.currentTarget.querySelectorAll<HTMLElement>('button, audio[controls], a[href]')];
        const index = buttons.indexOf(document.activeElement as HTMLElement);
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault(); buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
        }
        if (event.key === 'Tab') { event.preventDefault(); buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus(); }
      }}>
      <div className="ks-popup__title"><strong lang="xsm">{selected.token.text}</strong><button type="button" className="ks-close" aria-label="Dismiss dictionary assistance" onClick={() => { decisions.current.push(selected.token); setDecisionVersion(v => v + 1); close(true); }}>×</button></div>
      <p>{chosen?.status === 'review' ? 'Documented tone alternatives. Choose the meaning you intend; the unmarked form may also be valid.' : 'Not yet in the dictionary. This word may still be valid Kasem.'}</p>
      {chosen?.status === 'missing' && kasemTokens(selected.token.text).length === 1 ? <button type="button" className="ts-btn ts-btn--soft ts-btn--sm" onClick={() => setAdding(selected.token.text)}>Add to dictionary</button> : null}
      <p className="ks-popup__label">{chosen?.status === 'review' ? 'Dictionary spellings and meanings' : 'Similar dictionary spellings · check the meaning'}</p>
      {chosen?.suggestions.length ? chosen.suggestions.map(suggestion => <DictionaryChoice key={suggestion.id + suggestion.word} entry={suggestion} label={`Replace this occurrence with ${suggestion.word}`} onSelect={() => {
        const input = field.current;
        if (!input || composing || input.value !== selected.snapshot || replaceOccurrence(input.value, selected.token, suggestion.word) === null) { close(true); return; }
        if (suggestion.word === selected.token.text) { decisions.current.push(selected.token); setDecisionVersion(v => v + 1); close(true); return; }
        if (input.maxLength >= 0 && input.value.length - selected.token.text.length + suggestion.word.length > input.maxLength) return;
        input.focus({ preventScroll: true }); input.setSelectionRange(selected.token.start, selected.token.end);
        // insertText is the browser's editing transaction; direct .value writes
        // would clear native undo history. If unsupported, select the occurrence
        // and let the contributor paste the approved spelling themselves.
        if (!document.execCommand('insertText', false, suggestion.word)) {
          setEditNotice(`This browser cannot insert a suggestion while keeping undo history. The occurrence is selected; type or paste “${suggestion.word}” to replace it.`);
        } else {
          decisions.current = rebaseDecisions(selected.snapshot, input.value, decisions.current);
          previous.current = input.value;
          decisions.current.push({ text: suggestion.word, key: selected.token.key, start: selected.token.start, end: selected.token.start + suggestion.word.length });
          setEditNotice('');
        }
        close(true);
      }} />) : <p className="ts-hint">No close approved matches found.</p>}
      {chosen?.more ? <p className="ts-hint">More meanings exist. Open the dictionary to review the full entry.</p> : null}
      <button type="button" className="ks-check" onClick={() => { decisions.current.push(selected.token); setDecisionVersion(v => v + 1); close(true); }}>Keep my spelling for this occurrence</button>
    </div>, document.body) : null}
    {adding ? <WordSubmission word={adding} onClose={() => { setAdding(''); close(true); }} /> : null}
  </>;
}
