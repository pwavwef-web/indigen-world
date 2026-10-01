import { useMemo, useRef, useState } from 'react';
import { DESKS, decisionsFor, itemCreatedAt, itemTitle, type ReviewRecord } from './model';
import type { DecisionRecord, ReviewServices } from './services';
import { ValidatorWorkspace } from './ReviewDesk';

/**
 * Local preview of the review workspace — development builds only, at
 * /contributor/preview/review (loaded through ContributorPreview).
 *
 * The real review screens run on sample records held in memory. Decisions
 * follow the same rules the callables enforce (no deciding your own work, a
 * written reason for sending work back, the status and version you saw), so
 * the whole flow can be exercised without a reviewer account. Nothing is
 * sent anywhere; Kasem text is a bracketed placeholder, and audio is a
 * generated tone, not a recording of anyone.
 */

const REVIEWER = 'preview-reviewer';
const OTHER_REVIEWER = 'preview-reviewer-2';
const iso = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function lifecycle(hoursAgo: number, version = 1) {
  return { createdAt: iso(hoursAgo), updatedAt: iso(hoursAgo), version };
}

const INVITED = { type: 'invited-speaker', detail: 'Invited contributor', speakerName: '' };

function seed(): Record<string, ReviewRecord[]> {
  return {
    submissions: [
      {
        id: 'preview-assigned-1', status: 'SUBMITTED', authUid: 'preview-contributor', collectionKind: 'expressions',
        contributorPortal: { contributorId: 'preview-contributor', work: 'everyday', item: 'e2' },
        title: 'Thank you for welcoming me into your home.', body: '[Sample Kasem translation]',
        expression: { phrase: '[Sample Kasem translation]', alternatives: ['[Sample alternative]'], meaning: 'Thank you for welcoming me into your home.', literalTranslation: '', context: 'Said to the host when arriving for a visit.', kind: 'phrase', dialect: 'Kasem', source: INVITED },
        alternativeExpressions: ['[Sample alternative]'], permissions: { publication: true, aiTraining: false, consentVersion: 'contributor-expression-v1' },
        disclosures: { involvesMinors: null, usesThirdPartyMaterial: false }, lifecycle: lifecycle(26),
      },
      {
        id: 'preview-assigned-2', status: 'SUBMITTED', authUid: 'preview-contributor', collectionKind: 'expressions',
        contributorPortal: { contributorId: 'preview-contributor', work: 'everyday', item: 'e3' },
        title: 'Please come and sit with us.', body: '[Sample revised Kasem translation]',
        expression: { phrase: '[Sample revised Kasem translation]', alternatives: [], meaning: 'Please come and sit with us.', literalTranslation: '', context: 'Said to a neighbour passing the compound in the evening.', kind: 'phrase', dialect: 'Kasem', source: INVITED },
        revisionOf: 'preview-assigned-2-r1',
        previousReview: { feedback: 'This reads as an instruction. Please use the everyday, welcoming way of inviting someone to sit with you, and add who you would say it to.', decidedAt: iso(30), reviewer: { id: OTHER_REVIEWER } },
        permissions: { publication: true, aiTraining: true, consentVersion: 'contributor-expression-v1' }, lifecycle: lifecycle(10),
      },
      {
        id: 'preview-assigned-2-r1', status: 'REJECTED', authUid: 'preview-contributor', collectionKind: 'expressions',
        contributorPortal: { contributorId: 'preview-contributor', work: 'everyday', item: 'e3' },
        title: 'Please come and sit with us.', body: '[Sample Kasem translation]',
        expression: { phrase: '[Sample Kasem translation]', alternatives: [], meaning: 'Please come and sit with us.', literalTranslation: '', context: '', kind: 'phrase', dialect: 'Kasem', source: INVITED },
        moderation: { feedback: 'This reads as an instruction. Please use the everyday, welcoming way of inviting someone to sit with you, and add who you would say it to.', reviewer: { id: OTHER_REVIEWER }, decidedAt: iso(30) },
        permissions: { publication: true, aiTraining: true }, lifecycle: lifecycle(40, 2),
      },
      {
        id: 'preview-expression-1', status: 'SUBMITTED', authUid: 'preview-member-1', collectionKind: 'expressions',
        title: 'Welcome back from your journey.', body: '[Sample Kasem expression]',
        expression: { phrase: '[Sample Kasem expression]', alternatives: [], meaning: 'Welcome back from your journey.', literalTranslation: '[Sample word-for-word meaning]', context: 'Said by the household to a relative arriving home.', kind: 'phrase', dialect: 'Navrongo', source: { type: 'elder', detail: 'Learned from a grandparent (sample).', speakerName: 'Sample elder' } },
        permissions: { publication: true, aiTraining: true, consentVersion: 'expression-v1' },
        disclosures: { involvesMinors: null, usesThirdPartyMaterial: false }, lifecycle: lifecycle(70),
      },
      {
        id: 'preview-word-1', status: 'SUBMITTED', authUid: 'preview-member-2', collectionKind: 'dictionary', lexicalKind: 'word',
        title: 'calabash', body: '[Sample Kasem word]', format: 'noun', dialect: 'Paga',
        kasemExample: '[Sample Kasem example sentence]', englishExample: 'She filled the calabash with water.',
        sourceReferences: 'Everyday use at home (sample).', media: { storagePath: 'preview/word-pronunciation', mediaType: 'audio' },
        permissions: { publication: true, aiTraining: false }, lifecycle: lifecycle(200),
      },
      {
        id: 'preview-escalated-1', status: 'UNDER_REVIEW', authUid: 'preview-member-3', collectionKind: 'expressions',
        title: 'The river does not forget its source.', body: '[Sample Kasem proverb]',
        expression: { phrase: '[Sample Kasem proverb]', alternatives: [], meaning: 'The river does not forget its source.', literalTranslation: '', context: 'Said at gatherings to remind people of where they come from (sample).', kind: 'proverb', dialect: 'Chiana', source: { type: 'community', detail: 'Heard at a family gathering (sample).', speakerName: '' } },
        moderation: { feedback: 'Escalated: an elder should confirm this can be shared publicly.', reviewer: { id: OTHER_REVIEWER }, decidedAt: iso(12) },
        permissions: { publication: true, aiTraining: false }, lifecycle: lifecycle(100, 2),
      },
      {
        id: 'preview-own-1', status: 'SUBMITTED', authUid: REVIEWER, collectionKind: 'expressions',
        title: 'See you at the market.', body: '[Sample Kasem expression of yours]',
        expression: { phrase: '[Sample Kasem expression of yours]', alternatives: [], meaning: 'See you at the market.', literalTranslation: '', context: 'Said when parting on a market day.', kind: 'phrase', dialect: 'Navrongo', source: { type: 'self', detail: '', speakerName: '' } },
        permissions: { publication: true, aiTraining: false }, lifecycle: lifecycle(5),
      },
      {
        id: 'preview-approved-1', status: 'APPROVED', authUid: 'preview-contributor', collectionKind: 'expressions',
        contributorPortal: { contributorId: 'preview-contributor', work: 'greetings', item: 'g1' },
        title: 'You are welcome here.', body: '[Sample Kasem translation]',
        expression: { phrase: '[Sample Kasem translation]', alternatives: [], meaning: 'You are welcome here.', literalTranslation: '', context: '', kind: 'phrase', dialect: 'Kasem', source: INVITED },
        moderation: { feedback: 'Natural and clear. Thank you.', reviewer: { id: REVIEWER }, decidedAt: iso(20), scores: { meaning: 1, spelling: 1, natural: 1 } },
        permissions: { publication: true, aiTraining: false }, lifecycle: lifecycle(60, 2),
      },
      {
        id: 'preview-approved-2', status: 'APPROVED', authUid: 'preview-member-4', collectionKind: 'expressions',
        title: 'Sleep well.', body: '[Sample Kasem night greeting]',
        expression: { phrase: '[Sample Kasem night greeting]', alternatives: [], meaning: 'Sleep well.', literalTranslation: '', context: 'Said at night to family.', kind: 'phrase', dialect: 'Paga', source: { type: 'family', detail: 'My aunt (sample).', speakerName: '' } },
        moderation: { feedback: '', reviewer: { id: REVIEWER }, decidedAt: iso(44) },
        permissions: { publication: false, aiTraining: false }, lifecycle: lifecycle(90, 2),
      },
    ],
    pronunciationRecordings: [
      { id: 'preview-recording-1', status: 'submitted', source: 'contributor_portal', entryId: 'w-farm', headword: '[Sample word: farm]', meaning: 'farm', uid: 'preview-contributor', storagePath: 'preview/recording-1', durationMs: 1800, publishConsent: true, createdAt: iso(6) },
      { id: 'preview-recording-2', status: 'submitted', source: 'learn_speak', entryId: 'w-market', headword: '[Sample word: market]', meaning: 'market', uid: 'preview-member-5', storagePath: 'preview/recording-2', durationMs: 1200, publishConsent: false, createdAt: iso(30) },
      { id: 'preview-recording-3', status: 'approved', source: 'learn_speak', entryId: 'w-water', headword: '[Sample word: water]', meaning: 'water', uid: 'preview-member-5', storagePath: 'preview/recording-3', durationMs: 1400, publishConsent: true, outcome: 'attach_to_entry', decidedBy: REVIEWER, decidedAt: iso(48), createdAt: iso(80) },
    ],
    grammarNotes: [
      {
        id: 'preview-sentence-1', status: 'submitted', authUid: 'preview-member-6', mode: 'comparison', revision: 1, reviewerIds: [OTHER_REVIEWER],
        title: 'Asking someone to wait', explanation: 'Two ways to ask someone to wait. The contributor says the second is more polite (sample).',
        comparisonNote: 'Version 2 adds a politeness marker (sample).',
        permissions: { review: true, publication: true, audio: true, sourceConfirmed: true, status: 'active', expiresAt: '' },
        examples: [
          { kasem: '[Sample Kasem sentence, version 1]', english: 'Wait for me.', literal: '[sample word-for-word line]', dialect: 'Navrongo', note: '', sourceType: 'speaker', source: 'The contributor (sample)', naturalness: 'natural', audioPath: 'preview/sentence-1-0', annotations: [], context: { status: 'specified', situation: 'Asking a friend to wait at the market.', preceding: '', intent: 'request', register: 'informal' } },
          { kasem: '[Sample Kasem sentence, version 2]', english: 'Please wait for me.', literal: '', dialect: 'Navrongo', note: 'Used with older people (sample).', sourceType: 'speaker', source: 'The contributor (sample)', naturalness: 'natural', audioPath: '', annotations: [{ start: 0, end: 1, kind: 'grammatical', gloss: 'politeness marker (sample)', senseId: '', role: '', hypotheses: [] }], context: { status: 'specified', situation: 'Asking a friend to wait at the market.', preceding: '', intent: 'request', register: 'polite' } },
        ],
        createdAt: iso(40), updatedAt: iso(30),
      },
      {
        id: 'preview-sentence-2', status: 'needs-permission', authUid: 'preview-member-7', mode: 'sentence', revision: 1, reviewerIds: [],
        title: 'An older note', permissions: { review: false }, examples: [{ kasem: '[Sample Kasem sentence]', english: 'The rain has stopped.', dialect: 'unknown', context: {} }],
        createdAt: iso(400),
      },
    ],
    kasemNameRequests: [
      { id: 'preview-name-1', status: 'pending', name: '[Sample Kasem name]', meaning: 'Born on a market day (sample).', note: 'A name for my daughter (sample).', gender: 'female', authUid: 'preview-member-8', createdAt: iso(15) },
    ],
    adCampaigns: [
      {
        id: 'preview-advert-1', status: 'IN_REVIEW', authUid: 'preview-advertiser', headline: 'Kasem lessons at the community centre (sample)', description: 'Weekly evening classes for beginners (sample).',
        ctaLabel: 'Learn more', ctaUrl: 'https://example.com/', placements: ['feed'], regions: ['Upper East'], durationDays: 7,
        dailyBudgetPesewas: 2000, totalBudgetPesewas: 14000, payment: { status: 'paid' }, createdAt: iso(9),
      },
    ],
  };
}

/** One second of a quiet tone as a WAV file, so the audio controls have something to play. */
function toneWav(): Uint8Array {
  const rate = 8000;
  const samples = Math.round(rate * 1.2);
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => { for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index)); };
  write(0, 'RIFF'); view.setUint32(4, 36 + samples * 2, true); write(8, 'WAVE'); write(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, samples * 2, true);
  for (let index = 0; index < samples; index += 1) {
    const fade = Math.min(1, index / 400, (samples - index) / 400);
    view.setInt16(44 + index * 2, Math.round(Math.sin((2 * Math.PI * 330 * index) / rate) * 6000 * fade), true);
  }
  return new Uint8Array(buffer);
}

class PreviewStore {
  data = seed();
  private listeners = new Set<() => void>();
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  emit() { this.listeners.forEach((listener) => listener()); }
  rows(collection: string) { return this.data[collection] ?? []; }
  find(collection: string, id: string) { return this.rows(collection).find((row) => row.id === id) ?? null; }
  update(collection: string, id: string, patch: (row: ReviewRecord) => ReviewRecord) {
    this.data = { ...this.data, [collection]: this.rows(collection).map((row) => row.id === id ? patch(row) : row) };
    this.emit();
  }
}

function failure(code: string, message: string): Error {
  return Object.assign(new Error(message), { code: `functions/${code}` });
}

const SUBMISSION_STATUS: Record<string, string> = {
  APPROVE: 'APPROVED', REJECT: 'REJECTED', REQUEST_REVISION: 'NEEDS_REVISION', PUBLISH: 'PUBLISHED', ARCHIVE: 'ARCHIVED', ESCALATE_CULTURAL: 'UNDER_REVIEW',
};

export function ReviewPreview() {
  const store = useRef(new PreviewStore()).current;
  const [offline, setOffline] = useState(false);
  const [conflict, setConflict] = useState(false);
  const flags = useRef({ offline: false, conflict: false });
  flags.current = { offline, conflict };
  const tone = useRef<string>('');

  const services = useMemo<ReviewServices>(() => {
    const toneUrl = () => {
      if (!tone.current) tone.current = URL.createObjectURL(new Blob([toneWav() as BlobPart], { type: 'audio/wav' }));
      return tone.current;
    };
    const watch = <T,>(read: () => T, onData: (value: T) => void) => {
      const timer = window.setTimeout(() => onData(read()), 250);
      const unsubscribe = store.subscribe(() => onData(read()));
      return () => { window.clearTimeout(timer); unsubscribe(); };
    };

    const decideSubmission = (data: Record<string, any>) => {
      const item = store.find('submissions', String(data.submissionId));
      if (!item) throw failure('not-found', 'Submission not found.');
      if (item.authUid === REVIEWER) throw failure('permission-denied', 'Reviewers cannot decide on their own submissions.');
      if ((data.expectedStatus && data.expectedStatus !== item.status) || (typeof data.expectedVersion === 'number' && data.expectedVersion !== item.lifecycle?.version)) {
        throw failure('aborted', 'This item changed while you were reviewing it, so your decision was not recorded. Reload to see where it stands now.');
      }
      if (!decisionsFor('contributions', item).includes(data.decision)) throw failure('failed-precondition', 'That decision is not possible for this item now.');
      if (['REJECT', 'REQUEST_REVISION'].includes(data.decision) && String(data.feedback ?? '').trim().length < 5) throw failure('invalid-argument', 'Feedback is required for revision and rejection.');
      store.update('submissions', item.id, (row) => ({
        ...row,
        status: SUBMISSION_STATUS[data.decision],
        moderation: { ...(row.moderation ?? {}), reviewer: { id: REVIEWER }, decidedAt: new Date().toISOString(), feedback: data.feedback || row.moderation?.feedback || '', ...(data.scores ? { scores: data.scores } : {}) },
        lifecycle: { ...(row.lifecycle ?? {}), updatedAt: new Date().toISOString(), version: Number(row.lifecycle?.version ?? 1) + 1 },
      }));
      return { status: SUBMISSION_STATUS[data.decision] };
    };

    const decideRecording = (data: Record<string, any>) => {
      const item = store.find('pronunciationRecordings', String(data.recordingId));
      if (!item) throw failure('not-found', 'That recording does not exist.');
      if (item.uid === REVIEWER) throw failure('permission-denied', 'Reviewers cannot decide their own recordings.');
      if (item.status !== 'submitted') throw failure('failed-precondition', 'That recording has already been decided.');
      if (data.decision === 'reject' && !String(data.note ?? '').trim()) throw failure('invalid-argument', 'Say why, so the learner can try again.');
      const outcome = data.decision === 'approve' ? (item.publishConsent ? 'attach_to_entry' : 'approve_without_publishing') : null;
      store.update('pronunciationRecordings', item.id, (row) => ({ ...row, status: data.decision === 'approve' ? 'approved' : 'rejected', outcome, decidedBy: REVIEWER, decidedAt: new Date().toISOString(), decisionNote: data.note || null }));
      return { status: data.decision === 'approve' ? 'approved' : 'rejected', outcome };
    };

    const decideSentence = (data: Record<string, any>) => {
      const item = store.find('grammarNotes', String(data.noteId));
      if (!item) throw failure('failed-precondition', 'This legacy note needs migration and permission before review.');
      if (item.authUid === REVIEWER) throw failure('invalid-argument', 'The contributor cannot independently review their own note.');
      if ((item.reviewerIds ?? []).includes(REVIEWER)) throw failure('already-exists', 'You already reviewed this revision. A correction needs a new revision.');
      if (data.dialectCompetent !== true) throw failure('invalid-argument', 'Confirm you can judge this dialect, or leave this review for another speaker.');
      const positive = (judgment: Record<string, unknown>) => judgment.meaning === 'faithful' && judgment.grammar === 'acceptable' && judgment.naturalness === 'natural' && judgment.contextFit === 'fits';
      const reviewers = [...(item.reviewerIds ?? []), REVIEWER];
      // The sample's earlier reviewer judged every version correct.
      const status = reviewers.length < 2 ? 'submitted' : (data.judgments as Record<string, unknown>[]).every(positive) ? 'confirmed' : 'disputed';
      store.update('grammarNotes', item.id, (row) => ({ ...row, reviewerIds: reviewers, status, updatedAt: new Date().toISOString() }));
      return { status, sentences: status === 'confirmed' ? (item.examples?.length ?? 0) : 0, words: 0 };
    };

    const decideName = (data: Record<string, any>) => {
      const item = store.find('kasemNameRequests', String(data.requestId));
      if (!item || item.status !== 'pending') throw failure('failed-precondition', 'That request has already been decided.');
      if (data.decision === 'reject' && String(data.note ?? '').trim().length < 5) throw failure('invalid-argument', 'Say why the name is not being added.');
      store.update('kasemNameRequests', item.id, (row) => ({ ...row, status: data.decision === 'approve' ? 'approved' : 'rejected', reviewerUid: REVIEWER, decidedAt: new Date().toISOString(), reviewNote: data.note }));
      return { status: data.decision === 'approve' ? 'approved' : 'rejected' };
    };

    const decideAdvert = (data: Record<string, any>) => {
      const item = store.find('adCampaigns', String(data.campaignId));
      if (!item) throw failure('not-found', 'Campaign not found.');
      if (!decisionsFor('adverts', item).includes(data.decision)) throw failure('failed-precondition', 'That decision is not possible for this advert now.');
      const status = ({ APPROVE: 'ACTIVE', REJECT: 'REJECTED', PAUSE: 'PAUSED', RESUME: 'ACTIVE' } as Record<string, string>)[data.decision];
      store.update('adCampaigns', item.id, (row) => ({ ...row, status, reviewFeedback: data.feedback }));
      return { status };
    };

    /** Another reviewer gets there first: their decision lands, then yours is refused. */
    const preempt = (callable: string, data: Record<string, any>) => {
      if (callable !== 'decideSubmission') return;
      const item = store.find('submissions', String(data.submissionId));
      if (!item || !decisionsFor('contributions', item).includes('APPROVE')) return;
      store.update('submissions', item.id, (row) => ({
        ...row, status: 'APPROVED',
        moderation: { ...(row.moderation ?? {}), reviewer: { id: OTHER_REVIEWER }, decidedAt: new Date().toISOString(), feedback: '' },
        lifecycle: { ...(row.lifecycle ?? {}), version: Number(row.lifecycle?.version ?? 1) + 1 },
      }));
    };

    return {
      watchQueue(desk, statuses, onData) {
        return watch(() => store.rows(DESKS[desk].collection).filter((row) => statuses.includes(row.status)), (rows) => onData(rows, false));
      },
      watchItem(desk, id, onData) {
        return watch(() => store.find(DESKS[desk].collection, id), onData);
      },
      async countQueue(desk, statuses) {
        await wait(200);
        return store.rows(DESKS[desk].collection).filter((row) => statuses.includes(row.status)).length;
      },
      async oldestWaiting(desk, statuses) {
        await wait(200);
        if (DESKS[desk].order?.direction !== 'asc') return null;
        const times = store.rows(DESKS[desk].collection).filter((row) => statuses.includes(row.status)).map(itemCreatedAt).filter(Boolean);
        return times.length ? Math.min(...times) : null;
      },
      async loadSubmission(id) { await wait(200); return store.find('submissions', id); },
      async mediaUrl() { await wait(200); return toneUrl(); },
      async call(callable, data) {
        await wait(500);
        if (flags.current.offline) throw failure('unavailable', '');
        if (flags.current.conflict) {
          setConflict(false);
          preempt(callable, data as Record<string, any>);
        }
        switch (callable) {
          case 'decideSubmission': return decideSubmission(data as Record<string, any>);
          case 'decidePronunciationRecording': return decideRecording(data as Record<string, any>);
          case 'decideGrammarNote': return decideSentence(data as Record<string, any>);
          case 'decideKasemNameRequest': return decideName(data as Record<string, any>);
          case 'decideAdCampaign': return decideAdvert(data as Record<string, any>);
          default: throw failure('not-found', 'Unknown action.');
        }
      },
      async readSentenceAudio() {
        await wait(300);
        if (flags.current.offline) throw failure('unavailable', '');
        const bytes = toneWav();
        let binary = '';
        bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
        return { audio: btoa(binary), contentType: 'audio/wav' };
      },
      async myDecisions(uid) {
        await wait(250);
        const rows: DecisionRecord[] = [];
        const at = (value: unknown) => (typeof value === 'string' ? Date.parse(value) || 0 : 0);
        for (const row of store.rows('submissions')) if (row.moderation?.reviewer?.id === uid) rows.push({ desk: 'contributions', id: row.id, title: itemTitle('contributions', row), status: row.status, decision: row.status, decidedAt: at(row.moderation?.decidedAt) });
        for (const row of store.rows('pronunciationRecordings')) if (row.decidedBy === uid) rows.push({ desk: 'recordings', id: row.id, title: itemTitle('recordings', row), status: row.status, decision: row.status, decidedAt: at(row.decidedAt) });
        for (const row of store.rows('kasemNameRequests')) if (row.reviewerUid === uid) rows.push({ desk: 'names', id: row.id, title: itemTitle('names', row), status: row.status, decision: row.status, decidedAt: at(row.decidedAt) });
        return rows.sort((a, b) => b.decidedAt - a.decidedAt);
      },
      async lookupHeadwords(spelling) {
        await wait(300);
        return /sample/i.test(spelling) ? [{ id: 'preview-headword', kasemText: '[Sample Kasem word]', englishText: 'gourd (a different sense, sample)', partOfSpeech: 'noun', homographIndex: 1 }] : [];
      },
      async hasContributorAccount() { return true; },
      async signOut() { window.location.assign('/contributor/preview'); },
    };
  }, [store]);

  return (
    <ValidatorWorkspace
      uid={REVIEWER}
      email="reviewer@example.com"
      name="Sample Reviewer"
      role="validator"
      services={services}
      base="/contributor/preview/review"
      contributorHref="/contributor/preview"
      preview
      banner={(
        <div className="cw-preview-banner" role="note">
          <strong>Local preview · sample data</strong>
          <span>Nothing is saved or sent. Kasem text is a placeholder and audio is a generated tone.</span>
          <label className="cw-preview-banner__toggle"><input type="checkbox" checked={conflict} onChange={(event) => setConflict(event.target.checked)} />Another reviewer decides first</label>
          <label className="cw-preview-banner__toggle"><input type="checkbox" checked={offline} onChange={(event) => setOffline(event.target.checked)} />Simulate a dropped connection</label>
        </div>
      )}
    />
  );
}
