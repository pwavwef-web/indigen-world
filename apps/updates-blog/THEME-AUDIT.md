# Blog theme audit — 11 October 2026

Audit of the live blog (`updates.indigenworld.com`, homepage and two posts fetched
and screenshotted headless at 1366 px and 390 px, light and dark) against the
editorial standard of The Pwavwe Papers theme. 29 changes, in
`theme/indigen-world-updates.xml` unless noted. The theme has **not** been uploaded
to Blogger; see "Scope" below.

## Defects found on the live blog

| # | Finding | Change |
|---|---|---|
| 1 | Every post showed its cover twice: the theme's `.iw-cover` (from `featuredImage`) and the same image at the top of the body, which release posts keep so Blogger uses it as the share card. | `has-cover` class on the article; CSS hides the body's first-image wrapper before paint (also through the `<article>` wrapper); the script removes the first body image when its Blogger image key matches the cover, keeps text-bearing paragraphs, and moves a figure caption onto the cover. |
| 2 | A Featured Post gadget retained by Blogger rendered the newest cover a third time under the homepage grid (hidden only by late JS). | `.iw-layout--index:has(.iw-card) #FeaturedPost1` hides it before first paint; README tells the owner to remove it in Layout. |
| 3 | Covers, cards and the lead card cropped 1200×630 art to 16:9, cutting off the headline inside the art. The lead card stretched it to the text height. | All `featuredImage` crops use `1200:630`; card media is `aspect-ratio:40/21`; the article cover is resized without a crop; the lead cover sits inset at full shape. |
| 4 | Paragraphs had zero spacing: posts wrap the body in one `<article>` and the rhythm rule only targeted direct children. | Rhythm reaches through a single `article`/`div` wrapper (19.6 px measured, was 0). |
| 5 | `snippet()` cut inside `<em>` (orthography-book card); the open tag was re-opened by the parser in every later element, italicising the sidebar and footer. | Snippets render inside a `<template>` (a parsing boundary) and are copied as plain text. |
| 6 | Bylines printed the Blogger profile display name, which belongs to another blog. | Byline, author box and JSON-LD author are the Indigen World organisation. |
| 7 | Archive entries read "October27": Blogger emits the count with no space, and the month had no year. | Count styled as a pill; `monthPattern` is `MMMM yyyy`. |
| 8 | Older-posts pages are search views with no query and showed an empty `“”` title. | They get "Earlier updates"; label/archive views get a one-line description. |

## Editorial upgrade

| # | Change |
|---|---|
| 9 | Noto Serif Display for hero, view, card, article, section and prose `h2`/`h3` headlines, exposed as a Theme Designer variable. Its latin-ext subset covers Kasem's IPA letters and tone marks. |
| 10 | Homepage masthead: a purpose headline instead of repeating the header's blog title, an accent rule, the search-description lede, and a three-line rail saying what posts cover. Staggered entrance animation that respects reduced motion. |
| 11 | "Latest updates" section bar above the grid; the hero button targets it. |
| 12 | Label, archive and search sub-mastheads in the display face, with "Filed under / From the archive / Search results" eyebrows and a result count for searches. |
| 13 | Article header: a kicker of at most three ranked topics in place of up to seven chips; a 4rem display title; the post's search description as a summary. |
| 14 | Cover slightly wider than the reading column on desktop, with a caption slot. |
| 15 | Card labels ranked: product areas (`AREAS` list) first, two per card, instead of the first two alphabetically. |
| 16 | Sidebar topics trimmed from 60+ chips to the twelve busiest, with a "Show all N topics" toggle. |
| 17 | Below 1180 px the contents fold into one "On this page · N sections" line, closing again after a jump. The cover leads straight into the prose. |
| 18 | Named share buttons (X, LinkedIn, WhatsApp, Facebook, Copy link, More). "Copied" feedback is announced; a fallback covers in-app browsers without the async clipboard. The share title uses the post title, not the document title. |
| 19 | "Follow what we ship next" card with RSS and website links after the author box. |
| 20 | Related updates as three cover cards (1200:630 thumbnails from the feed) chosen by the top-ranked topic, which the heading names. |
| 21 | Comments load on request behind a gate. Scripts replay in order so the Blogger iframe works; `#c…`/`#comments` links open it automatically. |
| 22 | `Ctrl`/`⌘`+`K` and `/` open search. |
| 23 | 404 view with an eyebrow, display headline and its own search box. |
| 24 | Blockquotes as display-face pull quotes. |
| 25 | Prose images carry a tinted background, so a lazy image still loading reads as a placeholder rather than a white hole. |
| 26 | Header strapline fixed to "Release notes & field notes". The blog description no longer gets squeezed into the header bar. The follow card is excluded from print. |

## Tooling

| # | Change |
|---|---|
| 27 | `scripts/validate-theme.mjs`: seven new checks. Six cover the regressions: 1200:630 crops, contained snippets, no profile byline, body cover hidden, Featured Post hidden, and rhythm through the wrapper. The seventh checks that both theme scripts compile. All six regression checks fail on the previous theme. Total: 28 checks. |
| 28 | `scripts/build-preview.mjs` reproduces the live defects: a duplicate body cover inside `<article>`, an `<em>`-cut snippet, the Featured Post gadget, 35 labels, Blogger archive markup and multi-label posts. Plates are now 1200×630 with headline text, so crops show. |
| 29 | README and the release post `posts/2026-10-11-updates-blog-redesign/` document the changes. |

## Verification

- `npm run build:updates-blog-preview`: all 28 validator checks passed and six previews were generated.
- Headless Chrome on the previews: one visible cover; the Featured Post gadget computed `display:none`; no `em` leaks and the sidebar and footer computed `font-style:normal`; card chips were product areas first; 23 of 35 topics were folded; cover ratio was 1.906; no horizontal overflow at 1366 or 390 px in light or dark; the mobile contents started folded and sat before the prose; comments mounted after opening; and the BlogPosting and BreadcrumbList JSON-LD were present.
- The real post `2026-10-10-easier-kasem-discovery` was rendered with its real images. Its body cover was removed and all four screenshot figures were kept. A variant with Blogger-style URLs and a captioned cover figure moved the caption onto the theme cover. The cover matcher was unit-checked on `img/b/R29vZ2xl/<key>/…` and `img/a/<key>=s…` URLs, with resized variants matching and different images not matching.

## Install fix (same day)

Blogger rejected the first upload with `InvalidVariableException`. A CSS comment
in the skin mentioned `<article>` and `<div>`, and Blogger reads tag-like text
anywhere in `b:skin` into its SkinVariables XML. The comment no longer uses angle
brackets. A 29th validator check fails on any tag-like text after the variable
block (it was confirmed to fail on the broken version).

## Scope

Blogger's template engine, the hosted comment iframe, `resizeImage` output and
widget data (`data:post.allowComments`, `data:blog.metaDescription` on item pages)
can only be confirmed after the theme is pasted into Blogger. The release post's
README lists the four checks to make right after installing.

---

# Blog theme audit — 5 September 2026

The local Blogger theme has been corrected and its previews rebuilt. The
uploadable file is `theme/indigen-world-updates.xml`.

| Area | Finding and correction |
|---|---|
| Brand palette | Gold, deepest indigo, green and cream differed from the shared brand defaults. They now match `packages/design-tokens/colors.json`. Reading surfaces use the ecosystem light/dark palette, with cream retained for light callouts. |
| Device dark mode | Article links, code, note labels, card hover colours, engineering dots and sidebar search had overrides that only matched a manually selected dark theme. Components now consume semantic tokens defined identically for both dark-mode paths. |
| Theme toggle state | Changing the device appearance did not refresh the button's pressed state or action title. Both now follow device changes while respecting a saved preference. |
| Small text | Dates, captions, widget headings, author details and topic counts were too faint on some surfaces. Muted text is darker in light mode and lighter in dark mode; topic counts no longer use reduced opacity. |
| Semantic accents | Notes, warnings, success labels, inline code and language/engineering dots now have separate colours suitable for their surfaces. Brand decoration no longer determines small-text contrast. |
| Focus and inputs | Gold focus rings had weak contrast on light surfaces. Light surfaces use blue focus rings; dark brand panels use pale gold. Search and archive controls have stronger boundaries and explicit placeholder colours. |
| Topic chips | Sidebar link styles overrode chip text colours. Sidebar and article chips now use the same treatment. |
| Article code | Explicit dark-mode inline-code styling overrode block-code colours. Code blocks now keep their own foreground; the always-visible copy button has reserved space and works on touch screens. Copying a bare `pre` also excludes the button label. |
| Callouts and prose | Nested bold text could accidentally become an uppercase callout label. Labels now require a direct child; nested content gets spacing. Lower-level headings, definitions and table captions have explicit styles. |
| Share controls | Dark-mode copied-state green did not suit a white icon. Success feedback has a separate background; hover colours follow the active scheme and the row can wrap. |
| Image placeholders | Related-post logos used pale strokes on a pale tile. They now sit on the same dark brand background as other logo placeholders. |
| Comment threads | Styling both the outer comment and its inner block produced duplicate cards. Each threaded comment now has one card, with nested replies inside it. |
| Header and hero | The mobile masthead could force controls onto another row; long descriptions could widen it. The masthead can now shrink, with compact text on small screens. The hero aligns with the main content gutter. |
| Reading layout | Flexible grid children can shrink around code/tables without widening the page. The contents move before the prose on smaller screens and back into the desktop rail, preserving keyboard order. Long desktop contents scroll within the viewport. |
| Sticky search | Opening search while scrolled could reveal the panel above the viewport. Search now stays below the measured header height, including when a mobile menu or custom title changes that height. |
| Navigation | A matching path on another website could be marked current. Current-page detection now checks origin and sets `aria-current`. |
| Hidden states | Components with their own display rules could defeat the HTML `hidden` attribute. Hidden states now have one consistent rule. |
| Print | Dark-mode tokens could leave pale article text on white paper. Print overrides both automatic and explicit themes, expands the article column, wraps code/tables, and removes screen-only controls. |
| Preview coverage | The preview lacked the masthead class and realistic nested comments. It now mirrors those structures, includes all callouts and captions, reuses the theme's initialization script, creates its output directory, and generates label/archive/search/empty views. |
| Documentation | Corrected the description of Noto Serif and documented the actual UI font sizing, responsive contents and contrast checks. |

Verification completed:

- All 21 theme-validator checks pass, including brand alignment, equality of
  automatic/explicit dark palettes, and 64 colour pairings per scheme.
  Text pairings meet 4.5:1; focus/control pairings meet 3:1.
- The XML parses successfully and both theme JavaScript blocks compile.
- Homepage and article layouts were checked at 320, 390, 640, 980, 1040,
  1280 and 1440 CSS pixels in light and dark appearances, with no page overflow.
- Rendered steady-state text checks found no failures on the homepage,
  article, label, archive, search or empty previews in either appearance.
  These checks composite flat backgrounds; decorative gradients and images
  were inspected visually rather than treated as uniform backgrounds.
- Menu open/close and Escape handling, search positioning, focus return,
  keyboard focus rings, copy feedback and persisted theme toggles were checked.
- Print emulation from dark mode renders black prose/code on white paper;
  automatic dark mode and a saved dark preference were both checked.

This is a local theme audit. Preview HTML does not execute Blogger's template
engine or its hosted comment-editor iframe, and arbitrary post-level inline
styles and custom Theme Designer colours require their own checks. The theme
has not been uploaded to Blogger during this audit.
