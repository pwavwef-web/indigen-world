# App-level R8 rules. The Flutter Gradle plugin adds this file to the release
# build's proguardFiles when it exists, after Android's own
# proguard-android-optimize.txt and Flutter's flutter_proguard_rules.pro.

# ── Repackaging ─────────────────────────────────────────────────────────────
# Move every class R8 is free to rename into a single unnamed package, instead
# of leaving the original directory tree behind in the dex. Play Console's app
# optimisation report lists this as one of the four R8 settings it looks for,
# and it was the one the build was not doing.
#
# Only classes R8 may already rename are moved. Anything held by a -keep rule
# stays exactly where it is: the Flutter embedding, every plugin registered
# through it, and — the part that makes repackaging safe rather than hopeful —
# every component named in the merged manifest, which AAPT emits keep rules for.
# Activities, services and receivers are looked up by name at runtime, and those
# names are the ones that never move.
-repackageclasses ''

# WorkManager starts from AndroidX Startup before Flutter can draw a frame.
# Its Room database is created by class name and a public no-arg constructor.
# Room 2.2.5 keeps the generated class name but its consumer rule does not keep
# that constructor; R8 removed it from the 0.1.25 release and every launch
# failed on the system splash screen.
-keep class androidx.work.impl.WorkDatabase_Impl { public <init>(); }
