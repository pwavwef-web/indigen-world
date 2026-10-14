# Heritage Frame correspondence

Deployed October 10, 2026 to the existing Firebase project and Admin site.
See [the deployment record](../operations/correspondence-deployment-2026-10-10.md)
and [verification results](correspondence-verification.md).

The Word generator uses the tested `docx` 9.5.1 release, pinned for cloud/local
consistency. Generator v2 retains valid embedded-font part names, checks their
relationships, and creates a new immutable version rather than replacing older
documents.

## Staff workflow

Open Admin → Messaging → Correspondence (`/messaging/correspondence`). Fill in
the date, supplied recipient details, subject, body and sender. Optional fields
include reference, salutation, closing, role, enclosures and a separate concise
email introduction. Save partial drafts, then complete the subject, body and
sender before generating documents. Blank lines separate paragraphs; `-` and
`1.` start lists; `**bold**`, `*emphasis*` and `[label](https://...)` format runs.
Use `---page---` on a separate line for an explicit page break.

Download Word and Download PDF always generate both formats from the saved
content. Print PDF also prepares both, opens the PDF and lets the requester use
the viewer's Print control. No connected physical printer is required. The
generated PDF is the final pagination preview. Print preparation never emails.

Review and send email shows the recipient, readable body and the actual PDF.
A separate email introduction is used only in the email; the complete formal
letter stays in the attachment. Without an introduction, the email contains the
letter's message, salutation, closing and supplied sender identity. The interface
reports SMTP acceptance rather than claiming inbox delivery.

## Model, design and generators

- `@indigen-world/contracts/correspondence`: typed structured letter, validated
  Unicode text and HTTP/HTTPS links, limited Markdown input, matching filenames.
- `packages/contracts/heritage-frame.mjs`: versioned A4 geometry in millimetres,
  navy/cobalt/pale blue linework, diamonds and the existing roof/bars/sun mark.
  The supplied reference is archived for provenance; it is never a page background.
- `services/functions/assets/letterhead/heritage-frame-v1.svg`: derived vector
  decoration; `indigen-world-logo.svg`: the reusable logo. Body text, wordmark and
  footer remain text. DOCX includes SVG decoration and a high-resolution PNG
  fallback for older readers. PDF artwork is drawn as vectors.
- `renderLetterPdf`, `renderLetterDocx`, `generateLetterFiles` in
  `services/functions/src/correspondence-render.ts`: searchable PDF with embedded
  Noto Sans fonts, editable Word with the four embedded font styles, header and
  footer, explicit breaks, wrapping, lists and grouped sender block. Word's native
  paginator can differ slightly from the PDF paginator; the layouts reserve the
  same text column and decoration margins. DOCX font OPC part names are sanitised
  because docx 9's unescaped spaces are rejected by Microsoft Word.
- Sender signatures are optional and default to none. No approved handwritten
  signature exists in the repository. To enable one, review a PNG asset, add its
  identifier to `approvedSignatures`, expose that approved choice in the composer,
  and bump the design/generator version. Arbitrary URLs or unapproved identifiers
  are rejected. No address, telephone number, slogan or signature is inferred.

The bundled fonts cover Kasem and Latin text including combining marks, Greek
and Cyrillic. Characters outside their coverage stop generation with the missing
code point, rather than disappearing. Additional scripts require an explicitly
licensed font and tested layout support. Letters are limited to 120,000 body
characters, 1,000 paragraphs and 100 PDF pages; at most twelve address lines.

Local print workflow (no provider connection and no mail):

```powershell
npm run print:letter -- --input data/private/letter.json --out data/private/letters
# Review samples with synthetic identities:
node services/functions/scripts/correspondence.mjs --samples --out output/correspondence
```

JSON uses the shared letter model. `body` may be a string in the documented
Markdown subset, or structured blocks/runs. The CLI prints Download Word and
Download PDF paths. Future Codex sessions should return those paths as links.

The email body around the attachment uses the shared Indigen World email
theme; see [email-theme.md](email-theme.md).

## Runtime, permissions and history

The `correspondence` Firebase callable uses existing authentication, admin roles,
App Check configuration, rate limits and guarded error handling. Its actions are
`list`, `save`, `generate`, `print`, `history`, `download` and `send`. A saved draft
uses optimistic revision checks. The server scopes every operation to the
authenticated admin's own `correspondenceDrafts/{uid}/drafts/{id}` collection;
another admin cannot read it. Raw Firestore and Storage access is denied to
clients, including owners. Clients cannot overwrite documents or delivery state.

Generation creates a version under `versions/{sha256}` containing the letter,
separate email introduction, revision, generator/design IDs, file paths, both file
hashes and timestamps. Its objects live at
`correspondence/{uid}/{draft}/{version}/{matching-filename}`. Storage writes are
create-only, and generation races use the already stored bytes. Later edits make
a new version; historical PDF bytes are never replaced. Sending reads and checks
the reviewed version's saved PDF, and associates its SHA-256 with the result.
Download links expire after ten minutes and are minted only after role and owner
checks. They are bearer links: treat them as private and regenerate expired links.

The draft list/history is capped at the fifty most recent entries per owner or
draft. History lets a requester inspect an older PDF; current download/send
actions always prepare the current draft. Do not manually edit immutable version
records or delete a sent attachment as a routine cleanup operation.

## All application email paths

`sendMailWithLetter` is the only SMTP boundary in `email.ts`; `sendMail` retains
its boolean best-effort API for existing form and event handlers. Notifications,
public-form acknowledgements, newsletter welcomes, team alerts, support replies
and the support assistant's recovery messages inherit mandatory PDF attachments.
Existing SMTP configuration, sender mailbox, reply-to and upstream send/review
permissions stay in use. Messages stay readable as HTML and plain text.

Pass `letter` when the user supplies a complete formal letter; `text`/`html`
remain the requested concise email body. Otherwise the letter uses the substantive
plaintext message without rewriting it, the recipient's email and any supplied
name/organisation/address, and the supplied sender or configured From identity.
A multi-recipient message preflights separate recipient PDFs before the first
SMTP operation. Complete formal letters require one message per recipient.

The durable `_correspondenceDelivery/{key-hash}` journal records fingerprint,
preparation/sending state, exact attachment hash/path and stable Message-ID.
System attachments are private backend-only objects under `correspondence/system`;
there is no public/admin-client download route for them. Treat recovery PDFs as
sensitive credentials like the recovery email itself. Their contents are not
copied onto support cases, preview text or log lines. Storage administrators must
apply the organisation's private-email retention policy to these backend-only
archives. No new public recovery-link access is introduced.

Use stable `deliveryKey` values from notifications, source forms, support outbox
jobs or the reviewed draft version. A missing key creates a new delivery and is
appropriate only for a newly requested send, never a retry. The attached SHA-256
and Message-ID identify precisely which PDF was submitted to SMTP.

## Failure and retry policy

Document or attachment failures stop before SMTP. The draft remains saved and
the portal shows a retryable error. Only `preparation_failed` delivery records can
be claimed again. Atomic journal claims prevent concurrent duplicate sends.
Accepted messages return their original status; a changed payload cannot reuse
the old delivery key. The offline SMTP tests verify actual attachment MIME bytes.

SMTP cannot guarantee exactly-once delivery: after a disconnect or process crash
following the durable `sending` transition, the provider may already have
accepted the message. Such records stay `sending`/`unknown` and are never resent
automatically. Check the provider using the recorded Message-ID before making
an explicit new delivery decision. A process crash during `preparing` also needs
operator attention; the runtime does not steal a lease from a possibly active
worker. There is no unsafe automatic retry timer.

Existing form/notification/support handlers keep their best-effort response
contract and preserve the original form/event/outbox job on failures; the new
composer provides detailed errors and explicit retry controls. Their older
status fields may say `failed` when SMTP acceptance is uncertain; the shared
delivery journal is authoritative. Recovery and support permissions are unchanged.

## Assistant and provider limits

No separate staff correspondence assistant with a tool registry exists here.
The existing public support automation inherits PDF attachments through its
outbox. An authorised staff assistant can use the same `correspondence` callable:
save supplied content, call `print`, return **Download Word** and **Download PDF**;
require the existing human review step before `send`. Do not give public Kawuri
or support callers staff access. See `services/ai/correspondence-tools.json` for
the integration contract; it is a descriptor, not an active additional agent.

Firebase-managed authentication emails bypass application SMTP and cannot receive
custom attachments through these functions. They require moving that sender to
an authorised custom email action-handler/provider integration if attachment
coverage is required. Existing provider-native security flows remain intact.

## Deployment and verification

Functions (`correspondence`, `publicForms`, `onNotificationCreated` and
`onSupportEmailCreated`), Firestore/Storage rules and Admin Hosting were deployed
under the production-main safeguards. The existing SMTP settings, secret
bindings, service account and signing permission were preserved. Authenticated
private draft saving and cloud generation of both formats passed. No live test
email, physical print job or Blogger publication was performed.

Future deployments must include these four Functions when the shared SMTP or
generation boundary changes. Rebuild Functions and Admin, retain provider secret
bindings, and verify authorised private downloads. Generators use 512 MiB,
120-second execution budgets and concurrency 1. Never send live test messages.

```powershell
npm run test:correspondence
npm run test:correspondence:integration
npm run test:correspondence:browser
npm run build:admin
npm test --workspace @indigen-world/admin
```

Fixtures cover one page, three pages with lists/closing, Kasem characters, explicit
breaks, font/glyph validation, offline MIME attachments, generation failure and
safe retry, concurrent claims and SMTP uncertainty. Emulator tests cover roles,
draft persistence, owner isolation and direct-access denial. Render both final
formats and inspect every page before changing design/generator versions.

The browser check uses the actual component with an offline callable fixture,
synthetic sample files and installed Microsoft Edge on Windows. Generate the
samples first; it never invokes the real callable or SMTP provider.

See [the verification record](correspondence-verification.md) for checked results
and the remaining final native Word visual-refresh limitation.
