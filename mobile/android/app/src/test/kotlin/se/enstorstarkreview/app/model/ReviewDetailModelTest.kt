package se.enstorstarkreview.app.model

import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import se.enstorstarkreview.api.models.Review

class ReviewDetailModelTest {
    private val server = MockWebServer()
    private val routes = Routes()
    private lateinit var api: ApiClient
    private val review = ApiJson.decodeFromString<Review>(Fixtures.text("review"))

    @Before fun start() {
        server.dispatcher = routes
        server.start()
        api = ApiClient(server.url("/").toString().trimEnd('/'))
    }

    @After fun stop() = server.close()

    private fun renamed(slug: String): String {
        val json = ApiJson.parseToJsonElement(Fixtures.text("review")).jsonObject.toMutableMap()
        json["slug"] = JsonPrimitive(slug)
        return kotlinx.serialization.json.JsonObject(json).toString()
    }

    /** The list's copy shows at once; the read brings the ETag that an edit needs. */
    @Test fun loadKeepsTheETag() = runTest {
        routes.json("GET /reviews/${review.slug}", Fixtures.text("review"), 200, "ETag", "\"v1\"")
        val detail = ReviewDetailModel(api, review.slug, preview = review)
        assertEquals(review.title, detail.review?.title)
        assertNull(detail.eTag)
        detail.load()
        assertEquals("\"v1\"", detail.eTag)
        assertNull(detail.errorMessage)
    }

    /** An edit can rename the slug; later reads use the new one. */
    @Test fun replaceFollowsTheNewSlug() = runTest {
        val detail = ReviewDetailModel(api, review.slug, preview = review)
        detail.replace(Tagged(ApiJson.decodeFromString(renamed("ny-slug")), "\"v2\""))
        assertEquals("ny-slug", detail.slug)
        assertEquals("\"v2\"", detail.eTag)
        routes.json("GET /reviews/ny-slug", renamed("ny-slug"), 200, "ETag", "\"v3\"")
        detail.load()
        assertEquals("\"v3\"", detail.eTag)
    }

    /** A failed reload keeps what is shown and reports the error. */
    @Test fun aFailedLoadKeepsThePreview() = runTest {
        routes.problem("GET /reviews/${review.slug}", 404, "not_found", "Recensionen hittades inte.")
        val detail = ReviewDetailModel(api, review.slug, preview = review)
        detail.load()
        assertNotNull(detail.review)
        assertEquals("Recensionen hittades inte.", detail.errorMessage)
    }
}
