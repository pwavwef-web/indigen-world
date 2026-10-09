export const STUDIO_CREATE_URL = "https://tribestudio.indigenworld.com/studio/submissions/new";

/**
 * The everyday-expressions form. Signed-out visitors are shown a sign-in
 * screen that says what the account is for, then land on the form.
 */
export const STUDIO_EXPRESSIONS_URL = "https://tribestudio.indigenworld.com/studio/expressions";

/** Carry only a public source URL, never visitor identity or unpublished text. */
export function createFromDiscovery(path: string): string {
  return `${STUDIO_CREATE_URL}?source=${encodeURIComponent(`https://indigenworld.com/${path.replace(/^\//, "")}`)}`;
}
