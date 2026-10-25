# Release posts for Chinedum

Each major user-facing update gets a new dated folder with a Blogger article,
publishing details, and copy Chinedum can share after publication. The repository
date identifies when the post was prepared; it does not prove the update is live.

**Visual design.** Every post from October 1 onward has a branded cover and framed device mockups (`images/`), made from the unaltered screenshots kept in `screens/`. Each post's `art.json` holds its titles and layout; regenerate with `node apps/updates-blog/scripts/render-post-art.mjs <post-folder>`. New posts must include the same: a cover plus framed figures, never bare screenshots.

## Posts

- [2026-10-25: Alerts you can answer, and five shortcuts to less tapping](2026-10-25-alerts-you-can-answer/README.md) — Android 0.1.35+44: notifications drawn in the app's design (avatar with kind badge, attached picture, Reply / Like / Mark as read, messages as a conversation, grouped summaries) plus app-icon shortcuts, message drafts, copy any message, Undo for deleted notifications and snooze. Includes actual screenshots of the release build on an Android emulator and app renders with sample data. AAB built, not uploaded to Play; backend functions not deployed; Blogger publication pending.

- [2026-10-23: Correct a submission and publish from the review desk](2026-10-23-reviewer-editing/README.md) — direct content corrections in Administration and the Validator portal, save-and-continue, combined approval/publication, version checks and private correction history. Includes local product captures with synthetic data. Deployed 23 October; both portal bundles, three active Functions and access guards verified. Authenticated production editing remains unverified. Blogger publication pending.

- [2026-10-23: More ways to share what you know](2026-10-23-all-round-contributor-portal/README.md) — contributor Home cards, dedicated contribution workspaces, independent usage permissions, private source material and traceable review/export. Includes actual local captures with synthetic fixtures. Deployed 23 October; live routes, bundles and function states verified. Authenticated production review remains unverified after automated App Check rejection. Blogger publication and sharing remain with Chinedum.

- [2026-10-21: A stronger gate for Administration](2026-10-21-admin-app-check/README.md) — dedicated App Check registration, mandatory protected admin callable verification and production key/CSP build validation. Deployed and verified October 21 on three admin hosts and 50 protected functions. Shared project services remain in monitoring mode. Blogger publication and sharing pending.

- [2026-10-18: The dictionary, right where you write](2026-10-18-dictionary-guided-translations/README.md) — dictionary vocabulary beneath assigned source sentences, documented tone alternatives, per-occurrence replacement, optional highlighting, non-blocking review and nominations through the existing dictionary queue. Includes actual local product captures using real published vocabulary. See the post README for deployment status; Blogger publication and sharing pending.

- [2026-10-17: A shop, a reading room and a calmer inbox](2026-10-17-shop-literature-blogs-comment-ads/README.md) — shop on the app's own glass rail with a redesigned home, product page and cart; Literature as a channel (Library · Genres · Writers · Blogs) replacing the scrolling genre tabs, with the updates blog read live from Blogger; compact swipeable notifications; a Reddit-style sponsored entry above the first reply. In development: uncommitted, no AAB, no Blogger publication or sharing. Includes actual Flutter renders with sample data and framed artwork.

- [2026-10-16: Connected mobile workflows — development preview](2026-10-16-connected-mobile-workflows/README.md) — integrated shop, shared artwork uploads, actionable notifications, comment sponsorship and native mobile editing. Actual local screens with synthetic fixtures; live provider/device checks and advanced acceptance limits remain. No deployment, publication or sharing.

- [2026-10-15: A clearer picture of Indigen World: the platform observatory](2026-10-15-platform-observatory/README.md) — local research dashboard covering 47 capabilities across 13 domains, exact source evidence, interactive diagrams, proposed next decisions and a Remotion briefing. Implementation, verification, release, cultural authority and outcomes remain separate. No production deployment; Blogger publication and sharing pending. Includes actual local-preview capture and framed artwork.

- [2026-10-15: Gemini 4 for Indigen World's text tools](2026-10-15-gemini-4-text-upgrade/README.md) — shared Gemini 4 Argon upgrade for Kawuri interpretation, community text/checks and optional Labs English story assistance. Deployed and verified October 15: eleven ACTIVE Functions, production lookup and runtime Gemini 4/global log. Build and 166 backend tests pass. Reviewed Kasem answers stay grounded; media and assessment models are separate. Includes actual editorial illustration assets. Blogger publication and sharing pending.

- [2026-10-15: Meet Zem Ghana: Ghana headlines, with sources](2026-10-15-zem-ghana-headlines/README.md) — new automated @zem_ghana account. Four times a day it posts one headline from a named Ghana outlet, with a neutral, source-checked AI summary, a link to the full report and an Indigen-branded card drawn in code. Deployed and verified live 15 October 2026; first post published by the production Scheduler. Blogger publication and sharing pending.

- [2026-10-15: See the meaning: word-of-the-day illustrations](2026-10-15-word-of-the-day-illustrations/README.md) — Gemini draws the published word's meaning: actions for verbs, subjects for nouns and scenes for other concepts. Deployed October 15; production job generated and attached the verified illustration for di / to eat. Ten policy and twelve emulator checks pass. Includes actual generated artwork and branded images. Blogger publication and sharing pending.

- [2026-10-14: Emails that sound like Indigen World](2026-10-14-email-theme/README.md) — one shared blue email theme with the Indigen World logo, written status labels, reviewer feedback panels, account fallback links, phone and dark layouts and matching plain text, across website forms, TribeStudio and Contributor Portal notifications, support and letters. Four email Functions and the website deployed October 14 (`46c31b6`); a test email arrived in the Gmail inbox. Firebase reset template, client-matrix testing and Blogger publication pending. Includes actual renders of the email templates with synthetic examples.

- [2026-10-13: Living culture. New possibilities: Labs redesigned](2026-10-13-labs-redesign/README.md) — photo-led Labs home with credited Wikimedia Commons photographs and an accessible slideshow, live experiment previews (Word Trail drawn by its own renderer), one consistent sign-in/access state, Play/Learn/Create/Contribute filters, purpose section, Continue exploring and feedback paths. Website deployed and verified live October 14 (`afc3790`); signed-in production check and Blogger publication pending. Includes actual local product previews and branded image assets.

- [2026-10-13: Thoughtful steps, useful contributions](2026-10-13-contribution-studio/README.md) — composed contributor dashboard, four-section editor, speaker context, small sessions, private recognition and shared approval goals. Deployed and verified October 13 with the shared blue palette, seven matching Functions, live files and light/dark desktop/phone sign-in checks. Signed-in production workflow check and Blogger publication pending. Includes actual labelled product previews and branded image assets.

- [2026-10-13: A community of characters for Indigen World](2026-10-13-original-animated-community/README.md) — ten original fictional characters, shared paper-collage scenery, gentle layered motion and scene controls. Website deployed and verified October 13; Blogger publication pending. Includes actual local and live screenshots and artwork provenance.

- [2026-10-12: An easier way to discover, learn and contribute](2026-10-12-easier-website-discovery/README.md) — homepage search and public language previews, grouped navigation, warm visual styling, compact task banners and mobile dictionary controls. Website deployed and verified October 13; Blogger publication pending. Includes a verified live screenshot and actual desktop and mobile previews.

- [2026-10-12: Easier discovery and a clearer grammar guide on Venacula](2026-10-12-venacula-reading-and-discovery/README.md) — responsive dictionary navigation, mobile entry links, grammar search and chapter filters, progressive source tables and citation reveal. Deployed and verified October 12; Blogger publication pending. Includes actual desktop and mobile previews.

- [2026-10-12: A shared cultural welcome, wherever you begin](2026-10-12-cultural-banners-across-public-pages/README.md) — rotating cultural photo openings across public pages, Labs, the film opening and reference guides, with responsive layouts and shared pause controls. Website deployed and verified October 12; Blogger publication pending. Includes a verified live screenshot, actual previews and photo credits.

- [2026-10-12: A little motion, wherever you explore Indigen World](2026-10-12-scroll-cards-across-public-pages/README.md) — shared rising-card entrances across public pages and reference guides, desktop editorial stacks, responsive flow and remembered pause controls. Website deployed and verified October 12; Blogger publication pending. Includes a verified live screenshot and actual desktop/mobile previews.

- [2026-10-12: Culture in motion: a new way into Indigen World](2026-10-12-culture-in-motion/README.md) — photographic homepage banner, Ghana-focused map with rotating cards, and responsive scrolling story cards. Website deployed and verified October 12; Blogger publication pending. Includes a verified live screenshot, product previews and documented photo credits.

- [2026-10-11: One Kasem question through a complete evidence cycle](2026-10-11-kasem-question-evidence-cycle/README.md) — local research ledger, open-elicitation packets, separate use permissions and unseen-test checks. Updated October 12: editable copies accepted and four source passages checked. Five questions and twenty situations prepared; speech, review and actual Kawuri evaluation pending. Includes labelled illustrations; no deployment or article publication.

- [2026-10-11: A cleaner place to read our updates](2026-10-11-updates-blog-redesign/README.md) — Blogger theme redesign: one uncropped cover per post (the cover had rendered two or three times), restored paragraph spacing, contained snippets (no italic leak), Indigen World byline, editorial serif headlines, ranked topics, named share buttons, cover-card related posts and on-demand comments. Validated and previewed locally; theme not installed on Blogger; article unpublished. Includes actual renders of a real post in the new theme.

- [2026-10-10: Heritage Frame letters and correspondence](2026-10-10-heritage-frame-correspondence/README.md) — existing Indigen World logo, reusable editable Word/searchable PDF letters, private drafts, print preparation and reviewed SMTP attachments. Admin, four Functions and private-data rules deployed October 10; authorised cloud Word/PDF generation verified; Blogger unpublished. Includes actual deployed composer and rendered cloud PDF with synthetic identities.

- [2026-10-10: Check Kasem spellings without leaving your contribution](2026-10-10-kasem-dictionary-assistance/README.md) — dictionary underlines, approved suggestions and reviewed word submissions across responsive contributor fields. Deployed and verified on both TribeStudio domains, with four active backend functions Includes desktop and mobile product previews with test fixtures. — Blogger article published 11 October 2026: [Read article](https://updates.indigenworld.com/2026/10/kasem-dictionary-assistance.html).

- [2026-10-10: 554 more reviewed Kasem word recordings](2026-10-10-more-reviewed-kasem-word-audio/README.md) — 554 owner-reviewed Gemini clips published and publicly verified on 554 entries, including bam / anger and sense-matched ba and twe audio. Includes a verified live product screenshot. 812 other clips unpublished; sentence round next. — Blogger article published 11 October 2026: [Read article](https://updates.indigenworld.com/2026/10/more-reviewed-kasem-word-audio.html).

- [2026-10-10: Clearer points, fairer rewards and redemptions you choose](2026-10-10-points-and-rewards/README.md) — contributor points now come from validator-confirmed training-data assessments (category points × quality multiplier, with the calculation shown), flexible redemptions with marginal bonus bands (300 pts = GH₵5.00, 900 = GH₵15.50), an append-only points ledger, a Rewards desk for validators, Admin Finance policies/ledger/reconciliation, and a Kawuri-assisted Python assessment worker. Deployed October 10 (rules, indexes, 20 functions, TribeStudio, admin, Python worker); new redemptions live at the proposed default rates; quality-based awards and the worker not switched on yet; Finance review of rates and the finance permission pending Includes actual screenshots of labelled test accounts. — Blogger article published 11 October 2026: [Read article](https://updates.indigenworld.com/2026/10/points-and-rewards.html).

- [2026-10-10: A clearer way to learn and explore Kasem](2026-10-10-easier-kasem-discovery/README.md) — website deployed October 10 with a learning guide, dictionary filters and source comparisons, saved-word recovery and contextual feedback. Build, public asset comparisons and live desktop/mobile checks passed Includes actual product screenshots and an editorial/usability follow-up plan. — Blogger article published 11 October 2026: [Read article](https://updates.indigenworld.com/2026/10/easier-kasem-discovery.html).

- [2026-10-09: Indigen World 0.1.32: one release with the latest improvements](2026-10-09-consolidated-app-release/README.md) — consolidated Android build 41 with community, local listening, recovered drafts, Black appearance and Kasem reference improvements. See the release record for verified merge, bundle and GitHub status; Play rollout and Blogger publication are separate. — Blogger article published 11 October 2026: [Read article](https://updates.indigenworld.com/2026/10/indigen-world-0-1-32-release.html).

- [2026-10-09: Reliable contributions, clearer sources and offline listening](2026-10-09-reliable-contribution-and-reference-workflows/README.md) — review branch and local verification; not deployed or published. Account recovery, review evidence, source browsing, bounded grounding, ten category destinations, Downloads playback and low-data preference. Includes product screenshots with synthetic fixtures and existing public illustrations. — Blogger article published 11 October 2026: [Read article](https://updates.indigenworld.com/2026/10/reliable-contributions-sources-offline-listening.html).

- [2026-10-08: Kasem grammar sentences and word forms from the book](2026-10-08-kasem-basic-grammar-book/README.md) — all nine chapters, twelve tables and nineteen source illustrations, 56 grammar summaries, printed examples, noun and verb forms, and new dictionary entries. Source content, all three web guides/navigation and both Kawuri functions published and verified October 8 Includes live product screenshots. — Blogger article published 11 October 2026: [Read article](https://updates.indigenworld.com/2026/10/kasem-basic-grammar-book.html).

- [2026-10-08: Kasem words and spelling from the orthography book](2026-10-08-kasem-orthography-book/README.md) — all 646 vocabulary rows, appendix forms, 28 rules and printed examples, directly published from the supplied book; corrected character palettes and Android layout. See the post for verified deployment status. — Blogger article published 11 October 2026: [Read article](https://updates.indigenworld.com/2026/10/kasem-orthography-book-spelling-guide%20.html).

- [2026-10-07: A clearer app for community and offline listening](2026-10-07-mobile-listening-and-community/README.md) — thirteen related mobile improvements, prepared in the repository with actual local widget previews. Google Play rollout, compatible tag backend deployment, device verification and — Blogger article published 11 October 2026: [Read article](https://updates.indigenworld.com/2026/10/mobile-community-and-offline-listening.html).

- [2026-10-04: Watch verified contributions flow into the jars](2026-10-04-live-progress-pipelines/README.md) — TribeStudio as the pump, measured glass pipes into every jar and tank, live approval flows from a new server-counted public projection, exact small percentages, and corrected counting (open posts, pronunciations, proverbs, sentences). Deployed October 5 from `13c9ab4` (two indexes, the `publicProgress` rule, six functions, website); live page reads “Live”, counts match the server projection, and assets match the tested build on both hostnames. Real production approvals counted live from 00:28 UTC, and one watched arriving on the public page at 00:31 (expressions 111 → 112). Includes a live production screenshot, labelled emulator test data and sample previews — Blogger article published 11 October 2026: [Read article](https://updates.indigenworld.com/2026/10/live-progress-pipelines.html).

- [2026-10-04: One design for every workspace](2026-10-04-one-design-for-every-workspace/README.md) — TribeStudio Hosting deployed October 4 (17:48 UTC); live routes, release assets and sign-in screens verified on both hostnames. All three workspaces, the public creator pages and sign-in screens on the Comitia design system with a Display panel (dark mode, text size, contrast, animations off). Signed-in production journeys unverified Includes actual screenshots of labelled test records. — Blogger article published 11 October 2026: [Read article](https://updates.indigenworld.com/2026/10/one-design-for-every-workspace.html).

- [2026-10-04: An open, animated space for our community progress](2026-10-04-floating-progress-vessels/README.md) — floating glass jars and tanks, generated pottery artwork, mobile swipe galleries and details in popups. Deployed October 4; public assets and live browser behavior verified. Includes actual screenshots with labelled sample data — Blogger article published 11 October 2026: [Read article](https://updates.indigenworld.com/2026/10/floating-progress-vessels.html).

- [2026-10-04: Website animations that leave room to read](2026-10-04-clear-website-headers/README.md) — shared headers reserve space for text, actions and search alongside or above their decorative artwork. Deployed October 4; all 13 shared banner layouts and public release assets verified. Includes actual preview screenshots — Blogger article published 11 October 2026: [Read article](https://updates.indigenworld.com/2026/10/clear-website-headers.html).

- [2026-10-04: More room to watch our community progress grow](2026-10-04-progress-fullscreen-popups/README.md) — fullscreen progress redesign with popup explanations, red/yellow/blue/green liquid, and growing bubbles. Deployed October 4 with verified public assets and actual local product screenshots — Blogger article published 11 October 2026: [Read article](https://updates.indigenworld.com/2026/10/progress-fullscreen-popups.html).

- [2026-10-04: A steadier place to look up Kasem](2026-10-04-dictionary-steady-scrolling/README.md) — dictionary scroll feedback fix and mobile result-position preservation implemented and verified; deployed October 4 with verified public assets and live scroll regressions Includes verified local product screenshots. — Blogger article published 11 October 2026: [Read article](https://updates.indigenworld.com/2026/10/dictionary-steady-scrolling.html).

- [2026-10-04: Help Fill the Jars — track our community progress toward launch](2026-10-04-help-fill-the-jars-progress/README.md) — public website feature implemented and verified on October 4; 10 distinct heritage categories, switchable vertical jars and horizontal tanks, SVG liquid dynamics, honest unconfigured target states, and direct contribution CTAs. Prerendered metadata and 11 calculation invariants verified. Illustrated — Blogger article published 11 October 2026: [Read article](https://updates.indigenworld.com/2026/10/help-fill-the-jars-progress.html).

- [2026-10-03: Workspaces rebuilt around the work](2026-10-03-workspaces-rebuilt/README.md) — TribeStudio Hosting and three compatible review functions deployed October 4; live routes, assets and anonymous authentication gates verified. Authenticated production journeys remain unverified. Illustrated — Blogger article published 11 October 2026: [Read article](https://updates.indigenworld.com/2026/10/workspaces-rebuilt-around-the-work.html).

- [2026-10-03: Kawuri answers from reviewed records](2026-10-03-kawuri-reviewed-answers/README.md) — backend deployed and verified October 3. Chat and community answers now quote eligible records or fixed help, with unsupported language withheld. Includes a labelled workflow illustration. — Blogger article published 11 October 2026: [Read article](https://updates.indigenworld.com/2026/10/kawuri-reviewed-language-answers.html).

- [2026-10-03: Browse Kasem literature by category](2026-10-03-literature-category-tabs/README.md) — illustrated draft held at the owner's request until the mobile update is deployed and publication is authorized again; five primary category tabs implemented and tested. — Blogger article published 11 October 2026: [Read article](https://updates.indigenworld.com/2026/10/kasem-literature-category-tabs.html).

- [2026-10-03: Kawuri corpus contributions with sources and review history](2026-10-03-kawuri-corpus-workspace/README.md) — backend, Storage rules, indexes and TribeStudio deployed and verified October 3; policy-dependent authentication and corpus publication remain gated. Blogger publication remains with Chinedum. Includes actual component screenshots with synthetic data. — Blogger article published 11 October 2026: [Read article](https://updates.indigenworld.com/2026/10/kawuri-corpus-workspace%20.html).

- [2026-10-02: Words in the dictionary, expressions for model learning](2026-10-02-dictionary-words-and-training/README.md) — unpublished article; backend and web changes deployed and verified October 2. Production cleanup retired 38 expression copies while preserving sources and permissions; 340 other entries remain published. Android reader release pending. Includes a verified local product screenshot and labelled workflow illustration.

- [2026-10-02: Run the trail, share a word — Word Trail](2026-10-02-word-trail/README.md) — deployed and verified October 2; three-lane runner with real word queue translation checkpoints. Local gameplay, atomic submissions, duplicate protection and responsive checks passed; live route/assets and authenticated queue gates verified. Positive translation submission checked in emulators. Actual component screenshots with labelled simulated account/queue — Blogger article published 11 October 2026: [Read article](https://updates.indigenworld.com/2026/10/word-trail.html).

- [2026-10-02: A Community feed built around culture and choice](2026-10-02-community-feed-algorithm/README.md) — unpublished development preview; backend deployed and APIs verified October 2. Opt-in behavioral ranking, distinct-actor trends, emerging voices and cultural diversity; mobile flag disabled and app rollout pending. Includes an original workflow illustration.

- [2026-10-02: A little movement, with a purpose](2026-10-02-public-website-in-motion/README.md) — themed public-page and Labs animations, scroll reveals and motion preferences; deployed October 2 with verified production assets. Includes actual preview screenshots. — Blogger article published 11 October 2026: [Read article](https://updates.indigenworld.com/2026/10/public-website-in-motion.html).

- [2026-10-02: A clearer privacy notice for the whole ecosystem](2026-10-02-ecosystem-privacy-notice/README.md) — expanded notice and Gemini Omni animated header deployed and verified October 2; final legal approval and — Blogger article published 11 October 2026: [Read article](https://updates.indigenworld.com/2026/10/ecosystem-privacy-notice.html).

- [2026-10-01: Play a mission, share your knowledge — Culture Quest](2026-10-01-culture-quest/README.md) — deployed October 1; daily contribution missions, XP, levels and badges with Labs review integration. Public route and release asset verified; signed-in gameplay and emulator integration verification pending; actual component screenshots with simulated responses. Blogger article remains a draft.

- [2026-09-30: Small experiments, living culture — Indigen World Labs](2026-09-30-indigen-world-labs/README.md) — signed-in alpha deployed September 30; reviewed practice, private stories, activity and feedback verified against production. Actual local screenshots; automatic assistance disabled. Blogger article remains a draft.

- [2026-09-30: The review desk comes to the contributor portal](2026-09-30-contributor-review-desk/README.md) — draft article; guarded web review desk with four queues and validator-only navigation. TribeStudio Hosting deployed September 30; custom-domain files verified against the release build. Signed-in checks pending; newer dictionary output choices await their backend release. Includes an original workflow illustration.

- [2026-09-30: More ways to build and share with Indigen World](2026-09-30-language-review-and-video-editor/README.md) — draft article; rules, indexes, 16 functions and hosting deployed September 30. TribeStudio video editor and reviewer tools for contributed language material.

- [2026-09-28: Help the dictionary from wherever you are (Indigen World 0.1.29)](2026-09-28-help-the-dictionary/README.md) — draft article. The language loop is implemented and tested: Explore word prompts, Help add from search, topics and Kawuri, answer-then-sign-in, corrections, the reviewer's choice of what an answer becomes, and Kawuri lessons (1,571 app tests; backend 578 + 41 + 205). The 0.1.29 (38) bundle was built 2026-09-28; it includes 0.1.28 and is not uploaded. Rules, indexes, six functions and admin hosting await approval. Rendered screenshots use real queue words, verified Kasem only and a real Kawuri lesson.

- [2026-09-28: Make the whole video in TribeStudio](2026-09-28-tribestudio-video-editor/README.md) — draft article. The video editor is verified end to end against the emulators, with three real exports inspected. The 50-track, 48-sticker library is live in production Firestore. Rules, ten functions and TribeStudio hosting await approval. The screenshots come from a demo project made in the editor.

- [2026-09-28: More Kasem sounds, matched to the right meaning](2026-09-28-kasem-words-and-meanings/README.md) — 23 recordings published across 21 entries; gaale meanings separated, Dian withdrawn and the fruit take held for confirmation. Four rounds cover 89 audio entries. Includes a live screenshot; Blogger article is a draft.

- [2026-09-27: Explore keeps your place, and My Space gets simpler (Indigen World 0.1.28)](2026-09-27-explore-and-my-space/README.md) — draft article; 20 app upgrades implemented and tested locally (1,555 tests, rules 201). The 0.1.28 (37) bundle was built 2026-09-27 but superseded before upload by 0.1.29 (38), which contains these changes (see the post above). The `hasVideo` backfill, two indexes and a rules deploy await approval. Includes rendered screenshots with sample data.

- [2026-09-27: Kasem pronunciation: matching the sound to the meaning](2026-09-27-kasem-tone-and-meaning/README.md) — 26 approved recordings assigned to 25 entries using the owner's tone and meaning notes; eight entries added, four glosses corrected, uncertain proverbs meaning queued. All three releases cover 68 entries. Includes a live screenshot; Blogger article is a draft.

- [2026-09-27: Another 25 Kasem words to hear and practise](2026-09-27-more-reviewed-kasem-pronunciations/README.md) — 26 approved takes published to 25 more entries; public access and source credits verified. The two releases cover 43 words. Blogger article is a draft.

- [2026-09-27: Listen to 18 reviewed Kasem words](2026-09-27-reviewed-kasem-pronunciations/README.md) — first pronunciation release; public files and website attribution verified. Blogger article is a draft. The second listening round is covered in the follow-up above.

- [2026-09-27: Share a Kasem expression: one clear way to contribute](2026-09-27-share-an-expression/README.md) — draft article; website entry point, expressions campaign and review flow implemented and tested locally, not deployed. Deploy rules, functions and hosting before publishing.

- [2026-09-26: A clearer final step for contributor submissions](2026-09-26-visible-contributor-submit/README.md) — deployed September 26; local mobile workflow and live guide verified in Edge; Blogger draft.

- [2026-09-26: A familiar look for Indigen World emails](2026-09-26-branded-emails/README.md) — application emails deployed; Firebase native template changes blocked; inbox delivery unverified; Blogger draft.

- [2026-09-26: Help before contributor sign-in](2026-09-26-contributor-support/README.md) — website and staff inbox deployed and inspected September 26; live email delivery unverified; WhatsApp inactive.

- [2026-09-26: A fresh space for your words](2026-09-26-contributor-studio-refresh/README.md) — draft article; visual redesign deployed, live sign-in verified; signed-in production smoke test pending.

- [2026-09-26: Daily contributor tasks](2026-09-26-daily-contributor-tasks/README.md) — deployed September 26; authenticated production workflow verification pending.

- [2026-09-26: An easier contributor workspace](2026-09-26-easier-contributor-workspace/README.md) — deployed September 26; authenticated production workflow verification pending.

- [2026-09-26: Approved expression rewards](2026-09-26-approved-expression-rewards/README.md) — deployed September 26; 19 earlier approved expressions credited; signed-in end-to-end verification pending.

- [2026-09-26: Contributor workspace updates](2026-09-26-contributor-workspace-updates/README.md) — implemented in repository; deployment and live verification pending.

- [2026-09-26: Contributor redemption history](2026-09-26-contributor-redemption-history/README.md) — implemented in repository; deployment and live verification pending.

- [2026-09-26: Points, with a little more spark](2026-09-26-points-redesigned/README.md) — draft points-page redesign article; implemented locally, Android release and publication pending.

- [2026-09-25: Contributor streaks](2026-09-25-contributor-streaks/README.md) — implemented in repository; deployment and live verification pending.

- [2026-09-25: Expression points and redemption](2026-09-25-contributor-expression-points/README.md) — implemented in repository; deployment and live verification pending.

- [2026-09-24: Indigen opens again on Android](2026-09-24-android-startup-fix/README.md) — draft startup-fix article for 0.1.26 (35); signed bundle and emulator update verified, Play testing availability pending.

- [2026-09-24: Music, reimagined (Indigen World 0.1.25)](2026-09-24-music-reimagined/README.md) — draft article; a user reports 0.1.25 (34) installed from a Play testing track but crashing at startup. Hold publication until the 0.1.26 fix is available.

- [2026-09-24: Music that makes room (Indigen World 0.1.23)](2026-09-24-music-player-bubble/README.md) — draft article; 0.1.23 (32) bundle built and checked, not yet uploaded to Google Play. Publish only after the Play rollout.

- [2026-09-23: A rebuilt workspace for Kasem contributors](2026-09-23-contributor-workspace-rebuild/README.md) — draft article; deployed 2026-09-23, finance claim and signed-in smoke test pending.

- [2026-09-23: Contributor issue reporting](2026-09-23-contributor-issue-reporting/README.md) — draft article; deployed 2026-09-23, authenticated workflow verification pending.

- [2026-09-23: Payment details now have a home under Account](2026-09-23-contributor-payment-profile/README.md) — draft article; deployed 2026-09-23, authenticated workflow verification pending.

- [2026-09-23: De N Lei — Come Learn Kasem joins Music](2026-09-23-de-n-lei-kasem-song/README.md) — music record published to Firebase; guest access and public assets verified, device playback pending.

- [2026-09-21: More context for Kasem contributions](2026-09-21-kasem-contribution-context/README.md) — draft; Functions and both dictionary websites deployed 2026-09-23, mobile release pending.

- [2026-09-20: First-party community campaigns now have a privacy-aware fallback](2026-09-20-mobile-admob-fallback/README.md) — draft; consent message published and Play data disclosures submitted, app-ads.txt and a release still pending, nothing serving.

- [2026-09-17: A faster contributor translation workspace](2026-09-17-contributor-workspace-redesign/README.md) — draft article; implementation verified locally, production deployment pending.

- [2026-09-17: Contributor invitations by SMS](2026-09-17-contributor-sms-invitations/README.md) — draft article; deployed, handset-delivery check pending.

- [2026-09-17: Contributor management comes to the Admin console](2026-09-17-contributor-management/README.md) — draft article; feature deployed, authenticated workflow smoke test pending.

- [2026-09-16: Beyond the Reef, now an interactive music film](2026-09-16-beyond-the-reef/README.md) — the page is live; settle the song credit before publishing.

- [2026-09-16: Assignment guidance, uncertainty flags and contributor activation](2026-09-16-contributor-guidance-and-activation/README.md) — draft; deployment verification pending.

- [2026-09-16: A clearer workspace for Kasem expression contributors](2026-09-16-contributor-portal/README.md) — draft; deployment verification pending.

- [2026-09-14: Kawuri creates](2026-09-14-kawuri-creates/README.md)

- [2026-09-14: Reels that explain themselves](2026-09-14-reels-that-explain-themselves/README.md)

- [2026-09-13: The Kasem Dictionary has a new look](2026-09-13-kasem-dictionary-new-look/README.md)

## Handoff for each major update

1. Add `YYYY-MM-DD-descriptive-slug/post.html` describing the actual changes.
2. Add `README.md` with Blogger metadata, availability, and publishing steps.
3. Add `share.md` with a short announcement and the published-link placeholder.
4. Include at least one relevant image asset in the post folder. Embed it in
   `post.html` with alt text and a caption; document its source/credit and the
   Blogger upload step in `README.md`. Use actual screenshots where useful.
5. Confirm the release is available to its intended audience before publishing
   release claims. Replace the sharing placeholder with the published article URL.
6. Add the new post to this list so Chinedum can find it.

- [2026-10-01: Bring Indigen World to your desktop](2026-10-01-desktop-wallpapers/README.md) — 50 AI-generated wallpaper illustrations prepared in the repository; Blogger publication and public distribution pending.

- [2026-10-04: Immersive community progress](2026-10-04-immersive-progress/README.md) — deployed and verified on the public website — Blogger article published 11 October 2026: [Read article](https://updates.indigenworld.com/2026/10/immersive-community-progress.html).

- [2026-10-14: Word Trail: chase the blue horizon](2026-10-14-word-trail-blue-horizon/README.md) — fullscreen 3D runner, original articulated explorer, blue palette, safe language checkpoints and separate guest practice. Includes verified product screens and publication handoff.
