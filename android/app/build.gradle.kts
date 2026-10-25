plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.openapi.generator)
    alias(libs.plugins.roborazzi)
}

// The API client is generated from the server contract, like the iOS client.
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
    globalProperties.set(mapOf("apiDocs" to "false", "modelDocs" to "false", "apiTests" to "false", "modelTests" to "false"))
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
}

kotlin {
    compilerOptions { jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17 }
}

tasks.named("openApiGenerate") {
    // The kotlin generator writes enum parameter defaults unqualified (`sort: ReviewSort? = latest`).
    val outputDir = generatedApi.get().asFile
    doLast {
        outputDir.walk().filter { it.name == "ReviewsApi.kt" }.forEach { file ->
            file.writeText(file.readText().replace("ReviewSort? = latest", "ReviewSort? = ReviewSort.latest"))
        }
    }
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

    testImplementation(libs.junit)
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
