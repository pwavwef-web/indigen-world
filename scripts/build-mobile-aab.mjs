#!/usr/bin/env node
// Builds the production Android App Bundle, and reads the release note's facts
// back out of the artefact it just made.
//
// ── Why this is a script and not a line in the runbook ────────────────────
// Two things kept going wrong by hand, and both of them look like something
// else.
//
// 1. `android/app/src/main/java/io/flutter/plugins/GeneratedPluginRegistrant.java`
//    is generated and gitignored. A debug or test run writes one that registers
//    `integration_test`, a dev dependency; a later *release* build reuses that
//    file, and the compile fails with
//
//        error: package dev.flutter.plugins.integration_test does not exist
//
//    which reads as an error in the app and involves nothing anybody wrote. It
//    appears only when a release build follows a test run — which is exactly
//    the order a release goes in. Deleting the file first makes Flutter
//    regenerate it for the release variant, and that is the whole fix.
//
// 2. Every release note has claimed a size, a hash, a version and a set of ABIs.
//    Claims typed by hand from a build log drift from the artefact. These are
//    read from the merged manifest and from inside the archive, so the note
//    cannot say something the bundle does not.
//
// Usage: npm run build:mobile-aab

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mobile = join(root, 'apps', 'mobile');
const registrant = join(
  mobile,
  'android/app/src/main/java/io/flutter/plugins/GeneratedPluginRegistrant.java',
);
const aab = join(
  mobile,
  'build/app/outputs/bundle/productionRelease/app-production-release.aab',
);
const manifest = join(
  mobile,
  'build/app/intermediates/merged_manifest/productionRelease',
  'processProductionReleaseMainManifest/AndroidManifest.xml',
);

/** The path an old, gitignored bundle used to sit at, mistaken for a release. */
const decoy = join(mobile, 'android/app/production/release/app-production-release.aab');

const say = (message) => process.stdout.write(`${message}\n`);

// ── 1. Clear the stale registrant ────────────────────────────────────────
if (existsSync(registrant)) {
  const stale = readFileSync(registrant, 'utf8').includes('integration_test');
  rmSync(registrant);
  say(
    stale
      ? '· Removed a GeneratedPluginRegistrant.java that registered integration_test.'
      : '· Removed GeneratedPluginRegistrant.java so Flutter regenerates it.',
  );
}

if (existsSync(decoy)) {
  say(`! An old bundle is sitting at ${decoy} — it is not this release.`);
}

// ── 2. Build ─────────────────────────────────────────────────────────────
const started = Date.now();
say('· flutter build appbundle --flavor production --dart-define=APP_ENV=production');
// `flutter` on Windows is a .bat, and since Node 20 a .bat cannot be spawned
// without a shell at all — it fails EINVAL. So Windows gets a shell and one
// command *string*: passing an args array alongside `shell: true` is what Node
// deprecates, because the array is concatenated rather than escaped. Every
// argument here is a literal in this file, so there is nothing to escape, and
// writing it as a string says that rather than hiding it.
const FLAGS = [
  'build',
  'appbundle',
  '--flavor',
  'production',
  '--dart-define=APP_ENV=production',
];
const build =
  process.platform === 'win32'
    ? spawnSync(`flutter ${FLAGS.join(' ')}`, {
        cwd: mobile,
        stdio: 'inherit',
        shell: true,
      })
    : spawnSync('flutter', FLAGS, { cwd: mobile, stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);
const seconds = ((Date.now() - started) / 1000).toFixed(1);

// ── 3. Read the facts back out of the artefact ───────────────────────────
if (!existsSync(aab)) {
  say(`! The build reported success but ${aab} is not there.`);
  process.exit(1);
}

const bytes = statSync(aab).size;
const sha256 = createHash('sha256').update(readFileSync(aab)).digest('hex');

const xml = existsSync(manifest) ? readFileSync(manifest, 'utf8') : '';
const attribute = (name) => xml.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? '?';

// The ABIs, from base/lib/ inside the archive, rather than from the flags the
// build was given. A zip's central directory is enough — no dependency.
const abis = [...new Set(
  [...readFileSync(aab).toString('latin1').matchAll(/base\/lib\/([^/]+)\//g)]
    .map((match) => match[1]),
)].sort();

let signing = 'not checked (jarsigner not on PATH)';
try {
  const out = execFileSync('jarsigner', ['-verify', aab], { encoding: 'utf8' });
  signing = /^jar verified/m.test(out) ? 'jar verified' : 'NOT VERIFIED';
} catch {
  // Left as the default. A missing JDK is not a reason to fail the build.
}

say('');
say('── For the release note ─────────────────────────────────────────────');
say(`Bundle:      ${aab}`);
say(`Package:     ${attribute('package')}`);
say(`Version:     ${attribute('android:versionName')} (${attribute('android:versionCode')})`);
say(`SDK:         min ${attribute('android:minSdkVersion')}, target ${attribute('android:targetSdkVersion')}`);
say(`ABIs:        ${abis.join(', ')}`);
say(`Size:        ${(bytes / 1024 / 1024).toFixed(1)} MB (${bytes.toLocaleString('en-GB')} bytes)`);
say(`SHA-256:     ${sha256}`);
say(`Signing:     ${signing}`);
say(`Build time:  ${seconds} s`);
say('');
say('Every line above is read from the artefact or its merged manifest, not');
say('from the build command. Upload this path — not android/app/production/.');
