/** Private evidence tooling. Use --help; all Firestore mutations require --commit. */
import { readFileSync, writeFileSync, mkdirSync, existsSync, realpathSync } from 'node:fs';
import { resolve, relative, dirname, join, isAbsolute, basename } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldPath } from 'firebase-admin/firestore';
import { blindEvaluation, buildDataset, DEFAULT_CONFIG, evaluateJudgments, qualityReport, unblindJudgments } from '../lib/kasem-dataset.js';
import { allowed, evidenceFingerprint, hash, migrateLegacy, parseNote, parseReview, stableStringify } from '../lib/kasem-evidence.js';
import { queueProjection } from '../lib/grammar-contributions.js';

const argv = process.argv.slice(2), command = argv[0] ?? 'help';
const flag = name => argv.includes('--' + name);
const arg = name => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : undefined; };
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const ajv = new Ajv2020({ allErrors: true }); addFormats(ajv);
const schema = ajv.compile(JSON.parse(readFileSync(join(root, 'packages/contracts/schemas/kasem-evidence.schema.json'), 'utf8')));
const releaseSchema = ajv.compile(JSON.parse(readFileSync(join(root, 'packages/contracts/schemas/kasem-dataset-release.schema.json'), 'utf8')));
const claimSchema = ajv.compile(JSON.parse(readFileSync(join(root, 'packages/contracts/schemas/kasem-grammar-claim.schema.json'), 'utf8')));
const now = arg('as-of') ?? new Date().toISOString();
if (command === 'help' || flag('help')) {
  console.log(`Kasem evidence tools (run build:functions first)
report --input PRIVATE_SNAPSHOT.json [--as-of ISO]
export --input PRIVATE_SNAPSHOT.json --output PRIVATE_NEW_DIR --release ID [--seed VALUE]
--claims PRIVATE_CLAIMS.json optionally adds reviewed grammar claims to an offline export.
report|export --firestore --project ID (export also needs --output, --release, --commit)
migrate --project ID [--commit] (dry-run by default; stores legacy evidence with no inferred consent)
verify --project ID --manifest PRIVATE_MANIFEST.json [--run ID --model MODEL --prompt VERSION --commit]
evaluate --input PRIVATE_JUDGMENTS.json --output PRIVATE_NEW_DIR
blind --input PRIVATE_PREDICTIONS.json --output PRIVATE_NEW_DIR [--seed PRIVATE_SEED]
evaluate --input BLINDED_JUDGMENTS.json --key PRIVATE_KEY.json --output PRIVATE_NEW_DIR
--train-percent 80 --validation-percent 10 customize split allocation.
--synthetic permits synthetic-only artifacts inside the repository.
No command uploads data to an AI provider or starts training.`);
  process.exit(0);
}
if (!['report', 'export', 'migrate', 'verify', 'evaluate', 'blind'].includes(command)) throw new Error('Unknown command. Use --help.');
if (!Number.isFinite(Date.parse(now))) throw new Error('Invalid snapshot date.');
const projectId = arg('project');
let db;
if (flag('firestore') || ['migrate', 'verify'].includes(command)) {
  if (!projectId) throw new Error('--project is required; no production project is assumed.');
  if (process.env.FIRESTORE_EMULATOR_HOST && !projectId.startsWith('demo-')) throw new Error('Use a demo project with emulators.');
  initializeApp({ projectId }); db = getFirestore();
}
async function all(collection) {
  const rows = []; let cursor;
  while (true) {
    let query = db.collection(collection).orderBy(FieldPath.documentId()).limit(250);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    rows.push(...page.docs.map(doc => ({ ...doc.data(), id: doc.id })));
    if (page.size < 250) break; cursor = page.docs.at(-1);
  }
  return rows;
}
function outputDirectory() {
  if (!arg('output')) throw new Error('--output is required.');
  const path = resolve(arg('output'));
  if (existsSync(path)) throw new Error('Use a new output directory; releases are immutable.');
  // Resolve the nearest existing ancestor so a junction cannot bypass the check.
  let ancestor = dirname(path); while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  const actual = resolve(realpathSync(ancestor), relative(ancestor, path));
  const rel = relative(realpathSync(root), actual);
  if (!flag('synthetic') && (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel)))) {
    throw new Error('Private corpus artifacts must be outside the repository.');
  }
  mkdirSync(path, { recursive: true }); return path;
}
function validateStored(raw) {
  if (!schema(raw)) throw new Error('Invalid evidence snapshot: ' + ajv.errorsText(schema.errors));
  if (raw.schemaVersion !== 2 || !Number.isInteger(raw.revision) || raw.revision < 1) throw new Error('Migrate legacy records before exporting.');
  const note = parseNote(raw, raw.id, raw.authorUid, raw.createdAt);
  note.revision = raw.revision; note.updatedAt = raw.updatedAt;
  if (!['active', 'withdrawn'].includes(raw.permissions.status)) throw new Error('Invalid consent state.');
  note.permissions.status = raw.permissions.status;
  note.permissions.version = raw.permissions.version;
  if (!['', 'validation', 'test'].includes(raw.reservedSplit)) throw new Error('Invalid held-out reservation.');
  note.reservedSplit = raw.reservedSplit;
  if (!Array.isArray(raw.reviews)) throw new Error('Missing review events.');
  // Old revision events remain in the archive, but do not approve this revision.
  note.reviews = raw.reviews.filter(r => r.revision === note.revision).map(r => parseReview(r, note, r.reviewerId, r.createdAt));
  if (new Set(note.reviews.map(r => r.reviewerId)).size !== note.reviews.length) throw new Error('Duplicate independent reviewer.');
  // Preserve exact source text and audit metadata after validating the active fields.
  return raw;
}

if (command === 'migrate') {
  const sources = [...(await all('grammarNotes')).map(row => ({ collection: 'grammarNotes', row })),
    ...(await all('kasemSentences')).filter(row => row.projectionVersion !== 2).map(row => ({ collection: 'kasemSentences', row }))];
  let candidates = 0, skipped = 0, failed = 0;
  for (const { collection, row } of sources) {
    const id = collection === 'grammarNotes' ? row.id : 'legacy-' + hash(row.id).slice(0, 24);
    if ((await db.collection('kasemEvidence').doc(id).get()).exists) { skipped++; continue; }
    let note;
    try { note = migrateLegacy(id, row, now); } catch { failed++; continue; }
    candidates++;
    if (flag('commit')) await db.runTransaction(async tx => {
      const target = db.collection('kasemEvidence').doc(id), source = db.collection(collection).doc(row.id);
      const [existing, current] = await Promise.all([tx.get(target), tx.get(source)]);
      if (existing.exists) return;
      if (!current.exists || hash(stableStringify({ ...current.data(), id: row.id })) !== hash(stableStringify(row))) throw new Error('A legacy record changed during migration. Rerun the inventory.');
      tx.create(target, note); tx.create(target.collection('revisions').doc('1'), { ...note, legacySource: { collection, id: row.id }, originalRecord: row });
      tx.set(db.collection('grammarNotes').doc(id), queueProjection(note));
    });
  }
  console.log(JSON.stringify({ mode: flag('commit') ? 'committed' : 'dry-run', candidates, skipped, failed }));
  if (failed) process.exitCode = 1;
} else if (command === 'verify') {
  const manifest = JSON.parse(readFileSync(arg('manifest'), 'utf8'));
  if (!releaseSchema(manifest)) throw new Error('Invalid release manifest: ' + ajv.errorsText(releaseSchema.errors));
  for (const [name, file] of Object.entries(manifest.files)) {
    if (basename(name) !== name || !name.endsWith('.jsonl')) throw new Error('Invalid release file name.');
    if (hash(readFileSync(join(dirname(resolve(arg('manifest'))), name), 'utf8')) !== file.sha256) throw new Error('Release file checksum mismatch: ' + name);
  }
  const release = await db.collection('kasemDatasetReleases').doc(manifest.releaseId).get();
  if (!release.exists || release.get('manifestHash') !== hash(stableStringify(manifest)) || release.get('status') !== 'ready') throw new Error('This is not a registered ready release.');
  const failures = [];
  for (const item of manifest.claimLineage) {
    const claim = (await db.collection('grammarClaims').doc(item.claimId).get()).data();
    if (!claim || claim.status !== 'supported' || claim.version !== item.version || hash(stableStringify(claim)) !== item.contentHash) failures.push(item.id);
  }
  for (const item of manifest.lineage) {
    const doc = await db.collection('kasemEvidence').doc(item.noteId).get();
    const n = doc.data();
    if (!n || n.revision !== item.revision || !allowed(n, item.split === 'train' ? 'modelTraining' : 'evaluation', new Date().toISOString())
      || hash(stableStringify(n.permissions)) !== item.permissionHash || evidenceFingerprint(n) !== item.contentHash) failures.push(item.id);
  }
  if (failures.length) {
    if (flag('commit')) await release.ref.update({ status: 'invalidated', invalidatedAt: new Date().toISOString() });
    throw new Error(failures.length + ' release records changed or lost permission. Rebuild the dataset.');
  }
  if (arg('run')) {
    if (!arg('model') || !arg('prompt')) throw new Error('Pin --model and --prompt when registering a run.');
    if (flag('commit')) await db.collection('kasemModelRuns').doc(arg('run')).create({ releaseId: manifest.releaseId,
      model: arg('model'), promptVersion: arg('prompt'), checkedAt: new Date().toISOString(), status: 'preflight-passed' });
  }
  console.log('Release permissions and revisions verified. No model job was started.');
} else if (command === 'blind') {
  const result = blindEvaluation(JSON.parse(readFileSync(arg('input'), 'utf8')), arg('seed') ?? randomUUID());
  const dir = outputDirectory();
  writeFileSync(join(dir, 'reviewer-tasks.json'), stableStringify(result.tasks) + '\n');
  writeFileSync(join(dir, 'private-key.json'), stableStringify(result.key) + '\n');
  console.log('Wrote reviewer tasks and a separate private key. Share only reviewer-tasks.json with reviewers.');
} else if (command === 'evaluate') {
  const rows = JSON.parse(readFileSync(arg('input'), 'utf8'));
  const result = evaluateJudgments(arg('key') ? unblindJudgments(rows, JSON.parse(readFileSync(arg('key'), 'utf8'))) : rows), dir = outputDirectory();
  writeFileSync(join(dir, 'evaluation.json'), stableStringify(result) + '\n');
  console.log('Wrote evaluation metrics to ' + dir);
} else {
  const raw = flag('firestore') ? await all('kasemEvidence') : JSON.parse(readFileSync(arg('input'), 'utf8'));
  if (!Array.isArray(raw)) throw new Error('A snapshot must be an array of attestations.');
  // Missing legacy permissions are reported rather than fabricated by validation.
  const notes = raw.map(n => {
    if (!schema(n)) throw new Error('Invalid evidence snapshot: ' + ajv.errorsText(schema.errors));
    return n.permissions?.version === 'legacy-unrecorded' ? n : validateStored(n);
  });
  if (command === 'report') console.log(JSON.stringify(qualityReport(notes, now), null, 2));
  else {
    if (flag('firestore') && !flag('commit')) throw new Error('Firestore exports require --commit to reserve evaluation examples before writing files. Run report first.');
    const claims = flag('firestore') ? await all('grammarClaims') : arg('claims') ? JSON.parse(readFileSync(arg('claims'), 'utf8')) : [];
    if (!Array.isArray(claims) || claims.some(claim => !claimSchema(claim))) throw new Error('Invalid grammar claim snapshot.');
    const result = buildDataset(notes, { ...DEFAULT_CONFIG, releaseId: arg('release'), asOf: now,
      seed: arg('seed') ?? DEFAULT_CONFIG.seed, trainPercent: Number(arg('train-percent') ?? 80), validationPercent: Number(arg('validation-percent') ?? 10) }, claims);
    const dir = outputDirectory();
    if (flag('firestore')) {
      const release = db.collection('kasemDatasetReleases').doc(result.manifest.releaseId);
      await release.create({ status: 'reserving', manifestHash: hash(stableStringify(result.manifest)), createdAt: now,
        claimIds: result.manifest.claimLineage.map(r => r.claimId),
        noteIds: [...new Set(result.manifest.lineage.map(r => r.noteId))] });
      // Each reservation is transactional and conservative. A failed export
      // leaves reserved examples out of retrieval until a curator resolves it.
      for (const item of result.manifest.reservations) await db.runTransaction(async tx => {
        const ref = db.collection('kasemEvidence').doc(item.noteId), doc = await tx.get(ref);
        if (!doc.exists || doc.get('revision') !== item.revision || evidenceFingerprint(doc.data()) !== item.contentHash) throw new Error('Evidence changed while reserving the release.');
        const note = doc.data();
        if ((note.reservedSplit && note.reservedSplit !== item.split) || (note.datasetSplit && note.datasetSplit !== item.split)) throw new Error('Dataset partition conflict.');
        const partition = { datasetSplit: item.split, reservedSplit: item.split === 'train' ? '' : item.split };
        tx.update(ref, partition);
        // Migrated standalone sentences may not have a review-queue projection.
        tx.set(db.collection('grammarNotes').doc(item.noteId), queueProjection({ ...note, ...partition }));
      });
      // Final permission checks precede export; verify must run again before a job.
      for (const item of result.manifest.claimLineage) {
        const claim = (await db.collection('grammarClaims').doc(item.claimId).get()).data();
        if (!claim || hash(stableStringify(claim)) !== item.contentHash) throw new Error('Grammar claim changed during export.');
      }
      for (const item of result.manifest.lineage) {
        const n = (await db.collection('kasemEvidence').doc(item.noteId).get()).data();
        if (!n || n.revision !== item.revision || evidenceFingerprint(n) !== item.contentHash || !allowed(n, item.split === 'train' ? 'modelTraining' : 'evaluation', new Date().toISOString())) throw new Error('Evidence or permission changed during export.');
      }
      await transitionRelease(release, 'reserving', 'writing');
    }
    for (const [name, content] of Object.entries(result.files)) writeFileSync(join(dir, name), content, { flag: 'wx' });
    writeFileSync(join(dir, 'manifest.json'), stableStringify(result.manifest) + '\n', { flag: 'wx' });
    if (flag('firestore')) await transitionRelease(db.collection('kasemDatasetReleases').doc(result.manifest.releaseId), 'writing', 'ready');
    console.log(JSON.stringify({ directory: dir, release: result.manifest.releaseId, quality: result.manifest.quality, registered: flag('firestore') }));
  }
}

async function transitionRelease(ref, from, to) {
  await db.runTransaction(async tx => {
    const current = await tx.get(ref);
    if (current.get('status') !== from) throw new Error('Release was invalidated during export. Rebuild after reviewing its evidence.');
    tx.update(ref, { status: to });
  });
}
