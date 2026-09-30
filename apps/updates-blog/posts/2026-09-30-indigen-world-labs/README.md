# Small experiments, living culture: introducing Indigen World Labs

Status: **Draft article; implemented and verified locally. Production deployment authorised and in preparation. DNS changes, Blogger publication and community sharing are not part of this release operation.**

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
- No production usage counts are claimed. Admin summaries use real server aggregates in whichever Firebase project is configured. Local screenshots contain only disposable test data.
- Deployment and live account/content/provider checks remain outstanding. Exact steps and runtime notes are in `docs/product/indigen-world-labs.md`; security analysis in `docs/product/labs-security-analysis.md`.

## Verification

- `npm run test:labs`: **25 passed** (nine content/access policy tests; twelve callable workflow tests; four Firestore rules tests). Includes guest/admin permissions, owner-only records, concurrent revisions, retained source snapshots, question feedback persistence and versioning, separated internal notes, pause/invitation/retirement/graduation, pagination, approved audio, cultural rights, deletion, and the real handler's injected provider-failure path. No live provider charge or successful generation is claimed.
- `npm run check:website`: passed TypeScript, existing site validation, production build and metadata generation for all seven Labs routes (23 website routes overall). `npm run build:functions`: passed TypeScript and production bundle generation. Existing Apple association-file warning remains because no Apple app IDs are configured.
- `npm run test:contracts`: passed all 21 existing fixtures across 25 schemas. No website/backend lint command is configured in this repository.
- Browser: checked **1440×1000 desktop, 390×844 mobile and 360×800 narrow mobile**. No horizontal overflow observed on home, practice or story forms. Exercised catalogue search/filter and empty results; account sign-in/out; empty reviewed archive; meaning and whole-expression practice, results, saved activity and contextual reports; private draft source selection/template/save/reopen; copy success and text export controls; missing-AI explanation; unavailable backend; trusted admin summary/review/update/pause; and reporter-visible response without internal notes. A trusted admin was also denied a member's private draft in the UI. Deletion and injected provider failure were verified through the callable tests. Real audio playback and successful live Vertex output remain launch checks. The exported download was triggered in the browser; its downloaded contents were not reread during this verification.
- Screenshots capture the actual local build with simulated review labels: the saved story is a full-page desktop capture, practice shows an answered expression question, and the mobile cover shows the home at 390 pixels. All assets are stored under `images/`.

These are local checks, not evidence of a live release.

## Image credit and Blogger upload

All JPEGs are screenshots captured from the implemented application in the local browser on September 30, 2026. Credit: **Indigen World — local Labs development screenshots, September 2026**. They contain labelled development fixtures and disposable local tester activity, without real private member material. The home’s typography and geometric experiment previews are product UI, not documentary cultural images.

1. Create a Blogger draft with the title, labels, search description and permalink above.
2. Paste `post.html` into Blogger’s HTML editor.
3. Upload the three actual JPEG assets with Insert image → Upload from computer. Replace each local `images/...jpg` source with its uploaded Blogger URL. Preserve descriptive alt text and development-build captions. Keep the mobile cover at a readable width, as specified in the article HTML.
4. Before publication, verify the public release using guest, member, other-owner and admin accounts; confirm reviewed content and live availability. Revise the opening and availability paragraph to match those facts. Record the deployment evidence here.
5. Chinedum publishes and shares after that handoff. Replace the clearly marked URL placeholder in `share.md` with the published article URL.

Older release posts remain intact. Publication and sharing are not performed by repository preparation.
