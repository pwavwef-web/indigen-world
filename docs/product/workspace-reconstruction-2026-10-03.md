# Workspace reconstruction — preservation and verification record

Scope: `apps/tribestudio`; public website and Admin are outside this phase. Repository content is local, not a production release. Existing uncommitted changes were retained.

Audit and implementation began 2026-10-03; final local verification continued 2026-10-04. The original dated release folder is retained.

## Reference inspected

AZ Studio source was inspected in `az-learner-nexus/03_codebase/pwavwef-web.github.io`: FilmStudio, ImageStudio, WorkspaceNav, project and UI components. Its useful qualities are grouped stages, explicit short icon labels, project context kept above tools, adjacent source/preview panels, small card headings, contextual error/retry feedback and progressive disclosure of advanced tools. No claim is made that its deployed authenticated application was inspected. Indigen uses its own blue/ink identity, existing brand mark and workflow-specific navigation.

## Functionality preservation checklist

| Surface / routes | What current code implements | Preservation boundary |
|---|---|---|
| `/studio` | Real submission counts, drafts/revisions, notifications, open campaigns | Counts come from fetched records; no synthetic analytics |
| `/studio/submissions`, `/new`, `/:id`, `/:id/edit` | Five established formats: writing, image, audio, video, translation; category metadata; upload/recording; source and translated text; preview; rights and participant/minor disclosures; local draft pointer; server autosave; duplicate/concurrent guards; withdrawal | Existing IDs, payloads, uploads and consent fields retained. Open posts publish to Explore; campaign submissions go to review |
| `/studio/editor`, `/:projectId` | Persisted projects from idea/script/footage/audio/blank; media library; scene planning; stage; multi-track timeline; text/stickers/music; caption timing; continuity; AI scenes; MP4 render/preview/export history; create post from export | Existing project model, revisions, media ownership, provider grants and export jobs retained. Personal-footage editing does not need approved creator membership |
| `/studio/video`, `/jobs` | AI video request, governance, polling/history, failed jobs, opening finished jobs in editor | Same `canMakeVideo` role predicate and server callables. Paid external providers are not invoked during local verification |
| `/studio/opportunities`, `/:id` | Campaign detail, dates, eligibility, applications, submissions | No invented campaigns/rewards; established campaign gates retained |
| `/studio/published` | Real published records and public URLs | Approval is distinct from publication |
| `/studio/dictionary` | Headwords, parts of speech, multiple senses, examples, paradigms/forms, IPA, definition in Kasem, etymology, source, cultural metadata, recording/upload, entry preview, assistance, own contribution history and withdrawal | Remains dictionary-specific. Completeness is advice, not a submission gate. Draft storage shape retained |
| `/studio/expressions`, `/new` | Expression kind, phrase, meaning, literal meaning, use/context, dialect, source, speaker attribution/consent, explicit publication choice, optional training consent, own history, correction and withdrawal | Expressions remain expressions. Open intake and invited contributor training terms remain separate workflows |
| `/studio/profile`, `/notifications`, `/help` | Public/private creator fields, visibility, photo, profile completion, role/application status; real notifications; guidance | Existing storage, privacy and profile service preserved |
| `/workspace` | Legacy lexical-entry creation/drafts/submission and validator decisions, language selection, consent/licence/cultural tiers | Same Firestore rules and `decideReview` audit path; not silently merged with modern dictionary/expression intake |
| `/contributor`, `/assignments`, `/{uid}/{work}?item=` | Invitation-only account, existing SMS deep links, task prompts and instructions, returned-first selection, filters/search/position memory, translations, alternatives and use notes, local draft recovery, autosave, revision checks, unsure/skip, review confirmation, locking during review | Own-account access and callable checks retained. A skipped prompt is not a submitted record |
| `/contributor/contributions`, `/activity` | Cross-assignment drafts/history, statuses, review timing and previous decisions | Saved records, rounds, correction links and reviewers' feedback retained |
| `/contributor/guide`, `/kawuri` | Contextual guide and assist modes for meaning/context/draft checks; existing consent-aware responses | Assistance never silently replaces contributor text; underlying requests preserved |
| `/contributor/rewards`, `/streak` | Real points balance, configured conversion/minimum, airtime/data requests, redemption history, delivered/pending/approved/rejected states, activity streak | Values stay backend-derived; no suggestion that points are withdrawable cash |
| `/contributor/account/{profile,security,notifications,payments}` | Self profile/contact, password reset/change, privacy/notification settings, bank verification/statement upload, MoMo ownership codes, preferred/remove method, payment status/reasons and statement link | Existing financial and verification rules, finance authority and server services preserved |
| `/contributor/support` | Private support link, support/recovery contact flows | Existing bearer-link privacy remains; Analytics stays disabled there |
| Contributor sign-in / activation / terms / denied / wrong owner | Email/password and password-reset code, temporary-password activation, current training agreement, invitation denied/error, validator Google sign-in | No authentication bypass or new authority |
| `/contributor/review?desk=&status=` | Contributions, sentences, adverts and names; all statuses from DESKS; source/evidence/media; dictionary matching; permission context; decisions/reasons; sentence comparison/private audio/dialect competence | Same decision authority and transition rules; no bulk decisions. New optional read guards reject stale evidence in transactions |
| Unknown routes and loading/error boundaries | Recoverable errors and return links | Kept accessible and scoped to the correct workspace |

## Established limits and defects

- `answerTargetsAvailable` is deliberately false in ReviewDesk until backend deployment for those targets is confirmed. This reconstruction does not enable it merely because local source supports it.
- Queue reads load at most 60 records per status. Search/category filters apply to that loaded set. The UI explicitly says so; no claim of a global oldest-first queue is made.
- Dataset documentation proposes speaker/audio registries, structured dialogues, cultural-concept registries and gold/expert promotion. Those are not established portal capabilities and were not invented here.
- Review, publication and training permission are separate where the existing intake implements them. Invited contributor terms currently require training permission; the existing local changes implementing that agreement were preserved.
- MoMo SMS, statement signing/finance review and paid AI rendering require configured external services. Emulators cannot prove real handset delivery, real bank verification or production provider success.
- Initial presentation defects included three different shells, repeated technical chrome, mixed glass/cream/dark themes, promotional contributor imagery, decorative reward art, and unlabelled editor glyphs. Native dialogs replace custom creator overlays that lacked browser-managed focus trapping.
- Original submission reviews rechecked status in a transaction but did not bind review to the displayed revision. Optional expected status/version guards now preserve compatibility while detecting stale review. Existing sentence revision checks remain.
- The original creator access gate fell through after a failed account read. Its existing status rules now run behind a recoverable read-error state; a failed read cannot open the workspace or create a profile. An explicit retry reloads the account.

## Implementation and verification

Production deployment and external publication are not authorized by this task.

### Reconstructed presentation

- `interface/WorkspaceFrame.tsx`, `icons.tsx`, `workspace.css` and `screens.css` provide the shared map, role identity, command palette, compact process guides, focus-managed mobile drawer/dialogs, blue/ink tokens, form/table/card families and reduced-motion rules. Creator, contributor, validator and legacy lexicon screens use this foundation. Creator sign-in/restricted-access states also use it; failed sign-in can be retried without an unhandled promise.
- Creator entry, format selection, content library/detail/preview, project creation and editor controls were rebuilt around starting, continuing and managing real work. Secondary profile, opportunity, notification, assistance and generation screens use the same foundation and retain their service logic.
- Contributor entry and task progression replace promotional imagery with actual assignments and next actions. Account, payment, guide, history, activity, assistance, streak and redemption surfaces keep their existing services and factual states. The stable context module avoids presentation reloads losing the current contributor session.
- Validator desks now have a scannable status queue, search/category filtering, source/translation comparison, private media, consent and audit details, explicit consequences and consistent decision controls. Unsaved decisions are protected during navigation; a changed record disables decisions while preserving notes. Creator, advert and name callables accept optional expected-state guards in their existing transactions.
- Video editing keeps a recovery copy scoped to the authenticated account and project. Edits, automatic media changes, undo and redo refresh it; users choose whether to restore it. Serialized saves retain edits made while a save is running. Media/library failures expose retry actions. Dictionary and expression draft writes flush on leaving the screen rather than relying only on a debounce timer.
- Submission detail observes the real record so asynchronous publication changes update the displayed state. No synthetic analytics, generated community evidence, new reward rules, bulk decisions or public website changes were introduced by this reconstruction.

### Checks performed

| Check | Result and practical scope |
|---|---|
| `npm run check --workspace @indigen-world/tribestudio` | PASS: TypeScript, 68 tests, production Vite build. Includes failed-save recovery for redo/automatic edits, serialized saves that retain edits made during a pending write, and creator access-read failure/retry. The repository validation also checks 16 lazy routes, error states in 13 data pages and shared-kit coverage across 66 screens; that static check is not a claim that 66 authenticated flows were exercised in a browser. |
| Functions TypeScript build | PASS, including optional compatible review guards. |
| Video/editor, studio video, contributor portal, daily tasks and expression Node suites | PASS: 122 tests. Actual FFmpeg portrait/landscape exports verify dimensions, duration and layered content; paid AI providers are not called. |
| Creator callables, contributor workspace and expression emulator integration | PASS: 25 tests. Covers roles, consent, real transitions, correction rounds, withdrawal, account/privacy/payment rules, audit records and a rejected stale review with unchanged records. |
| Creator/contributor Firestore and storage rules | PASS: 54 tests across fresh Firestore fixtures (33) and storage (21). An initial storage run lacked emulator environment variables. A repeat of the original Firestore suites reused fixed fixture IDs and produced four create-versus-update failures; fresh project namespaces passed without weakening rules. |
| Name-request units and advertising rules | PASS: 28 tests. Naming validation/notifications and server-controlled advert lifecycle permissions remain intact. |
| Changed-source whitespace check | PASS after removing a stray blank-line space. |

The total is **297 passing tests** across these suites. Frontend final output is saved in `outputs/workspace-reconstruction/final-app-check.log`; rules and final review outputs are beside it. Rendering and integration suite results were also inspected directly in the terminal.

### Browser evidence

All browser checks used the native in-app browser against `http://127.0.0.1:5180` and local Auth/Firestore/Storage/Functions emulators. `scripts/seed-workspace-ui.mjs` refuses non-local endpoints and creates clearly labelled test accounts and records. No production records were changed.

| Journey / surface | Observed result |
|---|---|
| Creator video | Created a blank project, added a three-second title scene, observed server save, rendered a real 720 × 1280 MP4 and saw completed export/history/post actions. Download was not clicked. |
| Open writing post | Entered and saved content, reviewed permissions and actual preview, published through the established open-post path, observed the asynchronous published record, then withdrew it and observed the withdrawn state. |
| Audio draft | Uploaded a valid one-second test tone through the native file chooser, observed upload completion and saved attachment; native audio reported duration 1, readyState 4 and no media error. This proves upload/playable preparation, not microphone capture on real devices. |
| Campaign writing | Saved and submitted using the required approved creator membership; observed Submitted with publication permission off. An initially incomplete test membership was correctly refused. The validator recorded a reasoned request for changes on the phone layout and the item left the waiting queue. The creator saw the feedback, reopened the original draft, corrected and previewed it, and resubmitted: observed Resubmitted with the same ID, feedback and publication permission off. |
| Contributor correction round | Submitted a real local assignment through the review dialog; validator rejection returned feedback and preserved the entered translation; contributor corrected and resubmitted it, observed Awaiting review and next-task progression. |
| Concurrent review | Changed a selected local record through the emulator; saw the stale warning, retained notes and disabled decision button. Loading current evidence restored the current revision. |
| Creator secondary routes | Opened library, opportunities/detail, profile, notifications, guidance, generation/job history, dictionary and expression forms; inspected real fields, empty/populated states and navigation. These surface checks do not prove paid-provider completion. |
| Contributor secondary routes | Inspected assignments/history/activity, guide/assistance, profile/security/privacy, bank/MoMo settings, points and streak surfaces. External SMS and finance outcomes are covered only to the configured emulator boundary. |
| Other validator desks | Inspected populated sentence comparisons and legacy lexicon tools, plus honest empty advert/name queues. Name/advert authority is checked by automated tests; no real advert or name was published. |
| Responsive/focus | Creator, contributor, editor and review layouts inspected at a 390 × 844 viewport with no document-width overflow. Native navigation drawer opens with focus, closes with Escape and returns focus to its trigger. Editor tool labels/save state remain visible; phone preview precedes timeline. Desktop screenshots were also inspected. |

Representative compressed native screenshots are included in the [release post](../../apps/updates-blog/posts/2026-10-03-workspaces-rebuilt/README.md). They depict local test data, not production availability or genuine cultural submissions.

### Remaining release verification

No implementation-blocking ambiguity remains. Configured paid AI, production OAuth, real microphone devices, handset SMS and bank/finance delivery were not exercised; those need their real environments before claiming production end-to-end success. Existing unavailable answer targets and queue-size limits remain explicit above. The legacy dictionary draft storage key remains compatible with its existing browser-wide format; video and expression recovery are account-scoped.

Local Functions emulation on the installed Node 24 runtime required the ignored firebase-tools runtime to accept `ERR_REQUIRE_ASYNC_MODULE` alongside `ERR_REQUIRE_ESM` when importing the existing ESM Functions bundle. This was a local dependency workaround, not a committed infrastructure change. All emulators used demo/local resources.

The release folder includes `post.html`, `README.md`, `share.md`, five actual image assets and upload/credit instructions, and is linked from the existing post index. The article and sharing URL remain unpublished for Chinedum’s handoff.

### Production release preparation — 2026-10-04

The owner authorised deployment after the local implementation handoff. The release was reconciled in an isolated checkout based on current main (80ded21), preserving the newer governed corpus intake/reference/review/release routes, current training terms and recognition-history defaults. Corpus navigation and capture use the shared workspace foundation; dataset categories, source/rights evidence, qualification checks and release rules remain those supplied by current main. No website, rules, indexes or unrelated Functions changes are included in the release diff.

The reconciled release passed the Functions build, frontend typecheck/68 tests/production build, and 71 contributor/expression/name regression tests. The production build explicitly sets VITE_USE_EMULATORS=false. The planned backend deployment is limited to decideSubmission, decideAdCampaign and decideKasemNameRequest. Firebase authentication and the existing production functions were confirmed; release completion evidence follows after rollout. The original working directory and unrelated changes remain intact.
