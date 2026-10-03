# Kawuri chat: reviewed records and closed rendering

Released 2026-10-03: both shared chat and community mention functions deployed; public chat checks and deployed-source verification passed.

The reported answer taught “An kyena?”, “Maa kyena” and “Barka” without supporting project records. Production inventory found 88 contributor training pairs with currently approved/published sources, but no records in `kasemEvidence`, the collection used by the former sentence lookup. Broad requests could also bypass its translation-pattern gate. Collection progress had not connected these expressions to chat.

## Answer boundary

`askKawuri` is shared by `kawuriChat` and `onCommunityKawuriMention`. It now returns only server-rendered answers. Vertex may return a JSON request plan with an allowlisted kind/help topic and a query copied from user text. Its prose, translations, unknown fields and malformed/truncated responses are never displayed. Provider failure falls back to local interpretation and the same renderer. Earlier model turns cannot supply a query or evidence. Historical user text can supply a query only for an explicit reference or follow-up.

The model sees conversation text, not contributor source records. No expression upload, consent migration or model training is part of this release. Broad requests, common follow-ups and recognised translations use local interpretation and do not need Vertex.

## Eligible records

- Published dictionary words are read fresh; explicitly classified expressions, phrases, idioms and proverbs are excluded from this word route. Complete stored renderings and English senses can match exactly. Constituents are never assembled into a sentence.
- `contributorTrainingPairs` supplies candidate IDs only. Each original `submissions` record is reread. It needs a portal contributor matching its author, current APPROVED/PUBLISHED status, original publication and training grants, and no withdrawal, deletion or expired/inactive permission. Text, alternatives, dialect and context come from the current source, never from the projection. A stale projection cannot restore withdrawn or unconsented text. The AI grant remains an additional conservative eligibility condition; local display does not claim provider-retrieval consent.
- Public `kasemEvidence` sentences need their publication grant and independent current-revision review. Held-out examples and their linked families stay excluded. Source evidence is not sent to a provider, so a separate provider-retrieval grant is not expanded or fabricated.
- Multi-line bundles, parenthetical editorial notes and instruction-like strings are withheld. Clean reviewed alternatives may still be quoted separately. No source text is automatically corrected, split, concatenated or adapted. Human correction/review of withheld records remains necessary.

The record's original spelling, meaning, alternatives and context are quoted. Different situations and dialects are not declared equivalent. Similar sentences do not become exact translations. A miss or failed source read returns a fixed uncertainty message and a next step. Plain app help is a fixed catalog. Spelling practice uses published dictionary entries rebuilt by the server on every callable request.

## Limits

Chat now supports recorded language, spelling practice and fixed app help. Unconstrained cultural prose, generated grammar explanations and creative language exercises are withheld. Creation and media-analysis tools are separate; this release does not verify their linguistic output. Existing stored chats and already posted community replies are not rewritten. This prevents provider-invented language from entering new chat/mention replies; it does not guarantee that a human-reviewed record has no linguistic error.

Each collection is capped at 4,000 records with a fail-closed overflow check. Source lookups use batches of 100 and no permission-sensitive cache. Add a paginated retrieval index before this ceiling becomes limiting. No Firestore rule, index or data migration is needed for these queries. Existing rate limits and daily allowances stay enforced.

## Verification and rollout

Unit tests cover the reported request, exact/reverse lookup, near misses, whole sentences versus words, malicious planner output, poisoned history, permission refusal/expiry, stale projections, source withdrawal, malformed bundles, failed reads, app help and practice. Integration tests exercise actual Firestore eligibility, held-out evidence and the callable response paths.

Local verification: functions build passed; 97 selected unit/helper tests and all five Firestore/callable integration tests passed. The integration run used an isolated emulator entry exporting the actual kawuriChat implementation; it wrote only demo-project fixtures. Evidence is retained in ignored .labs-local/kawuri-final-tests.log and .labs-local/kawuri-grounding-emulator.log.

Read-only testing against production records found 357 word records and 79 currently quotable contributor records out of 88 candidates. Nine records had no clean form to quote; no source was changed. “I am fine” and standalone “Thank you” returned a refusal rather than guessed forms. These inventory counts describe that check, not a permanently fixed dataset size.

Release from an isolated checkout of current `origin/main`, preserving deployed changes unrelated to this fix. Update only `kawuriChat` and `onCommunityKawuriMention`, which share the new answer implementation. Preserve existing environment/configuration. Verify both function revisions and the deployed source, then make callable checks for broad expressions, a recorded expression, unsupported text and poisoned history. No mobile binary is required for server answers. Confirm production evidence below before announcing availability.

Release post: [Kawuri answers from reviewed records](../../apps/updates-blog/posts/2026-10-03-kawuri-reviewed-answers/README.md). Blogger publication and sharing remain Chinedum's handoff.

## Production evidence

Implementation commit: 9b750d6. Both Node 22 functions updated successfully in project project-kassena-7e026, us-central1. kawuriChat revision kawurichat-00030-zul; onCommunityKawuriMention revision oncommunitykawurimention-00022-fik. Both are ACTIVE. All 20 existing application environment settings were retained. Deployed src/kawuri.ts, src/kawuri-grounding.ts and lib/bundle.mjs matched the isolated tested build exactly.

Four public callable checks passed at 2026-10-03T20:35:23.990Z: common expressions, a recorded greeting, an unsupported response and poisoned history. Unsupported “I am fine” produced an explicit refusal. None returned the reported invented forms. No real community test post was sent; the mention handler uses the same deployed implementation and its revision is verified. Existing chats/posts were left intact.

All 97 selected unit/helper checks and five integration checks passed (102 automated checks). The two extra unit checks exercise the outer shared answer/lesson path itself. Operational evidence is retained privately under ignored .labs-local/kawuri-grounding-deploy.log, kawuri-final-tests.log, kawuri-grounding-emulator.log, kawuri-live-checks.json, kawuri-release-baseline.json and kawuri-release-after.json. No mobile binary, model training, data migration, Blogger publication or community sharing was performed.
