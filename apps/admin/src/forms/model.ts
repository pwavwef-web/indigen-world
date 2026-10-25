import {
  CONDITION_OPERATORS,
  FIELD_TYPES,
  allFieldIds,
  choicesFor,
  createField,
  createSection,
  newId,
} from '@indigen-world/contracts/forms';
import type {
  ConditionGroup,
  FieldType,
  FormDefinition,
  FormField,
  FormSection,
  Issue,
} from '@indigen-world/contracts/forms';

/* ==========================================================================
   Pure edits on a form definition, for the builder. Every function returns a
   new definition and leaves its input untouched. Labels and other
   administrator text are carried exactly as typed: no trimming, no case
   changes, no Unicode normalisation (the server trims surrounding whitespace
   when it saves, and only that). Answer keys (field ids) never follow a label.
   ========================================================================== */

export interface FieldLocation {
  sectionIndex: number;
  fieldIndex: number;
  /** Index inside a repeatable group, for a sub-question. */
  subIndex: number | null;
  /** The group's id, for a sub-question. */
  groupId: string | null;
}

export function locateField(definition: FormDefinition, fieldId: string): FieldLocation | null {
  for (const [sectionIndex, section] of definition.sections.entries()) {
    for (const [fieldIndex, field] of section.fields.entries()) {
      if (field.id === fieldId) return { sectionIndex, fieldIndex, subIndex: null, groupId: null };
      for (const [subIndex, sub] of (field.fields ?? []).entries()) {
        if (sub.id === fieldId) return { sectionIndex, fieldIndex, subIndex, groupId: field.id };
      }
    }
  }
  return null;
}

export function fieldAt(definition: FormDefinition, location: FieldLocation): FormField | null {
  const field = definition.sections[location.sectionIndex]?.fields[location.fieldIndex] ?? null;
  if (!field || location.subIndex === null) return field;
  return field.fields?.[location.subIndex] ?? null;
}

export function getField(definition: FormDefinition, fieldId: string): FormField | null {
  const location = locateField(definition, fieldId);
  return location ? fieldAt(definition, location) : null;
}

function withSections(definition: FormDefinition, sections: FormSection[]): FormDefinition {
  return { ...definition, sections };
}

function replaceSection(definition: FormDefinition, index: number, section: FormSection): FormDefinition {
  return withSections(definition, definition.sections.map((item, at) => (at === index ? section : item)));
}

export function fieldIdsTaken(definition: FormDefinition): Set<string> {
  return new Set(allFieldIds(definition));
}

/* -- Questions ------------------------------------------------------------------------ */

/** Apply a change to one question (top level or inside a group). */
export function updateField(definition: FormDefinition, fieldId: string, change: (field: FormField) => FormField): FormDefinition {
  const location = locateField(definition, fieldId);
  if (!location) return definition;
  const section = definition.sections[location.sectionIndex];
  const fields = section.fields.map((field, index) => {
    if (index !== location.fieldIndex) return field;
    if (location.subIndex === null) return change(field);
    return { ...field, fields: (field.fields ?? []).map((sub, subIndex) => (subIndex === location.subIndex ? change(sub) : sub)) };
  });
  return replaceSection(definition, location.sectionIndex, { ...section, fields });
}

export function patchField(definition: FormDefinition, fieldId: string, patch: Partial<FormField>): FormDefinition {
  return updateField(definition, fieldId, (field) => ({ ...field, ...patch }));
}

export function patchSettings(definition: FormDefinition, fieldId: string, patch: Partial<NonNullable<FormField['settings']>>): FormDefinition {
  return updateField(definition, fieldId, (field) => ({ ...field, settings: { ...(field.settings ?? {}), ...patch } }));
}

export interface InsertionPoint {
  sectionId: string;
  index: number;
}

/** Where a new question goes: after the selected question, else at the end of the selected (or last) section. */
export function insertionPoint(definition: FormDefinition, selected: { fieldId?: string | null; sectionId?: string | null }): InsertionPoint | null {
  if (selected.fieldId) {
    const location = locateField(definition, selected.fieldId);
    if (location) return { sectionId: definition.sections[location.sectionIndex].id, index: location.fieldIndex + 1 };
  }
  const section = definition.sections.find((item) => item.id === selected.sectionId) ?? definition.sections.at(-1);
  return section ? { sectionId: section.id, index: section.fields.length } : null;
}

export function addField(definition: FormDefinition, type: FieldType, at: InsertionPoint): { definition: FormDefinition; field: FormField } | null {
  const sectionIndex = definition.sections.findIndex((section) => section.id === at.sectionId);
  if (sectionIndex < 0) return null;
  const field = createField(type, fieldIdsTaken(definition));
  const section = definition.sections[sectionIndex];
  const fields = [...section.fields];
  fields.splice(Math.max(0, Math.min(at.index, fields.length)), 0, field);
  return { definition: replaceSection(definition, sectionIndex, { ...section, fields }), field };
}

/** Move a question up or down inside its section (or a sub-question inside its group). */
export function moveField(definition: FormDefinition, fieldId: string, delta: -1 | 1): FormDefinition {
  const location = locateField(definition, fieldId);
  if (!location) return definition;
  const section = definition.sections[location.sectionIndex];
  if (location.subIndex !== null) {
    const group = section.fields[location.fieldIndex];
    const subs = [...(group.fields ?? [])];
    const target = location.subIndex + delta;
    if (target < 0 || target >= subs.length) return definition;
    [subs[location.subIndex], subs[target]] = [subs[target], subs[location.subIndex]];
    return updateField(definition, group.id, (field) => ({ ...field, fields: subs }));
  }
  const target = location.fieldIndex + delta;
  if (target < 0 || target >= section.fields.length) return definition;
  const fields = [...section.fields];
  [fields[location.fieldIndex], fields[target]] = [fields[target], fields[location.fieldIndex]];
  return replaceSection(definition, location.sectionIndex, { ...section, fields });
}

/**
 * Move a question into the previous section (at its end) or the next section
 * (at its start), so it stays next to the questions it was beside.
 */
export function moveFieldToSection(definition: FormDefinition, fieldId: string, direction: -1 | 1): FormDefinition {
  const location = locateField(definition, fieldId);
  if (!location || location.subIndex !== null) return definition;
  const targetIndex = location.sectionIndex + direction;
  const target = definition.sections[targetIndex];
  if (!target) return definition;
  return moveFieldTo(definition, fieldId, target.id, direction < 0 ? target.fields.length : 0);
}

/** Move a question to a position in any section (drag and drop). `index` counts the target list without the moved question. */
export function moveFieldTo(definition: FormDefinition, fieldId: string, sectionId: string, index: number): FormDefinition {
  const location = locateField(definition, fieldId);
  if (!location || location.subIndex !== null) return definition;
  const field = definition.sections[location.sectionIndex].fields[location.fieldIndex];
  const sections = definition.sections.map((section, sectionIndex) => (
    sectionIndex === location.sectionIndex ? { ...section, fields: section.fields.filter((item) => item.id !== fieldId) } : section
  ));
  const targetIndex = sections.findIndex((section) => section.id === sectionId);
  if (targetIndex < 0) return definition;
  const fields = [...sections[targetIndex].fields];
  fields.splice(Math.max(0, Math.min(index, fields.length)), 0, field);
  sections[targetIndex] = { ...sections[targetIndex], fields };
  return withSections(definition, sections);
}

/** A copy placed right after the original, with new answer keys (options keep theirs: they belong to the question). */
export function duplicateField(definition: FormDefinition, fieldId: string): { definition: FormDefinition; field: FormField } | null {
  const location = locateField(definition, fieldId);
  if (!location) return null;
  const original = fieldAt(definition, location);
  if (!original) return null;
  const taken = fieldIdsTaken(definition);
  const copy: FormField = structuredClone(original);
  copy.id = newId('q', taken);
  taken.add(copy.id);
  if (copy.label) copy.label = `${copy.label} (copy)`;
  if (copy.fields) {
    copy.fields = copy.fields.map((sub) => {
      const id = newId('q', taken);
      taken.add(id);
      return { ...sub, id };
    });
  }
  const section = definition.sections[location.sectionIndex];
  if (location.subIndex !== null) {
    const group = section.fields[location.fieldIndex];
    const subs = [...(group.fields ?? [])];
    subs.splice(location.subIndex + 1, 0, copy);
    return { definition: updateField(definition, group.id, (field) => ({ ...field, fields: subs })), field: copy };
  }
  const fields = [...section.fields];
  fields.splice(location.fieldIndex + 1, 0, copy);
  return { definition: replaceSection(definition, location.sectionIndex, { ...section, fields }), field: copy };
}

export function removeField(definition: FormDefinition, fieldId: string): FormDefinition {
  const location = locateField(definition, fieldId);
  if (!location) return definition;
  const section = definition.sections[location.sectionIndex];
  if (location.subIndex !== null) {
    return updateField(definition, section.fields[location.fieldIndex].id, (field) => ({ ...field, fields: (field.fields ?? []).filter((sub) => sub.id !== fieldId) }));
  }
  return replaceSection(definition, location.sectionIndex, { ...section, fields: section.fields.filter((field) => field.id !== fieldId) });
}

export function addSubField(definition: FormDefinition, groupId: string, type: FieldType): { definition: FormDefinition; field: FormField } | null {
  const group = getField(definition, groupId);
  if (!group || group.type !== 'group') return null;
  const field = createField(type, fieldIdsTaken(definition));
  return { definition: updateField(definition, groupId, (item) => ({ ...item, fields: [...(item.fields ?? []), field] })), field };
}

/**
 * Change an answer key. Only allowed while the key was never published (the
 * builder checks); conditions and destination mappings that point at the old
 * key follow it.
 */
export function renameFieldId(definition: FormDefinition, oldId: string, nextId: string): FormDefinition {
  const swap = (group: ConditionGroup | null | undefined): ConditionGroup | null | undefined => (
    group ? { ...group, conditions: group.conditions.map((condition) => (condition.fieldId === oldId ? { ...condition, fieldId: nextId } : condition)) } : group
  );
  const renamed = patchField(definition, oldId, { id: nextId });
  const sections = renamed.sections.map((section) => ({
    ...section,
    visibleWhen: swap(section.visibleWhen) ?? null,
    fields: section.fields.map((field) => ({
      ...field,
      ...(field.visibleWhen !== undefined ? { visibleWhen: swap(field.visibleWhen) } : {}),
      ...(field.requiredWhen !== undefined ? { requiredWhen: swap(field.requiredWhen) } : {}),
    })),
  }));
  const mapping = Object.fromEntries(Object.entries(renamed.destination.mapping).map(([slot, fieldId]) => [slot, fieldId === oldId ? nextId : fieldId]));
  return { ...renamed, sections, destination: { ...renamed.destination, mapping } };
}

/** Every place a question is used by a rule, for warnings before deleting it. */
export function referencesTo(definition: FormDefinition, fieldId: string): string[] {
  const out: string[] = [];
  const uses = (group: ConditionGroup | null | undefined) => Boolean(group?.conditions.some((condition) => condition.fieldId === fieldId));
  for (const section of definition.sections) {
    if (uses(section.visibleWhen)) out.push(`the condition on section “${section.title || 'Untitled section'}”`);
    for (const field of section.fields) {
      if (field.id === fieldId) continue;
      if (uses(field.visibleWhen) || uses(field.requiredWhen)) out.push(`the conditions on “${field.label || field.id}”`);
    }
  }
  for (const [slot, mapped] of Object.entries(definition.destination.mapping)) {
    if (mapped === fieldId) out.push(`the destination mapping (${slot})`);
  }
  return out;
}

/* -- Sections ---------------------------------------------------------------------------- */

export function addSection(definition: FormDefinition, afterIndex: number): { definition: FormDefinition; section: FormSection } {
  const section = createSection(definition.sections.map((item) => item.id));
  const sections = [...definition.sections];
  sections.splice(Math.max(0, Math.min(afterIndex + 1, sections.length)), 0, section);
  return { definition: withSections(definition, sections), section };
}

export function updateSection(definition: FormDefinition, sectionId: string, patch: Partial<FormSection>): FormDefinition {
  return withSections(definition, definition.sections.map((section) => (section.id === sectionId ? { ...section, ...patch } : section)));
}

export function moveSection(definition: FormDefinition, sectionId: string, delta: -1 | 1): FormDefinition {
  const index = definition.sections.findIndex((section) => section.id === sectionId);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= definition.sections.length) return definition;
  const sections = [...definition.sections];
  [sections[index], sections[target]] = [sections[target], sections[index]];
  return withSections(definition, sections);
}

export function removeSection(definition: FormDefinition, sectionId: string): FormDefinition {
  return withSections(definition, definition.sections.filter((section) => section.id !== sectionId));
}

/* -- Conditions ---------------------------------------------------------------------------- */

/**
 * Questions a rule may depend on: top-level questions that collect an answer
 * and come before the owner. For a section, the questions in earlier sections.
 */
export function conditionCandidates(definition: FormDefinition, owner: { fieldId?: string; sectionId?: string }): FormField[] {
  const out: FormField[] = [];
  for (const section of definition.sections) {
    if (owner.sectionId && section.id === owner.sectionId) return out;
    for (const field of section.fields) {
      if (owner.fieldId && field.id === owner.fieldId) return out;
      if (FIELD_TYPES[field.type]?.collects) out.push(field);
    }
  }
  return out;
}

function valueText(field: FormField | null, value: unknown): string {
  if (value === undefined || value === null || value === '') return '…';
  if (field && ['single_choice', 'multiple_choice', 'dropdown', 'language', 'dialect'].includes(field.type)) {
    return choicesFor(field).find((option) => option.id === value)?.label ?? String(value);
  }
  return String(value);
}

/** “Shown when Contribution type is Audio recording”, from the rule's data. */
export function describeConditions(definition: FormDefinition, group: ConditionGroup | null | undefined, verb: string): string | null {
  if (!group || !group.conditions.length) return null;
  const parts = group.conditions.map((condition) => {
    const target = getField(definition, condition.fieldId);
    const operator = CONDITION_OPERATORS[condition.operator];
    const name = target ? (target.label || target.id) : 'a missing question';
    if (!operator) return `${name} …`;
    return operator.needsValue ? `${name} ${operator.label} ${valueText(target, condition.value)}` : `${name} ${operator.label}`;
  });
  if (parts.length === 1) return `${verb} when ${parts[0]}`;
  return `${verb} when ${group.match === 'any' ? 'any' : 'all'} of these apply: ${parts.join('; ')}`;
}

/* -- Issues -------------------------------------------------------------------------------- */

export type SettingsTab = 'details' | 'presentation' | 'schedule' | 'submission' | 'audience' | 'review' | 'destination' | 'versions';

export interface IssueTarget {
  sectionId: string | null;
  fieldId: string | null;
  /** The form-settings tab for a form-level path. */
  tab: SettingsTab | null;
}

const TAB_FOR_ROOT: Record<string, SettingsTab> = {
  title: 'details',
  description: 'details',
  category: 'details',
  instructions: 'details',
  estimatedMinutes: 'details',
  languageContext: 'details',
  schemaVersion: 'details',
  presentation: 'presentation',
  schedule: 'schedule',
  submission: 'submission',
  audience: 'audience',
  review: 'review',
  destination: 'destination',
};

/**
 * Where a validateDefinition issue belongs. Paths use the positions of the
 * definition that was validated (`sections.1.fields.0.fields.2.label`), so
 * they resolve against that same definition.
 */
export function issueTarget(definition: FormDefinition, path: string): IssueTarget {
  const parts = path.split('.');
  if (parts[0] === 'sections' && /^\d+$/.test(parts[1] ?? '')) {
    const section = definition.sections[Number(parts[1])];
    if (!section) return { sectionId: null, fieldId: null, tab: null };
    if (parts[2] === 'fields' && /^\d+$/.test(parts[3] ?? '')) {
      const field = section.fields[Number(parts[3])];
      if (field && parts[4] === 'fields' && /^\d+$/.test(parts[5] ?? '')) {
        const sub = field.fields?.[Number(parts[5])];
        return { sectionId: section.id, fieldId: sub?.id ?? field.id, tab: null };
      }
      return { sectionId: section.id, fieldId: field?.id ?? null, tab: null };
    }
    return { sectionId: section.id, fieldId: null, tab: null };
  }
  return { sectionId: null, fieldId: null, tab: TAB_FOR_ROOT[parts[0]] ?? null };
}

export interface IssueIndex {
  byField: Map<string, Issue[]>;
  bySection: Map<string, Issue[]>;
  byTab: Map<SettingsTab, Issue[]>;
  /** Form-wide issues about the questions as a whole ("Add at least one section"). */
  general: Issue[];
}

export function indexIssues(definition: FormDefinition, issues: Issue[]): IssueIndex {
  const index: IssueIndex = { byField: new Map(), bySection: new Map(), byTab: new Map(), general: [] };
  const push = <K>(map: Map<K, Issue[]>, key: K, issue: Issue) => { map.set(key, [...(map.get(key) ?? []), issue]); };
  for (const issue of issues) {
    const target = issueTarget(definition, issue.path);
    if (target.fieldId) push(index.byField, target.fieldId, issue);
    else if (target.sectionId) push(index.bySection, target.sectionId, issue);
    else if (target.tab) push(index.byTab, target.tab, issue);
    else index.general.push(issue);
  }
  return index;
}

/** The part of a field-level issue path after the field itself (`label`, `settings.options.2.label`, …). */
export function issueSuffix(definition: FormDefinition, issue: Issue, fieldId: string): string | null {
  const location = locateField(definition, fieldId);
  if (!location) return null;
  const base = location.subIndex === null
    ? `sections.${location.sectionIndex}.fields.${location.fieldIndex}`
    : `sections.${location.sectionIndex}.fields.${location.fieldIndex}.fields.${location.subIndex}`;
  if (issue.path === base) return '';
  return issue.path.startsWith(`${base}.`) ? issue.path.slice(base.length + 1) : null;
}

/* -- Palette ------------------------------------------------------------------------------- */

export const FAMILY_LABELS: Record<string, { label: string; hint: string }> = {
  text: { label: 'Text, numbers and dates', hint: 'Typed answers' },
  choice: { label: 'Choices', hint: 'Pick from a list' },
  confirm: { label: 'Confirmation and consent', hint: 'Ticks and permissions' },
  upload: { label: 'Uploads', hint: 'Files and recordings' },
  structure: { label: 'Repeatable groups', hint: 'Answer a set several times' },
  display: { label: 'Display only', hint: 'Collects nothing' },
};

export function paletteGroups(): Array<{ family: string; label: string; hint: string; types: FieldType[] }> {
  const families = new Map<string, FieldType[]>();
  for (const [type, info] of Object.entries(FIELD_TYPES) as Array<[FieldType, (typeof FIELD_TYPES)[FieldType]]>) {
    families.set(info.family, [...(families.get(info.family) ?? []), type]);
  }
  return [...families.entries()].map(([family, types]) => ({ family, ...(FAMILY_LABELS[family] ?? { label: family, hint: '' }), types }));
}

export const TYPE_ICON: Record<FieldType, string> = {
  short_text: 'type',
  long_text: 'doc',
  number: 'list',
  email: 'mail',
  url: 'link',
  date: 'calendar',
  single_choice: 'check-circle',
  multiple_choice: 'check',
  dropdown: 'chevron-down',
  checkbox: 'check',
  consent: 'shield',
  language: 'globe',
  dialect: 'translation',
  file: 'upload',
  image: 'image',
  audio: 'mic',
  video: 'video',
  group: 'layers',
  instruction: 'info',
  heading: 'quote',
};
