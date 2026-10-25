package se.enstorstarkreview.app.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import se.enstorstarkreview.app.model.ApiClient
import se.enstorstarkreview.app.model.AppModel
import se.enstorstarkreview.app.model.MemoryStorage

/** An app model that never reaches a server: photos show their placeholder. */
fun offlineApp(): AppModel = AppModel(ApiClient("http://127.0.0.1:9"), MemoryStorage(), CoroutineScope(Dispatchers.Unconfined), kotlin.io.path.createTempDirectory("unsaved").toFile())

@Composable
fun ScreenshotApp(app: AppModel = offlineApp(), content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalApp provides app) { EssTheme(content) }
}
