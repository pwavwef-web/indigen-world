# Word Trail: chase the blue horizon

- Title: Word Trail: chase the blue horizon
- Labels: Indigen World Labs, Word Trail, Kasem, Games, Product updates
- Search description: An original fullscreen 3D language runner with an animated explorer, blue UI, safe contribution checkpoints and guest practice.
- Date: 2026-10-14 (UTC)
- Product route: https://indigenworld.com/labs/word-trail
- Release status: Implemented and verified in a clean release checkout based on the current production main. Production deployment pending confirmation.
- Blogger status: Prepared for Chinedum; unpublished. No community messages have been sent.

## What changed

Word Trail keeps its experiment ID, existing URL, account-owned trail, saved sections, scores, receipts and community-review workflow. Its compact launch page opens a viewport-filling 3D game. The current Labs redesign, navigation, photos and access rules are preserved; its palette and Culture Quest are unified in blue. The game is loaded as a separate bundle.

The fixed-step runner has three lanes, an original articulated explorer, rocks to avoid, logs to jump, awnings to slide under, sparks, three hearts, brief hit immunity, bounded difficulty, recycled scenery and a smoothed chase camera. Checkpoints retain health, lane and total distance. A passed landmark remains behind the explorer as the next section begins.

Contribution runs stop at 300 metres and freeze the simulation behind an in-game panel. The existing 100-point game bonus follows a successful server receipt once. These are run points, not money or redeemable contributor rewards. Guest/local practice is slower and never creates contributions or contribution bonuses. Switching to practice preserves the saved account gate.

A small backward-compatible server guard checks expectedWordId for new clients. A stale prompt cannot silently attach an answer to a different queue word. Recovery reloads the saved prompt, keeps previous writing available for reference and requires a deliberate action to reuse it. Existing clients and saved runs remain compatible.

## Actual verification

- Clean release website: typecheck, site/progress validation, 29 unit checks, production build and 27-route metadata generation passed.
- Runner: nine focused tests passed for frame-rate invariance (30/60/120 FPS), solvable patterns, clear exits, collisions, jump/slide exclusion, hit immunity, checkpoint freeze, bounded state, and audio voice cleanup.
- Existing Labs/source and word-queue unit checks: 66 passed.
- Auth/Firestore integration through the repository's real-handler callable bridge: all 15 Labs workflows passed. The two Word Trail workflows were rerun after the new expected-word guard and repeatable fixture setup; both passed, including stale-target rejection, a genuine queue contribution, concurrent duplicate receipts, legacy retry compatibility, empty queue and access controls.
- Five Firestore rules checks passed, including direct runner read/write denial and owner isolation.
- The standard Functions emulator initially timed out on this host's Node 24 runtime. The established callable bridge executed the actual compiled handlers against disposable demo Auth/Firestore emulators. No positive production translation was submitted.
- Browser QA exercised the release's actual Labs route and 3D renderer with synthetic local callables: keyboard lanes/jump/slide, pause/visibility, fully frozen checkpoints, failed and uncertain saves, duplicate submission locking, stale-word draft recovery, alternate/empty queues, practice separation, health carryover, game over/retry, repeated mounts, reduced motion, genuine touch-event swipes and touch buttons.
- Viewports: desktop 1100×780; portrait 390×844; landscape 844×390 and 568×320; a 390×430 available-height test confirmed Submit remains reachable with internal scrolling.
- Three minutes of real wall-clock play were observed in the final headless software-rendering session, with two checkpoint continuations, no retries, bounded object counts and no uncaught component errors. This is a stability observation, not an ordinary-phone FPS benchmark.
- There is no repository lint command for this website/backend. Relevant type, unit, integration, build and browser checks were used.

## Assets, credits and remaining limits

Explorer, clothing/backpack, shoulder/elbow and hip/knee/ankle articulation, procedural poses, trail, vegetation, fictional courtyards and landmark are original code in runner-art.ts. It is a stylized procedural character, not an externally generated or downloaded rigged model. The setting is fictional; no authentic heritage reconstruction or sacred symbolism is claimed. Audio is original Web Audio synthesis, not sampled or claimed traditional music.

Three.js is MIT licensed. Its complete notice is bundled at apps/website/public/assets/word-trail/THIRD-PARTY-NOTICES.txt. Asset provenance is recorded in runner-assets.json. Official renderer/camera documentation was consulted: https://threejs.org/docs/pages/WebGLRenderer.html and https://threejs.org/docs/pages/PerspectiveCamera.html.

Actual unaltered screenshots are in screens/. images/cover.png and the four JPG figures frame those screens in illustrated branded layouts. Frames, titles and backdrops are illustration; game and UI screen content is unretouched product evidence. The account, English prompt and answer fixtures are synthetic. Existing licensed Labs photos retain their credits in the product and labs-media.ts; this release preserves them.

Word Trail remains alpha. Physical phones, actual iOS/Safari soft keyboards, live Google popup sign-in, audio listening on real devices and phone performance measurements were not verified. The reduced-height browser check is not a physical-keyboard test. WebGL 2 is required; unavailable graphics shows a recovery path. Browser fullscreen is optional. Unsent writing stays only in the mounted game; reload, exit or account changes do not preserve unsent drafts. Saved checkpoints and contributions remain in the backend. Device best scores are personal progress. The game is a visual action game.

## Blogger upload and sharing

1. Review the confirmed release evidence below before publication.
2. Create a Blogger draft with the title, labels and search description above.
3. Upload images/cover.png first, then game-desktop.jpg, checkpoint-phone.jpg, game-phone.jpg and labs-blue.jpg.
4. Replace relative image src values in post.html with Blogger's hosted URLs. Keep alt text and captions, including synthetic-local-data and emulated-viewport descriptions.
5. Preview desktop and phone layouts. Chinedum publishes and fills in the article URL in share.md.

Art specification: art.json. The established release-art renderer generated the frames from unaltered screenshots; no generated gameplay image is used.

## Production evidence

Pending confirmation of the normal clean-source origin/main gate, labsApi and indigen-world Hosting deployment, and live served-asset checks. No other Hosting site, function, rules or indexes are part of this release.
