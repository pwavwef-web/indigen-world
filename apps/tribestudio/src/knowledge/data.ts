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
export interface RecordInput {
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
  id: string; schemaVersion: number; revision: number; authorUid: string; createdAt: string; updatedAt: string;
  status: Status; warnings: string[]; reviewCount: number; approvalCount: number;
}
export interface Review {
  reviewerUid?: string; reviewerId?: string; revision: number; decision: string;
  note: string; createdAt: string; languageCompetent: boolean; culturalCompetent: boolean;
}
export interface RecordDetail {
  record: KnowledgeRecord; reviews: Review[]; history: { revision: number; createdAt: string; status: string }[];
}
export interface RecordList { records: KnowledgeRecord[]; catalog: CatalogEntry[]; canReview: boolean; nextCursor: string | null }
export interface ReviewInput { id: string; revision: number; decision: 'approve' | 'changes_requested' | 'dispute'; languageCompetent: boolean; culturalCompetent: boolean; note: string }
export interface SaveInput { id?: string; revision?: number; requestId: string; record: RecordInput; submit: boolean }
export interface KnowledgeServices {
  list(input: { scope: 'mine' | 'review'; cursor?: string }): Promise<RecordList>;
  get(id: string): Promise<RecordDetail>;
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
  list: (input) => call('listKnowledgeRecords', input),
  get: (id) => call('getKnowledgeRecord', { id }),
  save: (input) => call('saveKnowledgeRecord', input),
  review: (input) => call('reviewKnowledgeRecord', input),
  withdraw: (id, revision) => call('withdrawKnowledgeRecord', { id, revision }),
  audio: (id, revision, index) => call('readKnowledgeAudio', { id, revision, index }),
  upload: (uid, file, progress) => {
    if (!file.type.startsWith('audio/')) return Promise.reject(new Error('Choose an audio recording.'));
    if (file.size >= 20 * 1024 * 1024) return Promise.reject(new Error('Choose a recording smaller than 20 MB.'));
    const path = `grammarAudio/${uid}/${crypto.randomUUID()}`;
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
    datasetType, language: 'xsm', title: '', original: '', english: '', french: '', context: '', region: '', source: '',
    sourceType: 'speaker', sourceReference: '', details: {}, variants: [], relatedRecordIds: [], audio: [],
    permissions: { review: false, sourceConfirmed: false, publication: false, providerRetrieval: false,
      modelTraining: false, evaluation: false, audio: false, licence: '', culturalAccess: 'open' },
  };
}
export function editable(record: KnowledgeRecord): RecordInput {
  const { datasetType, language, title, original, english, french, context, region, source, sourceType, sourceReference, details, variants, relatedRecordIds, permissions, audio } = record;
  return structuredClone({ datasetType, language, title, original, english, french, context, region, source, sourceType, sourceReference, details, variants, relatedRecordIds, permissions, audio });
}
export function missingFields(record: RecordInput, catalog?: CatalogEntry): string[] {
  const missing: string[] = [];
  for (const [key, label] of Object.entries({ title: 'Record title', original: 'Original Kasem', english: 'English meaning', context: 'Usage context', region: 'Region or dialect', source: 'Source attribution' })) {
    if (!(record[key as keyof RecordInput] as string).trim()) missing.push(label);
  }
  if (['literature', 'recording'].includes(record.sourceType) && !record.sourceReference.trim()) missing.push('Source reference');
  for (const field of catalog?.fields ?? []) if (field.required && !record.details[field.key]?.trim()) missing.push(field.label);
  if (!record.permissions.sourceConfirmed) missing.push('Source rights confirmation');
  if (!record.permissions.review) missing.push('Community review permission');
  if (record.datasetType === 'pronunciation' && !record.audio.length) missing.push('Pronunciation recording');
  if (record.audio.length && !record.permissions.audio) missing.push('Audio permission');
  record.audio.forEach((clip, index) => {
    if (!clip.transcript.trim()) missing.push(`Recording ${index + 1}: exact transcript`);
    if (!clip.speakerId.trim()) missing.push(`Recording ${index + 1}: speaker reference`);
    if (!clip.region.trim()) missing.push(`Recording ${index + 1}: region`);
  });
  return missing;
}
export function needsCulturalReview(record: RecordInput): boolean {
  return ['proverbs', 'literature', 'culture'].includes(record.datasetType) || record.permissions.culturalAccess !== 'open';
}
