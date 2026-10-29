# Twenty community upgrades (0.1.37+46)

- **Title:** Twenty community upgrades, from topics to reminders
- **Topic:** Indigen World Android 0.1.37, the Community tab: labels that open a topic page, back to the top, a "Seen on your last visit" line and muted words; image descriptions, drafts, event date and place with a phone reminder, and community rules before a first post; sharing a post as a picture, sending it in a message, post links drawn as posts in chat, and asking Kawuri about a post; reply order, an Author badge, a pinned post, Follows you and people in common; new-post dots on joined communities, and search for members and saved posts.
- **Labels:** Mobile, Release, Community, Events, Accessibility, Indigen World
- **Search description:** Indigen World 0.1.37 for Android: topic pages, events with a date and a reminder, photo descriptions, drafts, a pinned post, muted words and sharing a post as a picture.
- **Status (29 October 2026):** Built and tested as Android `0.1.37+46` (see `docs/operations/release-0.1.37-46.md` for the signed AAB and checks). **Not uploaded to Play**, and not yet checked on a real phone. No backend deploy is needed; an optional rules tightening is committed but not deployed. Not published on Blogger. The post says the update is not in the Play Store yet — change that once it is.
- **Publishing owner:** Chinedum. Preparing this post does not authorize publishing or sharing it.

## What changed (code)

All paths under `apps/mobile/lib/features/community/` unless stated. Full list and verification in `docs/operations/release-0.1.37-46.md`.

| # | Change | Where |
| --- | --- | --- |
| 1 | Topic pages from a post's label (existing `isReply + category + createdAt` index) | `topic_feed_screen.dart`, `widgets/community_post_card.dart`, `data/community_repository.dart` (`watchTopicFeed`) |
| 2 | Tapping the active feed tab goes back to the top | `community_screen.dart` (`_switchTab`) |
| 3 | "Seen on your last visit" line | `data/community_local_prefs.dart` (`FeedVisitStore`, `caughtUpIndex`), `community_screen.dart` |
| 4 | Muted words (on the phone, per account) | `data/community_local_prefs.dart` (`mutedWordIn`), `widgets/community_post_card.dart`, `lib/features/settings/privacy_controls_screen.dart` |
| 5 | Image descriptions (`media[].alt`) | `compose_post_screen.dart`, `data/community_models.dart`, `data/community_repository.dart`, `widgets/post_media_view.dart` |
| 6 | Drafts | `data/saved_drafts.dart`, `drafts_screen.dart`, `compose_post_screen.dart`, `widgets/community_sidebar.dart` |
| 7 | Event date and place (`event {startsAt, place}`) | `data/post_event.dart`, `compose_post_screen.dart`, `widgets/post_event_tile.dart` |
| 8 | Event reminder, an hour before (local notification) | `data/event_reminders.dart`, `widgets/post_event_tile.dart`, `lib/app/app_router.dart` |
| 9 | A community's rules before a first post into it | `compose_post_screen.dart`, `data/community_local_prefs.dart` |
| 10 | Share as a picture | `widgets/post_picture_sheet.dart`, `community_actions.dart` |
| 11 | Send in a message | `widgets/send_post_sheet.dart`, `community_actions.dart` |
| 12 | Post links drawn as posts in chat | `widgets/chat_post_link_card.dart`, `chat_screen.dart` |
| 13 | Ask Kawuri about this post (a draft, never sent for you) | `community_actions.dart`, `lib/features/kawuri/kawuri_screen.dart` |
| 14 | Reply order | `post_detail_screen.dart` (`sortReplies`) |
| 15 | Author badge on the thread author's replies | `post_detail_screen.dart`, `widgets/community_post_card.dart` |
| 16 | Pin a post to your profile (`communityProfiles.pinnedPostId`) | `community_actions.dart`, `community_profile_screen.dart`, `data/community_repository.dart` |
| 17 | Follows you | `widgets/people_widgets.dart`, `community_profile_screen.dart`, `data/community_providers.dart` |
| 18 | People in common | `community_profile_screen.dart`, `data/community_providers.dart` (`followersYouKnowProvider`) |
| 19 | New-post dots on joined communities | `communities/communities_screen.dart`, `communities/community_space_widgets.dart`, `communities/community_space_screen.dart`, `data/community_local_prefs.dart` |
| 20 | Search members and saved posts | `communities/community_space_screen.dart`, `saved_posts_screen.dart` |

Optional backend: `firebase/firestore.rules` validates the optional `event` map and `pinnedPostId` (tested in `firebase/tests/community.rules.test.mjs`). Not deployed; the app works without it, because the deployed rules already accept both fields.

## Images

`screens/` holds the unaltered renders; `images/` holds the branded cover and
framed figures that `post.html` uses (frames, backgrounds and titles are
illustration). Regenerate the renders and then the artwork with:

```text
cd apps/mobile
flutter test tool/post_screens/render_0_1_37_test.dart
node apps/updates-blog/scripts/render-post-art.mjs 2026-10-29-twenty-community-upgrades
```

- All nine pictures are actual Flutter screens from the 0.1.37 code, rendered
  in a test harness at 1170×2532 (3×) with the app's own Noto Sans and theme.
  They are not screenshots of a phone, and no phone has been checked yet.
- Every post, member, draft and conversation in them is sample data made up
  for the pictures and written in English. None of it is presented as Kasem,
  and none of it is a real member's post. The reminder, the muted words and
  the reply order are set for the pictures.

Credits: the Indigen World mark is the existing repository logo. Icons are
Material Icons (Apache 2.0).

## Blogger handoff

1. Confirm the release status first: the post says 0.1.37 is built but not in
   the Play Store. Change that wording once it is.
2. Upload every image in `images/` to Blogger, keep the captions and alt text,
   and replace the relative `images/...` paths in `post.html` with the Blogger
   URLs.
3. Paste `post.html` into the HTML view, set the title, labels and search
   description above, and preview on a phone.
4. After publishing, put the article URL into `share.md` and share from there.
