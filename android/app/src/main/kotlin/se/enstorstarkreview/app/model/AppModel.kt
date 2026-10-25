package se.enstorstarkreview.app.model

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import se.enstorstarkreview.api.models.BarAttributeKey
import se.enstorstarkreview.api.models.RatingMetric
import se.enstorstarkreview.api.models.Review

/** The app-wide state. One instance lives for the whole app session. */
class AppModel(val api: ApiClient, storage: SecureStorage, private val scope: CoroutineScope) {
    val session = SessionModel(api, CredentialStore(storage))
    val reviewList = ReviewListModel(api)
    val metadata = Loader { api.reviewMetadata() }
    val statistics = Loader { api.statistics() }
    val map = Loader { api.map() }
    val reviewRequest = ReviewRequestModel(api)

    /** A short confirmation after a delete, for example "Ivans Pilsnerbar togs bort". */
    var deletedNotice by mutableStateOf<String?>(null)

    init {
        session.onChange = { sessionDidChange() }
    }

    /** Drafts appear or disappear, so reload the list; cached responses go with the session. */
    private fun sessionDidChange() {
        api.http.cache?.evictAll()
        scope.launch { reviewList.load() }
    }

    /** The rating aspects in display order, with Swedish labels. Empty until metadata loads. */
    val ratingMetrics: List<RatingMetric> get() = metadata.value?.ratingMetrics.orEmpty()

    /** Swedish labels of bar attributes, in the metadata's order. Unknown keys are left out. */
    fun attributeLabels(keys: Collection<BarAttributeKey>): List<String> =
        metadata.value?.barAttributes.orEmpty().filter { it.key in keys }.map { it.label }

    /** Publishes a draft. The returned job reloads the list, statistics, and map. */
    suspend fun publish(slug: String): Pair<Tagged<Review>, Job> {
        val published = api.publish(slug)
        return published to reloadPublished()
    }

    /** Updates the lists after a create or an edit. Drafts are not in the statistics or on the map. */
    fun didSave(review: Review): Job = scope.launch {
        reviewList.load()
        if (!review.isDraft) {
            statistics.load()
            map.load()
        }
    }

    /** Drops a deleted review from the list at once, then reloads everything that showed it. */
    fun didDelete(slug: String, title: String): Job {
        reviewList.remove(slug)
        deletedNotice = "$title togs bort"
        return reloadPublished()
    }

    /** Signed-in reviewers resolve at most one missing map address each time the map loads. */
    suspend fun resolveNextMapMarker() {
        if (!session.isSignedIn) return
        try {
            api.resolveNextMapMarker()?.let(map::replace)
        } catch (error: ApiException) {
            Log.i("AppModel", "Geocoding did not complete: ${error.message}")
        }
    }

    fun reviewDetail(slug: String, preview: Review?) = ReviewDetailModel(api, slug, preview)

    fun historyLoader(slug: String) = Loader { api.reviewHistory(slug) }

    private fun reloadPublished(): Job = scope.launch {
        reviewList.load()
        statistics.load()
        map.load()
    }
}
