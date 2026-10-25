package se.enstorstarkreview.app.model

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import se.enstorstarkreview.api.models.BarAttributeKey
import se.enstorstarkreview.api.models.RatingMetric

/** The app-wide state. One instance lives for the whole app session. */
class AppModel(val api: ApiClient, storage: SecureStorage, private val scope: CoroutineScope) {
    val session = SessionModel(api, CredentialStore(storage))
    val reviewList = ReviewListModel(api)
    val metadata = Loader { api.reviewMetadata() }
    val statistics = Loader { api.statistics() }
    val map = Loader { api.map() }

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

    /** Reloads everything that shows published reviews, after a publication or a delete. */
    fun reloadPublished() {
        scope.launch {
            reviewList.load()
            statistics.load()
            map.load()
        }
    }
}
