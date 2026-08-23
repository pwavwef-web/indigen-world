# Hosting sites and custom domains

Authoritative map of Firebase Hosting sites, the app each serves, and the
production custom domains attached to them. Custom domains are configured in the
**Firebase Console → Hosting** and at the DNS provider; they are **not** stored
in `firebase.json` or `.firebaserc`, so this document is the source of truth for
the domain → site mapping.

All sites live in the shared Firebase project **`project-kassena-7e026`**.

## Sites, apps and domains

| Hosting site | App | Default domain | Production custom domain(s) | Deploy command |
| --- | --- | --- | --- | --- |
| `indigen-world` | `apps/website` | `indigen-world.web.app` | `indigenworld.com` (apex, primary) · `www.indigenworld.com` (redirect → apex) · `kasem.indigenworld.com` (Project Kasena entry point) | `firebase deploy --only hosting:indigen-world` |
| `indigen-admin` | `apps/admin` | `indigen-admin.web.app` | `admin.indigenworld.com` | `firebase deploy --only hosting:indigen-admin` |
| `tribestudio` | `apps/tribestudio` | `tribestudio.web.app` | `tribestudio.indigenworld.com` | `firebase deploy --only hosting:tribestudio` |

The mobile app (`apps/mobile`) is a Flutter client and has no hosting site.

## DNS record shape (reference)

- **Apex** `indigenworld.com` → two Firebase Hosting **A** records.
- **Subdomains** (`www`, `admin`, `tribestudio`, `kasem`) → **CNAME** to the
  Firebase Hosting target for their site.
- Each domain is verified once with a Firebase-issued **TXT** record; SSL
  certificates are provisioned automatically after DNS propagates.

These domains are also listed under **Authentication → Authorized domains** so
Firebase Auth sign-in/OAuth redirects are permitted on them. That list is
separate from Hosting and does not by itself route traffic to a site.

## Deploying everything

```bash
# Build each web app first (see each app's README), then:
firebase deploy --only hosting            # all sites
firebase deploy --only hosting:indigen-world
firebase deploy --only hosting:indigen-admin
firebase deploy --only hosting:tribestudio
```

Roll back by selecting the previous release in Firebase Hosting release history
for the affected site. Do not change the Firebase project, site names, rules or
production targets to perform a routine deploy.

## Keeping content aligned with the domain

When the public website's canonical domain changes, update
`apps/website` `VITE_SITE_URL`, `public/sitemap.xml` and `public/robots.txt`
together so metadata and crawl directives point at `indigenworld.com`.
