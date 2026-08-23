# Indigen World Admin

The internal administration console for the Indigen World ecosystem. It is a
separate application from **TribeStudio** (`apps/tribestudio`), which is the
workspace for contributors and content creators.

## Responsibilities

- Role and access administration (assigning and auditing role claims)
- Validation oversight across language cells (queues, escalations, quality)
- Moderation of reported content against consent and cultural-permission policy
- Campaign, bounty and reward-integrity oversight
- Audit and accountability (inspecting the append-only audit log)
- Operational reporting and approved, permission-safe exports

## Out of scope

- Creator and contributor production workflows — use `apps/tribestudio`
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

## Local development

```bash
npm run dev --workspace @indigen-world/admin
npm run build:admin      # from the repo root
```

## Deploy

Served by the `indigen-admin` Hosting site; production custom domain
`admin.indigenworld.com`. See
[`docs/architecture/hosting-and-domains.md`](../../docs/architecture/hosting-and-domains.md) for the
full site/domain map.

```bash
firebase deploy --only hosting:indigen-admin
```
