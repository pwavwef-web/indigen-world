# The dictionary, right where you write

Status: **Deployed and verified October 18, 2026.** Blogger unpublished. Community sharing pending.

- Title: The dictionary, right where you write
- Labels: Kasem, Contributors, Dictionary, Tone marks, TribeStudio
- Search description: Choose documented Kasem words and tone patterns while translating, review dictionary gaps, and nominate new words for community review.
- Suggested permalink: dictionary-guided-kasem-translations
- Article body: `post.html`; sharing handoff: `share.md`.

## What is included

Assigned sentence translation tasks gain source vocabulary recommendations, tone-aware per-occurrence choices, native editing transactions, optional highlighting, session dismissal, dictionary review counts and missing-word nominations. Suggestions come from existing published `dictionaryEntries`. Recorded approval is distinguished from direct source publication and missing review metadata. No AI spelling invention or automatic tone assignment occurs.

The production dictionary was inspected read-only on October 18: 1,554 published entries, 29 marked headwords, 31 records with structured senses, 16 with recorded forms, 704 with an audio URL and one with IPA. Counts describe that inspection, not a guarantee of data completeness or speaker verification. Actual records form the language fixture used in tests. No production contributions were created for verification.

No database migration, new collection, index, security-rule change, automatic publication or reward-policy change is required. The new read-only callable is `getKasemDictionaryAssistance`; `saveExpressionAnswer` preserves submitted translation Unicode and whitespace exactly while retaining nonempty submission validation. Assistance metadata is not added to saved contributions; choice IDs remain in the current response/session.

## Verification and availability

Production source: `f5a2507c82a63f0c8e1af9d63c05b2979f8830ca` on `origin/main`. Firebase CLI 15.34.0 confirmed the two function updates and `hosting:tribestudio`. The functions are ACTIVE at revisions `getkasemdictionaryassistance-00002-pux` and `saveexpressionanswer-00010-doy`. Both reject unsigned requests with HTTP 401 / UNAUTHENTICATED. The contributor route returns HTTP 200 on both `tribestudio.indigenworld.com` and `tribestudio.web.app`; eight relevant served files on each domain match the tested build byte-for-byte. Four live desktop/mobile sign-in contexts pass without JavaScript errors or horizontal overflow. Details and hashes: [release-evidence.json](release-evidence.json).

Final checks passed: 80 frontend tests; 66 backend/unit tests; 16 focused assistance/spelling/cache checks (overlapping); five Firestore assistance/submission tests; 14 rewards emulator tests; four local desktop/mobile browser scenarios; typechecks and production builds. Existing Hosting predeploy checks additionally passed 29 website tests and four standalone dictionary tests without deploying those sites. No failures remain in these final checks. No real signed-in production submission was created for verification.

See [the implementation report](../../../../docs/product/dictionary-guided-translations.md) and the release evidence saved with this post. Desktop and 390 px touch-browser tests use the actual interface with locally intercepted external calls. Their submissions never reach production. Native Chromium undo/redo is tested; browsers without native insertion support receive manual insertion instructions. Phrases are bounded to six words and 160 characters; recommendations to 24 and alternatives to 40 per term. Dictionary coverage and English ambiguity remain limits.

## Images and credits

Indigen World / TribeStudio interface and screenshots. The raw, unaltered product captures are in `screens/`; test account and task activity are local preview data. Dictionary vocabulary comes from published database records retrieved read-only on October 18. The unfamiliar-word fixture is explicitly artificial. These are not evidence of signed-in production submission.

`images/cover.png` and the three framed JPG figures are made by the repository's existing release-art renderer. Frames, backgrounds and titles are illustration; the embedded product screenshots are unaltered.

Regenerate after rerunning the browser checks:

```sh
node apps/tribestudio/scripts/dictionary-assistance-browser.test.mjs
node apps/updates-blog/scripts/render-post-art.mjs 2026-10-18-dictionary-guided-translations
```

## Blogger publication handoff

1. Review the production evidence and availability limits before publication.
2. Create the article with the title, labels, description and suggested permalink above.
3. Upload `images/cover.png` first, followed by `dictionary-words-desktop.jpg`, `tone-review-mobile.jpg` and `dictionary-review-desktop.jpg`.
4. Paste `post.html` in Blogger's HTML editor. Replace each relative image `src` with its uploaded Blogger URL; retain alt text and captions.
5. Preview desktop and mobile, publish when ready, then replace `[PUBLISHED ARTICLE URL]` in `share.md`.

Repository preparation and platform deployment do not publish this article or send community messages. Publication and sharing remain with Chinedum.
