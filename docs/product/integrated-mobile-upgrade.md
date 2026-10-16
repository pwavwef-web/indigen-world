# Integrated mobile upgrade — implementation and verification ledger

**The current acceptance record is [the detailed implementation ledger](integrated-mobile-upgrade-ledger.md).**
The matrix below is the initial inventory, retained as historical planning context.

Date: 2026-10-16. This ledger records repository evidence, not live release claims.
The supplied design concepts are visual references; their sample identities and
products are not production data. Existing unrelated working-tree changes are preserved.

| Requirement | Existing behavior / extension points | Migration | Verification / status |
| --- | --- | --- | --- |
| Shop shell, catalogue, cart, profile | `apps/mobile/lib/features/collection/shop_screen.dart`, `apps_and_shop.dart`; request-only basket | Explicit fixed/quote price mode; preserve old requests | In progress |
| Shop checkout and operations | `services/functions/src/paystack.ts`, `ads.ts`; `apps/admin/src/collection/CollectionAdmin.tsx` | New server-owned orders, inventory, settings, delivery and promotions; checkout off until configured | In progress; provider test required |
| Shared collection uploads | `apps/admin/src/collection/audiobookUpload.ts`; image URL fields in products/apps/heroes; audiobook cover; contributor publishing owns music/literature/place stories | Preserve existing URLs; new asset records and finalized derivatives | In progress |
| Rich notifications | `services/functions/src/community-notifications.ts`, `push.ts`; mobile notifications repository, `local_alerts.dart`, `push_messaging.dart` | Version payload; keep canonical read state | In progress; Android device evidence required |
| Collection discovery | See subtype inventory below | Bounded session history; legacy editorial order remains readable | In progress |
| Compact comment sponsorship | `post_detail_screen.dart`, `reel_comments_sheet.dart`; centralized ad inventory/consent/membership gates | New `post_comments` placement and optional dedicated unit; house identity must be linked to verified organisation | In progress; no live ad-unit ID invented |
| Native mobile video editor | Existing web `videoProjects` / `videoRenders`, render spec/worker and callables | Versioned mobile timeline adapter; keep web projects intact | In progress; playable render evidence required |

## Reachable collection and detail inventory

| Subtype | Existing screen / behavior to preserve | Status |
| --- | --- | --- |
| Music, music video | `features/music/`, `collection/collection_detail_screens.dart`; playback and detail | Audit pending |
| Dictionary | `features/dictionary/`; specialized search, language and word details | Audit pending |
| Literature: stories, poems, proverbs, riddles and other published categories | `collection/literature_categories.dart`, `collection_detail_screens.dart`; category tabs, reader and illustrated documents | Audit pending |
| Audiobooks | Published collection audio detail, listening/downloads | Audit pending |
| Heroes | `features/heroes/`; biography detail | Audit pending |
| Names | Admin-curated names; dictionary-linked discovery | Audit pending |
| Apps | `collection/apps_screen.dart`; platform-specific outbound links | Audit pending |
| Shop | Dedicated four-tab shell and product/order details | In progress |
| Place stories | `collection/place_story_screen.dart`, carousel and illustrated details | Audit pending |

## Release boundary

No production data migration, live charge, broadcast, store release, external
publication or deployment is implied by this implementation. Tests use synthetic
data. New capabilities must report configuration failures and remain gated where
external configuration is missing. Record exact commands and results here as each
vertical slice is verified. Do not equate emulator success with provider or device success.
