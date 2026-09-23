import { useEffect, useMemo, useState } from 'react';
import { collection, doc, limit, onSnapshot, orderBy, query, where, type Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { EmailAuthProvider, reauthenticateWithCredential, sendPasswordResetEmail, updatePassword } from 'firebase/auth';
import { auth, db, functions, storage } from '../firebase';
import { signOutUser } from '../auth';
import type { Item, PaymentNotice, SubmissionRound, Work } from './model';
import type {
  AccountTab,
  LoadState,
  PortalPaths,
  PulseEntry,
  PulseState,
  Section,
  WorkspaceServices,
} from './types';

/**
 * The live half of the contributor workspace: Firestore listeners for what
 * the contributor may read directly (their assignments, their own review
 * rounds, their notifications, the community pulse), and callables for
 * everything the backend must check first.
 *
 * Every listener reports failure instead of hanging on "Loading…": a rule
 * that is not deployed yet, or a dropped connection, becomes an honest empty
 * state with a retry rather than a spinner.
 */

export const STATEMENT_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};
export const STATEMENT_MAX_BYTES = 10 * 1024 * 1024;
export const STATEMENT_MIN_BYTES = 1024;
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/** Today in UTC, which is local time in Ghana; the backend keys the pulse the same way. */
export function pulseDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function iso(value: unknown): string {
  if (typeof value === 'string') return value;
  const stamp = value as Timestamp | null;
  return stamp && typeof stamp.toDate === 'function' ? stamp.toDate().toISOString() : '';
}

export function livePaths(uid: string): PortalPaths {
  const base = '/contributor';
  const withQuery = (path: string, params?: Record<string, string>) => {
    const search = params ? new URLSearchParams(Object.entries(params).filter(([, value]) => value)).toString() : '';
    return search ? `${path}?${search}` : path;
  };
  return {
    base,
    section: (section: Section, params?: Record<string, string>) => withQuery(section === 'overview' ? base : `${base}/${section}`, params),
    account: (tab: AccountTab) => `${base}/account/${tab}`,
    work: (workId: string, itemId?: string) => withQuery(`${base}/${uid}/${workId}`, itemId ? { item: itemId } : undefined),
  };
}

export interface LiveWorkspace {
  works: Work[];
  worksState: LoadState;
  items: Record<string, Item[]>;
  itemsState: LoadState;
  rounds: SubmissionRound[];
  roundsState: LoadState;
  paymentNotices: PaymentNotice[];
  pulse: PulseState;
}

export function useLiveWorkspace(uid: string): LiveWorkspace {
  const [works, setWorks] = useState<Work[]>([]);
  const [worksState, setWorksState] = useState<LoadState>('loading');
  const [items, setItems] = useState<Record<string, Item[]>>({});
  const [itemErrors, setItemErrors] = useState<Record<string, boolean>>({});
  const [rounds, setRounds] = useState<SubmissionRound[]>([]);
  const [roundsState, setRoundsState] = useState<LoadState>('loading');
  const [paymentNotices, setPaymentNotices] = useState<PaymentNotice[]>([]);
  const [pulseEntries, setPulseEntries] = useState<PulseEntry[]>([]);
  const [pulseTotals, setPulseTotals] = useState<PulseState['totals']>(null);
  const [pulseStatus, setPulseStatus] = useState<{ state: PulseState['state']; reason: string }>({ state: 'loading', reason: '' });

  useEffect(() => onSnapshot(collection(db, 'contributorAccounts', uid, 'works'), (snapshot) => {
    setWorks(snapshot.docs.map((entry) => ({ ...entry.data(), id: entry.id }) as Work)
      .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))));
    setWorksState('ready');
  }, () => setWorksState('error')), [uid]);

  const workKey = works.map((work) => work.id).join(',');
  useEffect(() => {
    if (!workKey) return;
    const unsubscribers = workKey.split(',').map((workId) => onSnapshot(
      collection(db, 'contributorAccounts', uid, 'works', workId, 'items'),
      (snapshot) => {
        setItems((current) => ({ ...current, [workId]: snapshot.docs.map((entry) => ({ ...entry.data(), id: entry.id }) as Item) }));
        setItemErrors((current) => ({ ...current, [workId]: false }));
      },
      () => setItemErrors((current) => ({ ...current, [workId]: true })),
    ));
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [uid, workKey]);

  useEffect(() => onSnapshot(query(collection(db, 'submissions'), where('authUid', '==', uid), limit(500)), (snapshot) => {
    setRounds(snapshot.docs.flatMap((entry) => {
      const data = entry.data() as Record<string, unknown>;
      const portal = data.contributorPortal as Record<string, unknown> | undefined;
      if (!portal || typeof portal.work !== 'string' || typeof portal.item !== 'string') return [];
      const lifecycle = (data.lifecycle ?? {}) as Record<string, unknown>;
      const moderation = (data.moderation ?? {}) as Record<string, unknown>;
      return [{
        id: entry.id,
        work: portal.work,
        item: portal.item,
        expression: String(data.title ?? ''),
        status: String(data.status ?? ''),
        createdAt: iso(lifecycle.createdAt),
        decidedAt: iso(moderation.decidedAt),
        feedback: String(moderation.feedback ?? ''),
        revisionOf: String(data.revisionOf ?? ''),
      }];
    }));
    setRoundsState('ready');
  }, () => setRoundsState('error')), [uid]);

  useEffect(() => onSnapshot(query(collection(db, 'notifications'), where('authUid', '==', uid), limit(100)), (snapshot) => {
    setPaymentNotices(snapshot.docs.flatMap((entry) => {
      const data = entry.data() as Record<string, unknown>;
      if (data.type !== 'payout_verification') return [];
      const lifecycle = (data.lifecycle ?? {}) as Record<string, unknown>;
      return [{ id: entry.id, title: String(data.title ?? ''), body: String(data.body ?? ''), createdAt: iso(lifecycle.createdAt) }];
    }));
  }, () => setPaymentNotices([])), [uid]);

  useEffect(() => {
    const day = pulseDay();
    const failed = (error: { code?: string }) => setPulseStatus({
      state: 'unavailable',
      reason: error?.code === 'permission-denied' ? 'permission' : 'connection',
    });
    const stopTotals = onSnapshot(doc(db, 'contributorPulseTotals', day), { includeMetadataChanges: true }, (snapshot) => {
      const data = snapshot.data() as Record<string, unknown> | undefined;
      const count = (value: unknown) => (Array.isArray(value) ? value.length : 0);
      setPulseTotals(data ? { submitted: count(data.submitted), approved: count(data.approved), contributors: count(data.contributors) } : { submitted: 0, approved: 0, contributors: 0 });
      setPulseStatus({ state: snapshot.metadata.fromCache ? 'cached' : 'live', reason: '' });
    }, failed);
    const stopEntries = onSnapshot(query(collection(db, 'contributorPulse'), orderBy('updatedAt', 'desc'), limit(12)), (snapshot) => {
      setPulseEntries(snapshot.docs.map((entry) => {
        const data = entry.data() as Record<string, unknown>;
        return {
          id: entry.id,
          day: String(data.day ?? ''),
          label: typeof data.label === 'string' && data.label ? data.label : null,
          submitted: Array.isArray(data.submitted) ? data.submitted.length : 0,
          approved: Array.isArray(data.approved) ? data.approved.length : 0,
          updatedAt: iso(data.updatedAt),
        };
      }));
    }, failed);
    return () => {
      stopTotals();
      stopEntries();
    };
  }, [uid]);

  const itemsState: LoadState = worksState === 'error' || Object.values(itemErrors).some(Boolean)
    ? 'error'
    : worksState === 'ready' && works.every((work) => items[work.id]) ? 'ready' : 'loading';

  const pulse = useMemo<PulseState>(() => ({
    state: pulseStatus.state,
    reason: pulseStatus.reason,
    totals: pulseTotals,
    entries: pulseEntries,
  }), [pulseEntries, pulseStatus, pulseTotals]);

  return { works, worksState, items, itemsState, rounds, roundsState, paymentNotices, pulse };
}

function callable<Input, Output>(name: string) {
  const call = httpsCallable<Input, Output>(functions, name);
  return async (input: Input): Promise<Output> => (await call(input)).data;
}

function randomId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function upload(path: string, file: File, contentType: string, onProgress?: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(ref(storage, path), file, { contentType });
    task.on('state_changed', (snapshot) => {
      if (snapshot.totalBytes) onProgress?.(snapshot.bytesTransferred / snapshot.totalBytes);
    }, reject, () => resolve());
  });
}

/** Client-side checks mirror the server's, so a wrong file is refused before it uploads. */
export function statementProblem(file: Pick<File, 'type' | 'size'>): string {
  if (!STATEMENT_TYPES[file.type]) return 'Choose a PDF, JPEG or PNG file.';
  if (file.size < STATEMENT_MIN_BYTES) return 'That file is too small to be a statement.';
  if (file.size > STATEMENT_MAX_BYTES) return 'That file is larger than 10 MB. Export a smaller PDF or take a clearer photo of just the first page.';
  return '';
}

export function liveServices(uid: string, email: string): WorkspaceServices {
  const saveAnswer = httpsCallable<Record<string, unknown>, { revision: number; submissionId?: string }>(functions, 'saveExpressionAnswer');
  return {
    saveAnswer: (data) => saveAnswer(data),
    loadPayments: () => callable<Record<string, never>, Awaited<ReturnType<WorkspaceServices['loadPayments']>>>('getContributorPayments')({}),
    async uploadStatement(file, onProgress) {
      const problem = statementProblem(file);
      if (problem) throw Object.assign(new Error(problem), { code: 'invalid-file' });
      const uploadId = randomId();
      const fileName = `statement.${STATEMENT_TYPES[file.type]}`;
      await upload(`contributor-payout-statements/${uid}/${uploadId}/${fileName}`, file, file.type, onProgress);
      return { uploadId, fileName };
    },
    submitBank: (input) => callable<typeof input, Awaited<ReturnType<WorkspaceServices['submitBank']>>>('submitBankVerification')(input),
    removeMethod: (method) => callable<{ method: string }, Awaited<ReturnType<WorkspaceServices['removeMethod']>>>('removePayoutMethod')({ method }),
    setPreferred: (method) => callable<{ method: string }, Awaited<ReturnType<WorkspaceServices['setPreferred']>>>('setPreferredPayoutMethod')({ method }),
    startMomo: (input) => callable<typeof input, Awaited<ReturnType<WorkspaceServices['startMomo']>>>('startMomoVerification')(input),
    confirmMomo: (code) => callable<{ code: string }, Awaited<ReturnType<WorkspaceServices['confirmMomo']>>>('confirmMomoVerification')({ code }),
    loadSelf: () => callable<Record<string, never>, Awaited<ReturnType<WorkspaceServices['loadSelf']>>>('getContributorSelf')({}),
    updateSelf: (input) => callable<typeof input, Awaited<ReturnType<WorkspaceServices['updateSelf']>>>('updateContributorSelf')(input),
    async uploadPhoto(file) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw Object.assign(new Error('Choose a JPEG, PNG or WebP photo.'), { code: 'invalid-file' });
      if (file.size > PHOTO_MAX_BYTES) throw Object.assign(new Error('Choose a photo smaller than 5 MB.'), { code: 'invalid-file' });
      const extension = file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1];
      const path = `creator-avatars/${uid}/contributor-${Date.now()}.${extension}`;
      await upload(path, file, file.type);
      return getDownloadURL(ref(storage, path));
    },
    saveSettings: (input) => callable<typeof input, Awaited<ReturnType<WorkspaceServices['saveSettings']>>>('saveContributorSettings')(input),
    assist: (input) => callable<typeof input, Awaited<ReturnType<WorkspaceServices['assist']>>>('kawuriContributorAssist')(input),
    async changePassword(current, next) {
      const user = auth.currentUser;
      if (!user?.email) throw Object.assign(new Error('Sign in again to change your password.'), { code: 'auth/requires-recent-login' });
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
      await updatePassword(user, next);
    },
    sendPasswordReset: () => sendPasswordResetEmail(auth, email, { url: `${window.location.origin}/contributor` }),
    signOut: () => signOutUser(),
  };
}
