# Indigen opens again on Android (0.1.26)

Status: **Draft.** The 0.1.26 (35) production bundle was built and signed on 2026-09-24 and opened on an Android emulator after installation over the crashing 0.1.25 copy. Version 0.1.25 was reported on a Google Play testing track; the corrected build has not been uploaded or checked on a physical phone. Keep the article and sharing copy unpublished until it is available to testers.

| Blogger field | Value |
| --- | --- |
| Title | Indigen opens again on Android |
| Labels | `Release`, `Fix`, `Mobile app` |
| Search description | Android version 0.1.26 fixes an opening-screen crash in Indigen World 0.1.25. |
| Custom permalink | `android-startup-fix` |

## Release evidence

- A signed copy of the 0.1.25 (34) bundle was installed over 0.1.15 on an Android emulator. It closed before its first Flutter frame. The Android fatal log named `androidx.startup.InitializationProvider` and `androidx.work.impl.WorkDatabase`.
- The 0.1.25 R8 `usage.txt` lists `WorkDatabase_Impl`'s public no-argument constructor as removed. The release rule added for 0.1.26 keeps that constructor.
- The 0.1.26 bundle is `output/release-bundles/indigen-0.1.26+35.aab`, SHA-256 `6f29ca64eab555ebaecb996b17c7698b9ad9f2d8ae6bae3ecccdee13cfda77cd`; `jarsigner -verify` passed and its certificate matches 0.1.25.
- The 0.1.26 R8 report retains the constructor. The installed update reached the Community screen on an emulator without clearing app data. Details are in `docs/product/releases/0.1.26+35.md`.
- No physical-phone or Play-delivered update test has been completed yet.

## Publishing handoff

1. Confirm 0.1.26 (35) is available on the intended Google Play testing track and opens on a phone that was affected by 0.1.25.
2. In Blogger, create a post with the title above, switch to HTML view, and paste `post.html`.
3. Set the labels, search description, and custom permalink above. Preview the article, then publish it.
4. Replace `[PUBLISHED_POST_URL]` in `share.md` with the article URL before sharing its copy.

Preparing these files does not publish the article or send the announcement.
