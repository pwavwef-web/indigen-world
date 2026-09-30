# Contributor support operations

## Website and staff inbox

- Public entry: `https://tribestudio.indigenworld.com/contributor/support` (deployed September 26, 2026).
- Staff: Admin → Contributors → Issues → Support inbox. Assignment reports remain underneath.
- New cases receive automatic guidance. A member can request recovery, ask a person, reply or confirm resolution. Staff may record confirmed resolution obtained through another channel.
- The member's private link is a bearer credential. Do not paste it into issues, analytics, release posts or team chats. The server stores only its hash. Staff do not need that link.
- Staff replies appear in the private case and queue an email. Email acceptance only means the SMTP relay accepted the message. Members should reply through their private case link; direct email replies go to the normal team mailbox and are not automatically ingested into this inbox.
- No guaranteed response time is advertised. Review the inbox and team mailbox regularly. Open cases older than 24 hours produce an internal reminder once per UTC day.

## Delivery and account recovery

`SMTP_PASSWORD` must exist in Secret Manager and be bound to `onSupportEmailCreated`. `SMTP_USER`, `MAIL_FROM` and `MAIL_TEAM` default to the existing team mailbox. Never put live secrets into `.env.example` or source control.

Recovery emails are sent only after Firebase Auth and the contributor record confirm an enabled, active contributor. Other addresses receive the same public response and no email. Staff must verify identity before sharing account details or changing an invitation email. Support never sets a member's password.

`accepted` is not `delivered`. `failed`, `held` and `unknown` require attention. Do not resend uncertain sends blindly. Check the mailbox/provider history first; send a new staff reply only when appropriate. The hourly sweep marks sends stuck for ten minutes as uncertain.

## WhatsApp activation gate

Implementation is prepared for **Meta Cloud API**, but a business portfolio alone is not a connected WhatsApp account.

1. Confirm whether the chosen number is regular WhatsApp or WhatsApp Business and whether phone access must continue. Back up chats using the official mobile flow. Do not delete an existing WhatsApp account merely to get through a signup screen.
2. Complete the appropriate official WhatsApp Business migration/coexistence or dedicated-number flow. Confirm Ghana eligibility in the actual selected flow. Complete any identity/business verification and terms with the owner. Keep any unsupported migration paused.
3. Create/configure the business-owned Meta app and WABA. Obtain the business phone number ID and WABA ID. Grant only the WhatsApp permissions and assets required by the integration. The owner handles credentials, verification codes and any required security changes.
4. Store `SUPPORT_META_APP_SECRET`, `SUPPORT_META_VERIFY_TOKEN` (random), and `SUPPORT_META_ACCESS_TOKEN` in Secret Manager. Use a properly scoped production token; never commit it or print it in logs.
5. Write the server-only `_supportConfig/whatsapp` document with `provider: "meta"`, `number` (E.164), `wabaId`, `phoneNumberId`, `apiVersion` (a currently supported Graph version), and `enabled: false`.
6. Set `ENABLE_SUPPORT_WHATSAPP=true` in the private production environment file for Functions, then deploy `supportWhatsappWebhook`, `onSupportWhatsappEvent` and `onSupportWhatsappOutbox`. Keep that environment setting for subsequent deployments: it controls whether the optional functions and secrets are included in discovery. The webhook URL is the deployed HTTPS function URL. Subscribe to WhatsApp `messages`; complete the GET verification challenge with the stored verification token.
7. During a controlled activation session, enable the config and send an inbound message from an owner-approved test number. Verify one case, one automatic response, a real delivered/read callback, HUMAN handoff, STOP suppression and a staff reply. Disable immediately if any gate fails. Only then advertise the WhatsApp link. A webhook test payload or API acceptance alone is not sufficient.

Messages outside the 24-hour reply window are held. Approved outbound templates are not configured. A member can initiate a new conversation to reopen the window. Never route a blocked WhatsApp reply to SMS.

## Deployment

Follow the feature-branch and pull-request workflow. Production hosting must deploy from clean, verified `origin/main`.

Website phase: deploy Firestore indexes; deploy `supportPortal`, `listSupportCases`, `getSupportCase`, `updateSupportCase`, `onSupportEmailCreated`, `supportEscalationSweep`; then deploy TribeStudio and Admin hosting. Preserve the existing SMTP environment settings. No rules change is required: emulator tests verify direct reads are denied, including for staff.

Do not include WhatsApp functions in the first deploy before their secrets and account setup are complete. No personal customer data is required for testing: use `npm run test:support` with the demo emulators.

## Verification

The integration suite covers private-case access, direct Firestore denial, admin role checks, concurrent retries, human escalation, confirmed closure/reopening, mailbox-only reset links, unknown-account neutrality, raw webhook signatures, business scope, duplicate receipts, STOP, the 24-hour window, uncertain sends and delivery callbacks. Website/Admin check commands cover type checks and production builds. Provider onboarding, live mail delivery and actual WhatsApp delivery need separate release evidence.

## Release state — September 26, 2026

- Firestore indexes, the six website/email functions, TribeStudio and Admin hosting deployed from `origin/main` at `e59108f6`.
- Edge inspection confirmed the public support form and authenticated staff inbox. Hosted configuration responds successfully; invalid case access and unauthenticated staff access are denied. The inbox has no production cases yet; a full production conversation and real email delivery remain unverified.
- Meta business contact details are saved. The new WhatsApp Business account displays “Review in Progress.” Number connection returned “Phone Number In Use”; the linked existing WhatsApp account is inaccessible to the current Meta session. Preserve the existing phone account while the owner resolves its association or chooses an appropriate supported connection flow.
- WhatsApp functions and secrets have not been deployed. Public configuration returns `whatsappUrl: null`. No number migration, disconnection or live WhatsApp automation has occurred.
- Local gates passed. GitHub Actions could not start because of the account billing lock; resolve billing separately before relying on remote CI.
