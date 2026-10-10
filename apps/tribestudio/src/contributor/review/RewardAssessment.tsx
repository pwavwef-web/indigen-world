import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '../../auth';
import { functions } from '../../firebase';
import { Badge, Button, Icon, Notice, Segmented, type IconName } from '../../ui';
import { computeAward, DIMENSIONS, DIMENSION_LABELS, PolicyError, type AwardPolicyConfig, type CategoryPolicy, type Dimension, type QualityBand } from '../reward-policy';
import type { ReviewRecord } from './model';

/* ==========================================================================
   The Rewards desk: a fluent validator decides whether one contribution
   revision is useful training data, and how good it is. Publication is
   decided separately on the Contributions desk.

   Automatic checks and Kawuri's suggestions are shown as evidence, labelled
   with where each number came from. Nothing is prefilled from a model guess:
   accuracy starts empty unless a trusted record supports it. The preview below
   uses the policy snapshot on the assessment; the server applies the active
   policy and records the validator's identity with every decision.
   ========================================================================== */

type Json = Record<string, any>;
type Decision = 'confirm' | 'clarify' | 'ineligible';
const decide = httpsCallable<Json, { status: string; points?: number; calculation?: string }>(functions, 'decideRewardAssessment');

const BASIS: Record<string, { label: string; tone: 'success' | 'info' | 'warning' | 'neutral' }> = {
  reference: { label: 'Trusted record', tone: 'success' },
  deterministic: { label: 'Measured', tone: 'info' },
  validator: { label: 'Validator', tone: 'success' },
  'model-proposal': { label: 'Kawuri suggestion · unverified', tone: 'warning' },
  'not-applicable': { label: 'Not applicable', tone: 'neutral' },
  unavailable: { label: 'Needs you', tone: 'neutral' },
};
const SCOPE: Record<string, string> = {
  accepted: 'Already accepted', 'pending-other-account': 'Pending · another account', 'pending-same-account': 'Pending · same contributor',
};
const INELIGIBLE: Record<string, string> = {
  duplicate: 'Repeats an accepted record', inaccurate: 'Kasem or meaning not accurate', 'not-useful': 'Not useful for this dataset',
  'missing-permission': 'Permission or provenance missing', 'unusable-media': 'Recording or file unusable', 'off-task': 'Does not match the prompt', other: 'Other (explain)',
};
const GATE_ICON: Record<string, IconName> = { pass: 'check-circle', fail: 'x-circle', 'needs-review': 'alert' };

function Section({ title, icon, children }: { title: string; icon: IconName; children: ReactNode }) {
  return <section className="rv-section"><h3 className="rv-section__title"><Icon name={icon} />{title}</h3>{children}</section>;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  if (children == null || children === '') return null;
  return <div className="rv-evidence"><span className="rv-evidence__label">{label}</span><div className="rv-evidence__value">{children}</div></div>;
}

export function RewardAssessmentPanel({ item, stale, statusLabel, onSaved }: { item: ReviewRecord; stale: boolean; statusLabel: string; onSaved: (message: string) => void }) {
  const { user } = useAuth();
  const content: Json = item.content ?? {};
  const automated: Json = item.automated ?? {};
  const result: Json | null = automated.status === 'completed' ? automated.result : null;
  const policy = item.policy as { id: string; version: number; categoryLabel: string; category: CategoryPolicy; bands: QualityBand[] } | undefined;
  const own = item.contributorId === user?.uid;
  const exactAccepted = Boolean(result?.duplicates?.some((d: Json) => d.kind === 'exact' && d.scope === 'accepted'));
  const settled = Number(item.settlement?.settledPoints ?? 0);

  const initialScores = useMemo(() => {
    const prior = item.validator?.scores as Record<Dimension, number | null> | undefined;
    return Object.fromEntries(DIMENSIONS.map(d => {
      if (prior && typeof prior[d] === 'number') return [d, String(prior[d])];
      const auto = result?.dimensions?.[d];
      // Never prefill from a model guess; measured and trusted-record scores are a starting point.
      return [d, auto && ['reference', 'deterministic'].includes(auto.basis) && typeof auto.score === 'number' ? String(auto.score) : ''];
    })) as Record<Dimension, string>;
  }, [item.id]);
  const [decision, setDecision] = useState<Decision>('confirm');
  const [scores, setScores] = useState(initialScores);
  const [effort, setEffort] = useState(String(item.validator?.verifiedEffortQuantity ?? ''));
  const [variant, setVariant] = useState(false);
  const [reason, setReason] = useState(''), [message, setMessage] = useState(''), [code, setCode] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');

  const applies = (d: Dimension) => (policy?.category.weights[d] ?? 0) > 0;
  const parsed = Object.fromEntries(DIMENSIONS.map(d => [d, applies(d) && scores[d] !== '' ? Number(scores[d]) : null])) as Record<Dimension, number | null>;
  let preview: ReturnType<typeof computeAward> | null = null, previewProblem = '';
  if (policy) {
    try {
      preview = computeAward({ categories: { [item.category]: policy.category }, bands: policy.bands } as unknown as AwardPolicyConfig,
        item.category, parsed, policy.category.effortUnit ? Number(effort || 0) : 0);
    } catch (e) { previewProblem = e instanceof PolicyError ? e.message : 'Enter whole scores from 0 to 100.'; }
  }
  const recommended: string | null = result?.recommendedBand && result.recommendedBand !== 'below-threshold' ? result.recommendedBand : null;
  const overrides = Boolean(preview?.band && recommended && preview.band !== recommended);
  const needsReason = decision === 'confirm' && (overrides || settled > 0 || (exactAccepted && variant));
  const problems = decision === 'confirm'
    ? (previewProblem || (!preview?.band ? 'Below the lowest band there is no award: ask a question or mark it not eligible.' : '')
      || (exactAccepted && !variant ? 'Confirm this is a distinct, useful variant of the accepted record, or mark it not eligible.' : '')
      || (needsReason && reason.trim().length < 10 ? 'Give your reason (at least 10 characters).' : ''))
    : decision === 'clarify' ? (message.trim().length < 10 ? 'Write the question for the contributor (at least 10 characters).' : '')
      : (!code ? 'Choose a reason.' : message.trim().length < 10 ? 'Tell the contributor why, with something they can act on.' : '');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (problems || busy || own || stale) return;
    setBusy(true); setError('');
    try {
      const { data } = await decide({
        assessmentId: item.id, expectedRevision: item.revision, decision, reason: reason.trim(), messageToContributor: message.trim(),
        ...(decision === 'confirm' ? { scores: parsed, verifiedEffortQuantity: policy?.category.effortUnit ? Number(effort || 0) : 0, duplicateResolution: exactAccepted && variant ? 'distinct-variant' : undefined } : {}),
        ...(decision === 'ineligible' ? { ineligibleReason: code } : {}),
      });
      onSaved(decision === 'confirm' ? `${data.status === 'awarded' ? 'Confirmed and settled' : 'Confirmed'}: ${data.calculation ?? ''}` : decision === 'clarify' ? 'Question sent to the contributor.' : 'Marked not eligible. The contributor sees your reason.');
    } catch (reason) {
      const e = reason as { message?: string };
      setError((e.message ?? 'The decision could not be saved.').replace(/^Firebase(Error)?:\s*/, ''));
      setBusy(false);
    }
  };

  return (
    <div className="rv-detail rwa">
      <article className="ts-panel rv-record" aria-labelledby="rwa-title">
        <header className="rv-record__head">
          <div className="ts-stack" style={{ ['--gap' as string]: '0.4rem' }}>
            <div className="ts-cluster">
              <Badge tone={item.status === 'awarded' ? 'success' : item.status === 'ineligible' ? 'danger' : 'info'} dot>{statusLabel}</Badge>
              <span className="ts-badge ts-badge--outline">{policy?.categoryLabel ?? item.category}</span>
              {item.reviewRequest?.open ? <Badge tone="warning">Review requested</Badge> : null}
              {item.publicationStatus ? <span className="ts-badge ts-badge--outline">Publication: {String(item.publicationStatus).toLowerCase().replace('_', ' ')}</span> : null}
            </div>
            <h2 className="rv-record__title" id="rwa-title">{content.englishMeaning || 'Contribution'}</h2>
            <p className="rv-record__meta"><span>Revision <code>{item.id.slice(0, 12)}</code></span>{item.revisionOf ? <span>Edit of <code>{String(item.revisionOf).slice(0, 12)}</code></span> : null}{settled ? <span>{settled} points settled</span> : null}</p>
          </div>
        </header>

        {item.reviewRequest?.open ? <Notice tone="warning" title="The contributor asked for a review">{item.reviewRequest.message}</Notice> : null}
        {item.financeAttention ? <Notice tone="warning" title="Finance attention">{item.financeAttention}</Notice> : null}

        <Section title="Source" icon="doc">
          <div className="rv-source-summary">
            <Field label="Kasem (as submitted)"><span className="rwa-kasem" lang="xsm">{content.kasemText}</span></Field>
            {result?.orthography?.changed ? <Field label="Normalised copy (stored separately)"><span className="rwa-kasem" lang="xsm">{result.orthography.normalizedNfc}</span></Field> : null}
            <Field label="English meaning">{content.englishMeaning}</Field>
            <Field label="Other ways of saying it">{(content.alternatives ?? []).length ? <ul className="rwa-list">{content.alternatives.map((a: string) => <li key={a} lang="xsm">{a}</li>)}</ul> : null}</Field>
            <Field label="When it is said">{content.context || <span className="ts-muted">Not given</span>}</Field>
            <Field label="Literal reading">{content.literalTranslation}</Field>
            <Field label="Variety">{content.dialect || <span className="ts-muted">Not specified</span>}</Field>
          </div>
          {(item.contributorResponses ?? []).length ? <div className="rwa-responses">{item.contributorResponses.map((r: Json, i: number) => <p key={i}><strong>{r.kind === 'review' ? 'Review request' : 'Contributor answer'}:</strong> {r.message}</p>)}</div> : null}
        </Section>

        <Section title="Eligibility gates" icon="shield">
          <ul className="rwa-gates">{(item.gates ?? []).concat(result?.eligibility?.filter((g: Json) => !['training-permission'].includes(g.id)) ?? []).map((g: Json) => (
            <li key={g.id} className={`is-${g.status}`}><Icon name={GATE_ICON[g.status] ?? 'info'} /><span>{g.detail}</span></li>
          ))}</ul>
        </Section>

        <Section title="Automatic checks" icon="spark">
          {!result ? (
            <p className="ts-hint">{automated.status === 'queued' ? 'Queued for the assessment worker.' : automated.reason ?? 'Not run.'} You can decide without them.</p>
          ) : (
            <div className="ts-stack ts-stack--sm">
              <p className="ts-hint">Worker {result.evaluator.version} · Kawuri {result.evaluator.modelStatus === 'ok' ? `(${result.evaluator.model}) — suggestions only` : result.evaluator.modelStatus} · policy v{result.evaluator.policyVersion}.
                {' '}{recommended ? <>Recommends <strong>{recommended}</strong>{typeof result.proposedPoints === 'number' ? ` (${result.proposedPoints} points)` : ''}.</> : 'No band recommended — accuracy needs you.'}</p>
              <ul className="rwa-dimlist" aria-label="Automatic dimension scores">{DIMENSIONS.map(d => { const v = result.dimensions[d]; const b = BASIS[v.basis] ?? BASIS.unavailable; return (
                <li key={d}><span className="rwa-dimlist__head"><span>{DIMENSION_LABELS[d]}</span><strong>{v.score ?? '—'}</strong><Badge tone={b.tone}>{b.label}</Badge></span>
                  {v.notes.length ? <span className="ts-muted">{v.notes.join(' ')}</span> : null}</li>
              ); })}</ul>
              {result.duplicates.length ? <div><p className="rv-evidence__label">Similar records (flags, not proof)</p><ul className="rwa-list">{result.duplicates.map((d: Json) => <li key={d.ref}>{d.kind === 'exact' ? 'Identical' : `Similar (${Math.round(d.similarity * 100)}%)`} · {SCOPE[d.scope] ?? d.scope} · <code>{d.ref}</code></li>)}</ul></div> : null}
              {result.orthography.findings.length ? <div><p className="rv-evidence__label">Spelling and encoding ({result.orthography.rulesApplied === 'none' ? 'no verified rules for this variety' : 'BGL 1997 rules'})</p><ul className="rwa-list">{result.orthography.findings.map((f: Json, i: number) => <li key={i}><Badge tone={f.severity === 'warning' ? 'warning' : 'neutral'}>{f.rule}</Badge> {f.message}</li>)}</ul></div> : null}
              {result.audio ? <p className="ts-hint">Recording: {result.audio.status}{result.audio.durationSeconds != null ? ` · ${result.audio.durationSeconds}s long, ${result.audio.speechSeconds}s speech` : ''}. {result.audio.notes.join(' ')}</p> : null}
              {result.kawuri.findings.length ? <div><p className="rv-evidence__label">Kawuri suggestions (unverified)</p><ul className="rwa-list">{result.kawuri.findings.map((f: Json, i: number) => <li key={i}>{f.observation} <span className="ts-muted">({f.aspect}, self-reported {f.selfReportedConfidence})</span></li>)}</ul></div> : null}
              {result.uncertainty.length ? <div><p className="rv-evidence__label">Uncertainty</p><ul className="rwa-list">{result.uncertainty.map((u: Json, i: number) => <li key={i}>{u.detail}</li>)}</ul></div> : null}
              {result.evidence.filter((e: Json) => e.kind !== 'model-finding').length ? <div><p className="rv-evidence__label">Evidence</p><ul className="rwa-list">{result.evidence.filter((e: Json) => e.kind !== 'model-finding').map((e: Json, i: number) => <li key={i}><code>{e.ref}</code> — {e.summary}</li>)}</ul></div> : null}
            </div>
          )}
        </Section>
      </article>

      <form className="ts-panel rwa-decide" onSubmit={e => void submit(e)} aria-labelledby="rwa-decide-title">
        <h3 id="rwa-decide-title" className="rv-section__title"><Icon name="award" />Training-data decision</h3>
        {own ? <Notice tone="warning">This is your own contribution. Another validator must assess it.</Notice> : null}
        {stale ? <Notice tone="warning">This assessment changed. Load the latest version before deciding.</Notice> : null}
        <Segmented label="Decision" block value={decision} onChange={setDecision} options={[
          { value: 'confirm', label: 'Eligible', icon: 'check' }, { value: 'clarify', label: 'Ask a question', icon: 'message' }, { value: 'ineligible', label: 'Not eligible', icon: 'x-circle' },
        ]} />
        {decision === 'confirm' ? (
          <>
            <div className="rwa-scores">
              {DIMENSIONS.map(d => (
                <label key={d} className="ts-field">
                  <span className="ts-label">{DIMENSION_LABELS[d]}{applies(d) ? '' : ' (not applicable)'}</span>
                  <input className="ts-input" inputMode="numeric" disabled={!applies(d)} placeholder={applies(d) ? '0–100' : '—'} value={scores[d]}
                    onChange={e => setScores({ ...scores, [d]: e.target.value.replace(/[^\d]/g, '').slice(0, 3) })} />
                </label>
              ))}
              {policy?.category.effortUnit ? (
                <label className="ts-field"><span className="ts-label">Verified {policy.category.effortUnit.kind === 'verifiedAlignedAudioSeconds' ? 'aligned speech (seconds)' : 'source segments'}</span>
                  <input className="ts-input" inputMode="numeric" value={effort} onChange={e => setEffort(e.target.value.replace(/[^\d]/g, ''))} />
                  <small className="ts-hint">Exclude silence, padding and repeats. Capped at {policy.category.effortUnit.maxUnits} units.</small></label>
              ) : null}
            </div>
            <p className="ts-hint">Score what you can verify. Short is fine; length, repetition and equipment are not scored. Accent and variety are never reasons to lower accuracy.</p>
            {exactAccepted ? <label className="ts-check ts-check--card"><input type="checkbox" checked={variant} onChange={e => setVariant(e.target.checked)} /><span className="ts-check__copy"><strong>This is a distinct, useful variant</strong><small>For example a different context of use. Explain below.</small></span></label> : null}
            <div className="rwa-preview" aria-live="polite">
              {preview ? <><strong>{preview.band ? `${preview.bandLabel} · ${preview.points} points` : 'No award'}</strong><span>{preview.calculation}</span></> : <span className="ts-muted">{previewProblem || 'Enter scores to see the award.'}</span>}
              {overrides ? <span className="rwa-override">Differs from the automatic recommendation ({recommended}) — your reason is required and kept.</span> : null}
              {settled ? <span className="rwa-override">{settled} points already settled; a change is applied as a ledger adjustment.</span> : null}
              <small className="ts-hint">Preview with policy v{policy?.version}. The server applies the active policy.</small>
            </div>
          </>
        ) : null}
        {decision === 'ineligible' ? (
          <label className="ts-field"><span className="ts-label">Reason</span>
            <select className="ts-select" value={code} onChange={e => setCode(e.target.value)}><option value="">Choose…</option>{Object.entries(INELIGIBLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        ) : null}
        <label className="ts-field"><span className="ts-label">{decision === 'clarify' ? 'Question for the contributor' : decision === 'ineligible' ? 'What the contributor can do' : 'Feedback for the contributor (optional)'}</span>
          <textarea className="ts-textarea" rows={3} maxLength={1000} value={message} onChange={e => setMessage(e.target.value)} /></label>
        {decision === 'confirm' ? (
          <label className="ts-field"><span className="ts-label">Reason {needsReason ? '(required)' : '(optional, kept in the audit history)'}</span>
            <textarea className="ts-textarea" rows={2} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></label>
        ) : null}
        {error ? <Notice tone="danger" role="alert">{error}</Notice> : null}
        {problems ? <p className="ts-hint"><Icon name="info" /> {problems}</p> : null}
        <Button type="submit" variant="primary" block busy={busy} disabled={Boolean(problems) || own || stale}>
          {decision === 'confirm' ? 'Confirm training data' : decision === 'clarify' ? 'Send question' : 'Mark not eligible'}
        </Button>
        <p className="ts-hint">Your name is recorded with this decision. Points settle in the ledger only when assessed awards are switched on.</p>
      </form>
    </div>
  );
}
