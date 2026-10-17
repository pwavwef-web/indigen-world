# Android 0.1.34+43 — shop, Literature + Blogs, Explore ads

Built 17 October 2026 from `cbc0437` (main), which contains `99b4c18`. Not uploaded to Play. Backend for this build deployed the same day (below).

## Android artifact

- Package: `com.indigenworld.indigen`; version `0.1.34`, code `43`.
- Size: 106,875,586 bytes (101.9 MB); min SDK 24, target 36.
- ABIs: arm64-v8a, armeabi-v7a, x86_64.
- SHA-256: `4a4d10477c3eba2f3e06a6180fac5ae6b162d524ca88adbf10b136fd0a66090e`.
- Certificate SHA-256: `2796c47004b28bdfaca8ef1704fc4d97bedb11158d831a065edbacceddeaa23f` — the established upload key.
- jarsigner verified by `npm run build:mobile-aab`.
- Copy to upload: `output/release-bundles/indigen-0.1.34+43.aab` (gitignored). Supersedes the never-uploaded 0.1.33+42.
- Built with the production AdMob identifiers from the gitignored `admob.local.json`, including `ADMOB_POST_COMMENTS_NATIVE_AD_UNIT_ID`, so the release script also set `POST_COMMENTS_ADS_ENABLED=true`. Mobile video rendering keeps its release default (off).

## What is in it (since 0.1.32+41)

Codex's connected-workflows upgrade plus the 17 October pass: the shop on the app's glass rail; Literature as Library · Genres · Writers · Blogs with the live Blogger feed; compact notifications; a reply-shaped sponsored entry above the first comment; full-screen autoplaying Explore video ads; shop option filters and promotions; account-synced discovery history. See `docs/product/integrated-mobile-upgrade-ledger.md`.

## Deployed 17 October 2026 (project-kassena-7e026)

- Firestore rules: live ruleset `4382ca9e-a5b5-4e01-b6f6-f04cb2c7afc3` (16:06:59 UTC), read back byte-identical to `firebase/firestore.rules`; the only change from the previous release is the `discoveryHistory/{uid}` block.
- `shop` (us-central1): ACTIVE 16:19:35 UTC. Live `config` returns the new `facets`; an option-filtered `catalogue` query succeeds (no new index needed).
- `shopAdmin` (us-central1): ACTIVE 20:25:07 UTC; unauthenticated calls get 401.
- Deployed by explicit name only (no creates or deletes). Two network failures on the way: a Secret Manager lookup (nothing deployed) and a dropped update request that had in fact reached the server — waited for it to finish rather than retrying over it.
- Not deployed: Admin hosting (the bulk-action and promotion forms), indexes (unchanged), any other function.

## Before uploading

1. Backend: done (above). Admin hosting is still the old build, so staff can't
   use bulk actions or the new promotion fields until it is deployed.
2. Install on a real Android phone and check: push alerts and their actions,
   an Explore video advert playing muted with working controls, the comment
   sponsor slot, the Blogs tab loading, and checkout still showing as closed.
3. Upload to Play (owner). Blogger post: `apps/updates-blog/posts/2026-10-17-shop-literature-blogs-comment-ads/` — update its "in development" wording once the release is live.

## Verification behind this build

Full mobile suite 1,627 passing plus the ads suite (50); collection 45; notifications/settings 118; Explore panel 4; shop policy 10; shop emulator 8 (Codex's settlement/refund cases included); rules 207. Development debug APK built earlier the same day. Live ad serving, real-device push and payment provider checks are not verified.
