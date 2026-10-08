# Kasem words and spelling from the orthography book

Status: **Article unpublished. Book content directly published and verified in production on 2026-10-08. Web/Kawuri deployment and Android build verification in progress; Google Play rollout unconfirmed.**

| Field | Value |
|---|---|
| Title | Kasem words and spelling from the orthography book |
| Labels | `Kasem`, `Dictionary`, `Spelling`, `Keyboard`, `Kawuri`, `Feature` |
| Search description | All vocabulary rows from the corrected Kasem orthography book, with spelling rules, examples and a keyboard aligned to its written alphabet. |
| Custom permalink | `kasem-orthography-book-spelling-guide` |
| Article | `post.html` |
| Sharing copy | `share.md` |

## Implementation and evidence

- Source: supplied `Kasem_Orthography_Corrected.docx`; its SHA-256 and attribution are recorded in `data/orthography-seed/book.json` and the production import manifest.
- All 646 vocabulary rows are covered, plus spelling-explanation words, 22 grammatical terms, pronoun forms and numeral appendices. The normalized source contains 894 word/form records; 889 target dictionary records and five target expressions. Twenty-three matched existing records; they were enriched without overwriting meanings, recordings or speaker metadata.
- Twenty-eight spelling rules plus the correction to the existing definiteness rule were published. All 71 translated, unambiguous source examples were published. The public guide has 74 examples, including one untranslated and two ambiguous conditional examples.
- Owner-directed publication is limited to this book import, and recorded as `owner-direct-source`. Contributor review requirements remain intact. No false reviewer identities, gold authentication, recordings, interlinear glosses or model-training grants are generated.
- Import completed with all 994 planned writes verified. Recovery snapshot: ignored `production-backups/kasem-orthography/2026-10-08T10-05-19-421Z.json`. Manifest: `dictionaryImports/bgl-kasem-orthography-1997`.
- The active Kawuri grounding path rechecks the completed source manifest and publication state. It quotes source rules/complete examples and labels their source; ambiguous translations are excluded.
- Mobile, Android, dictionary and TribeStudio palettes use the book’s written letters and specified acute/grave marks. Search retains historical spellings. The Android Kasem layout excludes q, x and standalone c; English QWERTY is retained separately.
- Validation: source integrity/provenance and grounding tests, mobile key-bar/settings tests, all three web application checks, and desktop/mobile spelling-guide filtering/layout checks. Final deployment evidence is recorded below.

## Images and credits

- `images/spelling-guide-desktop.png` (1440 × 1000): actual local product screenshot of the generated spelling guide and expanded alphabet rule.
- `images/spelling-guide-mobile.png` (390 × 844): actual local product screenshot of the expanded alphabet rule at phone width.
- Credit: Indigen World product screenshots, October 8, 2026. These screenshots verify the local release UI; they do not by themselves prove deployment.
- Regenerate with `node scripts/check-orthography-guide.mjs` against the dictionary preview. Set `ORTHOGRAPHY_PREVIEW_URL` to its origin when using a port other than 5180.
- Blogger: choose **Insert image → Upload from computer** for each PNG, then replace the relative image `src` in `post.html` with its Blogger image URL. Preserve the alt text, dimensions and captions.

## Blogger and sharing handoff

1. Check the release evidence below and update the availability paragraph to the confirmed deployment state.
2. Upload both supplied PNGs, replace their article image URLs, and paste `post.html` into Blogger HTML view.
3. Set the title, labels, search description and permalink above. Preview on phone and desktop.
4. Chinedum can publish the article and replace the published article URL placeholder in `share.md`.

The user's automatic-publication request was applied to the book's project content. No Blogger post or external message has been sent.

## Confirmed release evidence

- Production content import: completed and verified October 8, 2026.
- Web Hosting and Kawuri: verification in progress.
- Android binary: verification in progress. Google Play distribution unconfirmed.
