# Emails that sound like Indigen World

- **Prepared:** 14 October 2026.
- **Topic:** A shared, blue Indigen World email theme for every application
  email: logo, product labels, written status labels, a reviewer feedback
  panel, account-action fallback links, phone and dark layouts, and matching
  plain text.
- **Labels:** Email, Feature, Design, TribeStudio, Community.
- **Search description:** Indigen World emails now share one clear blue design
  with our logo, plain status labels, reviewer feedback panels and layouts that
  work on phones and in dark mode.
- **Implementation:** Committed to `main` as `46c31b6` (on top of `7cd1e55`).
  Guide: `docs/architecture/email-theme.md`.
- **Deployment:** On 14 October 2026, from a clean checkout of `46c31b6`, the four
  Functions that send email (`publicForms`, `onNotificationCreated`,
  `onSupportEmailCreated` and `correspondence`) were deployed by explicit list
  (four successful updates). The live function count stayed at 223. Website
  Hosting (`indigen-world`) was also deployed through the production guard
  and `check:website`, to serve the logo copy used by the Firebase reset template.
- **Blogger:** Unpublished. Publication and external sharing remain Chinedum’s handoff.

## Publishing steps

1. Review the release evidence below.
2. Create a Blogger draft with the title and labels above. Paste `post.html` in
   HTML view.
3. Upload `images/cover.png`, `images/review-feedback-desktop.jpg`,
   `images/approved-phone.jpg`, `images/password-reset-phone.jpg` and
   `images/dark-phone.jpg`. Replace each relative `src` with its Blogger image
   URL. Keep the alt text and captions.
4. Preview on desktop and phone, then publish.
5. Put the published URL in `share.md` and add it to the posts index.

## Images and credits

`screens/` holds unaltered headless-Chrome screenshots of the actual email
templates. They were rendered by `npm run preview:email` from synthetic
fixtures (`services/functions/scripts/email-fixtures.mjs`), at 680 px (desktop)
and 375 px (phone). The dark shot applies the theme's own dark rules. For the
three phone shots, 44 px of page background was added above the email so the
phone frame's camera cut-out does not cover the logo. The recovery link shown
is synthetic and does not work.
The Kasem examples (*A na vei sɔŋɔ to*, “When I went home”; *Dé toŋe*, “We
worked”) are printed examples from the Kasem grammar guide, chapters 6 and 8.

`images/` holds the cover and framed figures made by the posts' art renderer
(`render-post-art.mjs`) from `art.json` (blue, chevrons). The device frames,
background and titles are illustration; the email content is actual template
output. The logo is the existing Indigen World roof/bars/sun mark. Branding,
UI and post framing: Indigen World.

## What changed (implementation)

- `services/functions/src/email-theme.ts`: tokens (TribeStudio blue; every
  pair tested for WCAG AA), the layout, and the content blocks (greeting, text,
  details, panel, steps, updates, action with optional fallback link, link,
  signoff, note). HTML and plain text come from the same blocks. Includes a
  VML button for desktop Outlook and dark rules. Links must be HTTPS and never
  point at a local host.
- Logo: `services/functions/scripts/build-email-logo.mjs` renders
  `assets/letterhead/indigen-world-logo.svg` to a 120 px PNG. SMTP emails embed
  it inline (`cid:`); `apps/website/public/email/indigen-world-logo.png` is the
  hosted copy for provider-managed templates.
- `email-templates.ts` rebuilt on the theme. `notificationPresentation` derives
  labels only from titles the backend actually writes. Approval is never shown
  as publication. Raw status codes in default bodies are reworded.
- Wiring: `notifications.ts` (type and link), `public-forms.ts`, `support.ts`
  (reply, team or recovery, plus the case reference), `correspondence.ts`
  (themed body, PDF unchanged), `email.ts` (`letterText` keeps the inbox footer
  out of the attached PDF letter), `correspondence-delivery.ts` (inline logo).
- Preview-only variants: reward redemption (`submitted`, `approved`,
  `needs_reconciliation`, `fulfilled`, `failed`, `rejected`, `cancelled`) and
  announcements. Neither is wired to any event.

## Verification

- `npm run test:email` (9/9): contrast, every fixture's links, size (8–16 KB)
  and plain text, escaping of hostile input, Kasem characters, greeting
  fallback, honest status wording, the account fallback link and `%LINK%`, and
  the MIME structure (`multipart/related` with the logo's Content-ID, plus the
  PDF).
- `npm run test:correspondence` (13/13); support integration test against the
  Auth/Firestore emulators (9/9); `test:function-helpers` 639/640. The one
  failure, `languageLoop`, needs the git-ignored word-queue seed file, which a
  fresh worktree lacks; it is unrelated to email.
- Browser previews at 640/375 px in light and forced-dark appearance, inspected
  visually.
- After the deploy, `publicForms` answered a GET with its own 405 JSON (the new
  bundle boots). The hosted logo returns 200 `image/png`, and its SHA-256 matches
  the build.
- A single test email went to the requesting account through the production
  `sendMail` path. SMTP accepted it, and it arrived in the Gmail inbox
  (Primary) with the inline logo, the PDF attachment and intact Kasem text.

Not verified: rendering in Outlook desktop, Apple Mail, Outlook.com, Yahoo and
Gmail's mobile apps (only browser previews and the Gmail web inbox
delivery were checked). No real member notification has been observed in the
new design yet.

## Not changed / remaining

- The Firebase-hosted password-reset template is not applied. It is ready:
  `node services/functions/scripts/brand-auth-emails.mjs --project project-kassena-7e026 --template resetPasswordTemplate --apply --backup data/private/auth-templates-backup.json`.
  Firebase verification and email-change bodies cannot be customised.
- No unsubscribe or preference mechanism exists, so announcements stay
  preview-only.
