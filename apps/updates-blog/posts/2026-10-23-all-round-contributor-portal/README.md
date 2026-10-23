# More ways to share what you know

- **Title:** More ways to share what you know: the redesigned Contributor Portal
- **Labels:** Indigen World, Contributor Portal, Languages, Culture, Research, Product updates
- **Search description:** One Home for contributions, private source uploads, separate usage choices, and traceable human review in the Indigen World Contributor Portal.
- **Prepared:** 23 October 2026 (UTC).
- **Deployment status:** Deployed 23 October 2026. Final Hosting release: 19:42:36 UTC, version `ea79e3d68d63899d`, source `632eaf9` (initial release `5ac05c9`). Four affected Functions are ACTIVE. Storage rules and private-upload CORS are released.
- **Blogger publication:** Not published. Chinedum owns publication and sharing.

## Images and credits

`screens/` contains actual desktop/mobile local browser captures of the implemented
interface, with synthetic accounts, counts, source material and review fixtures.
No real contributor information is included. The document selection screenshot
explicitly says the preview file is not uploaded. Review extraction is simulated
fixture data. These images do not prove a signed-in production journey.

`images/` contains a branded cover and framed figures created with the existing
Indigen World release artwork renderer. Product design, brand and captures:
Indigen World. Frame artwork: repository renderer. No third-party image credits.

Regenerate after refreshing the product captures:

```powershell
node apps/tribestudio/scripts/portal-redesign-browser.test.mjs
node apps/updates-blog/scripts/render-post-art.mjs 2026-10-23-all-round-contributor-portal
```

## Publishing handoff

1. Check confirmed release status and current availability limits below.
2. Create a Blogger post with the title, labels and search description above.
3. Upload every image referenced by `post.html` from `images/` to Blogger.
4. Paste the article body in HTML mode. Replace each relative image `src` with
   its Blogger-hosted URL; preserve descriptive alt text and captions.
5. Preview on phone and desktop, verify links and imagery, then publish.
6. Replace the article-URL placeholder in `share.md` before sharing.

## Evidence and limits

Passed locally: 62 contributor backend checks, 80 Studio checks, 207 Firestore
rules checks, 23 Storage rules checks, 27 staff-security/transport/emulator
checks, six source-material integration scenarios, Studio production build,
desktop/mobile browser checks, and 29 Blogger theme validations. The integration
scenarios include private resumable sessions, per-file failures, repair, rights,
separate candidate review, permission-scoped export, and withdrawal.

See `docs/architecture/contributor-materials.md` for schema, permissions,
processing limits, deployment requirements, tests and operational boundaries.
This release preserves existing assignments, balances and corpus workflows.
Automatic OCR/transcription/full malware scanning and model training are absent.
Approved all-round records are not automatically published into the dictionary;
existing dictionary and governed corpus release flows remain available.

No announcements, external publication, email or SMS are authorised by preparing
this post. The user's deployment request covers the application release.

## Confirmed production evidence

See [deployment-verification.json](deployment-verification.json). Nine route
checks across the custom domain and both Firebase hosts returned 200 and the
current entry bundle. The live portal asset matches the local build byte for
byte; development source-review fixtures are absent. Three anonymous callable
probes returned 401. All four affected functions report ACTIVE on Node.js 22.
The existing registered Studio App Check key and restricted three-domain CORS
policy were checked without changing account roles or claims. No backfill or
existing submission/balance migration was needed.

**Authenticated production limit:** Chrome and Edge headless App Check exchanges
were rejected with 403, “App attestation failed.” The sign-in screen loaded.
No real-account, two-step-verified production upload/review journey was tested;
manual confirmation with legitimately authorised accounts remains. The risk
threshold, MFA and role checks were not lowered. Local emulator workflows and
browser fixture checks passed. Do not describe these as completed production
contributions, payouts, training runs or end-to-end human verification.
