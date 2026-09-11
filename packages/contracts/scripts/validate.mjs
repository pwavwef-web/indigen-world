// Validates every synthetic example under ./examples against its entity schema.
// Run with: npm test -w @indigen-world/contracts
//
// This is the emulator-independent contract check referenced by the package
// README: it proves the schemas are well-formed, cross-references resolve, and
// the example fixtures are valid documents.

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const schemasDir = join(root, 'schemas');
const examplesDir = join(root, 'examples');

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

// Register every schema so relative $ref resolution works across files.
const schemaFiles = readdirSync(schemasDir).filter((f) => f.endsWith('.schema.json'));
const idByFile = new Map();
for (const file of schemaFiles) {
  const schema = readJson(join(schemasDir, file));
  ajv.addSchema(schema);
  idByFile.set(file, schema.$id);
}

let failures = 0;
let checked = 0;

const exampleFiles = readdirSync(examplesDir).filter((f) => f.endsWith('.example.json'));
for (const file of exampleFiles) {
  const schemaFile = file.replace(/\.example\.json$/, '.schema.json');
  const id = idByFile.get(schemaFile);
  if (!id) {
    console.error(`✗ ${file}: no matching schema (${schemaFile})`);
    failures += 1;
    continue;
  }
  const validate = ajv.getSchema(id);
  const data = readJson(join(examplesDir, file));
  checked += 1;
  if (validate(data)) {
    console.log(`✓ ${basename(file)}`);
  } else {
    failures += 1;
    console.error(`✗ ${basename(file)}`);
    for (const err of validate.errors ?? []) {
      console.error(`    ${err.instancePath || '/'} ${err.message}`);
    }
  }
}

// The shipped guideline content is written straight into the platform
// configuration document by the seed scripts, so it has to satisfy the same
// schema the document does.
const { creatorGuidelines } = await import('../content/creator-guidelines.mjs');
const guidelineSections = ajv.compile({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  ...readJson(join(schemasDir, 'platform-configuration.schema.json')).properties.guidelines,
});
checked += 1;
if (!Array.isArray(creatorGuidelines) || creatorGuidelines.length === 0) {
  failures += 1;
  console.error('✗ creator-guidelines.mjs: expected a non-empty array of sections');
} else if (guidelineSections(creatorGuidelines)) {
  console.log(`✓ creator-guidelines.mjs (${creatorGuidelines.length} sections)`);
} else {
  failures += 1;
  console.error('✗ creator-guidelines.mjs');
  for (const err of guidelineSections.errors ?? []) {
    console.error(`    ${err.instancePath || '/'} ${err.message}`);
  }
}

console.log(`\n${checked - failures}/${checked} fixtures valid across ${schemaFiles.length} schemas.`);
if (failures > 0) process.exit(1);
