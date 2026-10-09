# video_thumbnail 0.5.6 compatibility copy

Source: the locked pub.dev `video_thumbnail` 0.5.6 package, upstream
https://github.com/justsoft/video_thumbnail. Original MIT license is in `LICENSE`.
Only the runtime, package metadata and upstream documentation are retained.

The Android build failed with Gradle 9.3.1 because this package calls `jcenter()`.
Gradle 9 removed that API:
https://docs.gradle.org/current/userguide/upgrading_major_version_9.html.
This copy replaces both repository calls with `mavenCentral()` and removes its
legacy AGP 4.1 classpath dependency, using the application's pinned AGP instead.
The redundant manifest package is removed; the same namespace remains in Gradle.
The package SDK constraint permits Dart 3, which already ran its hosted runtime.
Dart, Java and iOS implementation code are unchanged. No thumbnail URL or runtime
behaviour is modified. Do not patch the shared pub cache to build this app.

Validate with the pinned Flutter SDK and `npm run build:mobile-aab`; this exercises
the native Android compilation. Focused low-data/media tests retain coverage of
the application request boundary. iOS compilation requires the existing macOS
toolchain and was not performed in this Windows session.

Remove this local copy only after an upstream package supports the pinned toolchain
and a reviewed dependency change passes the same build checks.
