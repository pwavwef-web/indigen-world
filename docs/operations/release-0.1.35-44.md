# Android 0.1.35+44 — alerts drawn in the app's design, five usability features

Built 25 October 2026 from the code committed with this record (main). Not uploaded to Play. Backend for this build **not deployed** (see below).

## Android artifact

- Package: `com.indigenworld.indigen`; version `0.1.35`, code `44`.
- Size: 110,142,061 bytes (105.0 MB); min SDK 24, target 36.
- ABIs: arm64-v8a, armeabi-v7a, x86_64.
- SHA-256: `6c0fad2f6a22cfb4c5968eaeeaeb8db8b0962d0197881bb0381052088ba97f4c`.
- Certificate SHA-256: `2796c47004b28bdfaca8ef1704fc4d97bedb11158d831a065edbacceddeaa23f` — the established upload key.
- jarsigner verified by `npm run build:mobile-aab`.
- Copy to upload: `output/release-bundles/indigen-0.1.35+44.aab` (gitignored). Supersedes the never-uploaded 0.1.34+43.
- Built with the production AdMob identifiers from the gitignored `admob.local.json` (comment ads on, as in 0.1.34).

## What is in it (since 0.1.34+43)

- **Alerts in the notification centre's design** (Android): actor avatar wearing the kind badge, the attached picture (Big Picture), the kind as sub-text, the post time; Reply (inline) / Like / Mark as read on community alerts; messages as a conversation with inline Reply and Mark as read; per-channel group summaries with Mark all as read; a silent redraw saying what a button did ("Liked", "Reply sent", "Sending when you are online", "Not sent"); alerts dealt with in the app leave the shade; **Send a test alert** in Alert settings.
- **Five usability features:** app-icon shortcuts (Look up, New post, Messages, Alerts); message drafts with "Draft:" in the inbox; Copy for any message; Undo instead of a confirm dialog when deleting a notification; Snooze alerts on this phone (1 h, 8 h, until 07:00).
- **Fix:** `ChatScreen` used `ref` in `dispose`, which Riverpod 3 rejects, so a closed conversation stayed marked open and its in-app alerts were suppressed.
- **Fix:** Flutter's built-in deep linking (default on since Flutter 3.27) is now switched off on Android and iOS, so links are routed only by `core/deep_links.dart` as designed: a shared post opens on top of the app instead of replacing it, and the app-icon shortcuts keep their query (`/dictionary?focus=search`).
- Post: `apps/updates-blog/posts/2026-10-25-alerts-you-can-answer/`.

## Backend this build expects (NOT deployed)

The app announces `pushRenderer: 2` on its `communityDevices` row (no rules change needed: the rule does not restrict keys). Until these functions are deployed, every device keeps receiving system-drawn notifications and the new design appears only for alerts that arrive while the app is open:

- Required: `onCommunityNotificationCreated`, `retryNotificationPushes`, `onChatMessageCreated`, `onNotificationCreated`, `notificationAction`.
- Optional: `getKawuriTask`, `sweepKawuriTasks` (the "your video is ready" push). Left on the old bundle they keep sending system notifications to every device, which new builds still display.
- Kill switch: set `RICH_NOTIFICATION_PUSH_ENABLED=false` in the Functions environment to send every device system notifications again without an app release.
- Older app builds (no `pushRenderer`) keep system notifications, which now also carry the post picture (`notification.imageUrl`).

Deploy by explicit `--only functions:a,b,…` list from the repo root with `FUNCTIONS_DISCOVERY_TIMEOUT=180`, after `git fetch` and a live-vs-export diff (see the functions deploy notes).

## Before uploading

1. Deploy the functions above (owner approval).
2. Install on a real Android phone and check: a real reply / mention / message push while the app is closed (avatar, picture, buttons), Reply and Like from the shade reaching the post, Mark all as read, snooze, the four app-icon shortcuts, and the Explore / comment ads as in 0.1.34.
3. Upload to Play (owner).

## Verification behind this build

- Mobile: `flutter analyze` reports no errors (the remaining infos are in files this release does not touch). Full suite 1,707 passed, 1 skipped, 0 failed (25 October, final code, with the file below parked). The one known failure, `integrated_upgrade_screens_test.dart` ("native timeline… high text scale"), is a pre-existing 8 px overflow in the shop at 1.8× text — it fails identically with this release's changes stashed — and that file writes PNGs into the 2026-10-16 post when run, so it is parked outside `test/` for full runs.
- New tests: alert presentation (buttons per kind, hidden previews, outcomes, a badge PNG for every kind), notification art (avatar/badge/initials/mark composition, picture fitting, host allowlist), snooze, chat drafts (per account, cap, inbox label, restore), copy message, Undo delete, app-icon shortcut links, the dictionary shortcut's focus hold.
- Functions: `tsc` clean; `npm run test:function-helpers` 667/667 including the new `firebase/tests/richPush.test.mjs` (device split, kill switch, hidden previews, image host allowlist).
- Android emulator (Pixel 7 image, Android 16), universal APK built from the bundles of this version with the debug key: the sample alerts from **Send a test alert** drawn as designed (Big Picture with avatar + badge and Reply / Like / Mark as read; the message as a conversation); inline Reply from the shade (conversation redrawn with "You"), Like ("Liked", Like button gone) and Mark as read (alert removed) all answered by the background action handler; the four app-icon shortcuts registered with icons; `indigen://open/notifications` and `…/dictionary` route correctly; the dictionary shortcut opens on top of the app (back arrow) with the search box focused and the keyboard up. Taken across the candidate builds of the day; the last build added only the deep-link opt-out, re-checked on the emulator.
- Emulator caveats: the host had under 1 GB of RAM free, so System UI and the system process repeatedly stopped responding; one action took long enough to log a broadcast ANR (the plugin starts its background engine on the receiver's main thread) before completing. Pressing Back all the way out of a shortcut-opened page was swamped by those freezes and is not directly observed.
- **Not verified:** a real push from the backend (functions not deployed), any real phone, iOS (unchanged; the iOS opt-out of Flutter deep linking is untested on Apple hardware).
