package se.enstorstarkreview.app.model

import java.text.NumberFormat
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale
import se.enstorstarkreview.api.models.PublicationStatus
import se.enstorstarkreview.api.models.RatingKey
import se.enstorstarkreview.api.models.Ratings
import se.enstorstarkreview.api.models.Review

/** Display rules. They match the iOS app and the web (src/lib/utils/price.ts, authors.ts, beer-brands.ts). */
object Formatting {
    val swedish: Locale = Locale.forLanguageTag("sv-SE")
    const val UNKNOWN_BEER_BRAND = "Öl ej angiven"
    const val HAPPY_HOUR_NOTE = "* happy hour"

    /** `65 kr`, or `65 kr*` for a happy-hour price. Null when the price is missing or invalid. */
    fun beerPrice(priceKr: Int?, isHappyHour: Boolean): String? =
        priceKr?.takeIf { it in 1..999 }?.let { "$it kr${if (isHappyHour) "*" else ""}" }

    fun beerBrand(brand: String?): String = brand?.trim()?.takeIf { it.isNotEmpty() } ?: UNKNOWN_BEER_BRAND

    /** Volume per krona, `0,54 cl/kr`. Null without volume or price, and for happy hour prices. */
    fun clPerKr(volumeCl: Int?, priceKr: Int?, isHappyHour: Boolean): String? {
        if (volumeCl == null || priceKr == null || priceKr <= 0 || isHappyHour) return null
        return clPerKr(volumeCl.toDouble() / priceKr)
    }

    /** `0,77 cl/kr`, like the web's formatClPerKr. */
    fun clPerKr(value: Double): String = "${decimal(value, 2, 2)} cl/kr"

    /** `1,2 km`, like the web's formatDistanceKm. */
    fun distance(kilometres: Double): String = "${decimal(kilometres, 1, 1)} km"

    /** `6 953`, with Swedish thousands separators. */
    fun wholeNumber(value: Int): String = decimal(value.toDouble(), 0, 0)

    /** The word for an overall rating (0–3), as on the about page of the web. */
    fun ratingWord(rating: Int): String = listOf("Inget extra", "Sticker ut", "Riktigt bra", "Måste upplevas")[rating.coerceIn(0, 3)]

    /** The overall rating (0–3) is shown as 0–3 stamps of excellence, never as "x av 3". */
    fun stampCount(rating: Int): Int = rating.coerceIn(0, 3)

    fun stamps(rating: Int): String = listOf("Ingen stämpel", "En stämpel", "Två stämplar", "Tre stämplar")[stampCount(rating)]

    /** "Riktigt bra · två stämplar" */
    fun stampAward(rating: Int): String = "${ratingWord(rating)} · ${stamps(rating).lowercase(swedish)}"

    /** "Tre stämplar, Måste upplevas" */
    fun stampAccessibilityLabel(rating: Int): String = "${stamps(rating)}, ${ratingWord(rating)}"

    fun ratingExplanation(rating: Int): String =
        listOf("Inget extra.", "Sticker ut lite från mängden.", "Riktigt bra.", "Måste upplevas. Väldigt sällsynt.")[rating.coerceIn(0, 3)]

    fun authorName(name: String): String = name.replaceFirstChar { it.titlecase(swedish) }

    /** "Victor, Jonathan & Theo" */
    fun authorList(names: List<String>): String {
        val all = names.map(::authorName)
        if (all.size < 2) return all.firstOrNull().orEmpty()
        return all.dropLast(1).joinToString(", ") + " & " + all.last()
    }

    /** `27 sep 2026` */
    fun shortDate(iso: String): String = format(iso, DateTimeFormatter.ofPattern("d MMM yyyy", swedish)).replace(".", "")

    /** `26 september 2026` */
    fun date(iso: String): String = format(iso, DateTimeFormatter.ofLocalizedDate(FormatStyle.LONG).withLocale(swedish))

    /** `26 september 2026 23:05` */
    fun dateTime(iso: String): String = format(iso, DateTimeFormatter.ofPattern("d MMMM yyyy HH:mm", swedish))

    private fun format(iso: String, formatter: DateTimeFormatter): String =
        runCatching { formatter.withZone(ZoneId.systemDefault()).format(Instant.parse(iso)) }.getOrDefault(iso)

    /** A number with a Swedish decimal comma. */
    fun decimal(value: Double, minimumFractionDigits: Int = 0, maximumFractionDigits: Int = 1): String =
        NumberFormat.getNumberInstance(swedish).apply {
            this.minimumFractionDigits = minimumFractionDigits
            this.maximumFractionDigits = maximumFractionDigits
        }.format(value)
}

/** The rating (0–5) for one aspect. */
fun Ratings.value(key: RatingKey): Double = when (key) {
    RatingKey.atmosphere -> atmosphere
    RatingKey.service -> service
    RatingKey.selection -> selection
    RatingKey.quality -> quality
    RatingKey.price -> price
    RatingKey.cleanliness -> cleanliness
    RatingKey.soundLevel -> soundLevel
    RatingKey.barhopPotential -> barhopPotential
}

val Review.isDraft: Boolean get() = publicationStatus == PublicationStatus.draft

/** The primary author first, then the co-authors, without duplicates or empty names. */
val Review.authorNames: List<String> get() = (listOf(author) + coAuthors).filter { it.isNotEmpty() }.distinct()

/** The description as one line of plain text, for cards and rows. */
val Review.excerpt: String get() = ReviewMarkdown.plainText(description)

/** The street part of the address (before the first comma). */
val Review.street: String get() = location.substringBefore(',').trim()

val Review.beerBrandText: String get() = Formatting.beerBrand(beer.brand)
