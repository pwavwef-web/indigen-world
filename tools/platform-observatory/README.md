# Indigen World platform observatory

A local, source-backed dashboard answering: what is the platform intended to be, what does the current source support, what is actually verified/released, and what proof or decisions are needed next?

Six views cover overview, interactive architecture/governance diagrams, searchable capability ledger, proposed decisions, release evidence, and inspectable sources. The overview embeds a real 45-second Remotion Player with five chapter controls and a complete text transcript. It starts paused. The dashboard retains the canonical Data runtime's themes, source inspection, presentation editing and export behavior.

The reviewed register contains 47 capabilities in 13 domains, 66 primary-source excerpts, 13 proposed decisions, 13 selected release milestones, 12 conflicts/gaps and five current HTTP checks. It is a bounded review, not a claim that every line/endpoint has been audited. No completion percentage or unmeasured user/financial/language-quality value is invented.

## Run locally

From the repository root, after building:

```sh
node scripts/serve-platform-observatory.mjs
```

Open http://127.0.0.1:4188/. The server exposes only compiled `dist`, binds loopback and performs no cloud mutation. Keep it running while using the preview. If that port is already serving the preview, reuse it. Choose another port with the `OBSERVATORY_PORT` environment variable.

## Refresh carefully

1. Read `data/platform-audit/README.md`, the curation register and affected original sources. Reconcile newer specific receipts with older notes.
2. Run `node scripts/platform-audit.mjs` to refresh repository metadata only. This neither upgrades a capability status nor reads private records.
3. Run `node scripts/platform-audit.mjs --check` to detect missing references or file drift. A passing hash/reference check does not validate meanings.
4. Update `data/platform-audit/curation.mjs` after semantic review. Keep implementation, named tests, deployment, current availability and outcomes separate. Capture authorised HTTP checks and scoped command results with timestamps; never backfill them with assumptions.
5. Run `node scripts/build-platform-observatory-data.mjs`. Changed source identities require manual review first, then the explicit `--accept-reviewed-sources` flag. This flag is a local review acknowledgement, never cultural/legal permission or a release gate override.
6. Run `node scripts/build-platform-briefing.mjs`. It uses the root's existing Vite, React, `remotion` and `@remotion/player` (4.0.532) dependencies, bundles a local player in a sandboxed iframe and updates its transcript. No API key/provider/rendering service is used.
7. Set the snapshot's `buildStatus` to `creating`/`updating` during work and `complete` after content/checks finish, then run `node scripts/build-platform-observatory.mjs`. It uses the installed Data plugin (default pinned path 1.0.11; override `DATA_ANALYTICS_PLUGIN_ROOT` when appropriate), without installing or modifying the protected runtime.
8. Reload the same preview and verify all six views, visible chart marks, domain/state All reset, search/detail/export scope, chapter controls, source inspection, and normal/narrow layouts. Record actual checks and limitations.

The original generated app ID remains stable. Do not edit protected runtime files; author app-specific changes under `src/content/`, palette under `src/theme.css`, and evidence under `src/data.json`.

## Boundaries

- This is a local research artifact, not part of the public site's routes and not deployed to Firebase or Sites.
- Current working-tree changes are included; local HEAD is not assumed to be the live source.
- Historical test/release receipts are dated documentary evidence, not reruns in this audit. HTTP 200 establishes page-shell reachability only.
- No production corpus, payment, identity, private correspondence, Play Console or live analytics was read.
- Future refresh is manual. Source drift blocks rebinding until reviewed; no scheduler or automation has been created.
- Raw source excerpts include internal code and audit findings; review audience and permissions before any later publication.

Research: `data/platform-audit/research/implementation.md` and `vision-release.md`. Community handoff: `apps/updates-blog/posts/2026-10-15-platform-observatory/`.
