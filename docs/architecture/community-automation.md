# Automated community accounts

Five server-operated Firebase identities post to the existing public community feed. Their Firebase Auth identities are disabled for interactive sign-in, have no email or password, and carry automation claims. Their public profiles identify them as automated project accounts, with unique reserved handles and original avatar/cover illustrations.

| Account | Handle | Daily Ghana time (UTC) | Purpose |
| --- | --- | --- | --- |
| Zem Botarebu | @zem_botarebu | 07:00 | Vertex selects a published dictionary word; Gemini draws its meaning, with the exact spelling and English meaning in the post text. |
| Amo Yei Kasem | @amo_yei_kasem | 10:00 | Vertex chooses a query for live internet research, selects a sourced fact and independently checks its evidence. |
| NNaYeiri SeNBwei | @nnayeiri_senbwei | 13:00 | Vertex-generated project/culture questions and brief automatic replies in its own threads. |
| Kasem Practice | @kasem_practice | 16:00 | A short recall exercise using a different published dictionary word. |
| Indigen Guide | @indigen_guide | 19:00 | A rotating set of verified app and community tips. |

All schedules use Africa/Accra. The initial publication command posts immediately, independently of the scheduled hour. One deterministic post ID per account and local date prevents duplicate first/daily posts. Since October 15, the word account calls the existing Gemini image adapter to draw an actual illustration. Verbs show an appropriate person or animal performing the action; concrete nouns show the subject; abstract nouns, adjectives and adverbs use a suitable scene. The published English meaning and part of speech are passed as data. The image contains no requested lettering; exact dictionary text remains in the post and accessible image description. Illustrations are labelled AI-generated learning aids, not evidence of cultural practices or linguistic accuracy.

Image settings use the existing `VERTEX_IMAGE_MODEL` / `VERTEX_IMAGE_FALLBACK_MODEL` chain (defaults `gemini-3.1-flash-image`, then `gemini-2.5-flash-image`) on the global endpoint, square 1K output. Returned image bytes are saved under the account's community-media path; no text-card fallback is published if Gemini declines or returns no image. Saved word drafts and uploaded images are reused on retries. Publication rechecks spelling, meaning and part of speech. The daily worker and recovery worker can replace today's old card once, preserving its text meaning, counters and private image revision. Removed posts stay removed, and image upgrades have their own lease and three-attempt cap.

## Evidence and safeguards

Culture research searches the public Wikimedia index using a Vertex-chosen query and reads returned page extracts live. UNESCO's Royal Court of Tiébélé page is also retrieved when accessible. UNESCO can reject automated requests with HTTP 403; the account can then use a clearly labelled Wikipedia overview. This is scoped internet research, not unrestricted web crawling or Google's built-in Search grounding tool. Vertex selects the ID of an exact excerpt extracted by the server; it cannot rewrite the supporting quote or source URL. Every paraphrased fact must cite that retrieved source, address Kassena/Kasem/Tiébélé directly and pass a separate Vertex evidence check. Excerpts and queries are retained in private run records. Source quotes are not published as article copies. If search or verification fails, no fact is posted.

Word/practice pools contain published, complete word entries; phrases and sayings are excluded. Spelling and meaning are rechecked against Firestore in the publication transaction. Recent selections are avoided, including the other word account's selection that day. Supporting invitations come from fixed English copy. Generated content cannot contain mentions; automated accounts do not summon each other.

Enquiry replies only answer members inside the enquiry account's own root threads. They ignore all five bot identities, Kawuri, assistant/automated posts and explicit @kawuri requests. They respect community mute/block edges in both directions, check that the member's reply still exists and has not changed, and publish once with an atomic reply-count increment. Generation is capped at 3 attempts per member/day, 15 per thread lifetime and 30 total/day, including failed generations. The root question, parent and member reply are treated as untrusted input. Replies disclose automation and cannot promise team actions. Public English is intentional for these owner-requested accounts; kasemConfirmed remains false.

Daily jobs use leases and at most three generation attempts per day. A recovery job runs every 30 minutes, catches missed/expired runs after each account's scheduled hour, and never duplicates a published run. Moderated/deleted posts stay deleted. Model or source failures fail closed; errors are retained for the operator. Private automation collections are covered by the existing default-deny rules. No new indexes, Firestore rules, hosting or mobile release are required.

## Operation

Build with `npm run build:functions`. The owner-operated script reuses the existing local Firebase CLI login, creates a short-lived private ADC file outside the repository and removes it on normal process exit. It never uploads or commits credentials.

```
node services/functions/scripts/community-automation.mjs --inspect
node services/functions/scripts/community-automation.mjs --prepare
firebase deploy --project project-kassena-7e026 --only functions:postZemBotarebuDaily,functions:postAmoYeiKasemDaily,functions:postNNaYeiriSeNBweiDaily,functions:postKasemPracticeDaily,functions:postIndigenGuideDaily,functions:recoverCommunityAutomation,functions:onCommunityEnquiryReply --non-interactive --force
node services/functions/scripts/community-automation.mjs --publish
node services/functions/scripts/community-automation.mjs --verify
```

`--prepare` checks handle/profile/Auth collisions before creating identities, uploads the ten images, reserves handles and leaves newly created accounts disabled for posting. Existing configuration is preserved. `--publish` verifies all seven deployed functions are ACTIVE, then enables the accounts and invokes their actual production Scheduler jobs immediately. It waits for the first word before starting practice so their selections differ. Rerunning is idempotent. `--verify` checks Firebase identities, public images, today's posts and all six Scheduler jobs, saving evidence and the published word card under the ignored `.tooling/community-automation/` directory. `--refresh-culture` lets the operator regenerate today's existing culture fact with current evidence; it preserves the previous text and evidence in a private revision, preserves counters and refuses to recreate a removed post.

To pause one account, set `communityAutomationAccounts/{accountId}.enabled` to false in Firestore. To stop enquiry replies while retaining its daily question, set `repliesEnabled` to false. These private settings are checked again immediately before publication. Run records are under `communityAutomationRuns`, `communityAutomationReplyRuns` and `communityAutomationReplyLimits`. An exhausted run can be reviewed and its attempts reset by the operator; never remove a published run merely to recreate a deleted post.

Models can be changed with COMMUNITY_AUTOMATION_MODEL and COMMUNITY_AUTOMATION_LOCATION on the functions deployment. Defaults match Kawuri: `gemini-4-argon`, `global`, from `gemini-text-policy.ts`. The runtime needs Vertex AI access through its service account; no model API key is exposed to clients. Gemini 4 uses LOW thinking, no token budget, and a 4,096-token output ceiling for structured community text. Image generation keeps its independent specialist models. See [Gemini 4 text upgrade](gemini-text.md) for affected functions, verification and rollback.

## Validation and deployment evidence

- Functions TypeScript check and bundle build pass.
- Nine policy/renderer tests and nine transactional emulator checks pass (18 total). Run `npm run test:community-automation` with Java available. On this Windows host, Java's AF_UNIX loopback failed; the emulator succeeded with `JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=C:/indigen-emulator-unix-disabled-missing-directory`, which makes the JDK use TCP instead. The named directory must not exist. This only affects local tests.
- Artwork: all ten assets visually inspected; originals and final prompts retained in assets/community-automation/.
- Deployment and activation verified on 2026-10-02. All seven automation functions are ACTIVE; total live functions increased from 165 to 172 with no removals. All six Scheduler jobs are ENABLED with the five daily times above and the half-hour recovery job. The final culture/recovery revisions completed at 13:17 UTC. Final refinement bundle SHA-256: `85031c6fdbb4a9575c74ab24a815651e4c5c5a182b86b942ab51cd712276157f`.
- All five Firebase Auth identities have automation claims and interactive sign-in disabled. All five public profiles have avatar and cover URLs, project marks and automation disclosures. All eleven public image URLs (ten profile assets plus the word card) returned HTTP 206 with image/png; the full live word card was downloaded and visually inspected.
- Five initial posts were published by the deployed Scheduler jobs, with deterministic IDs ending in `2026-10-02`. The word account published `Deém` with the exact dictionary meaning `long, long ago`; practice selected `sono` / `love`. The enquiry account has repliesEnabled true. The culture account's first attempt failed its exact-evidence guard and a retry succeeded; the subsequent topic refinement revised that same post with a preserved private audit record. All final bodies fit the existing 500-character limit.
- Live profile/post/image/Scheduler verification exited 0 at 13:17 UTC; the final function inventory check confirmed all seven ACTIVE after the last deploy. Detailed evidence is retained in `.tooling/community-automation/live-verification.json`. Public post routing returned HTTP 200 at `https://indigen-world.web.app/post/daily_zem-botarebu_2026-10-02`.

The original October 2 rollout had no release post, as requested then. The October 15 illustration update has a new repository release post; Blogger publication and external sharing remain Chinedum's handoff.

## Illustration update — 2026-10-15

Deploy only `functions:postZemBotarebuDaily,functions:recoverCommunityAutomation`. Other schedules and hosting do not need updating. The seven existing automation exports are restored in `src/index.ts` so Firebase discovery includes them.

Run `npm run test:community-automation` (Firestore and Storage emulators, no Vertex spend). The suite covers real image-response upload, no-image refusal, upload reuse after cancellation, upgrading an existing post once, preserved counters, moderation removals and existing automation safeguards. For the Windows Java workaround above, set `JAVA_TOOL_OPTIONS` before the command.

After deployment, `node services/functions/scripts/community-automation.mjs --run-word` invokes the actual deployed word Scheduler job. It upgrades today's old card, or publishes today's word if absent. `--verify-word` downloads its public picture and saves targeted evidence to `.tooling/community-automation/word-illustration-verification.json`. `--refresh-word-image` is an optional owner-operated direct upgrade using the same routine; it refuses absent/deleted posts.

Confirmed live at 11:08 UTC on October 15: `postZemBotarebuDaily` revision `postzembotarebudaily-00003-niw` and recovery revision `recovercommunityautomation-00005-cow` are ACTIVE. The deployed Scheduler job upgraded today's existing `di` / `to eat` post on its first image attempt using `gemini-3.1-flash-image`. The public PNG returned HTTP 200, is 1024 × 1024, and was visually checked to show someone eating with no lettering. Schedule remains ENABLED at 07:00 Africa/Accra. Ten policy tests and twelve Firestore/Storage emulator tests pass. Release article and actual image assets are in `apps/updates-blog/posts/2026-10-15-word-of-the-day-illustrations/`; Blogger publication is pending.

## Zem Ghana: Ghana headlines (live since 2026-10-15)

A sixth automated identity, `@zem_ghana` (uid `bot_zem_ghana`, config `communityAutomationAccounts/zem-ghana`). It lives in its own modules, `community-news-policy.ts` and `community-news.ts`. It is not part of `AUTOMATION_ACCOUNTS` because it posts at several slots a day, so the five daily accounts, their recovery job and their scripts are unchanged. It shares `ensureAutomationProfile`, `postDocument` and the Vertex `generate` helper, called with its own `NEWS_INSTRUCTION` (neutral reporting, attribution, no added facts). The daily accounts' "no politics" instruction does not apply to it.

**Sources.** The publisher RSS feeds of MyJoyOnline, Graphic Online, 3News and the Ghanaian Times, read live on each run. A link must be https and on that outlet's own host, with tracking parameters removed. Aggregator redirects such as Google News are not used. One failing feed is tolerated; if all fail, nothing is posted.

**Selection.** Candidates are under 20 hours old and not already posted (checked by article id and normalised title). Opinion, column, sponsored and live-blog items are excluded, and outlets are interleaved. Vertex picks one item and a category, preferring broad public interest and giving some weight to the Upper East Region. It also writes a summary from that item's title and RSS preview only, within a per-item length budget so the post fits 500 characters. Models overshoot character limits, so `fitSummary` keeps whole leading sentences that fit. Sentences end only at punctuation followed by a space, so decimals like 7.4% stay intact. The server rejects summaries that contain links, mentions or tags, or that repeat any ten consecutive words of the preview. A second Vertex call checks the summary against the item and fails closed. Sensitive story types (graphic violence, suicide, sexual offences, identified children, unproven accusations against private people) are excluded at both steps.

**Post and card.** The text is the outlet's headline, the summary, `Source: <outlet>` with the article URL, and an automation disclosure. `sources` carries the same URL. The 1080×1080 card is SVG rendered with Resvg and the bundled Noto Sans. It shows the Indigen mark, Ghana's colours, the category, the headline verbatim (never truncated: the type size shrinks to fit), the outlet and the date. It is uploaded under `community-media/bot_zem_ghana/<postId>/` with `isAiGenerated: false`. News images are never AI-generated.

**Schedule and idempotency.** `postZemGhanaNews` runs at `0,30 7-21 * * *` Africa/Accra. Each run publishes the due slot (07, 11, 15 or 19) once: post ID `news_zem-ghana_<date>_<HH>`, the same lease and three-attempt pattern, and a saved `newsDraft` so retries reuse the same story and card. A slot is abandoned three hours after it starts, so missed slots are never posted in a burst. `communityNewsItems/{articleId}` records every posted story, and the publish transaction refuses a story already used by another slot. Removed posts stay removed. Private collections are covered by the existing default-deny rules, and equality-only queries need no new index.

**Operation.**

```
npm run build:functions
node services/functions/scripts/zem-ghana-art.mjs --art-only     # re-render avatar/cover into assets/
node services/functions/scripts/community-automation.mjs --news-dry-run   # live feeds + Vertex, writes nothing
node services/functions/scripts/community-automation.mjs --news-prepare   # identity, artwork, handle; posting stays off
FUNCTIONS_DISCOVERY_TIMEOUT=180 firebase deploy --project project-kassena-7e026 --only functions:postZemGhanaNews --non-interactive
node services/functions/scripts/community-automation.mjs --news-publish   # enable; runs the job now if a slot is due
node services/functions/scripts/community-automation.mjs --news-verify
```

To pause, set `communityAutomationAccounts/zem-ghana.enabled` to false. This is a function create, so expect a deploy of ten minutes or more. Probe it afterwards; it has no public invoker, being Scheduler-only. Validation: `npm run test:community-automation` now also runs `communityNews.test.mjs` (9 tests) and `communityNews.integration.test.mjs` (4 emulator tests). On 2026-10-15 all 19 + 16 passed. A production `--news-dry-run` read 135 items from all four feeds and produced a 477-character post with a passing source check.

**Production rollout, 2026-10-15.** `--news-prepare` provisioned the identity, artwork, handle and a disabled config. `postZemGhanaNews` was created (live functions 223 → 224, no other change), then updated twice. The first update fixed a summary-length rejection: Vertex exceeded the per-item limit, and the run failed closed with "News summary is outside limits". The second fixed decimals split by that first fitter ("7. 4%"). The deploys were run from a checkout 26 commits behind origin/main; none of those commits touch the community automation code. Several deploy attempts failed on intermittent local DNS lookups (ENOTFOUND on googleapis hosts), and plain retries succeeded. One run hit a transient Vertex 429. `--news-publish` enabled the account, and the deployed Scheduler published `news_zem-ghana_2026-10-15_11` at about 13:30 UTC. `--news-verify` at 13:36 UTC: function ACTIVE (updated 13:35:39 UTC), Scheduler ENABLED, claims and disabled sign-in confirmed, card and post page HTTP 200. With the owner's approval, that first post's text was then corrected from "7. 4%"/"4. 9%" to 7.4%/4.9%. The original is kept in `communityAutomationRuns/news_zem-ghana_2026-10-15_11/revisions`, and counters were unchanged.
