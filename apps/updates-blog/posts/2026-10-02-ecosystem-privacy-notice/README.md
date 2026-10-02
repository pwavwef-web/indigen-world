# A clearer privacy notice for the whole Indigen World ecosystem

- **Title:** A clearer privacy notice for the whole Indigen World ecosystem
- **Labels:** Indigen World, Privacy, Project Kassena, Website, TribeStudio, Labs
- **Search description:** Explore Indigen World’s expanded privacy notice, with clearer data choices across the website, app, TribeStudio and Labs, and a new animated header.
- **Suggested permalink:** ecosystem-privacy-notice
- **Date:** 2 October 2026
- **Status:** Draft repository article. Website deployed and verified live on 2 October 2026; final legal approval and Blogger publication pending.

## What changed

Expanded the privacy notice to 21 topics covering the connected ecosystem,
replaced its shared legal header art with an original Gemini Omni video and still
poster, added a responsive contents index and summary cards, and added
motion-aware reveals with a header pause control. Payment-document comparison,
IP-derived form rate limits and new-subscriber welcome mail are disclosed.

This change does not turn on any backend feature, subscription, advert provider,
newsletter campaign or AI capability. Keep the implementation-summary status and
feature-availability limits in the article. Legal approval is not claimed.

## Local verification

- `npm run check:website`: TypeScript, existing route/privacy checks and production build passed.
- Browser review at desktop 1280×720 and phone 390×844: 21 sections, no horizontal overflow, readable header and notice, contents navigation and privacy-request links.
- Header pause/play, offscreen pause, reduced-motion still fallback and direct fragment reload checked. Reduced-motion reload made zero video requests. Blocking the video request verified the still-image fallback and removal of the unavailable playback control.
- FFmpeg decoded all 192 frames of the 8-second 1280×720 H.264 header video successfully; its public version has no audio stream. Both header assets are present in the production build.
- All privacy-page fragment links resolve to actual section IDs. All four Blogger image references resolve to assets stored with this post. `git diff --check` passed.
- Local-verification images are actual application screenshots. They contain no signed-in
  activity, private account details or cultural submissions.
- Review evidence and remaining legal facts:
  `docs/product/privacy-notice-evidence.md`.

## Release/deployment evidence

**Deployed to production on 2 October 2026.**

- Source commit: `6b548f2848c3af2899a82e750f0df77596745f30`, pushed to `origin/main` before deployment.
- Command: `npm run deploy:website` (Firebase Hosting site `indigen-world`, project `project-kassena-7e026`). The CLI confirmed version finalization, release completion and deploy success.
- Live verification began at 11:37 UTC on 2 October 2026: `https://indigenworld.com/privacy` returned HTTP 200 with the updated page and 21 sections.
- Live JS, CSS, JPEG and MP4 returned HTTP 200 and SHA-256 hashes matched the production build.
- Desktop and phone-width (390 px) layouts had no horizontal overflow. Header video loaded; pause/play and offscreen pause worked. The keyboard deep link and Contact privacy-request route were verified.
- Reduced-motion, Save-Data handling and video-failure fallback were verified locally before release; this post does not claim they were all retested on production.
- `images/privacy-live.jpg` is an actual screenshot of the released custom-domain page.

No Blogger article has been published or message sent.

## Images and credit

- `images/privacy-live.jpg`: released custom-domain desktop header screenshot.
- `images/privacy-desktop.jpg`: local desktop header screenshot.
- `images/privacy-sections.jpg`: local full-notice reading screenshot.
- `images/privacy-mobile.jpg`: local phone-width header with reduced motion.

Screenshot credit: **Indigen World — verified production and local website screenshots,
2 October 2026.** Captions identify each environment.

Artwork credit: **AI-generated illustration/video made with Google Gemini Omni
for Indigen World, 2 October 2026.** It depicts an imagined architectural
courtyard, book and archive with a protective gold arc. It is inspired by Kassena
architecture and stewardship, not documentary photography or an authenticated
sacred/community design. The public page labels it as AI-generated.
Generation prompt and provenance: `tools/privacy-header/generation.json`.

## Blogger handoff

1. Review the recorded release evidence and preserve the implementation-notice legal status.
2. Create a Blogger draft with the metadata above and paste `post.html` into
   the HTML editor.
3. Upload the four actual JPEGs from `images/` using Insert image → Upload
   from computer. Replace each local image source with its Blogger URL.
   Preserve the descriptive alt text and captions, including local-build
   and AI-generated-art labels.
4. Update only the availability wording supported by the actual release. Do
   not claim final legal approval, automatic deletion or universal feature access.
5. Preview desktop and mobile. Chinedum publishes and shares when ready.
6. Replace the marked published-article URL placeholder in `share.md`.

Older posts remain intact. Repository preparation is not external publication.
