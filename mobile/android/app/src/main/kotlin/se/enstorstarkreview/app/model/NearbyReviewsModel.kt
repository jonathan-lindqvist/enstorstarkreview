package se.enstorstarkreview.app.model

import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import se.enstorstarkreview.api.models.NearbyReview

/**
 * Reviewed bars near the address, for the barhop rating, like the web's review form. The centre is
 * the address's saved position on the server; the app never sends the device location.
 */
class NearbyReviewsModel(private val api: ApiClient, private val excluding: String?) {
    data class Result(
        val radiiMetres: List<Int>,
        /** Cumulative counts per radius, drafts included. */
        val counts: List<Int>,
        val nearest: List<NearbyReview>,
        val locatedCount: Int,
        val totalCount: Int,
    )

    sealed interface State {
        data object Loading : State
        data class Results(val result: Result) : State
        /** No review with this address has a saved position. */
        data object NoPosition : State
        /** No other review has a known position. */
        data object NoneLocated : State
        data object Unavailable : State
    }

    var state by mutableStateOf<State>(State.Loading)
        private set

    /** The address of the current state, trimmed. */
    private var address: String? = null
    private var generation = 0

    /** Loads the comparison for [address], unless it is already shown or loading. */
    suspend fun load(address: String) {
        val trimmed = address.trim()
        if (trimmed == this.address && state != State.Unavailable) return
        this.address = trimmed
        val current = ++generation
        if (trimmed.isEmpty() || trimmed.length > MAX_ADDRESS_LENGTH) {
            state = State.NoPosition
            return
        }
        state = State.Loading
        val next = try {
            val nearby = api.nearbyReviews(trimmed, excluding)
            val summary = nearby.summary
            when {
                summary != null -> State.Results(Result(nearby.radiiMetres, summary.counts, summary.nearest, summary.locatedCount, summary.totalCount))
                nearby.addressKnown -> State.NoneLocated
                else -> State.NoPosition
            }
        } catch (error: ApiException) {
            Log.i("NearbyReviewsModel", "Nearby reviews did not load: ${error.message}")
            State.Unavailable
        }
        // A newer address replaced this request.
        if (current == generation) state = next
    }

    suspend fun retry() {
        val address = address ?: return
        this.address = null
        load(address)
    }

    companion object {
        /** The API's limit for `address`. */
        const val MAX_ADDRESS_LENGTH = 300
    }
}
