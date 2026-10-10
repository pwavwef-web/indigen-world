import type { DocumentReference, DocumentSnapshot, Firestore, Transaction } from 'firebase-admin/firestore';
import {
  type AwardPolicyConfig,
  type PolicyRecord,
  type RedemptionPolicyConfig,
  defaultPolicyRecord,
  parseAwardPolicy,
  parseRedemptionPolicy,
} from './reward-policy.js';

/**
 * Feature flags and the active, versioned reward policies.
 *
 *   settings/contributorRewardSystem   { flags, awardPolicyId, redemptionPolicyId }
 *   rewardPolicies/{policyId}          immutable versions, newest active
 *
 * Flags (all changed only by Finance, audited):
 *   awardMode         'legacy-flat' pays the old flat amount on publication
 *                     approval (into the ledger); 'assessed' pays only on a
 *                     validator-confirmed training-data assessment. Exactly one
 *                     is ever active, and both use the same idempotency key per
 *                     contribution, so a switch cannot pay one contribution twice.
 *   assessmentWorker  'on' queues jobs for the Python assessment worker; 'off'
 *                     sends every assessment straight to a validator.
 *   redemptionsOpen   kill switch for NEW redemption requests. Open requests
 *                     still drain through Finance.
 */

export const SYSTEM_DOC = 'settings/contributorRewardSystem';
export const POLICIES = 'rewardPolicies';
export const AUDIT_DOMAIN = 'contributor-rewards';

export type AwardMode = 'legacy-flat' | 'assessed';
export interface RewardFlags {
  awardMode: AwardMode;
  assessmentWorker: 'off' | 'on';
  redemptionsOpen: boolean;
}

export const DEFAULT_FLAGS: RewardFlags = { awardMode: 'legacy-flat', assessmentWorker: 'off', redemptionsOpen: true };

export function readFlags(data: Record<string, unknown> | undefined): RewardFlags {
  const flags = (data?.flags ?? {}) as Record<string, unknown>;
  return {
    awardMode: flags.awardMode === 'assessed' ? 'assessed' : 'legacy-flat',
    assessmentWorker: flags.assessmentWorker === 'on' ? 'on' : 'off',
    redemptionsOpen: flags.redemptionsOpen !== false,
  };
}

export interface RewardSystem {
  flags: RewardFlags;
  award: PolicyRecord<AwardPolicyConfig>;
  redemption: PolicyRecord<RedemptionPolicyConfig>;
}

type Reader = (ref: DocumentReference) => Promise<DocumentSnapshot>;

function policyFrom<T>(snapshot: DocumentSnapshot | null, kind: 'award' | 'redemption'): PolicyRecord<T> {
  if (!snapshot?.exists) return defaultPolicyRecord<T>(kind);
  const data = snapshot.data() as PolicyRecord<unknown>;
  // Re-validated on every read: a hand-edited document cannot smuggle in an
  // unsafe rate. A broken stored policy fails loudly rather than paying wrongly.
  const config = (kind === 'award' ? parseAwardPolicy(data.config) : parseRedemptionPolicy(data.config)) as T;
  return { id: snapshot.id, kind, version: Number(data.version), config, basis: data.basis === 'finance-set' ? 'finance-set' : 'proposed-default',
    createdAt: String(data.createdAt ?? ''), createdBy: String(data.createdBy ?? ''), reason: String(data.reason ?? '') };
}

/** Loads flags and both active policies, through a transaction when given one. */
export async function loadRewardSystem(db: Firestore, tx?: Transaction): Promise<RewardSystem> {
  const read: Reader = ref => (tx ? tx.get(ref) : ref.get());
  const system = await read(db.doc(SYSTEM_DOC));
  const awardId = system.get('awardPolicyId');
  const redemptionId = system.get('redemptionPolicyId');
  const [award, redemption] = await Promise.all([
    typeof awardId === 'string' && awardId ? read(db.collection(POLICIES).doc(awardId)) : Promise.resolve(null),
    typeof redemptionId === 'string' && redemptionId ? read(db.collection(POLICIES).doc(redemptionId)) : Promise.resolve(null),
  ]);
  return {
    flags: readFlags(system.data()),
    award: policyFrom<AwardPolicyConfig>(award, 'award'),
    redemption: policyFrom<RedemptionPolicyConfig>(redemption, 'redemption'),
  };
}

/** The audit row every reward action writes; `domain` makes the history one indexed query. */
export function rewardAudit(input: {
  actor: { collection: string; id: string };
  action: string;
  target: { collection: string; id: string };
  before?: unknown;
  after?: unknown;
  reason?: string;
  metadata?: Record<string, unknown>;
  at: string;
}) {
  return {
    domain: AUDIT_DOMAIN, actor: input.actor, action: input.action, target: input.target,
    outcome: 'success', source: 'functions', before: input.before ?? null, after: input.after ?? null,
    reason: input.reason ?? '', metadata: input.metadata ?? {}, occurredAt: input.at,
  };
}
