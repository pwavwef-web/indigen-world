# ADR 0001: Adopt a Product-Oriented Monorepo

- **Status:** Accepted
- **Date:** 2026-08-03
- **Decision owner:** Francis Pwavwe

## Context

Indigen World is an umbrella ecosystem with three user-facing products, shared Firebase infrastructure, a future AI layer, common data contracts, and one flagship Kasem-language programme. The initial repository used empty top-level directories with inconsistent names and overlapping technical responsibilities.

## Decision

Use one product-oriented monorepo with these primary areas:

- `apps/website`
- `apps/tribestudio`
- `apps/mobile`
- `services/functions`
- `services/ai`
- `packages/contracts`
- `packages/design-tokens`
- `packages/web-ui`
- `firebase`
- `assets`
- `docs`

Project Kasena is implemented as the first language cell across the products and services, not as a separate top-level application.

## Consequences

### Positive

- One source of truth for contracts, brand, governance, and Firebase configuration
- Easier cross-product review for a small team
- Clearer ownership and product boundaries
- Reusable language-cell architecture
- Reduced duplication and naming drift

### Costs

- CI must detect affected products rather than rebuild everything forever
- Shared-package changes require careful compatibility review
- Repository access applies broadly unless later technical separation is introduced
- Team discipline is required to stop applications from depending on each other directly

## Revisit conditions

Reconsider separate repositories when team size, release independence, regulatory separation, access control, build performance, or operational ownership makes the monorepo materially harmful.
