# Shared Web UI

This package is reserved for reusable React components shared by the Indigen World website and TribeStudio.

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
