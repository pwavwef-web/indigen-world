# Connected mobile workflows — Android 0.1.33+42

Release preparation: 16 October 2026. Build and deployment results are recorded
below as they complete; preparation alone does not confirm a live release.

## Source and scope

The isolated managed release checkout starts from remote main `b2fecad` and
applies only the connected mobile workflows change. The original Desktop
checkout and its unrelated work remain intact. Existing website discovery,
Word Trail, Studio and email-theme releases are retained.

Android version changes from `0.1.32+41` to `0.1.33+42`. The production package
remains `com.indigenworld.indigen`, using the existing upload key and validated
production advertising configuration. The optional comment ad unit is absent.
Release builds default `POST_COMMENTS_ADS_ENABLED` and
`MOBILE_VIDEO_RENDER_ENABLED` to false. Server rich-push and Apple rich-media
flags are explicitly false. Missing house organisation configuration continues
to block creation of a house identity.

The checkout return now has a real website page and matching Android/custom
scheme handling. It accepts a canonical reference only as an order lookup;
the authenticated backend still verifies payment with Paystack. Fifteen deep
link tests passed, including invalid references, hostile hosts and extra paths.

## Deployment boundaries

Project: `project-kassena-7e026`. Deploy the affected Functions, additive rules
and indexes, Admin Hosting and public website Hosting. No need to redeploy the
unchanged dictionary or TribeStudio clients. Preserve existing deployed indexes.
No live payment, refund, notification campaign or house profile is created as a
release smoke test. Readiness settings continue to control shop checkout.

The release post and actual synthetic product screenshots are prepared under
`apps/updates-blog/posts/2026-10-16-connected-mobile-workflows/`. Blogger
publication, sharing, Play upload and Apple signing remain separate actions.

## Verification and results

Pending: clean-source Functions/Admin/website builds, selected regressions,
signed AAB identity and certificate verification, deploy receipts, live page and
unauthenticated endpoint checks, and index readiness.

Existing implementation evidence and remaining product acceptance limits:
`docs/product/integrated-mobile-upgrade-ledger.md`. Apple device validation,
real payment/refund checks, the dedicated AdMob unit and real-device export/post
checks remain gates; this release does not claim that those checks passed.
