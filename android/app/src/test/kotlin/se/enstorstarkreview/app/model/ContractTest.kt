package se.enstorstarkreview.app.model

import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import se.enstorstarkreview.api.models.BarAttributeKey
import se.enstorstarkreview.api.models.BeerInput
import se.enstorstarkreview.api.models.ImageFocus
import se.enstorstarkreview.api.models.MapMarker
import se.enstorstarkreview.api.models.NearbyReviews
import se.enstorstarkreview.api.models.RatingsInput
import se.enstorstarkreview.api.models.Review
import se.enstorstarkreview.api.models.ReviewFields
import se.enstorstarkreview.api.models.ReviewMetadata
import se.enstorstarkreview.api.models.ReviewStatistics

/** The generated models decode real responses, and requests leave out unset fields. */
class ContractTest {
    @Test fun decodesCapturedResponses() {
        val review = ApiJson.decodeFromString<Review>(Fixtures.text("review"))
        assertEquals("majornas-bryggeri", review.slug)
        assertEquals(50, review.beer.volumeCl)
        val metadata = ApiJson.decodeFromString<ReviewMetadata>(Fixtures.text("review-metadata"))
        assertEquals(8, metadata.ratingMetrics.size)
        assertTrue(metadata.barAttributes.any { it.key == BarAttributeKey.quiz })
        val statistics = ApiJson.decodeFromString<ReviewStatistics>(Fixtures.text("statistics"))
        assertEquals(43.5, statistics.beerBrandPrices.first().averagePriceKr, 0.0)
        val nearby = ApiJson.decodeFromString<NearbyReviews>(Fixtures.text("nearby-reviews"))
        assertEquals(listOf(2, 2, 5), nearby.summary?.counts)
    }

    /** `type: [object, 'null']` in the contract; the build patches the generated models. */
    @Test fun nullableInlineObjectsDecodeAsNull() {
        val nearby = ApiJson.decodeFromString<NearbyReviews>("""{"addressKnown":false,"radiiMetres":[250],"summary":null}""")
        assertNull(nearby.summary)
        val marker = ApiJson.decodeFromString<MapMarker>(
            """{"slug":"a","title":"A","overallRating":1,"location":"Gatan 1","latitude":57.7,"longitude":11.9,"beer":null,"attributes":[]}""",
        )
        assertNull(marker.beer)
    }

    /** An omitted slug keeps deriving it, and an omitted image keeps the photo on an edit. */
    @Test fun requestsLeaveOutNullFields() {
        val fields = ReviewFields(
            title = "Bar", description = "Text", location = "Gatan 1",
            ratings = RatingsInput(1, 2, 3, 4, 5, 0, 1, 2),
            beer = BeerInput(brand = "Heineken", priceKr = 70, isHappyHourPrice = false),
            authors = listOf("test"), imageFocus = ImageFocus(50.0, 50.0),
        )
        val json = ApiJson.encodeToJsonElement(ReviewFields.serializer(), fields).jsonObject
        assertFalse("slug" in json)
        assertFalse("overallRating" in json)
        assertFalse("volumeCl" in json.getValue("beer").jsonObject)
        assertEquals(buildJsonObject { put("x", 50.0); put("y", 50.0) }, json["imageFocus"])
    }
}
