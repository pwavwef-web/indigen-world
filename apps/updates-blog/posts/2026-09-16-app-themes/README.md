# Your app, in your colours (Indigen World 0.1.22)

Update post for the Android release **0.1.22 (31)**. The release note is `docs/product/releases/0.1.22+31.md`.

| Field | Value |
|---|---|
| Title | Your app, in your colours: a new blue, Heritage Green back for everyone, and four themes for supporters in Indigen World 0.1.22 |
| Topic | The app moves to the websites' navy and blue. Themes become a choice in Settings: Indigen Blue and Heritage Green are free; Tiébélé, Kente Gold, Harmattan Dusk and Volta Aurora come with Indigen Patron and Indigen Creator. Themes reach every screen, including Kawuri and dark mode. Contributed expressions show whole in the dictionary. |
| Labels | `Release`, `Feature`, `Mobile app`, `Community`, in that order (related posts follow the first label) |
| Search description | Indigen World 0.1.22: a new blue look, Heritage Green back for everyone, and four new colour themes for Patron and Studio members. (130 characters) |
| Permalink (custom) | `app-themes-heritage-green` |
| Reading time | about 6 minutes |
| Cover | `cover.png` (1200×630) |

## Images

Upload them in this order. The first image is the share card.

| # | File | Size | What it shows | Placeholder in `post.html` |
|---|---|---|---|---|
| 1 | `cover.png` | 1200×630 | Learn in Heritage Green, Kente Gold (dark) and Volta Aurora | `REPLACE-WITH-UPLOADED-cover.png` |
| 2 | `images/six-themes.jpg` | 1600×900 | The Learn tab in all six themes | `REPLACE-WITH-UPLOADED-six-themes.jpg` |
| 3 | `images/heritage-green.jpg` | 1600×1150 | Learn in Heritage Green, light and dark | `REPLACE-WITH-UPLOADED-heritage-green.jpg` |
| 4 | `images/theme-picker.jpg` | 1600×1150 | Settings → Theme for a guest, and the locked Kente Gold preview | `REPLACE-WITH-UPLOADED-theme-picker.jpg` |
| 5 | `images/supporter-themes-at-night.jpg` | 1600×1150 | Kente Gold and Volta Aurora at night, and the picker for a Patron | `REPLACE-WITH-UPLOADED-supporter-themes-at-night.jpg` |
| 6 | `images/kawuri-in-every-theme.jpg` | 1600×1150 | Kawuri in Heritage Green, Tiébélé and Volta Aurora | `REPLACE-WITH-UPLOADED-kawuri-in-every-theme.jpg` |

Every image already has alt text and a caption in `post.html`.

**Where the pictures come from.**

- **App screens:** rendered from the 0.1.22 Flutter code with the render check at 1170×2532. See `screens/`.
  - Learn uses a sample lesson ("Practice a conversation", four questions) and the dictionary word lamboro.
  - A signed-in Patron is simulated for the supporter themes. The picker's locked screens use a signed-out guest.
  - The course illustration is the approved AI illustration already shipped in 0.1.21.
  - Text is drawn in Roboto. The app uses Noto Sans, so letter shapes differ slightly from a phone.
- **Regenerating the images:** re-render with `node apps/updates-blog/posts/2026-09-16-app-themes/mockups/render.mjs`. It needs Google Chrome installed.

## Before publishing

**Publish only after 0.1.22 is live on Google Play.** The post says "Shipped" and "Update from Google Play", which is only true once the rollout has started.

**Already live on the backend:**
- The `premiumThemes` benefit for Patron and Creator. The app also unlocks the themes from the membership tier directly, so this is not required for them to work.
- The contributor-portal functions. The post does not mention those.

**Nothing changes for older apps.** Themes, the blue look and the expression fix all arrive with 0.1.22.

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

**Formatting.** The callout classes (`iw-lede`, `iw-ship`, `iw-tip`, `iw-note`) come from the Updates theme. They render as plain blocks until that theme is uploaded. The post has 13 `h2` and `h3` headings, so the table of contents builds itself.
