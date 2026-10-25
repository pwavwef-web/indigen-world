import { useEffect, useState, type ReactNode } from 'react';
import {
  CONSENT_PURPOSES,
  FIELD_TYPES,
  FORM_DIALECTS,
  FORM_LANGUAGES,
  FORM_LIMITS,
  ID_PATTERN,
  UPLOAD_DEFAULTS,
  UPLOAD_FORMATS,
  slugId,
} from '@indigen-world/contracts/forms';
import type { Choice, ConsentPurpose, FieldType, FormDefinition, FormField, FormSection, Issue } from '@indigen-world/contracts/forms';
import { confirmAction } from '../../ui/dialogs';
import { Icon, type IconName } from '../../ui/icons';
import { Badge, Button, Field, IconButton, Notice, cx } from '../../ui/primitives';
import {
  TYPE_ICON,
  addSubField,
  conditionCandidates,
  duplicateField,
  fieldIdsTaken,
  getField,
  issueSuffix,
  locateField,
  moveField,
  patchField,
  patchSettings,
  referencesTo,
  removeField,
  removeSection,
  renameFieldId,
  updateSection,
} from '../model';
import { CheckList, NumberInput, Switch } from '../ui';
import { ConditionEditor, newCondition } from './ConditionEditor';
import type { Apply, Selection } from './types';

/* ==========================================================================
   The settings panel for one question, sub-question or section. Text is
   stored exactly as typed. Option ids and answer keys are made once, when the
   option or question is created, and never follow a label.
   ========================================================================== */

const UPLOAD_KINDS: Record<'file' | 'image' | 'audio' | 'video', string[]> = {
  file: ['document', 'image'],
  image: ['image'],
  audio: ['audio'],
  video: ['video'],
};
const CHOICE_TYPES: FieldType[] = ['single_choice', 'multiple_choice', 'dropdown'];
const isUpload = (type: FieldType): type is 'file' | 'image' | 'audio' | 'video' => type === 'file' || type === 'image' || type === 'audio' || type === 'video';

interface PanelProps {
  definition: FormDefinition;
  readOnly: boolean;
  apply: Apply;
  issues: Issue[];
  publishedTypes: Map<string, FieldType>;
  /** Option ids each question had in any published or retired version. */
  publishedOptions?: Map<string, Set<string>>;
  select: (selection: Selection) => void;
}

/** Messages of the issues under one settings key of a question (`label`, `settings.options`, …). */
function issueLookup(definition: FormDefinition, issues: Issue[], fieldId: string) {
  const own = issues
    .map((issue) => ({ issue, suffix: issueSuffix(definition, issue, fieldId) }))
    .filter((entry): entry is { issue: Issue; suffix: string } => entry.suffix !== null);
  const errorFor = (...keys: string[]): string | undefined => {
    const messages = own.filter(({ suffix }) => keys.some((key) => suffix === key || suffix.startsWith(`${key}.`))).map(({ issue }) => issue.message);
    return messages.length ? [...new Set(messages)].join(' ') : undefined;
  };
  return { own: own.map(({ issue }) => issue), errorFor };
}

function count(value: string | undefined, max: number): string {
  return `${(value ?? '').length.toLocaleString('en-GB')} / ${max.toLocaleString('en-GB')}`;
}

/* -- Questions --------------------------------------------------------------------------- */

export function FieldSettings({ fieldId, ...props }: PanelProps & { fieldId: string }) {
  const { definition, readOnly, apply, issues, select } = props;
  const field = getField(definition, fieldId);
  const location = locateField(definition, fieldId);
  if (!field || !location) return <Notice tone="warning">This question is no longer in the form.</Notice>;
  const info = FIELD_TYPES[field.type];
  const inGroup = location.subIndex !== null;
  const group = inGroup && location.groupId ? getField(definition, location.groupId) : null;
  const { own, errorFor } = issueLookup(definition, issues, fieldId);
  const patch = (value: Partial<FormField>) => apply(patchField(definition, fieldId, value));
  const settings = (value: Partial<NonNullable<FormField['settings']>>) => apply(patchSettings(definition, fieldId, value));
  const candidates = inGroup ? [] : conditionCandidates(definition, { fieldId });
  const title = field.label || (field.type === 'instruction' ? 'Instruction text' : 'Untitled question');
  const labelKey = `field-label:${fieldId}`;

  const remove = () => void deleteField(definition, fieldId, apply);

  return (
    <div className="afm-settings" aria-labelledby={`afm-settings-${fieldId}`}>
      <div className="afm-settings__head">
        <span className="afm-settings__icon" aria-hidden="true"><Icon name={TYPE_ICON[field.type] as IconName} /></span>
        <div>
          <h2 id={`afm-settings-${fieldId}`} className="afm-h2">{info.label}</h2>
          <p className="ts-hint">{info.description}</p>
        </div>
      </div>
      {group ? (
        <Button size="sm" variant="ghost" icon="back" onClick={() => select({ fieldId: group.id, sectionId: definition.sections[location.sectionIndex].id })}>
          Back to the group “{group.label || group.id}”
        </Button>
      ) : null}
      {own.length ? (
        <Notice tone="warning" title={own.length === 1 ? '1 problem with this question' : `${own.length} problems with this question`}>
          <ul className="afm-issue-lines">{own.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul>
        </Notice>
      ) : null}

      <fieldset className="afm-fieldset afm-stack" disabled={readOnly}>
        <legend className="sr-only">Question text</legend>
        {field.type === 'instruction' ? (
          <>
            <Field label="Title" optional hint="Shown in bold above the guidance." error={errorFor('label')} counter={count(field.label, FORM_LIMITS.maxLabel)}>
              <input className="ts-input" data-focus-key={labelKey} value={field.label} onChange={(event) => patch({ label: event.target.value })} />
            </Field>
            <Field label="Guidance" required error={errorFor('settings.body')} counter={count(field.settings?.body, FORM_LIMITS.maxText)}>
              <textarea className="ts-textarea" rows={5} value={field.settings?.body ?? ''} onChange={(event) => settings({ body: event.target.value })} />
            </Field>
          </>
        ) : (
          <Field label={field.type === 'heading' ? 'Heading text' : field.type === 'checkbox' ? 'Question (shown above the tick box)' : 'Question'} required
            error={errorFor('label')} counter={count(field.label, FORM_LIMITS.maxLabel)}>
            <input className="ts-input" data-focus-key={labelKey} value={field.label} onChange={(event) => patch({ label: event.target.value })} />
          </Field>
        )}
        {field.type !== 'instruction' ? (
          <Field label="Help text" optional hint="Shown under the question." error={errorFor('description')} counter={count(field.description, 1000)}>
            <textarea className="ts-textarea" rows={2} value={field.description ?? ''} onChange={(event) => patch({ description: event.target.value })} />
          </Field>
        ) : null}
        {info.collects && field.type !== 'group' ? (
          <div className="afm-grid-2">
            <Field label="Example" optional hint="Shown as “For example: …”." error={errorFor('example')}>
              <input className="ts-input" value={field.example ?? ''} onChange={(event) => patch({ example: event.target.value })} />
            </Field>
            {!['single_choice', 'multiple_choice', 'checkbox', 'consent', 'file', 'image', 'audio', 'video'].includes(field.type) ? (
              <Field label="Placeholder" optional hint="Faint text inside an empty box." error={errorFor('placeholder')}>
                <input className="ts-input" value={field.placeholder ?? ''} onChange={(event) => patch({ placeholder: event.target.value })} />
              </Field>
            ) : null}
          </div>
        ) : null}
      </fieldset>

      {info.collects ? (
        <fieldset className="afm-fieldset afm-stack" disabled={readOnly}>
          <legend className="afm-legend">Rules</legend>
          <RequiredRule field={field} inGroup={inGroup} definition={definition} candidates={candidates} disabled={readOnly}
            onChange={(next) => patch(next)} error={errorFor('requiredWhen', 'required')} />
          {!inGroup ? (
            <VisibilityRule field={field} definition={definition} candidates={candidates} disabled={readOnly}
              onChange={(next) => patch({ visibleWhen: next })} error={errorFor('visibleWhen')} />
          ) : <p className="ts-hint">Questions inside a repeatable group are shown whenever the group is.</p>}
          {field.type !== 'group' ? (
            <Field label="Message when the answer is not accepted" optional hint="Replaces the standard message, for example “Write the word in Kasem.”" error={errorFor('validationMessage')}>
              <input className="ts-input" value={field.validationMessage ?? ''} onChange={(event) => patch({ validationMessage: event.target.value })} />
            </Field>
          ) : null}
        </fieldset>
      ) : !inGroup ? (
        <fieldset className="afm-fieldset afm-stack" disabled={readOnly}>
          <legend className="afm-legend">Rules</legend>
          <VisibilityRule field={field} definition={definition} candidates={candidates} disabled={readOnly}
            onChange={(next) => patch({ visibleWhen: next })} error={errorFor('visibleWhen')} />
        </fieldset>
      ) : null}

      <TypeSettings field={field} definition={definition} readOnly={readOnly} settings={settings} errorFor={errorFor} apply={apply} select={select} issues={issues}
        retiredOptionIds={props.publishedOptions?.get(fieldId)} />

      {info.collects ? <AnswerKey definition={definition} field={field} readOnly={readOnly} apply={apply} publishedTypes={props.publishedTypes} error={errorFor('id')} /> : null}

      {!readOnly ? (
        <div className="afm-settings__foot">
          <Button size="sm" variant="ghost" icon="copy" onClick={() => {
            const result = duplicateField(definition, fieldId);
            if (result) apply(result.definition, { select: { fieldId: result.field.id, sectionId: definition.sections[location.sectionIndex].id }, focus: `field-label:${result.field.id}`, announce: `Duplicated ${title}.` });
          }}>Duplicate</Button>
          <Button size="sm" variant="danger-ghost" icon="trash" onClick={remove}>Delete question</Button>
        </div>
      ) : null}
    </div>
  );
}

/** Ask, then remove a question; selection and focus move to its group or section. */
export async function deleteField(definition: FormDefinition, fieldId: string, apply: Apply): Promise<void> {
  const field = getField(definition, fieldId);
  const location = locateField(definition, fieldId);
  if (!field || !location) return;
  const title = field.label || (field.type === 'instruction' ? 'Instruction text' : 'Untitled question');
  const uses = referencesTo(definition, fieldId);
  const ok = await confirmAction({
    title: `Delete “${title}”?`,
    body: <>
      <p>It is removed from this draft. Responses already collected with an earlier version keep their answers.</p>
      {uses.length ? <p>It is used by {uses.join(', ')}. Those rules will show a problem until you change them.</p> : null}
    </>,
    confirmLabel: 'Delete question',
    tone: 'danger',
  });
  if (!ok) return;
  const sectionId = definition.sections[location.sectionIndex].id;
  const inGroup = location.subIndex !== null;
  apply(removeField(definition, fieldId), {
    select: inGroup ? { fieldId: location.groupId, sectionId } : { fieldId: null, sectionId },
    focus: inGroup ? `field-label:${location.groupId}` : `section-select:${sectionId}`,
    announce: `Deleted ${title}.`,
  });
}

type RequiredMode = 'always' | 'never' | 'when';

function RuleChoice<T extends string>({ name, legend, value, options, onChange, disabled }: {
  name: string;
  legend: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  disabled: boolean;
}) {
  return (
    <div className="afm-radios" role="radiogroup" aria-label={legend}>
      <span className="ts-label" aria-hidden="true">{legend}</span>
      <div className="afm-radios__row">
        {options.map((option) => (
          <label key={option.value} className={cx('afm-radio', value === option.value && 'is-checked')}>
            <input type="radio" name={name} value={option.value} checked={value === option.value} disabled={disabled} onChange={() => onChange(option.value)} />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function RequiredRule({ field, inGroup, definition, candidates, onChange, disabled, error }: {
  field: FormField;
  inGroup: boolean;
  definition: FormDefinition;
  candidates: FormField[];
  onChange: (patch: Partial<FormField>) => void;
  disabled: boolean;
  error?: string;
}) {
  const mode: RequiredMode = field.requiredWhen ? 'when' : field.required ? 'always' : 'never';
  const options: Array<{ value: RequiredMode; label: string }> = [{ value: 'always', label: 'Always' }, { value: 'never', label: 'Never' }];
  if (!inGroup) options.push({ value: 'when', label: 'Only when…' });
  return (
    <div className="afm-stack-sm">
      <RuleChoice name={`required-${field.id}`} legend="Required" value={mode} options={options} disabled={disabled}
        onChange={(next) => {
          if (next === 'always') onChange({ required: true, requiredWhen: null });
          else if (next === 'never') onChange({ required: false, requiredWhen: null });
          else onChange({ required: false, requiredWhen: { match: 'all', conditions: candidates.length ? [newCondition(candidates[candidates.length - 1])] : [] } });
        }} />
      {field.type === 'consent' ? <p className="ts-hint">A required consent must be granted to submit. Keep consents for optional uses (public sharing, AI training) not required, so contributors can refuse them.</p> : null}
      {field.type === 'group' ? <p className="ts-hint">A required group needs at least one filled-in entry (or the minimum below, if higher).</p> : null}
      {mode === 'when' ? (
        <ConditionEditor definition={definition} value={field.requiredWhen} candidates={candidates} verb="Required" disabled={disabled} label="Required rule"
          onChange={(next) => onChange({ required: false, requiredWhen: next })} />
      ) : null}
      {error ? <p className="ts-error" role="alert"><Icon name="alert" />{error}</p> : null}
    </div>
  );
}

function VisibilityRule({ field, definition, candidates, onChange, disabled, error }: {
  field: FormField | FormSection;
  definition: FormDefinition;
  candidates: FormField[];
  onChange: (next: FormField['visibleWhen']) => void;
  disabled: boolean;
  error?: string;
}) {
  const mode = field.visibleWhen ? 'when' : 'always';
  return (
    <div className="afm-stack-sm">
      <RuleChoice name={`visible-${field.id}`} legend="Shown" value={mode} disabled={disabled}
        options={[{ value: 'always', label: 'Always' }, { value: 'when', label: 'Only when…' }]}
        onChange={(next) => onChange(next === 'always' ? null : { match: 'all', conditions: candidates.length ? [newCondition(candidates[candidates.length - 1])] : [] })} />
      {mode === 'when' ? (
        <ConditionEditor definition={definition} value={field.visibleWhen} candidates={candidates} verb="Shown" disabled={disabled} label="Visibility rule" onChange={onChange} />
      ) : null}
      {error ? <p className="ts-error" role="alert"><Icon name="alert" />{error}</p> : null}
    </div>
  );
}

/* -- Type-specific settings ----------------------------------------------------------------- */

type SettingsPatch = (value: Partial<NonNullable<FormField['settings']>>) => void;

function TypeSettings({ field, definition, readOnly, settings, errorFor, apply, select, issues, retiredOptionIds }: {
  field: FormField;
  definition: FormDefinition;
  readOnly: boolean;
  settings: SettingsPatch;
  errorFor: (...keys: string[]) => string | undefined;
  apply: Apply;
  select: (selection: Selection) => void;
  issues: Issue[];
  retiredOptionIds?: Set<string>;
}) {
  const s = field.settings ?? {};
  let body: ReactNode = null;
  if (field.type === 'short_text' || field.type === 'long_text') {
    const cap = field.type === 'short_text' ? FORM_LIMITS.maxShortAnswer : FORM_LIMITS.maxLongAnswer;
    body = (
      <>
        <div className="afm-grid-2">
          <Field label="Fewest characters" optional error={errorFor('settings.minLength')}>
            <NumberInput integer value={s.minLength ?? null} onValue={(value) => settings({ minLength: value })} />
          </Field>
          <Field label="Most characters" hint={`Up to ${cap.toLocaleString('en-GB')}.`} error={errorFor('settings.maxLength')}>
            <NumberInput integer value={s.maxLength ?? null} onValue={(value) => settings({ maxLength: value })} />
          </Field>
        </div>
        <Switch label="Kasem character bar" hint="Shows buttons for ɛ, ɔ, ʋ, ŋ, ɩ and the tone marks under the box." checked={s.kasemKeyboard === true} disabled={readOnly} onChange={(checked) => settings({ kasemKeyboard: checked || undefined })} />
        {field.type === 'short_text' ? (
          <Switch label="Suggest published dictionary words (contributor portal only)" hint="Suggestions appear while typing and never replace what the contributor wrote." checked={s.dictionarySuggestions === true} disabled={readOnly} onChange={(checked) => settings({ dictionarySuggestions: checked || undefined })} />
        ) : null}
        <Field label="Pre-filled answer" optional hint="Contributors can change or clear it." error={errorFor('settings.defaultText')}>
          {field.type === 'long_text'
            ? <textarea className="ts-textarea" rows={2} value={s.defaultText ?? ''} onChange={(event) => settings({ defaultText: event.target.value || undefined })} />
            : <input className="ts-input" value={s.defaultText ?? ''} onChange={(event) => settings({ defaultText: event.target.value || undefined })} />}
        </Field>
      </>
    );
  } else if (field.type === 'number') {
    body = (
      <>
        <div className="afm-grid-2">
          <Field label="Smallest number" optional error={errorFor('settings.min')}>
            <NumberInput value={s.min ?? null} onValue={(value) => settings({ min: value })} />
          </Field>
          <Field label="Largest number" optional error={errorFor('settings.max')}>
            <NumberInput value={s.max ?? null} onValue={(value) => settings({ max: value })} />
          </Field>
        </div>
        <Switch label="Whole numbers only" checked={s.integer === true} disabled={readOnly} onChange={(checked) => settings({ integer: checked || undefined })} />
      </>
    );
  } else if (field.type === 'date') {
    body = (
      <div className="afm-grid-2">
        <Field label="Earliest date" optional error={errorFor('settings.minDate')}>
          <input className="ts-input" type="date" value={s.minDate ?? ''} onChange={(event) => settings({ minDate: event.target.value || null })} />
        </Field>
        <Field label="Latest date" optional error={errorFor('settings.maxDate')}>
          <input className="ts-input" type="date" value={s.maxDate ?? ''} onChange={(event) => settings({ maxDate: event.target.value || null })} />
        </Field>
      </div>
    );
  } else if (CHOICE_TYPES.includes(field.type)) {
    body = (
      <>
        <OptionsEditor field={field} readOnly={readOnly} settings={settings} publishedIds={retiredOptionIds} error={errorFor('settings.options', 'settings.defaultOptionIds')} />
        {field.type === 'multiple_choice' ? (
          <div className="afm-grid-2">
            <Field label="Fewest choices" optional error={errorFor('settings.minSelections')}>
              <NumberInput integer value={s.minSelections ?? null} onValue={(value) => settings({ minSelections: value })} />
            </Field>
            <Field label="Most choices" optional error={errorFor('settings.maxSelections')}>
              <NumberInput integer value={s.maxSelections ?? null} onValue={(value) => settings({ maxSelections: value })} />
            </Field>
          </div>
        ) : null}
      </>
    );
  } else if (field.type === 'language' || field.type === 'dialect') {
    const list = field.type === 'language' ? FORM_LANGUAGES : FORM_DIALECTS;
    body = (
      <CheckList legend={field.type === 'language' ? 'Languages offered' : 'Varieties offered'} hint="Leave all unticked to offer every one." options={list} value={s.allowedIds ?? []} disabled={readOnly}
        onChange={(next) => settings({ allowedIds: next.length ? next : undefined })} />
    );
  } else if (field.type === 'checkbox') {
    body = (
      <Field label="Statement beside the tick box" optional hint="For example “I recorded this with the speaker’s permission.”" error={errorFor('settings.statement')} counter={count(s.statement, 1000)}>
        <textarea className="ts-textarea" rows={2} value={s.statement ?? ''} onChange={(event) => settings({ statement: event.target.value })} />
      </Field>
    );
  } else if (field.type === 'consent') {
    const purpose = s.consentPurpose && s.consentPurpose in CONSENT_PURPOSES ? s.consentPurpose : '';
    body = (
      <>
        <Field label="What this consent permits" required hint={purpose ? CONSENT_PURPOSES[purpose].description : 'One purpose per consent question.'} error={errorFor('settings.consentPurpose')}>
          <select className="ts-select" value={purpose} onChange={(event) => settings({ consentPurpose: event.target.value as ConsentPurpose })}>
            {!purpose ? <option value="">Choose a purpose</option> : null}
            {(Object.entries(CONSENT_PURPOSES) as Array<[ConsentPurpose, { label: string }]>).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}
          </select>
        </Field>
        <Field label="Consent wording" required hint="Contributors tick this statement. The exact wording is stored with every response." error={errorFor('settings.statement')} counter={count(s.statement, 3000)}>
          <textarea className="ts-textarea" rows={3} value={s.statement ?? ''} onChange={(event) => settings({ statement: event.target.value })} />
        </Field>
        <p className="ts-hint">Approving a response never grants this permission; only the contributor’s tick does.</p>
      </>
    );
  } else if (isUpload(field.type)) {
    const defaults = UPLOAD_DEFAULTS[field.type];
    const kinds = UPLOAD_KINDS[field.type];
    const formats = Object.entries(UPLOAD_FORMATS).filter(([, format]) => kinds.includes(format.kind)).map(([id, format]) => ({ id, label: format.label, hint: format.extensions.map((ext) => `.${ext}`).join(' ') }));
    body = (
      <>
        <CheckList legend="Accepted formats" hint="Each file is identified by its contents on the server; renaming a file does not get it past this check." options={formats} value={s.formats ?? []} disabled={readOnly} columns
          onChange={(next) => settings({ formats: next })} />
        {errorFor('settings.formats') ? <p className="ts-error" role="alert"><Icon name="alert" />{errorFor('settings.formats')}</p> : null}
        <div className="afm-grid-2">
          <Field label="Largest file (MB)" hint={`1 to ${defaults.ceilingMb} MB.`} error={errorFor('settings.maxSizeMb')}>
            <NumberInput integer value={s.maxSizeMb ?? null} onValue={(value) => settings({ maxSizeMb: value ?? undefined })} />
          </Field>
          <Field label="Most files" hint={`1 to ${FORM_LIMITS.maxFilesPerField}.`} error={errorFor('settings.maxFiles')}>
            <NumberInput integer value={s.maxFiles ?? null} onValue={(value) => settings({ maxFiles: value ?? undefined })} />
          </Field>
        </div>
        {field.type === 'audio' ? <Switch label="Allow recording in the browser" hint="Contributors can record instead of choosing a file." checked={s.allowRecording === true} disabled={readOnly} onChange={(checked) => settings({ allowRecording: checked || undefined })} /> : null}
      </>
    );
  } else if (field.type === 'group') {
    body = (
      <>
        <div className="afm-grid-3">
          <Field label="Fewest entries" error={errorFor('settings.minItems')}>
            <NumberInput integer value={s.minItems ?? null} onValue={(value) => settings({ minItems: value ?? undefined })} />
          </Field>
          <Field label="Most entries" hint={`Up to ${FORM_LIMITS.maxGroupItems}.`} error={errorFor('settings.maxItems')}>
            <NumberInput integer value={s.maxItems ?? null} onValue={(value) => settings({ maxItems: value ?? undefined })} />
          </Field>
          <Field label="Entry name" hint="“Example” gives “Add example”." error={errorFor('settings.itemLabel')}>
            <input className="ts-input" value={s.itemLabel ?? ''} onChange={(event) => settings({ itemLabel: event.target.value })} />
          </Field>
        </div>
        <SubQuestions group={field} definition={definition} readOnly={readOnly} apply={apply} select={select} issues={issues} error={errorFor('fields')} />
      </>
    );
  }
  if (!body) return null;
  return (
    <fieldset className="afm-fieldset afm-stack" disabled={readOnly}>
      <legend className="afm-legend">{FIELD_TYPES[field.type].label} settings</legend>
      {body}
    </fieldset>
  );
}

function OptionsEditor({ field, readOnly, settings, publishedIds, error }: {
  field: FormField;
  readOnly: boolean;
  settings: SettingsPatch;
  /** Ids this question's options had in published or retired versions: answers and exports still use them. */
  publishedIds?: Set<string>;
  error?: string;
}) {
  const options: Choice[] = field.settings?.options ?? [];
  const defaults = field.settings?.defaultOptionIds ?? [];
  const [draft, setDraft] = useState('');
  const multiple = field.type === 'multiple_choice';
  const setOptions = (next: Choice[], nextDefaults = defaults) => settings({
    options: next,
    defaultOptionIds: nextDefaults.filter((id) => next.some((option) => option.id === id)).length ? nextDefaults.filter((id) => next.some((option) => option.id === id)) : undefined,
  });
  const add = () => {
    const label = draft || `Option ${options.length + 1}`;
    // The id is made from the label once, here, and never follows later label edits. An id an
    // earlier version used stays taken even after its option is removed, so collected answers keep their meaning.
    const id = slugId(label, 'option', [...options.map((option) => option.id), ...(publishedIds ?? [])]);
    setOptions([...options, { id, label }]);
    setDraft('');
  };
  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= options.length) return;
    const next = [...options];
    [next[index], next[target]] = [next[target], next[index]];
    setOptions(next);
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-focus-key="option-${delta < 0 ? 'up' : 'down'}:${field.id}:${next[target].id}"]`)?.focus());
  };
  return (
    <fieldset className="afm-fieldset" disabled={readOnly}>
      <legend className="ts-label">Options</legend>
      <p className="ts-hint">Each option keeps the id shown beside it, even if you change its wording; answers and exports use the id.</p>
      <ol className="afm-options">
        {options.map((option, index) => {
          const isDefault = defaults.includes(option.id);
          return (
            <li key={option.id} className="afm-option">
              <div className="afm-option__main">
                <label className="sr-only" htmlFor={`opt-${field.id}-${option.id}`}>Option {index + 1} wording</label>
                <input id={`opt-${field.id}-${option.id}`} className="ts-input ts-input--sm" value={option.label}
                  onChange={(event) => setOptions(options.map((item) => (item.id === option.id ? { ...item, label: event.target.value } : item)))} />
                <code className="afm-code" title="Option id">{option.id}</code>
              </div>
              <div className="afm-option__tools">
                <label className="afm-mini-check">
                  <input type="checkbox" checked={isDefault} onChange={(event) => {
                    const next = event.target.checked ? (multiple ? [...defaults, option.id] : [option.id]) : defaults.filter((id) => id !== option.id);
                    settings({ defaultOptionIds: next.length ? next : undefined });
                  }} />
                  <span>Default</span>
                </label>
                <IconButton icon="up" size="sm" label={`Move option ${option.label || option.id} up`} data-focus-key={`option-up:${field.id}:${option.id}`} disabled={index === 0} onClick={() => move(index, -1)} />
                <IconButton icon="down" size="sm" label={`Move option ${option.label || option.id} down`} data-focus-key={`option-down:${field.id}:${option.id}`} disabled={index === options.length - 1} onClick={() => move(index, 1)} />
                <IconButton icon="trash" size="sm" label={`Remove option ${option.label || option.id}`} disabled={options.length <= 1} onClick={() => setOptions(options.filter((item) => item.id !== option.id))} />
              </div>
            </li>
          );
        })}
      </ol>
      {options.length < FORM_LIMITS.maxOptions ? (
        <div className="afm-add-row">
          <label className="sr-only" htmlFor={`opt-new-${field.id}`}>New option wording</label>
          <input id={`opt-new-${field.id}`} className="ts-input ts-input--sm" value={draft} placeholder="New option…" onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add(); } }} />
          <Button size="sm" icon="plus" onClick={add}>Add option</Button>
        </div>
      ) : <p className="ts-hint">This question has the maximum of {FORM_LIMITS.maxOptions} options.</p>}
      {error ? <p className="ts-error" role="alert"><Icon name="alert" />{error}</p> : null}
    </fieldset>
  );
}

const GROUP_TYPES = (Object.entries(FIELD_TYPES) as Array<[FieldType, (typeof FIELD_TYPES)[FieldType]]>).filter(([, info]) => info.allowedInGroup).map(([type]) => type);

function SubQuestions({ group, definition, readOnly, apply, select, issues, error }: {
  group: FormField;
  definition: FormDefinition;
  readOnly: boolean;
  apply: Apply;
  select: (selection: Selection) => void;
  issues: Issue[];
  error?: string;
}) {
  const [type, setType] = useState<FieldType>('short_text');
  const subs = group.fields ?? [];
  const sectionId = definition.sections[locateField(definition, group.id)?.sectionIndex ?? 0]?.id ?? null;
  const problems = (subId: string) => issues.filter((issue) => issueSuffix(definition, issue, subId) !== null).length;
  return (
    <div className="afm-subs">
      <h3 className="afm-h3">Questions in each entry</h3>
      {subs.length ? (
        <ol className="afm-subs__list">
          {subs.map((sub, index) => {
            const count = problems(sub.id);
            return (
              <li key={sub.id} className="afm-subs__item">
                <button type="button" className="afm-subs__open" data-focus-key={`sub-open:${sub.id}`} onClick={() => select({ fieldId: sub.id, sectionId })}>
                  <Icon name={TYPE_ICON[sub.type] as IconName} />
                  <span className="afm-subs__copy"><strong>{sub.label || 'Untitled question'}</strong><small>{FIELD_TYPES[sub.type].label}{sub.required ? ' · Required' : ''}</small></span>
                  {count ? <Badge tone="warning">{count} to fix</Badge> : null}
                  <Icon name="chevron" />
                </button>
                {!readOnly ? (
                  <span className="afm-subs__tools">
                    <IconButton icon="up" size="sm" label={`Move ${sub.label || 'sub-question'} up`} data-focus-key={`field-up:${sub.id}`} disabled={index === 0}
                      onClick={() => apply(moveField(definition, sub.id, -1), { focus: `field-up:${sub.id}`, announce: `Moved ${sub.label || 'question'} up.` })} />
                    <IconButton icon="down" size="sm" label={`Move ${sub.label || 'sub-question'} down`} data-focus-key={`field-down:${sub.id}`} disabled={index === subs.length - 1}
                      onClick={() => apply(moveField(definition, sub.id, 1), { focus: `field-down:${sub.id}`, announce: `Moved ${sub.label || 'question'} down.` })} />
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : <p className="ts-hint">Add at least one question to the group.</p>}
      {error ? <p className="ts-error" role="alert"><Icon name="alert" />{error}</p> : null}
      {!readOnly && subs.length < FORM_LIMITS.maxGroupFields ? (
        <div className="afm-add-row">
          <label className="sr-only" htmlFor={`sub-type-${group.id}`}>Type of the new question in the group</label>
          <select id={`sub-type-${group.id}`} className="ts-select ts-select--sm" value={type} onChange={(event) => setType(event.target.value as FieldType)}>
            {GROUP_TYPES.map((item) => <option key={item} value={item}>{FIELD_TYPES[item].label}</option>)}
          </select>
          <Button size="sm" icon="plus" onClick={() => {
            const result = addSubField(definition, group.id, type);
            if (result) apply(result.definition, { select: { fieldId: result.field.id, sectionId }, focus: `field-label:${result.field.id}`, announce: `Added ${FIELD_TYPES[type].label} to the group.` });
          }}>Add to group</Button>
        </div>
      ) : null}
    </div>
  );
}

/* -- Answer key ------------------------------------------------------------------------------- */

function AnswerKey({ definition, field, readOnly, apply, publishedTypes, error }: {
  definition: FormDefinition;
  field: FormField;
  readOnly: boolean;
  apply: Apply;
  publishedTypes: Map<string, FieldType>;
  error?: string;
}) {
  const [text, setText] = useState(field.id);
  useEffect(() => setText(field.id), [field.id]);
  const locked = publishedTypes.has(field.id);
  const taken = fieldIdsTaken(definition);
  taken.delete(field.id);
  const problem = text === field.id ? null
    : !ID_PATTERN.test(text) ? 'Use 1 to 40 lower-case letters, digits or _, starting with a letter.'
      : taken.has(text) ? 'Another question in this form already uses this key.'
        : publishedTypes.has(text) && publishedTypes.get(text) !== field.type ? 'A published version used this key for a different kind of question. Choose another key.'
          : null;
  const inputId = `afm-key-${field.id}`;
  return (
    <section className="afm-fieldset afm-stack-sm afm-key" aria-labelledby={`${inputId}-title`}>
      <h3 id={`${inputId}-title`} className="afm-legend">Answer key</h3>
      {locked || readOnly ? (
        <>
          <p><code className="afm-code">{field.id}</code></p>
          <p className="ts-hint"><Icon name="lock" /> {locked
            ? 'This key is in a published version, so it cannot change: answers already collected, exports and destination mappings use it. You can still change the wording.'
            : 'Answers, exports and destination mappings use this key.'}</p>
        </>
      ) : (
        <>
          <div className="afm-add-row">
            <label className="sr-only" htmlFor={inputId}>Answer key</label>
            <input id={inputId} className="ts-input ts-input--mono ts-input--sm" value={text} spellCheck={false} autoCapitalize="off" autoCorrect="off"
              aria-invalid={problem ? true : undefined} aria-describedby={`${inputId}-hint${problem ? ` ${inputId}-error` : ''}`}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter' && !problem && text !== field.id) { event.preventDefault(); apply(renameFieldId(definition, field.id, text), { select: { fieldId: text, sectionId: null }, announce: `Answer key changed to ${text}.` }); } }} />
            <Button size="sm" disabled={Boolean(problem) || text === field.id}
              onClick={() => apply(renameFieldId(definition, field.id, text), { select: { fieldId: text, sectionId: null }, focus: `field-label:${text}`, announce: `Answer key changed to ${text}.` })}>
              Change key
            </Button>
          </div>
          <p id={`${inputId}-hint`} className="ts-hint">Answers are stored under this key. It does not follow the question’s wording, and it locks once a version with it is published. Rules and destination mappings that use it are updated with it.</p>
          {problem ? <p id={`${inputId}-error`} className="ts-error" role="alert"><Icon name="alert" />{problem}</p> : null}
        </>
      )}
      {error ? <p className="ts-error" role="alert"><Icon name="alert" />{error}</p> : null}
    </section>
  );
}

/* -- Sections ------------------------------------------------------------------------------------ */

export function SectionSettings({ sectionId, definition, readOnly, apply, issues }: Omit<PanelProps, 'publishedTypes' | 'publishedOptions' | 'select'> & { sectionId: string }) {
  const index = definition.sections.findIndex((item) => item.id === sectionId);
  const section = definition.sections[index];
  if (!section) return <Notice tone="warning">This section is no longer in the form.</Notice>;
  const base = `sections.${index}`;
  const errorFor = (key: string) => {
    const messages = issues.filter((issue) => issue.path === `${base}.${key}` || issue.path.startsWith(`${base}.${key}.`)).map((issue) => issue.message);
    return messages.length ? messages.join(' ') : undefined;
  };
  const own = issues.filter((issue) => issue.path === base || (issue.path.startsWith(`${base}.`) && !issue.path.startsWith(`${base}.fields`)));
  const candidates = conditionCandidates(definition, { sectionId });
  const name = section.title || `Section ${index + 1}`;
  const remove = async () => {
    if (definition.sections.length <= 1) return;
    if (section.fields.length) {
      const ok = await confirmAction({
        title: `Delete “${name}” and its ${section.fields.length} ${section.fields.length === 1 ? 'question' : 'questions'}?`,
        body: <p>The section and every question in it are removed from this draft. Responses collected with earlier versions keep their answers. To keep the questions, move them to another section first.</p>,
        confirmLabel: 'Delete section',
        tone: 'danger',
      });
      if (!ok) return;
    }
    const neighbour = definition.sections[index - 1] ?? definition.sections[index + 1];
    apply(removeSection(definition, sectionId), { select: { fieldId: null, sectionId: neighbour?.id ?? null }, focus: neighbour ? `section-select:${neighbour.id}` : undefined, announce: `Deleted ${name}.` });
  };
  return (
    <div className="afm-settings" aria-labelledby={`afm-section-settings-${sectionId}`}>
      <div className="afm-settings__head">
        <span className="afm-settings__icon" aria-hidden="true"><Icon name="layers" /></span>
        <div>
          <h2 id={`afm-section-settings-${sectionId}`} className="afm-h2">Section {index + 1}</h2>
          <p className="ts-hint">In a form shown one page per section, each section is a page.</p>
        </div>
      </div>
      {own.length ? <Notice tone="warning"><ul className="afm-issue-lines">{own.map((issue, at) => <li key={at}>{issue.message}</li>)}</ul></Notice> : null}
      <fieldset className="afm-fieldset afm-stack" disabled={readOnly}>
        <legend className="sr-only">Section text</legend>
        <Field label="Section title" optional hint="Shown as the page or section heading." error={errorFor('title')} counter={count(section.title, FORM_LIMITS.maxTitle)}>
          <input className="ts-input" data-focus-key={`section-title:${sectionId}`} value={section.title} onChange={(event) => apply(updateSection(definition, sectionId, { title: event.target.value }))} />
        </Field>
        <Field label="Section description" optional error={errorFor('description')} counter={count(section.description, 2000)}>
          <textarea className="ts-textarea" rows={3} value={section.description ?? ''} onChange={(event) => apply(updateSection(definition, sectionId, { description: event.target.value }))} />
        </Field>
      </fieldset>
      <fieldset className="afm-fieldset afm-stack" disabled={readOnly}>
        <legend className="afm-legend">Rules</legend>
        {index === 0 ? <p className="ts-hint">The first section is always shown: there is no earlier question for a rule to use.</p> : (
          <VisibilityRule field={section} definition={definition} candidates={candidates} disabled={readOnly}
            onChange={(next) => apply(updateSection(definition, sectionId, { visibleWhen: next }))} error={errorFor('visibleWhen')} />
        )}
      </fieldset>
      {!readOnly ? (
        <div className="afm-settings__foot">
          <Button size="sm" variant="danger-ghost" icon="trash" disabled={definition.sections.length <= 1} onClick={() => void remove()}>Delete section</Button>
          {definition.sections.length <= 1 ? <p className="ts-hint">A form needs at least one section.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
