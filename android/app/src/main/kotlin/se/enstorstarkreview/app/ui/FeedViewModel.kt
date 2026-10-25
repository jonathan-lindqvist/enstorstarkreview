package se.enstorstarkreview.app.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import se.enstorstarkreview.api.models.Review
import se.enstorstarkreview.api.models.ReviewSort
import se.enstorstarkreview.app.data.Api

data class FeedState(
    val sort: ReviewSort = ReviewSort.latest,
    val reviews: List<Review> = emptyList(),
    val loading: Boolean = true,
    val error: String? = null,
)

class FeedViewModel : ViewModel() {
    private val _state = MutableStateFlow(FeedState())
    val state: StateFlow<FeedState> = _state

    init { load() }

    fun select(sort: ReviewSort) {
        if (sort == _state.value.sort) return
        _state.update { it.copy(sort = sort) }
        load()
    }

    fun load() {
        val sort = _state.value.sort
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            runCatching { Api.listReviews(sort) }
                .onSuccess { list -> _state.update { it.copy(reviews = list, loading = false) } }
                .onFailure { e -> _state.update { it.copy(loading = false, error = "Kunde inte hämta recensionerna.") }; e.printStackTrace() }
        }
    }
}
