# SMS notifications (Arkesel)

High-priority notifications are delivered by **SMS through [Arkesel](https://arkesel.com)**,
a Ghanaian messaging provider, in addition to (not instead of) email. This is
for the moments a creator should not have to wait for or dig through email —
an account decision on their application, for example.

Like email, all sending happens in **`services/functions`** and is *best
effort*: it never throws and no-ops when unconfigured. It complements the
[transactional email](transactional-email.md) system and shares the same
`notifications` fan-out trigger.

## How a notification becomes an SMS

The `onNotificationCreated` trigger (`notifications.ts`) sends an SMS when the
`notifications` document is **high priority**, meaning either:

- its `channels` array includes `"sms"`, or
- it has `priority: "high"`.

It resolves the recipient's phone (creator profile `contact.phone`, then their
Firebase Auth number), sends a concise one-thought message, and records the
outcome back on the document under `sms: { status, to, id, attemptedAt }` (which
also makes it idempotent). No phone on file → recorded as `skipped`, never an
error.

Today, **terminal creator-application decisions** (approve, reject, suspend,
revoke) are marked high priority in `decideCreatorApplication`. To add SMS to
any other flow, write its `notifications` document with `"sms"` in `channels`
(or `priority: "high"`) — no new Function needed.

## Admin console

The admin app has a **Messaging** tab (admin-role only) that:

- shows the Arkesel **balance** (SMS units and main GHS balance), and
- sends a **test SMS** to any Ghana number.

Both call admin-only callable Functions — `smsBalance` and `sendTestSms` — so
the Arkesel API key never reaches the browser.

## The client module

`sms.ts` owns the Arkesel integration using the built-in global `fetch`:

| Function | Purpose |
| --- | --- |
| `sendSms({ to, message })` | Send one SMS (`POST /api/v2/sms/send`). Never throws. |
| `checkBalance()` | Read the account balance (`GET /api/v2/clients/balance-details`). |
| `normalizeGhanaPhone(raw)` | Normalise `0…`, `+233…`, `233…`, bare national → `233XXXXXXXXX`. |

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `ARKESEL_SENDER` | `Indigen` | Approved Arkesel sender ID (≤ 11 chars) |
| `ARKESEL_API_KEY` | — (secret) | Arkesel API key, in Secret Manager |

The sender ID must be **approved in the Arkesel dashboard**; an unapproved
sender is rejected by the provider.

### Set the secret and deploy

```bash
firebase functions:secrets:set ARKESEL_API_KEY
firebase deploy --only functions:onNotificationCreated,functions:smsBalance,functions:sendTestSms
```

### Local emulator

```bash
# services/functions/.secret.local (git-ignored)
echo 'ARKESEL_API_KEY=your api key' >> services/functions/.secret.local
```

Without the key the emulator runs normally and simply skips sending.
