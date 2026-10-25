/**
 * Indigen Forms: versioned, declarative contribution forms (see forms.d.ts).
 *
 * Shared verbatim by the backend, the admin console and the contributor
 * portal, so a rule that hides or requires a question behaves the same in the
 * browser and on the server. Conditions are data — a field, a fixed operator
 * and a value — and are never evaluated as code. Submitted text is kept exactly
 * as typed apart from surrounding whitespace: no case folding, no Unicode
 * normalisation, no stripping of tone marks.
 */

export const FORM_SCHEMA_VERSION = 1;
export { FORM_TEMPLATES } from './forms-templates.mjs';

/* -- Statuses --------------------------------------------------------------- */

export const FORM_STATUSES = ['draft', 'published', 'paused', 'closed', 'archived'];
export const FORM_STATUS_LABELS = { draft: 'Draft', published: 'Published', paused: 'Paused', closed: 'Closed', archived: 'Archived' };
/** Publishing is its own action; these are the lifecycle moves an admin may make. */
export const FORM_STATUS_TRANSITIONS = {
  draft: ['archived'],
  published: ['paused', 'closed'],
  paused: ['published', 'closed'],
  closed: ['published', 'archived'],
  archived: ['closed', 'draft'],
};

export const RESPONSE_STATUSES = ['draft', 'submitted', 'under_review', 'changes_requested', 'approved', 'rejected'];
export const RESPONSE_STATUS_LABELS = {
  draft: 'Draft', submitted: 'Submitted', under_review: 'Under review',
  changes_requested: 'Changes requested', approved: 'Approved', rejected: 'Rejected',
};
export const REVIEW_DECISIONS = {
  start_review: { label: 'Start review', from: ['submitted'], to: 'under_review' },
  request_changes: { label: 'Request changes', from: ['submitted', 'under_review'], to: 'changes_requested' },
  approve: { label: 'Approve', from: ['submitted', 'under_review'], to: 'approved' },
  reject: { label: 'Reject', from: ['submitted', 'under_review'], to: 'rejected' },
};

/* -- Vocabularies ------------------------------------------------------------- */

export const FORM_CATEGORIES = [
  { id: 'word_collection', label: 'Word collection' },
  { id: 'translation', label: 'Translation' },
  { id: 'oral_history', label: 'Oral history' },
  { id: 'audio', label: 'Audio collection' },
  { id: 'research', label: 'Research and documents' },
  { id: 'feedback', label: 'Feedback' },
  { id: 'survey', label: 'Survey' },
  { id: 'other', label: 'Other' },
];
export const FORM_LANGUAGES = [
  { id: 'kasem', label: 'Kasem' },
  { id: 'english', label: 'English' },
  { id: 'french', label: 'French' },
  { id: 'twi', label: 'Twi' },
  { id: 'other', label: 'Other' },
];
/** The Kasem varieties the contributor profile already offers. */
export const FORM_DIALECTS = [
  { id: 'navrongo', label: 'Navrongo' },
  { id: 'paga', label: 'Paga' },
  { id: 'chiana', label: 'Chiana' },
  { id: 'other', label: 'Other' },
  { id: 'not_sure', label: 'Not sure' },
];

export const CONSENT_PURPOSES = {
  storage: { label: 'Store the material', description: 'Keep what was submitted, for example a recording, in Indigen World’s private archive.' },
  review: { label: 'Internal review', description: 'Authorised reviewers may assess the material for quality, privacy, usefulness and permissions.' },
  retrieval: { label: 'Knowledge-base retrieval', description: 'May be selected separately for an approved reference collection.' },
  training: { label: 'Dataset development and AI training', description: 'May be selected separately for an approved language dataset or model training.' },
  public: { label: 'Public sharing', description: 'May be selected separately for public resources such as the dictionary.' },
  attribution: { label: 'Credit by name', description: 'The contributor may be named where the material is used.' },
};

/* -- Fields ------------------------------------------------------------------- */

export const FIELD_TYPES = {
  short_text: { label: 'Short text', family: 'text', description: 'One line, such as a word or a name.', collects: true, allowedInGroup: true },
  long_text: { label: 'Long text', family: 'text', description: 'Several sentences or paragraphs.', collects: true, allowedInGroup: true },
  number: { label: 'Number', family: 'text', description: 'A number with optional bounds.', collects: true, allowedInGroup: true },
  email: { label: 'Email', family: 'text', description: 'An email address.', collects: true, allowedInGroup: false },
  url: { label: 'Link', family: 'text', description: 'A web address starting with http:// or https://.', collects: true, allowedInGroup: true },
  date: { label: 'Date', family: 'text', description: 'A calendar date.', collects: true, allowedInGroup: true },
  single_choice: { label: 'Single choice', family: 'choice', description: 'Pick one option from a visible list.', collects: true, allowedInGroup: true },
  multiple_choice: { label: 'Multiple choice', family: 'choice', description: 'Pick any number of options.', collects: true, allowedInGroup: true },
  dropdown: { label: 'Dropdown', family: 'choice', description: 'Pick one option from a menu.', collects: true, allowedInGroup: true },
  checkbox: { label: 'Checkbox', family: 'confirm', description: 'A single tick box, for an explicit acknowledgement.', collects: true, allowedInGroup: true },
  consent: { label: 'Consent', family: 'confirm', description: 'Explicit permission for one stated purpose. The wording is stored with every response.', collects: true, allowedInGroup: false },
  language: { label: 'Language', family: 'choice', description: 'Choose a language.', collects: true, allowedInGroup: true },
  dialect: { label: 'Kasem variety', family: 'choice', description: 'Choose a variety of Kasem (Navrongo, Paga, Chiana…).', collects: true, allowedInGroup: true },
  file: { label: 'File upload', family: 'upload', description: 'Documents or images.', collects: true, allowedInGroup: true },
  image: { label: 'Image upload', family: 'upload', description: 'Photos and scans.', collects: true, allowedInGroup: true },
  audio: { label: 'Audio', family: 'upload', description: 'Upload a recording, or record in the browser.', collects: true, allowedInGroup: true },
  video: { label: 'Video upload', family: 'upload', description: 'Short video files.', collects: true, allowedInGroup: true },
  group: { label: 'Repeatable group', family: 'structure', description: 'A set of questions answered several times, such as examples for one word.', collects: true, allowedInGroup: false },
  instruction: { label: 'Instruction text', family: 'display', description: 'Guidance shown to contributors. Collects nothing.', collects: false, allowedInGroup: false },
  heading: { label: 'Heading', family: 'display', description: 'A heading inside a section. Collects nothing.', collects: false, allowedInGroup: false },
};

export const UPLOAD_FORMATS = {
  jpeg: { label: 'JPEG image', kind: 'image', mimeTypes: ['image/jpeg'], extensions: ['jpg', 'jpeg'] },
  png: { label: 'PNG image', kind: 'image', mimeTypes: ['image/png'], extensions: ['png'] },
  webp: { label: 'WebP image', kind: 'image', mimeTypes: ['image/webp'], extensions: ['webp'] },
  mp3: { label: 'MP3 audio', kind: 'audio', mimeTypes: ['audio/mpeg', 'audio/mp3'], extensions: ['mp3'] },
  wav: { label: 'WAV audio', kind: 'audio', mimeTypes: ['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave'], extensions: ['wav'] },
  m4a: { label: 'M4A / AAC audio', kind: 'audio', mimeTypes: ['audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac'], extensions: ['m4a', 'aac'] },
  ogg: { label: 'Ogg / Opus audio', kind: 'audio', mimeTypes: ['audio/ogg', 'audio/opus'], extensions: ['ogg', 'oga', 'opus'] },
  webm_audio: { label: 'WebM audio (browser recordings)', kind: 'audio', mimeTypes: ['audio/webm'], extensions: ['webm', 'weba'] },
  flac: { label: 'FLAC audio', kind: 'audio', mimeTypes: ['audio/flac', 'audio/x-flac'], extensions: ['flac'] },
  mp4: { label: 'MP4 video', kind: 'video', mimeTypes: ['video/mp4'], extensions: ['mp4', 'm4v'] },
  mov: { label: 'QuickTime video', kind: 'video', mimeTypes: ['video/quicktime'], extensions: ['mov'] },
  webm_video: { label: 'WebM video', kind: 'video', mimeTypes: ['video/webm'], extensions: ['webm'] },
  pdf: { label: 'PDF document', kind: 'document', mimeTypes: ['application/pdf'], extensions: ['pdf'] },
  docx: { label: 'Word document', kind: 'document', mimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'], extensions: ['docx'] },
  txt: { label: 'Plain text', kind: 'document', mimeTypes: ['text/plain'], extensions: ['txt'] },
};
const UPLOAD_KINDS_FOR = { file: ['document', 'image'], image: ['image'], audio: ['audio'], video: ['video'] };
export const UPLOAD_DEFAULTS = {
  file: { formats: ['pdf', 'docx', 'txt', 'jpeg', 'png'], maxSizeMb: 20, ceilingMb: 50 },
  image: { formats: ['jpeg', 'png', 'webp'], maxSizeMb: 10, ceilingMb: 20 },
  audio: { formats: ['mp3', 'wav', 'm4a', 'ogg', 'webm_audio', 'flac'], maxSizeMb: 25, ceilingMb: 100 },
  video: { formats: ['mp4', 'mov', 'webm_video'], maxSizeMb: 100, ceilingMb: 250 },
};

export const CONDITION_OPERATORS = {
  equals: { label: 'is', needsValue: true },
  not_equals: { label: 'is not', needsValue: true },
  includes: { label: 'includes', needsValue: true },
  not_includes: { label: 'does not include', needsValue: true },
  answered: { label: 'is answered', needsValue: false },
  not_answered: { label: 'is not answered', needsValue: false },
  is_true: { label: 'is ticked', needsValue: false },
  is_false: { label: 'is not ticked', needsValue: false },
  greater_than: { label: 'is greater than', needsValue: true },
  less_than: { label: 'is less than', needsValue: true },
};
const SINGLE_CHOICE_TYPES = ['single_choice', 'dropdown', 'language', 'dialect'];
const TEXT_TYPES = ['short_text', 'long_text', 'email', 'url'];
const UPLOAD_TYPES = ['file', 'image', 'audio', 'video'];
/** Which operators make sense for a field of each type. */
export function operatorsFor(type) {
  if (SINGLE_CHOICE_TYPES.includes(type)) return ['equals', 'not_equals', 'answered', 'not_answered'];
  if (type === 'multiple_choice') return ['includes', 'not_includes', 'answered', 'not_answered'];
  if (TEXT_TYPES.includes(type)) return ['equals', 'not_equals', 'includes', 'not_includes', 'answered', 'not_answered'];
  if (type === 'number' || type === 'date') return ['equals', 'not_equals', 'greater_than', 'less_than', 'answered', 'not_answered'];
  if (type === 'checkbox' || type === 'consent') return ['is_true', 'is_false'];
  if (UPLOAD_TYPES.includes(type) || type === 'group') return ['answered', 'not_answered'];
  return [];
}

/* -- Form configuration ------------------------------------------------------- */

/**
 * Reviewer groups that already exist. Validators and reviewers hold the same
 * standing everywhere in the platform, so they form one group; the scoped
 * groups are the qualification-backed knowledge grants (knowledgeRoleGrants).
 * Administrators can review in every group.
 */
export const REVIEWER_GROUPS = {
  reviewers: { label: 'Reviewers and validators', description: 'Accounts with the reviewer or validator role, and administrators.' },
  language_reviewers: { label: 'Qualified language reviewers', description: 'Reviewers holding an active Kasem language review grant, and administrators.' },
  culture_reviewers: { label: 'Qualified cultural reviewers', description: 'Reviewers holding an active cultural review grant, and administrators.' },
  admins: { label: 'Administrators only', description: 'Only administrators may review these responses.' },
};

/** The contribution types on a contributor's profile (contributors/{uid}.contributionTypes). */
export const AUDIENCE_CONTRIBUTION_TYPES = [
  { id: 'expressions', label: 'Expressions' },
  { id: 'articles', label: 'Articles' },
  { id: 'stories', label: 'Stories' },
  { id: 'research', label: 'Research' },
  { id: 'audio', label: 'Audio' },
];

const slot = (id, label, required, accepts) => ({ id, label, required, accepts });
const TEXTISH = ['short_text', 'long_text'];
export const DESTINATIONS = {
  general_intake: {
    label: 'General intake',
    description: 'Responses stay in Indigen Forms for review and export.',
    slots: [],
    requiredConsents: [],
    effect: 'Approved responses stay here. Nothing is copied to another workflow.',
  },
  dictionary_candidate: {
    label: 'Dictionary candidate entries',
    description: 'Approved word responses become dictionary candidates in the validators’ review desk.',
    slots: [
      slot('headword', 'Kasem word', true, TEXTISH),
      slot('meaning', 'English meaning', true, TEXTISH),
      slot('partOfSpeech', 'Kind of word', false, ['dropdown', 'single_choice', 'short_text']),
      slot('dialect', 'Kasem variety', false, ['dialect', 'short_text']),
      slot('example', 'Usage example (Kasem)', false, TEXTISH),
      slot('exampleTranslation', 'Usage example (English)', false, TEXTISH),
      slot('source', 'Source', false, TEXTISH),
      slot('pronunciation', 'Pronunciation recording', false, ['audio']),
      // Attestations come only from the contributor's own answers; an unmapped one is recorded as not asked.
      // The recording is copied only when the people heard in it agreed to share it.
      slot('speakerPermission', 'People heard in the recording agreed to share it', false, ['checkbox']),
      slot('rightsConfirmed', 'Contributor may share it (own knowledge or permission)', false, ['checkbox']),
    ],
    requiredConsents: ['review'],
    effect: 'On approval a dictionary candidate is added to the review desk. It is never published automatically; publication follows the contributor’s public-sharing consent. A pronunciation recording goes with it only when the people heard in it agreed to share it.',
  },
  translation_review: {
    label: 'Translation review queue',
    description: 'Approved translations join the contributor materials review desk as translation records.',
    slots: [
      slot('sourceText', 'Source sentence', true, TEXTISH),
      slot('translation', 'Translation', true, TEXTISH),
      slot('sourceLanguage', 'Source language', false, ['language']),
      slot('dialect', 'Kasem variety', false, ['dialect', 'short_text']),
      slot('notes', 'Notes', false, TEXTISH),
    ],
    requiredConsents: ['review'],
    effect: 'On approval a translation record is queued in the materials review desk. It is never published automatically.',
  },
  audio_collection: {
    label: 'Audio collection',
    description: 'Approved recordings are filed in the contributor materials review desk with their transcript.',
    slots: [
      slot('recording', 'Recording', true, ['audio']),
      slot('speakerPermission', 'Speakers agreed to be recorded', true, ['checkbox']),
      slot('transcript', 'Transcript', false, TEXTISH),
      slot('dialect', 'Kasem variety', false, ['dialect', 'short_text']),
      slot('title', 'Title or description', false, TEXTISH),
      slot('speaker', 'Pseudonymous speaker reference', false, ['short_text']),
    ],
    requiredConsents: ['review', 'storage'],
    effect: 'On approval the recording is filed in the materials review desk for later, separately consented use.',
  },
  document_intake: {
    label: 'Document and research intake',
    description: 'Approved documents are filed in the contributor materials review desk.',
    slots: [
      slot('title', 'Title', true, TEXTISH),
      slot('description', 'Description', false, TEXTISH),
      slot('files', 'Documents', true, ['file', 'image']),
      slot('source', 'Source', false, TEXTISH),
      slot('rights', 'Authorship or permission statement', false, TEXTISH),
    ],
    requiredConsents: ['review'],
    effect: 'On approval the documents are filed in the materials review desk. Nothing is published automatically.',
  },
};

/* -- Limits and identifiers --------------------------------------------------- */

export const FORM_LIMITS = {
  maxSections: 30,
  maxFields: 150,
  maxGroupFields: 20,
  maxOptions: 100,
  maxChecks: 12,
  maxConditions: 10,
  maxTitle: 150,
  maxLabel: 300,
  maxText: 5000,
  maxLongAnswer: 20000,
  maxShortAnswer: 1000,
  maxGroupItems: 50,
  maxFilesPerField: 20,
  maxPoints: 100,
};
const SHORT_DEFAULT_MAX = 300;
const LONG_DEFAULT_MAX = 5000;
/**
 * A response is one Firestore document, so its answers must fit in this many
 * bytes of UTF-8 JSON (`answersByteSize`); the server refuses a save or submit
 * above it. Letters with tone marks take two or more bytes each.
 */
export const ANSWERS_BYTE_BUDGET = 400_000;

/** Field, option, section and check ids: lower-case ASCII, starting with a letter. */
export const ID_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;
const OPTION_ID_PATTERN = /^[a-z0-9][a-z0-9_]{0,39}$/;
const ATTACHMENT_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// C0 controls other than tab, line feed and carriage return never belong in an answer.
const CONTROL_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const LINE_BREAK = /[\r\n]/;

function randomChars(count) {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(count);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return out;
}

export function newId(prefix, taken = []) {
  const used = new Set(taken);
  for (;;) {
    const id = `${prefix}_${randomChars(6)}`;
    if (!used.has(id)) return id;
  }
}

/**
 * A readable, stable id from a label ("Audio recording" → "audio_recording").
 * Only the id is simplified; the label keeps every character as typed.
 */
export function slugId(label, prefix, taken = []) {
  const used = new Set(taken);
  const base = String(label ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32);
  const start = /^[a-z]/.test(base) ? base : base ? `${prefix}_${base}`.slice(0, 32) : '';
  if (!start) return newId(prefix, used);
  if (!used.has(start)) return start;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${start}_${n}`;
    if (!used.has(candidate)) return candidate;
  }
  return newId(prefix, used);
}

export function createField(type, taken = []) {
  const info = FIELD_TYPES[type];
  if (!info) throw new Error(`Unknown field type: ${type}`);
  const field = { id: newId('q', taken), type, label: info.collects ? 'Untitled question' : type === 'heading' ? 'Heading' : '', required: false, settings: {} };
  if (type === 'short_text') field.settings = { maxLength: SHORT_DEFAULT_MAX };
  if (type === 'long_text') field.settings = { maxLength: LONG_DEFAULT_MAX };
  if (['single_choice', 'multiple_choice', 'dropdown'].includes(type)) {
    field.settings = { options: [{ id: 'option_1', label: 'Option 1' }, { id: 'option_2', label: 'Option 2' }] };
  }
  if (type === 'consent') field.settings = { consentPurpose: 'review', statement: 'I agree that Indigen World reviewers may assess what I submit.' };
  if (type === 'checkbox') field.label = 'I confirm';
  if (UPLOAD_TYPES.includes(type)) {
    const defaults = UPLOAD_DEFAULTS[type];
    field.settings = { formats: [...defaults.formats], maxSizeMb: defaults.maxSizeMb, maxFiles: 1, ...(type === 'audio' ? { allowRecording: true } : {}) };
  }
  if (type === 'group') {
    const used = new Set(taken);
    used.add(field.id);
    const sub = createField('short_text', used);
    field.settings = { minItems: 0, maxItems: 5, itemLabel: 'Item' };
    field.fields = [sub];
  }
  if (type === 'instruction') field.settings = { body: 'Add guidance for contributors.' };
  return field;
}

export function createSection(taken = []) {
  return { id: newId('s', taken), title: '', description: '', visibleWhen: null, fields: [] };
}

export function emptyDefinition() {
  return {
    schemaVersion: FORM_SCHEMA_VERSION,
    title: '',
    description: '',
    category: 'other',
    instructions: '',
    estimatedMinutes: null,
    languageContext: { languageIds: [], dialectIds: [], note: '' },
    presentation: 'single_page',
    sections: [{ id: 'main', title: '', description: '', visibleWhen: null, fields: [] }],
    schedule: { opensAt: null, closesAt: null },
    submission: {
      policy: 'multiple', allowDrafts: true, allowAttachments: true,
      successMessage: 'Thank you. Your response has been received.', nextSteps: '',
    },
    audience: { mode: 'all_contributors', dialectIds: [], contributionTypes: [], cohortIds: [] },
    review: { required: true, reviewerGroup: 'reviewers', instructions: '', checks: [], points: 0 },
    destination: { type: 'general_intake', mapping: {} },
  };
}

/* -- Walking a definition ------------------------------------------------------- */

export function topLevelFields(definition) {
  const out = [];
  for (const section of definition?.sections ?? []) {
    for (const field of section.fields ?? []) out.push({ field, sectionId: section.id, index: out.length });
  }
  return out;
}

export function allFieldIds(definition) {
  const ids = [];
  for (const { field } of topLevelFields(definition)) {
    ids.push(field.id);
    for (const sub of field.fields ?? []) ids.push(sub.id);
  }
  return ids;
}

export function findField(definition, fieldId) {
  for (const { field } of topLevelFields(definition)) {
    if (field.id === fieldId) return field;
    for (const sub of field.fields ?? []) if (sub.id === fieldId) return sub;
  }
  return null;
}

/* -- Small helpers ---------------------------------------------------------------- */

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const isDate = (value) => {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
};
const isIso = (value) => typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value));
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const choiceIds = (list) => list.map((item) => item.id);

/** Surrounding whitespace only. Inner characters, combining marks and tone marks are untouched. */
function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function boundedInt(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

/* -- Definition validation ------------------------------------------------------------ */

function optionsFor(field) {
  if (field.type === 'language') {
    const allowed = field.settings?.allowedIds ?? [];
    return FORM_LANGUAGES.filter((item) => !allowed.length || allowed.includes(item.id));
  }
  if (field.type === 'dialect') {
    const allowed = field.settings?.allowedIds ?? [];
    return FORM_DIALECTS.filter((item) => !allowed.length || allowed.includes(item.id));
  }
  return field.settings?.options ?? [];
}
export { optionsFor as choicesFor };

function normaliseText(raw, path, label, max, issues, { required = false } = {}) {
  if (raw === undefined || raw === null) {
    if (required) issues.push({ path, message: `${label} is required.` });
    return '';
  }
  if (typeof raw !== 'string') {
    issues.push({ path, message: `${label} must be text.` });
    return '';
  }
  const value = raw.trim();
  if (CONTROL_PATTERN.test(value)) issues.push({ path, message: `${label} contains control characters.` });
  if (value.length > max) issues.push({ path, message: `${label} must be ${max} characters or fewer.` });
  if (required && !value) issues.push({ path, message: `${label} is required.` });
  return value;
}

function normaliseIdList(raw, allowed, path, label, issues) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    issues.push({ path, message: `${label} must be a list.` });
    return [];
  }
  const out = [];
  for (const item of raw) {
    if (typeof item !== 'string' || !allowed.includes(item)) issues.push({ path, message: `${label} contains an unknown value: ${String(item)}.` });
    else if (!out.includes(item)) out.push(item);
  }
  return out;
}

function normaliseSettings(field, rawSettings, path, issues, context) {
  const raw = isObject(rawSettings) ? rawSettings : {};
  const settings = {};
  const type = field.type;
  const optionalInt = (key, min, max) => {
    const value = raw[key];
    if (value === undefined || value === null || value === '') return null;
    if (!boundedInt(value, min, max)) {
      issues.push({ path: `${path}.settings.${key}`, message: `${key} must be a whole number from ${min} to ${max}.` });
      return null;
    }
    return value;
  };

  if (type === 'short_text' || type === 'long_text') {
    const cap = type === 'short_text' ? FORM_LIMITS.maxShortAnswer : FORM_LIMITS.maxLongAnswer;
    const minLength = optionalInt('minLength', 0, cap);
    const maxLength = optionalInt('maxLength', 1, cap) ?? (type === 'short_text' ? SHORT_DEFAULT_MAX : LONG_DEFAULT_MAX);
    if (minLength !== null && minLength > maxLength) issues.push({ path: `${path}.settings.minLength`, message: 'Minimum length is more than the maximum.' });
    if (minLength !== null) settings.minLength = minLength;
    settings.maxLength = maxLength;
    if (raw.kasemKeyboard === true) settings.kasemKeyboard = true;
    if (type === 'short_text' && raw.dictionarySuggestions === true) settings.dictionarySuggestions = true;
    const defaultText = normaliseText(raw.defaultText, `${path}.settings.defaultText`, 'Default text', maxLength, issues);
    if (defaultText) settings.defaultText = defaultText;
  } else if (type === 'number') {
    for (const key of ['min', 'max']) {
      const value = raw[key];
      if (value === undefined || value === null || value === '') continue;
      if (!finite(value)) issues.push({ path: `${path}.settings.${key}`, message: `${key} must be a number.` });
      else settings[key] = value;
    }
    if (finite(settings.min) && finite(settings.max) && settings.min > settings.max) issues.push({ path: `${path}.settings.min`, message: 'Minimum is more than the maximum.' });
    if (raw.integer === true) settings.integer = true;
  } else if (type === 'date') {
    for (const key of ['minDate', 'maxDate']) {
      const value = raw[key];
      if (value === undefined || value === null || value === '') continue;
      if (!isDate(value)) issues.push({ path: `${path}.settings.${key}`, message: `${key} must be a date (YYYY-MM-DD).` });
      else settings[key] = value;
    }
    if (settings.minDate && settings.maxDate && settings.minDate > settings.maxDate) issues.push({ path: `${path}.settings.minDate`, message: 'Earliest date is after the latest date.' });
  } else if (['single_choice', 'multiple_choice', 'dropdown'].includes(type)) {
    const options = [];
    const rawOptions = Array.isArray(raw.options) ? raw.options : [];
    if (rawOptions.length > FORM_LIMITS.maxOptions) issues.push({ path: `${path}.settings.options`, message: `Use ${FORM_LIMITS.maxOptions} options or fewer.` });
    for (const [index, option] of rawOptions.slice(0, FORM_LIMITS.maxOptions).entries()) {
      const optionPath = `${path}.settings.options.${index}`;
      if (!isObject(option) || typeof option.id !== 'string' || !OPTION_ID_PATTERN.test(option.id)) {
        issues.push({ path: optionPath, message: 'Each option needs a valid id (lower-case letters, digits and _).' });
        continue;
      }
      if (options.some((item) => item.id === option.id)) {
        issues.push({ path: optionPath, message: `Option id ${option.id} is used twice.` });
        continue;
      }
      options.push({ id: option.id, label: normaliseText(option.label, `${optionPath}.label`, 'Option label', 200, issues, { required: true }) });
    }
    if (!options.length) issues.push({ path: `${path}.settings.options`, message: 'Add at least one option.' });
    settings.options = options;
    const defaults = normaliseIdList(raw.defaultOptionIds, choiceIds(options), `${path}.settings.defaultOptionIds`, 'Default options', issues);
    if (defaults.length) {
      if (type !== 'multiple_choice' && defaults.length > 1) issues.push({ path: `${path}.settings.defaultOptionIds`, message: 'Choose one default at most.' });
      settings.defaultOptionIds = type === 'multiple_choice' ? defaults : defaults.slice(0, 1);
    }
    if (type === 'multiple_choice') {
      const min = optionalInt('minSelections', 0, FORM_LIMITS.maxOptions);
      const max = optionalInt('maxSelections', 1, FORM_LIMITS.maxOptions);
      if (min !== null) settings.minSelections = min;
      if (max !== null) settings.maxSelections = max;
      if (min !== null && max !== null && min > max) issues.push({ path: `${path}.settings.minSelections`, message: 'Minimum selections is more than the maximum.' });
      if (min !== null && min > options.length) issues.push({ path: `${path}.settings.minSelections`, message: 'Minimum selections is more than the number of options.' });
    }
  } else if (type === 'language' || type === 'dialect') {
    const list = type === 'language' ? FORM_LANGUAGES : FORM_DIALECTS;
    const allowed = normaliseIdList(raw.allowedIds, choiceIds(list), `${path}.settings.allowedIds`, 'Allowed values', issues);
    if (allowed.length) settings.allowedIds = allowed;
  } else if (type === 'checkbox') {
    const statement = normaliseText(raw.statement, `${path}.settings.statement`, 'Statement', 1000, issues);
    if (statement) settings.statement = statement;
  } else if (type === 'consent') {
    settings.statement = normaliseText(raw.statement, `${path}.settings.statement`, 'Consent wording', 3000, issues, { required: true });
    if (!hasOwn(CONSENT_PURPOSES, raw.consentPurpose)) issues.push({ path: `${path}.settings.consentPurpose`, message: 'Choose what this consent permits.' });
    else settings.consentPurpose = raw.consentPurpose;
  } else if (UPLOAD_TYPES.includes(type)) {
    const defaults = UPLOAD_DEFAULTS[type];
    const kinds = UPLOAD_KINDS_FOR[type];
    const formats = [];
    for (const format of Array.isArray(raw.formats) ? raw.formats : defaults.formats) {
      if (!hasOwn(UPLOAD_FORMATS, format) || !kinds.includes(UPLOAD_FORMATS[format].kind)) {
        issues.push({ path: `${path}.settings.formats`, message: `${String(format)} is not an allowed format for this upload.` });
      } else if (!formats.includes(format)) formats.push(format);
    }
    if (!formats.length) issues.push({ path: `${path}.settings.formats`, message: 'Allow at least one file format.' });
    settings.formats = formats;
    settings.maxSizeMb = raw.maxSizeMb === undefined ? defaults.maxSizeMb : raw.maxSizeMb;
    if (!boundedInt(settings.maxSizeMb, 1, defaults.ceilingMb)) {
      issues.push({ path: `${path}.settings.maxSizeMb`, message: `Maximum size must be from 1 to ${defaults.ceilingMb} MB.` });
      settings.maxSizeMb = defaults.maxSizeMb;
    }
    settings.maxFiles = raw.maxFiles === undefined ? 1 : raw.maxFiles;
    if (!boundedInt(settings.maxFiles, 1, FORM_LIMITS.maxFilesPerField)) {
      issues.push({ path: `${path}.settings.maxFiles`, message: `Allow from 1 to ${FORM_LIMITS.maxFilesPerField} files.` });
      settings.maxFiles = 1;
    }
    if (type === 'audio' && raw.allowRecording === true) settings.allowRecording = true;
    context.uploads += 1;
  } else if (type === 'group') {
    settings.minItems = raw.minItems === undefined ? 0 : raw.minItems;
    settings.maxItems = raw.maxItems === undefined ? 5 : raw.maxItems;
    if (!boundedInt(settings.minItems, 0, FORM_LIMITS.maxGroupItems)) {
      issues.push({ path: `${path}.settings.minItems`, message: `Minimum entries must be from 0 to ${FORM_LIMITS.maxGroupItems}.` });
      settings.minItems = 0;
    }
    if (!boundedInt(settings.maxItems, 1, FORM_LIMITS.maxGroupItems)) {
      issues.push({ path: `${path}.settings.maxItems`, message: `Maximum entries must be from 1 to ${FORM_LIMITS.maxGroupItems}.` });
      settings.maxItems = 5;
    }
    if (settings.minItems > settings.maxItems) issues.push({ path: `${path}.settings.minItems`, message: 'Minimum entries is more than the maximum.' });
    const itemLabel = normaliseText(raw.itemLabel, `${path}.settings.itemLabel`, 'Entry name', 60, issues);
    settings.itemLabel = itemLabel || 'Item';
  } else if (type === 'instruction') {
    settings.body = normaliseText(raw.body, `${path}.settings.body`, 'Instruction text', FORM_LIMITS.maxText, issues, { required: true });
  }
  return settings;
}

function normaliseConditionGroup(raw, path, owner, context, issues) {
  if (raw === undefined || raw === null) return null;
  if (!isObject(raw) || !Array.isArray(raw.conditions)) {
    issues.push({ path, message: 'Conditions are malformed.' });
    return null;
  }
  const match = raw.match === 'any' ? 'any' : 'all';
  if (raw.match !== undefined && raw.match !== 'any' && raw.match !== 'all') issues.push({ path: `${path}.match`, message: 'Choose all or any.' });
  if (!raw.conditions.length) return null;
  if (raw.conditions.length > FORM_LIMITS.maxConditions) issues.push({ path, message: `Use ${FORM_LIMITS.maxConditions} conditions or fewer.` });
  const conditions = [];
  for (const [index, condition] of raw.conditions.slice(0, FORM_LIMITS.maxConditions).entries()) {
    const conditionPath = `${path}.conditions.${index}`;
    if (!isObject(condition) || typeof condition.fieldId !== 'string') {
      issues.push({ path: conditionPath, message: 'Choose the question this depends on.' });
      continue;
    }
    if (condition.fieldId === owner.id) {
      issues.push({ path: conditionPath, message: `“${owner.label || owner.id}” cannot depend on itself.` });
      continue;
    }
    const target = context.earlier.get(condition.fieldId);
    if (!target) {
      const later = context.everyTopLevel.get(condition.fieldId);
      issues.push({
        path: conditionPath,
        message: later
          ? `“${owner.label || owner.id}” can only depend on a question that comes before it (“${later.label || later.id}” comes later).`
          : `Condition refers to a question that does not exist or cannot be used in a condition (${condition.fieldId}).`,
      });
      continue;
    }
    const allowed = operatorsFor(target.type);
    if (!allowed.includes(condition.operator)) {
      issues.push({ path: `${conditionPath}.operator`, message: `“${CONDITION_OPERATORS[condition.operator]?.label ?? condition.operator}” cannot be used with ${FIELD_TYPES[target.type].label.toLowerCase()} questions.` });
      continue;
    }
    const out = { fieldId: condition.fieldId, operator: condition.operator };
    if (CONDITION_OPERATORS[condition.operator].needsValue) {
      const value = condition.value;
      if (SINGLE_CHOICE_TYPES.includes(target.type) || target.type === 'multiple_choice') {
        if (typeof value !== 'string' || !choiceIds(optionsFor(target)).includes(value)) {
          issues.push({ path: `${conditionPath}.value`, message: 'Choose one of the question’s options.' });
          continue;
        }
      } else if (target.type === 'number') {
        if (!finite(value)) {
          issues.push({ path: `${conditionPath}.value`, message: 'Enter a number to compare with.' });
          continue;
        }
      } else if (target.type === 'date') {
        if (!isDate(value)) {
          issues.push({ path: `${conditionPath}.value`, message: 'Enter a date (YYYY-MM-DD) to compare with.' });
          continue;
        }
      } else if (typeof value !== 'string' || !value.trim() || value.length > 300) {
        issues.push({ path: `${conditionPath}.value`, message: 'Enter the text to compare with.' });
        continue;
      }
      out.value = value;
    }
    conditions.push(out);
  }
  return conditions.length ? { match, conditions } : null;
}

function normaliseField(raw, path, context, issues, { inGroup = false } = {}) {
  if (!isObject(raw)) {
    issues.push({ path, message: 'Question is malformed.' });
    return null;
  }
  const type = raw.type;
  if (!hasOwn(FIELD_TYPES, type)) {
    issues.push({ path: `${path}.type`, message: `Unknown question type: ${String(type)}.` });
    return null;
  }
  const info = FIELD_TYPES[type];
  if (inGroup && !info.allowedInGroup) {
    issues.push({ path: `${path}.type`, message: `${info.label} questions cannot sit inside a repeatable group.` });
    return null;
  }
  if (typeof raw.id !== 'string' || !ID_PATTERN.test(raw.id)) {
    issues.push({ path: `${path}.id`, message: 'Each question needs an answer key: lower-case letters, digits and _, starting with a letter.' });
    return null;
  }
  if (context.ids.has(raw.id)) {
    issues.push({ path: `${path}.id`, message: `Answer key “${raw.id}” is used twice.` });
    return null;
  }
  context.ids.add(raw.id);
  const label = normaliseText(raw.label, `${path}.label`, 'Question', FORM_LIMITS.maxLabel, issues, { required: info.collects || type === 'heading' });
  const field = { id: raw.id, type, label };
  const description = normaliseText(raw.description, `${path}.description`, 'Description', 1000, issues);
  if (description) field.description = description;
  if (info.collects && type !== 'group') {
    const example = normaliseText(raw.example, `${path}.example`, 'Example', 500, issues);
    if (example) field.example = example;
    const placeholder = normaliseText(raw.placeholder, `${path}.placeholder`, 'Placeholder', 200, issues);
    if (placeholder) field.placeholder = placeholder;
    const validationMessage = normaliseText(raw.validationMessage, `${path}.validationMessage`, 'Validation message', 300, issues);
    if (validationMessage) field.validationMessage = validationMessage;
  }
  field.required = info.collects ? raw.required === true : false;
  field.settings = normaliseSettings(field, raw.settings, path, issues, context);
  if (type === 'consent' && inGroup) field.required = false;

  if (inGroup) {
    if (raw.visibleWhen || raw.requiredWhen) issues.push({ path, message: 'Questions inside a repeatable group cannot have their own conditions.' });
  } else {
    field.visibleWhen = normaliseConditionGroup(raw.visibleWhen, `${path}.visibleWhen`, field, context, issues);
    if (info.collects) {
      field.requiredWhen = normaliseConditionGroup(raw.requiredWhen, `${path}.requiredWhen`, field, context, issues);
      if (field.requiredWhen) field.required = false;
    } else if (raw.requiredWhen) {
      issues.push({ path: `${path}.requiredWhen`, message: 'Instruction text and headings cannot be required.' });
    }
  }

  if (type === 'group') {
    const rawFields = Array.isArray(raw.fields) ? raw.fields : [];
    if (!rawFields.length) issues.push({ path: `${path}.fields`, message: 'Add at least one question to the repeatable group.' });
    if (rawFields.length > FORM_LIMITS.maxGroupFields) issues.push({ path: `${path}.fields`, message: `Use ${FORM_LIMITS.maxGroupFields} questions or fewer in a group.` });
    field.fields = rawFields.slice(0, FORM_LIMITS.maxGroupFields)
      .map((sub, index) => normaliseField(sub, `${path}.fields.${index}`, context, issues, { inGroup: true }))
      .filter(Boolean);
    if (field.required && field.settings.minItems < 1) field.settings.minItems = 1;
  }
  // Each question counts once: a group's sub-questions were counted by their own calls above.
  context.fieldCount += 1;
  return field;
}

function normaliseDestination(raw, fields, issues, forPublish) {
  const input = isObject(raw) ? raw : {};
  const type = hasOwn(DESTINATIONS, input.type) ? input.type : 'general_intake';
  if (input.type !== undefined && !hasOwn(DESTINATIONS, input.type)) issues.push({ path: 'destination.type', message: 'Choose a supported destination.' });
  const info = DESTINATIONS[type];
  const mapping = {};
  const rawMapping = isObject(input.mapping) ? input.mapping : {};
  for (const [slotId, fieldId] of Object.entries(rawMapping)) {
    const target = info.slots.find((item) => item.id === slotId);
    if (!target) {
      issues.push({ path: `destination.mapping.${slotId}`, message: `${info.label} has no “${slotId}” field.` });
      continue;
    }
    if (fieldId === '' || fieldId === null || fieldId === undefined) continue;
    const field = fields.get(fieldId);
    if (!field) {
      issues.push({ path: `destination.mapping.${slotId}`, message: `“${target.label}” is mapped to a question that does not exist.` });
      continue;
    }
    if (!target.accepts.includes(field.type)) {
      issues.push({ path: `destination.mapping.${slotId}`, message: `“${target.label}” cannot take a ${FIELD_TYPES[field.type].label.toLowerCase()} answer.` });
      continue;
    }
    mapping[slotId] = fieldId;
  }
  if (forPublish) {
    for (const target of info.slots) {
      if (target.required && !mapping[target.id]) issues.push({ path: `destination.mapping.${target.id}`, message: `Map a question to “${target.label}” before publishing.` });
    }
  }
  return { type, mapping };
}

/**
 * Check and normalise a definition. Unknown keys are dropped and strings lose
 * surrounding whitespace only. Returns `definition: null` only when the input
 * is not an object at all; otherwise the cleaned definition comes back with
 * any issues so the builder can keep editing it.
 */
export function validateDefinition(input, options = {}) {
  const forPublish = options.forPublish === true;
  const now = finite(options.now) ? options.now : Date.now();
  const issues = [];
  if (!isObject(input)) return { definition: null, issues: [{ path: '', message: 'Form definition is malformed.' }] };
  if (input.schemaVersion !== undefined && input.schemaVersion !== FORM_SCHEMA_VERSION) issues.push({ path: 'schemaVersion', message: 'Unsupported form schema version.' });

  const definition = emptyDefinition();
  definition.title = normaliseText(input.title, 'title', 'Title', FORM_LIMITS.maxTitle, issues, { required: true });
  definition.description = normaliseText(input.description, 'description', 'Description', 2000, issues);
  if (input.category !== undefined) {
    if (FORM_CATEGORIES.some((item) => item.id === input.category)) definition.category = input.category;
    else issues.push({ path: 'category', message: 'Choose a category.' });
  }
  definition.instructions = normaliseText(input.instructions, 'instructions', 'Instructions', FORM_LIMITS.maxText, issues);
  if (input.estimatedMinutes !== undefined && input.estimatedMinutes !== null && input.estimatedMinutes !== '') {
    if (boundedInt(input.estimatedMinutes, 1, 600)) definition.estimatedMinutes = input.estimatedMinutes;
    else issues.push({ path: 'estimatedMinutes', message: 'Estimated time must be from 1 to 600 minutes.' });
  }
  const language = isObject(input.languageContext) ? input.languageContext : {};
  definition.languageContext = {
    languageIds: normaliseIdList(language.languageIds, choiceIds(FORM_LANGUAGES), 'languageContext.languageIds', 'Languages', issues),
    dialectIds: normaliseIdList(language.dialectIds, choiceIds(FORM_DIALECTS), 'languageContext.dialectIds', 'Kasem varieties', issues),
    note: normaliseText(language.note, 'languageContext.note', 'Language note', 500, issues),
  };
  if (input.presentation === 'paged' || input.presentation === 'single_page') definition.presentation = input.presentation;
  else if (input.presentation !== undefined) issues.push({ path: 'presentation', message: 'Choose one page or one page per section.' });

  // Sections and fields, in order. A condition may only look backwards, which
  // makes circular dependencies impossible by construction.
  const context = { ids: new Set(), sectionIds: new Set(), earlier: new Map(), everyTopLevel: new Map(), fieldCount: 0, uploads: 0 };
  const rawSections = Array.isArray(input.sections) ? input.sections : [];
  if (!rawSections.length) issues.push({ path: 'sections', message: 'Add at least one section.' });
  if (rawSections.length > FORM_LIMITS.maxSections) issues.push({ path: 'sections', message: `Use ${FORM_LIMITS.maxSections} sections or fewer.` });
  for (const section of rawSections) {
    for (const field of isObject(section) && Array.isArray(section.fields) ? section.fields : []) {
      if (isObject(field) && typeof field.id === 'string' && hasOwn(FIELD_TYPES, field.type)) context.everyTopLevel.set(field.id, field);
    }
  }
  const sections = [];
  for (const [sectionIndex, rawSection] of rawSections.slice(0, FORM_LIMITS.maxSections).entries()) {
    const path = `sections.${sectionIndex}`;
    if (!isObject(rawSection) || typeof rawSection.id !== 'string' || !ID_PATTERN.test(rawSection.id)) {
      issues.push({ path, message: 'Section is malformed.' });
      continue;
    }
    if (context.sectionIds.has(rawSection.id)) {
      issues.push({ path: `${path}.id`, message: `Section id ${rawSection.id} is used twice.` });
      continue;
    }
    context.sectionIds.add(rawSection.id);
    const section = {
      id: rawSection.id,
      title: normaliseText(rawSection.title, `${path}.title`, 'Section title', FORM_LIMITS.maxTitle, issues),
      description: normaliseText(rawSection.description, `${path}.description`, 'Section description', 2000, issues),
      visibleWhen: null,
      fields: [],
    };
    // A section may depend on questions in earlier sections only.
    section.visibleWhen = normaliseConditionGroup(rawSection.visibleWhen, `${path}.visibleWhen`, { id: section.id, label: section.title || `Section ${sectionIndex + 1}` }, context, issues);
    const sectionFields = [];
    for (const [fieldIndex, rawField] of (Array.isArray(rawSection.fields) ? rawSection.fields : []).entries()) {
      const field = normaliseField(rawField, `${path}.fields.${fieldIndex}`, context, issues);
      if (!field) continue;
      sectionFields.push(field);
      if (FIELD_TYPES[field.type].collects) context.earlier.set(field.id, field);
    }
    section.fields = sectionFields;
    sections.push(section);
  }
  if (sections.length) definition.sections = sections;
  if (context.fieldCount > FORM_LIMITS.maxFields) issues.push({ path: 'sections', message: `Use ${FORM_LIMITS.maxFields} questions or fewer.` });

  const schedule = isObject(input.schedule) ? input.schedule : {};
  for (const key of ['opensAt', 'closesAt']) {
    const value = schedule[key];
    if (value === undefined || value === null || value === '') continue;
    if (isIso(value)) definition.schedule[key] = new Date(Date.parse(value)).toISOString();
    else issues.push({ path: `schedule.${key}`, message: `${key === 'opensAt' ? 'Opening' : 'Closing'} date is not a valid date.` });
  }
  const { opensAt, closesAt } = definition.schedule;
  if (opensAt && closesAt && Date.parse(closesAt) <= Date.parse(opensAt)) issues.push({ path: 'schedule.closesAt', message: 'The closing date must be after the opening date.' });
  if (forPublish && closesAt && Date.parse(closesAt) <= now) issues.push({ path: 'schedule.closesAt', message: 'The closing date has already passed.' });

  const submission = isObject(input.submission) ? input.submission : {};
  definition.submission = {
    policy: submission.policy === 'once' ? 'once' : 'multiple',
    allowDrafts: submission.allowDrafts !== false,
    allowAttachments: submission.allowAttachments !== false,
    successMessage: normaliseText(submission.successMessage, 'submission.successMessage', 'Success message', 1000, issues) || definition.submission.successMessage,
    nextSteps: normaliseText(submission.nextSteps, 'submission.nextSteps', 'Next steps', 2000, issues),
  };
  if (!definition.submission.allowAttachments && context.uploads) issues.push({ path: 'submission.allowAttachments', message: 'This form has upload questions, so attachments must be allowed (or remove the upload questions).' });

  const audience = isObject(input.audience) ? input.audience : {};
  definition.audience = {
    mode: audience.mode === 'groups' ? 'groups' : 'all_contributors',
    dialectIds: normaliseIdList(audience.dialectIds, choiceIds(FORM_DIALECTS), 'audience.dialectIds', 'Kasem varieties', issues),
    contributionTypes: normaliseIdList(audience.contributionTypes, choiceIds(AUDIENCE_CONTRIBUTION_TYPES), 'audience.contributionTypes', 'Contribution types', issues),
    cohortIds: [],
  };
  if (audience.cohortIds !== undefined) {
    if (!Array.isArray(audience.cohortIds) || audience.cohortIds.some((id) => typeof id !== 'string' || !ID_PATTERN.test(id)) || audience.cohortIds.length > 20) {
      issues.push({ path: 'audience.cohortIds', message: 'Cohorts are malformed.' });
    } else definition.audience.cohortIds = [...new Set(audience.cohortIds)];
  }
  if (definition.audience.mode === 'all_contributors') {
    definition.audience.dialectIds = [];
    definition.audience.contributionTypes = [];
    definition.audience.cohortIds = [];
  } else if (forPublish && !definition.audience.dialectIds.length && !definition.audience.contributionTypes.length && !definition.audience.cohortIds.length) {
    issues.push({ path: 'audience', message: 'Choose at least one group, or open the form to all contributors.' });
  }

  const review = isObject(input.review) ? input.review : {};
  definition.review = {
    required: review.required !== false,
    reviewerGroup: hasOwn(REVIEWER_GROUPS, review.reviewerGroup) ? review.reviewerGroup : 'reviewers',
    instructions: normaliseText(review.instructions, 'review.instructions', 'Review instructions', 3000, issues),
    checks: [],
    points: 0,
  };
  if (review.reviewerGroup !== undefined && !hasOwn(REVIEWER_GROUPS, review.reviewerGroup)) issues.push({ path: 'review.reviewerGroup', message: 'Choose a reviewer group.' });
  const checkIds = new Set();
  const rawChecks = Array.isArray(review.checks) ? review.checks : [];
  if (rawChecks.length > FORM_LIMITS.maxChecks) issues.push({ path: 'review.checks', message: `Use ${FORM_LIMITS.maxChecks} checks or fewer.` });
  for (const [index, check] of rawChecks.slice(0, FORM_LIMITS.maxChecks).entries()) {
    if (!isObject(check) || typeof check.id !== 'string' || !ID_PATTERN.test(check.id) || checkIds.has(check.id)) {
      issues.push({ path: `review.checks.${index}`, message: 'Each reviewer check needs a unique id.' });
      continue;
    }
    checkIds.add(check.id);
    definition.review.checks.push({ id: check.id, label: normaliseText(check.label, `review.checks.${index}.label`, 'Check', 200, issues, { required: true }) });
  }
  if (review.points !== undefined && review.points !== null && review.points !== '') {
    if (boundedInt(review.points, 0, FORM_LIMITS.maxPoints)) definition.review.points = review.points;
    else issues.push({ path: 'review.points', message: `Points must be a whole number from 0 to ${FORM_LIMITS.maxPoints}.` });
  }
  if (!definition.review.required) {
    if (definition.review.points) issues.push({ path: 'review.points', message: 'Points are only awarded through review. Turn review on, or set points to 0.' });
    if (definition.review.checks.length) issues.push({ path: 'review.checks', message: 'Reviewer checks need review to be turned on.' });
  }

  const topFields = new Map();
  for (const { field } of topLevelFields(definition)) if (FIELD_TYPES[field.type].collects) topFields.set(field.id, field);
  definition.destination = normaliseDestination(input.destination, topFields, issues, forPublish);
  if (definition.destination.type !== 'general_intake') {
    if (!definition.review.required) issues.push({ path: 'destination.type', message: 'Routing to another workflow happens on approval, so review must be turned on.' });
    if (forPublish) {
      const purposes = new Set([...topFields.values()].filter((field) => field.type === 'consent').map((field) => field.settings.consentPurpose));
      for (const purpose of DESTINATIONS[definition.destination.type].requiredConsents) {
        if (!purposes.has(purpose)) issues.push({ path: 'destination.type', message: `${DESTINATIONS[definition.destination.type].label} needs a consent question for “${CONSENT_PURPOSES[purpose].label}”.` });
      }
    }
  }

  if (forPublish && !topFields.size) issues.push({ path: 'sections', message: 'Add at least one question that collects an answer.' });
  return { definition, issues };
}

/**
 * Answer keys that were published before must keep their meaning: an id may
 * be removed or added in a new version, but not reused for another type.
 */
export function versionCompatibilityIssues(previous, next) {
  const issues = [];
  const known = new Map();
  for (const definition of previous) {
    for (const id of allFieldIds(definition)) {
      const field = findField(definition, id);
      if (field && !known.has(id)) known.set(id, field.type);
    }
  }
  for (const id of allFieldIds(next)) {
    const field = findField(next, id);
    const before = known.get(id);
    if (field && before && before !== field.type) {
      issues.push({ path: id, message: `Answer key “${id}” was a ${FIELD_TYPES[before].label.toLowerCase()} question in an earlier version. Give the new ${FIELD_TYPES[field.type].label.toLowerCase()} question a new key.` });
    }
  }
  return issues;
}

/* -- Conditions and visibility ---------------------------------------------------- */

export function isAnswered(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.length > 0;
  return false;
}

function compareText(value) {
  // Comparison only: the stored answer keeps its original form.
  return String(value).trim().normalize('NFC');
}

function evaluateOne(condition, answers) {
  const value = answers[condition.fieldId];
  switch (condition.operator) {
    case 'answered': return isAnswered(value);
    case 'not_answered': return !isAnswered(value);
    case 'is_true': return value === true;
    case 'is_false': return value !== true;
    case 'equals':
    case 'not_equals': {
      let equal;
      if (!isAnswered(value)) equal = false;
      else if (typeof condition.value === 'number') equal = Number(value) === condition.value;
      else equal = compareText(value) === compareText(condition.value);
      return condition.operator === 'equals' ? equal : !equal;
    }
    case 'includes':
    case 'not_includes': {
      let includes;
      if (Array.isArray(value)) includes = value.includes(condition.value);
      else if (typeof value === 'string') includes = compareText(value).includes(compareText(condition.value));
      else includes = false;
      return condition.operator === 'includes' ? includes : !includes;
    }
    case 'greater_than':
    case 'less_than': {
      if (!isAnswered(value)) return false;
      if (typeof condition.value === 'number') {
        const number = Number(value);
        if (!Number.isFinite(number)) return false;
        return condition.operator === 'greater_than' ? number > condition.value : number < condition.value;
      }
      return condition.operator === 'greater_than' ? String(value) > String(condition.value) : String(value) < String(condition.value);
    }
    default: return false;
  }
}

/** `answers` must already treat hidden questions as unanswered (computeVisibility does this). */
export function evaluateCondition(group, answers) {
  if (!group || !Array.isArray(group.conditions) || !group.conditions.length) return true;
  const results = group.conditions.map((condition) => evaluateOne(condition, answers ?? {}));
  return group.match === 'any' ? results.some(Boolean) : results.every(Boolean);
}

/**
 * Which sections and questions are visible and required for these answers.
 * Walks the form in order; a hidden question counts as unanswered for every
 * condition after it, so chains of follow-ups collapse together.
 */
export function computeVisibility(definition, answers) {
  const source = isObject(answers) ? answers : {};
  const effective = {};
  const visibility = { sections: {}, fields: {}, required: {} };
  for (const section of definition.sections) {
    const sectionVisible = evaluateCondition(section.visibleWhen, effective);
    visibility.sections[section.id] = sectionVisible;
    for (const field of section.fields) {
      const visible = sectionVisible && evaluateCondition(field.visibleWhen, effective);
      visibility.fields[field.id] = visible;
      const info = FIELD_TYPES[field.type];
      visibility.required[field.id] = Boolean(visible && info.collects && (field.required || (field.requiredWhen && evaluateCondition(field.requiredWhen, effective))));
      if (visible && info.collects && hasOwn(source, field.id)) {
        // A group counts only the entries a submission would keep: an entry with nothing in it is no answer.
        const value = field.type === 'group' && Array.isArray(source[field.id])
          ? source[field.id].filter((item) => isObject(item) && Object.values(item).some(isAnswered))
          : source[field.id];
        if (!Array.isArray(value) || field.type !== 'group' || value.length) effective[field.id] = value;
      }
      for (const sub of field.fields ?? []) {
        visibility.fields[sub.id] = visible;
        visibility.required[sub.id] = visible && sub.required === true;
      }
    }
  }
  return visibility;
}

/* -- Answer validation -------------------------------------------------------------- */

function fail(issues, path, field, fallback) {
  issues.push({ path, message: field.validationMessage || fallback });
}

function validateAttachments(field, value, path, issues, submit) {
  if (!Array.isArray(value)) {
    issues.push({ path, message: 'Attachments are malformed.' });
    return [];
  }
  const settings = field.settings ?? {};
  const allowedTypes = new Set((settings.formats ?? []).flatMap((format) => UPLOAD_FORMATS[format]?.mimeTypes ?? []));
  const out = [];
  const seen = new Set();
  for (const [index, item] of value.entries()) {
    const itemPath = `${path}.${index}`;
    if (!isObject(item) || typeof item.id !== 'string' || !ATTACHMENT_ID_PATTERN.test(item.id) || seen.has(item.id)) {
      issues.push({ path: itemPath, message: 'Attachment is malformed.' });
      continue;
    }
    seen.add(item.id);
    const name = typeof item.name === 'string' ? item.name.trim().slice(0, 200) : '';
    const contentType = typeof item.contentType === 'string' ? item.contentType.split(';')[0].trim().toLowerCase() : '';
    const size = item.size;
    if (!name || CONTROL_PATTERN.test(name)) issues.push({ path: itemPath, message: 'Attachment needs a file name.' });
    if (!allowedTypes.has(contentType)) issues.push({ path: itemPath, message: `${name || 'This file'} is not an allowed format.` });
    if (!finite(size) || size <= 0 || size > (settings.maxSizeMb ?? 1) * 1024 * 1024) issues.push({ path: itemPath, message: `${name || 'This file'} is larger than ${settings.maxSizeMb} MB.` });
    out.push({ id: item.id, name, contentType, size });
  }
  if (out.length > (settings.maxFiles ?? 1)) fail(issues, path, field, `Attach ${settings.maxFiles} file${settings.maxFiles === 1 ? '' : 's'} at most.`);
  if (submit && field.required && !out.length) fail(issues, path, field, 'Attach a file.');
  return out;
}

/**
 * Validate one value. Returns the cleaned value, or undefined to drop it.
 * `strict` applies length minimums, ranges and formats (submit mode); shape,
 * hard maximums and option ids are always enforced.
 */
function validateValue(field, value, path, issues, { strict, required }) {
  const settings = field.settings ?? {};
  const type = field.type;
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && !value.length)) {
    if (strict && required) fail(issues, path, field, type === 'group' ? 'Add at least one entry.' : UPLOAD_TYPES.includes(type) ? 'Attach a file.' : 'This question is required.');
    return undefined;
  }
  if (type === 'short_text' || type === 'long_text' || type === 'email' || type === 'url') {
    if (typeof value !== 'string') {
      issues.push({ path, message: 'Answer must be text.' });
      return undefined;
    }
    const text = cleanText(value);
    const max = type === 'email' ? 320 : type === 'url' ? 2000 : settings.maxLength ?? (type === 'short_text' ? SHORT_DEFAULT_MAX : LONG_DEFAULT_MAX);
    if (CONTROL_PATTERN.test(text)) issues.push({ path, message: 'Answer contains control characters.' });
    if (type !== 'long_text' && LINE_BREAK.test(text)) issues.push({ path, message: 'Answer must be a single line.' });
    if (text.length > max) fail(issues, path, field, `Use ${max} characters or fewer.`);
    if (strict) {
      if (settings.minLength && text.length < settings.minLength) fail(issues, path, field, `Use at least ${settings.minLength} characters.`);
      if (type === 'email' && !EMAIL_PATTERN.test(text)) fail(issues, path, field, 'Enter a valid email address.');
      if (type === 'url') {
        let ok = false;
        try {
          const url = new URL(text);
          ok = url.protocol === 'https:' || url.protocol === 'http:';
        } catch { ok = false; }
        if (!ok) fail(issues, path, field, 'Enter a link that starts with http:// or https://.');
      }
    }
    return text;
  }
  if (type === 'number') {
    const number = typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim()) ? Number(value.trim()) : value;
    if (!finite(number)) {
      // A draft may hold what is still being typed ("-", "1."), so it is kept as text
      // and only a submission insists on a number.
      if (!strict && typeof value === 'string' && value.length <= 40 && !CONTROL_PATTERN.test(value)) return value;
      fail(issues, path, field, 'Enter a number.');
      return undefined;
    }
    if (strict) {
      if (settings.integer && !Number.isInteger(number)) fail(issues, path, field, 'Enter a whole number.');
      if (finite(settings.min) && number < settings.min) fail(issues, path, field, `Enter ${settings.min} or more.`);
      if (finite(settings.max) && number > settings.max) fail(issues, path, field, `Enter ${settings.max} or less.`);
    }
    return number;
  }
  if (type === 'date') {
    if (!isDate(value)) {
      fail(issues, path, field, 'Enter a valid date.');
      return undefined;
    }
    if (strict) {
      if (settings.minDate && value < settings.minDate) fail(issues, path, field, `Choose ${settings.minDate} or later.`);
      if (settings.maxDate && value > settings.maxDate) fail(issues, path, field, `Choose ${settings.maxDate} or earlier.`);
    }
    return value;
  }
  if (SINGLE_CHOICE_TYPES.includes(type)) {
    if (typeof value !== 'string' || !choiceIds(optionsFor(field)).includes(value)) {
      issues.push({ path, message: 'Choose one of the options.' });
      return undefined;
    }
    return value;
  }
  if (type === 'multiple_choice') {
    const ids = choiceIds(optionsFor(field));
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !ids.includes(item))) {
      issues.push({ path, message: 'Choose from the options shown.' });
      return undefined;
    }
    // Stored in option order, not click order, so the same choices are always the same answer.
    const unique = ids.filter((id) => value.includes(id));
    if (strict) {
      if (settings.minSelections && unique.length < settings.minSelections) fail(issues, path, field, `Choose at least ${settings.minSelections}.`);
      if (settings.maxSelections && unique.length > settings.maxSelections) fail(issues, path, field, `Choose ${settings.maxSelections} at most.`);
    }
    return unique;
  }
  if (type === 'checkbox' || type === 'consent') {
    if (typeof value !== 'boolean') {
      issues.push({ path, message: 'Answer must be ticked or not ticked.' });
      return undefined;
    }
    if (strict && required && value !== true) fail(issues, path, field, type === 'consent' ? 'This permission is needed to submit.' : 'Tick this box to continue.');
    return value;
  }
  if (UPLOAD_TYPES.includes(type)) {
    const files = validateAttachments(field, value, path, issues, strict && required);
    return files.length ? files : undefined;
  }
  if (type === 'group') {
    if (!Array.isArray(value)) {
      issues.push({ path, message: 'Entries are malformed.' });
      return undefined;
    }
    const max = Math.min(settings.maxItems ?? 5, FORM_LIMITS.maxGroupItems);
    if (value.length > max) fail(issues, path, field, `Add ${max} entries at most.`);
    const subs = new Map((field.fields ?? []).map((sub) => [sub.id, sub]));
    const items = [];
    for (const [index, rawItem] of value.slice(0, FORM_LIMITS.maxGroupItems).entries()) {
      const itemPath = `${path}.${index}`;
      if (!isObject(rawItem)) {
        issues.push({ path: itemPath, message: 'Entry is malformed.' });
        continue;
      }
      const item = {};
      for (const key of Object.keys(rawItem)) {
        if (!subs.has(key)) issues.push({ path: `${itemPath}.${key}`, message: 'Unknown answer.' });
      }
      for (const sub of field.fields ?? []) {
        const cleaned = validateValue(sub, rawItem[sub.id], `${itemPath}.${sub.id}`, issues, { strict, required: sub.required === true });
        if (cleaned !== undefined) item[sub.id] = cleaned;
      }
      // Drafts keep empty entries so a contributor's "Add entry" survives a reload.
      items.push(item);
    }
    const kept = items.filter((item) => Object.values(item).some(isAnswered));
    if (strict && required && kept.length < Math.max(1, settings.minItems ?? 0)) fail(issues, path, field, `Add at least ${Math.max(1, settings.minItems ?? 0)} ${settings.itemLabel?.toLowerCase() || 'entr'}${Math.max(1, settings.minItems ?? 0) === 1 ? '' : 's'}.`);
    else if (strict && !required && kept.length && settings.minItems && kept.length < settings.minItems) fail(issues, path, field, `Add at least ${settings.minItems} entries.`);
    return strict ? (kept.length ? kept : undefined) : (items.length ? items : undefined);
  }
  issues.push({ path, message: 'This question does not take an answer.' });
  return undefined;
}

/**
 * Validate answers against a definition. Unknown answer keys are refused in
 * both modes. `submit` enforces required and conditional rules and drops the
 * answers of questions the rules hide, so hidden questions never block a
 * submission and never carry stale answers into it.
 */
export function validateAnswers(definition, input, options) {
  const submit = options?.mode === 'submit';
  const issues = [];
  const answers = {};
  if (!isObject(input)) return { answers, issues: [{ path: '', message: 'Answers are malformed.' }] };
  const fields = new Map();
  for (const { field } of topLevelFields(definition)) fields.set(field.id, field);
  for (const key of Object.keys(input)) {
    const field = fields.get(key);
    if (!field) issues.push({ path: key, message: 'Unknown answer.' });
    else if (!FIELD_TYPES[field.type].collects) issues.push({ path: key, message: 'This item does not take an answer.' });
  }
  if (submit) {
    // Clean shapes first so conditions see the same values the server stores.
    const shaped = {};
    const shapeIssues = [];
    for (const [id, field] of fields) {
      if (!FIELD_TYPES[field.type].collects || !hasOwn(input, id)) continue;
      const cleaned = validateValue(field, input[id], id, shapeIssues, { strict: false, required: false });
      if (cleaned !== undefined) shaped[id] = cleaned;
    }
    const visibility = computeVisibility(definition, shaped);
    for (const [id, field] of fields) {
      if (!FIELD_TYPES[field.type].collects || !visibility.fields[id]) continue;
      const cleaned = validateValue(field, input[id], id, issues, { strict: true, required: visibility.required[id] });
      if (cleaned !== undefined) answers[id] = cleaned;
    }
  } else {
    for (const [id, field] of fields) {
      if (!FIELD_TYPES[field.type].collects || !hasOwn(input, id)) continue;
      const cleaned = validateValue(field, input[id], id, issues, { strict: false, required: false });
      if (cleaned !== undefined) answers[id] = cleaned;
    }
  }
  return { answers, issues };
}

/** Values to pre-fill a new response with (defaults configured by the admin). */
export function defaultAnswers(definition) {
  const answers = {};
  for (const { field } of topLevelFields(definition)) {
    const settings = field.settings ?? {};
    if (settings.defaultText) answers[field.id] = settings.defaultText;
    if (settings.defaultOptionIds?.length) answers[field.id] = field.type === 'multiple_choice' ? [...settings.defaultOptionIds] : settings.defaultOptionIds[0];
  }
  return answers;
}

/** UTF-8 bytes of the answers' JSON: what the server counts against ANSWERS_BYTE_BUDGET. */
export function answersByteSize(answers) {
  return new TextEncoder().encode(JSON.stringify(answers ?? {})).length;
}

/**
 * The answers that take the most room, largest first, to point at when a
 * response is over ANSWERS_BYTE_BUDGET: one row per top-level answer, or per
 * sub-answer of a group entry (path `groupId.2.subId`, as issues use).
 */
export function largestAnswers(definition, answers, count = 3) {
  const rows = [];
  for (const { field } of topLevelFields(definition)) {
    const value = answers?.[field.id];
    if (value === undefined) continue;
    if (field.type === 'group' && Array.isArray(value)) {
      const itemLabel = field.settings?.itemLabel || 'Entry';
      value.forEach((item, index) => {
        if (!isObject(item)) return;
        for (const sub of field.fields ?? []) {
          if (item[sub.id] === undefined) continue;
          rows.push({ path: `${field.id}.${index}.${sub.id}`, label: `${field.label || field.id} (${itemLabel} ${index + 1}): ${sub.label || sub.id}`, bytes: answersByteSize(item[sub.id]) });
        }
      });
      continue;
    }
    rows.push({ path: field.id, label: field.label || field.id, bytes: answersByteSize(value) });
  }
  return rows.sort((a, b) => b.bytes - a.bytes).slice(0, count);
}

/**
 * The answers of a draft moving from one version of a form to another. An
 * answer is kept when its question exists in both versions with the same type
 * (inside a group, the same holds for each sub-question) and it passes the new
 * version's draft checks. Permissions are never carried: the contributor gives
 * each one again under the wording that will be recorded. `dropped` lists each
 * lost answer once, as `fieldId` or `groupId.subId`.
 */
export function carryAnswers(previous, next, answers) {
  const before = new Map(topLevelFields(previous).map(({ field }) => [field.id, field]));
  const after = new Map(topLevelFields(next).map(({ field }) => [field.id, field]));
  const kept = {};
  const dropped = [];
  const drop = (key, value) => {
    if (isAnswered(value) && !dropped.includes(key)) dropped.push(key);
  };
  for (const [key, value] of Object.entries(isObject(answers) ? answers : {})) {
    const old = before.get(key);
    const field = after.get(key);
    if (!old || !field || old.type !== field.type || !FIELD_TYPES[field.type]?.collects || field.type === 'consent') {
      drop(key, value);
      continue;
    }
    if (field.type === 'group' && Array.isArray(value)) {
      const subs = new Map((field.fields ?? []).map((sub) => [sub.id, sub.type]));
      const oldSubs = new Map((old.fields ?? []).map((sub) => [sub.id, sub.type]));
      kept[key] = value.map((item) => {
        const entry = {};
        for (const [sub, subValue] of Object.entries(isObject(item) ? item : {})) {
          if (subs.has(sub) && subs.get(sub) === oldSubs.get(sub)) entry[sub] = subValue;
          else drop(`${key}.${sub}`, subValue);
        }
        return entry;
      });
      continue;
    }
    kept[key] = value;
  }
  const { answers: carried } = validateAnswers(next, kept, { mode: 'draft' });
  for (const [key, value] of Object.entries(kept)) {
    if (!hasOwn(carried, key)) {
      drop(key, value);
      continue;
    }
    if (after.get(key).type !== 'group' || !Array.isArray(value)) continue;
    // Entries stay in place in a draft, so each one is compared with its own result.
    value.forEach((entry, index) => {
      const result = carried[key][index] ?? {};
      for (const [sub, subValue] of Object.entries(entry)) if (!hasOwn(result, sub)) drop(`${key}.${sub}`, subValue);
    });
  }
  return { answers: carried, dropped };
}

export function consentRecords(definition, answers) {
  const records = [];
  for (const { field } of topLevelFields(definition)) {
    if (field.type !== 'consent') continue;
    records.push({ fieldId: field.id, purpose: field.settings.consentPurpose, statement: field.settings.statement, granted: answers?.[field.id] === true });
  }
  return records;
}

export function grantedPurposes(consents) {
  return [...new Set((consents ?? []).filter((record) => record.granted).map((record) => record.purpose))];
}

export function attachmentsIn(definition, answers) {
  const out = [];
  for (const { field } of topLevelFields(definition)) {
    const value = answers?.[field.id];
    if (UPLOAD_TYPES.includes(field.type) && Array.isArray(value)) {
      for (const file of value) out.push({ ...file, fieldId: field.id });
    }
    if (field.type === 'group' && Array.isArray(value)) {
      for (const item of value) {
        for (const sub of field.fields ?? []) {
          if (UPLOAD_TYPES.includes(sub.type) && Array.isArray(item?.[sub.id])) {
            for (const file of item[sub.id]) out.push({ ...file, fieldId: sub.id });
          }
        }
      }
    }
  }
  return out;
}

/** The upload question with this id (top level or inside a group), for checking an upload against its limits. */
export function uploadField(definition, fieldId) {
  const field = findField(definition, fieldId);
  return field && UPLOAD_TYPES.includes(field.type) ? field : null;
}

/** Find an upload format by file name and declared type; both must agree. */
export function matchUploadFormat(field, name, contentType) {
  const extension = String(name ?? '').toLowerCase().split('.').at(-1);
  const mime = String(contentType ?? '').split(';')[0].trim().toLowerCase();
  for (const key of field?.settings?.formats ?? []) {
    const format = UPLOAD_FORMATS[key];
    if (format && format.extensions.includes(extension) && format.mimeTypes.includes(mime)) return key;
  }
  return null;
}

/* -- Availability and audience ----------------------------------------------------- */

/**
 * Whether a response may be submitted now against this version. Drafts stay
 * attached to their version: they can be submitted while the form is published
 * and the version has not been retired.
 */
export function submissionWindow({ formStatus, versionState, schedule, now = Date.now() }) {
  if (formStatus === 'paused') return { open: false, reason: 'paused', message: 'This form is paused. Your draft is kept; you can submit when it reopens.' };
  if (formStatus === 'closed') return { open: false, reason: 'closed', message: 'This form is closed to new responses.' };
  if (formStatus === 'archived') return { open: false, reason: 'archived', message: 'This form has been archived.' };
  if (formStatus !== 'published') return { open: false, reason: 'not_published', message: 'This form is not published.' };
  if (versionState === 'retired') return { open: false, reason: 'retired', message: 'This version of the form was retired. Start again on the current version.' };
  if (versionState !== 'published') return { open: false, reason: 'not_published', message: 'This version of the form is not published.' };
  if (schedule?.opensAt && now < Date.parse(schedule.opensAt)) return { open: false, reason: 'not_yet_open', message: 'This form is not open yet.' };
  if (schedule?.closesAt && now >= Date.parse(schedule.closesAt)) return { open: false, reason: 'past_deadline', message: 'The deadline for this form has passed.' };
  return { open: true, reason: null, message: '' };
}

/** Profile dialect labels ("Navrongo", "Not sure") to dialect ids. */
export function dialectIdFromLabel(label) {
  const text = String(label ?? '').trim().toLowerCase();
  const match = FORM_DIALECTS.find((item) => item.id === text || item.label.toLowerCase() === text);
  return match ? match.id : null;
}

/**
 * Whether a contributor belongs to a form's audience. `profile` holds what the
 * server knows: the contributor's Kasem variety, chosen contribution types and
 * admin-managed cohort memberships.
 */
export function audienceMatches(audience, profile) {
  if (!audience || audience.mode !== 'groups') return true;
  const dialect = dialectIdFromLabel(profile?.dialect);
  const types = Array.isArray(profile?.contributionTypes) ? profile.contributionTypes : [];
  const cohorts = Array.isArray(profile?.cohortIds) ? profile.cohortIds : [];
  return (dialect !== null && audience.dialectIds.includes(dialect))
    || audience.contributionTypes.some((type) => types.includes(type))
    || audience.cohortIds.some((id) => cohorts.includes(id));
}

/* -- Summaries and display ------------------------------------------------------------ */

const labelOf = (list, id) => list.find((item) => item.id === id)?.label ?? id;

export function audienceText(audience, cohortNames = {}) {
  if (!audience || audience.mode !== 'groups') return 'All signed-in contributors';
  const parts = [];
  if (audience.dialectIds.length) parts.push(`speakers of ${audience.dialectIds.map((id) => labelOf(FORM_DIALECTS, id)).join(', ')}`);
  if (audience.contributionTypes.length) parts.push(`contributors to ${audience.contributionTypes.map((id) => labelOf(AUDIENCE_CONTRIBUTION_TYPES, id).toLowerCase()).join(', ')}`);
  if (audience.cohortIds.length) parts.push(`cohorts ${audience.cohortIds.map((id) => cohortNames[id] ?? id).join(', ')}`);
  return `Signed-in contributors who are ${parts.join(', or ')}`;
}

export function publishSummary(definition, options = {}) {
  const fields = topLevelFields(definition).map((entry) => entry.field);
  const inputs = fields.filter((field) => FIELD_TYPES[field.type].collects);
  const { opensAt, closesAt } = definition.schedule;
  const when = (iso) => new Date(iso).toUTCString().replace(/:\d\d GMT$/, ' UTC');
  const validation = [];
  for (const field of inputs) {
    const rules = [];
    const settings = field.settings ?? {};
    if (field.required) rules.push('required');
    if (field.requiredWhen) rules.push('required when a condition applies');
    if (field.visibleWhen) rules.push('shown only when a condition applies');
    if (settings.minLength) rules.push(`at least ${settings.minLength} characters`);
    if (settings.maxLength && ['short_text', 'long_text'].includes(field.type)) rules.push(`up to ${settings.maxLength} characters`);
    if (finite(settings.min) || finite(settings.max)) rules.push(`between ${settings.min ?? '−∞'} and ${settings.max ?? '∞'}`);
    if (UPLOAD_TYPES.includes(field.type)) rules.push(`${settings.maxFiles} file${settings.maxFiles === 1 ? '' : 's'}, ${settings.maxSizeMb} MB each, ${settings.formats.map((key) => UPLOAD_FORMATS[key].extensions[0].toUpperCase()).join('/')}`);
    if (field.type === 'group') rules.push(`${settings.minItems}–${settings.maxItems} entries`);
    if (rules.length) validation.push(`${field.label}: ${rules.join(', ')}`);
  }
  const review = definition.review;
  const destination = DESTINATIONS[definition.destination.type];
  return {
    title: definition.title,
    sections: definition.sections.length,
    questions: inputs.length,
    requiredQuestions: inputs.filter((field) => field.required).length,
    conditionalQuestions: fields.filter((field) => field.visibleWhen || field.requiredWhen).length + definition.sections.filter((section) => section.visibleWhen).length,
    uploads: inputs.filter((field) => UPLOAD_TYPES.includes(field.type) || field.fields?.some((sub) => UPLOAD_TYPES.includes(sub.type))).length,
    consents: inputs.filter((field) => field.type === 'consent').map((field) => ({ purpose: field.settings.consentPurpose, statement: field.settings.statement })),
    audience: audienceText(definition.audience, options.cohortNames),
    schedule: opensAt || closesAt ? `${opensAt ? `Opens ${when(opensAt)}` : 'Opens on publishing'}; ${closesAt ? `closes ${when(closesAt)}` : 'no closing date'}` : 'Opens on publishing; no closing date',
    submission: `${definition.submission.policy === 'once' ? 'One response per contributor' : 'Several responses per contributor'}; drafts ${definition.submission.allowDrafts ? 'allowed' : 'off'}; attachments ${definition.submission.allowAttachments ? 'allowed' : 'off'}`,
    review: review.required
      ? `Every response is reviewed by ${REVIEWER_GROUPS[review.reviewerGroup].label.toLowerCase()}${review.checks.length ? ` with ${review.checks.length} required check${review.checks.length === 1 ? '' : 's'}` : ''}${review.points ? `; ${review.points} points on approval` : '; no points'}`
      : 'No review: responses are kept as received and earn no points',
    destination: `${destination.label}. ${destination.effect}`,
    validation,
  };
}

export function displayAnswer(field, value) {
  if (value === undefined || value === null || value === '') return '';
  const type = field.type;
  if (SINGLE_CHOICE_TYPES.includes(type)) return labelOf(optionsFor(field), value);
  if (type === 'multiple_choice' && Array.isArray(value)) return value.map((id) => labelOf(optionsFor(field), id)).join(', ');
  if (type === 'checkbox' || type === 'consent') return value === true ? 'Yes' : 'No';
  if (UPLOAD_TYPES.includes(type) && Array.isArray(value)) return value.map((file) => file?.name ?? '').filter(Boolean).join(', ');
  if (type === 'group' && Array.isArray(value)) {
    return value.map((item, index) => `${field.settings?.itemLabel ?? 'Item'} ${index + 1}: ${(field.fields ?? [])
      .map((sub) => `${sub.label}: ${displayAnswer(sub, item?.[sub.id])}`).join('; ')}`).join('\n');
  }
  return String(value);
}

/* -- Export ------------------------------------------------------------------------- */

/**
 * One CSV cell. Text that a spreadsheet would read as a formula (=, +, -, @,
 * tab or carriage return first) gets a leading apostrophe; numbers stay numbers.
 */
export function csvCell(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function exportCell(field, value) {
  if (value === undefined || value === null) return '';
  if (UPLOAD_TYPES.includes(field.type) && Array.isArray(value)) return value.map((file) => `${file.id}:${file.name}`).join('; ');
  if (field.type === 'multiple_choice' && Array.isArray(value)) return value.join('; ');
  if (field.type === 'group') return JSON.stringify(value);
  return value;
}

/**
 * One row per response. Columns are stable answer keys (the union across the
 * exported versions, newest order first); choices export option ids, uploads
 * export `attachmentId:fileName` pairs (never links), repeatable groups export
 * a JSON array of entries keyed by sub-question key.
 */
export function responsesToCsv(versions, responses) {
  const ordered = [...versions].sort((a, b) => b.version - a.version);
  const columns = [];
  const fieldsByVersion = new Map();
  for (const { version, definition } of ordered) {
    const map = new Map();
    for (const { field } of topLevelFields(definition)) {
      if (!FIELD_TYPES[field.type].collects) continue;
      map.set(field.id, field);
      if (!columns.includes(field.id)) columns.push(field.id);
    }
    fieldsByVersion.set(version, map);
  }
  const fixed = ['reference_id', 'response_id', 'form_id', 'form_version', 'revision', 'status', 'contributor_id', 'submitted_at', 'decided_at', 'granted_permissions'];
  const lines = [[...fixed, ...columns].map(csvCell).join(',')];
  for (const response of responses) {
    const fields = fieldsByVersion.get(response.formVersion) ?? new Map();
    const row = [
      response.referenceId, response.id, response.formId, response.formVersion, response.revision, response.status,
      response.contributorId, response.submittedAt ?? '', response.decidedAt ?? '', grantedPurposes(response.consents).join('; '),
    ];
    for (const column of columns) {
      const field = fields.get(column);
      row.push(field ? exportCell(field, response.answers?.[column]) : '');
    }
    lines.push(row.map(csvCell).join(','));
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

export function responsesToJson(form, versions, responses, meta = {}) {
  return JSON.stringify({
    format: 'indigen-forms-export',
    formatVersion: 1,
    ...meta,
    form: { id: form.id, title: form.title },
    versions: [...versions].sort((a, b) => a.version - b.version).map(({ version, definition }) => ({ version, definition })),
    responses: responses.map((response) => ({
      referenceId: response.referenceId,
      id: response.id,
      formVersion: response.formVersion,
      revision: response.revision,
      status: response.status,
      contributorId: response.contributorId,
      submittedAt: response.submittedAt,
      decidedAt: response.decidedAt,
      answers: response.answers,
      consents: response.consents,
    })),
  }, null, 2);
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function referenceIdFrom(bytes) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < 8) {
      out += CROCKFORD[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
    if (out.length >= 8) break;
  }
  while (out.length < 8) out += '0';
  return `IWF-${out.slice(0, 4)}-${out.slice(4, 8)}`;
}
