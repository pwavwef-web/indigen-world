// Copies the server's reward arithmetic into TribeStudio so previews in the
// contributor portal, the Rewards desk and Admin Finance (which imports
// TribeStudio's copy) compute exactly what the server will. The server stays
// authoritative; the copy only makes previews honest.
//
//   node scripts/sync-reward-policy.mjs          write the copy
//   node scripts/sync-reward-policy.mjs --check  fail if it has drifted
import { readFileSync, writeFileSync } from 'node:fs';

const source = new URL('../services/functions/src/reward-policy.ts', import.meta.url);
const target = new URL('../apps/tribestudio/src/contributor/reward-policy.ts', import.meta.url);
const header = '// GENERATED from services/functions/src/reward-policy.ts by scripts/sync-reward-policy.mjs.\n'
  + '// Do not edit here. Previews only: the server recomputes every award and quote.\n\n';
const expected = header + readFileSync(source, 'utf8');

if (process.argv.includes('--check')) {
  let current = '';
  try { current = readFileSync(target, 'utf8'); } catch { /* missing counts as drift */ }
  if (current !== expected) {
    console.error('apps/tribestudio/src/contributor/reward-policy.ts is out of date. Run: node scripts/sync-reward-policy.mjs');
    process.exit(1);
  }
  console.log('reward-policy copy is current');
} else {
  writeFileSync(target, expected);
  console.log('wrote apps/tribestudio/src/contributor/reward-policy.ts');
}
