# Contributor invitations by SMS

Status: **Draft article — implementation complete; production deployment pending.**

| Field | Value |
|---|---|
| Title | Contributor invitations by SMS |
| Labels | `Contributors`, `Admin`, `SMS`, `Kasem` |
| Search description | Invite contributors by SMS, guide their first sign-in and password change, and retry failed invitations without duplicating assignments. |
| Custom permalink | `contributor-sms-invitations` |
| Article | `post.html` |
| Sharing copy | `share.md` |

## Implementation and verification

- Reuses Arkesel and its existing server-side secret for Invite and Resend.
- Normalizes Ghana local numbers and international phone numbers.
- New accounts receive a temporary phone-number password; existing passwords and role claims are preserved.
- Requires first activation before saving or submitting; refreshes the client login with the chosen password.
- Preserves imported profile IDs and private registration notes; Invite explicitly enables editing and submission.
- Saves SMS provider acceptance/failure and protects invitation retries from duplicate assignments.
- Restores assignment guidance and preserves existing contributor workflows while resolving the pull conflicts.

Validation: Functions production build, 22 contributor backend tests, Admin type checks/structural validation/production build, Studio type checks/37 workflow and PWA tests/production build, and all 21 blog theme checks passed. The contributor sign-in page was checked in a local browser; the Admin preview requires staff sign-in. Production deployment is pending. No real invitation messages have been sent during this work.

## Publishing handoff

1. Confirm the production deployment and a controlled handset-delivery check before describing SMS invitations as live.
2. Review `post.html`, then paste it into a new Blogger post in HTML view.
3. Apply the title, labels, search description and permalink above.
4. Publish when ready and replace `[PUBLISHED_POST_URL]` in `share.md` before sharing.

SMS provider acceptance is not proof of handset delivery. Arkesel configuration, credit, sender approval and network routing apply. Existing accounts do not receive phone-number passwords. No bulk invitations are sent by deploying this update.
