# De N Lei — Come Learn Kasem joins Music

Status: **Music record published to Firebase on 2026-09-23; guest query and public assets verified.** The Blogger article is a draft for Chinedum to publish. A physical-device play-through was not performed.

| Field | Value |
|---|---|
| Title | De N Lei — Come Learn Kasem joins Music |
| Labels | `Music`, `Kasem`, `Learning`, `Community` |
| Search description | Hear and practise Kasem greetings, introductions and polite words with the new De N Lei song in Indigen World Music. |
| Custom permalink | `de-n-lei-come-learn-kasem` |
| Article | `post.html` |
| Sharing copy | `share.md` |
| Cover art | `assets/music/de-n-lei/cover.png` (square, generated for this song) |

## Verified release evidence

- `node firebase/seed/seed-de-n-lei.mjs --commit` published `publishedContent/de-n-lei-come-learn-kasem` to project `project-kassena-7e026` at `2026-09-23T13:08:57.108Z`.
- The script validated the public record against the published-content contract and checked the public audio and cover URLs with matching content lengths.
- `node firebase/seed/verify-de-n-lei.mjs` checks the production mobile app's Music query as a guest and verifies title, artist, audio, cover, and lyrics.
- The mobile Music library reads published audio records from this collection, and its player reads lyrics from the record's `body` field. No app binary change was needed for this content addition.
- Source WAV: 3:01.2, 48 kHz stereo. Playback MP3: 4.3 MB. The source metadata says “made with suno”; no human performer is identified there. Indigen World is the displayed artist per the supplied instruction.

## Availability limits

The release evidence confirms the Firebase record and asset URLs. It does not prove playback on a physical Android or iOS device. The supplied Kasem lyrics and English glosses have not had an independent language review. The cover illustrates a learning scene and does not depict verified performers.

## Publishing handoff

1. Open the Music collection on a physical device and play the song through once if device confirmation is needed for the announcement.
2. Paste `post.html` into Blogger in HTML view, using the title, labels, search description and permalink above.
3. Upload `assets/music/de-n-lei/cover.png` in place of `REPLACE-WITH-UPLOADED-de-n-lei-cover.png`. Keep the image's alt text.
4. Preview, then publish the article. Replace `[PUBLISHED_POST_URL]` in `share.md` before sharing.
