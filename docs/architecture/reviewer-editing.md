# Editing reviewed submissions

Implemented 23 October 2026. Deployment pending.

Both the Administration Review Desk and TribeStudio Validator portal let existing
reviewers correct submission content. **Save corrections** keeps the current
status. **Approve and publish** applies corrections and publishes pending,
resubmitted, escalated or returned work in one transaction. Approved work retains
its existing Publish action. Published work uses **Save and publish** to update
its existing public record; a standalone save is refused for live work.

## Trusted write path

- Administration calls `reviewSubmission`, declared with `onStaffCall`, requiring
  the existing verified staff session and protected admin App Check policy.
- Validator/mobile calls continue to use `decideSubmission`. Both exports invoke
  `decideSubmissionHandler` in `services/functions/src/creators.ts` and require a
  validator, reviewer or inherited administrator role. No roles or claims change.
- New decisions are `SAVE_EDITS` and `APPROVE_AND_PUBLISH`. The latter runs the
  established `PUBLISH` projection after checking an eligible review status.
- Edits and combined approval/publication require `expectedStatus` and
  `expectedVersion`. A legacy submission without a version uses zero. Version
  comparison and increment occur in the transaction, including concurrent saves.
- `packages/contracts/submission-editing.mjs` defines the permitted fields,
  bounds, display values and content normalization shared by both portals.
  `packages/console-ui/src/SubmissionEditor.tsx` supplies their common editor.

Editable fields cover text, meaning, examples, dialect, context, attribution,
translation, existing individual dictionary meanings and word forms. Expression
changes synchronize the nested expression and legacy aliases. Dictionary edits
update spelling/translations and derive the summary from edited meanings.
Existing source identity, contributor credit, consent statements, permissions,
ownership, campaign, routing and upload paths cannot be edited through this API.
Media replacement, adding/removing structured senses and source-document review
in the separate all-round material workflow are outside this editor.

The handler refuses self review, withdrawn records, closed editing statuses,
missing publication consent and private training publication. Edits do not grant
permission or change the destination category. A linked Collection receipt must
exist and match the submission owner and kind, and receives the same content
correction transactionally. Public projections keep the original stable ID and
credit. The existing post-commit media preparation behavior is unchanged.

Every correction writes before/after content values and versions to the private
audit log. A save-only action uses `creator.submission.edit`. A correction with a
decision uses `creator.submission.decide` with its requested decision and content
changes. The contributor's normal decision notification remains on the existing
notification workflow. Save-only corrections do not create a decision message.

The portals guard unsaved corrections on navigation. Stale validator records
retain corrections and lock actions. Administration keeps a refused stale edit
on screen and requires an explicit choice to discard it and load the latest
record. Successful save-only edits refresh the selected record for continued
review.

## Verification and release

```powershell
npm run test:reviewer-editing
npm run test:reviewer-editing:browser
npm run test:staff-security
npm run test:rules
npm run build:console-ui
npm run build:admin
npm run build:tribestudio
npm test --workspace @indigen-world/admin
npm test --workspace @indigen-world/tribestudio
```

The integration suite requires the Firestore emulator and uses synthetic records.
The browser suite renders the real portal screens with synthetic service data
and records desktop/mobile captures in the release post. It does not contact
production or demonstrate production authentication, App Check or SMTP.

Deploy updated `decideSubmission` and `submitCollectionContribution`, plus the new
`reviewSubmission` Function, before
the Administration and TribeStudio hosting builds. No rules, claims, account
changes or backfill are needed. Existing clients retain separate approval and
publication actions. The prepared release article is
`apps/updates-blog/posts/2026-10-23-reviewer-editing/`; Chinedum owns Blogger
publication and community sharing.
