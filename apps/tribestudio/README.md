# TribeStudio

**Product lead:** Chinedum Okwonko Udeaja

TribeStudio is the operational workspace for creators, cultural custodians, language contributors, validators, and campaign participants. Platform administration, moderation, reward settlement and audit inspection live in the separate `apps/admin` console.

## Responsibilities

- Creator dashboard and cultural-content workflows
- Language contributions and corrections
- Story, proverb, oral-history, and media submissions
- Validator queues, review notes, approval, rejection, and escalation
- Dialect, source, consent, licence, and cultural-permission metadata
- Campaign and bounty participation and contributor history

## Out of scope

- General public marketing — use `apps/website`
- Everyday consumer learning and exploration — use `apps/mobile`
- Platform administration, role assignment, moderation and audit — use `apps/admin`
- Secret-bearing or trusted backend execution — use `services/functions`
- Direct AI provider calls from the browser

## Stack

React + TypeScript + Vite, hosted on Firebase Hosting (site: `tribestudio`) in the shared `project-kassena-7e026` project. It consumes `@indigen-world/contracts` for shared data shapes and enums, and Firebase Authentication with role-aware Firestore access backed by Security Rules. Privileged transitions (validation decisions) call the `decideReview` Cloud Function in `services/functions`.

## MVP scope (Phase 3)

The current build is the first end-to-end vertical for the Kasem language cell:

- Google sign-in; role read from the `role` custom claim.
- Contributors create Kasem lexical entries as drafts and submit them for review (writing to `lexicalEntries`, enforced by Security Rules).
- Validators work a queue of submitted entries and approve / reject / request changes via the trusted `decideReview` function, which records a review and an audit entry.

## Workspace UI

The authenticated workspace (`/studio`, `/workspace`) is built from
[`@indigen-world/console-ui`](../../packages/console-ui), the kit it shares with
the admin console — `DataTable`, `TableShell`, the ⌘K command palette and the
surface, pill, stat and empty-state primitives. A creator who also works in the
admin console should not have to relearn what a table, a status or a control
looks like.

The kit is scoped to `.iwx`, which `StudioLayout` puts on the shell's root
alongside `.studio`. That scope is deliberate: **the public creator pages**
(`/creators`, the landing page, guidelines, FAQ and the join flow) **are
marketing surfaces with their own identity and the kit never reaches them.**
They share only the blue — their primary action, their brand mark and the
sign-in gate.

Layout chrome lives in [`src/creator/studio-shell.css`](src/creator/studio-shell.css):
the navigation rail, the command bar, the status rail and the app's own
`.button`/`.field` classes re-pointed at the kit's treatment inside the
workspace. Page styling stays in `creator.css`.

Keyboard: `⌘K` / `Ctrl-K` opens the palette, `/` focuses the rail's section
filter, and the row-density toggle above any table is remembered per browser.

`npm test --workspace @indigen-world/tribestudio` fails the build if a table
escapes its `TableShell`, if the body loses its overflow guard, or if the shell
loses the palette, the status rail or the kit's scope class.

## Local development

```bash
npm run dev --workspace @indigen-world/tribestudio
# Against local emulators (auth/firestore/functions):
VITE_USE_EMULATORS=true npm run dev --workspace @indigen-world/tribestudio
npm run build:tribestudio     # from the repo root
```

App Check is currently not enforced in the project. If it is enabled later,
production builds must set `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY` to this app's
public web key or protected callables will reject requests. Copy `.env.example`
for the supported variable names; never put private credentials there.

## Install and offline behavior

TribeStudio is installable on supported desktop and mobile browsers. Visit the
production HTTPS site and use the browser's Install/Add to Home Screen action.
The manifest opens `/studio` in a standalone window. Icons are derived from the
existing SVG product mark; regenerate them after changing the mark with
`npm run icons --workspace @indigen-world/tribestudio`.

The service worker caches only public, fingerprinted build assets and a small
offline fallback page. A fresh navigation without a connection shows that page.
Hosting revalidates app routes on every navigation so an old HTML shell cannot
point to bundles removed by a newer release.
An already open draft tab can continue its in-memory writing and reconnect
behavior; do not close it until it saves. Account data, uploads, Firebase APIs,
and authenticated HTML are never cached by the worker. Uploading, publishing,
and starting a fresh workspace session require a connection.

## Deploy

Served by the `tribestudio` Hosting site; production custom domain
`tribestudio.indigenworld.com`. See
[`docs/architecture/hosting-and-domains.md`](../../docs/architecture/hosting-and-domains.md) for the
full site/domain map.

```bash
npm run build:console-ui
npm run check:tribestudio
# Commit and push to main before deploying; the Hosting predeploy verifies origin/main.
firebase deploy --only hosting:tribestudio --project project-kassena-7e026
```

## Project Kassena

The first language cell in TribeStudio is Kasem through Project Kassena. Its dictionary, sentence, dialect, contribution and validator workflows should be implemented as a reusable language-cell pattern rather than hard-coded as the whole platform.
