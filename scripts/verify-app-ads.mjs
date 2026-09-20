#!/usr/bin/env node
// Checks the live /app-ads.txt the way Google's crawler will.
//
// ── Why this is not "open it in a browser and look" ──────────────────────
// Three of the four ways this file goes wrong look fine in a browser tab:
// a single-page-app 404 that renders as a styled page and still returns HTML;
// a file served as text/html so the crawler refuses it; and a stale copy held
// by a CDN after a correct deploy. The fourth — an outright 404 — is the only
// one that is obvious. So each is asserted separately here, against the
// canonical origin, with the cache deliberately bypassed.
//
// The expected record is optional. Without it this still proves the file is
// reachable and well formed; with ADMOB_APP_ADS_TXT_RECORD set it also proves
// the deployed line is the exact one AdMob issued. Neither the record nor the
// publisher id is ever printed.
//
// Usage: npm run verify:app-ads [-- https://other-origin]

import { redact } from './admob-release-config.mjs';

const RECORD = /^google\.com,\s*pub-\d{16},\s*DIRECT,\s*f08c47fec0942fa0$/;

const say = (message) => process.stdout.write(`${message}\n`);

async function main() {
  const origin = process.argv[2] ?? 'https://indigenworld.com';
  const url = new URL('/app-ads.txt', origin);
  const problems = [];
  const note = (problem) => problems.push(problem);

  // A query string Firebase ignores but a CDN treats as a different object, so
  // a pass here cannot be a cached copy of a file that has since changed.
  const bust = new URL(url);
  bust.searchParams.set('cachebust', String(process.pid));

  let response;
  try {
    response = await fetch(bust, {
      redirect: 'follow',
      headers: { 'Cache-Control': 'no-cache', Accept: 'text/plain,*/*' },
    });
  } catch (error) {
    say(`! Could not reach ${url}: ${error.message}`);
    return 1;
  }

  const body = await response.text();
  const contentType = response.headers.get('content-type') ?? '(none)';

  say(`· URL           ${url}`);
  say(`· Status        ${response.status} ${response.statusText}`);
  say(`· Content-Type  ${contentType}`);
  say(`· Final URL     ${response.url.split('?')[0]}`);
  say(`· Bytes         ${body.length}`);

  if (response.status !== 200) note(`HTTP status is ${response.status}, not 200.`);

  if (!/^text\/plain\b/i.test(contentType)) {
    note(`Content-Type is "${contentType}", not text/plain.`);
  }

  // The tell-tale of a single-page-app 404 dressed up as a page.
  if (/<!doctype html|<html[\s>]/i.test(body)) {
    note('The response body is HTML. The file is not being served as a static text file.');
  }

  if (new URL(response.url).origin !== new URL(origin).origin) {
    note(`The request was redirected off ${new URL(origin).origin}. The canonical origin must serve it.`);
  }

  // An authenticated response would carry a challenge.
  if (response.headers.has('www-authenticate')) {
    note("The file is behind authentication. Google's crawler must be able to read it anonymously.");
  }

  const lines = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  const googleRecords = lines.filter((line) => RECORD.test(line));

  if (response.status === 200) {
    say(`· Records       ${lines.length} (${googleRecords.length} Google DIRECT)`);
    if (googleRecords.length === 0) {
      note('No valid Google DIRECT authorised-seller record is present.');
    }
  }

  const expected = process.env.ADMOB_APP_ADS_TXT_RECORD?.trim();
  if (!expected) {
    say('· ADMOB_APP_ADS_TXT_RECORD is unset, so the exact record was not compared.');
  } else if (!RECORD.test(expected)) {
    note('ADMOB_APP_ADS_TXT_RECORD is not a valid Google app-ads.txt record.');
  } else if (lines.includes(expected)) {
    say(`· Expected record matched in full (publisher ${redact(expected.split(',')[1]?.trim())})`);
  } else {
    note(
      `The expected AdMob record is not in the live file. Live Google records: ${
        googleRecords.map((line) => redact(line.split(',')[1]?.trim())).join(', ') || 'none'
      }`,
    );
  }

  say('');
  if (problems.length) {
    say('app-ads.txt is NOT ready for AdMob verification:');
    for (const problem of problems) say(`  · ${problem}`);
    say('');
    say('Fix the deployment, then re-run. AdMob may still take time to re-crawl');
    say('a file that is already correct.');
    return 1;
  }

  say('app-ads.txt is reachable, plain text, unauthenticated and well formed.');
  say('AdMob verification can lag a correct file by a day or more; use the');
  say("console's own check-for-updates control and re-check the app status there.");
  return 0;
}

// `process.exitCode` rather than `process.exit()`: on Node 24 for Windows,
// tearing the process down while fetch's keep-alive socket is still open trips
// a libuv assertion and reports 127 instead of the status we meant. Letting the
// loop drain reports the real one, which is what a caller checks.
process.exitCode = await main();
