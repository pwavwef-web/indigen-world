# Transactional email

How the Indigen World ecosystem sends operational email — form
acknowledgements, team alerts and the notifications that back creator
applications and review decisions.

All sending happens in **`services/functions`** (Firebase Functions v2,
`us-central1`). No other app or service talks to an SMTP server directly; the
web apps and the mobile client trigger email only indirectly, by calling a
Function or by writing a `notifications` document.

## Delivery paths

| Trigger | Source | Who is emailed |
| --- | --- | --- |
| Contact form | `publicForms` (`public-forms.ts`) | Team alert to `MAIL_TEAM`; acknowledgement to the sender |
| Get-involved form | `publicForms` | Team alert to `MAIL_TEAM`; acknowledgement to the sender (when they left an email) |
| Newsletter signup | `publicForms` | Welcome to the new subscriber (new subscribers only) |
| Creator application received | `submitCreatorApplication` → `notifications` | The applicant |
| Application decision | `decideCreatorApplication` → `notifications` | The applicant |
| Submission decision / publication | `decideSubmission` → `notifications` | The creator |

The last three write a `notifications` document with a `channels` array. The
**`onNotificationCreated`** Firestore trigger (`notifications.ts`) fires on
`notifications/{id}`, and when `channels` includes `email` it resolves the
recipient's address (creator profile `contact.email`, then their Firebase Auth
email) and sends one on-brand message. It records the result back on the
document under `email: { status, to, attemptedAt }`, which also makes the
trigger idempotent under at-least-once delivery.

Adding a new email is therefore usually just writing a `notifications` document
with `channels: ['in_app', 'email']` — no new Function required.

The same trigger also delivers **high-priority** notifications by SMS through
Arkesel; see [SMS notifications](sms-notifications.md).

## Design rules

- **Best effort, never fatal.** `sendMail` never throws and returns `false` on
  failure, so a mail outage cannot fail a form submission or a review decision.
- **No-op when unconfigured.** With no `SMTP_PASSWORD` bound (local checkout,
  emulator, CI), sending is skipped and logged. The test suite stays green.
- **One sender module.** `email.ts` owns the transport and config; `email-templates.ts`
  owns the markup. Templates return `{ subject, html, text }` and always include
  a plaintext alternative.

## Configuration

Non-secret settings have safe defaults in code and can be overridden with a
git-ignored `services/functions/.env` (see `.env.example`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `SMTP_HOST` | `smtp.gmail.com` | Relay host |
| `SMTP_PORT` | `465` | `465` = implicit TLS, `587` = STARTTLS |
| `SMTP_USER` | `hi@indigenworld.com` | SMTP login / default from-address |
| `MAIL_FROM` | `SMTP_USER` | From address |
| `MAIL_FROM_NAME` | `Indigen World` | From display name |
| `MAIL_TEAM` | `SMTP_USER` | Inbox for contact / get-involved alerts |
| `STUDIO_BASE_URL` | `https://tribestudio.indigenworld.com` | Prefix for relative notification links |

The only secret is the SMTP password (a Google **app password**), stored in
Secret Manager as **`SMTP_PASSWORD`** and never committed.

### Set the secret and deploy

```bash
# Store the app password once (prompts for the value):
firebase functions:secrets:set SMTP_PASSWORD

# Deploy the backend that reads it:
firebase deploy --only functions
```

### Local emulator

```bash
# services/functions/.secret.local (git-ignored)
echo 'SMTP_PASSWORD=your app password' > services/functions/.secret.local
```

Without that file the emulator runs normally and simply skips sending.

## Verifying credentials

`verifyTransport()` in `email.ts` authenticates against the relay without
sending a message — useful for a one-off credential check or a future health
endpoint.
