// Programmatic access to the design tokens. The CSS custom properties in
// ./tokens.css are the runtime source for the web apps; these JSON exports are
// for tooling (docs, Dart/mobile generation, tests).

import colors from './colors.json' with { type: 'json' };
import spacing from './spacing.json' with { type: 'json' };
import typography from './typography.json' with { type: 'json' };

export { colors, spacing, typography };
export const tokens = { colors, spacing, typography };
