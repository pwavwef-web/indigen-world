# Kasem words and spelling from the orthography book

Status: **Article unpublished. Book content, all three websites and both Kawuri functions published and verified in production on 2026-10-08. Android keyboard source corrected; production bundle blocked by dependency downloads. Google Play rollout unconfirmed.**

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
- All 646 vocabulary rows are covered, plus spelling-explanation words, 22 grammatical terms, pronoun forms and numeral appendices. The normalized source contains 894 word/form records: 889 dictionary source records across 886 public dictionary documents, and five expressions. Three repeated source records share an existing destination. Twenty-three source records initially matched existing entries; they were enriched without overwriting meanings, recordings or speaker metadata. Anonymous public queries verified every normalized word/meaning pair.
- Twenty-eight spelling rules plus the correction to the existing definiteness rule were published. All 71 translated, unambiguous source examples were published. The public guide has 74 examples, including one untranslated and two ambiguous conditional examples.
- Owner-directed publication is limited to this book import, and recorded as `owner-direct-source`. Contributor review requirements remain intact. No false reviewer identities, gold authentication, recordings, interlinear glosses or model-training grants are generated.
- Import completed with all 994 planned source writes verified across 991 destination documents. Final recovery snapshot: ignored `production-backups/kasem-orthography/2026-10-08T10-28-01-458Z.json` (release worktree). Manifest: `dictionaryImports/bgl-kasem-orthography-1997` records source counts separately from unique destinations.
- The active Kawuri grounding path rechecks the completed source manifest and publication state. It quotes source rules/complete examples and labels their source; ambiguous translations are excluded.
- Mobile, Android, dictionary and TribeStudio palettes use the book’s written letters and specified acute/grave marks. Search retains historical spellings. The Android Kasem layout excludes q, x and standalone c; English QWERTY is retained separately.
- Validation: source integrity/provenance and grounding tests, mobile key-bar/settings tests, all three web application checks, and desktop/mobile spelling-guide filtering/layout checks. Final deployment evidence is recorded below.

## Images and credits

- `images/spelling-guide-desktop.png` (1440 × 1000): actual deployed product screenshot of the generated spelling guide and expanded alphabet rule.
- `images/spelling-guide-mobile.png` (390 × 844): actual deployed product screenshot of the expanded alphabet rule at phone width.
- Credit: Indigen World product screenshots, October 8, 2026, captured from `https://kasem-dictionary.web.app`. The complete guide also matched the release build on the website and TribeStudio hosts.
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
- Web Hosting: successful release to `indigen-world`, `kasem-dictionary` and `tribestudio`; all three public guides matched the generated release artifact. Live dictionary guide passed rule-count, vocabulary-filter, phone-width and JavaScript checks.
- Kawuri: successful Node.js 22 deployment of `kawuriChat` and `onCommunityKawuriMention`. Deployment source: `cb0eb9ffc88b96565888e38da0eea6f5eeb55693` on `main`. A fresh read through the compiled active lookup returned 1,225 published words, 76 book expressions/examples and 28 book rules, and verified the alphabet answer and `dé tua` / “we came” answer. All 62 backend checks passed; eight relevant mobile tests passed.
- Android binary: source version `0.1.30+39`; keyboard and related mobile source corrected, eight relevant mobile tests passed. The production AAB was not produced. Repeated builds failed on Google Maven DNS/download errors; the final attempt reached `mergeProductionReleaseArtProfile` but could not download Firestore 26.5.0, Messaging 25.1.1 and 64 other artifacts. The original corrupt Gradle journal was avoided with an isolated cache; its later automatic retry was stopped after the repeated download failure. Google Play distribution unconfirmed.
- GitHub Actions: the October 8 checks on `276a426` did not start; GitHub's job annotation reports that the account is locked by a billing issue. Local checks and Firebase deployment evidence above are separate from CI status.
