import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  NO_ENTITLEMENT,
  SUBSCRIPTION_PRODUCTS,
  TIER_BENEFITS,
  TIER_RANK,
  benefitsFor,
  entitlementFromPurchase,
  isEntitled,
  needsAcknowledgement,
  rtdnName,
  statusFromPlayState,
  tierForProductId,
} from '../../services/functions/lib/subscription-catalog.js';
import {
  DEFAULT_INTEGRITY_POLICY,
  deviceTrustOf,
  evaluateIntegrity,
  integrityPolicyFromEnv,
  readSignals,
} from '../../services/functions/lib/play-integrity-policy.js';

const NOW = Date.parse('2026-03-01T12:00:00.000Z');
const FUTURE = '2026-04-01T12:00:00.000Z';
const PAST = '2026-02-01T12:00:00.000Z';

function purchase(overrides = {}) {
  return {
    subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
    startTime: '2026-02-01T12:00:00.000Z',
    regionCode: 'GH',
    acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
    lineItems: [
      {
        productId: 'indigen_plus',
        expiryTime: FUTURE,
        autoRenewingPlan: { autoRenewEnabled: true },
        offerDetails: { basePlanId: 'plus-monthly' },
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// The catalogue itself. These values are mirrored by hand into
// apps/mobile/lib/features/subscriptions/data/subscription_catalog.dart, so a
// change made on one side and not the other should break this file first.
// ---------------------------------------------------------------------------

test('catalogue: the product and base plan ids Play Console must carry', () => {
  assert.deepEqual(
    SUBSCRIPTION_PRODUCTS.map((product) => [
      product.productId,
      product.plans.map((plan) => plan.basePlanId),
    ]),
    [
      ['indigen_plus', ['plus-monthly', 'plus-yearly']],
      ['indigen_patron', ['patron-monthly', 'patron-yearly']],
      ['indigen_creator', ['creator-monthly', 'creator-yearly']],
    ],
  );
});

test('catalogue: every product id maps to exactly one tier', () => {
  assert.equal(tierForProductId('indigen_plus'), 'plus');
  assert.equal(tierForProductId('indigen_patron'), 'patron');
  assert.equal(tierForProductId('indigen_creator'), 'creator');
  assert.equal(tierForProductId('indigen_unknown'), 'none');
  assert.equal(tierForProductId(undefined), 'none');
});

test('catalogue: the benefit numbers the app mirrors', () => {
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(TIER_BENEFITS).map(([tier, benefits]) => [
        tier,
        [
          benefits.adFree,
          benefits.kawuriDailyMessages,
          benefits.offlineDownloadLimit,
          benefits.supporterMark,
          benefits.creatorTools,
        ],
      ]),
    ),
    {
      none: [false, 20, 0, '', false],
      plus: [true, 200, 50, 'supporter', false],
      patron: [true, 400, 200, 'patron', false],
      creator: [true, 600, 500, 'studio', true],
    },
  );
});

test('catalogue: no supporter mark collides with a verifiedKind', () => {
  // `creator` is a *verification* mark meaning "has published work". A tier
  // that granted the same string would make a checked mark buyable.
  const verifiedKinds = new Set(['creator', 'elder', 'project', 'member']);
  for (const benefits of Object.values(TIER_BENEFITS)) {
    assert.equal(verifiedKinds.has(benefits.supporterMark), false);
  }
});

// ---------------------------------------------------------------------------
// Play states
// ---------------------------------------------------------------------------

test('play states map to our own vocabulary, unknown included', () => {
  assert.equal(statusFromPlayState('SUBSCRIPTION_STATE_ACTIVE'), 'active');
  assert.equal(statusFromPlayState('SUBSCRIPTION_STATE_IN_GRACE_PERIOD'), 'grace');
  assert.equal(statusFromPlayState('SUBSCRIPTION_STATE_ON_HOLD'), 'on_hold');
  assert.equal(statusFromPlayState('SUBSCRIPTION_STATE_PAUSED'), 'paused');
  assert.equal(statusFromPlayState('SUBSCRIPTION_STATE_CANCELED'), 'canceled');
  assert.equal(statusFromPlayState('SUBSCRIPTION_STATE_EXPIRED'), 'expired');
  assert.equal(statusFromPlayState('SUBSCRIPTION_STATE_PENDING'), 'pending');
  assert.equal(statusFromPlayState('SOMETHING_GOOGLE_ADDS_LATER'), 'none');
  assert.equal(statusFromPlayState(undefined), 'none');
});

test('rtdnName gives a log line a name rather than a number', () => {
  assert.equal(rtdnName(2), 'RENEWED');
  assert.equal(rtdnName(13), 'EXPIRED');
  assert.equal(rtdnName(99), 'UNKNOWN_99');
});

// ---------------------------------------------------------------------------
// Turning a purchase into an entitlement
// ---------------------------------------------------------------------------

test('a plain active purchase becomes the tier it bought', () => {
  const entitlement = entitlementFromPurchase(purchase());
  assert.equal(entitlement.tier, 'plus');
  assert.equal(entitlement.status, 'active');
  assert.equal(entitlement.basePlanId, 'plus-monthly');
  assert.equal(entitlement.autoRenewing, true);
  assert.equal(entitlement.regionCode, 'GH');
  assert.equal(entitlement.testPurchase, false);
  assert.equal(isEntitled(entitlement, NOW), true);
});

test('an upgrade mid-term takes the higher tier, not the first line item', () => {
  // The bug this guards: `lineItems[0]` is the plan being left behind, so
  // somebody who upgrades to Patron keeps getting Plus until the renewal.
  const entitlement = entitlementFromPurchase(
    purchase({
      lineItems: [
        {
          productId: 'indigen_plus',
          expiryTime: PAST,
          offerDetails: { basePlanId: 'plus-monthly' },
        },
        {
          productId: 'indigen_patron',
          expiryTime: FUTURE,
          autoRenewingPlan: { autoRenewEnabled: true },
          offerDetails: { basePlanId: 'patron-yearly' },
        },
      ],
    }),
  );
  assert.equal(entitlement.tier, 'patron');
  assert.equal(entitlement.basePlanId, 'patron-yearly');
  assert.equal(entitlement.expiresAt, FUTURE);
});

test('a purchase with no line items is a shape, not a crash', () => {
  const entitlement = entitlementFromPurchase({
    subscriptionState: 'SUBSCRIPTION_STATE_PENDING',
    startTime: PAST,
  });
  assert.equal(entitlement.tier, 'none');
  assert.equal(entitlement.status, 'pending');
  assert.equal(isEntitled(entitlement, NOW), false);
});

test('a sandbox purchase is flagged and still honoured', () => {
  const entitlement = entitlementFromPurchase(purchase({ testPurchase: {} }));
  assert.equal(entitlement.testPurchase, true);
  assert.equal(isEntitled(entitlement, NOW), true);
});

test('a missing autoRenewingPlan is not auto-renewing', () => {
  const entitlement = entitlementFromPurchase(
    purchase({
      lineItems: [
        {
          productId: 'indigen_plus',
          expiryTime: FUTURE,
          offerDetails: { basePlanId: 'plus-yearly' },
        },
      ],
    }),
  );
  assert.equal(entitlement.autoRenewing, false);
});

test('an unrecognised product grants nothing at all', () => {
  const entitlement = entitlementFromPurchase(
    purchase({
      lineItems: [
        {
          productId: 'indigen_something_else',
          expiryTime: FUTURE,
          offerDetails: { basePlanId: 'x-monthly' },
        },
      ],
    }),
  );
  assert.equal(entitlement.tier, 'none');
  assert.equal(isEntitled(entitlement, NOW), false);
  assert.equal(benefitsFor(entitlement, NOW).adFree, false);
});

// ---------------------------------------------------------------------------
// What is actually owed
// ---------------------------------------------------------------------------

test('grace keeps the benefits and on-hold does not', () => {
  const grace = entitlementFromPurchase(
    purchase({ subscriptionState: 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD' }),
  );
  const onHold = entitlementFromPurchase(
    purchase({ subscriptionState: 'SUBSCRIPTION_STATE_ON_HOLD' }),
  );
  assert.equal(isEntitled(grace, NOW), true);
  assert.equal(isEntitled(onHold, NOW), false);
});

test('a cancelled subscription is still owed until it expires', () => {
  const cancelled = entitlementFromPurchase(
    purchase({ subscriptionState: 'SUBSCRIPTION_STATE_CANCELED' }),
  );
  assert.equal(isEntitled(cancelled, NOW), true);
  assert.equal(isEntitled(cancelled, Date.parse(FUTURE) + 1), false);
});

test('an active status with a past expiry is not entitled', () => {
  // The missed-notification case. Believing the word over the date is how a
  // free year happens.
  const stale = entitlementFromPurchase(
    purchase({
      lineItems: [
        {
          productId: 'indigen_patron',
          expiryTime: PAST,
          offerDetails: { basePlanId: 'patron-monthly' },
        },
      ],
    }),
  );
  assert.equal(stale.status, 'active');
  assert.equal(isEntitled(stale, NOW), false);
  assert.deepEqual(benefitsFor(stale, NOW), TIER_BENEFITS.none);
});

test('an entitlement with no expiry at all is worth nothing', () => {
  assert.equal(isEntitled({ ...NO_ENTITLEMENT, tier: 'plus', status: 'active' }, NOW), false);
});

test('tier ranking orders an upgrade against a downgrade', () => {
  assert.ok(TIER_RANK.creator > TIER_RANK.patron);
  assert.ok(TIER_RANK.patron > TIER_RANK.plus);
  assert.ok(TIER_RANK.plus > TIER_RANK.none);
});

test('acknowledgement is needed only while Play says it is pending', () => {
  assert.equal(
    needsAcknowledgement({ acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING' }),
    true,
  );
  assert.equal(needsAcknowledgement(purchase()), false);
  assert.equal(needsAcknowledgement({}), false);
});

// ---------------------------------------------------------------------------
// Play Integrity
// ---------------------------------------------------------------------------

const PACKAGE = 'com.indigenworld.indigen';

function payload(overrides = {}) {
  return {
    requestDetails: {
      requestPackageName: PACKAGE,
      requestHash: 'challenge-1',
      timestampMillis: String(NOW - 1000),
    },
    appIntegrity: { appRecognitionVerdict: 'PLAY_RECOGNIZED' },
    deviceIntegrity: {
      deviceRecognitionVerdict: ['MEETS_BASIC_INTEGRITY', 'MEETS_DEVICE_INTEGRITY'],
    },
    accountDetails: { appLicensingVerdict: 'LICENSED' },
    environmentDetails: {},
    ...overrides,
  };
}

function judge(overrides = {}, policyOverrides = {}) {
  return evaluateIntegrity({
    payload: payload(overrides),
    policy: {
      ...DEFAULT_INTEGRITY_POLICY,
      expectedPackageName: PACKAGE,
      mode: 'enforce',
      ...policyOverrides,
    },
    expectedHash: 'challenge-1',
    now: NOW,
  });
}

test('integrity: a healthy device is allowed', () => {
  const verdict = judge();
  assert.equal(verdict.decision, 'allow');
  assert.deepEqual(verdict.reasons, []);
  assert.equal(verdict.blocked, false);
});

test('integrity: the strongest verdict in the list is the one that counts', () => {
  assert.equal(deviceTrustOf(['MEETS_BASIC_INTEGRITY', 'MEETS_STRONG_INTEGRITY']), 'strong');
  assert.equal(deviceTrustOf(['MEETS_BASIC_INTEGRITY']), 'basic');
  assert.equal(deviceTrustOf(['MEETS_VIRTUAL_INTEGRITY']), 'virtual');
  assert.equal(deviceTrustOf([]), 'none');
  assert.equal(deviceTrustOf(undefined), 'none');
});

test('integrity: a rooted-but-real handset still passes the shipped floor', () => {
  const verdict = judge({
    deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_BASIC_INTEGRITY'] },
  });
  assert.equal(verdict.decision, 'allow');
});

test('integrity: a device meeting nothing at all is refused', () => {
  const verdict = judge({ deviceIntegrity: { deviceRecognitionVerdict: [] } });
  assert.deepEqual(verdict.reasons, ['device_untrusted']);
  assert.equal(verdict.blocked, true);
});

test('integrity: Play Games for PC is welcome by default', () => {
  const virtual = { deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_VIRTUAL_INTEGRITY'] } };
  assert.equal(judge(virtual).decision, 'allow');
  assert.deepEqual(
    judge(virtual, { allowVirtualDevices: false }).reasons,
    ['virtual_device'],
  );
});

test('integrity: a tampered build is refused, an unevaluated one is not', () => {
  assert.deepEqual(
    judge({ appIntegrity: { appRecognitionVerdict: 'UNRECOGNIZED_VERSION' } }).reasons,
    ['app_tampered'],
  );
  assert.equal(
    judge({ appIntegrity: { appRecognitionVerdict: 'UNEVALUATED' } }).decision,
    'allow',
  );
});

test('integrity: an unlicensed install passes until licensing is required', () => {
  const unlicensed = { accountDetails: { appLicensingVerdict: 'UNLICENSED' } };
  assert.equal(judge(unlicensed).decision, 'allow');
  assert.deepEqual(judge(unlicensed, { requireLicensed: true }).reasons, ['unlicensed']);
});

test('integrity: a replayed or foreign token is refused', () => {
  assert.deepEqual(
    judge({ requestDetails: { requestPackageName: PACKAGE, requestHash: 'someone-elses' } })
      .reasons,
    ['request_mismatch'],
  );
  assert.ok(
    judge({
      requestDetails: {
        requestPackageName: 'com.someone.else',
        requestHash: 'challenge-1',
        timestampMillis: String(NOW),
      },
    }).reasons.includes('wrong_package'),
  );
});

test('integrity: a token older than the window is stale', () => {
  const verdict = judge({
    requestDetails: {
      requestPackageName: PACKAGE,
      requestHash: 'challenge-1',
      timestampMillis: String(NOW - 20 * 60 * 1000),
    },
  });
  assert.deepEqual(verdict.reasons, ['stale_token']);
});

test('integrity: high-risk Play Protect blocks, lesser states do not', () => {
  assert.deepEqual(
    judge({ environmentDetails: { playProtectVerdict: 'HIGH_RISK' } }).reasons,
    ['play_protect_risk'],
  );
  assert.equal(
    judge({ environmentDetails: { playProtectVerdict: 'POSSIBLE_RISK' } }).decision,
    'allow',
  );
  assert.equal(
    judge({ environmentDetails: { playProtectVerdict: 'NO_DATA' } }).decision,
    'allow',
  );
});

test('integrity: an unknown app capturing the screen is a refusal', () => {
  assert.deepEqual(
    judge({
      environmentDetails: {
        appAccessRiskVerdict: { appsDetected: ['KNOWN_INSTALLED', 'UNKNOWN_CAPTURING'] },
      },
    }).reasons,
    ['app_access_risk'],
  );
  // Known, Play-installed apps on their own are not.
  assert.equal(
    judge({
      environmentDetails: { appAccessRiskVerdict: { appsDetected: ['KNOWN_INSTALLED'] } },
    }).decision,
    'allow',
  );
});

test('integrity: a hyperactive device is flagged and never blocked', () => {
  const verdict = judge({
    deviceIntegrity: {
      deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'],
      recentDeviceActivity: { deviceActivityLevel: 'LEVEL_4' },
    },
  });
  assert.equal(verdict.decision, 'flag');
  assert.deepEqual(verdict.reasons, ['hyperactive_device']);
  assert.equal(verdict.blocked, false);
});

test('integrity: monitor mode records everything and stops nothing', () => {
  const verdict = judge(
    { deviceIntegrity: { deviceRecognitionVerdict: [] } },
    { mode: 'monitor' },
  );
  assert.equal(verdict.decision, 'block');
  assert.equal(verdict.blocked, false);
});

test('integrity: a certificate check is skipped when no digests are configured', () => {
  const withDigest = {
    appIntegrity: {
      appRecognitionVerdict: 'PLAY_RECOGNIZED',
      certificateSha256Digest: ['not-ours'],
    },
  };
  assert.equal(judge(withDigest).decision, 'allow');
  assert.deepEqual(
    judge(withDigest, { expectedCertificateDigests: ['ours'] }).reasons,
    ['wrong_signature'],
  );
});

test('integrity: every absent field reads as unevaluated, not as a failure', () => {
  const signals = readSignals({});
  assert.equal(signals.licensing, 'UNEVALUATED');
  assert.equal(signals.appRecognition, 'UNEVALUATED');
  assert.equal(signals.playProtect, 'UNEVALUATED');
  assert.equal(signals.activityLevel, 'UNEVALUATED');
  assert.deepEqual(signals.appsDetected, []);
  assert.equal(signals.issuedAtMs, 0);
});

test('integrity: the shipped default is monitor, whatever the environment says', () => {
  assert.equal(integrityPolicyFromEnv({}).mode, 'monitor');
  assert.equal(integrityPolicyFromEnv({ PLAY_INTEGRITY_MODE: 'nonsense' }).mode, 'monitor');
  assert.equal(integrityPolicyFromEnv({ PLAY_INTEGRITY_MODE: 'enforce' }).mode, 'enforce');
  assert.equal(integrityPolicyFromEnv({ PLAY_INTEGRITY_MODE: 'off' }).mode, 'off');
});

test('integrity: policy overrides are read out of the environment', () => {
  const policy = integrityPolicyFromEnv({
    ANDROID_PACKAGE_NAME: PACKAGE,
    ANDROID_CERTIFICATE_DIGESTS: ' a , b ,, c ',
    PLAY_INTEGRITY_REQUIRE_LICENSED: 'true',
    PLAY_INTEGRITY_ALLOW_VIRTUAL: 'false',
    PLAY_INTEGRITY_MIN_DEVICE_TRUST: 'strong',
  });
  assert.equal(policy.expectedPackageName, PACKAGE);
  assert.deepEqual(policy.expectedCertificateDigests, ['a', 'b', 'c']);
  assert.equal(policy.requireLicensed, true);
  assert.equal(policy.allowVirtualDevices, false);
  assert.equal(policy.minimumDeviceTrust, 'strong');
});
