# Operating the connected mobile workflows

Repository implementation, 16 October 2026. This is a staged upgrade, not a
confirmation of production deployment. The acceptance ledger is
[the product matrix](../product/integrated-mobile-upgrade-ledger.md).

## Configuration and permissions

| Name | Location | Purpose / default |
| --- | --- | --- |
| `PAYSTACK_SECRET_KEY` | existing Functions Secret Manager secret | Server-only hosted payments, verification and refunds; use a test key for staging |
| `SHOP_PAYSTACK_CALLBACK_URL` | Functions environment | HTTPS URL under `/shop/`; callbacks are navigation, never payment proof |
| `shopSettings/store` | Shop → Settings callable | `checkoutEnabled` defaults off; GHS, support contact, policies and optional `taxBps` are required/configured by staff |
| `shopDelivery` | Shop → Delivery | Explicit enabled countries, regions, fees, pickup and estimates; no production zones are seeded |
| `INDIGEN_HOUSE_ORGANISATION_ID` | Functions environment | Verified existing Indigen organisation/account ID; missing value blocks house-profile creation |
| `RICH_NOTIFICATION_PUSH_ENABLED` | Functions environment | Defaults false. Android data-only rendering after the device matrix passes |
| `IOS_RICH_MEDIA_ENABLED` | Functions environment | Defaults false. Enable only after the NotificationService extension is signed, embedded and tested on Apple hardware |
| `ADMOB_POST_COMMENTS_NATIVE_AD_UNIT_ID` | ignored AdMob config / CI secret / Dart define | Dedicated Android native unit; optional, distinct from existing units, same publisher |
| `POST_COMMENTS_ADS_ENABLED` | Dart define | Defaults false in release; the release-config script enables it only with the optional dedicated unit |
| `MOBILE_VIDEO_RENDER_ENABLED` | Dart define | Defaults false in release; basic editing/drafts remain available; enable after render/post smoke checks |
| `ENFORCE_APP_CHECK` | existing Functions environment | Existing App Check deployment policy; do not weaken it to fix client configuration |

`shopAdmin` requires an admin role. Finance additionally requires the existing
`finance` claim (or super-admin). Optional server-issued `shopScopes` narrows an
admin to `catalogue`, `fulfillment`, `customer_data`, and/or `finance`; an explicit
scope list is enforced by the callable, and catalogue writes also enforce it in
Firestore Rules. Existing unscoped admins retain their existing broad authority.
Issue scoped claims through the authorized identity administration workflow,
then refresh tokens; a client profile field grants no authority. Notifications
to all opted-in members additionally require `broadcast` or super-admin.

All emails continue through the existing correspondence-aware `email.ts` path.
This upgrade adds canonical in-app order alerts and does not introduce another
SMTP sender or send any messages during repository preparation.

## Migration and staged rollout

1. Review the working-tree diff against the integration baseline; unrelated
   local changes exist. Build Functions and Admin before deployment.
2. Deploy the additive indexes in `firebase/firestore.indexes.json` and wait
   for them to become ready, then the corresponding rules and callable/trigger
   functions. These are prototype rules tested in emulators; review the complete
   existing rule set before broad release. Firestore was confirmed Standard
   edition in `nam5`; no database was created or changed.
3. Build Functions, then run the migration **without** `--apply`:
   `node services/functions/scripts/migrate-integrated-shop.mjs --project=<explicit-project-id>`.
   Review counts, back up affected documents, and run with `--apply` only as part
   of an authorized release. It is idempotent; zero/negative legacy prices stay
   quote-only, old URLs remain external, historical `shopOrders` stay untouched,
   and unknown stock starts at zero. New paid state uses `shopOrdersV2` only.
4. Staff configure products, variants, stock adjustments, delivery and policies
   through Admin. Never seed the synthetic review fixtures in a live project.
5. Configure Paystack test mode and the existing signed `paystackWebhook`.
   Exercise card success/failure, pending/abandoned MoMo, duplicate webhook,
   expired/late payment, partial/full refund and ambiguous-request recovery.
   Check reference, amount, currency, email, purpose and order ownership in the
   verified ledger. Do not infer settlement from a redirect.
6. Ship mobile with checkout unavailable until settings/provider checks pass;
   rich pushes, new comment ads and server rendering remain gated separately.
   Publish the website brand PNG with its unchanged source SVG before using the
   house-profile logo URL. No existing advertiser profile is overwritten.

### Dedicated AdMob unit handoff

No new live ad-unit ID was created. An authorized AdMob console session was not
available to this task. In the existing Indigen Android application
(`com.indigenworld.indigen`), create a **Native advanced** unit named
**Post comments — native**. Store its returned ID as
`ADMOB_POST_COMMENTS_NATIVE_AD_UNIT_ID` in the ignored config and CI secret.
Run `scripts/admob-release-config.test.mjs` and release-config validation; do not
reuse Collection, Explore or Community unit IDs. Test consent changes, no-fill,
membership removal, video media, large fonts, collapse/reopen and app resume
using test ads before enabling release traffic. The Android factory reports its
measured natural height; required media/CTA assets are not squeezed into a
fixed comment box. SDK clicks and AdChoices remain SDK-owned.

## Recovery and bounded operation

- **Orders:** server totals and snapshots are immutable. Reservations expire
  after 30 minutes; reconciliation runs every 10 minutes in batches of 100.
  Payment and fulfillment states are independent. A late unavailable/cancelled
  order becomes `refund_required`; it cannot dispatch. Staff resolve customer
  requests with a recorded explanation. Finance authorizes refunds separately;
  restocking requires an explicit inspected inventory adjustment and reason.
- **Ambiguous payments/refunds:** never generate a fresh reference or resend an
  uncertain mutation. Check the same provider reference, or locate the refund
  merchant note `shop:<refund-id>` and reconcile its provider ID in Finance.
  Reserved refundable amounts prevent another operator from refunding them
  twice. CSV numeric money stays numeric and text formulas are neutralized.
- **Images:** admin-owned originals are private, immutable and at most 10 MB.
  Actual signatures and decoder output must agree with JPG/PNG/WebP; dimensions
  are 32 px minimum and 40 MP maximum. FFmpeg strips metadata and creates 1600 px
  display / 480 px thumbnail JPEGs. Processing is capped at four 1 GiB workers;
  each admin can begin 100 uploads/hour. Recover pending server assets in the
  picker after reload; an unfinished local byte upload requires reselecting its
  source. Seven-day cleanup excludes published/shared assets. Published assets
  are conservatively retained even if legacy URL usage cannot be reconstructed.
- **Push:** records, provider acceptance, open and read are separate states.
  Attempts use a lease, at most four attempts and exponential backoff; invalid
  tokens are removed. Expired dispatch leases are retried with stable alert IDs.
  Partial provider acceptance is recorded and not blindly resent to every
  device. Quiet hours use an IANA timezone, including DST; order updates bypass
  them. Promotional messages require opt-in at dispatch. No device receipt is
  claimed. Campaign fan-out pages 100 profiles, ten active campaigns per tick.
- **Actions:** canonical recipient/target authorization is checked again.
  Repeated Like sets a desired state; inline replies have stable IDs. Offline
  actions are account-scoped, capped at 50 and expire after seven days. Logout
  cannot replay account A's action as B. Revoked content, blocks and inactive
  public-space membership deny post actions. Native Apple actions open the app
  and drain a recipient-scoped native queue after authentication.
- **OS display:** Android rich mode uses app-rendered alerts in foreground,
  background and supported terminated states; system notification mode is the
  fallback when the flag is off. Apple uses APNs system display in background,
  local display in foreground, registered categories and a bounded image
  extension. The extension accepts only approved HTTPS Google Storage hosts,
  no redirects and at most 5 MB, and preserves text on failure. Force-stop,
  denied permissions and OS throttling still prevent display. Windows cannot
  compile/sign or prove Apple push behavior; run the iOS flavor build and device
  checks on macOS before enabling `IOS_RICH_MEDIA_ENABLED`.
  In Xcode, select the existing Apple team for Runner and NotificationService,
  enable Runner Push Notifications with the matching App ID/provisioning
  profiles, and verify the existing APNs credential in Firebase Cloud Messaging.
  Keep keys outside the repository. Run `xcodebuild -list` for the project and
  `flutter build ios --release --no-codesign --flavor production`; then install a
  signed build and verify foreground/background/cold-launch actions, recipient
  switching, hidden previews, failed images and expired authentication.
- **Video:** local account/project directories hold originals and atomic draft
  JSON. Source uploads are sequential, capped at 300 MB each; mobile projects
  are capped at 30 scenes / five minutes. The existing render service permits
  40 starts/hour, three active exports/member, six workers with concurrency one,
  and a 1.5 GB input budget. Exports are retained for 30 days, newest three per
  project. Text/captions are Flutter-rendered PNG layers, not assumed browser
  artifacts. Revision counters remain monotonic through undo; server handoff
  verifies ownership, revision, successful non-draft output and a canonical
  timeline fingerprint. Final posting still uses normal moderation/audience
  controls. AI generation entitlements are unchanged. Use rendered preview to
  inspect transitions and the full audio/sticker mix; source preview is local.

## Deployment rollback

Disable `shopSettings/store.checkoutEnabled` first to stop new checkouts while
keeping order status/refunds accessible. Disable the rich-push flag and ship
mobile comment/render flags off if needed. Pause house campaigns or cancel
notification campaigns before dispatch. Keep reconciliation, paid-order data,
refund reservations and canonical notification records; never roll them back to
legacy request-only orders. Reverting the mobile editor preserves originals and
versioned private drafts. Retain additive fields/indexes and finalized assets
until older clients and references have been audited. A code rollback is not a
refund, cancellation, email recall or external unpublish operation.

Provider references: [Paystack verification](https://paystack.com/docs/payments/verify-payments/),
[refunds](https://paystack.com/docs/payments/refunds/),
[webhooks](https://paystack.com/docs/payments/webhooks/),
[Google native assets](https://developers.google.com/admob/android/native/advanced).
