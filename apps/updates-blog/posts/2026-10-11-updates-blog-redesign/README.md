# A cleaner place to read our updates

**Blogger:** Published on Indigen World Updates on 29 October 2026: https://updates.indigenworld.com/2026/10/blog-post_29.html

Status: **Theme ready and locally verified on October 11, 2026. Seen live on updates.indigenworld.com on October 29, 2026 (serif headlines, named share buttons, Indigen World byline, contents rail). Article published October 29, 2026; its opening line was updated to say the theme is live.**

- Title: A cleaner place to read our updates
- Labels: Indigen World, Design, Website, Accessibility
- Search description: Indigen World Updates has a redesigned theme: one uncropped cover per post, readable spacing, clearer topics, named share buttons and lighter pages.
- Suggested permalink: updates-blog-redesign
- Article: `post.html`
- Sharing copy: `share.md`

## What changed (implemented)

The theme is `apps/updates-blog/theme/indigen-world-updates.xml`. The full audit, all 26 changes and their verification are in [THEME-AUDIT.md](../../THEME-AUDIT.md).

Defects found on the live blog (`updates.indigenworld.com`, fetched October 11, 2026):

- Each post rendered its cover twice: the theme's `.iw-cover` and the same image at the top of the post body. On the homepage, a retained Featured Post gadget rendered the newest cover again.
- Covers and cards were cropped 16:9 from 1200×630 art, which cut off the headline text in the cover.
- Release posts wrap their body in `<article>`, so the theme's paragraph spacing never applied.
- A card snippet cut inside `<em>` left the tag open; the browser re-opened it in later elements and italicised the sidebar and footer.
- Bylines showed the Blogger profile display name, which belongs to a different blog.
- More than 60 sidebar labels, up to seven chips above a title, alphabetical card chips, and archive entries such as "October27".

## Release and availability

At preparation time nothing was live. The theme reaches readers only after it is pasted into **Blogger → Theme → Edit HTML**. Do this from the [theme README](../../README.md#install). Then remove the retained **Featured Post** gadget in **Layout**. The CSS already hides it whenever posts render. Existing posts need no edits. Keeping the cover as the first image in a post remains correct, because Blogger uses it for the share card and the theme hides the duplicate.

The theme has not been uploaded during this work. Blogger's own template engine, comment iframe and hosted image proxy can only be confirmed after installation. Check these first:

1. Open a recent post. Confirm that the cover appears once and that the paragraphs are spaced.
2. Open **Read or leave a comment**. Confirm the comment box accepts typing.
3. Check that homepage cards show snippets and that the sidebar and footer text is upright, not italic.
4. Open an archive month and an older-posts page.

## Verification

- `npm run validate:updates-blog`: all 28 checks pass. Seven are new regression checks for the defects above. They fail on the previous theme (six fail). The seventh checks that both theme scripts compile.
- `npm run build:updates-blog-preview` regenerates all six previews. The preview reproduces the live defects: a duplicate body cover, a snippet cut inside `<em>`, the Featured Post gadget, 35 labels and Blogger's archive markup.
- Headless Chrome measurements at 1366 px and 390 px, light and dark: one visible cover, 19.6 px paragraph spacing (was 0), no italic leak, cover ratio 1.906 (1200:630), no horizontal overflow, comments load when opened, and JSON-LD contains BlogPosting and BreadcrumbList.
- A real post (`2026-10-10-easier-kasem-discovery/post.html`, with its real images) was rendered through the new theme. The body cover was removed, all four screenshot figures were kept, and a captioned-cover variant moved its caption onto the theme cover.

## Images and credits

Screenshots are actual renders of the new theme in a local preview (headless Chrome). They are not edited.

- `screens/article-desktop.png`: the real post "A clearer way to learn and explore Kasem", with real images, at 1440×900
- `screens/article-mobile-dark.png`: the same post at 390×844, dark mode
- `screens/home-desktop.png`: the generated homepage preview at 1440×900. Cards below the fold use sample posts.

Branded art: `images/cover.png`, `images/article-desktop.jpg`, `images/article-mobile-dark.jpg`, `images/home-desktop.jpg`, rendered with `node apps/updates-blog/scripts/render-post-art.mjs 2026-10-11-updates-blog-redesign` from `art.json`. The frames, backdrop and titles are illustration. The screen contents are unaltered renders. Interface credit: Indigen World.

## Blogger publishing handoff

1. Install the theme first. This post describes it as available.
2. Create the article using the title, labels, description and permalink above.
3. Upload `cover.png` first (it becomes the card/share image), then the three framed JPGs.
4. Paste `post.html` into the HTML editor and replace each relative `src` with its Blogger-hosted URL, keeping the alt text and captions.
5. If the theme is live when you publish, update the opening paragraph and the Availability note so they no longer say it is not live. Preview the post on desktop and mobile.
6. Publish when ready, then replace `[PUBLISHED ARTICLE URL]` in `share.md`.

Preparing this post does not publish it or send any messages. Publication and sharing remain with Chinedum.
