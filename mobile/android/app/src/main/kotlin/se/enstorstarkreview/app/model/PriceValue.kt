package se.enstorstarkreview.app.model

import kotlin.math.abs
import se.enstorstarkreview.api.models.PriceComparisonPoint

/**
 * The Prisvärdhet gates: which value rating a price per centilitre suggests.
 *
 * A copy of the web's `src/lib/utils/price-value.ts`; the API sends no gates, so change both apps
 * and the web together. The suggestion only highlights a value and never sets the rating.
 */
object PriceValue {
    /** The volume to assume when a review has none. */
    const val ASSUMED_VOLUME_CL = 40

    /** Upper kr/cl limits, exclusive, from the best rating down. Above the last one the rating is 0. */
    private val gates = listOf(5 to 1.15, 4 to 1.6, 3 to 1.755, 2 to 2.255, 1 to 2.605)
    private const val MOST_EXPENSIVE_RATING = 0

    data class Suggestion(val rating: Int, val krPerCl: Double, val assumedVolume: Boolean)

    /** A rated regular price placed in its gate. */
    data class Bar(
        val point: PriceComparisonPoint,
        val krPerCl: Double,
        val gateRating: Int,
        val valueRating: Double,
        /** How far the rating is from the gate's rating. */
        val distance: Double,
        val assumedVolume: Boolean,
    )

    /** [belowKrPerCl] is null for the most expensive gate; [exact] counts bars rated as the gate. */
    data class Gate(val rating: Int, val fromKrPerCl: Double, val belowKrPerCl: Double?, val count: Int, val exact: Int)

    /** [gates] go from rating 5 down to 0. */
    data class Comparison(val bars: List<Bar>, val gates: List<Gate>) {
        val exactCount: Int get() = bars.count { it.distance == 0.0 }
        val nearCount: Int get() = bars.count { it.distance == 1.0 }
        val farCount: Int get() = bars.count { it.distance >= 2.0 }
    }

    /** Null without a whole-krona price (1–999) or with a volume outside 1–200 cl. */
    fun suggest(priceKr: Int?, volumeCl: Int?): Suggestion? {
        if (priceKr == null || priceKr !in 1..999) return null
        val volume = volumeCl ?: ASSUMED_VOLUME_CL
        if (volume !in 1..200) return null
        val krPerCl = priceKr.toDouble() / volume
        val rating = gates.firstOrNull { krPerCl < it.second }?.first ?: MOST_EXPENSIVE_RATING
        return Suggestion(rating, krPerCl, volumeCl == null)
    }

    /**
     * The gates against the actual ratings. Happy hour prices and unrated bars are left out,
     * because the gates are fitted to regular prices.
     */
    fun compare(points: List<PriceComparisonPoint>): Comparison {
        val bars = points.mapNotNull { point ->
            val rating = point.valueRating ?: return@mapNotNull null
            if (point.isHappyHourPrice) return@mapNotNull null
            val suggestion = suggest(point.beerPriceKr, point.beerVolumeCl) ?: return@mapNotNull null
            Bar(point, suggestion.krPerCl, suggestion.rating, rating, abs(suggestion.rating - rating), suggestion.assumedVolume)
        }
        val limits = listOf(0.0) + gates.map { it.second } + listOf(null)
        val ratings = gates.map { it.first } + MOST_EXPENSIVE_RATING
        val summaries = ratings.mapIndexed { index, rating ->
            val inGate = bars.filter { it.gateRating == rating }
            Gate(rating, limits[index] ?: 0.0, limits[index + 1], inGate.size, inGate.count { it.distance == 0.0 })
        }
        return Comparison(bars, summaries)
    }
}
