# Kawuri corpus contributions with sources and review history

Status: **Implemented and locally verified. Push and deployment requested; verification pending. Article not published or shared.**

| Field | Value |
|---|---|
| Title | Kawuri corpus contributions with sources and review history |
| Labels | `Kawuri`, `TribeStudio`, `Kasem`, `Contributors`, `Corpus`, `Release` |
| Search description | Capture Kasem words, expressions, stories and recordings with sources, rights, revision history and controlled human review. |
| Custom permalink | `kawuri-corpus-workspace` |
| Body | `post.html` |
| Sharing copy | `share.md` |
| Images | `images/corpus-workspace.png`, `images/submission-receipt.png` |

## Implementation evidence

- Route `/contributor/corpus`, linked from contributor and Studio navigation. Ten source-aware category flows, structured representations, granular rights, autosave, receipts, exact revision history, review checklist and controlled reference/release interfaces.
- Shared version 2 catalogue and JSON Schema in `packages/contracts`; private callable operations in `knowledge-workspace.ts`, `knowledge-policy.ts`, `knowledge-release.ts` and `knowledge-governance.ts`.
- Unconfigured policy fails closed. Sentence submission and qualified authentication are policy-gated. No automatic Gold from approval counts. No new reward programme or bulk production migration.
- Existing assignment reward history and records are preserved. Legacy corpus records remain intact and need reconciliation. The new all-time history totals count version 2 records only.
- Actual local browser checks exercised the submission receipt and reference/policy screens at 360, 768 and 1440 px without horizontal overflow. Images are screenshots of those product components with synthetic data, not a claim of live reviewed Kasem records.
- Verification passed: 22 contract fixtures across 26 schemas; 20 corpus tests; 20 Labs integration/rules tests; 9 Labs helper tests; the corpus Storage privacy/immutability test; 64 TribeStudio tests, TypeScript and production build; responsive browser flows at 360, 768 and 1440 px.
- Read-only production preflight found no current corpus policy and zero records in `knowledgeRecords`. Existing dictionary and expression collections were not migrated or modified.

## Availability and limits

Deployment does not approve a linguistic contract, reviewer qualifications, consent template or model use. Human policy decisions in `docs/product/kawuri-corpus-implementation.md` remain release gates. No model training, voice synthesis, automatic deletion/unlearning or bulk data cutover is claimed. Upload container checks do not replace human pronunciation review. Dedicated corpus-source cards in existing mobile clients and a representative community pilot remain follow-up work.

## Images and credits

Both PNGs are screenshots of the implemented React workspace, captured locally with synthetic fixtures. Credit: **Indigen World — local product screenshots, 3 October 2026**. They contain no private recordings or member data. The overview visibly labels the local preview; captions retain that distinction for both images.

1. Create a Blogger draft with the title, labels, search description and permalink above.
2. Paste `post.html` into HTML view.
3. Upload both actual PNG assets using Blogger's Insert image → Upload from computer.
4. Replace each local `images/...` source with its uploaded Blogger URL. Keep the descriptive alt text and captions.
5. Check the final deployment status and availability paragraph. Do not announce authenticated content, training or live review coverage before those gates are verified.
6. Chinedum can publish the article, then replace the clearly marked URL placeholder in `share.md` before sharing it.

The user's request authorizes code push and deployment. It does not authorize publishing this Blogger article or sending community messages.

## Deployment verification

Pending at preparation time. Record the pushed commit, Hosting release, selected Functions deployment, Storage/index status and live checks here after successful release. Preserve any remaining limitations explicitly.
