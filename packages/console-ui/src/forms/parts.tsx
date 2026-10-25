import type { AnswerValue, FormField } from '@indigen-world/contracts/forms';

/* Small pieces every question shares. Admin-authored text is always rendered
   as plain React text; line breaks survive through CSS (white-space). */

export interface QuestionProps {
  field: FormField;
  /** Answer path: 'fieldId', or 'groupId.2.subId' inside a repeatable group. */
  path: string;
  /** Upload slot: 'fieldId', or 'groupId:entryKey:subId' inside a repeatable group. */
  slot: string;
  value: AnswerValue | undefined;
  onChange(value: AnswerValue): void;
  required: boolean;
}

export function joinIds(...ids: (string | false | null | undefined | 0)[]): string | undefined {
  const list = ids.filter((id): id is string => typeof id === 'string' && id.length > 0);
  return list.length ? list.join(' ') : undefined;
}

/** Ids of the description, example and rule hint, in reading order. */
export function hintIds(field: FormField, cid: string, hint?: string | null): (string | false)[] {
  return [Boolean(field.description) && `${cid}-desc`, Boolean(field.example) && `${cid}-ex`, Boolean(hint) && `${cid}-hint`];
}

export function RequiredMark({ required, spoken = false }: { required: boolean; spoken?: boolean }) {
  if (!required) return null;
  return (
    <>
      <span className="ts-required" aria-hidden="true">*</span>
      {spoken ? <span className="ts-sr">(required)</span> : null}
    </>
  );
}

export function QuestionHints({ field, cid, hint }: { field: FormField; cid: string; hint?: string | null }) {
  return (
    <>
      {field.description ? <p className="ts-hint iwf-desc" id={`${cid}-desc`}>{field.description}</p> : null}
      {field.example ? (
        <p className="ts-hint iwf-example" id={`${cid}-ex`}>
          Example: <span className="iwf-example__text">{field.example}</span>
        </p>
      ) : null}
      {hint ? <p className="ts-hint iwf-rule" id={`${cid}-hint`}>{hint}</p> : null}
    </>
  );
}

export function QuestionErrors({ cid, errors }: { cid: string; errors: string[] }) {
  if (!errors.length) return null;
  return (
    <p className="ts-error iwf-error" id={`${cid}-err`}>
      <span className="iwf-error__mark" aria-hidden="true">!</span>
      <span className="iwf-error__text">
        <span className="ts-sr">Error: </span>
        {errors.map((message, index) => <span key={index} className="iwf-error__line">{message}</span>)}
      </span>
    </p>
  );
}

export function FileGlyph() {
  return (
    <span className="iwf-file__icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5" />
      </svg>
    </span>
  );
}

export function UploadGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M5 20h14" />
    </svg>
  );
}
