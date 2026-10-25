import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.openapi.generator)
    alias(libs.plugins.roborazzi)
}

// The Google Maps key: MAPS_API_KEY in the gitignored local.properties, or in the environment for
// release builds. Without it the app builds and the map stays empty.
val mapsApiKey: String = providers.environmentVariable("MAPS_API_KEY").orElse(
    providers.fileContents(rootProject.layout.projectDirectory.file("local.properties")).asText.map { text ->
        text.lineSequence().map(String::trim).firstOrNull { it.startsWith("MAPS_API_KEY=") }?.substringAfter('=').orEmpty()
    },
).getOrElse("")

// The API models are generated from the server contract, like the iOS client. The HTTP calls are
// written by hand in model/ApiClient.kt (raw If-Match, problem details, ETags, explicit nulls).
val generatedApi = layout.buildDirectory.dir("generated/openapi")
openApiGenerate {
    generatorName.set("kotlin")
    library.set("jvm-okhttp4")
    inputSpec.set(rootDir.resolve("../../openapi/v1.yaml").absolutePath)
    outputDir.set(generatedApi.get().asFile.absolutePath)
    packageName.set("se.enstorstarkreview.api")
    configOptions.set(
        mapOf(
            "serializationLibrary" to "kotlinx_serialization",
            "dateLibrary" to "string",
            "enumPropertyNaming" to "camelCase",
            "omitGradleWrapper" to "true",
        )
    )
    // JSON numbers are doubles in the app, as in the API's TypeScript types.
    typeMappings.set(mapOf("number" to "kotlin.Double", "decimal" to "kotlin.Double"))
    // Models and the serializer setup only, no generated API classes.
    globalProperties.set(mapOf("models" to "", "supportingFiles" to "", "modelDocs" to "false", "modelTests" to "false"))
}

/**
 * The generator gives an inline `type: [object, 'null']` property its own model and drops the
 * null. These are all of them (ContractTest decodes both as null); the build fails when one no
 * longer matches, so a generator or contract change cannot silently break decoding.
 */
tasks.named("openApiGenerate") {
    val outputDir = generatedApi.get().asFile
    val nullableInlineObjects = mapOf(
        "NearbyReviews.kt" to ("val summary: NearbyReviewsSummary" to "val summary: NearbyReviewsSummary?"),
        "MapMarker.kt" to ("val beer: MapMarkerBeer" to "val beer: MapMarkerBeer?"),
    )
    doLast {
        nullableInlineObjects.forEach { (name, replacement) ->
            val file = outputDir.walk().single { it.name == name }
            val text = file.readText()
            check(replacement.first in text) { "$name no longer contains `${replacement.first}`" }
            file.writeText(text.replace(replacement.first, replacement.second))
        }
    }
}

android {
    namespace = "se.enstorstarkreview.app"
    compileSdk = 37

    defaultConfig {
        applicationId = "se.enstorstarkreview.app"
        minSdk = 29
        targetSdk = 36
        // The release task passes the commit count (`-PversionCode=…`, see ../README.md); local
        // builds use 1.
        versionCode = providers.gradleProperty("versionCode").map(String::toInt).getOrElse(1)
        versionName = "0.0.1"
        manifestPlaceholders["mapsApiKey"] = mapsApiKey
    }

    // The Play upload key, from the gitignored mobile/android/keystore.properties (keys storeFile,
    // storePassword, keyAlias, keyPassword). Without it, release builds are signed with the debug
    // key: fine for checking a release build on a device, rejected by Play.
    val keystoreProperties = rootProject.file("keystore.properties")
    signingConfigs {
        create("release") {
            if (keystoreProperties.isFile) {
                val properties = Properties().apply { keystoreProperties.inputStream().use(::load) }
                storeFile = rootProject.file(properties.getProperty("storeFile"))
                storePassword = properties.getProperty("storePassword")
                keyAlias = properties.getProperty("keyAlias")
                keyPassword = properties.getProperty("keyPassword")
            } else {
                logger.warn("mobile/android/keystore.properties is missing: release builds use the debug key")
                initWith(getByName("debug"))
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".dev"
            buildConfigField("String", "DEFAULT_SERVER", "\"http://10.0.2.2:5173\"")
        }
        release {
            buildConfigField("String", "DEFAULT_SERVER", "\"https://enstorstarkreview.se\"")
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    dependenciesInfo {
        // No dependency metadata in the APK or bundle, as in the Skip build.
        includeInApk = false
        includeInBundle = false
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    testOptions {
        unitTests.isIncludeAndroidResources = true
        // android.util.Log and friends return defaults in plain JVM tests.
        unitTests.isReturnDefaultValues = true
    }

    sourceSets["main"].kotlin.directories.add("build/generated/openapi/src/main/kotlin")
    // The same API fixtures as the iOS model tests.
    sourceSets["test"].resources.directories.add("../../ios/Tests/EnStorStarkModelTests/Fixtures")
}

kotlin {
    compilerOptions { jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17 }
}

tasks.named("preBuild") { dependsOn("openApiGenerate") }

dependencies {
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.material3)
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.tooling.preview)
    debugImplementation(libs.compose.ui.tooling)
    implementation(libs.activity.compose)
    implementation(libs.lifecycle.runtime.compose)
    implementation(libs.coroutines.android)
    implementation(libs.serialization.json)
    implementation(libs.okhttp)
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)
    implementation(libs.core.ktx)
    implementation(libs.navigation.compose)
    implementation(libs.maps.compose)
    implementation(libs.play.services.maps)
    implementation(libs.play.services.location)
    implementation(libs.exifinterface)

    testImplementation(libs.junit)
    testImplementation(libs.mockwebserver)
    testImplementation(libs.coroutines.test)
    testImplementation(libs.robolectric)
    testImplementation(libs.roborazzi)
    testImplementation(libs.roborazzi.compose)
    testImplementation(libs.roborazzi.junit)
    testImplementation(platform(libs.compose.bom))
    testImplementation(libs.compose.ui.test.junit4)
    debugImplementation(libs.compose.ui.test.manifest)
}

tasks.withType<Test>().configureEach {
    // Robolectric reaches into JDK internals that JDK 25 closes by default.
    jvmArgs("--add-opens=java.base/java.io=ALL-UNNAMED", "--enable-native-access=ALL-UNNAMED")
}
