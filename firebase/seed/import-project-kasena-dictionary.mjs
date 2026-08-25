#!/usr/bin/env node
// Idempotently imports Project Kasena review-pack rows into dictionaryEntries.

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const DEFAULT_DATA = 'firebase/seed/project-kasena-dictionary-data.json';
const DEFAULT_PROJECT = 'project-kassena-7e026';
const WRITE_COLLECTION = 'dictionaryEntries';

function parseArgs(argv) {
  const options = {
    projectId: process.env.GCLOUD_PROJECT || DEFAULT_PROJECT,
    dataPath: DEFAULT_DATA,
    dryRun: false,
    confirmLive: process.env.PROJECT_KASENA_IMPORT === 'confirm',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--project') {
      options.projectId = argv[++index];
    } else if (arg === '--data') {
      options.dataPath = argv[++index];
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--confirm-live') {
      options.confirmLive = true;
    } else if (!arg.startsWith('--') && index === 0) {
      options.projectId = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.projectId) {
    throw new Error('Missing project id. Pass --project <id>.');
  }
  return options;
}

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Import payload must be a JSON object.');
  }
  if (!Array.isArray(payload.dictionaryEntries)) {
    throw new Error('Import payload is missing dictionaryEntries array.');
  }
  const ids = new Set();
  const issues = [];
  for (const entry of payload.dictionaryEntries) {
    if (!entry.id || typeof entry.id !== 'string') {
      issues.push('entry missing string id');
    }
    if (entry.id && ids.has(entry.id)) {
      issues.push(`duplicate id ${entry.id}`);
    }
    ids.add(entry.id);
    if (!entry.kasemText && !entry.headword) {
      issues.push(`${entry.id}: missing Kasem text`);
    }
    if (!entry.englishText && !entry.translation) {
      issues.push(`${entry.id}: missing English translation`);
    }
    if (entry.isPublished !== true) {
      issues.push(`${entry.id}: isPublished must be true for mobile visibility`);
    }
  }
  if (issues.length > 0) {
    throw new Error(`Invalid import payload:\n- ${issues.slice(0, 20).join('\n- ')}`);
  }
}

function initializeFirestore(projectId) {
  const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
  initializeApp(
    emulator
      ? { projectId }
      : { credential: applicationDefault(), projectId },
  );
  return getFirestore();
}

async function commitBatch(batch, state) {
  if (state.pending === 0) return;
  await batch.commit();
  state.total += state.pending;
  state.pending = 0;
}

async function writeEntries(db, payload) {
  const now = new Date().toISOString();
  const state = { pending: 0, total: 0 };
  let batch = db.batch();

  for (const entry of payload.dictionaryEntries) {
    const ref = db.collection(WRITE_COLLECTION).doc(entry.id);
    batch.set(
      ref,
      {
        ...entry,
        importedAt: now,
        lifecycle: {
          ...(entry.lifecycle || {}),
          updatedAt: now,
        },
      },
      { merge: true },
    );
    state.pending += 1;
    if (state.pending === 400) {
      await commitBatch(batch, state);
      batch = db.batch();
    }
  }

  const manifestRef = db.collection('dictionaryImports').doc(payload.importId);
  batch.set(
    manifestRef,
    {
      id: payload.importId,
      sourceDocument: payload.sourceDocument,
      sourceDocumentName: payload.sourceDocumentName,
      generatedAt: payload.generatedAt,
      importedAt: now,
      writeCollection: WRITE_COLLECTION,
      stats: payload.stats,
      entryIds: payload.dictionaryEntries.map((entry) => entry.id),
    },
    { merge: true },
  );
  state.pending += 1;
  await commitBatch(batch, state);
  return state.total;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const dataPath = resolve(options.dataPath);
  const payload = JSON.parse(await readFile(dataPath, 'utf8'));
  validatePayload(payload);

  const stats = payload.stats || {};
  console.log(`Import payload: ${payload.dictionaryEntries.length} dictionary entries`);
  console.log(`Lexical rows: ${stats.lexicalRows ?? 'n/a'}; sentence rows: ${stats.sentenceRows ?? 'n/a'}`);
  console.log(`Sentence examples matched: ${stats.lookedUpExamples ?? 'n/a'}`);
  console.log(`Pending translations: ${stats.pendingTranslations ?? 'n/a'}`);
  console.log(`Target project: ${options.projectId}`);

  if (options.dryRun) {
    const firstIds = payload.dictionaryEntries.slice(0, 5).map((entry) => entry.id).join(', ');
    console.log(`Dry run only. First ids: ${firstIds}`);
    return;
  }

  const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
  if (!emulator && !options.confirmLive) {
    throw new Error(
      'Refusing to write live Firestore without PROJECT_KASENA_IMPORT=confirm or --confirm-live.',
    );
  }

  const db = initializeFirestore(options.projectId);
  const writes = await writeEntries(db, payload);
  console.log(`Wrote ${writes} Firestore documents to ${WRITE_COLLECTION} (+ import manifest).`);
}

main().catch((error) => {
  console.error('Project Kasena dictionary import failed:', error);
  process.exit(1);
});
