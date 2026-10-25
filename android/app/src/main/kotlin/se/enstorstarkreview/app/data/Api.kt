package se.enstorstarkreview.app.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import se.enstorstarkreview.api.models.Review
import se.enstorstarkreview.api.models.ReviewList
import se.enstorstarkreview.api.models.ReviewSort
import se.enstorstarkreview.app.BuildConfig
import se.enstorstarkreview.app.model.ApiJson

/** The server and the review list. */
object Api {
    val origin: String = BuildConfig.DEFAULT_SERVER

    val http: OkHttpClient = OkHttpClient.Builder().build()

    suspend fun listReviews(sort: ReviewSort, search: String? = null): List<Review> = withContext(Dispatchers.IO) {
        val url = "$origin/api/v1/reviews".toHttpUrl().newBuilder().addQueryParameter("sort", sort.value)
            .apply { if (!search.isNullOrBlank()) addQueryParameter("search", search) }.build()
        http.newCall(Request.Builder().url(url).build()).execute().use { response ->
            ApiJson.decodeFromString<ReviewList>(response.body.string()).reviews
        }
    }

    /** A server preview of a review photo (`card-v1` for lists). */
    fun imageUrl(path: String, preview: String = "card-v1"): String = "$origin$path?preview=$preview"
}
