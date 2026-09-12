import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { transformWithOxc } from 'vite';

const root = resolve(import.meta.dirname, '..');
const tick = () => new Promise((resolve) => setImmediate(resolve));

// Execute production modules with their external I/O replaced. No Firebase
// project or microphone is contacted by these tests.
async function load(path, names, mocks = {}) {
  const { code } = await transformWithOxc(readFileSync(resolve(root, path), 'utf8'), path, { jsx: { runtime: 'classic' } });
  const executable = code.replace(/^import[\s\S]*?;\n/gm, '').replace(/\bexport (?=(?:async )?function|const|let|class)/g, '');
  return runInNewContext(executable + '\n;({' + names.join(',') + '})', { URL, URLSearchParams, Blob, File, console, ...mocks });
}

function hooks() {
  let cursor = 0;
  const slots = [];
  const effects = [];
  const cleanups = [];
  const context = { value: null };
  const api = {
    React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
    createContext: () => context,
    useContext: () => context.value,
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], (next) => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }];
    },
    useRef(initial) {
      const i = cursor++;
      return slots[i] ??= { current: initial };
    },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!slots[i] || deps.some((dep, n) => !Object.is(dep, slots[i][n]))) {
        slots[i] = deps;
        effects.push(() => { cleanups[i]?.(); cleanups[i] = fn(); });
      }
    },
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
  };
  return {
    api,
    render(fn, props = {}) { cursor = 0; return fn(props); },
    flush() { effects.splice(0).forEach((fn) => fn()); },
    dispose() { cleanups.forEach((fn) => fn?.()); },
    context,
  };
}
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of [node.props?.children ?? []].flat(Infinity)) {
    const result = find(child, predicate);
    if (result) return result;
  }
  return null;
}
const input = {
  id: 'saved-draft', uid: 'creator', campaignId: 'open', studioType: 'writing', title: 'My story',
  category: 'storytelling', primaryLanguage: 'xsm', dialect: 'Navrongo', description: 'Summary',
  body: 'This is a complete story with enough text to submit.', tags: [], targetAudience: '', sourceReferences: '',
  translationNotes: '', translation: {}, caption: '', altText: '', englishSummary: '', culturalContext: '',
  externalPostUrl: '', participants: [], disclosures: { involvesMinors: false, usesThirdPartyMaterial: false, sourceInfo: '' },
  attestations: { ownsOrHasRights: true, participantsConsented: true, guardianPermissionForMinors: false, noUnlawfulCopyright: true },
  permissions: { review: true, publication: true, promotion: false, aiTraining: false }, consentVersion: 'test',
};
const plain = (value) => JSON.parse(JSON.stringify(value));

test('text and link-only submissions omit media; saved media and metadata survive edits', async () => {
  const { buildSubmission } = await load('src/creator/data.ts', ['buildSubmission']);
  for (const externalPostUrl of ['', 'https://example.com/video']) {
    const result = buildSubmission({ ...input, externalPostUrl }, 'DRAFT');
    assert.equal(Object.hasOwn(result, 'media'), false);
    assert.equal(Object.values(result).includes(undefined), false);
  }
  const prior = buildSubmission(input, 'DRAFT');
  prior.media = { storagePath: 'private/original' };
  prior.moderation.feedback = 'Keep the source';
  const next = buildSubmission(input, 'DRAFT', prior);
  assert.deepEqual(plain(next.media), prior.media);
  assert.equal(next.lifecycle.version, 2);
  assert.equal(next.moderation.feedback, 'Keep the source');
});

test('saving a revision preserves NEEDS_REVISION and submitting changes it to RESUBMITTED', async () => {
  let current = null;
  const mocks = { db: {}, doc: (...args) => args, getDoc: async () => ({ exists: () => !!current, data: () => current }), setDoc: async (_ref, value) => { current = value; } };
  const { buildSubmission, saveSubmission } = await load('src/creator/data.ts', ['buildSubmission', 'saveSubmission'], mocks);
  current = buildSubmission(input, 'NEEDS_REVISION');
  current.moderation.feedback = 'Clarify source';
  await saveSubmission(input, 'DRAFT');
  assert.equal(current.status, 'NEEDS_REVISION');
  await saveSubmission(input, 'SUBMITTED');
  assert.equal(current.status, 'RESUBMITTED');
  assert.equal(current.lifecycle.version, 3);
  assert.equal(current.moderation.feedback, 'Clarify source');
});

test('download URL failure rejects the upload promise', async () => {
  const failure = new Error('URL fetch failed');
  const { uploadSubmissionMedia } = await load('src/creator/data.ts', ['uploadSubmissionMedia'], {
    storage: {}, ref: () => ({}), getDownloadURL: async () => { throw failure; },
    uploadBytesResumable: () => ({ snapshot: { ref: {} }, on: (_event, _progress, _error, complete) => { void complete(); } }),
  });
  await assert.rejects(uploadSubmissionMedia('u', 'open', 's', { type: 'audio/webm' }, () => {}), /URL fetch failed/);
});

test('query-only navigation and browser Back update route consumers', async () => {
  const h = hooks();
  const location = { pathname: '/studio/submissions/new', search: '?campaign=one', origin: 'https://studio.example' };
  const events = {};
  const changeUrl = (_state, _title, path) => { const url = new URL(path, location.origin); location.pathname = url.pathname; location.search = url.search; };
  const { RouterProvider, useQueryParam, matchRoute } = await load('src/router.tsx', ['RouterProvider', 'useQueryParam', 'matchRoute'], {
    ...h.api, window: { location, history: { pushState: changeUrl, replaceState: changeUrl }, scrollTo() {}, addEventListener: (key, fn) => { events[key] = fn; }, removeEventListener() {} },
  });
  let tree = h.render(RouterProvider);
  h.flush();
  tree.props.value.navigate('/studio/submissions/new?campaign=two');
  tree = h.render(RouterProvider);
  h.context.value = tree.props.value;
  assert.equal(useQueryParam('campaign'), 'two');
  location.search = '?campaign=one'; events.popstate();
  h.context.value = h.render(RouterProvider).props.value;
  assert.equal(useQueryParam('campaign'), 'one');
  assert.equal(matchRoute('/studio/submissions/:id', '/studio/submissions/%ZZ'), null);
  h.dispose();
});

test('draft editor restores the original ID, text, participants and media', async () => {
  const h = hooks(); let saved;
  const user = { uid: 'creator' };
  const existing = { ...input, authUid: user.uid, campaign: { id: 'open' }, status: 'DRAFT',
    participants: [{ name: 'Speaker' }], media: { storagePath: 'original-file' }, lifecycle: { version: 2 } };
  const { SubmissionEditor } = await load('src/creator/pages/SubmissionNewPage.tsx', ['SubmissionEditor'], {
    ...h.api, useAuth: () => ({ user }), useConfig: () => ({ config: null }), useRoute: () => ({ navigate() {} }),
    useQueryParam: () => null, newSubmissionId: () => { throw Error('Must reuse draft ID'); },
    saveSubmission: async (value) => { saved = value; },
    Link: 'a', Stepper: 'stepper', Field: 'field', VoiceRecorder: 'recorder', WhatsAppCard: 'whatsapp',
  });
  h.render(SubmissionEditor, { existing }); h.flush();
  const tree = h.render(SubmissionEditor, { existing });
  const button = find(tree, (node) => node.type === 'button' && node.props.children.includes('Save draft'));
  assert.ok(button);
  button.props.onClick(); await tick();
  assert.equal(saved.id, existing.id);
  assert.equal(saved.body, existing.body);
  assert.deepEqual(plain(saved.media), existing.media);
  assert.deepEqual(plain(saved.participants), existing.participants);
  assert.equal(saved.permissions.aiTraining, false);
  h.dispose();
});

test('recorder releases microphone and timer on unmount', async () => {
  const h = hooks(); let stopped = 0; let cleared = 0; let recorder;
  class Recorder {
    constructor() { recorder = this; this.state = 'inactive'; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.onstop?.(); }
  }
  const { VoiceRecorder } = await load('src/creator/components.tsx', ['VoiceRecorder'], {
    ...h.api, MediaRecorder: Recorder,
    navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => stopped++ }] }) } },
    window: { setInterval: () => 1, clearInterval: () => cleared++ },
  });
  const tree = h.render(VoiceRecorder, { onAudioReady: () => { throw Error('Must not upload on unmount'); } }); h.flush();
  find(tree, (node) => node.type === 'button').props.onClick(); await tick();
  assert.equal(recorder.state, 'recording');
  h.dispose();
  assert.equal(recorder.state, 'inactive'); assert.equal(stopped, 1); assert.equal(cleared, 1);
});

test('microphone permission resolving after unmount releases the new stream', async () => {
  const h = hooks(); let grant; let stopped = 0;
  const { VoiceRecorder } = await load('src/creator/components.tsx', ['VoiceRecorder'], {
    ...h.api, navigator: { mediaDevices: { getUserMedia: () => new Promise((resolve) => { grant = resolve; }) } }, window: {},
  });
  const tree = h.render(VoiceRecorder, { onAudioReady() {} }); h.flush();
  find(tree, (node) => node.type === 'button').props.onClick(); h.dispose();
  grant({ getTracks: () => [{ stop: () => stopped++ }] }); await tick();
  assert.equal(stopped, 1);
});

test('hosting permits the site to request microphone access', () => {
  const hosting = JSON.parse(readFileSync(resolve(root, '../../firebase.json'), 'utf8')).hosting;
  const studio = hosting.find((site) => site.site === 'tribestudio');
  assert.ok(studio.headers[0].headers.find((header) => header.key === 'Permissions-Policy').value.includes('microphone=(self)'));
});

test('dictionary lookup requests published rows and rejects restricted submissions before calling backend', async () => {
  let queryArgs; let payload; let calls = 0;
  const { fetchHeadwordMatches, submitDictionaryEntry } = await load('src/creator/dictionary-data.ts', ['fetchHeadwordMatches', 'submitDictionaryEntry'], {
    db: {}, functions: {}, collection: (_db, name) => name, where: (...args) => args, limit: (n) => n,
    query: (...args) => { queryArgs = args; return args; },
    getDocs: async () => ({ docs: [{ id: 'word', data: () => ({ isPublished: true, kasemText: 'nia', englishText: 'water' }) }] }),
    headwordKey: (word) => word.trim().toLowerCase(),
    sensesPayload: () => [{ definition: 'water' }], formsPayload: () => ({}),
    httpsCallable: () => async (input) => { calls++; payload = input; },
  });
  const matches = await fetchHeadwordMatches(' NIA ');
  assert.equal(matches.length, 1);
  assert.ok(queryArgs.some((part) => Array.isArray(part) && part[0] === 'isPublished' && part[2] === true));
  const draft = { culturalPermissionTier: 'restricted' };
  await assert.rejects(submitDictionaryEntry(draft), /public cultural material only/);
  assert.equal(calls, 0);
  await submitDictionaryEntry({ ...draft, culturalPermissionTier: 'public', headword: 'nia', senses: [],
    partOfSpeech: 'noun', dialect: 'Navrongo', source: 'Speaker', notes: '', forms: {}, alsoUsedAs: [], ipa: '',
    kasemDefinition: '', etymology: '', publicationPermission: false, consentGranted: true });
  assert.equal(payload.culturalPermissionTier, 'public');
  assert.equal(payload.publicationPermission, false);
});

test('first save writes a new document without an unauthorized read of its missing ID', async () => {
  let saved;
  const { saveSubmission } = await load('src/creator/data.ts', ['saveSubmission'], {
    db: {}, doc: (...args) => args,
    getDoc: () => { throw Error('A missing document is not readable under ownership rules'); },
    setDoc: async (_ref, value) => { saved = value; },
  });
  await saveSubmission(input, 'DRAFT', null);
  assert.equal(saved.id, input.id);
  assert.equal(saved.status, 'DRAFT');
});
