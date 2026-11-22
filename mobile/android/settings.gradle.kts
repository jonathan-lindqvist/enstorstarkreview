pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        // The large SDK jars can be rate-limited on cold GitHub Actions runners.
        exclusiveContent {
            forRepository {
                maven {
                    name = "GoogleMavenCentralMirror"
                    url = uri("https://maven-central.storage-download.googleapis.com/maven2/")
                }
            }
            filter {
                includeModule("org.robolectric", "android-all-instrumented")
            }
        }
    }
}
rootProject.name = "EnStorStark"
include(":app")
