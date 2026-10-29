# One Kasem question through a complete evidence cycle

**Blogger:** Published on Indigen World Updates on 29 October 2026: https://updates.indigenworld.com/2026/10/kasem-question-evidence-cycle.html

- **Title:** One Kasem question through a complete evidence cycle
- **Labels:** Kasem, Kawuri, Research, Language review, Data quality
- **Search description:** A five-question Kasem pilot links documentary evidence, natural speech, scoped review and unseen Kawuri tests. Local tools are ready; speaker work is pending.
- **Prepared:** 11 October 2026
- **Updated:** 12 October 2026; user authorised the editable sources and four passages were checked against matching local DOCX files.
- **Status:** Local research tooling implemented and tested. Selected editable-source checks complete; pilot collection, rights, community review and actual Kawuri evaluation pending. No live release or external publication.

## Evidence and verification

The implementation and limitations are in [the pilot runbook](../../../../docs/data/language-cells/kasem/person-meaning-pilot/README.md). `cycle.json` has five open questions, four unapproved documentary candidates and twenty unexecuted evaluation situations. The application has not been audited or deployed by this work.

Validation: `npm run test:contracts` (23 fixtures), `npm run test:kasem-cycle` (14 tests), and the earlier evidence/dataset/grounding regression subset (42 tests). Synthetic tests do not validate a Kasem claim. No emulator or authenticated browser rollout is needed for these offline tools; they do not modify an application workflow, server rules or a callable.

## Image assets and credits

- `cycle-illustration.svg`: original vector workflow illustration authored for this post, clearly labelled as a planned pilot. No source-book images or private contributor content are reproduced.
- `screens/cycle-illustration.png`: rasterized, unaltered illustration used by the post-art renderer. Despite the directory name, this is not a screenshot.
- `images/cover.png`: branded illustrated cover.
- `images/cycle-illustration.jpg`: framed workflow illustration. The art renderer adds the frame and text; the illustration remains unchanged.

Credits: Indigen World; illustrations prepared with Codex. No third-party image assets. Both figures are illustrations, not evidence that the pilot is complete.

Regenerate the raster from the SVG with the installed `@resvg/resvg-js`, then run:

```powershell
node apps/updates-blog/scripts/render-post-art.mjs 2026-10-11-kasem-question-evidence-cycle
```

## Blogger handoff for Chinedum

1. Create a Blogger draft using the title, labels and search description above.
2. Upload the actual `images/cover.png` and `images/cycle-illustration.jpg` assets to Blogger. Do not upload private packets, source evidence, judgments or recordings.
3. Paste `post.html` into HTML view. Replace its two relative `src` values with the uploaded image URLs. Keep the descriptive alt text and captions, including the illustration labels.
4. Preview desktop and mobile; ensure each image appears once and text is legible. Recheck the availability paragraph before publishing, keeping implemented tools separate from completed research and live releases.
5. After Chinedum publishes, put the real article URL into `share.md` and this README and update the post index status. Preparation does not authorize publication or sending messages.
