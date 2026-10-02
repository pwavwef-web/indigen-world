# Privacy notice review — 2 October 2026

The canonical public notice is implemented in `apps/website/src/content/privacy.tsx`,
rendered by `apps/website/src/pages/PrivacyPage.tsx`. This is an implementation
review, not final legal approval. No production feature flags or privacy choices
were changed to write this notice. The user authorised production deployment on
2 October 2026. The website is deployed; release evidence is recorded below.

## Evidence used

| Topic | Repository evidence and wording boundary |
| --- | --- |
| Ecosystem | `apps/website/src/content/ecosystem.ts`, website routes, mobile and TribeStudio surfaces. Admin is internal. Project Kassena is a programme; Venacula is the newsletter. Feature existence is separate from current live availability. |
| Website dictionary | `apps/website/src/pages/DictionaryPage.tsx` reads/writes the device-local saved-entry key. Public records and attribution are publicly accessible. Local saves are not a cloud backup. |
| Blogger updates | `apps/website/src/components/LatestUpdates.tsx` retrieves the public Blogger summary feed. External hosts receive requests; no assertion that the whole ecosystem is cookie-free. |
| Forms | `services/functions/src/public-forms.ts` stores field-limited submissions, timestamps and newsletter consent version. Contact/involvement records generate team email alerts and acknowledgements. An IP SHA-256 identifier feeds `rate-limit.ts`; no claim that the hash is anonymous or automatically deleted. |
| Newsletter | New subscriber welcome is implemented in `public-forms.ts`/`email-templates.ts`. Regular newsletter/unsubscribe readiness remains as described in `NewsletterForm.tsx`. Request removal via Contact; do not imply joining immediately starts recurring mail. |
| Authentication | Firebase client setup, role checks and `contributor-portal.ts` invitation/account records. A login does not automatically publish private content. |
| Mobile local/connected data | Mobile drafts, saved entries, queues and Firestore persistence; `apps/mobile/lib/core/firebase_bootstrap.dart`. Queued submission can be sent later. Removing local data does not delete server records. |
| Community, Explore, chats | Community/reel/chat services, mobile repositories and `firebase/firestore.rules`. Audience rules differ from a guarantee against participant copying. No end-to-end encryption promise. |
| Contributor records | `contributor-portal.ts`, daily tasks, scores and rewards services. Review records, work progress, issue records and reward/payment states are distinct from public attribution. |
| Finance | `contributor-payments.ts` stores bank/MoMo details, statements, payout requests, finance decisions, references and audit records. `contributor-statement-check.ts` defaults OFF unless `CONTRIBUTOR_STATEMENT_CHECK=enabled`; when enabled it sends the document and supplied account number to Google. The human finance decision is separate from model output. No production activation claim. |
| Labs | `labs.ts`, `labs-policy.ts`, Labs UI, Firestore rules. Account-private drafts, sessions, reports, feedback and owner deletion. Culture Quest (on main since October 1) retains account-linked daily cards/completions and cumulative XP/missions; usage/correction submissions become feedback with source, description and evidence. Optional story assistance sends selected English source meaning/context and user context; source eligibility and experiment/AI switches are checked. The September 30 release evidence says AI was off then, not that it must always remain off. |
| AI/media | `kawuri*.ts`, `contributor-assist.ts`, `studio-video.ts`, `studio-video-providers.ts`, `studio-video-policy.ts`. Google/Vertex, Runway and fal receive the selected job's inputs; private generated video storage is separate from publication. Provider-wide zero retention or no-training guarantees are not asserted. |
| Ads | Mobile `admob_native.dart` uses `const AdRequest()`; consent and paid entitlement gates precede requests. Direct campaigns take priority. `ads` services retain interactions/reporting. No assertion that adverts are serving live. |
| Keyboard | Native `KasemInputMethodService.kt` commits keys to active InputConnection. `KasemKeyboardChannel.kt` carries settings, not typing. `KasemKeyboardPreferences.kt` persists only default language, sound and vibration. Destination apps handle their own received text. |
| Recordings/playback | Mobile recording workflows and playback service. Microphone permission is action-specific. Playback is not microphone recording. No blanket claim that no other background task exists: messaging also has a background handler. |
| Governance | Publication service, cultural consent/licence metadata and rules. Submission is not unlimited reuse consent. External downloaded/shared copies cannot be recalled through a server takedown. |
| Messages | `email.ts`, `sms.ts`, `notifications.ts` and mobile notification repositories. Configured SMTP delivery, Arkesel and Firebase Messaging. Destination, message and device push registration tokens are processed. Newsletter opt-out differs from operational messages. |
| Diagnostics | `apps/website/src/lib/analytics.ts` gates analytics on build/config and restricts event properties. `firebase_bootstrap.dart` enables Analytics/Crashlytics/Performance for production only. Technical provider/device data is acknowledged; no assertion that SDKs collect only our custom events. |
| Security/retention/requests | Authentication, rules, private file paths and audit records are implemented. No single ecosystem retention schedule, instantaneous deletion, perfect security, Ghana-only hosting or new statutory deadline is promised. Server/account requests remain a team-handled route; applicable legal rights are jurisdiction-dependent. |

## Provider references reviewed

- [Firebase privacy and security](https://firebase.google.com/support/privacy)
- [Google UMP privacy choices](https://developers.google.com/admob/android/privacy)
- [Google Cloud generative AI data governance](https://cloud.google.com/vertex-ai/generative-ai/docs/data-governance)

The page links directly to relevant provider policies. Those links are provider
information, not an assertion that every visitor uses every provider.

## Header asset

Gemini Omni `gemini-omni-1.1-flash-preview`, Google Cloud project
`project-kassena-7e026`, 8 seconds, 1280×720 landscape. Generation details and
prompt are in `tools/privacy-header/generation.json`. This was a user-authorised
creative generation, not an account-content or cultural-data export.

The imagined earthen courtyard, open book, leaf and archival tiles are an
editorial illustration inspired by stewardship and Kassena architecture, not
documentary photography or an authenticated cultural design. The page labels
the artwork as AI-generated. No real person's image or private submission was
used. FFmpeg stripped the original soundtrack and encoded a fast-start H.264
MP4. Public output: `/media/privacy-stewardship.mp4` (289,912 bytes); poster:
`/images/privacy-stewardship.jpg` (49,829 bytes).

Reduced-motion and browser Save-Data preferences prevent video mounting.
Playback is muted, pausable, stops offscreen and in hidden tabs, and falls back
to the still image if playback fails. Section reveals respect reduced motion.
The only provider call happened during asset creation: visiting the page uses
local website assets, not a client-side Omni generation.

## Verification

Website typecheck, existing route/privacy validation and production build passed.
Browser checks and release screenshots are documented in
`apps/updates-blog/posts/2026-10-02-ecosystem-privacy-notice/README.md`.

## Production release

Source commit `6b548f2848c3af2899a82e750f0df77596745f30` was pushed to `main`
and deployed with `npm run deploy:website` to Firebase Hosting site
`indigen-world` in project `project-kassena-7e026`. The CLI confirmed release
completion and deploy success on 2 October 2026. Verification from 11:37 UTC
confirmed the custom-domain page, all 21 sections, the Contact request route,
the keyboard section deep link, desktop/mobile layouts and video controls.
The released page JS/CSS, header poster and video returned HTTP 200 and
matched the built asset SHA-256 hashes. The release post includes a verified
production screenshot. Blogger publication and community sharing remain pending.

## Outstanding approval facts

Final legal sign-off, an approved retention schedule and any jurisdiction-specific
controller/contact or rights language must come from the responsible project
owner. Existing contact routes and implementation-summary status are preserved.
No approval was inferred from this implementation review.
