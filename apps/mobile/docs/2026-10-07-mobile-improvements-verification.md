# Mobile community, listening and appearance improvements

Prepared 2026-10-07. Repository implementation, not a confirmed Google Play rollout.

## Architecture used

The app uses Flutter with Riverpod providers, GoRouter plus native Material routes, shared BrandPalette/BrandTheme tokens and a persisted appearance choice. Community feeds and memberships use the existing Firestore repositories. Audio uses the existing audio_service/just_audio handler, MusicController, global mini-player and persisted resume point. Download metadata stays in the existing Drift table and audio stays in the existing application storage directory. Notifications use the real server-written communityNotifications collection and recipient update rules. The Android Kasem IME is implemented in Kotlin and accessed through the existing method channel.

No migration resets profiles, memberships, drafts, downloads, playback history or appearance preferences. Existing topic identifiers and moderation restrictions remain compatible. Unrelated wallpaper assets were preserved.

## Implementation by requested item

| # | Change and underlying behavior |
|---|---|
| 1 | Removed the duplicate Today in Kasem prompt from Community's main page and its space. Make a Post remains. Distinct daily prompts inside community spaces remain. |
| 2 | Horizontal For You → Following → + Communities → active memberships strip. Actual membership providers update the list after joins/leaves, deduplicate identifiers and return to For You when the selected membership disappears. Selected items reveal themselves; labels truncate rather than shrink. Each destination selects its own provider, paging window, loading, error and empty state. Community composition and detail routes retain community context. |
| 3 | Downloads plays directly through the existing controller/handler using a queue from the displayed rows, filtered and rechecked against local files. It spans collections and preserves titles, album attribution and artwork. Audio downloads are committed only after successful completion; partial, missing and size-mismatched files stay unavailable with retained metadata and retry. Optional artwork is stored locally. Failed player loads offer a fresh download. Existing saved audio remains reachable after subscription expiry; new downloads and retries retain subscription allowances. Storage and removal failures show feedback. |
| 4 | Shared 150/220/300 ms motion and easing cover routes, tabs, card entrances, press feedback, popups, sheets, player and notification state changes across existing screens. Removed list staggering, long startup delay and bouncing entrances. Both disableAnimations and accessibleNavigation are respected. Reduced-motion routes return their child immediately, entrances stay visible and decorative tickers stop; inactive shell destinations do not tick while retaining state, and player morphs set their end state directly. |
| 5 | Explore controls keep 72% opacity while subdued, preserve position, semantics and hit targets, and restore emphasis on pointer down while the original action receives that same tap. Existing menu/sheet holds and video gestures remain. Bottom controls retain their inset while playing. |
| 6 | Reused maintained in_app_review integration for the native Google Play API. Production Android only, meaningful lesson/contribution completion, online eligibility, playback guard, seven-day install age, three active days, at least 120-day cooldown, version guard and serialized attempts. The attempt is persisted before the native call. Suppression/unavailability is silent; completion never means a review was submitted. Settings opens the verified production Play listing separately. |
| 7 | Settings opens a dedicated Contact Support route with a back button, explanation, email compose, established contact page and copy-email fallback. Uses verified hi@indigenworld.com and indigenworld.com/contact. No speculative support form or invented channel. |
| 8 | Persisted Black brand theme retains all existing choices, uses pure black primary backgrounds and restrained shared surfaces/borders, and follows the same tokens across screens, player, dictionary, notifications, composer and support. System bars follow the palette. Android IME preference synchronizes on theme change and restart; native keyboard surfaces redraw on input start. |
| 9 | Topic control is labelled Tag with search, clear search/selection, selected indicator and no-results/empty state. Includes Language Learning, Culture, Stories, Music, Questions, Events and Community Updates. Draft storage, publication and feed rendering retain the selected topic. Media types remain separate. Compatible rules/function category lists are included. |
| 10 | Keyboard prompt only appears in focused text contexts, hides when Android reports the Kasem IME selected, and remembers dismissal in SharedPreferences. Focus/resume refresh plus a focused contextual poll detects selection changes. Settings remains accessible. Other platforms cannot identify arbitrary active system keyboards; the app does not claim that detection there. |
| 11 | Real notification rows show avatar/icon, action, preview, age, read/unread styling and date groups. Feed identifiers are deduplicated, live pagination and refresh are preserved, retry is explicit, supported destinations retain post/profile/thread context, and unavailable destinations show feedback. Recipient backend writes mark one/all as read with 400-write batching; live counts follow backend state rather than optimistic fabricated success. |
| 12 | Dictionary uses shared FrostedNavBar with the same geometry, safe-area handling, active styles, theme tokens and motion. Dictionary destinations and keyboard control remain. |
| 13 | Removed the main Collections search field and state, balanced the spacing, and retained distinct searches elsewhere. |

## Verification evidence

Logs are local workspace artifacts under apps/mobile or the repository root and are ignored by Git.

- Broad mobile suite: 1,607 passed, one skipped, eight initially failed. Failures concerned removed controls/labels, corrected localization, prompt harness setup and the intentionally removed stagger; those tests passed in subsequent focused reruns. This is not represented as an all-green full-suite run.
- Initial affected journey batch: 58 passed (offline storage and queue, communities, theme persistence/contrast, dictionary geometry and notification destinations/deduplication).
- Regression batch after expectation fixes: 71 passed, four failed; the four were corrected and the final regression batch passed all 22 tests, including support navigation and unavailable-email feedback.
- Final broader journey rerun after motion adjustments: 281 passed, one skipped, two expectations for the former splash delay and longer reveal timing failed. Their corrected tests passed in the final 17-test batch, which also verified the complete Tag search/clear/select/publication flow, offline storage and shared motion.
- Final player/shell batch: all 23 passed, including reduced-motion artwork gestures, player docking/dismissal and preserved shell interactions.
- Final shell motion/smoke batch: all eight passed, including inactive destination ticker state, shared rail behavior and the guest Explore → lesson → Collection journey.
- Offline repository tests use a real temporary directory, in-memory Drift and a local HTTP server. They download audio and artwork, disconnect the source server, resolve file URIs, build a queue across collections, reject remote/partial/truncated/missing entries and preserve metadata for retry. They do not decode audio using an Android device.
- Firestore emulator: 61 targeted rules tests passed, including added Events/Community Updates and existing moderator-only announcement restrictions.
- Community-feed Node tests: 18 passed. Functions TypeScript check passed.
- Dart analysis completed: zero errors, three pre-existing experimental API warnings and five pre-existing style diagnostics in the unchanged Knowledge workspace/repository. Exit code 2 reflects those baseline warnings.
- Final analysis of the changed application, shared components and affected features/tests passed with no issues.
- Actual widget renders: four image assets produced successfully and visually inspected in Black. Local fixture data and rendering font substitutions are labelled in the release post. These are development previews, not deployed screenshots.
- adb devices: no Android devices attached.
- Android APK passed: the complete development debug build succeeded, including application Kotlin and the native review/keyboard integrations. The final incremental build after the last motion changes also succeeded (743 tasks, 24 executed), so the APK matches the final source. Artifact: `apps/mobile/build/app/outputs/flutter-apk/app-development-debug.apk`. This is a development debug artifact, not a signed production release or a confirmed Play rollout.
- Native build used the existing project-local Gradle cache after the user's default cache reported corruption. Gradle was constrained to two workers and a 2 GB heap. The final retry used the command-local `JAVA_TOOL_OPTIONS=-Djava.net.preferIPv4Stack=true` after a transient Windows port conflict. No global Java settings or user cache were changed. Logs: `verification-android-build-final.log` and `verification-android-build-current-retry.log`.

Commands run include flutter test --no-pub --reporter expanded, dart analyze lib test, npm run typecheck in services/functions, npm run test:community-feed, and Firebase emulator execution of the community rules tests. Android attempts use the development flavor and APP_ENV=development; production review flow requires a Play-distributed production build.

## Release requirements and device checks

Backend category changes must be deployed before production clients offer Events and Community Updates. This work has not deployed backend changes, uploaded a Play build, published Blogger or sent any messages. Check Remote Config rating_prompt_enabled on the production project: the local default is enabled, but a server value can disable it.

No missing support address, store application ID or membership configuration was found. Existing production application ID is com.indigenworld.indigen; development flavor is deliberately excluded from review requests. Google controls native card availability and quotas.

Complete these on a physical Android device, including a small-screen device:

1. Join/leave both a public and private community; select it in the strip, compose there, follow a post notification and verify loss of membership falls back safely.
2. Download playable audio from two collections, enable airplane mode, launch Downloads directly, play, seek, skip both directions, use the mini-player, restart, and confirm artwork/attribution. Delete or corrupt a saved file and verify unavailable/retry. Confirm native decoding, audio focus/background playback and interrupted downloads.
3. While a reel plays continuously, use subdued header/buttons, open/close menus and sheets, and confirm the first tap acts without pausing. Check contrasting video backgrounds, TalkBack and gestures.
4. Switch all existing themes and Black, restart, and check status/navigation bars, IME, full/mini-player, menus, notifications, dictionary and support. Toggle Android animation/reduced-motion preferences while running.
5. Search/select/clear tags with long text and keyboard open, submit each supported new topic against deployed rules/functions and verify published topic rendering. Existing media and announcement permissions must remain unchanged.
6. Select Kasem in Android's system picker while the composer is focused; verify the prompt hides. Dismiss it, refocus/restart and verify it stays dismissed while Settings still opens keyboard setup.
7. Verify unread counts and single/all read writes across two devices, pagination/refresh, replies, profiles, posts that were deleted and private content whose access was lost.
8. Launch support email/contact link with and without a capable handler. Test the Settings store action. Exercise native review using Google's internal testing guidance with an eligible signed production install; no test can assert that a review was submitted.

Official references: [Google Play In-App Review guidance](https://developer.android.com/guide/playcore/in-app-review), [maintained Flutter integration](https://pub.dev/packages/in_app_review), [verified production listing](https://play.google.com/store/apps/details?id=com.indigenworld.indigen).

Release post: [Blogger article and handoff](../../updates-blog/posts/2026-10-07-mobile-listening-and-community/README.md).
