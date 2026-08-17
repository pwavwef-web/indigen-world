# Firebase Configuration

This directory contains shared Firebase security and data-access configuration for the Indigen World ecosystem.

## Files

- `firestore.rules` — Firestore access policy
- `firestore.indexes.json` — composite and field-index definitions
- `storage.rules` — Cloud Storage access policy
- `tests/` — emulator-based rules tests

The root `firebase.json` points to these files and to `services/functions`.

## Current posture

`firestore.rules` defines per-collection access for the first data-layer
collections — registry entities (communities, languages, dialects, validators),
content records (lexicalEntries, sentencePairs), contributor profiles, consent
records, reviews and the audit log — over a default-deny base. Roles are carried
as the custom auth claim `role` ∈ {contributor, validator, admin}. Privileged
transitions (validation decisions, role assignment, consent withdrawal, audit)
are performed server-side in `services/functions`; clients cannot set those
states. Every collection here is covered by emulator tests (`npm run test:rules`).

Any collection not explicitly matched is still denied by default. Do not weaken
rules merely to make a screen appear to work, and do not enable a new collection
without matching allowed/denied tests.

## Required process for rule changes

1. Define the collection and data contract.
2. Identify public, authenticated, contributor, validator, administrator, and server-only operations.
3. Add emulator tests for allowed and denied cases.
4. Review personal data, consent, cultural permissions, rewards, and audit requirements.
5. Deploy to a non-production project before production.

Use separate Firebase projects for development, staging, and production.
