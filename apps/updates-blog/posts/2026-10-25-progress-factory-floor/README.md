# Help fill the jars moves onto a factory floor

**Blogger:** Published on Indigen World Updates on 29 October 2026: https://updates.indigenworld.com/2026/10/welcome-to-factory-floor-labelled-jars.html

- **Title:** Welcome to the factory floor: labelled jars, moving water and ten new features
- **Topic:** The public progress page (`/progress`) redesigned as a factory hall with parallax depth; liquid with a moving surface; printed labels on every jar; a fix for jars that slid in late and pipes that missed them; ten features: plant output dial, delivery log, shift board, goal lines, ordering, pipe tracing, day/night shifts, showcase mode, links to a jar and an optional factory sound. Sealed jars when a target is met.
- **Labels:** Progress, Website, Feature, Community, Indigen World
- **Search description:** The Indigen World progress page now stands in a factory: every Kasem collection jar has a label, the water moves, and new tools show the next goal, the latest approvals and which collection needs help most.
- **Status (25 October 2026):** **Live.** Code commit `43439c6`, deployed to Hosting `indigen-world` at about 20:20 UTC from a clean detached checkout of `origin/main` (production guard passed; predeploy `check:website` passed). Verified at 20:25 UTC: the served entry assets match the local build exactly; headless Chrome at 1440 px and 390 px rendered 10 jars with 10 labels, the factory backdrop, the control room (dial 3.4%, five delivery-log rows) and the Live status, with no console errors, no sideways scrolling and no scroll-card classes on the jars; `/`, `/progress` and `/app-ads.txt` answer 200. Before release: typecheck, `npm test` (33 unit tests plus the site and progress validators) and the full `test:progress:browser` check. Not checked: Safari, Firefox and real low-end phones. No backend, rules or index change was needed. Not published on Blogger.
- **Publishing owner:** Chinedum. Preparing this post does not authorize publishing or sharing it.

## What changed (code)

| Change | Where |
| --- | --- |
| Fix: the shared scroll-card effect (added 12 October) also selected `.floating-vessel`, so jars below the fold started hidden and 48 px low while the pipes were measured; selector removed, pages can opt out with `data-scroll-cards="off"`, the progress page does, and the pipe network re-measures on `transitionend`/`animationend` | `apps/website/public/scroll-cards.js`, `src/pages/ProgressPage.tsx`, `src/features/progress/PipeNetwork.tsx` |
| Factory backdrop: static artwork per depth layer plus separately composited moving parts (gears, crane, conveyor, steam, beacon, LEDs, gauge, swinging lamps, dust, light shafts); script-driven parallax on scroll; day and night palettes | `src/features/progress/FactoryBackdrop.tsx`, `src/styles/progressFactory.css` |
| Vessels in three layers: back drawing (glass and the exact `.liquid-fill`), a composited middle layer for the two surface waves and the bubbles, front drawing (highlights, graduations, goal line, label, lid, seal, arrival splash). The wave's mean is the counted level; amplitude is capped at 28% of the liquid depth | `src/features/progress/GlassVessel.tsx`, `liquidVisuals.tsx` |
| Printed jar labels (zigzag band, catalogue number, emblem, name, title, "Kasem heritage", sealed stamp) | `src/features/progress/JarLabel.tsx` |
| TribePump rotor and halo moved into composited layers so an idle page needs no main-thread frames; the Live dot pulses with a composited ring | `src/features/progress/TribePump.tsx`, `progressFactory.css` |
| 1–3. Control room: plant output dial (mean of readable jars' fills, per-jar strip, verified item total), delivery log (the public projection's event ring: collection, amount, total, time), shift board (sealed jars, launch window, most needed, closest goal) | `src/features/progress/ControlRoom.tsx`, `progressPlant.ts`; `useLiveProgress.ts` exposes `events` |
| 4. Goal lines and "N to X%" from a ladder starting at 0.1% | `src/features/progress/progressMilestones.ts`, `VesselPresentation.tsx` |
| 5. Order the floor (Catalogue / Fullest / Needs help / Largest), glide animation, pipes hidden while settling | `src/features/progress/progressSort.ts`, `ProgressPage.tsx` |
| 6. Pipe tracing on hover/focus | `PipeNetwork.tsx` (`trace`), `VesselPresentation.tsx` |
| 7. Day/night shifts following the local clock, overridable and remembered | `src/features/progress/useShiftLighting.ts` |
| 8. Showcase mode (native modal dialog, Fullscreen API, 9 s tour gated by motion settings, arrows, live numbers) | `src/features/progress/ShowcaseMode.tsx` |
| 9. Jar links `/progress#jar-<id>` with spotlight and focus; "Copy link to this jar" | `ProgressPage.tsx`, `CategoryBreakdownModal.tsx` |
| 10. Optional synthesized factory ambience (Web Audio, user-started, stops on hide/unmount) | `src/features/progress/factoryAmbience.ts` |
| Tests: pure helpers, scroll-card opt-out; browser checks for labels, honest surfaces, reordering with joined pipes, log, tracing, shifts, jar links and showcase | `apps/website/scripts/progressFactory.test.mjs`, `scripts/check-progress.mjs` |

## Images

`screens/` holds the unaltered screenshots; `images/` holds the branded cover
and framed figures that `post.html` uses (frames, backgrounds and titles are
illustration). Regenerate with:

```text
node apps/updates-blog/scripts/render-post-art.mjs 2026-10-25-progress-factory-floor
```

- `factory-hero.png`, `jars-night.png`, `jar-label.png`, `control-room.png`,
  `needs-help-trace.png`, `day-shift.png`, `showcase.png`, `phone-jars.png`,
  `phone-control-room.png` — actual screenshots of the local development build
  (Vite on port 5180, headless Chrome) reading the **public production
  progress totals** on 25 October 2026. The delivery log rows are real
  approvals from the public projection (collection, amount and time only).
- `sealed-sample.png` — the same build in the page's development-only sample
  preview (sample counts and targets, labelled on the page as not live), used
  only to show what a sealed jar looks like. The post says so.

Credits: all artwork on the page (factory, jars, labels, pump) is drawn in code
in this repository. The zigzag band is an original pattern inspired by the
painted walls of Kasena compounds, not a copy of a specific wall. The Indigen
World mark is the existing repository logo.

## Blogger handoff

1. The post says the redesign is live (deployed 25 October 2026). Open
   indigenworld.com/progress once before publishing to confirm it still is.
2. Upload every image in `images/` to Blogger, keep the captions and alt text,
   and replace each `images/...` path with Blogger's image URL.
3. Paste `post.html` in HTML mode; set the title, labels and search
   description above; preview on desktop and mobile.
4. After publishing, put the article URL into `share.md`. Sharing is a separate
   step for Chinedum.
