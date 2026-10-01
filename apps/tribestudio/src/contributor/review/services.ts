import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type QueryConstraint,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref } from 'firebase/storage';
import { db, functions, storage } from '../../firebase';
import { signOutUser } from '../../auth';
import { fetchHeadwordMatches, type PublishedHeadword } from '../../creator/dictionary-data';
import { DESKS, itemCreatedAt, itemTitle, type Desk, type ReviewRecord } from './model';

/**
 * What the review workspace reads and calls. The live implementation uses
 * Firestore listeners (staff may read every queue under the Security Rules)
 * and the trusted decision callables; the local preview supplies sample data
 * through the same interface.
 */

export const QUEUE_LIMIT = 250;

export interface DecisionRecord {
  desk: Desk;
  id: string;
  title: string;
  status: string;
  decision: string;
  decidedAt: number;
}

export interface ReviewServices {
  watchQueue(desk: Desk, statuses: string[], onData: (rows: ReviewRecord[], limited: boolean) => void, onError: (error: Error) => void): () => void;
  watchItem(desk: Desk, id: string, onData: (row: ReviewRecord | null) => void, onError: (error: Error) => void): () => void;
  countQueue(desk: Desk, statuses: string[]): Promise<number>;
  oldestWaiting(desk: Desk, statuses: string[]): Promise<number | null>;
  loadSubmission(id: string): Promise<ReviewRecord | null>;
  mediaUrl(storagePath: string): Promise<string>;
  call(callable: string, data: Record<string, unknown>): Promise<unknown>;
  readSentenceAudio(input: { noteId: string; revision: number; example: number }): Promise<{ audio: string; contentType: string }>;
  myDecisions(uid: string): Promise<DecisionRecord[]>;
  lookupHeadwords(spelling: string): Promise<PublishedHeadword[]>;
  hasContributorAccount(uid: string): Promise<boolean>;
  signOut(): Promise<void>;
}

function rowOf(snapshot: { id: string; data: () => Record<string, unknown> | undefined }): ReviewRecord {
  const data = snapshot.data() ?? {};
  return { ...data, id: snapshot.id, status: String(data.status ?? '') } as ReviewRecord;
}

function queueQuery(desk: Desk, status: string) {
  const config = DESKS[desk];
  const constraints: QueryConstraint[] = [where('status', '==', status)];
  // Ordered where an index exists (submissions: status + lifecycle.createdAt;
  // pronunciationRecordings: status + createdAt), so the oldest work is never
  // cut off by the limit. Other queues are small and sorted on the client.
  if (config.order) constraints.push(orderBy(config.order.field, config.order.direction));
  constraints.push(limit(QUEUE_LIMIT));
  return query(collection(db, config.collection), ...constraints);
}

export const liveReviewServices: ReviewServices = {
  watchQueue(desk, statuses, onData, onError) {
    const results = new Map<string, { rows: ReviewRecord[]; limited: boolean }>();
    const unsubscribers = statuses.map((status) => onSnapshot(queueQuery(desk, status), (snapshot) => {
      results.set(status, { rows: snapshot.docs.map((entry) => rowOf(entry)), limited: snapshot.size >= QUEUE_LIMIT });
      if (results.size === statuses.length) {
        const merged = [...results.values()];
        onData(merged.flatMap((entry) => entry.rows), merged.some((entry) => entry.limited));
      }
    }, (error) => onError(error)));
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  },
  watchItem(desk, id, onData, onError) {
    return onSnapshot(doc(db, DESKS[desk].collection, id), (snapshot) => onData(snapshot.exists() ? rowOf(snapshot) : null), (error) => onError(error));
  },
  async countQueue(desk, statuses) {
    const counts = await Promise.all(statuses.map((status) => getCountFromServer(query(collection(db, DESKS[desk].collection), where('status', '==', status)))));
    return counts.reduce((sum, entry) => sum + entry.data().count, 0);
  },
  async oldestWaiting(desk, statuses) {
    if (DESKS[desk].order?.direction !== 'asc') return null;
    const firsts = await Promise.all(statuses.map((status) => getDocs(query(
      collection(db, DESKS[desk].collection), where('status', '==', status), orderBy(DESKS[desk].order!.field, 'asc'), limit(1),
    ))));
    const times = firsts.flatMap((snapshot) => snapshot.docs.map((entry) => itemCreatedAt(rowOf(entry)))).filter(Boolean);
    return times.length ? Math.min(...times) : null;
  },
  async loadSubmission(id) {
    const snapshot = await getDoc(doc(db, 'submissions', id));
    return snapshot.exists() ? rowOf(snapshot) : null;
  },
  mediaUrl: (storagePath) => getDownloadURL(ref(storage, storagePath)),
  async call(callable, data) {
    return (await httpsCallable(functions, callable, { timeout: 120_000 })(data)).data;
  },
  async readSentenceAudio(input) {
    return (await httpsCallable<typeof input, { audio: string; contentType: string }>(functions, 'readGrammarAudio')(input)).data;
  },
  async myDecisions(uid) {
    // Single-field equality queries: served by Firestore's automatic indexes.
    // Each records only the latest decision on an item, so an item someone
    // decided after you (a publish after your approval) is listed under them.
    const [submissions, recordings, names] = await Promise.all([
      getDocs(query(collection(db, 'submissions'), where('moderation.reviewer.id', '==', uid), limit(200))),
      getDocs(query(collection(db, 'pronunciationRecordings'), where('decidedBy', '==', uid), limit(200))),
      getDocs(query(collection(db, 'kasemNameRequests'), where('reviewerUid', '==', uid), limit(200))),
    ]);
    const decided = (value: unknown) => itemCreatedAt({ id: '', status: '', createdAt: value } as ReviewRecord);
    return [
      ...submissions.docs.map((entry) => {
        const row = rowOf(entry);
        return { desk: 'contributions' as const, id: row.id, title: itemTitle('contributions', row), status: row.status, decision: row.status, decidedAt: decided(row.moderation?.decidedAt) };
      }),
      ...recordings.docs.map((entry) => {
        const row = rowOf(entry);
        return { desk: 'recordings' as const, id: row.id, title: itemTitle('recordings', row), status: row.status, decision: row.status, decidedAt: decided(row.decidedAt) };
      }),
      ...names.docs.map((entry) => {
        const row = rowOf(entry);
        return { desk: 'names' as const, id: row.id, title: itemTitle('names', row), status: row.status, decision: row.status, decidedAt: decided(row.decidedAt) };
      }),
    ].sort((a, b) => b.decidedAt - a.decidedAt || a.id.localeCompare(b.id));
  },
  lookupHeadwords: (spelling) => fetchHeadwordMatches(spelling),
  async hasContributorAccount(uid) {
    try {
      return (await getDoc(doc(db, 'contributorAccounts', uid))).get('status') === 'active';
    } catch {
      return false;
    }
  },
  signOut: () => signOutUser(),
};
