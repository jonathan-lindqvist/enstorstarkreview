package se.enstorstarkreview.app.model

import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/**
 * Loads one value from the API and keeps the last value, the loading flag, and the last error.
 * A failed reload keeps the old value, so a screen does not go blank on a network error.
 */
class Loader<T>(initialValue: T? = null, private val fetch: suspend () -> T) {
    var value by mutableStateOf(initialValue)
        private set
    var isLoading by mutableStateOf(false)
        private set
    var errorMessage by mutableStateOf<String?>(null)
        private set
    private var generation = 0

    suspend fun load() {
        // Only the most recently started load may write its result. An older request that
        // finishes later (for example one without the new token) must not replace it.
        val current = ++generation
        isLoading = true
        try {
            val result = fetch()
            if (current != generation) return
            value = result
            errorMessage = null
        } catch (error: ApiException) {
            if (current != generation) return
            Log.e("Loader", "Load failed: ${error.message}")
            errorMessage = error.message
        } finally {
            if (current == generation) isLoading = false
        }
    }

    /** Replaces the value, for example with the response of a write request. */
    fun replace(value: T) {
        generation++
        this.value = value
        isLoading = false
        errorMessage = null
    }

    /** Loads only when there is no value yet. */
    suspend fun loadIfNeeded() {
        if (value == null && !isLoading) load()
    }
}
