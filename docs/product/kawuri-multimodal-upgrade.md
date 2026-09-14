# Kawuri multimodal upgrade — implementation and handoff

Status: working client upgrade; full multimodal production delivery is blocked on the active backend source. Inspected September 13–14, 2026.

## Inspection findings

- Mobile entry point: `apps/mobile/lib/features/kawuri/kawuri_screen.dart`, linked by `/kawuri` in `app_router.dart` and the existing Kawuri floating button. The shared Kawuri symbol remains intact.
- Chat: `kawuri_service.dart` calls Firebase `kawuriChat`. Before this change, the callable response was a complete string, errors often became offline-guide answers, and history lived in two unscoped SharedPreferences keys.
- Backend source: `firebase.json` points to `services/functions`. Its tracked source files, package manifest and configuration are deleted in this working tree. Inspection used `git show HEAD:<path>` for architecture evidence only. Those deletions were preserved; historical code does not establish what is currently deployed.
- Historical chat adapter: Vertex AI `generateContent`, authenticated with Application Default Credentials. Functions service account owns the provider credential. No client provider key exists.
- Historical grounding: `kawuri-dictionary.ts`, `kawuri-grammar.ts` and `kawuri-corpus.ts` provide dictionary, grammar and approved sentence evidence before the model call. Instructions prohibit fabricating Kasem words and assembling unattested sentences from dictionary words.
- Mobile dictionary: `FirestoreDictionaryRepository.watchPublished` in `collection_data.dart` queries `dictionaryEntries` with `isPublished == true`. `DictionaryEntry` carries renderings, meanings, attribution, dialect and recorded audio. Existing entry detail supports source inspection and corrections.
- Auth: Firebase Auth state exposes `currentUidProvider`. Existing feedback requires a signed-in, traceable contributor.
- Storage/database: private conversations were local preferences; dictionary and cultural records are in Firestore; local contributions use Drift. Firestore has `kawuriVerdicts`, approved linguistic records, entitlements and Studio video job rules. Storage has private `studio-video-jobs/{uid}/{jobId}/{fileName}` results readable by owner/staff and writable only by trusted backend code. There is no authorized Kawuri upload namespace.
- Membership: historical `kawuriChat` applies 20 requests/minute and the membership's daily allowance from `benefitsForUid`. Client `tierBenefitsProvider` describes plan benefits, not accurate remaining usage or reset time.
- Separate Studio video code at HEAD contains Runway visual generation and fal lip-sync adapters, with persisted IDs and private outputs. It has not been wired into Kawuri or assumed configured.

## Implemented behaviour

- Chat-first home using the reference's compact symbol, dark green grid, mint controls, gold accents, welcome copy, horizontally scrolling capabilities and prompt suggestions, honest Recent empty state and accuracy notice.
- All eight requested carousel entries. Image, video and analysis entries say Coming soon. Attachments, camera and microphone explain unavailability without collecting files. Unavailable tools do not submit requests or replace the active available composer mode.
- Suggestions populate editable drafts; none submit automatically. Video and image generation prompts are omitted while their adapters are unavailable. Storyboard help is explicitly text assistance.
- Shared task vocabulary includes all eleven requested task types. `KawuriRequest` carries request ID, conversation ID, user context, task type, prompt, attachment/context/options slots, status, provider and timestamps. The existing callable adapter sends the envelope plus legacy messages for compatibility. Media slots are not an implemented upload API.
- Translation mode first tries exact matches from the existing published dictionary stream. Matched cards show source text, direction, headword, meaning alternatives, attribution, written pronunciation and recorded audio when present. Opening the source uses the existing live dictionary entry/correction screen. No fuzzy match is claimed as a translation. Unmatched phrases use the existing grounded callable.
- Kasem practice offers level and guided conversation/vocabulary/role-play/correction options. The draft supplies the topic. No automatic Learn writes and no synthetic speech or pronunciation scoring.
- Story/contribution modes route through the shared chat adapter with instructions preserving provenance and uncertainty. Their answers can open the existing contribution form as editable working notes. An AI-assistance disclosure is appended to submission notes; source/rights/auth/review requirements remain enforced by the existing workflow. No AI answer is automatically inserted as a dictionary entry, source or confirmed cultural claim.
- History search, 20-row UI pagination, rename, confirmed deletion, reopen, clean new chat, retry/regenerate, explicit copy/share, and explicit report plus existing reviewed feedback/correction controls. Membership opens the established membership screen without invented remaining counts.
- Stable conversation IDs retain late replies in their original conversation even after new chat; an older reply cannot clear a newer chat's busy state. Duplicate sends are blocked while pending. Stop waiting ignores a late reply and honestly explains that the existing callable cannot cancel server billing.
- Draft/configuration persistence; account-scoped private device history; recovery of interrupted text requests as retryable failures. Offline history remains local. Responses are never animated to impersonate streaming.
- Typed task status vocabulary; bounded callable and controller waits; distinct quota, permission, authentication, invalid request, timeout and unavailable-service copy. Prompt/context payloads and provider error bodies are not logged by the client.
- Input length is rejected explicitly before the existing 4,000-character server input ceiling rather than silently cut. Returned `finishReason: MAX_TOKENS` or `incomplete: true` is preserved and explained. Historical backend does not return finish reason; complete truncation detection still needs server work.
- Accuracy notice pinned above the composer at normal text sizes and scrollable at enlarged text sizes. Multiline keyboard-safe composer, minimum 48px primary controls, reduced-motion handling for the shared orb, lazy scrolling lists and no home-feed video downloads.

## Changed files

- `apps/mobile/lib/features/kawuri/kawuri_screen.dart`: screen integration, mode/options dialogs, message actions, history and contribution handoff.
- `apps/mobile/lib/features/kawuri/kawuri_report.dart`: explicit report form using the existing authenticated verdict/review service.
- `apps/mobile/lib/features/kawuri/kawuri_feedback.dart`: 48px feedback touch targets.
- `apps/mobile/lib/features/kawuri/kawuri_home.dart`: home, carousel, suggestions, empty library, accuracy notice and composer.
- `apps/mobile/lib/features/kawuri/kawuri_tasks.dart`: shared capability/request/status vocabulary and implemented-adapter availability.
- `apps/mobile/lib/features/kawuri/kawuri_models.dart`: persisted task context, source cards, conversation identifiers and incomplete-output flag.
- `apps/mobile/lib/features/kawuri/kawuri_controller.dart`: account isolation, stable conversations, async race protection, drafts, rename, retry, interruption recovery and serialized writes.
- `apps/mobile/lib/features/kawuri/kawuri_service.dart`: callable routing, dictionary-first exact lookup, error mapping and input validation.
- `apps/mobile/lib/features/kawuri/kawuri_translation_card.dart`: attributed dictionary card and existing audio/source actions.
- `apps/mobile/lib/features/contribute/contribution_form_screen.dart`: optional Kawuri working note and retained AI-assistance disclosure. No other contribution behaviour changed.
- `apps/mobile/test/features/kawuri/kawuri_controller_test.dart`: lifecycle/concurrency, persistence, isolation and failure regression tests.
- `apps/mobile/test/features/kawuri/kawuri_screen_test.dart`: revised home expectations, non-submitting suggestions, attachment availability, keyboard/scaling and history confirmation tests.
- `apps/mobile/test/features/kawuri/kawuri_test.dart`: exact grounding, source round-trip, error categories and unavailable capability tests alongside existing tests.
- `apps/mobile/test/features/kawuri/kawuri_preview_test.dart`: opt-in empty-home screenshot capture without production demo data.
- This document.

## Configuration and data changes

No provider secrets, environment variables, Firestore collections, indexes, Storage rules or server functions were added or deployed. No dependencies were added.

New local preferences key: `kawuri_workspace_v2_<uid>` or `kawuri_workspace_v2_guest`. Stores active conversation/title, messages, history, draft, mode and options. Old unscoped v1 notes are readable only in guest history; they are not silently assigned to a signed-in account. v1 keys are not deleted. This is a device cache, not encrypted server synchronization. UI history is paginated, but the local JSON history is still decoded as a whole; a repository migration is needed before supporting very large histories.

Historical server configuration to verify in the active backend:

- `KAWURI_MODEL`, `KAWURI_LOCATION`, `KAWURI_MAX_OUTPUT_TOKENS`, `KAWURI_THINKING_BUDGET`.
- `ENFORCE_APP_CHECK`, Google project identity from `GCLOUD_PROJECT` / `GOOGLE_CLOUD_PROJECT` / `FIREBASE_PROJECT`.
- Vertex AI API enabled and runtime service account with the appropriate Vertex role.
- Historical defaults are evidence from HEAD, not a recommendation to provision a particular current provider/model.

Availability is deliberately tied to implemented client adapters. Do not flip media availability to true until a server contract and tested adapter exist. A server capability manifest should replace this static gate when the active backend is restored.

## Remaining backend phases — not implemented

1. Restore or identify the current functions checkout and verify deployed APIs. Return authenticated capabilities, effective allowance and reliable reset information. Authorize ownership from Firebase Auth, never from the request's userId field. Preserve guest chat policy deliberately.
2. Add actual streamed response transport with stop/cancel semantics, finish reasons, bounded timeouts and partial-output persistence. Make translation/cultural evidence structured and claim-adjacent; return reviewed sentence matches and verification status directly. The current legacy prompt augmentation is not a replacement for authoritative server routing.
3. Introduce a shared durable job repository and queue with transactional request deduplication, provider IDs/statuses, bounded retry policy, moderation reasons and terminal deadlines. Resume jobs independently of a screen or app process. Only expose real provider progress. Reconcile failures without repeated quota consumption for the same job.
4. Add server-controlled Chat, Image, Video, STT, TTS, Translation and Analysis adapters. Evaluate reusing the existing Studio adapters after reviewing their quota and authorization policies; do not assume its creator workflow is interchangeable with membership-based Kawuri.
5. Define private authenticated upload paths, allowed MIME/size limits, upload finalization/validation, moderation, identity-reference consent, source/rights metadata, retention and deletion. Keep privileged outputs server-write-only. Any webhook must verify the selected provider's signature and protect against replay.
6. Implement image creation/edit/variation and durable video jobs, then task cards, thumbnails, real Recent/library filtering, save/share/download, reel integration and reviewed media contribution handoff. Generated media must retain AI labels when publicly shared.
7. Add speech/language practice recording and consent-based Learn integration only when approved audio and the configured speech backend support it. Never generate purported verified dictionary entries or grammar facts.

Not exercised against a live provider: text callable deployment, media uploads, image generation, video recovery, moderation rejection, provider webhook verification and generation quota reconciliation. Those capabilities are disabled, not simulated. No Android device was attached during the initial `adb devices` check; narrow Android-sized layouts are covered by Flutter widget tests, not a physical-device claim.

## Verification

Final checks on September 14, 2026:

- `dart format --output=none --set-exit-if-changed` on Kawuri sources/tests and the contribution form: 16 files checked, 0 formatting changes needed.
- `dart analyze lib/features/kawuri test/features/kawuri lib/features/contribute/contribution_form_screen.dart`: No issues found. This covers targeted linting and Dart type analysis, not an unrelated whole-workspace cleanup.
- `flutter test --no-pub --concurrency=1 test/features/kawuri test/features/contribute/contribution_form_test.dart` with the optional preview defines: **52 tests passed**. Covers normal text chat through a test service, offline guide, exact translation grounding/source persistence, account isolation, draft/interrupted-text recovery, new-chat races, duplicate sends, stop-waiting behaviour, history search/delete confirmation, unavailable attachment/generation gates, 320/360/412px keyboard layout, 200% text scaling, and existing contribution fields/rights controls.
- `git diff --check` scoped to the changed files: passed.
- The 390×844 logical-pixel empty-state preview was visually inspected after loading test fonts and icons: `.tmp/kawuri-home.png`. It is an actual Flutter widget rendering, with no fabricated creations. The notice is fully visible at normal scale and moves into scrollable content at larger scales.

Screenshot capture is opt-in using `KAWURI_PREVIEW` and optional `KAWURI_PREVIEW_FONT`, `KAWURI_PREVIEW_ICONS`, and `KAWURI_PREVIEW_SYMBOLS` Dart defines. Font paths are local visual-test inputs, not shipped app assets. Without the preview define that test is skipped.

Live provider and physical-device validation remains outstanding for the reasons described above. Passing availability-gate tests is not a claim that image generation, uploads or video recovery work.
