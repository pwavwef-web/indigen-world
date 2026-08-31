import { useEffect, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getIdTokenResult, onAuthStateChanged, type User } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import type {
  Campaign,
  CreatorApplication,
  CreatorMembership,
  PlatformConfiguration,
  Submission,
} from '@indigen-world/contracts/creator-models';
import { auth, db, functions } from '../firebase';

export type AdminRole = 'contributor' | 'validator' | 'creator' | 'reviewer' | 'admin' | 'super_admin' | null;

export interface AdminAuthState {
  user: User | null;
  role: AdminRole;
  finance: boolean;
  ready: boolean;
}

/** Track the signed-in staff member, their role claim and finance access. */
export function useAdminAuth(): AdminAuthState {
  const [state, setState] = useState<AdminAuthState>({ user: null, role: null, finance: false, ready: false });
  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setState({ user: null, role: null, finance: false, ready: true });
        return;
      }
      try {
        const token = await getIdTokenResult(user);
        const claimed = token.claims.role;
        const role = claimed === 'contributor'
          || claimed === 'validator'
          || claimed === 'creator'
          || claimed === 'reviewer'
          || claimed === 'admin'
          || claimed === 'super_admin'
          ? claimed
          : null;
        setState({ user, role, finance: token.claims.finance === true, ready: true });
      } catch {
        // A transient token-refresh failure must not wedge the console on
        // "Loading…" forever — render the shell with no role rather than hang.
        setState({ user, role: null, finance: false, ready: true });
      }
    });
  }, []);
  return state;
}

export const isValidator = (r: AdminRole) => r === 'validator' || r === 'reviewer' || r === 'admin' || r === 'super_admin';
export const isAdmin = (r: AdminRole) => r === 'admin' || r === 'super_admin';

// ---------------------------------------------------------------------------
// Team site requests
// ---------------------------------------------------------------------------

export interface TeamSiteRequest {
  id: string;
  formVersion: 1;
  status: 'new';
  submittedAt: string;
  fields: {
    fullName: string;
    displayName: string;
    roleTitle: string;
    teamCompany: string;
    email: string;
    phone: string;
    location: string;
    sitePurpose: string;
    audience: string;
    visitorAction: string;
    siteName: string;
    tagline: string;
    brandColors: string;
    preferredStyle: string;
    inspirationLinks: string;
    shortBio: string;
    services: string;
    projects: string;
    testimonials: string;
    achievements: string;
    logoAvailable: string;
    profilePhotoAvailable: string;
    mediaNotes: string;
    socialLinks: string;
    bookingLink: string;
    paymentLink: string;
    portfolioLinks: string;
    contactFields: string;
    submissionDestination: string;
    extraNotes: string;
    exclusions: string;
    deadline: string;
  };
  desiredPages: string[];
  features: string[];
}

export type TeamSiteRequestInput = Omit<TeamSiteRequest, 'id'>;

export async function createTeamSiteRequest(input: TeamSiteRequestInput): Promise<string> {
  const ref = await addDoc(collection(db, 'teamSiteRequests'), input);
  return ref.id;
}

export async function fetchTeamSiteRequests(): Promise<TeamSiteRequest[]> {
  const snap = await getDocs(query(collection(db, 'teamSiteRequests'), orderBy('submittedAt', 'desc'), limit(200)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as TeamSiteRequest);
}

export async function deleteTeamSiteRequest(id: string): Promise<void> {
  await deleteDoc(doc(db, 'teamSiteRequests', id));
}

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

export async function fetchApplications(status?: string): Promise<CreatorApplication[]> {
  const base = collection(db, 'creatorApplications');
  const q = status && status !== 'ALL'
    ? query(base, where('status', '==', status), orderBy('lifecycle.createdAt', 'desc'))
    : query(base, orderBy('lifecycle.createdAt', 'desc'), limit(200));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as CreatorApplication);
}

export async function decideApplication(applicationId: string, decision: string, reason: string) {
  const call = httpsCallable<{ applicationId: string; decision: string; reason: string }, unknown>(functions, 'decideCreatorApplication');
  return call({ applicationId, decision, reason });
}

export async function fetchCreatorMemberships(): Promise<CreatorMembership[]> {
  const snap = await getDocs(query(collection(db, 'creatorMemberships'), orderBy('updatedAt', 'desc'), limit(300)));
  return snap.docs.map((d) => d.data() as CreatorMembership);
}

// ---------------------------------------------------------------------------
// Community members and their verification
// ---------------------------------------------------------------------------

/**
 * The kinds staff can grant. `member` is not here on purpose: it is what a
 * verified phone number earns, and nobody hands it out.
 */
export const VERIFIED_KINDS = ['', 'creator', 'elder', 'project'] as const;
export type VerifiedKind = (typeof VERIFIED_KINDS)[number];

export const VERIFIED_KIND_LABELS: Record<VerifiedKind, string> = {
  '': 'No mark',
  creator: 'Published creator',
  elder: 'Language custodian',
  project: 'Project account',
};

export interface CommunityMemberRow {
  uid: string;
  username: string;
  displayName: string;
  verifiedKind: VerifiedKind;
  phoneVerified: boolean;
}

function asVerifiedKind(value: unknown): VerifiedKind {
  return (VERIFIED_KINDS as readonly string[]).includes(String(value))
    ? (value as VerifiedKind)
    : '';
}

/**
 * Community profiles, newest first, optionally narrowed by handle.
 *
 * The search is an exact handle match rather than a prefix scan: handles are
 * unique and staff granting a badge already know whose it is, so the useful
 * query is "show me this person" and not "show me everyone starting with a".
 */
export async function fetchCommunityMembers(handle?: string): Promise<CommunityMemberRow[]> {
  const trimmed = (handle ?? '').trim().toLowerCase().replace(/^@/, '');
  const base = collection(db, 'communityProfiles');
  const snap = await getDocs(
    trimmed
      ? query(base, where('username', '==', trimmed), limit(20))
      : query(base, orderBy('createdAt', 'desc'), limit(100)),
  );
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      uid: d.id,
      username: String(data.username ?? d.id),
      displayName: String(data.displayName ?? 'Community member'),
      // A profile written before verification had kinds carries only the old
      // boolean, and nothing in the app could ever set it — so one that is true
      // was marked by hand, which means the project.
      verifiedKind: data.verifiedKind === undefined && data.isVerified === true
        ? 'project'
        : asVerifiedKind(data.verifiedKind),
      phoneVerified: data.phoneVerified === true,
    };
  });
}

/**
 * Grants or clears a member's mark.
 *
 * The rules would let an admin write `communityProfiles` from here, but they
 * let nobody write `auditLogs` — that collection is the server's alone, and
 * handing somebody the standing of a language custodian is exactly the kind of
 * decision that should be answerable later. So both writes happen in one
 * callable, under admin credentials, or neither does.
 */
export async function setMemberVerifiedKind(uid: string, kind: VerifiedKind): Promise<void> {
  const call = httpsCallable<{ uid: string; kind: VerifiedKind }, unknown>(functions, 'setCommunityVerifiedKind');
  await call({ uid, kind });
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export async function fetchCampaigns(): Promise<Campaign[]> {
  const snap = await getDocs(query(collection(db, 'campaigns'), orderBy('lifecycle.createdAt', 'desc')));
  return snap.docs.map((d) => d.data() as Campaign);
}

export async function createCampaign(input: { title: string; slug: string; initiative: string; description: string }): Promise<string> {
  const now = new Date().toISOString();
  const id = input.slug;
  const document: Campaign = {
    id,
    slug: input.slug,
    title: input.title,
    initiative: input.initiative,
    description: input.description,
    status: 'DRAFT',
    visibility: 'internal',
    categories: [],
    schemaVersion: 1,
    lifecycle: { createdAt: now, updatedAt: now, version: 1 },
  };
  await setDoc(doc(db, 'campaigns', id), document);
  return id;
}

export async function updateCampaign(id: string, patch: Partial<Campaign>): Promise<void> {
  await updateDoc(doc(db, 'campaigns', id), {
    ...patch,
    'lifecycle.updatedAt': new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Submissions / review queue
// ---------------------------------------------------------------------------

// Keep approved and published work visible so publication remains an explicit,
// reversible lifecycle step in the same review workspace.
const REVIEW_STATES = ['SUBMITTED', 'RESUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'PUBLISHED'];

export async function fetchReviewQueue(): Promise<Submission[]> {
  const snap = await getDocs(query(collection(db, 'submissions'), where('status', 'in', REVIEW_STATES)));
  return snap.docs
    .map((d) => d.data() as Submission)
    .sort((a, b) => (a.lifecycle.createdAt ?? '').localeCompare(b.lifecycle.createdAt ?? ''));
}

export async function decideSubmission(submissionId: string, decision: string, feedback: string, scores: Record<string, number> = {}) {
  const call = httpsCallable<{ submissionId: string; decision: string; feedback: string; scores: Record<string, number> }, unknown>(functions, 'decideSubmission');
  return call({ submissionId, decision, feedback, scores });
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export async function fetchConfig(): Promise<PlatformConfiguration | null> {
  const snap = await getDoc(doc(db, 'platformConfiguration', 'creators'));
  return snap.exists() ? (snap.data() as PlatformConfiguration) : null;
}

export async function saveConfig(config: PlatformConfiguration): Promise<void> {
  await setDoc(doc(db, 'platformConfiguration', 'creators'), {
    ...config,
    'lifecycle': { ...config.lifecycle, updatedAt: new Date().toISOString(), version: (config.lifecycle?.version ?? 1) + 1 },
  });
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export async function fetchAuditLogs(): Promise<Record<string, unknown>[]> {
  try {
    const snap = await getDocs(query(collection(db, 'auditLogs'), orderBy('occurredAt', 'desc'), limit(50)));
    return snap.docs.map((d) => d.data() as Record<string, unknown>);
  } catch {
    return [];
  }
}
