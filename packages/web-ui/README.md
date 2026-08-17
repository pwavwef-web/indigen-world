# Shared Web UI

Reusable React primitives shared by the Indigen World web apps, built on
`@indigen-world/design-tokens`.

## Current primitives

`Button` (primary / secondary / ghost), `Badge` (neutral / info / success /
warning / danger), `Container`, `SectionHeading`. Adopted by the admin console;
available to the website and TribeStudio.

## Usage

```ts
import '@indigen-world/design-tokens/tokens.css'; // palette (once, at entry)
import '@indigen-world/web-ui/styles.css';        // primitive styles (once)
import { Button, Badge } from '@indigen-world/web-ui';
```

Build with `npm run build --workspace @indigen-world/web-ui` (emits `dist/` with
types). The package ships built ESM + `.d.ts`; consumers import from `.`.

---

This package is reserved for reusable React components shared by the Indigen World web apps.

## Appropriate contents

- Accessible buttons, inputs, dialogs, navigation primitives, cards, badges, and feedback states
- Design-token bindings
- Shared content-classification and validation-status components
- Storybook or equivalent component documentation when introduced

## Inappropriate contents

- Product-specific pages or workflows
- Firebase queries tied to one product
- Business logic for validation, rewards, consent, or permissions
- Flutter widgets; the mobile app consumes shared design tokens and contracts, not React components

Do not create abstractions merely because two components look vaguely similar. Promote a component here only after its API and accessibility behaviour are stable across both web products.
