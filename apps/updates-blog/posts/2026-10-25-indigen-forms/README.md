# Indigen Forms: build a contribution form without waiting for a release

- **Title:** Indigen Forms: build a contribution form without waiting for a release
- **Labels:** Indigen World, Product updates, Administration, Contributor portal, Validator portal, Community contributions, Languages
- **Search description:** Admins build, preview and publish versioned contribution forms in Administration; contributors answer them in the contributor portal and reviewers decide, with permissions kept separate.
- **Prepared:** 25 October 2026 (UTC).
- **Deployment status:** DEPLOYMENT_STATUS
- **Blogger publication:** Not published. Publication and sharing remain with Chinedum.

## What the post covers

Indigen Forms (design record: `docs/architecture/indigen-forms.md`; admin guide:
`docs/product/indigen-forms-admin-guide.md`):

- Administration → **Forms**: dashboard, five starter templates, a builder with a
  question palette, drag-and-drop and keyboard moves, conditional rules, audience,
  review checks, points through the existing contributor ledger, destinations with
  explicit field mapping, preview on desktop and phone, a publish summary, immutable
  versions, responses with filters and CSV/JSON export, cohorts and access settings.
- Contributor portal → **Available forms**: page-by-page filling, drafts, Kasem letter
  bar and dictionary hints, private uploads checked by their real file type, a review
  step, reference IDs, My submissions with revise-and-resubmit.
- Review desk → **Form responses**: instructions, required checks, feedback,
  decision history and earlier revisions, behind the existing two-step verification.

Availability limits stated in the post: signed-in contributors only (no public
anonymous forms), signature-based upload checks without malware scanning, and new
question types or destinations still need development.

## Images and credits

`screens/` holds unaltered captures of the implemented screens, rendered locally
against the **real** form callables (callable bridge over the Auth, Firestore and
Storage emulators) with synthetic data: "Local test" accounts, the verified
dictionary words *na* (water) and *kunkwolo* (bottle), and obvious placeholders.
No real contributor material is shown. The phone capture was taken before a last
fix that shows an edit icon, rather than a tick, beside "Unsaved changes".

`images/` holds the branded cover and framed figures generated from those captures
by the existing release artwork renderer. Product design, screens and frame artwork:
Indigen World. The frames, backgrounds and cover treatment are illustration. No
external image assets or third-party credits are used.

```bash
node apps/updates-blog/scripts/render-post-art.mjs 2026-10-25-indigen-forms
```

## Publishing handoff

1. Review the deployment status above and the verification notes below.
2. Create the Blogger post using the title, labels and search description above.
3. Upload `images/cover.png`, `images/admin-builder.jpg`, `images/admin-publish.jpg`,
   `images/contributor-fill-mobile.jpg` and `images/reviewer-desk.jpg` to Blogger.
4. Paste `post.html` in HTML mode. Replace each local image `src` with its uploaded
   Blogger URL, keeping the alt text and captions.
5. Preview on desktop and mobile, then publish when ready.
6. Replace the marked article-URL placeholder in `share.md` before sharing.

## Evidence and limits

Automated checks: `npm run test:forms` (pure contract and upload-inspection tests,
then emulator integration tests for admin, contributor, review, points, routing and
rules), `npm run test:rules`, `npm run test:storage-rules`,
`npm run test:staff-security`, the console-ui renderer tests, and the admin and
TribeStudio checks and browser tests. A ten-agent adversarial review confirmed 30
findings; all were fixed with tests before release.

A full local run against the real callables covered: publishing from a template,
editing into version 2, a contributor draft with a real resumable upload and content
check, conditional questions, a double-clicked submit producing exactly one response,
reviewer decisions, points and dictionary-candidate filing. Signed attachment links
cannot be exercised on the emulators. Authenticated production use (real Google
sign-in with two-step verification) was not exercised by the release.

Preparing this article does not publish it or send any announcement.
