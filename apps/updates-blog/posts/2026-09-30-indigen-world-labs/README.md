# Small experiments, living culture: introducing Indigen World Labs

Status: **Signed-in alpha deployed September 30, 2026. Blogger article remains a draft for Chinedum to publish.** Public site: [Indigen World Labs](https://indigenworld.com/labs). DNS, Blogger publication and community sharing were not changed.

| Field | Value |
|---|---|
| Title | Small experiments, living culture: introducing Indigen World Labs |
| Labels | `Indigen World`, `Labs`, `Kasem`, `Creators`, `Feature` |
| Search description | Practise with reviewed Kasem material, shape private stories with retained sources, and help improve two focused Indigen World Labs experiments. |
| Custom permalink | `indigen-world-labs` |
| Article | `post.html` |
| Sharing copy | `share.md` |
| Images | `images/labs-mobile.jpg`, `images/labs-practice.jpg`, `images/labs-story.jpg` |

## Implementation evidence and limits

- Integrated React website routes at `/labs`, using the existing History API router, shared Firebase app/accounts, server custom-role policy, rate limiter and Kawuri Vertex adapter. Registry and types: `packages/contracts/labs.mjs`, `labs.d.ts`. Backend: `services/functions/src/labs.ts`. No duplicate identity store.
- Functional reviewed-content practice, private guided story drafts, feedback/activity/statuses, admin controls, updates, invitation gates, aggregate measurement and audits. Dictionary source links and TribeStudio creation destination reuse working routes.
- Sources are a bounded archive sample. Dictionary/expressions require explicit reviewed/verified publication. Gold cultural/literature records need confirmed source rights, public permission, open cultural access and documented terms. Reviewed pronunciation submissions and exact-sense owner-reviewed pilot provenance are supported; AI-generated origins stay labelled. Fixtures never enter production content.
- Automatic assistance defaults to disabled. Guided templates, editing, saving and exports work without it. The existing server-side provider is wired, with validation, access checks, a daily allowance and safe failure handling. No successful live provider call was made in this task.
- Private draft ownership excludes admins. Internal notes are stored separately from reporter-visible feedback. Direct client writes are denied. Pause/retirement/graduation enforcement runs on the server. Saved work is retrievable/deletable even while execution is unavailable.
- Admin summaries use real server aggregates. Deployment verification generated a practice session, two draft saves and feedback; aggregate counters include those requests even though the temporary accounts and individual records were removed. These counts are not a claim about community adoption. Local screenshots contain only disposable test data.
- Live email sign-in, production content, private member workflows and guest restrictions are verified below. Successful Vertex output, real audio playback and a signed-in trusted-admin browser check remain unverified. Runtime notes are in `docs/product/indigen-world-labs.md`; security analysis in the locally retained `docs/product/labs-security-analysis.md`.

## Verification

- `npm run test:labs`: **25 passed** (nine content/access policy tests; twelve callable workflow tests; four Firestore rules tests). Includes guest/admin permissions, owner-only records, concurrent revisions, retained source snapshots, question feedback persistence and versioning, separated internal notes, pause/invitation/retirement/graduation, pagination, approved audio, cultural rights, deletion, and the real handler's injected provider-failure path. No live provider charge or successful generation is claimed.
- `npm run check:website`: passed TypeScript, existing site validation, production build and metadata generation for all seven Labs routes (23 website routes overall). `npm run build:functions`: passed TypeScript and production bundle generation. Existing Apple association-file warning remains because no Apple app IDs are configured.
- `npm run test:contracts`: passed all 21 existing fixtures across 25 schemas. No website/backend lint command is configured in this repository.
- Browser: checked **1440×1000 desktop, 390×844 mobile and 360×800 narrow mobile**. No horizontal overflow observed on home, practice or story forms. Exercised catalogue search/filter and empty results; account sign-in/out; empty reviewed archive; meaning and whole-expression practice, results, saved activity and contextual reports; private draft source selection/template/save/reopen; copy success and text export controls; missing-AI explanation; unavailable backend; trusted admin summary/review/update/pause; and reporter-visible response without internal notes. A trusted admin was also denied a member's private draft in the UI. Deletion and injected provider failure were verified through the callable tests. Real audio playback and successful live Vertex output remain launch checks. The exported download was triggered in the browser; its downloaded contents were not reread during this verification.
- Screenshots capture the actual local build with simulated review labels: the saved story is a full-page desktop capture, practice shows an answered expression question, and the mobile cover shows the home at 390 pixels. All assets are stored under `images/`.

The checks above describe local implementation verification. Production evidence is recorded separately below.

## Production release evidence

- Authorised by Chinedum on September 30, 2026. Firebase project: `project-kassena-7e026`. Application/backend code: `ed9f3292c9e5c77e1ebf8d7f66b05cd3292981e0`; follow-up indexes: `377a3e4`. The website's production-main gate passed before release.
- Website Hosting target `indigen-world` released at **2026-09-30 22:30:33 UTC**. Finalised version: `5c692d7516a5c1e9`; live release ID: `1790807433479000`. All seven Labs routes returned HTTP 200 at `indigenworld.com`, with their expected page titles. The Firebase Hosting domain also returned HTTP 200. Live `LabsPage-AjYkgxoQ.js` and `LabsPage-pPpD4h95.css` SHA-256 hashes match the release build.
- `labsApi` created in `us-central1`, using the normal production Functions bundle and Node 22. Firestore rules and indexes released. Existing production rules were compared before deployment: only the Labs block changed. Existing indexes and field overrides were preserved. Five filtered indexes became READY; a live guest check then identified missing unfiltered feed indexes, addressed by the follow-up index release.
- Backend CLI reported successful creation/rules release, then exited with an Artifact Registry cleanup-check connection timeout. A subsequent live callable bootstrap returned HTTP 200 and all signed-in workflow checks below passed. Website deployment exited successfully.
- Live bootstrap confirms both experiments **enabled, alpha, signed-in, version 0.1.0**, `development=false` and `aiEnabled=false`. No development fixtures were imported. The bounded production sample returned **32 eligible sources and one practice topic**; this is not a count of the whole archive.
- Two temporary non-admin accounts verified production email sign-in, ordinary-member admin denial, six-question practice completion and saved activity, private draft save/reopen/revision with canonical sources, owner Firestore access, other-account callable/Firestore denial, denied direct writes, feedback persistence/private activity, disabled-assistant error and owner draft deletion. Both accounts, their individual Labs records and their signed-in rate-limit records were removed after testing.
- `indigenworld.com` is an authorised Firebase Auth domain and email/password is enabled. No App Check enforcement or AI/provider settings were changed. Guest discovery works; guest source access, saving and administration were denied.
- Live rendered browser inspection could not complete because the in-app browser repeatedly returned a network error. Public HTTP checks and live Firebase client SDK workflows passed after retrying intermittent network failures. The existing screenshots remain clearly labelled local captures. Google sign-in, live UI admin review, audio playback and successful AI generation are not claimed.

Final production verification completed at **2026-09-30 22:54 UTC**: all **eight Labs composite indexes are READY**. Live guest updates returned HTTP 200 with the honest empty feed (zero published updates). Unfiltered and experiment-filtered updates, unfiltered and status-filtered admin feedback, and the admin audit queries all executed successfully in production. No updates were published just to fill the feed. Member/other-owner checks above used real Firebase client authentication; administrative query checks used the authorised server SDK, not an admin browser session.

## Image credit and Blogger upload

All JPEGs are screenshots captured from the implemented application in the local browser on September 30, 2026. Credit: **Indigen World — local Labs development screenshots, September 2026**. They contain labelled development fixtures and disposable local tester activity, without real private member material. The home’s typography and geometric experiment previews are product UI, not documentary cultural images.

1. Create a Blogger draft with the title, labels, search description and permalink above.
2. Paste `post.html` into Blogger’s HTML editor.
3. Upload the three actual JPEG assets with Insert image → Upload from computer. Replace each local `images/...jpg` source with its uploaded Blogger URL. Preserve descriptive alt text and development-build captions. Keep the mobile cover at a readable width, as specified in the article HTML.
4. Review the production evidence and availability paragraph before publication. Keep the local screenshot captions and the limits on automatic assistance, audio playback and live admin/UI verification. Optional provider activation requires a separate verified release step.
5. Chinedum publishes and shares after that handoff. Replace the clearly marked URL placeholder in `share.md` with the published article URL.

Older release posts remain intact. Publication and sharing are not performed by repository preparation.
