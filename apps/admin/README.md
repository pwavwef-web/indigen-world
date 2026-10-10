# Indigen World Admin

The internal administration console for the Indigen World ecosystem. It is a
separate application from **TribeStudio** (`apps/tribestudio`), which is the
workspace for contributors and content creators.

## Responsibilities

- Points: redemptions, reward policies, ledger and audit history (Finance)
- Role and access auditing
- Contributor directory, profile, invitation and expression-assignment administration
- Validation oversight across language cells (queues, escalations, quality)
- Moderation of reported content against consent and cultural-permission policy
- Campaign, bounty and reward-integrity oversight
- Audit and accountability (inspecting the append-only audit log)
- Operational reporting and approved, permission-safe exports

## Out of scope

- Creator and contributor production workspaces — use `apps/tribestudio`; the
  Admin console owns staff-side contributor profiles, invitations, allocation
  and review
- Public marketing and partner pages — use `apps/website`
- Everyday consumer learning and exploration — use `apps/mobile`
- Secret-bearing or trusted backend execution — use `services/functions`
- Direct AI provider calls from the browser

## Stack

React + TypeScript + Vite, hosted on Firebase Hosting (site: `indigen-admin`)
in the shared `project-kassena-7e026` project. It consumes
`@indigen-world/contracts` for shared data shapes and enums.

Privileged access must be backed by role claims, Firebase Security Rules and
server-side checks in `services/functions` — never by client-side checks alone.
The console is marked `noindex` and must not be publicly discoverable.

## Structure

After sign-in the console opens on **Home**: a launcher of nine workspace
cards, live queue counts and a "Needs attention" strip. Inside a workspace a
sidebar holds *Back to home*, a section switcher and that section's tools.
The map lives in [`src/routes.ts`](src/routes.ts) and each tool's screen in
[`src/screens.tsx`](src/screens.tsx):

| Section | Tools | Access |
|---|---|---|
| Finance `/finance` | Overview · Point redemptions · Reward policies · Points ledger · Audit history · Payout records | admin to view; finance claim to decide, change policies or adjust (payouts: finance claim) |
| Collections `/collections` | Heroes · Names · Apps · Audiobooks · Shop · Orders | admin |
| Messaging `/messaging` | Compose · Contact groups · Campaign history · Test SMS | admin |
| Creators `/creators` | Overview · Applications · Creator profiles · Members · Campaigns | validator |
| Contributors `/contributors` | Directory · Invitations · Assignments · Contribution history · Support & issues | admin |
| Review Desk `/review` | Pending · Approved · Published · Needs revision · Rejected · Archived | validator |
| Learning `/learning` | Lessons · Units (admin) · Illustrations · Pronunciation | validator |
| Community `/community` | Reports (admin) · Forms & claims · Team sites | validator |
| Governance `/governance` | Audit trail · Exports · Configuration | admin |

Old addresses (`/reports`, `/audit`, `/collection`, `/interests`,
`/team-sites`, `/exports`, `/contributors/rewards` …) redirect into this map.
A path someone may not open says which permission it needs; an unknown path
is an explicit 404. `/team-site-intake` stays public. Access here only decides
what is shown — Security Rules and the callables enforce it.

**Finance owns money: rates, award policies, the points ledger and fulfilment.**
Contributors request airtime or data in TribeStudio from a server quote; the
points are reserved in the ledger. Approving never sends anything; recording a
delivery needs a reference and an explicit confirmation; a definite failure
needs a reason; an unclear outcome is held for reconciliation (points stay
reserved); rejecting returns the reserved points exactly once. Every decision
carries the status the reviewer saw, so a stale screen is refused and reloaded.
Validators own linguistic judgement on TribeStudio's Rewards desk. Formulas and
rollout: `docs/product/contributor-rewards.md`.

## Look and feel

The console reuses TribeStudio's foundation directly — `tokens.css`,
`base.css`, `motion.css`, `components.css`, `shell.css` and the icon set are
imported from `apps/tribestudio/src/ui`, so both products share one palette,
type pairing (Sora + Inter), controls and motion. Admin adds only layout
(`src/ui/admin.css`, `src/ui/sections.css`) and a bridge that draws older
screens' classes in the same language (`src/ui/legacy.css`). `src/ui/primitives.tsx`
renders the studio's `ts-*` markup; `src/ui/dialogs.tsx` replaces browser
prompts with accessible dialogs. Display preferences (colour mode, text size,
contrast, animations) live in the profile menu; the console opens light.

`npm test --workspace @indigen-world/admin` checks the section map, that every
tool has a screen, the Finance and Review safeguards, that every table scrolls
inside its own box, and the Kasem morphology mirror.

## Local development

```bash
npm run dev --workspace @indigen-world/admin
npm run build:admin      # from the repo root
```

To see signed-in screens without production, run the emulators, seed them and
start the dev-only fixture callables (the Functions emulator cannot load on
Node 24, so callables are answered from labelled sample data; backend
behaviour is covered by `firebase/tests`):

```bash
npx firebase emulators:start --only auth,firestore,storage --project demo-indigen-world
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199 node apps/admin/scripts/dev/seed-admin-ui.mjs
node apps/admin/scripts/dev/fixture-callables.mjs
npx cross-env VITE_USE_EMULATORS=true npm run dev --workspace @indigen-world/admin
```

For Finance and the points system use the **real** callables instead of the
fixtures (the fixtures predate the ledger and answer the old shapes):
`npm run build:functions`, seed with
`services/functions/scripts/dev/seed-rewards-ui.mjs`, and run
`services/functions/scripts/dev/callable-bridge.mjs` on port 5001 (both need
`FIRESTORE_EMULATOR_HOST` and `FIREBASE_AUTH_EMULATOR_HOST`).

The seed creates `admin@admin.test` (admin + finance), `validator@admin.test`
and `nobody@admin.test`; their shared local password is in the seed script.

## Deploy

Served by the `indigen-admin` Hosting site; production custom domain
`admin.indigenworld.com`. See
[`docs/architecture/hosting-and-domains.md`](../../docs/architecture/hosting-and-domains.md) for the
full site/domain map.

```bash
firebase deploy --only hosting:indigen-admin
```
