# One design for every workspace

Status: **Implemented and verified locally on 2026-10-04. Not deployed, not committed, not published.** The work lives on branch `claude/comitia-workspaces` in the `indigen-world-comitia` worktree (based on `origin/main` at 17382eb). TribeStudio Hosting still serves the 2026-10-04 reconstruction. No Blogger publication or community sharing has been performed.

Topic: TribeStudio, the contributor portal and the validator portal redrawn on one design system taken from Comitia (Sora and Inter, the ink/blue/cyan palette, glass panels, the admin-style sidebar and header card, the Display preferences panel), with an animation switch and verified overflow-free layouts.

| Field | Value |
|---|---|
| Title | One calm design for creating, contributing and reviewing |
| Labels | TribeStudio, Workspaces, Contributors, Validators, Design |
| Search description | TribeStudio, the contributor portal and the validator portal share one design: clearer navigation, dark mode, larger text and an animation switch, with records and permissions unchanged. |
| Custom permalink | one-design-for-every-workspace |
| Article | post.html |
| Sharing copy | share.md |

## Images and credits

Every image under `images/` is an actual headless-Chrome screenshot of this implementation, captured on 2026-10-04 against local Firebase Auth, Firestore and Storage emulators with the seeded test accounts from `apps/tribestudio/scripts/seed-workspace-ui.mjs` plus extra records that are all titled "Local test ·". Kasem text is shown only as bracketed placeholders. No generated imagery, stock photography or real community submission appears. Credit: Indigen World.

- `creator-overview.jpg` — creator overview at 1440 × 900: start cards, status counts and work to continue.
- `display-panel.jpg` — the Display panel opened from the header.
- `post-composer.jpg` — the post form on its first step with the "what happens next" rail.
- `contributor-overview.jpg` — contributor overview with a seeded test assignment.
- `validator-decision.jpg` — review desk with a test translation and the "Ask for changes" consequence.
- `review-phone.png` — review desk at a 390-pixel viewport (native size; do not upscale).
- `review-dark.jpg` — review desk in dark mode.
- `sign-in.jpg` — validator sign-in screen.

Blogger: use Insert image → Upload from computer for each file, replace each relative `src` in `post.html` with its Blogger URL, keep the alt text and captions, and preview desktop and phone widths.

## Implementation and verification evidence

What changed in code (all in `apps/tribestudio`):

- New design system in `src/ui/` (tokens, base, motion, components, shell, auth CSS; `AppShell`, `AuthScreen`, `DisplayControl`, primitives and icons). Fonts are self-hosted via `@fontsource-variable/sora` and `@fontsource-variable/inter`. Display preferences (colour mode, animations, text size, high contrast) are stored per device under `tribestudio.display` and applied before first paint from `index.html`.
- Every creator page, the contributor portal, the review desk, corpus records, lexicon tools, the public founding-creator pages and all sign-in screens rebuilt on it. The shim `src/interface/` and the old `studio-shell.css` were removed; the video editor keeps its dark cutting-room theme, re-scoped to the new shell and moved onto the same palette.
- Behaviour kept: every data call, callable, autosave, guard, permission check and tested string. Two fixes: the post composer no longer autosaves an empty "untitled" draft when it opens (the account id and terms version arriving after mount no longer count as edits), and bare service error codes are explained in plain words in corpus records and points.

Checks run on 2026-10-04:

- `npm run check` in `apps/tribestudio`: typecheck, the studio validator (16 lazy routes, error states, design-system invariants), 68 tests (workflows, PWA, video editor) and the production build — all passing. The workflow tests now give design-system components named placeholders and check the overview's counts through its status cards.
- Headless-Chrome screenshots of 60+ views across the creator studio, contributor portal, validator portal, public pages and sign-in screens at 1440 × 900 and 390 × 844, in light and dark, with large text and high contrast, and with animations off. An automated pass found no horizontal page overflow on any of them. With Display → Animations: Off, no running animations remained.
- Exercised against the emulators: signing in, the creator overview, library, post detail, notifications, published work, opportunities, expressions history, dictionary preview, profile, project creation through the New video dialog into the editor, the contributor overview and workbench with a seeded assignment, and the review desk queue, record and decision panel (choosing a decision, not recording it).

Not verified in this pass: the Functions emulator could not load the functions bundle on this machine's Node 24 (`ERR_REQUIRE_ASYNC_MODULE`), so nothing that depends on a callable was exercised — sending an expression or dictionary word, recording a review decision, corpus record listing, points and redemptions, streaks, Kawuri and the AI video maker. Production, the public website, the dictionary and admin sites were not touched.

## Publishing steps

1. Deploy only with separate authorisation: TribeStudio Hosting, after the branch is reviewed, committed and pushed (see the repository's hosting deploy guard). No rules, indexes or Functions changes are needed for this redesign.
2. Before announcing, sign in to production as a creator, a contributor and a validator and check the callable-backed steps listed above.
3. Update the Availability note and the "Not yet live" box in `post.html` with the deploy date and what was verified.
4. Upload the images, replace their `src` values, and preview in Blogger.
5. Set the title, labels, search description and permalink above. Chinedum publishes the article.
6. Replace the clearly marked article URL placeholder in `share.md` before sharing.

Preparing this article does not authorise deployment, Blogger publication or sending messages; those remain with the owner and Chinedum.
