# Contributor management comes to the Admin console

Status: **Draft article — feature deployed 2026-09-17.** The Admin Hosting
release and contributor-management Functions completed successfully; both the
Firebase Hosting URL and `admin.indigenworld.com/contributors` returned HTTP 200.

| Field | Value |
|---|---|
| Title | Contributor management comes to the Admin console |
| Labels | `Admin`, `Contributors`, `Feature`, `Kasem` |
| Search description | A new Admin workspace brings contributor profiles, invitations, expression assignments, review and activity history together. |
| Custom permalink | `admin-contributor-management` |
| Article | `post.html` |
| Sharing copy | `share.md` |

## What is verified

The repository implementation includes:

- an admin-only contributor directory with name/email search and status, role,
  location and contribution-type filters;
- profile-only records, separate public/private fields, profile preview, roles
  and workspace permissions;
- tracked activation links, resend and pending-invitation cancellation;
- expression assignment titles, instructions and deadlines with progress counts;
- independent contributor status, account access and profile visibility;
- invited-expression contribution history and the existing audited review flow;
- server-written audit records for profile, invitation, assignment and access
  changes.

Verification: Admin TypeScript check, Admin production build, Admin structural
tests, Functions production build, 13 contributor-portal backend tests, and the
Updates Blog preview all passed. Firebase deployed the five new contributor
management callables, updated the contributor workflow functions, and released
the Admin Hosting version on 2026-09-17.

## Availability limits

This first release focuses on the contributor directory, profiles, invitations,
permissions, activation/deactivation, expression allocation, submission review,
contribution history and audit logging. It does not yet add payment processing,
agreement document uploads, application intake, automatic email delivery or
permanent deletion. Invitation links are generated for an administrator to send
through an approved channel; existing work and attribution are preserved when
access is removed.

## Publishing handoff

1. Smoke-test profile creation, invitation activation, reassignment, suspension,
   review and audit history with non-production sample records.
2. Confirm an authorized admin can open **Publishing → Contributors** and an
   unauthorized account cannot call the contributor-management Functions.
3. In Blogger, create the post with the title and metadata above, then paste
   `post.html` in HTML view.
4. Replace `[PUBLISHED_POST_URL]` in
   `share.md` with the final URL before sharing.
