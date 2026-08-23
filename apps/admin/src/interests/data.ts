import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  updateDoc,
  where,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

export type SubmissionStatus = 'new' | 'contacted' | 'in_progress' | 'resolved' | 'archived';

export interface GetInvolvedPayload {
  name: string;
  contact: string;
  country: string;
  organisation?: string;
  route: string;
  note: string;
}

export interface ContactPayload {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export interface PublicFormSubmission<T = GetInvolvedPayload | ContactPayload> {
  id: string;
  form: 'get-involved' | 'contact' | string;
  source: string;
  status: SubmissionStatus;
  receivedAt: Timestamp | string | { seconds: number; nanoseconds: number } | null;
  payload: T;
}

export const INTEREST_ROUTES = [
  'Language contributor',
  'Elder / teacher validator',
  'School or educator',
  'Researcher',
  'Diaspora supporter',
  'Sponsor or cultural partner',
  'Technical volunteer',
] as const;

export const SUBMISSION_STATUSES: { id: SubmissionStatus; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'contacted', label: 'Contacted' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'archived', label: 'Archived' },
];

/** Safe date formatter handling Firestore Timestamps, ISO strings, and dates. */
export function formatSubmissionDate(value: unknown): string {
  if (!value) return '—';
  try {
    if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
      return (value as { toDate: () => Date }).toDate().toLocaleString();
    }
    if (typeof value === 'object' && value !== null && 'seconds' in value && typeof (value as { seconds: number }).seconds === 'number') {
      return new Date((value as { seconds: number }).seconds * 1000).toLocaleString();
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
    }
    if (value instanceof Date) {
      return value.toLocaleString();
    }
  } catch {
    // Fallback
  }
  return String(value);
}

/** Fetch public form submissions, optionally filtering by form type. */
export async function fetchPublicSubmissions(formType?: string): Promise<PublicFormSubmission[]> {
  const base = collection(db, 'publicFormSubmissions');
  try {
    const q = formType && formType !== 'ALL'
      ? query(base, where('form', '==', formType), orderBy('receivedAt', 'desc'), limit(300))
      : query(base, orderBy('receivedAt', 'desc'), limit(300));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PublicFormSubmission);
  } catch {
    // Fallback if index on composite query is not deployed yet
    const snap = await getDocs(query(base, limit(300)));
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PublicFormSubmission);
    const filtered = formType && formType !== 'ALL'
      ? items.filter((item) => item.form === formType)
      : items;
    return filtered.sort((a, b) => {
      const timeA = typeof a.receivedAt === 'object' && a.receivedAt && 'seconds' in a.receivedAt
        ? (a.receivedAt as { seconds: number }).seconds * 1000
        : new Date(String(a.receivedAt ?? '')).getTime() || 0;
      const timeB = typeof b.receivedAt === 'object' && b.receivedAt && 'seconds' in b.receivedAt
        ? (b.receivedAt as { seconds: number }).seconds * 1000
        : new Date(String(b.receivedAt ?? '')).getTime() || 0;
      return timeB - timeA;
    });
  }
}

/** Update the status of a form submission (staff action). */
export async function updateSubmissionStatus(id: string, status: SubmissionStatus): Promise<void> {
  await updateDoc(doc(db, 'publicFormSubmissions', id), {
    status,
    updatedAt: new Date().toISOString(),
  });
}

/** Delete a submission permanently (admin action). */
export async function deletePublicSubmission(id: string): Promise<void> {
  await deleteDoc(doc(db, 'publicFormSubmissions', id));
}
