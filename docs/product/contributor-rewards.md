# Contributor points, assessments and redemptions

Status (2026-10-10): implemented and verified locally (unit, emulator and
browser checks below). **Not deployed.** Nothing here has been published or
switched on in production. Every number in the default policies is a
**proposed calibration setting**, not measured evidence of Kasem data quality
and not a proven sustainable payout rate.

## What changed

| Before | Now |
| --- | --- |
| Every approved expression credited a flat `pointsPerExpression` (10) into `contributorAccounts.rewardBalance`, capped at 300 a day. | A fluent validator confirms each revision as training data on TribeStudio's **Rewards** desk. Points = category base × quality multiplier, bounded, explained, and settled in an append-only ledger. |
| `rewardBalance` was a number the backend overwrote. | `pointLedger` rows + a `contributorPointAccounts` summary written in the same transaction. Legacy fields are frozen after one opening entry. |
| Redemption: GH₵5 per 300 points, linear, one card. | Any whole number of points from the minimum; marginal bonus bands within one redemption; a server quote the contributor confirms. |
| Admin approves → fulfils. | Finance approves → records delivered / definitive failure / unclear (held for reconciliation). Points are reserved, settled or released exactly once. |

Publication review (Contributions desk, `decideSubmission`), training-data
assessment (Rewards desk) and reward settlement (ledger) are **three separate
decisions**. An expression can be training-ready without being published and
published without being training-ready. "Training-ready" means eligible for
the curated dataset (`contributorTrainingPairs`); it never means Kawuri has
been trained on it.

The leaderboard (`contributorScores`) is unchanged and is not spendable.

## Categories

The policy uses the project's existing `CollectionKind` taxonomy
(`services/functions/src/publication.ts`). Only **expressions** are collected
and paid through the invited contributor portal today, so only that category
is enabled by default.

| Category | Enabled | Base | Min–max | Weights (accuracy / completeness / technical / metadata) | Effort unit |
| --- | --- | --- | --- | --- | --- |
| Everyday expression | yes | 20 | 20–40 | 50 / 25 / 10 / 15 | — |
| Dictionary word | no | 15 | 15–30 | 50 / 25 / 10 / 15 | — |
| Story or written piece | no | 30 | 30–90 | 40 / 30 / 10 / 20 | +5 per 5 verified source segments, max 6 |
| Song recording | no | 30 | 30–90 | 35 / 20 / 30 / 15 | +5 per 30 s verified aligned speech, max 8 |
| Aligned speech recording | no | 40 | 40–120 | 35 / 25 / 25 / 15 | +5 per 30 s, max 10 |
| Video with captions | no | 40 | 40–120 | 35 / 25 / 25 / 15 | +5 per 30 s, max 10 |

## Award formula

1. **Gates first** (never scores): training permission recorded on this
   revision, not withdrawn, category rewarded, required media present. An
   exact copy of an accepted record needs an explicit, reasoned
   "distinct variant" decision.
2. **Score** each applicable dimension 0–100. A dimension with weight 0, or no
   score, is excluded and the remaining weights are renormalised:
   `score = Σ wᵢ·sᵢ / Σ wᵢ` over applied dimensions. **Accuracy always
   applies** — it cannot be renormalised away (a defect found in end-to-end
   testing: without this, completeness and metadata alone reached the top band).
3. **Band**: below 60 → no automatic award (the validator asks a question or
   explains); 60–79 standard ×1.00; 80–89 strong ×1.25; 90–100 exceptional ×1.50.
   Bands are compared exactly (`Σwᵢsᵢ ≥ min·Σwᵢ`), not on a rounded score.
4. **Points** = `round_half_up((base + verified effort) × multiplier)`, then
   clamped to the category min/max. Multipliers are integer basis points.

Example shown to the contributor: *“20 category points × 1.25 strong-quality
multiplier = 25 points.”*

Not rewarded: length, repetition, alternatives lists, expensive equipment,
model familiarity, volume. Effort counts only validator-confirmed aligned
speech or source segments, capped. Sentences split from one source are effort
units on one award, never separate contributions.

**One effective award per contribution.** Awards are keyed by the original
item (`contributionKey` = sha256 of `uid/work/item`), shared by every revision.
An edit opens a new assessment revision; a later, higher confirmation settles
the difference as an `award_adjustment`. A reduction happens only through an
explicit, reasoned validator decision. Finance adjustments are separate,
reasoned ledger entries.

## Redemption formula

Base value: **300 points = GH₵5.00**. Within one redemption:

| Points in this redemption | Bonus on those points only |
| --- | --- |
| 1–300 | 0% |
| 301–900 | +5% |
| 901–1,800 | +10% |
| above 1,800 | +15% |

`value = round_half_up( Σ_band pointsᵢ × 500 × (10000 + bonusᵢ) / (300 × 10000) )`
in pesewas, computed with BigInt over a common denominator and rounded once.

| Points | Base | Bonus | Total |
| --- | --- | --- | --- |
| 300 | GH₵5.00 | GH₵0.00 | **GH₵5.00** |
| 900 | GH₵15.00 | GH₵0.50 | **GH₵15.50** |
| 1,800 | GH₵30.00 | GH₵2.00 | **GH₵32.00** |
| 3,000 | GH₵50.00 | GH₵5.00 | **GH₵55.00** |

The bands restart with every redemption, so combining points into one larger
request gives a slightly better effective rate. **Splitting can never pay
more:** with non-decreasing bonuses the pre-rounding value is convex, and
`parseRedemptionPolicy` additionally checks every pair of allowed amounts up to
6,000 points after rounding and refuses a policy where `v(a) + v(b) > v(a+b)`.
(A minimum below the first band end, e.g. 100 points, would let two rounded
halves beat the whole by a pesewa — refused.)

Defaults: minimum 300 points (GH₵5.00 — the existing legacy minimum; Finance
should confirm it suits the top-up channel it uses), maximum 6,000 points per
request (GH₵112.50), quote valid 15 minutes, no monthly budget cap, airtime on
MTN/Telecel/AT, **no data bundles** (data is offered only once Finance enters
real bundles; the quote then shows the bundle price and any value above it
that is not paid out). No cash or MoMo withdrawal exists.

## Fulfilment and the ledger

```
quote ──► redeem: reservation (available −N, reserved +N)
            ├─ cancel / reject ─────────────► release   (reserved −N, available +N)
            └─ approve ─► record delivered ─► settlement (reserved −N)
                       ├─ definite failure ─► release
                       └─ outcome unclear ──► needs_reconciliation (still reserved)
                                               ├─ delivered ─► settlement
                                               └─ definite failure ─► release
```

* Ledger entry ids are deterministic (`reserve_<id>`, `release_<id>`,
  `settle_<id>`, `award_<contributionKey>` …): retries and repeated events
  move nothing twice. Firestore transactions serialise racing redemptions.
* A timeout is never a refund. A provider success that arrives after a
  definitive failure is reported (`late-success-after-release`) for a Finance
  adjustment; it is not paid again (`providerOutcome()`).
* One open request per contributor. Accepted requests keep their quoted
  value, policy id and version, base/bonus breakdown and destination.
* Legacy requests (no `settlementPath`) keep their original value; their points
  had already left `rewardBalance`, so they settle as `legacy_settlement` or
  return as `legacy_refund`.

There is **no airtime/data provider integration**. Fulfilment is manual:
Finance tops up outside the system and records the reference. Nothing is
marked delivered because a screen accepted it.

## Statuses

Contributor-facing assessment: Assessing → Under validator review → Needs
clarification → Eligible / Not eligible (with reason) → Points awarded;
"Review requested" while a contributor's review request is open. Pending
estimates are labelled *estimate, not spendable* and never touch the balance.

Redemption: Waiting for Finance · Approved, awaiting top-up · Checking
delivery · Delivered · Not delivered, points returned · Declined, points
returned · Cancelled, points returned.

## Roles

| Action | Who | Enforced by |
| --- | --- | --- |
| Quote, redeem, cancel own pending, answer/request review | active invited contributor (own records) | callables |
| Training-data decision | validator / reviewer / admin, never on own work | `decideRewardAssessment` |
| Read assessments | validators | Firestore rules |
| View Finance, ledger, audit | admin | callables |
| Decide redemptions, save policies, change flags, adjust points | **finance claim on an admin, or super admin** | `requireFinance` |
| Ledger, accounts, quotes, policies, budgets, jobs, awards | backend only | Firestore rules deny every client |

Grant the claim: `node services/functions/scripts/grant-finance-claim.mjs
--project PROJECT --email … --commit` (dry run without `--commit`). As of
2026-09-23 nobody held it; super admins already pass.

## Python assessment worker

`services/assessment-worker` — Firebase Functions (Python 3.14) codebase
`assessment`, deployed separately with `firebase.assessment.json`. It runs only
when the backend creates `contributionAssessmentJobs/{jobId}` (clients cannot),
leases the job, and writes a result the backend validates again
(`validateWorkerResult`) before anything reaches an assessment.

Checks: schema and bounded sizes; encoding (�, mojibake, invisible and control
characters); Ghana Kasem orthography flags from the BGL 1997 rules in
`data/orthography-seed/rules.json` (confusables such as Greek ε for ɛ,
phonetic ɩ/ʋ/ɣ, foreign diacritics, old `ng`; none applied to Burkina or
unknown varieties); exact/near duplicates against accepted records and pending
work, reported by scope (accepted, same account, other account); English
copied into the Kasem field; usage context; audio duration, speech energy,
clipping, silence (PCM WAV natively, other formats via ffmpeg); an identical
audio file across submissions.

Kawuri (Vertex AI Gemini, `KAWURI_MODEL`/`KAWURI_LOCATION`, runtime service
account, no key) receives only the text, meaning, context and trusted
reference snippets — never identities. Submitted text is JSON-encoded inside a
delimited block marked untrusted; the reply must match a strict schema; its
accuracy proposal is capped at 79 and labelled `model-proposal`. If Kawuri is
off, unavailable, uncertain or invalid, accuracy is left unscored for the
validator — no estimate, never a full or a zero award. Uncertainty is reported
separately from quality; self-reported confidence is shown as such.

Local: `cd services/assessment-worker && python -m unittest discover -s tests`;
`python -m assessment_worker.cli assess examples/job.example.json`;
`python -m assessment_worker.cli run-job JOB_ID --project demo-indigen-world`
with `FIRESTORE_EMULATOR_HOST` set. See its README for deployment.

## Rollout

Flags in `settings/contributorRewardSystem` (Finance → Reward policies → Rollout):

* `awardMode`: `legacy-flat` (default) pays the old flat amount on publication
  approval **into the ledger**; `assessed` pays only validator-confirmed
  assessments. Both use the same per-contribution key and each refuses a
  contribution the other paid, so switching cannot double-award. Switching to
  `assessed` settles already-confirmed assessments (legacy-paid ones are
  marked "not paid again").
* `assessmentWorker`: `off` (default) / `on`.
* `redemptionsOpen`: kill switch for new requests.
* Automatic settlement: locked off until a reviewer-labelled shadow
  calibration is recorded. Agreement between the worker's band and the
  validator's is tracked on every decision (`calibration.agreed`).

Order:

1. **Back up**: `gcloud firestore export gs://<bucket>/backups/points-ledger-<date>
   --collection-ids=contributorAccounts,contributorRedemptions,rewardCredits,settings`.
2. Deploy rules + indexes (`firebase deploy --only firestore:rules,firestore:indexes`).
3. `npm run build:functions`, then deploy functions by explicit list with
   `FUNCTIONS_DISCOVERY_TIMEOUT=180` (see the deploy-manifest notes):
   new — `quoteContributorRedemption, cancelContributorRedemption, getRewardPolicies,
   previewRewardPolicy, saveRewardPolicy, setRewardSystemFlags, getContributorPointsLedger,
   adjustContributorPoints, listRewardAudit, onSubmissionForReward, onAssessmentJobWritten,
   sweepAssessmentJobs, decideRewardAssessment, respondToRewardAssessment`;
   changed — `setContributorRewardSettings, getContributorRewards, redeemContributorPoints,
   listContributorRewards, decideContributorRedemption, onContributorExpressionReviewed`
   (`--force`: it has a retry policy). New callables: probe unauthenticated for
   "Sign in is required." (an HTML 403 means the public invoker is missing).
4. Deploy TribeStudio and admin hosting together right after (an older
   TribeStudio bundle still renders balances but its redeem call is refused
   with "Reload this page").
5. Migration dry run: `node services/functions/scripts/migrate-points-ledger.mjs
   --project PROJECT --report ../ledger-dry-run.json` (keep the report outside
   Git — it is per account). Review discrepancies; then `--commit`.
6. Grant the finance claim; Finance reviews the proposed policies.
7. Deploy the worker (optional) and set `assessmentWorker: on`.
8. Switch `awardMode: assessed` when validators are ready to use the Rewards desk.

**Rollback**: `migrate-points-ledger.mjs --rollback` writes each ledger's
available points and lifetime back into the legacy fields (the previous system
deducted points on request, so available is the right balance), marks the
ledger accounts `rolledBackAt` and keeps every entry. Redeploy the previous
functions only after it. A later `--commit` reconciles any changes the old
system made while restored as a reasoned adjustment.

## Walkthrough (local emulator, real handlers)

`services/functions/scripts/dev/seed-rewards-ui.mjs` drives the real code:

1. Contributor A starts with a legacy `rewardBalance` of 2,400 (lifetime 2,700).
2. They submit five expressions through `saveExpressionAnswer`; each opens an
   assessment; the Python worker runs every job from Firestore.
3. A validator confirms three: scores 84 → strong → 20 × 1.25 = **25**; 95/95/92/90 →
   exceptional → **30**; 75/70/90/80 → standard → **20**; asks a question on the
   fourth; the fifth matches an accepted record and waits for a variant decision.
   The first ledger operation opened the account at 2,400 from the legacy field.
4. Available: 2,400 + 75 = 2,475. They redeem **900 → GH₵15.50** (GH₵15.00 + GH₵0.50):
   reservation, Finance approves, records the reference → settlement. Available 1,575.
5. In the browser the contributor redeems another 900 (reserved; available 675),
   the validator confirms the fifth as a distinct variant (+30 → 705), and
   Finance reconciles Contributor C's unclear top-up as delivered.

Dev harness: `services/functions/scripts/dev/callable-bridge.mjs` serves all
compiled callables on :5001 against the Auth/Firestore emulators (the
Functions emulator cannot load the bundle on Node 24).

## Verification (2026-10-10)

* `firebase/tests/rewardPolicy.test.mjs` — 19 tests: the four values, every
  boundary, half-up rounding, exhaustive split check, bundles, bands,
  renormalisation, accuracy-always-applies, effort caps, locked flags, ledger
  arithmetic, transitions, provider outcomes, liability, Python contract and
  the browser copy staying identical.
* `firebase/tests/contributorRewards.integration.test.mjs` (Firestore emulator,
  real transactions) — 14 tests: idempotent retries, three-way race (one
  reservation), forged/stale/expired quotes and policy change, Finance
  lifecycle, cancellation, legacy settlement, adjustments, self-review,
  gates/duplicates/clarification, flat→assessed with no double award,
  revisions, worker validation and outage, migration dry run/commit/rerun/
  rollback/re-migration, and Node → Python → Node end to end.
* `firebase/tests/contributorPortal.test.mjs` (31) and
  `contributorPortal.rules.test.mjs` (9) pass; worker `unittest` (21) passes,
  including the Python port against 70 TypeScript vectors.
* TribeStudio and admin typecheck, build and their own suites pass; desktop
  (1440) and phone (390) checked with no horizontal overflow.

## Known limits and open requirements

* No automated airtime/data provider; manual Finance fulfilment only.
* Data bundles must be entered by Finance from a real channel before data is offered.
* Defaults need calibration with reviewer-labelled samples and budget.
* The finance claim must be granted to whoever decides redemptions.
* Production deploy, migration, worker deployment (and Vertex AI User on its
  runtime service account) and a signed-in production check are not done.
* Only invited-portal expressions are rewardable; other categories exist in
  the policy but nothing routes them yet.
