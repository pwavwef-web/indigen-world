import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const site = JSON.parse(read('../../../firebase.json')).hosting.find(site => site.site === 'indigen-admin');
const csp = site.headers.flatMap(rule => rule.headers).find(header => header.key === 'Content-Security-Policy').value;
const allowed = csp.match(/script-src ([^;]*)/)[1].split(/\s+/).filter(token => token.startsWith("'sha256-"));
// HTML parsing normalizes CRLF before executing/hashing inline scripts.
const html = read('../dist/index.html').replace(/\r\n?/g, '\n');
const actual = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => `'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`);
assert.deepEqual(actual.sort(), allowed.sort(), 'built admin inline scripts must match the deployed CSP');
console.log('Verified built admin CSP hashes after HTML newline normalization.');
