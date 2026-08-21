# Repository Structure

## Approved layout

```text
indigen-world/
├── apps/
│   ├── website/          # Public Indigen World website
│   ├── tribestudio/      # Creator, contributor and validator web app
│   ├── admin/            # Internal administration and governance console
│   └── mobile/           # Flutter app for everyday users
├── services/
│   ├── functions/        # Firebase Functions and trusted backend operations
│   └── ai/               # Provider-independent AI adapters and evaluations
├── packages/
│   ├── contracts/        # Shared schemas and API contracts
│   ├── design-tokens/    # Platform-neutral design decisions
│   └── web-ui/           # Stable React components shared by the web apps
├── firebase/             # Rules, indexes and emulator tests
├── assets/               # Brand, icons, patterns and approved shared media
├── docs/                 # Architecture, product, governance, data and onboarding
└── .github/              # CI, ownership, issue and pull-request templates
```

## Why a monorepo

The products share identity, Firebase infrastructure, language-cell contracts, governance metadata, brand tokens, and release coordination. A monorepo makes cross-product changes visible and reviewable without forcing a small team to coordinate multiple repositories prematurely.

Separate repositories may be reconsidered only when independent release cycles, access controls, team size, regulatory separation, or operational scale create a demonstrable benefit.

## Dependency direction

```text
apps ───────────────┐
                    ├──> packages/contracts
services/functions ─┘

apps/website ───────┐
apps/tribestudio ───┴──> packages/design-tokens + packages/web-ui
apps/mobile ───────────> packages/design-tokens concepts + contracts
services/functions ────> services/ai
```

Applications must not depend directly on another application. Shared behaviour belongs in a package or service only after its boundary is understood.

## Product Kasena placement

Project Kasena is a programme and the first Kasem language cell, not a fourth application. Its implementation should appear inside the relevant products and services:

```text
apps/website/src/programmes/project-kasena/
apps/tribestudio/src/features/language-cells/kasem/
apps/mobile/lib/features/language_cells/kasem/
services/functions/src/modules/language-cells/kasem/
docs/data/language-cells/kasem/
```

Reusable language-cell behaviour should remain generic. Kasem-specific dialects, linguistic rules, validation requirements, and approved datasets remain clearly identified.

## Naming rules

- Use lowercase kebab-case for directories and non-code filenames.
- Avoid spaces in repository paths.
- Use precise product names in documentation and UI copy.
- Do not use `final`, `final2`, `new-final`, or dates as a substitute for version control.
- Architecture records use `NNNN-short-decision-title.md`.

## Ownership

- Website: Francis E. Onai
- TribeStudio: Chinedum Okwonko Udeaja
- Mobile: Andy Anim
- Project management and cross-product consistency: Francis Pwavwe
- Shared services and contracts: assigned reviewers required per work item

CODEOWNERS should be expanded after all GitHub usernames are confirmed.
