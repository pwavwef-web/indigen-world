# A community of characters for Indigen World

- **Prepared:** October 13, 2026
- **Title:** A community of characters for Indigen World
- **Labels:** Website, Design, Community, Kasem, Accessibility
- **Search description:** Ten original illustrated characters bring storytelling, learning and creating into Indigen World's public banners, with gentle motion and shared pause controls.
- **Suggested permalink:** `original-illustrated-community-indigen-world`
- **Status:** Implemented and checked locally; website deployment pending. Blogger publication pending.

## What changed

Ten recurring fictional characters appear in shared public banners, standalone
grammar and spelling guides, and homepage story cards. Original paper-collage
scenery uses a cream sky, terracotta and ochre hills, and sage foliage. Three
scenes emphasize storytelling, learning and creating. Clouds, birds, foliage
and the people layer move gently; characters do not perform frame-by-frame
actions or speak. Search, headings and actions occupy separate space above
the ensemble. Dictionary, Learn and Contribute retain compact openings.

The banner pauses while hovered, focused, off screen or in a hidden tab.
Manual scene selection pauses motion, and the shared choice persists through
navigation and guides. Reduced-motion preferences disable the animation.
Artwork is visibly credited as original AI-generated illustration of fictional
people. No Endangered Languages Project artwork or video was copied.

## Verification and availability

- `npm run check:website`: TypeScript, site/progress validations, 21 existing
  tests and production build passed.
- Actual in-app-browser checks on 14 public banners (including both standalone
  guides) at 320 and 1280 pixels: all images loaded, no horizontal overflow,
  and no overlap between copy, artwork and credits/controls.
- Resumed scenes advanced with decorative layers running. Pause stopped the
  layers and persisted into the grammar guide. Manual next-scene selection
  worked.
- Actual 390-pixel dictionary screenshot confirms readable text, ensemble,
  motion controls and search/results.
- Reduced-motion overrides were inspected in code; a fresh operating-system
  reduced-motion toggle was not exercised for this release.
- Public website Hosting only; no mobile-app, data, email or signed-in
  workspace release included.

## Images and credits

Actual local website screenshots, October 13, 2026: `images/home-desktop.jpg`,
`images/community-scenes.jpg`, `images/dictionary-mobile.jpg`. Public UI and
public records, motion paused for inspection. Credit: Indigen World website;
artwork created using built-in ImageGen, all characters fictional. Master
artwork and prompt set: `assets/brand/indigen-world/culture-banner/README.md`.

## Blogger handoff

1. Confirm deployment status above before announcing availability.
2. Create a draft with this title, labels and search description.
3. Paste `post.html` in HTML mode.
4. Upload all three actual JPEGs, replacing each `images/...` source with its
   Blogger-hosted URL. Keep alt text, captions and the AI/fictional credit.
5. Preview on desktop and phone; Chinedum can then publish.
6. Replace the article URL placeholder in `share.md` after publication.
   Website deployment does not publish this article or send messages.
