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

The mobile Community and Explore surfaces add two further families, both
covered by `tests/community.rules.test.mjs` and `tests/reelsAndChats.rules.test.mjs`:

- **Reel engagement** — `reelLikes`, `reelSaves`, `reelViews` and `reelComments`,
  flat edges keyed `{uid}_{reelId}` so a member only ever writes documents they
  own. There is no counter document anywhere: public totals are read with
  aggregate `count()` queries over the edges, so no client needs write access to
  a shared number and a total cannot drift from what it describes.
- **Private conversations** — `communityChats/{a_b}` and its `messages`
  subcollection, where the thread id is the two account ids sorted and joined by
  an underscore. Both participants may write the thread document (a sender has
  to raise the other side's unread count, a reader has to clear their own); the
  participant list itself is frozen, and messages may be withdrawn by their
  sender but never rewritten.

Any collection not explicitly matched is still denied by default. Do not weaken
rules merely to make a screen appear to work, and do not enable a new collection
without matching allowed/denied tests.

> **Deploying matters.** `firestore.rules` and `storage.rules` in this directory
> are the intended policy, not the live one. A feature whose rule has been
> committed but not deployed fails at runtime as `permission-denied` /
> `unauthorized`, which the mobile app can only report as a refusal. Voice notes
> on community posts are exactly this case: the `audio/*` clause in
> `storage.rules` has to be live before a recording can be uploaded at all.

## Required process for rule changes

1. Define the collection and data contract.
2. Identify public, authenticated, contributor, validator, administrator, and server-only operations.
3. Add emulator tests for allowed and denied cases.
4. Review personal data, consent, cultural permissions, rewards, and audit requirements.
5. Deploy to a non-production project before production.

Use separate Firebase projects for development, staging, and production.
