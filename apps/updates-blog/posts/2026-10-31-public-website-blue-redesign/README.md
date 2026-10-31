# The public website moves to blue, with Kassena photographs

**Blogger:** Not published.

- **Title:** Blue skies over Kassena country: the Indigen World website redesign
- **Topic:** Public website (`apps/website`) redesign: the cream/terracotta palette and AI-illustrated banner (added 12–13 October) replaced by a deep-blue palette with one sun-yellow accent; the header carousel on every public page now shows five real, credited Wikimedia Commons photographs of Kassena places (Tiébélé, Paga, Navrongo); homepage sections redesigned (dark word card, night map band, photographic stories, royal-blue community band); Sora display type; standalone grammar and spelling guides restyled.
- **Labels:** Website, Design, Feature, Kasem, Indigen World
- **Search description:** The Indigen World website moves to a bold blue design, and the photographs at the top of every page now show real Kassena places: Tiébélé, Paga and Navrongo.
- **Status (31 October 2026):** **Committed to `main` locally (the commit that adds this folder); not pushed, not deployed.** Verified on the local build: `npm run check --workspace @indigen-world/website` (typecheck, site/progress validators, unit tests, production build) passed; `scripts/check-motion.mjs` passed against `vite preview` (27 routes at 1440 and 360 px, banner overlap and reachable controls at 320/999/1000/1920 px, playback/pause/reduced-motion/fallback); `scripts/check-website-refresh.mjs` passed (12 routes at 1440/768/390/320 px, Unicode search, mobile navigation, dictionary flows). Not checked: Safari, Firefox, real phones. Hosting deploy needs a clean tree pushed to `origin/main` first. The post says "coming soon"; update its note and `share.md` once the site is live.
- **Publishing owner:** Chinedum. Preparing this post does not authorize publishing or sharing it.

## What changed (code)

| Change | Where |
| --- | --- |
| Single blue palette in tokens; legacy names remapped (`--terracotta` = action blue, `--gold` = sun) so older stylesheets follow; the brown `:root` overrides in `website-refresh.css` and the duplicate palette in `comitia-theme.css` removed | `apps/website/src/styles/tokens.css`, `website-refresh.css`, `comitia-theme.css` |
| Andy's cut-paper scene layer and its assets removed (`culture-scene.css`, `images/culture/original/`), plus three non-Kasena craft photographs (kente, Bolgatanga baskets) | `apps/website/public/` |
| Header carousel rebuilt: five real photographs with srcset, left-weighted indigo veil, labelled progress segments, credit links (photographer, licence, source), drawn arrow icons, Kassena chevron band; each route opens on its own photograph; existing class hooks kept for the motion tests | `src/components/HomeHero.tsx`, `public/culture-banner.css`, `public/culture-photos.js` (+ `.d.ts`) |
| Photographs: 8 Commons files at 960/1600/2400 px WebP, with manifest and limits | `public/images/culture/photos/` |
| Homepage: kicker removed; bento discovery with a dark word card; night map band (`africa-ghana-night.svg`); story cards with credited photographs, no step numbers; royal-blue community band | `src/pages/HomePage.tsx`, `src/components/HomeDiscovery.tsx`, `HomeCultureMap.tsx`, `HomeScrollStories.tsx`, `src/styles/home.css` |
| Global finish: Sora display type (Kasem stays in Noto Sans via `[lang="xsm"]`), section rhythm, selection/scrollbar/focus colours, night-glass header with a sun CTA, pill buttons, footer chevron band; section eyebrows no longer rendered by `SectionHeading` | `src/styles/indigo.css`, `src/components/SectionHeading.tsx`, `src/main.tsx` |
| Warm accents in page stylesheets remapped to blue (gold/terracotta rgba values, privacy page cream); "in development" status keeps an amber semantic badge | `src/styles/*.css` |
| Standalone guides: same photographs and credits, blue override of the generators' inline styles (website copies only) | `public/guide-banner.js`, `public/culture-banner.css` |
| Design system record | `apps/website/DESIGN.md` |

## Images

`screens/` holds the unaltered screenshots; `images/` holds the branded cover
and framed figures that `post.html` uses (frames, backgrounds and titles are
illustration). Regenerate with:

```text
node apps/updates-blog/scripts/render-post-art.mjs 2026-10-31-public-website-blue-redesign
```

- `home-hero.png`, `hero-paga.png`, `phone-walls.png`, `phone-home.png`,
  `discovery.png`, `map-band.png`, `stories.png`, `community.png`,
  `contribute.png`, `privacy.png`, `grammar-guide.png` — actual screenshots of
  the local development build (Vite on port 5180, headless Chrome) on
  31 October 2026. The dictionary word and expression in `discovery.png` come
  from the public production collections.
- `before-home.png` — the homepage before this change, captured from the same
  local build at the start of the session.

### Credits

Photographs visible in the screenshots, all via Wikimedia Commons:

- Dancers in Kassena country, Tiébélé — Zaongo Christian Marie Michel, CC BY-SA 4.0
- Painted walls, Tiébélé — Alexander Leisser, CC BY-SA 4.0 (two files)
- Crocodile pond at Paga — Knowledge and philosophy, CC BY-SA 4.0
- Our Lady of Seven Sorrows Basilica, Navrongo — Mwintirew, CC BY-SA 4.0
- Traditional house decoration, Tiébélé — c.hug, CC BY-SA 2.0
- Round houses, Tiébélé — WILLAV-FR, CC BY-SA 4.0
- Wikipedia edit-a-thon, UDS Navrongo — Amuzujoe, CC BY-SA 4.0

Full sources and limits: `apps/website/public/images/culture/photos/README.md`.
The chevron band is an original pattern inspired by Kassena wall painting, not a
copy of a specific wall. Map data: Natural Earth (public domain). The
before-image's illustrated characters are earlier AI-generated Indigen World
artwork. The Indigen World mark is the existing repository logo.

## Blogger handoff

1. Wait until the redesign is live on indigenworld.com, then change the
   "Coming soon" note in `post.html` to the live date.
2. Upload every image in `images/` to Blogger, keep the captions and alt text
   (they carry the photo credits), and replace each `images/...` path with
   Blogger's image URL.
3. Paste `post.html` in HTML mode; set the title, labels and search
   description above; preview on desktop and mobile.
4. After publishing, put the article URL into `share.md`. Sharing is a separate
   step for Chinedum.
