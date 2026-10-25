plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.openapi.generator)
    alias(libs.plugins.roborazzi)
}

// The API models are generated from the server contract, like the iOS client. The HTTP calls are
// written by hand in data/ApiClient.kt (raw If-Match, problem details, ETags, explicit nulls).
val generatedApi = layout.buildDirectory.dir("generated/openapi")
openApiGenerate {
    generatorName.set("kotlin")
    library.set("jvm-okhttp4")
    inputSpec.set(rootDir.resolve("../openapi/v1.yaml").absolutePath)
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
        versionCode = 4
        versionName = "1.0"
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".dev"
            buildConfigField("String", "DEFAULT_SERVER", "\"http://10.0.2.2:5173\"")
        }
        release {
            buildConfigField("String", "DEFAULT_SERVER", "\"https://enstorstarkreview.se\"")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    testOptions { unitTests.isIncludeAndroidResources = true }

    sourceSets["main"].kotlin.directories.add("build/generated/openapi/src/main/kotlin")
    // The same API fixtures as the iOS model tests.
    sourceSets["test"].resources.directories.add("../../mobile/Tests/EnStorStarkModelTests/Fixtures")
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
    implementation(libs.lifecycle.viewmodel.compose)
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
