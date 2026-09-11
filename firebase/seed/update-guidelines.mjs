// Publishes the canonical creator guidelines to platformConfiguration/creators.
//
// The guidelines page reads Firestore at runtime, so shipping new text in the
// bundle is not enough — the document has to be updated too. prod-bootstrap.mjs
// would do it, but it also rewrites the campaign document, which an admin may
// have edited since. This touches one field and nothing else.
//
//   GOOGLE_CLOUD_QUOTA_PROJECT=project-kassena-7e026 PROD_BOOTSTRAP=confirm \
//     node firebase/seed/update-guidelines.mjs project-kassena-7e026
//
// Pass --dry-run to print what would be written without writing it.

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { creatorGuidelines } from '@indigen-world/contracts';

const args = process.argv.slice(2).filter((a) => a !== '--dry-run');
const dryRun = process.argv.includes('--dry-run');
const projectId = args[0] || process.env.GCLOUD_PROJECT;
if (!projectId) {
  console.error('Usage: node update-guidelines.mjs <projectId> [--dry-run]');
  process.exit(1);
}

const groups = [...new Set(creatorGuidelines.map((s) => s.group || 'Ungrouped'))];
const points = creatorGuidelines.reduce((n, s) => n + (s.points?.length ?? 0), 0);
console.log(`${creatorGuidelines.length} sections, ${points} points, ${groups.length} groups:`);
for (const group of groups) {
  const inGroup = creatorGuidelines.filter((s) => (s.group || 'Ungrouped') === group);
  console.log(`  ${group} (${inGroup.length})`);
  for (const section of inGroup) console.log(`    · ${section.heading}`);
}

if (dryRun) {
  console.log('\nDry run: nothing written.');
  process.exit(0);
}

if (!process.env.FIRESTORE_EMULATOR_HOST && process.env.PROD_BOOTSTRAP !== 'confirm') {
  console.error('\nRefusing: set PROD_BOOTSTRAP=confirm to write to a live project.');
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

const ref = db.doc('platformConfiguration/creators');
const before = await ref.get();
if (!before.exists) {
  console.error(`\nRefusing: ${ref.path} does not exist. Run prod-bootstrap.mjs first.`);
  process.exit(1);
}

const previous = before.data()?.guidelines ?? [];
await ref.set(
  {
    guidelines: creatorGuidelines,
    lifecycle: {
      ...(before.data()?.lifecycle ?? {}),
      updatedAt: new Date().toISOString(),
      version: (before.data()?.lifecycle?.version ?? 0) + 1,
    },
  },
  { merge: true },
);

console.log(`\nWrote ${creatorGuidelines.length} sections to ${ref.path} on ${projectId} (was ${previous.length}).`);
