/**
 * src/features/community/postData.ts
 *
 * Reads one community post for the public /post/:id page.
 *
 * `communityPosts` is world-readable by Firestore rule, which is what makes a
 * shared link work for somebody who has never signed in — the same rule the
 * app relies on to show a post to a guest. Posts are hard-deleted rather than
 * flagged, so "the document is missing" is the whole of "this post is gone".
 *
 * The field names below mirror `CommunityPost.fromMap` in the Flutter app
 * (apps/mobile/lib/features/community/data/community_models.dart). Anything
 * the app tolerates as absent is tolerated as absent here too: this page is
 * the last thing standing between a shared link and a blank screen, so it
 * renders whatever it was given rather than insisting on a complete document.
 */
import { doc, getDoc, type DocumentData } from "firebase/firestore";
import { websiteFirestore } from "../../lib/firebaseApp";

export interface CommunityPostMedia {
  url: string;
  type: "image" | "video" | "audio";
  thumbnailUrl: string | null;
  aspectRatio: number;
}

export interface CommunityPost {
  id: string;
  text: string;
  authorName: string;
  authorUsername: string;
  authorAvatarUrl: string | null;
  authorVerified: boolean;
  media: CommunityPostMedia[];
  likeCount: number;
  replyCount: number;
  repostCount: number;
  /** ISO 8601, or null when the document carries no usable timestamp. */
  createdAt: string | null;
}

/**
 * A post id as it appears in a share link. Firestore document ids are opaque,
 * so this is a shape check rather than a meaning check: it exists to keep a
 * hand-typed URL from becoming a Firestore read for a path with a slash in it.
 */
export const POST_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function text(data: DocumentData, key: string): string {
  const value = data[key];
  return typeof value === "string" ? value.trim() : "";
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

function author(data: DocumentData): DocumentData {
  const value = data.author;
  return value && typeof value === "object" ? (value as DocumentData) : {};
}

function firstUrl(source: DocumentData, keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    // Only http(s). A `javascript:` or `data:` string reaching an <img src> or
    // an <a href> is the one way a stored field could become script on this
    // page, and the field is written by app members.
    if (typeof value === "string" && /^https:\/\/\S+$/i.test(value.trim())) {
      return value.trim();
    }
  }
  return null;
}

function mediaFrom(raw: unknown): CommunityPostMedia[] {
  if (!Array.isArray(raw)) return [];
  const items: CommunityPostMedia[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as DocumentData;
    const url = firstUrl(item, ["url"]);
    if (!url) continue;
    const ratio = typeof item.aspectRatio === "number" && item.aspectRatio > 0 ? item.aspectRatio : 4 / 3;
    items.push({
      url,
      type: item.type === "video" ? "video" : item.type === "audio" ? "audio" : "image",
      thumbnailUrl: firstUrl(item, ["thumbnailUrl"]),
      aspectRatio: ratio,
    });
    // The app caps a post at four attachments; the rules enforce it on write.
    if (items.length === 4) break;
  }
  return items;
}

/** Firestore Timestamps arrive as objects with a `toDate`; be tolerant of both. */
function createdAtFrom(value: unknown): string | null {
  if (value && typeof value === "object" && "toDate" in value) {
    const date = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  return null;
}

function postFromData(id: string, data: DocumentData): CommunityPost {
  const profile = author(data);
  const displayName = text(profile, "displayName");
  const username = text(profile, "username");
  return {
    id,
    text: text(data, "text"),
    authorName: displayName || "Community member",
    authorUsername: username || "member",
    authorAvatarUrl: firstUrl(profile, ["avatarUrl", "photoUrl", "photoURL", "avatar", "imageUrl"]),
    authorVerified: text(profile, "verifiedKind") !== "" || profile.isVerified === true,
    media: mediaFrom(data.media),
    likeCount: count(data.likeCount),
    replyCount: count(data.replyCount),
    repostCount: count(data.repostCount) + count(data.quoteCount),
    createdAt: createdAtFrom(data.createdAt),
  };
}

export type PostLookup =
  | { status: "found"; post: CommunityPost }
  | { status: "missing" }
  | { status: "error" };

export async function fetchCommunityPost(postId: string): Promise<PostLookup> {
  if (!POST_ID_PATTERN.test(postId)) return { status: "missing" };
  try {
    const snapshot = await getDoc(doc(websiteFirestore(), "communityPosts", postId));
    if (!snapshot.exists()) return { status: "missing" };
    return { status: "found", post: postFromData(snapshot.id, snapshot.data() ?? {}) };
  } catch {
    // A network failure and a rules rejection are indistinguishable from here,
    // and the page says the same useful thing either way: open it in the app.
    return { status: "error" };
  }
}
