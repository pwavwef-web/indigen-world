# Word Trail: chase the blue horizon

- Title: Word Trail: chase the blue horizon
- Labels: Indigen World Labs, Word Trail, Kasem, Games, Product updates
- Search description: An original fullscreen 3D language runner with an animated explorer, blue UI, safe contribution checkpoints and guest practice.
- Date: 2026-10-14 (UTC)
- Product route: https://indigenworld.com/labs/word-trail
- Release status: Deployed and verified on production on 2026-10-14. Final website source: 5cfe66fa8c5c345c11cb3daacee11adfc37a548b. Checkpoint API source: be1cf01eccd5feaf70e30a921dc55f5886f41ca7.
- **Blogger:** Published on Indigen World Updates on 29 October 2026: https://updates.indigenworld.com/2026/10/blog-post_449.html

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

- Firebase confirmed a successful Node.js 22 second-generation labsApi update in us-central1 and an indigen-world Hosting release. The deploy completed before the live verification at 2026-10-14T11:49:22.572Z.
- The normal clean-source origin/main guard passed at be1cf01e. Website validation, typecheck, 29 tests and the 27-route production build passed again during predeploy. Firebase also ran the existing Dictionary and TribeStudio predeploy checks; both passed. Only labsApi and indigen-world Hosting were updated; no other Hosting site, function, rules or indexes were deployed.
- On https://indigenworld.com, the Labs entry HTML, Labs JS/CSS, runner JS/CSS, actual gameplay preview and Three.js notice matched the release build byte for byte. SHA-256 evidence is in production-verification.json.
- Actual signed-out production browsing at 390 × 844 opened practice, completed the countdown, advanced distance, rendered the 3D scene, paused and exited successfully. The public Labs bootstrap returned HTTP 200. The blue experiment catalogue also loaded. No production translation or account mutation was submitted.
- screens/live-game-phone.png and screens/live-labs-blue.png are unretouched production screenshots from that browser viewport, without synthetic account or queue data. The framed article figures remain clearly identified local QA captures. This live browser check does not substitute for physical-phone performance, iOS/Safari or soft-keyboard verification.
- The final Hosting-only blue-preview polish deployed from origin/main at 5cfe66fa. A locally filtered copy of firebase.json retained the exact indigen-world site settings and both standard predeploy commands, avoiding unrelated site hooks. The production-main guard, website validation, 29 tests and production build passed. API code was unchanged.
- Final live verification completed at 2026-10-14T12:50:42.744Z. Updated hashes are in production-verification.json. The catalogue capture waited for fonts, image decoding and scroll-triggered card reveals; all four cards were inspected with the blue preview palette. Guest practice, distance progress, pause, exit and the successful public bootstrap were verified again.
