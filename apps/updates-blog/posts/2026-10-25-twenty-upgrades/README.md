# Twenty features, upgrades and improvements (0.1.36+45)

**Blogger:** Published on Indigen World Updates on 29 October 2026: https://updates.indigenworld.com/2026/10/twenty-upgrades-from-songs-to-messages.html

- **Title:** Twenty upgrades, from songs to messages
- **Topic:** Indigen World Android 0.1.36: liked songs, Play next / Add to queue, a sleep timer, playback speed and a place kept in every reading; recent dictionary lookups, sharing a word, practising English → Kasem and a daily practice reminder; quoted replies, Seen, day headings and older messages, muting, Kasem letters and search in Messages; undoing a block or mute, reading size and place, sharing songs and works, clearing cached pictures, and a fix for large text in the shop.
- **Labels:** Mobile, Release, Music, Messages, Dictionary, Learn, Indigen World
- **Search description:** Indigen World 0.1.36 for Android: like songs, a sleep timer, replies that quote, recent dictionary lookups, practice from English to Kasem with a daily reminder, and a way to undo a block.
- **Status (25 October 2026):** Built and tested as Android `0.1.36+45` (see `docs/operations/release-0.1.36-45.md` for the signed AAB and checks). **Not uploaded to Play**, and not yet checked on a real phone. No backend deploy is needed. Not published on Blogger. The post says the update is not in the Play Store yet — change that once it is.
- **Publishing owner:** Chinedum. Preparing this post does not authorize publishing or sharing it.

## What changed (code)

All paths under `apps/mobile/` unless stated. Full list and verification in `docs/operations/release-0.1.36-45.md`.

| # | Change | Where |
| --- | --- | --- |
| 1 | Liked songs, on the phone and on the account (`learnProgress.likedSongIds`, same reconcile rule as saved words) | `lib/features/music/music_likes.dart`, `music_library_tab.dart`, `widgets/music_widgets.dart` |
| 2 | Play next / Add to queue, with a shuffle order that keeps Play next next | `music_audio_handler.dart` (`MusicShuffleOrder`), `widgets/music_track_menu.dart`, `music_controller.dart` |
| 3 | Sleep timer with a 10-second fade | `music_sleep_timer.dart`, `widgets/listening_tools.dart` |
| 4 | Playback speed per channel | `music_controller.dart`, `widgets/listening_tools.dart` |
| 5 | A place per audiobook and a Continue listening shelf | `music_places.dart`, `music_home_tab.dart` |
| 6 | Recent lookups | `lib/features/dictionary/recent_lookups.dart`, `dictionary_screen.dart`, `entry_detail_screen.dart` |
| 7 | Share a word (venacula.com link, Tatoeba credit kept) | `lib/core/share_text.dart`, `entry_detail_screen.dart` |
| 8 | Practise both ways | `lib/features/learn/practice/practice_decks.dart`, `review_words_screen.dart` |
| 9 | Daily practice reminder (local, off by default) | `lib/features/learn/practice_reminder.dart`, `practice_reminder_row.dart`, `learn_sheets.dart`, `notification_settings_screen.dart`, `app_router.dart` (`/learn/review`), `android/app/src/main/AndroidManifest.xml` |
| 10–15 | Quoted replies, Seen, day headings, Load earlier messages, mute, Kasem letters, inbox search | `lib/features/community/chat_screen.dart`, `messages_screen.dart`, `data/chat_repository.dart`, `data/chat_providers.dart` |
| 16 | Blocked, muted and read receipts screen | `lib/features/settings/privacy_controls_screen.dart`, `settings_screen.dart`, `community_repository.dart` |
| 17 | Reading size and place | `lib/features/collection/reading_preferences.dart`, `collection_detail_screens.dart` |
| 18 | Share songs, readings and works | `lib/core/share_text.dart`, `collection_detail_screens.dart`, `widgets/listening_tools.dart`, `widgets/music_track_menu.dart` |
| 19 | Cached pictures: size and Clear | `lib/core/media_cache.dart`, `settings_screen.dart` |
| 20 | Shop category strip grows with text size; the integrated screens test no longer writes into the 2026-10-16 post | `lib/features/shop/shop_screen.dart`, `test/features/integrated_upgrade_screens_test.dart` |

Optional backend: a `learnProgress.likedSongIds` bound in `firebase/firestore.rules` (tested in `firebase/tests/learningAndShop.rules.test.mjs`). Not deployed; the app works without it.

## Images

`screens/` holds the unaltered renders; `images/` holds the branded cover and
framed figures that `post.html` uses (frames, backgrounds and titles are
illustration). Regenerate the renders and then the artwork with:

```text
cd apps/mobile
POST_DATA=<post_data.json> flutter test tool/post_screens/render_0_1_36_test.dart
node apps/updates-blog/scripts/render-post-art.mjs 2026-10-25-twenty-upgrades
```

`POST_DATA` is a JSON file of published records read from the public
Firestore collections (`publishedContent` songs and the folktale with their
cover images, and published `dictionaryEntries`); it is not kept in the
repository.

- All eight pictures are actual Flutter screens from the 0.1.36 code, rendered
  in a test harness at 1170×2532 (3×) with the app's own Noto Sans and theme.
  They are not screenshots of a phone, and no phone has been checked yet.
- `now-playing.png`, `music-library.png`, `song-menu.png` — the songs
  published in the Music collection, with their published cover art.
  The like, the recently played row, the 1× speed and the running sleep
  timer are set for the picture.
- `dictionary-recent.png`, `review-english-first.png` — published dictionary
  words; the recent lookups are chosen for the picture.
- `reading.png` — the published folktale in the Literature collection at a
  larger reading size.
- `chat.png`, `privacy.png` — sample conversation and sample members made up
  for the pictures; no real member's data is shown.

Credits: song covers and the folktale are Indigen World publications shown in
the app. The Indigen World mark is the existing repository logo. Icons are
Material Icons (Apache 2.0).

## Blogger handoff

1. Confirm the release status first: the post says 0.1.36 is built but not in
   the Play Store. Change that wording once it is.
2. Upload every image in `images/` to Blogger, keep the captions and alt text,
   and replace the relative `images/...` paths in `post.html` with the Blogger
   URLs.
3. Paste `post.html` into the HTML view, set the title, labels and search
   description above, and preview on a phone.
4. After publishing, put the article URL into `share.md` and share from there.
