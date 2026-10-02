# Run the trail, share a word: Word Trail

Status: **Implemented and locally verified October 2, 2026. Production deployment verification and Blogger publication pending.**

- Title: Run the trail, share a word: Word Trail
- Labels: Indigen World, Labs, Kasem, Contributions, Word Trail, Feature
- Search description: Dodge obstacles, collect sparks and translate real word queue prompts to open the next section in Word Trail, an Indigen World Labs game.
- Custom permalink: word-trail
- Article: `post.html`
- Sharing copy: `share.md`
- Images: `images/word-trail-desktop.png`, `images/word-trail-checkpoint-mobile.png`

## Implemented behavior and limits

- `/labs/word-trail` appears in the shared Labs registry, catalogue, homepage previews, routing and metadata. Default enabled signed-in alpha version 0.1.0; existing experiment pause, invitation and lifecycle controls apply server-side.
- Original canvas runner and fictional woodland scene: three lanes, rocks, jumpable logs, golden sparks, three lives, 300 metres per section (30 seconds of active play), increasing obstacle speed with a cap, keyboard controls, touch buttons and swipes. Each obstacle wave leaves two safe lanes. Automatic hidden-tab pause, manual pause and calm scenery; reduced-motion preference defaults to calm scenery. Gameplay movement remains essential while playing.
- Running distance and sparks award at most 500 game points per section; saving a translation adds 100. Running points are client gameplay data with a server range/time check, not a secure competition score. No public leaderboard, cash value, automatic payment credit or proficiency claim.
- A single `labsRunners/{uid}` record stores the account's trail. All direct client reads/writes are denied by existing default-deny rules; the authenticated Labs callable owns retrieval and writes. Saved gates/points persist; reload restarts a running section and discards its unsaved points. Unsent translation text persists across failed requests in this mounted form, but not page refresh.
- Canonical prompts reuse queue scanning, frequency order, answer/skip history, pending-answer deprioritisation and sentence attribution. Another word is excluded for this gate only; this does not skip it permanently in the normal queue. A gate supports up to 200 alternate prompts before requesting a fresh trail. Empty queues stay gated.
- Translation submission reuses the actual word queue parser, collection contribution/submission builders, counters, claims, progress, notification and audit workflow. The checkpoint unlock and answer commit in one Firestore transaction. Concurrent retries return the same receipt and do not award the bonus twice. Previous-section retry is retained until another checkpoint is saved.
- Server selects the queue ID; browser cannot forge it or attach an existing answer/revision to unlock the gate. Changing prompts does not advance sections. Accuracy requires normal community review; submitting alone is not verification or publication. Publication, name/anonymous credit and AI training are selectable, with anonymous credit and training off by default.
- No external Blogger publication or community messages are included in this work.

## Verification

- Backend production bundle built successfully; existing Labs policy tests: 9 passed; existing word queue unit tests: 57 passed.
- Isolated Auth/Firestore/Functions emulator run: 20 passed, including existing Labs workflows, genuine queue submission with canonical submission/receipt, simultaneous retries, malformed answers keeping the gate closed, saved progress, next-word selection, empty queues, guest/account separation, pause/invitation/retirement gates and direct read/write denial.
- Game simulation tests: 4 passed, covering lane bounds, rock/log collisions, jumping, collectible points, three-life failure, safe completion and section speed limits.
- Website typecheck, site validation, production build and 25-route metadata generation passed.
- Browser check uses the actual RunnerWorkspace with a labelled disposable account/queue and simulated callables: section gameplay to checkpoint, pause, phone controls, failed-submit text retention, retry, saved reload, alternative prompt, empty gate and reduced-motion preference. Both screenshot assets came from this checker. Full Labs route/catalogue responsive checks also included.
- Live deployment and signed-in production verification: pending. Do not describe this feature as confirmed live until the release evidence below is updated.

## Image credits and Blogger handoff

Credit: Indigen World, October 2, 2026. Original code-drawn fictional game scenery and actual local component screenshots. No borrowed Temple Run assets or claimed real monument. Screenshots visibly label the simulated account/queue; no private member data or invented Kasem translations appear.

1. Deploy the reviewed release through the existing production-main workflow: `labsApi` plus Indigen World Hosting. This uses the existing queue index, rules and triggers; no new rules/index deployment is required.
2. Verify the live route/assets, registry and authenticated gate behavior. Update status and article availability using actual release evidence.
3. Create a Blogger draft with the metadata above and paste `post.html` in HTML mode.
4. Upload both PNG assets to Blogger; replace local image sources with uploaded URLs. Keep descriptive alt text and local-development captions. Keep the phone screenshot narrow enough to read.
5. Chinedum publishes and shares. Replace the article URL placeholder in `share.md` after publication.

## Release evidence

Pending production deployment verification.
