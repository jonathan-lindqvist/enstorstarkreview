package se.enstorstarkreview.app.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import se.enstorstarkreview.api.models.ReviewStatistics

class StatisticsTest {
    private val statistics = ApiJson.decodeFromString<ReviewStatistics>(Fixtures.text("statistics"))

    /** Like the web's brand table: prices for every brand, cl/kr where a volume was given. */
    @Test fun brandRowsJoinPricesAndValues() {
        val rows = BeerBrandRow.rows(statistics, BeerBrandRow.Sort.Price)
        assertEquals(statistics.beerBrandPrices.size, rows.size)
        val falcon = rows.first { it.brand == "Falcon Export" }
        assertEquals(43.5, falcon.averagePriceKr, 0.0)
        assertEquals(2, falcon.priceCount)
        assertEquals(1.1, falcon.averageClPerKr!!, 0.0)
        assertEquals(2, falcon.valueCount)
        val unknown = rows.first { it.brand == "Budvar" }
        assertNull(unknown.averageClPerKr)
        assertEquals(0, unknown.valueCount)
    }

    /** Cheapest first, ties by Swedish name order (the web's default). */
    @Test fun priceSortIsCheapestFirst() {
        val rows = BeerBrandRow.rows(statistics, BeerBrandRow.Sort.Price)
        assertEquals("Falcon Export", rows.first().brand)
        assertEquals("Åbro Original", rows.last().brand)
        assertEquals(listOf("Heineken", "San Miguel"), rows.filter { it.averagePriceKr == 80.5 }.map { it.brand })
    }

    /** Most beer per krona first, brands without a volume last. */
    @Test fun valueSortIsMostBeerFirstWithUnknownLast() {
        val rows = BeerBrandRow.rows(statistics, BeerBrandRow.Sort.Value)
        assertEquals(listOf("Falcon Export", "Heineken", "Åbro Original"), rows.take(3).map { it.brand })
        assertTrue(rows.drop(3).all { it.averageClPerKr == null })
        assertEquals("Budvar", rows.drop(3).first().brand)
    }

    /** Swedish order puts Å after Z. */
    @Test fun nameSortUsesSwedishOrder() {
        val rows = BeerBrandRow.rows(statistics, BeerBrandRow.Sort.Name)
        assertEquals("Budvar", rows.first().brand)
        assertEquals("Åbro Original", rows.last().brand)
        assertTrue(rows.indexOfFirst { it.brand == "Zlatopramen" } < rows.indexOfFirst { it.brand == "Åbro Original" })
    }
}
