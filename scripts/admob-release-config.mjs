#!/usr/bin/env node
// The four production AdMob identifiers, loaded and checked without ever
// printing one.
//
// ── Why this exists as one module ─────────────────────────────────────────
// The identifiers are needed in two places that are easy to get out of step:
// Gradle wants `ADMOB_ANDROID_APP_ID` in the environment so it can write the
// manifest placeholder, and Dart wants all four as `--dart-define`s so
// `AdMobConfig.fromEnvironment` can resolve a unit per placement. Supplying
// one and forgetting the other produces a release that builds, installs, runs
// — and silently never asks Google for an advert, because `hasValidAppId`
// gates every unit lookup. That failure is invisible until somebody notices
// the revenue is zero, so it is turned into a build error here instead.
//
// ── Why the values are not in the repository ──────────────────────────────
// An ad-unit id is not a credential, but every one of them embeds the
// account's publisher id, and a unit id in a public repository is a unit that
// can be requested by somebody else's app. They live in an ignored local file
// or in CI secrets; this module is the only thing that reads them, and it
// redacts everything it reports.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Google's published sample publisher. Never valid for a production build. */
export const GOOGLE_SAMPLE_PUBLISHER = '3940256099942544';

const APP_ID = /^ca-app-pub-(\d{16})~\d{10}$/;
const UNIT_ID = /^ca-app-pub-(\d{16})\/\d{10}$/;

/**
 * The default ignored file.
 *
 * At the repository root rather than beside the mobile app, because the
 * website needs one value out of it too: the authorised-seller record it
 * publishes at /app-ads.txt carries the same publisher id as the four mobile
 * identifiers, and a second ignored file somewhere else is a second file to
 * forget when the account changes.
 */
export const LOCAL_CONFIG_PATH = join(root, 'admob.local.json');

/**
 * The app-ads.txt record. Optional here, and checked separately, because the
 * website can be deployed by somebody who never builds the app and the mobile
 * release does not need it.
 */
export const APP_ADS_RECORD_KEY = 'ADMOB_APP_ADS_TXT_RECORD';
export const APP_ADS_RECORD = /^google\.com,\s*pub-\d{16},\s*DIRECT,\s*f08c47fec0942fa0$/;

/**
 * Every key this build needs, and what each one must look like.
 *
 * The placement keys are deliberately spelled the same way in the JSON file,
 * the environment, the GitHub secret and the `--dart-define`, so there is one
 * name to get right rather than four spellings of it.
 */
export const REQUIRED_KEYS = [
  { key: 'ADMOB_ANDROID_APP_ID', pattern: APP_ID, kind: 'app' },
  { key: 'ADMOB_COMMUNITY_NATIVE_AD_UNIT_ID', pattern: UNIT_ID, kind: 'unit' },
  { key: 'ADMOB_EXPLORE_NATIVE_AD_UNIT_ID', pattern: UNIT_ID, kind: 'unit' },
  { key: 'ADMOB_COLLECTION_NATIVE_AD_UNIT_ID', pattern: UNIT_ID, kind: 'unit' },
];

/**
 * The last four digits, which is enough to tell two records apart in a log and
 * not enough to use one. Everything this module reports goes through here.
 */
export function redact(value) {
  const text = String(value ?? '').trim();
  if (!text) return '(unset)';
  return `…${text.slice(-4)}`;
}

/**
 * Reads the ignored local file, if there is one.
 *
 * A missing file is not an error: CI supplies the same keys through the
 * environment, and a contributor who never builds a production release never
 * needs one. A malformed file *is* an error, because the alternative is
 * silently falling back to "no identifiers" and shipping a build that cannot
 * serve.
 */
export function readLocalFile(path = process.env.ADMOB_RELEASE_CONFIG || LOCAL_CONFIG_PATH) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    // The file name, never its contents — a parse error that echoed the line
    // it choked on would print the identifier it was trying to read.
    throw new Error(`${path} is not valid JSON.`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${path} must contain a JSON object of identifier keys.`);
  }
  return parsed;
}

/**
 * Resolves the four identifiers. The environment wins over the local file, so
 * a CI secret is never shadowed by a stale checkout, and a one-off build can
 * override a single key without editing anything.
 */
export function resolveConfig({ env = process.env, file } = {}) {
  const local = file ?? readLocalFile();
  const values = {};
  for (const { key } of REQUIRED_KEYS) {
    const fromEnv = String(env[key] ?? '').trim();
    const fromFile = String(local[key] ?? '').trim();
    values[key] = fromEnv || fromFile;
  }
  return values;
}

/**
 * Everything wrong with [values], as sentences a person can act on.
 *
 * An empty array means this configuration is safe to ship. The checks past
 * "is it well formed" are the ones that catch a real mistake rather than a
 * typo: a sample id that would serve nothing, four ids from two different
 * accounts, and the same unit pasted into two placements — which is how
 * "Explore revenue is zero and Community is double" happens.
 */
export function validate(values) {
  const problems = [];
  const publishers = new Set();

  for (const { key, pattern, kind } of REQUIRED_KEYS) {
    const value = values[key] ?? '';
    if (!value) {
      problems.push(`${key} is missing.`);
      continue;
    }
    const match = pattern.exec(value);
    if (!match) {
      problems.push(
        kind === 'app'
          ? `${key} is not a Google app id of the form ca-app-pub-<16 digits>~<10 digits>.`
          : `${key} is not a Google ad-unit id of the form ca-app-pub-<16 digits>/<10 digits>.`,
      );
      continue;
    }
    if (match[1] === GOOGLE_SAMPLE_PUBLISHER) {
      problems.push(`${key} is one of Google's sample ids. A production release must not use it.`);
      continue;
    }
    publishers.add(match[1]);
  }

  if (publishers.size > 1) {
    problems.push(
      'The identifiers belong to more than one AdMob publisher. All four must come from the same account.',
    );
  }

  const units = REQUIRED_KEYS.filter((entry) => entry.kind === 'unit');
  const seen = new Map();
  for (const { key } of units) {
    const value = values[key];
    if (!value) continue;
    const first = seen.get(value);
    if (first) {
      problems.push(`${key} is the same ad unit as ${first}. Each placement needs its own unit.`);
    } else {
      seen.set(value, key);
    }
  }

  return problems;
}

/**
 * The four `--dart-define` arguments, ready to concatenate onto a build.
 *
 * Callers pass these straight to `flutter`; nothing here formats them into a
 * string that could end up in a log.
 */
export function dartDefines(values) {
  return REQUIRED_KEYS.map(({ key }) => `--dart-define=${key}=${values[key]}`);
}

/** The subset Gradle reads, to merge into a child process's environment. */
export function gradleEnv(values) {
  return { ADMOB_ANDROID_APP_ID: values.ADMOB_ANDROID_APP_ID };
}

/**
 * The authorised-seller record for /app-ads.txt, or null when none is
 * configured.
 *
 * Returns null rather than throwing for an absent record, so a website build
 * by somebody who has never touched advertising still succeeds — it just does
 * not emit the file. A *malformed* record does throw: a file published with a
 * wrong publisher id, relationship or certification-authority id is worse than
 * no file, because AdMob reads it as a statement that this account is not
 * authorised to sell the inventory.
 */
export function appAdsRecord({ env = process.env, file } = {}) {
  const local = file ?? readLocalFile();
  const record = String(env[APP_ADS_RECORD_KEY] ?? local[APP_ADS_RECORD_KEY] ?? '').trim();
  if (!record) return null;
  if (!APP_ADS_RECORD.test(record)) {
    throw new Error(
      `${APP_ADS_RECORD_KEY} is not a valid Google app-ads.txt record. ` +
        'Copy it exactly from AdMob: google.com, pub-<16 digits>, DIRECT, f08c47fec0942fa0',
    );
  }
  return record;
}

/**
 * Loads, validates and returns the configuration, or throws with every problem
 * listed at once. Throwing beats returning a partial set: a build that starts
 * with three of four identifiers is a build that wastes ten minutes before
 * failing somewhere less obvious.
 */
export function requireConfig(options) {
  const values = resolveConfig(options);
  const problems = validate(values);
  if (problems.length) {
    throw new Error(
      [
        'The production AdMob configuration is not usable:',
        ...problems.map((problem) => `  · ${problem}`),
        '',
        `Set these as environment variables or in ${LOCAL_CONFIG_PATH}`,
        '(ignored by Git — see apps/mobile/admob.release.example.json).',
      ].join('\n'),
    );
  }
  return values;
}

/** A redacted line per key, for a build log or a verification run. */
export function describe(values) {
  return REQUIRED_KEYS.map(({ key }) => `  ${key.padEnd(38)} ${redact(values[key])}`).join('\n');
}

// ── CLI ──────────────────────────────────────────────────────────────────
// `node scripts/admob-release-config.mjs` verifies and prints redacted values.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    const values = requireConfig();
    process.stdout.write('Production AdMob configuration is complete and consistent.\n');
    process.stdout.write(`${describe(values)}\n`);
    const record = appAdsRecord();
    process.stdout.write(
      `  ${APP_ADS_RECORD_KEY.padEnd(38)} ${
        record ? `${redact(record.split(',')[1]?.trim())} (website deploys only)` : '(unset)'
      }\n`,
    );
    process.stdout.write('Only the last four characters of each value are shown.\n');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}
