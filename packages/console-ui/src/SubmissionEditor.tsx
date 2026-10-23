import { useId } from 'react';
import { submissionEditFields, submissionEditValue } from '@indigen-world/contracts/submission-editing';

/** Both review desks submit only changed content fields to the trusted decision service. */
export function SubmissionEditor({ submission, edits, onChange, disabled = false }: {
  submission: Record<string, any>;
  edits: Record<string, string>;
  onChange: (edits: Record<string, string>) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const fields = submissionEditFields(submission);
  const core = new Set(['title', 'body', 'dialect', 'usageContext', 'translation.translatedContent']);
  const input = (field: (typeof fields)[number]) => <label className="ts-field" key={field.path} htmlFor={`${id}-${field.path}`}>
    <span className="ts-label">{field.label}{field.required ? ' *' : ''}</span>
    <textarea id={`${id}-${field.path}`} className="ts-textarea" rows={field.maxLength > 2000 ? 4 : 2} maxLength={field.maxLength} required={field.required}
      value={edits[field.path] ?? submissionEditValue(submission, field.path)}
      onChange={event => {
        const next = { ...edits }; const value = event.target.value;
        if (value === submissionEditValue(submission, field.path)) delete next[field.path]; else next[field.path] = value;
        onChange(next);
      }} />
  </label>;
  return <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
    <legend className="ts-label">Edit submission</legend>
    <p className="ts-hint">Corrections are recorded with your review. Contributor credit and recorded permissions stay attached to this submission.</p>
    {fields.filter(field => core.has(field.path)).map(input)}
    {[
      { label: 'Examples, context and attribution', include: (path: string) => !core.has(path) && !path.startsWith('forms.') && !path.startsWith('senses.') },
      { label: 'Word forms', include: (path: string) => path.startsWith('forms.') },
      { label: 'Individual meanings and examples', include: (path: string) => path.startsWith('senses.') },
    ].map(group => fields.some(field => group.include(field.path)) ? <details className="ts-disclosure" key={group.label}>
      <summary>{group.label}</summary><div className="ts-disclosure__body">{fields.filter(field => group.include(field.path)).map(input)}</div>
    </details> : null)}
  </fieldset>;
}
