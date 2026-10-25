import { useRef } from 'react';
import type { KasemTextProps } from '@indigen-world/console-ui';
import { KasemField } from '../../spelling/KasemField';

/*
 * Kasem answers in Indigen Forms: the portal's own KasemField (spelling and
 * tone-mark assistance, dictionary suggestions when the question asks for
 * them) plus the letters no ordinary keyboard types. The value is handed back
 * exactly as typed — no trimming, case folding or Unicode normalisation — and
 * there is no native maxlength, which could cut a tone mark off its letter.
 */

const LETTERS: readonly { char: string; name: string; mark?: boolean }[] = [
  { char: 'ɛ', name: 'open e' },
  { char: 'ɔ', name: 'open o' },
  { char: 'ŋ', name: 'eng' },
  { char: 'ɩ', name: 'iota' },
  { char: 'ʋ', name: 'upsilon' },
  { char: '́', name: 'high tone mark', mark: true },
  { char: '̀', name: 'low tone mark', mark: true },
];

type NativeField = HTMLInputElement | HTMLTextAreaElement;

/** Type a character at the caret the way a key press would, so React's onChange sees it. */
function typeInto(field: NativeField, text: string) {
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? start;
  const next = `${field.value.slice(0, start)}${text}${field.value.slice(end)}`;
  const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(field, next);
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.focus();
  field.setSelectionRange(start + text.length, start + text.length);
}

export function FormKasemText(props: KasemTextProps) {
  const field = useRef<NativeField | null>(null);
  const { multiline } = props;
  return (
    <div className="fm-kasem">
      <KasemField
        ref={field}
        as={multiline ? 'textarea' : 'input'}
        id={props.id}
        className={multiline ? 'ts-textarea iwf-textarea iwf-kasem' : 'ts-input iwf-kasem'}
        value={props.value}
        rows={multiline ? 4 : undefined}
        placeholder={props.placeholder}
        disabled={props.disabled}
        dictionaryAssistance={props.dictionarySuggestions}
        aria-invalid={props.invalid || undefined}
        aria-describedby={props.describedBy}
        aria-required={props.required || undefined}
        data-iwf-primary=""
        onChange={(event) => props.onChange(event.target.value)}
      />
      {props.kasemKeyboard ? (
        <div className="fm-keys" role="group" aria-label={`Kasem letters for ${props.field.label || 'this answer'}`}>
          {LETTERS.map((letter) => (
            <button
              key={letter.name}
              type="button"
              className={letter.mark ? 'fm-key fm-key--mark' : 'fm-key'}
              aria-label={letter.mark ? `${letter.name} (attaches to the letter before it)` : letter.name}
              title={letter.name}
              disabled={props.disabled}
              // Keep the caret in the answer for pointer users; keyboard users come back to it after inserting.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => { if (field.current) typeInto(field.current, letter.char); }}
            >
              <span aria-hidden="true">{letter.mark ? `◌${letter.char}` : letter.char}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
