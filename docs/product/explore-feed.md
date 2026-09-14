# Explore feed

How the mobile Explore screen works after the 2026-09-13 upgrade, what it
needs from the backend, and what is still missing there.

Code: `apps/mobile/lib/features/explore/`. Tests: `apps/mobile/test/features/explore/`.

## 1. What changed

| Area | Before | Now |
| --- | --- | --- |
| Content | Video only | Community posts: **video only, never a picture** (whatever the category). Published archive work: `mediaType` `video` or `image` |
| Order | Published first, then community, round-robin by creator | One ranked list (`explore_ranking.dart`): recency, follows, joined communities, review status, context, coarse engagement, topic affinity, then a diversity pass so no creator, community or language takes over |
| Following | Followed creators | Followed creators **and** public posts of joined communities, newest first |
| Topics | None | For you, Music, Stories, Traditions (`explore_topics.dart`), read from Collection channel, post category, category text, tags and captions |
| Sizing | Always contained, blurred bands | `reelMediaLayout` in `core/media_geometry.dart`: portrait fills (towards a focal point); landscape and square are enlarged up to a 20% crop (34% with a focal point) and otherwise framed over a darkened backdrop from the media |
| Chrome | Always visible | `ExploreChromeController`: hides during uninterrupted playback and forward scrolling; returns on tap, back-scroll, pause, new reel settling, and while a sheet or menu is open. The shell's profile avatar follows it. Always visible under a screen reader |
| Rail | Avatar, like, replies, keep, context | Avatar with follow plus (optimistic, reverts on failure), like, replies, keep, Context (gold ring), More |
| Words | 34pt headline | Community row with Join, category, name and @handle, two-line caption with more/less, sound line with mute, views |
| Context | Popup | Draggable sheet (collapsed, medium, expanded; pauses when expanded) with creator-provided, review-desk, dictionary and AI sources labelled separately |
| Playback | Active reel only | Active reel plays; the next reel opens paused; everything else is released. Mute persists (`explore.sound.muted.v1`) |
| Views | Written on arrival | Written after a qualified view (3 s of playback, or half of a short clip) |

## 2. Backend: nothing to deploy

- **Firestore query.** `publishedContent` now uses `mediaType in ['video','image']`.
  `in` is served by the existing (publicationStatus, mediaType, publishedAt)
  composite index. No index change.
- **Rules.** None changed. Reports from Explore use the existing
  `communityReports` create rule.
- **Storage.** None changed.
- **Functions.** None changed.

## 3. Backend gaps (the app is ready; the data is not)

1. **Focal point and aspect ratio.** The app reads `focalPoint {x, y}` and
   `aspectRatio` on `publishedContent` (top level or under `media`) and
   `focalPoint` on each community `media` item. Since 2026-09-14 the reel
   creator writes `focalPoint` for square and landscape community reels (see
   `reel-creation.md`); TribeStudio and the ordinary composer still do not, so
   their crops centre, and the shape of a still is learnt from a 72px decode.
2. **Community on published work.** The app reads `communityId` and
   `communityName` on `publishedContent`; the publication workflow does not
   stamp them, so the community row appears only on community posts.
3. **Reports on published work and adverts** are filed with `postId`
   `published:<id>` or `sponsored:<campaignId>`. The admin console's Reports
   screen looks every `postId` up in `communityPosts`, so these show their
   reason but no preview until the console learns the prefixes.
4. **Not interested, Hide creator, Hide community.** Community posts also get
   the server-side hide or mute. Published work and whole communities have no
   server edge yet, so those choices are stored on the device
   (`explore.hidden.*.v1`) and do not follow the member to another phone.
5. **Copy link** is offered only for community posts. Published work has no
   public web page; Share sends the credit and the site address instead.
6. **Followed languages and cultural topics** do not exist as a thing to
   follow, so Following does not use them.
7. **Location** is not used in ranking: the app holds no location permission.
8. **Related lessons** are not linked from Context: lessons carry no topic or
   content link to match on.
9. **AI explanation** calls the existing `kawuriChat` callable. Where the model
   is unreachable or unconfigured the sheet says so and shows nothing — it
   never shows the offline guide's generic answer as an explanation.

## 4. Analytics

Firebase Analytics, collected in production only (`FirebaseBootstrap`).
Events carry `content_id`, `source`, `media_kind`, `is_replay_pass` and
`community_id` — never member ids, creator ids or caption text.

`explore_impression` (1 s on screen), `explore_qualified_view`,
`explore_completion`, `explore_replay`, `explore_like`, `explore_comment_open`,
`explore_save`, `explore_follow`, `explore_community_join` (`result`),
`explore_context_open`, `explore_translation_open`,
`explore_pronunciation_play`, `explore_topic_filter` (`topic`, `feed`),
`explore_report`, `explore_not_interested`.

Sponsored impressions still go to `ServedAdTelemetry`, now after the same one
second on screen rather than on arrival.

## 5. Verified, and not

Verified by tests and a render check: one clip playing at a time, preload and
release, tap to pause, mute carried to the next reel, chrome timing (including
no flicker on rapid swipes), Context open/expand-pauses/close keeping the
place, translation panel sources, follow optimistic and reverted, community
Join / Requested / Joined and a refused join reverting, topic filtering and the
empty-topic state, portrait/square/landscape framing, 360×640 and 412×915
layouts.

Not verified: real network video and images, and a physical Android device.
Pronunciation playback uses the dictionary's existing `PronunciationButton`
and was not played on a device.
