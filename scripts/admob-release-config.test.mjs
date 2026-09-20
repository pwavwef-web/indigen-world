// Checks on the gate that decides whether a production advertising build is
// allowed to start. Run with: npm run test:admob-config

import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  GOOGLE_SAMPLE_PUBLISHER,
  LOCAL_CONFIG_PATH,
  REQUIRED_KEYS,
  appAdsRecord,
  dartDefines,
  describe,
  gradleEnv,
  redact,
  requireConfig,
  resolveConfig,
  validate,
} from './admob-release-config.mjs';

const PUBLISHER = '1234567890123456';
const good = {
  ADMOB_ANDROID_APP_ID: `ca-app-pub-${PUBLISHER}~1111111111`,
  ADMOB_COMMUNITY_NATIVE_AD_UNIT_ID: `ca-app-pub-${PUBLISHER}/2222222222`,
  ADMOB_EXPLORE_NATIVE_AD_UNIT_ID: `ca-app-pub-${PUBLISHER}/3333333333`,
  ADMOB_COLLECTION_NATIVE_AD_UNIT_ID: `ca-app-pub-${PUBLISHER}/4444444444`,
};

test('a complete, consistent configuration has nothing wrong with it', () => {
  assert.deepEqual(validate(good), []);
});

test('every missing key is reported at once, not one build at a time', () => {
  const problems = validate({});
  assert.equal(problems.length, REQUIRED_KEYS.length);
  for (const { key } of REQUIRED_KEYS) {
    assert.ok(
      problems.some((problem) => problem.startsWith(`${key} is missing`)),
      `expected ${key} to be reported`,
    );
  }
});

test('an app id in a unit slot, or the reverse, is rejected', () => {
  const swapped = {
    ...good,
    ADMOB_ANDROID_APP_ID: `ca-app-pub-${PUBLISHER}/1111111111`,
    ADMOB_EXPLORE_NATIVE_AD_UNIT_ID: `ca-app-pub-${PUBLISHER}~3333333333`,
  };
  const problems = validate(swapped);
  assert.ok(problems.some((problem) => problem.includes('ADMOB_ANDROID_APP_ID is not a Google app id')));
  assert.ok(
    problems.some((problem) =>
      problem.includes('ADMOB_EXPLORE_NATIVE_AD_UNIT_ID is not a Google ad-unit id'),
    ),
  );
});

test("Google's sample identifiers can never reach a production build", () => {
  const sample = {
    ...good,
    ADMOB_ANDROID_APP_ID: `ca-app-pub-${GOOGLE_SAMPLE_PUBLISHER}~3347511713`,
    ADMOB_COMMUNITY_NATIVE_AD_UNIT_ID: `ca-app-pub-${GOOGLE_SAMPLE_PUBLISHER}/2247696110`,
  };
  const problems = validate(sample);
  assert.equal(problems.filter((problem) => problem.includes("sample ids")).length, 2);
});

test('identifiers from two different accounts are caught', () => {
  // Assembled rather than written out, so no line in this repository ever
  // reads as a whole AdMob identifier — see the gitleaks rule of the same name.
  const OTHER_PUBLISHER = '6543210987654321';
  const problems = validate({
    ...good,
    ADMOB_COLLECTION_NATIVE_AD_UNIT_ID: `ca-app-pub-${OTHER_PUBLISHER}/4444444444`,
  });
  assert.ok(
    problems.some((problem) => problem.includes('more than one AdMob publisher')),
    'two publishers must be reported',
  );
});

test('the same unit pasted into two placements is caught', () => {
  const problems = validate({
    ...good,
    ADMOB_EXPLORE_NATIVE_AD_UNIT_ID: good.ADMOB_COMMUNITY_NATIVE_AD_UNIT_ID,
  });
  assert.ok(
    problems.some(
      (problem) =>
        problem.includes('ADMOB_EXPLORE_NATIVE_AD_UNIT_ID is the same ad unit as') &&
        problem.includes('ADMOB_COMMUNITY_NATIVE_AD_UNIT_ID'),
    ),
    'a duplicated unit must name both placements',
  );
});

test('the environment wins over the local file', () => {
  const values = resolveConfig({
    env: { ADMOB_EXPLORE_NATIVE_AD_UNIT_ID: `ca-app-pub-${PUBLISHER}/9999999999` },
    file: good,
  });
  assert.equal(values.ADMOB_EXPLORE_NATIVE_AD_UNIT_ID, `ca-app-pub-${PUBLISHER}/9999999999`);
  assert.equal(values.ADMOB_COMMUNITY_NATIVE_AD_UNIT_ID, good.ADMOB_COMMUNITY_NATIVE_AD_UNIT_ID);
});

test('a blank environment variable does not shadow the local file', () => {
  const values = resolveConfig({ env: { ADMOB_ANDROID_APP_ID: '   ' }, file: good });
  assert.equal(values.ADMOB_ANDROID_APP_ID, good.ADMOB_ANDROID_APP_ID);
});

test('requireConfig throws with every problem listed', () => {
  assert.throws(
    () => requireConfig({ env: {}, file: {} }),
    (error) => {
      assert.ok(error.message.includes('not usable'));
      for (const { key } of REQUIRED_KEYS) assert.ok(error.message.includes(key));
      return true;
    },
  );
  assert.deepEqual(requireConfig({ env: {}, file: good }), good);
});

test('nothing this module prints contains a usable identifier', () => {
  assert.equal(redact(good.ADMOB_ANDROID_APP_ID), '…1111');
  assert.equal(redact(''), '(unset)');
  assert.equal(redact(undefined), '(unset)');

  const printed = describe(good);
  for (const value of Object.values(good)) {
    assert.ok(!printed.includes(value), 'a full identifier must never be printed');
    assert.ok(!printed.includes(PUBLISHER), 'the publisher id must never be printed');
  }

  let thrown;
  try {
    requireConfig({ env: {}, file: { ...good, ADMOB_EXPLORE_NATIVE_AD_UNIT_ID: '' } });
  } catch (error) {
    thrown = error.message;
  }
  assert.ok(thrown, 'an incomplete configuration must throw');
  assert.ok(!thrown.includes(PUBLISHER), 'the failure message must not leak the publisher id');
});

test('the app-ads.txt record is optional, but a wrong one is never published', () => {
  const record = `google.com, pub-${PUBLISHER}, DIRECT, f08c47fec0942fa0`;

  assert.equal(appAdsRecord({ env: {}, file: {} }), null, 'an absent record is not an error');
  assert.equal(appAdsRecord({ env: {}, file: { ADMOB_APP_ADS_TXT_RECORD: record } }), record);
  assert.equal(
    appAdsRecord({ env: { ADMOB_APP_ADS_TXT_RECORD: record }, file: {} }),
    record,
    'the environment is a valid source on its own',
  );

  for (const wrong of [
    `google.com, pub-${PUBLISHER}, RESELLER, f08c47fec0942fa0`,
    `google.com, pub-${PUBLISHER}, DIRECT, 0000000000000000`,
    `google.com, pub-${PUBLISHER}, DIRECT`,
    `doubleclick.net, pub-${PUBLISHER}, DIRECT, f08c47fec0942fa0`,
  ]) {
    assert.throws(
      () => appAdsRecord({ env: {}, file: { ADMOB_APP_ADS_TXT_RECORD: wrong } }),
      /not a valid Google app-ads\.txt record/,
      `expected "${wrong.replace(PUBLISHER, '<publisher>')}" to be rejected`,
    );
  }
});

test('the ignored local file sits at the repository root, shared by app and website', () => {
  assert.match(LOCAL_CONFIG_PATH, /admob\.local\.json$/);
  assert.doesNotMatch(LOCAL_CONFIG_PATH, /apps[\\/]/);
});

test('the build arguments carry all four keys, and Gradle only gets the app id', () => {
  const defines = dartDefines(good);
  assert.equal(defines.length, 4);
  for (const { key } of REQUIRED_KEYS) {
    assert.ok(defines.includes(`--dart-define=${key}=${good[key]}`));
  }
  assert.deepEqual(gradleEnv(good), { ADMOB_ANDROID_APP_ID: good.ADMOB_ANDROID_APP_ID });
});
