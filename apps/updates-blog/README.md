# Indigen World Updates — Blogger theme

A custom Blogger theme for **Indigen World Updates**, the blog where we publish
release notes, feature updates and notes from the field across the ecosystem.

It is a single, self-contained XML file you paste into Blogger. It wears the
public website's theme — deep navy and electric blue with a cyan accent, glass
header, blue-white ground — taken from
[`apps/website/src/styles/comitia-theme.css`](../website/src/styles/comitia-theme.css),
so the blog reads as part of indigenworld.com. The validator fails if the
theme's brand colours drift from that file.

```text
apps/updates-blog/
├── theme/indigen-world-updates.xml   # ← the file you paste into Blogger
├── preview/                          # generated static preview (not deployed)
├── scripts/
│   ├── validate-theme.mjs            # catches what Blogger rejects on upload
│   └── build-preview.mjs             # regenerates the preview from the theme
├── assets/                           # favicon, share card and touch icon
└── README.md
```

**Always run the validator before pasting the theme into Blogger:**

```bash
npm run validate:updates-blog
```

## Install

1. Open **[Blogger](https://www.blogger.com/) → your blog → Theme**.
2. Open the **⋮** menu next to *Customise* and choose **Backup**. Keep the file —
   this is your rollback.
3. From the same **⋮** menu choose **Restore**, then **Upload**, and pick
   [`theme/indigen-world-updates.xml`](theme/indigen-world-updates.xml).

   To paste instead of uploading: **Edit HTML**, select all (`Ctrl`/`Cmd`+`A`),
   paste the whole file over it, then **Save**.
4. Go to **Settings** and set the **Blog title** (shown in the header and hero)
   and the **Blog description**, then turn on **Meta tags → Enable search
   description** and write one. The description becomes the hero subtitle and
   the default social-share text. Under **Posts**, set **Max posts shown on main
   page** to **7**; Blogger must supply seven posts before the theme can render
   the seven-update homepage.
5. Go to **Layout** and check the pre-built widgets. Everything is already
   placed; you only need to edit the text.

The theme carries a full set of widgets on install — navigation, search, an
about box, topics, most-read, archive, and three footer columns — so the blog
looks finished from the first post.

The main **Blog Posts** widget renders the homepage cards. If Blogger retains
an old **Featured Post** gadget during a restore, the theme hides it when the
main feed succeeds. If Blogger rejects the feed markup, that gadget instead
becomes a large-image fallback card rather than a long excerpt with a 72px
thumbnail.

## What it gives you

**Reading**

- Editorial article layout with a 760px measure, Noto Serif body copy and a
  sticky table of contents built from the post's own `h2`/`h3` headings.
- Estimated reading time and a reading-progress bar.
- Styled callouts, code blocks with a copy button, scrollable tables, figures,
  blockquotes and a woven horizontal rule.

**Index**

- Hero masthead in the website's home-hero style: navy into electric blue with
  a cyan glow and a faint dot grid, sitting under a floating glass header.
- Card grid, with the most recent update promoted to a full-width lead card.
- A homepage showing the seven newest updates, led by the latest post and its
  featured image; label, search and archive views show all matching cards.
- Posts with no image get a blue brand placeholder rather than a blank box.

**Throughout**

- Light and dark, following the device setting with a manual toggle that
  persists. The website has no dark mode, so dark uses the navy of its hero and
  footer, with the blues lifted so links and accents keep their contrast.
- Colour-coded topic chips (see below).
- A header filter populated from Blogger labels, so visitors can jump straight
  to updates for the mobile app, website, dictionary or any label you publish.
- Related posts pulled from the blog's own feed by the post's first label.
- Share row (X, LinkedIn, WhatsApp, copy link, and the native share sheet where
  the device offers one). From 1180 CSS pixels it becomes a sticky left rail while
  the table of contents stays on the right; on smaller screens both return to
  the article flow.
- Open Graph and Twitter card tags — with a real 1200×630 PNG fallback, and
  no duplicates of the tags Blogger writes for itself.
- Structured data: a site-level `WebSite` (with an on-site `SearchAction`) and
  `Organization`, plus `BlogPosting` and `BreadcrumbList` per post, built at
  runtime through `JSON.stringify` so a title can never break the JSON.
- Skip link, visible focus rings that survive the search fields'
  `outline: none`, a menu that goes `inert` while collapsed, focus returned to
  where it came from when the search panel closes, `prefers-reduced-motion`
  support and a print stylesheet.
- Blogger's own navbar hidden, and the widgets Blogger adds by itself — Report
  Abuse and the profile box — claimed by the sidebar so they never appear
  unstyled under the post.

## Customising without editing the file

**Blogger → Theme → Customise → Advanced** exposes:

| Group | What it changes |
|---|---|
| Brand palette | Royal blue, Deep navy, Cyan accent, Soft blue, Electric blue, Green, Page ground, Blue mist |
| Typography | Interface font and article body font (family and size) |
| Layout | Page width, article column width, corner radius |

The article body defaults to **Noto Serif** — the serif sibling of the
brand typeface — because long-form reading benefits from it. To go all-sans,
set *Article body font* to Noto Sans in that panel; nothing else changes.

Dark-mode colours are fixed in the stylesheet rather than exposed as variables,
because they are contrast-tuned against the dark surfaces.

The default brand colours match the website theme. Semantic text, focus,
and control colours are tuned separately for contrast: small accent text and
links use a deeper blue (`#1f50d6`), and buttons with white labels use
`#2c66f5`, because the website's `#2f6bff` measures 4.49:1 against white,
just under AA. Cyan is decoration only. Changing a Theme Designer colour moves
the page away from the website; the validator only checks the defaults. The
interface font size also scales rem-based UI.

Internally the stylesheet keeps its original token names — `--gold` is the
cyan accent and `--terracotta` the electric blue — exactly as the website's
theme layer does, so the two files read the same way.

## Label conventions

Topic chips are colour-coded by label name, case-insensitively:

| Label | Dot colour |
|---|---|
| `Release`, `Releases`, `Shipped` | Green |
| `Feature`, `Features`, `Product` | Cyan |
| `Engineering`, `Platform` | Electric blue |
| `Community`, `Governance` | Amber |
| `Language`, `Venacula`, `Kasem` | Violet |
| `Mobile app` | Green |
| `Website` | Electric blue |
| `Dictionary` | Violet |
| `TribeStudio` | Cyan |
| anything else | Cyan |

The dot colours are the `--topic-*` tokens, with lifted values in dark.

To add your own, copy one of the `.iw-chip[data-label="..." i]` rules in the
`<b:skin>` block. The `i` flag makes the match case-insensitive, so `release`
and `Release` both work.

Related posts use the post's **first** label, so put the most specific topic
first when you tag a post.

## Writing posts

In the post editor's **HTML view**, these classes are available:

```html
<p class="iw-lede">A larger opening paragraph.</p>

<div class="iw-note"><strong>Note</strong>Context worth knowing.</div>
<div class="iw-tip"><strong>Tip</strong>Something that helps.</div>
<div class="iw-warn"><strong>Heads up</strong>Something to watch out for.</div>
<div class="iw-ship"><strong>Shipped</strong>What is live now.</div>

<span class="iw-kbd">Ctrl</span> + <span class="iw-kbd">K</span>

<div class="iw-cols">
  <div>Left column</div>
  <div>Right column</div>
</div>
```

The first `<strong>` in a callout becomes its uppercase label. Standard
elements — headings, lists, tables, `<pre><code>`, blockquotes, images —
are already styled; write them normally.

Headings become table-of-contents entries once a post has three or more.
The contents sit beside the article on wide screens and before the prose
on smaller screens, following the same order for keyboard navigation.

## Validating the theme

Blogger applies rules a plain XML parser does not, and rejects the whole upload
when one is broken. `scripts/validate-theme.mjs` checks for them:

| Check | Why it matters |
|---|---|
| Container rules | A `b:widget` may only contain `b:widget-settings` and `b:includable`. Anything else — including a `b:comment` used as a section divider — fails the upload with *"A widget can only contain b:includable elements"*. `b:section` may only contain `b:widget`. |
| Self-closed non-void HTML | Blogger serves the theme as HTML, where `<div/>` parses as an **open** div and swallows the rest of the page. |
| `b:include` resolution | Every include must name an includable you define, or one of Blogger's built-ins. |
| `$(...)` placement | Theme Designer substitution only happens inside `b:skin`. |
| Expression operators | Blogger uses `and` / `or` / `not`; `&&` and `\|\|` break the parse. |
| Named entities | XML without a DTD allows only `amp`, `lt`, `gt`, `quot`, `apos` — `&nbsp;` fails. |
| Widget attributes, unique ids | Blogger drops widgets that are incomplete or share an id. |
| Widget setting names | Blogger returns an HTTP 400 error when a known widget, such as `BlogArchive`, contains an unsupported setting name. |

```bash
npm run validate:updates-blog
```

It exits non-zero on failure, so it can gate a commit or CI step. The preview
build runs it first and refuses to generate from a broken theme.
It also checks that the brand defaults match the website theme, equality of system and explicit dark
palettes, and 64 text/control colour pairings per scheme (4.5:1 for normal
text; 3:1 for control boundaries and focus rings). These checks cover the
default palette, not arbitrary Theme Designer overrides or images.

## Preview

The preview pages are generated from the theme file itself, so they cannot
drift from what you paste into Blogger:

```bash
npm run build:updates-blog-preview
```

That writes `preview/index.html` (homepage), `preview/post.html` (article),
and `label.html`, `archive.html`, `search.html`, and `empty.html` fixtures.
Open them directly, or serve the folder if you want the JavaScript features to
behave exactly as they will live:

```bash
npx --yes serve apps/updates-blog/preview
```

The script pulls the CSS out of `<b:skin>`, resolves the Blogger
`$(variable)` substitutions to their declared defaults, and reuses the theme's
own runtime JavaScript. If you add a theme variable and forget to give it a
default, the build fails rather than emitting a broken preview.

The preview uses sample HTML around the theme's actual CSS and JavaScript;
it does not execute Blogger's template engine. The article includes all four
callouts, inline and block code, image captions, tables and nested comments.
See [THEME-AUDIT.md](THEME-AUDIT.md) for the theme audit and verification scope.

## Before you publish

Do these in order — the theme points at two files the website serves, so the
website has to go out first.

1. **Deploy the website.** [`assets/og-default.png`](assets/og-default.png) and
   [`assets/apple-touch-icon.png`](assets/apple-touch-icon.png) are copied into
   `apps/website/public/` as `og-image-updates.png` and
   `updates-apple-touch-icon.png`, which is where the theme's `og:image`
   fallback and `apple-touch-icon` point. Until `npm run build:website` and a
   hosting deploy have run, both URLs 404 and shared links have no card.
   Regenerate the PNGs from the SVGs if you change the artwork; they are the
   raster versions, because most social platforms do not render SVG.
2. **Write a search description.** **Settings → Meta tags → Enable search
   description.** Blogger emits the `description` and `og:description` tags from
   it; the theme only supplies a generic fallback when a view has none of its
   own, and deliberately does not repeat `og:url` or `og:title`, which Blogger
   already writes.
3. **Upload the theme** (see [Install](#install) above).
4. **Check the footer links.** They point at `indigenworld.com` routes and are
   editable in **Layout** without touching the theme.
5. **The copyright line** in the footer says "Indigen World" and picks up the
   year automatically.

### Post-upload checks

- No empty band above the header when signed in — Blogger's own navbar is
  hidden by the theme.
- No unstyled **Report Abuse** or **About Me** headings at the bottom of the
  reading column; both live in the sidebar, and the profile box is off by
  default.
- At 420px wide there is no horizontal scrollbar, and tabbing through the page
  with the menu closed never lands inside the nav.
- On a post, "More on this topic" rows show the title above the date, and every
  row is the same height whether or not the post has an image.
- `view-source:` on a post shows exactly one `og:title`, one `og:url` and one
  `og:description`, plus `twitter:image`.

## Notes on the implementation

- Blogger's own widget CSS is disabled (`b:css='false'`), so every rule in the
  file is ours.
- Layouts version 3 with widget version 2. Comments deliberately use Blogger's
  built-in markup, restyled with CSS, rather than a hand-written replacement —
  Blogger's threaded-comment JavaScript is intricate and replacing it is the
  most common way a custom theme breaks. The theme follows the blog's own
  setting: `threaded_comments` when threading is on, `comments` when it is not.
  Including the wrong one silently drops the reply UI.
- The logo is inline SVG rather than an uploaded header image, so it recolours
  with the theme. Swap the `<svg>` inside the `Header1` widget to use your own.
- Everything is vanilla JavaScript with no external dependencies. The only
  network request beyond Google Fonts is the related-posts feed lookup, which
  fails silently.
- All markup is XML-valid and every element is explicitly closed. If you edit
  the file, keep it that way — Blogger rejects the upload otherwise, and a
  self-closed `<div/>` will parse as an *open* div in the browser.
