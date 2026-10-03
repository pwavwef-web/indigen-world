import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { STRUCTURED_FIELDS } from '@indigen-world/contracts/knowledge';

/** Offline inventory only. Never opens a production connection or changes originals. */
export function auditKnowledgeMigration(rows) {
  if (!Array.isArray(rows)) throw new Error('Supply a JSON array of exported records with stable IDs.');
  const seen = new Set(), inventory = [];
  for (const row of rows) {
    if (!row || typeof row.id !== 'string' || !row.id) throw new Error('Every source row needs its existing ID.');
    if (seen.has(row.id)) throw new Error(`Duplicate source ID: ${row.id}`);
    seen.add(row.id);
    const known = Object.hasOwn(STRUCTURED_FIELDS, row.datasetType);
    const reasons = [];
    if (!known) reasons.push('Unknown category: retain source and request curation.');
    if (row.schemaVersion !== 2) reasons.push('Legacy schema requires explicit mapping; never inherit Gold from approval counts.');
    if (!row.sourceReference) reasons.push('Missing traceable source reference.');
    if (row.rights?.state !== 'documented') reasons.push('Rights unresolved or withdrawn.');
    if (row.datasetType === 'sentences') reasons.push('Sentence schema and display prefix need human approval.');
    if (row.status === 'withdrawn' || row.rights?.state === 'withdrawn') reasons.push('Preserve revocation before any restore.');
    inventory.push({ id: row.id, category: row.datasetType ?? null, revision: row.revision ?? null,
      sha256: createHash('sha256').update(JSON.stringify(row)).digest('hex'), outcome: reasons.length ? 'quarantine' : 'candidate_for_review', reasons,
      media: (Array.isArray(row.audio) ? row.audio : []).map(a => ({ path: a.path, generation: a.generation ?? null, checksum: a.checksum ?? null })), relatedIds: (Array.isArray(row.relations) ? row.relations : []).map(r => r.recordId) });
  }
  const missingLinks = inventory.flatMap(r => r.relatedIds.filter(id => !seen.has(id)).map(id => ({ from: r.id, to: id })));
  return { mode: 'dry-run', inputCount: rows.length, accountedCount: inventory.length, quarantineCount: inventory.filter(r => r.outcome === 'quarantine').length,
    missingLinks, records: inventory, releaseAction: 'none', rollback: 'Originals unchanged. Preserve this inventory with the export and replay the revocation ledger before any cutover.' };
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const [, , input, output] = process.argv;
  if (!input || !output || resolve(input) === resolve(output)) throw new Error('Usage: node scripts/audit-knowledge-migration.mjs input.json report.json (distinct paths)');
  const report = auditKnowledgeMigration(JSON.parse(readFileSync(input, 'utf8')));
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ inputCount: report.inputCount, accountedCount: report.accountedCount, quarantined: report.quarantineCount, missingLinks: report.missingLinks.length }));
}
