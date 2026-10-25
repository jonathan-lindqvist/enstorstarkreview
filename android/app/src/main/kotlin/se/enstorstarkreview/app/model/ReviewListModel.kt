package se.enstorstarkreview.app.model

import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import se.enstorstarkreview.api.models.BarAttributeKey
import se.enstorstarkreview.api.models.Review
import se.enstorstarkreview.api.models.ReviewSort

/** State for the review list: the loaded reviews, the query, and the last error. */
class ReviewListModel(private val api: ApiClient) {
    var reviews by mutableStateOf<List<Review>>(emptyList())
        private set
    var isLoading by mutableStateOf(false)
        private set
    var errorMessage by mutableStateOf<String?>(null)
        private set
    var search by mutableStateOf("")
    var sort by mutableStateOf(ReviewSort.latest)

    /** Selected bar attributes. Like the web, a review matches when it has any of them. */
    var attributeFilter by mutableStateOf<Set<BarAttributeKey>>(emptySet())

    /** "Närmast": the newest first from the API, ordered by distance on the device. */
    var nearest by mutableStateOf(false)

    /** The device location, in memory only. Null until known or when access is off. */
    var origin by mutableStateOf<GeoPoint?>(null)

    /** The user turned location access off; "Närmast" then shows the newest first. */
    var locationDenied by mutableStateOf(false)

    /** The last location fix failed; "Närmast" then shows the newest first. */
    var locationFailed by mutableStateOf(false)

    /** Saved positions by slug, from the map markers. */
    var positions by mutableStateOf<Map<String, GeoPoint>>(emptyMap())

    private var generation = 0

    /** The loaded reviews that match the attribute filter, in the chosen order. */
    val visibleReviews: List<Review>
        get() {
            val filtered = if (attributeFilter.isEmpty()) reviews else reviews.filter { review -> review.attributes.any { it in attributeFilter } }
            if (!nearest || origin == null) return filtered
            return ReviewDistance.sorted(filtered) { distanceKm(it.slug) }
        }

    /** Chooses an API sort and leaves "Närmast". */
    fun choose(sort: ReviewSort) {
        nearest = false
        this.sort = sort
    }

    /** Kilometres from the device, when both positions are known. */
    fun distanceKm(slug: String): Double? {
        val origin = origin ?: return null
        val position = positions[slug] ?: return null
        return ReviewDistance.kilometres(origin, position)
    }

    /** Drops a deleted review without waiting for the next load. */
    fun remove(slug: String) {
        reviews = reviews.filterNot { it.slug == slug }
    }

    suspend fun load() {
        if (search.length > MAX_SEARCH_LENGTH) search = search.take(MAX_SEARCH_LENGTH)
        // Only the most recently started load may write its result.
        val current = ++generation
        isLoading = true
        try {
            val result = api.reviews(search, if (nearest) ReviewSort.latest else sort)
            if (current != generation) return
            reviews = result
            errorMessage = null
        } catch (error: ApiException) {
            if (current != generation) return
            Log.e("ReviewListModel", "Could not load reviews: ${error.message}")
            errorMessage = error.message
        } finally {
            if (current == generation) isLoading = false
        }
    }

    data class SortOption(val sort: ReviewSort, val label: String)

    companion object {
        /** The API accepts at most 80 characters. */
        const val MAX_SEARCH_LENGTH = 80

        val sortOptions = listOf(
            SortOption(ReviewSort.latest, "Senaste"),
            SortOption(ReviewSort.oldest, "Äldsta"),
            SortOption(ReviewSort.score, "Högst betyg"),
        )
    }
}
