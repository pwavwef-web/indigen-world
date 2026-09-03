/**
 * src/content/appLinks.ts
 *
 * How a page on this site hands somebody over to the Indigen app.
 *
 * On a phone with the app installed, most of this is never reached: the
 * Android App Links verification in `public/.well-known/assetlinks.json` means
 * the operating system opens `indigenworld.com/post/<id>` in the app before a
 * browser is ever involved. This module is the rest of the story — the desktop
 * visitor, the phone without the app, and the handset where verification did
 * not take (a sideloaded build, a browser that opens links in its own view).
 *
 * `indigen://` is the backstop for that last case. It is a custom scheme, so
 * it can only ever reach an app already on the device: if nothing handles it
 * the tap does nothing at all, which is why it is offered as a button beside
 * the post rather than fired automatically at page load.
 */

/** The custom scheme declared by the Android manifest and the iOS Info.plist. */
export const APP_SCHEME = "indigen";

/**
 * The public store listing, once there is one.
 *
 * Deliberately null while the app is pre-release: the Ecosystem page lists the
 * mobile app as "in development" behind a waitlist, and a "Get the app" button
 * pointing at a listing that does not exist yet would be worse than no button.
 * Set this to the listing URL on launch — `AppHandoff` picks it up and offers
 * the store instead of the waitlist with no other change.
 */
export const APP_STORE_URL: string | null = null;

/** Where somebody without the app is sent while it is still pre-release. */
export const APP_WAITLIST_ROUTE = "get-involved?route=mobile-app-waitlist";

/** The in-app location for a shared post, as the app's go_router knows it. */
export function appLinkForPost(postId: string): string {
  return `${APP_SCHEME}://post/${encodeURIComponent(postId)}`;
}
