# Website freshness audit — 15 September 2026

## Conclusion

The public website is deployed and builds successfully, but its product messaging and some dependencies need updating. Reviewed checkout: `ab67d11` on `main`; its locally cached `origin/main` matches. Remote Git freshness was not independently fetched.

## Priorities

1. **Update vulnerable production dependencies.** A live npm registry audit reports 9 affected packages: 2 high, 7 moderate, 0 critical. High findings affect `nodemailer` and `fast-uri`; npm reports fixes available. These are monorepo dependency findings, not proof of an exploitable browser vulnerability. The configured CI high-severity audit gate would fail against this result. Patch and rerun the audit plus backend integration tests before deployment.
2. **Refresh ecosystem status copy.** `apps/website/src/content/ecosystem.ts:27` describes TribeStudio as a waitlist awaiting submissions, while its current implementation and README document submission, draft and validation workflows. The shared backend is labelled `research` at line 68 despite implemented Firebase services. The public website itself is labelled `in-development`. Distinguish usable capabilities from restricted access and unfinished features; confirm public availability before changing launch claims.
3. **Finish the public legal copy.** `apps/website/src/pages/PrivacyPage.tsx:178` and `TermsPage.tsx:108` still state that approved legal copy will replace these implementation summaries before public launch. Both pages are already publicly served. This is a content-readiness finding, not a legal compliance assessment.
4. **Align newsletter messaging and delivery.** The privacy notice and newsletter form say delivery waits for a working unsubscribe link. `services/functions/src/public-forms.ts:109` already sends a welcome to each new subscriber; `email-templates.ts:208` defines that welcome without an unsubscribe link. Clarify the distinction between signup acknowledgements and newsletter campaigns, and implement/verify the promised unsubscribe flow before campaign delivery. No live subscription was submitted during this audit.
5. **Update mobile progress information.** `apps/website/src/content/appLinks.ts` has a null store URL and waitlist handoff. Repository release notes and `apps/mobile/pubspec.yaml` show Android version `0.1.17+26` and tester activity. Describe the testing stage accurately; a built beta does not establish public store availability. Apple app IDs remain empty in `apps/website/config/app-links.json`, so the website build intentionally omits Apple's association file.
6. **Refresh website maintenance documentation.** `apps/website/README.md:30` describes a catch-all rewrite, but hosting now serves generated route HTML and an explicit shared-post rewrite. Its artwork checklist also describes missing assets while a favicon and live social-preview image exist. Asset approval itself remains unverified.

## Dependency freshness examples

Live `npm outdated` results on the audit date:

| Dependency | Installed | Latest reported |
| --- | --- | --- |
| React / React DOM | 19.2.8 | 19.3.0 |
| Firebase browser SDK | 11.10.0 | 12.19.0 |
| Firebase Admin | 14.2.0 | 14.4.0 |
| Firebase CLI | 15.19.1 | 15.30.1 |
| Nodemailer | 9.0.5 | 10.0.10 |

Nodemailer's allowed range reports 9.1.1 as wanted. Major upgrades require compatibility review; newest does not automatically mean required.

## Verification

- `npm run check:website`: passed TypeScript, source invariants for 10 public routes, production build, metadata generation for 13 routes, and Android association generation.
- All 10 sitemap pages returned HTTP 200 from `https://indigenworld.com`.
- Sitemap, robots.txt, social-preview JPEG and Android association JSON returned HTTP 200 with appropriate content types.
- Live `/assets/index-pFO6GGa0.js` was identical to the newly built local main bundle. This verifies that bundle, not every deployed asset or backend revision.
- A read-only GET to `/api/public-forms` returned JSON HTTP 405, consistent with the POST-only handler. Actual form delivery was not exercised.
- Shared UI packages, dictionary, website, admin, TribeStudio and team website builds passed. Backend bundling initially encountered a sandbox filesystem restriction; the approved unrestricted retry succeeded.
- Contract validation passed: 20/20 fixtures across 24 schemas.
- Backend helper suite passed: 437 tests, zero failures.

## Scope limits

This review examined project structure, product documentation and releases, public website source/configuration, related backend form handling, npm dependencies, workspace builds and live HTTP responses. It is not an exhaustive line-by-line security review. Mobile compilation/device testing, Firebase emulator integration tests, authenticated production workflows, live dictionary data, visual browser testing, accessibility and Lighthouse measurements were not performed. No production content, dependencies or deployments were changed.
