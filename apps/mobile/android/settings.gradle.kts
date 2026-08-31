pluginManagement {
    val flutterSdkPath =
        run {
            val properties = java.util.Properties()
            file("local.properties").inputStream().use { properties.load(it) }
            val flutterSdkPath = properties.getProperty("flutter.sdk")
            require(flutterSdkPath != null) { "flutter.sdk not set in local.properties" }
            flutterSdkPath
        }

    includeBuild("$flutterSdkPath/packages/flutter_tools/gradle")

    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

plugins {
    id("dev.flutter.flutter-plugin-loader") version "1.0.0"
    // AGP 9. Play Console's app-optimisation report asks for it by name — its
    // R8 runs the optimised resource shrinker by default, which 8.x did not —
    // and Flutter 3.47 warns below 9.0.1 besides.
    id("com.android.application") version "9.1.0" apply false
    id("com.google.gms.google-services") version("4.5.0") apply false
    id("com.google.firebase.firebase-perf") version("2.0.2") apply false
    id("com.google.firebase.crashlytics") version("3.0.7") apply false
    id("org.jetbrains.kotlin.android") version "2.4.0" apply false
}

include(":app")
