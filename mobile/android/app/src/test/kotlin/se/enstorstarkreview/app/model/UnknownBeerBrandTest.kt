package se.enstorstarkreview.app.model

import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import se.enstorstarkreview.api.models.Review
import se.enstorstarkreview.api.models.ReviewMetadata

/** The brand is optional, like the web's "Okänd öl": unknown is the default and is sent as null. */
class UnknownBeerBrandTest {
    private val server = MockWebServer()
    private val routes = Routes()
    private lateinit var api: ApiClient
    private val metadata = ApiJson.decodeFromString<ReviewMetadata>(Fixtures.text("review-metadata"))
    private val review = ApiJson.decodeFromString<Review>(Fixtures.text("review"))
    private val slugPath = "/reviews/majornas-bryggeri"

    @Before fun start() {
        server.dispatcher = routes
        server.start()
        api = ApiClient(server.url("/").toString().trimEnd('/'))
    }

    @After fun stop() = server.close()

    private fun editForm(brand: String?) =
        ReviewFormModel(api, metadata, "test", Tagged(review.copy(beer = review.beer.copy(brand = brand)), "\"v2-abc\""))

    private suspend fun savedBeer(form: ReviewFormModel): JsonObject {
        routes.json("PUT $slugPath", Fixtures.text("review"), 200, "ETag", "\"v2-def\"")
        form.submit()
        val request = routes.sent.last { it.method == "PUT" }
        return ApiJson.parseToJsonElement(request.body!!.utf8()).jsonObject.getValue("beer").jsonObject
    }

    @Test fun aNewReviewStartsWithAnUnknownBrand() {
        val form = ReviewFormModel(api, metadata, "test", null)
        assertEquals(ReviewFormModel.UNKNOWN_BRAND, form.draft.brandChoice)
        assertNull(form.brand)
        form.draft = form.draft.copy(priceText = "65")
        assertTrue(form.validate(ReviewWizardStep.Beer))
        assertNull(form.error("/beer/brand"))
    }

    @Test fun aReviewWithoutABrandIsEditedAsUnknown() {
        val form = editForm(null)
        assertEquals(ReviewFormModel.UNKNOWN_BRAND, form.draft.brandChoice)
        assertNull(form.brand)
        assertTrue(form.validate(ReviewWizardStep.Beer))
    }

    /** Omitting `brand` is a 422, so an unknown brand must be sent as null, also when it clears one. */
    @Test fun savingAnUnknownBrandSendsNull() = runTest {
        val form = editForm("Falcon Export")
        assertEquals("Falcon Export", form.draft.brandChoice)
        form.draft = form.draft.copy(brandChoice = ReviewFormModel.UNKNOWN_BRAND)
        val beer = savedBeer(form)
        assertTrue("brand" in beer)
        assertEquals(JsonNull, beer["brand"])
        assertEquals(69, beer.getValue("priceKr").jsonPrimitive.int)
    }

    @Test fun savingAListedBrandSendsItsName() = runTest {
        val form = editForm(null)
        form.draft = form.draft.copy(brandChoice = "Fat21")
        assertEquals("Fat21", savedBeer(form).getValue("brand").jsonPrimitive.content)
    }

    @Test fun anotherBrandNeedsAName() {
        val form = editForm(null)
        form.draft = form.draft.copy(brandChoice = ReviewFormModel.OTHER_BRAND, customBrand = "  ")
        assertFalse(form.validate(ReviewWizardStep.Beer))
        assertEquals("Skriv märkets namn.", form.error("/beer/brand"))
    }

    /** Cards name an unknown beer "Stor stark"; the detail page leaves it out. */
    @Test fun cardsCallAnUnknownBrandStorStark() {
        assertEquals("Stor stark", Formatting.beerBrand(null))
        assertEquals("Stor stark", Formatting.beerBrand("  "))
        assertEquals("Falcon Export", Formatting.beerBrand(" Falcon Export "))
        assertNull(Formatting.knownBeerBrand(null))
        assertNull(Formatting.knownBeerBrand("  "))
        assertEquals("Falcon Export", Formatting.knownBeerBrand(" Falcon Export "))
    }
}
