/** Owner-authorized direct publication of this source book, with an idempotent
 * plan and recovery snapshot. Does not change contributor review requirements.
 * node services/functions/scripts/import-kasem-orthography.mjs [--commit]
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync, mkdtempSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const book = JSON.parse(readFileSync(join(root, 'data/orthography-seed/book.json'), 'utf8'));
const rules = JSON.parse(readFileSync(join(root, 'data/orthography-seed/rules.json'), 'utf8'));
const projectId = process.env.GCLOUD_PROJECT || 'project-kassena-7e026';
const commit = process.argv.includes('--commit');
const now = new Date().toISOString();
const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 24);
const norm = value => String(value ?? '').normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');

export function validateBook(payload, spellingRules) {
  if (payload.importId !== 'bgl-kasem-orthography-1997' || payload.vocabularyRowCount !== 646) throw new Error('Unexpected book or incomplete vocabulary extraction');
  if (!Array.isArray(spellingRules) || spellingRules.length !== 28) throw new Error('Incomplete spelling rules');
  const ids = new Set();
  for (const entry of payload.entries) {
    if (!entry.id || !entry.headword || !entry.translation || !entry.sourceRefs.length || ids.has(entry.id)) throw new Error('Invalid or duplicate source entry');
    if (/[ɩʋəɣɑ]/u.test(entry.headword)) throw new Error(`IPA character in written headword: ${entry.id}`);
    ids.add(entry.id);
  }
}

async function main() {
  validateBook(book, rules);
  let privateCredentialDirectory;
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.FIRESTORE_EMULATOR_HOST) {
    const require = createRequire(import.meta.url);
    const { configstore } = require('firebase-tools/lib/configstore.js');
    const { clientId, clientSecret } = require('firebase-tools/lib/api.js');
    const refresh = configstore.get('tokens')?.refresh_token;
    if (!refresh) throw new Error('Firebase login is required');
    privateCredentialDirectory = mkdtempSync(join(tmpdir(), 'kasem-book-adc-'));
    const file = join(privateCredentialDirectory, 'credentials.json');
    writeFileSync(file, JSON.stringify({ type: 'authorized_user', client_id: clientId(), client_secret: clientSecret(), refresh_token: refresh }), { mode: 0o600 });
    process.env.GOOGLE_APPLICATION_CREDENTIALS = file;
  }
  try {
    initializeApp({ projectId, ...(process.env.FIRESTORE_EMULATOR_HOST ? {} : { credential: applicationDefault() }) });
    const db = getFirestore();
    const dictionary = await db.collection('dictionaryEntries').get();
    const expressions = await db.collection('expressionEntries').get();
    const existing = new Map([...dictionary.docs, ...expressions.docs].map(doc => [norm(doc.get('kasemText') || doc.get('headword')) + '|' + norm(doc.get('englishText') || doc.get('translation')), doc]));
    const plan = [];
    for (const entry of book.entries) {
      const phrase = /\s/.test(entry.headword);
      const collection = phrase ? 'expressionEntries' : 'dictionaryEntries';
      const matched = existing.get(norm(entry.headword) + '|' + norm(entry.translation));
      const ref = matched?.ref ?? db.collection(collection).doc(entry.id);
      const data = {
        headword: entry.headword, kasemText: entry.headword, englishText: entry.translation, translation: entry.translation,
        partOfSpeech: entry.partOfSpeech, dialect: book.dialect, isPublished: true, publicationEligible: true,
        publicationMode: 'owner-direct-source', importBatch: book.importId,
        sourceDocumentName: book.sourceDocumentName, sourceSha256: book.sourceSha256,
        sourceRefs: entry.sourceRefs, sourceForm: entry.sourceForm, attribution: book.attribution,
        culturalNote: entry.note, sourceUsage: entry.translation,
        alternateKasemTerms: entry.alternateForms.join(', '), translations: [entry.headword, ...entry.alternateForms],
        isSynthetic: false, isSentencePair: false, needsValidation: false,
        // Source publication is not a fabricated speaker/expert authentication.
        validationStatus: 'source_attested', authenticationStatus: 'source_attested',
        ...(phrase ? { contentKind: 'expression', collectionKind: 'expressions', lexicalKind: 'phrase', expressionKind: 'phrase', phrase: entry.headword, english: entry.translation, meaning: entry.translation } : { contentKind: 'word', lexicalKind: 'word' }),
        updatedAt: now,
      };
      plan.push({ ref, data: matched ? {
        isPublished: true, sourceAttestations: FieldValue.arrayUnion({ importId: book.importId, sourceRefs: entry.sourceRefs, sourceForm: entry.sourceForm }), updatedAt: now,
      } : data });
    }
    for (const rule of rules) {
      const examples = (rule.examples || []).map(([kasem, english]) => ({ kasem, english, note: '' }));
      const id = 'bgl97-' + rule.key;
      plan.push({ ref: db.collection('grammarRules').doc(id), data: {
        id, topic: rule.topic, title: rule.title, summary: rule.summary, pattern: '', note: rule.note || '',
        examples, englishTriggers: rule.triggers, status: 'published', claimStatus: 'supported',
        dialect: book.dialect, version: 1, schemaVersion: 2, importId: book.importId,
        publicationMode: 'owner-direct-source', attribution: book.attribution, sourceRefs: ['PDF pages ' + rule.pages], updatedAt: now,
      } });
    }
    // Correct the earlier blanket statement that determiners are never words.
    const determiner = rules.find(rule => rule.key === 'definiteness');
    plan.push({ ref: db.collection('grammarRules').doc('definiteness'), data: {
      topic: 'definiteness', title: determiner.title, summary: determiner.summary,
      pattern: '<full noun> <separate determiner>', note: 'Source-based correction from BGL 1997, page 21.',
      examples: determiner.examples.map(([kasem, english]) => ({ kasem, english, note: '' })),
      englishTriggers: determiner.triggers, status: 'published', claimStatus: 'supported', sourceRefs: ['BGL 1997, page 21'], updatedAt: now,
    } });
    const examples = [...book.examples, ...rules.flatMap(rule => (rule.examples || []).map(([kasem, english]) => ({kasem, english, section:rule.title, sourceRef:'PDF pages ' + rule.pages})))];
    const unique = new Map(examples.map(example => [norm(example.kasem)+'|'+norm(example.english), example]));
    for (const [key, example] of unique) {
      const id = 'bgl97-example-' + hash(key);
      // Ambiguous or untranslated examples remain in the public spelling guide,
      // but cannot become exact translation answers for Kawuri.
      if (!example.english || example.note?.includes('ambiguous')) continue;
      plan.push({ ref: db.collection('kasemSentences').doc(id), data: {
        id, ...example, status: 'confirmed', schemaVersion: 2, projectionVersion: 2,
        publicationMode: 'owner-direct-source', importId: book.importId,
        attribution: book.attribution, dialect: book.dialect, confirmations: 0,
        literal: '', gloss: [], constructions: [], note: 'Printed source example; directly published by owner request. No independent speaker review or word-for-word gloss is claimed.',
        providerRetrieval: true, expiresAtMillis: null, updatedAt: now,
      } });
    }
    const counts = Object.fromEntries(['dictionaryEntries','expressionEntries','grammarRules','kasemSentences'].map(name => [name, plan.filter(p => p.ref.parent.id === name).length]));
    console.log(JSON.stringify({ projectId, commit, vocabularyRows: book.vocabularyRowCount, counts, matchingExisting: plan.filter(p=>p.data.sourceAttestations).length }, null, 2));
    if (!commit) return;
    // Read all destinations before writing, retaining documents for recovery.
    const before = [];
    for (let offset=0;offset<plan.length;offset+=200) {
      const snapshots = await db.getAll(...plan.slice(offset,offset+200).map(p=>p.ref));
      snapshots.forEach(doc => before.push({ path: doc.ref.path, exists: doc.exists, data: doc.data() ?? null }));
    }
    const backup = join(root, 'production-backups', 'kasem-orthography', now.replace(/[:.]/g,'-') + '.json');
    mkdirSync(resolve(backup,'..'),{recursive:true}); writeFileSync(backup,JSON.stringify(before,null,2));
    const manifestRef = db.collection('dictionaryImports').doc(book.importId);
    await manifestRef.set({ publicationMode:'owner-direct-source', status:'importing', sourceSha256:book.sourceSha256, startedAt:now, providerRetrieval:false },{merge:true});
    for (let offset=0;offset<plan.length;offset+=350) {
      const batch=db.batch(); plan.slice(offset,offset+350).forEach(p=>batch.set(p.ref,p.data,{merge:true})); await batch.commit();
    }
    await manifestRef.set({ status:'published', publicationMode:'owner-direct-source', sourceDocumentName:book.sourceDocumentName,
      sourceSha256:book.sourceSha256, attribution:book.attribution, counts, vocabularyRows:book.vocabularyRowCount,
      providerRetrieval:true, modelTraining:false, authorization:'User explicitly requested direct automatic publication of the supplied book without review, 2026-10-08.',
      licence:'BGL 1997 copyright retained; no open licence or model-training permission asserted.', publishedAt:now, sourceIssues:book.sourceIssues },{merge:true});
    const verified=[];
    for(let offset=0;offset<plan.length;offset+=200) verified.push(...await db.getAll(...plan.slice(offset,offset+200).map(p=>p.ref)));
    if(verified.some(doc=>!doc.exists || (doc.ref.parent.id==='grammarRules' ? doc.get('status')!=='published' : doc.ref.parent.id==='kasemSentences' ? doc.get('status')!=='confirmed' : doc.get('isPublished')!==true))) throw new Error('Post-import verification failed');
    console.log(`Published and verified ${plan.length} records. Recovery snapshot: ${backup}`);
  } finally {
    if (privateCredentialDirectory) {
      unlinkSync(join(privateCredentialDirectory,'credentials.json')); rmdirSync(privateCredentialDirectory);
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode=1; });
