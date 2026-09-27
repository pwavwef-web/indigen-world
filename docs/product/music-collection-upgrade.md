# Music, upgraded: a place to listen

Written 24 September 2026, on top of the player as it stands in 0.1.23 (32):
the bar that folds into a draggable bubble. Scoped to what is in the
repository today. Each phase names the files it touches and says how we would
know it worked.

## Status: phases 1–6 built on 24 September 2026

Built the same day this plan was written, and tested locally. **Not built into a
release, not on a phone, not committed.**

**Checks.**
- `dart analyze lib test` is clean.
- The music, shared, collection and app test folders pass (170 tests, including
  six new test files).
- Full suite: 1507 tests passed. One reel-editor test timed out under load and
  passes on its own.

The release post is drafted in
`apps/updates-blog/posts/2026-09-24-music-reimagined/`.

**Decisions, as answered.**
1. Music's own navigation bar sits at the bottom.
2. The expanding-tile effect is built, but without the `animations` package. Its
   `OpenContainer` pushes a `ModalRoute`, and heroes only fly between page routes,
   so it would have cancelled the nav bar hand-off chosen for this round.
   `lib/shared/reveal_route.dart` is a `PageRoute` that grows the page out of the
   tapped widget, so both effects happen together.
3. The wall pattern is the one Learn already ships. `KassenaPatternPainter`
   moved to `lib/shared/kassena_pattern.dart`, so there is nothing new to review.
4. The nav bar hand-off is in this round (`kAppRailHeroTag`).
5. Audiobooks share the screens, with Readers in place of Artists.

**Where it differs from the plan below.**
- **No separate hub file.** `MusicScreen` itself is the hub, so every existing
  caller and test keeps its name. Home is `music_home_tab.dart`.
- **Labels stay in English.** The new nav bar labels are hard-coded, like every
  other string in the Music feature. Localising Music is a separate job.
- **Colours come from our own reader.** Track colours come from
  `extractArtworkTint` in `music_tint.dart`, not `ColorScheme.fromImageProvider`.
  The Flutter one throws from inside an image-stream listener when a cover fails
  to load.
- **The render check found two real bugs, both fixed.**
  - The blurred now-playing background shrank to a small box, because an
    `AnimatedSwitcher` stack is loose.
  - The player bar's title scrolled when it fitted, because it was measured in
    a different font from the one it was drawn in.

**Still open.**
- Try it on a physical phone, including with *Remove animations* switched on.
- Bump the version to 0.1.24 (33) and build the release.
- Phase 7: likes and playlists.

---

**Scope:** the Music channel (and Audiobooks, which share its screens), the
now-playing screen, the mini-player, and two navigation rails: the app's own
and a new one for Music. Everything is app-only. Nothing needs a functions,
rules or hosting deploy until the optional phase 7.

---

## Where it stands

- **Getting there.** Collection → the Music tile → `MusicScreen`
  (`lib/features/music/music_screen.dart`), pushed with a plain
  `MaterialPageRoute`. The push covers the app rail, so the only navigation
  inside Music is a back arrow and a search icon.
- **The screen.** An app bar, a headline, Play all / Shuffle, then three
  sections: *Jump back in*, *Artists*, *Every song* (with adverts dealt in).
  It is well organised, but nothing on it moves except the ink ripple. Loading is
  a spinner, and an empty channel is one line of grey text.
- **Artist page** (`artist_screen.dart`): a portrait circle on a flat ground
  in a `SliverAppBar`, then a numbered list.
- **Search** (`music_search_screen.dart`): a text field in an app bar over
  plain list rows.
- **Now playing** (`now_playing_screen.dart`): artwork, title, a stock
  `Slider`, a row of `IconButton`s, and the lyrics as a paragraph. It opens with
  the default page transition, and **the mini-player stays drawn over its
  bottom edge**, so the small player and the big one are on screen at once.
- **Mini-player and bubble** (`widgets/mini_player.dart`,
  `music_player_dock.dart`, `music_bubble.dart`): the one place that already
  moves, with the 340 ms bar-to-bubble morph and the equalizer painter. They
  set the standard for everything else in this plan.
- **The app rail** (`lib/shared/frosted_nav_bar.dart`): already expressive. It
  has a glass pill that stretches between slots, wiggles when it lands and can
  be dragged. It knows nothing about music.
- **Dead code:** nothing pushes `MusicCollectionScreen` or
  `AudiobookCollectionScreen` in `collection_detail_screens.dart` any more.

## The idea

Music stops being a list you push into and becomes a place: its own glass rail
(**Home · Search · Artists · Library**), a stage at the top that takes its
colour from what is playing, and a now-playing screen that grows out of the
mini-player instead of sitting on top of it.

One rule governs all the razzmatazz: **the page moves when the music moves.**
Anything that loops runs only while something is playing and stops dead on
pause. That covers the equalizers, the breathing glow, the drifting pattern
and the ring around the playing artist. Everything else is one-shot motion in
answer to a touch. The rule keeps the work affordable on the low-end phones
most members use. It keeps widget tests able to settle, which matters because
the equalizer already showed that `pumpAndSettle` hangs on a loop. And a member
who pauses gets a page that is actually still.

| Phase | What a member notices | Rough size |
| --- | --- | --- |
| 1. Foundations | Nothing yet | ½ day |
| 2. Music's own rail | Home · Search · Artists · Library | 1½ days |
| 3. Home | The stage, livelier shelves, browse tiles | 2 days |
| 4. Now playing | Grows out of the bar, breathes, swipe to skip | 2 days |
| 5. Mini-player | Morphing controls, swipe to skip, progress ring | 1 day |
| 6. App rail | Signature icon motions, a live music badge, a Music tile that shows what's playing | 1 day |
| 7. A library you own | Likes and playlists (needs a rules deploy) | Later |

About eight days for phases 1–6, plus a day for device checks and the release.

## Motion rules

These apply to every phase. The tokens live in one new file,
`lib/shared/motion.dart`.

| Rule | Detail |
| --- | --- |
| Three durations | `quick` 150 ms for press feedback, `standard` 280 ms for state changes, `emphasized` 420 ms for screen and shape changes. The existing 340 ms morph stays as it is. |
| Two curves | `easeOutCubic` for things arriving. `easeOutBack` or a spring only for things that *land*: artwork, the play button, rail icons. |
| Loops only while playing | Loops mount only while `musicIsPlayingProvider` is true, the same way `MusicEqualizer` already does. |
| Reduced motion | When `MediaQuery.disableAnimationsOf` is set, there are no loops and no slides, and state changes become 150 ms fades. The shell and Learn already make the same check. |
| Position stream | Still read only by leaf `StreamBuilder`s inside a `RepaintBoundary`: the scrubber, the bar's progress line and, from phase 5, the bubble's ring. The ring and the line never exist at the same time. Update the comment in `music_providers.dart` to say so. |
| Blur budget | No `BackdropFilter` on anything that scrolls. The blurred artwork behind now playing is an `ImageFiltered` 64-pixel decode, painted once inside a `RepaintBoundary`. |
| Honest motion | No fake waveform and no fake lyric sync. We have no loudness or timing data, and this codebase does not build controls that pretend. |

---

## Phase 1: Foundations

**The change.**
- `lib/shared/motion.dart`: the tokens above, plus three helpers:
  - `motionAllowed(context)`;
  - `Entrance`, a fade and 12 px rise staggered 40 ms per item and capped at
    the first eight, so a long list never waits;
  - `PressScale`, which shrinks to 0.96 on tap-down and springs back.
- `lib/features/music/music_tint.dart`: one colour per track, taken from its
  artwork with Flutter's own `ColorScheme.fromImageProvider` over
  `CachedNetworkImageProvider`, so no new package is needed. Each colour is
  computed once per track id and kept. It is darkened until white text on it
  passes 4.5:1. It falls back to the theme's `heroMid` while loading or when
  there is no artwork.
- Add the first-party `animations` package from flutter/packages for
  `OpenContainer`, the container transform used by the Collection tile and the
  lyrics card. Commit `pubspec.lock` with it.

**Risk.** Low. Nothing on screen changes yet.

**Done when.** The contrast clamp and the tint fallback have unit tests, and
`motionAllowed` returns false under `disableAnimations`.

---

## Phase 2: Music gets its own rail

**The change.**
- New `lib/features/music/music_hub_screen.dart`: a `Scaffold` with
  `extendBody: true` and the same `FrostedNavBar` the app uses. It carries four
  destinations: Home, Search, Artists and Library, with Readers in place of
  Artists for Audiobooks. It has the same pill, wiggle and drag as the app
  rail, so it is familiar from the first tap.
- The tabs live in an `IndexedStack`, so each keeps its scroll. Switching uses
  the shell's own fade-and-slide. Tapping the tab you are already on scrolls it
  to the top, as the app rail does. Inactive tabs sit under
  `HeroMode(enabled: false)`, because an artist on the Home shelf and the same
  artist in the Artists grid would otherwise be two heroes with one tag.
- The rail uses the channel's colour: the Music tile's teal (`0xFF0E7490` by
  day, `0xFF67E8F9` by night), and gold for Audiobooks. The colour you tap on
  the way in is the colour of the screen you land on.
- The four tabs:
  - **Home** is today's `MusicScreen` body, redesigned in phase 3.
  - **Search** is `MusicSearchScreen`'s body moved into a tab, with the field
    in a glass pill at the top.
  - **Artists** is a three-column grid of every artist, sorted by busiest or
    A–Z.
  - **Library** holds *Recently played* in full, with the *Clear* that
    `RecentlyPlayedController.clear` already supports, and *On this phone*
    from `downloadsProvider`. It grows *Liked* and *Playlists* only once phase 7
    exists, so it never shows an empty promise.
- `FrostedNavBar` gains an optional `accent`, a per-item `motion` and a
  per-item `badge` widget. The defaults reproduce today's rail exactly.
- `app_router.dart` gains `/music` and `/audiobooks`, so a notification or a
  link can land in the channel. `collection_screen.dart` opens the hub.
- Add the new rail labels to both `app_en.arb` and `app_fr.arb`.
- Delete the two dead collection screens.

**Risk.** Low to medium. A rail inside a pushed route should stack with the
mini-player exactly as the app rail does today, because `FrostedNavBar`
positions itself from `paddingOf` and the overlay already inflates that value.
That still needs a test to prove it.

**Done when.** From the Collection tile, a member lands on Music Home with a
rail. Each tab keeps its place when they leave and come back. On a 360 dp
phone, the rail sits clear of the mini-player whether the bar is expanded or
collapsed.

---

## Phase 3: Home, the stage and the shelves

**The change.**
- **The stage** (new `widgets/music_stage.dart`): a collapsing header built
  from a `SliverAppBar` with `stretch: true`. It is painted with the theme's
  hero band, tinted by the colour of the track that is playing, or of the
  newest track when nothing is. On top of it:
  - a geometric band in the spirit of Kassena wall painting (triangles,
    zigzags, lozenges). A `CustomPainter` draws it in white at low opacity so
    it suits every theme. It drifts slowly while music plays and stays still
    otherwise;
  - *Hear the rhythm of home.* set large;
  - a featured card for the newest published piece, by `publishedAt`, showing
    its artwork with a soft shadow and a round play button. When that piece is
    playing, the button becomes the live equalizer and the card says so;
  - Play all and Shuffle as two pills.
  The header scrolls at half speed for a parallax effect. Its headline fades
  as it collapses into the bar.
- **Shelves** (`widgets/music_widgets.dart`):
  - Cards grow to 148 px and use `PressScale`. The card that is playing shows
    the equalizer over its artwork.
  - A new *New in the archive* shelf shows the ten newest pieces. It appears
    only when the archive is big enough for it to differ from *Every song*.
  - The playing artist's circle gets a slowly turning gradient ring.
- **Browse by kind**: colour tiles built from the `category` values that
  actually exist, each with a tilted piece of artwork peeking from a corner.
  They appear only when at least two categories hold two or more pieces each.
  A tile opens a list page, using the artist page's layout generalised into
  `MusicListScreen`.
- **Every song**:
  - The first screenful enters with `Entrance`.
  - The playing row's static icon becomes the live equalizer.
  - Rows for downloaded tracks get a small "on this phone" mark from
    `downloadedIdsProvider`.
  - Advert splicing is untouched.
- **States**: `GlassSkeleton` shelves replace the spinner. The empty channel
  shows the band and a note above its existing line. Errors use
  `GlassEmptyState` with a retry.
- **Artist page**:
  - The portrait flies in from the circle you tapped, using a `Hero`.
  - The header stretches and zooms when pulled past the top, and its ground
    takes the portrait's tint.
  - The Play button docks into the toolbar as the header collapses.

**Risk.** Medium, mostly performance: a tinted header with parallax over a
long list. Keep the painter behind its own `RepaintBoundary`, and profile on a
low-end device before calling it done.

**Done when.** Home scrolls at 60 fps in a profile build on a low-end Android
phone. Every section still hides itself when empty instead of drawing an empty
shelf.

---

## Phase 4: Now playing, reimagined

**The change.**
- **It grows out of the bar.** `/now-playing` becomes a
  `CustomTransitionPage`. The page rises from the bottom while the artwork
  scales up from the mini-player's artwork square. A `Hero` cannot do this,
  because the bar lives above the Navigator. But `MusicBubbleBounds.barRect`
  already knows exactly where the bar is, so the flight can be computed. When
  the player is a bubble, or the screen opens from the notification, the page
  simply rises. Dragging down dismisses it, with the page following the finger.
- **The bar gets out of the way.** A new `nowPlayingOpenProvider` is set while
  the screen is up. It hides the dock and drops its inset, so the small player
  is no longer drawn over the big one. It cannot reuse `fullScreenMediaProvider`,
  which means "other audio is playing" and would pause the music.
- **Backdrop** (new `widgets/now_playing_backdrop.dart`): the artwork, blurred
  and darkened, over the track's tint. A slow glow breathes behind it while the
  track plays. A track change cross-fades the backdrop.
- **Artwork**:
  - It sits at full size while playing and eases back to 86 % when paused,
    then springs forward again on play.
  - Swipe it sideways to skip. It follows the finger, and the next artwork
    slides in from the side the swipe is heading towards.
  - Title and artist change with a short slide in the same direction.
- **Scrubber** (new `widgets/music_scrubber.dart`): a thick rounded track that
  swells under a finger and shows the time in a bubble above the thumb. It
  keeps today's `_Scrubber` logic, where the drag owns the value until
  release, and it is still a leaf `StreamBuilder`.
- **Transport**:
  - Play/pause morphs with `AnimatedIcons.play_pause` inside a large disc
    filled with the tint.
  - Previous and next nudge in their direction when pressed.
  - Shuffle and repeat grow a dot when they are on.
  - The tooltips stay, because tests find these buttons by them.
- **Words**: the lyrics become a glass card. Tapping it opens a full-screen,
  large-type read-along view through `OpenContainer`.
- **Up next**: a glass sheet with the current track pinned at the top and the
  rest entering in a short stagger.

**Risk.** Medium. The route transition and the flag that hides the dock both
touch the overlay, which has three documented traps:
- keep `Overlay.wrap`;
- send the inset to zero whenever the bar is not drawn;
- keep `dismiss()`, never `stop()`, on the X.

Extend `music_overlay_mount_test.dart` and `music_player_dock_test.dart` to
cover them.

**Done when.**
- Tapping the bar makes the page grow out of it and the bar disappears.
- Dragging down folds the page back into the bar.
- Swiping the artwork plays the next song.
- Pausing stops every loop on the screen.

---

## Phase 5: Mini-player and bubble polish

**The change.**
- Play/pause morphs instead of swapping icons. The bar takes a faint wash of
  the track's tint, and its progress line is drawn in the tint.
- Swipe the bar sideways to skip, with the title sliding under the finger.
- A title too long for the bar scrolls slowly and pauses at each end. It never
  scrolls under reduced motion.
- The bubble gets a thin progress ring. It is the only new reader of the
  position stream in the whole plan, and it never exists at the same time as
  the bar's line.

**Risk.** Low to medium. The dock is the most carefully tested file in the
feature. This phase changes only how the bar and bubble look. Geometry,
placement and the handler stay as they are.

**Done when.** The existing dock, bubble and dismiss tests pass unchanged, and
new tests cover the gestures.

---

## Phase 6: The app rail joins in

**The change.**
- **Signature motions.** Each destination makes its own small movement when
  selected:
  - Explore's play mark turns;
  - Learn's cap tosses;
  - Community's bubble pops;
  - Collection's bookmark flips;
  - Contribute's plus rotates a quarter-turn.
  Each is one-shot, about 450 ms, skipped under reduced motion, and built on
  phase 2's `motion` field.
- **Where the music lives.** While something plays, the Collection
  destination shows a tiny live equalizer badge. It uses phase 2's `badge`
  field and reads `musicIsPlayingProvider`, which changes only on play and
  pause.
- **The Collection tile comes alive.** While music plays, the Music tile shows
  the equalizer and the song title. Tapping it opens the hub with a container
  transform, so the tile becomes the page.
- **The rail hands over** *(optional)*. The app rail and the music rail share a
  `Hero`. Entering Music then leaves the rail on screen: its icons re-form into
  Music's and the pill glides to Home. The same happens in reverse on the way
  out.

**Risk.** Low, except for the hand-off. The hero flight carries a blurred glass
rail, and the shell may have scrolled its rail out of view. Enable the hero
only while the rail is visible. If the hand-off isn't smooth on the low-end
device, drop it without regret.

**Done when.** `frosted_nav_bar_test.dart` covers the new fields. The one-shot
motions leave no ticker running. The badge appears and disappears with play
and pause.

---

## Phase 7: A library you own *(follow-on)*

Liked songs and playlists, exactly as scoped in
[the next five upgrades](next-five-upgrades.md#1-a-library-somebody-owns): a
`musicPlaylists` collection, its rules, and a Library tab that finally holds
something the member chose. This is the one phase that needs a deploy. The
Firestore rules deploy is separate from the functions deploy. The like button
gets a small heart burst when it lands.

---

## Testing and verification

- **Widget tests.**
  - `music_screen_test.dart` moves to the hub. Search is now a rail
    destination, found by its label.
  - New tests:
    - `music_hub_test.dart`: tabs switch, scroll positions are kept, reselect
      goes to the top, audiobook labels;
    - the tint and its contrast clamp;
    - the dock hiding under now playing, and drag-to-dismiss;
    - the new rail fields.
  - Nothing that loops is mounted unless something plays, so `pumpAndSettle`
    stays usable. Tests that do play something use `pump()` +
    `pump(duration)`.
- **Reduced motion.** One test per screen pumps with
  `disableAnimations: true` and checks that no frames are still scheduled
  afterwards.
- **Pictures.** Render checks of Home, an artist page and now playing in the
  Blue and Heritage Green themes, light and dark, before any device work.
- **Device.** A profile build on a low-end Android phone, or an emulator set up
  like one. Watch the Home scroll, the now-playing transition and the rail
  hand-off in the DevTools raster timeline.
- **Before main.** Run `flutter analyze`, `flutter test`, and the local mirror
  of the three CI workflows, since GitHub Actions is not running.

## Decisions for you

1. **Music's own rail at the bottom**, as recommended, or a row of chips at
   the top and no second rail?
2. **The `animations` package.** Fine to add? It comes from the Flutter team.
3. **The wall-painting band.** Who in the community should see the pattern
   before it ships?
4. **The rail hand-off.** In this round, or later polish?
5. **Audiobooks.** Share the hub, as recommended, with Readers in place of
   Artists?

## Deliberately not in this plan

- **Waveforms and synced lyrics.** We have no loudness or timing data. Timed
  lyrics would first need a new field and a way to author it.
- **Reordering the queue.** This needs `moveQueueItem` in
  `IndigenAudioHandler`, which is separate work.
- **Lottie or Rive.** Every effect here is a painter or a built-in Flutter
  animation. That keeps the APK size and the low-end frame budget where they
  are.
- **Player architecture.** `audio_service`, where the overlay mounts, the
  bubble geometry and the difference between dismiss and stop all stay as
  they are.

## Shipping

Phases 1–6 are app-only and can ship together as 0.1.24 (33). When they do,
add the release post under `apps/updates-blog/posts/`, with its `README.md`,
`post.html` and `share.md`, as `AGENTS.md` requires.
