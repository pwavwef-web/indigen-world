# A faster contributor translation workspace

Status: **Draft article — implementation verified locally; production deployment pending.**

| Field | Value |
|---|---|
| Title | A faster contributor translation workspace |
| Labels | `Contributors`, `Kasem`, `Tribe Studio`, `Accessibility` |
| Search description | A simpler, mobile-first workspace helps invited contributors translate Kasem expressions, save drafts and move through assignments faster. |
| Custom permalink | `contributor-workspace-redesign` |
| Article | `post.html` |
| Sharing copy | `share.md` |

## Implementation and verification

- Reworks the existing contributor portal without changing its routes, Firestore reads, callable API or permission meanings.
- Preserves revision-aware autosave, account-scoped recovery copies, attribution, reviewer feedback, uncertainty flags and explicit optional AI-training consent.
- Adds a compact assignment overview, horizontally scrolling filters, structured alternatives, a cursor-aware Kasem keyboard and a sticky mobile action bar.
- Uses a split expression-list/editor workspace at desktop widths and a focused list-to-editor flow on phones.
- Includes empty, completed, revision, save-error and recovery states.

Validation: shared UI packages built, Tribe Studio type checks passed, and all 37 Studio workflow/PWA tests passed. The production Tribe Studio build passed. The cloud browser could not access the local preview URL, so device screenshot verification remains a pre-deployment check.

## Publishing handoff

1. Deploy Tribe Studio Hosting and complete the production contributor smoke test.
2. Check the contributor preview or a controlled assignment at 360px, 390px, 430px, tablet and desktop widths.
3. Review `post.html`, paste it into Blogger in HTML view, and apply the metadata above.
4. Replace `[PUBLISHED_POST_URL]` in `share.md` after publication.

Do not describe the redesign as live until Hosting deployment and the authenticated production check are complete.
