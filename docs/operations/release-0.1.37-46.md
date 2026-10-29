# Android 0.1.37+46 — twenty community upgrades

Built 29 October 2026 from commit `afb9559` on main. Not uploaded to Play. **No backend deploy is needed** for this build; one optional rules tightening is described below.

Contains 0.1.36+45 (also never uploaded) in full.

## Android artifact

- Package: `com.indigenworld.indigen`; version `0.1.37`, code `46`.
- Size: 112,481,807 bytes (107.3 MB); min SDK 24, target 36.
- ABIs: arm64-v8a, armeabi-v7a, x86_64.
- SHA-256: `6e3ddc25d39265bd9ce0f8cdf462dc528e6f04e0d04ed997d8d546d2de844277`.
- Certificate SHA-256: `2796c47004b28bdfaca8ef1704fc4d97bedb11158d831a065edbacceddeaa23f`, the established upload key.
- jarsigner verified by `npm run build:mobile-aab`. Build time 3,093 s, with a temporary user-level Gradle override (`-Xmx3072m`, Kotlin in-process, **one** worker). A first attempt with two workers and `-Xmx3584m` died after 3,271 s: the Dart snapshot generator was killed (exit 143) and the Gradle daemon disappeared — memory, not code; nothing was produced. The override was deleted when each build exited, and the daemon was stopped with `gradlew --stop`.
- Copy to upload: `output/release-bundles/indigen-0.1.37+46.aab` (gitignored).
- Built with the production AdMob identifiers from the gitignored `admob.local.json`, as in 0.1.36.
- Built from commit `afb9559` (the code; this record and the post were committed after it).

## What is in it (since 0.1.36+45)

All in the Community tab (`apps/mobile/lib/features/community/` unless stated). Everything is client-side or fits the rules and indexes already deployed.

**Finding things**

1. **Topic pages.** A post's category label opens `TopicFeedScreen`: every recent top-level public post with that label, newest first, the other labels as chips (scrolled to the chosen one). `CommunityRepository.watchTopicFeed` uses the `isReply + category + createdAt` index the recommendation backend already deploys; hide/mute/block apply as on the main feed. Private community posts never appear.
2. **Back to the top.** Tapping the active For you / Following tab flies home (`_flyHome`), as re-tapping Community in the bottom bar already did.
3. **"Seen on your last visit".** The newest post shown on a feed is written per account and feed (`FeedVisitStore`, SharedPreferences); on the next visit a line is drawn above the first of a run of three posts no newer than it (`caughtUpIndex`), so a post `preventPostBurial` lifted cannot place it wrongly. Not drawn on For you when it is served by the recommendation backend (flag off by default).
4. **Muted words.** Settings → Blocked, muted and read receipts → Muted words (≤ 50, per account, on the phone). `mutedWordIn` folds case and tone marks (`communityFold`), matches single words as whole words and phrases anywhere, and reads poll choices too. A match folds the post to one row with Show, wherever `CommunityPostCard` is used, except the post a conversation was opened on and the member's own posts.

**Writing**

5. **Image descriptions.** "+ ALT" on each staged photo (≤ 420 characters) writes `media[i].alt`; kept through a crop. The feed tile and the full-screen viewer use it as the image's Semantics label (undescribed photos say so) and show an ALT badge that opens it.
6. **Drafts.** Leaving a composer with words or attachments (not a reply or quote) asks Save draft / Discard post. Saved drafts (≤ 20, per account, `savedDraftsProvider`) keep text, label, community, attachment paths with descriptions, and event; listed under Drafts in the community sidebar. Opening one and leaving again updates it; emptying it removes it; publishing removes it. Separate from the crash-rescue `ComposeDraftStore`.
7. **Event date and place.** With the Events label, the composer asks for a date and time (and an optional place ≤ 80). Written as `event {startsAt: Timestamp, place}` on top-level Event posts only; the card shows a date tile and "Today / Tomorrow / In N days / Next week / Happening now / Ended" (`eventCountdownLabel`).
8. **Remind me.** The bell on an event schedules one local notification an hour before (or a minute from now if the event is under an hour away), on a new `indigen_events` channel, asking for the Android 13 permission when tapped. Tapping it opens `/post/<id>` — the route now accepts `?community=` so a private community's event opens too. Up to 30 kept; past ones drop off. Uses the scheduled-notification receivers 0.1.36 added.
9. **Rules before a first post.** The first post into a community with rules shows them with "I'll follow these" (once per account and community, on the phone). An unreadable community does not block the post.

**Passing a post on**

10. **Share as a picture.** Post menu → a light card (author, text, first photo, "Read and reply on Indigen World") drawn on screen, captured at 3× and shared as PNG with the post link as the caption. Public posts only.
11. **Send in a message.** Post menu → recent conversations with an optional note; sends the note plus `https://indigenworld.com/post/<id>` through the existing `sendMessage`.
12. **Post links drawn as posts in chat.** A message containing an indigenworld.com post link shows a live mini card (author, start of the text, first photo, or "no longer available"); tapping opens the post.
13. **Ask Kawuri about this post.** Post menu (public posts with text) → Kawuri in a fresh conversation with the request written in the box (`KawuriScreen.initialDraft`). Never sent for the member.

**Conversations and people**

14. **Reply order**: Oldest first (default) / Newest first / Most appreciated, stable on ties, for the session (`sortReplies`).
15. **Author badge** on replies by the author of the post the conversation is under.
16. **Pin a post to your profile.** Own top-level public posts; `communityProfiles/{uid}.pinnedPostId` (the deployed owner-update rule has no key allowlist). The pinned post leads the Posts tab, labelled, and is not repeated below. A pin naming someone else's post, or a reply, draws nothing.
17. **Follows you** on profiles and people rows, from the public edge `communityFollows/{them}_{me}`.
18. **People in common**: "Followed by Kofi, Esi and 3 others you follow", from their first 300 followers intersected with the member's following list (it can undercount, never overcount).

**Communities and saved posts**

19. **New-post dots** on Communities → Joined: one `limit(1)` read per joined community (public or private path, existing indexes) against the last visit on this phone, recorded on entering and leaving a community and on its tab in the feed. A community never visited on this phone shows no dot.
20. **Search** on a community's Members tab (from six members; names and handles, tone marks folded) and on Saved posts (text, author, and a filter by the labels the saves use).

Also: the Follow button's label now uses the theme's button text style, so it is drawn in the app's Noto Sans instead of the system font. Five new strings in English and French (`lib/l10n`).

Post: `apps/updates-blog/posts/2026-10-29-twenty-community-upgrades/`.

## Backend

- **None required.** Every write fits the rules deployed on 25 October: the `communityPosts` and private `communitySpaces/{slug}/posts` create rules have no key allowlist and do not inspect media items, and the `communityProfiles` owner update does not restrict keys. Every query uses an index already in `firebase/firestore.indexes.json`.
- **Optional, needs a separate yes:** `firebase/firestore.rules` now validates the optional `event` map (only `startsAt` timestamp and `place` ≤ 80, only on a top-level `event` post) on both post create rules, and `pinnedPostId` (a non-empty string ≤ 128) on the owner's profile update. The app's writes already satisfy both, so deploying only tightens. `media[].alt` cannot be checked by rules (list items).
- **Not covered:** the recommendation feed API (`community-feed.ts`, flag off by default) and the website's `/post/<id>` page do not show event details or image descriptions.

## Before uploading

1. Install on a real Android phone and check: an event reminder firing (and after a reboot), the Android 13 permission prompt from the bell, Share as a picture into WhatsApp (status and chat), Send in a message between two accounts on 0.1.37, a draft surviving an app restart, the Seen line across two launches, TalkBack reading an image description.
2. Upload to Play (owner).

## Verification behind this build

- **Mobile, full suite** (`flutter test`, 29 October): 1,805 passed, 1 skipped, 1 failed. The failure was `test/features/learn/lesson_picture_answers_test.dart` ("Asset 'shaders/ink_sparkle.frag' not found"), at the moment a second `flutter test` (the post renderer) was started alongside the suite and shared its test asset bundle. Re-run on its own it passed; `test/features/community`, `test/features/settings` and `test/features/kawuri` were then re-run after the last code changes: 420 passed, 1 skipped.
- **New tests**: `test/features/community/community_upgrades_logic_test.dart` (25: muted-word matching, the seen line including a lifted post, community news, event storage/countdown/reminders, image descriptions, drafts, reply order, people in common, saved/member search, post-link detection, the Kawuri request, the pinned post) and `community_upgrades_screens_test.dart` (15: topic page and chips, muted fold and Show, own posts never folded, event reminder via a fake scheduler, Author badge and reorder, pinned post and Follows you, saved search and topic filter, muted words in Settings, drafts list, the composer's event fields, Save draft on leaving, a post card in chat, the community dot, the seen line in the real feed, back to the top). The test fake gained the new repository calls.
- **Analysis:** every changed file analysed in batches (whole-package analysis crashes on this host). No errors or warnings; the remaining infos (import order, braces) are in lines this release did not write.
- **Rules:** `npm run test:rules`, 215/215, including three new cases in `firebase/tests/community.rules.test.mjs` (event shape, an image description on a media item, pinning).
- **Post screens:** nine renders of the real widgets (`tool/post_screens/render_0_1_37_test.dart`) with sample data in English; framed with `render-post-art.mjs`. `npm run validate:updates-blog`: 29/29.

## Not verified

- Anything on a real phone; see "Before uploading".
- iOS: reminders use the plugin's Darwin defaults and have not been run on Apple hardware.
