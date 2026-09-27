# Everyday expressions

Repository status: implemented and tested on 2026-09-27; **not deployed**. See
"Going live" below.

The first contribution task anybody can do today: share one everyday Kasem expression —
a greeting, blessing, idiom or saying — with what it means, when it is said and who it
came from. A Kasem-speaking reviewer approves it or says why not, and the contributor can
see which has happened.

## Why expressions are not dictionary words

Expressions used to be filed as dictionary contributions (`collectionKind: 'dictionary'`,
`lexicalKind: 'phrase'`) and published into `dictionaryEntries`. There the whole phrase
became a headword: it got a `headwordKey`, was numbered against homographs, counted in a
contributor's `wordCount`, and appeared among words — while the situation it is said in
had nowhere to live.

Now an expression is its own kind, `collectionKind: 'expressions'`. It goes through the
same review machinery as every contribution (receipt in `collectionContributions`,
canonical record in `submissions`, `decideSubmission`, `withdrawCollectionContribution`)
and publishes into its own public collection, **`expressionEntries/expr_<submissionId>`**
(contract: `packages/contracts/schemas/expression-entry.schema.json`). It is never split
into words, numbered or counted as a word.

## The flow

| Step | Where | What is recorded |
| --- | --- | --- |
| Entry | Website home hero and "Contribute Kasem" path → `/contribute` | Nothing; the page explains the task and review, and links to the form |
| Send | TribeStudio `/studio/expressions` → `submitExpression` | Phrase (Kasem), kind (phrase/idiom/proverb), meaning (English), optional literal reading, context, dialect, source type + detail + optional speaker name, the fixed consent statements confirmed, publication choice, optional AI-training opt-in |
| Status | "Your expressions" (reads the member's own receipts) | `submitted` → `under_review` (escalated) → `approved` → `published`, or `rejected` with the reviewer's reason, `archived` (approved, not cleared to publish), `withdrawn` |
| Review | Admin → Review Desk (and the mobile review desk) | Approve, reject with a reason, escalate; **Publish expression** writes `expressionEntries` |
| Correct | "Correct and send again" on a rejected expression | A new submission with `revisionOf` pointing at the declined one (only its author, only when rejected) |
| Withdraw | "Withdraw" / "Take it down" | Receipt and submission `withdrawn`; the public entry `isPublished: false` |

Notifications: an in-app notice on sending; decisions notify in-app and by e-mail, with
wording specific to expressions, linking to `/studio/expressions`.

Source types are `self`, `family`, `elder`, `community`, `written`, `recording`
(`invited-speaker` is server-assigned for the invited workspace). The consent sentence a
contributor confirms depends on the source type and is stored from the server's own copy
(`EXPRESSION_SOURCE_CONSENT` in `services/functions/src/expressions.ts`), so the record
says exactly what was agreed. `written` and `recording` sources are declared third-party
material.

## Invited contributors

`saveExpressionAnswer` now files portal translations as expressions too (source type
`invited-speaker`, consent version `contributor-expression-v1`). Portal expressions
already published into `dictionaryEntries` stay there: `publicationTargetFor` honours the
recorded publication, so unpublishing or withdrawing reaches the live row, and
re-publishing one moves it to `expressionEntries`. No bulk migration was run.

## Points

An accepted expression earns 10 points, what a dictionary word earns and what portal
expressions earned before, so no existing total changes. It is counted in
`approvedCount` and `otherCount`, never in `wordCount`. The website and TribeStudio no
longer pitch points; they lead with the task and the review.

## Public reads

The website's Contribute page lists published expressions with
`where('isPublished', '==', true)` on `expressionEntries` — no composite index — and shows
an honest empty state until the first one is published. Firestore rules: published rows
are world-readable, others staff-only, no client writes.

## Tests

- `firebase/tests/expressions.test.mjs` — parsing, consent, routing, projection against
  the contract (in `npm run test:function-helpers`).
- `firebase/tests/expressionFlow.e2e.test.mjs` — emulator lifecycle (in `npm run test:e2e`).
- `firebase/tests/firestore.rules.test.mjs` — the `expressionEntries` rule.
- `firebase/tests/contributorPortal.test.mjs` — portal expressions filed as expressions.
- `apps/tribestudio/scripts/workflows.test.mjs` and `validate-studio.mjs`; website
  `validate-site.mjs`.

## Going live

1. Firestore rules (new `expressionEntries` block).
2. Functions: `submitExpression` (new), `decideSubmission`, `withdrawCollectionContribution`,
   `submitCollectionContribution`, `saveExpressionAnswer`, `onContributorExpressionReviewed`,
   `awardContributorPoints`.
3. Hosting: website, TribeStudio, admin.
4. Signed-in smoke test: send, approve, publish, see it on `/contribute`, withdraw.

## Not done yet

- The mobile app's own proverb/idiom contributions still publish to `dictionaryEntries`,
  and its "Your submissions" list labels web expressions as dictionary entries until an
  app build learns the new kind.
- There is no public page per expression yet; the Contribute page lists the latest.
