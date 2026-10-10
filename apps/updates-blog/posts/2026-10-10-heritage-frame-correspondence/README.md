# Heritage Frame letters and correspondence

Status: **Deployed October 10, 2026: Admin, four Functions and private-data rules. Live draft and Word/PDF print generation verified. Blogger draft, not published. No test emails sent.**

| Field | Value |
|---|---|
| Title | Heritage Frame letters and correspondence for Indigen World |
| Labels | Admin, Correspondence, Email, Design |
| Search description | Prepare Indigen World letters with editable Word and PDF downloads, private drafts, Heritage Frame branding and reviewed email attachments. |
| Custom permalink | heritage-frame-letters-and-correspondence |
| Article | post.html |
| Sharing copy | share.md |

## Implementation and availability

- Shared typed model, versioned vector artwork and existing roof/bars/sun logo.
- Searchable, font-embedded A4 PDF and editable Word with embedded fonts, SVG header decoration, fallback artwork and footer.
- Admin Messaging → Correspondence: saved private drafts, preview, Word/PDF downloads, print preparation, reviewed email send and document/delivery history.
- Shared SMTP boundary enforces PDF attachments for application forms, newsletters, notifications and support automation. Current provider settings and role checks are reused.
- Immutable private files, owner-checked temporary links, exact attached PDF hashes and durable delivery states. Preparation failures are retryable; uncertain SMTP outcomes are not automatically resent.
- No approved handwritten signature exists; none is invented. A separate staff assistant is not connected. Firebase-managed security emails require a custom sender integration for attachments.
- Functions/Admin builds, generator and delivery tests, role/private-draft emulator tests and desktop/mobile fixture browser checks are verified locally. See `docs/architecture/correspondence.md` and [the verification record](../../../../docs/architecture/correspondence-verification.md) for results and the final native Word visual-refresh limitation.
- Production release and authorised cloud Word/PDF generation are verified. The corrected Word opens with an independent parser and includes all four embedded fonts; the searchable A4 PDF matches the saved hash. Both Admin domains serve the release build. See [the deployment record](../../../../docs/operations/correspondence-deployment-2026-10-10.md). Inbox delivery and physical-printer output are not claimed.

## Images and credits

- `images/heritage-frame-letter.png`: actual cloud-generated PDF from the deployed print workflow, rendered locally; clearly labelled synthetic names and `example.test` email only. Design reconstructed as vector geometry from the reference supplied by the user. Indigen World logo reused from the repository's TribeStudio brand mark.
- `images/correspondence-composer.png`: actual deployed Admin composer with a saved synthetic deployment-review draft. No real correspondence or test email deliveries.
- Letter fonts: Noto Sans, SIL Open Font License 1.1; licence and provenance in `services/functions/assets/fonts/`.
- These are actual deployed product/sample screenshots. The deployment record describes their scope and the native Word visual-refresh limitation.

## Publishing handoff

1. Review the confirmed October 10 deployment evidence and the remaining integration limits before publication.
2. Upload both PNGs from `images/` to Blogger. Replace each relative image `src` in `post.html` with its Blogger-hosted URL; preserve descriptive alt text and captions.
3. Paste `post.html` into Blogger HTML view using the metadata above, then preview desktop and mobile.
4. Chinedum publishes the article and replaces the clearly marked URL placeholder in `share.md`.
5. Share only after the availability wording matches the confirmed release. Repository preparation does not publish externally or send messages.
