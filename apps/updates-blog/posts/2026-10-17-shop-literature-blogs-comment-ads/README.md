# Shop redesign, Literature + Blogs, compact notifications, comment sponsorship

- **Title:** A shop, a reading room and a calmer inbox
- **Labels:** Indigen World, Mobile, Shop, Literature, Notifications, In development
- **Search description:** The Indigen World shop and Literature now use the app's own navigation bar, the updates blog appears inside the app, and notifications are more compact.
- **Status (17 October 2026):** Implemented in the uncommitted working tree of `apps/mobile` on top of the 2026-10-16 connected-workflows work. `flutter analyze` reports no errors in the changed files; the Collection and Notifications test suites pass; the Android Kotlin sources (new comment native layout) compile for the production flavour. **Not committed, not built into an AAB, not uploaded to Play, not published on Blogger.** Checkout stays closed until the store is configured. The Native advanced unit **Indigen Post Comments Native** was created in the existing Indigen World AdMob app and verified in its ad-unit list on 17 October 2026. Its ID is stored only in the gitignored root `admob.local.json` as `ADMOB_POST_COMMENTS_NATIVE_AD_UNIT_ID`; the release script automatically enables comment ads when this key is configured. Without the key, release builds hide the entire comment slot, including house (first-party) promotions. Explore's full-screen native layout reuses **Indigen Explore Native**. All 14 AdMob configuration tests pass; live comment-ad serving and real-phone validation remain unverified.
- **Publishing owner:** Chinedum. Preparing this post does not authorize publishing or sharing it.

## What changed (code)

| Change | Where |
| --- | --- |
| Shop uses the app's `FrostedNavBar` (shared hero with the main rail), channel stage header with pinned search, redesigned cards, gallery product page with sticky action bar, cart summary + wishlist shelf, grouped Profile | `apps/mobile/lib/features/shop/shop_screen.dart`, `shop_checkout.dart`, new `lib/shared/channel_stage.dart` |
| Literature becomes a channel: Library · Genres · Writers · Blogs on the glass rail; the scrolling top genre tabs are removed; genre and writer shelves open as pages; sort dropdown (which overflowed at large text) replaced by wrapping pills | `lib/features/collection/literature_screen.dart`, `collection_detail_screens.dart` |
| Blogs tab: reads `https://updates.indigenworld.com/feeds/posts/default?alt=json` (host pinned, paged, offline cache); native HTML reader, no WebView | `lib/features/collection/blogs/` |
| Compact notifications: flat rows, 40px avatars, thumbnail at the end, swipe to mark read / delete, long-press menu, Like only on reactable targets, `/shop/order/...` routes now open | `lib/features/notifications/notifications_screen.dart` |
| Comment sponsorship shaped like a reply with a persistent "Sponsored" tag, one impression per view, themed Android native layout | `lib/features/ads/comment_sponsor.dart`, `android/.../CommentNativeAdFactory.kt` |
| Explore video adverts in the full-screen feed-ad shape (creative on black, advertiser + "Ad", headline/body, Share / Why this ad / More, white CTA pill, pause · time left · speed · mute · replay); first-party via `SponsoredReelPanel`, Google via the registered `exploreFullscreen` native layout. Autoplays muted. No engagement counts | `lib/features/explore/sponsored_reel_panel.dart`, `reel_view.dart`, `ads/admob_native.dart`, `android/.../ExploreNativeAdFactory.kt` |
| Bulk publish / unpublish / archive for up to 50 products (server re-checks name, image readiness, scheduling; audited; nothing deleted) | `services/functions/src/shop.ts` (`bulkStatus`), `apps/admin/src/shop/ShopWorkspace.tsx` |
| Shop options and promotions: filter by variant options (Size, Frame…); percentage, scoped, first-order, named-customer, automatic and once-per-customer promotions with clear stacking | `shop-policy.ts`, `shop.ts`, `ShopWorkspace.tsx`, `shop_screen.dart`; tests in `firebase/tests/shopPolicy.test.mjs`, `shopCatalogueAndPromotions.integration.test.mjs` |
| Discovery history follows a signed-in member across devices (bounded, owner-only) | `discovery_session.dart`, `firestore.rules` (`discoveryHistory`) |
| Test and safety fixes: composer `ref` read in `dispose`; "turn everything on" no longer opts members into promotions; promotions excluded from the muted count and moved last; editor launcher injectable; stale tests updated | `compose_post_screen.dart`, `notification_preferences.dart`, `notifications_repository.dart`, `create_reel_screen.dart`, tests |

## Images

`screens/` holds unaltered renders of the actual Flutter screens (390×844 logical,
3× pixel ratio), made with a scratch render harness against sample data. People,
products, prices, orders and messages are samples. The Blogs screenshots use the
real public feed of updates.indigenworld.com as captured on 17 October 2026 and
that blog's own cover images. `images/` holds the branded cover and framed
figures used by `post.html`; frames, backgrounds and titles are illustration.
`explore-ad.png` is the real `SponsoredReelPanel` widget composed over a still
of the creative in a harness (a video can't play in a render test); Explore's
own header and navigation bar are not in that picture. Regenerate with:

```text
node apps/updates-blog/scripts/render-post-art.mjs 2026-10-17-shop-literature-blogs-comment-ads
```

Credits: Paga pond — Dieu-Donné Gameli, Wikimedia Commons, CC BY-SA 3.0;
Navrongo basilica — Mwintirew, Wikimedia Commons, CC BY-SA 4.0; Tono dam —
Apiu Akwojong Ezekiel, Wikimedia Commons, CC0 1.0 (see
`apps/mobile/assets/places/README.md`). Course illustrations are the app's
bundled AI-generated artwork (`apps/mobile/assets/learn/illustrations.json`).
The Indigen World mark is the existing repository logo.

## Blogger handoff

1. Confirm the release status first. Keep "in development" until a store
   release containing these screens is verified.
2. Upload every image in `images/` to Blogger, keep the captions, alt text and
   credits, and replace each `images/...` path with Blogger's image URL.
3. Paste `post.html` in HTML mode; set the title, labels and search
   description above; preview on desktop and mobile.
4. After publishing, put the article URL into `share.md`. Sharing is a separate
   step for Chinedum.

Note: once this is published, the post itself will appear in the app's new
Blogs tab automatically.
