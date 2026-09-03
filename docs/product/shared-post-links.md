# Shared post links

What happens when somebody taps **Share** on a Community post, and what still
needs a console change to finish.

**Project facts:** production Android application id `world.indigen.mobile`
(the `.dev` and `.staging` suffixes are the other flavours), site
`https://indigenworld.com` on the Firebase Hosting target `indigen-world`,
Firebase/Cloud project `project-kassena-7e026`.

## 0. The short version

Sharing a post produces `https://indigenworld.com/post/<id>`. Before this
change, that URL existed nowhere: the website had no `/post` route and no
catch-all rewrite, so Firebase Hosting returned a genuine 404, and the Android
manifest declared no App Link, so the operating system had no reason to offer
the app either. The app has had a working `/post/:postId` route the whole time
— nothing outside the app could reach it.

Three things now stand behind that URL.

| Layer | State |
| --- | --- |
| A real web page at `/post/<id>` that renders the post and offers the app | **Live** — nothing further needed |
| An `indigen://post/<id>` fallback the web page can fire | **Live** on Android and iOS |
| Android App Links, so the URL opens the app directly | **Code shipped, needs one console value** — §2 |
| iOS Universal Links | **Blocked on an Apple Developer account** — §3 |

Everything degrades in the right direction. Until §2 is done, a shared link
opens the website, which shows the post and offers the app — already strictly
better than the 404 it used to produce.

## 1. What each piece is

**`apps/mobile/lib/features/community/community_actions.dart`** builds the
shared link. It is the origin of the whole chain and the reason the URL shape
is what it is.

**`apps/mobile/lib/core/deep_links.dart`** maps an incoming link to an in-app
route, and refuses anything the app has not claimed. It feeds
`pendingPushRouteProvider` — the same provider a tapped push notification uses
— so a link opens *on top of* the running app rather than instead of it. That
is why a link tapped on a first-ever launch still gets onboarding first, and
why going back from a shared post lands in the app rather than closing it.

The app deliberately does **not** set `flutter_deeplinking_enabled`. That flag
hands the incoming URL to `go_router` as the app's initial location, which
would replace the startup gate instead of sitting on top of it.

**`apps/mobile/android/app/src/main/AndroidManifest.xml`** declares the App
Link filter (`autoVerify`, `https`, both hosts, path prefix `/post/`) and the
`indigen://` fallback scheme. `apps/mobile/ios/Runner/Info.plist` declares the
same fallback scheme.

**`apps/website/src/pages/PostPage.tsx`** is the web page. It reads
`communityPosts/<id>` straight from Firestore — the collection is world-readable
by rule, so this needs no account and no backend — and always renders the
"Open in Indigen" panel, including when the post has been deleted.

**`firebase.json`** rewrites `/post/**` to the prerendered `/post/index.html`.
Without that rewrite Hosting looks for a file that does not exist and serves the
404 page, which is exactly the bug this fixes.

## 2. Finishing Android App Links — the one thing left

Android only hands `indigenworld.com/post/<id>` to the app if it can fetch
`https://indigenworld.com/.well-known/assetlinks.json` and find the signing
certificate of the installed build listed in it. That file is generated at build
time from **`apps/website/config/app-links.json`**, which currently has an empty
fingerprint list — so the file is not written, not deployed, and verification
does not happen.

1. Get the **SHA-256** certificate fingerprint of every key that signs a build
   members install:
   - **Play App Signing** (the one that matters for a Play install) — Play
     Console, your app, *Test and release*, *Setup*, *App signing*, *App signing
     key certificate*, SHA-256 certificate fingerprint.
   - **Upload key and any local release key** — run the signing report:

   ```bash
   cd apps/mobile/android && ./gradlew :app:signingReport
   ```

2. Paste them into `android.sha256CertFingerprints` in
   `apps/website/config/app-links.json`, uppercase and colon-separated exactly
   as reported.
3. Rebuild and deploy the site. The build prints which association files it
   wrote; if it says it wrote none, the config is still empty.

   ```bash
   npm run build:website && npx firebase deploy --only hosting:indigen-world
   ```

4. Confirm the file is actually being served. A 404 here is the usual reason
   verification silently fails:

   ```bash
   curl -i https://indigenworld.com/.well-known/assetlinks.json
   ```

5. Install a build signed with one of those keys and check the verdict. Both
   hosts should read `verified`:

   ```bash
   adb shell pm get-app-links world.indigen.mobile
   ```

6. Then confirm the link itself opens the app rather than a browser:

   ```bash
   adb shell am start -a android.intent.action.VIEW -d "https://indigenworld.com/post/SOME_POST_ID"
   ```

**Nothing here is a secret.** A signing certificate's SHA-256 fingerprint is
public by design — it is the value every device checks the association against.

**Why the file is generated rather than committed.** A wrong or malformed
`assetlinks.json` is worse than a missing one: Android caches a failed
verification, so links keep opening the browser for a while even after the file
is corrected. An incomplete config therefore emits nothing and warns, rather
than shipping a placeholder.

**Note on the `ignore` list in `firebase.json`.** It used to contain `**/.*`,
which excludes the whole `.well-known` directory from every deploy. It has been
replaced with `**/.DS_Store`. Putting the dotfile glob back would silently
un-deploy the association files and break every App Link.

## 3. iOS Universal Links — what is missing

Two things, neither of which can be done from this repository:

1. An **Apple team id**, added to `apple.appIds` in
   `apps/website/config/app-links.json` as `<TEAM ID>.world.indigen.mobile`.
   The generator then writes `/.well-known/apple-app-site-association`.
2. The **associated domains entitlement** on the Runner target
   (`applinks:indigenworld.com`), which needs a `Runner.entitlements` file, a
   `CODE_SIGN_ENTITLEMENTS` build setting, and a provisioning profile that
   carries the capability. That is Xcode work against a real Apple Developer
   account.

Do them in that order and only together. An `apple-app-site-association` naming
an app that does not claim the domain is worse than no file at all.

Until then, iOS falls back to the `indigen://` scheme the post page offers,
which works on any device that has the app.

## 4. Adding another shareable link later

Four places have to agree, and the site's test asserts most of it:

1. `_claimedPrefixes` in `apps/mobile/lib/core/deep_links.dart`.
2. The `pathPrefix` in the Android manifest's App Links filter.
3. `apple.paths` in `apps/website/config/app-links.json`.
4. **A real page on the website for it.** This is the one that is easy to forget
   and the reason `/entry/<id>` is *not* claimed today: the app has a
   dictionary-entry route, but the website has no page for one, so claiming it
   would strand everybody without the app on a 404 — the original bug, moved.

## 5. Known limitation: link previews

A link pasted into WhatsApp or a group chat unfurls with the generic "Community
post" title and description, not the post's own text, because the page is
rendered in the browser and an unfurler does not run JavaScript. The route is
`noindex` for the same reason.

Fixing it means serving `/post/**` from a function that reads the post and
writes its own `og:` tags before returning the HTML shell. That is a
self-contained change to the Hosting rewrite plus one function; it was left out
here to keep this change to the thing that was broken.
