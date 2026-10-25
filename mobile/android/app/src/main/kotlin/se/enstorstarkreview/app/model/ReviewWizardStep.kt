package se.enstorstarkreview.app.model

/** The steps of the review wizard, in order. */
enum class ReviewWizardStep(val title: String) {
    Photo("Bild"), Bar("Bar"), Beer("Stor stark"), Ratings("Betyg"), Text("Helhet & text"), Authors("Vem");

    val next: ReviewWizardStep? get() = entries.getOrNull(ordinal + 1)
    val previous: ReviewWizardStep? get() = entries.getOrNull(ordinal - 1)

    companion object {
        /** The step that shows the field of a problem pointer. Null for pointers that no step shows. */
        fun forPointer(pointer: String): ReviewWizardStep? = when {
            pointer.startsWith("/image") -> Photo
            pointer == "/title" || pointer == "/location" || pointer == "/slug" || pointer.startsWith("/attributes") -> Bar
            pointer.startsWith("/beer") -> Beer
            pointer.startsWith("/ratings") -> Ratings
            pointer == "/overallRating" || pointer == "/description" -> Text
            pointer.startsWith("/authors") -> Authors
            else -> null
        }
    }
}
