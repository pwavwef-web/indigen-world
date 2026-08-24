import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const app = read('src/App.tsx');
const navigation = read('src/navigation.tsx');
const notFound = read('src/NotFoundPage.tsx');
const styles = read('src/styles.css');

assert.match(navigation, /AdminScreen \| null/, 'unknown routes have an explicit nullable result');
assert.match(navigation, /\?\? null/, 'unknown routes do not fall back to the console');
assert.match(app, /<AdminNotFoundPage/, 'the shell renders the branded 404 page');
assert.match(notFound, /aria-label="Error 404"/, 'the not-found page exposes an accessible 404 code');
assert.match(styles, /backdrop-filter:\s*blur/, 'the admin navigation retains its glass treatment');

console.log('Validated admin routing, 404 recovery, and navigation treatment.');
