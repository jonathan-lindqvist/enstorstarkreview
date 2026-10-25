package se.enstorstarkreview.app.model

import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.int
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import okhttp3.Headers.Companion.headersOf
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test
import se.enstorstarkreview.api.models.BeerInput
import se.enstorstarkreview.api.models.ImageFocus
import se.enstorstarkreview.api.models.RatingsInput
import se.enstorstarkreview.api.models.ReviewFields

class ApiClientTest {
    private val server = MockWebServer()
    private lateinit var api: ApiClient

    @Before fun start() {
        server.start()
        api = ApiClient(server.url("/").toString().trimEnd('/'))
    }

    @After fun stop() = server.close()

    private fun json(body: String, code: Int = 200, vararg headers: String) =
        MockResponse.Builder().code(code).headers(headersOf("Content-Type", "application/json", *headers)).body(body).build()

    private fun problem(code: Int, problemCode: String, detail: String = "Fel", errors: String = "") =
        MockResponse.Builder().code(code).headers(headersOf("Content-Type", "application/problem+json"))
            .body("""{"type":"about:blank","title":"Fel","status":$code,"code":"$problemCode","detail":"$detail"$errors}""").build()

    private val fields = ReviewFields(
        title = "Bar", description = "Text", location = "Gatan 1", ratings = RatingsInput(1, 2, 3, 4, 5, 0, 1, 2),
        beer = BeerInput(brand = "Heineken", priceKr = 70, isHappyHourPrice = false),
        authors = listOf("test"), imageFocus = ImageFocus(50.0, 50.0),
    )

    @Test fun readerRequestsSendNoToken() = runTest {
        server.enqueue(json(Fixtures.text("review-metadata")))
        api.reviewMetadata()
        assertNull(server.takeRequest().headers["Authorization"])
    }

    @Test fun signedInRequestsSendTheBearerToken() = runTest {
        api.token = "secret"
        server.enqueue(json(Fixtures.text("review-metadata")))
        api.reviewMetadata()
        assertEquals("Bearer secret", server.takeRequest().headers["Authorization"])
    }

    /** A 401 means the token is no longer valid: the app falls back to reader mode. */
    @Test fun aRejectedTokenIsClearedAndReported() = runTest {
        var expired = 0
        api.token = "old"
        api.onUnauthorized = { expired++ }
        server.enqueue(problem(401, "unauthorized"))
        runCatching { api.users() }
        assertNull(api.token)
        assertEquals(1, expired)
    }

    /** A late 401 from an old session must not sign out a new one. */
    @Test fun aLate401ForAnOldTokenKeepsTheNewOne() = runTest {
        api.token = "old"
        server.enqueue(problem(401, "unauthorized"))
        val tokens = api.tokens
        tokens.expire(sentToken = "other")
        assertEquals("old", api.token)
    }

    @Test fun problemDetailsBecomeSwedishErrorsWithFieldMessages() = runTest {
        api.token = "t"
        server.enqueue(problem(422, "validation_failed", "Kontrollera fälten.", ""","errors":[{"pointer":"/beer/priceKr","detail":"För dyrt"}]"""))
        try {
            api.createReview(fields, ImageUploadData(byteArrayOf(1), "image/jpeg"))
            fail("Expected a problem")
        } catch (error: ApiException.Problem) {
            assertEquals("Kontrollera fälten.", error.message)
            assertEquals("validation_failed", error.problem.code)
            assertEquals(mapOf("/beer/priceKr" to "För dyrt"), error.problem.fieldErrors)
        }
    }

    @Test fun anUnreachableServerIsATransportError() = runTest {
        server.close()
        try {
            api.reviewMetadata()
            fail("Expected a transport error")
        } catch (error: ApiException.Transport) {
            assertEquals("Kunde inte nå servern. Kontrollera anslutningen och försök igen.", error.message)
        }
    }

    @Test fun aReviewComesWithItsETag() = runTest {
        server.enqueue(json(Fixtures.text("review"), 200, "ETag", "\"v2-abc\""))
        val tagged = api.review("majornas-bryggeri")
        assertEquals("\"v2-abc\"", tagged.eTag)
        assertEquals("/api/v1/reviews/majornas-bryggeri", server.takeRequest().url.encodedPath)
    }

    /** The entity tag goes out unchanged, quotes included, or every edit fails with 412. */
    @Test fun anUpdateSendsTheRawETagAsIfMatch() = runTest {
        api.token = "t"
        server.enqueue(json(Fixtures.text("review"), 200, "ETag", "\"v2-def\""))
        api.updateReview("majornas-bryggeri", "\"v2-abc\"", fields.copy(beer = fields.beer.copy(volumeCl = 40)), image = null)
        val request = server.takeRequest()
        assertEquals("PUT", request.method)
        assertEquals("\"v2-abc\"", request.headers["If-Match"])
        val body = ApiJson.parseToJsonElement(request.body!!.utf8()).jsonObject
        assertEquals(40, body.getValue("beer").jsonObject.getValue("volumeCl").jsonPrimitive.int)
        assertFalse("image" in body)
    }

    /** Omitting `volumeCl` keeps the stored value, so a write without a volume sends null. */
    @Test fun aWriteWithoutAVolumeSendsNull() = runTest {
        api.token = "t"
        server.enqueue(json(Fixtures.text("review"), 200, "ETag", "\"v2-def\""))
        api.updateReview("majornas-bryggeri", "\"v2-abc\"", fields, image = null)
        val beer = ApiJson.parseToJsonElement(server.takeRequest().body!!.utf8()).jsonObject.getValue("beer").jsonObject
        assertEquals(JsonNull, beer["volumeCl"])
    }

    @Test fun aCreateSendsTheImageAsBase64() = runTest {
        api.token = "t"
        server.enqueue(json(Fixtures.text("review"), 201, "ETag", "\"v1\""))
        api.createReview(fields, ImageUploadData(byteArrayOf(1, 2, 3), "image/jpeg"))
        val image = ApiJson.parseToJsonElement(server.takeRequest().body!!.utf8()).jsonObject.getValue("image").jsonObject
        assertEquals("AQID", image.getValue("data").jsonPrimitive.content)
        assertEquals("image/jpeg", image.getValue("contentType").jsonPrimitive.content)
    }

    @Test fun deleteSendsIfMatchAndAcceptsNoContent() = runTest {
        api.token = "t"
        server.enqueue(MockResponse.Builder().code(204).build())
        api.deleteReview("bar", "\"v2-abc\"")
        val request = server.takeRequest()
        assertEquals("DELETE", request.method)
        assertEquals("\"v2-abc\"", request.headers["If-Match"])
    }

    @Test fun signInReturnsTheToken() = runTest {
        server.enqueue(json("""{"user":{"username":"test"},"expiresAt":"2026-11-25T12:00:00.000Z","token":"tok"}""", 201))
        val session = api.signIn("test", "pw")
        assertEquals("tok", session.token)
        assertEquals("test", session.username)
        val body = ApiJson.parseToJsonElement(server.takeRequest().body!!.utf8()).jsonObject
        assertEquals("test", body.getValue("username").jsonPrimitive.content)
    }

    @Test fun imageUrlsAskForAServerPreview() {
        assertTrue(api.imageUrl("/api/v1/images/a.jpg", ImagePreview.Card).endsWith("/api/v1/images/a.jpg?preview=card-v1"))
    }
}
