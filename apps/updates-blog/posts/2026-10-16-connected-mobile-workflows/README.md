# Connected mobile workflows — development preview

- **Title:** A more connected Indigen World: shop, notifications and mobile creation
- **Labels:** Indigen World, Mobile, Development preview, Shop, TribeStudio
- **Search description:** A development preview of connected shop, artwork uploads, actionable notifications and native mobile editing, with availability gates explained.
- **Status:** Prepared repository content. Not published to Blogger, not shared,
  not deployed, no store release, no live charges and no broadcasts.
- **Publishing owner:** Chinedum. Preparation does not authorize publication.

## Images and reproduction

`screens/` contains actual rendered Flutter/widget and desktop/tablet browser
captures. All identities, products, prices, addresses, orders and messages are
synthetic local fixtures. Browser services are mocked; server authority is
tested separately in Firebase emulators. The screenshots are not device or
provider-delivery evidence. Noto Sans is bundled from the existing repository
fonts under SIL OFL 1.1.

`images/` supplies the branded cover and framed figures used by `post.html`.
Frames, titles and backgrounds are illustration; the underlying screenshots
are unaltered. Regenerate them with
`node apps/updates-blog/scripts/render-post-art.mjs 2026-10-16-connected-mobile-workflows`.

The Paga pond image in product/editor fixtures is by **Dieu-Donné Gameli**,
[Wikimedia Commons source](https://commons.wikimedia.org/wiki/File:Paga_Crocodile_Pond.jpg),
[CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). Cropping in the
screens is a UI crop. Preserve credit and license links with these screenshots.
The roof/bars/sun mark is the repository’s existing Indigen World logo, rendered
from `apps/website/public/favicon.svg`; no new logo was generated.

Reproduce from the repository root:

```text
node apps/admin/scripts/integrated-upgrade-browser.test.mjs
cd apps/mobile
flutter test --no-pub test/features/integrated_upgrade_screens_test.dart
```

Run the Flutter suite before `node --test firebase/tests/mobileVideo.bridge.test.mjs`
from the root to verify the actual Flutter raster through the worker. Its private
MP4 and raw fixture remain outside Git.

The screen set includes Home, Categories, Cart, Profile, Checkout, Order,
large-text dark theme, Notifications, Literature, compact sponsor, mobile editor
and caption controls, plus Admin product desktop/tablet, order and composer.

## Blogger handoff

1. Reconfirm implementation/deployment status with the acceptance ledger before
   publishing. Keep “development preview” unless a live release is verified.
2. Upload every image referenced in `post.html` to Blogger, keep the captions,
   credits and descriptive alt text, then replace `screens/...` with Blogger’s
   returned image URLs. Actual image assets are supplied; do not publish local
   paths or substitute unlabelled concept artwork.
3. Paste the article body in Blogger HTML mode; set the title, labels and search
   description above. Preview desktop and mobile before saving/publishing.
4. After publication, insert the actual article URL into `share.md`. Sharing is
   a separate action for Chinedum; nothing has been sent automatically.

See [the implementation ledger](../../../../docs/product/integrated-mobile-upgrade-ledger.md)
and [the runbook](../../../../docs/architecture/integrated-mobile-upgrade.md) for
tested behavior, exact configuration and remaining acceptance limits.
