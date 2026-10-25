package se.enstorstarkreview.app.model

import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.serialization.Serializable
import se.enstorstarkreview.api.models.BarAttributeKey
import se.enstorstarkreview.api.models.BeerInput
import se.enstorstarkreview.api.models.ImageContentType
import se.enstorstarkreview.api.models.ImageFocus
import se.enstorstarkreview.api.models.RatingKey
import se.enstorstarkreview.api.models.RatingsInput
import se.enstorstarkreview.api.models.Review
import se.enstorstarkreview.api.models.ReviewFields
import se.enstorstarkreview.api.models.ReviewMetadata

/** The editable fields of a review, as the form shows them. */
@Serializable
data class ReviewDraft(
    val title: String = "",
    val description: String = "",
    val location: String = "",
    /** Empty means "derive from the title" (create) or "keep deriving" (edit). */
    val slug: String = "",
    val ratings: Map<RatingKey, Int> = RatingKey.entries.associateWith { 0 },
    /** Null means "use the suggestion from the aspect ratings". */
    val overallRating: Int? = null,
    /** A listed brand, [ReviewFormModel.OTHER_BRAND], or empty (nothing chosen). */
    val brandChoice: String = "",
    val customBrand: String = "",
    val priceText: String = "",
    val isHappyHourPrice: Boolean = false,
    /** Serving size in centilitres. Null means unknown. */
    val volumeCl: Int? = null,
    val attributes: Set<BarAttributeKey> = emptySet(),
    val authors: Set<String> = emptySet(),
    val focusX: Double = 50.0,
    val focusY: Double = 50.0,
) {
    /** The price as a number. Null when the text is empty or not a whole number. */
    val priceKr: Int? get() = priceText.trim().toIntOrNull()

    fun rating(key: RatingKey): Int = ratings[key] ?: 0
}

/**
 * State and rules for creating a draft or editing a review.
 *
 * The server validates everything. This model only checks what it must before it can build a
 * request (a whole-number price, a brand, an author, a photo on create), and shows server errors
 * next to the field that the problem pointer names.
 */
class ReviewFormModel(
    private val api: ApiClient,
    val metadata: ReviewMetadata,
    /** The signed-in reviewer. */
    val currentUser: String?,
    editing: Tagged<Review>?,
    localStore: UnsavedReviewStore? = null,
) {
    sealed interface Mode {
        data object Create : Mode
        data class Edit(val slug: String, val eTag: String) : Mode
    }

    var mode: Mode by mutableStateOf(Mode.Create)
        private set
    var draft by mutableStateOf(ReviewDraft())

    /** Author checklist order: the signed-in user, existing credits, then everyone else. */
    var authorOptions by mutableStateOf<List<String>>(emptyList())
        private set

    /** The current photo of an edited review. A new photo replaces it. */
    val existingImagePath: String?

    /** True for a new review and for an edited draft. */
    val isDraft: Boolean
    var newImage by mutableStateOf<ImageUploadData?>(null)
        private set

    /** The bytes of [newImage], so a view can show it. */
    val newImageData: ByteArray? get() = newImage?.bytes

    /** True when the form started from a local copy of unsaved work. */
    var restoredFromLocalCopy by mutableStateOf(false)
        private set

    /** The wizard step of the local copy. */
    var restoredStep by mutableStateOf<ReviewWizardStep?>(null)
        private set
    var isSubmitting by mutableStateOf(false)
        private set
    var isReloading by mutableStateOf(false)
        private set
    var fieldErrors by mutableStateOf<Map<String, String>>(emptyMap())
        private set
    var errorMessage by mutableStateOf<String?>(null)
        private set

    /** True after a 412 or `concurrent_update`: someone else saved first. */
    var needsReload by mutableStateOf(false)
        private set

    private var initialDraft: ReviewDraft
    private var existingCredits: List<String>

    /** Only new reviews keep a local copy. */
    private val localStore: UnsavedReviewStore? = if (editing == null) localStore else null
    private var localImageIsSaved = false

    init {
        val eTag = editing?.eTag
        if (editing != null && eTag != null) {
            val review = editing.value
            mode = Mode.Edit(review.slug, eTag)
            existingImagePath = review.image.url
            isDraft = review.isDraft
            existingCredits = listOf(review.author) + review.coAuthors
            draft = draft(review, metadata, currentUser)
        } else {
            existingImagePath = null
            isDraft = true
            existingCredits = emptyList()
            draft = ReviewDraft(authors = setOfNotNull(currentUser))
        }
        initialDraft = draft
        authorOptions = authorOptions(currentUser, existingCredits, emptyList())
        restoreLocalCopy()
    }

    val isEditing: Boolean get() = mode != Mode.Create
    val hasChanges: Boolean get() = draft != initialDraft || newImage != null

    /** The slug of the edited review, null for a new one. */
    val editedSlug: String? get() = (mode as? Mode.Edit)?.slug

    /** True for a review that exists on the server. */
    val canDelete: Boolean get() = mode is Mode.Edit

    /** The weighted sum of the aspect ratings. */
    val weightedScore: Double get() = metadata.ratingMetrics.sumOf { it.weight * draft.rating(it.key) }

    /** The highest overall rating whose threshold the weighted score reaches. */
    val suggestedOverallRating: Int
        get() = metadata.overallRating.thresholds.filter { it.minimumWeightedScore <= weightedScore }.maxOfOrNull { it.rating }
            ?: metadata.overallRating.minimum

    val effectiveOverallRating: Int get() = draft.overallRating ?: suggestedOverallRating

    /** The chosen brand: a listed brand or the custom name. */
    val brand: String get() = (if (draft.brandChoice == OTHER_BRAND) draft.customBrand else draft.brandChoice).trim()

    /** The field message for the first pointer that has one. */
    fun error(vararg pointers: String): String? = pointers.firstNotNullOfOrNull { fieldErrors[it] }

    /** Field messages that no form field shows. */
    val unplacedErrors: List<String>
        get() = fieldErrors.filterKeys { it !in placedPointers && !it.startsWith("/ratings/") }.toSortedMap().values.toList()

    // Wizard

    /** The first step that shows a field error. */
    val firstStepWithError: ReviewWizardStep? get() = fieldErrors.keys.mapNotNull(ReviewWizardStep::forPointer).minOrNull()

    /** True when a field of the step has an error. */
    fun hasErrors(step: ReviewWizardStep): Boolean = fieldErrors.keys.any { ReviewWizardStep.forPointer(it) == step }

    /**
     * Checks the fields of one step and shows their problems. Returns true when the step is
     * complete. The server checks everything again when the review is saved.
     */
    fun validate(step: ReviewWizardStep): Boolean {
        val problems = problems(step)
        fieldErrors = fieldErrors.filterKeys { ReviewWizardStep.forPointer(it) != step } + problems
        if (problems.isEmpty() && fieldErrors.isEmpty()) errorMessage = null
        return problems.isEmpty()
    }

    /** True when the step has no local problems. It does not change the shown errors. */
    fun isComplete(step: ReviewWizardStep): Boolean = problems(step).isEmpty()

    /** Clears the shown error of one field, for example while the reviewer corrects it. */
    fun clearError(pointer: String) {
        if (pointer in fieldErrors) fieldErrors = fieldErrors - pointer
    }

    private fun problems(step: ReviewWizardStep): Map<String, String> {
        val limits = metadata.limits
        val problems = mutableMapOf<String, String>()
        when (step) {
            ReviewWizardStep.Photo -> if (mode == Mode.Create && newImage == null) problems["/image"] = "Ta eller välj en bild."
            ReviewWizardStep.Bar -> {
                when {
                    draft.title.isBlank() -> problems["/title"] = "Skriv barens namn."
                    draft.title.length > limits.titleMaxLength -> problems["/title"] = "Namnet får vara högst ${limits.titleMaxLength} tecken."
                }
                when {
                    draft.location.isBlank() -> problems["/location"] = "Skriv adressen."
                    draft.location.length > limits.locationMaxLength -> problems["/location"] = "Adressen får vara högst ${limits.locationMaxLength} tecken."
                }
            }
            ReviewWizardStep.Beer -> {
                val price = draft.priceKr
                when {
                    price == null -> problems["/beer/priceKr"] = "Välj priset i hela kronor."
                    price < limits.beerPriceMinKr || price > limits.beerPriceMaxKr ->
                        problems["/beer/priceKr"] = "Priset ska vara mellan ${limits.beerPriceMinKr} och ${limits.beerPriceMaxKr} kr."
                }
                val volume = draft.volumeCl
                if (volume != null && (volume < limits.beerVolumeMinCl || volume > limits.beerVolumeMaxCl)) {
                    problems["/beer/volumeCl"] = "Ange volymen i hela centiliter, mellan ${limits.beerVolumeMinCl} och ${limits.beerVolumeMaxCl} cl."
                }
                when {
                    brand.isEmpty() -> problems["/beer/brand"] = "Välj ett ölmärke eller skriv ett eget."
                    brand.length > limits.beerBrandMaxLength -> problems["/beer/brand"] = "Märket får vara högst ${limits.beerBrandMaxLength} tecken."
                }
            }
            ReviewWizardStep.Ratings -> Unit
            ReviewWizardStep.Text -> when {
                draft.description.isBlank() -> problems["/description"] = "Skriv några rader om baren."
                draft.description.length > limits.descriptionMaxLength -> problems["/description"] = "Texten får vara högst ${limits.descriptionMaxLength} tecken."
            }
            ReviewWizardStep.Authors -> if (authorOptions.none { it in draft.authors }) problems["/authors"] = "Välj minst en författare."
        }
        return problems
    }

    // Local copy

    /** Keeps a local copy of a new review. [step] is the open wizard step. */
    fun saveLocalCopy(step: ReviewWizardStep) {
        val store = localStore ?: return
        val user = currentUser ?: return
        if (!hasChanges) return
        val image = if (localImageIsSaved) null else newImageData
        store.save(UnsavedReview(user, draft, step.ordinal, newImageData != null), image)
        localImageIsSaved = newImageData != null
    }

    /** Removes the local copy, for example when the reviewer discards the review. */
    fun discardLocalCopy() {
        localStore?.clear()
        localImageIsSaved = false
    }

    private fun restoreLocalCopy() {
        val user = currentUser ?: return
        val (saved, image) = localStore?.load(user) ?: return
        draft = saved.draft
        if (image != null) {
            newImage = ImageUploadData(image, ImageContentType.imageSlashJpeg.value)
            localImageIsSaved = true
        }
        restoredStep = ReviewWizardStep.entries.getOrNull(saved.step)
        restoredFromLocalCopy = true
    }

    /** Starts again with an empty review, and removes the local copy. */
    fun startOver() {
        discardLocalCopy()
        draft = initialDraft
        newImage = null
        fieldErrors = emptyMap()
        errorMessage = null
        restoredFromLocalCopy = false
        restoredStep = null
    }

    /** Loads all reviewers for the checklist. Without them, it still has the user and the credits. */
    suspend fun loadAuthors() {
        try {
            authorOptions = authorOptions(currentUser, existingCredits, api.users())
        } catch (error: ApiException) {
            Log.i("ReviewFormModel", "Could not load reviewers: ${error.message}")
        }
    }

    /** Sets a new photo. The caller converts it to JPEG, PNG, or WebP first. */
    fun setImage(data: ByteArray, contentType: ImageContentType) {
        fieldErrors = fieldErrors - "/image" - "/image/data"
        if (data.size > metadata.limits.imageMaxBytes) {
            newImage = null
            fieldErrors = fieldErrors + ("/image" to "Bilden är för stor.")
            return
        }
        newImage = ImageUploadData(data, contentType.value)
        localImageIsSaved = false
    }

    /** Saves. Returns the saved review, or null when the form shows an error. */
    suspend fun submit(): Tagged<Review>? {
        if (isSubmitting) return null
        val fields = validatedFields() ?: return null
        isSubmitting = true
        errorMessage = null
        fieldErrors = emptyMap()
        needsReload = false
        return try {
            when (val mode = mode) {
                Mode.Create -> {
                    val image = newImage ?: return null
                    api.createReview(fields, image).also { discardLocalCopy() }
                }
                is Mode.Edit -> api.updateReview(mode.slug, mode.eTag, fields, newImage)
            }
        } catch (error: ApiException) {
            error.problemOrNull?.let { problem ->
                fieldErrors = problem.fieldErrors
                needsReload = problem.isConflict
            }
            errorMessage = error.message
            null
        } finally {
            isSubmitting = false
        }
    }

    /** Deletes the version this form was read from. Returns true when the review is gone. */
    suspend fun delete(): Boolean {
        val mode = mode as? Mode.Edit ?: return false
        if (isSubmitting) return false
        isSubmitting = true
        errorMessage = null
        needsReload = false
        return try {
            api.deleteReview(mode.slug, mode.eTag)
            true
        } catch (error: ApiException) {
            val problem = error.problemOrNull
            // Someone else deleted it first: the review is gone either way.
            if (problem?.code == "not_found") return true
            needsReload = problem?.isConflict ?: false
            errorMessage = error.message
            false
        } finally {
            isSubmitting = false
        }
    }

    /** After a conflict: loads the latest version and replaces the fields. A newly chosen photo stays. */
    suspend fun reloadLatest() {
        val mode = mode as? Mode.Edit ?: return
        isReloading = true
        try {
            val latest = api.review(mode.slug)
            val eTag = latest.eTag ?: return
            this.mode = Mode.Edit(latest.value.slug, eTag)
            existingCredits = listOf(latest.value.author) + latest.value.coAuthors
            draft = draft(latest.value, metadata, currentUser)
            initialDraft = draft
            fieldErrors = emptyMap()
            errorMessage = null
            needsReload = false
            loadAuthors()
        } catch (error: ApiException) {
            errorMessage = error.message
        } finally {
            isReloading = false
        }
    }

    // Building the request

    private fun validatedFields(): ReviewFields? {
        val errors = mutableMapOf<String, String>()
        ReviewWizardStep.entries.forEach { step -> problems(step).forEach { (pointer, message) -> errors.putIfAbsent(pointer, message) } }
        val price = draft.priceKr
        if (errors.isNotEmpty() || price == null) {
            fieldErrors = errors
            errorMessage = "Kontrollera de markerade fälten."
            return null
        }
        val slug = draft.slug.trim()
        return ReviewFields(
            title = draft.title,
            description = draft.description,
            location = draft.location,
            slug = slug.ifEmpty { null },
            ratings = RatingsInput(
                atmosphere = draft.rating(RatingKey.atmosphere), service = draft.rating(RatingKey.service),
                selection = draft.rating(RatingKey.selection), quality = draft.rating(RatingKey.quality),
                price = draft.rating(RatingKey.price), cleanliness = draft.rating(RatingKey.cleanliness),
                soundLevel = draft.rating(RatingKey.soundLevel), barhopPotential = draft.rating(RatingKey.barhopPotential),
            ),
            overallRating = draft.overallRating,
            beer = BeerInput(brand = brand, priceKr = price, isHappyHourPrice = draft.isHappyHourPrice, volumeCl = draft.volumeCl),
            // Always the full selection, in metadata order: an empty list removes all attributes on an edit.
            attributes = metadata.barAttributes.map { it.key }.filter { it in draft.attributes }.toCollection(LinkedHashSet()),
            authors = authorOptions.filter { it in draft.authors },
            imageFocus = ImageFocus(Math.round(draft.focusX).toDouble(), Math.round(draft.focusY).toDouble()),
        )
    }

    companion object {
        /** The picker value for "another brand". */
        const val OTHER_BRAND = "__other__"

        /** One-tap serving sizes in the beer step. Other sizes are typed. */
        val VOLUME_QUICK_PICKS = listOf(33, 40, 50, 60)

        private val placedPointers = setOf(
            "/title", "/description", "/location", "/slug", "/overallRating", "/beer/brand", "/beer/priceKr", "/beer/volumeCl",
            "/beer/isHappyHourPrice", "/authors", "/image", "/image/data", "/image/contentType", "/imageFocus", "/imageFocus/x",
            "/imageFocus/y", "/attributes",
        )

        fun draft(review: Review, metadata: ReviewMetadata, currentUser: String?): ReviewDraft {
            val brand = review.beer.brand?.trim().orEmpty()
            val listed = brand in metadata.beerBrands
            return ReviewDraft(
                title = review.title,
                description = review.description,
                location = review.location,
                // Send the current slug, or the server derives a new one from the title.
                slug = review.slug,
                ratings = RatingKey.entries.associateWith { Math.round(review.ratings.value(it)).toInt() },
                overallRating = review.overallRating,
                brandChoice = if (brand.isEmpty()) "" else if (listed) brand else OTHER_BRAND,
                customBrand = if (brand.isNotEmpty() && !listed) brand else "",
                priceText = review.beer.priceKr?.toString().orEmpty(),
                isHappyHourPrice = review.beer.isHappyHourPrice,
                volumeCl = review.beer.volumeCl,
                attributes = review.attributes,
                // The editor is selected by default, like on the web. They can opt out.
                authors = (listOf(review.author) + review.coAuthors + listOfNotNull(currentUser)).toSet(),
                focusX = review.image.focusX,
                focusY = review.image.focusY,
            )
        }

        fun authorOptions(currentUser: String?, credits: List<String>, users: List<String>): List<String> =
            (listOfNotNull(currentUser) + credits + users).filter { it.isNotEmpty() }.distinct()
    }
}
