# The next five upgrades

Written after the Music, Community media and Kawuri work of 2 September 2026.
Each item is scoped to what is actually in the repository today, names the
files it would touch, and says how we would know it worked.

**Project facts:** Firebase/Cloud project `project-kassena-7e026`, Android
application id `world.indigen.mobile`, Flutter app at `apps/mobile`, trusted
backend at `services/functions`, rules at `firebase/firestore.rules`.

Ordered by leverage, not by size. 1 and 3 unblock the rest.

---

## 1. A library somebody owns

**The gap.** Music is now browsable — artists, search, recently played — but
nothing in it is *yours*. There is no way to keep a song, build a set for a
naming ceremony, or come back to the six songs you actually like out of the
whole archive. Recently played is a trace of behaviour, not a decision. Every
listener who uses the channel twice hits this wall on the second visit.

**The change.** Saved songs and member playlists.

- A new `musicPlaylists/{playlistId}` collection: `ownerUid`, `title`,
  `trackIds`, `isPublic`, `updatedAt`. Rules mirror `savedPosts`: the owner
  reads and writes their own, staff read all, public ones are world-readable so
  a playlist can be shared as a link the way a post now is.
- Saved songs as one implicit playlist per member rather than a second
  mechanism, so there is one code path and one rule to get right.
- In the app: a `+` on `MusicTrackRow` and on the now-playing screen, a
  "Your library" shelf at the top of `music_screen.dart`, and a playlist screen
  reusing `MusicTrackRow` and `MusicTransportRow` from
  `lib/features/music/widgets/music_widgets.dart`.
- `MusicController.playCollection` already takes an arbitrary list, so a
  playlist plays with no player changes at all.

**Cost.** ~2 days. One new collection, one new rules block, three screens.

**Risk.** Low. Nothing existing changes shape; the player is untouched.

**Done when.** A member can save a song from the row, from the now-playing
screen and from the mini-player's overflow; a playlist survives a reinstall;
a public playlist opens from `indigenworld.com` the way `/post/<id>` does.

---

## 2. One artist, one identity

**The gap.** `MusicArtistScreen` knows an artist only as "somebody with rows in
the music collection". But `PublishedReel.creatorId` is *the same uid* the
community profile is keyed by — the join is sitting there unused. Today the
same person is three unconnected things: a name under a song, a creator in
Explore, and a profile in Community. Follow does not reach them from the music,
and their songs do not appear on their profile.

**The change.** Make `creatorId` the single identity across the three surfaces.

- Artist page reads `communityProfileProvider(creatorId)` and gains the real
  photograph, the bio, the verification mark and a **Follow** button — all of
  which already exist in `lib/features/community/`.
- Community profile gains a "Their work" section listing their published
  music, audiobooks and reels.
- Tapping the creator line in Explore lands on the same page.

**Cost.** ~1.5 days, almost entirely wiring. No new data.

**Risk.** Low–medium. The one real decision: what an artist page shows for a
creator who has published music but never claimed a community handle. Answer:
the music, without the follow button — never an error, never an empty profile.

**Done when.** From a song you can reach the person, follow them, see
everything else they have made, and get back — without leaving the app's idea
of who they are.

---

## 3. The dictionary as a queryable index

**The gap.** Kawuri's new translation lookup
(`services/functions/src/kawuri-dictionary.ts`) loads up to 4,000 published
entries into each function instance and matches in memory, because the matching
that matters — case folding, punctuation stripping, splitting "water, rain
water" into two senses — cannot be expressed as a Firestore query against the
fields we store. That is honest and it works today. It stops working the day
the dictionary outgrows the cap, and the same limitation is why the app's own
dictionary search is a client-side scan of everything it has downloaded.

**The change.** Write the normalised forms at publish time.

- Add `searchTerms: string[]` to `dictionaryEntries`, containing every
  normalised Kasem rendering and every split English sense. Written in
  `services/functions/src/creators.ts` beside the existing fields, using the
  same normaliser the app and Kawuri already share in spirit — move
  `normaliseTerm` into a module all three import so there is one rule.
- A one-off backfill script under `services/functions/scripts/`.
- Kawuri's lookup becomes `where('searchTerms', 'array-contains', term)`:
  no cache, no cap, no TTL, one read per question.
- The app's dictionary search and `dictionaryIndexProvider` in
  `lib/features/dictionary/word_lookup.dart` can use the same field.

**Cost.** ~1.5 days including the backfill and a rules review.

**Risk.** Medium — it is a schema addition to a collection with three
generations of documents in it. The backfill must be idempotent and must not
touch `isPublished`, `approvedAt` or `audioUrl`.

**Done when.** `kawuri-dictionary.ts` no longer has a cache, a cap, or a
truncation warning; a word published a minute ago is findable by Kawuri
immediately rather than within fifteen minutes.

---

## 4. Kawuri that streams, and that can act

**The gap.** Two things are still wrong with a Kawuri turn even after today's
budget fix. It arrives all at once after several seconds of a thinking dot —
which reads as "broken" long before it reads as "working" on a slow
connection — and it can only ever *tell* you to go somewhere. Asked "how do I
add a word", it describes the Contribute tab; it cannot open it.

**The change.**

- **Streaming.** Swap `:generateContent` for `:streamGenerateContent` in
  `vertexEndpoint`, return the stream over a callable-compatible channel
  (an HTTPS function with SSE, or chunked writes to a Firestore doc the client
  listens to), and render partial text in `kawuri_screen.dart`. The perceived
  wait drops from seconds to one.
- **Actions.** Declare a small tool surface to the model — `lookupWord`,
  `openContribute(kind, word)`, `openDictionaryEntry(id)`, `findArtist(name)` —
  and let the answer carry a chip the member can tap. The dictionary lookup
  built today becomes a tool the model *calls* rather than a block it is
  handed, which also means it fires only when the model decides it is needed.

**Cost.** ~3 days. Streaming is the larger half.

**Risk.** Medium. Streaming changes the transport, so the on-device fallback
guide (`kawuri_offline_guide.dart`) and the `configured: false` path both need
re-proving. Keep the existing callable in place until the streamed one is
proven on a real handset on a slow connection.

**Done when.** First token on screen inside a second, and "how do I add the
word for millet" ends in a chip that opens Contribute with the word filled in.

---

## 5. Listening that respects a metered connection

**The gap.** Downloads exist per track and are tier-limited
(`offlineDownloadLimit`), but everything else assumes bandwidth nobody in
Navrongo is paying flat-rate for. There is no way to take an artist's
catalogue with you, no quality choice, and the artwork on the new shelves is
fetched at full size for a 96-pixel circle.

**The change.**

- **Download an artist / a playlist**, not just a track: one action, the tier
  limit applied across the set, with a clear "this will use about N MB".
- **A quality setting** — stream at a lower bitrate on mobile data, full
  quality on Wi-Fi — which needs a second rendition written at publication
  time in `services/functions/src/published-media.ts`.
- **Sized artwork.** `CachedNetworkImage` in `MusicArtwork` should request a
  thumbnail rendition rather than the full poster; at 96px the current fetch is
  roughly twenty times the bytes needed, paid on every scroll of the shelf.

**Cost.** ~2.5 days, plus a re-encode pass over existing audio for the quality
setting (which can ship second).

**Risk.** Medium. Transcoding at publish time adds a step to a workflow that is
already the most delicate part of the backend. The artwork fix is independent,
takes an hour, and should not wait for the rest.

**Done when.** A member on mobile data can see what a download will cost before
starting it, take a whole artist offline in one action, and scroll the artists
shelf without paying for pictures they are seeing at a fifth of their size.

---

## What is deliberately not on this list

- **A recommendation feed for music.** The archive is not yet large enough for
  a recommender to be recommending rather than guessing, and a guess presented
  as taste is worse than a list.
- **Comments on songs.** Community already exists and already has the
  moderation, the mentions and the notifications. A second, weaker comment
  system beside it is two things to keep safe instead of one.
- **A web player.** The website is a front door and a share target. Making it
  a second full player doubles the surface that has to agree about playback
  state, for members who overwhelmingly arrive on Android.
