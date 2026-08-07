# Shared Contracts

This package is the source of truth for data shapes, API contracts, validation enums, and compatibility rules shared across Indigen World products and services.

## Core entities

- communities
- languages
- dialects
- lexical entries
- sentence pairs
- proverbs and idioms
- stories and oral histories
- media
- consent records
- cultural permissions
- contributors
- validators
- reviews
- campaigns and bounties
- rewards and reward transactions
- model outputs
- audit logs

## Required metadata

Relevant content records must support source, contributor, language, dialect, validation status, validator identity, consent status, licence, cultural-permission tier, timestamps, version, and audit references.

## Contract strategy

Prefer language-neutral JSON Schema and OpenAPI definitions where practical. TypeScript and Dart models may be generated or implemented from these contracts, but neither client implementation becomes the canonical schema by itself.

## Change discipline

Contract changes require:

1. Compatibility assessment for existing Firestore documents.
2. Migration or backfill plan where needed.
3. Security Rules review.
4. Web, mobile, Functions, analytics, and export impact review.
5. Documentation of breaking changes.

Use synthetic examples only. Do not store production corpus records or personal data here.

## Package layout

```text
packages/contracts/
├── schemas/        # Canonical JSON Schema (draft 2020-12) — the source of truth
│   ├── common.schema.json          # Shared enums, references, governance metadata, lifecycle
│   ├── community.schema.json
│   ├── language.schema.json
│   ├── dialect.schema.json
│   ├── lexical-entry.schema.json
│   ├── sentence-pair.schema.json
│   ├── consent-record.schema.json
│   ├── contributor.schema.json
│   ├── validator.schema.json
│   ├── review.schema.json
│   └── audit-log.schema.json
├── examples/       # Synthetic fixtures, one per entity (validated in CI)
├── scripts/
│   └── validate.mjs  # Ajv check: every example against its schema
└── index.mjs       # Importable aggregate: schemas, allSchemas, enums
```

The remaining entities named above (proverbs and idioms, stories and oral histories,
media, cultural permissions, campaigns and bounties, rewards, model outputs) are not
yet schematised. Add them here as their workflows are designed, reusing
`common.schema.json` for governance metadata rather than redefining it.

## Governance metadata

Content records (lexical entries, sentence pairs, and future story/media entities)
embed `common.schema.json#/$defs/governanceMetadata`, which carries source,
contributor, language, dialect, validation status, validator, consent status,
consent reference, licence, and cultural-permission tier. Registry entities
(communities, languages, dialects, contributors, validators) and append-only
audit logs have their own required fields instead.

## Usage

The JSON Schemas are canonical. TypeScript and Dart models are derived from them,
never the reverse.

```js
// Aggregate import (Node / Functions / tests)
import { schemas, allSchemas, enums } from '@indigen-world/contracts';

// Or a single schema directly (bundler-friendly for website / TribeStudio)
import lexicalEntry from '@indigen-world/contracts/schemas/lexical-entry.schema.json';
```

`enums` is read directly from `common.schema.json`, so enum lists (e.g.
`enums.validationStatus`) never drift from validation.

## Validating

```bash
npm test --workspace @indigen-world/contracts
```

This registers every schema (so cross-file `$ref`s resolve) and validates each
synthetic fixture. Add an example alongside any new schema so it stays covered.
