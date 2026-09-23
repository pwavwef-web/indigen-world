# Contributor issue reporting

Status: Draft — local implementation; not deployed.

| Field | Value |
|---|---|
| Title | Report contributor issues and follow admin replies |
| Labels | Contributors, TribeStudio, Support |
| Search description | Contributors can report issues with assignment context and track replies from administrators. |
| Custom permalink | contributor-issue-reporting |
| Article | post.html |
| Sharing copy | share.md |

## Implementation

Callable endpoints validate authentication, assignment ownership, issue types, lengths and admin role. Creation is idempotent per contributor request ID. Reports omit private profile data and unsaved translation payloads. Admin updates are audited. Reads for contributors are scoped to their own reports. Existing Firestore default-deny rules protect direct access. Admin list is limited to the latest 200 reports; replies are capped at 50 per report. No external notifications are sent. Preview reports reset when their workspace is remounted.

## Publishing handoff

1. Deploy Functions and both web applications together.
2. Verify report creation, ownership isolation, admin replies and status refresh with controlled accounts.
3. Confirm availability before publishing post.html through Blogger with this metadata.
4. Replace the published article URL placeholder in share.md; Chinedum handles publishing and sharing.

Validation: contributor and admin type checks passed; all 39 Studio tests and 24 contributor backend tests passed, including issue ownership, privacy, retry deduplication and admin authorization. Browser preview report creation and reference confirmation verified. Authenticated production testing remains pending.
Help & support now groups assignment guidance, Report an issue and My reports in a collapsed disclosure menu. Account remains separate; Continue translating stays visible. No unread badge is shown because unread tracking is not implemented.
Menu refinement: removed the standalone My reports entry. Report submission still shows its confirmation and report list; backend reporting and admin replies remain available.
