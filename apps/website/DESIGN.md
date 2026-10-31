# Public website design system: Indigo world

Adopted 31 October 2026 at the owner's request ("move to blue", culturally
relevant header images, "make the whole public site pop"). It replaces the
cream/terracotta paper look and the AI-illustrated banner of 12–13 October.
Labs (`src/features/labs/`) and the progress page keep their own designs.

## Idea

Deep indigo over Kassena country. Real photographs carry the culture, blue
carries the brand, and one warm sun accent (the sun in the logo) marks the
action on dark surfaces. The signature motif is a band of chevrons inspired by
the wall painting of Kassena compounds; it closes every page opening, the
homepage community band and the footer top. Use it only as a band, never as a
page texture.

## Colour

Palette lives only in `src/styles/tokens.css`. Do not redefine `:root` colours
in any later stylesheet; older files read the legacy names below.

| Role | Token | Value |
| --- | --- | --- |
| Night (footer, veils, deepest bands) | `--indigo-950` | `#06102b` |
| Deep (headings, dark cards) | `--indigo-900` | `#0b1f5c` |
| Royal (links and buttons on light) | `--indigo-700` = `--terracotta` | `#1747d1` |
| Electric (accents on dark) | `--blue-500` | `#3d7bff` |
| Sky (text accents on dark) | `--sky` / `--sky-soft` | `#a9c8ff` / `#dbe7ff` |
| Sun (primary action on dark, logo sun, selection) | `--gold` | `#ffc23d` |
| Canvas / mist / surface | `--cream` / `--sand` / `--white` | `#f2f6ff` / `#e3ebfd` / `#fff` |
| Ink / muted | `--ink` / `--muted` | `#0a1838` / `#47557a` |

Rules: royal-blue buttons on light surfaces, sun buttons with night text on dark
surfaces; secondary text on dark uses sky tints, never grey. Amber is reserved
for the "in development" status. All text pairs meet WCAG AA (body ≥ 4.5:1).
The Blogger theme's `brand.*` defaults mirror these tokens and
`npm run validate:updates-blog` checks them, so change this file first.

## Type

- Display: Sora (variable, self-hosted via `@fontsource-variable/sora`),
  800 for h1, 750 for h2, tracking −0.03 to −0.035em.
- Body: Noto Sans (variable). Kasem text (`lang="xsm"`) always uses Noto Sans,
  which carries ɛ ɔ ɩ ʋ ŋ and tone marks; Sora does not.
- Section headings carry their own weight: `SectionHeading` no longer renders
  an eyebrow above the title. Card-level labels are sentence case, not tracked
  capitals.

## Page openings (`CultureHero`)

`src/components/HomeHero.tsx` + `public/culture-banner.css`, shared by every
public page and the standalone guides (`public/guide-banner.js`).

- Five real, openly licensed photographs of Kassena places
  (`public/culture-photos.js`, manifest in `public/images/culture/photos/`).
  Each slide shows place, photographer, licence and source links while visible.
  Add only photographs of Kasem-speaking places or community-approved images,
  with their credits; never generated imagery presented as documentary.
- Left-weighted indigo veil; on screens ≥ 1100 px the photograph starts at 26%
  so faces stay clear of the headline. Phones use a top-to-bottom veil.
- Labelled progress segments (7 s per slide), arrows and Pause. Motion stops
  off screen, on hover/focus, when paused and under reduced motion; slides only
  advance to loaded images. The homepage opens on the dancers; other routes
  open on a photograph chosen from their path.
- Variants: `home` (full viewport), `page`, `compact` (task pages, < 550 px on
  desktop and < 600 px on phones, enforced by `check-website-refresh.mjs`),
  `embedded`.

## Homepage rhythm

Photographic opening → light discovery (one dark feature card for the word,
two companions) → night map band (Ghana lit in sun) → light photographic
stories (middle card dark) → white updates → royal community band → night
footer. Alternate light and blue fields; do not stack two dark bands.

## Surfaces and motion

Cards: 20–28 px radius, one elevation (shadow) with no border, or a border with
no shadow. Pill buttons. Motion is one authored moment per area (photo drift
and crossfade, story arrival), exponential ease-out, always pausable.
Browser surfaces are themed: sun selection, blue scrollbar and focus rings.

## Checks

`npm run check --workspace @indigen-world/website`, then against
`vite preview --port 5174`: `node scripts/check-motion.mjs` and
`node scripts/check-website-refresh.mjs` (both in `apps/website`).
