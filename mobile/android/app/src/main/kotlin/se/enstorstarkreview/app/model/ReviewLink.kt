package se.enstorstarkreview.app.model

/** The review that a notification opens: the `slug` in its data, passed as an intent extra. */
object ReviewLink {
    const val SLUG_EXTRA = "slug"

    /** Longer than any slug the server makes; anything longer is not ours. */
    private const val MAX_LENGTH = 200

    /** The slug to open, or null for a missing, blank, or overlong value. */
    fun slug(extra: String?): String? = extra?.trim()?.takeIf { it.isNotEmpty() && it.length <= MAX_LENGTH }
}
