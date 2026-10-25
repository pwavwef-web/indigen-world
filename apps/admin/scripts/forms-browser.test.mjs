// Indigen Forms admin screens in a real browser, offline.
//
//   npm run build:console-ui   # once, the screens import the built renderer
//   node apps/admin/scripts/forms-browser.test.mjs   # from the repository root
//
// esbuild bundles the four Forms screens (dashboard, builder, responses,
// settings) with the console's router, dialogs and TribeStudio CSS. The
// Firebase client is replaced by an in-memory backend that follows
// packages/contracts/forms-api.d.ts and uses the shared contract for
// validation, templates, publishing summaries and CSV export, and records
// every request in window.__forms.calls. Headless Edge (or Chrome) drives it
// through playwright-core. Nothing leaves the machine; all data is synthetic.

import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const root = resolve(import.meta.dirname, '../../..');
const { build } = createRequire(join(root, 'services/functions/package.json'))('esbuild');
const out = join(root, '.tooling/forms/browser');
await mkdir(out, { recursive: true });

const browserPath = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/microsoft-edge',
  '/usr/bin/google-chrome',
].find((path) => existsSync(path));
if (!browserPath) {
  console.log('SKIP: no Edge or Chrome found for the Forms browser check.');
  process.exit(0);
}

/* -- The offline backend (runs in the page) ------------------------------------------- */

function installFormsBackend(contract) {
  const {
    FORM_TEMPLATES, emptyDefinition, validateDefinition, publishSummary, audienceText,
    consentRecords, grantedPurposes, responsesToCsv, responsesToJson, REVIEW_DECISIONS, allFieldIds, findField,
  } = contract;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const iso = (offsetMinutes = 0) => new Date(Date.UTC(2026, 9, 20, 9, 0) + offsetMinutes * 60_000).toISOString();
  let clock = 0;
  const now = () => iso(600 + (clock += 1));
  const fail = (code, message, details) => Object.assign(new Error(message), { code: `functions/${code}`, details });
  const calls = [];
  const access = {
    canManage: true, canPublish: true, canExport: true, canReview: true, canConfigureAccess: false,
    publishers: [], exporters: [], rewards: { enabled: true, maxPointsPerResponse: 20, dailyCap: 60 }, canEditRewards: false,
  };
  const cohorts = [{ id: 'paga_workshop', name: 'Paga workshop (synthetic)', description: 'Fixture cohort for the browser check.', memberCount: 2, updatedAt: iso(), members: [{ uid: 'fixture-contributor-a', name: 'Fixture Contributor A', email: 'a@example.test' }, { uid: 'fixture-contributor-b', name: 'Fixture Contributor B', email: null }] }];
  let cohortLoadFailures = 0;
  const activity = [];
  const forms = new Map();
  const responses = new Map();
  const log = (action, form, summary) => activity.unshift({ id: `act_${activity.length + 1}`, action, actorName: 'Fixture Admin', formId: form?.id ?? null, formTitle: form?.title ?? null, summary, occurredAt: now() });

  function newForm(id, definition, extra = {}) {
    const form = {
      id, status: 'draft', currentVersion: null, draftVersion: 1, draftRevision: 1, publishedVersions: [], retiredVersions: [],
      createdAt: now(), updatedAt: now(), updatedByName: 'Fixture Admin', lastActivityAt: now(), templateId: null,
      versions: new Map([[1, { state: 'draft', definition, revision: 1, createdAt: now(), publishedAt: null, retiredAt: null }]]),
      ...extra,
    };
    forms.set(id, form);
    return form;
  }
  const latestDefinition = (form) => form.versions.get(form.draftVersion ?? form.currentVersion)?.definition ?? emptyDefinition();
  function counts(formId) {
    const out = { draft: 0, submitted: 0, under_review: 0, changes_requested: 0, approved: 0, rejected: 0 };
    let total = 0;
    for (const response of responses.values()) {
      if (response.formId !== formId) continue;
      out[response.status] += 1;
      if (response.status !== 'draft') total += 1;
    }
    return { out, total };
  }
  function summary(form) {
    const definition = latestDefinition(form);
    const current = form.currentVersion ? form.versions.get(form.currentVersion).definition : definition;
    const { out, total } = counts(form.id);
    return {
      id: form.id, title: definition.title, description: definition.description, category: definition.category,
      languageIds: definition.languageContext.languageIds, status: form.status, currentVersion: form.currentVersion,
      draftVersion: form.draftVersion, publishedVersions: [...form.publishedVersions], retiredVersions: [...form.retiredVersions],
      counts: out, totalSubmitted: total, audienceText: audienceText(current.audience, Object.fromEntries(cohorts.map((c) => [c.id, c.name]))),
      closesAt: current.schedule.closesAt, opensAt: current.schedule.opensAt, createdAt: form.createdAt, createdBy: 'fixture-admin',
      updatedAt: form.updatedAt, updatedByName: form.updatedByName, lastActivityAt: form.lastActivityAt, templateId: form.templateId,
    };
  }
  const versionMeta = (form) => [...form.versions.entries()].map(([version, item]) => ({
    version, state: item.state, createdAt: item.createdAt, createdBy: 'fixture-admin', publishedAt: item.publishedAt, publishedBy: item.publishedAt ? 'fixture-admin' : null,
    retiredAt: item.retiredAt, responses: [...responses.values()].filter((r) => r.formId === form.id && r.formVersion === version).length,
  }));
  const formOf = (formId) => {
    const form = forms.get(formId);
    if (!form) throw fail('not-found', 'This form does not exist.');
    return form;
  };

  // A published form with synthetic responses (one in Kasem with tone marks).
  const feedback = clone(FORM_TEMPLATES.find((t) => t.id === 'general_feedback').definition);
  feedback.title = 'Fixture feedback form';
  feedback.review.checks = [{ id: 'read', label: 'Read in full' }];
  const seeded = newForm('fx_feedback', feedback, { status: 'published', currentVersion: 1, draftVersion: null, draftRevision: 0, publishedVersions: [1] });
  seeded.versions.get(1).state = 'published';
  seeded.versions.get(1).publishedAt = iso(5);
  const kasem = 'test-ʋ̀ʋ́ test-ɩ́ɔ̀';
  const seed = [
    ['resp_a', 'IWF-7K2M-9QXA', 'submitted', 'website', 'The dictionary search is fast.', 1],
    ['resp_b', 'IWF-3H8D-2PZE', 'approved', 'dictionary', `Please add ${kasem} to the dictionary.`, 1],
    ['resp_c', 'IWF-5N4R-8WTB', 'changes_requested', 'app', '=SUM(A1) should never run in a spreadsheet', 2],
  ];
  seed.forEach(([id, referenceId, status, topic, text, revision], index) => {
    const answers = { topic, feedback: text };
    responses.set(id, {
      id, referenceId, formId: 'fx_feedback', formTitle: feedback.title, formVersion: 1, status, revision,
      contributorId: `fixturecontributor${index}abcdefgh`, contributorName: `Fixture Contributor ${'ABC'[index]}`, languageIds: ['english'], dialectIds: [],
      submittedAt: iso(30 + index * 60), updatedAt: iso(40 + index * 60), decidedAt: status === 'approved' || status === 'changes_requested' ? iso(50 + index * 60) : null,
      answers, grantedPurposes: [], attachmentCount: 0,
      revisions: Array.from({ length: revision }, (_, r) => ({ revision: r + 1, formVersion: 1, answers: r + 1 === revision ? answers : { topic, feedback: 'An earlier wording.' }, consents: [], submittedAt: iso(30 + index * 60 + r) })),
      history: [{ id: `${id}_h1`, type: 'submitted', actorName: `Fixture Contributor ${'ABC'[index]}`, actorRole: 'contributor', revision: 1, at: iso(30 + index * 60) }],
      feedback: status === 'changes_requested' ? 'Please describe where you saw this.' : null,
    });
  });
  log('forms.publish', { id: 'fx_feedback', title: feedback.title }, 'Published version 1 of Fixture feedback form');

  function responseSummary(response) {
    const { revisions, history, feedback: note, ...rest } = response;
    return rest;
  }
  function responseDetail(response) {
    const form = formOf(response.formId);
    const version = form.versions.get(response.formVersion);
    const definition = version.definition;
    const consents = consentRecords(definition, response.answers);
    const allowedDecisions = Object.entries(REVIEW_DECISIONS).filter(([, rule]) => rule.from.includes(response.status)).map(([decision]) => decision);
    return {
      ...responseSummary(response), definition, versionState: version.state, consents, attachments: [], feedback: response.feedback,
      revisions: response.revisions, history: response.history,
      reward: { points: 0, status: response.status === 'approved' ? 'not_applicable' : 'none', note: null },
      routing: { destination: definition.destination.type, status: 'not_applicable', targetCollection: null, targetId: null, note: null },
      allowedDecisions, expectedStatus: response.status, expectedRevision: response.revision,
    };
  }
  const filterRows = (filter = {}) => [...responses.values()].filter((r) => {
    if (r.status === 'draft') return false;
    if (filter.formId && r.formId !== filter.formId) return false;
    if (filter.version && r.formVersion !== filter.version) return false;
    if (filter.status && filter.status !== 'all_submitted' && r.status !== filter.status) return false;
    if (filter.languageId && !r.languageIds.includes(filter.languageId)) return false;
    if (filter.contributorId && r.contributorId !== filter.contributorId) return false;
    if (filter.from && (r.submittedAt ?? '').slice(0, 10) < filter.from) return false;
    if (filter.to && (r.submittedAt ?? '').slice(0, 10) > filter.to) return false;
    return true;
  });

  const admin = {
    overview: () => ({ forms: [...forms.values()].map(summary), access: clone(access), cohorts: clone(cohorts), recent: activity.slice(0, 8) }),
    get: ({ formId }) => {
      const form = formOf(formId);
      const draft = form.draftVersion ? form.versions.get(form.draftVersion) : null;
      const current = form.currentVersion ? form.versions.get(form.currentVersion) : null;
      return {
        form: summary(form), versions: versionMeta(form),
        draft: draft ? { version: form.draftVersion, revision: form.draftRevision, definition: clone(draft.definition), issues: validateDefinition(draft.definition).issues, updatedAt: form.updatedAt, updatedByName: form.updatedByName } : null,
        current: current ? { version: form.currentVersion, definition: clone(current.definition), publishedAt: current.publishedAt } : null,
      };
    },
    getVersion: ({ formId, version }) => {
      const item = formOf(formId).versions.get(version);
      if (!item) throw fail('not-found', 'No such version.');
      return { version, state: item.state, definition: clone(item.definition), publishedAt: item.publishedAt };
    },
    create: ({ templateId, title }) => {
      const template = FORM_TEMPLATES.find((item) => item.id === templateId);
      const definition = template ? clone(template.definition) : emptyDefinition();
      if (title) definition.title = title;
      const form = newForm(`fx_form_${forms.size + 1}`, definition, { templateId: template?.id ?? null });
      log('forms.create', { id: form.id, title: definition.title }, `Created ${definition.title || 'an untitled form'}`);
      return { formId: form.id };
    },
    duplicate: ({ formId }) => {
      const source = latestDefinition(formOf(formId));
      const definition = clone(source);
      definition.title = `${source.title} (copy)`;
      return { formId: newForm(`fx_form_${forms.size + 1}`, definition).id };
    },
    startDraft: ({ formId }) => {
      const form = formOf(formId);
      if (!form.draftVersion) {
        // As on the server: version numbers are never reused and revisions keep counting.
        const version = Math.max(...form.versions.keys()) + 1;
        form.draftRevision += 1;
        form.versions.set(version, { state: 'draft', definition: clone(form.versions.get(form.currentVersion).definition), revision: form.draftRevision, createdAt: now(), publishedAt: null, retiredAt: null });
        form.draftVersion = version;
      }
      return { version: form.draftVersion, revision: form.draftRevision };
    },
    saveDraft: ({ formId, definition, version, expectedRevision }) => {
      const form = formOf(formId);
      if (!form.draftVersion) throw fail('failed-precondition', 'There is no draft to save. Start a new draft first.', { reason: 'no-draft' });
      if (version !== form.draftVersion || expectedRevision !== form.draftRevision) throw fail('aborted', 'Fixture Colleague changed this draft.', { reason: 'conflict', version: form.draftVersion, revision: form.draftRevision, updatedByName: 'Fixture Colleague', updatedAt: form.updatedAt });
      const checked = validateDefinition(definition);
      // As on the server: a draft with problems is kept exactly as entered, so nothing is dropped.
      form.versions.get(form.draftVersion).definition = checked.issues.length ? clone(definition) : checked.definition;
      form.draftRevision += 1;
      form.updatedAt = now();
      form.lastActivityAt = form.updatedAt;
      log('forms.save_draft', { id: form.id, title: checked.definition.title }, `Saved draft ${form.draftVersion}`);
      return { revision: form.draftRevision, issues: checked.issues, updatedAt: form.updatedAt };
    },
    discardDraft: ({ formId, version, expectedRevision }) => {
      const form = formOf(formId);
      if (version !== form.draftVersion) throw fail('failed-precondition', 'This draft was published or discarded.', { reason: 'no-draft' });
      if (expectedRevision !== form.draftRevision) throw fail('aborted', 'Changed meanwhile.', { reason: 'conflict', version: form.draftVersion, revision: form.draftRevision, updatedByName: 'Fixture Colleague', updatedAt: form.updatedAt });
      form.versions.delete(form.draftVersion);
      form.draftVersion = null;
      return { discarded: true };
    },
    publishPreview: ({ formId }) => {
      const form = formOf(formId);
      const { definition, issues } = validateDefinition(form.versions.get(form.draftVersion).definition, { forPublish: true });
      return { summary: publishSummary(definition, { cohortNames: Object.fromEntries(cohorts.map((c) => [c.id, c.name])) }), issues, version: form.draftVersion, revision: form.draftRevision };
    },
    publish: ({ formId, version: expectedVersion, expectedRevision }) => {
      const form = formOf(formId);
      if (expectedVersion !== form.draftVersion || expectedRevision !== form.draftRevision) throw fail('aborted', 'Changed meanwhile.', { reason: 'conflict', version: form.draftVersion, revision: form.draftRevision, updatedByName: 'Fixture Colleague', updatedAt: form.updatedAt });
      const version = form.draftVersion;
      const { definition, issues } = validateDefinition(form.versions.get(version).definition, { forPublish: true });
      if (issues.length) throw fail('failed-precondition', 'Fix the listed problems before publishing.', { reason: 'invalid', issues });
      Object.assign(form.versions.get(version), { state: 'published', definition, publishedAt: now() });
      form.publishedVersions.push(version);
      form.currentVersion = version;
      form.draftVersion = null;
      // A paused or closed form stays so.
      if (form.status !== 'paused' && form.status !== 'closed') form.status = 'published';
      log('forms.publish', { id: form.id, title: latestDefinition(form).title }, `Published version ${version}`);
      return { version, status: form.status };
    },
    setStatus: ({ formId, status }) => {
      const form = formOf(formId);
      form.status = status;
      log('forms.status', { id: form.id, title: latestDefinition(form).title }, `Status → ${status}`);
      return { status };
    },
    retireVersion: ({ formId, version }) => {
      const form = formOf(formId);
      form.versions.get(version).state = 'retired';
      form.publishedVersions = form.publishedVersions.filter((n) => n !== version);
      form.retiredVersions.push(version);
      return { version, state: 'retired' };
    },
    listResponses: ({ filter }) => {
      const rows = filterRows(filter).map(responseSummary);
      return { rows, nextCursor: null, scanned: rows.length };
    },
    getResponse: ({ responseId }) => {
      const response = responses.get(responseId);
      if (!response) throw fail('not-found', 'No such response.');
      return responseDetail(response);
    },
    export: ({ formId, format, scope, filter }) => {
      const form = formOf(formId);
      const rows = filterRows({ ...filter, formId, status: scope === 'approved' ? 'approved' : 'all_submitted' }).map((r) => ({
        id: r.id, referenceId: r.referenceId, formId: r.formId, formVersion: r.formVersion, revision: r.revision, status: r.status,
        contributorId: r.contributorId, submittedAt: r.submittedAt, decidedAt: r.decidedAt, answers: r.answers, consents: consentRecords(form.versions.get(r.formVersion).definition, r.answers),
      }));
      const versions = [...form.versions.entries()].filter(([, v]) => v.state !== 'draft').map(([version, v]) => ({ version, definition: v.definition }));
      const content = format === 'csv' ? responsesToCsv(versions, rows) : responsesToJson({ id: form.id, title: latestDefinition(form).title }, versions, rows, { scope });
      return { filename: `${form.id}-${scope}.${format}`, contentType: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json', content, count: rows.length };
    },
    attachmentLink: () => ({ url: 'about:blank#synthetic-attachment', expiresAt: now() }),
    activity: ({ limit }) => ({ entries: activity.slice(0, limit ?? 50) }),
    listCohorts: () => ({ cohorts: cohorts.map(({ members, ...rest }) => rest) }),
    getCohort: ({ cohortId }) => {
      if (cohortLoadFailures > 0) {
        cohortLoadFailures -= 1;
        throw fail('unavailable', 'The server could not be reached.');
      }
      return { cohort: clone(cohorts.find((c) => c.id === cohortId)) };
    },
    saveCohort: ({ cohortId, name, description, members, expectedUpdatedAt }) => {
      const existing = cohortId ? cohorts.find((c) => c.id === cohortId) : null;
      if (existing && expectedUpdatedAt !== existing.updatedAt) throw fail('aborted', 'Another administrator changed this cohort since you opened it.', { reason: 'conflict', updatedAt: existing.updatedAt });
      const unknown = members.filter((entry) => entry.includes('unknown'));
      const cohort = { id: cohortId ?? `cohort_${cohorts.length + 1}`, name, description, memberCount: members.length - unknown.length, updatedAt: now() };
      return { cohort, unknown };
    },
    access: () => clone(access),
    saveAccess: () => { throw fail('permission-denied', 'Only the owner super administrator can change who publishes and exports forms.'); },
    saveRewardSettings: () => { throw fail('permission-denied', 'Finance access is required to change points limits for forms.'); },
  };
  const review = {
    decide: ({ responseId, decision, expectedStatus, expectedRevision, requestId, feedback: note }) => {
      const response = responses.get(responseId);
      if (!requestId) throw fail('invalid-argument', 'requestId is required.');
      if (response.status !== expectedStatus || response.revision !== expectedRevision) throw fail('aborted', 'Changed meanwhile.', { reason: 'stale' });
      const rule = REVIEW_DECISIONS[decision];
      if (!rule.from.includes(response.status)) throw fail('failed-precondition', 'Not allowed from this status.');
      response.status = rule.to;
      response.history.push({ id: `${responseId}_h${response.history.length + 1}`, type: decision === 'start_review' ? 'review_started' : rule.to, actorName: 'Fixture Admin', actorRole: 'admin', revision: response.revision, at: now(), ...(note ? { feedback: note } : {}) });
      return { status: response.status, replayed: false, reward: { points: 0, status: 'none', note: null }, routing: { destination: 'general_intake', status: 'not_applicable', targetCollection: null, targetId: null, note: null } };
    },
    attachmentLink: () => ({ url: 'about:blank#synthetic-attachment', expiresAt: now() }),
  };

  window.__forms = {
    calls,
    async call(name, data) {
      calls.push({ name, ...JSON.parse(JSON.stringify(data)) });
      await new Promise((done) => setTimeout(done, 15));
      const handler = (name === 'formsAdmin' ? admin : name === 'formsReview' ? review : {})[data.action];
      if (!handler) throw fail('unimplemented', `${name}.${data.action} is not in the fixture.`);
      return { data: clone(handler(data)) };
    },
    allFieldIds,
    findField,
    /** The next `count` member loads fail (for the cohort check). */
    failCohortLoads(count) {
      cohortLoadFailures = count;
    },
    /** Another administrator saves the same draft (for the conflict check). */
    simulateColleagueSave(formId) {
      const form = forms.get(formId);
      form.draftRevision += 1;
      form.updatedAt = now();
      form.updatedByName = 'Fixture Colleague';
    },
  };
}

const firebaseStub = `export const functions = {}; export const auth = {}; export const db = {}; export const storage = {}; export const usingEmulators = true;`;
const functionsStub = `import * as contract from '@indigen-world/contracts/forms';
(${installFormsBackend.toString()})(contract);
export function httpsCallable(_functions, name) { return (data) => window.__forms.call(name, data); }`;

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
// The console's global CSS first, then the screens (and their own CSS), in production order.
import '@fontsource-variable/sora/wght.css';
import '@fontsource-variable/inter/wght.css';
import './apps/tribestudio/src/ui/tokens.css';
import './apps/tribestudio/src/ui/base.css';
import './apps/tribestudio/src/ui/motion.css';
import './apps/tribestudio/src/ui/components.css';
import './apps/tribestudio/src/ui/shell.css';
import './apps/admin/src/ui/admin.css';
import './apps/admin/src/ui/sections.css';
import './apps/admin/src/ui/legacy.css';
import { RouterProvider, useRouter } from './apps/admin/src/router';
import { DialogHost } from './apps/admin/src/ui/dialogs';
import { FormsDashboard } from './apps/admin/src/forms/FormsDashboard';
import { FormBuilder } from './apps/admin/src/forms/FormBuilder';
import { FormResponses } from './apps/admin/src/forms/FormResponses';
import { FormsSettings } from './apps/admin/src/forms/FormsSettings';
const SCREENS = { '/forms': FormsDashboard, '/forms/builder': FormBuilder, '/forms/responses': FormResponses, '/forms/settings': FormsSettings };
function Screen() {
  const { pathname } = useRouter();
  const Current = SCREENS[pathname] ?? FormsDashboard;
  // The console's section frame: a sidebar beside the screen, as in production.
  return (
    <main className="ad-main">
      <div className="ad-section">
        <aside className="ad-section__side"><p className="ts-hint" style={{ padding: 16 }}>Local fixture · synthetic data · nothing is sent</p></aside>
        <div className="ad-section__main"><Current /></div>
      </div>
    </main>
  );
}
createRoot(document.getElementById('root')).render(<React.StrictMode><RouterProvider><Screen /><DialogHost /></RouterProvider></React.StrictMode>);
`;

await build({
  stdin: { contents: entry, resolveDir: root, loader: 'tsx' },
  bundle: true,
  outdir: out,
  entryNames: 'forms',
  loader: { '.ttf': 'file', '.woff2': 'file', '.woff': 'file' },
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"' },
  logLevel: 'error',
  plugins: [{
    name: 'offline-forms-backend',
    setup(b) {
      b.onResolve({ filter: /^\.\.\/firebase$/ }, () => ({ path: 'firebase-app', namespace: 'fixture' }));
      b.onResolve({ filter: /^firebase\/functions$/ }, () => ({ path: 'firebase-functions', namespace: 'fixture' }));
      b.onLoad({ filter: /^firebase-app$/, namespace: 'fixture' }, () => ({ contents: firebaseStub, loader: 'js' }));
      b.onLoad({ filter: /^firebase-functions$/, namespace: 'fixture' }, () => ({ contents: functionsStub, loader: 'js', resolveDir: root }));
    },
  }],
});
await writeFile(join(out, 'index.html'), `<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Forms fixture</title><link rel="stylesheet" href="/forms.css"></head><body><div id="root"></div><script src="/forms.js"></script></body></html>`);

const types = { '.css': 'text/css', '.js': 'application/javascript', '.html': 'text/html', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    if (pathname === '/favicon.ico') {
      response.statusCode = 204;
      response.end();
      return;
    }
    const file = extname(pathname) ? join(out, pathname) : join(out, 'index.html');
    if (!file.startsWith(out)) throw new Error('outside');
    response.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
    response.end(await readFile(file));
  } catch {
    response.statusCode = 404;
    response.end();
  }
});
await new Promise((done) => server.listen(4198, '127.0.0.1', done));
const base = 'http://127.0.0.1:4198';

const browser = await chromium.launch({ executablePath: browserPath, headless: true });
const results = [];
const check = async (name, run) => {
  await run();
  results.push(name);
};
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('response', (response) => { if (response.status() >= 400) consoleErrors.push(`${response.status()} ${response.url()}`); });
  // Leave prompts a check expects are answered in order; any other dialog is an error.
  const expectedDialogs = [];
  page.on('dialog', (dialog) => {
    const expected = expectedDialogs.shift();
    if (expected) {
      expected.seen(dialog.message());
      void (expected.accept ? dialog.accept() : dialog.dismiss());
      return;
    }
    errors.push(`Unexpected browser dialog: ${dialog.message()}`);
    void dialog.dismiss();
  });
  /** Runs `action`, answers the browser prompt it raises, and returns the prompt's text. */
  const answerPrompt = async (accept, action) => {
    const seen = new Promise((resolve) => expectedDialogs.push({ accept, seen: resolve }));
    await action();
    const message = await Promise.race([seen, page.waitForTimeout(5000).then(() => null)]);
    if (message === null) {
      expectedDialogs.length = 0;
      assert.fail('no leave prompt appeared');
    }
    return message;
  };
  const calls = () => page.evaluate(() => window.__forms.calls);
  const noSideScroll = async (label) => {
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    if (!wide) return;
    // Name the widest offenders so a failure says where to look.
    const culprits = await page.evaluate(() => [...document.querySelectorAll('body *')]
      .filter((node) => node.getBoundingClientRect().right > window.innerWidth + 0.5)
      .slice(-6)
      .map((node) => `${node.tagName.toLowerCase()}.${[...node.classList].join('.')} → ${Math.round(node.getBoundingClientRect().right)}px`));
    assert.fail(`${label}: the page scrolls sideways at ${page.viewportSize().width}px. Widest: ${culprits.join('; ')}`);
  };
  const go = (path) => page.evaluate((to) => { window.history.pushState(null, '', to); window.dispatchEvent(new PopStateEvent('popstate')); }, path);
  const shot = (name) => page.screenshot({ path: join(out, `${name}.png`), fullPage: true });

  await check('dashboard lists the seeded form with its counts', async () => {
    await page.goto(`${base}/forms`);
    await page.getByRole('heading', { level: 1, name: 'Forms' }).waitFor();
    await page.getByRole('heading', { name: 'Fixture feedback form' }).waitFor();
    const card = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Fixture feedback form' }) });
    assert.equal(await card.getByText('Awaiting review').count(), 1);
    await noSideScroll('dashboard 1280');
    await shot('dashboard-desktop');
  });

  let formId = '';
  await check('a form is created from the word-collection template', async () => {
    await page.getByRole('button', { name: 'New form' }).click();
    await page.getByRole('dialog').waitFor();
    await page.getByRole('radio', { name: /Kasem word collection/ }).check();
    await page.getByRole('button', { name: 'Create draft' }).click();
    await page.waitForURL(/\/forms\/builder\?form=/);
    formId = new URL(page.url()).searchParams.get('form');
    await page.getByRole('heading', { level: 1, name: 'Kasem word collection' }).waitFor();
    assert.ok((await calls()).some((call) => call.action === 'create' && call.templateId === 'kasem_word_collection'));
  });

  const typedLabel = 'test-àá test-ʋ̀ʋ́ — elder’s word ';
  let newId = '';
  await check('palette click adds a question after the selected one; its key survives a label change', async () => {
    await page.getByRole('button', { name: /^Kind of word/ }).click();
    await page.getByRole('button', { name: 'Add Short text' }).click();
    const key = page.getByRole('textbox', { name: 'Answer key' });
    await key.waitFor();
    newId = await key.inputValue();
    assert.match(newId, /^q_[a-z0-9]{6}$/);
    const label = page.getByRole('textbox', { name: 'Question', exact: true });
    assert.equal(await label.evaluate((node) => node === document.activeElement), true, 'focus moves to the new question’s wording');
    await label.fill(typedLabel);
    assert.equal(await key.inputValue(), newId, 'the answer key does not follow the label');
    const order = await page.locator('[data-field-id]').evaluateAll((nodes) => nodes.map((node) => node.dataset.fieldId));
    assert.deepEqual(order.slice(0, 5), ['word', 'meaning', 'dialect', 'part_of_speech', newId]);
  });

  await check('keyboard buttons move the question; focus stays with it', async () => {
    const up = page.getByRole('button', { name: 'Move up', exact: true });
    await up.focus();
    await page.keyboard.press('Enter');
    let order = await page.locator('[data-field-id]').evaluateAll((nodes) => nodes.map((node) => node.dataset.fieldId));
    assert.deepEqual(order.slice(0, 5), ['word', 'meaning', 'dialect', newId, 'part_of_speech']);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-focus-key')), `field-up:${newId}`, 'focus follows the moved question');
    await page.getByRole('button', { name: 'Move to the next section' }).focus();
    await page.keyboard.press('Space');
    order = await page.locator('[data-field-id]').evaluateAll((nodes) => nodes.map((node) => node.dataset.fieldId));
    assert.deepEqual(order.slice(0, 6), ['word', 'meaning', 'dialect', 'part_of_speech', newId, 'examples']);
    const usage = page.getByRole('region', { name: 'How it is used' });
    assert.equal(await usage.locator(`[data-field-id="${newId}"]`).count(), 1, 'the question is now first in the next section');
    await page.getByText('Unsaved changes').waitFor();
  });

  await check('browser Back with unsaved changes asks first; staying keeps the URL and the edits', async () => {
    const builderUrl = page.url();
    const scrolled = await page.evaluate(async () => {
      window.scrollTo({ top: 240, behavior: 'instant' });
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      return window.scrollY;
    });
    assert.ok(scrolled > 0, 'the builder is long enough to scroll');
    const message = await answerPrompt(false, () => page.evaluate(() => window.history.back()));
    assert.equal(message, 'Your changes to this form are not saved. Leave without saving?');
    await page.waitForFunction((url) => window.location.href === url, builderUrl);
    await page.getByText('Unsaved changes').waitFor();
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.scrollY), scrolled, 'staying keeps the scroll position');
    assert.equal(await page.getByRole('heading', { level: 1, name: 'Kasem word collection' }).count(), 1, 'the builder is still on screen');
    assert.equal(await page.getByRole('textbox', { name: 'Question', exact: true }).inputValue(), typedLabel, 'the typed wording survives');
    assert.equal(await page.getByRole('textbox', { name: 'Answer key' }).inputValue(), newId);
  });

  await check('Ctrl+S saves the draft with stable ids and the label exactly as typed', async () => {
    await page.keyboard.press('Control+s');
    await page.getByText(/^Saved \d\d:\d\d$/).waitFor();
    const saves = (await calls()).filter((call) => call.action === 'saveDraft');
    assert.equal(saves.length, 1);
    const saved = saves[0];
    assert.equal(saved.expectedRevision, 1);
    assert.equal(saved.version, 1, 'a save names the draft version it was made on');
    const ids = saved.definition.sections.map((section) => section.fields.map((field) => field.id));
    assert.deepEqual(ids, [
      ['word', 'meaning', 'dialect', 'part_of_speech'],
      [newId, 'examples', 'pronunciation', 'source', 'source_detail'],
      ['rights_confirmed', 'speaker_permission', 'consent_review', 'consent_storage', 'consent_public', 'consent_training'],
    ]);
    const field = saved.definition.sections[1].fields[0];
    assert.equal(field.label, typedLabel, 'the label is sent byte for byte, trailing space and tone marks included');
    assert.equal(field.label.normalize('NFC') === field.label, typedLabel.normalize('NFC') === typedLabel, 'no Unicode normalisation on the way');
    assert.deepEqual(saved.definition.sections[1].fields[1].fields.map((sub) => sub.id), ['example_kasem', 'example_english']);
    assert.deepEqual(saved.definition.destination.mapping, { headword: 'word', meaning: 'meaning', partOfSpeech: 'part_of_speech', dialect: 'dialect', source: 'source_detail', pronunciation: 'pronunciation', speakerPermission: 'speaker_permission', rightsConfirmed: 'rights_confirmed' });
    await shot('builder-desktop');
    await noSideScroll('builder 1280');
  });

  await check('a conflicting save keeps the edits; saving over it is deliberate', async () => {
    await page.evaluate((id) => window.__forms.simulateColleagueSave(id), formId);
    const help = page.getByRole('textbox', { name: /^Help text/ });
    await help.fill('Ask an elder if you are not sure.');
    await page.keyboard.press('Control+s');
    await page.getByText(/^Fixture Colleague saved this draft/).waitFor();
    assert.equal(await help.inputValue(), 'Ask an elder if you are not sure.', 'the edit is still on screen');
    await page.getByRole('button', { name: 'Keep mine and save over it' }).click();
    await page.getByText(/^Saved \d\d:\d\d$/).waitFor();
    const saves = (await calls()).filter((call) => call.action === 'saveDraft');
    assert.deepEqual(saves.map((call) => call.expectedRevision), [1, 2, 3], 'the refused save used the old revision; the deliberate one the current');
    assert.equal(saves[2].definition.sections[1].fields[0].description, 'Ask an elder if you are not sure.');
  });

  await check('form settings tabs open and stay inside the page', async () => {
    await page.getByRole('tab', { name: /Form settings/ }).click();
    await page.getByRole('tab', { name: 'Destination' }).click();
    await page.getByRole('radio', { name: /Dictionary candidate entries/ }).waitFor();
    assert.equal(await page.getByRole('combobox', { name: /Kasem word/ }).inputValue(), 'word', 'the mapping select shows the mapped question');
    await page.getByRole('tab', { name: 'Review and points' }).click();
    await page.getByText(/Finance limits form points to 20 per response/).waitFor();
    await noSideScroll('settings tabs 1280');
  });

  await check('preview renders the form on desktop and in a 390 px frame', async () => {
    await page.getByRole('tab', { name: 'Preview' }).click();
    const screen = page.locator('.afm-device__screen');
    await screen.getByRole('heading', { name: 'Kasem word collection' }).waitFor();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('heading', { name: /^Fix \d+ problems? before you continue$/ }).waitFor();
    await page.getByRole('button', { name: 'Mobile (390 px)' }).click();
    const width = await screen.evaluate((node) => node.getBoundingClientRect().width);
    assert.ok(width <= 390.5, `mobile frame is ${width}px wide`);
    await shot('preview-mobile');
    await page.getByRole('button', { name: 'Desktop' }).click();
    await page.getByRole('button', { name: 'Reset answers' }).click();
    await noSideScroll('preview 1280');
  });

  await check('publishing goes through the summary dialog', async () => {
    await page.getByRole('button', { name: 'Publish…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Publish version 1?' });
    await dialog.waitFor();
    await dialog.getByText(/Dictionary candidate entries/).first().waitFor();
    await dialog.getByText('I agree that Indigen World reviewers may assess this word, its examples and any recording.').waitFor();
    await shot('publish-dialog');
    await dialog.getByRole('button', { name: 'Publish version 1' }).click();
    await page.getByText('Version 1 is live. Contributors in its audience can now fill it.').waitFor();
    const all = await calls();
    const publish = all.find((call) => call.action === 'publish');
    assert.equal(publish.expectedRevision, 4, 'publish carries the revision of the last save');
    assert.equal(publish.version, 1, 'and the draft version on screen');
    await page.getByRole('button', { name: 'Edit as new version' }).waitFor();
  });

  await check('responses: filters, detail, a review decision and a CSV export', async () => {
    await page.getByRole('link', { name: 'Responses' }).first().click();
    await page.waitForURL(/\/forms\/responses\?form=/);
    await page.getByRole('heading', { level: 1, name: 'Responses' }).waitFor();
    await page.getByRole('combobox', { name: 'Form' }).selectOption('fx_feedback');
    await page.getByRole('button', { name: /IWF-3H8D-2PZE/ }).click();
    const detail = page.getByRole('article', { name: /IWF-3H8D-2PZE/ });
    await detail.getByText('Please add test-ʋ̀ʋ́ test-ɩ́ɔ̀ to the dictionary.').waitFor();
    assert.match(page.url(), /item=resp_b/);
    await page.getByRole('button', { name: /IWF-7K2M-9QXA/ }).click();
    const submitted = page.getByRole('article', { name: /IWF-7K2M-9QXA/ });
    // Feedback drafted for a later decision is not sent by Start review, and stays in the box.
    const drafted = 'Draft note for a later decision';
    await submitted.getByRole('textbox', { name: /^Feedback to the contributor/ }).fill(drafted);
    await submitted.getByRole('button', { name: 'Start review' }).click();
    await page.getByText('Review started for IWF-7K2M-9QXA.').waitFor();
    const decide = (await calls()).find((call) => call.name === 'formsReview' && call.action === 'decide');
    assert.equal(decide.expectedStatus, 'submitted');
    assert.equal(decide.expectedRevision, 1);
    assert.match(decide.requestId, /^[0-9a-f]{32}$/);
    assert.equal('feedback' in decide, false, 'Start review sends no feedback');
    assert.equal(await submitted.getByRole('textbox', { name: /^Feedback to the contributor/ }).inputValue(), drafted, 'the drafted feedback is kept');
    await shot('responses-desktop');
    await noSideScroll('responses 1280');
    await page.getByRole('button', { name: 'Export…' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText('What the columns mean').waitFor();
    const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Download CSV' }).click()]);
    const csv = await readFile(await download.path(), 'utf8');
    assert.ok(csv.startsWith('\uFEFF"reference_id","response_id"'), 'UTF-8 BOM and the fixed columns come first');
    assert.match(csv, /"'=SUM\(A1\) should never run in a spreadsheet"/, 'formula-like text is neutralised');
    assert.ok(csv.includes('test-ʋ̀ʋ́ test-ɩ́ɔ̀'), 'Kasem text is exported exactly');
    const exportCall = (await calls()).find((call) => call.action === 'export');
    assert.deepEqual([exportCall.formId, exportCall.format, exportCall.scope], ['fx_feedback', 'csv', 'submitted']);
  });

  await check('no sideways scrolling at 390 px and 360 px', async () => {
    for (const width of [390, 360]) {
      await page.setViewportSize({ width, height: 844 });
      await go('/forms/responses?form=fx_feedback&item=resp_c');
      await page.getByRole('article', { name: /IWF-5N4R-8WTB/ }).waitFor();
      await noSideScroll(`responses ${width}`);
      await go('/forms');
      await page.getByRole('heading', { level: 1, name: 'Forms' }).waitFor();
      await page.getByRole('heading', { name: 'Fixture feedback form' }).waitFor();
      await noSideScroll(`dashboard ${width}`);
      await go(`/forms/builder?form=${formId}`);
      await page.getByRole('button', { name: 'Edit as new version' }).waitFor();
      await noSideScroll(`builder ${width}`);
      await go('/forms/settings');
      await page.getByRole('heading', { name: 'Cohorts' }).waitFor();
      await noSideScroll(`settings ${width}`);
    }
    await go(`/forms/builder?form=${formId}`);
    await page.getByRole('button', { name: 'Edit as new version' }).click();
    await page.getByRole('button', { name: 'Add question' }).click();
    await page.getByRole('button', { name: 'Add Number' }).click();
    await page.getByRole('textbox', { name: 'Question', exact: true }).waitFor();
    await noSideScroll('builder editing 360');
    await shot('builder-mobile');
    await page.getByRole('tab', { name: /Form settings/ }).click();
    for (const name of ['Destination', 'Review and points', 'Audience', 'Versions']) {
      await page.getByRole('tab', { name }).click();
      await noSideScroll(`form settings ${name} 360`);
    }
    await shot('settings-mobile');
    await page.getByRole('tab', { name: 'Preview' }).click();
    await page.locator('.afm-device__screen').waitFor();
    await noSideScroll('preview 360');
  });

  await check('a setting the builder flags blocks publishing and is saved as entered', async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole('tab', { name: 'Questions' }).click();
    await page.getByRole('button', { name: /^Pronunciation recording/ }).click();
    await page.getByRole('textbox', { name: /^Most files/ }).fill('30');
    await page.getByRole('button', { name: 'Publish…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Publish version 2?' });
    await dialog.waitFor();
    await dialog.getByText(/problems? blocks? publishing/).waitFor();
    await dialog.getByText(/Allow from 1 to 20 files/).waitFor();
    assert.equal(await dialog.getByRole('button', { name: 'Publish version 2' }).count(), 0, 'no way to publish while a problem is listed');
    const save = (await calls()).filter((call) => call.action === 'saveDraft').at(-1);
    assert.equal(save.version, 2);
    const sent = save.definition.sections.flatMap((section) => section.fields).find((field) => field.id === 'pronunciation');
    assert.equal(sent.settings.maxFiles, 30, 'the out-of-range value is sent as entered, never quietly reset');
    assert.equal((await calls()).some((call) => call.action === 'publish' && call.version === 2), false);
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  });

  await check('a cohort whose members did not load cannot be saved over them', async () => {
    await go('/forms/settings');
    await page.getByRole('heading', { name: 'Cohorts' }).waitFor();
    // Two: StrictMode runs the dialog's load effect twice and only the second result counts.
    await page.evaluate(() => window.__forms.failCohortLoads(2));
    await page.getByRole('button', { name: 'Edit cohort Paga workshop (synthetic)' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText('The members could not be loaded').waitFor();
    const save = dialog.getByRole('button', { name: 'Save cohort' });
    assert.equal(await save.isDisabled(), true, 'Save stays off until the members are loaded');
    await dialog.getByRole('button', { name: 'Retry' }).click();
    await page.waitForFunction(() => document.querySelector('.ts-textarea.ts-input--mono')?.value.includes('a@example.test'));
    assert.equal(await save.isDisabled(), false);
    await save.click();
    await page.getByText(/^Cohort “Paga workshop \(synthetic\)” saved/).waitFor();
    const saved = (await calls()).filter((call) => call.action === 'saveCohort').at(-1);
    assert.match(saved.expectedUpdatedAt, /^\d{4}-\d{2}-\d{2}T/, 'the save names the version its members were loaded at');
    assert.deepEqual(saved.members, ['a@example.test', 'fixture-contributor-b']);
  });

  await check('a new option never takes the id of an option a published version had', async () => {
    await go(`/forms/builder?form=${formId}`);
    await page.getByRole('button', { name: /^Kind of word/ }).click();
    await page.getByRole('button', { name: 'Remove option Adverb' }).click();
    await page.getByRole('textbox', { name: 'New option wording' }).fill('Adverb');
    await page.getByRole('button', { name: 'Add option' }).click();
    const ids = await page.locator('code[title="Option id"]').allTextContents();
    assert.deepEqual(ids, ['noun', 'verb', 'adjective', 'other', 'adverb_2'], 'answers to version 1’s “adverb” keep their meaning');
  });

  await check('browser Back leaves the unsaved builder once the prompt is accepted', async () => {
    await page.getByText('Unsaved changes').waitFor();
    const message = await answerPrompt(true, () => page.evaluate(() => window.history.back()));
    assert.equal(message, 'Your changes to this form are not saved. Leave without saving?');
    await page.getByRole('heading', { name: 'Cohorts' }).waitFor();
    assert.equal(new URL(page.url()).pathname, '/forms/settings');
    assert.equal(expectedDialogs.length, 0);
  });

  assert.deepEqual(errors, [], 'no page errors');
  assert.deepEqual(consoleErrors, [], 'no console errors');
  console.log(`Forms browser checks passed (${results.length}):\n- ${results.join('\n- ')}\nScreenshots: ${out}`);
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
