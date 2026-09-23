# Google Play phone screenshots

Eight phone screenshots for the Indigen World listing, made on 2026-09-17 to answer the
Play Console notice **Metadata policy: Violation of Metadata policy — Unclear Visuals**.
The earlier set, six illustrated posters with no app interface in them, is kept in
`assets/legacy/play-listing-2026-09-flagged/` and must not be uploaded again.

Every phone shows an unedited capture of the real app. Only the background, the
phone frame, the headline, the supporting line and the small labels are added.

## Upload order

| # | File | What the phone shows | Labels |
|---|---|---|---|
| 1 | `01-indigen-world-intro.png` | Collection tab: Kasem Collections, the Tono Dam place story, Music / Dictionary / Literature / Audiobooks with live counts, and the five-tab bar | none |
| 2 | `02-indigen-language-learning.png` | Learn dashboard (streak, XP, Today's lesson, Review / Listen / Speak, Word of the day) and a lesson answered correctly | Your course dashboard · Lessons with instant feedback |
| 3 | `03-indigen-community.png` | Community feed (For you) and the Communities directory | Posts in Kasem and English · Find and join communities |
| 4 | `04-indigen-cultural-discovery.png` | Page 2 of the illustrated folktale *Kolo ŋwane kunkwanu tem na ye yiga yiga to*, and the Tono Dam place story | Illustrated folktale in Kasem · Stories of local places |
| 5 | `05-indigen-media.png` | An Explore reel, and the Learn tab with the music mini-player playing *hear my hope* | Short videos to watch · Music plays while you learn |
| 6 | `06-indigen-kawuri.png` | Kawuri answering "How do you say water in Kasem?", and Kawuri's start screen | Answers from the dictionary · Ask, translate and practise |
| 7 | `07-indigen-contribute.png` | Contribute: "What are you contributing?" and the Add a saying form | Words, sayings, music, stories, video · Record how it is said |
| 8 | `08-indigen-world-experience.png` | Community feed, Learn dashboard and an Explore reel | Community · Learn · Explore |

All eight are 1080 × 1920 (9:16), 24-bit PNG with no alpha, and under 1.4 MB.

## Copy

The headlines and supporting lines are the brief's, with two changes so that
nothing claims more than this build does. The course picker lists only published
courses, and today that is Kasem alone. The picker itself says "More Indigenous
languages will appear here as their courses are published."

- **Image 1, supporting line:** "Explore the Kasem language, cultural knowledge…"
  replaces "Explore African languages, cultural knowledge…".
- **Image 2, headline:** "Learn African Languages, Starting with Kasem" replaces
  "Learn African Languages".

## Where the captures come from

- **Build.** Indigen 0.1.22 (31), `com.indigenworld.indigen`. The capture used the
  release bundle recorded in `docs/product/releases/0.1.22+31.md` (SHA-256
  `8d2e5291…c258ed43b`, checked). bundletool 1.18.3 turned it into a universal APK,
  signed with the local debug key. The key changes Google Sign-In and Play
  Integrity, not the interface.
- **Device.** Android Emulator, Pixel 7 profile (1080 × 2400, 420 dpi, API 36).
  System UI demo mode fixes the clock at 9:41 and hides notification icons.
- **Account and data.** A fresh install, not signed in. It reads live production
  data as it stood on 2026-09-17. One Learn lesson was completed during the capture,
  so the dashboard shows the streak, XP and weekly progress that produced. Kawuri's
  answer was generated live for this capture.
- **The raw captures** are in `source/screens/`, stored as lossless WebP
  (pixel-identical to the screencaps).

### Content left out on purpose

- Explore reels with a TikTok watermark or third-party music videos: another party's
  content in store images invites an intellectual-property complaint. The reel used
  is a community video made with Kawuri.
- Test records in production: the song "tesst", the videos titled "dsd", and the
  lyrics "tt" on *hear my hope*. Its Now Playing screen shows those lyrics, so the
  image shows the mini-player instead.
- Dictionary and Kawuri examples quoted from the Kasem Bible, community replies
  written by other members, and Kawuri's older community reply about water (it
  gives a wrong example sentence).
- The Navrongo Basilica and Paga Crocodile Pond carousel photos are CC BY-SA and
  would need attribution. The Tono Dam photo is CC0 1.0. The folktale is "published
  with permission through Indigen World": the storyteller supplied the story and
  translation, and its illustrations were created with AI.

## Before uploading

1. **Check the production track.** It should carry 0.1.22 (31) or later. The Learn
   dashboard arrived in 0.1.21 and the blue look in 0.1.22, and the screenshots have
   to match what a reviewer installs.
2. **Remove every old phone screenshot** on the Main store listing page (under Store
   presence in Play Console) before adding these eight in the order above. If tablet
   screenshots were uploaded, they need the same treatment.
3. **Consider the feature graphic.** `apps/mobile/store-assets/feature-graphic.png` is
   still the earlier green brand art with no interface in it. The same policy covers
   promotional images.
4. **Confirm the account shown.** Several screens show posts and the profile picture
   of the @apowe account.
5. **Save the listing.** If managed publishing is on, send the change for review from
   Publishing overview.

## Rebuilding

```bash
node assets/play-listing/source/build.mjs
```

The script needs Google Chrome and the repo's `node_modules` (for Noto Sans, the
typeface of the website and the app). Pass numbers to rebuild only some images, for
example `node assets/play-listing/source/build.mjs 03 05`. The palette follows
`apps/website/src/styles/comitia-theme.css`.
