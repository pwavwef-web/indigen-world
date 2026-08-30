# Design Tokens

This package stores platform-neutral visual tokens used to keep the website, TribeStudio, mobile app, documents, and future products visually consistent.

## Files

- `colors.json` — brand and semantic colour values
- `typography.json` — font-family and type-scale decisions
- `spacing.json` — spacing and radius scale
- `tokens.css` — the palette as CSS custom properties, for the web apps
- `index.mjs` — the JSON groups as importable objects (for tooling / mobile generation)

The JSON files are the source tokens; `tokens.css` mirrors them for web consumption. The mobile app should map the JSON into a Flutter theme rather than consume the CSS.

## Usage (web)

```ts
// Load the palette once, at the app entry point:
import '@indigen-world/design-tokens/tokens.css';
// Then reference variables in CSS: var(--indigo), var(--terracotta), var(--bg), …
```

The admin console and TribeStudio load this file, so the palette lives in one place instead of being duplicated per app.

## Brand architecture

Indigen World is the primary ecosystem brand. TribeStudio and Project Kassena may have product or programme accents, but they must remain recognisably related to the umbrella system.

## Accessibility

Semantic tokens must be tested for WCAG contrast in actual components. A colour appearing in this package does not automatically approve every foreground/background combination.
