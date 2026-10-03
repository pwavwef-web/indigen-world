import { submissionIssues, type CaptureMetadata, type Workflow, type Authentication, type ReviewScope, type Destination } from '@indigen-world/contracts/knowledge';
import { httpsCallable } from 'firebase/functions';
import { ref, uploadBytesResumable } from 'firebase/storage';
import { functions, storage } from '../firebase';

export type DatasetType = 'lexicon' | 'grammar' | 'expressions' | 'sentences' | 'proverbs' | 'literature' | 'dialogue' | 'pronunciation' | 'culture' | 'qa';
export type Status = 'draft' | 'submitted' | 'reviewed' | 'gold' | 'changes_requested' | 'disputed' | 'withdrawn';
export interface CatalogEntry {
  id: DatasetType; label: string; description: string;
  fields: { key: string; label: string; hint: string; required?: boolean; multiline?: boolean }[];
}
export interface AudioClip {
  path: string; label: string; transcript: string; speakerId: string; region: string;
  kind: 'isolated' | 'in_context'; environment: string; quality: string;
}
export interface RecordInput extends CaptureMetadata {
  datasetType: DatasetType; language: 'xsm'; title: string; original: string; english: string; french: string;
  context: string; region: string; source: string;
  sourceType: 'speaker' | 'literature' | 'recording' | 'other'; sourceReference: string;
  details: Record<string, string>;
  variants: { form: string; context: string; note: string }[];
  relatedRecordIds: string[];
  permissions: {
    review: boolean; sourceConfirmed: boolean; publication: boolean; providerRetrieval: boolean;
    modelTraining: boolean; evaluation: boolean; audio: boolean; licence: string;
    culturalAccess: 'open' | 'restricted' | 'sensitive';
  };
  audio: AudioClip[];
}
export interface KnowledgeRecord extends RecordInput {
  submittedAt?: string; displayId?: string; workflow?: Workflow; authentication?: Authentication; disputed?: boolean; id: string; schemaVersion: number; revision: number; authorUid: string; createdAt: string; updatedAt: string;
  status: Status; warnings: string[]; reviewCount: number; approvalCount: number;
}
export interface Review {
  scope?: ReviewScope; reviewerUid?: string; reviewerId?: string; revision: number; decision: string;
  note: string; createdAt: string; languageCompetent: boolean; culturalCompetent: boolean;
}
export interface RecordDetail {
  historical?: boolean; currentVersion?: number; canRelease?: boolean; releaseChecks?: Record<Destination, string[]>; events?: { action: string; revision: number; createdAt: string; outcome?: string }[]; record: KnowledgeRecord; reviews: Review[]; history: { revision: number; createdAt: string; status: string }[];
}
export interface KnowledgeProgress { counts: Record<string, number>; submitted: number; period: string; timezone: string; refreshedAt: string; definition: string }
export interface CorpusReference { recordId: string; displayId: string; revision: number; category: string; title: string; original: string; english: string; context: string; region: string; attribution: string; authentication: string }
export interface RecordList { policy: { version: string; approved: boolean; sentenceEnabled: boolean; releaseEnabled: boolean }; refreshedAt: string; records: KnowledgeRecord[]; catalog: CatalogEntry[]; canReview: boolean; nextCursor: string | null }
export interface ReviewInput { scope: ReviewScope; checklist: Record<string, boolean>; id: string; revision: number; decision: 'approve' | 'changes_requested' | 'dispute'; languageCompetent: boolean; culturalCompetent: boolean; note: string }
export interface SaveInput { id?: string; revision?: number; requestId: string; record: RecordInput; submit: boolean }
export interface KnowledgeServices {
  release(id: string, revision: number, destination: Destination, requestId: string): Promise<{ active: boolean }>;
  revoke(id: string, destination: Destination, reason: string): Promise<unknown>;
  progress(): Promise<KnowledgeProgress>;
  reference(input: { query: string; cursor?: string }): Promise<{ records: CorpusReference[]; nextCursor: string | null }>;

  list(input: { scope: 'mine' | 'review'; cursor?: string }): Promise<RecordList>;
  get(id: string, revision?: number): Promise<RecordDetail>;
  save(input: SaveInput): Promise<{ record: KnowledgeRecord }>;
  review(input: ReviewInput): Promise<{ record: KnowledgeRecord }>;
  withdraw(id: string, revision: number): Promise<{ record: KnowledgeRecord }>;
  upload(uid: string, file: File, progress: (percent: number) => void): Promise<string>;
  audio(id: string, revision: number, index: number): Promise<{ audio: string; contentType: string }>;
}
async function call<T>(name: string, input: unknown): Promise<T> {
  return (await httpsCallable<unknown, T>(functions, name)(input)).data;
}
export const knowledgeServices: KnowledgeServices = {
  release: (id, revision, destination, requestId) => call('releaseKnowledgeRecord', { id, revision, destination, requestId }),
  revoke: (id, destination, reason) => call('revokeKnowledgeRelease', { id, destination, reason }),
  progress: () => call('getKnowledgeProgress', {}),
  reference: (input) => call('resolveKnowledgeRecords', { ...input, destination: 'venacula' }),
  list: (input) => call('listKnowledgeRecords', input),
  get: (id, revision) => call('getKnowledgeRecord', { id, ...(revision ? { revision } : {}) }),
  save: (input) => call('saveKnowledgeRecord', input),
  review: (input) => call('reviewKnowledgeRecord', input),
  withdraw: (id, revision) => call('withdrawKnowledgeRecord', { id, revision }),
  audio: (id, revision, index) => call('readKnowledgeAudio', { id, revision, index }),
  upload: (uid, file, progress) => {
    if (!file.type.startsWith('audio/')) return Promise.reject(new Error('Choose an audio recording.'));
    if (file.size >= 20 * 1024 * 1024) return Promise.reject(new Error('Choose a recording smaller than 20 MB.'));
    const path = `knowledgeAudio/${uid}/${crypto.randomUUID()}`;
    const task = uploadBytesResumable(ref(storage, path), file, { contentType: file.type });
    return new Promise((resolve, reject) => task.on('state_changed', (snapshot) => {
      progress(Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100));
    }, reject, () => resolve(path)));
  },
};
export const STATUS_LABELS: Record<Status, string> = {
  draft: 'Draft', submitted: 'Awaiting review', reviewed: 'Review in progress', gold: 'Gold · human reviewed',
  changes_requested: 'Changes requested', disputed: 'Disputed', withdrawn: 'Withdrawn',
};
export function blankRecord(datasetType: DatasetType): RecordInput {
  return {
    ...blankMetadata(), datasetType, language: 'xsm', title: '', original: '', english: '', french: '', context: '', region: '', source: '',
    sourceType: 'speaker', sourceReference: '', details: {}, variants: [], relatedRecordIds: [], audio: [],
    permissions: { review: false, sourceConfirmed: false, publication: false, providerRetrieval: false,
      modelTraining: false, evaluation: false, audio: false, licence: '', culturalAccess: 'open' },
  };
}
export function blankMetadata(): CaptureMetadata {
  return { rights: { state: 'unresolved', holder: '', evidence: '', version: '', publicAttribution: '', restrictions: '', expiresAt: '', preservation: false, derivedMedia: false, speechSynthesis: false },
    valueStates: {}, structured: {}, relations: [], requestContext: '', split: 'unassigned', sourceFamily: '' };
}
export function editable(record: KnowledgeRecord): RecordInput {
  const { datasetType, language, title, original, english, french, context, region, source, sourceType, sourceReference, details, variants, relatedRecordIds, permissions, audio } = record;
  const metadata = blankMetadata();
  for (const key of Object.keys(metadata) as (keyof CaptureMetadata)[]) if (record[key] !== undefined) Object.assign(metadata, { [key]: record[key] });
  // Upload generation and checksum belong to the server, never to capture input.
  const cleanAudio = audio.map(({ path, label, transcript, speakerId, region, kind, environment, quality }) => ({ path, label, transcript, speakerId, region, kind, environment, quality }));
  return structuredClone({ ...metadata, datasetType, language, title, original, english, french, context, region, source, sourceType, sourceReference, details, variants, relatedRecordIds, permissions, audio: cleanAudio });
}
export function missingFields(record: RecordInput, _catalog?: CatalogEntry, sentenceEnabled = false): string[] {
  return submissionIssues(record, { sentenceEnabled }).map(issue => issue.message);
}
export function needsCulturalReview(record: RecordInput): boolean {
  return ['proverbs', 'literature', 'culture'].includes(record.datasetType) || record.permissions.culturalAccess !== 'open';
}
