import { computeVisibility, topLevelFields, UPLOAD_DEFAULTS, UPLOAD_FORMATS } from '@indigen-world/contracts/forms';
import type { Answers, AnswerValue, AttachmentRef, FormDefinition, FormField, Issue, Visibility } from '@indigen-world/contracts/forms';
import type { FormPage } from './types';

/* Pure helpers behind the form renderer and viewer. Nothing here changes what
   a contributor typed: values are read, compared and displayed as stored. */

export type UploadType = 'file' | 'image' | 'audio' | 'video';
export type GroupEntry = Record<string, AnswerValue>;

export function cx(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(' ');
}

export function isUploadType(type: string): type is UploadType {
  return type === 'file' || type === 'image' || type === 'audio' || type === 'video';
}

export function isRecord(value: unknown): value is Record<string, AnswerValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Text as stored; non-text values (from an older version) are shown, never rewritten until edited. */
export function asText(value: AnswerValue | undefined): string {
  if (value === undefined || value === null) return '';
  return typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
}

export function asStrings(value: AnswerValue | undefined): string[] {
  return Array.isArray(value) ? (value as unknown[]).filter((item): item is string => typeof item === 'string') : [];
}

export function asAttachments(value: AnswerValue | undefined): AttachmentRef[] {
  if (!Array.isArray(value)) return [];
  return (value as unknown[]).filter((item): item is AttachmentRef => isRecord(item) && typeof (item as { id?: unknown }).id === 'string');
}

/** Group entries as stored. Malformed entries are passed through untouched; readers check them with isRecord. */
export function asEntries(value: AnswerValue | undefined): GroupEntry[] {
  return Array.isArray(value) ? ([...(value as unknown[])] as GroupEntry[]) : [];
}

/** A DOM id from the renderer prefix and an answer path (ids are lower-case ASCII by contract). */
export function domId(prefix: string, path: string): string {
  return `${prefix}-${path.replace(/[^A-Za-z0-9_-]/g, '-')}`;
}

export function safePrefix(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9_-]/g, '');
  return /^[A-Za-z]/.test(cleaned) ? cleaned : `iwf${cleaned}`;
}

/* -- Pages ------------------------------------------------------------------------ */

/** Pages in order: one per VISIBLE section when presentation is 'paged', else a single page holding every visible section. */
export function formPages(definition: FormDefinition, answers: Answers): FormPage[] {
  const visibility = computeVisibility(definition, answers ?? {});
  const visible = definition.sections.filter((section) => visibility.sections[section.id]);
  if (definition.presentation === 'paged' && visible.length) {
    return visible.map((section, index) => ({
      id: section.id,
      title: section.title || `Page ${index + 1}`,
      sectionIds: [section.id],
    }));
  }
  return [{ id: 'form', title: definition.title || 'Form', sectionIds: visible.map((section) => section.id) }];
}

/** Issues whose field belongs to the given sections (for per-page validation on Next). */
export function issuesForSections(definition: FormDefinition, issues: Issue[], sectionIds: string[]): Issue[] {
  const wanted = new Set(sectionIds);
  const owner = new Map(topLevelFields(definition).map(({ field, sectionId }) => [field.id, sectionId]));
  return (issues ?? []).filter((issue) => {
    const sectionId = owner.get(String(issue.path ?? '').split('.')[0]);
    return sectionId !== undefined && wanted.has(sectionId);
  });
}

/* -- Repeatable groups -------------------------------------------------------------- */

export function groupLimits(field: FormField, required: boolean) {
  const settings = field.settings ?? {};
  const minItems = Number.isInteger(settings.minItems) ? (settings.minItems as number) : 0;
  const maxItems = Math.max(1, Math.min(Number.isInteger(settings.maxItems) ? (settings.maxItems as number) : 5, 50));
  // A required group starts with its minimum number of (empty) entries on
  // screen; they only reach the answers once something is typed in them.
  const floor = Math.min(maxItems, required ? Math.max(1, minItems) : 0);
  return { minItems, maxItems, floor, itemLabel: settings.itemLabel || 'Item' };
}

/* -- Issues ------------------------------------------------------------------------- */

export interface SummaryItem {
  key: string;
  label: string;
  message: string;
  /** Answer path of the rendered question to link to, or null when it is not on screen. */
  target: string | null;
}

export interface IssueIndex {
  /** Answer path ('fieldId', 'groupId.2', 'groupId.2.subId') → messages shown there. */
  inline: Map<string, string[]>;
  /** Upload answer path → indexes of attachments named by an issue. */
  attachments: Map<string, Set<number>>;
  summary: SummaryItem[];
}

function push(map: Map<string, string[]>, key: string, message: string) {
  const list = map.get(key);
  if (list) list.push(message);
  else map.set(key, [message]);
}

/**
 * Place each issue next to the question it names, when that question is on
 * screen. Every issue is also listed in the summary; the ones that cannot be
 * placed are listed without a link.
 */
export function indexIssues(
  definition: FormDefinition,
  issues: Issue[],
  visibility: Visibility,
  renderedSections: Set<string>,
  entryCount: (groupId: string) => number,
): IssueIndex {
  const inline = new Map<string, string[]>();
  const attachments = new Map<string, Set<number>>();
  const summary: SummaryItem[] = [];
  const fields = new Map(topLevelFields(definition).map(({ field, sectionId }) => [field.id, { field, sectionId }]));
  issues.forEach((issue, index) => {
    const message = String(issue?.message ?? '');
    const path = String(issue?.path ?? '');
    const segments = path.split('.');
    const found = fields.get(segments[0]);
    const key = `${index}:${path}`;
    if (!found) {
      summary.push({ key, label: '', message, target: null });
      return;
    }
    const { field, sectionId } = found;
    const onScreen = renderedSections.has(sectionId) && visibility.sections[sectionId] && visibility.fields[field.id];
    let target: string | null = onScreen ? field.id : null;
    let label = field.label || field.id;
    if (field.type === 'group' && segments.length >= 2 && /^\d+$/.test(segments[1])) {
      const entry = Number(segments[1]);
      const { itemLabel } = groupLimits(field, false);
      const sub = segments[2] ? (field.fields ?? []).find((item) => item.id === segments[2]) : undefined;
      label = `${label} · ${itemLabel} ${entry + 1}${sub ? ` · ${sub.label || sub.id}` : ''}`;
      if (onScreen && entry < entryCount(field.id)) {
        target = sub ? `${field.id}.${entry}.${sub.id}` : `${field.id}.${entry}`;
        if (sub && isUploadType(sub.type) && segments[3] && /^\d+$/.test(segments[3])) {
          const set = attachments.get(target) ?? new Set<number>();
          set.add(Number(segments[3]));
          attachments.set(target, set);
        }
      }
    } else if (isUploadType(field.type) && segments[1] && /^\d+$/.test(segments[1]) && target) {
      const set = attachments.get(target) ?? new Set<number>();
      set.add(Number(segments[1]));
      attachments.set(target, set);
    }
    if (target) push(inline, target, message);
    summary.push({ key, label, message, target });
  });
  return { inline, attachments, summary };
}

/* -- Uploads ------------------------------------------------------------------------- */

export interface UploadLimits {
  formats: string[];
  maxSizeMb: number;
  maxFiles: number;
  extensions: string[];
  accept: string;
  allowRecording: boolean;
}

export function uploadLimits(field: FormField): UploadLimits {
  const type = isUploadType(field.type) ? field.type : 'file';
  const settings = field.settings ?? {};
  const defaults = UPLOAD_DEFAULTS[type];
  const formats = (Array.isArray(settings.formats) ? settings.formats : [...defaults.formats]).filter((key) => key in UPLOAD_FORMATS);
  const extensions = [...new Set(formats.flatMap((key) => [...UPLOAD_FORMATS[key].extensions]))];
  const mimeTypes = [...new Set(formats.flatMap((key) => [...UPLOAD_FORMATS[key].mimeTypes]))];
  return {
    formats,
    maxSizeMb: typeof settings.maxSizeMb === 'number' && settings.maxSizeMb > 0 ? settings.maxSizeMb : defaults.maxSizeMb,
    maxFiles: typeof settings.maxFiles === 'number' && settings.maxFiles > 0 ? settings.maxFiles : 1,
    extensions,
    accept: [...extensions.map((extension) => `.${extension}`), ...mimeTypes].join(','),
    allowRecording: type === 'audio' && settings.allowRecording === true,
  };
}

export function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size < 0) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  const mb = size / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/** The format label for a stored attachment ("MP3 audio"), or its declared type. */
export function formatLabel(contentType: string): string {
  const mime = String(contentType ?? '').split(';')[0].trim().toLowerCase();
  for (const format of Object.values(UPLOAD_FORMATS)) {
    if (format.mimeTypes.includes(mime)) return format.label;
  }
  return mime || 'File';
}

/**
 * Some systems report no type for valid files (.opus, .flac, .m4a on some
 * Windows set-ups). Declare the type from the extension in that case only; the
 * server still identifies every upload by its leading bytes.
 */
export function withDeclaredType(file: File, field: FormField): File {
  if (file.type && file.type !== 'application/octet-stream') return file;
  const extension = String(file.name ?? '').toLowerCase().split('.').at(-1) ?? '';
  for (const key of uploadLimits(field).formats) {
    const format = UPLOAD_FORMATS[key];
    if (format.extensions.includes(extension)) {
      try {
        return new File([file], file.name, { type: format.mimeTypes[0], lastModified: file.lastModified });
      } catch {
        return file;
      }
    }
  }
  return file;
}

/* -- Comparison ----------------------------------------------------------------------- */

function emptyish(value: unknown): boolean {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

/** Deep equality for answers; empty values (missing, null, '', []) count as the same. Text is compared exactly. */
export function sameAnswer(a: unknown, b: unknown): boolean {
  if (emptyish(a) && emptyish(b)) return true;
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, index) => sameAnswer(item, b[index]));
  if (isRecord(a) && isRecord(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) if (!sameAnswer(a[key], b[key])) return false;
    return true;
  }
  return false;
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
export function formatDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) ? DATE_FORMAT.format(time) : value;
}
