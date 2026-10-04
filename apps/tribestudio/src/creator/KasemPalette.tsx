import { KASEM_CHARACTERS } from './lexicon';

/**
 * The letters no keyboard on the contributor's desk produces.
 *
 * Not a convenience: 785 of the 1200 published entries carry at least one of
 * them. Without this the workaround is to type the nearest ASCII letter, which
 * files the word under a headword that is a different word.
 *
 * Shared by the dictionary desk and the expressions page: an expression typed
 * with the wrong letters is as wrong as a word typed with them.
 */
export function KasemPalette({ onInsert }: { onInsert: (char: string) => void }) {
  return (
    <div className="cr-keys" role="group" aria-label="Kasem letters">
      <span className="cr-keys__label">Kasem letters</span>
      {KASEM_CHARACTERS.map((entry) => (
        <button
          key={entry.char}
          type="button"
          className={entry.combining ? 'cr-key cr-key--mark' : 'cr-key'}
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

/**
 * Types [char] into [field] at its caret, the way a key press would.
 *
 * Set through the native setter so React's synthetic onChange fires and the
 * form state actually updates — assigning `.value` alone is invisible to React
 * and the character would vanish on the next render.
 */
export function insertIntoField(field: HTMLInputElement | HTMLTextAreaElement, char: string): void {
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? start;
  const next = `${field.value.slice(0, start)}${char}${field.value.slice(end)}`;
  const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(field, next);
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.focus();
  const caret = start + char.length;
  field.setSelectionRange(caret, caret);
}
