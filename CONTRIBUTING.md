# Contributing to Indigen World

## Working agreement

Use feature branches and pull requests. Do not push product work directly to `main` unless the team has explicitly agreed to an emergency fix.

Suggested branch names:

- `feat/website-partner-page`
- `feat/tribestudio-validator-queue`
- `feat/mobile-kasem-lessons`
- `fix/functions-reward-transaction`
- `docs/data-governance-update`

## Product boundaries

Place work in the correct area:

- `apps/website` — public website only.
- `apps/tribestudio` — creators, contributors, validators, campaigns, analytics, and administration.
- `apps/mobile` — Flutter app for everyday users.
- `services/functions` — trusted backend execution and Firebase Functions.
- `services/ai` — provider adapters, prompts, evaluations, and AI safety controls.
- `packages/contracts` — shared schemas and API contracts.
- `firebase` — security rules, indexes, emulator configuration, and rule tests.

Read `docs/product/product-boundaries.md` before introducing a feature that touches multiple products.

## Commit style

Use clear conventional prefixes:

- `feat:` new behaviour
- `fix:` bug fix
- `docs:` documentation
- `test:` tests
- `refactor:` structural change without new behaviour
- `chore:` maintenance or configuration
- `security:` security hardening

## Pull requests

Every pull request should explain:

1. What changed.
2. Why it belongs in the chosen product or service.
3. How it was tested.
4. Whether Firestore rules, indexes, consent, cultural permissions, rewards, or personal data are affected.
5. Screenshots or recordings for visible UI changes.

Keep pull requests focused. Cross-product work should either use coordinated pull requests or clearly separated commits.

## Data and cultural safety

Never commit production data, personal information, raw consent records, unapproved cultural material, private audio, service-account credentials, or model-provider secrets.

Any feature handling stories, proverbs, oral histories, voice, dialect information, children, rewards, or community attribution must preserve the required governance metadata and approval workflow.

## Quality gates

Before requesting review, run the relevant formatter, linter, type checker, tests, and production build. Firebase rule changes require emulator tests. Shared contract changes require impact review across web, mobile, Functions, and stored Firestore data.

## Architecture decisions

Material changes to Firebase usage, product boundaries, data ownership, AI providers, repository layout, or shared contracts require an Architecture Decision Record in `docs/decisions/`.
