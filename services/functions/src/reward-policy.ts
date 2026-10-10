/**
 * Contributor reward policy: what verified training data earns, and what
 * points are worth when redeemed. Pure functions only — no Firestore — so the
 * same arithmetic is tested directly and runs identically in every callable.
 *
 * ── Status of these numbers ────────────────────────────────────────────────
 * Every default below is a PROPOSED CALIBRATION SETTING, not a measured
 * standard of Kasem data quality and not a proven sustainable payout rate.
 * Finance edits them as new, versioned policies; an accepted redemption keeps
 * the policy version it was quoted under.
 *
 * ── Awards ─────────────────────────────────────────────────────────────────
 *   points = round_half_up((category base + verified effort) × band multiplier)
 * bounded by the category's min/max. The band comes from a 0–100 assessment
 * whose dimensions are weighted per category; a dimension that does not apply
 * (weight 0, or no score) is left out and the remaining weights are
 * renormalised. Consent and training permission are gates, never scores.
 *
 * ── Redemptions ────────────────────────────────────────────────────────────
 * Marginal bands inside ONE redemption: the bonus applies only to the points
 * that fall inside each band, the band values are summed exactly (BigInt
 * rationals over a common denominator) and the total is rounded once, half
 * up, to whole pesewas. The bands restart with every redemption.
 */

export const REWARD_CATEGORIES = ['expressions', 'dictionary', 'literature', 'music', 'audiobooks', 'video'] as const;
export type RewardCategory = (typeof REWARD_CATEGORIES)[number];

export const DIMENSIONS = ['accuracy', 'completeness', 'technical', 'metadata'] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export const DIMENSION_LABELS: Record<Dimension, string> = {
  accuracy: 'Verified linguistic/content accuracy and relevance',
  completeness: 'Completeness and alignment',
  technical: 'Technical usability for the intended dataset',
  metadata: 'Required metadata and provenance',
};

export type EffortKind = 'verifiedAlignedAudioSeconds' | 'verifiedSourceSegments';

export interface EffortUnit {
  kind: EffortKind;
  /** Seconds or segments per unit. */
  unitSize: number;
  pointsPerUnit: number;
  maxUnits: number;
}

export interface CategoryPolicy {
  enabled: boolean;
  label: string;
  basePoints: number;
  minPoints: number;
  maxPoints: number;
  /** Relative weights; 0 marks a dimension not applicable to this category. */
  weights: Record<Dimension, number>;
  requirements: {
    /** Always true: training permission is a hard eligibility gate. */
    trainingPermission: true;
    audio: boolean;
    transcript: boolean;
    provenance: boolean;
  };
  /** `text`: an exact copy of an accepted record adds nothing. `speech`: the same words from another speaker can be legitimate diversity. */
  duplicatePolicy: 'text' | 'speech';
  effortUnit: EffortUnit | null;
  note: string;
}

export type BandId = 'standard' | 'strong' | 'exceptional';

export interface QualityBand {
  id: BandId;
  label: string;
  minScore: number;
  /** 10000 = ×1.00. */
  multiplierBps: number;
}

export interface AwardPolicyConfig {
  categories: Record<RewardCategory, CategoryPolicy>;
  /** Ascending by minScore. Below the first band there is no automatic award. */
  bands: QualityBand[];
  /** Locked on in this release: language judgments need a fluent validator. */
  requireValidatorConfirmation: true;
  /** Locked off until a reviewer-labelled shadow calibration is recorded. */
  automatedSettlement: false;
}

export interface RedemptionBand {
  /** Inclusive upper position of this band inside one redemption; null = no limit. */
  upToPoints: number | null;
  /** 500 = +5% above base value for the points in this band. */
  bonusBps: number;
}

export type Network = 'MTN' | 'Telecel' | 'AT';
export const NETWORKS: readonly Network[] = ['MTN', 'Telecel', 'AT'];

export interface DataBundle {
  id: string;
  network: Network;
  /** The provider's own bundle name, e.g. as printed on the top-up channel Finance uses. */
  label: string;
  priceMinor: number;
}

export interface RedemptionPolicyConfig {
  /** Base rate: basePoints = baseAmountMinor pesewas, before any bonus. */
  basePoints: number;
  baseAmountMinor: number;
  bands: RedemptionBand[];
  minimumPoints: number;
  maximumPoints: number;
  quoteTtlSeconds: number;
  /** Operational cap on GH₵ committed per calendar month (UTC); null = none. */
  monthlyBudgetMinor: number | null;
  airtime: { enabled: boolean; networks: Network[] };
  /** Real bundles Finance can buy. Empty = data is not offered. */
  dataBundles: DataBundle[];
}

export type PolicyKind = 'award' | 'redemption';

export interface PolicyRecord<T> {
  id: string;
  kind: PolicyKind;
  version: number;
  config: T;
  /** `proposed-default` until Finance saves its own calibrated version. */
  basis: 'proposed-default' | 'finance-set';
  createdAt: string;
  createdBy: string;
  reason: string;
}

const textWeights = (accuracy: number, completeness: number, technical: number, metadata: number) =>
  ({ accuracy, completeness, technical, metadata });

/** Proposed defaults. Only expressions are collected and paid through the portal today. */
export const DEFAULT_AWARD_POLICY: AwardPolicyConfig = {
  categories: {
    expressions: {
      enabled: true, label: 'Everyday expression', basePoints: 20, minPoints: 20, maxPoints: 40,
      weights: textWeights(50, 25, 10, 15),
      requirements: { trainingPermission: true, audio: false, transcript: false, provenance: true },
      duplicatePolicy: 'text', effortUnit: null,
      note: 'A short, accurate expression can earn the top band. Length is not scored.',
    },
    dictionary: {
      enabled: false, label: 'Dictionary word', basePoints: 15, minPoints: 15, maxPoints: 30,
      weights: textWeights(50, 25, 10, 15),
      requirements: { trainingPermission: true, audio: false, transcript: false, provenance: true },
      duplicatePolicy: 'text', effortUnit: null,
      note: 'Not collected through the contributor portal yet.',
    },
    literature: {
      enabled: false, label: 'Story or written piece (transcript)', basePoints: 30, minPoints: 30, maxPoints: 90,
      weights: textWeights(40, 30, 10, 20),
      requirements: { trainingPermission: true, audio: false, transcript: true, provenance: true },
      duplicatePolicy: 'text',
      effortUnit: { kind: 'verifiedSourceSegments', unitSize: 5, pointsPerUnit: 5, maxUnits: 6 },
      note: 'Sentences split from one source count as effort units on ONE award, capped — never as separate contributions.',
    },
    music: {
      enabled: false, label: 'Song recording', basePoints: 30, minPoints: 30, maxPoints: 90,
      weights: textWeights(35, 20, 30, 15),
      requirements: { trainingPermission: true, audio: true, transcript: true, provenance: true },
      duplicatePolicy: 'speech',
      effortUnit: { kind: 'verifiedAlignedAudioSeconds', unitSize: 30, pointsPerUnit: 5, maxUnits: 8 },
      note: 'Not collected through the contributor portal yet.',
    },
    audiobooks: {
      enabled: false, label: 'Aligned speech recording', basePoints: 40, minPoints: 40, maxPoints: 120,
      weights: textWeights(35, 25, 25, 15),
      requirements: { trainingPermission: true, audio: true, transcript: true, provenance: true },
      duplicatePolicy: 'speech',
      effortUnit: { kind: 'verifiedAlignedAudioSeconds', unitSize: 30, pointsPerUnit: 5, maxUnits: 10 },
      note: 'Effort counts verified aligned speech only; silence, padding and repeats are excluded.',
    },
    video: {
      enabled: false, label: 'Video with captions', basePoints: 40, minPoints: 40, maxPoints: 120,
      weights: textWeights(35, 25, 25, 15),
      requirements: { trainingPermission: true, audio: true, transcript: true, provenance: true },
      duplicatePolicy: 'speech',
      effortUnit: { kind: 'verifiedAlignedAudioSeconds', unitSize: 30, pointsPerUnit: 5, maxUnits: 10 },
      note: 'Not collected through the contributor portal yet.',
    },
  },
  bands: [
    { id: 'standard', label: 'Standard', minScore: 60, multiplierBps: 10000 },
    { id: 'strong', label: 'Strong', minScore: 80, multiplierBps: 12500 },
    { id: 'exceptional', label: 'Exceptional', minScore: 90, multiplierBps: 15000 },
  ],
  requireValidatorConfirmation: true,
  automatedSettlement: false,
};

/** Proposed defaults: 300 points = GH₵5.00 base, with gradual marginal bonuses. */
export const DEFAULT_REDEMPTION_POLICY: RedemptionPolicyConfig = {
  basePoints: 300,
  baseAmountMinor: 500,
  bands: [
    { upToPoints: 300, bonusBps: 0 },
    { upToPoints: 900, bonusBps: 500 },
    { upToPoints: 1800, bonusBps: 1000 },
    { upToPoints: null, bonusBps: 1500 },
  ],
  minimumPoints: 300,
  maximumPoints: 6000,
  quoteTtlSeconds: 900,
  monthlyBudgetMinor: null,
  airtime: { enabled: true, networks: ['MTN', 'Telecel', 'AT'] },
  dataBundles: [],
};

export const DEFAULT_AWARD_POLICY_ID = 'award-v1-proposed';
export const DEFAULT_REDEMPTION_POLICY_ID = 'redemption-v1-proposed';

export function defaultPolicyRecord<T>(kind: PolicyKind): PolicyRecord<T> {
  return {
    id: kind === 'award' ? DEFAULT_AWARD_POLICY_ID : DEFAULT_REDEMPTION_POLICY_ID,
    kind, version: 1,
    config: structuredClone(kind === 'award' ? DEFAULT_AWARD_POLICY : DEFAULT_REDEMPTION_POLICY) as T,
    basis: 'proposed-default', createdAt: '2026-10-10T00:00:00.000Z', createdBy: 'system', reason: 'Proposed calibration defaults.',
  };
}

/* ── Validation ────────────────────────────────────────────────────────────── */

export class PolicyError extends Error {
  constructor(public readonly field: string, message: string) { super(message); }
}

function int(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new PolicyError(field, `${field} must be a whole number from ${min} to ${max}.`);
  }
  return value;
}

function bool(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new PolicyError(field, `${field} must be true or false.`);
  return value;
}

function label(value: unknown, field: string, max = 80): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new PolicyError(field, `${field} needs 1–${max} characters.`);
  return value.trim();
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PolicyError(field, `${field} is missing.`);
  return value as Record<string, unknown>;
}

export function parseAwardPolicy(raw: unknown): AwardPolicyConfig {
  const input = record(raw, 'Award policy');
  const categoriesIn = record(input.categories, 'Categories');
  const categories = {} as Record<RewardCategory, CategoryPolicy>;
  for (const key of REWARD_CATEGORIES) {
    const c = record(categoriesIn[key], `Category ${key}`);
    const name = `${key}`;
    const weightsIn = record(c.weights, `${name} weights`);
    const weights = Object.fromEntries(DIMENSIONS.map(d => [d, int(weightsIn[d], `${name} ${d} weight`, 0, 100)])) as Record<Dimension, number>;
    if (DIMENSIONS.every(d => weights[d] === 0)) throw new PolicyError(`${name} weights`, `${name}: at least one dimension needs a weight.`);
    if (weights.accuracy === 0) throw new PolicyError(`${name} accuracy weight`, `${name}: accuracy always applies.`);
    const basePoints = int(c.basePoints, `${name} base points`, 1, 10000);
    const minPoints = int(c.minPoints, `${name} minimum points`, 0, 10000);
    const maxPoints = int(c.maxPoints, `${name} maximum points`, 1, 10000);
    if (minPoints > basePoints) throw new PolicyError(`${name} minimum points`, `${name}: the minimum cannot exceed base points.`);
    if (maxPoints < basePoints) throw new PolicyError(`${name} maximum points`, `${name}: the maximum must cover base points.`);
    const req = record(c.requirements, `${name} requirements`);
    if (req.trainingPermission !== true) throw new PolicyError(`${name} training permission`, 'Training permission is always required.');
    let effortUnit: EffortUnit | null = null;
    if (c.effortUnit != null) {
      const e = record(c.effortUnit, `${name} effort unit`);
      if (!['verifiedAlignedAudioSeconds', 'verifiedSourceSegments'].includes(String(e.kind))) throw new PolicyError(`${name} effort unit`, 'Unsupported effort unit.');
      effortUnit = { kind: e.kind as EffortKind, unitSize: int(e.unitSize, `${name} unit size`, 1, 3600),
        pointsPerUnit: int(e.pointsPerUnit, `${name} points per unit`, 0, 1000), maxUnits: int(e.maxUnits, `${name} unit cap`, 0, 1000) };
    }
    if (!['text', 'speech'].includes(String(c.duplicatePolicy))) throw new PolicyError(`${name} duplicate policy`, 'Unsupported duplicate policy.');
    categories[key] = {
      enabled: bool(c.enabled, `${name} enabled`), label: label(c.label, `${name} label`),
      basePoints, minPoints, maxPoints, weights,
      requirements: { trainingPermission: true, audio: bool(req.audio, `${name} audio`), transcript: bool(req.transcript, `${name} transcript`), provenance: bool(req.provenance, `${name} provenance`) },
      duplicatePolicy: c.duplicatePolicy as 'text' | 'speech', effortUnit,
      note: typeof c.note === 'string' ? c.note.trim().slice(0, 300) : '',
    };
  }
  if (!Array.isArray(input.bands) || input.bands.length !== 3) throw new PolicyError('Bands', 'Exactly three quality bands are required.');
  const ids: BandId[] = ['standard', 'strong', 'exceptional'];
  const bands = input.bands.map((raw, index) => {
    const b = record(raw, `Band ${index + 1}`);
    if (b.id !== ids[index]) throw new PolicyError('Bands', 'Bands must be standard, strong, exceptional in that order.');
    return { id: ids[index], label: label(b.label, `${ids[index]} label`, 40), minScore: int(b.minScore, `${ids[index]} minimum score`, 50, 100),
      multiplierBps: int(b.multiplierBps, `${ids[index]} multiplier`, 5000, 30000) };
  });
  for (let i = 1; i < bands.length; i++) {
    if (bands[i].minScore <= bands[i - 1].minScore) throw new PolicyError('Bands', 'Band thresholds must rise.');
    if (bands[i].multiplierBps < bands[i - 1].multiplierBps) throw new PolicyError('Bands', 'A higher band cannot pay a lower multiplier.');
  }
  if (input.requireValidatorConfirmation !== true) {
    throw new PolicyError('Validator confirmation', 'Validator confirmation stays required for language judgments in this release.');
  }
  if (input.automatedSettlement !== false) {
    throw new PolicyError('Automated settlement', 'Automated settlement is unavailable until a reviewer-labelled shadow calibration has been recorded.');
  }
  return { categories, bands, requireValidatorConfirmation: true, automatedSettlement: false };
}

export function parseRedemptionPolicy(raw: unknown): RedemptionPolicyConfig {
  const input = record(raw, 'Redemption policy');
  const basePoints = int(input.basePoints, 'Base points', 1, 100000);
  const baseAmountMinor = int(input.baseAmountMinor, 'Base value', 1, 10_000_000);
  if (!Array.isArray(input.bands) || input.bands.length < 1 || input.bands.length > 8) throw new PolicyError('Bonus bands', 'Use 1–8 bonus bands.');
  const bands: RedemptionBand[] = input.bands.map((raw, index) => {
    const b = record(raw, `Band ${index + 1}`);
    const last = index === (input.bands as unknown[]).length - 1;
    const upToPoints = last ? (b.upToPoints == null ? null : int(b.upToPoints, `Band ${index + 1} end`, 1, 1_000_000))
      : int(b.upToPoints, `Band ${index + 1} end`, 1, 1_000_000);
    return { upToPoints, bonusBps: int(b.bonusBps, `Band ${index + 1} bonus`, 0, 5000) };
  });
  if (bands.at(-1)!.upToPoints !== null) throw new PolicyError('Bonus bands', 'The last band must be open-ended.');
  for (let i = 1; i < bands.length; i++) {
    if (i < bands.length - 1 && bands[i].upToPoints! <= bands[i - 1].upToPoints!) throw new PolicyError('Bonus bands', 'Band ends must rise.');
    if (bands[i].bonusBps < bands[i - 1].bonusBps) throw new PolicyError('Bonus bands', 'Bonuses cannot fall in a later band (it would reward splitting).');
  }
  const minimumPoints = int(input.minimumPoints, 'Minimum points', 1, 100000);
  const maximumPoints = int(input.maximumPoints, 'Maximum points', minimumPoints, 100000);
  const config: RedemptionPolicyConfig = {
    basePoints, baseAmountMinor, bands, minimumPoints, maximumPoints,
    quoteTtlSeconds: int(input.quoteTtlSeconds, 'Quote validity', 60, 3600),
    monthlyBudgetMinor: input.monthlyBudgetMinor == null ? null : int(input.monthlyBudgetMinor, 'Monthly budget', 100, 1_000_000_000),
    airtime: { enabled: false, networks: [] }, dataBundles: [],
  };
  const airtime = record(input.airtime, 'Airtime');
  const networks = Array.isArray(airtime.networks) ? [...new Set(airtime.networks.map(String))] : [];
  if (networks.some(n => !NETWORKS.includes(n as Network))) throw new PolicyError('Airtime networks', 'Unsupported network.');
  config.airtime = { enabled: bool(airtime.enabled, 'Airtime enabled'), networks: networks as Network[] };
  if (config.airtime.enabled && !networks.length) throw new PolicyError('Airtime networks', 'Choose at least one network for airtime.');
  if (!Array.isArray(input.dataBundles) || input.dataBundles.length > 30) throw new PolicyError('Data bundles', 'Up to 30 data bundles.');
  const seen = new Set<string>();
  config.dataBundles = input.dataBundles.map((raw, index) => {
    const b = record(raw, `Bundle ${index + 1}`);
    const id = label(b.id, `Bundle ${index + 1} id`, 40);
    if (!/^[a-z0-9-]+$/.test(id) || seen.has(id)) throw new PolicyError(`Bundle ${index + 1} id`, 'Bundle ids are unique lowercase words with dashes.');
    seen.add(id);
    if (!NETWORKS.includes(b.network as Network)) throw new PolicyError(`Bundle ${index + 1} network`, 'Unsupported network.');
    return { id, network: b.network as Network, label: label(b.label, `Bundle ${index + 1} name`, 60), priceMinor: int(b.priceMinor, `Bundle ${index + 1} price`, 100, 10_000_000) };
  });
  if (redemptionValueMinor(minimumPoints, config) < 100) throw new PolicyError('Minimum points', 'The minimum redemption must be worth at least GH₵1.00.');
  for (const bundle of config.dataBundles) {
    if (bundlePoints(bundle, config) === null) {
      throw new PolicyError(`Bundle ${bundle.id}`, `${bundle.label} costs less than the minimum redemption or more than the maximum, so it cannot be offered.`);
    }
  }
  const split = profitableSplit(config);
  if (split) throw new PolicyError('Bonus bands', `Splitting ${split.total} points into ${split.a} + ${split.b} would pay more than one redemption; raise the minimum or adjust the bands.`);
  return config;
}

/* ── Awards ────────────────────────────────────────────────────────────────── */

export type DimensionScores = Partial<Record<Dimension, number | null>>;

/** Half-up rounding of numerator/denominator for non-negative BigInts. */
function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator * 2n + denominator) / (denominator * 2n);
}

/**
 * The weighted 0–100 score over the dimensions that apply. Returns the exact
 * rational (for band decisions) and a one-decimal display value.
 */
export function overallScore(scores: DimensionScores, weights: Record<Dimension, number>) {
  let weighted = 0, total = 0;
  const applied: Dimension[] = [], excluded: Dimension[] = [];
  for (const d of DIMENSIONS) {
    const score = scores[d];
    if (weights[d] > 0 && typeof score === 'number' && Number.isFinite(score)) {
      if (score < 0 || score > 100 || !Number.isInteger(score)) throw new PolicyError(d, `${d} must be a whole score from 0 to 100.`);
      weighted += weights[d] * score; total += weights[d]; applied.push(d);
    } else excluded.push(d);
  }
  if (!total) return null;
  return { numerator: weighted, denominator: total, display: Math.round((weighted / total) * 10) / 10, applied, excluded,
    normalizedWeights: Object.fromEntries(applied.map(d => [d, Math.round((weights[d] / total) * 1000) / 10])) as Partial<Record<Dimension, number>> };
}

export function bandFor(score: { numerator: number; denominator: number }, bands: QualityBand[]): QualityBand | null {
  let chosen: QualityBand | null = null;
  for (const band of bands) if (score.numerator >= band.minScore * score.denominator) chosen = band;
  return chosen;
}

export interface AwardComputation {
  category: RewardCategory;
  score: number;
  band: BandId | null;
  bandLabel: string;
  multiplierBps: number;
  basePoints: number;
  effortUnits: number;
  effortPoints: number;
  points: number;
  bounded: 'min' | 'max' | null;
  calculation: string;
  appliedDimensions: Dimension[];
  excludedDimensions: Dimension[];
  normalizedWeights: Partial<Record<Dimension, number>>;
}

export function formatMultiplier(bps: number): string {
  return `${(bps / 10000).toFixed(2)}`;
}

/**
 * Points for one assessed contribution. Returns `points: 0` with `band: null`
 * below the lowest band: that is "needs improvement or review", never an
 * automatic zero-point settlement.
 */
export function computeAward(policy: AwardPolicyConfig, category: RewardCategory, scores: DimensionScores, verifiedEffortQuantity = 0): AwardComputation {
  const c = policy.categories[category];
  // Accuracy always applies (parseAwardPolicy requires its weight). Renormalising
  // it away would let completeness and metadata alone reach the top band.
  if (typeof scores.accuracy !== 'number') throw new PolicyError('accuracy', 'Accuracy needs a score from a trusted reference or a validator.');
  const overall = overallScore(scores, c.weights);
  if (!overall) throw new PolicyError('Scores', 'No applicable dimension has a score.');
  const band = bandFor(overall, policy.bands);
  const units = c.effortUnit ? Math.min(Math.floor(Math.max(0, verifiedEffortQuantity) / c.effortUnit.unitSize), c.effortUnit.maxUnits) : 0;
  const effortPoints = c.effortUnit ? units * c.effortUnit.pointsPerUnit : 0;
  const base = {
    category, score: overall.display, basePoints: c.basePoints, effortUnits: units, effortPoints,
    appliedDimensions: overall.applied, excludedDimensions: overall.excluded, normalizedWeights: overall.normalizedWeights,
  };
  if (!band) {
    return { ...base, band: null, bandLabel: 'Needs improvement', multiplierBps: 0, points: 0, bounded: null,
      calculation: `Score ${overall.display} is below ${policy.bands[0].minScore}: no automatic award. A validator decides what happens next.` };
  }
  const raw = Number(roundHalfUp(BigInt(c.basePoints + effortPoints) * BigInt(band.multiplierBps), 10000n));
  const points = Math.min(Math.max(raw, c.minPoints), c.maxPoints);
  const bounded = points > raw ? 'min' : points < raw ? 'max' : null;
  const subject = effortPoints ? `(${c.basePoints} category points + ${effortPoints} verified effort points)` : `${c.basePoints} category points`;
  const calculation = `${subject} × ${formatMultiplier(band.multiplierBps)} ${band.label.toLowerCase()}-quality multiplier = ${raw} points`
    + (bounded === 'max' ? `, capped at the category maximum of ${points}` : bounded === 'min' ? `, raised to the category minimum of ${points}` : '');
  return { ...base, band: band.id, bandLabel: band.label, multiplierBps: band.multiplierBps, points, bounded, calculation };
}

/* ── Redemption quotes ─────────────────────────────────────────────────────── */

export interface QuoteBand { fromPoint: number; toPoint: number; points: number; bonusBps: number; valueMinorExact: string }

export interface RedemptionQuote {
  points: number;
  baseMinor: number;
  bonusMinor: number;
  totalMinor: number;
  bands: QuoteBand[];
  nextBand: { atPoint: number; bonusBps: number } | null;
}

/** Exact value of [points] in pesewas, summed per band and rounded once. */
export function redemptionValueMinor(points: number, policy: RedemptionPolicyConfig): number {
  return quotePoints(points, policy).totalMinor;
}

export function quotePoints(points: number, policy: RedemptionPolicyConfig): RedemptionQuote {
  if (!Number.isSafeInteger(points) || points < 0) throw new PolicyError('Points', 'Points must be a whole number.');
  const denominator = BigInt(policy.basePoints) * 10000n;
  const amount = BigInt(policy.baseAmountMinor);
  let start = 0, totalNumerator = 0n, currentBonus = policy.bands[0]?.bonusBps ?? 0;
  const bands: QuoteBand[] = [];
  let nextBand: RedemptionQuote['nextBand'] = null;
  for (const band of policy.bands) {
    const end = band.upToPoints ?? Number.MAX_SAFE_INTEGER;
    const inBand = Math.max(0, Math.min(points, end) - start);
    if (inBand > 0) {
      const numerator = BigInt(inBand) * amount * BigInt(10000 + band.bonusBps);
      totalNumerator += numerator;
      currentBonus = band.bonusBps;
      bands.push({ fromPoint: start + 1, toPoint: start + inBand, points: inBand, bonusBps: band.bonusBps,
        valueMinorExact: (Number(numerator) / Number(denominator)).toFixed(4) });
    } else if (!nextBand && points <= start && band.bonusBps > currentBonus) {
      // The first later band that actually pays more than the points already entered.
      nextBand = { atPoint: start + 1, bonusBps: band.bonusBps };
    }
    start = end;
    if (start >= Number.MAX_SAFE_INTEGER) break;
  }
  const totalMinor = Number(roundHalfUp(totalNumerator, denominator));
  const baseMinor = Number(roundHalfUp(BigInt(points) * amount * 10000n, denominator));
  return { points, baseMinor, bonusMinor: totalMinor - baseMinor, totalMinor, bands, nextBand };
}

/** The fewest points in [min, max] whose value covers the bundle, or null. */
export function bundlePoints(bundle: DataBundle, policy: RedemptionPolicyConfig): { points: number; valueMinor: number; residualMinor: number } | null {
  let low = policy.minimumPoints, high = policy.maximumPoints;
  if (redemptionValueMinor(high, policy) < bundle.priceMinor) return null;
  if (redemptionValueMinor(low, policy) > bundle.priceMinor) return null;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (redemptionValueMinor(mid, policy) >= bundle.priceMinor) high = mid; else low = mid + 1;
  }
  const valueMinor = redemptionValueMinor(low, policy);
  return { points: low, valueMinor, residualMinor: valueMinor - bundle.priceMinor };
}

/**
 * Proves no two allowed redemptions are together worth more than one of their
 * combined size, after rounding. Exhaustive over every pair whose total stays
 * within min(maximum, 6000); beyond that, non-decreasing bonuses make the
 * pre-rounding value convex, so a split only loses bonus.
 */
export function profitableSplit(policy: RedemptionPolicyConfig): { a: number; b: number; total: number } | null {
  const limit = Math.min(policy.maximumPoints, 6000);
  if (limit < policy.minimumPoints * 2) return null;
  const table = new Array<number>(limit + 1);
  for (let p = policy.minimumPoints; p <= limit; p++) table[p] = redemptionValueMinor(p, policy);
  for (let a = policy.minimumPoints; a * 2 <= limit; a++) {
    for (let b = a; a + b <= limit; b++) {
      if (table[a] + table[b] > table[a + b]) return { a, b, total: a + b };
    }
  }
  return null;
}

export function formatGhs(minor: number): string {
  return `GH₵${(minor / 100).toFixed(2)}`;
}

/* ── Liability ─────────────────────────────────────────────────────────────── */

/**
 * What outstanding balances could cost at the current rate. `atBase` ignores
 * bonuses; `ifRedeemedWhole` assumes each balance is redeemed in as few
 * maximum-sized requests as possible — the most the bonus could add.
 */
export function liabilityEstimate(balances: number[], policy: RedemptionPolicyConfig) {
  let atBase = 0, ifRedeemedWhole = 0, belowMinimumPoints = 0, points = 0;
  for (const balance of balances) {
    if (!Number.isSafeInteger(balance) || balance <= 0) continue;
    points += balance;
    atBase += quotePoints(balance, policy).baseMinor;
    let left = balance;
    while (left >= policy.minimumPoints) {
      const take = Math.min(left, policy.maximumPoints);
      ifRedeemedWhole += redemptionValueMinor(take, policy);
      left -= take;
    }
    if (left > 0) { belowMinimumPoints += left; ifRedeemedWhole += quotePoints(left, policy).baseMinor; }
  }
  return { accounts: balances.filter(b => b > 0).length, points, atBaseMinor: atBase, upperMinor: ifRedeemedWhole, belowMinimumPoints };
}
