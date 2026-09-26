# Emails with a familiar Indigen World look

Status: **Application emails deployed September 26, 2026. Firebase native template changes blocked by the provider. Blogger draft, not published.**

| Field | Value |
|---|---|
| Title | A familiar look for messages from Indigen World |
| Labels | Contributors, Support, Email, Design |
| Search description | Clearer Indigen World emails for support, password recovery, contributor updates and invitations, with readable layouts and familiar colours. |
| Custom permalink | indigen-world-branded-emails |
| Article | post.html |
| Sharing copy | share.md |

## Release evidence

- Shared HTML shell in `services/functions/src/email-templates.ts`; application emails retain plaintext alternatives.
- Support recovery and replies use the shared shell, preserving mailbox eligibility and delivery safeguards.
- Reusable validator invitation template prepared; it does not grant permissions or run a campaign.
- Firebase template updates were rejected with `EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED`, including a reset-only request. Readback confirms the native templates remain unchanged. Non-secret backups are saved privately outside Git; the update script is retained for when the provider permits changes.
- Functions build passed. All nine support integration tests passed, including branded HTML, recovery-link preservation, mailbox eligibility and delivery safeguards. Firebase CLI reported an error while shutting down the emulators after the tests passed.
- Five sample emails generated; escaping, plaintext alternatives and the Firebase placeholder checked. Desktop invitation and 375px recovery previews inspected in Edge. Rendering across real email clients and inbox delivery remain unverified.
- PR #25 merged as `399ddd0675e64c00a78c70701b87ee2c00a10238`. `publicForms`, `onNotificationCreated` and `onSupportEmailCreated` all reported successful deployment from clean verified `origin/main` at that commit. Existing mail settings and secret bindings were preserved; WhatsApp functions remain disabled.
- GitHub Actions could not start because the account is locked due to a billing issue. Local test success is not represented as remote CI success.
- The validator invitation template is ready for future use. No invitation email or production test email was sent as part of this release.

## Publishing handoff

1. Check release evidence and revise the availability paragraph before publishing.
2. Paste `post.html` into Blogger using the metadata above and preview desktop/mobile.
3. Chinedum publishes and replaces the article URL placeholder in `share.md`.
4. Do not claim that provider acceptance proves inbox or handset delivery.
