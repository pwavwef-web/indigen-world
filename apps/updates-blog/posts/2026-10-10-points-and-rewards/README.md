# Clearer points, fairer rewards and flexible redemptions

Status: **Implemented and verified locally on October 10, 2026. Not deployed. Not switched on. Blogger article unpublished.**

- Title: Clearer points, fairer rewards and redemptions you choose
- Labels: Contributors, TribeStudio, Rewards, Kasem, Training Data, Feature
- Search description: Contributor points now reward validator-checked, useful Kasem data with clear calculations, and you can redeem any number of points with gradual bonuses.
- Suggested permalink: points-and-rewards
- Article: `post.html`
- Sharing copy: `share.md`
- Technical record: [docs/product/contributor-rewards.md](../../../../docs/product/contributor-rewards.md)

## Scope and release status

Implemented in the repository (uncommitted):

- Backend (`services/functions`): versioned award and redemption policies, an
  append-only points ledger with lazy opening from legacy balances, training-data
  assessments with validator decisions, quote-based redemptions with reservations,
  Finance fulfilment states (including reconciliation), adjustments, audit history,
  a migration script with dry run and rollback, and a finance-claim grant script.
- Python assessment worker (`services/assessment-worker`) with Kawuri-assisted review,
  deployable as its own Firebase Functions codebase.
- TribeStudio: contributor Points & rewards page and a validator Rewards desk.
- Admin: Finance overview with liability, redemption desk, reward policy editors,
  rollout switches, points ledger and audit history.
- Firestore rules and five indexes.

Not done: deployment of rules, indexes, functions, the worker and hosting; the
production migration; granting the finance claim; Finance calibration of the
proposed rates; a signed-in production check. There is no automated airtime or
data provider — Finance tops up by hand. Mobile data needs real bundles entered by
Finance. **Do not describe this as live until the release evidence below is filled in.**

The rates, multipliers and category points are proposed calibration settings, not
measured evidence or an approved budget. Update the article if Finance changes them.

## Verification

- `firebase/tests/rewardPolicy.test.mjs` (19), `contributorRewards.integration.test.mjs`
  (14, Firestore emulator, real transactions incl. concurrency, migration and a
  Node → Python → Node run), `contributorPortal.test.mjs` (31),
  `contributorPortal.rules.test.mjs` (9) and the worker's Python tests (21) pass.
- TribeStudio and admin typecheck, build and their own suites pass.
- Browser checks at 1440px and 390px against the real compiled callables (local
  bridge) and emulators: redemption quote → confirm → reserved; validator variant
  confirmation → settled; Finance reconciliation → delivered; policy preview; ledger.
  No horizontal overflow.

## Images and credits

All images are actual screenshots of the local build with labelled emulator test
accounts ("Local test · …"), captured October 10, 2026 with headless Chrome. Kasem
text shown is a bracketed placeholder (`[Local test Kasem 5]`); no Kasem was invented.
Phone numbers are test numbers. Credit: Indigen World product interface.

| Asset | Content |
| --- | --- |
| `images/contributor-rewards-desktop.png` | Points & rewards page with an opened award explanation and the redeem card. |
| `images/contributor-awards-mobile.png` | Recent awards on a phone, including an estimate and a clarification. |
| `images/contributor-rewards-mobile.png` | Redeem card on a phone: 900 points → GH₵15.50. |
| `images/contributor-confirm-desktop.png` | Server quote confirmation dialog. |
| `images/validator-rewards-desk.png` | Validator Rewards desk with gates, automatic checks and the decision form. |
| `images/finance-overview.png` | Admin Finance overview with liability and rollout state. |
| `images/finance-reconcile.png` | A redemption awaiting reconciliation. |
| `images/finance-policies.png` | Redemption rate editor with example quotes. |

## Blogger handoff

1. After deployment and live checks, record them below and update the opening
   preview notice and `share.md` only where true.
2. Create a Blogger draft with the title, labels, search description and permalink above.
3. Upload the eight images through Blogger and copy each hosted URL.
4. Paste `post.html` in HTML mode; replace each `images/...` source with its hosted
   URL. Keep the alt text and captions. Keep phone images narrow (max 420px).
5. Preview desktop and phone layouts; check every number against the active policy
   (Finance may have recalibrated it).
6. Publication and sharing remain with Chinedum. After publishing, paste the URL into
   `share.md` and record it here.

## Release evidence to complete

- Deployed commit, functions list and time: pending
- Rules and indexes deployed: pending
- Migration dry-run report reviewed and committed: pending
- Finance claim granted to: pending
- Worker deployed and switched on: pending
- Award mode switched to assessed: pending
- Signed-in production checks (contributor, validator, Finance): pending
- Blogger publication date and article URL: pending
