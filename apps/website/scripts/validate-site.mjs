import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

const routes = [
  ["/", "HomePage.tsx"],
  ["/about", "AboutPage.tsx"],
  ["/ecosystem", "EcosystemPage.tsx"],
  ["/project-kassena", "ProjectKasenaPage.tsx"],
  ["/dictionary", "DictionaryPage.tsx"],
  ["/impact-governance", "ImpactGovernancePage.tsx"],
  ["/get-involved", "GetInvolvedPage.tsx"],
  ["/contact", "ContactPage.tsx"],
  ["/privacy", "PrivacyPage.tsx"],
  ["/terms", "TermsPage.tsx"],
  ["/beyond-the-reef", "BeyondTheReefPage.tsx"],
];

const pageIndex = read("src/pages/index.ts");
const app = read("src/App.tsx");
const notFound = read("src/pages/NotFoundPage.tsx");
const headerStyles = read("src/styles/header.css");
const sitemap = read("public/sitemap.xml");
const ecosystemPage = read("src/pages/EcosystemPage.tsx");
const homePage = read("src/pages/HomePage.tsx");
const venaculaPage = read("src/pages/ProjectKasenaPage.tsx");
const getInvolvedPage = read("src/pages/GetInvolvedPage.tsx");
const contactPage = read("src/pages/ContactPage.tsx");
const dictionaryPage = read("src/pages/DictionaryPage.tsx");
const dictionaryData = read("src/features/dictionary/dictionaryData.ts");
const testerClaimPath = "founding-tester-claim-7q4m9x2k";
const testerClaimPage = read("src/pages/TesterRewardClaimPage.tsx");
const firebaseConfig = JSON.parse(read("../../firebase.json"));
const websiteHosting = JSON.stringify(
  firebaseConfig.hosting.find((target) => target.site === "indigen-world"),
  null,
  2
);
for (const [route, page] of routes) {
  assert.ok(pageIndex.includes(`./${page.replace(".tsx", "")}`), `${page} is lazy-loaded`);
  assert.ok(sitemap.includes(`https://indigenworld.com${route}`), `${route} is in sitemap.xml`);
}

const sourceFiles = [
  "src/App.tsx",
  "src/app/router.tsx",
  "src/components/Header.tsx",
  "src/components/Footer.tsx",
  "src/features/forms/ContactForm.tsx",
  "src/features/forms/GetInvolvedForm.tsx",
  "src/features/forms/NewsletterForm.tsx",
].map(read).join("\n");

assert.ok(!sourceFiles.includes("console.log"), "public journeys do not log visitor data");
assert.ok(!sourceFiles.includes("pwavwef@gmail.com"), "personal email is not exposed in the public client");
assert.ok(!read("src/app/router.tsx").includes("hashchange"), "page routing does not use URL fragments");
assert.match(app, /href="#main-content"/, "skip link is present in the styled app shell");
assert.ok(app.indexOf('href="#main-content"') < app.indexOf("<Header />"), "skip link is the first keyboard destination");
assert.ok(app.indexOf("<Header />") < app.indexOf("<Suspense") && app.indexOf("<Suspense") < app.indexOf("<Footer />"), "route loading stays inside the persistent site shell");
assert.match(read("src/styles/base.css"), /\.skip-link\s*\{[\s\S]*?translateY\(-150%\)/, "skip link is hidden until focused");
assert.match(read("src/styles/base.css"), /\.skip-link:focus\s*\{[\s\S]*?translateY\(0\)/, "focused skip link is visible");
assert.match(read("src/lib/routeLoading.ts"), /ROUTE_LOADER_DELAY_MS = 100/, "loader uses a short grace period");
assert.ok(!read("src/lib/routeLoading.ts").includes("MIN_VISIBLE"), "route loading has no artificial minimum duration");
assert.match(read("src/lib/routeLoading.ts"), /return modulePromise;/, "route bundles resolve as soon as they load");
assert.match(headerStyles, /\.mobile-nav nav\s*\{[\s\S]*?overflow-y:\s*hidden/, "collapsed mobile navigation does not expose a scrollbar");
assert.match(headerStyles, /\.mobile-nav--open nav\s*\{[\s\S]*?overflow-y:\s*auto/, "open mobile navigation remains scrollable");
assert.match(ecosystemPage, /const PUBLIC_PRODUCTS/, "the product grid is separated from programmes and infrastructure");
assert.match(ecosystemPage, /learners: \["mobile-app", "public-website"\]/, "learner filtering uses only public product IDs");
assert.match(ecosystemPage, /Partly live/, "the publishing workflow exposes its current status");
assert.match(ecosystemPage, /aria-pressed=\{audience === key\}/, "audience filters expose their selected state");
assert.ok(!homePage.includes("ProverbCard"), "unapproved cultural expressions are not presented as public content");
assert.ok(!venaculaPage.includes("KasemStarterKit"), "the public site does not simulate a learning product");
assert.ok(!venaculaPage.includes("DialectMap"), "the public site does not publish unapproved dialect samples");
assert.match(read("index.html"), /https:\/\/indigenworld\.com\//, "static metadata uses the primary domain");
assert.match(read("public/robots.txt"), /https:\/\/indigenworld\.com\/sitemap\.xml/, "robots points to the primary sitemap");
assert.match(read("src/lib/forms.ts"), /VITE_PUBLIC_FORMS_ENDPOINT/, "forms use the reviewed endpoint boundary");
assert.match(sourceFiles, /Venacula/, "the Venacula newsletter signup is visible on the site");
assert.ok(!venaculaPage.includes("Venacula starts"), "the programme is not presented as Venacula");
assert.match(venaculaPage, /Venacula is the separate Indigen World newsletter/, "programme and newsletter names are distinguished");
assert.match(read("src/features/forms/NewsletterForm.tsx"), /consent/, "newsletter signup records explicit consent");
assert.ok(!getInvolvedPage.includes("NewsletterForm"), "Get Involved does not duplicate the footer newsletter form");
assert.match(contactPage, /mailto:hi@indigenworld\.com/, "contact page provides a fallback email route");
assert.match(contactPage, /within five working days/, "contact page sets a response expectation");
assert.match(dictionaryPage, /Search Kasem, English, or dialect/, "dictionary exposes the mobile app search journey");
assert.match(dictionaryData, /where\("isPublished", "==", true\)/, "dictionary requests published records only");
assert.match(dictionaryPage, /SAVED_WORDS_KEY/, "dictionary saves words on the visitor's device");
assert.match(dictionaryPage, /role=\{mobileOpen \? "dialog" : undefined\}/, "mobile dictionary details use dialog semantics");
assert.match(dictionaryPage, /element\.inert = true/, "mobile dictionary details isolate background content");
assert.match(dictionaryPage, /returnFocus\.focus\(\)/, "mobile dictionary details restore trigger focus");
assert.match(app, /PAGE_COMPONENTS\[path\]\s*\?\?\s*NotFoundPage/, "unknown routes render the 404 page");
assert.match(notFound, /noindex:\s*true/, "the 404 route is excluded from indexing");
assert.match(notFound, /aria-label="Error 404"/, "the 404 state has an explicit accessible error code");
assert.match(read("scripts/prerender-meta.mjs"), /dist\/404\.html/, "the build creates a custom hosting 404 page");
assert.ok(
  !websiteHosting.match(/"source":\s*"\*\*"[\s\S]*?"destination":\s*"\/index\.html"/),
  "website hosting does not rewrite unknown paths to HTTP 200"
);
assert.match(headerStyles, /backdrop-filter:\s*blur/, "the primary navigation retains its glass treatment");
assert.ok(pageIndex.includes("./TesterRewardClaimPage"), "the private tester claim has a page component");
assert.match(testerClaimPage, /noindex:\s*true/, "the private tester claim is excluded from indexing at runtime");
assert.ok(!sitemap.includes(testerClaimPath), "the private tester claim is absent from sitemap.xml");
assert.ok(!read("src/components/Header.tsx").includes(testerClaimPath), "the private tester claim is absent from the header");
assert.ok(!read("src/components/Footer.tsx").includes(testerClaimPath), "the private tester claim is absent from the footer");

// ── Shared post links ────────────────────────────────────────────────────────
// The app shares https://indigenworld.com/post/<id>. Every assertion below is
// one link in the chain between that URL and something other than a 404; break
// any one of them and shared posts silently stop working, which is exactly how
// this route came to be missing in the first place.
const postPage = read("src/pages/PostPage.tsx");
const appLinks = read("src/content/appLinks.ts");
const navigationSource = read("src/content/navigation.ts");
const shareLink = read("../../apps/mobile/lib/features/community/community_actions.dart");

assert.match(shareLink, /https:\/\/indigenworld\.com\/post\/\$\{post\.id\}/, "the app shares /post/<id> on this domain");
assert.match(navigationSource, /path: "post"/, "the post route has prerendered metadata");
assert.match(navigationSource, /DYNAMIC_ROUTES: DynamicRoute\[\] = \[[\s\S]*?\{ path: "post", param: "postId" \}/, "the router knows /post/<id> carries an id");
assert.match(read("src/app/router.tsx"), /export function matchRoute/, "the router resolves dynamic routes");
assert.match(read("src/pages/index.ts"), /post: lazy\(/, "the post route has a page component");
assert.match(
  websiteHosting,
  /"source":\s*"\/post\/\*\*"[\s\S]*?"destination":\s*"\/post\/index\.html"/,
  "hosting serves the post page for every post id"
);
assert.ok(
  !websiteHosting.match(/"ignore":\s*\[[^\]]*"\*\*\/\.\*"/),
  "hosting does not ignore dotfiles, which would drop .well-known from every deploy"
);
assert.match(websiteHosting, /"source":\s*"\*\*\/index\.html"/, "every route's entry document is served uncached");
assert.match(postPage, /noindex: route\.noindex/, "the post route is excluded from indexing");
assert.match(postPage, /status === "missing"/, "a deleted post gets an explanation rather than a blank page");
assert.match(postPage, /<AppHandoff postId=\{postId\} \/>/, "every post-page state offers the app");
assert.match(appLinks, /APP_STORE_URL: string \| null = null/, "no store link is advertised before the listing exists");
assert.ok(
  read("src/features/community/postData.ts").includes(String.raw`/^https:\/\/\S+$/i.test`),
  "member-supplied media and avatar URLs are restricted to https"
);
assert.match(read("config/app-links.json"), /"sha256CertFingerprints"/, "the app-link association config is present");
assert.match(
  read("scripts/emit-well-known.mjs"),
  /sha256CertFingerprints\.length === 0/,
  "an unconfigured association file is skipped rather than shipped wrong"
);

// ── Shared community links ───────────────────────────────────────────────────
// The app shares https://indigenworld.com/communities/<slug>. Same chain as a
// post, with one extra promise: a private community's posts and members are
// never requested from this site.
const communityPage = read("src/pages/CommunityPage.tsx");
const communityData = read("src/features/community/communityData.ts");
const communityShare = read("../../apps/mobile/lib/features/community/communities/community_space_actions.dart");
const deepLinks = read("../../apps/mobile/lib/core/deep_links.dart");
const manifest = read("../../apps/mobile/android/app/src/main/AndroidManifest.xml");

assert.match(communityShare, /https:\/\/indigenworld\.com\/communities\//, "the app shares /communities/<slug> on this domain");
assert.match(deepLinks, /_claimedPrefixes = <String>\{'post', 'communities'\}/, "the app claims community links");
assert.match(manifest, /android:pathPrefix="\/communities\/"/, "Android hands community links to the app");
assert.match(read("config/app-links.json"), /"\/communities\/\*"/, "the iOS association claims community paths");
assert.match(navigationSource, /path: "communities"/, "the community route has prerendered metadata");
assert.match(navigationSource, /\{ path: "communities", param: "communityId" \}/, "the router knows /communities/<slug> carries a slug");
assert.match(read("src/pages/index.ts"), /communities: lazy\(/, "the community route has a page component");
assert.match(
  websiteHosting,
  /"source":\s*"\/communities\/\*\*"[\s\S]*?"destination":\s*"\/communities\/index\.html"/,
  "hosting serves the community page for every slug"
);
assert.match(communityPage, /noindex: route\.noindex/, "the community route is excluded from indexing");
assert.match(communityData, /COMMUNITY_SPACES = "communitySpaces"/, "communities are read from communitySpaces, not the cultural registry");
assert.match(communityData, /community\.isPrivate \? \[\] : await recentPublicPosts/, "a private community's posts are never requested");
assert.ok(!communityData.includes("memberships"), "the community page never reads a member list");
assert.match(communityPage, /status === "closed"/, "a closed or removed community is explained, not shown");

// ── Beyond the Reef ─────────────────────────────────────────────────────────
// The song is the clock. These hold the promises the experience makes: the
// words are the ones written, times run forward, the film covers the whole
// song with media that exists, nothing plays sound on arrival, and nothing
// generative runs in a visitor's browser.
{
  const feature = "src/features/beyond-the-reef";
  const reefPage = read("src/pages/BeyondTheReefPage.tsx");
  const lyricsSource = read(`${feature}/lyrics.ts`);
  const scenesSource = read(`${feature}/scenes.ts`);
  const stageSource = read(`${feature}/VisualStage.tsx`);
  const playerSource = read(`${feature}/useSongPlayer.ts`);
  const publicRoot = resolve(root, "public");

  // The words, exactly as written in the lyric sheet, in order.
  const written = read("scripts/beyond-the-reef/lyrics.txt")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "" && !/^\[.+\]$/.test(line.trim()));
  const timed = [...lyricsSource.matchAll(/\{ start: ([\d.]+), end: ([\d.]+), section: "[^"]*", stanza: \d+, text: ("(?:[^"\\]|\\.)*") \}/g)].map(
    (match) => ({ start: Number(match[1]), end: Number(match[2]), text: JSON.parse(match[3]) })
  );
  const duration = Number(/SONG_DURATION = ([\d.]+)/.exec(lyricsSource)?.[1]);
  assert.equal(timed.length, written.length, "every written lyric line has a timing");
  timed.forEach((line, index) => {
    assert.equal(line.text, written[index], `lyric ${index} is word-for-word the written line`);
    assert.ok(line.end > line.start, `lyric ${index} ends after it starts`);
    if (index > 0) assert.ok(line.start > timed[index - 1].start, `lyric ${index} starts after lyric ${index - 1}`);
  });
  assert.ok(timed.at(-1).end <= duration, "the last lyric ends inside the recording");

  // Shots follow one another without gaps and run to the end of the song.
  const shots = [...scenesSource.matchAll(/\{ id: "([^"]+)", start: ([\d.]+), end: ([\d.]+),/g)].map((match) => ({
    id: match[1],
    start: Number(match[2]),
    end: Number(match[3]),
  }));
  assert.ok(shots.length >= 12, "the visual timeline has its shots");
  assert.equal(shots[0].start, 0, "the film starts with the song");
  shots.forEach((shot, index) => {
    assert.ok(shot.end > shot.start, `shot ${shot.id} has a length`);
    if (index > 0) assert.equal(shot.start, shots[index - 1].end, `shot ${shot.id} begins where ${shots[index - 1].id} ends`);
  });
  assert.ok(shots.at(-1).end >= duration, "the last shot runs to the end of the song");

  // Every file the film names ships, and nothing unused ships beside it.
  const clipIds = [...scenesSource.matchAll(/clip\("([^"]+)"\)/g)].map((match) => match[1]);
  const imageIds = [...scenesSource.matchAll(/image\("([^"]+)"\)/g)].map((match) => match[1]);
  const referenced = new Set([
    "beyond-the-reef/audio/beyond-the-reef.m4a",
    "beyond-the-reef/audio/beyond-the-reef.mp3",
    "beyond-the-reef/images/social-cover.jpg",
    "beyond-the-reef/images/cover-512.jpg",
    ...imageIds.map((id) => `beyond-the-reef/images/${id}.webp`),
    ...clipIds.flatMap((id) => [
      `beyond-the-reef/video/${id}.webm`,
      `beyond-the-reef/video/${id}.mp4`,
      `beyond-the-reef/images/${id}-start.webp`,
      `beyond-the-reef/images/${id}-end.webp`,
    ]),
  ]);
  for (const file of referenced) {
    assert.ok(existsSync(resolve(publicRoot, file)), `${file} exists`);
  }
  const shipped = readdirSync(resolve(publicRoot, "beyond-the-reef"), { recursive: true })
    .map((entry) => `beyond-the-reef/${String(entry).replace(/\\/g, "/")}`)
    .filter((entry) => /\.[a-z0-9]+$/i.test(entry));
  for (const file of shipped) {
    assert.ok(referenced.has(file), `${file} is used by the page (unused media is not shipped)`);
  }

  // Sound only on request; everything is driven by the audio element's clock.
  assert.match(reefPage, /<audio ref=\{player\.audioRef\} preload="metadata">/, "the song loads without autoplay");
  assert.match(scenesSource, /beyond-the-reef\.m4a`, type: 'audio\/mp4; codecs="mp4a\.6B"' \},\s*\{ src: `\$\{MEDIA_ROOT\}\/audio\/beyond-the-reef\.mp3`/, "the exactly-seekable remux plays first, the original MP3 after");
  assert.ok(!/<audio[^>]*autoPlay/.test(reefPage), "the song never autoplays");
  assert.match(reefPage, /Begin the Journey/, "the opening screen offers to begin");
  assert.match(reefPage, /<video[\s\S]*?muted[\s\S]*?playsInline/, "the opening loop is silent and inline");
  assert.match(playerSource, /audio\.currentTime/, "the player reads the audio element's own position");
  assert.ok(!/setInterval/.test(playerSource + stageSource + read(`${feature}/LyricStream.tsx`)), "no independent timers drive lyrics or visuals");
  assert.match(stageSource, /muted[\s\S]*?playsInline/, "film clips are silent and inline");
  assert.match(reefPage, /usePrefersReducedMotion/, "the experience honours reduced motion");
  assert.match(read("src/styles/beyond-the-reef.css"), /prefers-reduced-motion: reduce/, "reduced motion has its own styles");
  assert.match(reefPage, /aria-live="polite"/, "the sung line is announced to assistive technology");
  assert.ok(!/@google\/genai|generativelanguage|aiplatform/.test(reefPage + scenesSource + stageSource + playerSource), "visitors never call a generative AI service");

  // Route, sharing and delivery.
  assert.match(navigationSource, /path: "beyond-the-reef",[\s\S]*?immersive: true,[\s\S]*?ogImage: "\/beyond-the-reef\/images\/social-cover\.jpg"/, "the film is an immersive route with its own link preview");
  assert.match(app, /ROUTES_BY_PATH\[path\]\?\.immersive === true/, "immersive routes step outside the site chrome");
  assert.match(read("scripts/prerender-meta.mjs"), /property="og:image"/, "prerendered pages carry their own link preview image");
  assert.match(read("public/sw.js"), /headers\.has\('range'\)/, "the service worker leaves streamed media to the browser");
  assert.match(websiteHosting, /"source":\s*"\/beyond-the-reef\/\*\*\/\*\.@\(m4a\|mp3\|mp4\|webm\|webp\|jpg\)"/, "film media is cached by browsers");
}

console.log(`Validated ${routes.length} public routes, the shared post and community link chains, the Beyond the Reef film, and core privacy/safety invariants.`);
