# Kawuri answers from reviewed records

Status: **Unpublished article. Backend deployed and verified on 2026-10-03. No new mobile binary, Blogger publication or sharing performed.**

| Field | Value |
|---|---|
| Title | Kawuri answers from reviewed records |
| Labels | Kawuri, Kasem, Language, Contributors, Reliability |
| Search description | Kawuri quotes reviewed language records, checks current permissions, and withholds unsupported Kasem instead of displaying model guesses. |
| Custom permalink | kawuri-reviewed-language-answers |
| Article | post.html |
| Sharing copy | share.md |

## Images and credits

- images/reviewed-answer-path.png (1400 × 820): original conceptual workflow illustration authored as the accompanying SVG and rendered with resvg. Credit: Indigen World. It is clearly labelled as an illustration, not a screenshot or deployment evidence.
- Upload the PNG with Blogger Insert image → Upload from computer. Replace the relative src in post.html with the uploaded Blogger image URL. Keep the descriptive alt text, dimensions and caption. The SVG is editable source; use the actual PNG for Blogger.

## Implementation and verification

The shared askKawuri path serves mobile chat and community mentions. Its provider output is restricted to a parsed request plan; the server renders all displayed answers. Whole-word and whole-expression matches preserve source text. Contributor training projections are used only as an index, with original submissions rechecked for review, ownership, publication/training grants and withdrawal. Public sentence evidence retains independent review and held-out exclusion. Source records are read fresh. No data migration, permission change, provider upload or model training is part of this update.

Ambiguous multi-line expression bundles and editorial instructions are withheld. Their correction remains a review task. Chat supports recorded language and fixed app help; unconstrained cultural and grammar generation are withheld. Media tools are separate.

Functions build passed. All 97 selected unit/helper tests and five Firestore/callable integration tests passed. Four public callable checks passed. Both deployed functions are ACTIVE; deployed source and bundle matched the tested build. All 20 existing application settings were retained. Implementation commit: 9b750d6. See docs/product/kawuri-grounded-answers.md.

## Publishing steps

1. Confirm the production rollout and update the availability paragraph and this status using its evidence.
2. Upload the included PNG and replace its relative article URL as described above.
3. Paste post.html in Blogger HTML view, set the metadata, and preview on phone and desktop.
4. Chinedum can publish, then replace the clearly marked article URL placeholder in share.md.

Blogger publishing and community sharing have not been requested. Leave that handoff to Chinedum.
