/**
 * Configuration for Zero-Tap Sign-In, kept apart from the callables.
 *
 * The same split as `play-integrity-policy.ts` and for the same reason: what
 * is decided from environment variables is worth testing directly, and a
 * module that registers Cloud Functions the moment it is imported cannot be
 * imported by a test. Everything here is pure.
 */

export type RestoreCredentialConfig = {
  /** The domain the restore key is scoped to. */
  readonly rpId: string;
  /** Every WebAuthn origin an assertion may legitimately carry. */
  readonly expectedOrigins: readonly string[];
  /** Configured values that were not SHA-256 digests, for the caller to log. */
  readonly rejected: readonly string[];
};

/**
 * Turns a signing certificate's SHA-256 digest into the WebAuthn origin
 * Android presents for it.
 *
 * Android does not send a URL as the origin of an app-originated credential —
 * there is no page. It sends `android:apk-key-hash:<base64url sha-256 of the
 * signing certificate>`, which is the same identity `assetlinks.json` vouches
 * for, spelled differently.
 *
 * The one digest gets written two ways in practice, so both are accepted here.
 * Play Integrity reports it base64url, which is the form
 * `ANDROID_CERTIFICATE_DIGESTS` already holds and the form this origin needs
 * verbatim. Play Console and `gradlew :app:signingReport` print it as
 * colon-separated hex. Reconciling them here is what lets one variable serve
 * both features without anybody having to remember which spelling they pasted.
 *
 * Returns null for anything that is not a SHA-256 digest however it is spelled.
 */
export function apkKeyHashOrigin(digest: string): string | null {
  const trimmed = digest.trim();

  const hex = trimmed.replace(/:/g, '');
  if (/^[0-9a-fA-F]{64}$/.test(hex)) {
    return `android:apk-key-hash:${Buffer.from(hex, 'hex').toString('base64url')}`;
  }

  // base64url of 32 bytes is 43 characters, with an optional padding '='.
  if (/^[A-Za-z0-9_-]{43}=?$/.test(trimmed)) {
    return `android:apk-key-hash:${trimmed.replace(/=+$/, '')}`;
  }

  return null;
}

/**
 * Reads the relying-party configuration, or null when it is unusable.
 *
 * Null means "this deployment does not do Zero-Tap Sign-In", and every
 * callable turns that into `enabled: false` rather than an error. A relying
 * party that accepted assertions it could not attribute to a signing
 * certificate would be far worse than one that politely does nothing, so a
 * missing domain or an empty digest list disables the feature outright.
 */
export function restoreCredentialConfigFrom(
  env: Record<string, string | undefined>,
): RestoreCredentialConfig | null {
  const rpId = (env.RESTORE_CREDENTIAL_RP_ID ?? '').trim();
  if (rpId.length === 0) return null;

  const expectedOrigins: string[] = [];
  const rejected: string[] = [];
  for (const digest of (env.ANDROID_CERTIFICATE_DIGESTS ?? '').split(',')) {
    if (digest.trim().length === 0) continue;
    const origin = apkKeyHashOrigin(digest);
    if (origin === null) {
      rejected.push(digest.trim());
      continue;
    }
    if (!expectedOrigins.includes(origin)) expectedOrigins.push(origin);
  }
  if (expectedOrigins.length === 0) return null;

  return { rpId, expectedOrigins, rejected };
}
