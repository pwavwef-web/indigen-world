/** Offline research ledger. A readiness report is not a publication or an audit of live Kawuri. */
import { allowed, evidenceFingerprint, exampleQuality, hash, stableStringify, type EvidenceNote, type Purpose } from './kasem-evidence.js';
import { heldOutEvidenceIds, exclusionReasons } from './kasem-dataset.js';

type Permission = 'unknown' | 'allowed' | 'denied';
type Use = 'display' | 'retrieval' | 'training';
type Status = 'candidate' | 'submitted' | 'curated' | 'reviewed' | 'approved' | 'disputed' | 'rejected' | 'superseded';
export interface ResearchEvidence {
  source_id: string; locator: string;
  evidence_type: 'publication' | 'speaker_example' | 'speaker_judgement';
  transcription_status: 'unchecked' | 'scan_checked' | 'editable_checked' | 'speaker_checked';
  checked_by: string | null; checked_at: string | null;
  note_id: string | null; note_revision: number | null; example_index: number | null;
}
export interface ResearchRecord {
  id: string; type: 'lexeme' | 'sense' | 'construction' | 'example' | 'question';
  pattern_id: string; original_text: string; reviewed_text: string | null;
  meaning_in_context: string | null; literal_gloss: string | null;
  grammatical_features: Record<string, unknown>;
  usage_context: { situation: string | null; speaker_relationship: string | null; community_or_variety: string | null; register: string | null };
  related_record_ids: string[]; support_record_ids: string[];
  evidence: ResearchEvidence[]; review_status: Status;
  review_history: { from: Status; to: Status; actor: string; role: 'curator' | 'qualified_language_reviewer';
    date: string; version: number; scope: string; evidence_source_ids: string[]; uses: Use[]; decision: string }[];
  unresolved_questions: string[]; audio_id: string | null;
  permissions: Record<Use, Permission>; origin: 'human' | 'publication' | 'AI_candidate'; version: number;
  scope: string | null; hypothesis: string | null; next_speaker_task: string | null; resolution: string | null;
}
export interface ResearchCycle {
  schema_version: 1; id: string; version: number; as_of: string;
  targets: { patterns: number; examples_per_pattern: number; evaluation_items: number; rationale: string };
  sources: { id: string; title: string; kind: 'publication' | 'speaker_session';
    permissions: Record<Use, Permission>; access_note: string;
    documentary_representation?: 'editable_copy' | 'scan' | 'publication'; source_sha256?: string }[];
  patterns: { id: string; question_id: string; question: string; speaker_tasks: string[]; follow_up_forms: string[]; application_behavior: string }[];
  records: ResearchRecord[];
  evaluations: { id: string; pattern_id: string;
    category: 'ownership' | 'occupancy' | 'parenthood' | 'person' | 'variant' | 'misleading_prompt' | 'unsupported' | 'source_conflict';
    situation: string; expected_behavior: 'supported_example' | 'clarification' | 'abstention' | 'conflict';
    held_out_record_id: string | null;
    run: { model_version: string; prompt_version: string; date: string; response: string;
      response_kind: 'supported_example' | 'clarification' | 'abstention' | 'conflict';
      grounding_record_ids: string[]; cited_source_ids: string[]; scope: string | null;
      judgments: { reviewer: string; dialect_competent: boolean; meaning: boolean | null; number: boolean | null;
        spelling: boolean | null; context: boolean | null; source_fidelity: boolean | null; useful_uncertainty: boolean | null;
        fabricated_source: boolean; systematic_meaning_confusion: boolean }[] } | null }[];
}

const purpose: Record<Use, Purpose> = { display: 'publication', retrieval: 'providerRetrieval', training: 'modelTraining' };
const transitions: Record<Status, Status[]> = {
  candidate: ['submitted', 'rejected'], submitted: ['curated', 'disputed', 'rejected'],
  curated: ['reviewed', 'disputed', 'rejected'], reviewed: ['approved', 'disputed', 'rejected'],
  approved: ['approved', 'disputed', 'superseded'], disputed: ['curated', 'rejected', 'superseded'],
  rejected: [], superseded: [],
};
const dimensions = ['meaning', 'number', 'spelling', 'context', 'source_fidelity', 'useful_uncertainty'] as const;

/** Caller validates the JSON schema first. Links and current evidence are checked here. */
export function inspectResearchCycle(cycle: ResearchCycle, notes: EvidenceNote[], asOf = cycle.as_of) {
  const issues: { code: string; id: string }[] = [];
  const flags: { code: string; id: string }[] = [];
  const issue = (code: string, id: string) => issues.push({ code, id });
  const records = new Map(cycle.records.map(r => [r.id, r]));
  const sources = new Map(cycle.sources.map(s => [s.id, s]));
  const patterns = new Map(cycle.patterns.map(p => [p.id, p]));
  const noteMap = new Map(notes.map(n => [n.id, n]));
  for (const [rows, label] of [[cycle.records, 'record'], [cycle.sources, 'source'], [cycle.patterns, 'pattern'], [cycle.evaluations, 'evaluation'], [notes, 'note']] as const) {
    const seen = new Set<string>();
    for (const row of rows) { if (seen.has(row.id)) issue('duplicate-' + label + '-id', row.id); seen.add(row.id); }
  }
  if (!Number.isFinite(Date.parse(asOf)) || Date.parse(asOf) < Date.parse(cycle.as_of)) issue('invalid-as-of', cycle.id);
  const heldOut = heldOutEvidenceIds(notes);
  const surfaces = new Map<string, string>();
  const checked = (e: ResearchEvidence) => e.transcription_status !== 'unchecked' && !!e.checked_by && !!e.checked_at
    && Date.parse(e.checked_at) <= Date.parse(asOf)
    && (e.evidence_type === 'publication'
      ? e.transcription_status === 'scan_checked' || (e.transcription_status === 'editable_checked' && sources.get(e.source_id)?.documentary_representation === 'editable_copy')
      : e.transcription_status === 'speaker_checked');
  for (const p of cycle.patterns) {
    const q = records.get(p.question_id);
    if (!q || q.type !== 'question' || q.pattern_id !== p.id) issue('missing-pattern-question', p.id);
  }
  for (const r of cycle.records) {
    if (!patterns.has(r.pattern_id)) issue('broken-pattern-link', r.id);
    for (const id of [...r.related_record_ids, ...r.support_record_ids, ...r.unresolved_questions]) {
      if (!records.has(id)) issue('broken-record-link', r.id + ':' + id);
    }
    for (const id of r.unresolved_questions) if (records.get(id)?.type !== 'question') issue('unresolved-link-not-question', r.id);
    if (r.type === 'question' && (!r.hypothesis || !r.next_speaker_task)) issue('missing-question-action', r.id);
    if (r.type === 'example') {
      const surface = stableStringify([r.original_text.normalize('NFC'), r.meaning_in_context, r.usage_context]);
      const previous = surfaces.get(surface);
      if (previous) flags.push({ code: 'duplicate-or-unicode-equivalent-example-needs-review', id: r.id + ':' + previous });
      else surfaces.set(surface, r.id);
    }
    let state: Status = 'candidate', lastDate = -Infinity, lastVersion = 1;
    for (const h of r.review_history) {
      if (h.from !== state || !transitions[state].includes(h.to)) issue('invalid-status-transition', r.id);
      if (Date.parse(h.date) < lastDate || Date.parse(h.date) > Date.parse(asOf) || h.version < lastVersion || h.version > r.version) issue('invalid-review-sequence', r.id);
      if (!h.scope.trim() || !h.decision.trim() || !h.evidence_source_ids.length || h.evidence_source_ids.some(id => !r.evidence.some(e => e.source_id === id))) issue('review-without-linked-evidence-or-scope', r.id);
      if (h.to === 'approved' && h.role !== 'qualified_language_reviewer') issue('approval-needs-language-reviewer', r.id);
      state = h.to; lastDate = Date.parse(h.date); lastVersion = h.version;
    }
    if (state !== r.review_status) issue('status-history-mismatch', r.id);
    for (const e of r.evidence) {
      const s = sources.get(e.source_id);
      if (!s || (e.evidence_type === 'publication') !== (s.kind === 'publication')) issue('broken-or-wrong-source-link', r.id);
      if (e.transcription_status !== 'unchecked' && !checked(e)) issue('transcription-check-without-valid-attestation', r.id);
      if (e.evidence_type !== 'publication') {
        const n = e.note_id ? noteMap.get(e.note_id) : undefined;
        const example = n && e.example_index !== null ? n.examples[e.example_index] : undefined;
        if (!n || n.revision !== e.note_revision || !example || example.sourceType !== 'speaker') issue('missing-or-stale-speaker-evidence', r.id);
        if (r.type === 'example' && example && r.original_text !== example.originalKasem) issue('original-text-does-not-match-attestation', r.id);
        if (r.type === 'example' && example && r.reviewed_text !== null && r.reviewed_text !== example.kasem) issue('reviewed-example-does-not-match-attestation', r.id);
        if (r.audio_id && example?.audioPath !== r.audio_id) issue('audio-link-mismatch', r.id);
      }
    }
  }
  // Support cycles cannot establish their own authority.
  const cyclic = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string, path: string[]) => {
    if (path.includes(id)) { path.slice(path.indexOf(id)).forEach(x => cyclic.add(x)); return; }
    if (visited.has(id)) return;
    for (const child of records.get(id)?.support_record_ids ?? []) visit(child, [...path, id]);
    visited.add(id);
  };
  for (const id of records.keys()) visit(id, []);
  cyclic.forEach(id => issue('circular-support', id));

  const eligibility: Record<string, Record<Use, string[]>> = {};
  const reasonCache = new Map<string, string[]>();
  const reasons = (r: ResearchRecord, use: Use, path: string[] = []): string[] => {
    if (path.includes(r.id) || cyclic.has(r.id)) return ['circular-support'];
    const cacheKey = r.id + ':' + use, cached = reasonCache.get(cacheKey);
    if (cached) return cached;
    const result: string[] = [];
    if (r.type === 'question') result.push('question-is-not-an-authoritative-answer');
    if (r.review_status !== 'approved') result.push('not-approved');
    if (!r.scope || !r.reviewed_text || !r.meaning_in_context) result.push('missing-reviewed-content-or-scope');
    if (r.unresolved_questions.length) result.push('unresolved-question');
    if (r.permissions[use] !== 'allowed') result.push('record-permission-' + use);
    // Reopening a dispute requires fresh use approvals after the latest review.
    const lastReviewed = r.review_history.map(h => h.to).lastIndexOf('reviewed');
    if (lastReviewed < 0 || r.review_history[lastReviewed].version !== r.version || r.review_history[lastReviewed].scope !== r.scope) result.push('needs-current-scoped-review');
    const approvals = new Set(r.review_history.slice(lastReviewed + 1).filter(h => h.to === 'approved' && h.role === 'qualified_language_reviewer'
      && h.version === r.version && h.scope === r.scope && h.uses.includes(use)).map(h => h.actor));
    if (approvals.size < 2) result.push('needs-two-current-scoped-use-reviews');
    if (!r.evidence.length) result.push('missing-evidence');
    for (const e of r.evidence) {
      if (!checked(e)) result.push('unchecked-transcription');
      if (sources.get(e.source_id)?.permissions[use] !== 'allowed') result.push('source-permission-' + use);
      if (e.evidence_type !== 'publication') {
        const n = e.note_id ? noteMap.get(e.note_id) : undefined;
        if (!n || n.revision !== e.note_revision || e.example_index === null || !n.examples[e.example_index]) result.push('stale-evidence');
        else {
          result.push(...exclusionReasons(n, e.example_index, purpose[use], asOf));
          if (use !== 'display' && heldOut.has(n.id)) result.push('held-out-evidence');
          if (r.audio_id && !allowed(n, 'audio', asOf)) result.push('audio-permission');
        }
      }
    }
    for (const id of r.support_record_ids) {
      const child = records.get(id);
      if (!child || reasons(child, use, [...path, r.id]).length) result.push('ineligible-support:' + id);
    }
    if (issues.some(i => i.id === r.id || i.id.startsWith(r.id + ':'))) result.push('record-integrity-error');
    const unique = [...new Set(result)]; reasonCache.set(cacheKey, unique); return unique;
  };
  for (const r of cycle.records) eligibility[r.id] = { display: reasons(r, 'display'), retrieval: reasons(r, 'retrieval'), training: reasons(r, 'training') };
  const patternProgress = cycle.patterns.map(p => {
    const rows = cycle.records.filter(r => r.pattern_id === p.id);
    const documented = rows.some(r => r.evidence.some(e => e.evidence_type === 'publication' && checked(e)));
    const documentaryChecks = [...new Set(rows.flatMap(r => r.evidence.filter(e => e.evidence_type === 'publication' && checked(e)).map(e => e.transcription_status)))];
    const natural = new Set<string>();
    for (const r of rows.filter(r => r.type === 'example' && !eligibility[r.id].retrieval.length)) {
      for (const e of r.evidence.filter(e => e.evidence_type === 'speaker_example')) natural.add(`${e.note_id}:${e.note_revision}:${e.example_index}`);
    }
    const q = records.get(p.question_id);
    const reconciled = !!q?.resolution && q.review_status === 'reviewed' && q.review_history.some(h => h.to === 'reviewed' && h.version === q.version && h.role === 'qualified_language_reviewer');
    const scopedConstruction = rows.some(r => r.type === 'construction' && r.support_record_ids.some(id => records.get(id)?.type === 'example') && !eligibility[r.id].retrieval.length);
    return { id: p.id, documented, documentary_checks: documentaryChecks, reviewed_natural_examples: natural.size, reconciled, scoped_construction: scopedConstruction,
      ready: documented && reconciled && scopedConstruction && natural.size >= cycle.targets.examples_per_pattern };
  });

  let evaluated = 0, judgedSupported = 0, covered = 0, correct = 0, behaviorCorrect = 0;
  const supported = cycle.evaluations.filter(e => e.expected_behavior === 'supported_example').length;
  const runVersions = new Set<string>();
  const evalEvidence = new Set<string>();
  const evaluationResults: { id: string; pattern_id: string; category: string; status: string; failed_dimensions: string[]; response_kind: string | null }[] = [];
  for (const e of cycle.evaluations) {
    const itemResult = { id: e.id, pattern_id: e.pattern_id, category: e.category, status: 'pending-run', failed_dimensions: [] as string[], response_kind: e.run?.response_kind ?? null };
    evaluationResults.push(itemResult);
    if (!patterns.has(e.pattern_id)) issue('broken-evaluation-pattern', e.id);
    const r = e.held_out_record_id ? records.get(e.held_out_record_id) : undefined;
    const links = r?.evidence.filter(x => x.evidence_type === 'speaker_example') ?? [];
    let heldOutValid = links.length > 0;
    for (const link of links) {
      const n = link.note_id ? noteMap.get(link.note_id) : undefined;
      const key = `${link.note_id}:${link.note_revision}:${link.example_index}`;
      if (evalEvidence.has(key)) issue('duplicate-evaluation-evidence', e.id);
      evalEvidence.add(key);
      if (!n || n.revision !== link.note_revision || link.example_index === null || !n.examples[link.example_index]
        || !['validation', 'test'].includes(n.reservedSplit || n.datasetSplit || '')
        || !exampleQuality(n, link.example_index).approved || !allowed(n, 'evaluation', asOf) || !checked(link)) heldOutValid = false;
    }
    if (r && (r.pattern_id !== e.pattern_id || r.type !== 'example')) heldOutValid = false;
    if (!heldOutValid) issue('evaluation-needs-reviewed-reserved-speaker-example', e.id);
    const run = e.run;
    if (!run) continue;
    itemResult.status = 'needs-independent-judgments';
    runVersions.add(run.model_version + ':' + run.prompt_version);
    if (Date.parse(run.date) > Date.parse(asOf)) issue('future-evaluation-run', e.id);
    for (const id of run.grounding_record_ids) if (!eligibility[id] || eligibility[id].retrieval.length) issue('evaluation-used-ineligible-grounding', e.id);
    const availableSources = new Set(run.grounding_record_ids.flatMap(id => records.get(id)?.evidence.map(x => x.source_id) ?? []));
    if (run.cited_source_ids.some(id => !availableSources.has(id))) issue('fabricated-or-ungrounded-source', e.id);
    if (run.response_kind === 'supported_example' && (!run.grounding_record_ids.length || !run.cited_source_ids.length || !run.scope
      || run.grounding_record_ids.some(id => records.get(id)?.scope !== run.scope))) issue('unsupported-answer-or-broadened-scope', e.id);
    const reviewers = new Set<string>();
    for (const j of run.judgments) {
      if (reviewers.has(j.reviewer)) issue('duplicate-evaluation-reviewer', e.id);
      if (links.some(link => link.note_id && noteMap.get(link.note_id)?.authorUid === j.reviewer)) issue('self-evaluation-reviewer', e.id);
      reviewers.add(j.reviewer);
      if (j.fabricated_source) issue('fabricated-source-review', e.id);
      if (j.systematic_meaning_confusion) issue('systematic-meaning-confusion', e.id);
    }
    const judgments = run.judgments.filter(j => j.dialect_competent && dimensions.every(d => typeof j[d] === 'boolean'));
    if (new Set(judgments.map(j => j.reviewer)).size < 2 || !heldOutValid) continue;
    evaluated++;
    itemResult.failed_dimensions = dimensions.filter(d => judgments.some(j => j[d] !== true));
    const passed = !itemResult.failed_dimensions.length && !issues.some(i => i.id === e.id);
    itemResult.status = passed && run.response_kind === e.expected_behavior ? 'passed' : 'failed';
    if (passed && run.response_kind === e.expected_behavior) behaviorCorrect++;
    if (e.expected_behavior === 'supported_example') {
      judgedSupported++;
      if (run.response_kind === 'supported_example') { covered++; if (passed) correct++; }
    }
  }
  if (runVersions.size > 1) issue('mixed-model-or-prompt-versions', cycle.id);
  const categories = new Set(cycle.evaluations.map(e => e.category));
  const requiredCategories = ['ownership', 'occupancy', 'parenthood', 'person', 'variant', 'misleading_prompt', 'unsupported', 'source_conflict'];
  if (requiredCategories.some(c => !categories.has(c as ResearchCycle['evaluations'][number]['category']))) issue('missing-evaluation-category', cycle.id);
  const readyPatterns = patternProgress.filter(p => p.ready).length;
  const complete = !issues.length && !flags.length && readyPatterns >= cycle.targets.patterns && evaluated >= cycle.targets.evaluation_items
    && evaluated === cycle.evaluations.length && covered === supported && supported > 0 && correct === covered && behaviorCorrect === evaluated;
  return {
    cycle_id: cycle.id, as_of: asOf, snapshot_hash: hash(stableStringify({ cycle, notes: [...notes].sort((a, b) => a.id.localeCompare(b.id)).map(n => [n.id, evidenceFingerprint(n)]), asOf })),
    live_database_audited: false, externally_published: false, linguistic_authentication: false,
    issues, flags, eligibility, patterns: patternProgress,
    evaluation: { planned: cycle.evaluations.length, judged: evaluated, supported_items: supported, judged_supported_items: judgedSupported, answered_supported_items: covered,
      correct_supported_items: correct, supported_correctness: covered ? correct / covered : null,
      supported_coverage: supported ? covered / supported : null, appropriate_behavior: evaluated ? behaviorCorrect / evaluated : null,
      items: evaluationResults.map(r => ({ ...r, blocking_issues: issues.filter(i => i.id === r.id).map(i => i.code) })) },
    milestone_complete: complete,
    next_action: !patternProgress.every(p => p.documented) ? 'Inspect remaining documentary gaps in the accepted sources and record exact locators and the checker. Collect independent natural speech for documented contrasts.'
      : !patternProgress.every(p => p.reviewed_natural_examples >= cycle.targets.examples_per_pattern) ? 'Collect independent natural speech with context, permissions and current sentence review.'
      : !patternProgress.every(p => p.ready) ? 'Reconcile the evidence, obtain scoped reviews and review the linked constructions.'
      : !complete ? 'Reserve unseen evidence, capture Kawuri responses and obtain independent judgments; repair reported failures.'
      : 'The offline cycle passes its pilot gate. Verify current permissions and the actual application before any release or expansion.',
  };
}

/** Produces an inspectable file projection only; no Firebase write or retrieval-index mutation. */
export function reviewedResearchProjection(cycle: ResearchCycle, notes: EvidenceNote[], use: Use, asOf = cycle.as_of) {
  const report = inspectResearchCycle(cycle, notes, asOf);
  if (report.issues.length) throw new Error('Research integrity checks failed: ' + report.issues.map(i => `${i.code}:${i.id}`).join(', '));
  const eligible = new Set(cycle.records.filter(r => !report.eligibility[r.id][use].length).map(r => r.id));
  const projected = cycle.records.filter(r => eligible.has(r.id)).map(r => ({
    id: r.id, type: r.type, original_text: r.original_text, reviewed_text: r.reviewed_text,
    meaning_in_context: r.meaning_in_context, literal_gloss: r.literal_gloss, grammatical_features: r.grammatical_features,
    usage_context: r.usage_context, scope: r.scope, version: r.version, review_status: r.review_status,
    related_record_ids: r.related_record_ids.filter(id => eligible.has(id)), support_record_ids: r.support_record_ids,
    evidence: r.evidence.map(e => ({ source_id: e.source_id, locator: e.locator, evidence_type: e.evidence_type,
      transcription_status: e.transcription_status })),
    // Recordings remain in private storage and are never exported into this text projection.
  }));
  return { cycle_id: cycle.id, use, as_of: asOf, snapshot_hash: report.snapshot_hash, records: projected,
    sources: cycle.sources.filter(s => projected.some(r => r.evidence.some(e => e.source_id === s.id)))
      .map(s => ({ id: s.id, title: s.title, kind: s.kind })) };
}
