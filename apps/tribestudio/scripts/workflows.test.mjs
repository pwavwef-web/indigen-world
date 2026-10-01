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
const MODEL_EXPORTS = ['contributionState', 'expressionView', 'submittedCount', 'nextContribution', 'itemStatus', 'STATUS_META',
  'metricsFor', 'workState', 'WORK_STATE_META', 'parseDate', 'formatDate', 'formatDateTime', 'relativeTime', 'dueInfo',
  'activityFrom', 'groupByDay', 'friendlyError', 'initials', 'firstName', 'pluralise', 'formatBytes'];

async function load(path, names, mocks = {}) {
  if (path.endsWith('SubmissionNewPage.tsx')) {
    mocks = { ...await load('src/creator/discoverySource.ts', ['discoverySource']), ...mocks };
  }
  // Contributor workspace modules share the pure model; load the real one.
  if (path.startsWith('src/contributor/') && !path.endsWith('model.ts')) {
    mocks = { ...await load('src/contributor/model.ts', MODEL_EXPORTS), ...mocks };
  }
  if (path === 'src/contributor/editor.tsx') {
    mocks = { ...await load('src/contributor/listMemory.ts', ['useListMemory', 'useListScroll'], mocks), ...mocks };
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
  const { ExpressionEditor } = await load('src/contributor/editor.tsx', ['ExpressionEditor'], {
    ...h.api, functions: {}, httpsCallable: () => async data => { calls.push(plain(data)); return { data: { revision: data.revision + 1 } }; },
    window: { setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id), addEventListener() {}, removeEventListener() {} },
  });
  const props = { item, work: 'work', onPending() {} };
  let tree = h.render(ExpressionEditor, props); h.flush();
  find(tree, n => n.type === 'textarea' && n.props.required).props.onChange({ target: { value: 'A whole expression, with punctuation' } });
  tree = h.render(ExpressionEditor, props); h.flush();
  for (const fn of timers.values()) fn(); timers.clear(); await tick();
  tree = h.render(ExpressionEditor, props);
  assert.equal(find(tree, n => n.type === 'button' && n.props.type === 'submit').props.disabled, false,
    'Submit remains reachable so the browser can guide contributors to missing permission');
  await tree.props.onSubmit({ preventDefault() {} });
  find(tree, n => n.type === 'button' && n.props.children.includes('Confirm submission')).props.onClick(); await tick();
  assert.equal(calls.length, 1, 'Neither submission action can send without explicit sharing permission');
  find(tree, n => n.type === 'input' && n.props.required).props.onChange({ target: { checked: true } });
  tree = h.render(ExpressionEditor, props);
  await tree.props.onSubmit({ preventDefault() {} });
  assert.equal(calls.length, 1, 'Review must not submit the answer');
  find(tree, n => n.type === 'button' && n.props.children.includes('Confirm submission')).props.onClick(); await tick();
  assert.equal(calls[0].translation, 'A whole expression, with punctuation');
  assert.equal(calls[1].revision, 1); assert.equal(calls[1].submit, true);
  assert.equal(calls[1].aiTraining, false);
  h.dispose();
});

test('contributor adds and removes structured alternative translation fields', async () => {
  const h = hooks();
  const { ExpressionEditor } = await load('src/contributor/editor.tsx', ['ExpressionEditor'], {
    ...h.api, functions: {}, httpsCallable: () => async () => ({ data: { revision: 1 } }),
    window: { setTimeout() {}, clearTimeout() {}, addEventListener() {}, removeEventListener() {} },
  });
  const props = { item: { id: 'item', expression: 'Hello', translation: '', alternatives: [], revision: 0, status: 'draft' }, work: 'work', onPending() {} };
  let tree = h.render(ExpressionEditor, props); h.flush();
  find(tree, n => n.type === 'button' && n.props.className === 'add-alternative').props.onClick();
  tree = h.render(ExpressionEditor, props);
  const alternative = find(tree, n => n.type === 'input' && n.props.name === 'alternatives');
  assert.ok(alternative); alternative.props.onChange({ target: { value: 'Alternative phrase' } });
  tree = h.render(ExpressionEditor, props);
  assert.equal(find(tree, n => n.type === 'input' && n.props.name === 'alternatives').props.value, 'Alternative phrase');
  find(tree, n => n.type === 'button' && n.props['aria-label'] === 'Remove alternative 1').props.onClick();
  tree = h.render(ExpressionEditor, props);
  assert.equal(find(tree, n => n.type === 'input' && n.props.name === 'alternatives'), null);
  h.dispose();
});

test('failed contributor autosave retains text and prevents unsafe submission', async () => {
  const h = hooks(); let timer;
  const { ExpressionEditor } = await load('src/contributor/editor.tsx', ['ExpressionEditor'], {
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
  assert.equal(find(tree, n => n.type === 'button' && n.props.type === 'submit').props.disabled, true);
  h.dispose();
});

test('contributor views distinguish empty expressions, saved drafts, submissions and review outcomes', async () => {
  const { expressionView } = await load('src/contributor/model.ts', ['expressionView'], { functions: {}, httpsCallable: () => () => {} });
  assert.equal(expressionView({ translation: '', status: 'draft' }), 'untranslated');
  assert.equal(expressionView({ translation: 'Kasem draft', status: 'draft' }), 'translated');
  assert.equal(expressionView({ translation: 'Kasem answer', status: 'submitted', submissionId: 's' }), 'translated');
  assert.equal(expressionView({ translation: 'Kasem answer', status: 'verified', submissionId: 's' }), 'reviewed');
  assert.equal(expressionView({ translation: 'Kasem answer', status: 'rejected', submissionId: 's' }), 'reviewed');
  assert.equal(expressionView({ translation: 'Kasem answer', status: 'under_review', reviewedAt: '2026-09-16', submissionId: 's' }), 'reviewed');
});

test('uninvited signed-in users cannot render the contributor dashboard or load assignments', async () => {
  const h = hooks(); const paths = [];
  const { invitationLinkOwner } = await load('src/contributor/workspace.tsx', ['invitationLinkOwner'], { createContext: () => ({}) });
  const { ContributorPortal } = await load('src/contributor/ContributorPortal.tsx', ['ContributorPortal'], {
    ...h.api, functions: {}, db: {}, httpsCallable: () => () => {},
    useAuth: () => ({ user: { uid: 'outsider' }, ready: true }),
    useRoute: () => ({ path: '/contributor/outsider/work', search: '', navigate() {} }),
    invitationLinkOwner, canValidate: () => false,
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

test('the review URL requires a review role and does not require a contributor invitation', async () => {
  const { canValidate } = await load('src/auth.ts', ['canValidate'], { GoogleAuthProvider: class {} });
  for (const role of [null, 'creator', 'contributor', 'validator', 'reviewer', 'admin', 'super_admin']) {
    const h = hooks(); let reads = 0;
    const ReviewDesk = () => {};
    const { ContributorPortal } = await load('src/contributor/ContributorPortal.tsx', ['ContributorPortal'], {
      ...h.api, db: {}, ReviewDesk, canValidate,
      useAuth: () => ({ user: { uid: 'test' }, role, ready: true }),
      useRoute: () => ({ path: '/contributor/review', search: '' }),
      invitationLinkOwner: () => null,
      onSnapshot: () => { reads++; return () => {}; },
    });
    const tree = h.render(ContributorPortal); h.flush();
    assert.equal(Boolean(find(tree, node => node.type === ReviewDesk)), canValidate(role), String(role));
    assert.equal(reads, 0, 'review access never starts contributor data reads');
    h.dispose();
  }
});

test('review decisions respect status, feedback, consent and linked dictionary entries', async () => {
  const { decisionsFor, decisionRequest, safeUrl } = await load('src/contributor/review/model.ts', ['decisionsFor', 'decisionRequest', 'safeUrl']);
  const item = { id: 's', status: 'SUBMITTED', collectionKind: 'dictionary', permissions: {} };
  assert.ok(!decisionsFor('contributions', item).includes('REQUEST_REVISION'));
  assert.ok(decisionsFor('contributions', { ...item, wordQueueId: 'q' }).includes('REQUEST_REVISION'));
  assert.throws(() => decisionRequest('contributions', item, 'PUBLISH', '', 'headword', ''), /unavailable/);
  assert.throws(() => decisionRequest('contributions', item, 'REJECT', 'no', 'headword', ''), /5 characters/);
  assert.throws(() => decisionRequest('contributions', item, 'APPROVE', '', 'training', ''), /permission/);
  assert.throws(() => decisionRequest('contributions', item, 'APPROVE', '', 'variant', ''), /existing dictionary/);
  assert.throws(() => decisionRequest('contributions', item, 'APPROVE', '', 'example', 'entry'), /Kasem example/);
  const request = decisionRequest('contributions', item, 'APPROVE', ' checked ', 'variant', 'word');
  assert.equal(request.callable, 'decideSubmission');
  assert.equal(request.data.entryId, 'word');
  assert.equal(request.data.feedback, 'checked');
  assert.ok(!decisionsFor('contributions', { ...item, status: 'APPROVED' }).includes('PUBLISH'));
  assert.ok(decisionsFor('contributions', { ...item, status: 'APPROVED', permissions: { publication: true } }).includes('PUBLISH'));
  assert.equal(decisionsFor('contributions', { ...item, status: 'PUBLISHED' }).length, 0);
  assert.equal(decisionRequest('names', { id: 'n', status: 'pending' }, 'approve', '', '', '').callable, 'decideKasemNameRequest');
  assert.equal(decisionRequest('adverts', { id: 'a', status: 'ACTIVE' }, 'PAUSE', '', '', '').callable, 'decideAdCampaign');
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('https://example.com'), 'https://example.com/');
});

test('the review desk mounts no queue listeners for guests, contributors or unresolved access', async () => {
  const { canValidate } = await load('src/auth.ts', ['canValidate'], { GoogleAuthProvider: class {} });
  for (const state of [{ ready: false, user: { uid: 'u' }, role: 'validator' }, { ready: true, user: null, role: null }, { ready: true, user: { uid: 'u' }, role: 'contributor' }]) {
    const h = hooks(); let reads = 0;
    const { ReviewDesk } = await load('src/contributor/review/ReviewDesk.tsx', ['ReviewDesk'], {
      ...h.api, canValidate, useAuth: () => state,
      onSnapshot: () => { reads++; return () => {}; },
    });
    const tree = h.render(ReviewDesk); h.flush();
    assert.equal(tree.type, 'p');
    assert.equal(reads, 0);
    h.dispose();
  }
});

test('assignment filters separate saved drafts from submissions and revision feedback', async () => {
  const { contributionState } = await load('src/contributor/model.ts', ['contributionState'], { functions: {}, httpsCallable: () => () => {} });
  assert.equal(contributionState({ translation: '', alternatives: [], status: 'draft' }), 'Not started');
  assert.equal(contributionState({ translation: 'Answer', status: 'draft' }), 'Drafts');
  assert.equal(contributionState({ translation: '', alternatives: ['Alternate'], status: 'draft' }), 'Drafts');
  assert.equal(contributionState({ translation: 'Answer', submissionId: 's', status: 'verified' }), 'Submitted');
  assert.equal(contributionState({ translation: 'Answer', submissionId: 's', status: 'rejected' }), 'Needs revision');
});

test('submit and next advances only after a successful submission', async () => {
  const h = hooks(), sent = [];
  const { ExpressionEditor } = await load('src/contributor/editor.tsx', ['ExpressionEditor'], {
    ...h.api, functions: {}, httpsCallable: () => async () => ({ data: { revision: 1, submissionId: 's' } }),
    window: { setTimeout() {}, clearTimeout() {}, addEventListener() {}, removeEventListener() {} },
  });
  const props = { item: { id: 'item', expression: 'Hello', translation: 'Answer', alternatives: [], revision: 0 }, work: 'work', onPending() {}, onSubmitted: next => sent.push(next) };
  let tree = h.render(ExpressionEditor, props); h.flush();
  find(tree, n => n.type === 'input' && n.props.required).props.onChange({ target: { checked: true } });
  tree = h.render(ExpressionEditor, props);
  await tree.props.onSubmit({ preventDefault() {}, nativeEvent: { submitter: { getAttribute: () => 'next' } } });
  assert.deepEqual(sent, [], 'Opening review must not advance');
  find(tree, n => n.type === 'button' && n.props.children.includes('Confirm submission')).props.onClick(); await tick();
  assert.deepEqual(sent, [true]);
  tree = h.render(ExpressionEditor, props);
  assert.equal(find(tree, n => n.type === 'textarea' && n.props.required).props.disabled, true);
  h.dispose();
});

test('retry save preserves edited text after a connection failure', async () => {
  const h = hooks(); let timer, attempts = 0; const calls = [];
  const { ExpressionEditor } = await load('src/contributor/editor.tsx', ['ExpressionEditor'], {
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
  let { ExpressionEditor } = await load('src/contributor/editor.tsx', ['ExpressionEditor'], mocks());
  const props = { item: { id: 'item', expression: 'Hello', translation: '', alternatives: [], revision: 0 }, work: 'work', accountId: 'alice', onPending() {} };
  let tree = h.render(ExpressionEditor, props); h.flush();
  find(tree, n => n.type === 'textarea' && n.props.required).props.onChange({ target: { value: 'Unsaved Kasem text' } });
  assert.ok(stored.has('contributor-draft:alice:work:item'));
  h.dispose(); h = hooks();
  ({ ExpressionEditor } = await load('src/contributor/editor.tsx', ['ExpressionEditor'], mocks()));
  tree = h.render(ExpressionEditor, props); h.flush();
  assert.equal(find(tree, n => n.type === 'textarea' && n.props.required).props.value, '');
  find(tree, n => n.type === 'button' && n.props.children?.includes('Restore draft')).props.onClick();
  tree = h.render(ExpressionEditor, props);
  assert.equal(find(tree, n => n.type === 'textarea' && n.props.required).props.value, 'Unsaved Kasem text');
  h.dispose(); h = hooks();
  ({ ExpressionEditor } = await load('src/contributor/editor.tsx', ['ExpressionEditor'], mocks()));
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
    const { ExpressionEditor, contributionState } = await load('src/contributor/editor.tsx', ['ExpressionEditor', 'contributionState'], {
      ...h.api, functions: {}, httpsCallable: () => async data => { calls.push(plain(data)); if (fail) throw new Error('Offline'); return { data: { revision: 1 } }; },
      window: { setTimeout() {}, clearTimeout() {}, addEventListener() {}, removeEventListener() {} },
    });
    const props = { item: { id: 'item', expression: 'Hello', translation: '', alternatives: [], revision: 0 }, work: 'work', onPending() {}, onSkipped: () => advances.push(true) };
    const tree = h.render(ExpressionEditor, props); h.flush();
    await find(tree, n => n.type === 'button' && n.props.children?.includes('Flag as unsure and skip')).props.onClick();
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

test('contributor progress excludes returned revisions and continue prioritizes them', async () => {
  const { submittedCount, nextContribution } = await load('src/contributor/model.ts', ['submittedCount', 'nextContribution'], { functions: {}, httpsCallable: () => () => {} });
  const items = [
    { id: 'new', status: 'draft' },
    { id: 'review', status: 'submitted', submissionId: 's1' },
    { id: 'approved', status: 'verified', submissionId: 's2' },
    { id: 'returned', status: 'rejected', submissionId: 's3' },
  ];
  assert.equal(submittedCount(items), 2);
  assert.equal(nextContribution(items).id, 'returned');
  assert.equal(nextContribution(items.slice(0, 3)).id, 'new');
  assert.equal(nextContribution(items.slice(1, 3)), undefined);
  assert.equal(nextContribution([{ id: 'unsure', unsure: true }, { id: 'draft' }]).id, 'draft');
});

test('overview metrics never count submitted as approved, and every expression lands in one bucket', async () => {
  const { metricsFor, workState } = await load('src/contributor/model.ts', ['metricsFor', 'workState']);
  const items = [
    { id: 'new', translation: '', alternatives: [], status: 'draft' },
    { id: 'draft', translation: 'Kasem', alternatives: [], status: 'draft' },
    { id: 'unsure', translation: '', alternatives: [], status: 'draft', unsure: true },
    { id: 'waiting', translation: 'Kasem', alternatives: [], status: 'submitted', submissionId: 's1' },
    { id: 'review', translation: 'Kasem', alternatives: [], status: 'under_review', submissionId: 's2' },
    { id: 'approved', translation: 'Kasem', alternatives: [], status: 'verified', submissionId: 's3' },
    { id: 'returned', translation: 'Kasem', alternatives: [], status: 'rejected', submissionId: 's4' },
    { id: 'returned-unsure', translation: 'Kasem', alternatives: [], status: 'needs_revision', submissionId: 's5', unsure: true },
  ];
  const metrics = plain(metricsFor(items));
  assert.deepEqual(metrics, { total: 8, submitted: 5, awaiting: 2, approved: 1, returned: 2, other: 0, drafts: 1, unsure: 1, notStarted: 1 });
  assert.equal(metrics.awaiting + metrics.approved + metrics.returned + metrics.other, metrics.submitted);
  assert.equal(metrics.awaiting + metrics.approved + metrics.returned + metrics.drafts + metrics.unsure + metrics.notStarted, metrics.total);
  assert.equal(workState(items), 'needs_attention');
  assert.equal(workState(items.slice(3, 6)), 'awaiting_review');
  assert.equal(workState([items[5]]), 'complete');
  assert.equal(workState(items.slice(0, 1)), 'not_started');
});

test('a bare internal error becomes an explanation, and server references are kept', async () => {
  const { friendlyError } = await load('src/contributor/model.ts', ['friendlyError']);
  const unreachable = friendlyError({ code: 'functions/internal', message: 'internal' }, 'Payment settings');
  assert.notEqual(unreachable.message, 'internal');
  assert.match(unreachable.message, /^Payment settings could not be reached/);
  const referenced = friendlyError({ code: 'functions/internal', message: 'This could not be completed … reference IW-1A2B3C4D …', details: { reference: 'IW-1A2B3C4D' } }, 'Payment settings');
  assert.equal(referenced.reference, 'IW-1A2B3C4D');
  assert.equal(friendlyError({ code: 'functions/permission-denied', message: 'Finance access is required.' }, 'x').message, 'Finance access is required.');
  assert.equal(friendlyError({ code: 'auth/wrong-password', message: 'Firebase: Error (auth/wrong-password).' }, 'x').message, 'That password is not correct.');
  assert.match(friendlyError({ code: 'functions/unavailable', message: 'unavailable' }, 'Kawuri').message, /did not respond/);
});

test('portal routes keep SMS assignment links and map every section', async () => {
  const { parsePortalRoute } = await load('src/contributor/workspace.tsx', ['parsePortalRoute'], { createContext: () => ({}) });
  const route = (path, search = '') => { const value = parsePortalRoute(path, search, '/contributor', false); return { ...value, query: undefined }; };
  assert.deepEqual(plain(route('/contributor')), { section: 'overview', accountTab: 'profile', notFound: false });
  assert.equal(route('/contributor/uid-1/work-9').section, 'assignments');
  assert.equal(route('/contributor/uid-1/work-9').work, 'work-9');
  assert.equal(route('/contributor/uid-1/work-9', '?item=abc').item, 'abc');
  for (const section of ['assignments', 'contributions', 'activity', 'guide', 'kawuri']) assert.equal(route(`/contributor/${section}`).section, section);
  assert.equal(route('/contributor/account/payments').accountTab, 'payments');
  assert.equal(route('/contributor/account').accountTab, 'profile');
  assert.equal(route('/contributor/account/secrets').notFound, true);
  assert.equal(route('/contributor/a/b/c').notFound, true);
  const preview = parsePortalRoute('/contributor/preview/assignment/everyday', '', '/contributor/preview', true);
  assert.equal(preview.work, 'everyday');
  assert.equal(parsePortalRoute('/contributor/preview/x/y', '', '/contributor/preview', true).notFound, true);
});

test('account pages are never mistaken for an invitation link to another account', async () => {
  const { invitationLinkOwner } = await load('src/contributor/workspace.tsx', ['invitationLinkOwner'], { createContext: () => ({}) });
  assert.equal(invitationLinkOwner('/contributor/uid-1/work-9'), 'uid-1');
  // Same shape as /contributor/{uid}/{work}; the gate must not send it to "sign in as another account".
  for (const tab of ['profile', 'security', 'notifications', 'payments']) assert.equal(invitationLinkOwner(`/contributor/account/${tab}`), null);
  for (const path of ['/contributor', '/contributor/assignments', '/contributor/account', '/contributor/a/b/c', '/studio/a/b']) {
    assert.equal(invitationLinkOwner(path), null, path);
  }
});

test('activity comes only from real rounds, assignments and payment notices, newest first', async () => {
  const { activityFrom, dueInfo } = await load('src/contributor/model.ts', ['activityFrom', 'dueInfo']);
  const events = activityFrom([
    { id: 'r1', work: 'w', item: 'i1', expression: 'Hello', status: 'APPROVED', createdAt: '2026-09-20T08:00:00.000Z', decidedAt: '2026-09-21T08:00:00.000Z', feedback: '', revisionOf: '' },
    { id: 'r2', work: 'w', item: 'i2', expression: 'Sit with us', status: 'REJECTED', createdAt: '2026-09-20T09:00:00.000Z', decidedAt: '2026-09-22T08:00:00.000Z', feedback: 'Use the everyday invitation.', revisionOf: '' },
    { id: 'r3', work: 'w', item: 'i2', expression: 'Sit with us', status: 'SUBMITTED', createdAt: '2026-09-23T08:00:00.000Z', decidedAt: '', feedback: '', revisionOf: 'r2' },
  ], [{ id: 'w', title: 'Everyday', createdAt: '2026-09-19T08:00:00.000Z' }], [{ id: 'n', title: 'Your bank account is verified', body: '', createdAt: '2026-09-22T12:00:00.000Z' }]);
  assert.deepEqual(plain(events.map((event) => event.kind)), ['resubmitted', 'payment', 'returned', 'approved', 'submitted', 'submitted', 'assigned']);
  assert.equal(events.find((event) => event.kind === 'returned').detail, 'Use the everyday invitation.');
  assert.equal(events.find((event) => event.kind === 'payment').link, '/contributor/account/payments');
  const now = new Date('2026-09-23T12:00:00');
  assert.equal(dueInfo('2026-09-20', false, now).tone, 'danger');
  assert.equal(dueInfo('2026-09-23', false, now).label, 'Due today');
  assert.equal(dueInfo('2026-09-25', false, now).tone, 'warning');
  assert.equal(dueInfo('2026-09-20', true, now).tone, 'neutral', 'a finished assignment is never shown as overdue');
  assert.equal(dueInfo(undefined, false, now), null);
});

test('the current assignment puts returned work first, then the nearest due date', async () => {
  const { currentAssignment } = await load('src/contributor/pages/OverviewPage.tsx', ['currentAssignment']);
  const works = [
    { id: 'later', title: 'Later', createdAt: '2026-09-01', deadline: '2026-12-01' },
    { id: 'soon', title: 'Soon', createdAt: '2026-09-02', deadline: '2026-10-01' },
    { id: 'returned', title: 'Returned', createdAt: '2026-08-01' },
    { id: 'done', title: 'Done', createdAt: '2026-09-10' },
  ];
  const item = (status, submissionId) => ({ id: status, translation: '', alternatives: [], status, ...(submissionId ? { submissionId } : {}) });
  const items = { later: [item('draft')], soon: [item('draft')], returned: [item('rejected', 's')], done: [item('verified', 's')] };
  assert.equal(currentAssignment(works, items).id, 'returned');
  assert.equal(currentAssignment(works, { ...items, returned: [item('verified', 's')] }).id, 'soon');
  assert.equal(currentAssignment([works[3]], items).id, 'done', 'with nothing open, the latest assignment is still shown');
  assert.equal(currentAssignment([], {}), null);
});

test('payment attention and statement file checks match the server rules', async () => {
  const { paymentsNeedAttention } = await load('src/contributor/workspace.tsx', ['paymentsNeedAttention'], { createContext: () => ({}) });
  assert.equal(paymentsNeedAttention(null), false);
  assert.equal(paymentsNeedAttention({ bank: { status: 'pending' }, momo: null }), false);
  assert.equal(paymentsNeedAttention({ bank: { status: 'needs_action' }, momo: null }), true);
  assert.equal(paymentsNeedAttention({ bank: null, momo: { ownershipStatus: 'rejected' } }), true);
  assert.equal(paymentsNeedAttention({ bank: { status: 'verified', legacy: true, statement: null }, momo: null }), true, 'legacy details need a statement');
  const { statementProblem } = await load('src/contributor/data.ts', ['statementProblem']);
  assert.equal(statementProblem({ type: 'application/pdf', size: 50_000 }), '');
  assert.match(statementProblem({ type: 'image/gif', size: 50_000 }), /PDF, JPEG or PNG/);
  assert.match(statementProblem({ type: 'image/png', size: 11 * 1024 * 1024 }), /larger than 10 MB/);
  assert.match(statementProblem({ type: 'image/jpeg', size: 200 }), /too small/);
});

test('Kawuri suggestions are labelled as AI, can be dismissed, and never touch the draft', async () => {
  const h = hooks();
  const { KawuriResultView, unavailableText } = await load('src/contributor/kawuri.tsx', ['KawuriResultView', 'unavailableText'], {
    ...h.api, Chip: 'Chip', Icon: 'Icon', Notice: 'Notice', Skeleton: 'Skeleton', cx: (...values) => values.filter(Boolean).join(' '),
    guideSection: (id) => ({ id, title: `Guide ${id}` }),
  });
  const result = {
    mode: 'context_needed', expression: 'Please come and sit with us.', configured: true, unavailableReason: null, removed: 1,
    summary: 'A warm invitation.', questions: ['Said to an elder?'],
    suggestions: [{ id: 's1', kind: 'context', text: 'Say who it is said to.', guideSection: 'alternatives-context' }, { id: 's2', kind: 'meaning', text: 'Note the register.', guideSection: null }],
    checks: [], sources: { assignment: { title: 'T', instructions: 'I', dialect: '', tone: '', deadline: '', helpContact: '' }, dictionary: [], guide: [] }, generatedAt: '',
  };
  const text = (node) => JSON.stringify(node);
  const props = { result, guideHref: (id) => `/g?section=${id}`, onNavigate() {} };
  let tree = h.render(KawuriResultView, props);
  assert.match(text(tree), /AI · not reviewed/);
  assert.match(text(tree), /not verified Kasem knowledge/);
  assert.match(text(tree), /contained Kasem/);
  find(tree, (n) => n.type === 'button' && n.props['aria-label'] === 'Dismiss suggestion: Say who it is said to.').props.onClick();
  tree = h.render(KawuriResultView, props);
  assert.doesNotMatch(text(tree), /Say who it is said to/);
  assert.match(text(tree), /Note the register/);
  const offline = h.render(KawuriResultView, { ...props, result: { ...result, configured: false, unavailableReason: 'VERTEX_AUTH_FAILED' } });
  assert.match(text(offline), /roles\/aiplatform.user/);
  assert.match(unavailableText('SOMETHING_ELSE'), /could not write suggestions/);
});

// ── Everyday expressions ────────────────────────────────────────────────────

const EXPRESSION_DATA_EXPORTS = ['EVERYDAY_STATEMENT', 'EXPRESSION_DIALECTS', 'EXPRESSION_KINDS', 'EXPRESSION_SOURCES',
  'EXPRESSION_STATUS', 'MAX_PHRASE_LENGTH', 'canWithdrawExpression', 'clearExpressionDraft', 'draftFromDeclined',
  'emptyExpressionDraft', 'fetchMyExpressions', 'loadExpressionDraft', 'looksLikeSingleWord', 'missingPiece',
  'saveExpressionDraft', 'statusOf', 'submitExpression', 'withdrawExpression'];

async function expressionPage({ receipts = [] } = {}) {
  const h = hooks(), calls = [];
  const window = {
    setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame: () => 0,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  };
  const data = await load('src/creator/expressions-data.ts', EXPRESSION_DATA_EXPORTS, {
    db: {}, functions: {}, window, collection() {}, query() {}, where() {}, limit() {},
    getDocs: async () => ({ docs: receipts.map((receipt) => ({ id: receipt.id, data: () => receipt })) }),
    httpsCallable: (_functions, name) => async (payload) => { calls.push({ name, payload: plain(payload) }); return { data: { contributionId: 'new-1', submissionId: 'new-1' } }; },
  });
  const { ExpressionsPage } = await load('src/creator/pages/ExpressionsPage.tsx', ['ExpressionsPage'], {
    ...h.api, ...data, window, Link: 'a', KasemPalette: 'palette', insertIntoField() {}, trackEvent() {},
    useAuth: () => ({ user: { uid: 'member-1' } }),
  });
  const render = () => h.render(ExpressionsPage);
  const settle = async () => { h.flush(); await tick(); await tick(); };
  return { h, calls, render, settle };
}

const byId = (tree, id) => find(tree, (n) => n.props?.id === id);
const labelled = (tree, text) => find(tree, (n) => n.type === 'label' && JSON.stringify(n.props.children).includes(text));

function fillExpression(page, tree) {
  byId(tree, 'expr-phrase').props.onChange({ target: { value: '[Kasem expression]' } });
  tree = page.render();
  byId(tree, 'expr-meaning').props.onChange({ target: { value: 'Welcome back from your journey.' } });
  byId(tree, 'expr-context').props.onChange({ target: { value: 'Said to a relative arriving home.' } });
  byId(tree, 'expr-dialect').props.onChange({ target: { value: 'Navrongo' } });
  tree = page.render();
  find(labelled(tree, 'A family member'), (n) => n.type === 'input').props.onChange();
  tree = page.render();
  byId(tree, 'expr-source-detail').props.onChange({ target: { value: 'My grandmother in Navrongo.' } });
  tree = page.render();
  find(labelled(tree, 'agreed that I may share it'), (n) => n.type === 'input').props.onChange({ target: { checked: true } });
  find(labelled(tree, 'nothing sacred'), (n) => n.type === 'input').props.onChange({ target: { checked: true } });
  find(labelled(tree, 'Publish it after review'), (n) => n.type === 'input').props.onChange();
  return page.render();
}

test('the expression form sends nothing until the five pieces are there, then sends them as an expression', async () => {
  const page = await expressionPage();
  let tree = page.render(); await page.settle(); tree = page.render();
  const form = () => find(tree, (n) => n.type === 'form');
  form().props.onSubmit({ preventDefault() {} }); await tick();
  tree = page.render();
  assert.match(JSON.stringify(find(tree, (n) => n.props?.role === 'alert')), /Write the expression in Kasem/);
  assert.equal(page.calls.length, 0, 'an incomplete expression is never sent');

  tree = fillExpression(page, tree);
  form().props.onSubmit({ preventDefault() {} }); await tick(); await tick();
  assert.equal(page.calls.length, 1);
  const { name, payload } = page.calls[0];
  assert.equal(name, 'submitExpression');
  assert.equal(payload.phrase, '[Kasem expression]');
  assert.equal(payload.meaning, 'Welcome back from your journey.');
  assert.equal(payload.context, 'Said to a relative arriving home.');
  assert.equal(payload.sourceType, 'family');
  assert.equal(payload.sourceDetail, 'My grandmother in Navrongo.');
  assert.equal(payload.speakerConsent, true);
  assert.equal(payload.everydayConfirmed, true);
  assert.equal(payload.publicationPermission, true);
  assert.equal(payload.aiTraining, false, 'AI training stays off unless ticked');
  assert.equal(payload.culturalPermissionTier, 'public');
  assert.equal('revisionOf' in payload, false);
  tree = page.render();
  assert.match(JSON.stringify(tree), /Sent for review/);
  page.h.dispose();
});

test('each expression shows where its review stands, and a declined one can be corrected and resent', async () => {
  const declined = {
    id: 'old-1', authUid: 'member-1', collectionKind: 'expressions', status: 'rejected',
    reviewFeedback: 'The spelling of the second word is not standard.', publicationPermission: true,
    expression: { phrase: '[Declined expression]', meaning: 'Good evening.', context: 'Evening greeting.', kind: 'phrase', dialect: 'Paga',
      source: { type: 'self', detail: 'I say it every day.' } },
    createdAt: '2026-09-20T10:00:00Z',
  };
  const waiting = { ...declined, id: 'new-2', status: 'submitted', reviewFeedback: '', expression: { ...declined.expression, phrase: '[Waiting expression]' }, createdAt: '2026-09-26T10:00:00Z' };
  const page = await expressionPage({ receipts: [declined, waiting] });
  let tree = page.render(); await page.settle(); tree = page.render();
  const text = JSON.stringify(tree);
  assert.match(text, /Waiting for review/);
  assert.match(text, /Not accepted/);
  assert.match(text, /The spelling of the second word is not standard/);
  assert.ok(text.indexOf('[Waiting expression]') < text.indexOf('[Declined expression]'), 'newest first');

  find(tree, (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Correct and send again')).props.onClick();
  tree = page.render();
  assert.equal(byId(tree, 'expr-phrase').props.value, '[Declined expression]');
  assert.match(JSON.stringify(tree), /Correcting an expression that was not accepted/);
  // Consent is confirmed afresh for a correction, never carried over.
  find(labelled(tree, 'my own everyday Kasem'), (n) => n.type === 'input').props.onChange({ target: { checked: true } });
  find(labelled(tree, 'nothing sacred'), (n) => n.type === 'input').props.onChange({ target: { checked: true } });
  find(labelled(tree, 'Publish it after review'), (n) => n.type === 'input').props.onChange();
  tree = page.render();
  find(tree, (n) => n.type === 'form').props.onSubmit({ preventDefault() {} }); await tick(); await tick();
  assert.equal(page.calls.length, 1);
  assert.equal(page.calls[0].payload.revisionOf, 'old-1');
  assert.equal(page.calls[0].payload.dialect, 'Paga');
  page.h.dispose();
});

// ---------------------------------------------------------------------------
// Redesigned portal: submission tracking, review rules, rewards and routes
// ---------------------------------------------------------------------------

test('submission tracking keeps approval, publication and contribution types apart', async () => {
  const { receiptRows, recordingRows, assignedRows, filterRows, summarise, revisionRows, parseRowKey, TYPE_META, STATE_META } = await load('src/contributor/submissions.ts',
    ['receiptRows', 'recordingRows', 'assignedRows', 'filterRows', 'summarise', 'revisionRows', 'parseRowKey', 'TYPE_META', 'STATE_META']);
  const receipt = (id, kind, status, extra = {}) => ({ id, kind, phrase: `[${id}]`, meaning: 'meaning', status, reviewFeedback: '', createdAt: '2026-09-20T10:00:00Z', reviewedAt: '', correctedBy: '', ...extra });
  const rows = [
    ...receiptRows([
      receipt('expr-approved', 'expression', 'approved'),
      receipt('expr-published', 'expression', 'published'),
      receipt('expr-declined', 'expression', 'rejected', { reviewFeedback: 'Check the meaning.', reviewedAt: '2026-09-22T10:00:00Z' }),
      receipt('expr-corrected', 'expression', 'rejected', { correctedBy: 'expr-new' }),
      receipt('word-waiting', 'word', 'submitted'),
    ]),
    ...recordingRows([{ id: 'rec-declined', headword: '[word]', meaning: 'farm', status: 'rejected', decisionNote: 'Cut off at the end.', createdAt: '2026-09-21T10:00:00Z', decidedAt: '2026-09-23T10:00:00Z' }]),
    ...assignedRows([{ id: 'w', title: 'Task' }], { w: [{ id: 'i', expression: 'Hello', translation: '[draft]', alternatives: [], revision: 1, status: 'draft' }] }, []),
  ];
  const state = (key) => rows.find((row) => row.key === key).state;
  assert.equal(state('expression.expr-approved'), 'approved');
  assert.equal(state('expression.expr-published'), 'published');
  assert.notEqual(STATE_META.approved.label, STATE_META.published.label, 'approval never reads as publication');
  assert.match(STATE_META.approved.description, /Publication is a separate step/);
  assert.equal(rows.find((row) => row.key === 'word.word-waiting').type, 'word', 'a word stays a word');
  assert.match(TYPE_META.expression.destination, /never as a dictionary word/);
  assert.match(TYPE_META.word.destination, /dictionary/);
  // A declined expression can be corrected once; a corrected one cannot again.
  assert.equal(rows.find((row) => row.key === 'expression.expr-declined').action, 'correct');
  assert.equal(rows.find((row) => row.key === 'expression.expr-corrected').action, null);
  assert.equal(rows.find((row) => row.key === 'recording.rec-declined').action, 'record_again');
  assert.deepEqual(revisionRows(rows).map((row) => row.key), ['recording.rec-declined', 'expression.expr-declined']);
  assert.deepEqual(filterRows(rows, { status: 'action', type: 'all', query: '' }).map((row) => row.key).sort(), ['expression.expr-declined', 'recording.rec-declined']);
  assert.deepEqual(filterRows(rows, { status: 'all', type: 'word', query: '' }).map((row) => row.key), ['word.word-waiting']);
  assert.deepEqual(filterRows(rows, { status: 'all', type: 'all', query: 'cut off' }).map((row) => row.key), ['recording.rec-declined']);
  const summary = summarise(rows);
  assert.equal(summary.total, rows.length);
  assert.equal(summary.drafts + summary.inReview + summary.action + summary.approved + summary.published + summary.notAccepted, rows.length, 'every row lands in exactly one bucket');
  assert.equal(summary.approved, 1);
  assert.equal(summary.published, 1);
  assert.deepEqual(plain(parseRowKey('task.w.i')), { type: 'assigned', work: 'w', item: 'i' });
  assert.deepEqual(plain(parseRowKey('word.abc')), { type: 'word', id: 'abc' });
  assert.equal(parseRowKey('expression.a.b'), null);
  assert.equal(parseRowKey('nonsense'), null);
});

test('the review queue filters on real fields and sorts stably, oldest first', async () => {
  const { filterQueue, itemDialect, itemType, dialectsIn, ageLabel } = await load('src/contributor/review/model.ts', ['filterQueue', 'itemDialect', 'itemType', 'dialectsIn', 'ageLabel']);
  const now = Date.parse('2026-10-01T12:00:00Z');
  const at = (days) => new Date(now - days * 86_400_000).toISOString();
  const rows = [
    { id: 'b', status: 'SUBMITTED', collectionKind: 'expressions', expression: { phrase: '[b]', meaning: 'evening greeting', dialect: 'Paga' }, lifecycle: { createdAt: at(2) } },
    { id: 'a', status: 'SUBMITTED', collectionKind: 'expressions', expression: { phrase: '[a]', meaning: 'morning greeting', dialect: 'Navrongo' }, lifecycle: { createdAt: at(2) } },
    { id: 'c', status: 'SUBMITTED', collectionKind: 'dictionary', body: '[c]', title: 'water', dialect: 'Paga', lifecycle: { createdAt: at(8) } },
    { id: 'd', status: 'SUBMITTED', contributorPortal: { work: 'w', item: 'i' }, title: 'Thank you', expression: { phrase: '[d]', dialect: 'Kasem' }, lifecycle: { createdAt: at(0.5) } },
  ];
  const ids = (filters) => filterQueue('contributions', rows, { type: 'all', dialect: 'all', age: 'any', query: '', sort: 'oldest', ...filters }, now).map((row) => row.id);
  assert.deepEqual(ids({}), ['c', 'a', 'b', 'd'], 'oldest first; equal times fall back to the id');
  assert.deepEqual(ids({ sort: 'newest' }), ['d', 'a', 'b', 'c']);
  assert.deepEqual(ids({ type: 'word' }), ['c']);
  assert.deepEqual(ids({ type: 'assigned' }), ['d']);
  assert.deepEqual(ids({ dialect: 'Paga' }), ['c', 'b']);
  assert.deepEqual(ids({ age: '7' }), ['c']);
  assert.deepEqual(ids({ query: 'MORNING' }), ['a']);
  assert.equal(itemType('contributions', rows[3]), 'assigned');
  assert.equal(itemDialect(rows[3]), '', 'an assigned translation records the language, not a dialect');
  assert.deepEqual([...dialectsIn(rows)], ['Navrongo', 'Paga']);
  assert.equal(ageLabel(Date.parse(at(3)), now), '3 days');
  assert.equal(ageLabel(0, now), 'Unknown');
});

test('review decisions name what they do, require a reason, and carry what the reviewer saw', async () => {
  const { decisionsFor, decisionRequest, decisionLabel, decisionError, publishTarget, FEEDBACK_MINIMUM, sentenceReviewProblems, emptySentenceJudgment } = await load('src/contributor/review/model.ts',
    ['decisionsFor', 'decisionRequest', 'decisionLabel', 'decisionError', 'publishTarget', 'FEEDBACK_MINIMUM', 'sentenceReviewProblems', 'emptySentenceJudgment']);
  const assigned = { id: 's1', status: 'SUBMITTED', collectionKind: 'expressions', contributorPortal: { work: 'w', item: 'i' }, permissions: { publication: true }, lifecycle: { version: 3 } };
  assert.deepEqual([...decisionsFor('contributions', assigned)], ['APPROVE', 'REJECT', 'ESCALATE_CULTURAL'], 'collection work cannot be sent for revision');
  assert.equal(decisionLabel('contributions', 'REJECT', assigned), 'Return with feedback');
  assert.equal(decisionLabel('contributions', 'REJECT', { ...assigned, contributorPortal: undefined }), 'Reject');
  assert.deepEqual([...decisionsFor('contributions', { ...assigned, status: 'APPROVED' })], ['PUBLISH', 'REJECT']);
  assert.deepEqual([...decisionsFor('contributions', { ...assigned, status: 'APPROVED', permissions: { publication: false } })], ['ARCHIVE', 'REJECT'], 'no publication without permission');
  assert.equal(FEEDBACK_MINIMUM, 15);
  assert.throws(() => decisionRequest('contributions', assigned, 'REJECT', 'Too short.', 'headword', ''), /at least 15 characters/);
  const request = decisionRequest('contributions', assigned, 'APPROVE', '', 'headword', '', { expectedStatus: 'SUBMITTED', expectedVersion: 3, scores: { meaning: 1, spelling: 0 } });
  assert.deepEqual(plain(request.data), { submissionId: 's1', decision: 'APPROVE', feedback: '', expectedStatus: 'SUBMITTED', expectedVersion: 3, scores: { meaning: 1, spelling: 0 } });
  assert.equal('scores' in decisionRequest('contributions', assigned, 'APPROVE', '', 'headword', '', { scores: {} }).data, false, 'an empty checklist is not sent');
  // Recordings: approve or decline, with the reason required to decline.
  const recording = { id: 'r1', status: 'submitted' };
  assert.deepEqual([...decisionsFor('recordings', recording)], ['approve', 'reject']);
  assert.throws(() => decisionRequest('recordings', recording, 'reject', '', '', ''), /at least 15 characters/);
  assert.deepEqual(plain(decisionRequest('recordings', recording, 'reject', 'The word is cut off at the end.', '', '')), { callable: 'decidePronunciationRecording', data: { recordingId: 'r1', decision: 'reject', note: 'The word is cut off at the end.' } });
  assert.equal(decisionsFor('recordings', { ...recording, status: 'approved' }).length, 0);
  // A publish keeps what the approval chose a dictionary answer to become.
  assert.deepEqual(plain(publishTarget('PUBLISH', { moderation: { publishAs: 'variant', linkedEntryId: 'entry-1' } })), { target: 'variant', entryId: 'entry-1' });
  assert.deepEqual(plain(publishTarget('APPROVE', { moderation: { publishAs: 'variant' } })), { target: 'headword', entryId: '' });
  assert.deepEqual(plain(publishTarget('PUBLISH', { moderation: { publishAs: 'nonsense' } })), { target: 'headword', entryId: '' });
  // Conflicts are told apart from failures.
  assert.equal(decisionError({ code: 'functions/aborted', message: 'This item changed while you were reviewing it.' }).conflict, true);
  assert.equal(decisionError({ code: 'functions/failed-precondition', message: 'That recording has already been decided.' }).conflict, true);
  assert.equal(decisionError({ code: 'functions/unavailable', message: '' }).conflict, false);
  assert.match(decisionError({ code: 'functions/internal', message: 'internal' }).message, /nothing was recorded/);
  // Sentence judgments: a concern needs an explanation, and dialect competence is confirmed.
  const concern = { ...emptySentenceJudgment(), meaning: 'different' };
  assert.deepEqual(sentenceReviewProblems([emptySentenceJudgment()], true).length, 0);
  assert.deepEqual(plain(sentenceReviewProblems([concern], true)).map((entry) => entry.field), ['sentence-0-explanation']);
  assert.deepEqual(plain(sentenceReviewProblems([{ ...concern, explanation: 'The verb is in the wrong tense.' }], false)).map((entry) => entry.field), ['sentence-competent']);
});

test('the rewards ledger shows awards and redemptions as points, and eligibility says why', async () => {
  const { ledgerFrom, redemptionEligibility } = await load('src/contributor/rewards.tsx', ['ledgerFrom', 'redemptionEligibility'], { createContext: () => ({}) });
  const credits = [
    { id: 'c1', submissionId: 's1', work: 'w', item: 'i1', day: '2026-09-20', points: 10, createdAt: '2026-09-20T10:00:00Z' },
    { id: 'c2', submissionId: 's2', work: 'w', item: 'i2', day: '2026-09-20', points: 0, createdAt: '2026-09-20T11:00:00Z' },
  ];
  const requests = [
    { id: 'r1', amountMinor: 500, currency: 'GHS', description: '', status: 'rejected', points: 300, kind: 'airtime', network: 'MTN', phoneNumber: '+233241234567', createdAt: '2026-09-25T10:00:00Z', decidedAt: '2026-09-26T10:00:00Z', adminNote: 'Number not registered.' },
    { id: 'legacy-cash', amountMinor: 1000, currency: 'GHS', description: '', status: 'paid', createdAt: '2026-09-01T10:00:00Z' },
  ];
  const rows = ledgerFrom(credits, requests, [{ id: 'w', title: 'Everyday' }], { w: [{ id: 'i1', expression: 'Good morning.' }] });
  assert.deepEqual(plain(rows.map((row) => row.id)), ['return:r1', 'request:r1', 'credit:c2', 'credit:c1']);
  assert.equal(rows.find((row) => row.id === 'credit:c1').title, 'Approved: “Good morning.”');
  assert.equal(rows.find((row) => row.id === 'credit:c2').status.label, 'Daily limit reached');
  assert.equal(rows.find((row) => row.id === 'request:r1').points, -300);
  assert.equal(rows.find((row) => row.id === 'return:r1').points, 300, 'a refused request returns its points');
  assert.ok(!rows.some((row) => row.id.includes('legacy-cash')), 'cash payment requests are not points');
  assert.ok(!rows.find((row) => row.id === 'request:r1').detail.includes('1234567'), 'the phone number is masked');
  const short = redemptionEligibility(120, 300, []);
  assert.equal(short.eligible, false);
  assert.match(short.checks[0].label, /At least 300 points available \(you have 120\)/);
  assert.equal(redemptionEligibility(450, 300, [{ ...requests[0], status: 'submitted' }]).eligible, false, 'one request at a time');
  assert.equal(redemptionEligibility(450, 300, requests).eligible, true);
});

test('review routes map every page and keep links inside their workspace', async () => {
  const { isDesk } = await load('src/contributor/review/model.ts', ['isDesk']);
  const { parseReviewRoute, reviewPaths } = await load('src/contributor/review/ReviewDesk.tsx', ['parseReviewRoute', 'reviewPaths'], { createContext: () => ({}), isDesk });
  const base = '/contributor/review';
  const route = (path, search = '') => parseReviewRoute(path, search, base);
  assert.equal(route(base).page, 'overview');
  for (const page of ['queue', 'history', 'guide', 'account']) assert.equal(route(`${base}/${page}`).page, page);
  assert.deepEqual(plain({ ...route(`${base}/recordings/rec%2F1`), query: undefined }), { page: 'item', desk: 'recordings', id: 'rec/1', notFound: false });
  assert.equal(route(`${base}/unknown-desk/x`).notFound, true);
  assert.equal(route(`${base}/queue/extra`).notFound, true);
  assert.equal(route(`${base}/queue`, '?desk=sentences&view=disputed').query.get('view'), 'disputed');
  const paths = reviewPaths('/contributor/preview/review');
  assert.equal(paths.item('recordings', 'rec/1'), '/contributor/preview/review/recordings/rec%2F1');
  assert.equal(paths.queue({ desk: 'names', view: '', q: 'x' }), '/contributor/preview/review/queue?desk=names&q=x');
  assert.equal(paths.guide('feedback'), '/contributor/preview/review/guide?section=feedback');
  assert.equal(paths.overview(), '/contributor/preview/review');
});
