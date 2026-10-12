# Easier discovery and a clearer grammar guide on Venacula

- **Prepared:** October 12, 2026
- **Labels:** Indigen World, Kasem, Venacula, Dictionary, Grammar, Product Updates
- **Search description:** A clearer Kasem dictionary and grammar reference, with mobile navigation, topic search, chapter filters and easier source browsing.
- **Status:** Deployed and verified on October 12, 2026. Blogger article and sharing copy are unpublished.

## What changed

The dictionary has readable, horizontally scrollable collection buttons on phones,
a two-row header on intermediate desktop and tablet widths, larger search text and
touch controls, clearer definition metadata, and links into the grammar and spelling
guides. The selected collection survives refresh. A shared entry URL opens the entry
on a phone. Saved and recent lists explain that their records belong to this browser.

The grammar guide has a matching reference-library layout, section navigation,
accent-insensitive, multi-term rule search, a chapter filter, expand/collapse/reset
controls and explicit empty states. Examples and word tables initially show 25
records, with a Show 25 more records control; searching checks the complete table.
Source links reveal collapsed chapters. The full source remains in the static HTML
and is readable without JavaScript. No source wording, pronunciation or review
status has been invented or changed.

## Verification

- `npm run check:kasena-dictionary`: type checks, product validation, four tests and production build passed.
- Preservation regression compares all tables, details, figures and block anchors with the existing unmodified reference. Regeneration is also checked.
- Browser checks at 1440, 768, 390 and 320 CSS-pixel widths; no page-wide horizontal overflow in checked layouts. A 320px header overlap found during testing was fixed.
- Grammar: topic search, chapter intersection, expansion, zero matches/reset, sentence search, 25-to-50 record expansion and `#block-530` chapter reveal verified.
- Dictionary: English search, opening a result, mobile shared-entry URL, save/unsave, returning to results and collection persistence after reload verified. No production records were modified.
- A browser timeout during the first mobile deep-link check was resolved by reloading; the requested record and modal semantics then verified successfully.
- No user study or satisfaction measurement has been conducted. These are usability improvements, not a claim of measured satisfaction gains.

## Files and regeneration

Reader assets: `apps/kasem-dictionary/public/grammar-reader.{css,js}`.
Presentation transformation: `scripts/dictionary-guide-layout.mjs`.
Regenerate only this site's guide with `node scripts/build-grammar-guide.mjs --dictionary-only`.
The normal generator still writes the other apps using their existing layouts.

## Release handoff

Deployed source commit `8ec3c186` from a clean detached worktree using the normal
`npm run deploy:kasena-dictionary` pipeline. All configured predeploy hooks passed,
including the production-main guards, dictionary checks (four tests), website
checks and TribeStudio checks. Only Hosting site `kasem-dictionary` was released;
no database, rules, Functions or other Hosting site was deployed.

At 22:38 UTC on October 12, the canonical homepage, `/grammar-guide`, both grammar
reader assets and the compiled dictionary JS/CSS returned HTTP 200 and matched the
clean build byte-for-byte. Live grammar topic search, Chapter 4 filtering and
expansion returned four matching pronoun rules; source-table paging initialized
correctly. A live shared-entry URL opened the water definition in a mobile dialog
at 390px without horizontal overflow; the browser reported no console errors.
Existing unrelated workspace changes were excluded from both commits
and deployment.

## Images and Blogger publishing

The four preview PNG assets under `images/` are actual local product screenshots captured
October 12, 2026. Dictionary screenshots use already published records. Interface
credit: Indigen World. Grammar source credit remains P. L. Hewer / GILLBT; no new
licence to the underlying book is claimed. These are previews, not evidence of a
live release. `dictionary-live-mobile.png` is an additional screenshot captured
from the deployed canonical site after verification, with the same interface credit.

1. Review the verified availability paragraph in `post.html`.
2. Create a Blogger draft using the title, labels and description above.
3. Upload the five PNG files using Blogger's image uploader. Replace each relative
   `images/…` source in `post.html` with the corresponding Blogger-hosted image URL;
   retain the alt text and captions.
4. Paste the article HTML and check both desktop and mobile previews.
5. Chinedum handles publication and sharing. Replace the marked URL placeholder in
   `share.md` with the published article link. Deployment is verified; the Blogger article remains unpublished.

## Suggested usability follow-up

Ask a few Kasem learners to find a meaning, save it, locate a pronoun rule and trace
it to its source. Record completion, confusion and feedback with their consent.
Use the findings to guide the next iteration; no tracking service was added here.
