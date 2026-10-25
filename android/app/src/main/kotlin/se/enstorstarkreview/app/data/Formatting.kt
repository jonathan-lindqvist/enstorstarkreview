package se.enstorstarkreview.app.data

import se.enstorstarkreview.api.models.Review

fun ratingWord(rating: Int) =
    listOf("Inget extra", "Sticker ut", "Riktigt bra", "Måste upplevas")[rating.coerceIn(0, 3)]

fun authorName(name: String) = name.replaceFirstChar { it.titlecase() }

/** `Elias`, `Elias & Theo`, `Elias, Theo & Victor`. */
fun authorList(names: List<String>): String {
    val all = names.map(::authorName)
    if (all.size < 2) return all.firstOrNull().orEmpty()
    return all.dropLast(1).joinToString(", ") + " & " + all.last()
}

val Review.authorNames: List<String>
    get() = (listOf(author) + coAuthors).filter { it.isNotBlank() }.distinct()

/** The street part of the address (before the first comma). */
val Review.street: String
    get() = location.substringBefore(',').trim()

/** The description as one line of plain text, for cards and rows. */
val Review.excerpt: String
    get() = description.lineSequence()
        .map { it.trim().removePrefix("- ").removePrefix("* ").trimStart('#', ' ').replace("**", "") }
        .filter { it.isNotEmpty() }
        .joinToString(" · ")
