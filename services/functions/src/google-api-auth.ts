import { GoogleAuth } from 'google-auth-library';
import { logger } from 'firebase-functions';

/**
 * Access tokens for the two Google APIs this backend calls as *itself*.
 *
 * Play Integrity and the Play Developer API are not Firebase products, so
 * neither is reachable through the Admin SDK. Both are ordinary Google APIs
 * that want an OAuth bearer token, and the identity that should be presented is
 * the function's own runtime service account — never a downloaded key file.
 * `GoogleAuth` finds that identity from the metadata server in production and
 * from `GOOGLE_APPLICATION_CREDENTIALS` locally, which is the whole reason to
 * use it rather than hand-rolling a metadata fetch: the same code path works in
 * the emulator for anybody who has run `gcloud auth application-default login`.
 *
 * Two scopes, and they are granted in two completely different places:
 *
 *   * `PLAY_INTEGRITY_SCOPE` needs the Play Integrity API enabled on this Cloud
 *     project and the Play Console app linked to it.
 *   * `ANDROID_PUBLISHER_SCOPE` needs the runtime service account *invited into
 *     the Play Console* under Users and permissions, with "View financial data"
 *     and the app selected. Enabling the API is not enough and the error when
 *     it is missing says nothing useful, which is why it is written down here.
 *
 * See docs/product/play-integrity-and-billing.md for the exact console steps.
 */

export const PLAY_INTEGRITY_SCOPE = 'https://www.googleapis.com/auth/playintegrity';
export const ANDROID_PUBLISHER_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

/**
 * One `GoogleAuth` per scope, kept for the life of the instance.
 *
 * `GoogleAuth` caches the token it minted and refreshes it a little before it
 * expires, so building a new one per request would mean a fresh metadata round
 * trip on every call — a hundred milliseconds added to a purchase confirmation
 * for nothing.
 */
const clients = new Map<string, GoogleAuth>();

function authFor(scope: string): GoogleAuth {
  const existing = clients.get(scope);
  if (existing) return existing;
  const auth = new GoogleAuth({ scopes: [scope] });
  clients.set(scope, auth);
  return auth;
}

/** Raised when this deployment simply has no credentials for a scope. */
export class GoogleApiAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleApiAuthError';
  }
}

/**
 * A bearer token for [scope], or a thrown [GoogleApiAuthError].
 *
 * Deliberately does not swallow the failure into an empty string: a request
 * sent to Google with no Authorization header comes back as a 401 that reads
 * like a permissions problem, and the actual problem — no ambient credentials
 * at all — is worth naming at the point it is discovered.
 */
export async function googleAccessToken(scope: string): Promise<string> {
  try {
    const token = await authFor(scope).getAccessToken();
    if (typeof token === 'string' && token.length > 0) return token;
    throw new GoogleApiAuthError('No access token was issued for this scope.');
  } catch (error) {
    if (error instanceof GoogleApiAuthError) throw error;
    logger.error('Could not mint a Google API access token', {
      scope,
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    throw new GoogleApiAuthError(
      'This deployment has no credentials for that Google API.',
    );
  }
}

/**
 * A JSON call to a Google API as the runtime service account.
 *
 * Returns the parsed body on success and `null` on any 4xx, with the status
 * logged. Google's error bodies routinely carry the member's purchase token or
 * an integrity payload, so the body is never logged and never propagated to a
 * caller — the shape of the failure is what matters upstream, not Google's
 * prose.
 */
export async function callGoogleApi<T>(input: {
  url: string;
  scope: string;
  method?: 'GET' | 'POST';
  body?: unknown;
  timeoutMs?: number;
}): Promise<{ ok: true; data: T } | { ok: false; status: number }> {
  const token = await googleAccessToken(input.scope);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 20_000);

  let response: Response;
  try {
    response = await fetch(input.url, {
      method: input.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: controller.signal,
    });
  } catch (error) {
    logger.error('Google API request failed to complete', {
      // The path, never the query string: purchase tokens ride in paths and
      // this log is the one place they would otherwise be readable.
      host: safeHost(input.url),
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    logger.warn('Google API refused a request', {
      host: safeHost(input.url),
      status: response.status,
    });
    return { ok: false, status: response.status };
  }

  const data = (await response.json().catch(() => null)) as T | null;
  if (data === null) return { ok: false, status: response.status };
  return { ok: true, data };
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'unknown';
  }
}
