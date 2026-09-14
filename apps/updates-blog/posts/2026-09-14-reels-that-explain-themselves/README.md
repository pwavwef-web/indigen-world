# Reels that explain themselves (Indigen World 0.1.19)

Update post for the Android release **0.1.19 (28)**, release note
`docs/product/releases/0.1.19+28.md`.

| Field | Value |
|---|---|
| Title | Reels that explain themselves: Indigen World 0.1.19 |
| Labels | `Release`, `Community` (in that order: related posts follow the first label) |
| Search description | Indigen World 0.1.19: make a reel in three steps with context and attribution, a new Explore, communities you can join and run, and Kawuri history. |
| Cover | `cover.png` (1200×630), drawn from `cover.svg` |

## Before publishing

**Publish only after 0.1.19 is live on Google Play.** On 2026-09-14 the AAB was
built but not uploaded. The post says "Shipped" and "Update from Google Play",
which is only true once the rollout has started.

The post deliberately does not link to community pages on indigenworld.com:
that website page is not deployed (its source is missing from the working tree
- see the release note's Deployment section).

## Publishing in Blogger

1. **Posts → New post**, enter the title.
2. Switch the editor to **HTML view** and paste all of `post.html`.
3. Switch to **Compose view**, click the broken image at the top, delete it, and
   use **Insert image → Upload from computer** to add `cover.png` in its place.
   Keep it as the first image: Blogger uses it as the post's share card.
4. In **Post settings**, add the labels and the search description above.
5. **Preview**, then **Publish**.

The classes in the HTML (`iw-lede`, `iw-ship`, `iw-tip`, `iw-note`, `iw-warn`)
come from the Updates theme. They render as plain paragraphs until the theme in
`apps/updates-blog/theme/` is uploaded.
