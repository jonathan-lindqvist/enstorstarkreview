package se.enstorstarkreview.app.model

import mockwebserver3.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import se.enstorstarkreview.api.models.PriceComparisonPoint
import se.enstorstarkreview.api.models.RatingKey
import se.enstorstarkreview.api.models.ReviewMetadata
import se.enstorstarkreview.api.models.ReviewStatistics

/** The Prisvärdhet gates, copied from the web's `src/lib/utils/price-value.ts` with its test cases. */
class PriceValueTest {
    private val statistics = ApiJson.decodeFromString<ReviewStatistics>(Fixtures.text("statistics"))

    @Test fun pricesFor40ClMapToTheGates() {
        for ((price, rating) in listOf(45 to 5, 46 to 4, 63 to 4, 64 to 3, 70 to 3, 71 to 2, 90 to 2, 91 to 1, 104 to 1, 105 to 0)) {
            assertEquals("$price kr", rating, PriceValue.suggest(price, 40)?.rating)
        }
    }

    @Test fun theSuggestionReportsKrPerCl() =
        assertEquals(PriceValue.Suggestion(5, 1.1, false), PriceValue.suggest(55, 50))

    @Test fun aMissingVolumeAssumes40Cl() =
        assertEquals(PriceValue.Suggestion(4, 1.5, true), PriceValue.suggest(60, null))

    @Test fun thereIsNoSuggestionWithoutAValidPriceAndVolume() {
        for ((price, volume) in listOf(null to 40, 0 to 40, 1000 to 40, 60 to 0, 60 to 201)) {
            assertNull("$price kr, $volume cl", PriceValue.suggest(price, volume))
        }
    }

    @Test fun theHintNamesTheRatingAndKrPerCl() {
        assertEquals("Statistiken säger 4 vid 1,38 kr/cl (antar 40 cl).", Formatting.priceValueHint(PriceValue.suggest(55, null)!!))
        assertEquals("Statistiken säger 5 vid 1,10 kr/cl.", Formatting.priceValueHint(PriceValue.suggest(55, 50)!!))
    }

    /** The wizard highlights the suggestion but never sets the rating. */
    @Test fun theFormSuggestsFromItsPriceAndVolumeWithoutChangingTheRating() {
        val metadata = ApiJson.decodeFromString<ReviewMetadata>(Fixtures.text("review-metadata"))
        val server = MockWebServer().apply { start() }
        try {
            val form = ReviewFormModel(ApiClient(server.url("/").toString().trimEnd('/')), metadata, "test", null)
            assertNull(form.priceValueSuggestion)
            form.draft = form.draft.copy(priceText = "55")
            assertEquals(4, form.priceValueSuggestion?.rating)
            form.draft = form.draft.copy(volumeCl = 50)
            assertEquals(5, form.priceValueSuggestion?.rating)
            assertEquals(0, form.draft.rating(RatingKey.price))
        } finally {
            server.close()
        }
    }

    private fun point(title: String, price: Int, volume: Int?, rating: Double?, happyHour: Boolean = false) =
        PriceComparisonPoint(title = title, slug = title, beerPriceKr = price, beerVolumeCl = volume, isHappyHourPrice = happyHour, valueRating = rating)

    @Test fun barsArePlacedInGatesWithTheirRatingDistance() {
        val comparison = PriceValue.compare(listOf(point("Rätt", 55, 40, 4.0), point("Nära", 55, null, 3.0), point("Långt", 110, 40, 2.0)))
        assertEquals(listOf(4 to 0.0, 4 to 1.0, 0 to 2.0), comparison.bars.map { it.gateRating to it.distance })
        assertTrue(comparison.bars[1].assumedVolume)
        assertEquals(PriceValue.Gate(4, 1.15, 1.6, count = 2, exact = 1), comparison.gates.first { it.rating == 4 })
        val last = comparison.gates.last()
        assertEquals(listOf(0, null, 1, 0), listOf(last.rating, last.belowKrPerCl, last.count, last.exact))
    }

    @Test fun happyHourPricesAndUnratedBarsAreLeftOut() {
        val comparison = PriceValue.compare(listOf(point("Happy", 40, 40, 5.0, happyHour = true), point("Ej betygsatt", 40, 40, null)))
        assertTrue(comparison.bars.isEmpty())
    }

    /** The statistics response includes every public priced review; a missing volume is null. */
    @Test fun theStatisticsPointsDecodeAndCompare() {
        val points = statistics.priceComparison
        assertEquals(9, points.size)
        assertNull(points.first { it.slug == "hornan" }.beerVolumeCl)
        assertNull(points.first { it.slug == "granden" }.valueRating)
        val comparison = PriceValue.compare(points)
        assertEquals(7, comparison.bars.size)
        assertEquals(4, comparison.exactCount)
        assertEquals(2, comparison.nearCount)
        assertEquals(1, comparison.farCount)
        assertEquals(listOf(2, 1, 1, 1, 1, 1), comparison.gates.map { it.count })
        assertEquals(listOf(2, 0, 1, 0, 0, 1), comparison.gates.map { it.exact })
    }

    @Test fun gateRangesUseSwedishDecimals() {
        val gates = PriceValue.compare(emptyList()).gates
        assertEquals(6, gates.size)
        assertEquals("under 1,15", Formatting.krPerClRange(gates[0]))
        assertEquals("1,15–1,60", Formatting.krPerClRange(gates[1]))
        assertEquals("från 2,61", Formatting.krPerClRange(gates[5]))
    }

    /** Like the web's chart: the bar, its price and volume, kr/cl, and both ratings. */
    @Test fun eachBarIsDescribedInWords() {
        val bars = PriceValue.compare(statistics.priceComparison).bars
        assertEquals("Silverkällan: 38 kr för 50 cl, 0,76 kr/cl, betyg 5, väntat betyg 5", Formatting.priceValueBar(bars.first { it.point.slug == "silverkallan" }))
        assertEquals("Hörnan: 45 kr för 40 cl (antaget), 1,13 kr/cl, betyg 5, väntat betyg 5", Formatting.priceValueBar(bars.first { it.point.slug == "hornan" }))
    }
}
