package se.enstorstarkreview.app.model

import java.text.Collator
import se.enstorstarkreview.api.models.ReviewStatistics

/** A row in the per-brand table: regular prices for every brand, cl/kr where a volume was given. */
data class BeerBrandRow(
    val brand: String,
    val averagePriceKr: Double,
    val priceCount: Int,
    val averageClPerKr: Double?,
    val valueCount: Int,
) {
    /** The web's sort columns with their default directions. */
    enum class Sort { Price, Value, Name }

    companion object {
        fun rows(statistics: ReviewStatistics, sort: Sort): List<BeerBrandRow> {
            val values = statistics.beerBrandValues.associateBy { it.brand }
            val rows = statistics.beerBrandPrices.map { price ->
                val value = values[price.brand]
                BeerBrandRow(price.brand, price.averagePriceKr, price.reviewCount, value?.averageClPerKr, value?.reviewCount ?: 0)
            }
            val collator = Collator.getInstance(Formatting.swedish)
            val byName = Comparator<BeerBrandRow> { first, second -> collator.compare(first.brand, second.brand) }
            val order = when (sort) {
                Sort.Name -> byName
                Sort.Price -> compareBy<BeerBrandRow> { it.averagePriceKr }.then(byName)
                // Most beer per krona first; brands without a volume last.
                Sort.Value -> compareBy<BeerBrandRow, Double?>(nullsLast(reverseOrder())) { it.averageClPerKr }.then(byName)
            }
            return rows.sortedWith(order)
        }
    }
}
