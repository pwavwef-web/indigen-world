/** Local research packets and reviewed projections; never connects to Firebase or an AI provider. */
import { readFileSync, writeFileSync, mkdirSync, existsSync, realpathSync } from 'node:fs';
import { resolve, relative, dirname, join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { inspectResearchCycle, reviewedResearchProjection } from '../lib/kasem-research-cycle.js';
import { stableStringify } from '../lib/kasem-evidence.js';

const args = process.argv.slice(2), command = args[0] ?? 'help';
const arg = name => { const i = args.indexOf('--' + name); return i < 0 ? undefined : args[i + 1]; };
const flag = name => args.includes('--' + name);
if (command === 'help' || flag('help')) {
  console.log(`Kasem research cycle (run build:functions first)
report --cycle LEDGER.json [--evidence PRIVATE_SNAPSHOT.json] [--as-of ISO]
packet --cycle LEDGER.json --output NEW_PRIVATE_DIR [--evidence PRIVATE_SNAPSHOT.json]
project --cycle LEDGER.json --evidence PRIVATE_SNAPSHOT.json --use display|retrieval|training --output NEW_PRIVATE_DIR
--output must be outside the repository or in data/private; --synthetic allows test-only repository output.
--strict makes report exit nonzero until the full cycle passes.
Unknown rights remain unknown. No command publishes, indexes, emails, contacts contributors, or trains a model.`);
  process.exit(0);
}
if (!['report', 'packet', 'project'].includes(command)) throw new Error('Unknown command. Use --help.');
if (!arg('cycle')) throw new Error('--cycle is required.');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const ajv = new Ajv2020({ allErrors: true, strict: true }); addFormats(ajv);
const validate = (name, value) => {
  const schema = ajv.compile(JSON.parse(readFileSync(join(root, 'packages/contracts/schemas', name + '.schema.json'), 'utf8')));
  if (!schema(value)) throw new Error(`Invalid ${name}: ${ajv.errorsText(schema.errors)}`);
};
const cycle = JSON.parse(readFileSync(arg('cycle'), 'utf8'));
validate('kasem-research-cycle', cycle);
const notes = arg('evidence') ? JSON.parse(readFileSync(arg('evidence'), 'utf8')) : [];
if (!Array.isArray(notes)) throw new Error('Evidence snapshot must be an array.');
const evidenceSchema = ajv.compile(JSON.parse(readFileSync(join(root, 'packages/contracts/schemas/kasem-evidence.schema.json'), 'utf8')));
for (const note of notes) if (!evidenceSchema(note)) throw new Error('Invalid evidence snapshot: ' + ajv.errorsText(evidenceSchema.errors));
// A date is explicit in every artifact; projections default to current time so expiry is rechecked.
const asOf = arg('as-of') ?? new Date().toISOString();
if (!Number.isFinite(Date.parse(asOf))) throw new Error('Invalid --as-of.');
const report = inspectResearchCycle(cycle, notes, asOf);
if (command === 'report') {
  console.log(JSON.stringify(report, null, 2));
  if (flag('strict') && !report.milestone_complete) process.exitCode = 1;
} else {
  let files;
  if (command === 'packet') {
    files = {
      'progress.json': report,
      'speaker-tasks.json': cycle.patterns.map(p => ({ id: p.id, question: p.question,
        instructions: 'Ask each speaker independently. Begin with the situation; record their own wording and explanation before any substitution prompt. Unsure is a valid answer.',
        situations: p.speaker_tasks,
        capture: ['exact utterance', 'natural English explanation', 'community/variety', 'situation', 'speaker relationship', 'separate use permissions', 'session/source ID and locator', 'consented recording if available'] })),
      'reviewer-follow-up.json': cycle.patterns.map(p => ({ id: p.id, forms_to_ask_about_after_open_elicitation: p.follow_up_forms,
        questions: ['Does substitution preserve meaning, change meaning, sound awkward, or depend on context?', 'Can you give a counterexample to the proposed scope?', 'What evidence would resolve the disagreement?'],
        application_behavior: p.application_behavior })),
    };
  } else {
    const use = arg('use');
    if (!['display', 'retrieval', 'training'].includes(use)) throw new Error('--use must be display, retrieval or training.');
    if (use === 'training' && !report.milestone_complete) throw new Error('Finish and evaluate the research cycle before preparing any training projection.');
    files = { 'reviewed-records.json': reviewedResearchProjection(cycle, notes, use, asOf), 'progress.json': report };
  }
  const target = arg('output');
  if (!target) throw new Error('--output is required.');
  const dir = resolve(target);
  if (existsSync(dir)) throw new Error('Use a new output directory.');
  const inside = (parent, child) => { const rel = relative(parent, child); return !rel || (!rel.startsWith('..') && !isAbsolute(rel)); };
  let ancestor = dirname(dir);
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  const actual = resolve(realpathSync(ancestor), relative(ancestor, dir));
  const realRoot = realpathSync(root), privateRoot = join(realRoot, 'data/private');
  if (inside(realRoot, actual) && !inside(privateRoot, actual) && !flag('synthetic')) throw new Error('Private output must be outside the repository or in data/private.');
  if (flag('synthetic') && (!cycle.id.startsWith('synthetic-') || notes.some(n => n.examples.some(e => e.dialect !== 'synthetic')))) throw new Error('--synthetic is for synthetic fixtures only.');
  mkdirSync(dir, { recursive: true });
  for (const [name, value] of Object.entries(files)) writeFileSync(join(dir, name), stableStringify(value) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ directory: dir, files: Object.keys(files), milestone_complete: report.milestone_complete, externally_published: false }));
}
