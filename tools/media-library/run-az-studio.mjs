#!/usr/bin/env node
/**
 * Builds and runs the AZ Studio generation driver (az-studio/driver.ts).
 *
 *   AZ_STUDIO_DIR=<path to the AZ Studio checkout> node tools/media-library/run-az-studio.mjs music
 *   node tools/media-library/run-az-studio.mjs stickers --only react-heart,label-new
 *   node tools/media-library/run-az-studio.mjs status
 *
 * ── Why the driver is bundled against the AZ Studio checkout ─────────────
 * AZ Studio stays its own project: none of its code is copied here and nothing
 * in Indigen imports it. The driver calls AZ Studio's server-side job API
 * (`prepareAll` + `createJobs`, the path its callable API and acceptance suite
 * use), so it has to be compiled against that checkout's sources and run with
 * that checkout's dependencies. The bundle is written into AZ Studio's
 * `node_modules/.cache`, which is where Node will then resolve firebase-admin
 * and the other externals from, and which neither repository tracks.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const azStudio = process.env.AZ_STUDIO_DIR;
if (!azStudio || !existsSync(path.join(azStudio, 'functions', 'src', 'lib', 'submit.ts'))) {
  console.error('Set AZ_STUDIO_DIR to the AZ Studio checkout (the folder holding functions/src/lib/submit.ts).');
  process.exit(2);
}

const requireFromStudio = createRequire(path.join(azStudio, 'package.json'));
const { build } = requireFromStudio('esbuild');
const functionsPkg = JSON.parse(readFileSync(path.join(azStudio, 'functions', 'package.json'), 'utf8'));
const deps = Object.keys(functionsPkg.dependencies ?? {});

const outDir = path.join(azStudio, 'node_modules', '.cache', 'indigen-media-library');
mkdirSync(outDir, { recursive: true });
const outfile = path.join(outDir, 'driver.mjs');

await build({
  entryPoints: [path.join(here, 'az-studio', 'driver.ts')],
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  outfile,
  alias: { '@azs': path.join(azStudio, 'functions', 'src') },
  nodePaths: [path.join(azStudio, 'node_modules')],
  external: [...deps, ...deps.map((d) => `${d}/*`)],
  banner: { js: "import { createRequire as __mlCreateRequire } from 'node:module'; const require = __mlCreateRequire(import.meta.url);" },
  logLevel: 'warning',
});

const run = spawnSync(process.execPath, [
  outfile,
  ...process.argv.slice(2),
  '--work', path.join(here, '.work'),
  '--briefs', path.join(here, 'briefs'),
], { stdio: 'inherit', env: { ...process.env, FFMPEG_BIN: process.env.FFMPEG_BIN ?? '' } });
process.exit(run.status ?? 1);
