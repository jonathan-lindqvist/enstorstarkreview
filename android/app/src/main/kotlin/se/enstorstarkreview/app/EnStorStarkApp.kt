package se.enstorstarkreview.app

import android.app.Application
import coil3.ImageLoader
import coil3.PlatformContext
import coil3.SingletonImageLoader
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import kotlinx.coroutines.MainScope
import okhttp3.Cache
import okhttp3.OkHttpClient
import se.enstorstarkreview.app.model.ApiClient
import se.enstorstarkreview.app.model.AppModel
import se.enstorstarkreview.app.model.KeystoreStorage

class EnStorStarkApp : Application(), SingletonImageLoader.Factory {
    val model: AppModel by lazy {
        val http = OkHttpClient.Builder().cache(Cache(cacheDir.resolve("http"), 50L * 1024 * 1024)).build()
        AppModel(ApiClient(BuildConfig.DEFAULT_SERVER, http), KeystoreStorage(this), MainScope())
    }

    /** Photos load through the API client: drafts need the token. */
    override fun newImageLoader(context: PlatformContext): ImageLoader = ImageLoader.Builder(context)
        .components { add(OkHttpNetworkFetcherFactory(callFactory = { model.api.http })) }
        .build()
}
