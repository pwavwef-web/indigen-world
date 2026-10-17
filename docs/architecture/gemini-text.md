# Gemini 4 text generation

Deployed and verified 15 October 2026: eleven ACTIVE Functions and a successful
production request logged by `kawurichat-00036-hil` at 20:35:51 UTC. The build,
145 unit tests, 16 community emulator tests and five grounding/callable emulator
tests pass. Shared defaults are `gemini-4-argon` and `global` in
`services/functions/src/gemini-text-policy.ts`. Deployment evidence is recorded
in the matching [release post](../../apps/updates-blog/posts/2026-10-15-gemini-4-text-upgrade/README.md).

## Scope

- `kawuriChat` and `onCommunityKawuriMention`: unfamiliar-request interpretation.
  The model returns a closed JSON plan. Published dictionary records, reviewed
  expressions and trusted templates still supply the displayed language answer.
- `labsApi`: optional English story assistance, sharing `KAWURI_MODEL` and
  `KAWURI_LOCATION`. Existing access checks and `LABS_STORY_AI_ENABLED` remain in
  effect; upgrading the model does not enable the feature.
- Community text and checks: `postZemBotarebuDaily`, `postAmoYeiKasemDaily`,
  `postNNaYeiriSeNBweiDaily`, `postKasemPracticeDaily`, `postIndigenGuideDaily`,
  `recoverCommunityAutomation`, `onCommunityEnquiryReply`, `postZemGhanaNews`.
  These share `COMMUNITY_AUTOMATION_MODEL` and `COMMUNITY_AUTOMATION_LOCATION`.
  Existing schedules, permissions, publication checks and saved drafts remain.

Image generation, video, transcription and media analysis retain their separate
models. The separately deployed assessment worker retains its own configuration;
this release does not enable quality-based points awards or change rewards.

## Compatibility

Google's [model reference](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/4-argon)
lists GA availability, structured output and GenerateContent support. Global
requests use `https://aiplatform.googleapis.com`; regional rollbacks retain
their region-prefixed host. Production uses existing runtime Application Default
Credentials, with no client API key and no credential rotation.

Gemini 4 rejects `thinkingBudget` and MINIMAL thinking. The shared thinking
helper uses `thinkingLevel: LOW` for Gemini 3/4, preserving budget-zero behavior
for Gemini 2.5. Planner output is capped at 2,048 tokens; community and Labs text
at 4,096, including thinking. Sampling parameters are ignored by Gemini 4;
planner/community requests omit temperature. No new retry loop is introduced.
Kawuri retains its 12-second provider timeout and falls back to grounded local
lookup. Community generation rejects unfinished/empty responses before posting.

## Verification and rollout

Build with `npm run build:functions`. Focused unit checks:

```powershell
node --test firebase/tests/geminiText.test.mjs firebase/tests/kawuriGrounding.test.mjs firebase/tests/functionHelpers.test.mjs firebase/tests/kawuriMedia.test.mjs firebase/tests/communityAutomation.test.mjs firebase/tests/communityNews.test.mjs firebase/tests/labs.test.mjs
```

Run community and grounding emulator suites in separate invocations and use
fresh emulator ports when other local suites are active. Java 25 can emit
Unsafe warnings; `JAVA_TOOL_OPTIONS=--sun-misc-unsafe-memory-access=allow
--enable-native-access=ALL-UNNAMED` suppresses those warnings. These are local
shell settings, not production runtime changes. The local Node 24 Functions
emulator loader needs to treat `ERR_REQUIRE_ASYNC_MODULE` for the Functions
bundle as `ERR_REQUIRE_ESM`, then use its existing dynamic-import fallback.
An ignored preload at `.tooling/gemini4/firebase-esm.cjs` supplies this local
workaround without changing dependencies. Do not disable synchronous ESM
support globally: the existing `jwks-rsa` dependency needs it to load `jose`.

Before deployment, use synthetic prompts to verify the global REST planner,
community JSON-schema generation and the Labs SDK adapter against the actual
project. Never invoke a public-post scheduler just to test a model upgrade.
After targeted Functions deployment, confirm all eleven functions are ACTIVE,
then make a read-only guest Kawuri lookup and check its model/location log.
Do not describe future scheduled posts as already generated with Gemini 4.

## Rollback

Set both `KAWURI_MODEL=gemini-2.5-flash` and `KAWURI_LOCATION=us-central1`, plus
`COMMUNITY_AUTOMATION_MODEL=gemini-2.5-flash` and
`COMMUNITY_AUTOMATION_LOCATION=us-central1` in the existing private Functions
environment. Rebuild and redeploy all eleven functions listed above. Existing
Gemini 2.5 usage/access is required; verify a request before switching. The
legacy thinking configuration remains covered by tests. To resume Gemini 4,
remove those overrides or set both model/location pairs to Gemini 4/global,
then redeploy the same functions. Do not reset completed publication records.
