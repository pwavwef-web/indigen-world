# A new home for learning Kasem (Indigen World 0.1.21)

Update post for the Android release **0.1.21 (30)**, release note `docs/product/releases/0.1.21+30.md`.

| Field | Value |
|---|---|
| Title | A new home for learning Kasem: today's lesson, quick practice and a Kawuri that knows your lesson in Indigen World 0.1.21 |
| Topic | The Learn tab becomes a dashboard: resumable lessons, Review, Listen and Speak practice, the word of the day, a weekly streak, the course outline and Kawuri with learning context, plus Kawuri videos with sound |
| Labels | `Release`, `Feature`, `Mobile app`, `Language` (in that order: related posts follow the first label) |
| Search description | Indigen World 0.1.21: a new Learn tab that resumes your Kasem lesson, adds review, listening and speaking practice, and gives Kawuri videos sound. (149 characters) |
| Permalink (custom) | `learn-kasem-new-home` |
| Reading time | about 9 minutes |
| Cover | `cover.png` (1200×630) |

## Images

Upload them in this order. The first image is the share card.

| # | File | Size | What it shows | Placeholder in `post.html` |
|---|---|---|---|---|
| 1 | `cover.png` | 1200×630 | The Learn tab and the course outline in two phones, with the lesson illustration | `REPLACE-WITH-UPLOADED-cover.png` |
| 2 | `images/learn-dashboard.jpg` | 1600×1600 | The Learn tab, top to the week card | `REPLACE-WITH-UPLOADED-learn-dashboard.jpg` |
| 3 | `images/practice-speak-and-review.jpg` | 1600×1150 | Speak, and a Review words card | `REPLACE-WITH-UPLOADED-practice-speak-and-review.jpg` |
| 4 | `images/explore-and-course.jpg` | 1600×1150 | Explore next, and the Kasem course outline | `REPLACE-WITH-UPLOADED-explore-and-course.jpg` |
| 5 | `images/course-illustrations.jpg` | 1600×900 | The four AI course illustrations | `REPLACE-WITH-UPLOADED-course-illustrations.jpg` |
| 6 | `images/kawuri-sound-and-learning.jpg` | 1600×1150 | Kawuri's Sound switch, and Kawuri opened from a lesson | `REPLACE-WITH-UPLOADED-kawuri-sound-and-learning.jpg` |

Every image already has alt text and a caption in `post.html`.

**Where the pictures come from.**

- **App screens:** rendered from the 0.1.21 Flutter code with the render check at 1170×2532. See `screens/`. They use a sample lesson ("Practice a conversation", 3 of 4 activities) and a real dictionary word (lamboro, Defassa waterbuck). The bundled preview course in the app has one question per lesson, so a real phone shows "0 of 1 activities" until published lessons with more questions exist.
- **Illustrations:** the four pictures in `screens/*.jpg` are the AI-generated course illustrations shipped in the app (Nano Banana Pro for the lesson picture, Nano Banana 2 for the unit cards, on Vertex AI, 2026-09-14). They are labelled AI illustrations in the post and in the app.
- **Regenerating the images:** re-render with `node apps/updates-blog/posts/2026-09-14-learn-dashboard/mockups/render.mjs`. It needs Google Chrome installed.

## Before publishing

**Publish only after 0.1.21 is live on Google Play.** On 2026-09-14 the backend was deployed (functions, Firestore rules and indexes, Storage rules, admin console) and the AAB was built but not uploaded. The post says "Shipped" and "Update from Google Play", which is only true once the rollout has started.

**Two things are live before the app update.**

- Kawuri's children rule applies to every app version now, including 0.1.20, because the check runs on the server.
- The admin desks are live.

The Sound switch only appears in 0.1.21. Older apps keep making silent videos.

## Publishing in Blogger

1. Go to **Posts → New post** and enter the title.
2. Switch to **HTML view** and paste all of `post.html`.
3. Switch to **Compose view**. For each broken image, in order:
   - click it and delete it
   - use **Insert image → Upload from computer** to add the file from the table above, in the same place
   - keep the cover as the first image
4. Back in **HTML view**, check each new `<img>` still has its `alt` text. Blogger sometimes drops it when an image is replaced; copy it back from the original `post.html` if so. The `<figcaption>` lines stay as they are.
5. In **Post settings**:
   - add the labels in the order given
   - add the search description
   - under **Permalink**, choose Custom and enter the permalink above
6. **Preview**, then **Publish**.

**Formatting.** The callout classes (`iw-lede`, `iw-ship`, `iw-tip`, `iw-note`, `iw-warn`) come from the Updates theme. They render as plain blocks until that theme is uploaded. The post has 16 `h2` and `h3` headings, so the table of contents builds itself.
