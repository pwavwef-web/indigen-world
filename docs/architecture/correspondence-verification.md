# Correspondence verification — October 10, 2026

Repository implementation only. No deployment, external publication, real
recipient email or physical print job was performed.

- Functions build and Admin build/typecheck passed.
- `test:correspondence`: 12 passing tests. Covers editable DOCX packages,
  searchable A4 PDF, four embedded font faces, Kasem, lists, page breaks,
  approved-signature/glyph validation, exact offline MIME attachment bytes,
  recipient-specific bulk letters, preparation failure/retry, concurrent claims,
  integrity failures and uncertain-delivery duplicate prevention.
- `test:correspondence:integration`: 6 passing Firestore-emulator tests covering
  admin permissions, private draft persistence, optimistic revisions, owner
  isolation, direct-access denial, incomplete drafts and failed send preservation.
- `test:correspondence:browser`: passed using the actual composer and an offline
  callable fixture. Save/edit preserved rich body runs; review/send required
  explicit review; print prepared both links; desktop/mobile had no overflow or
  browser errors. This does not verify a deployed callable or real SMTP service.
- Existing Admin checks and 9 route tests passed. Contracts: 22 fixtures valid.
  Updates-blog theme: 21 checks passed. `git diff --check` passed.
- Final sample PDFs contain 1, 3 and 1 searchable A4 pages. All five pages were
  rendered and visually inspected, including branding, print margins, long
  subject wrapping, lists, closing block, footer and Kasem characters.
- Microsoft Word opened and exported all three sample types after the embedded
  font OPC compatibility fix. Their five rendered pages were visually inspected.
  Later minor recipient-email/spacer/footer alignment changes pass package and
  generation checks; the final native Word re-render stalled in local COM
  automation. That last visual refresh remains unverified. No successful final
  Word refresh is claimed. LibreOffice is not installed on this host.
- DOCX package inspection confirms editable paragraph text, recipient-specific
  content, four embedded font parts, headers, footers, SVG artwork and no editing
  protection. PDFs preserve the tested Kasem characters in extracted text.

Synthetic samples are in `output/correspondence/` (ignored by Git). Regenerate
with the documented CLI. Release-post assets are actual local sample/composer
screenshots, not evidence of a live release.

Deployment checks still needed: production service-account signing/bucket
permissions, SMTP configuration and deployment of Functions, rules and Admin.
Provider-managed Firebase security emails require a custom sender connection;
the staff assistant descriptor still needs an authorised assistant integration.
