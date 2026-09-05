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
