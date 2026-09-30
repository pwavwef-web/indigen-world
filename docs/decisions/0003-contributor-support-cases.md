# 0003: Contributor support before authentication

Date: 2026-09-26. Status: accepted for implementation; deployment tracked in the release post.

## Context

Contributors who cannot sign in cannot reach authenticated issue reporting. Replies need to remain traceable through human escalation and confirmed resolution.

## Decision

- TribeStudio owns `/contributor/support`. Admin owns the staff support inbox. Firebase Functions enforce access and run delivery jobs; Firestore remains authoritative.
- Public cases use a random 256-bit bearer key in the URL fragment. Only its hash is stored. The private link grants access to that case, never the contributor account. Support loads without Analytics, and links to support use a full navigation. API requests and case HTML are not cached by the service worker.
- Submitted contact information is unverified. The public API never returns account existence or diagnostics. Recovery links go only to an active contributor's registered email. Staff account checks remain admin-only and must not be copied into replies without establishing identity.
- Automatic guidance is deterministic. It does not use an LLM, read assignments, change passwords, update payment details or approve payments.
- A durable outbox separates saved replies from transport. SMTP acceptance and WhatsApp API acceptance are not proof of delivery. Uncertain sends are held for review, not resent automatically.
- Meta Cloud API is the WhatsApp adapter. HMAC verifies the raw body; business and phone IDs bind scope; provider message IDs deduplicate receipts. STOP suppresses sends. Free text is held after 24 hours; no proactive templates or SMS fallback are enabled.
- WhatsApp stays disabled until the actual number, account permissions, credentials, inbound receipt and outbound delivery have been verified. Sent was not selected because Ghana was absent from its current self-service phone-verification country list.
- The existing authenticated assignment-issue workflow stays available beside the new support inbox.

## Consequences

Anyone with a private case link can read and reply to that case. The interface explains this. Losing the link requires contacting the team; an email address alone cannot retrieve cases. Staff close cases only with recorded confirmation. Open cases receive daily internal reminders after 24 hours; no automatic closure or unsolicited contributor follow-up is performed.

Messages and operational metadata are private in Firestore, covered by the existing privacy notice and default-deny rules. Staff handle access/deletion requests through the existing privacy process. There is no claim of automatic retention deletion. Common accidental credentials are redacted, but this is best effort; users are told never to send secrets.

Webhook attachments are not downloaded. A text description is requested. Unmatched delivery events stop retrying after ten minutes. Failed, held and uncertain delivery remains visible to staff.
