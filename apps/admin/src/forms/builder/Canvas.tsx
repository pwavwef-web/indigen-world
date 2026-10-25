import { useState, type DragEvent } from 'react';
import { FIELD_TYPES } from '@indigen-world/contracts/forms';
import type { FieldType, FormDefinition, FormField, FormSection } from '@indigen-world/contracts/forms';
import { Icon, type IconName } from '../../ui/icons';
import { Badge, Button, IconButton, cx } from '../../ui/primitives';
import {
  TYPE_ICON,
  addField,
  addSection,
  describeConditions,
  duplicateField,
  moveField,
  moveFieldTo,
  moveFieldToSection,
  moveSection,
  type IssueIndex,
} from '../model';
import type { Apply, Selection } from './types';

/* ==========================================================================
   The questions, section by section. Every move has a button (Move up, Move
   down, to the previous or next section) so the whole canvas works from the
   keyboard; dragging is an extra for pointer users. Focus follows the
   question that moved.
   ========================================================================== */

export const DRAG_NEW = 'application/x-afm-new';
export const DRAG_MOVE = 'application/x-afm-move';

interface DropTarget {
  sectionId: string;
  index: number;
}

function draggedKind(event: DragEvent): 'new' | 'move' | null {
  const types = Array.from(event.dataTransfer?.types ?? []);
  if (types.includes(DRAG_MOVE)) return 'move';
  if (types.includes(DRAG_NEW)) return 'new';
  return null;
}

export function Canvas({ definition, readOnly, selection, onSelect, apply, issues, onDeleteField, onOpenSettings }: {
  definition: FormDefinition;
  readOnly: boolean;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  apply: Apply;
  issues: IssueIndex;
  onDeleteField: (fieldId: string) => void;
  /** Narrow screens: show the settings pane for the selected question. */
  onOpenSettings: () => void;
}) {
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const onDrop = (event: DragEvent, target: DropTarget) => {
    const kind = draggedKind(event);
    if (!kind || readOnly) return;
    event.preventDefault();
    setDrop(null);
    setDragging(null);
    if (kind === 'new') {
      const type = event.dataTransfer.getData(DRAG_NEW) as FieldType;
      if (!(type in FIELD_TYPES)) return;
      const result = addField(definition, type, target);
      if (result) apply(result.definition, { select: { fieldId: result.field.id, sectionId: target.sectionId }, focus: `field-select:${result.field.id}`, announce: `Added ${FIELD_TYPES[type].label} question.` });
      return;
    }
    const fieldId = event.dataTransfer.getData(DRAG_MOVE);
    const from = definition.sections.findIndex((section) => section.fields.some((field) => field.id === fieldId));
    if (from < 0) return;
    const fromIndex = definition.sections[from].fields.findIndex((field) => field.id === fieldId);
    // The target index counts the list with the moved question still in it.
    const index = definition.sections[from].id === target.sectionId && fromIndex < target.index ? target.index - 1 : target.index;
    const field = definition.sections[from].fields[fromIndex];
    apply(moveFieldTo(definition, fieldId, target.sectionId, index), { select: { fieldId, sectionId: target.sectionId }, focus: `field-select:${fieldId}`, announce: `Moved ${field.label || 'question'}.` });
  };

  const overList = (event: DragEvent, section: FormSection) => {
    if (readOnly || !draggedKind(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = draggedKind(event) === 'new' ? 'copy' : 'move';
    // Over the list's own padding (not a row): the end of the section.
    if (event.target === event.currentTarget) setDrop({ sectionId: section.id, index: section.fields.length });
  };

  return (
    <div className="afm-canvas" onDragEnd={() => { setDrop(null); setDragging(null); }}>
      {issues.general.length ? (
        <div className="ts-notice ts-notice--warning" role="note">
          <Icon name="alert" className="ts-notice__icon" />
          <div className="ts-notice__body"><ul className="afm-issue-lines">{issues.general.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul></div>
        </div>
      ) : null}
      {definition.sections.map((section, sectionIndex) => {
        const sectionSelected = selection.sectionId === section.id && !selection.fieldId;
        const sectionIssues = issues.bySection.get(section.id)?.length ?? 0;
        const rule = describeConditions(definition, section.visibleWhen, 'Shown');
        const titleId = `afm-sec-${section.id}`;
        return (
          <section key={section.id} className={cx('afm-sec', sectionSelected && 'is-selected')} aria-labelledby={titleId}>
            <header className="afm-sec__head">
              <button type="button" className="afm-sec__select" data-focus-key={`section-select:${section.id}`} aria-pressed={sectionSelected}
                onClick={() => onSelect({ fieldId: null, sectionId: section.id })}>
                <span className="afm-sec__kicker">Section {sectionIndex + 1}{definition.presentation === 'paged' ? ` · page ${sectionIndex + 1}` : ''}</span>
                <strong id={titleId} className="afm-sec__title">{section.title || 'Untitled section'}</strong>
                {section.description ? <span className="afm-sec__desc">{section.description}</span> : null}
                {rule ? <span className="afm-rule-chip"><Icon name="branch" /><span>{rule}</span></span> : null}
                {sectionIssues ? <Badge tone="warning">{sectionIssues} to fix</Badge> : null}
              </button>
              {!readOnly ? (
                <div className="afm-tools" role="group" aria-label={`Arrange section ${sectionIndex + 1}`}>
                  <IconButton icon="up" size="sm" label={`Move section ${sectionIndex + 1} up`} data-focus-key={`section-up:${section.id}`} disabled={sectionIndex === 0}
                    onClick={() => apply(moveSection(definition, section.id, -1), { focus: `section-up:${section.id}`, announce: `Moved ${section.title || 'section'} up.` })} />
                  <IconButton icon="down" size="sm" label={`Move section ${sectionIndex + 1} down`} data-focus-key={`section-down:${section.id}`} disabled={sectionIndex === definition.sections.length - 1}
                    onClick={() => apply(moveSection(definition, section.id, 1), { focus: `section-down:${section.id}`, announce: `Moved ${section.title || 'section'} down.` })} />
                </div>
              ) : null}
            </header>

            <ol className={cx('afm-sec__fields', drop?.sectionId === section.id && drop.index === section.fields.length && 'is-drop-end')}
              aria-label={`Questions in ${section.title || `section ${sectionIndex + 1}`}`}
              onDragOver={(event) => overList(event, section)}
              onDrop={(event) => onDrop(event, drop?.sectionId === section.id ? drop : { sectionId: section.id, index: section.fields.length })}>
              {section.fields.map((field, fieldIndex) => (
                <QuestionRow
                  key={field.id}
                  definition={definition}
                  field={field}
                  section={section}
                  sectionIndex={sectionIndex}
                  fieldIndex={fieldIndex}
                  readOnly={readOnly}
                  selected={selection.fieldId === field.id || Boolean(field.fields?.some((sub) => sub.id === selection.fieldId))}
                  issueCount={(issues.byField.get(field.id)?.length ?? 0) + (field.fields ?? []).reduce((total, sub) => total + (issues.byField.get(sub.id)?.length ?? 0), 0)}
                  dropBefore={drop?.sectionId === section.id && drop.index === fieldIndex}
                  dragging={dragging === field.id}
                  onSelect={() => onSelect({ fieldId: field.id, sectionId: section.id })}
                  apply={apply}
                  onDelete={() => onDeleteField(field.id)}
                  onOpenSettings={onOpenSettings}
                  onDragStart={(event) => {
                    event.dataTransfer.setData(DRAG_MOVE, field.id);
                    event.dataTransfer.setData('text/plain', field.label || field.id);
                    event.dataTransfer.effectAllowed = 'move';
                    setDragging(field.id);
                  }}
                  onDragOver={(event) => {
                    if (readOnly || !draggedKind(event)) return;
                    event.preventDefault();
                    event.stopPropagation();
                    event.dataTransfer.dropEffect = draggedKind(event) === 'new' ? 'copy' : 'move';
                    const box = event.currentTarget.getBoundingClientRect();
                    const index = event.clientY < box.top + box.height / 2 ? fieldIndex : fieldIndex + 1;
                    if (drop?.sectionId !== section.id || drop.index !== index) setDrop({ sectionId: section.id, index });
                  }}
                  onDrop={(event) => {
                    event.stopPropagation();
                    onDrop(event, drop?.sectionId === section.id ? drop : { sectionId: section.id, index: fieldIndex });
                  }}
                />
              ))}
              {!section.fields.length ? (
                <li className="afm-sec__empty">{readOnly ? 'No questions in this section.' : 'No questions yet. Choose a question type, or drag one here.'}</li>
              ) : null}
            </ol>
            {!readOnly ? (
              <div className="afm-sec__foot">
                <Button size="sm" variant="ghost" icon="plus" onClick={() => {
                  const result = addSection(definition, sectionIndex);
                  apply(result.definition, { select: { fieldId: null, sectionId: result.section.id }, focus: `section-title:${result.section.id}`, announce: 'Added a section.' });
                }}>Add section below</Button>
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function QuestionRow({ definition, field, section, sectionIndex, fieldIndex, readOnly, selected, issueCount, dropBefore, dragging, onSelect, apply, onDelete, onOpenSettings, onDragStart, onDragOver, onDrop }: {
  definition: FormDefinition;
  field: FormField;
  section: FormSection;
  sectionIndex: number;
  fieldIndex: number;
  readOnly: boolean;
  selected: boolean;
  issueCount: number;
  dropBefore: boolean;
  dragging: boolean;
  onSelect: () => void;
  apply: Apply;
  onDelete: () => void;
  onOpenSettings: () => void;
  onDragStart: (event: DragEvent<HTMLLIElement>) => void;
  onDragOver: (event: DragEvent<HTMLLIElement>) => void;
  onDrop: (event: DragEvent<HTMLLIElement>) => void;
}) {
  const info = FIELD_TYPES[field.type];
  const name = field.label || (field.type === 'instruction' ? 'Instruction text' : 'Untitled question');
  const shown = describeConditions(definition, field.visibleWhen, 'Shown');
  const required = field.requiredWhen ? describeConditions(definition, field.requiredWhen, 'Required') : null;
  const last = fieldIndex === section.fields.length - 1;
  const lastSection = sectionIndex === definition.sections.length - 1;
  const move = (next: FormDefinition, key: string, sentence: string) => apply(next, { select: { fieldId: field.id, sectionId: null }, focus: `${key}:${field.id}`, announce: sentence });
  return (
    <li
      className={cx('afm-q', selected && 'is-selected', issueCount > 0 && 'has-issues', dropBefore && 'is-drop-before', dragging && 'is-dragging')}
      draggable={!readOnly}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      data-field-id={field.id}
    >
      {!readOnly ? <span className="afm-q__grip" aria-hidden="true" title="Drag to move"><Icon name="grip" /></span> : null}
      <button type="button" className="afm-q__main" aria-pressed={selected} data-focus-key={`field-select:${field.id}`} onClick={onSelect}>
        <span className="afm-q__icon" aria-hidden="true"><Icon name={TYPE_ICON[field.type] as IconName} /></span>
        <span className="afm-q__copy">
          <strong className="afm-q__label">{name}{field.required ? <><span className="afm-q__req" aria-hidden="true"> *</span><span className="sr-only"> (required)</span></> : null}</strong>
          <small>{info.label}{info.collects ? <> · <code>{field.id}</code></> : null}</small>
          {field.type === 'instruction' && field.settings?.body ? <small className="afm-q__body">{field.settings.body}</small> : null}
          {field.type === 'group' && field.fields?.length ? <small className="afm-q__body">Each {field.settings?.itemLabel?.toLowerCase() || 'entry'}: {field.fields.map((sub) => sub.label || sub.id).join(' · ')}</small> : null}
          {shown ? <span className="afm-rule-chip"><Icon name="eye" /><span>{shown}</span></span> : null}
          {required ? <span className="afm-rule-chip"><Icon name="alert" /><span>{required}</span></span> : null}
        </span>
        {issueCount ? <Badge tone="warning">{issueCount} to fix</Badge> : null}
      </button>
      {selected && !readOnly ? (
        <div className="afm-tools afm-q__tools" role="group" aria-label={`Arrange “${name}”`}>
          <IconButton icon="up" size="sm" label="Move up" data-focus-key={`field-up:${field.id}`} disabled={fieldIndex === 0}
            onClick={() => move(moveField(definition, field.id, -1), 'field-up', `Moved ${name} up.`)} />
          <IconButton icon="down" size="sm" label="Move down" data-focus-key={`field-down:${field.id}`} disabled={last}
            onClick={() => move(moveField(definition, field.id, 1), 'field-down', `Moved ${name} down.`)} />
          <Button size="sm" variant="ghost" icon="up" className="afm-section-move" aria-label="Move to the previous section" title="Move to the previous section" data-focus-key={`field-prev:${field.id}`} disabled={sectionIndex === 0}
            onClick={() => move(moveFieldToSection(definition, field.id, -1), 'field-prev', `Moved ${name} to section ${sectionIndex}.`)}>Section</Button>
          <Button size="sm" variant="ghost" icon="down" className="afm-section-move" aria-label="Move to the next section" title="Move to the next section" data-focus-key={`field-next:${field.id}`} disabled={lastSection}
            onClick={() => move(moveFieldToSection(definition, field.id, 1), 'field-next', `Moved ${name} to section ${sectionIndex + 2}.`)}>Section</Button>
          <IconButton icon="copy" size="sm" label="Duplicate" onClick={() => {
            const result = duplicateField(definition, field.id);
            if (result) apply(result.definition, { select: { fieldId: result.field.id, sectionId: section.id }, focus: `field-select:${result.field.id}`, announce: `Duplicated ${name}.` });
          }} />
          <IconButton icon="trash" size="sm" variant="danger-ghost" label="Delete" onClick={onDelete} />
          <Button size="sm" variant="soft" icon="settings" className="afm-narrow-only" onClick={onOpenSettings}>Settings</Button>
        </div>
      ) : null}
    </li>
  );
}
