# Android 0.1.36+45 — twenty features, upgrades and improvements

Built 25 October 2026 from the code committed with this record (main). Not uploaded to Play. **No backend deploy is needed** for this build; one optional rules tightening is described below.

Supersedes the never-uploaded 0.1.35+44, which it contains in full.

## Android artifact

- Package: `com.indigenworld.indigen`; version `0.1.36`, code `45`.
- Size: 111,357,153 bytes (106.2 MB); min SDK 24, target 36.
- ABIs: arm64-v8a, armeabi-v7a, x86_64.
- SHA-256: `66c7c83f88e44f664e4f18611d5ab4ae788695429b19332e179e8c64dd670e52`.
- Certificate SHA-256: `2796c47004b28bdfaca8ef1704fc4d97bedb11158d831a065edbacceddeaa23f`, the established upload key.
- jarsigner verified by `npm run build:mobile-aab`. Build time 1,865 s, with a temporary user-level Gradle override (`-Xmx3584m`, Kotlin in-process, two workers) because only about 4.8 GB of commit memory was free. The override was deleted when the build exited, and the build's Gradle daemon was stopped.
- Copy to upload: `output/release-bundles/indigen-0.1.36+45.aab` (gitignored). Supersedes the never-uploaded 0.1.35+44.
- Built with the production AdMob identifiers from the gitignored `admob.local.json`, as in 0.1.35.

## What is in it (since 0.1.35+44)

**Music and readings**

1. **Liked songs.** Like from the now playing screen or a song's menu; a "Liked songs" section heads the Library tab and a small heart marks liked songs. Kept on the phone and, signed in, written to `learnProgress/{uid}.likedSongIds` and reconciled on sign-in by the same rule as saved words (`reconcileSavedWords`). `lib/features/music/music_likes.dart`.
2. **Play next / Add to queue** from a long press or the ⋯ on any song row. A queue-aware shuffle order (`MusicShuffleOrder`) puts Play next straight after the current song in the shuffled order too. `music_audio_handler.dart`, `widgets/music_track_menu.dart`.
3. **Sleep timer**: 15/30/45/60 minutes or the end of the current track, a countdown pill, a 10-second fade. `music_sleep_timer.dart`, `widgets/listening_tools.dart`.
4. **Playback speed** 0.75–2×, remembered per channel (music, audiobooks).
5. **Every audiobook keeps its own place** (50 most recent, finished books drop off) and a **Continue listening** shelf on Audiobooks. `music_places.dart`. The Audiobooks channel has no published readings yet.

**Dictionary and Learn**

6. **Recent lookups** under the empty dictionary search box (12, on the phone). `dictionary/recent_lookups.dart`.
7. **Share a word**: headword, meaning, example (with its Tatoeba credit when it has one) and `https://www.venacula.com/?entry=<id>`, which the dictionary website opens. `core/share_text.dart`.
8. **Practise both ways**: Kasem first / English first / Mixed on review cards; the same Leitner card either way; the recording is held back until the reveal when the Kasem is the answer. `practice_decks.dart`, `review_words_screen.dart`.
9. **Daily practice reminder** at a chosen time, off by default: seven one-shot local notifications (inexact), today's skipped once practised, rebuilt on launch and whenever the day is kept; tapping opens `/learn/review`. `learn/practice_reminder.dart`, `practice_reminder_row.dart`. Manifest: `RECEIVE_BOOT_COMPLETED` and the plugin's `ScheduledNotificationReceiver` / `ScheduledNotificationBootReceiver`. New direct dependency `timezone` (already locked as transitive; no new download).

**Messages**

10. **Reply to a message**: swipe right or long press → Reply; the message stores `replyTo {id, senderId, excerpt ≤ 140}` and draws a quote that scrolls to the original when it is loaded.
11. **Seen**: `markRead` stamps `readAt.<uid>` on the thread when read receipts are on; "Seen" under your newest message once the other side's stamp is past it. Settings switch, on by default, both ways.
12. **Day headings** (Today / Yesterday / "Tue 20 Oct") and **Load earlier messages** (pages of 100 with `startAfter`); older messages were unreachable before.
13. **Mute a conversation** (⋮ → Mute alerts) toggles the reader's uid in `mutedBy`, which the deployed `onChatMessageCreated` fan-out already honours.
14. **Kasem letters** (the dictionary's key bar) and the Kasem keyboard toggle in the chat composer.
15. **Search conversations** in the inbox (shown from six conversations, or while a query is typed).

The chat changes need no rules or functions change: the message `create` rule does not restrict extra fields, the thread `update` rule protects only `mutedBy` (own uid) and `lastPushAt`, and the only chat trigger is message creation.

**Privacy, reading and the phone**

16. **Blocked, muted and read receipts** screen in Settings: lists blocks and mutes by name with Unblock / Unmute (the rules already let the owner delete their own `communityBlocks` / `communityMutes` edges). `settings/privacy_controls_screen.dart`.
17. **Comfortable reading** on a Collection work: A−/A+ (0.9–1.7×, kept for every work) and, on works of 1,500+ characters, the place read to (30 works, on the phone). `collection/reading_preferences.dart`.
18. **Share songs, readings and works** (title, creator, Play listing link) from the work's page, the player and the song menu.
19. **Cached pictures** row in Settings: size of the re-fetchable image cache and alert pictures, with Clear; downloads and reel drafts are never touched. `core/media_cache.dart`. New direct dependency `flutter_cache_manager` (already locked as transitive).
20. **Shop at large text**: the category strip grows with the text size (it overflowed by 8 px at 1.8×). The integrated screens test writes its pictures to `build/` unless `WRITE_POST_SCREENS=1`, so it no longer rewrites the 2026-10-16 post and no longer has to be parked for full runs.

Post: `apps/updates-blog/posts/2026-10-25-twenty-upgrades/`.

## Backend

- **None required.** Everything works against the backend deployed on 25 October.
- **Optional, needs a separate yes:** the `firebase/firestore.rules` bound on `learnProgress.likedSongIds` (list, ≤ 1000). Writes already succeed without it — the rule has no key allowlist — so deploying it only tightens. Deploy with the rest of the rules file, which also carries another session's uncommitted Indigen Forms block: deploy the rules only once that work is committed or the deploy is agreed with its owner.

## Before uploading

1. Install on a real Android phone and check: a practice reminder at a near time (and after a reboot), the sleep timer with the screen off, speed on a long track, Play next with shuffle on, Seen between two accounts on 0.1.36, mute (no push for a muted thread), Load earlier messages on a long conversation, Clear cached pictures.
2. Upload to Play (owner).

## Verification behind this build

- **Mobile, full suite** (`flutter test`, 25 October, final code but for one later fix): 1,765 passed, 1 skipped, 1 failed. The failure was `app_smoke_test.dart`: the reminder row had pushed the daily-goal popup's "Continue learning" below the fold on the test's 800×600 screen. The row was moved below the button, and `app_smoke_test.dart` plus all of `test/features/learn` were re-run: 66 passed.
- `integrated_upgrade_screens_test.dart` now passes in place (4/4): no overflow in the shop at 1.8×, and nothing written into the 2026-10-16 post. It no longer has to be parked for full runs.
- **New tests** (all passing): `test/features/music/music_upgrades_test.dart`, `test/features/dictionary/recent_and_share_test.dart`, `test/features/learn/practice_upgrades_test.dart`, `test/features/community/chat_upgrades_test.dart`, `test/features/settings/privacy_reading_storage_test.dart`. Together they cover liked-song reconcile and order, the queue-aware shuffle order, speed labels, sleep countdown and fade, audiobook places and Continue listening, recent lookups, share text (including the Tatoeba credit and the encoded venacula link), both-ways review, the reminder schedule (kept day skipped, gone time, month end, streak wording), quoted replies, Seen, day headings, inbox filter, mute, Load earlier messages, the blocked/muted screen with read receipts, reading size and place, and byte formatting. `music_screen_test.dart` was updated for the Library's new empty-state wording.
- **Analysis:** `dart analyze` on the whole package crashes the analysis server on this host (about 1 GB of free memory). Every changed file was analysed in batches instead. No errors or warnings; the remaining infos (import order, braces) are in lines this release did not write.
- **Rules:** `learningAndShop.rules.test.mjs` 24/24, including the new liked-songs test, on a private emulator port. The full `npm run test:rules` could not run because another session's Firestore emulator held port 8080, and the rules tests hard-code that port. That emulator was left alone.
- **Share link:** `https://www.venacula.com/?entry=7dkluV9RDPbdbyFGnLk6` opened "kunkwolo — bottle" on the live dictionary site, checked in a browser.
- **Post screens:** eight renders of the real widgets (`tool/post_screens/render_0_1_36_test.dart`), with published songs, the folktale and all 1,555 published dictionary entries.

## Not verified

- Anything on a real phone; the reminder firing (and surviving a reboot), Android 13+ notification permission prompt from the reminder switch, the sleep timer with the screen off, speed and Play next against the real media session, Seen and mute between two real accounts.
- iOS: the reminder uses the plugin's Darwin defaults and has not been run on Apple hardware.
