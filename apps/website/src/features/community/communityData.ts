/**
 * src/features/community/communityData.ts
 *
 * Reads one sub-community for the public /communities/:slug page.
 *
 * A community's profile is world-readable by Firestore rule — private
 * communities included, since somebody has to be able to find one to ask to
 * join it. What a private community keeps to itself is its posts and its
 * member list, and this module never asks for either: recent posts are read
 * only for a public community, whose posts are ordinary `communityPosts`
 * tagged with its id.
 *
 * Field names mirror `CommunitySpace.fromMap` in the Flutter app
 * (apps/mobile/lib/features/community/data/community_space_models.dart).
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  type DocumentData,
} from "firebase/firestore";
import { websiteFirestore } from "../../lib/firebaseApp";
import { postFromData, type CommunityPost } from "./postData";

/** The collection sub-communities live in. `communities` is the cultural registry. */
export const COMMUNITY_SPACES = "communitySpaces";

/** The address shape the app and the Security Rules both enforce. */
export const COMMUNITY_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

export const COMMUNITY_CATEGORY_LABELS: Record<string, string> = {
  language: "Language",
  culture: "Culture",
  music: "Music",
  history: "History",
  faith: "Faith",
  education: "Education",
  hometown: "Hometown",
  diaspora: "Diaspora",
  youth: "Youth",
  other: "Community",
};

export interface CommunitySpace {
  id: string;
  name: string;
  description: string;
  category: string;
  language: string;
  location: string;
  isPrivate: boolean;
  memberCount: number;
  rules: string[];
  avatarUrl: string | null;
  coverUrl: string | null;
}

export type CommunityLookup =
  | { status: "found"; community: CommunitySpace; recentPosts: CommunityPost[] }
  | { status: "missing" }
  | { status: "closed"; name: string }
  | { status: "error" };

function text(data: DocumentData, key: string): string {
  const value = data[key];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Only https, and nothing that could close the CSS `url("…")` the cover is
 * drawn with — a stored string reaching an <img src> or a style must not
 * become script or markup. The field is written by community admins.
 */
function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const url = value.trim();
  return /^https:\/\/\S+$/i.test(url) && !/["'\\()<>]/.test(url) ? url : null;
}

export function communityFromData(id: string, data: DocumentData): CommunitySpace {
  const rules = Array.isArray(data.rules)
    ? data.rules
        .filter((rule: unknown): rule is string => typeof rule === "string")
        .map((rule: string) => rule.trim())
        .filter(Boolean)
        .slice(0, 10)
    : [];
  const members = data.memberCount;
  return {
    id,
    name: text(data, "name") || id,
    description: text(data, "description"),
    category: text(data, "category") || "other",
    language: text(data, "language"),
    location: text(data, "location"),
    isPrivate: data.visibility === "private",
    memberCount:
      typeof members === "number" && Number.isFinite(members) && members > 0 ? Math.floor(members) : 0,
    rules,
    avatarUrl: httpsUrl(data.avatarUrl),
    coverUrl: httpsUrl(data.coverUrl),
  };
}

async function recentPublicPosts(communityId: string): Promise<CommunityPost[]> {
  try {
    const snapshot = await getDocs(
      query(
        collection(websiteFirestore(), "communityPosts"),
        where("communityId", "==", communityId),
        where("isReply", "==", false),
        orderBy("createdAt", "desc"),
        limit(3)
      )
    );
    return snapshot.docs.map((entry) => postFromData(entry.id, entry.data()));
  } catch {
    // A preview, not the page: an index still building or a refused read
    // simply leaves the section out.
    return [];
  }
}

export async function fetchCommunitySpace(slug: string): Promise<CommunityLookup> {
  if (!COMMUNITY_SLUG_PATTERN.test(slug)) return { status: "missing" };
  try {
    const snapshot = await getDoc(doc(websiteFirestore(), COMMUNITY_SPACES, slug));
    if (!snapshot.exists()) return { status: "missing" };
    const data = snapshot.data() ?? {};
    // Closed by its owner or removed by staff: say so by name, and show none
    // of what it used to say about itself.
    if (data.status !== undefined && data.status !== "active") {
      return { status: "closed", name: text(data, "name") || slug };
    }
    const community = communityFromData(snapshot.id, data);
    const recentPosts = community.isPrivate ? [] : await recentPublicPosts(community.id);
    return { status: "found", community, recentPosts };
  } catch {
    return { status: "error" };
  }
}
