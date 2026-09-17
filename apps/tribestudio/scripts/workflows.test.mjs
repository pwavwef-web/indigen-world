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
  if (path.endsWith('SubmissionNewPage.tsx')) {
    mocks = { ...await load('src/creator/discoverySource.ts', ['discoverySource']), ...mocks };
  }
  const { code } = await transformWithOxc(readFileSync(resolve(root, path), 'utf8'), path, { jsx: { runtime: 'classic' } });
  const executable = code.replace(/^import[\s\S]*?;\n/gm, '').replace(/\bexport (?=(?:async )?function|const|let|class)/g, '');
  return runInNewContext(executable + '\n;({' + names.join(',') + '})', { URL, URLSearchParams, Blob, File, Event, console, ...mocks });
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
  assert.equal(Object.hasOwn(buildSubmission({ ...input, media: null }, 'DRAFT', prior), 'media'), false);
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
    ...h.api, window: { dispatchEvent: () => true, location, history: { pushState: changeUrl, replaceState: changeUrl }, scrollTo() {}, addEventListener: (key, fn) => { events[key] = fn; }, removeEventListener() {} },
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
    window: { addEventListener() {}, removeEventListener() {}, setTimeout, clearTimeout },
    storage: {}, ref: () => ({}), getDownloadURL: async () => 'https://example.com/media',
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
  const policy = studio.headers.flatMap((route) => route.headers)
    .find((header) => header.key === 'Permissions-Policy');
  assert.ok(policy?.value.includes('microphone=(self)'));
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

async function editorHarness(overrides = {}) {
  const stored = new Map();
  const h = hooks(); const timers = new Map(); const events = {}; const writes = []; let timerId = 0; let focused;
  const existing = { ...input, authUid: 'creator', campaign: { id: 'open' }, status: 'DRAFT', lifecycle: { version: 1 } };
  const { SubmissionEditor } = await load('src/creator/pages/SubmissionNewPage.tsx', ['SubmissionEditor'], {
    ...h.api, useAuth: () => ({ user: { uid: 'creator' } }), useConfig: () => ({ config: null }),
    useRoute: () => ({ navigate() {} }), useQueryParam: () => null,
    saveSubmission: async (value) => { writes.push(value); },
    window: { sessionStorage: { getItem: (key) => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value), removeItem: (key) => stored.delete(key) }, addEventListener: (name, fn) => { events[name] = fn; }, removeEventListener() {}, confirm: () => false,
      setTimeout: (fn) => { timers.set(++timerId, fn); return timerId; }, clearTimeout: (id) => timers.delete(id) },
    document: { getElementById: (id) => ({ focus: () => { focused = id; } }) },
    storage: {}, ref: () => ({}), getDownloadURL: async () => 'https://example.com/media',
    Link: 'a', Stepper: 'stepper', Field: 'field', VoiceRecorder: 'recorder', WhatsAppCard: 'whatsapp', ...overrides,
  });
  const render = () => { const tree = h.render(SubmissionEditor, { existing }); h.flush(); return tree; };
  render();
  return { render, writes, events, timers, stored, focused: () => focused, dispose: () => h.dispose(),
    runTimers: async () => { const pending = [...timers.values()]; timers.clear(); pending.forEach((fn) => fn()); await tick(); } };
}

test('autosave persists edited text and warns while dirty, then clears the warning after saving', async () => {
  const e = await editorHarness();
  find(e.render(), (n) => n.props?.id === 't').props.onChange({ target: { value: 'Updated story' } });
  e.render();
  const before = new Event('beforeunload', { cancelable: true }); e.events.beforeunload(before);
  assert.equal(before.defaultPrevented, true);
  const leave = new Event('studio:before-navigate', { cancelable: true }); e.events['studio:before-navigate'](leave);
  assert.equal(leave.defaultPrevented, true);
  await e.runTimers(); e.render();
  assert.equal(e.writes.length, 1); assert.equal(e.writes[0].title, 'Updated story');
  const after = new Event('beforeunload', { cancelable: true }); e.events.beforeunload(after);
  assert.equal(after.defaultPrevented, false); e.dispose();
});

test('Continue rejects missing details and focuses the title without advancing', async () => {
  const e = await editorHarness();
  find(e.render(), (n) => n.props?.id === 't').props.onChange({ target: { value: '' } });
  const tree = e.render();
  find(tree, (n) => n.type === 'button' && n.props.children.includes('Continue')).props.onClick();
  await e.runTimers();
  assert.equal(e.focused(), 't');
  assert.equal(find(e.render(), (n) => n.type === 'stepper').props.current, 0);
  e.dispose();
});

test('failed autosave exposes a retry and does not repeatedly write', async () => {
  const e = await editorHarness({ saveSubmission: async () => { throw Error('Offline'); } });
  find(e.render(), (n) => n.props?.id === 't').props.onChange({ target: { value: 'Offline edit' } });
  e.render(); await e.runTimers();
  const tree = e.render();
  assert.equal(e.timers.size, 0);
  assert.ok(find(tree, (n) => n.props?.role === 'status').props.children.flat(Infinity).join('').includes('Not saved'));
  e.dispose();
});


test('upload controls prevent overlapping uploads and removal is saved explicitly', async () => {
  let finish; let uploads = 0;
  const e = await editorHarness({ uploadSubmissionMedia: () => { uploads++; return new Promise((resolve) => { finish = resolve; }); } });
  find(e.render(), (n) => n.type === 'button' && n.props.children.includes('Continue')).props.onClick();
  await tick();
  const field = find(e.render(), (n) => n.props?.id === 'media-file');
  const file = new File(['audio'], 'voice.webm', { type: 'audio/webm' });
  field.props.onChange({ target: { files: [file] } });
  field.props.onChange({ target: { files: [file] } });
  assert.equal(uploads, 1);
  assert.equal(find(e.render(), (n) => n.props?.id === 'media-file').props.disabled, true);
  finish({ storagePath: 'private/voice', downloadUrl: 'https://example.com/media' }); await tick();
  const tree = e.render();
  find(tree, (n) => n.type === 'button' && n.props.children.includes('Remove attachment')).props.onClick();
  find(e.render(), (n) => n.type === 'button' && n.props.children.includes('Save draft')).props.onClick();
  await tick();
  assert.equal(e.writes.at(-1).media, null); e.dispose();
});

test('translation field labels follow the selected source and target languages', async () => {
  const e = await editorHarness();
  find(e.render(), (n) => n.type === 'button' && find(n, (c) => c.type === 'strong' && c.props.children.includes('Translation'))).props.onClick();
  let tree = e.render();
  find(tree, (n) => n.props?.id === 'sourceLang').props.onChange({ target: { value: 'en' } });
  find(tree, (n) => n.props?.id === 'targetLang').props.onChange({ target: { value: 'xsm' } });
  tree = e.render();
  assert.equal(find(tree, (n) => n.type === 'field' && n.props.htmlFor === 'sourceContent').props.label, 'English source text');
  assert.equal(find(tree, (n) => n.type === 'field' && n.props.htmlFor === 'translatedContent').props.label, 'Kasem translation');
  e.dispose();
});

test('discovery links accept only public dictionary and post sources', async () => {
  const { discoverySource } = await load('src/creator/discoverySource.ts', ['discoverySource']);
  assert.equal(discoverySource('https://indigenworld.com/dictionary?entry=word%201&tracking=private'), 'https://indigenworld.com/dictionary?entry=word%201');
  assert.equal(discoverySource('https://indigenworld.com/post/story-1?tracking=private'), 'https://indigenworld.com/post/story-1');
  for (const value of ['javascript:alert(1)', 'https://other.example/post/1', 'https://indigenworld.com/admin', 'https://user:password@indigenworld.com/post/1', 'not a URL']) assert.equal(discoverySource(value), '');
});

test('dashboard resources fail independently and retry only their own request', async () => {
  const h = hooks();
  const { useCreatorResource } = await load('src/creator/useCreatorResource.ts', ['useCreatorResource'], h.api);
  let goodCalls = 0; let failedCalls = 0;
  const good = async () => { goodCalls++; return ['saved work']; };
  const flaky = async () => { failedCalls++; if (failedCalls === 1) throw Error('Offline'); return ['recovered']; };
  const render = () => h.render(() => [useCreatorResource(good, 'creator'), useCreatorResource(flaky, 'creator')]);
  render(); h.flush(); await tick();
  let [a, b] = render();
  assert.equal(a.data[0], 'saved work'); assert.equal(a.failed, false); assert.equal(b.failed, true);
  b.retry(); render(); h.flush(); await tick(); [a, b] = render();
  assert.equal(b.data[0], 'recovered'); assert.equal(goodCalls, 1); assert.equal(failedCalls, 2);
  h.dispose();
});

test('a late dashboard response cannot expose another account data', async () => {
  const h = hooks();
  const { useCreatorResource } = await load('src/creator/useCreatorResource.ts', ['useCreatorResource'], h.api);
  let resolveOld;
  const loader = (uid) => uid === 'first' ? new Promise((resolve) => { resolveOld = resolve; }) : Promise.resolve('second account');
  const render = (uid) => h.render(() => useCreatorResource(loader, uid));
  render('first'); h.flush(); render('second'); h.flush(); await tick();
  resolveOld('first account'); await tick();
  assert.equal(render('second').data, 'second account');
  assert.equal(render(undefined).data, undefined);
  h.dispose();
});

test('offline text stays editable and autosaves after reconnecting', async () => {
  const e = await editorHarness({ navigator: { onLine: false } });
  find(e.render(), (n) => n.props?.id === 't').props.onChange({ target: { value: 'Written offline' } });
  e.render(); await e.runTimers();
  assert.equal(e.writes.length, 0);
  assert.equal(find(e.render(), (n) => n.props?.id === 't').props.value, 'Written offline');
  e.events.online(); e.render(); await e.runTimers(); e.render();
  assert.equal(e.writes.length, 1); assert.equal(e.writes[0].title, 'Written offline');
  e.dispose();
});

test('an unreadable contribution score is an error rather than a zero score', async () => {
  const { fetchMyContributorScore } = await load('src/creator/data.ts', ['fetchMyContributorScore'], {
    db: {}, doc: () => ({}), getDoc: async () => { throw Error('Network unavailable'); },
  });
  await assert.rejects(fetchMyContributorScore('creator'), /Network unavailable/);
});

test('draft recovery stores only an account-scoped saved document pointer', async () => {
  const e = await editorHarness();
  find(e.render(), (n) => n.props?.id === 't').props.onChange({ target: { value: 'Private unsent story' } });
  e.render(); await e.runTimers(); e.render();
  assert.equal(e.stored.get('tribestudio:last-draft:creator:open'), 'saved-draft');
  assert.equal([...e.stored.values()].some((value) => value.includes('Private unsent story')), false);
  e.dispose();
});

test('dashboard counts approved work separately from published work', async () => {
  const h = hooks();
  const resources = { work: [{id:'a', status:'APPROVED', campaign:{id:'test'}}, {id:'p', status:'PUBLISHED', campaign:{id:'open'}}], profile: null, applications: [], campaigns: [], notifications: [], score: null };
  const { DashboardPage } = await load('src/creator/pages/DashboardPage.tsx', ['DashboardPage'], {
    ...h.api, useAuth: () => ({user:{uid:'creator'}, role:'creator'}), useConfig: () => ({}), canContribute: () => false,
    fetchMySubmissions:'work', fetchMyProfile:'profile', fetchMyApplications:'applications', fetchPublicCampaigns:'campaigns', fetchMyNotifications:'notifications', fetchMyContributorScore:'score',
    useCreatorResource: (key) => ({data:resources[key], loading:false, failed:false, retry(){}}),
    submissionsOpen: () => false, Link:'a', StatusPill:'pill', Skeleton:'skeleton', LoadError:'error', WhatsAppCard:'whatsapp', APPLICATION_STATUS_LABELS:{}, SUBMISSION_STATUS_LABELS:{},
  });
  const tree = h.render(DashboardPage);
  for (const status of ['APPROVED', 'PUBLISHED']) {
    const tile = find(tree, (node) => node.props?.to === `/studio/submissions?status=${status}`);
    assert.equal(find(tile, (node) => node.props?.className === 'tile__value').props.children[0], 1);
  }
});

test('contributor password activation signs in and stays on the assigned portal', async () => {
  const h = hooks(), calls = [];
  const path = '/contributor/alice/work';
  const { ContributorSignIn } = await load('src/contributor/ContributorPortal.tsx', ['ContributorSignIn'], {
    ...h.api, functions: {}, httpsCallable: () => async () => {}, auth: {},
    useRoute: () => ({ path, navigate: (...args) => calls.push(['navigate', ...args]) }),
    verifyPasswordResetCode: async () => 'alice@example.com',
    confirmPasswordReset: async (...args) => calls.push(['activate', ...args]),
    signInWithEmailAndPassword: async (...args) => calls.push(['signin', ...args]),
  });
  let tree = h.render(ContributorSignIn, { code: 'code' }); h.flush(); await tick();
  tree = h.render(ContributorSignIn, { code: 'code' });
  find(tree, n => n.type === 'input' && n.props.type === 'password').props.onChange({ target: { value: 'password123' } });
  tree = h.render(ContributorSignIn, { code: 'code' });
  await tree.props.onSubmit({ preventDefault() {} });
  assert.equal(calls[0][0], 'activate'); assert.equal(calls[1][0], 'signin');
  assert.equal(calls[1][2], 'alice@example.com'); assert.equal(calls[2][1], path);
});

test('contributor autosave keeps full expressions and submits with the latest revision', async () => {
  const h = hooks(), calls = [], timers = new Map(); let timerId = 0;
  const item = { id: 'item', expression: 'How are you?', translation: '', alternatives: [], revision: 0, status: 'draft' };
  const { ExpressionEditor } = await load('src/contributor/ContributorPortal.tsx', ['ExpressionEditor'], {
    ...h.api, functions: {}, httpsCallable: () => async data => { calls.push(plain(data)); return { data: { revision: data.revision + 1 } }; },
    window: { setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id), addEventListener() {}, removeEventListener() {} },
  });
  const props = { item, work: 'work', onPending() {} };
  let tree = h.render(ExpressionEditor, props); h.flush();
  find(tree, n => n.type === 'textarea' && n.props.required).props.onChange({ target: { value: 'A whole expression, with punctuation' } });
  tree = h.render(ExpressionEditor, props); h.flush();
  for (const fn of timers.values()) fn(); timers.clear(); await tick();
  tree = h.render(ExpressionEditor, props);
  find(tree, n => n.type === 'input' && n.props.required).props.onChange({ target: { checked: true } });
  tree = h.render(ExpressionEditor, props);
  await tree.props.onSubmit({ preventDefault() {} });
  assert.equal(calls[0].translation, 'A whole expression, with punctuation');
  assert.equal(calls[1].revision, 1); assert.equal(calls[1].submit, true);
  assert.equal(calls[1].aiTraining, false);
  h.dispose();
});

test('failed contributor autosave retains text and prevents unsafe submission', async () => {
  const h = hooks(); let timer;
  const { ExpressionEditor } = await load('src/contributor/ContributorPortal.tsx', ['ExpressionEditor'], {
    ...h.api, functions: {}, httpsCallable: () => async () => { throw new Error('Offline'); },
    window: { setTimeout: fn => { timer = fn; return 1; }, clearTimeout() {}, addEventListener() {}, removeEventListener() {} },
  });
  const props = { item: { id: 'item', expression: 'Hello', translation: '', alternatives: [], revision: 0 }, work: 'work', onPending() {} };
  let tree = h.render(ExpressionEditor, props); h.flush();
  find(tree, n => n.type === 'textarea' && n.props.required).props.onChange({ target: { value: 'Keep this draft' } });
  tree = h.render(ExpressionEditor, props); h.flush(); timer(); await tick();
  tree = h.render(ExpressionEditor, props);
  assert.equal(find(tree, n => n.type === 'textarea' && n.props.required).props.value, 'Keep this draft');
  assert.ok(find(tree, n => n.props?.role === 'alert'));
  assert.equal(find(tree, n => n.type === 'button' && !n.props.type).props.disabled, true);
  h.dispose();
});

test('contributor views distinguish empty expressions, saved drafts, submissions and review outcomes', async () => {
  const { expressionView } = await load('src/contributor/ContributorPortal.tsx', ['expressionView'], { functions: {}, httpsCallable: () => () => {} });
  assert.equal(expressionView({ translation: '', status: 'draft' }), 'untranslated');
  assert.equal(expressionView({ translation: 'Kasem draft', status: 'draft' }), 'translated');
  assert.equal(expressionView({ translation: 'Kasem answer', status: 'submitted', submissionId: 's' }), 'translated');
  assert.equal(expressionView({ translation: 'Kasem answer', status: 'verified', submissionId: 's' }), 'reviewed');
  assert.equal(expressionView({ translation: 'Kasem answer', status: 'rejected', submissionId: 's' }), 'reviewed');
  assert.equal(expressionView({ translation: 'Kasem answer', status: 'under_review', reviewedAt: '2026-09-16', submissionId: 's' }), 'reviewed');
});

test('uninvited signed-in users cannot render the contributor dashboard or load assignments', async () => {
  const h = hooks(); const paths = [];
  const { ContributorPortal } = await load('src/contributor/ContributorPortal.tsx', ['ContributorPortal'], {
    ...h.api, functions: {}, db: {}, httpsCallable: () => () => {},
    useAuth: () => ({ user: { uid: 'outsider' }, ready: true }),
    useRoute: () => ({ path: '/contributor/outsider/work', search: '', navigate() {} }),
    matchRoute: () => ({ uid: 'outsider', work: 'work' }),
    doc: (_db, ...parts) => parts.join('/'), collection: (_db, ...parts) => parts.join('/'),
    onSnapshot: (path, cb) => { paths.push(path); cb({ get: () => undefined }); return () => {}; },
  });
  h.render(ContributorPortal); h.flush();
  const tree = h.render(ContributorPortal); h.flush();
  assert.equal(find(tree, n => n.props?.className === 'contributor-workspace'), null);
  assert.ok(find(tree, n => n.props?.role === 'alert'));
  assert.deepEqual([...new Set(paths)], ['contributorAccounts/outsider']);
  h.dispose();
});

test('assignment filters separate saved drafts from submissions and revision feedback', async () => {
  const { contributionState } = await load('src/contributor/ContributorPortal.tsx', ['contributionState'], { functions: {}, httpsCallable: () => () => {} });
  assert.equal(contributionState({ translation: '', alternatives: [], status: 'draft' }), 'Not started');
  assert.equal(contributionState({ translation: 'Answer', status: 'draft' }), 'Drafts');
  assert.equal(contributionState({ translation: '', alternatives: ['Alternate'], status: 'draft' }), 'Drafts');
  assert.equal(contributionState({ translation: 'Answer', submissionId: 's', status: 'verified' }), 'Submitted');
  assert.equal(contributionState({ translation: 'Answer', submissionId: 's', status: 'rejected' }), 'Needs revision');
});

test('submit and next advances only after a successful submission', async () => {
  const h = hooks(), sent = [];
  const { ExpressionEditor } = await load('src/contributor/ContributorPortal.tsx', ['ExpressionEditor'], {
    ...h.api, functions: {}, httpsCallable: () => async () => ({ data: { revision: 1, submissionId: 's' } }),
    window: { setTimeout() {}, clearTimeout() {}, addEventListener() {}, removeEventListener() {} },
  });
  const props = { item: { id: 'item', expression: 'Hello', translation: 'Answer', alternatives: [], revision: 0 }, work: 'work', onPending() {}, onSubmitted: next => sent.push(next) };
  let tree = h.render(ExpressionEditor, props); h.flush();
  await tree.props.onSubmit({ preventDefault() {}, nativeEvent: { submitter: { getAttribute: () => 'next' } } });
  assert.deepEqual(sent, [true]);
  tree = h.render(ExpressionEditor, props);
  assert.equal(find(tree, n => n.type === 'textarea' && n.props.required).props.disabled, true);
  h.dispose();
});

test('retry save preserves edited text after a connection failure', async () => {
  const h = hooks(); let timer, attempts = 0; const calls = [];
  const { ExpressionEditor } = await load('src/contributor/ContributorPortal.tsx', ['ExpressionEditor'], {
    ...h.api, functions: {}, httpsCallable: () => async data => { calls.push(plain(data)); if (++attempts === 1) throw new Error('Offline'); return { data: { revision: 1 } }; },
    window: { setTimeout: fn => { timer = fn; return 1; }, clearTimeout() {}, addEventListener() {}, removeEventListener() {} },
  });
  const props = { item: { id: 'item', expression: 'Hello', translation: '', alternatives: [], revision: 0 }, work: 'work', onPending() {} };
  let tree = h.render(ExpressionEditor, props); h.flush();
  find(tree, n => n.type === 'textarea' && n.props.required).props.onChange({ target: { value: 'Keep this text' } });
  tree = h.render(ExpressionEditor, props); h.flush(); timer(); await tick();
  tree = h.render(ExpressionEditor, props);
  find(tree, n => n.type === 'button' && n.props.children?.includes('Retry save')).props.onClick(); await tick();
  tree = h.render(ExpressionEditor, props);
  assert.equal(calls[1].translation, 'Keep this text');
  assert.equal(find(tree, n => n.type === 'textarea' && n.props.required).props.value, 'Keep this text');
  assert.equal(find(tree, n => n.props?.role === 'alert'), null);
  h.dispose();
});

test('browser recovery is account scoped and restores only after contributor action', async () => {
  const stored = new Map(); let h = hooks();
  const mocks = () => ({ ...h.api, functions: {}, httpsCallable: () => async () => ({ data: { revision: 1 } }),
    window: { localStorage: { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) }, setTimeout() {}, clearTimeout() {}, addEventListener() {}, removeEventListener() {} } });
  let { ExpressionEditor } = await load('src/contributor/ContributorPortal.tsx', ['ExpressionEditor'], mocks());
  const props = { item: { id: 'item', expression: 'Hello', translation: '', alternatives: [], revision: 0 }, work: 'work', accountId: 'alice', onPending() {} };
  let tree = h.render(ExpressionEditor, props); h.flush();
  find(tree, n => n.type === 'textarea' && n.props.required).props.onChange({ target: { value: 'Unsaved Kasem text' } });
  assert.ok(stored.has('contributor-draft:alice:work:item'));
  h.dispose(); h = hooks();
  ({ ExpressionEditor } = await load('src/contributor/ContributorPortal.tsx', ['ExpressionEditor'], mocks()));
  tree = h.render(ExpressionEditor, props); h.flush();
  assert.equal(find(tree, n => n.type === 'textarea' && n.props.required).props.value, '');
  find(tree, n => n.type === 'button' && n.props.children?.includes('Restore draft')).props.onClick();
  tree = h.render(ExpressionEditor, props);
  assert.equal(find(tree, n => n.type === 'textarea' && n.props.required).props.value, 'Unsaved Kasem text');
  h.dispose(); h = hooks();
  ({ ExpressionEditor } = await load('src/contributor/ContributorPortal.tsx', ['ExpressionEditor'], mocks()));
  tree = h.render(ExpressionEditor, { ...props, accountId: 'bob' });
  assert.equal(find(tree, n => n.type === 'button' && n.props.children?.includes('Restore draft')), null);
  h.dispose();
});

test('forgot password sends the entered email without requiring a password', async () => {
  const h = hooks(), requests = [];
  const { ContributorSignIn } = await load('src/contributor/ContributorPortal.tsx', ['ContributorSignIn'], {
    ...h.api, functions: {}, httpsCallable: () => () => {}, auth: {},
    useRoute: () => ({ path: '/contributor', navigate() {} }),
    sendPasswordResetEmail: async (_auth, email, options) => requests.push({ email, options }),
    window: { location: { origin: 'https://tribestudio.indigenworld.com' } },
  });
  let tree = h.render(ContributorSignIn, { code: null });
  find(tree, n => n.type === 'button' && n.props.children?.includes('Forgot password?')).props.onClick();
  tree = h.render(ContributorSignIn, { code: null });
  assert.equal(find(tree, n => n.type === 'input' && n.props.type === 'password'), null);
  find(tree, n => n.type === 'input' && n.props.type === 'email').props.onChange({ target: { value: 'speaker@example.com' } });
  tree = h.render(ContributorSignIn, { code: null });
  await tree.props.onSubmit({ preventDefault() {} });
  assert.equal(requests[0].email, 'speaker@example.com');
  assert.equal(requests[0].options.url, 'https://tribestudio.indigenworld.com/contributor');
  tree = h.render(ContributorSignIn, { code: null });
  assert.ok(find(tree, n => n.props?.role === 'status'));
  h.dispose();
});


test('skip needs no translation or consent and advances only after the flag saves', async () => {
  for (const fail of [false, true]) {
    const h = hooks(), calls = [], advances = [];
    const { ExpressionEditor, contributionState } = await load('src/contributor/ContributorPortal.tsx', ['ExpressionEditor', 'contributionState'], {
      ...h.api, functions: {}, httpsCallable: () => async data => { calls.push(plain(data)); if (fail) throw new Error('Offline'); return { data: { revision: 1 } }; },
      window: { setTimeout() {}, clearTimeout() {}, addEventListener() {}, removeEventListener() {} },
    });
    const props = { item: { id: 'item', expression: 'Hello', translation: '', alternatives: [], revision: 0 }, work: 'work', onPending() {}, onSkipped: () => advances.push(true) };
    const tree = h.render(ExpressionEditor, props); h.flush();
    await find(tree, n => n.type === 'button' && n.props.children?.includes('Skip / I’m not sure →')).props.onClick();
    assert.equal(calls[0].skip, true); assert.equal(calls[0].submit, false);
    assert.equal(calls[0].translation, ''); assert.equal(calls[0].publicationPermission, false);
    assert.deepEqual(advances, fail ? [] : [true]);
    assert.equal(contributionState({ ...props.item, unsure: true }), 'I’m not sure');
    h.dispose();
  }
});

test('activation confirms the chosen password before calling the backend', async () => {
  const h = hooks(), calls = [], signIns = [];
  const { ContributorActivation } = await load('src/contributor/ContributorPortal.tsx', ['ContributorActivation'], {
    ...h.api, functions: {}, httpsCallable: (_functions, name) => async data => calls.push({ name, ...data }),
    auth: { currentUser: { email: 'speaker@example.com' } },
    signInWithEmailAndPassword: async (_auth, email, password) => signIns.push({ email, password }),
  });
  let tree = h.render(ContributorActivation);
  find(tree, n => n.type === 'input').props.onChange({ target: { value: 'new-password' } });
  tree = h.render(ContributorActivation);
  await tree.props.onSubmit({ preventDefault() {} });
  assert.equal(calls.length, 0);
  tree = h.render(ContributorActivation);
  const labels = tree.props.children.flat(Infinity).filter(n => n?.type === 'label');
  find(labels[1], n => n.type === 'input').props.onChange({ target: { value: 'new-password' } });
  tree = h.render(ContributorActivation);
  await tree.props.onSubmit({ preventDefault() {} });
  assert.deepEqual(calls, [{ name: 'activateExpressionContributor', password: 'new-password' }]);
  assert.deepEqual(signIns, [{ email: 'speaker@example.com', password: 'new-password' }]);
});
