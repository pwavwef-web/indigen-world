/** Exact Kasem/English cleanup. Dry-run first; retire duplicates with audit snapshots. */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, mkdtempSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { mergeEntryDocuments } from '../lib/dictionary-edits.js';
import { canonicalPartOfSpeech } from '../lib/lexical-kinds.js';
import { parseSenses, storableSenses } from '../lib/lexical-senses.js';

export const normalize = value => typeof value === 'string'
  ? value.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase() : '';

export function duplicateKey(data) {
  const kasem = normalize(data.kasemText || data.headword);
  const english = normalize(data.englishText || data.translation);
  return kasem && english ? JSON.stringify([kasem, english]) : null;
}

function timestamp(value) {
  if (value?.toMillis) return value.toMillis();
  if (typeof value?._seconds === 'number') return value._seconds * 1000;
  const date = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(date) ? date : Number.MAX_SAFE_INTEGER;
}

function knownClass(data) {
  const part = canonicalPartOfSpeech(data.partOfSpeech);
  return part && !['unknown', 'other'].includes(part) ? part : null;
}

/** Keep an existing published identity, then the oldest known identity. */
export function planDuplicates(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (row.data.mergedInto) continue;
    const key = duplicateKey(row.data);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups].filter(([, group]) => group.length > 1).map(([key, group]) => {
    group.sort((a, b) => Number(b.data.isPublished === true) - Number(a.data.isPublished === true)
      || timestamp(a.data.createdAt) - timestamp(b.data.createdAt)
      || Number(Boolean(knownClass(b.data))) - Number(Boolean(knownClass(a.data)))
      || Number(Boolean(b.data.audioUrl)) - Number(Boolean(a.data.audioUrl))
      || a.id.localeCompare(b.id));
    return { key, targetId: group[0].id, sourceIds: group.slice(1).map(row => row.id) };
  }).sort((a, b) => a.key.localeCompare(b.key));
}

function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
  return JSON.stringify(typeof value === 'string' && !/^https?:\/\//i.test(value) ? normalize(value) : value);
}

function union(...lists) {
  const values = new Map();
  for (const value of lists.flatMap(list => Array.isArray(list) ? list : [])) {
    if (value == null || (typeof value === 'string' && !value.trim())) continue;
    const key = stable(value);
    if (!values.has(key)) values.set(key, value);
  }
  return [...values.values()];
}

/** Same-definition senses retain examples and references from both entries. */
function mergeSenses(target, source) {
  const senses = new Map();
  for (const entry of [target, source]) {
    const raw = Array.isArray(entry.senses) ? [...entry.senses] : [];
    if (normalize(entry.kasemExample) || normalize(entry.englishExample)) {
      raw.push({ definition: entry.englishText || entry.translation,
        examples: [{ kasem: entry.kasemExample || '', english: entry.englishExample || '' }] });
    }
    for (const sense of raw) {
      const key = normalize(sense?.definition);
      if (!key) continue;
      const existing = senses.get(key) || { definition: sense.definition };
      const result = { ...existing };
      for (const [field, value] of Object.entries(sense)) {
        if (Array.isArray(value)) result[field] = union(existing[field], value);
        else if (!result[field] && value) result[field] = value;
      }
      senses.set(key, result);
    }
  }
  const combined = [...senses.values()];
  if (!combined.length) return null;
  const parsed = storableSenses(parseSenses(combined));
  // Stop before retiring anything if the normal contract would truncate details.
  if (parsed.length !== combined.length) throw new Error('Sense limit would lose data; manual merge required.');
  for (let i = 0; i < parsed.length; i++) {
    for (const field of ['definition', 'kasemDefinition', 'usageNote']) {
      if (combined[i][field] && normalize(parsed[i][field]) !== normalize(combined[i][field])) {
        throw new Error(`Sense ${field} would lose data; manual merge required.`);
      }
    }
    for (const field of ['examples', 'synonyms', 'antonyms']) {
      if (combined[i][field] && stable(parsed[i][field] || []) !== stable(combined[i][field])) {
        throw new Error(`Sense ${field} would lose data; manual merge required.`);
      }
    }
  }
  return parsed;
}

export function mergeExactDuplicates(target, source) {
  const key = duplicateKey(target);
  if (!key || key !== duplicateKey(source)) throw new Error('Kasem and English must both match exactly.');
  if (target.mergedInto || source.mergedInto) throw new Error('Cannot merge a retired entry.');
  const { update } = mergeEntryDocuments({ target, source });
  // The cleanup unions source evidence too; interactive merges only cover content.
  for (const field of ['translations', 'englishTranslations', 'alsoUsedAs', 'sourceRefs',
    'sourceAttestations', 'tags', 'usage', 'pronunciationAudioVariants']) {
    const merged = union(target[field], source[field]);
    if (merged.length && (field in update || stable(target[field] || []) !== stable(merged))) update[field] = merged;
  }
  const targetClass = knownClass(target), sourceClass = knownClass(source);
  if (!targetClass && sourceClass) {
    update.partOfSpeech = source.partOfSpeech;
    update.partOfSpeechId = sourceClass;
  } else if (targetClass && sourceClass && targetClass !== sourceClass) {
    update.alsoUsedAs = union(update.alsoUsedAs || target.alsoUsedAs, [sourceClass]);
  }
  const alternateTerms = union(...[target, source].map(entry =>
    typeof entry.alternateKasemTerms === 'string' ? entry.alternateKasemTerms.split(',').map(term => term.trim()) : []));
  if (alternateTerms.length && normalize(target.alternateKasemTerms) !== normalize(alternateTerms.join(', '))) {
    update.alternateKasemTerms = alternateTerms.join(', ');
  }
  // An audio URL and its provenance must move together.
  if (!target.audioUrl && source.audioUrl && source.pronunciationAudioProvenance) {
    update.pronunciationAudioProvenance = source.pronunciationAudioProvenance;
  }
  for (const field of ['attribution', 'sourceUrl', 'pronunciation', 'literalTranslation', 'usageContext', 'frenchTranslation']) {
    if (!normalize(target[field]) && normalize(source[field])) update[field] = source[field];
  }
  const senses = mergeSenses(target, source);
  if (senses && stable(target.senses || []) !== stable(senses)) update.senses = senses;
  // Publication, contributor identity, headword and homograph number stay on the target.
  return update;
}

export async function applyDuplicatePlan(db, plan, { report = () => {} } = {}) {
  const results = [];
  for (const group of plan) {
    for (const sourceId of group.sourceIds) {
      const targetRef = db.doc(`dictionaryEntries/${group.targetId}`);
      const sourceRef = db.doc(`dictionaryEntries/${sourceId}`);
      const auditId = 'dictionary_dedupe_' + createHash('sha256').update(JSON.stringify([group.targetId, sourceId])).digest('hex').slice(0, 32);
      const result = await db.runTransaction(async tx => {
        const targetSnap = await tx.get(targetRef);
        const sourceSnap = await tx.get(sourceRef);
        if (!targetSnap.exists || !sourceSnap.exists) throw new Error('Planned entry is missing.');
        const target = targetSnap.data(), source = sourceSnap.data();
        if (source.mergedInto?.id === group.targetId) return { targetId: group.targetId, sourceId, alreadyMerged: true };
        if (duplicateKey(target) !== group.key || duplicateKey(source) !== group.key) throw new Error('Entry changed after planning; rerun dry-run.');
        if (source.isPublished === true && target.isPublished !== true) throw new Error('Cannot retire a published source into an unpublished target.');
        const update = mergeExactDuplicates(target, source);
        const now = FieldValue.serverTimestamp();
        const reason = 'Owner-requested cleanup of duplicate entries with the same Kasem and English; preserve source documents and evidence.';
        tx.update(targetRef, { ...update, mergedFrom: FieldValue.arrayUnion({ collection: 'dictionaryEntries', id: sourceId }),
          editReason: reason, editedBy: 'dictionary-cleanup', editedAt: now,
          revisionCount: FieldValue.increment(1), updatedAt: now });
        tx.update(sourceRef, { isPublished: false, mergedInto: { collection: 'dictionaryEntries', id: group.targetId },
          mergedAt: now, mergedBy: 'dictionary-cleanup', mergeReason: reason, updatedAt: now });
        tx.create(db.doc(`auditLogs/${auditId}`), { id: auditId, action: 'dictionary.entry.merge', source: 'dictionary-cleanup',
          target: { collection: 'dictionaryEntries', id: group.targetId }, outcome: 'success',
          before: { target, source }, after: update,
          metadata: { reason, sourceId, disposition: 'retire', duplicateKey: group.key }, occurredAt: new Date().toISOString() });
        return { targetId: group.targetId, sourceId, alreadyMerged: false, wasPublished: source.isPublished === true, changedFields: Object.keys(update) };
      });
      results.push(result);
      report(result);
    }
  }
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const arg = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
  const projectId = arg('--project');
  if (!projectId || projectId.startsWith('--') || args.includes('--help')) {
    console.log('Usage: node services/functions/scripts/deduplicate-dictionary.mjs --project PROJECT [--firebase-login] [--apply]');
    return;
  }
  if (process.env.FIRESTORE_EMULATOR_HOST && !projectId.startsWith('demo-')) throw new Error('Live project cannot target an emulator.');
  let temporary;
  if (args.includes('--firebase-login') && !process.env.FIRESTORE_EMULATOR_HOST) {
    const require = createRequire(import.meta.url);
    const { configstore } = require('firebase-tools/lib/configstore.js');
    const { clientId, clientSecret } = require('firebase-tools/lib/api.js');
    const refresh = configstore.get('tokens')?.refresh_token;
    if (!refresh) throw new Error('No Firebase CLI login.');
    temporary = mkdtempSync(join(tmpdir(), 'dictionary-cleanup-adc-'));
    const credentialFile = join(temporary, 'credentials.json');
    writeFileSync(credentialFile, JSON.stringify({ type: 'authorized_user', client_id: clientId(), client_secret: clientSecret(), refresh_token: refresh }), { mode: 0o600 });
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialFile;
  }
  let db;
  try {
    initializeApp({ projectId, ...(process.env.FIRESTORE_EMULATOR_HOST ? {} : { credential: applicationDefault() }) });
    db = getFirestore();
    const snapshot = await db.collection('dictionaryEntries').get();
    const rows = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
    const plan = planDuplicates(rows);
    const byId = new Map(rows.map(row => [row.id, row.data]));
    // Exercise all content merges before making any live change.
    for (const group of plan) {
      let target = byId.get(group.targetId);
      for (const sourceId of group.sourceIds) target = { ...target, ...mergeExactDuplicates(target, byId.get(sourceId)) };
    }
    const directory = resolve('data/private/dictionary-cleanup', new Date().toISOString().replace(/[:.]/g, '-'));
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'before.json'), JSON.stringify({ projectId, capturedAt: new Date().toISOString(), rows }, null, 2));
    writeFileSync(join(directory, 'plan.json'), JSON.stringify(plan, null, 2));
    console.log(JSON.stringify({ mode: args.includes('--apply') ? 'apply' : 'dry-run', projectId, scanned: rows.length,
      duplicateGroups: plan.length, redundantEntries: plan.reduce((count, group) => count + group.sourceIds.length, 0), backup: directory }));
    if (!args.includes('--apply')) return;
    const results = await applyDuplicatePlan(db, plan, { report: result => console.log(JSON.stringify(result)) });
    const after = await db.collection('dictionaryEntries').get();
    const afterRows = after.docs.map(doc => ({ id: doc.id, data: doc.data() }));
    const remaining = planDuplicates(afterRows);
    const verification = { projectId, completedAt: new Date().toISOString(), merged: results.filter(r => !r.alreadyMerged).length,
      retiredPublished: results.filter(r => !r.alreadyMerged && r.wasPublished).length,
      publishedBefore: rows.filter(r => r.data.isPublished === true).length,
      publishedAfter: afterRows.filter(r => r.data.isPublished === true).length, remainingDuplicateGroups: remaining.length, results };
    writeFileSync(join(directory, 'after.json'), JSON.stringify({ rows: afterRows }, null, 2));
    writeFileSync(join(directory, 'verification.json'), JSON.stringify(verification, null, 2));
    console.log(JSON.stringify({ ...verification, results: undefined }));
    if (remaining.length) throw new Error('Duplicates remain; see verification snapshot.');
  } finally {
    if (db) await db.terminate();
    if (temporary) { unlinkSync(join(temporary, 'credentials.json')); rmdirSync(temporary); }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
