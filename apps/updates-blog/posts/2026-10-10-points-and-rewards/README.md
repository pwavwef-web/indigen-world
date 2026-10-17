# Clearer points, fairer rewards and flexible redemptions

Status: **Deployed October 10, 2026 from `f9443fd`. New redemptions are live at the proposed default rates. Quality-based awards and the assessment worker are deployed but not switched on. Blogger article unpublished.**

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

Live since October 10 (see evidence below): rules, indexes, 20 functions,
TribeStudio, admin and the Python worker. Contributors now redeem through the new
quote-and-confirm flow with the bonus bands; awards still follow the previous
10-point rule (now recorded in the ledger) until Finance switches `awardMode` to
assessed. Still pending: Finance review of the proposed rates, granting the finance
permission (Finance decisions now require it), switching on the worker and assessed
awards, the optional bulk ledger opening (accounts open on first use anyway), and a
signed-in production check. There is no automated airtime or data provider — Finance
tops up by hand — and mobile data needs real bundles entered by Finance. **Do not
announce quality-based awards until they are switched on.**

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
| `screens/contributor-rewards-desktop.png` | Points & rewards page with an opened award explanation and the redeem card. |
| `screens/contributor-awards-mobile.png` | Recent awards on a phone, including an estimate and a clarification. |
| `screens/contributor-rewards-mobile.png` | Redeem card on a phone: 900 points → GH₵15.50. |
| `screens/contributor-confirm-desktop.png` | Server quote confirmation dialog. |
| `screens/validator-rewards-desk.png` | **Not used: the capture is a TribeStudio loading screen, so the figure was removed from the article. Recapture the desk before reinstating it.** Intended content: | Validator Rewards desk with gates, automatic checks and the decision form. |
| `screens/finance-overview.png` | Admin Finance overview with liability and rollout state. |
| `screens/finance-reconcile.png` | A redemption awaiting reconciliation. |
| `screens/finance-policies.png` | Redemption rate editor with example quotes. |

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

## Release evidence

- Commit: `f9443fd` on `main` (pushed October 10, 2026).
- Pre-deploy production snapshot (read-only migration dry run, 11:37 UTC): 13
  contributor accounts, 1,650 available points, lifetime 2,150 = sum of credit
  records, 0 open legacy requests, 0 discrepancies.
- Firestore rules released; five indexes deployed (one unrelated index exists in the
  project but not in the file; it was not deleted).
- Functions (explicit list, `--force`): 14 created, 6 updated; live count 199 → 213,
  none removed. Every new callable answered an unauthenticated probe with its own
  message ("Sign in is required." / "admin access is required.").
- Hosting: `tribestudio` and `indigen-admin` released; tribestudio.indigenworld.com
  and admin.indigenworld.com serve chunks containing the new UI (`ContributorPortal-CcZHEfku.js`, admin `index-KbUwJfMj.js`).
- Python worker `run_assessment_job`: ACTIVE, GEN_2, python314, Firestore
  `document.created` trigger, runtime service account with `roles/editor`,
  `ASSESSMENT_KAWURI=vertex`. Not invoked until `assessmentWorker` is switched on.
- Not yet: Finance rate review, finance permission granted, flags switched,
  signed-in production checks, Blogger publication date and URL.

## Visual design (refreshed October 11, 2026)

- Branded art for Blogger: `images/cover.png`, `images/contributor-rewards-desktop.jpg`, `images/contributor-awards-mobile.jpg`, `images/contributor-rewards-mobile.jpg`, `images/contributor-confirm-desktop.jpg`, `images/finance-overview.jpg`, `images/finance-reconcile.jpg`, `images/finance-policies.jpg`. Each is the unaltered product screenshot set in a phone, browser or card frame on an Indigen World backdrop with a title. The frame, backdrop and titles are illustration; the screen contents are real.
- Original screenshots (unaltered, with the credits and test-data labels above) are in `screens/`. Captions in `post.html` still describe what each screenshot shows, including test accounts and sample data.
- Regenerate after editing `art.json` (titles, tags, colours, which screens appear): `node apps/updates-blog/scripts/render-post-art.mjs 2026-10-10-points-and-rewards`
- Blogger: upload `cover.png` first (it becomes the card/share image), then each framed JPG. Replace each relative `src` in `post.html` with its Blogger-hosted URL.

## Blogger publication — 11 October 2026

Published to Indigen World Updates through the owner-authorised Edge session, with the prepared cover, framed figures, captions and availability limits. Article publication does not change the product release or approval status described above.

Published article: https://updates.indigenworld.com/2026/10/points-and-rewards.html
