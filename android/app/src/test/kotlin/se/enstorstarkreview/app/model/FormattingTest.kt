package se.enstorstarkreview.app.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test
import se.enstorstarkreview.api.models.Review

/** The display rules of the iOS app and the web, in Swedish. */
class FormattingTest {
    @Test fun stampCountIsTheOverallRatingClampedToThree() {
        mapOf(-1 to 0, 0 to 0, 1 to 1, 2 to 2, 3 to 3, 7 to 3).forEach { (rating, stamps) ->
            assertEquals(stamps, Formatting.stampCount(rating))
        }
    }

    @Test fun stampsAreCountedInWords() {
        assertEquals(listOf("Ingen stämpel", "En stämpel", "Två stämplar", "Tre stämplar"), (0..3).map(Formatting::stamps))
    }

    @Test fun theAwardNamesTheWordAndTheStampsButNeverAScoreOutOfThree() {
        assertEquals("Riktigt bra · två stämplar", Formatting.stampAward(2))
        assertEquals("Inget extra · ingen stämpel", Formatting.stampAward(0))
        assertFalse(Formatting.stampAward(3).contains("av 3"))
        assertEquals("Tre stämplar, Måste upplevas", Formatting.stampAccessibilityLabel(3))
    }

    @Test fun pricesAndBrands() {
        assertEquals("65 kr", Formatting.beerPrice(65, isHappyHour = false))
        assertEquals("65 kr*", Formatting.beerPrice(65, isHappyHour = true))
        assertNull(Formatting.beerPrice(0, isHappyHour = false))
        assertEquals("Öl ej angiven", Formatting.beerBrand("  "))
    }

    @Test fun clPerKrIsVolumeDividedByPriceWithTwoDecimals() {
        assertEquals("0,54 cl/kr", Formatting.clPerKr(volumeCl = 40, priceKr = 74, isHappyHour = false))
        assertEquals("1,32 cl/kr", Formatting.clPerKr(volumeCl = 50, priceKr = 38, isHappyHour = false))
        assertNull(Formatting.clPerKr(volumeCl = 40, priceKr = 74, isHappyHour = true))
        assertNull(Formatting.clPerKr(volumeCl = null, priceKr = 74, isHappyHour = false))
        assertEquals("1,10 cl/kr", Formatting.clPerKr(1.1))
    }

    @Test fun numbersUseSwedishSeparators() {
        assertEquals("6\u00A0953", Formatting.wholeNumber(6953))
        assertEquals("1,2 km", Formatting.distance(kilometres = 1.234))
        assertEquals("0,0 km", Formatting.distance(kilometres = 0.0))
    }

    @Test fun authorsAndDates() {
        assertEquals("Victor, Jonathan & Theo", Formatting.authorList(listOf("victor", "jonathan", "theo")))
        assertEquals("Elias", Formatting.authorList(listOf("elias")))
        assertEquals("26 sep. 2026".replace(".", ""), Formatting.shortDate("2026-09-26T21:05:46.485Z"))
    }

    @Test fun reviewHelpers() {
        val review = ApiJson.decodeFromString<Review>(Fixtures.text("review"))
        assertEquals("Karl Johansgatan 88", review.street)
        assertEquals(listOf("victor", "jonathan", "theo"), review.authorNames)
    }
}
