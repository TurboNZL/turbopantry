plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// CI passes the release's version (-PappVersion=2026.10.3); versionCode grows with it, which Android needs to accept an update
val appVersion = (findProperty("appVersion") as String?) ?: "0.1.0"
val parts = appVersion.split(".").map { it.toIntOrNull() ?: 0 }
val code = parts.getOrElse(0) { 0 } * 10000 + parts.getOrElse(1) { 0 } * 100 + parts.getOrElse(2) { 0 }

android {
    namespace = "nz.turbo.turbopantry"
    compileSdk = 35

    defaultConfig {
        applicationId = "nz.turbo.turbopantry"
        minSdk = 26
        targetSdk = 35
        versionCode = code
        versionName = appVersion
        buildConfigField("String", "REPO_OWNER", "\"TurboNZL\"")
        buildConfigField("String", "REPO_NAME", "\"turbopantry\"")
    }
    buildFeatures { buildConfig = true }

    // Android only installs an update over an app signed with the same key, so every build must use the same one.
    // The release workflow passes the owner's own key through TURBOPANTRY_KEYSTORE* (GitHub secrets); without them the build uses the
    // personal key committed next to this project (as the engine's android-shell does), NOT a throwaway debug key, so updates keep working.
    // Switching from one key to another means uninstalling the app once.
    signingConfigs {
        create("turbopantry") {
            fun env(name: String) = System.getenv(name)?.takeIf { it.isNotBlank() }
            storeFile = env("TURBOPANTRY_KEYSTORE")?.let { file(it) } ?: file("../turbopantry.keystore")
            storePassword = env("TURBOPANTRY_KEYSTORE_PASSWORD") ?: "turbopantry-personal"
            keyAlias = env("TURBOPANTRY_KEY_ALIAS") ?: "turbopantry"
            keyPassword = env("TURBOPANTRY_KEY_PASSWORD") ?: "turbopantry-personal"
        }
    }
    buildTypes {
        release { signingConfig = signingConfigs.getByName("turbopantry"); isMinifyEnabled = false }
        debug { signingConfig = signingConfigs.getByName("turbopantry"); applicationIdSuffix = ".debug"; versionNameSuffix = "-debug" }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/web"))
}

// The web client (apps/web) is bundled into the app and shown in a WebView: build it first with `pnpm --filter @turbopantry/web build`.
val copyWeb by tasks.registering(Copy::class) {
    val dist = file("../../web/dist")
    from(dist)
    into(layout.buildDirectory.dir("generated/web"))
    doFirst { check(dist.resolve("index.html").exists()) { "Build the web client first: pnpm --filter @turbopantry/web build" } }
}
tasks.matching { it.name == "preBuild" }.configureEach { dependsOn(copyWeb) }

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.12.1")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
