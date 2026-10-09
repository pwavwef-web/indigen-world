# Share a Kasem expression: one clear way to contribute

Status: **Draft article. Implemented and tested locally on 2026-09-27; NOT deployed.
Nothing is live, published or shared.** The article describes the feature as available,
so it must not be published until the deployment and smoke test below are done.

| Field | Value |
|---|---|
| Topic | A clearer website entry point (separate Learn and Contribute paths), the Everyday Kasem expressions campaign page, the TribeStudio expression form with visible review status, expressions published as expressions rather than dictionary words, and the removal of placeholder bounty figures and the points pitch |
| Title | Share a Kasem expression: one clear way to contribute |
| Labels | `Contributors`, `Kasem`, `Website`, `TribeStudio`, `Feature` |
| Search description | Speak Kasem? Share an everyday expression with its meaning, context and source, follow its review, and see it published whole — never split into words. |
| Custom permalink | `share-a-kasem-expression` |
| Cover | `cover.png` (1200×630) |
| Article | `post.html` |
| Sharing copy | `share.md` |

## Images

Upload them in this order. The first image is the share card.

| # | File | Size | What it shows | Placeholder in `post.html` |
|---|---|---|---|---|
| 1 | `cover.png` | 1200×630 | The Contribute page in a browser and "Your expressions" on a phone | `REPLACE-WITH-UPLOADED-cover.png` |
| 2 | `images/on-a-phone.jpg` | 1600×1150 | The front page's two paths, and expression statuses | `REPLACE-WITH-UPLOADED-on-a-phone.jpg` |
| 3 | `images/campaign-page.jpg` | 1600×1060 | The top of indigenworld.com/contribute | `REPLACE-WITH-UPLOADED-campaign-page.jpg` |
| 4 | `images/the-task.jpg` | 1600×1060 | "One expression, five things" | `REPLACE-WITH-UPLOADED-the-task.jpg` |
| 5 | `images/share-an-expression.jpg` | 1600×1060 | The TribeStudio form beside the review process | `REPLACE-WITH-UPLOADED-share-an-expression.jpg` |

Every image has alt text and a caption in `post.html`.

**Where the pictures come from.** The website screens are the real pages from the
website dev server. The TribeStudio screens are the real expressions page rendered by
`mockups/studio-preview/`, which swaps only sign-in, Firestore and Functions for sample
data; nothing is read from or sent to Firebase. Its Kasem is labelled placeholder text
("[Sample expression 1]"), so no Kasem is invented, and the captions say the data is a
sample.

- Capture: start the website dev server on port 5180 and the preview
  (`npx vite --config apps/updates-blog/posts/2026-09-27-share-an-expression/mockups/studio-preview/vite.config.mjs`,
  port 5198), then `node apps/updates-blog/posts/2026-09-27-share-an-expression/mockups/capture.mjs`.
- Frame: `node apps/updates-blog/posts/2026-09-27-share-an-expression/mockups/render.mjs`.
  Both need Google Chrome installed.

In Blogger's **Compose view**, replace each broken image in order with **Insert image →
Upload from computer**, keeping the cover first. Then check in HTML view that each `<img>`
kept its `alt` text.

## What changed, and the evidence

- **Website** (`apps/website`): the home hero names the two things a visitor can do today
  and links both; the "Start here" section is two path cards (Learn Kasem / Contribute
  Kasem) that state what each needs before the click; "Where things stand" labels the
  dictionary Live, the campaign Open now and the app In development. New route
  `/contribute` (in the header, footer and sitemap) with the task, the review process,
  the published expressions (read live from `expressionEntries`) and FAQs; its call to
  action opens `https://tribestudio.indigenworld.com/studio/expressions`. Get Involved
  points language contributors at the task they can do today.
- **TribeStudio** (`apps/tribestudio`): `/studio/expressions` — the form (phrase, meaning,
  context and dialect, speaker/source, consent, publication choice, optional AI opt-in)
  and "Your expressions" with each review status, the reviewer's reason, withdraw, and
  "Correct and send again". Opportunities no longer draws its hard-coded "validated
  submissions" progress bar and prize pool; the dashboard's levels, badges and points
  pitch are replaced by the two tasks and a count of accepted contributions. The public
  landing page offers the open task instead of only a waitlist.
- **Backend** (`services/functions`): new `submitExpression` callable and
  `collectionKind: 'expressions'`. Approved expressions publish to a new public
  collection, `expressionEntries`, never `dictionaryEntries`. Invited contributors'
  translations are filed the same way; ones already published as dictionary rows stay
  where they are until re-published. An accepted expression earns what a word earns but
  is not counted as a word.
- **Admin** (`apps/admin`): the Review Desk shows expressions with all five parts and a
  "Publish expression" action.
- Contract: `packages/contracts/schemas/expression-entry.schema.json`.

Checks run on 2026-09-27 (local working tree, not `main`):

- `npm run test:function-helpers` 562/562, including 21 new tests in
  `firebase/tests/expressions.test.mjs`.
- `npm run test:contributor-portal` 45/45 backend and 49/49 TribeStudio tests (two new
  expression-form workflow tests among them).
- `npm run test:e2e` 38/38 on the emulators, including the new
  `firebase/tests/expressionFlow.e2e.test.mjs` 4/4: refusals, the whole submit → approve
  → publish → withdraw lifecycle, the one-time correction flow, and scoring.
- `npm run test:rules` 199/199, including the new `expressionEntries` rule.
- `npm run check:website`, `npm run check:tribestudio` and the admin `check`
  (typecheck, validators and production builds); contracts 21/21.
- Pages checked in headless Chrome at desktop and phone widths: no horizontal overflow;
  the header fits from 1080 px up.

Not verified: any signed-in production flow (only the user can sign in with Google),
e-mail delivery of review notices, and the pages against production data.

**Decide before publishing:** the article's "Honest campaign pages" section says openly
that the Opportunities page used to show placeholder progress and prize figures. That is
true and was live; keep it, soften it or cut it as Chinedum prefers.

## Deployment — not done

In this order, so the website never asks for a collection the rules do not yet allow:

1. **Firestore rules** (`expressionEntries` is new). Until then the Contribute page shows
   "Published expressions could not be loaded just now"; everything else works.
2. **Functions**: `submitExpression` (new), and the changed `decideSubmission`,
   `withdrawCollectionContribution`, `submitCollectionContribution`,
   `saveExpressionAnswer`, `onContributorExpressionReviewed` and
   `awardContributorPoints`.
3. **Hosting**: `indigen-world` (website), `tribestudio` and `indigen-admin`. The
   website's production guard needs a clean tree committed and pushed to `main`.

Known gap: the Indigen app (in testing) lists expressions sent from TribeStudio under
"Your submissions" with the dictionary label, because the current build maps unknown
kinds to Dictionary. It does not break the app; a later app build can name them.

## Publishing handoff

1. Deploy as above, then smoke-test signed in: send an expression from
   indigenworld.com/contribute, approve and publish it on the Review Desk, check it
   appears on the Contribute page, then withdraw it.
2. In Blogger, create a post with the title above. Paste `post.html` in HTML view. Set the
   labels, search description and custom permalink above.
3. Upload the images as described, preview with the Updates theme, and check both links.
4. Publish when Chinedum approves. Replace `[PUBLISHED_POST_URL]` in `share.md` with the
   article URL, then give Chinedum the sharing copy.

No deployment, Blogger publication or message has been made.
