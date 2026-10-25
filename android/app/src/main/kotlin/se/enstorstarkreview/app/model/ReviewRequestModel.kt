package se.enstorstarkreview.app.model

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/** State for the "tipsa om en bar" form. */
class ReviewRequestModel(private val api: ApiClient) {
    var barName by mutableStateOf("")
    var location by mutableStateOf("")
    var motivation by mutableStateOf("")
    var isSubmitting by mutableStateOf(false)
        private set

    /** Field messages keyed by JSON Pointer (`/barName`, `/location`, `/motivation`). */
    var fieldErrors by mutableStateOf<Map<String, String>>(emptyMap())
        private set
    var errorMessage by mutableStateOf<String?>(null)
        private set
    var successMessage by mutableStateOf<String?>(null)
        private set

    val canSubmit: Boolean get() = !isSubmitting && barName.isNotBlank() && location.isNotBlank()

    suspend fun submit() {
        if (!canSubmit) return
        isSubmitting = true
        errorMessage = null
        successMessage = null
        try {
            val message = api.submitReviewRequest(barName.trim(), location.trim(), motivation.trim())
            fieldErrors = emptyMap()
            barName = ""
            location = ""
            motivation = ""
            successMessage = message
        } catch (error: ApiException) {
            fieldErrors = (error as? ApiException.Problem)?.problem?.fieldErrors.orEmpty()
            errorMessage = error.message
        } finally {
            isSubmitting = false
        }
    }
}
