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
}

export interface ReportAuthor {
  id: string;
  displayName: string;
  username: string;
}

export interface CommunityReport {
  id: string;
  postId: string;
  reporterId: string;
  reason: string;
  status: ReportStatus;
  createdAt: Timestamp | null;
  post: ReportedPost | null;
  reporter: ReportAuthor | null;
}

function reportStatus(value: unknown): ReportStatus {
  return REPORT_STATUSES.some((status) => status.id === value)
    ? value as ReportStatus
    : 'open';
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

/** Load the newest reports and hydrate the member and post details an admin
 * needs to understand each report without leaving the console. */
export async function listCommunityReports(): Promise<CommunityReport[]> {
  const reportSnapshot = await getDocs(
    query(collection(db, 'communityReports'), orderBy('createdAt', 'desc'), limit(200)),
  );
  const records = reportSnapshot.docs.map((entry) => {
    const data = entry.data();
    return {
      id: entry.id,
      postId: typeof data.postId === 'string' ? data.postId : '',
      reporterId: typeof data.reporterId === 'string' ? data.reporterId : '',
      reason: typeof data.reason === 'string' ? data.reason : '',
      status: reportStatus(data.status),
      createdAt: (data.createdAt as Timestamp | undefined) ?? null,
    };
  });

  const postIds = [...new Set(records.map((report) => report.postId).filter(Boolean))];
  const reporterIds = [...new Set(records.map((report) => report.reporterId).filter(Boolean))];
  const [postDocuments, profileDocuments] = await Promise.all([
    Promise.all(postIds.map((id) => getDoc(doc(db, 'communityPosts', id)))),
    Promise.all(reporterIds.map((id) => getDoc(doc(db, 'communityProfiles', id)))),
  ]);
  const posts = new Map(postDocuments.map((document) => [document.id, document]));
  const profiles = new Map(profileDocuments.map((document) => [document.id, document]));

  return records.map((report) => {
    const postDocument = posts.get(report.postId);
    const postData = postDocument?.data();
    const author = postData?.author && typeof postData.author === 'object'
      ? postData.author as Record<string, unknown>
      : {};
    const profileDocument = profiles.get(report.reporterId);
    const profileData = profileDocument?.data();

    return {
      ...report,
      post: postDocument?.exists() ? {
        id: postDocument.id,
        authorId: typeof postData?.authorId === 'string' ? postData.authorId : '',
        authorName: typeof author.displayName === 'string' && author.displayName.trim()
          ? author.displayName.trim()
          : 'Community member',
        authorUsername: typeof author.username === 'string' ? author.username : '',
        text: typeof postData?.text === 'string' ? postData.text : '',
        media: mediaFrom(postData?.media),
        createdAt: (postData?.createdAt as Timestamp | undefined) ?? null,
      } : null,
      reporter: profileDocument?.exists() ? {
        id: profileDocument.id,
        displayName: typeof profileData?.displayName === 'string' && profileData.displayName.trim()
          ? profileData.displayName.trim()
          : 'Community member',
        username: typeof profileData?.username === 'string' ? profileData.username : '',
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
