import { allowed, evidenceFingerprint, exampleQuality, field, hash, independentReviews, MIN_REVIEWERS, object, parseContext, stableStringify, type EvidenceNote, type Purpose } from './kasem-evidence.js';

export type Split = 'train' | 'validation' | 'test';
export interface ReleaseConfig { releaseId: string; asOf: string; seed: string; trainPercent: number; validationPercent: number }
export interface DatasetClaim { id: string; version: number; title: string; summary: string; scope: string; dialect: string; status: string; evidenceRevisions: Record<string, number> }
export const DEFAULT_CONFIG = { seed: 'kasem-v2', trainPercent: 80, validationPercent: 10 };
export function exclusionReasons(note: EvidenceNote, index: number, purpose: Purpose, asOf: string): string[] {
  const reasons: string[] = [], e = note.examples[index], q = exampleQuality(note, index);
  if (note.schemaVersion !== 2) reasons.push('legacy-schema');
  if (!allowed(note, purpose, asOf)) reasons.push('permission-' + purpose);
  if (!q.approved) reasons.push(q.disputed ? 'review-disagreement' : 'needs-independent-review');
  if (e.context.status !== 'specified') reasons.push('context-unspecified');
  if (e.dialect === 'unknown' || !e.dialect) reasons.push('dialect-unknown');
  if (e.sourceType !== 'speaker' && !e.source) reasons.push('source-missing');
  return reasons;
}
export function qualityReport(notes: EvidenceNote[], asOf: string) {
  const exclusions: Record<string, number> = {}, coverage: Record<string, number> = {};
  let examples = 0, eligible = 0, disputed = 0, audio = 0;
  for (const n of notes) for (let i = 0; i < n.examples.length; i++) {
    const e = n.examples[i]; examples++;
    const reasons = exclusionReasons(n, i, 'modelTraining', asOf);
    if (!reasons.length) eligible++;
    if (exampleQuality(n, i).disputed) disputed++;
    if (e.audioPath) audio++;
    for (const reason of reasons) exclusions[reason] = (exclusions[reason] ?? 0) + 1;
    for (const tag of e.constructions.length ? e.constructions : ['untagged']) {
      const key = e.dialect + ' / ' + tag; coverage[key] = (coverage[key] ?? 0) + 1;
    }
  }
  return { notes: notes.length, examples, eligible, disputed, audio, exclusions, coverage };
}

/** Groups survive context changes and alternate translations. Similarity only
 * groups potential leakage; it never validates linguistic equivalence. */
export function evidenceGroups(notes: EvidenceNote[]): Map<string, string> {
  const parent = new Map(notes.map(n => [n.id, n.id]));
  const find = (id: string): string => { const p = parent.get(id)!; if (p === id) return id; const root = find(p); parent.set(id, root); return root; };
  const union = (a: string, b: string) => { a = find(a); b = find(b); if (a !== b) parent.set(a > b ? a : b, a > b ? b : a); };
  const owner = new Map<string, string>();
  const tokenOwners = new Map<string, { id: string; tokens: Set<string> }[]>();
  for (const n of [...notes].sort((a, b) => a.id.localeCompare(b.id))) {
    const keys = [...n.groups];
    for (const e of n.examples) {
      keys.push('surface:' + e.kasem.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim());
      if (e.source) keys.push('source:' + e.source);
      const tokens = new Set(e.english.toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? []);
      const compared = new Set<string>();
      for (const token of tokens) for (const other of tokenOwners.get(token) ?? []) {
        if (compared.has(other.id)) continue; compared.add(other.id);
        const shared = [...tokens].filter(t => other.tokens.has(t)).length;
        if (shared / (tokens.size + other.tokens.size - shared) >= 0.8) union(n.id, other.id);
      }
      for (const token of tokens) tokenOwners.set(token, [...(tokenOwners.get(token) ?? []), { id: n.id, tokens }]);
    }
    for (const key of keys) { const prior = owner.get(key); if (prior) union(n.id, prior); else owner.set(key, n.id); }
  }
  return new Map(notes.map(n => [n.id, hash('group:' + find(n.id)).slice(0, 24)]));
}

/** New variants inherit held-out exclusion before their first dataset release. */
export function heldOutEvidenceIds(notes: EvidenceNote[]): Set<string> {
  const groups = evidenceGroups(notes);
  const reserved = new Set(notes.filter(n => n.reservedSplit || (n.datasetSplit && n.datasetSplit !== 'train')).map(n => groups.get(n.id)));
  return new Set(notes.filter(n => reserved.has(groups.get(n.id))).map(n => n.id));
}

export function buildDataset(notes: EvidenceNote[], config: ReleaseConfig, claims: DatasetClaim[] = []) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(config.releaseId) || !Number.isFinite(Date.parse(config.asOf))) throw new Error('Provide a release ID and ISO snapshot date.');
  if (!Number.isInteger(config.trainPercent) || !Number.isInteger(config.validationPercent) || config.trainPercent < 0 || config.validationPercent < 0 || config.trainPercent + config.validationPercent > 100) throw new Error('Invalid split percentages.');
  if (new Set(notes.map(n => n.id)).size !== notes.length) throw new Error('Duplicate attestation IDs in the snapshot.');
  const groups = evidenceGroups(notes), assignments: Record<string, Split> = {};
  for (const group of groups.values()) {
    const bucket = Number.parseInt(hash(config.seed + ':' + group).slice(0, 8), 16) % 100;
    assignments[group] = bucket < config.trainPercent ? 'train' : bucket < config.trainPercent + config.validationPercent ? 'validation' : 'test';
  }
  // A prior release fixes the partition, including training. New related notes
  // inherit it; a bridge between already separate partitions blocks the release.
  for (const n of notes) if (n.datasetSplit || n.reservedSplit) {
    const group = groups.get(n.id)!;
    const split = n.datasetSplit || n.reservedSplit;
    const conflicting = notes.some(other => groups.get(other.id) === group &&
      ((other.datasetSplit && other.datasetSplit !== split) || (other.reservedSplit && other.reservedSplit !== split)));
    if (conflicting) throw new Error('A connected evidence group has conflicting split reservations.');
    assignments[group] = split as Split;
  }
  const files: Record<string, Record<string, unknown>[]> = {};
  for (const split of ['train', 'validation', 'test']) for (const kind of ['translation', 'preference', 'grammar', 'evaluation']) files[split + '-' + kind + '.jsonl'] = [];
  const lineage: Record<string, unknown>[] = [], exclusions: { id: string; index: number; reasons: string[] }[] = [];
  const seen = new Set<string>();
  for (const n of [...notes].sort((a, b) => a.id.localeCompare(b.id))) {
    const group = groups.get(n.id)!, split = assignments[group], purpose: Purpose = split === 'train' ? 'modelTraining' : 'evaluation';
    for (let i = 0; i < n.examples.length; i++) {
      const e = n.examples[i], reasons = exclusionReasons(n, i, purpose, config.asOf);
      if (reasons.length) { exclusions.push({ id: n.id, index: i, reasons }); continue; }
      const input = { english: e.english, context: e.context, dialect: e.dialect };
      const fingerprint = hash(stableStringify({ input, kasem: e.kasem }));
      if (seen.has(fingerprint)) { exclusions.push({ id: n.id, index: i, reasons: ['duplicate-target'] }); continue; }
      seen.add(fingerprint);
      const id = hash(n.id + ':' + n.revision + ':' + i).slice(0, 24);
      files[split + '-translation.jsonl'].push({ id, input, target: e.kasem });
      if (split !== 'train') files[split + '-evaluation.jsonl'].push({ id, input, acceptedTargets: [e.kasem], dimensions: ['meaning', 'grammar', 'naturalness', 'contextFit'] });
      const q = exampleQuality(n, i);
      if (q.annotationsApproved && e.annotations.length && e.annotations.every(a => a.kind !== 'unknown' && a.hypotheses.length === 0)) {
        files[split + '-grammar.jsonl'].push({ id, input: { kasem: e.kasem, context: e.context, dialect: e.dialect }, annotations: e.annotations });
      }
      lineage.push({ id, noteId: n.id, revision: n.revision, example: i, group, split,
        sourceType: e.sourceType, sourceHash: hash(e.source), permissionHash: hash(stableStringify(n.permissions)),
        contentHash: evidenceFingerprint(n), annotationApproved: q.annotationsApproved });
    }
    if (n.mode === 'comparison' && n.examples.length === 2 && allowed(n, purpose, config.asOf)) {
      const reviews = independentReviews(n), choices = reviews.map(r => r.preference).filter(p => p !== 'cannot-judge');
      const choice = choices[0];
      if (choices.length >= MIN_REVIEWERS && (choice === 'first' || choice === 'second') && choices.every(c => c === choice)) {
        const preferred = choice === 'first' ? 0 : 1, other = 1 - preferred;
        const reasons = exclusionReasons(n, preferred, purpose, config.asOf);
        // Candidates must express the same intended content in the same context.
        const a = n.examples[preferred], b = n.examples[other];
        if (!reasons.length && a.english === b.english && a.dialect === b.dialect && stableStringify(a.context) === stableStringify(b.context)) {
          const pairId = hash(n.id + ':' + n.revision + ':pair').slice(0, 24);
          files[split + '-preference.jsonl'].push({ id: pairId,
            input: { english: a.english, context: a.context, dialect: a.dialect }, chosen: a.kasem, rejected: b.kasem });
          // Pair provenance survives translation deduplication. Both candidates
          // belong to this immutable note revision and share its permissions.
          lineage.push({ id: pairId, noteId: n.id, revision: n.revision, example: preferred, group, split,
            sourceType: a.sourceType, sourceHash: hash(a.source), permissionHash: hash(stableStringify(n.permissions)),
            contentHash: evidenceFingerprint(n), annotationApproved: false });
        }
      }
    }
  }
  const claimLineage: { id: string; claimId: string; version: number; contentHash: string }[] = [];
  for (const claim of [...claims].sort((a, b) => a.id.localeCompare(b.id))) {
    if (claim.status !== 'supported') continue;
    const support = Object.entries(claim.evidenceRevisions).map(([id, revision]) => notes.find(n => n.id === id && n.revision === revision));
    const partitions = new Set(support.filter((n): n is EvidenceNote => !!n).map(n => assignments[groups.get(n.id)!]));
    const split = [...partitions][0], purpose: Purpose = split === 'train' ? 'modelTraining' : 'evaluation';
    const valid = support.length > 0 && partitions.size === 1 && support.every(n => n && n.examples.some((e, i) => e.dialect === claim.dialect && !exclusionReasons(n, i, purpose, config.asOf).length));
    if (!valid) { exclusions.push({ id: claim.id, index: 0, reasons: ['claim-evidence-ineligible-or-crosses-partitions'] }); continue; }
    const id = hash('claim:' + claim.id + ':' + claim.version).slice(0, 24);
    files[split + '-grammar.jsonl'].push({ id, input: { dialect: claim.dialect, scope: claim.scope }, claim: { title: claim.title, summary: claim.summary, scope: claim.scope } });
    claimLineage.push({ id, claimId: claim.id, version: claim.version, contentHash: hash(stableStringify(claim)) });
    for (const n of support as EvidenceNote[]) {
      const index = n.examples.findIndex((e, i) => e.dialect === claim.dialect && !exclusionReasons(n, i, purpose, config.asOf).length), e = n.examples[index];
      lineage.push({ id, noteId: n.id, revision: n.revision, example: index, group: groups.get(n.id)!, split, sourceType: e.sourceType,
        sourceHash: hash(e.source), permissionHash: hash(stableStringify(n.permissions)), contentHash: evidenceFingerprint(n), annotationApproved: false });
    }
  }
  // Several reviewed natural variants can answer the same contextual item.
  for (const split of ['validation', 'test']) {
    const variants = new Map<string, Record<string, unknown>>();
    for (const row of files[split + '-evaluation.jsonl']) {
      const key = stableStringify(row.input), prior = variants.get(key);
      if (prior) prior.acceptedTargets = [...new Set([...(prior.acceptedTargets as string[]), ...(row.acceptedTargets as string[])])].sort();
      else variants.set(key, row);
    }
    files[split + '-evaluation.jsonl'] = [...variants.values()];
  }
  const serialized: Record<string, string> = {};
  for (const [name, rows] of Object.entries(files)) serialized[name] = rows.map(stableStringify).join('\n') + (rows.length ? '\n' : '');
  const manifest = { schemaVersion: 2, exporterVersion: '2.0.0', ...config, snapshotHash: hash(stableStringify([...notes].sort((a, b) => a.id.localeCompare(b.id)))),
    files: Object.fromEntries(Object.entries(serialized).map(([name, content]) => [name, { sha256: hash(content), rows: files[name].length }])),
    assignments, lineage, claimLineage, exclusions, quality: qualityReport(notes, config.asOf),
    reservations: [...notes].sort((a, b) => a.id.localeCompare(b.id)).map(n => ({ noteId: n.id, revision: n.revision, split: assignments[groups.get(n.id)!], contentHash: evidenceFingerprint(n) })) };
  return { files: serialized, manifest };
}

export interface EvaluationJudgment { id: string; variant: string; reviewer: string; dialect: string; construction: string; meaning: boolean; grammar: boolean; naturalness: boolean; contextFit: boolean; appropriateAbstention: boolean }
export function blindEvaluation(raw: unknown, seed: string) {
  if (!Array.isArray(raw) || !raw.length) throw new Error('Provide model predictions as an array.');
  const seen = new Set<string>();
  const rows = raw.map(value => {
    const row = object(value), input = object(row.input);
    const id = field(row.id, 'Evaluation item ID', 150, true), variant = field(row.variant, 'Model variant', 150, true);
    const identity = stableStringify([id, variant]);
    if (seen.has(identity)) throw new Error('Duplicate prediction for an item and variant.'); seen.add(identity);
    const taskId = hash(seed + ':' + identity).slice(0, 32);
    const dialect = field(input.dialect, 'Dialect', 60, true), construction = field(row.construction, 'Construction', 100) || 'untagged';
    return { task: { taskId, input: { english: field(input.english, 'English', 240, true), dialect, context: parseContext(input.context) },
      response: field(row.response, 'Model response', 8000, true) }, key: { taskId, id, variant, dialect, construction } };
  }).sort((a, b) => a.task.taskId.localeCompare(b.task.taskId));
  return { tasks: rows.map(r => r.task), key: rows.map(r => r.key) };
}

export function unblindJudgments(raw: unknown, rawKey: unknown): EvaluationJudgment[] {
  if (!Array.isArray(raw) || !Array.isArray(rawKey)) throw new Error('Provide blinded judgments and their private key.');
  const keys = new Map(rawKey.map(value => { const k = object(value); return [k.taskId, k]; }));
  if (keys.size !== rawKey.length) throw new Error('Duplicate blinded task key.');
  return raw.map(value => {
    const row = object(value), key = keys.get(row.taskId);
    if (!key) throw new Error('Unknown blinded evaluation task.');
    return { ...row, id: key.id, variant: key.variant, dialect: key.dialect, construction: key.construction } as unknown as EvaluationJudgment;
  });
}

export function evaluateJudgments(rows: EvaluationJudgment[]) {
  const unique = new Set<string>(), slices: Record<string, { count: number; meaning: number; grammar: number; naturalness: number; contextFit: number; appropriateAbstention: number }> = {};
  for (const row of rows) {
    for (const key of ['id', 'variant', 'reviewer', 'dialect', 'construction'] as const) field(row[key], key, 150, true);
    const key = row.id + ':' + row.variant + ':' + row.reviewer;
    if (unique.has(key)) throw new Error('Duplicate reviewer judgment: ' + key); unique.add(key);
    for (const metric of ['meaning', 'grammar', 'naturalness', 'contextFit', 'appropriateAbstention'] as const) if (typeof row[metric] !== 'boolean') throw new Error('Each evaluation dimension needs an explicit judgment.');
    for (const slice of [row.variant + '/all', row.variant + '/dialect/' + row.dialect, row.variant + '/construction/' + row.construction]) {
      const stats = slices[slice] ??= { count: 0, meaning: 0, grammar: 0, naturalness: 0, contextFit: 0, appropriateAbstention: 0 };
      stats.count++;
      for (const metric of ['meaning', 'grammar', 'naturalness', 'contextFit', 'appropriateAbstention'] as const) stats[metric] += Number(row[metric]);
    }
  }
  return slices;
}
