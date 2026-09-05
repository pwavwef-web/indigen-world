import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { addReview, parseNote, parseReview } from '../../services/functions/lib/kasem-evidence.js';

const prefix = join(tmpdir(), 'kasem-evidence-test-');
const directory = mkdtempSync(prefix), input = join(directory, 'synthetic.json');
const now = '2026-09-05T00:00:00.000Z';
let note = parseNote({ examples: [{ kasem: 'synthetic fixture', english: 'A synthetic sentence.', dialect: 'synthetic', context: { situation: 'A test fixture.' } }],
  permissions: { review: true, sourceConfirmed: true, modelTraining: true, evaluation: true } }, 'test', 'author', now);
const judgment = { meaning: 'faithful', grammar: 'acceptable', naturalness: 'natural', contextFit: 'fits', explanation: '', annotationApproved: false };
for (const uid of ['r1','r2']) note = addReview(note, parseReview({ revision: 1, dialectCompetent: true, judgments: [judgment] }, note, uid, now));
writeFileSync(input, JSON.stringify([note]));
const run = args => execFileSync(process.execPath, ['services/functions/scripts/kasem-dataset.mjs', ...args], { encoding: 'utf8', stdio: 'pipe' });
after(() => {
  // Only the unique directory created by this test is removed.
  if (!resolve(directory).startsWith(resolve(prefix))) throw new Error('Unexpected test cleanup path.');
  rmSync(directory, { recursive: true, force: true });
});
test('the CLI produces private deterministic JSONL, a valid manifest and a quality report', () => {
  const report = JSON.parse(run(['report','--input',input,'--as-of',now]));
  assert.equal(report.eligible, 1);
  const a = join(directory,'release-a'), b = join(directory,'release-b');
  for (const output of [a,b]) run(['export','--input',input,'--output',output,'--release','synthetic','--as-of',now,'--train-percent','100','--validation-percent','0']);
  assert.equal(readFileSync(join(a,'manifest.json'),'utf8'), readFileSync(join(b,'manifest.json'),'utf8'));
  const manifest = JSON.parse(readFileSync(join(a,'manifest.json'),'utf8'));
  const ajv = new Ajv2020({strict:true}); addFormats(ajv);
  const validate = ajv.compile(JSON.parse(readFileSync('packages/contracts/schemas/kasem-dataset-release.schema.json','utf8')));
  assert.equal(validate(manifest), true, JSON.stringify(validate.errors));
  assert.equal(JSON.parse(readFileSync(join(a,'train-translation.jsonl'),'utf8')).target, 'synthetic fixture');
  assert.throws(() => run(['export','--input',input,'--output',a,'--release','synthetic']), /new output directory/);
});
test('the CLI refuses invalid snapshot permissions and repository output for private data', () => {
  const invalid = join(directory,'invalid.json');
  writeFileSync(invalid, JSON.stringify([{...note, permissions: {...note.permissions, modelTraining:'yes'}}]));
  assert.throws(() => run(['report','--input',invalid]), /Invalid evidence snapshot/);
  assert.throws(() => run(['export','--input',input,'--output','data/private-export-must-not-be-created','--release','synthetic']), /outside the repository/);
});

test('the CLI blinds predictions and scores independently supplied judgments', () => {
  const predictions = join(directory, 'predictions.json'), blinded = join(directory, 'blinded');
  writeFileSync(predictions, JSON.stringify([{id:'synthetic-eval',variant:'baseline',input:{english:'Synthetic meaning.',dialect:'synthetic',context:{situation:'Test.'}},response:'Synthetic output.',construction:'focus'}]));
  run(['blind','--input',predictions,'--output',blinded,'--seed','private-test-seed']);
  const tasks = JSON.parse(readFileSync(join(blinded,'reviewer-tasks.json'),'utf8'));
  assert.equal(tasks[0].variant, undefined);
  const judgments = join(directory,'judgments.json'), results = join(directory,'evaluation');
  writeFileSync(judgments,JSON.stringify([{taskId:tasks[0].taskId,reviewer:'r1',meaning:true,grammar:true,naturalness:false,contextFit:true,appropriateAbstention:true}]));
  run(['evaluate','--input',judgments,'--key',join(blinded,'private-key.json'),'--output',results]);
  assert.equal(JSON.parse(readFileSync(join(results,'evaluation.json'),'utf8'))['baseline/all'].naturalness,0);
});
