# Automated community accounts

Five server-operated Firebase identities post to the existing public community feed. Their Firebase Auth identities are disabled for interactive sign-in, have no email or password, and carry automation claims. Their public profiles identify them as automated project accounts, with unique reserved handles and original avatar/cover illustrations.

| Account | Handle | Daily Ghana time (UTC) | Purpose |
| --- | --- | --- | --- |
| Zem Botarebu | @zem_botarebu | 07:00 | Vertex selects a published dictionary word; its exact spelling and English meaning appear on a PNG card with supporting text. |
| Amo Yei Kasem | @amo_yei_kasem | 10:00 | Vertex chooses a query for live internet research, selects a sourced fact and independently checks its evidence. |
| NNaYeiri SeNBwei | @nnayeiri_senbwei | 13:00 | Vertex-generated project/culture questions and brief automatic replies in its own threads. |
| Kasem Practice | @kasem_practice | 16:00 | A short recall exercise using a different published dictionary word. |
| Indigen Guide | @indigen_guide | 19:00 | A rotating set of verified app and community tips. |

All schedules use Africa/Accra. The initial publication command posts immediately, independently of the scheduled hour. One deterministic post ID per account and local date prevents duplicate first/daily posts. The word card is a deterministic SVG rendered with resvg and bundled Noto Sans (SIL OFL), so Vertex cannot alter spelling or meaning on the image.

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

Models can be changed with COMMUNITY_AUTOMATION_MODEL and COMMUNITY_AUTOMATION_LOCATION on the functions deployment. Defaults match the current Kawuri setup: gemini-2.5-flash, us-central1. The runtime needs Vertex AI access through its service account; no model API key is exposed to clients.

## Validation and deployment evidence

- Functions TypeScript check and bundle build pass.
- Nine policy/renderer tests and nine transactional emulator checks pass (18 total). Run `npm run test:community-automation` with Java available. On this Windows host, Java's AF_UNIX loopback failed; the emulator succeeded with `JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=C:/indigen-emulator-unix-disabled-missing-directory`, which makes the JDK use TCP instead. The named directory must not exist. This only affects local tests.
- Artwork: all ten assets visually inspected; originals and final prompts retained in assets/community-automation/.
- Deployment and activation verified on 2026-10-02. All seven automation functions are ACTIVE; total live functions increased from 165 to 172 with no removals. All six Scheduler jobs are ENABLED with the five daily times above and the half-hour recovery job. The final culture/recovery revisions completed at 13:17 UTC. Final refinement bundle SHA-256: `85031c6fdbb4a9575c74ab24a815651e4c5c5a182b86b942ab51cd712276157f`.
- All five Firebase Auth identities have automation claims and interactive sign-in disabled. All five public profiles have avatar and cover URLs, project marks and automation disclosures. All eleven public image URLs (ten profile assets plus the word card) returned HTTP 206 with image/png; the full live word card was downloaded and visually inspected.
- Five initial posts were published by the deployed Scheduler jobs, with deterministic IDs ending in `2026-10-02`. The word account published `Deém` with the exact dictionary meaning `long, long ago`; practice selected `sono` / `love`. The enquiry account has repliesEnabled true. The culture account's first attempt failed its exact-evidence guard and a retry succeeded; the subsequent topic refinement revised that same post with a preserved private audit record. All final bodies fit the existing 500-character limit.
- Live profile/post/image/Scheduler verification exited 0 at 13:17 UTC; the final function inventory check confirmed all seven ACTIVE after the last deploy. Detailed evidence is retained in `.tooling/community-automation/live-verification.json`. Public post routing returned HTTP 200 at `https://indigen-world.web.app/post/daily_zem-botarebu_2026-10-02`.

No release post or external sharing was prepared, as explicitly requested by the owner.
