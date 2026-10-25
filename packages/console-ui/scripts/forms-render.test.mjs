// Server-side render checks for the shared Indigen Forms renderer, run
// against the BUILT package (`npm run build:console-ui` first).
//
//   node --test packages/console-ui/scripts/forms-render.test.mjs
//
// tsc emits extensionless relative imports (moduleResolution "bundler"), which
// the apps' bundlers resolve. A small resolve hook lets Node do the same for
// files inside dist/ only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import {
  CONSENT_PURPOSES,
  FIELD_TYPES,
  FORM_TEMPLATES,
  choicesFor,
  computeVisibility,
  consentRecords,
  defaultAnswers,
  validateAnswers,
  validateDefinition,
} from '@indigen-world/contracts/forms';

const distUrl = new URL('../dist/', import.meta.url);
const entry = new URL('index.js', distUrl);
if (!existsSync(entry)) throw new Error('Build the package first: npm run build:console-ui');

registerHooks({
  resolve(specifier, context, nextResolve) {
    const relative = specifier.startsWith('./') || specifier.startsWith('../');
    if (relative && context.parentURL?.startsWith(distUrl.href) && !/\.[cm]?js$/.test(specifier)) {
      for (const candidate of [`${specifier}.js`, `${specifier}/index.js`]) {
        try {
          return nextResolve(candidate, context);
        } catch {
          // try the next form
        }
      }
    }
    return nextResolve(specifier, context);
  },
});

const ui = await import(entry.href);
const { FormRenderer, FormResponseView, FormReviewSummary, formPages, issuesForSections } = ui;

/* -- Fixtures ----------------------------------------------------------------------- */

// Kasem with combining tone marks, exactly as a contributor types it.
const KASEM = 'test-ʋ̀ʋ́ test-ɩ́ɔ̀';
// Decomposed Latin letters with tone marks: NFC normalisation would rewrite these.
const DECOMPOSED = 'Nàá ká';

const escapeHtml = (text) => String(text)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');

const noop = () => {};
const neverCalled = () => { throw new Error('onChange must not be called while rendering'); };

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}

const when = (fieldId, operator, value) => ({ match: 'all', conditions: [{ fieldId, operator, ...(value === undefined ? {} : { value }) }] });

const syntheticInput = {
  schemaVersion: 1,
  title: 'Every question type',
  description: 'A synthetic form for render tests.',
  category: 'other',
  instructions: '',
  estimatedMinutes: null,
  languageContext: { languageIds: [], dialectIds: [], note: '' },
  presentation: 'paged',
  sections: [
    {
      id: 'basics',
      title: 'Basics',
      description: 'Section description\nover two lines',
      visibleWhen: null,
      fields: [
        { id: 'intro', type: 'instruction', label: 'Before you start', settings: { body: 'Line one of the guidance\nLine two of the guidance' } },
        { id: 'part_heading', type: 'heading', label: 'About the word' },
        {
          id: 'word', type: 'short_text', label: 'Kasem word', required: true,
          description: 'Spell it as you say it. <img src=x onerror=alert(1)>', example: KASEM, placeholder: 'Type the word',
          settings: { maxLength: 120, kasemKeyboard: true, dictionarySuggestions: true },
        },
        { id: 'story', type: 'long_text', label: 'Story', settings: { maxLength: 2000, kasemKeyboard: true } },
        { id: 'count', type: 'number', label: 'How many speakers?', settings: { min: 0, max: 500, integer: true } },
        { id: 'contact', type: 'email', label: 'Email address' },
        { id: 'link', type: 'url', label: 'Web link' },
        { id: 'heard_on', type: 'date', label: 'Date heard', settings: { minDate: '2000-01-01', maxDate: '2030-12-31' } },
        { id: 'kind', type: 'single_choice', label: 'Kind of word', required: true, settings: { options: [{ id: 'noun', label: 'Noun' }, { id: 'verb', label: 'Verb' }] } },
        { id: 'uses', type: 'multiple_choice', label: 'Where is it used?', settings: { maxSelections: 2, options: [{ id: 'home', label: 'At home' }, { id: 'market', label: 'At the market' }, { id: 'school', label: 'At school' }] } },
        { id: 'region', type: 'dropdown', label: 'Region', placeholder: 'Pick a region', settings: { options: [{ id: 'upper_east', label: 'Upper East' }, { id: 'elsewhere', label: 'Elsewhere' }] } },
        { id: 'confirm', type: 'checkbox', label: 'Confirmation', required: true, settings: { statement: 'I checked the spelling.' } },
        { id: 'language', type: 'language', label: 'Language of the word', settings: { allowedIds: ['kasem', 'english'] } },
        { id: 'dialect', type: 'dialect', label: 'Kasem variety' },
      ],
    },
    {
      id: 'media',
      title: 'Media and examples',
      description: '',
      visibleWhen: when('kind', 'equals', 'noun'),
      fields: [
        { id: 'document', type: 'file', label: 'Supporting document', settings: { formats: ['pdf', 'txt'], maxSizeMb: 5, maxFiles: 2 } },
        { id: 'photo', type: 'image', label: 'Photo', settings: { formats: ['jpeg', 'png'], maxSizeMb: 5, maxFiles: 1 } },
        { id: 'recording', type: 'audio', label: 'Pronunciation recording', settings: { formats: ['mp3', 'webm_audio'], maxSizeMb: 10, maxFiles: 1, allowRecording: true } },
        { id: 'clip', type: 'video', label: 'Video clip', settings: { formats: ['mp4'], maxSizeMb: 50, maxFiles: 1 } },
        {
          id: 'examples', type: 'group', label: 'Usage examples', required: true,
          settings: { minItems: 1, maxItems: 3, itemLabel: 'Example' },
          fields: [
            { id: 'example_kasem', type: 'short_text', label: 'Example in Kasem', required: true, settings: { maxLength: 300, kasemKeyboard: true } },
            { id: 'example_audio', type: 'audio', label: 'Example recording', settings: { formats: ['mp3'], maxSizeMb: 5, maxFiles: 1 } },
          ],
        },
      ],
    },
    {
      id: 'permissions',
      title: 'Permissions',
      description: '',
      visibleWhen: null,
      fields: [
        {
          id: 'consent_public', type: 'consent', label: 'Permission', required: true,
          settings: { consentPurpose: 'public', statement: 'After review, the word may be published.\nYou can ask us to remove it later.' },
        },
      ],
    },
  ],
  schedule: { opensAt: null, closesAt: null },
  submission: { policy: 'multiple', allowDrafts: true, allowAttachments: true, successMessage: 'Thank you.', nextSteps: '' },
  audience: { mode: 'all_contributors', dialectIds: [], contributionTypes: [], cohortIds: [] },
  review: { required: true, reviewerGroup: 'reviewers', instructions: '', checks: [], points: 0 },
  destination: { type: 'general_intake', mapping: {} },
};

const { definition: synthetic, issues: syntheticIssues } = validateDefinition(syntheticInput, { forPublish: true });
deepFreeze(synthetic);

const sampleAnswers = deepFreeze({
  word: KASEM,
  story: `${KASEM}\nsecond line ${DECOMPOSED}`,
  count: 12,
  contact: 'someone@example.org',
  link: 'https://example.org/words',
  heard_on: '2024-03-05',
  kind: 'noun',
  uses: ['home', 'market'],
  region: 'upper_east',
  confirm: true,
  language: 'kasem',
  dialect: 'navrongo',
  document: [{ id: 'upload_doc_0001', name: 'field-notes.pdf', contentType: 'application/pdf', size: 204800 }],
  recording: [{ id: 'upload_rec_0001', name: 'word.mp3', contentType: 'audio/mpeg', size: 1048576 }],
  examples: [
    { example_kasem: KASEM, example_audio: [{ id: 'upload_ex_00001', name: 'example.mp3', contentType: 'audio/mpeg', size: 3000 }] },
    { example_kasem: DECOMPOSED },
  ],
  consent_public: true,
});

const fill = (props) => renderToString(h(FormRenderer, { definition: synthetic, answers: sampleAnswers, onChange: neverCalled, idPrefix: 'tf', ...props }));
const count = (html, needle) => html.split(needle).length - 1;
/** The opening tag of the element with this id (React orders attributes its own way). */
const tagOf = (html, id) => {
  const match = html.match(new RegExp(`<[a-z]+ [^>]*id="${id}"[^>]*>`));
  assert.ok(match, `element #${id}`);
  return match[0];
};
const hasAttributes = (html, id, attributes) => {
  const tag = tagOf(html, id);
  for (const [name, value] of Object.entries(attributes)) assert.ok(tag.includes(`${name}="${value}"`), `#${id} ${name}="${value}" in ${tag}`);
};

/* -- Contract sanity ------------------------------------------------------------------- */

test('the synthetic form covers every field type and is publishable', () => {
  assert.deepEqual(syntheticIssues, []);
  const used = new Set();
  for (const section of synthetic.sections) {
    for (const field of section.fields) {
      used.add(field.type);
      for (const sub of field.fields ?? []) used.add(sub.type);
    }
  }
  assert.deepEqual([...used].sort(), Object.keys(FIELD_TYPES).sort(), 'add any new field type to the synthetic form');
  const { issues, answers } = validateAnswers(synthetic, sampleAnswers, { mode: 'submit' });
  assert.deepEqual(issues, []);
  assert.equal(answers.word, KASEM);
});

/* -- FormRenderer ------------------------------------------------------------------------- */

test('FormRenderer renders every field type with its control', () => {
  const html = fill();
  for (const section of synthetic.sections) {
    for (const field of section.fields) {
      if (field.label) assert.ok(html.includes(escapeHtml(field.label)), `label of ${field.id}`);
      for (const sub of field.fields ?? []) assert.ok(html.includes(escapeHtml(sub.label)), `label of ${field.id}.${sub.id}`);
    }
  }
  // Section text and display-only items.
  assert.ok(html.includes('<h2 id="tf--section-basics" class="iwf-section__title">Basics</h2>'));
  assert.ok(html.includes('Section description\nover two lines'));
  assert.ok(html.includes('Line one of the guidance\nLine two of the guidance'));
  assert.match(html, /<h3 class="iwf-heading">About the word<\/h3>/);
  // Text, number, email, url, date.
  hasAttributes(html, 'tf-word', { type: 'text', lang: 'xsm', 'aria-required': 'true', placeholder: 'Type the word' });
  assert.match(html, /<textarea id="tf-story"/);
  hasAttributes(html, 'tf-count', { type: 'text', inputMode: 'numeric', value: '12' });
  hasAttributes(html, 'tf-contact', { type: 'text', inputMode: 'email', autoComplete: 'email' });
  hasAttributes(html, 'tf-link', { type: 'text', inputMode: 'url' });
  hasAttributes(html, 'tf-heard_on', { type: 'date', value: '2024-03-05', min: '2000-01-01', max: '2030-12-31' });
  assert.ok(html.includes('Enter a whole number from 0 to 500.'));
  assert.equal(KASEM.length, 19);
  assert.ok(html.includes('>19 / 120<'), 'the counter uses UTF-16 code units, as the contract does');
  // Choices.
  assert.equal(count(html, 'type="radio"'), 2);
  hasAttributes(html, 'tf-kind-0', { type: 'radio', name: 'tf-kind', value: 'noun', checked: '' });
  assert.match(html, /<fieldset class="iwf-q iwf-q--single_choice" id="tf-kind" role="radiogroup" aria-required="true"/);
  hasAttributes(html, 'tf-uses-0', { type: 'checkbox', name: 'tf-uses', value: 'home', checked: '' });
  assert.ok(html.includes('Choose up to 2.'));
  assert.match(html, /<select id="tf-region"[^>]*><option value="">Pick a region<\/option><option value="upper_east" selected="">Upper East<\/option>/);
  for (const option of choicesFor(synthetic.sections[0].fields.find((field) => field.id === 'language'))) assert.ok(html.includes(`>${option.label}</option>`));
  assert.ok(!html.includes('>French</option>'), 'allowedIds restricts the language list');
  for (const option of choicesFor({ type: 'dialect', settings: {} })) assert.ok(html.includes(`>${option.label}</option>`));
  // Checkbox and consent.
  assert.ok(html.includes('I checked the spelling.'));
  assert.ok(html.includes(CONSENT_PURPOSES.public.label));
  assert.ok(html.includes('After review, the word may be published.\nYou can ask us to remove it later.'));
  hasAttributes(html, 'tf-consent_public', { type: 'checkbox', checked: '', 'aria-required': 'true', 'aria-describedby': 'tf-consent_public-statement tf-consent_public-purpose tf-consent_public-note' });
  // Uploads: drop zone, accept list from UPLOAD_FORMATS, limits, attachments.
  assert.ok(html.includes('accept=".pdf,.txt,application/pdf,text/plain"'));
  assert.ok(html.includes('Accepted formats: PDF, TXT. Up to 5 MB per file. Up to 2 files.'));
  assert.ok(html.includes('field-notes.pdf'));
  assert.ok(html.includes('PDF document · 200 KB'));
  assert.ok(html.includes('A file is attached, the most allowed.'), 'a full single-file question hides the drop zone');
  assert.ok(html.includes('File uploads are not available here.'), 'without an adapter the renderer says so');
  // Repeatable group.
  assert.ok(html.includes('>Example 1</h3>') && html.includes('>Example 2</h3>'));
  assert.ok(html.includes('Add Example'));
  assert.ok(html.includes('Move up<span class="ts-sr"> Example 2</span>'));
  assert.match(html, /id="tf-examples-0-example_kasem"/);
  // Required markers.
  assert.match(html, /<label class="ts-label iwf-label" for="tf-word"><span class="iwf-label__text">Kasem word<\/span><span class="ts-required" aria-hidden="true">\*<\/span>/);
});

test('typed text survives exactly: tone marks, combining diacritics and line breaks', () => {
  assert.ok(/\p{Mn}/u.test(KASEM), 'the fixture carries combining marks');
  assert.notEqual(DECOMPOSED, DECOMPOSED.normalize('NFC'), 'the fixture would change under NFC');
  const html = fill();
  assert.ok(html.includes(`value="${KASEM}"`));
  assert.ok(html.includes(`${KASEM}\nsecond line ${DECOMPOSED}`));
  assert.ok(html.includes(`value="${DECOMPOSED}"`), 'group entry text unchanged');
  assert.ok(!html.includes(DECOMPOSED.normalize('NFC')), 'nothing was normalised');
  // Leading and trailing spaces are kept while typing.
  const spaced = fill({ answers: { ...sampleAnswers, word: `  ${KASEM}  ` } });
  assert.ok(spaced.includes(`value="  ${KASEM}  "`));
});

test('admin-authored text is rendered as text, never as markup', () => {
  const html = fill();
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!html.includes('<img src=x'));
});

test('a number that does not parse is shown as typed, for the contract to report', () => {
  const html = fill({ answers: { ...sampleAnswers, count: '12a' } });
  assert.match(html, /id="tf-count"[^>]*value="12a"/);
});

test('hidden conditional sections and questions are not rendered', () => {
  const verb = fill({ answers: { ...sampleAnswers, kind: 'verb' } });
  assert.ok(!verb.includes('data-section-id="media"'));
  assert.ok(!verb.includes('Media and examples'));
  assert.ok(!verb.includes('Supporting document'));
  assert.ok(!verb.includes('field-notes.pdf'), 'hidden answers are kept but not shown');
  assert.ok(verb.includes('data-section-id="permissions"'));

  const word = FORM_TEMPLATES.find((template) => template.id === 'kasem_word_collection').definition;
  const own = renderToString(h(FormRenderer, { definition: word, answers: { source: 'own_knowledge' }, onChange: noop }));
  assert.ok(!own.includes('data-field-id="source_detail"'));
  const published = renderToString(h(FormRenderer, { definition: word, answers: { source: 'published' }, onChange: noop }));
  assert.ok(published.includes('data-field-id="source_detail"'));
  // requiredWhen applies live: the follow-up becomes required with its condition.
  assert.match(published, /for="[^"]+-source_detail"><span class="iwf-label__text">Name the source<\/span><span class="ts-required"/);

  const oral = FORM_TEMPLATES.find((template) => template.id === 'oral_history').definition;
  const written = renderToString(h(FormRenderer, { definition: oral, answers: { format: 'written' }, onChange: noop }));
  assert.ok(!written.includes('data-section-id="recording_section"'));
  assert.ok(written.includes('data-section-id="written_section"'));
});

test('sectionIds renders only the current page', () => {
  const html = fill({ sectionIds: ['permissions'] });
  assert.ok(html.includes('data-section-id="permissions"'));
  assert.ok(!html.includes('data-section-id="basics"'));
  assert.ok(!html.includes('data-section-id="media"'));
});

test('optional renderers: Kasem text and the recorder', () => {
  const seen = [];
  const html = fill({
    renderKasemText: (props) => {
      seen.push(props);
      return h('kasem-field', { id: props.id, 'data-kasem': String(props.kasemKeyboard), 'data-dictionary': String(props.dictionarySuggestions) }, props.value);
    },
    renderRecorder: ({ field, disabled }) => h('span', { className: 'test-recorder', 'data-for': field.id, 'data-disabled': String(disabled) }, 'Record'),
  });
  const ids = seen.map((props) => props.id).sort();
  assert.deepEqual(ids, ['tf-examples-0-example_kasem', 'tf-examples-1-example_kasem', 'tf-story', 'tf-word']);
  const word = seen.find((props) => props.id === 'tf-word');
  assert.equal(word.value, KASEM);
  assert.equal(word.dictionarySuggestions, true);
  assert.equal(word.kasemKeyboard, true);
  assert.equal(word.multiline, false);
  assert.equal(word.maxLength, 120);
  assert.equal(word.required, true);
  assert.match(word.describedBy, /tf-word-desc tf-word-ex tf-word-count/);
  assert.equal(seen.find((props) => props.id === 'tf-story').multiline, true);
  assert.ok(html.includes(`<kasem-field id="tf-word" data-kasem="true" data-dictionary="true">${KASEM}</kasem-field>`));
  assert.ok(!html.includes('<kasem-field id="tf-contact"'));
  // Only the audio question that allows recording gets a recorder; it is full, so disabled.
  assert.equal(count(html, 'class="test-recorder"'), 1);
  assert.ok(html.includes('data-for="recording" data-disabled="true"'));
});

test('preview mode checks uploads but never offers to send them', () => {
  const html = fill({ mode: 'preview', answers: { kind: 'noun' } });
  assert.ok(html.includes('data-section-id="media"'));
  assert.ok(html.includes('Preview: chosen files are checked against these limits but never uploaded.'));
  assert.ok(!html.includes('File uploads are not available here.'));
  const adapter = { upload: () => { throw new Error('must not upload while rendering'); } };
  const withAdapter = fill({ uploads: adapter, answers: { ...sampleAnswers, document: [] } });
  assert.ok(!withAdapter.includes('File uploads are not available here.'));
  hasAttributes(withAdapter, 'tf-document-file', { type: 'file', multiple: '', 'aria-labelledby': 'tf-document-legend tf-document-drop' });
  assert.ok(!tagOf(withAdapter, 'tf-document-file').includes('disabled'));
});

test('issues show inline and in a linked summary; unknown paths go to the summary only', () => {
  const issues = [
    { path: 'word', message: 'This question is required.' },
    { path: 'examples.0.example_kasem', message: 'Use 300 characters or fewer.' },
    { path: 'document.0', message: 'field-notes.pdf is not an allowed format.' },
    { path: 'examples', message: 'Add at least 1 example.' },
    { path: '', message: 'Answers are malformed.' },
  ];
  const html = fill({ issues });
  assert.ok(html.includes('Fix 5 problems before you continue'));
  assert.ok(html.includes('<a href="#tf-word">Kasem word: This question is required.</a>'));
  assert.ok(html.includes('<a href="#tf-examples-0-example_kasem">Usage examples · Example 1 · Example in Kasem: Use 300 characters or fewer.</a>'));
  assert.ok(html.includes('<a href="#tf-document">Supporting document: field-notes.pdf is not an allowed format.</a>'));
  assert.ok(html.includes('<li>Answers are malformed.</li>'));
  hasAttributes(html, 'tf-word', { 'aria-invalid': 'true', 'aria-describedby': 'tf-word-desc tf-word-ex tf-word-count tf-word-err' });
  assert.ok(html.includes('id="tf-word-err"'));
  assert.ok(html.includes('id="tf-examples-0-example_kasem-err"'));
  assert.ok(html.includes('· Needs attention'), 'the named attachment is marked');
  // On another page the same issues are listed without links.
  const page = fill({ issues, sectionIds: ['basics'] });
  assert.ok(page.includes('<li>Usage examples · Example 1 · Example in Kasem: Use 300 characters or fewer.</li>'));
  assert.ok(page.includes('<a href="#tf-word">'));
});

/* -- Pages and per-page issues ---------------------------------------------------------- */

test('formPages: one page per visible section when paged, else a single page', () => {
  assert.deepEqual(formPages(synthetic, sampleAnswers).map((page) => page.sectionIds), [['basics'], ['media'], ['permissions']]);
  assert.deepEqual(formPages(synthetic, { kind: 'verb' }).map((page) => page.id), ['basics', 'permissions']);
  assert.equal(formPages(synthetic, {})[0].title, 'Basics');

  const oral = FORM_TEMPLATES.find((template) => template.id === 'oral_history').definition;
  assert.deepEqual(formPages(oral, { format: 'written' }).map((page) => page.id), ['story_section', 'written_section', 'context_section', 'permissions_section']);
  assert.deepEqual(formPages(oral, { format: 'both' }).map((page) => page.id), ['story_section', 'recording_section', 'written_section', 'context_section', 'permissions_section']);

  const single = FORM_TEMPLATES.find((template) => template.id === 'sentence_translation').definition;
  const pages = formPages(single, {});
  assert.equal(pages.length, 1);
  assert.deepEqual(pages[0].sectionIds, ['translation_section']);
  assert.equal(pages[0].title, single.title);
});

test('issuesForSections keeps the issues of the given sections only', () => {
  const word = FORM_TEMPLATES.find((template) => template.id === 'kasem_word_collection').definition;
  const { issues } = validateAnswers(word, {}, { mode: 'submit' });
  assert.ok(issues.length > 0);
  const first = issuesForSections(word, issues, ['word_section']);
  assert.ok(first.length > 0);
  assert.ok(first.every((issue) => ['word', 'meaning', 'dialect', 'part_of_speech'].includes(issue.path.split('.')[0])));
  const custom = [{ path: 'examples.0.example_kasem', message: 'a' }, { path: 'word', message: 'b' }, { path: 'unknown', message: 'c' }, { path: '', message: 'd' }, { path: 'pronunciation.0', message: 'e' }];
  assert.deepEqual(issuesForSections(word, custom, ['usage_section']).map((issue) => issue.message), ['a', 'e']);
  assert.deepEqual(issuesForSections(word, custom, []).length, 0);
});

/* -- FormResponseView and FormReviewSummary ---------------------------------------------- */

test('FormResponseView shows labels, display values, files, groups and consents', () => {
  const consents = consentRecords(synthetic, sampleAnswers).map((record) => ({ ...record, statement: `Stored wording ${KASEM}` }));
  const opened = [];
  const html = renderToString(h(FormResponseView, { definition: synthetic, answers: sampleAnswers, consents, onOpenAttachment: (file) => opened.push(file) }));
  for (const label of ['Kasem word', 'Kind of word', 'Where is it used?', 'Region', 'Language of the word', 'Kasem variety', 'Usage examples']) {
    assert.ok(html.includes(escapeHtml(label)), label);
  }
  assert.ok(html.includes(`>${KASEM}</span>`));
  assert.ok(html.includes(`${KASEM}\nsecond line ${DECOMPOSED}`), 'long text keeps its line breaks');
  assert.ok(html.includes('iwf-text--long'));
  assert.ok(!html.includes(DECOMPOSED.normalize('NFC')));
  assert.ok(html.includes('>Noun<'));
  assert.ok(html.includes('>At home, At the market<'));
  assert.ok(html.includes('>Upper East<'));
  assert.ok(html.includes('>Navrongo<'));
  assert.ok(html.includes('<time dateTime="2024-03-05">5 March 2024</time>'));
  // Attachments are buttons with name, type and size.
  assert.match(html, /<button type="button" class="iwf-file-link"><span class="iwf-file-link__name">field-notes\.pdf<\/span><span class="iwf-file-link__meta">PDF document · 200 KB<\/span><\/button>/);
  assert.ok(html.includes('example.mp3'));
  // Groups as nested lists.
  assert.ok(html.includes('<ol class="iwf-view-entries">'));
  assert.ok(html.includes('>Example 2</span>'));
  // Consent: the stored wording, not the current definition's.
  assert.ok(html.includes(`Stored wording ${KASEM}`));
  assert.ok(!html.includes('You can ask us to remove it later.'));
  assert.ok(html.includes('>Granted<'));
  assert.ok(html.includes('>Public sharing<'));
  // Empty questions read "No answer".
  assert.ok(html.includes('No answer'), 'photo and clip have no answer');
  assert.ok(!html.includes('Line one of the guidance'), 'instructions are not answers');
  assert.equal(opened.length, 0);
});

test('FormResponseView: declined consent, hidden sections, showEmpty and compareWith', () => {
  const declined = renderToString(h(FormResponseView, { definition: synthetic, answers: { ...sampleAnswers, consent_public: false, kind: 'verb' } }));
  assert.ok(declined.includes('>Not granted<'));
  assert.ok(!declined.includes('data-section-id="media"'));
  assert.ok(declined.includes('<span class="iwf-file-link iwf-file-link--static">') === false, 'files are hidden with their section');

  const sparse = renderToString(h(FormResponseView, { definition: synthetic, answers: { word: KASEM }, showEmpty: false }));
  assert.ok(!sparse.includes('No answer'));
  assert.ok(sparse.includes(KASEM));

  const before = { ...sampleAnswers, word: 'older spelling', uses: ['home'] };
  const compared = renderToString(h(FormResponseView, { definition: synthetic, answers: sampleAnswers, compareWith: before }));
  assert.ok(compared.includes('2 answers changed since the earlier revision.'));
  assert.equal(count(compared, '<span class="iwf-changed">Changed</span>'), 2);
  assert.ok(compared.includes('older spelling'));
  assert.ok(compared.includes('Previous answer'));
  const same = renderToString(h(FormResponseView, { definition: synthetic, answers: sampleAnswers, compareWith: sampleAnswers }));
  assert.ok(same.includes('No answers changed since the earlier revision.'));
});

test('FormReviewSummary groups answers by visible section with Edit buttons and issues', () => {
  const html = renderToString(h(FormReviewSummary, {
    definition: synthetic,
    answers: sampleAnswers,
    onEdit: noop,
    issues: [{ path: 'examples.1.example_kasem', message: 'Use at least 3 characters.' }, { path: 'stale_key', message: 'Unknown answer.' }],
  }));
  assert.equal(count(html, 'class="ts-btn ts-btn--secondary ts-btn--sm iwf-review__edit"'), 3);
  assert.ok(html.includes('Edit<span class="ts-sr"> Media and examples</span>'));
  assert.ok(html.includes('Use at least 3 characters.'));
  assert.ok(html.includes('<li>Unknown answer.</li>'));
  assert.ok(html.includes('1 to fix'));
  assert.ok(html.includes(KASEM));
  const verb = renderToString(h(FormReviewSummary, { definition: synthetic, answers: { ...sampleAnswers, kind: 'verb' }, onEdit: noop }));
  assert.equal(count(verb, 'iwf-review__edit'), 2);
});

/* -- Templates ------------------------------------------------------------------------------ */

for (const template of FORM_TEMPLATES) {
  test(`template "${template.id}" renders in FormRenderer and FormResponseView`, () => {
    const { definition, issues } = validateDefinition(template.definition, { forPublish: true });
    assert.deepEqual(issues, [], 'templates are publishable');
    deepFreeze(definition);
    const answers = deepFreeze(defaultAnswers(definition));
    const visibility = computeVisibility(definition, answers);
    const html = renderToString(h(FormRenderer, { definition, answers, onChange: neverCalled }));
    const preview = renderToString(h(FormRenderer, { definition, answers, onChange: neverCalled, mode: 'preview' }));
    const view = renderToString(h(FormResponseView, { definition, answers }));
    const summary = renderToString(h(FormReviewSummary, { definition, answers, onEdit: noop }));
    for (const section of definition.sections) {
      const shown = visibility.sections[section.id];
      assert.equal(html.includes(`data-section-id="${section.id}"`), shown, `section ${section.id}`);
      assert.equal(view.includes(`data-section-id="${section.id}"`), shown, `viewed section ${section.id}`);
      if (shown && section.title) assert.ok(html.includes(escapeHtml(section.title)));
      for (const field of section.fields) {
        const visible = shown && visibility.fields[field.id];
        assert.equal(html.includes(`data-field-id="${field.id}"`), visible, `question ${field.id}`);
        if (visible && field.label) {
          assert.ok(html.includes(escapeHtml(field.label)), `label ${field.id}`);
          assert.ok(preview.includes(escapeHtml(field.label)), `preview label ${field.id}`);
          if (FIELD_TYPES[field.type].collects) assert.ok(view.includes(escapeHtml(field.label)), `viewed label ${field.id}`);
        }
      }
    }
    assert.ok(summary.includes('iwf-review__edit'));
  });
}
