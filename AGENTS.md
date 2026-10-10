# Repository instructions

# Indigen World correspondence

- Heritage Frame v1 is the default correspondence letterhead. Include the
  existing Indigen World roof/bars/sun logo beside its typographic wordmark.
- All application emails must pass through `services/functions/src/email.ts`
  (`sendMail` or `sendMailWithLetter`). The runtime generates the matching PDF
  before SMTP. Supply a stable `deliveryKey` for source events and reuse it on
  retries. Never bypass attachment preparation or resend an uncertain SMTP send.
- “Print a letter” and equivalent requests return both editable Word and PDF
  downloads. They do not automatically email or start a physical print job.
  Use `generateLetterFiles` in `correspondence-render.ts` or run
  `npm run print:letter -- --input private-letter.json --out data/private/letters`.
  Label the returned links **Download Word** and **Download PDF**.
- Portal and authorised assistant integrations use the admin-only
  `correspondence` callable (save, list, generate/print, history, download, send).
  Send requires review of a saved immutable version. Keep sender identity and
  message meaning as supplied; do not invent signatures or contact information.
- Model and vector geometry: `packages/contracts/correspondence.mjs` and
  `heritage-frame.mjs`. Assets: `services/functions/assets/letterhead/`.
  See `docs/architecture/correspondence.md` for permissions, versioning, retries,
  verification commands, deployment needs and provider-managed email limits.
- Keep real correspondence in private storage or `data/private/`; only synthetic
  review fixtures belong in Git. Run `npm run test:correspondence` and relevant
  emulator/browser checks when changing this workflow.

# Release communication rules

For every major user-facing update, add a new release post under
`apps/updates-blog/posts/YYYY-MM-DD-descriptive-slug/` as part of the work.
Chinedum uses these posts to share updates with the community.

- Follow the existing Blogger post format: `post.html` for the article body
  and `README.md` for title, labels, search description, publishing steps,
  and release/deployment status.
- Include `share.md` with concise copy Chinedum can share and a clearly marked
  placeholder for the published article URL.
- Always include relevant images in release posts. Save the assets with the post,
  embed them in `post.html` with descriptive alt text and captions, and document
  image credits plus Blogger upload/replacement steps in `README.md`. Prefer
  verified product screenshots when they explain the change; label illustrations
  clearly. Do not leave an image placeholder without the actual image asset.
- Explain what changed, who benefits, how to use it, and relevant availability
  limits in plain language. Base claims on verified implementation and release
  evidence; distinguish implemented features from confirmed live releases.
- Cover substantial features, redesigns, and workflow changes. Group related
  changes into one post; routine internal maintenance does not need a post.
- Keep older release posts intact. Add a new dated folder for each major
  update, and link it from `apps/updates-blog/posts/README.md`.
- Preparing repository content does not imply publishing it externally or
  sending messages. Leave the publication and sharing handoff to Chinedum
  unless the user explicitly requests those actions.
