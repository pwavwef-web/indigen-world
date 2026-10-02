# Words in the dictionary, expressions for model learning

Status: **Unpublished article. Backend and web hosting deployed and verified on 2026-10-02; production dictionary cleanup complete. Android app release, model training, Blogger publication and sharing have not been performed.**

| Field | Value |
|---|---|
| Title | Words in the dictionary, expressions for model learning |
| Labels | `Dictionary`, `Kasem`, `Contributors`, `TribeStudio`, `Kawuri`, `Feature` |
| Search description | Dictionary words and whole expressions get separate homes, while contributor activation makes model training use a clear requirement. |
| Custom permalink | `dictionary-words-and-model-training` |
| Article | `post.html` |
| Sharing copy | `share.md` |

## Images and credits

- `images/dictionary-and-training.png` (1400 × 820): conceptual workflow illustration created for this post from the accompanying SVG. Credit: Indigen World. It is not a screenshot or evidence of deployment. Recreate with `node -e "const fs=require('fs'); const {Resvg}=require('@resvg/resvg-js'); fs.writeFileSync('apps/updates-blog/posts/2026-10-02-dictionary-words-and-training/images/dictionary-and-training.png',new Resvg(fs.readFileSync('apps/updates-blog/posts/2026-10-02-dictionary-words-and-training/images/dictionary-and-training.svg')).render().asPng())"` from the repository root.
- `images/contributor-sign-in.jpg` (1264 × 802): screenshot of the actual revised TribeStudio sign-in page, captured October 2 from the local Vite application at `/contributor`, with empty fields. Credit: Indigen World product screenshot. Its decorative background is the existing AI-generated conceptual `language-studio.webp` artwork documented in `apps/tribestudio/src/contributor/assets/README.md`; it is not a photograph of cultural evidence.
- Upload both image assets through Blogger **Insert image → Upload from computer**. In HTML view replace each relative `src` with that image’s Blogger URL. Keep the alt text, dimensions and captions. The SVG is source material; upload the PNG. Actual image assets are included.

## Implementation and evidence

- Dictionary readers in mobile, website and the standalone dictionary exclude explicitly classified expressions and non-word lexical kinds. Legacy words and words with example sentences remain readable. Publication routing sends all dictionary phrases, idioms and proverbs to `expressionEntries`.
- Sign-in, invitation copy and activation state the training requirement. Activation and the new `acceptContributorTrainingTerms` callable record version `contributor-training-v2` and acceptance time in the server-owned account. Existing accounts need acceptance before further draft writes or submission. Contributors can leave without accepting.
- New portal submissions receive `aiTraining: true` and the agreement snapshot on the server. Explicit old-client opt-outs are refused. There is no per-expression optional training control; the source-rights confirmation remains.
- Training projection and export use current review and original permission, independently of dictionary publication. Exports retain whole expressions, alternatives and context. Rejections, withdrawals and missing original grants are excluded. Export prepares JSONL; it does not upload data or run training.
- `retire-dictionary-expressions.mjs` defaults to dry-run, rechecks source records in transactions, soft-retires older dictionary copies and restores eligible training pairs without changing permissions or deleting content. Historical copies can be recovered using their migration marker; sources remain unchanged.
- Local verification: 122 backend/helper tests, 64 TribeStudio tests, 31 mobile dictionary tests and all 8 emulator integration tests passed. Functions and TribeStudio builds passed; website and standalone dictionary checks passed. The companion product runbook documents the local emulator loader workaround for the host Node 24 environment.

## Deployment and publication handoff

1. Completed October 2: deploy `activateExpressionContributor`, `acceptContributorTrainingTerms`, `saveExpressionAnswer`, `onContributorExpressionReviewed`, `inviteExpressionContributor`, `resendContributorInvitation` and `decideSubmission`; release TribeStudio, website and standalone dictionary hosting. No new Firestore rule or index is required for this implementation.
2. Build and release the mobile app containing the dictionary reader change. Server cleanup also removes classified expression copies from older app versions’ published queries.
3. Completed October 2: dry-run inventory, recovery snapshot, transactional cleanup and verification using the commands in `docs/product/dictionary-word-scope-and-training.md`. Inventory and audit evidence are retained: 38 expression copies retired, 340 other published entries retained, 38 source submissions unchanged, 30 permitted training pairs preserved and 8 earlier refusals retained. Repeat inventory: zero candidates.
4. Emulator agreement, activation, submission, cleanup/export and withdrawal checks passed. Hosting assets and callable authentication were verified live; a real contributor activation was not exercised. For a subsequent human acceptance check, verify activation with an invited account, the agreement gate for an existing account, submission with training permission, review, export, withdrawal and public dictionary results. Confirm the actual released versions and cleanup counts in this README.
5. Only after those checks, update the availability paragraph in `post.html`, upload the images, paste the article into Blogger HTML view and set the metadata above. Preview on desktop and phone, then Chinedum can publish and replace the article URL placeholder in `share.md`.

Preparation does not authorize external publication or messaging. Chinedum owns the publishing and sharing handoff.

## Confirmed release evidence

Implementation commit: `a1e5098109e44e86fcd7ca15c82c4fd46e256690`. All seven function updates and Hosting releases for TribeStudio, indigen-world and kasem-dictionary succeeded. Live asset hashes, including the contributor agreement chunk, matched the release build on default URLs and the TribeStudio/public-site custom domains. The website's existing advertising configuration was verified. Private recovery evidence is retained under ignored production-backups and .labs-local paths documented in the product runbook. Existing app clients need a refresh/sync; no new Android binary has been distributed.
