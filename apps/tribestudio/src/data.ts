import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  writeBatch,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebase';

export interface EntryInput {
  headword: string;
  partOfSpeech: string;
  definition: string;
  englishTranslation: string;
  example: string;
  languageId: string;
  culturalPermissionTier: string;
  consentGranted: boolean;
  licence: string;
}

export interface LexicalEntryDoc {
  id: string;
  headword: string;
  partOfSpeech: string;
  senses: Array<{
    definition: string;
    translations?: Array<{ languageCode: string; text: string }>;
    examples?: string[];
  }>;
  governance: {
    validationStatus: string;
    culturalPermissionTier: string;
    contributor: { collection: string; id: string };
    validator?: { collection: string; id: string } | null;
    consentStatus: string;
    consent?: { collection: string; id: string } | null;
    licence: string;
  };
  lifecycle: { createdAt: string; updatedAt: string; version: number };
}

function buildEntry(uid: string, input: EntryInput, status: 'draft' | 'submitted', consentId?: string) {
  const now = new Date().toISOString();
  const example = input.example.trim();
  const english = input.englishTranslation.trim();
  return {
    headword: input.headword.trim(),
    partOfSpeech: input.partOfSpeech,
    senses: [
      {
        definition: input.definition.trim(),
        translations: english ? [{ languageCode: 'en', text: english }] : [],
        ...(example ? { examples: [example] } : {}),
      },
    ],
    governance: {
      source: 'TribeStudio submission',
      contributor: { collection: 'contributors', id: uid },
      language: { collection: 'languages', id: input.languageId },
      dialect: null,
      validationStatus: status,
      validator: null,
      consentStatus: input.consentGranted ? 'granted' : 'pending',
      consent: consentId ? { collection: 'consentRecords', id: consentId } : null,
      licence: input.licence,
      culturalPermissionTier: input.culturalPermissionTier,
    },
    lifecycle: { createdAt: now, updatedAt: now, version: 1 },
  };
}

/** Create a lexical entry as a draft or directly submitted for review. */
export async function createEntry(
  uid: string,
  input: EntryInput,
  status: 'draft' | 'submitted',
): Promise<string> {
  const ref = doc(collection(db, 'lexicalEntries'));
  const batch = writeBatch(db);
  const consentId = input.consentGranted ? `consent-${ref.id}` : undefined;
  batch.set(ref, { id: ref.id, ...buildEntry(uid, input, status, consentId) });
  if (consentId) {
    const now = new Date().toISOString();
    batch.set(doc(db, 'consentRecords', consentId), {
      id: consentId,
      subject: { collection: 'contributors', id: uid },
      grantedBy: { collection: 'contributors', id: uid },
      status: 'granted',
      scope: ['publication'],
      method: 'digital_attestation',
      evidence: null,
      restrictions: '',
      effectiveFrom: now.slice(0, 10),
      expiresAt: null,
      lifecycle: { createdAt: now, updatedAt: now, version: 1 },
    });
  }
  await batch.commit();
  return ref.id;
}

/** Move one of the contributor's own drafts to `submitted`. */
export async function submitDraft(entry: LexicalEntryDoc, uid: string): Promise<void> {
  if (entry.governance.licence === 'undetermined') {
    throw new Error('Choose a publication licence before submitting this older draft.');
  }
  const batch = writeBatch(db);
  const consentId = entry.governance.consent?.id ?? `consent-${entry.id}`;
  if (entry.governance.consentStatus !== 'granted' || !entry.governance.consent) {
    const now = new Date().toISOString();
    batch.set(doc(db, 'consentRecords', consentId), {
      id: consentId,
      subject: { collection: 'contributors', id: uid },
      grantedBy: { collection: 'contributors', id: uid },
      status: 'granted',
      scope: ['publication'],
      method: 'digital_attestation',
      evidence: null,
      restrictions: '',
      effectiveFrom: now.slice(0, 10),
      expiresAt: null,
      lifecycle: { createdAt: now, updatedAt: now, version: 1 },
    });
  }
  batch.update(doc(db, 'lexicalEntries', entry.id), {
    'governance.validationStatus': 'submitted',
    'governance.consentStatus': 'granted',
    'governance.consent': { collection: 'consentRecords', id: consentId },
    'lifecycle.updatedAt': new Date().toISOString(),
    'lifecycle.version': entry.lifecycle.version + 1,
  });
  await batch.commit();
}

export async function fetchMyEntries(uid: string): Promise<LexicalEntryDoc[]> {
  const snap = await getDocs(
    query(collection(db, 'lexicalEntries'), where('governance.contributor.id', '==', uid)),
  );
  return snap.docs.map((d) => d.data() as LexicalEntryDoc);
}

export async function fetchSubmittedQueue(): Promise<LexicalEntryDoc[]> {
  const snap = await getDocs(
    query(
      collection(db, 'lexicalEntries'),
      where('governance.validationStatus', '==', 'submitted'),
      orderBy('lifecycle.createdAt', 'asc'),
    ),
  );
  return snap.docs.map((d) => d.data() as LexicalEntryDoc);
}

export type Decision = 'approved' | 'rejected' | 'needs_changes' | 'escalated';

export interface DecideResult {
  reviewId: string;
  previousStatus: string;
  newStatus: string;
}

/** Record a validation decision via the trusted Cloud Function. */
export async function decideReview(
  targetId: string,
  decision: Decision,
  notes: string,
  changesRequested: string[] = [],
): Promise<DecideResult> {
  const call = httpsCallable<
    { targetCollection: string; targetId: string; decision: Decision; notes: string; changesRequested: string[] },
    DecideResult
  >(functions, 'decideReview');
  const res = await call({ targetCollection: 'lexicalEntries', targetId, decision, notes, changesRequested });
  return res.data;
}

export interface LanguageOption {
  id: string;
  name: string;
}

export async function fetchLanguages(): Promise<LanguageOption[]> {
  try {
    const snap = await getDocs(collection(db, 'languages'));
    return snap.docs.map((d) => {
      const data = d.data() as { name?: string };
      return { id: d.id, name: data.name ?? d.id };
    });
  } catch {
    return [];
  }
}
