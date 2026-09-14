import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type DocumentSnapshot,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

export const REPORT_STATUSES = [
  { id: 'open', label: 'Open' },
  { id: 'reviewing', label: 'Reviewing' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'dismissed', label: 'Dismissed' },
] as const;

export type ReportStatus = (typeof REPORT_STATUSES)[number]['id'];

/** What a report is about: one post, or a whole community. */
export type ReportTarget = 'post' | 'community';

/**
 * Sub-communities live in `communitySpaces`. The older `communities`
 * collection is the cultural registry from packages/contracts and is not what
 * members report.
 */
const COMMUNITY_SPACES = 'communitySpaces';

export interface ReportedMedia {
  url: string;
  type: 'image' | 'video' | 'audio';
  thumbnailUrl: string;
}

export interface ReportedPost {
  id: string;
  authorId: string;
  authorName: string;
  authorUsername: string;
  text: string;
  media: ReportedMedia[];
  createdAt: Timestamp | null;
  /** True for a post that lives inside a private community's own collection. */
  isPrivateCommunityPost: boolean;
}

export type CommunitySpaceStatus = 'active' | 'closed' | 'removed';

export interface ReportedCommunity {
  id: string;
  name: string;
  description: string;
  visibility: 'public' | 'private';
  memberCount: number;
  ownerId: string;
  rules: string[];
  avatarUrl: string;
  status: CommunitySpaceStatus;
  createdAt: Timestamp | null;
}

export interface ReportAuthor {
  id: string;
  displayName: string;
  username: string;
}

export interface CommunityReport {
  id: string;
  target: ReportTarget;
  postId: string;
  communityId: string;
  reporterId: string;
  reason: string;
  status: ReportStatus;
  createdAt: Timestamp | null;
  post: ReportedPost | null;
  /** The community the report names, or the community a reported post is in. */
  community: ReportedCommunity | null;
  reporter: ReportAuthor | null;
}

function reportStatus(value: unknown): ReportStatus {
  return REPORT_STATUSES.some((status) => status.id === value)
    ? value as ReportStatus
    : 'open';
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function mediaFrom(value: unknown): ReportedMedia[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const media = item as Record<string, unknown>;
    if (typeof media.url !== 'string' || !media.url) return [];
    const type = media.type === 'video' || media.type === 'audio' ? media.type : 'image';
    return [{
      url: media.url,
      type,
      thumbnailUrl: typeof media.thumbnailUrl === 'string' ? media.thumbnailUrl : '',
    }];
  });
}

function postFrom(document: DocumentSnapshot, isPrivateCommunityPost: boolean): ReportedPost | null {
  if (!document.exists()) return null;
  const data = document.data();
  const author = data.author && typeof data.author === 'object'
    ? data.author as Record<string, unknown>
    : {};
  return {
    id: document.id,
    authorId: text(data.authorId),
    authorName: text(author.displayName) || 'Community member',
    authorUsername: text(author.username),
    text: typeof data.text === 'string' ? data.text : '',
    media: mediaFrom(data.media),
    createdAt: (data.createdAt as Timestamp | undefined) ?? null,
    isPrivateCommunityPost,
  };
}

function communityFrom(document: DocumentSnapshot): ReportedCommunity | null {
  if (!document.exists()) return null;
  const data = document.data();
  const status = data.status === 'closed' || data.status === 'removed' ? data.status : 'active';
  return {
    id: document.id,
    name: text(data.name) || document.id,
    description: text(data.description),
    visibility: data.visibility === 'private' ? 'private' : 'public',
    memberCount: typeof data.memberCount === 'number' && data.memberCount > 0 ? data.memberCount : 0,
    ownerId: text(data.ownerId),
    rules: Array.isArray(data.rules)
      ? data.rules.filter((rule: unknown): rule is string => typeof rule === 'string')
      : [],
    avatarUrl: /^https:\/\//i.test(text(data.avatarUrl)) ? text(data.avatarUrl) : '',
    status,
    createdAt: (data.createdAt as Timestamp | undefined) ?? null,
  };
}

/** Load the newest reports and hydrate the member, post and community details
 * an admin needs to understand each report without leaving the console. */
export async function listCommunityReports(): Promise<CommunityReport[]> {
  const reportSnapshot = await getDocs(
    query(collection(db, 'communityReports'), orderBy('createdAt', 'desc'), limit(200)),
  );
  const records = reportSnapshot.docs.map((entry) => {
    const data = entry.data();
    const postId = text(data.postId);
    const communityId = text(data.communityId);
    // Community reports carry an empty postId; older post reports carry no
    // targetType at all.
    const target: ReportTarget = data.targetType === 'community' || (!postId && communityId)
      ? 'community'
      : 'post';
    return {
      id: entry.id,
      target,
      postId,
      communityId,
      reporterId: text(data.reporterId),
      reason: text(data.reason),
      status: reportStatus(data.status),
      createdAt: (data.createdAt as Timestamp | undefined) ?? null,
    };
  });

  const postIds = [...new Set(records.map((report) => report.postId).filter(Boolean))];
  const communityIds = [...new Set(records.map((report) => report.communityId).filter(Boolean))];
  const reporterIds = [...new Set(records.map((report) => report.reporterId).filter(Boolean))];
  const [postDocuments, communityDocuments, profileDocuments] = await Promise.all([
    Promise.all(postIds.map((id) => getDoc(doc(db, 'communityPosts', id)))),
    Promise.all(communityIds.map((id) => getDoc(doc(db, COMMUNITY_SPACES, id)))),
    Promise.all(reporterIds.map((id) => getDoc(doc(db, 'communityProfiles', id)))),
  ]);
  const posts = new Map(postDocuments.map((document) => [document.id, postFrom(document, false)]));
  const communities = new Map(communityDocuments.map((document) => [document.id, communityFrom(document)]));
  const profiles = new Map(profileDocuments.map((document) => [document.id, document]));

  // A post in a private community is not in communityPosts at all: it lives
  // under the community, where staff may read it.
  const privatePostReads = records.filter((report) => (
    report.target === 'post'
    && report.postId
    && report.communityId
    && !posts.get(report.postId)
  ));
  const privatePosts = await Promise.all(privatePostReads.map(async (report) => {
    try {
      const document = await getDoc(doc(db, COMMUNITY_SPACES, report.communityId, 'posts', report.postId));
      return [report.id, postFrom(document, true)] as const;
    } catch {
      return [report.id, null] as const;
    }
  }));
  const privateByReport = new Map(privatePosts);

  return records.map((report) => {
    const profileDocument = profiles.get(report.reporterId);
    const profileData = profileDocument?.data();
    return {
      ...report,
      post: report.target === 'post'
        ? posts.get(report.postId) ?? privateByReport.get(report.id) ?? null
        : null,
      community: report.communityId ? communities.get(report.communityId) ?? null : null,
      reporter: profileDocument?.exists() ? {
        id: profileDocument.id,
        displayName: text(profileData?.displayName) || 'Community member',
        username: text(profileData?.username),
      } : null,
    };
  });
}

export async function setCommunityReportStatus(id: string, status: ReportStatus): Promise<void> {
  await updateDoc(doc(db, 'communityReports', id), {
    status,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Takes a community down, or puts back one staff took down.
 *
 * Removal hides the community everywhere the app and the website look — both
 * treat anything but `active` as unavailable — without deleting its posts or
 * members, so the decision can be reversed. A community its own owner closed
 * is not restored from here.
 */
export async function setCommunitySpaceStatus(
  id: string,
  status: Extract<CommunitySpaceStatus, 'active' | 'removed'>,
): Promise<void> {
  await updateDoc(doc(db, COMMUNITY_SPACES, id), {
    status,
    updatedAt: serverTimestamp(),
  });
}
