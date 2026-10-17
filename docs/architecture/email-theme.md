# Indigen World email theme

All application email is rendered by one shared theme:
`services/functions/src/email-theme.ts`. Templates live in
`services/functions/src/email-templates.ts` and only describe content as
blocks. The theme turns those blocks into email-safe HTML and a matching
plain-text alternative. Sending still goes through `sendMail` or
`sendMailWithLetter` in `email.ts`, which attaches the Heritage Frame PDF
(see [correspondence.md](correspondence.md)).

## Tokens

`EMAIL_TOKENS` holds every colour, the font stacks and the status tones. They
follow TribeStudio's blue language (`apps/tribestudio/src/ui/tokens.css`).

| Role | Light | Dark |
| --- | --- | --- |
| Page background | `#F4F7FC` | `#0B1225` |
| Content surface | `#FFFFFF` | `#131D35` |
| Heading navy | `#102A56` | `#F1F5FF` |
| Body text | `#243247` | `#D5DDEA` |
| Secondary text | `#536176` | `#AEB9CC` |
| Divider | `#DBE4F0` | `#2A3A5C` |
| Primary action (white label) | `#1D4ED8` | `#1D4ED8` |
| Links | `#1D4ED8` | `#93B4FF` |
| Soft blue panel | `#EFF6FF` | `#1B2A4A` |

Green, amber and red tones exist only for statuses, and every status carries a
written label (the pill text or panel title). `firebase/tests/emailTheme.test.mjs`
checks that every text/background pair reaches WCAG AA (4.5:1).

Type is a system stack (`-apple-system, Segoe UI, Roboto, Noto Sans, Helvetica
Neue, Arial`). Body text is 16 px and headings are 28 px (24 px on phones). No
web fonts are loaded. Noto Sans and Segoe UI both cover Kasem letters such as
ɛ ɔ ŋ ʋ and combining tone marks. Kasem values can be tagged `lang: 'xsm'`.

## Layout

- A hidden inbox preheader, separate from the subject.
- A header with the existing roof/bars/sun logo (40 px) beside the text
  wordmark "Indigen World", and an optional product label (TribeStudio,
  Contributor Portal, Contributor support, Website forms).
- A white card, 600 px maximum, with a 4 px blue top rule. Inside it: an
  optional status pill, one heading, then the content blocks.
- A footer with the reply/support line, the reason the recipient got the
  message, optional preference and unsubscribe links, indigenworld.com and
  the current year. Team alerts (`audience: 'team'`) drop the reply line.

### Logo

The mark is `services/functions/assets/letterhead/indigen-world-logo.svg`.
Gmail and Outlook do not display SVG, so
`node services/functions/scripts/build-email-logo.mjs` renders a 120 px PNG
(3× the display size). The script writes two copies:

- `services/functions/assets/email/indigen-world-logo.png` is attached to every
  SMTP email as an inline image (`cid:indigen-world-logo`). `letterMailOptions`
  adds it whenever the HTML refers to that CID, so the logo needs no remote
  image fetch and adds no tracking.
- `apps/website/public/email/indigen-world-logo.png` is served at
  `https://indigenworld.com/email/indigen-world-logo.png`. It is only for
  provider-managed templates that cannot carry attachments (the Firebase
  password reset).

When images are blocked, the text wordmark still identifies the sender. The
image also has alt text and a navy background.

## Blocks

| Block | Use |
| --- | --- |
| `greeting` | "Hi Ama," using the first name; falls back to "Hello," |
| `text` | Copy. Blank lines start paragraphs; single newlines are kept |
| `details` | Labelled facts (reference, title, date, points, value), stacked so long values wrap |
| `panel` | Tinted note with a written title: reviewer feedback, a security note |
| `steps` | Numbered "What happens next" |
| `updates` | Editorial items for announcements |
| `action` | The one primary button. `fallback: true` prints the URL for account actions |
| `link` | A quiet secondary link |
| `signoff`, `note` | Closing lines and small print |

Every dynamic value is escaped. Links must be absolute HTTPS or `mailto:`, or
a provider placeholder such as `%LINK%`. Local hosts (`localhost`, `127.*`,
`*.localhost`, `*.test`) are refused. The only exception is while the Firebase
emulators are running, because their action links are local.

## Template variables

| Builder | Inputs | Sent by |
| --- | --- | --- |
| `contactAcknowledgement` / `contactTeamAlert` | name, email, subject, message | `publicForms` (contact) |
| `involvementAcknowledgement` / `involvementTeamAlert` | name, contact, country, organisation, route, note | `publicForms` (get involved) |
| `testerRewardAcknowledgement` / `testerRewardTeamAlert` | certificate/card names, emails, country, listing choice | `publicForms` (tester reward) |
| `newsletterWelcome` | none | `publicForms` (newsletter, new subscribers only) |
| `notificationEmail` | title, body, type, link, actionUrl | `onNotificationCreated` |
| `supportEmail` | subject, text, kind (`reply`/`team`/`recovery`), reference, recoveryUrl | `onSupportEmailCreated` |
| `correspondenceEmail` | subject, text | `correspondence` callable (send) |
| `validatorInvitationEmail` | name, language | manual/admin tooling |
| `firebasePasswordResetEmail` | none (`%LINK%` from Firebase) | Firebase Auth, via `brand-auth-emails.mjs` |
| `redemptionUpdatePreview` | status, reference, points, amount, reward, note | **preview only** |
| `announcementPreview` | heading, intro, updates, action | **preview only** |

`notificationPresentation` maps the backend's own notification titles and
types to a product label, a status pill, the button label, a feedback panel and
the footer reason. A title the backend does not write gets no status pill.
Approval never reads as publication. Payout notices go to the Contributor
Portal.

Each template returns `{ subject, html, text, letterText }`. Pass the whole
object to `sendMail` (`sendMail({ to, ...content, deliveryKey })`), so that
`letterText` (the message without the inbox footer) becomes the attached PDF
letter.

## Adding a variant

1. Add a builder to `email-templates.ts` that calls `renderEmail` with a
   subject, a distinct preheader, a heading, blocks and an honest `reason`.
   Use real backend states and values. Never calculate money or points in a
   template: pass in strings already produced by the ledger helpers (for
   example `formatGhs`).
2. Add a synthetic fixture to `services/functions/scripts/email-fixtures.mjs`.
3. Run `npm run preview:email` and `npm run test:email`.
4. Wire it to the real event with a stable `deliveryKey` that retries reuse.

## Previewing

```bash
npm run preview:email
```

This writes `output/email-previews/index.html` (git-ignored). The page shows
each variant at desktop (640 px), mobile (375 px) and forced-dark sizes, with its
plain text. The fixtures are synthetic. These are browser previews, not tests
in real email clients.

## Provider configuration and limits

- **SMTP** (Gmail / Google Workspace, `SMTP_PASSWORD` secret). The sender is
  `Indigen World <hi@indigenworld.com>`, so replies reach the team inbox. Team
  alerts set `replyTo` to the person who submitted the form.
- **Firebase Auth password reset**: the body is set by
  `services/functions/scripts/brand-auth-emails.mjs`. It previews by default.
  To apply it, deploy the website first so the hosted logo is live, then run:
  `node services/functions/scripts/brand-auth-emails.mjs --project project-kassena-7e026 --template resetPasswordTemplate --apply --backup data/private/auth-templates-backup.json`.
  The script refuses to apply while the logo URL is not serving a PNG, saves
  the previous template, and reads the result back to check it.
- **Firebase verification, email-change and second-factor emails**: Firebase
  only lets the project set their sender name, reply-to and subject. The
  script sets those, and their bodies stay Firebase's own. The hosted action
  page is Firebase's default page and is outside this theme.
- **Unsubscribe**: no unsubscribe or preference mechanism exists. The theme
  renders `unsubscribeUrl` / `preferencesUrl` when a template supplies them.
  Build the mechanism before sending announcements; the announcement variant
  is preview-only until then.
- **Redemptions**: no email is sent for reward redemptions today. The preview
  uses the backend's own states: `submitted`, `approved`,
  `needs_reconciliation`, `fulfilled`, `failed`, `rejected` and `cancelled`.

## Client support

The theme uses presentation tables, inline styles, a VML button for desktop
Outlook, `mso` conditionals, and dark-mode rules for Apple Mail, Outlook.com
(`[data-ogsc]`) and other clients that honour `prefers-color-scheme`. Gmail
apps apply their own dark-mode inversion, and no email can fully control
that. Nothing depends on JavaScript, flexbox, grid, hover or background
images. Messages are 8–16 KB of HTML, well under Gmail's 102 KB clip.
