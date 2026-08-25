import com.android.build.gradle.BaseExtension

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}

// Some pub packages pin their own compileSdk (video_thumbnail 0.5.6 pins 33) while
// the AndroidX libraries they depend on publish AAR metadata demanding 34+, which
// fails checkAarMetadata. Compile every Android module against the same SDK as the
// app rather than forking those plugins — compileSdk only affects compilation, so
// runtime behaviour still comes from each module's own targetSdk/minSdk.
//
// This must be registered before the evaluationDependsOn(":app") block below, which
// evaluates :app eagerly and would leave no afterEvaluate hook to attach to.
fun Project.androidExtension(): BaseExtension? = extensions.findByName("android") as? BaseExtension

fun BaseExtension.compileSdkInt(): Int? = compileSdkVersion?.removePrefix("android-")?.toIntOrNull()

// Falls back to the Flutter 3.47 default if :app has not been evaluated yet.
fun appCompileSdk(): Int = project(":app").androidExtension()?.compileSdkInt() ?: 36

fun Project.alignCompileSdkWithApp() {
    val android = androidExtension() ?: return
    val currentSdk = android.compileSdkInt() ?: return
    val targetSdk = appCompileSdk()
    if (currentSdk < targetSdk) {
        logger.info("Raising :$name compileSdk from $currentSdk to $targetSdk to match :app")
        android.compileSdkVersion(targetSdk)
    }
}

subprojects {
    if (state.executed) {
        alignCompileSdkWithApp()
    } else {
        afterEvaluate { alignCompileSdkWithApp() }
    }
}

subprojects {
    project.evaluationDependsOn(":app")
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
