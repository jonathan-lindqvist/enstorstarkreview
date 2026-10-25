package se.enstorstarkreview.app.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import se.enstorstarkreview.api.apis.ReviewsApi
import se.enstorstarkreview.api.models.Review
import se.enstorstarkreview.api.models.ReviewSort
import se.enstorstarkreview.app.BuildConfig

/** The server and the generated API client. */
object Api {
    val origin: String = BuildConfig.DEFAULT_SERVER

    val http: OkHttpClient = OkHttpClient.Builder().build()

    private val reviews = ReviewsApi("$origin/api/v1", http)

    suspend fun listReviews(sort: ReviewSort, search: String? = null): List<Review> =
        withContext(Dispatchers.IO) { reviews.listReviews(search = search, sort = sort).reviews }

    /** A server preview of a review photo (`card-v1` for lists). */
    fun imageUrl(path: String, preview: String = "card-v1"): String = "$origin$path?preview=$preview"
}
