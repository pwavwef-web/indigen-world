# Check Kasem spellings without leaving your contribution

Status: **Implemented and verified locally. Production deployment pending. Blogger unpublished.**

- Title: Check Kasem spellings without leaving your contribution
- Labels: Kasem, Contributors, Dictionary, Accessibility, TribeStudio
- Search description: Check Kasem words against the approved dictionary, use reviewed spelling suggestions, and submit missing words without losing your contribution.
- Suggested permalink: kasem-dictionary-assistance
- Article: `post.html`
- Sharing copy: `share.md`

## Implementation and availability

Shared native-input decoration covers assigned translations and alternatives, open expressions, knowledge originals/transcripts/structured originals, Kasem writing and source/target translations, post titles/descriptions, image captions/alt text, narration scripts and video captions/lyrics explicitly marked Kasem. The public website directs contributors into these portals. Dedicated single-word forms are excluded. Repository documentation and language selectors verify the existing Kasem tag `xsm`.

The dictionary stays on the server: a paged snapshot cached for 60 seconds, capped at 25,000 entries. Incomplete scans cannot prove absence. Client requests coalesce across fields in batches of 80 after a 550 ms debounce. Up to 2,000 tokens are cached; missing results expire after 15 seconds, approved results after 60 seconds. Active fields refresh and unknown checks retry. Only approved entries and explicitly recorded forms are suggested. Native controls retain selection, paste, multiline input, composition and undo/redo. Browser `insertText` preserves editing transactions; unsupported browsers get manual replacement instructions.

The compact form calls `submitDictionaryEntry` and `submitCollectionContribution`, including required details, public cultural material, consent, publication choice, request idempotency and canonical review records. Transactional spelling locks prevent concurrent assistance duplicates. Derived `spellingKey` fields identify pending spellings without disclosing private details. The backfill changes only these keys on older word receipts; no language text, decisions, consent or points change.

No native Flutter app update or Play rollout is included. Browser attributes cannot control every keyboard or extension. Signed-in production submission is not verified by creating real language records.

## Verification

- Functions build and TribeStudio typecheck, validators, 76 tests and production build passed.
- 118 focused backend tests passed, including Unicode matching, Kasem characters/tone, punctuation/case, original offsets, approved-only candidates, grapheme distance, selected-occurrence replacement and stale offsets, alongside existing review/queue workflows.
- Lookup tests cover coalescing, batch bounds, cache expiry, partial replies and failures.
- Chromium browser checks at 1366 px and 390 px cover click/tap, replacement, undo/redo, keyboard dismissal, word payload, parent text preservation, pending status, outages and composition. External calls are mocked; no actual contribution is sent.
- Real Firestore emulator handlers verify auth, bounds, consent, approved duplicates, concurrent duplicates, canonical submissions, no immediate publication/points, retries, legacy status and newly approved words. The test process passed; Firebase CLI reported an unexpected error during emulator shutdown.
- Production deployment evidence is recorded separately once verified.

## Images and credits

Actual product screenshots from the existing local contributor preview, with synthetic text and controlled dictionary responses:

- `images/dictionary-assistance-desktop.png`
- `images/dictionary-assistance-mobile.png`

Interface and screenshot credit: Indigen World / TribeStudio. These product screenshots show test fixtures, not live contributions or illustrations. Captions state this explicitly.

## Blogger publishing handoff

1. Create the article using the title, labels, description and permalink above.
2. Upload both PNG assets through Blogger's image control.
3. Paste `post.html` into the HTML editor. Replace both relative image paths with the actual Blogger URLs, keeping alt text and preview captions.
4. Preview on desktop and mobile and confirm the deployment status before publishing.
5. Publish when ready, then replace `[PUBLISHED ARTICLE URL]` in `share.md`.

Repository preparation and platform deployment do not publish the Blogger article or send community messages. Publication and sharing remain with Chinedum.
