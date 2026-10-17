# Connected mobile workflows — Android 0.1.33+42

Verified 17 October 2026. The 28 scoped Functions are ACTIVE; rules and required indexes are deployed; Admin and the public website are live. The signed production Android AAB is built and verified. No Play upload, Apple build, Blogger publication, sharing, live payment/refund or broadcast was performed.

## Android artifact

- Package: `com.indigenworld.indigen`; version `0.1.33`, code `42`.
- Size: 104776019 bytes (99.9 MiB); min SDK 24, target 36.
- ABIs: arm64-v8a, armeabi-v7a, x86_64.
- SHA-256: `e0813453b2795c00da3cb63b7cfdfcf58a467a6e51ea4194e25fa355cb4f8702`.
- Certificate SHA-256: `2796c47004b28bdfaca8ef1704fc4d97bedb11158d831a065edbacceddeaa23f`.
- jarsigner verified; certificate matches the established upload key. ZIP CRC checks and every declared source asset were compared after recovery from disk-full failures.
- Download artifact: `data/private/releases/indigen-0.1.33+42.aab` in the original Desktop workspace. The canonical build also remains in the managed release worktree under `apps/mobile/build/app/outputs/bundle/productionRelease/`.

## Deployment and verification

Release source (runtime deployment from bdb42e2; Android includes the font-license packaging follow-up): `6ba12b58705c80fb00034c1128f53a0020692e0f`, based on remote main `b2fecad`. Isolated managed checkout: `connected-mobile-release`. The original Desktop source and unrelated work remain intact.

Project: `project-kassena-7e026`. Twenty-seven selected Functions use us-central1; the image processor uses us-east1 to match the existing bucket. All 28 are ACTIVE. Four protected callables return 401 UNAUTHENTICATED without an account. The new region has a seven-day function-image cleanup policy. The initial CLI reported a post-deploy cleanup-policy error; that policy was subsequently configured successfully.

Admin: https://indigen-admin.web.app. Public website: https://indigen-world.web.app. Checkout return: https://indigenworld.com/shop/payment-complete. Served HTML and entry JavaScript match the local production builds. No unchanged dictionary or TribeStudio Hosting site was released. Required configured predeploy checks passed.

All 165 live composite indexes are READY and cover the required canonical definitions; the pre-existing submissions index is retained. The single existing catalogue product received the additive migration. Historical orders and external images remain untouched; unknown inventory starts at zero.

Clean-source verification: Functions/Admin/website production builds, 76 backend/config/render tests, 29 website tests, eight callable/rules emulator cases, one Storage immutability case, 15 deep-link tests, Admin desktop/tablet browser workflows and the mobile checkout-return page. Earlier 27-test Flutter and 15-test collection/timeline results remain in the implementation ledger. Strict fatal-info analysis/CI is not claimed green.

The checkout return is a lookup hint only. The app still requests authenticated order state and the server verifies payment with Paystack. Public config and catalogue endpoints returned 200. Checkout readiness is false: support, GHS configuration, policies, delivery and stock require staff setup.

## Recovery, gates and handoff

The first signing attempt needed a Java-compatible private keystore path. Later Android attempts exhausted C: during asset copying and R8. Existing release bundles and the latest debug APK were preserved. Generated mobile output was cleaned, followed by npm cache cleanup, SDK Manager removal of obsolete NDKs 26.1.10909125 and 27.0.12077973 and Playwright removal of downloaded test-browser binaries. The current NDK 28.2.13676358 and installed Edge remain available; those removed tool downloads can be reinstalled when needed.

Mobile comment ads and video rendering default off in release. Server rich-push and Apple rich-media flags are false. Missing verified house organisation configuration blocks house identity creation. Payment/refund provider checks, dedicated AdMob configuration, signed Apple/device checks and real-device export/post checks remain gates.

Release post, images, credits, Blogger upload steps and share copy are under `apps/updates-blog/posts/2026-10-16-connected-mobile-workflows/`. Its `release-evidence.json` contains sanitized receipts. Preparing these files does not publish or send them.

Rollback: restore a prior Hosting release and compatible Functions source while retaining finalized financial records and media. Keep checkout closed and native/provider flags off until their acceptance checks pass. Full scope and limits: `docs/product/integrated-mobile-upgrade-ledger.md`.
