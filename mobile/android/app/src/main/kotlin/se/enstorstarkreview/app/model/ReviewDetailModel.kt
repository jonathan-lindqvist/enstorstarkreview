package se.enstorstarkreview.app.model

import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import se.enstorstarkreview.api.models.Review

/** One review and its `ETag`. An edit can change the slug, so the slug is state too. */
class ReviewDetailModel(private val api: ApiClient, slug: String, preview: Review?) {
    var slug by mutableStateOf(slug)
        private set
    var review by mutableStateOf(preview)
        private set

    /** The `ETag` from the last read. Null until the review is loaded from the server. */
    var eTag by mutableStateOf<String?>(null)
        private set
    var isLoading by mutableStateOf(false)
        private set
    var errorMessage by mutableStateOf<String?>(null)
        private set
    private var generation = 0

    suspend fun load() {
        val current = ++generation
        isLoading = true
        try {
            val result = api.review(slug)
            if (current == generation) apply(result)
        } catch (error: ApiException) {
            if (current != generation) return
            Log.e("ReviewDetailModel", "Could not load review $slug: ${error.message}")
            errorMessage = error.message
        } finally {
            if (current == generation) isLoading = false
        }
    }

    /** Uses the response of a write request (edit or publication). */
    fun replace(result: Tagged<Review>) {
        generation++
        isLoading = false
        apply(result)
    }

    private fun apply(result: Tagged<Review>) {
        review = result.value
        eTag = result.eTag
        slug = result.value.slug
        errorMessage = null
    }
}
