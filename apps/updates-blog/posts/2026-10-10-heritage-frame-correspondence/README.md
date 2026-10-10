# Heritage Frame letters and correspondence

Status: **Implemented in the repository; deployment not confirmed. Blogger draft, not published. No real recipient emails sent.**

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
- Implementation alone does not confirm production IAM signing access, a deployed endpoint, inbox delivery or physical-printer output. Deploy Functions, private-data rules and Admin together under the existing release safeguards.

## Images and credits

- `images/heritage-frame-letter.png`: actual generated PDF review sample rendered locally; synthetic names and `example.test` email only. Design reconstructed as vector geometry from the reference supplied by the user. Indigen World logo reused from the repository's TribeStudio brand mark.
- `images/correspondence-composer.png`: actual correspondence component screenshot using a clearly marked offline fixture, captured during local browser verification. No live records or email deliveries.
- Letter fonts: Noto Sans, SIL Open Font License 1.1; licence and provenance in `services/functions/assets/fonts/`.
- These are product/sample screenshots, not illustrations or evidence of a live rollout.

## Publishing handoff

1. Confirm deployment and update the availability paragraph and release evidence before publication.
2. Upload both PNGs from `images/` to Blogger. Replace each relative image `src` in `post.html` with its Blogger-hosted URL; preserve descriptive alt text and captions.
3. Paste `post.html` into Blogger HTML view using the metadata above, then preview desktop and mobile.
4. Chinedum publishes the article and replaces the clearly marked URL placeholder in `share.md`.
5. Share only after the availability wording matches the confirmed release. Repository preparation does not publish externally or send messages.
