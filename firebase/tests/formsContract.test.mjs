import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FORM_TEMPLATES, audienceMatches, computeVisibility, csvCell, emptyDefinition, referenceIdFrom, responsesToCsv,
  responsesToJson, submissionWindow, validateAnswers, validateDefinition, versionCompatibilityIssues,
} from '../../packages/contracts/forms.mjs';

/**
 * Indigen Forms shared engine (packages/contracts/forms.mjs): the same code
 * validates definitions and answers in the browser and on the server, so these
 * tests pin the behaviour the backend relies on.
 */

const form = (fields, extra = {}) => ({
  ...emptyDefinition(),
  title: 'Synthetic test form',
  sections: [{ id: 'main', title: '', description: '', visibleWhen: null, fields }],
  ...extra,
});
const text = (id, extra = {}) => ({ id, type: 'short_text', label: `Question ${id}`, required: false, settings: { maxLength: 300 }, ...extra });
const choice = (id, options, extra = {}) => ({ id, type: 'single_choice', label: `Choose ${id}`, required: false, settings: { options: options.map((o) => ({ id: o, label: o.toUpperCase() })) }, ...extra });
const when = (fieldId, operator, value) => ({ match: 'all', conditions: [{ fieldId, operator, ...(value === undefined ? {} : { value }) }] });
const paths = (issues) => issues.map((issue) => issue.path);
const bytes = (value) => Buffer.from(value, 'utf8');

test('definitions: answer keys must be well-formed and unique', () => {
  const { definition, issues } = validateDefinition(form([text('Bad-Key'), text('word'), text('word')]));
  assert.ok(paths(issues).includes('sections.0.fields.0.id'));
  assert.ok(issues.some((issue) => issue.path === 'sections.0.fields.2.id' && /used twice/.test(issue.message)));
  assert.deepEqual(definition.sections[0].fields.map((field) => field.id), ['word']);
  const sections = validateDefinition({ ...form([]), sections: [{ id: 'a', fields: [] }, { id: 'a', fields: [] }] });
  assert.ok(sections.issues.some((issue) => /Section id a is used twice/.test(issue.message)));
  assert.ok(validateDefinition({ ...form([text('word')]), sections: [] }).issues.some((issue) => issue.path === 'sections'));
  assert.equal(validateDefinition('not an object').definition, null);
});

test('definitions: conditions only look backwards, never at themselves, and use operators that fit', () => {
  const forward = validateDefinition(form([text('first', { visibleWhen: when('second', 'answered') }), text('second')]));
  assert.ok(forward.issues.some((issue) => /comes later/.test(issue.message)));
  assert.equal(forward.definition.sections[0].fields[0].visibleWhen, null, 'a forward reference is removed, never kept');
  const self = validateDefinition(form([text('own', { visibleWhen: when('own', 'answered') })]));
  assert.ok(self.issues.some((issue) => /cannot depend on itself/.test(issue.message)));
  const missing = validateDefinition(form([text('a', { visibleWhen: when('ghost', 'answered') })]));
  assert.ok(missing.issues.some((issue) => /does not exist/.test(issue.message)));
  const operator = validateDefinition(form([choice('pick', ['yes', 'no']), text('b', { visibleWhen: when('pick', 'greater_than', 3) })]));
  assert.ok(paths(operator.issues).includes('sections.0.fields.1.visibleWhen.conditions.0.operator'));
  const value = validateDefinition(form([choice('pick', ['yes', 'no']), text('b', { visibleWhen: when('pick', 'equals', 'maybe') })]));
  assert.ok(paths(value.issues).includes('sections.0.fields.1.visibleWhen.conditions.0.value'));
  const numeric = validateDefinition(form([{ id: 'age', type: 'number', label: 'Age', settings: {} }, text('b', { visibleWhen: when('age', 'greater_than', 'ten') })]));
  assert.ok(numeric.issues.some((issue) => /number to compare/.test(issue.message)));
  const sectionForward = validateDefinition({
    ...form([]),
    sections: [
      { id: 'one', title: 'One', visibleWhen: when('later', 'answered'), fields: [text('a')] },
      { id: 'two', title: 'Two', fields: [text('later')] },
    ],
  });
  assert.ok(sectionForward.issues.some((issue) => issue.path === 'sections.0.visibleWhen.conditions.0'));
  const ok = validateDefinition(form([choice('pick', ['yes', 'no']), text('b', { visibleWhen: when('pick', 'equals', 'yes') })]));
  assert.deepEqual(ok.issues, []);
});

test('definitions: destination mapping is checked against real questions and types', () => {
  const mapped = validateDefinition(form([text('word'), { id: 'count', type: 'number', label: 'Count', settings: {} }], {
    destination: { type: 'dictionary_candidate', mapping: { headword: 'ghost', meaning: 'count', nonsense: 'word' } },
  }));
  const messages = mapped.issues.map((issue) => issue.message).join('\n');
  assert.match(messages, /mapped to a question that does not exist/);
  assert.match(messages, /cannot take a number answer/);
  assert.match(messages, /has no “nonsense” field/);
  assert.deepEqual(mapped.definition.destination.mapping, {});
  const unpublishable = validateDefinition(form([text('word'), text('meaning')], {
    destination: { type: 'dictionary_candidate', mapping: { headword: 'word' } },
  }), { forPublish: true });
  assert.ok(unpublishable.issues.some((issue) => issue.path === 'destination.mapping.meaning'));
  assert.ok(unpublishable.issues.some((issue) => /needs a consent question/.test(issue.message)), 'routing needs the destination’s consent');
});

test('definitions: publish-only checks and review/points coherence', () => {
  const noInputs = validateDefinition(form([{ id: 'intro', type: 'instruction', label: '', settings: { body: 'Read this.' } }]), { forPublish: true });
  assert.ok(noInputs.issues.some((issue) => /at least one question that collects/.test(issue.message)));
  assert.deepEqual(validateDefinition(form([{ id: 'intro', type: 'instruction', label: '', settings: { body: 'Read this.' } }])).issues, [], 'drafts may be incomplete');
  const past = validateDefinition(form([text('a')], { schedule: { opensAt: null, closesAt: '2020-01-01T00:00:00Z' } }), { forPublish: true });
  assert.ok(past.issues.some((issue) => issue.path === 'schedule.closesAt'));
  const order = validateDefinition(form([text('a')], { schedule: { opensAt: '2030-02-01T00:00:00Z', closesAt: '2030-01-01T00:00:00Z' } }));
  assert.ok(order.issues.some((issue) => /after the opening date/.test(issue.message)));
  const audience = validateDefinition(form([text('a')], { audience: { mode: 'groups', dialectIds: [], contributionTypes: [], cohortIds: [] } }), { forPublish: true });
  assert.ok(audience.issues.some((issue) => issue.path === 'audience'));
  const points = validateDefinition(form([text('a')], { review: { required: false, reviewerGroup: 'reviewers', instructions: '', checks: [{ id: 'ok', label: 'OK' }], points: 5 } }));
  assert.ok(points.issues.some((issue) => issue.path === 'review.points'));
  assert.ok(points.issues.some((issue) => issue.path === 'review.checks'));
  const tooMany = validateDefinition(form([text('a')], { review: { required: true, reviewerGroup: 'reviewers', instructions: '', checks: [], points: 1000 } }));
  assert.ok(tooMany.issues.some((issue) => issue.path === 'review.points'));
  const routed = validateDefinition(form([text('a')], { review: { required: false }, destination: { type: 'translation_review', mapping: {} } }));
  assert.ok(routed.issues.some((issue) => issue.path === 'destination.type'));
  const uploadsOff = validateDefinition(form([{ id: 'file', type: 'file', label: 'File', settings: {} }], { submission: { allowAttachments: false } }));
  assert.ok(uploadsOff.issues.some((issue) => issue.path === 'submission.allowAttachments'));
  const consentWording = validateDefinition(form([{ id: 'c', type: 'consent', label: 'Permission', settings: { consentPurpose: 'review', statement: '' } }]));
  assert.ok(consentWording.issues.some((issue) => /Consent wording is required/.test(issue.message)));
  const unknownPurpose = validateDefinition(form([{ id: 'c', type: 'consent', label: 'Permission', settings: { consentPurpose: 'sell', statement: 'Yes' } }]));
  assert.ok(unknownPurpose.issues.some((issue) => /what this consent permits/.test(issue.message)));
});

test('definitions keep labels exactly as typed apart from surrounding whitespace', () => {
  const label = '  test-ɩ́ɔ̀ test-ʋ̀ʋ́ wordt  ';
  const { definition } = validateDefinition(form([text('a', { label })], { title: '  Test-ɩ: test-ʋ̀ʋ́  ' }));
  assert.ok(bytes(definition.sections[0].fields[0].label).equals(bytes(label.trim())));
  assert.ok(bytes(definition.title).equals(bytes('Test-ɩ: test-ʋ̀ʋ́')));
});

test('every starter template is publishable as it stands', () => {
  assert.ok(FORM_TEMPLATES.length >= 5);
  for (const template of FORM_TEMPLATES) {
    const { definition, issues } = validateDefinition(structuredClone(template.definition), { forPublish: true });
    assert.deepEqual(issues, [], `${template.id}: ${JSON.stringify(issues)}`);
    assert.equal(definition.title, template.definition.title);
  }
});

/* -- Answers ----------------------------------------------------------------------------------------- */

const conditional = form([
  choice('has_source', ['yes', 'no'], { required: true }),
  text('source', { visibleWhen: when('has_source', 'equals', 'yes'), requiredWhen: when('has_source', 'equals', 'yes') }),
  text('follow_up', { visibleWhen: when('source', 'answered') }),
  text('why_not', { requiredWhen: when('has_source', 'equals', 'no') }),
]);

test('visibility: hidden answers are dropped on submit, kept on draft, and chains collapse', () => {
  const input = { has_source: 'no', source: 'A hidden answer', follow_up: 'Also hidden', why_not: 'Oral tradition' };
  const submitted = validateAnswers(conditional, input, { mode: 'submit' });
  assert.deepEqual(submitted.issues, []);
  assert.deepEqual(submitted.answers, { has_source: 'no', why_not: 'Oral tradition' });
  const draft = validateAnswers(conditional, input, { mode: 'draft' });
  assert.equal(draft.answers.source, 'A hidden answer', 'toggling the choice back restores the draft answer');
  const visibility = computeVisibility(conditional, input);
  assert.equal(visibility.fields.source, false);
  assert.equal(visibility.fields.follow_up, false, 'a question depending on a hidden question is hidden too');
  assert.equal(visibility.required.why_not, true);
});

test('required and requiredWhen are enforced on submit only', () => {
  const missing = validateAnswers(conditional, { has_source: 'yes' }, { mode: 'submit' });
  assert.deepEqual(paths(missing.issues), ['source']);
  assert.deepEqual(validateAnswers(conditional, { has_source: 'yes' }, { mode: 'draft' }).issues, []);
  const whyNot = validateAnswers(conditional, { has_source: 'no' }, { mode: 'submit' });
  assert.deepEqual(paths(whyNot.issues), ['why_not']);
  assert.deepEqual(paths(validateAnswers(conditional, {}, { mode: 'submit' }).issues), ['has_source']);
  const consent = form([{ id: 'c', type: 'consent', label: 'Permission', required: true, settings: { consentPurpose: 'review', statement: 'I agree.' } }]);
  assert.deepEqual(paths(validateAnswers(consent, { c: false }, { mode: 'submit' }).issues), ['c']);
  assert.deepEqual(validateAnswers(consent, { c: true }, { mode: 'submit' }).issues, []);
});

test('unknown answer keys and display items are refused in both modes', () => {
  const definition = form([text('a'), { id: 'intro', type: 'instruction', label: '', settings: { body: 'Read.' } }]);
  for (const mode of ['draft', 'submit']) {
    const result = validateAnswers(definition, { a: 'x', status: 'approved', intro: 'x' }, { mode });
    assert.deepEqual(result.answers, { a: 'x' });
    assert.ok(paths(result.issues).includes('status'));
    assert.ok(paths(result.issues).includes('intro'));
  }
  assert.deepEqual(paths(validateAnswers(definition, ['a'], { mode: 'draft' }).issues), ['']);
  const choiceForm = form([choice('pick', ['yes', 'no'])]);
  assert.deepEqual(paths(validateAnswers(choiceForm, { pick: 'maybe' }, { mode: 'draft' }).issues), ['pick']);
});

test('repeatable groups: entries, sub-question rules and unknown sub-keys', () => {
  const definition = form([{
    id: 'examples', type: 'group', label: 'Examples', required: true, settings: { minItems: 1, maxItems: 2, itemLabel: 'Example' },
    fields: [text('kasem', { required: true }), text('english')],
  }]);
  assert.deepEqual(paths(validateAnswers(definition, { examples: [] }, { mode: 'submit' }).issues), ['examples']);
  const missingSub = validateAnswers(definition, { examples: [{ english: 'Only English' }] }, { mode: 'submit' });
  assert.deepEqual(paths(missingSub.issues), ['examples.0.kasem']);
  const unknown = validateAnswers(definition, { examples: [{ kasem: 'test-ʋ̀ʋ́', extra: 'x' }] }, { mode: 'submit' });
  assert.ok(paths(unknown.issues).includes('examples.0.extra'));
  const tooMany = validateAnswers(definition, { examples: [{ kasem: 'a' }, { kasem: 'b' }, { kasem: 'c' }] }, { mode: 'submit' });
  assert.ok(paths(tooMany.issues).includes('examples'));
  const ok = validateAnswers(definition, { examples: [{ kasem: ' test-ʋ̀ʋ́ ', english: 'Thing' }] }, { mode: 'submit' });
  assert.deepEqual(ok.issues, []);
  assert.deepEqual(ok.answers.examples, [{ kasem: 'test-ʋ̀ʋ́', english: 'Thing' }]);
  assert.deepEqual(paths(validateAnswers(definition, { examples: [{ kasem: 'a' }, { kasem: '' }] }, { mode: 'submit' }).issues), ['examples.1.kasem'], 'a blank entry still owes its required sub-question');
  const optional = form([{ id: 'alts', type: 'group', label: 'Alternatives', settings: { minItems: 0, maxItems: 3 }, fields: [text('alt')] }]);
  const dropped = validateAnswers(optional, { alts: [{ alt: 'one' }, { alt: '' }] }, { mode: 'submit' });
  assert.deepEqual(dropped.answers.alts, [{ alt: 'one' }], 'empty entries are dropped on submit');});

test('uploads: answers carry only id, name, type and size within the question’s limits', () => {
  const definition = form([{ id: 'photo', type: 'image', label: 'Photo', settings: { formats: ['png'], maxSizeMb: 1, maxFiles: 1 } }]);
  const good = { id: 'upload_1234', name: 'scan.png', contentType: 'image/png', size: 2048, url: 'https://evil.example/x' };
  const ok = validateAnswers(definition, { photo: [good] }, { mode: 'submit' });
  assert.deepEqual(ok.issues, []);
  assert.deepEqual(ok.answers.photo, [{ id: 'upload_1234', name: 'scan.png', contentType: 'image/png', size: 2048 }], 'extra properties such as links are never kept');
  const wrongType = validateAnswers(definition, { photo: [{ ...good, contentType: 'image/jpeg' }] }, { mode: 'submit' });
  assert.ok(wrongType.issues.some((issue) => /not an allowed format/.test(issue.message)));
  const tooBig = validateAnswers(definition, { photo: [{ ...good, size: 2 * 1024 * 1024 }] }, { mode: 'submit' });
  assert.ok(tooBig.issues.some((issue) => /larger than 1 MB/.test(issue.message)));
  const malformed = validateAnswers(definition, { photo: [{ ...good, id: '../../etc' }] }, { mode: 'submit' });
  assert.ok(malformed.issues.some((issue) => /malformed/.test(issue.message)));
  const tooMany = validateAnswers(definition, { photo: [good, { ...good, id: 'upload_5678' }] }, { mode: 'submit' });
  assert.ok(tooMany.issues.some((issue) => /at most/.test(issue.message)));
  const required = form([{ id: 'photo', type: 'image', label: 'Photo', required: true, settings: { formats: ['png'] } }]);
  assert.deepEqual(paths(validateAnswers(required, {}, { mode: 'submit' }).issues), ['photo']);
});

test('Kasem tone marks and combining characters stay byte-identical', () => {
  const definition = form([text('word'), { id: 'story', type: 'long_text', label: 'Story', settings: { maxLength: 5000 } }, {
    id: 'examples', type: 'group', label: 'Examples', settings: { minItems: 0, maxItems: 3 }, fields: [text('kasem')],
  }]);
  const samples = ['test-ʋ̀ʋ́', 'test-ɩ́ɔ̀', 'à́', 'é', 'é', 'test-ɔ́ŋɔ̀ test-ŋwa', 'test-ɩm̃'];
  for (const sample of samples) {
    for (const mode of ['draft', 'submit']) {
      const { answers, issues } = validateAnswers(definition, { word: `  ${sample}\t`, story: `${sample}\n${sample}`, examples: [{ kasem: sample }] }, { mode });
      assert.deepEqual(issues, []);
      assert.ok(bytes(answers.word).equals(bytes(sample)), `${mode}: ${JSON.stringify(sample)} kept exactly`);
      assert.ok(bytes(answers.story).equals(bytes(`${sample}\n${sample}`)));
      assert.ok(bytes(answers.examples[0].kasem).equals(bytes(sample)));
    }
  }
  // Conditions compare canonically (NFC) but never rewrite what was stored.
  const compared = form([text('word'), text('note', { visibleWhen: when('word', 'equals', 'é') })]);
  const result = validateAnswers(compared, { word: 'é', note: 'shown' }, { mode: 'submit' });
  assert.equal(result.answers.note, 'shown');
  assert.ok(bytes(result.answers.word).equals(bytes('é')));
});

/* -- Export ------------------------------------------------------------------------------------------ */

test('CSV cells are quoted and spreadsheet formulas neutralised', () => {
  assert.equal(csvCell('=SUM(A1:A9)'), `"'=SUM(A1:A9)"`);
  assert.equal(csvCell('+233 20 000 0000'), `"'+233 20 000 0000"`);
  assert.equal(csvCell('-1+1'), `"'-1+1"`);
  assert.equal(csvCell('@cmd'), `"'@cmd"`);
  assert.equal(csvCell('\tTabbed'), `"'\tTabbed"`);
  assert.equal(csvCell('\rReturn'), `"'\rReturn"`);
  assert.equal(csvCell('She said "test-ʋ̀ʋ́", twice'), '"She said ""test-ʋ̀ʋ́"", twice"');
  assert.equal(csvCell('line one\nline two'), '"line one\nline two"');
  assert.equal(csvCell(42), '42');
  assert.equal(csvCell(-3), '-3', 'numbers stay numbers');
  assert.equal(csvCell(true), 'true');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(undefined), '');
});

const v1 = validateDefinition(form([
  text('word'),
  text('old_note'),
  { id: 'tags', type: 'multiple_choice', label: 'Tags', settings: { options: [{ id: 'food', label: 'Food' }, { id: 'farm', label: 'Farming' }] } },
  { id: 'recording', type: 'audio', label: 'Recording', settings: { formats: ['mp3'] } },
  { id: 'consent_public', type: 'consent', label: 'Permission', settings: { consentPurpose: 'public', statement: 'May be published.' } },
])).definition;
const v2 = validateDefinition(form([
  text('word'),
  { id: 'examples', type: 'group', label: 'Examples', settings: { minItems: 0, maxItems: 3 }, fields: [text('kasem')] },
  { id: 'tags', type: 'multiple_choice', label: 'Tags', settings: { options: [{ id: 'food', label: 'Food' }, { id: 'farm', label: 'Farming' }] } },
  { id: 'consent_public', type: 'consent', label: 'Permission', settings: { consentPurpose: 'public', statement: 'May be published.' } },
])).definition;
const exported = [
  {
    id: 'resp_one', referenceId: 'IWF-AAAA-BBBB', formId: 'form_x', formVersion: 1, revision: 1, status: 'approved', contributorId: 'uid-one',
    submittedAt: '2026-10-01T10:00:00.000Z', decidedAt: '2026-10-02T10:00:00.000Z',
    answers: { word: 'test-ʋ̀ʋ́', old_note: '=HYPERLINK("http://x")', tags: ['food', 'farm'], recording: [{ id: 'up_123456789', name: 'word.mp3', contentType: 'audio/mpeg', size: 10 }], consent_public: true },
    consents: [{ fieldId: 'consent_public', purpose: 'public', statement: 'May be published.', granted: true }],
  },
  {
    id: 'resp_two', referenceId: 'IWF-CCCC-DDDD', formId: 'form_x', formVersion: 2, revision: 2, status: 'submitted', contributorId: 'uid-two',
    submittedAt: '2026-10-03T10:00:00.000Z', decidedAt: null,
    answers: { word: 'test-ɩ́ɔ̀', examples: [{ kasem: 'test-ɔ́ŋɔ̀' }], consent_public: false },
    consents: [{ fieldId: 'consent_public', purpose: 'public', statement: 'May be published.', granted: false }],
  },
];

test('CSV export spans versions with stable keys, including a key a later version removed', () => {
  const csv = responsesToCsv([{ version: 1, definition: v1 }, { version: 2, definition: v2 }], exported);
  assert.ok(csv.startsWith('﻿'), 'UTF-8 BOM for spreadsheets');
  const lines = csv.slice(1).split('\r\n');
  assert.equal(lines.at(-1), '', 'CRLF line endings, trailing newline');
  const header = lines[0].split(',').map((cell) => cell.replace(/^"|"$/g, ''));
  assert.deepEqual(header.slice(0, 10), ['reference_id', 'response_id', 'form_id', 'form_version', 'revision', 'status', 'contributor_id', 'submitted_at', 'decided_at', 'granted_permissions']);
  assert.deepEqual(header.slice(10), ['word', 'examples', 'tags', 'consent_public', 'old_note', 'recording'], 'newest version first, then keys only earlier versions had');
  assert.match(lines[1], /^"IWF-AAAA-BBBB","resp_one","form_x",1,1,"approved","uid-one"/);
  assert.ok(lines[1].includes(`"'=HYPERLINK(""http://x"")"`), 'formula neutralised and quotes doubled');
  assert.ok(lines[1].includes('"food; farm"'));
  assert.ok(lines[1].includes('"up_123456789:word.mp3"'), 'uploads export id:name, never links');
  assert.ok(lines[1].includes('"test-ʋ̀ʋ́"'));
  assert.ok(lines[1].includes('"public"'));
  assert.match(lines[2], /^"IWF-CCCC-DDDD","resp_two","form_x",2,2,"submitted","uid-two","2026-10-03T10:00:00.000Z","",""/);
  assert.ok(lines[2].includes('"[{""kasem"":""test-ɔ́ŋɔ̀""}]"'), 'groups export JSON keyed by sub-question');
  assert.ok(lines[2].endsWith(',false,"",""'), 'the removed v1 keys are empty for a v2 response');
  assert.ok(bytes(csv).includes(bytes('test-ɩ́ɔ̀')));
});

test('JSON export carries every version’s definition and the answers exactly', () => {
  const json = JSON.parse(responsesToJson({ id: 'form_x', title: 'Words' }, [{ version: 2, definition: v2 }, { version: 1, definition: v1 }], exported, { scope: 'submitted', count: 2 }));
  assert.equal(json.format, 'indigen-forms-export');
  assert.equal(json.scope, 'submitted');
  assert.deepEqual(json.versions.map((item) => item.version), [1, 2]);
  assert.equal(json.versions[0].definition.sections[0].fields[1].id, 'old_note');
  assert.equal(json.responses[1].answers.word, 'test-ɩ́ɔ̀');
  assert.deepEqual(json.responses[0].answers.tags, ['food', 'farm']);
  assert.equal(json.responses[0].contributorId, 'uid-one');
  assert.equal(JSON.stringify(json).includes('@'), false, 'no email addresses');
});

/* -- Versions, windows, audiences, references ---------------------------------------------------------- */

test('a published answer key never changes type in a later version', () => {
  const first = validateDefinition(form([text('word'), { id: 'g', type: 'group', label: 'G', settings: {}, fields: [text('sub')] }])).definition;
  const retyped = validateDefinition(form([{ id: 'word', type: 'long_text', label: 'Word', settings: {} }])).definition;
  assert.equal(versionCompatibilityIssues([first], retyped).length, 1);
  const renamed = validateDefinition(form([text('word', { label: 'A new label' }), text('word_2')])).definition;
  assert.deepEqual(versionCompatibilityIssues([first], renamed), [], 'labels change freely; keys may be added or removed');
  const subRetyped = validateDefinition(form([{ id: 'g', type: 'group', label: 'G', settings: {}, fields: [{ id: 'sub', type: 'number', label: 'Sub', settings: {} }] }])).definition;
  assert.equal(versionCompatibilityIssues([first], subRetyped).length, 1);
  const removedThenBack = validateDefinition(form([{ id: 'word', type: 'number', label: 'Word', settings: {} }])).definition;
  assert.equal(versionCompatibilityIssues([first, renamed], removedThenBack).length, 1, 'every earlier version counts, not just the latest');
});

test('submission windows', () => {
  const schedule = { opensAt: null, closesAt: null };
  const now = Date.parse('2026-10-25T12:00:00Z');
  const window = (formStatus, versionState = 'published', s = schedule) => submissionWindow({ formStatus, versionState, schedule: s, now });
  assert.deepEqual(window('published'), { open: true, reason: null, message: '' });
  assert.equal(window('paused').reason, 'paused');
  assert.equal(window('closed').reason, 'closed');
  assert.equal(window('archived').reason, 'archived');
  assert.equal(window('draft').reason, 'not_published');
  assert.equal(window('published', 'retired').reason, 'retired');
  assert.equal(window('published', 'draft').reason, 'not_published');
  assert.equal(window('published', 'published', { opensAt: '2026-11-01T00:00:00Z', closesAt: null }).reason, 'not_yet_open');
  assert.equal(window('published', 'published', { opensAt: null, closesAt: '2026-10-25T12:00:00Z' }).reason, 'past_deadline');
  assert.equal(window('published', 'published', { opensAt: '2026-10-01T00:00:00Z', closesAt: '2026-10-26T00:00:00Z' }).open, true);
});

test('audiences match on profile variety, contribution types or cohorts', () => {
  const everyone = { mode: 'all_contributors', dialectIds: ['paga'], contributionTypes: [], cohortIds: [] };
  assert.equal(audienceMatches(everyone, null), true);
  const navrongo = { mode: 'groups', dialectIds: ['navrongo'], contributionTypes: [], cohortIds: [] };
  assert.equal(audienceMatches(navrongo, { dialect: 'Navrongo' }), true, 'profile labels map to dialect ids');
  assert.equal(audienceMatches(navrongo, { dialect: 'navrongo' }), true);
  assert.equal(audienceMatches(navrongo, { dialect: 'Paga' }), false);
  assert.equal(audienceMatches(navrongo, null), false);
  const typed = { mode: 'groups', dialectIds: [], contributionTypes: ['audio'], cohortIds: ['elders'] };
  assert.equal(audienceMatches(typed, { contributionTypes: ['stories', 'audio'] }), true);
  assert.equal(audienceMatches(typed, { cohortIds: ['elders'] }), true);
  assert.equal(audienceMatches(typed, { contributionTypes: ['stories'], cohortIds: ['youth'] }), false);
});

test('the 150-question limit counts a group’s sub-questions once', () => {
  const group = { id: 'entries', type: 'group', label: 'Entries', settings: { minItems: 0, maxItems: 5 }, fields: Array.from({ length: 20 }, (_, i) => text(`sub_${i}`)) };
  const many = (count) => Array.from({ length: count }, (_, i) => text(`q_${i}`));
  // 1 group + 20 sub-questions + 110 questions = 131 questions.
  const fits = validateDefinition(form([group, ...many(110)]), { forPublish: true });
  assert.equal(fits.issues.some((issue) => /150 questions or fewer/.test(issue.message)), false);
  assert.deepEqual(fits.issues, []);
  // 1 + 20 + 130 = 151.
  const over = validateDefinition(form([group, ...many(130)]), { forPublish: true });
  assert.ok(over.issues.some((issue) => issue.path === 'sections' && /150 questions or fewer/.test(issue.message)));
});

test('multiple-choice answers are kept in option order, whatever order they were ticked in', () => {
  const definition = form([{ id: 'kinds', type: 'multiple_choice', label: 'Kinds', settings: { options: [{ id: 'stories', label: 'Stories' }, { id: 'audio', label: 'Audio' }, { id: 'songs', label: 'Songs' }] } }]);
  for (const mode of ['draft', 'submit']) {
    assert.deepEqual(validateAnswers(definition, { kinds: ['songs', 'stories'] }, { mode }).answers.kinds, ['stories', 'songs']);
    assert.deepEqual(validateAnswers(definition, { kinds: ['stories', 'songs', 'stories'] }, { mode }).answers.kinds, ['stories', 'songs']);
  }
});

test('an empty repeatable-group entry is no answer for conditions, as it is no answer once stored', () => {
  const definition = form([
    { id: 'examples', type: 'group', label: 'Examples', settings: { minItems: 0, maxItems: 3 }, fields: [text('example')] },
    text('why_none', { required: true, visibleWhen: when('examples', 'not_answered') }),
  ]);
  for (const examples of [[{}], [{ example: '   ' }], [{}, { example: '' }]]) {
    const result = validateAnswers(definition, { examples }, { mode: 'submit' });
    assert.deepEqual(paths(result.issues), ['why_none'], `entries ${JSON.stringify(examples)} still need a reason`);
    assert.deepEqual(result.answers, {});
    assert.equal(computeVisibility(definition, { examples }).required.why_none, true);
  }
  const filled = validateAnswers(definition, { examples: [{}, { example: 'test-ɔ́' }] }, { mode: 'submit' });
  assert.deepEqual(filled.issues, []);
  assert.deepEqual(filled.answers, { examples: [{ example: 'test-ɔ́' }] });
  assert.equal(computeVisibility(definition, { examples: [{ example: 'test-ɔ́' }] }).fields.why_none, false);
  // The stored answers lead to the same result when viewed again.
  assert.equal(computeVisibility(definition, filled.answers).fields.why_none, false);
});

test('reference ids are IWF-XXXX-XXXX in Crockford base32', () => {
  assert.equal(referenceIdFrom(new Uint8Array([0, 0, 0, 0, 0])), 'IWF-0000-0000');
  assert.equal(referenceIdFrom(new Uint8Array([255, 255, 255, 255, 255])), 'IWF-ZZZZ-ZZZZ');
  assert.equal(referenceIdFrom(new Uint8Array([1, 2, 3, 4, 5])), referenceIdFrom(new Uint8Array([1, 2, 3, 4, 5])));
  for (let i = 0; i < 200; i += 1) {
    assert.match(referenceIdFrom(crypto.getRandomValues(new Uint8Array(5))), /^IWF-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
  }
});
