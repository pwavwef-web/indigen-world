# Indigen World public website

The public website is Indigen World's discovery, trust and participation layer. It explains the
ecosystem, positions Project Kasena as the flagship Kasem-language initiative, labels unfinished
work honestly, and routes visitors to an appropriate next step. Product tools, validators,
datasets and backend workflows remain outside this app.

## Local setup

Use Node.js 22.12 or newer from the repository root:

```bash
npm install
copy apps\website\.env.example apps\website\.env.local
npm run dev --workspace @indigen-world/website
```

The site renders without Firebase configuration. In production, Firebase Hosting routes
`/api/public-forms` to the reviewed, rate-limited public form function. Set the endpoint variable
only when the forms service is hosted separately (or when testing it from Vite locally).

## Checks and production build

```bash
npm run check --workspace @indigen-world/website
npm run preview --workspace @indigen-world/website
```

`check` runs TypeScript, the route/privacy invariant test, and the production Vite build. The app
uses real History API routes and Firebase Hosting's existing catch-all rewrite.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `VITE_SITE_URL` | Canonical production origin used for route metadata. |
| `VITE_PUBLIC_FORMS_ENDPOINT` | Optional override for the reviewed public forms endpoint; defaults to `/api/public-forms`. |
| `VITE_ANALYTICS_ENABLED` | Enables privacy-safe analytics only when set to `true` at build time. |
| `VITE_FIREBASE_*` | Firebase web and measurement configuration used by analytics when enabled. |

Commit variable names only. Keep values in ignored local/CI environment files. The form endpoint
must validate payloads, enforce rate limits and return a non-2xx response when a submission is not
accepted. Do not put recipient addresses, Firestore collection names or service credentials in the
client.

## MVP routes

- `/` — mission, ecosystem, Project Kasena, operating model, audiences, verified status and CTA
- `/about` — problem, mission, principles and Kasem-first starting point
- `/ecosystem` — product audiences, owners, status and boundaries
- `/project-kasena` — Kasem/Kasena distinction, validation model and planned roadmap
- `/impact-governance` — permissions, cultural-data stewardship and labelled targets
- `/get-involved` — contributor, validator, school, research, diaspora, sponsor and volunteer routes
- `/team` — approved names, public roles and workstream ownership only
- `/contact` — privacy-aware general, publication, correction and takedown route
- `/privacy` and `/terms` — plain-language implementation summaries pending legal approval

## Updating content

Editable product, status, team, principle and Project Kasena copy lives under `src/content/`.
Navigation and route metadata live in `src/content/navigation.ts`. Page layouts live under
`src/pages/`; shared UI is under `src/components/`; form behavior is under `src/features/forms/`.
The privacy-safe analytics vocabulary is documented in `src/lib/analytics.ts`.

Never publish a partner, funder, school, chief, elder, validator, dataset, cultural record, audio
sample, biography, portrait or personal contact detail without approval and the required consent,
licence and cultural permissions.

## Deployment and rollback

The repository `firebase.json` serves `apps/website/dist` and rewrites unknown paths to
`index.html` so direct route loads work.

```bash
npm run check --workspace @indigen-world/website
firebase deploy --only hosting:indigen-world
```

This app is served by the `indigen-world` Hosting site. Its production custom domains are
`indigenworld.com` (apex), `www.indigenworld.com` (redirects to the apex) and
`kasem.indigenworld.com` (Project Kasena entry point). See
[`docs/architecture/hosting-and-domains.md`](../../docs/architecture/hosting-and-domains.md) for the
full site/domain map.

Use the reviewed Firebase project/site mapping supplied by the project manager. To roll back,
select the preceding release in Firebase Hosting release history and verify the same core routes.
Do not change Firebase project structure, rules or production targets from this app.

## Approval and asset gaps

Before public launch, the project manager still needs to supply or approve:

- the production Indigen World master logo/favicon and social-preview artwork;
- public social profile URLs and any editorial photography with permission and attribution;
- final legal copy and the newsletter delivery provider's unsubscribe route;
- production environment values and newsletter delivery-provider integration;
- a staging review, route screenshots and Lighthouse results.

Until those are approved, the site uses restrained CSS artwork, omits social links and marks legal
copy as an implementation summary. Update `public/sitemap.xml`, `public/robots.txt` and
`VITE_SITE_URL` together if a custom production domain replaces the Firebase Hosting domain.
