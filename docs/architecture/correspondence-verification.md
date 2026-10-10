# Correspondence verification — October 10, 2026

Functions, private-data rules and Admin Hosting were deployed October 10, 2026.
No external publication, real-recipient test email or physical print job was
performed. See [the deployment record](../operations/correspondence-deployment-2026-10-10.md).

- Functions build and Admin build/typecheck passed.
- `test:correspondence`: 13 passing tests. Covers editable DOCX packages,
  searchable A4 PDF, four embedded font faces, Kasem, lists, page breaks,
  approved-signature/glyph validation, exact offline MIME attachment bytes,
  recipient-specific bulk letters, preparation failure/retry, concurrent claims,
  integrity failures, uncertain-delivery duplicate prevention and retention of
  already-valid cloud font part names with complete relationship validation.
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

Synthetic samples are in `output/correspondence/` (ignored by Git), refreshed
with generator v2. All three DOCX samples open with an independent document
parser and contain editable paragraphs and four embedded fonts.

Production verification:
- All four Functions are ACTIVE on Node 22, with 512 MiB, timeout 120 seconds
  and concurrency 1. Original provider values and secret bindings were retained;
  the service account already had signing permission. No runtime service-account
  IAM change was needed.
- Both Admin domains serve the exact built HTML, entry JavaScript and composer
  chunk, with the existing security headers. Unauthenticated callable access
  returns HTTP 401 / UNAUTHENTICATED.
- A signed-in administrator saved a clearly labelled synthetic draft and used
  Print PDF to generate both cloud files. The UI returned its ready notice and
  recorded separate immutable versions marked Generated, not sent.
- The initial live Word inspection exposed a cloud-library font packaging
  defect. `docx` is now pinned to the tested release and generator v2 preserves
  valid filenames, validates every font relationship and leaves history intact.
  The corrected cloud DOCX opens with an independent parser: 16 editable
  paragraphs, four embedded fonts, resolved references, header/footer and Kasem.
- The corrected cloud PDF is one searchable A4 page, preserves the supplied
  Kasem characters and matches the SHA-256 shown in the portal. It was downloaded
  from private storage, rendered and visually inspected. Browser automation
  cannot reliably capture the native PDF viewer; the standalone render is used
  for visual evidence. Final native Microsoft Word layout refresh remains the
  limitation described above.

Release-post images are an actual deployed composer screenshot and a rendered
cloud-generated PDF, both using synthetic identities. Blogger remains unpublished.

Provider-managed Firebase security emails require a custom sender connection;
the staff assistant descriptor still needs an authorised assistant integration.
SMTP acceptance and inbox delivery were intentionally not tested against real
recipients; the existing provider configuration and offline MIME tests were used.
