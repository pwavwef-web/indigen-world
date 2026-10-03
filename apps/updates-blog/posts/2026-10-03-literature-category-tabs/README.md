# Browse Kasem literature by category

Status: **Release article prepared; mobile deployment and Blogger publication blocked by missing release configuration and sign-in.** Implemented and tested locally. No Android bundle or Google Play rollout was produced for this task. Do not present these tabs as live until a released build containing them is available.

| Field | Value |
|---|---|
| Title | Browse Kasem literature by category |
| Labels | `Feature`, `Mobile app`, `Literature`, `Collection` |
| Search description | Browse Kasem folktales, drama, poetry, and food recipes with new category tabs in the Indigen World Literature collection. |
| Custom permalink | `kasem-literature-category-tabs` |
| Cover | `images/literature-folktales.png` |

## What is implemented

- Collection → Literature has All, Folktales, Drama, Poetry, and Food & recipes tabs, even when a category is empty.
- Short stories is no longer an empty preset tab. Like other additional genres, it appears only if published work in that category is present.
- Other published categories are discovered from the loaded literature records and added as tabs; uncategorized work is available in Other and All.
- Category aliases are grouped without rewriting published records. Explicit categories take priority over topical tags; known genre tags are used for legacy generic or missing categories.
- The existing `kasem-sky-far-away` publication is explicitly labeled `Folktale` and is included in All and Folktales.
- Tab counts cover the loaded collection, independently of search. Search appears at the existing threshold of six pieces and combines with the selected category.
- Empty categories distinguish unpublished work from a failed search and offer View all literature. Loading and errors do not claim zero pieces.
- No new content or backend data migration is included. Counts reflect the mobile app’s loaded publication window, not a separate server-wide total.

## Verification and release evidence

Verified locally on 2026-10-03 with the pinned Flutter 3.47.0 / Dart 3.13.0 toolchain:

- `flutter test --no-pub test/features/collection --reporter expanded`: **37 tests passed**, including category aliases, the existing folktale record, navigation from Collection, filtering with search, live category changes, counts, pull-to-refresh, empty/loading/error states, and a 320-pixel-wide screen at 2× text scale.
- `dart analyze lib/features/collection test/features/collection`: **No issues found.**
- The release render test: **1 test passed**. Both saved screenshots were inspected visually; the folktale cover loads from the repository and the empty category's controls are readable.
- `git diff --check`: passed.
- Broader `dart analyze lib test`: no errors, but eight existing diagnostics remain in the untouched `knowledge_repository.dart` and `knowledge_workspace_screen.dart` files (three experimental audio API warnings and five style suggestions). These are outside this change.

The existing story’s metadata and cover are in `output/pdf/sky-folktale/`. Its repository publication receipt records `publishedContent/kasem-sky-far-away`, verified on 2026-09-12. This task does not re-publish the story or claim fresh production verification.

### Deployment attempt — 2026-10-03

The owner requested a push, deployment, and release post. The required `node scripts/build-mobile-aab.mjs` wrapper stopped before building because all four production AdMob identifiers are missing. This machine also has no Android SDK, Java toolchain, `apps/mobile/android/key.properties`, or Android `google-services.json`. An existing configured release environment is needed to build and sign the upload bundle; an old bundle cannot include these new tabs.

The connected Edge browser reached Blogger's Google account chooser and requires the owner to complete sign-in. No article was published. The post, image assets, and sharing copy are ready for that handoff. GitHub mobile checks compile and test the app; they do not distribute it to Google Play. This client-only change requires no Firebase Hosting or Functions deployment.

## Images and credits

| Asset | Size | Purpose |
|---|---|---|
| `images/literature-folktales.png` | 780×1688 | Actual Flutter screen rendered with Folktales selected and the existing story’s local metadata and cover. |
| `images/literature-recipes-empty.png` | 780×1688 | Actual Flutter screen rendered with Food & recipes selected and no recipes in the fixture. |

These are **local renders of the implemented interface**, not screenshots from a released or live-connected app. The fixture contains only the existing folktale, not invented publications. No live Firebase requests are used; the cover is served from the local repository while rendering.

Screen design and rendering: Indigen World. Folktale cover: existing AI-generated artwork from `output/pdf/sky-folktale/cover.jpg`, supplied with the illustrated story. Story and Navrongo Kasem translation: supplied by the storyteller, as recorded in the publication’s cultural notes. The article identifies the cover illustrations as AI-generated.

The render uses Windows Segoe UI under the app’s font-family name to avoid the test renderer’s placeholder font. The render-only AppBar and button styles also receive that font family explicitly; their other styling is preserved. Device font metrics and shadows can differ. Re-render from `apps/mobile` with the pinned Flutter 3.47.0 SDK:

```powershell
flutter test ../updates-blog/posts/2026-10-03-literature-category-tabs/render_literature_test.dart
```

## Before publishing

1. Build and release a mobile version containing this change.
2. Verify Collection → Literature on a phone: existing folktale in All and Folktales, horizontally scrolling tabs, empty Poetry and Food & recipes, and opening the story reader. Verify any additional genres actually published at release time.
3. Update the availability paragraph in `post.html` and this status with the confirmed release version and distribution evidence. The repository implementation alone does not establish release availability.
4. Upload both PNG files to Blogger. Replace each relative `src="images/..."` in HTML with its uploaded Blogger URL, or replace the image in Compose view in the same position. Preserve the descriptive alt text and captions; retain Folktales as the first image.
5. Paste `post.html` in a new Blogger post’s HTML view. Enter the title, labels, search description, and custom permalink above. Preview before publishing.
6. After publication, replace `[PUBLISHED_ARTICLE_URL]` in `share.md` before sharing. The owner has requested publication of this article; sending community announcements remains a handoff to Chinedum.
