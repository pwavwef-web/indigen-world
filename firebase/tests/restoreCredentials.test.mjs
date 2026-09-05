import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import {
  apkKeyHashOrigin,
  restoreCredentialConfigFrom,
} from '../../services/functions/lib/restore-credential-config.js';

/**
 * Zero-Tap Sign-In configuration.
 *
 * What is pinned here is the one thing in the flow that can be wrong without
 * anything failing loudly: the origin a restore assertion has to match. Get it
 * wrong and every assertion is rejected as coming from another app, which
 * looks exactly like a device that simply had no restore key — the same silent
 * fall back to the sign-in screen. So the two spellings of a signing digest
 * are tested against a digest computed here rather than a constant copied from
 * somewhere.
 */

const CERTIFICATE = Buffer.from('a pretend signing certificate', 'utf8');
const DIGEST = createHash('sha256').update(CERTIFICATE).digest();
const BASE64URL = DIGEST.toString('base64url');
const HEX_UPPER = DIGEST.toString('hex')
  .toUpperCase()
  .match(/.{2}/g)
  .join(':');

test('both spellings of a signing digest produce the same origin', () => {
  const expected = `android:apk-key-hash:${BASE64URL}`;
  assert.equal(apkKeyHashOrigin(BASE64URL), expected);
  assert.equal(apkKeyHashOrigin(HEX_UPPER), expected);
  assert.equal(apkKeyHashOrigin(HEX_UPPER.toLowerCase()), expected);
  assert.equal(apkKeyHashOrigin(`  ${HEX_UPPER}  `), expected);
});

test('padded base64url is accepted and the padding dropped', () => {
  assert.equal(apkKeyHashOrigin(`${BASE64URL}=`), `android:apk-key-hash:${BASE64URL}`);
});

test('anything that is not a SHA-256 digest is refused', () => {
  for (const value of [
    '',
    'not a digest',
    // A SHA-1 fingerprint. Plausible to paste by accident: Play Console shows
    // one right beside the SHA-256, and it is the one Google Sign-In wants.
    'AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01',
    // Standard base64 rather than base64url: the wrong alphabet.
    `${BASE64URL.slice(0, 41)}+/`,
    DIGEST.toString('hex').slice(0, 62),
  ]) {
    assert.equal(apkKeyHashOrigin(value), null, `expected ${value} to be refused`);
  }
});

test('a complete environment yields a usable config', () => {
  const config = restoreCredentialConfigFrom({
    RESTORE_CREDENTIAL_RP_ID: 'indigenworld.com',
    ANDROID_CERTIFICATE_DIGESTS: `${BASE64URL}, ${HEX_UPPER}`,
  });
  assert.ok(config);
  assert.equal(config.rpId, 'indigenworld.com');
  // Two spellings of one certificate are one origin, not two.
  assert.deepEqual(config.expectedOrigins, [`android:apk-key-hash:${BASE64URL}`]);
  assert.deepEqual(config.rejected, []);
});

test('an unusable environment disables the feature outright', () => {
  // No domain.
  assert.equal(
    restoreCredentialConfigFrom({ ANDROID_CERTIFICATE_DIGESTS: BASE64URL }),
    null,
  );
  // No certificates.
  assert.equal(
    restoreCredentialConfigFrom({ RESTORE_CREDENTIAL_RP_ID: 'indigenworld.com' }),
    null,
  );
  // Certificates configured, none of them usable. This is the case that must
  // not degrade into "accept any origin": a relying party that cannot name a
  // signing certificate has no business accepting assertions.
  assert.equal(
    restoreCredentialConfigFrom({
      RESTORE_CREDENTIAL_RP_ID: 'indigenworld.com',
      ANDROID_CERTIFICATE_DIGESTS: 'nonsense, also nonsense',
    }),
    null,
  );
});

test('unusable values are reported rather than swallowed', () => {
  const config = restoreCredentialConfigFrom({
    RESTORE_CREDENTIAL_RP_ID: 'indigenworld.com',
    ANDROID_CERTIFICATE_DIGESTS: `${BASE64URL}, nonsense`,
  });
  assert.ok(config);
  assert.deepEqual(config.expectedOrigins, [`android:apk-key-hash:${BASE64URL}`]);
  assert.deepEqual(config.rejected, ['nonsense']);
});
