# Connected mobile workflows — implementation and acceptance

16 October 2026. Repository work with synthetic local evidence; **not a confirmed
live release**. Unrelated working-tree changes remain intact. Concept identities,
products and claims were not seeded into production.

| Requirement | Actual implementation | Migration / verification / boundary |
| --- | --- | --- |
| Shop Home, Categories, Cart, Profile, product detail | [shop screens](../../apps/mobile/lib/features/shop/shop_screen.dart), [repository](../../apps/mobile/lib/features/shop/shop_repository.dart) | Cursor pages of 24; search/sorts/category/maker/price/availability; fixed vs quote; local guest cart, account cart/wishlist, recent items. Actual four-tab, checkout, order and large-text captures |
| Checkout and order integrity | [shop.ts](../../services/functions/src/shop.ts), [policy](../../services/functions/src/shop-policy.ts), existing Paystack dispatcher | Server totals, immutable snapshots, reserved stock, stable checkout/refund references, purpose isolation. Emulator tests cover concurrency, retries, refunds, cancellation and stock. No provider transaction claimed |
| Store Admin and Finance | [workspace](../../apps/admin/src/shop/ShopWorkspace.tsx), [requests](../../apps/admin/src/shop/OrderRequests.tsx), [Finance](../../apps/admin/src/shop/ShopFinance.tsx) | Settings, delivery, categories, products/variants/media, inventory, orders/support, customer history and promotions. Finance/broadcast claims and optional shop scopes enforced server-side. Exports explicitly cover the loaded 50-record page |
| Migration and scheduling | [dry-run script](../../services/functions/scripts/migrate-integrated-shop.mjs), additive indexes/rules | Legacy nonpositive prices remain inquiries; historical requests remain untouched; unknown stock starts at zero. Future scheduled products stay hidden from old readers. No production migration run |
| Direct media uploads | [MediaPicker](../../apps/admin/src/collection/MediaPicker.tsx), [processing](../../services/functions/src/collection-media.ts), [artwork desk](../../apps/admin/src/collection/CollectionArtwork.tsx) | Private immutable originals, actual signature/decode checks, optimized metadata-free derivatives, library/link compatibility, rights/alt/credits, focal points, order/cover, resumable progress. Real decoder and Storage boundary tests |
| Rich notifications and actions | [dispatch](../../services/functions/src/notification-dispatch.ts), [actions](../../services/functions/src/notification-actions.ts), mobile inbox/local alerts/native handlers | Payload v2, canonical actual-reply targeting, desired Like/stable Reply, read/open/provider separation, retry leases/backoff, quiet hours/DST and opt-in promotions. Emulator authorization tests and inbox capture; real OS checks outstanding |
| Notification operations | [composer](../../apps/admin/src/messaging/NotificationComposer.tsx), [campaigns](../../services/functions/src/notification-campaigns.ts) | Saved-revision review, separate broadcast permission, schedule/cancel/test-self/history/audit. Browser fixture test; no real messages sent |
| Collection discovery | [session ranking](../../apps/mobile/lib/features/collection/discovery_session.dart), specialized collections/apps/heroes and published paging | Frozen bounded candidates, qualified visibility, history, pins/diversity, explicit stable sorts. Existing/new collection tests and literature capture; global ranking across every subtype remains limited |
| Compact comment sponsorship | [placement](../../apps/mobile/lib/features/ads/comment_sponsor.dart), [Android factory](../../apps/mobile/android/app/src/main/kotlin/world/indigen/mobile/CommentNativeAdFactory.kt), release config | First-party → dedicated native unit → none; central gates, native assets/AdChoices and natural measured height; no fake comment records. House placement capture/config tests; device SDK checks still needed |
| Indigen-owned advertising | [house service](../../services/functions/src/house-ads.ts), HouseAdsWorkspace | Reserved server identity linked to verified existing organisation; repository roof/bars/sun logo, approved hosts, separate house telemetry. Missing organisation configuration blocks creation; no live profile invented or overwritten |
| Native video editing | [editor](../../apps/mobile/lib/features/video_editor/mobile_video_editor.dart), [timeline](../../apps/mobile/lib/features/video_editor/mobile_timeline.dart), [repository](../../apps/mobile/lib/features/video_editor/video_editor_repository.dart), [contract](../../packages/contracts/schemas/mobile-video-project.schema.json) | Native scenes/trim/split/reorder/looks/text/captions/stickers/music/voice, recovery and render progress; actual Flutter raster layers feed the existing renderer. Timeline tests, editor/caption captures and real FFmpeg render tests |
| Edited output and posting | Existing community/reel creation flows, account-scoped drafts, `getMobileEditedVideo` | Ownership/success/revision/timeline-fingerprint handoff, monotonic undo revisions, original as explicit choice, existing moderation/audience checks. No live posting/activity-kill device success claimed |

## Reachable collection and media inventory

| Subtype / detail route | Implemented or preserved experience | Media ownership / limit |
| --- | --- | --- |
| Music / music video | Specialist player/queue/listening and creator detail preserved; collection discovery/search/sorts/pages | Contributor audio/video uploads unchanged; shared Admin cover desk |
| Dictionary / word details | Kasem alphabet, senses, dialect/search, saved words and validator controls preserved | Existing dictionary/audio paths; its legacy published-word stream still loads the small published dictionary |
| Literature: stories, poems, proverbs, riddles and actual other categories | Category tabs, reader, illustrated document and PDF paths preserved; discovery/search/sorts/pages | Shared Admin cover desk; contributor documents remain type-specific |
| Audiobooks | Player, narration, listening/downloads and reader preserved; collection paging/sorting | Narration stays in audiobook pipeline; shared upload/library/link covers |
| Heroes / biographies | Search, field filter, editorial/name order and biography detail | Shared portraits; bounded 100-record reader, not infinite pagination |
| Names / handles | Existing lookup, claim/request and moderation preserved | Names have no image field |
| Apps / directory | Search/category/editorial/name order, platform links and zoomable screenshots | Shared Admin icons/screenshots; bounded 100-record reader |
| Shop / product / category / order | Four-tab shell, server checkout/status/profile and stock/policy configuration | Shared product/category images; explicit variant/SKU stock |
| Place stories / illustrated details | Licensed offline carousel/articles, source credits and oral-tradition wording preserved | Packaged repository photos; no reachable URL-only admin form; replacements ship with app assets |

## Evidence

Functions and Admin production builds passed. Forty-six backend/config/render
tests passed, including real portrait/landscape FFmpeg outputs, prices/refunds,
raster validation and quiet hours. The 35-test notification/shop suite passed.
Eight callable/rules emulator cases and the Storage immutability case passed.
Fifteen Flutter screen/collection/timeline regressions and the final 27-test
alert/reel/screen regression suite passed with real Noto fonts, including 1.8×
text. The actual Flutter caption raster passed the shared worker contract and
produced a playable 720×1280, four-second MP4 with timed caption appearance and
removal. Desktop/tablet browser fixtures
verify image selection, product save, order resolution and notification review,
test queue and cancellation. These render actual components with synthetic
services, not live customer data.

The development Android APK, including native-height measurement, built
successfully. Targeted Flutter analysis had no errors/warnings
but informational style/API diagnostics remain, so a strict fatal-info CI run is
not claimed green. Apple source/target wiring is prepared; Windows cannot
compile/sign or prove iOS push behavior. Private logs and the synthetic playable
render stay under `data/private/` outside Git.

The [scoped security audit](integrated-upgrade-security-audit.json) records the
resolved Storage overwrite and duplicate-settlement issues and the legacy
unscoped-admin limitation. The iOS wiring checker passes structural/reference
checks; it does not replace Xcode compilation or provisioning.

[Actual review screens](../../apps/updates-blog/posts/2026-10-16-connected-mobile-workflows/screens/)
and [configuration/recovery/rollout runbook](../architecture/integrated-mobile-upgrade.md).

## Remaining acceptance limits

The full supplied product brief is **not labelled complete**. Advanced
variant-attribute filters, global ranked discovery across every subtype, bulk
catalogue operations, segmented/per-customer/stacking promotions and universal
cross-device discovery history remain outside the implemented slices. Explicit
collection sorts apply to bounded loaded candidates. Full audio/sticker/
transition preview is checked through the rendered output. Unsupported web
project contracts are rejected and preserved. Pending uploads recover server
state after reload; unfinished local bytes require reselecting the file.

Release gates require the real dedicated AdMob unit, verified existing house
organisation ID, operational policies/coverage/stock, Paystack test transactions
and refunds, a signed Apple build and real-device background/privacy/accessibility/
interrupted-render/post checks. No live charge, broadcast, production migration,
deployment, store release, article publication or sharing was performed.
