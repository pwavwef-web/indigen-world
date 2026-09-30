# Indigen World Labs

**Deployed September 30, 2026:** [Indigen World Labs](https://indigenworld.com/labs), version 0.1.0 signed-in alpha. Deployment details and verification limits are recorded in [the release post README](../../apps/updates-blog/posts/2026-09-30-indigen-world-labs/README.md).

Labs is an integrated website feature at `/labs`, using the shared Firebase project and accounts. The registry lives in `packages/contracts/labs.mjs`, with record types in `labs.d.ts`; UI modules live in `apps/website/src/features/labs`; the trusted gateway is `services/functions/src/labs.ts` and is exported by the existing Functions entry. No second account database or separate application backend is introduced. A future Labs domain can serve the website build with the same Firebase coordinates and authorised Auth/App Check domain configuration.

## Run locally

Use the repository's supported Node 22.12+ runtime, Java for the Firestore emulator and installed workspace dependencies (`npm install` if needed). In separate terminals at the repository root:

```powershell
npm run emulators:labs
```

```powershell
npm run seed:labs
npm run dev:labs
```

Open `http://127.0.0.1:5173/labs`. Local demonstration accounts:

- Member: `labs-member@example.test`
- Admin: `labs-admin@example.test`
- Local-only password: `LocalLabsDemo42!`

These accounts and fixtures exist only in the disposable demo project. The seeder refuses non-demo projects or missing emulator hosts. Fixtures contain labelled test forms and meanings, not Kasem translations. Source filtering excludes development fixture records from production. The UI explicitly labels local development and fixture review states.

For an empty-content check, start fresh disposable emulators and run `npm run seed:labs -- --empty` to create only the accounts. This option does not remove existing records. After checking the empty practice state, run `npm run seed:labs` to add the labelled workflow fixtures.

The local runner generates ignored `.labs-local/` and `.labs-local.firebase.json`. It loads only `labsApi` through a demo-only emulator entry using the same compiled handler. This avoids a pre-existing Node 24/Firebase CLI full-bundle loading failure (`ERR_REQUIRE_ASYNC_MODULE`, followed by a `jose` CommonJS compatibility error with the ESM fallback flag). Production still exports `labsApi` through the normal `src/index.ts` bundle. This local helper never deploys or changes production configuration. Do not deploy its temporary configuration.

## Workflows

- `/labs`: home, two registry-backed previews and the primary Explore experiments action.
- `/labs/experiments`: text search, category and lifecycle filters.
- `/labs/kasem-practice`: selectable topics from available reviewed sources, up to six questions, meanings, whole-expression/sentence matching, and listening only with publication-reviewed audio evidence. Results, per-question reports and source links. Exact source text is preserved. Ambiguous spellings, duplicate meanings, mixed dialect topics and multi-sense glosses are skipped. Honest empty/error states replace unsuitable content.
- `/labs/cultural-story`: source selection (up to five), audience, length, format, context, structured templates and an editable creative section. Save privately, reopen, revise, copy/export with source references and delete. Source snapshots remain immutable through later edits and withdrawal of an original source; they are historical notes, not a promise of current source availability. Saved work can be retrieved/deleted and exported while execution is paused or retired.
- `/labs/activity`: paginated private drafts, saved practice sessions and reporter-visible feedback/status/responses.
- `/labs/updates`: actual published experiment updates, with an empty state until admins publish.
- `/labs/admin`: trusted admins manage enabled/paused state, access, lifecycle, version, limitations, tester access, feedback and separate internal notes; publish updates; inspect real aggregate counts and paginated audit events.

Default registry versions are `0.1.0`, alpha and signed-in. Configurations in `labsExperiments` override access, status, availability, version and limitations. Lifecycle never grants access. Public trials may be enabled by admins; trial practice stays in the browser, and private draft saving, feedback and AI assistance still require an account. Administrators may test invite-only experiments but cannot bypass paused/retired/graduated controls. Admins cannot read other accounts' private drafts or sessions.

## Reviewed sources and integrations

The server samples up to 300 published dictionary entries, 150 published expressions, 60 gold knowledge records and 150 approved pronunciation submissions. The bounds are deliberate; an empty topic is about this sample, not a claim that the whole archive lacks content. Dictionaries/expressions additionally require explicit `authenticationStatus: reviewed | verified`. Culture and literature require gold review, confirmed source rights, explicit public display permission, open cultural access and documented terms. Restricted and unreviewed material is excluded.

Listening accepts approved pronunciation submissions only with matching current spelling, publication consent and a public recording URL. It also supports the existing owner-reviewed pronunciation pilot's provenance: exact entry, headword, meaning and dialect; primary published URL; review timestamp; approvedBy; explicit owner approval. AI-generated owner-reviewed audio keeps a visible origin label. A plain dictionary `audioUrl` without review evidence is insufficient.

Dictionary links use the existing `/dictionary?entry=…` selection support. Expressions link to `/contribute`. Story creation links to the working TribeStudio submission route. Gold source notes have stable knowledge record references without exposing the private contributor workspace to public readers. Kawuri assistance uses the existing `generateStructured` Vertex adapter, service-account authentication, model/region settings and rate limiter. No browser credentials, keys or new AI provider are introduced.

## Optional automatic assistance

`LABS_STORY_AI_ENABLED=false` is the default. Guided editing, saving and export work without AI. Set it to true only after verifying the Vertex API, runtime account permissions, current model/location and App Check settings. Demo projects intentionally disable automatic assistance and never simulate success. The UI explains unavailable configuration. The backend enforces access, per-minute limits and five requests per member per day; validates inputs; rebuilds public sources; labels output as creative/unverified; catches provider failures without altering the draft; and checks the kill switch again after the provider response. User context and chosen public meanings are sent only when the user requests assistance. AI suggestions are reviewed before application, never automatic replacements or verified Kasem.

## Feedback, privacy and measurement

Feedback types are bug, language issue, usability, suggestion and positive feedback. Reports store the experiment/version, description, optional steps, optional contact consent and an owned question/draft reference. Question reports include the canonical public source reference, without attaching private session text or recordings. Question versions come from stored sessions; general report versions come from current server configuration. A language report never edits the source. Labs has a separate admin review queue; future contributor correction integration should link the report ID to an independently reviewed submission/decision.

Internal notes live in `labsFeedbackNotes`; reporter-visible status and response live in `labsFeedback`. Report statuses: submitted, reviewing, planned, resolved, closed. Audit events record config changes, tester access, feedback decisions and published updates. Draft ownership, revision checks, source snapshots, timestamps and scores are controlled server-side. No ordinary client can grant itself a role or tester invitation, change controls, or read internal notes. All direct client writes to Labs collections are denied. See `labs-security-analysis.md` and the emulator rules tests.

Server aggregates record experiment opens, signed-in session starts/completions, public trial starts separately, successful draft saves, feedback submissions and related-product link opens. They contain counts and timestamps, without account IDs, drafts, descriptions or recordings. Completion rate = completed signed-in sessions / started signed-in sessions since collection began. Incomplete sessions stay in the denominator; repeat completion requests count once. Public trial completions are not measured. Other counts represent successful requests, not unique participants. Rate limiting uses the existing backend helper; guest IPs are hashed into rate-limit keys, not stored as raw IPs by Labs.

Queries use 20-record pages plus one lookahead, ordered by createdAt (audit: occurredAt) and document ID. Composite indexes are included for owner/status/experiment filters; large private text/snapshot fields are exempt from indexing. A cursor is validated against its owner/filter. Private content is never attached to analytics.

## Checks and launch handoff

Run `npm run test:labs` with emulator ports free. This builds the Functions bundle, runs focused tests and runs the callable/rules suites in disposable emulators. `npm run check:website` covers website typecheck, site validation, production build and route metadata. `npm run test:contracts` validates existing schemas/fixtures. No repository lint command exists for this website/backend. Browser verification and results are recorded in the release post README.

Checklist for subsequent releases and optional activation (the initial deployed release evidence is linked above):

1. Review this scoped implementation alongside existing repository work; integrate it into the production-main release workflow. The normal website predeploy gate remains intact.
2. Review the prototype rules and callable checks; confirm the supported Node 22 production function load. Deploy only the intended changes: `labsApi`, reviewed rules/indexes and the website Hosting build, through the existing conventions. The rules/index files include other repository changes; prepare a reviewed release snapshot before deployment.
3. Wait for indexes to become ready. Confirm Firebase Auth providers and the website domain are authorised. If `ENFORCE_APP_CHECK=true`, configure/verify the website reCAPTCHA Enterprise key and domain policy before exposing callables.
4. Verify eligible production dictionary/expression sources, meaningful practice topics, listening provenance and cultural source rights. Do not import demo records. Initialise/review both experiment controls and tester invitations with designated admin accounts.
5. Test guest/member/other-owner/admin roles on the actual host, complete practice, save/reopen/export/delete a private draft, submit/review feedback and confirm kill switches. Verify links to dictionary, contributor routes and TribeStudio. Optionally enable/test the real Vertex assistant; provider success has not been verified by this task.
6. Publish a Labs update describing actual availability. Update the release post’s availability statement only after deployment and live verification. Let Chinedum upload the screenshots, publish the Blogger article and insert its URL into `share.md`.

Chinedum authorised production deployment on September 30, 2026. Website Hosting, `labsApi`, Labs rules and indexes were released. Production verification found 32 eligible sources and one practice topic in the bounded sample; a six-question practice session, private draft save/reopen/revise/delete, feedback and owner isolation passed using temporary accounts that were then removed. Aggregate counters include these verification requests. Both experiments use the default enabled, signed-in alpha controls; no tester invitations or public experiment updates were created. Automatic assistance remains disabled. The in-app browser could not load the public host during verification; HTTP and Firebase client SDK checks passed. Google sign-in, production admin UI, audio playback and successful provider output remain unverified. DNS, Blogger publication and community messages were not changed.
