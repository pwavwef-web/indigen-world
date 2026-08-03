# Design Tokens

This package stores platform-neutral visual tokens used to keep the website, TribeStudio, mobile app, documents, and future products visually consistent.

## Files

- `colors.json` — brand and semantic colour values
- `typography.json` — font-family and type-scale decisions
- `spacing.json` — spacing and radius scale

These files are source tokens, not framework-specific CSS or Flutter theme code. Each application should transform or map them into its own implementation.

## Brand architecture

Indigen World is the primary ecosystem brand. TribeStudio and Project Kasena may have product or programme accents, but they must remain recognisably related to the umbrella system.

## Accessibility

Semantic tokens must be tested for WCAG contrast in actual components. A colour appearing in this package does not automatically approve every foreground/background combination.
