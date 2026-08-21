# Contributor Onboarding

## First steps

1. Read the root `README.md`.
2. Read `CONTRIBUTING.md`, `SECURITY.md`, and `docs/governance/data-safety.md`.
3. Confirm which product or service you own for the work.
4. Create a feature branch from the current `main` branch.
5. Use development or emulator data only.
6. Open a focused pull request using the repository template.

## Product leads

- Project management and cross-product consistency: Francis Pwavwe
- Website: Francis E. Onai
- TribeStudio: Chinedum Okwonko Udeaja
- Mobile: Andy Anim

## Local Firebase

Copy `.firebaserc.example` to `.firebaserc`, replace the aliases with authorised project IDs, and use the Firebase Emulator Suite wherever possible. Never paste service-account credentials into source files.

## Before implementation begins

Each application or service must add its own setup commands, environment template, package metadata, tests, and build instructions. Do not invent a second folder structure inside a product without documenting the decision.

## Ask before changing

Raise an architecture discussion before changing product boundaries, shared contracts, Firebase collection names, authentication roles, reward logic, consent fields, cultural-permission rules, AI providers, or repository layout.
