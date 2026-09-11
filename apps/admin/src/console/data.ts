import {
  collection,
  getCountFromServer,
  query,
  where,
  type QueryConstraint,
} from 'firebase/firestore';
import { db } from '../firebase';

export interface OperationsSnapshot {
  creatorApplications: number;
  reviewQueue: number;
  openReports: number;
  newInterests: number;
  teamSiteRequests: number;
  capturedAt: Date;
}

async function count(collectionName: string, ...constraints: QueryConstraint[]): Promise<number> {
  const result = await getCountFromServer(query(collection(db, collectionName), ...constraints));
  return result.data().count;
}

/**
 * Read the five queues staff actually need to act on. Aggregate queries keep
 * the console fast and avoid downloading private records just to count them.
 */
export async function fetchOperationsSnapshot(): Promise<OperationsSnapshot> {
  const [creatorApplications, reviewQueue, openReports, newInterests, teamSiteRequests] =
    await Promise.all([
      count(
        'creatorApplications',
        where('status', 'in', ['SUBMITTED', 'UNDER_REVIEW']),
      ),
      count(
        'submissions',
        where('status', 'in', ['SUBMITTED', 'RESUBMITTED', 'UNDER_REVIEW']),
      ),
      count('communityReports', where('status', 'in', ['open', 'reviewing'])),
      count('publicFormSubmissions', where('status', '==', 'new')),
      count('teamSiteRequests'),
    ]);

  return {
    creatorApplications,
    reviewQueue,
    openReports,
    newInterests,
    teamSiteRequests,
    capturedAt: new Date(),
  };
}
