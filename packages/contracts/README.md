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
