# Firebase Configuration

This directory contains shared Firebase security and data-access configuration for the Indigen World ecosystem.

## Files

- `firestore.rules` — Firestore access policy
- `firestore.indexes.json` — composite and field-index definitions
- `storage.rules` — Cloud Storage access policy
- `tests/` — emulator-based rules tests

The root `firebase.json` points to these files and to `services/functions`.

## Current posture

The initial rules deliberately deny all client access until collections, roles, ownership, validation states, and test cases are formally defined. Do not weaken them merely to make a screen appear to work.

## Required process for rule changes

1. Define the collection and data contract.
2. Identify public, authenticated, contributor, validator, administrator, and server-only operations.
3. Add emulator tests for allowed and denied cases.
4. Review personal data, consent, cultural permissions, rewards, and audit requirements.
5. Deploy to a non-production project before production.

Use separate Firebase projects for development, staging, and production.
