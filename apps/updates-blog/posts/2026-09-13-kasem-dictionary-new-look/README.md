# The Kasem Dictionary has a new look

Update post for the 2026-09-13 release of the Kasem Dictionary restyle
(deployed to `kasem-dictionary` hosting the same day).

| Field | Value |
|---|---|
| Title | The Kasem Dictionary has a new look |
| Labels | `Release`, `Kasem` (in that order: related posts follow the first label) |
| Search description | The Kasem Dictionary now matches indigenworld.com: the same reviewed words and search, in a new deep-blue design on every screen. |
| Cover | `cover.png` (1200×630), drawn from `cover.svg` |

## Before publishing

The post links to **https://www.venacula.com/**, the dictionary's canonical
address. On 2026-09-13 Firebase was still minting its certificate, so HTTPS on
that address did not answer yet. Open the link first; publish once it loads.

## Publishing in Blogger

1. **Posts → New post**, enter the title.
2. Switch the editor to **HTML view** and paste all of `post.html`.
3. Switch to **Compose view**, click the broken image at the top, delete it, and
   use **Insert image → Upload from computer** to add `cover.png` in its place.
   Keep it as the first image: Blogger uses it as the post's share card.
4. In **Post settings**, add the labels and the search description above.
5. **Preview**, then **Publish**.

The classes in the HTML (`iw-lede`, `iw-ship`, `iw-tip`, `iw-note`) come from the
Updates theme. They render as plain paragraphs until the new theme in
`apps/updates-blog/theme/` is uploaded.
