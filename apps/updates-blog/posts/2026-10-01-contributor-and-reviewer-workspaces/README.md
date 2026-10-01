# A clearer workspace for contributing and reviewing

Status: **Draft article. Implemented and tested in the repository on October 1, 2026 (branch `claude/zen-faraday-lskj12`); not deployed. Article not published or shared.**

| Field | Value |
|---|---|
| Title | A clearer workspace for contributing and reviewing |
| Labels | `TribeStudio`, `Contributors`, `Validators`, `Feature`, `Kasem` |
| Search description | TribeStudio’s redesigned contributor and review workspaces: guided forms, submission tracking, plain rewards and safer review decisions. |
| Custom permalink | `contributor-and-reviewer-workspaces` |
| Article | `post.html` |
| Sharing copy | `share.md` |
| Images | `images/contributor-overview.png`, `images/guided-expression.png`, `images/submission-feedback.png`, `images/review-resubmission.png` (1440 × 900), `images/review-queue-phone.png` (780 × 1688, shown at 390 × 844) |

## What the article covers, and the evidence

- **Contributor workspace** (`/contributor`): overview of what needs attention, Tasks, My submissions with a detail page, Revisions, Rewards, Guidelines, Kawuri and Profile; guided forms for everyday expressions, dictionary words and pronunciations; one design system shared with the review side. Implementation: `apps/tribestudio/src/contributor/`.
- **Review workspace** (`/contributor/review`): overview with server counts, a filterable queue (type, dialect, waiting time, oldest first, pages), a review screen with side-by-side comparison, previous rounds, audio, explained decisions, required feedback and confirmation, review history and guidelines.
- **Backend safeguards** (not yet deployed): stale decisions are refused (`decideSubmission`), a recording cannot be decided by its speaker or twice at once (`decidePronunciationRecording`), and a retried send is filed once (`submitExpression`, `submitCollectionContribution`, `submitPronunciationRecording`).
- **Reward figures** in the article (10 points per approved assigned translation, 300 a day, 300 points for GH₵5 of airtime or data) are the defaults in `services/functions/src/contributor-rewards.ts`; the article says the page shows the rules in force. Check `settings/contributorRewards` before publishing in case an administrator changed them.
- **Validation (October 1, 2026):** TribeStudio `npm test` (69 tests) and production build; root `npm run typecheck` and `npm run build`; backend helper tests 594 of 595 (the remaining one needs a generated seed file that is not in the repository); 51 of 51 emulator end-to-end tests, including the new review-safeguard tests; scripted browser journeys against the local preview at desktop and phone widths. Details: `docs/product/contributor-portal.md`, section “Contributor and reviewer workspaces — 2026-10-01”.
- **Limits stated in the article:** reviews are not assigned to individuals; no new form for sentences or longer texts; turnaround times and payment rates unpublished; expressions published to the dictionary before September 27 wait for an editor to move them.

## Deployment status and steps

Not deployed. Before publishing the article:

1. Deploy the five Functions: `firebase deploy --only functions:decideSubmission,functions:decidePronunciationRecording,functions:submitExpression,functions:submitCollectionContribution,functions:submitPronunciationRecording`.
2. Deploy TribeStudio hosting. No Firestore rules, Storage rules or index changes are needed.
3. Smoke-test with designated test records: a contributor account (save, submit, track, revise), a reviewer account (one decision of each kind, a recording, a sentence), an account with both roles (the role switch), and a signed-out browser.
4. Update the availability paragraph in `post.html` and the status above with what was verified.

## Image credits and upload steps

All five images are **actual product screenshots** of the redesigned screens, taken on October 1, 2026 from the repository’s development-only preview (`/contributor/preview` and `/contributor/preview/review`) with Playwright and Chromium. Credit: **Indigen World — TribeStudio screenshots, October 2026**. They show **sample data**: the yellow banner in each says so, Kasem text is a bracketed placeholder, and the names are sample names. They contain no member data. The preview runs the real interface with in-memory sample services; nothing in the screenshots was edited.

To regenerate them, start the TribeStudio dev server (`npm run dev --workspace @indigen-world/tribestudio`) and capture the same routes at 1440 × 900 (and 390 × 844 at 2× for the phone image):

- `/contributor/preview`
- `/contributor/preview/contribute?type=expression`
- `/contributor/preview/contributions?view=expression.preview-expression-declined`
- `/contributor/preview/review/contributions/preview-assigned-2`
- `/contributor/preview/review/queue` (phone)

Blogger steps:

1. Create a Blogger draft with the title, labels, search description and permalink above.
2. Paste `post.html` in HTML view.
3. Upload each image from `images/` through Insert image → Upload from computer, and replace each local `images/…` source with its Blogger URL, keeping the alt text and captions.
4. After the deployment and smoke test above, update the availability paragraph, then let Chinedum publish and share the article. Copy the published URL into `share.md`.

Publication and sharing remain with Chinedum.
