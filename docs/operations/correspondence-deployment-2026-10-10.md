# Heritage Frame production release — October 10, 2026

Deployed to `project-kassena-7e026`. Admin is available at
[Messaging → Correspondence](https://admin.indigenworld.com/messaging/correspondence)
and the Firebase Hosting domain `https://indigen-admin.web.app`.

## Scope and source

- Admin Hosting and Firestore/Storage rules: release commit
  `4b0f8ed3ab7611f075cfbfd46fce13eb60a0a7eb`.
- Final backend, including the cloud Word font correction: commit
  `985d31258870eb67d96e66a67663349323d8a29a`.
- An isolated clean checkout preserved unrelated Kasem audio release work.
  Both code commits were pushed to `origin/main` before deployment. The frontend
  code is unchanged by the backend correction; documentation commits do not
  require another runtime release.
- Firebase CLI 15.33.0 deployed only four Functions, private-data rules and
  `hosting:indigen-admin`. Hosting's existing predeploy checks also ran the
  website, dictionary and TribeStudio checks; those sites were not deployed.
- A transient connection failure stopped correction attempts before source
  upload. After connectivity recovered, the correction deploy completed.

## Verified live backend

All four Functions are ACTIVE, Node 22, 512 MiB, timeout 120 seconds,
concurrency 1, in `us-central1`. Final Cloud Build:
`7dedb75c-c2da-4297-b602-7c65d1a27879`.

| Function | Final revision | Updated UTC |
|---|---|---|
| correspondence | correspondence-00002-peg | 19:01:23 |
| publicForms | publicforms-00026-mup | 19:01:47 |
| onNotificationCreated | onnotificationcreated-00027-tas | 19:01:51 |
| onSupportEmailCreated | onsupportemailcreated-00004-hex | 19:01:50 |

The existing seven SMTP/provider settings and secret bindings were retained.
The existing runtime service account already had self-signing permission;
Runtime service-account IAM roles and existing authentication/review permissions
were preserved.
Private cloud storage writes and download-link preparation passed through the
admin-only callable. Raw draft and delivery collections remain denied to clients.

## Validation

- Correspondence build and 13 generator/delivery tests passed, including the
  cloud filename regression, exact MIME attachment bytes and safe retries.
- Existing six correspondence emulator tests, nine Admin route tests,
  Admin build/typecheck, 22 contract fixtures and fixture browser verification
  passed before release. The frontend remains byte-identical to that build.
- Both Admin domains returned HTTP 200 and exactly matched the built HTML,
  entry JavaScript and composer chunk. Existing nosniff, frame-denial and
  noindex headers were present. Unauthenticated callable list returns
  HTTP 401 / UNAUTHENTICATED.
- A signed-in administrator saved `Deployment review — synthetic letter` and
  prepared print files. Its generated versions remained separate and unsent.
  The corrected Word and PDF were retrieved from private cloud storage.
- Corrected cloud Word: 16 editable paragraphs, four embedded fonts, every
  font relationship resolved, header/footer present and Kasem text retained.
  Corrected PDF: one searchable A4 page, Kasem preserved, rendered and visually
  inspected. Its hash matches the portal's saved version.

Corrected synthetic document version:
`339537a84a2971fa4900e1b41b203cb9d6cb5d9459e072ad1bb5452813f55c45`.

PDF SHA-256:
`0c0aab54894755f40b9d560e2e8719bbc8176f65f02c8a68f59607266ac1b808`.

Word SHA-256:
`f11737b82d030be082f8dd6ce4bd742910eb46e675043ea2d311f2062b433794`.

No real-recipient test email, physical print job or external Blogger publication
was performed. SMTP acceptance/inbox delivery is not claimed. Native Word
render-refresh and external assistant/authentication-email integration limits are
recorded in [the verification record](../architecture/correspondence-verification.md).

## Use and remaining connections

Administrators can save a private draft, download Word/PDF, prepare a PDF for
printing, or review and send an email with its immutable PDF attached. Existing
application email routes enforce preparation through the shared SMTP boundary.
The CLI also returns both formats without a printer or email operation.

Firebase-managed security emails need an authorised custom sender integration
for attachment coverage. A separate staff correspondence assistant is not
connected; its tool contract is prepared. The support assistant's existing email
outbox uses the updated worker. Chinedum's release article and images are ready
in the repository; publishing and sharing remain separate actions.
