export const STUDIO_CREATE_URL = "https://tribestudio.indigenworld.com/studio/submissions/new";

/** Carry only a public source URL, never visitor identity or unpublished text. */
export function createFromDiscovery(path: string): string {
  return `${STUDIO_CREATE_URL}?source=${encodeURIComponent(`https://indigenworld.com/${path.replace(/^\//, "")}`)}`;
}
