# A quieter contributor workspace with payment details under Account

Status: **Draft — implemented locally; production deployment pending.**

| Field | Value |
|---|---|
| Title | Payment details now have a home under Account |
| Labels | Contributors, TribeStudio, Payments |
| Search description | Contributor bank details move into Account settings, with bank details and verification separate from translation work. |
| Custom permalink | contributor-payment-profile |
| Article | post.html |
| Sharing copy | share.md |

## Implementation and validation

The portal and development preview use the same payment profile component. The contributor-facing request form and payment history display are removed; existing backend request endpoints and admin processing remain unchanged. Bank details load when the profile is opened. Type checking and all 39 Studio tests passed.

## Publishing handoff

1. Deploy and verify the signed-in contributor flow before announcing live availability.
2. Paste post.html into Blogger HTML view and apply the metadata above; update availability with verified release evidence.
3. Publish when approved by Chinedum, then replace the URL placeholder in share.md.

No external publication or sharing has been performed.


## Additional workspace improvements

Consistent submitted counts and a separate approved count; visible Account label; masked bank summary with explicit editing; verification explanations; revision-first Continue translating; account- and assignment-scoped browser position memory; preserved sample drafts on assignment switching. Browser position memory is optional when storage is blocked. Existing autosave/navigation guards remain in place. Sample data still resets on refresh.

Submission now requires review and explicit confirmation. Additional changes include full-width phone assignment selection, sticky save feedback with retry, a help shortcut, stronger focus indicators, and completion totals. Tests cover review without sending and confirm-before-advancing.

## Deployment evidence — 2026-09-23

Released implementation commit `ffa6c899` to Firebase project `project-kassena-7e026`. Firebase confirmed release completion for `tribestudio` and `indigen-admin`, and successful creation of `reportContributorIssue`, `getContributorIssues`, `listContributorIssues` and `updateContributorIssue` in us-central1. Both hosting pages returned HTTP 200 and referenced the expected built JavaScript bundles. Authenticated contributor/admin end-to-end verification remains pending. The Blogger article is still unpublished; Chinedum retains the publication and sharing handoff.
