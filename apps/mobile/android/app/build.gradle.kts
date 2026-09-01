import java.util.Properties
import java.io.FileInputStream

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Release signing is driven by a gitignored android/key.properties file so no
// keystore or password ever lands in the repo. When it is absent (most local
// dev, and CI without secrets) release builds fall back to the debug key, which
// is fine for `flutter run` but is NOT accepted by Play — create key.properties
// before building the upload bundle. See docs/product/tester-readiness-runbook.md.
val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")
val hasReleaseSigning = keystorePropertiesFile.exists()
if (hasReleaseSigning) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

// Support both the standard app-level config and flavor-specific configs.
// The release runbook uses android/app/google-services.json, while local
// development normally keeps one under src/<flavor>/.
val hasFirebaseConfig =
    file("google-services.json").exists() ||
        file("src").walkTopDown().any { it.name == "google-services.json" }
if (hasFirebaseConfig) {
    apply(plugin = "com.google.gms.google-services")
    apply(plugin = "com.google.firebase.firebase-perf")
    apply(plugin = "com.google.firebase.crashlytics")
}

android {
    namespace = "world.indigen.mobile"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = "28.2.13676358"

    buildFeatures {
        resValues = true
    }

    compileOptions {
        // flutter_local_notifications needs this to back-port the java.time
        // APIs it uses onto older Android versions. Required whether or not the
        // app schedules anything — without it the build fails at AAR metadata
        // checking, not at runtime.
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "world.indigen.mobile"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["keyPassword"] as String
                storeFile = keystoreProperties["storeFile"]?.let { file(it) }
                storePassword = keystoreProperties["storePassword"] as String
            }
        }
    }

    buildTypes {
        getByName("release") {
            // Use the upload keystore when configured; otherwise fall back to the
            // debug key so local release builds still run (Play will reject those).
            signingConfig = if (hasReleaseSigning) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
        }
    }

    flavorDimensions += "environment"
    productFlavors {
        create("development") {
            dimension = "environment"
            applicationIdSuffix = ".dev"
            versionNameSuffix = "-dev"
            resValue("string", "app_name", "Indigen")
        }
        create("staging") {
            dimension = "environment"
            applicationIdSuffix = ".staging"
            versionNameSuffix = "-staging"
            resValue("string", "app_name", "Indigen")
        }
        create("production") {
            dimension = "environment"
            // Google Play created the production listing with this immutable ID.
            // Keep the namespace and non-production flavor IDs unchanged.
            applicationId = "com.indigenworld.indigen"
            resValue("string", "app_name", "Indigen")
        }
    }
}

dependencies {
    // Pairs with isCoreLibraryDesugaringEnabled above. Version tracked by
    // flutter_local_notifications; see its README if the plugin is upgraded.
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")

    // Play Integrity, used by PlayIntegrityChannel.kt.
    //
    // Firebase App Check already runs the Play Integrity *provider*, and that
    // dependency arrives with firebase_app_check. This one is separate because
    // the two ask different questions: App Check asks "is this a genuine app on
    // a genuine device" and hands back a yes/no, while the API below returns
    // the seven verdict fields Play Console lists — licensing, app recognition,
    // device recognition, recent activity, Play Protect state and app access
    // risk — which is what services/functions/src/play-integrity.ts judges.
    implementation("com.google.android.play:integrity:1.6.0")
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
