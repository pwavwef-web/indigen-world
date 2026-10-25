import { useId } from 'react';
import { CONDITION_OPERATORS, FIELD_TYPES, FORM_LIMITS, choicesFor, operatorsFor } from '@indigen-world/contracts/forms';
import type { Condition, ConditionGroup, ConditionOperator, FormDefinition, FormField } from '@indigen-world/contracts/forms';
import { Button, IconButton, Notice } from '../../ui/primitives';
import { describeConditions } from '../model';

/* ==========================================================================
   A rule is data: up to ten conditions on EARLIER questions, joined by
   "all" or "any". The question list offered here is only the questions that
   come before the owner, so a rule can never point forwards or at itself;
   the contract's validateDefinition repeats that check on the server.
   ========================================================================== */

const CHOICE_TYPES = ['single_choice', 'multiple_choice', 'dropdown', 'language', 'dialect'];

function defaultValue(target: FormField, operator: ConditionOperator): Condition['value'] {
  if (!CONDITION_OPERATORS[operator].needsValue) return undefined;
  if (CHOICE_TYPES.includes(target.type)) return choicesFor(target)[0]?.id ?? '';
  if (target.type === 'number') return 0;
  return '';
}

export function newCondition(target: FormField): Condition {
  const operator = operatorsFor(target.type)[0] ?? 'answered';
  const value = defaultValue(target, operator);
  return value === undefined ? { fieldId: target.id, operator } : { fieldId: target.id, operator, value };
}

export function ConditionEditor({ definition, value, onChange, candidates, verb, disabled = false, label }: {
  definition: FormDefinition;
  value: ConditionGroup | null | undefined;
  onChange: (next: ConditionGroup) => void;
  /** Earlier top-level questions that collect an answer. */
  candidates: FormField[];
  /** "Shown" or "Required", for the plain-language summary. */
  verb: string;
  disabled?: boolean;
  /** Names the rule for assistive technology ("Visibility rule"). */
  label: string;
}) {
  const id = useId().replace(/:/g, '');
  const group: ConditionGroup = value ?? { match: 'all', conditions: [] };
  const summary = describeConditions(definition, group, verb);
  const update = (conditions: Condition[]) => onChange({ ...group, conditions });
  const replace = (index: number, condition: Condition) => update(group.conditions.map((item, at) => (at === index ? condition : item)));

  if (!candidates.length) {
    return (
      <Notice tone="warning" title="No earlier question to depend on">
        A rule can only use questions that come before this one and collect an answer. Add or move such a question above it first.
      </Notice>
    );
  }

  return (
    <fieldset className="afm-rule" disabled={disabled} aria-describedby={`${id}-summary`}>
      <legend className="sr-only">{label}</legend>
      <p id={`${id}-summary`} className="afm-rule__summary" aria-live="polite">{summary ?? `Add a condition to say when it is ${verb.toLowerCase()}.`}</p>
      {group.conditions.length > 1 ? (
        <label className="afm-rule__match">
          <span>Apply when</span>
          <select className="ts-select ts-select--sm" value={group.match} onChange={(event) => onChange({ ...group, match: event.target.value === 'any' ? 'any' : 'all' })}>
            <option value="all">all conditions are met</option>
            <option value="any">any condition is met</option>
          </select>
        </label>
      ) : null}
      <ol className="afm-rule__list">
        {group.conditions.map((condition, index) => {
          const target = candidates.find((field) => field.id === condition.fieldId) ?? null;
          const operators = target ? operatorsFor(target.type) : [];
          const needsValue = Boolean(CONDITION_OPERATORS[condition.operator]?.needsValue);
          const rowLabel = `Condition ${index + 1}`;
          return (
            <li key={index} className="afm-rule__row" aria-label={rowLabel}>
              <label className="afm-rule__cell">
                <span className="afm-mini-label">Question</span>
                <select className="ts-select ts-select--sm" value={target ? condition.fieldId : ''}
                  onChange={(event) => {
                    const next = candidates.find((field) => field.id === event.target.value);
                    if (next) replace(index, newCondition(next));
                  }}>
                  {!target ? <option value="">{condition.fieldId ? `Missing or later question (${condition.fieldId})` : 'Choose a question'}</option> : null}
                  {candidates.map((field) => <option key={field.id} value={field.id}>{field.label || field.id}</option>)}
                </select>
              </label>
              <label className="afm-rule__cell">
                <span className="afm-mini-label">Test</span>
                <select className="ts-select ts-select--sm" value={condition.operator} disabled={!target}
                  onChange={(event) => {
                    const operator = event.target.value as ConditionOperator;
                    const next: Condition = { fieldId: condition.fieldId, operator };
                    if (target && CONDITION_OPERATORS[operator].needsValue) {
                      next.value = CONDITION_OPERATORS[condition.operator]?.needsValue && condition.value !== undefined ? condition.value : defaultValue(target, operator);
                    }
                    replace(index, next);
                  }}>
                  {(operators.length ? operators : [condition.operator]).map((operator) => (
                    <option key={operator} value={operator}>{CONDITION_OPERATORS[operator]?.label ?? operator}</option>
                  ))}
                </select>
              </label>
              {needsValue && target ? (
                <label className="afm-rule__cell afm-rule__cell--value">
                  <span className="afm-mini-label">Value</span>
                  <ConditionValue target={target} value={condition.value} onChange={(next) => replace(index, { ...condition, value: next })} />
                </label>
              ) : null}
              <IconButton icon="trash" label={`Remove ${rowLabel.toLowerCase()}`} size="sm" onClick={() => {
                const rest = group.conditions.filter((_, at) => at !== index);
                update(rest);
              }} />
            </li>
          );
        })}
      </ol>
      <Button size="sm" variant="ghost" icon="plus" disabled={group.conditions.length >= FORM_LIMITS.maxConditions}
        onClick={() => update([...group.conditions, newCondition(candidates[candidates.length - 1])])}>
        Add condition
      </Button>
      {group.conditions.length >= FORM_LIMITS.maxConditions ? <p className="ts-hint">A rule can have up to {FORM_LIMITS.maxConditions} conditions.</p> : null}
    </fieldset>
  );
}

function ConditionValue({ target, value, onChange }: { target: FormField; value: Condition['value']; onChange: (value: Condition['value']) => void }) {
  if (CHOICE_TYPES.includes(target.type)) {
    const options = choicesFor(target);
    const known = options.some((option) => option.id === value);
    return (
      <select className="ts-select ts-select--sm" value={known ? String(value) : ''} onChange={(event) => onChange(event.target.value)}>
        {!known ? <option value="">Choose an option</option> : null}
        {options.map((option) => <option key={option.id} value={option.id}>{option.label || option.id}</option>)}
      </select>
    );
  }
  if (target.type === 'number') {
    return (
      <input className="ts-input ts-input--sm" type="text" inputMode="decimal" value={value === null || value === undefined ? '' : String(value)}
        onChange={(event) => {
          const raw = event.target.value;
          onChange(/^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw);
        }} />
    );
  }
  if (target.type === 'date') {
    return <input className="ts-input ts-input--sm" type="date" value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)} />;
  }
  return (
    <input className="ts-input ts-input--sm" type="text" value={typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value)}
      placeholder={`Text in the ${FIELD_TYPES[target.type].label.toLowerCase()} answer`}
      onChange={(event) => onChange(event.target.value)} />
  );
}
