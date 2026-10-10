# Heritage Frame v1

Default Indigen World correspondence design, prepared October 10, 2026.

- `approved-reference.png`: the reference supplied by the user. It includes the
  presentation surround for provenance only; generation never uses it as a background.
- `heritage-frame-v1.svg`: generated vector linework, diamonds and logo from
  `packages/contracts/heritage-frame.mjs`, shared by both generators and preview.
- `indigen-world-logo.svg`: existing Indigen World roof/bars/sun mark, using the
  TribeStudio blue variant. Source: `apps/tribestudio/src/ui/BrandMark.tsx` and
  `apps/tribestudio/public/favicon.svg`. Added beside the wordmark at the user's request.

The page is A4 white, with live typographic INDIGEN WORLD and indigenworld.com
text. The palette and decorative geometry reproduce the supplied design as
editable vector primitives. The logo uses the same existing mark geometry;
no additional contact, registration, slogan or signature data is added.

Regenerate this SVG after an intentional design change:

```powershell
node --input-type=module -e "import {writeFileSync} from 'node:fs'; import {heritageSvg} from '@indigen-world/contracts/correspondence'; writeFileSync('services/functions/assets/letterhead/heritage-frame-v1.svg',heritageSvg());"
```

Bump the design/generator ID when shipping changes. Preserve old document
versions and their attached bytes. See `docs/architecture/correspondence.md`.
